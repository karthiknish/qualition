/**
 * Heuristic audit engine — the part of Qualition that is deterministic and
 * therefore arguable. Gemini adds taste on top; these rules add receipts.
 *
 * Two failure modes are both punished:
 *   - INCOHERENCE: token drift, ad-hoc values, five radii, nine greys.
 *   - MONOTONY:    every section is the same slab of centered text + card grid.
 */
import { differenceCiede2000, parse as parseCssColor, converter } from 'culori'
import type {
  CapturedPage,
  Category,
  Finding,
  RunConfig,
  Scorecard,
  Severity
} from '../../shared/types.js'
import { SEVERITY_WEIGHT } from '../../shared/types.js'

let counter = 0
function mk(
  page: CapturedPage,
  category: Category,
  severity: Severity,
  title: string,
  detail: string,
  fix: string,
  extra: Partial<Finding> = {}
): Finding {
  return {
    id: `f${++counter}`,
    category,
    severity,
    title,
    detail,
    fix,
    pageUrl: page.url,
    source: 'heuristic',
    ...extra
  }
}

/* ------------------------------ colour utils ------------------------------ */

/**
 * culori parses everything a modern browser can serialise — rgb(), hex,
 * lab(), oklch(), color(display-p3 …) — so palette maths no longer silently
 * skips whole colour systems.
 */
const toRgb = converter('rgb')
const ciede2000 = differenceCiede2000()

export function parseColor(c: string): { r: number; g: number; b: number; alpha: number } | null {
  try {
    const parsed = parseCssColor(c.trim())
    if (!parsed) return null
    const rgb = toRgb(parsed)
    if (!rgb) return null
    return { r: rgb.r * 255, g: rgb.g * 255, b: rgb.b * 255, alpha: rgb.alpha ?? 1 }
  } catch {
    return null
  }
}

/** Perceptual distance, CIEDE2000 (the standard people actually cite). */
export function deltaE(a: string, b: string): number | null {
  try {
    const d = ciede2000(a, b)
    return Number.isFinite(d) ? d : null
  } catch {
    return null
  }
}

/* -------------------------------- rules ---------------------------------- */

