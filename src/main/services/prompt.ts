/**
 * Fix-it prompt generation.
 *
 * Turns a run into instructions you can paste into an AI coding chat. The point
 * is that the receiving model gets *evidence and constraints*, not vibes: exact
 * measured numbers, the section it applies to, the registry component to reach
 * for, and an explicit instruction not to redesign things that are fine.
 */
import type { ComponentRecommendation, Finding, Run, Severity } from '../../shared/types.js'
import { sortFindingsForBrief } from './audit.js'

const SEVERITY_ORDER: Severity[] = ['blocker', 'critical', 'major', 'minor', 'nit']

export type PromptScope = 'all' | 'critical' | 'accessibility' | 'coherence' | 'section'

export interface PromptOptions {
  scope?: PromptScope
  sectionId?: string
  pageUrl?: string
  maxFindings?: number
}

/** Generic content-role pack — list once, not once per section. */
const GENERIC_CONTENT_COMPONENTS = new Set(['card', 'separator', 'breadcrumb', 'tabs', 'scroll-area'])

function severityRank(f: Finding): number {
  return SEVERITY_ORDER.indexOf(f.severity)
}

function isMeasured(f: Finding): boolean {
  return f.source !== 'ai'
}

/** Collapse hashed CSS-module classes; keep stable attrs/ids/roles. */
export function stableSelector(selector?: string): string | undefined {
  if (!selector) return undefined
  const cleaned = selector
    .split(/(?=\.|#|\[|:)/)
    .map((part) => part.trim())
    .filter((part) => {
      if (!part) return false
      // styles-module__foo___Hash or _foo_hash
      if (/^\.styles-module__/.test(part)) return false
      if (/^\.[A-Za-z0-9_-]+__[A-Za-z0-9_-]+___[A-Za-z0-9]+$/.test(part)) return false
      if (/^\.[_a-zA-Z]+[a-zA-Z0-9]*_[a-zA-Z0-9]{5,}$/.test(part) && part.includes('_')) {
        // Keep short semantic classes; drop long hashed tails when clearly modular
        if (/__[a-zA-Z]/.test(part) || /___[A-Za-z0-9]+$/.test(part)) return false
      }
      return true
    })
    .join('')
    .replace(/^\.+/, '.')
    .trim()
  if (!cleaned || cleaned === '.' || cleaned === '#') return undefined
  // Still mostly a hashed module class as a single token
  if (/styles-module__/.test(cleaned) || /___[A-Za-z0-9]{4,}/.test(cleaned)) return undefined
  return cleaned
}

export function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname || '/'
  } catch {
    return url
  }
}

/** Trim evidence without chopping mid-word / mid-sentence when possible. */
export function trimEvidence(text: string, max = 500): string {
  const flat = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const slice = flat.slice(0, max)
  const sentenceEnd = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('; '), slice.lastIndexOf('! '))
  if (sentenceEnd >= Math.floor(max * 0.55)) return slice.slice(0, sentenceEnd + 1).trim()
  const wordEnd = slice.lastIndexOf(' ')
  if (wordEnd >= Math.floor(max * 0.55)) return `${slice.slice(0, wordEnd).trim()}…`
  return `${slice.trim()}…`
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Fingerprint for near-duplicate collapse. */
export function findingFingerprint(f: Finding): string {
  const title = normalizeTitle(f.title)
  // axe / pa11y style: same rule family
  if (/buttons must have discernible text|icon-only buttons|no accessible name|unnamed/i.test(title)) {
    return `${f.category}|a11y-button-name`
  }
  if (/form elements must have labels|must have.*label/i.test(title)) {
    return `${f.category}|a11y-label`
  }
  if (/links must have discernible text/i.test(title)) {
    return `${f.category}|a11y-link-name`
  }
  if (/overlapping interactive/i.test(title)) {
    return `${f.category}|overlap`
  }
  if (/obscur|bottom (bar|control)|fixed bottom/i.test(title)) {
    return `${f.category}|bottom-bar-clip`
  }
  if (/focus (state|indicator|ring|visually absent)|no visible focus/i.test(title)) {
    return `${f.category}|focus-visible`
  }
  if (/keyboard|tab from the top|nothing is reachable/i.test(title)) {
    return `${f.category}|keyboard`
  }
  if (/distinct colours|palette|colour sprawl|color sprawl/i.test(title)) {
    return `${f.category}|palette`
  }
  if (/font famil|typeface/i.test(title)) {
    return `${f.category}|fonts`
  }
  if (/border radi|radii/i.test(title)) {
    return `${f.category}|radii`
  }
  if (/spacing|off the .*grid|4px grid/i.test(title)) {
    return `${f.category}|spacing`
  }
  if (/font sizes|type scale/i.test(title)) {
    return `${f.category}|type-scale`
  }
  if (/z-index/i.test(title)) {
    return `${f.category}|z-index`
  }
  if (/design tokens extracted/i.test(title)) {
    return `${f.category}|tokens`
  }
  // settings hierarchy cluster
  if (/page hierarchy|stranded sidebar|preview or confirmation|settings/i.test(title) && f.category !== 'performance') {
    const path = pathnameOf(f.pageUrl)
    if (path.includes('settings') || /settings/i.test(f.detail)) return `settings-ia|${f.category}`
  }
  return `${f.category}|${title}`
}

