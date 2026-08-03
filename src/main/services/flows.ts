/**
 * Deterministic flows derived from the crawl.
 *
 * "Leave empty and the model will propose flows" only works when a model is
 * configured. With AI off there must still be journeys under test, so these are
 * built straight from what the crawl actually found: the routes it captured and
 * the calls-to-action it saw in each section.
 */
import type { CapturedPage, FlowStep, PageControl } from '../../shared/types.js'

const UNSAFE =
  /\b(delete|remove|destroy|cancel|unsubscribe|pay|purchase|buy|checkout|order|log ?out|sign ?out|deactivate|close account|upgrade now|billing)\b/i

function pathOf(url: string): string {
  try {
    const u = new URL(url)
    return `${u.pathname}${u.search}` || '/'
  } catch {
    return '/'
  }
}

/** Words that make a decent assertText target: visible, stable, specific. */
function assertionFor(page: CapturedPage): string | null {
  const heading = page.sections.flatMap((s) => s.headings).find((h) => h.length > 3 && h.length < 60)
  if (heading) return heading
  const title = page.title?.split(/[|\-–]/)[0]?.trim()
  return title && title.length > 3 && title.length < 60 ? title : null
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
  const allText = pages.map((p) =>
    norm(
      [
        p.title,
        ...p.sections.flatMap((s) => [s.textPreview, s.label, ...s.headings, ...s.ctaLabels])
      ].join(' ')
    )
  )
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
      const needle = norm(step.value ?? step.target ?? '')
      if (!needle) {
        problems.push('assertText step has no text to assert')
        continue
      }
      const seen = allText.some((t) => t.includes(needle)) || [...allHandles].some((h) => h.includes(needle))
      if (!seen) problems.push(`text "${needle}" was never seen on any crawled page`)
      else cleanedSteps.push({ ...step, intent: step.intent ?? `Confirm “${needle}” is visible` })
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
    lines.push(
      `ROUTE ${path}\n  clickable: ${clickable.join(' | ') || '(none)'}\n  fields: ${fields.join(' | ') || '(none)'}`
    )
  }
  return lines.join('\n')
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
    const assertion = assertionFor(page)
    if (assertion) sweep.push({ action: 'assertText', value: assertion, intent: `Confirm “${assertion}”` })
  }
  if (sweep.length >= 2) flows.push({ name: 'Visit every discovered route', steps: sweep })

  /* 2. Primary conversion path — hero CTA on the entry page. */
  const entry = ok[0]
  // The primary action is the hero's, then a dedicated CTA band, and only as a
  // last resort a nav link — nav links are navigation, not conversion.
  const ctaPriority: Record<string, number> = { hero: 0, cta: 1, form: 2, nav: 3 }
  const heroCta = entry.sections
    .filter((s) => s.role in ctaPriority)
    .sort((a, b) => ctaPriority[a.role] - ctaPriority[b.role])
    .flatMap((s) => s.ctaLabels)
    .find((label) => label.length > 2 && label.length < 30 && !UNSAFE.test(label))
  if (heroCta) {
    const steps: FlowStep[] = [
      { action: 'goto', target: pathOf(entry.url), intent: 'Open the entry page' },
      { action: 'click', target: `text=${heroCta}`, note: 'primary call to action', intent: `Start work via “${heroCta}”` },
      { action: 'wait', value: '1200', intent: 'Wait for navigation' }
    ]
    const target = ok.find((p) => p.url !== entry.url)
    const assertion = target ? assertionFor(target) : assertionFor(entry)
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

    const assertion = assertionFor(p)
    const steps: FlowStep[] = [{ action: 'goto', target: path }]
    for (const label of targets) {
      steps.push({ action: 'click', target: `text=${label}`, note: `click “${label}”` })
      steps.push({ action: 'wait', value: '800' })
      // Prove the click did something, then return for the next control.
      if (assertion) steps.push({ action: 'assertText', value: assertion })
      steps.push({ action: 'goto', target: path })
    }
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