export function auditPage(page: CapturedPage, config: RunConfig): Finding[] {
  const out: Finding[] = []
  const signals: any = (page as any).signals ?? {}
  const strict = config.brutality === 'ruthless' ? 1 : config.brutality === 'harsh' ? 0.75 : 0.5
  const t = page.tokens

  if (!page.ok) {
    out.push(
      mk(page, 'flow', 'blocker', 'Page failed to capture', page.errorText ?? 'Navigation error', 'Fix the route or the redirect chain before anything else — an unreachable page is a 0.')
    )
    return out
  }

  /* ---- coherence: colour ---- */
  const meaningful = t.colors.filter((c) => c.usage >= 2)
  const textColors = meaningful.filter((c) => c.role === 'text')
  const bgColors = meaningful.filter((c) => c.role === 'bg')
  const distinct = new Set(meaningful.map((c) => c.value)).size
  const colorBudget = config.brutality === 'ruthless' ? 12 : 18
  if (distinct > colorBudget) {
    out.push(
      mk(page, 'coherence', distinct > colorBudget * 1.8 ? 'critical' : 'major',
        `${distinct} distinct colours in use`,
        `Palette budget for a coherent product surface is ~${colorBudget} (bg/text/border combined). Found ${distinct}, top offenders: ${meaningful.slice(0, 8).map((c) => c.value).join(', ')}.`,
        'Collapse to a token set (background/foreground/muted/accent/destructive + 2 states). Anything not expressible as a CSS variable is drift.')
    )
  }

  // near-duplicate colours = copy-paste theming
  const dupes: string[] = []
  for (let i = 0; i < meaningful.length; i++) {
    for (let j = i + 1; j < meaningful.length; j++) {
      if (meaningful[i].role !== meaningful[j].role) continue
      const a = parseColor(meaningful[i].value)
      const b = parseColor(meaningful[j].value)
      if (!a || !b || a.alpha < 0.9 || b.alpha < 0.9) continue
      const d = deltaE(meaningful[i].value, meaningful[j].value)
      if (d !== null && d > 0.2 && d < 2.0)
        dupes.push(`${meaningful[i].value} ≈ ${meaningful[j].value} (ΔE2000 ${d.toFixed(2)})`)
    }
  }
  if (dupes.length >= 2) {
    out.push(
      mk(page, 'coherence', dupes.length > 5 ? 'major' : 'minor',
        `${dupes.length} near-duplicate colour pairs`,
        `Visually identical colours defined separately — the signature of hand-typed hexes: ${dupes.slice(0, 5).join('; ')}.`,
        'Deduplicate into one token each. Below ΔE2000 2.0 the difference is imperceptible to users but very visible in your CSS.')
    )
  }

  /* ---- coherence: typography ---- */
  const families = t.fontFamilies.filter((f) => f.usage >= 3)
  if (families.length > 2) {
    out.push(
      mk(page, 'coherence', families.length > 3 ? 'major' : 'minor',
        `${families.length} font families on one page`,
        `Families: ${families.map((f) => `${f.value} (${f.usage})`).join(', ')}.`,
        'Two families max: one for UI/body, optionally one display face. A third family reads as an unfinished migration.')
    )
  }
  const sizes = t.fontSizes.filter((s) => s.usage >= 2).map((s) => s.value).sort((a, b) => a - b)
  const sizeBudget = config.brutality === 'ruthless' ? 7 : 9
  if (sizes.length > sizeBudget) {
    out.push(
      mk(page, 'coherence', 'major',
        `${sizes.length} distinct font sizes`,
        `Sizes: ${sizes.join(', ')}px. A type scale should be a short geometric ladder, not a continuum.`,
        'Define a 6–8 step scale (12/14/16/18/24/30/36/48) and delete every orphan value.')
    )
  }
  // orphan sizes = used once or twice, off-ladder
  const orphans = t.fontSizes.filter((s) => s.usage <= 2 && s.value % 2 !== 0)
  if (orphans.length >= 2 && strict > 0.6) {
    out.push(
      mk(page, 'coherence', 'minor',
        `${orphans.length} odd one-off font sizes`,
        `Values like ${orphans.slice(0, 5).map((o) => o.value + 'px').join(', ')} appear once or twice and are not on any even ladder.`,
        'Snap to the nearest scale step; one-off sizes are how a design system dies.')
    )
  }

  /* ---- coherence: radii, shadows, motion ---- */
  const radii = t.radii.filter((r) => r.usage >= 2)
  if (radii.length > 4) {
    out.push(
      mk(page, 'coherence', 'major',
        `${radii.length} distinct border radii`,
        `Radii in use: ${radii.slice(0, 8).map((r) => r.value).join(' | ')}.`,
        'Pick sm/md/lg/full derived from one --radius variable. Mixed roundness makes a UI look assembled from stock parts.')
    )
  }
  const shadows = t.shadows.filter((s) => s.usage >= 2)
  if (shadows.length > 4) {
    out.push(
      mk(page, 'coherence', 'minor',
        `${shadows.length} distinct box-shadows`,
        'Elevation is a semantic ladder (raised / overlay / popover), not a per-component decision.',
        'Reduce to 3 elevation tokens and apply by role.')
    )
  }
  const spacingValues = t.spacing.filter((s) => s.usage >= 3).map((s) => s.value)
  const offGrid = spacingValues.filter((v) => v % 4 !== 0)
  if (spacingValues.length > 0 && offGrid.length / spacingValues.length > 0.35) {
    out.push(
      mk(page, 'coherence', 'major',
        `${Math.round((offGrid.length / spacingValues.length) * 100)}% of spacing is off the 4px grid`,
        `Off-grid values: ${offGrid.slice(0, 10).join(', ')}px.`,
        'Move to a 4px (ideally 8px) rhythm. Off-grid spacing is why sections never quite align.')
    )
  }
  if (t.transitions.length > 5) {
    out.push(
      mk(page, 'coherence', 'nit',
        `${t.transitions.length} distinct transition signatures`,
        `e.g. ${t.transitions.slice(0, 4).map((x) => x.value).join(' | ')}.`,
        'Two durations (fast 150ms, base 250ms) and one easing curve. Motion inconsistency reads as jank.')
    )
  }

  /* ---- variety / rhythm ---- */
  const roles = page.sections.map((s) => s.role)
  const uniqueRoles = new Set(roles).size
  if (page.sections.length >= 5 && uniqueRoles <= 2) {
    out.push(
      mk(page, 'variety', 'major',
        'Page is rhythmically flat',
        `${page.sections.length} sections but only ${uniqueRoles} distinct section type(s): ${[...new Set(roles)].join(', ')}. Everything is the same slab.`,
        'Alternate density: hero → proof → 2-col explainer → metrics band → testimonial → FAQ → CTA. Vary background weight and column count to create scan anchors.')
    )
  }
  const repeatedRun = longestRun(roles)
  if (repeatedRun.count >= 4) {
    out.push(
      mk(page, 'variety', 'minor',
        `${repeatedRun.count} identical "${repeatedRun.role}" sections in a row`,
        'Consecutive sections of the same type flatten the scan path; users stop reading after the second.',
        'Merge them, or break the run with a contrasting band (dark section, media, or metrics).')
    )
  }
  const bgVariety = new Set(page.sections.map((s) => s.stats.distinctBgColors > 0)).size
  if (page.sections.length >= 6 && bgVariety <= 1 && strict > 0.6) {
    out.push(
      mk(page, 'variety', 'nit',
        'No background contrast between sections',
        'Every section shares the same surface colour, so the page reads as one endless scroll.',
        'Alternate surface/muted backgrounds, or add a full-bleed accent band at the conversion point.')
    )
  }
  const ctaTexts = page.sections.flatMap((s) => s.ctaLabels).map((c) => c.toLowerCase().trim()).filter(Boolean)
  const ctaCounts = new Map<string, number>()
  for (const c of ctaTexts) ctaCounts.set(c, (ctaCounts.get(c) ?? 0) + 1)
  const topCta = [...ctaCounts.entries()].sort((a, b) => b[1] - a[1])[0]
  if (topCta && topCta[1] >= 5) {
    out.push(
      mk(page, 'content', 'minor',
        `"${topCta[0]}" repeated ${topCta[1]} times`,
        'Identical CTA copy everywhere gives users no information about what changes when they click.',
        'Differentiate by intent: primary conversion vs. secondary learn-more. Repetition without hierarchy is noise, not persistence.')
    )
  }

  /* ---- craft: line length, hierarchy ---- */
  for (const s of page.sections) {
    if (s.stats.maxTextWidthPx > 900) {
      out.push(
        mk(page, 'craft', 'minor',
          `Body copy runs ${Math.round(s.stats.maxTextWidthPx)}px wide`,
          'Optimal measure is 45–75 characters (~600–720px at 16px). Long lines destroy return-sweep accuracy.',
          'Cap with max-w-prose / max-w-2xl on text blocks.',
          { sectionId: s.id, selector: s.selector })
      )
    }
    if (s.stats.distinctFontSizes > 6) {
      out.push(
        mk(page, 'coherence', 'minor',
          `Section "${s.label}" uses ${s.stats.distinctFontSizes} font sizes`,
          'A single section rarely needs more than 3–4 steps of hierarchy.',
          'Collapse to heading / body / caption and let weight and colour do the rest.',
          { sectionId: s.id, selector: s.selector })
      )
    }
  }

  /* ---- accessibility ---- */
  for (const v of page.axe) {
    const sev: Severity =
      v.impact === 'critical' ? 'critical' : v.impact === 'serious' ? 'major' : v.impact === 'moderate' ? 'minor' : 'nit'
    out.push({
      id: `f${++counter}`,
      category: 'accessibility',
      severity: sev,
      title: `axe: ${v.help}`,
      detail: `${v.nodes.length} node(s). ${v.nodes[0]?.failureSummary ?? ''} Targets: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`,
      fix: `Resolve per WCAG guidance: ${v.helpUrl}`,
      pageUrl: page.url,
      selector: v.nodes[0]?.target?.join(' '),
      source: 'axe'
    })
  }
  if (signals.imagesMissingAlt > 0) {
    out.push(
      mk(page, 'accessibility', signals.imagesMissingAlt > 5 ? 'major' : 'minor',
        `${signals.imagesMissingAlt} images without alt text`,
        'Screen-reader users get filenames or silence.',
        'Add descriptive alt, or alt="" + aria-hidden for decoration.')
    )
  }
  if (signals.h1Count === 0) {
    out.push(mk(page, 'accessibility', 'major', 'No <h1> on the page', 'Document outline has no root heading.', 'Exactly one <h1> that states the page proposition.'))
  } else if (signals.h1Count > 1) {
    out.push(mk(page, 'accessibility', 'minor', `${signals.h1Count} <h1> elements`, 'Multiple document titles confuse assistive tech and SEO.', 'Demote all but the primary to <h2>.'))
  }
  if (signals.headingOrderIssues > 0) {
    out.push(mk(page, 'accessibility', 'minor', `${signals.headingOrderIssues} heading-level skips`, 'Levels jump (e.g. h2 → h4), breaking the outline.', 'Never skip levels; style with classes, not tag choice.'))
  }
  if (signals.buttonsWithoutLabel > 0) {
    out.push(mk(page, 'accessibility', 'major', `${signals.buttonsWithoutLabel} icon-only buttons without a label`, 'Buttons with no text and no aria-label are unusable non-visually.', 'Add aria-label, or a visually hidden span.'))
  }
  if (!signals.hasSkipLink && strict > 0.7) {
    out.push(mk(page, 'accessibility', 'nit', 'No skip-to-content link', 'Keyboard users must tab through the whole nav on every page.', 'Add a focus-visible skip link as the first focusable element.'))
  }
  if (!signals.langAttr) {
    out.push(mk(page, 'accessibility', 'minor', 'Missing <html lang>', 'Screen readers pick the wrong voice.', 'Set lang on the html element.'))
  }

  /* ---- responsive ---- */
  for (const r of page.responsive) {
    if (r.horizontalOverflowPx > 4) {
      out.push(
        mk(page, 'responsive', r.horizontalOverflowPx > 40 ? 'critical' : 'major',
          `Horizontal overflow of ${r.horizontalOverflowPx}px at ${r.viewport}`,
          'The page scrolls sideways — usually a fixed-width child, a wide table, or an un-wrapped flex row.',
          'Find the offender with overflow-x debugging and constrain with min-w-0 / max-w-full / overflow-x-auto on the container.',
          { viewport: r.viewport })
      )
    }
    if (r.tinyTextCount > 3) {
      out.push(
        mk(page, 'responsive', 'minor',
          `${r.tinyTextCount} text nodes under 12px at ${r.viewport}`,
          'Sub-12px copy is effectively unreadable on device and triggers iOS zoom on inputs.',
          'Minimum 14px body, 16px for inputs.',
          { viewport: r.viewport })
      )
    }
    if (r.smallTapTargets > 3 && r.viewport === 'mobile') {
      out.push(
        mk(page, 'accessibility', 'major',
          `${r.smallTapTargets} tap targets below 32px at mobile`,
          'WCAG 2.5.8 asks for 24px minimum; platform guidance is 44px. Small targets are the top mobile complaint.',
          'Pad to at least 44×44 hit area; visual size can stay small.',
          { viewport: r.viewport })
      )
    }
    if (r.overlaps > 2) {
      out.push(
        mk(page, 'responsive', 'major',
          `${r.overlaps} overlapping interactive elements at ${r.viewport}`,
          'Controls physically collide, so taps land on the wrong element.',
          'Reflow with grid/flex-wrap instead of absolute positioning at this breakpoint.',
          { viewport: r.viewport })
      )
    }
  }

  /* ---- flow / runtime health ---- */
  if (page.consoleErrors.length > 0) {
    out.push(
      mk(page, 'flow', page.consoleErrors.length > 5 ? 'critical' : 'major',
        `${page.consoleErrors.length} console errors`,
        page.consoleErrors.slice(0, 5).join('\n'),
        'Ship zero console errors. Each one is a feature that is silently broken for someone.')
    )
  }
  const hardFails = page.networkFailures.filter((n) => typeof n.status === 'number' && n.status >= 500)
  const notFound = page.networkFailures.filter((n) => n.status === 404)
  if (hardFails.length) {
    out.push(mk(page, 'flow', 'critical', `${hardFails.length} server errors (5xx)`, hardFails.slice(0, 5).map((f) => `${f.status} ${f.url}`).join('\n'), 'Fix or remove the failing endpoint; 5xx during page load means the experience is partially dead.'))
  }
  if (notFound.length) {
    out.push(mk(page, 'flow', 'major', `${notFound.length} missing resources (404)`, notFound.slice(0, 5).map((f) => f.url).join('\n'), 'Broken assets/endpoints — delete the reference or restore the file.'))
  }
  if (page.status >= 400) {
    out.push(mk(page, 'flow', 'blocker', `Page returned HTTP ${page.status}`, 'The document itself is an error response.', 'Fix routing/permissions before auditing anything else.'))
  }

  /* ---- performance ---- */
  const m = page.metrics
  if (m.lcpMs && m.lcpMs > 2500) {
    out.push(mk(page, 'performance', m.lcpMs > 4000 ? 'critical' : 'major', `LCP ${(m.lcpMs / 1000).toFixed(1)}s`, 'Largest Contentful Paint above the 2.5s "good" threshold.', 'Preload the hero asset, serve modern formats, and cut render-blocking JS.'))
  }
  if (m.cls !== null && m.cls > 0.1) {
    out.push(mk(page, 'performance', m.cls > 0.25 ? 'critical' : 'major', `CLS ${m.cls.toFixed(3)}`, 'Layout shifts above 0.1 — content moves under the user.', 'Reserve space for images/embeds and avoid late-injected banners.'))
  }
  if (m.transferBytes > 3_500_000) {
    out.push(mk(page, 'performance', 'major', `${(m.transferBytes / 1e6).toFixed(1)} MB transferred`, `${m.requestCount} requests.`, 'Compress and lazy-load below-the-fold media; audit the JS bundle.'))
  }
  if (m.longTaskMs > 800) {
    out.push(mk(page, 'performance', 'minor', `${m.longTaskMs}ms of long tasks`, 'The main thread is blocked, so early clicks feel dead.', 'Split bundles, defer non-critical work, hydrate progressively.'))
  }

  /* ---- content ---- */
  if (!signals.metaDescription) {
    out.push(mk(page, 'content', 'nit', 'No meta description', 'Search and link previews get scraped junk.', 'Write a 150-character description per page.'))
  }
  if (signals.title && signals.title.length > 65) {
    out.push(mk(page, 'content', 'nit', 'Page title over 65 characters', signals.title, 'Trim to fit the SERP truncation limit.'))
  }
  const heroSection = page.sections.find((s) => s.role === 'hero')
  if (heroSection && heroSection.ctaLabels.length === 0) {
    out.push(mk(page, 'flow', 'major', 'Hero has no call to action', 'The first screen offers nothing to click.', 'One primary action, one secondary. Above the fold.', { sectionId: heroSection.id }))
  }
  if (heroSection && (heroSection.headings[0]?.length ?? 0) > 90) {
    out.push(mk(page, 'content', 'minor', 'Hero headline is a paragraph', heroSection.headings[0], 'Under 60 characters. If it needs a comma and an "and", it is two ideas.', { sectionId: heroSection.id }))
  }

  return out
}