export function dedupeFindingsForPrompt(list: Finding[]): Finding[] {
  const byKey = new Map<string, Finding>()
  for (const f of list) {
    const key = findingFingerprint(f)
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, { ...f })
      continue
    }
    // Prefer higher severity, then measured over review
    const takeNew =
      severityRank(f) < severityRank(prev) ||
      (severityRank(f) === severityRank(prev) && isMeasured(f) && !isMeasured(prev))
    const keep = takeNew ? f : prev
    const other = takeNew ? prev : f
    const paths = new Set<string>()
    for (const u of [keep.pageUrl, other.pageUrl]) paths.add(pathnameOf(u))
    // Merge page mentions from detail
    const affectMatch = `${keep.detail} ${other.detail}`.match(/Affects?\s+\d+\s+pages?:\s*([^.]+)/i)
    let detail = keep.detail
    if (paths.size > 1) {
      const pathList = [...paths].join(', ')
      if (!/Affects?\s+\d+\s+pages?/i.test(detail)) {
        detail = `${detail.replace(/\s+$/, '')} Affects ${paths.size} pages: ${pathList}`
      } else if (affectMatch) {
        detail = detail.replace(/Affects?\s+\d+\s+pages?:\s*[^.]+/i, `Affects ${paths.size} pages: ${pathList}`)
      }
    }
    byKey.set(key, {
      ...keep,
      detail,
      // Keep a stable selector if either has one
      selector: stableSelector(keep.selector) ?? stableSelector(other.selector) ?? keep.selector
    })
  }
  return [...byKey.values()].sort((a, b) => severityRank(a) - severityRank(b))
}

type RootCauseBucket = {
  id: string
  title: string
  ids: string[]
}

