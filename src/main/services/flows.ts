/**
 * Deterministic flows derived from the crawl.
 *
 * "Leave empty and the model will propose flows" only works when a model is
 * configured. With AI off there must still be journeys under test, so these are
 * built straight from what the crawl actually found: the routes it captured and
 * the calls-to-action it saw in each section.
 */
import type { CapturedPage, FlowStep, PageControl } from '../../shared/types.js'
import { looksLikeSoft404 } from './brokenUi.js'

const UNSAFE =
  /\b(delete|remove|destroy|cancel|unsubscribe|pay|purchase|buy|checkout|order|log ?out|sign ?out|deactivate|close account|upgrade now|billing)\b/i

/** Nav / brand chrome that must not be used as a "detail page action". */
const CHROME_LABEL =
  /^(overview|home|dashboard|settings|ask\b.*|menu|search|notifications?|profile|account|inbox|messages?|help|docs|logo|sign\s*in|log\s*in)$/i

function pathOf(url: string): string {
  try {
    const u = new URL(url)
    return `${u.pathname}${u.search}` || '/'
  } catch {
    return '/'
  }
}

function pageCorpus(page: CapturedPage): string {
  return norm(
    [
      page.title,
      ...page.sections.flatMap((s) => [s.textPreview, s.label, ...s.headings, ...s.ctaLabels])
    ].join(' ')
  )
}

/**
 * Labels that appear as clickable chrome on most pages (sidebar brand, Overview,
 * Ask …). Clicking these "proves" nothing about a detail journey.
 */
export function isSiteChromeLabel(label: string, pages: CapturedPage[]): boolean {
  const n = norm(label)
  if (!n || n.length < 2) return true
  if (CHROME_LABEL.test(n)) return true
  if (pages.length < 3) return false
  const hits = pages.filter((p) =>
    (p.controls ?? []).some((c) => {
      const h = norm(c.text || c.ariaLabel || '')
      return h === n || h.startsWith(n) || n.startsWith(h)
    })
  ).length
  // Must be nearly ubiquitous (≥75%) — a CTA on two list pages is not chrome.
  return hits >= Math.ceil(pages.length * 0.75)
}

/** Assert text that is present on every page cannot prove a journey moved. */
export function isChromeAssert(needle: string, pages: CapturedPage[]): boolean {
  const n = norm(needle)
  if (!n || n.length < 4) return true
  if (pages.length < 3) return false
  const hits = pages.filter((p) => pageCorpus(p).includes(n)).length
  return hits >= pages.length
}

/** Soft-404 copy must never be a happy-path assert — landing there is a failure. */
export function isSoft404Assert(needle: string): boolean {
  return looksLikeSoft404(needle)
}

/** Placeholders disappear once the field is filled — asserting them proves nothing. */
export function isPlaceholderAssert(needle: string, pages: CapturedPage[]): boolean {
  const n = norm(needle)
  if (!n || n.length < 3) return false
  const placeholders = pages.flatMap((p) =>
    (p.controls ?? [])
      .map((c) => norm(c.placeholder || ''))
      .filter(Boolean)
  )
  return placeholders.some((ph) => ph === n || ph.includes(n) || n.includes(ph))
}

function pageLooksSoft404(page: CapturedPage): boolean {
  const broken = (page.signals as { brokenUi?: { soft404?: boolean } } | undefined)?.brokenUi
  if (broken?.soft404) return true
  const blob = [page.title, ...page.sections.flatMap((s) => [...s.headings, s.textPreview])].join(' ')
  return looksLikeSoft404(blob)
}