/**
 * Collapse the same finding repeated across pages into one.
 *
 * A shared stylesheet produces identical facts on every page ("36 unique font
 * sizes", "z-index max 999999999"). Reporting them per page is noise, and it
 * multiplies the scoring penalty by the number of pages crawled — which is how
 * a site scored worse simply for being crawled more deeply.
 */
export function dedupeFindings(findings: Finding[]): Finding[] {
  const groups = new Map<string, Finding[]>()
  for (const f of findings) {
    // Section- and viewport-specific findings stay separate; they are genuinely
    // different instances.
    const key = [f.category, f.severity, f.title, f.sectionId ?? '', f.viewport ?? '', f.selector ?? ''].join('|')
    const list = groups.get(key)
    if (list) list.push(f)
    else groups.set(key, [f])
  }

  const out: Finding[] = []
  for (const group of groups.values()) {
    const first = group[0]
    if (group.length === 1) {
      out.push(first)
      continue
    }
    const urls = [...new Set(group.map((f) => f.pageUrl))]
    out.push({
      ...first,
      detail:
        urls.length > 1
          ? `${first.detail}\n\nAffects ${urls.length} pages: ${urls
              .map((u) => {
                try {
                  return new URL(u).pathname || '/'
                } catch {
                  return u
                }
              })
              .join(', ')}`
          : first.detail
    })
  }
  return out
}