export function clusterRootCauses(findings: Finding[]): RootCauseBucket[] {
  const buckets: { id: string; title: string; match: (f: Finding) => boolean }[] = [
    {
      id: 'tokens',
      title: 'Design tokens (colour, type, radius, spacing, z-index)',
      match: (f) =>
        /palette|colours|colors|font|radi|spacing|token|z-index|type scale|font sizes|dialects|status colour/i.test(
          `${f.title} ${f.detail}`
        ) || ['coherence', 'craft'].includes(f.category) && /token|sprawl|unique/i.test(f.title)
    },
    {
      id: 'a11y',
      title: 'Accessibility (names, labels, focus, keyboard, overlays)',
      match: (f) =>
        f.category === 'accessibility' ||
        /aria-label|discernible|focus|keyboard|tab |overlay|escape|screen.reader|alt text|nested.interactive/i.test(
          `${f.title} ${f.detail}`
        )
    },
    {
      id: 'layout',
      title: 'Layout & responsive (overlap, bottom bar, mobile IA)',
      match: (f) =>
        f.category === 'responsive' ||
        /overlap|bottom (bar|control)|obscur|mobile|tap target|stranded|scroll/i.test(`${f.title} ${f.detail}`)
    },
    {
      id: 'flow',
      title: 'Flow & content hierarchy (CTAs, empty states, navigation feedback)',
      match: (f) =>
        f.category === 'flow' ||
        f.category === 'content' ||
        /activation|CTA|empty state|hierarchy|composer|chat context|preview or confirmation/i.test(
          `${f.title} ${f.detail}`
        )
    },
    {
      id: 'performance',
      title: 'Performance (LCP, CLS, transfer, CSS weight)',
      match: (f) => f.category === 'performance' || /LCP|CLS|transferred|stylesheet|kB of CSS/i.test(f.title)
    },
    {
      id: 'variety',
      title: 'Variety & craft (monotony, console errors)',
      match: (f) =>
        f.category === 'variety' ||
        f.category === 'craft' ||
        /monotony|identical|rhythmically flat|console error/i.test(f.title)
    }
  ]

  const assigned = new Set<string>()
  const out: RootCauseBucket[] = []
  for (const b of buckets) {
    const ids = findings.filter((f) => !assigned.has(f.id) && b.match(f)).map((f) => f.id)
    for (const id of ids) assigned.add(id)
    if (ids.length) out.push({ id: b.id, title: b.title, ids })
  }
  const rest = findings.filter((f) => !assigned.has(f.id)).map((f) => f.id)
  if (rest.length) out.push({ id: 'other', title: 'Other', ids: rest })
  return out
}

function formatWhere(f: Finding): string {
  const path = pathnameOf(f.pageUrl)
  const sel = stableSelector(f.selector)
  return [path, f.sectionId ? `section ${f.sectionId}` : '', f.viewport ?? '', sel ?? ''].filter(Boolean).join(' · ')
}

function selectFindings(run: Run, opts: PromptOptions): Finding[] {
  const max = opts.maxFindings ?? 40
  let list = [...run.findings]

  switch (opts.scope) {
    case 'critical':
      list = list.filter((f) => f.severity === 'blocker' || f.severity === 'critical' || f.severity === 'major')
      break
    case 'accessibility':
      list = list.filter((f) => f.category === 'accessibility')
      break
    case 'coherence':
      list = list.filter((f) => f.category === 'coherence' || f.category === 'craft' || f.category === 'variety')
      break
    case 'section':
      list = list.filter((f) => f.sectionId === opts.sectionId && (!opts.pageUrl || f.pageUrl === opts.pageUrl))
      break
  }

  return sortFindingsForBrief(dedupeFindingsForPrompt(list)).slice(0, max)
}

function focusConflictNote(findings: Finding[]): string | null {
  const keyboardDead = findings.some((f) => /nothing is reachable by keyboard|never lands on a focusable/i.test(`${f.title} ${f.detail}`))
  const hasFocusIssues = findings.some(
    (f) =>
      isMeasured(f) &&
      (/no visible focus|focus.visually absent|focus-visible|focus state/i.test(`${f.title} ${f.detail}`) ||
        f.id.startsWith('i2') ||
        f.id.startsWith('i'))
  )
  if (keyboardDead && hasFocusIssues) {
    return 'Focus/keyboard findings disagree in places: prefer measured interaction-probe and axe results over [review] claims about whether controls can receive focus.'
  }
  return null
}