/** Words that make a decent assertText target: visible, stable, specific. */
function assertionFor(page: CapturedPage, allPages: CapturedPage[] = []): string | null {
  if (pageLooksSoft404(page)) return null
  const candidates = [
    ...page.sections.flatMap((s) => s.headings),
    page.title?.split(/[|\-–]/)[0]?.trim() ?? ''
  ].filter((h) => h.length > 3 && h.length < 60 && !looksLikeSoft404(h))
  for (const h of candidates) {
    if (allPages.length >= 3 && isChromeAssert(h, allPages)) continue
    if (isPlaceholderAssert(h, allPages.length ? allPages : [page])) continue
    return h
  }
  return candidates[0] ?? null
}

/* --------------------------- flow validation ------------------------------ */

export interface ValidatedFlow {
  name: string
  steps: FlowStep[]
  /** Set when the flow cannot be run against this site at all. */
  invalid?: string
  /** Fill targets that correctly refuse (readonly/disabled) — not product defects. */
  refusedFills?: string[]
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Every string a control can legitimately be addressed by. */
function handlesOf(c: PageControl): string[] {
  return [c.text, c.placeholder, c.label, c.ariaLabel, c.name, c.testId].filter(Boolean).map(norm)
}

function isField(c: PageControl): boolean {
  if (!['input', 'textarea', 'select'].includes(c.tag)) return false
  if (['submit', 'button', 'reset'].includes(c.type)) return false
  // Older captures have no `editable` flag; treat them as fillable so existing
  // runs keep working, but new captures exclude readonly/disabled fields.
  return c.editable !== false
}

/**
 * Handles that can be *filled*. A `fill` step matched against button text or
 * heading copy passes validation and then times out at run time — which is how
 * "fill label=Email address" got through on a page whose only match was a
 * section heading.
 */
function fieldHandlesOf(c: PageControl): string[] {
  if (!isField(c)) return []
  return [c.placeholder, c.label, c.ariaLabel, c.name, c.testId].filter(Boolean).map(norm)
}

function pathsOf(pages: CapturedPage[]): Set<string> {
  const set = new Set<string>()
  for (const p of pages) {
    try {
      const u = new URL(p.url)
      set.add(u.pathname.replace(/\/$/, '') || '/')
    } catch {
      /* ignore */
    }
  }
  return set
}

/**
 * Check a proposed step against what the crawl actually saw.
 *
 * A model asked for flows will happily invent `/contact`, `placeholder=Email
 * address` and `text=Start Free Trial` for a site that has none of them. Each
 * of those costs a 15s timeout and then gets reported as if the *product* were
 * broken. So: if a target was never observed, the flow does not run.
 */
export function validateFlow(
  flow: { name: string; steps: FlowStep[] },
  pages: CapturedPage[]
): ValidatedFlow {
  const paths = pathsOf(pages)
  const allHandles = new Set(pages.flatMap((p) => (p.controls ?? []).flatMap(handlesOf)))
  const fieldHandles = new Set(pages.flatMap((p) => (p.controls ?? []).flatMap(fieldHandlesOf)))
  // Everything textual the crawl actually observed: body previews, headings,
  // CTA labels, section labels and the page title. Headings in particular are
  // the most natural assertion target, so they must be part of the corpus.
  const allText = pages.map((p) => pageCorpus(p))
  const problems: string[] = []
  const refusedFills: string[] = []
  const cleanedSteps: FlowStep[] = []

  for (const step of flow.steps) {
    if (step.action === 'goto') {
      const target = step.target ?? '/'
      let path = target
      try {
        path = target.startsWith('http') ? new URL(target).pathname : new URL(target, 'https://x.invalid').pathname
      } catch {
        /* keep raw */
      }
      path = path.replace(/\/$/, '') || '/'
      if (!paths.has(path)) problems.push(`route ${path} was never found by the crawl`)
      else cleanedSteps.push({ ...step, intent: step.intent ?? `Open ${path}` })
      continue
    }

    if (step.action === 'click' || step.action === 'fill') {
      const target = step.target ?? ''
      const value = target.replace(/^(text|label|placeholder|role)=/, '')
      const roleName = target.startsWith('role=') ? value.split(':')[1] ?? '' : ''
      const needle = norm(roleName || value)
      if (!needle) {
        problems.push(`${step.action} step has no target`)
        continue
      }
      const isSemantic = /^(text|label|placeholder|role)=/.test(target)
      if (!isSemantic) {
        cleanedSteps.push({
          ...step,
          intent: step.intent ?? (step.action === 'fill' ? `Fill ${target}` : `Activate ${target}`)
        })
        continue
      }
      if (step.action === 'click' && isSiteChromeLabel(needle, pages) && /detail|record|inspect|edit/i.test(flow.name)) {
        // Drop chrome clicks from detail journeys — they fake a pass via the sidebar.
        continue
      }
      const corpus = step.action === 'fill' ? fieldHandles : allHandles
      const exists = [...corpus].some((h) => h === needle || h.startsWith(needle) || needle.startsWith(h))
      if (!exists) {
        const matchesReadOnly =
          step.action === 'fill' &&
          pages
            .flatMap((p) => p.controls ?? [])
            .filter((c) => c.editable === false)
            .flatMap((c) => [c.placeholder, c.label, c.ariaLabel, c.name].filter(Boolean).map(norm))
            .some((h) => h === needle || h.startsWith(needle) || needle.startsWith(h))
        if (matchesReadOnly) {
          refusedFills.push(target)
          cleanedSteps.push({
            ...step,
            intent: step.intent ?? `Refuse fill on readonly ${target}`,
            note: 'readonly/disabled — product correctly refuses'
          })
          continue
        }
        problems.push(
          step.action === 'fill'
            ? `no editable input/textarea/select matching "${target}" exists on any crawled page`
            : `no control matching "${target}" exists on any crawled page`
        )
        continue
      }
      cleanedSteps.push({
        ...step,
        intent:
          step.intent ??
          (step.action === 'fill' ? `Enter value in ${value || target}` : `Activate “${value || target}”`)
      })
      continue
    }

    if (step.action === 'assertText') {
      // Models often emit assertText value="text=Tasks" (Playwright click syntax).
      // Strip the prefix so we match the crawl corpus ("tasks"), not the literal "text=tasks".
      const raw = String(step.value ?? step.target ?? '')
      const needle = norm(raw.replace(/^(text|label|placeholder|role)=/i, ''))
      if (!needle) {
        problems.push('assertText step has no text to assert')
        continue
      }
      // "body" / "html" always match and prove nothing about the journey.
      if (/^(body|html|document|page|content)$/i.test(needle)) {
        problems.push(`assertText "${needle}" is too vague to prove the journey worked`)
        continue
      }
      if (isChromeAssert(needle, pages)) {
        // Drop rather than invalidate the whole flow — chrome asserts are noise.
        continue
      }
      if (isSoft404Assert(needle)) {
        // Soft-404 copy means the journey failed — do not treat it as success criteria.
        continue
      }
      if (isPlaceholderAssert(needle, pages)) {
        // Placeholders vanish after fill; asserting them is a false failure.
        continue
      }
      // fill → assertText(same placeholder) is a common model anti-pattern.
      const prev = cleanedSteps[cleanedSteps.length - 1]
      if (prev?.action === 'fill' && prev.target) {
        const fillNeedle = norm(prev.target.replace(/^(text|label|placeholder|role)=/i, ''))
        if (fillNeedle && (needle === fillNeedle || needle.includes(fillNeedle) || fillNeedle.includes(needle))) {
          continue
        }
      }
      const seen = allText.some((t) => t.includes(needle)) || [...allHandles].some((h) => h.includes(needle))
      if (!seen) problems.push(`text "${needle}" was never seen on any crawled page`)
      else
        cleanedSteps.push({
          ...step,
          value: needle,
          intent: step.intent ?? `Confirm “${needle}” is visible`
        })
      continue
    }

    cleanedSteps.push({
      ...step,
      intent:
        step.intent ??
        (step.action === 'wait' ? 'Wait for UI to settle' : step.action === 'scroll' ? 'Scroll the page' : step.action)
    })
  }

  if (problems.length > 0) return { ...flow, invalid: problems.slice(0, 3).join('; ') }
  return { name: flow.name, steps: cleanedSteps, refusedFills: refusedFills.length ? refusedFills : undefined }
}

export function validateFlows(
  flows: { name: string; steps: FlowStep[] }[],
  pages: CapturedPage[]
): ValidatedFlow[] {
  return flows.map((f) => validateFlow(f, pages))
}

/** Compact, verbatim inventory for grounding a model's flow proposals. */
export function flowInventory(pages: CapturedPage[]): string {
  const lines: string[] = []
  const paths = pages.map((p) => {
    try {
      return new URL(p.url).pathname.replace(/\/$/, '') || '/'
    } catch {
      return '/'
    }
  })
  const detailHint = paths.filter((p) => p.split('/').filter(Boolean).length >= 2)
  if (detailHint.length) {
    lines.push(
      `DETAIL/ID ROUTES (prefer opening these from their parent list): ${detailHint.slice(0, 20).join(', ')}${detailHint.length > 20 ? ', …' : ''}`
    )
  }
  for (const p of pages) {
    let path = p.url
    try {
      path = new URL(p.url).pathname || '/'
    } catch {
      /* keep */
    }
    const controls = (p.controls ?? []).slice(0, 40)
    const clickable = controls
      .filter((c) => c.tag === 'button' || c.tag === 'a' || c.role === 'button' || c.type === 'submit')
      .map((c) => c.text || c.ariaLabel || c.testId)
      .filter(Boolean)
      .slice(0, 18)
    const fields = controls
      .filter((c) => ['input', 'textarea', 'select'].includes(c.tag) && c.type !== 'submit')
      .map((c) => {
        if (c.placeholder) return `placeholder=${c.placeholder}`
        if (c.label) return `label=${c.label}`
        if (c.ariaLabel) return `label=${c.ariaLabel}`
        return c.name ? `[name="${c.name}"]` : null
      })
      .filter(Boolean)
      .slice(0, 12)
    const depth = (path.replace(/\/$/, '') || '/').split('/').filter(Boolean).length
    lines.push(
      `ROUTE ${path}${depth >= 2 ? ' [detail]' : ''}\n  clickable: ${clickable.join(' | ') || '(none)'}\n  fields: ${fields.join(' | ') || '(none)'}`
    )
  }
  return lines.join('\n')
}

/**
 * Open list → detail/ID routes the crawl already discovered.
 *
 * Sidebar-hopping flows never exercise record views. When the crawl found
 * `/tasks/…` under `/tasks`, replay that nesting so a broken detail page is
 * called out as a flow failure, not only an interaction nit.
 */
export function detailRecordFlows(pages: CapturedPage[]): { name: string; steps: FlowStep[] }[] {
  const ok = pages.filter((p) => p.ok && p.status < 400)
  if (ok.length === 0) return []

  type Entry = { path: string; page: CapturedPage }
  const entries: Entry[] = ok.map((page) => ({ path: pathOf(page.url).split('?')[0] || '/', page }))

  const byPath = new Map(entries.map((e) => [e.path.replace(/\/$/, '') || '/', e]))
  const groups = new Map<string, Entry[]>()

  for (const e of entries) {
    const path = e.path.replace(/\/$/, '') || '/'
    const parts = path.split('/').filter(Boolean)
    if (parts.length < 2) continue
    const parent = `/${parts.slice(0, -1).join('/')}`
    if (!byPath.has(parent)) continue
    const list = groups.get(parent) ?? []
    list.push(e)
    groups.set(parent, list)
  }

  const flows: { name: string; steps: FlowStep[] }[] = []
  for (const [parent, details] of groups) {
    const listPage = byPath.get(parent)?.page
    if (!listPage) continue
    const sample = details.slice(0, 2)
    const steps: FlowStep[] = [
      { action: 'goto', target: parent, intent: `Open list ${parent}` }
    ]
    const listAssert = assertionFor(listPage, ok)
    if (listAssert) {
      steps.push({ action: 'assertText', value: listAssert, intent: `Confirm list “${listAssert}”` })
    }
    for (const d of sample) {
      const detailPath = d.path.replace(/\/$/, '') || '/'
      steps.push({
        action: 'goto',
        target: detailPath,
        note: d.page.title,
        intent: `Open detail ${detailPath}`
      })
      const detailAssert = assertionFor(d.page, ok)
      if (detailAssert) {
        steps.push({
          action: 'assertText',
          value: detailAssert,
          intent: `Confirm detail “${detailAssert}”`
        })
      }
      // Prefer a real in-page control when the crawl saw one — proves interactivity
      // beyond "the URL loaded". Never pick sidebar brand / Overview / Ask …
      const actionLabel = (d.page.controls ?? [])
        .map((c) => (c.text || c.ariaLabel || '').trim())
        .find(
          (l) =>
            l.length > 1 &&
            l.length < 28 &&
            !UNSAFE.test(l) &&
            !isSiteChromeLabel(l, ok) &&
            (d.page.controls ?? []).some(
              (c) =>
                norm(c.text || c.ariaLabel || '') === norm(l) &&
                (c.tag === 'button' || c.role === 'button' || c.type === 'submit')
            )
        )
      if (actionLabel) {
        steps.push({
          action: 'click',
          target: `text=${actionLabel}`,
          intent: `Activate “${actionLabel}” on the detail`
        })
        steps.push({ action: 'wait', value: '800', intent: 'Wait for detail interaction' })
      }
    }
    if (steps.filter((s) => s.action === 'goto').length < 2) continue
    flows.push({
      name: `Open ${parent} detail records`,
      steps
    })
  }
  return flows.slice(0, 6)
}

/**
 * Journeys derived from the crawl.
 *
 * The point is to *click through* the product, not just open URLs: every page
 * gets a click-through pass over its real controls, and each click is followed
 * by an assertion that something actually happened. `maxFlows` scales with the
 * size of the crawl so a big site is exercised, not sampled.
 */
export function heuristicFlows(pages: CapturedPage[], maxFlows = 0): { name: string; steps: FlowStep[] }[] {
  const flows: { name: string; steps: FlowStep[] }[] = []
  const ok = pages.filter((p) => p.ok && p.status < 400)
  if (ok.length === 0) return flows
  const limit = maxFlows > 0 ? maxFlows : Math.max(4, Math.min(20, ok.length + 3))

  /* 1. Route sweep — can a user actually reach every page we found? */
  const sweep: FlowStep[] = []
  for (const page of ok.slice(0, Math.min(ok.length, 16))) {
    sweep.push({
      action: 'goto',
      target: pathOf(page.url),
      note: page.title,
      intent: `Open ${pathOf(page.url)}`
    })
    const assertion = assertionFor(page, ok)
    if (assertion) sweep.push({ action: 'assertText', value: assertion, intent: `Confirm “${assertion}”` })
  }
  if (sweep.length >= 2) flows.push({ name: 'Visit every discovered route', steps: sweep })

  /* 1b. List → detail/ID records — the deep product journeys. */
  flows.push(...detailRecordFlows(ok))

  /* 2. Primary conversion path — hero CTA on the entry page. */
  const entry = ok[0]
  // The primary action is the hero's, then a dedicated CTA band, and only as a
  // last resort a nav link — nav links are navigation, not conversion.
  const ctaPriority: Record<string, number> = { hero: 0, cta: 1, form: 2, nav: 3 }
  const heroCta = entry.sections
    .filter((s) => s.role in ctaPriority)
    .sort((a, b) => ctaPriority[a.role] - ctaPriority[b.role])
    .flatMap((s) => s.ctaLabels)
    .find((label) => label.length > 2 && label.length < 30 && !UNSAFE.test(label) && !isSiteChromeLabel(label, ok))
  if (heroCta) {
    const steps: FlowStep[] = [
      { action: 'goto', target: pathOf(entry.url), intent: 'Open the entry page' },
      { action: 'click', target: `text=${heroCta}`, note: 'primary call to action', intent: `Start work via “${heroCta}”` },
      { action: 'wait', value: '1200', intent: 'Wait for navigation' }
    ]
    const target = ok.find((p) => p.url !== entry.url)
    const assertion = target ? assertionFor(target, ok) : assertionFor(entry, ok)
    if (assertion) steps.push({ action: 'assertText', value: assertion, intent: `Confirm “${assertion}” is visible` })
    flows.push({ name: `Start work — “${heroCta}”`, steps })
  }

  /* 3. Navigation menu — does the header actually take you anywhere? */
  const navLabels = ok[0].sections
    .filter((s) => s.role === 'nav')
    .flatMap((s) => s.ctaLabels)
    .filter((l) => l.length > 2 && l.length < 24 && !UNSAFE.test(l))
    .slice(0, 3)
  if (navLabels.length >= 2) {
    const steps: FlowStep[] = [{ action: 'goto', target: pathOf(entry.url) }]
    for (const label of navLabels) {
      steps.push({ action: 'click', target: `text=${label}` })
      steps.push({ action: 'wait', value: '900' })
      steps.push({ action: 'goto', target: pathOf(entry.url) })
    }
    flows.push({ name: 'Header navigation', steps: steps.slice(0, 10) })
  }

  /* 3b. Click-through per page — the core of "actually use the product". */
  for (const p of ok.slice(0, 12)) {
    const path = pathOf(p.url)
    // Prefer in-product controls: buttons and role=button over plain links.
    const controls = (p.controls ?? []).filter((c) => {
      const label = (c.text || c.ariaLabel || '').trim()
      return (
        label.length > 1 &&
        label.length < 32 &&
        !UNSAFE.test(label) &&
        (c.tag === 'button' || c.role === 'button' || (c.tag === 'a' && !!c.href))
      )
    })
    const seen = new Set<string>()
    const targets: string[] = []
    for (const c of controls) {
      const label = (c.text || c.ariaLabel).trim()
      const key = norm(label)
      if (seen.has(key)) continue
      seen.add(key)
      targets.push(label)
      if (targets.length >= 5) break
    }
    if (targets.length < 2) continue

    const assertion = assertionFor(p, ok)
    const steps: FlowStep[] = [{ action: 'goto', target: path }]
    for (const label of targets) {
      if (isSiteChromeLabel(label, ok)) continue
      steps.push({ action: 'click', target: `text=${label}`, note: `click “${label}”` })
      steps.push({ action: 'wait', value: '800' })
      // Prove the click did something, then return for the next control.
      if (assertion) steps.push({ action: 'assertText', value: assertion })
      steps.push({ action: 'goto', target: path })
    }
    if (steps.filter((s) => s.action === 'click').length < 2) continue
    flows.push({ name: `Click through ${path}`, steps })
  }

  /* 4. Deep scroll + footer reachability on the longest page. */
  const longest = [...ok].sort(
    (a, b) => (b.sections.at(-1)?.rect.y ?? 0) - (a.sections.at(-1)?.rect.y ?? 0)
  )[0]
  const footerText = longest?.sections.find((s) => s.role === 'footer')?.ctaLabels[0]
  if (footerText && !UNSAFE.test(footerText)) {
    flows.push({
      name: 'Scroll to footer',
      steps: [
        { action: 'goto', target: pathOf(longest.url) },
        { action: 'scroll' },
        { action: 'scroll' },
        { action: 'scroll' },
        { action: 'assertText', value: footerText }
      ]
    })
  }

  return flows.slice(0, limit)
}