function longestRun(arr: string[]): { role: string; count: number } {
  let best = { role: arr[0] ?? '', count: 0 }
  let cur = { role: arr[0] ?? '', count: 0 }
  for (const r of arr) {
    if (r === cur.role) cur.count++
    else cur = { role: r, count: 1 }
    if (cur.count > best.count) best = { ...cur }
  }
  return best
}

/* ------------------------------- scorecard -------------------------------- */

const CATEGORY_BUDGET: Record<Category, number> = {
  coherence: 55,
  variety: 30,
  accessibility: 70,
  responsive: 45,
  flow: 60,
  performance: 45,
  content: 25,
  craft: 30
}

export function scoreRun(findings: Finding[], pageCount: number, brutality: RunConfig['brutality']): Scorecard {
  const multiplier = brutality === 'ruthless' ? 1.35 : brutality === 'harsh' ? 1.0 : 0.75
  const categories = {} as Scorecard['categories']
  const cats: Category[] = ['coherence', 'variety', 'accessibility', 'responsive', 'flow', 'performance', 'content', 'craft']

  for (const c of cats) {
    const list = findings.filter((f) => f.category === c)
    const penalty = list.reduce((s, f) => s + SEVERITY_WEIGHT[f.severity], 0) * multiplier
    const budget = CATEGORY_BUDGET[c] * Math.max(1, pageCount * 0.7)
    const score = Math.max(0, Math.round(100 - (penalty / budget) * 100))
    categories[c] = { score, findings: list.length }
  }

  const weights: Record<Category, number> = {
    coherence: 0.2, accessibility: 0.2, flow: 0.16, responsive: 0.14,
    variety: 0.1, performance: 0.1, craft: 0.06, content: 0.04
  }
  let overall = 0
  for (const c of cats) overall += categories[c].score * weights[c]
  overall = Math.round(overall)

  const blockers = findings.filter((f) => f.severity === 'blocker').length
  if (blockers) overall = Math.min(overall, 45)

  const grade =
    overall >= 90 ? 'A' : overall >= 80 ? 'B' : overall >= 70 ? 'C' : overall >= 60 ? 'D' : overall >= 45 ? 'E' : 'F'

  const worst = [...cats].sort((a, b) => categories[a].score - categories[b].score).slice(0, 2)
  const verdict =
    overall >= 88
      ? `Genuinely tight. Weakest link is ${worst[0]} (${categories[worst[0]].score}); everything else holds up under scrutiny.`
      : overall >= 72
        ? `Competent but not finished. ${worst[0]} and ${worst[1]} are dragging it down — ${findings.filter((f) => f.severity === 'critical' || f.severity === 'blocker').length} critical issue(s) still open.`
        : overall >= 55
          ? `This ships as "fine" and reads as unfinished. ${worst[0]} (${categories[worst[0]].score}) and ${worst[1]} (${categories[worst[1]].score}) need a dedicated pass, not touch-ups.`
          : `Not defensible in front of users. ${findings.filter((f) => f.severity === 'blocker' || f.severity === 'critical').length} blocking/critical issues, with ${worst[0]} at ${categories[worst[0]].score}. Rebuild the offending sections on system primitives rather than patching.`

  return { overall, grade, verdict, categories }
}

export function themeSummary(pages: CapturedPage[]): string {
  const colors = new Map<string, number>()
  const fonts = new Map<string, number>()
  const radii = new Map<string, number>()
  for (const p of pages) {
    for (const c of p.tokens.colors) colors.set(c.value, (colors.get(c.value) ?? 0) + c.usage)
    for (const f of p.tokens.fontFamilies) fonts.set(f.value, (fonts.get(f.value) ?? 0) + f.usage)
    for (const r of p.tokens.radii) radii.set(r.value, (radii.get(r.value) ?? 0) + r.usage)
  }
  const top = (m: Map<string, number>, n: number): string[] =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)
  return [
    `Fonts: ${top(fonts, 3).join(', ') || 'n/a'}`,
    `Dominant colours: ${top(colors, 6).join(', ') || 'n/a'}`,
    `Radii: ${top(radii, 4).join(', ') || 'none'}`
  ].join(' · ')
}