/** Dedupe recommendations; prefer community (Shoogle) blocks over generic shadcn. */
export function formatRecommendations(
  recs: ComponentRecommendation[],
  findings: Finding[]
): string[] {
  const out: string[] = []
  const seenCommands = new Set<string>()
  let genericPackEmitted = false

  const themeHints = findings
    .map((f) => `${f.title} ${f.fix}`.toLowerCase())
    .join(' ')

  const scoreItem = (item: { name: string; source?: string; registry?: string }): number => {
    const n = item.name.toLowerCase()
    let s = 0
    if (item.source === 'shoogle') s += 12
    if (item.registry && item.registry !== '@shadcn') s += 4
    if (/button|label|input|form|field|checkbox|dialog|sheet|dropdown|navigation|focus|alert/.test(n) && themeHints.match(new RegExp(n.split('-')[0] || n, 'i'))) {
      s += 3
    }
    if (/button|label|dialog|sheet|checkbox|form|field/.test(n) && /button|label|focus|overlay|form|checkbox|aria/i.test(themeHints)) {
      s += 2
    }
    if (GENERIC_CONTENT_COMPONENTS.has(n)) s -= 4
    return s
  }

  // Group by role, but collapse duplicate content sections
  const byRole = new Map<string, ComponentRecommendation[]>()
  for (const r of recs) {
    const key = r.sectionRole
    const list = byRole.get(key) ?? []
    list.push(r)
    byRole.set(key, list)
  }

  const shoogleOnly = recs.every((r) => r.source === 'shadcn')
  if (shoogleOnly && recs.length) {
    out.push('')
    out.push(
      '_Note: these suggestions are first-party shadcn primitives — Shoogle community registries returned nothing (or were unreachable) for this run. Re-check the Shoogle status pill and re-run with “shadcn replacements” enabled._'
    )
  }

  let sectionsEmitted = 0
  for (const [role, group] of byRole) {
    if (sectionsEmitted >= 6) break
    const primary = group[0]
    const items = group
      .flatMap((g) => g.items)
      .filter((i) => {
        if (seenCommands.has(i.addCommand)) return false
        if (role === 'content' && GENERIC_CONTENT_COMPONENTS.has(i.name) && i.source !== 'shoogle') {
          if (genericPackEmitted) return false
        }
        return true
      })
      .sort((a, b) => scoreItem(b) - scoreItem(a))

    const unique: typeof items = []
    for (const i of items) {
      if (seenCommands.has(i.addCommand)) continue
      if (role === 'content' && GENERIC_CONTENT_COMPONENTS.has(i.name) && i.source !== 'shoogle') {
        if (genericPackEmitted) continue
      }
      seenCommands.add(i.addCommand)
      unique.push(i)
      if (unique.length >= 5) break
    }
    if (!unique.length) continue

    if (role === 'content' && unique.some((i) => GENERIC_CONTENT_COMPONENTS.has(i.name) && i.source !== 'shoogle')) {
      genericPackEmitted = true
    }

    const sectionIds = [...new Set(group.map((g) => g.sectionId))].slice(0, 4).join(', ')
    const sources = [...new Set(group.map((g) => g.source))]
    out.push('')
    out.push(`### ${role}${group.length > 1 ? ` (sections ${sectionIds})` : ` (${primary.sectionId})`} · ${sources.join('+')}`)
    out.push(primary.reason.split(';').slice(0, 2).join(';').trim())
    for (const i of unique) {
      const origin = i.source === 'shoogle' ? `community ${i.registry}` : 'shadcn first-party'
      out.push(`- \`${i.addCommand}\` — **${i.name}** (${origin}): ${i.description}`)
    }
    sectionsEmitted++
  }
  return out
}

export function buildFixPrompt(run: Run, opts: PromptOptions = {}): string {
  const findings = selectFindings(run, opts)
  const scope = opts.scope ?? 'all'
  const out: string[] = []

  out.push('# UI/UX remediation brief')
  out.push('')
  out.push(
    `You are improving a shipping product. An automated audit (Qualition) crawled it in a real browser, measured the design system, exercised the controls and graded the result. Below are the verified findings. Fix them in the codebase.`
  )
  out.push('')
  out.push('## Ground rules')
  out.push(
    '- Items marked [measured] come from static analysis or from driving the UI: treat those numbers as facts.'
  )
  out.push(
    '- Items marked [review] are a design critique of screenshots. They are judgement, not measurement — confirm before acting on one.'
  )
  out.push('- Fix the cause, not the symptom: prefer one token/component change over N one-off patches.')
  out.push('- Do not redesign anything that is not listed. No new visual direction, no library swaps beyond what is suggested.')
  out.push('- Keep the existing design language; the goal is coherence and correctness, not novelty.')
  out.push('- Work the root-cause list in order. Do measured accessibility and token fixes before [review] polish.')
  out.push('- After each change, state which finding id it resolves.')
  out.push('')

  out.push('## Context')
  out.push(`- Target: ${run.config.targetUrl}`)
  out.push(`- Pages audited: ${run.pages.map((p) => pathnameOf(p.url)).join(', ') || 'n/a'}`)
  if (run.scorecard) {
    out.push(`- Overall grade: ${run.scorecard.grade} (${run.scorecard.overall}/100)`)
    out.push(
      `- Category scores: ${Object.entries(run.scorecard.categories)
        .map(([k, v]) => `${k} ${v.score}`)
        .join(', ')}`
    )
  }
  if (run.themeSummary) out.push(`- Detected design language: ${run.themeSummary.split('\n')[0]}`)

  const css = run.pages.find((p) => p.cssStats)?.cssStats
  if (css) {
    const attr = css.attribution
    const scope = attr?.scoped
      ? `first-party ${(attr.appBytes / 1024).toFixed(0)}kB (+${((attr.frameworkBytes + attr.vendorBytes) / 1024).toFixed(0)}kB framework/vendor)`
      : `${(css.bytes / 1024).toFixed(0)}kB (unscoped — includes framework/vendor)`
    out.push(
      `- Authored CSS: ${scope}, ${css.rules} rules, ${css.colorsUnique} unique colours across ${css.colorsTotal} declarations (${(css.colorUniquenessRatio * 100).toFixed(0)}% uniqueness), ${css.fontSizesUnique} font sizes, ${css.radiiUnique} radii, ${css.shadowsUnique} shadows, !important on ${(css.importantRatio * 100).toFixed(1)}% of declarations, max specificity (${css.maxSpecificity}), z-index max ${css.zIndexMax}`
    )
  }
  out.push('')

  /* --------------------------- root causes first ------------------------- */
  const clusters = clusterRootCauses(findings)
  if (clusters.length) {
    out.push('## Root causes (fix in this order)')
    out.push('Each cluster is one coherent change set. Prefer one token or component fix that clears many ids.')
    for (const c of clusters) {
      out.push(`- **${c.title}**: ${c.ids.map((id) => `\`${id}\``).join(', ')}`)
    }
    const conflict = focusConflictNote(findings)
    if (conflict) {
      out.push('')
      out.push(`Note: ${conflict}`)
    }
    out.push('')
  }

  /* ------------------------------- findings ------------------------------ */
  out.push(`## Findings to fix (${findings.length}${scope === 'all' ? '' : `, scope: ${scope}`})`)
  for (const sev of SEVERITY_ORDER) {
    const group = findings.filter((f) => f.severity === sev)
    if (!group.length) continue
    out.push('')
    out.push(`### ${sev.toUpperCase()}`)
    for (const f of group) {
      out.push('')
      out.push(`**[${f.id}] ${f.title}** _(${f.category})_ ${f.source === 'ai' ? '`[review]`' : '`[measured]`'}${f.provenance?.ownership === 'dev-chrome' ? ' `[dev-only]`' : f.provenance?.ownership === 'third-party' ? ' `[third-party]`' : ''}${f.effort ? ` \`[effort:${f.effort}]\`` : ''}${f.delta ? ` \`[${f.delta}]\`` : ''}`)
      out.push(`- Evidence: ${trimEvidence(f.detail)}`)
      out.push(`- Required fix: ${f.fix}`)
      out.push(`- Where: ${formatWhere(f)}`)
      if (f.provenance?.sourceFile) {
        out.push(`- Source: ${f.provenance.sourceFile}${f.provenance.sourceLine ? `:${f.provenance.sourceLine}` : ''}`)
      }
      if (f.provenance?.note) out.push(`- Provenance: ${f.provenance.note}`)
    }
  }

  /* --------------------------- component swaps --------------------------- */
  const recs =
    scope === 'section' && opts.sectionId
      ? run.recommendations.filter((r) => r.sectionId === opts.sectionId)
      : run.recommendations
  if (recs.length) {
    out.push('')
    out.push('## Suggested component replacements')
    out.push('These are real registry components. Prefer community blocks (Shoogle) over first-party shadcn primitives when both appear. Duplicates across similar sections are listed once.')
    out.push(...formatRecommendations(recs, findings))
  }

  /* ------------------------- interaction evidence ------------------------ */
  const probes = run.interactions?.filter(
    (i) =>
      i.deadClicks.length ||
      i.noFocusIndicator.length ||
      i.unnamedControls.length ||
      i.fakeButtons.length ||
      i.noHoverFeedback.length ||
      i.overlays.some((o) => !o.escapeCloses || !o.focusMoved)
  )
  if (probes?.length) {
    out.push('')
    out.push('## Broken interaction states (measured by driving the UI)')
    for (const p of probes.slice(0, 6)) {
      out.push('')
      out.push(`### ${pathnameOf(p.url)} (${p.viewport})`)
      if (p.deadClicks.length) out.push(`- Clicked with no observable effect: ${p.deadClicks.slice(0, 8).join(', ')}`)
      if (p.noFocusIndicator.length) out.push(`- No visible focus state: ${p.noFocusIndicator.slice(0, 8).join(', ')}`)
      if (p.noHoverFeedback.length) out.push(`- Pointer cursor but no hover feedback: ${p.noHoverFeedback.slice(0, 8).join(', ')}`)
      if (p.unnamedControls.length) out.push(`- No accessible name: ${p.unnamedControls.slice(0, 8).join(', ')}`)
      if (p.fakeButtons.length) out.push(`- Clickable but not focusable (fake buttons): ${p.fakeButtons.slice(0, 8).join(', ')}`)
      for (const o of p.overlays) {
        if (!o.escapeCloses) out.push(`- Overlay "${o.trigger}" does not close on Escape`)
        if (!o.focusMoved) out.push(`- Overlay "${o.trigger}" does not move focus into itself`)
      }
      for (const f of p.forms.filter((x) => !x.validationFeedback && x.required > 0)) {
        out.push(
          `- Form "${f.submitLabel || `#${f.index}`}" submits empty (${f.required} required fields) with no visible validation`
        )
      }
    }
  }

  /* ------------------------------- flows -------------------------------- */
  const brokenFlows = run.flows?.filter((f) => !f.ok && !f.invalid)
  if (brokenFlows?.length) {
    out.push('')
    out.push('## User journeys that break')
    for (const f of brokenFlows.slice(0, 6)) {
      const failed = f.steps.find((s) => !s.ok)
      out.push(
        `- **${f.name}** failed at step ${f.steps.filter((s) => s.ok).length + 1}: \`${failed?.step.action} ${failed?.step.target ?? ''}\` — ${failed?.error?.split('\n')[0] ?? 'unknown'}`
      )
    }
  }

  /* ------------------------------ reference ------------------------------ */
  if (run.references?.length) {
    const refs = [...new Set(run.references.map((r) => r.appName).filter(Boolean))].slice(0, 8)
    if (refs.length) {
      out.push('')
      out.push('## Reference products')
      out.push(
        `For visual/structural reference on the same section types, the audit pulled shipped UI from: ${refs.join(', ')}. Match their information hierarchy, not their branding.`
      )
    }
  }

  out.push('')
  out.push('## Output expected from you')
  out.push('1. Execute the root-cause list above in order (measured a11y/tokens first, then layout, then [review]).')
  out.push('2. The actual code changes, smallest coherent diffs first.')
  out.push('3. A list of finding ids you did NOT fix, with the reason.')

  return out.join('\n')
}
