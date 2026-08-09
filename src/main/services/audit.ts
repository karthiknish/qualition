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
  FindingEffort,
  RunConfig,
  Scorecard,
  Severity
} from '../../shared/types.js'
import { SEVERITY_WEIGHT } from '../../shared/types.js'
import { guessEffort, provenanceForSelector } from './provenance.js'
import { auditImpeccableSlop } from './impeccableSlop.js'
import { auditBrokenUi } from './brokenUi.js'
import { auditPremiumCraft } from './premiumCraft.js'

let counter = 0
export function resetAuditCounter(): void {
  counter = 0
}
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
    id: `f${++counter}-${page.url.replace(/[^a-z0-9]/gi, '_').slice(0, 16)}`,
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
  const signals = (page.signals ?? {}) as Record<string, unknown>
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
  const decisions = clusterColourDecisions(meaningful.map((c) => c.value))
  const distinct = decisions.length
  const rawDistinct = new Set(meaningful.map((c) => c.value)).size
  const colorBudget = config.brutality === 'ruthless' ? 12 : 18
  if (distinct > colorBudget) {
    out.push(
      mk(page, 'coherence', distinct > colorBudget * 1.8 ? 'critical' : 'major',
        `${distinct} colour decisions in use`,
        `Palette budget for a coherent product surface is ~${colorBudget} decisions (alpha ladders of one hue count as one). Found ${distinct} decisions across ${rawDistinct} raw values. Top: ${decisions.slice(0, 8).map((d) => d.label).join(', ')}.`,
        'Collapse near-duplicate alphas of the same hue into one token; reserve status/chart series separately from brand drift.',
        { effort: 'component' })
    )
  } else if (rawDistinct > colorBudget) {
    out.push(
      mk(page, 'coherence', 'nit',
        `${rawDistinct} raw colours collapse to ${distinct} decisions`,
        'Multiple alphas of the same hue were clustered — treat each cluster as one design decision, not N colours.',
        'Name the token once and vary opacity via a scale (e.g. color-mix / token alpha).',
        { effort: 'one-line' })
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
        'Deduplicate into one token each. Below ΔE2000 2.0 the difference is imperceptible to users but very visible in your CSS.',
        { effort: 'one-line' })
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

  /* ---- padding / margin / layout mismatches (DOM-measured) ---- */
  const layout = (page.signals?.layout ?? null) as
    | {
        bandCount?: number
        misalignedBands?: number
        distinctBandGaps?: number
        dominantGap?: number
        offRhythmGaps?: number
        asymmetricPadding?: number
        siblingPaddingMismatches?: number
        uniquePaddingValues?: number
        uniqueMarginValues?: number
      }
    | null
  if (layout) {
    const bands = layout.bandCount ?? 0
    if (bands >= 4 && (layout.misalignedBands ?? 0) >= 2) {
      out.push(
        mk(
          page,
          'craft',
          'major',
          `${layout.misalignedBands} content bands misaligned on the left edge`,
          `Of ${bands} main-column bands, ${layout.misalignedBands} sit more than 8px off the median left edge. Stacked sections should share a content gutter.`,
          'Align the main column with one horizontal padding token; stop per-section margin-left overrides.',
          { effort: 'one-line', confidence: 'high' }
        )
      )
    }
    if ((layout.distinctBandGaps ?? 0) >= 4 && (layout.offRhythmGaps ?? 0) >= 3) {
      out.push(
        mk(
          page,
          'coherence',
          'minor',
          `Vertical rhythm uses ${layout.distinctBandGaps} different gaps between bands`,
          `Dominant gap ~${layout.dominantGap ?? '?'}px but ${layout.offRhythmGaps} neighbouring pairs drift by >8px. Uneven section spacing reads as unfinished layout.`,
          'Use one stack gap token (e.g. gap-4 / gap-6) between page bands; avoid ad-hoc margin-top per section.',
          { effort: 'one-line', confidence: 'high' }
        )
      )
    }
    if ((layout.asymmetricPadding ?? 0) >= 4) {
      out.push(
        mk(
          page,
          'craft',
          'minor',
          `${layout.asymmetricPadding} cards/blocks with uneven padding`,
          'Horizontal or vertical padding differs by ≥8px on the same component. Optical imbalance usually means one side was hand-tuned.',
          'Set padding with a single token (p-3 / p-4) rather than independent padding-left/right values.',
          { effort: 'one-line', confidence: 'low' }
        )
      )
    }
    if ((layout.siblingPaddingMismatches ?? 0) >= 3) {
      out.push(
        mk(
          page,
          'coherence',
          'minor',
          `Sibling cards disagree on padding (${layout.siblingPaddingMismatches} outliers)`,
          'Items that share a parent row/list should share the same padding-left. Drift means components were restyled independently.',
          'Extract a shared card/list-item primitive and forbid local padding overrides.',
          { effort: 'component', confidence: 'high' }
        )
      )
    }
    if ((layout.uniquePaddingValues ?? 0) >= 12) {
      out.push(
        mk(
          page,
          'coherence',
          'major',
          `${layout.uniquePaddingValues} distinct padding values in the main column`,
          `Plus ${layout.uniqueMarginValues ?? 0} distinct vertical margins. A spacing scale usually needs 4–6 steps, not a unique value per component.`,
          'Collapse padding/margin onto the spacing scale (4/8/12/16/24/32) and delete one-off values.',
          { effort: 'component', confidence: 'high' }
        )
      )
    } else if ((layout.uniqueMarginValues ?? 0) >= 14) {
      out.push(
        mk(
          page,
          'coherence',
          'minor',
          `${layout.uniqueMarginValues} distinct margin values in the main column`,
          'Margin sprawl between blocks breaks vertical rhythm even when padding looks disciplined.',
          'Prefer gap on the parent flex/stack over per-child margin-top.',
          { effort: 'one-line', confidence: 'high' }
        )
      )
    }
  }

  /* ---- product polish: empty / loading / microcopy (NN/G + state coverage) ---- */
  const polish = (page.signals?.polish ?? null) as
    | {
        emptyRegionsWithoutCta?: number
        vagueEmptyCopy?: string[]
        genericCtaLabels?: string[]
        skeletonCount?: number
        skeletonWithoutMinHeight?: number
        ariaBusyCount?: number
        disabledWithoutAria?: number
        connectingCopy?: boolean
        stuckLoading?: boolean
        bareLoadingShell?: boolean
      }
    | null
  if (polish) {
    if (polish.stuckLoading || ((polish.connectingCopy ?? false) && (polish.skeletonCount ?? 0) >= 4)) {
      out.push(
        mk(
          page,
          'flow',
          'critical',
          polish.bareLoadingShell && !(polish.skeletonCount && polish.skeletonCount >= 4)
            ? 'Page stuck on a bare Loading… shell'
            : 'Page stuck in loading / Connecting state',
          polish.bareLoadingShell && !(polish.skeletonCount && polish.skeletonCount >= 4)
            ? `Capture settled on loading copy with almost no content (${page.sections?.length ?? 0} sections, ${page.controls?.length ?? 0} controls). A spinner alone is not a product screen.`
            : `Capture still shows connecting/loading copy with ${polish.skeletonCount ?? 0} skeleton placeholder(s). Users see an unfinished shell, not the product.`,
          'Finish the data load, show a real empty state with recovery CTA, or surface an error with retry — never leave Connecting… / Loading… as the settled UI.',
          { effort: 'component', confidence: 'high' }
        )
      )
    } else if ((polish.skeletonCount ?? 0) >= 10) {
      out.push(
        mk(
          page,
          'flow',
          'major',
          `${polish.skeletonCount} skeleton placeholders still visible after capture`,
          'Dense skeleton rows after network idle usually means the list never resolved (or capture raced a hang).',
          'Resolve the fetch, add a timeout empty/error state, and keep skeletons only for the brief in-flight window.',
          { effort: 'component', confidence: 'low' }
        )
      )
    }
    if ((polish.emptyRegionsWithoutCta ?? 0) >= 1) {
      out.push(
        mk(
          page,
          'content',
          'major',
          `${polish.emptyRegionsWithoutCta} empty region(s) without a next-step CTA`,
          'Blank or near-blank panels with no action leave users unsure whether the product is broken or incomplete (NN/G empty-state guidance).',
          'Add a short explanation of why it is empty plus one primary CTA that populates the space (Create…, Add…, Import…).',
          { effort: 'component', confidence: 'high' }
        )
      )
    }
    if ((polish.vagueEmptyCopy?.length ?? 0) >= 1) {
      out.push(
        mk(
          page,
          'content',
          'minor',
          `Vague empty copy: ${polish.vagueEmptyCopy!.slice(0, 3).join(' · ')}`,
          'Phrases like “No data” / “Nothing here” communicate status but not recovery. Empty states should explain context and offer a path forward.',
          'Rewrite to name what belongs here and how to get the first item (e.g. “No projects yet — create one to start”).',
          { effort: 'one-line', confidence: 'high' }
        )
      )
    }
    if ((polish.genericCtaLabels?.length ?? 0) >= 2) {
      out.push(
        mk(
          page,
          'content',
          'minor',
          `Generic CTA labels: ${[...new Set(polish.genericCtaLabels!)].slice(0, 4).join(', ')}`,
          'Submit / Click here / Learn more do not say what happens next. Verb + object labels scan better and improve accessibility announcements.',
          'Replace with specific actions (Save draft, Create invoice, View pricing).',
          { effort: 'one-line', confidence: 'high' }
        )
      )
    }
    if ((polish.skeletonWithoutMinHeight ?? 0) >= 2) {
      out.push(
        mk(
          page,
          'craft',
          'minor',
          `${polish.skeletonWithoutMinHeight} skeleton/pulse placeholders without reserved height`,
          'Zero-height skeletons collapse layout until content arrives (CLS). Skeleton screens should mirror the final content wireframe, not a blank frame (NN/G).',
          'Give each skeleton a min-height (or aspect-ratio) matching the loaded card/row so the page does not jump.',
          { effort: 'one-line', confidence: 'low' }
        )
      )
    } else if ((polish.skeletonCount ?? 0) >= 3 && (polish.ariaBusyCount ?? 0) === 0) {
      out.push(
        mk(
          page,
          'accessibility',
          'nit',
          'Loading skeletons present without aria-busy',
          'Sighted users see placeholders; assistive tech may not know content is still loading.',
          'Set aria-busy="true" on the loading region (and clear it when content resolves); optionally aria-live="polite".',
          { effort: 'one-line', confidence: 'low' }
        )
      )
    }
    if ((polish.disabledWithoutAria ?? 0) >= 4) {
      out.push(
        mk(
          page,
          'accessibility',
          'nit',
          `${polish.disabledWithoutAria} disabled controls without aria-disabled`,
          'Native disabled is often enough for form controls, but custom role=button patterns and inconsistent styling benefit from an explicit aria-disabled for AT parity.',
          'Mirror disabled state with aria-disabled="true" (and keep focus order intentional — do not leave dead tab stops).',
          { effort: 'one-line', confidence: 'low' }
        )
      )
    }
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
  for (const t of page.toolFailures ?? []) {
    out.push(
      mk(
        page,
        t.tool === 'axe' ? 'accessibility' : 'flow',
        'minor',
        `${t.tool} could not run on this page`,
        t.message,
        'Re-run the audit. If this persists, check CSP, network, or that the page finished loading.'
      )
    )
  }
  // One finding per axe rule (not per node cluster) — keeps the list actionable.
  const axeSeen = new Set<string>()
  for (const v of page.axe) {
    if (axeSeen.has(v.id)) continue
    axeSeen.add(v.id)
    const sev: Severity =
      v.impact === 'critical' ? 'critical' : v.impact === 'serious' ? 'major' : v.impact === 'moderate' ? 'minor' : 'nit'
    const selector = v.nodes[0]?.target?.join(' ')
    const prov = provenanceForSelector(selector)
    let detail = `${v.nodes.length} node(s). ${v.nodes[0]?.failureSummary ?? ''} Targets: ${v.nodes
      .slice(0, 3)
      .map((n) => n.target.join(' '))
      .join(' | ')}`
    if (v.tags?.length) detail += `\nTags: ${v.tags.join(', ')}`
    if (/contrast/i.test(v.id) || /contrast/i.test(v.help)) {
      detail +=
        '\nCompositing: if the reported colours look wrong vs design tokens, check ancestor opacity — e.g. opacity:0.72 on a row composites the token down to the measured pair.'
    }
    out.push({
      id: `f${++counter}`,
      category: 'accessibility',
      severity: sev,
      title: `axe: ${v.help}`,
      detail,
      fix: `Resolve per WCAG guidance: ${v.helpUrl}`,
      pageUrl: page.url,
      selector,
      source: 'axe',
      provenance: prov,
      tags: v.tags,
      effort: /contrast|name|label|lang|alt/i.test(v.id) ? 'one-line' : 'component'
    })
  }
  // axe incomplete = needs manual review (not a violation, but triaged separately)
  for (const v of page.axeIncomplete ?? []) {
    if (axeSeen.has(`inc:${v.id}`)) continue
    axeSeen.add(`inc:${v.id}`)
    const selector = v.nodes[0]?.target?.join(' ')
    let detail = `${v.nodes.length} node(s) needs review. ${v.nodes[0]?.failureSummary ?? ''} Targets: ${v.nodes
      .slice(0, 2)
      .map((n) => n.target.join(' '))
      .join(' | ')}`
    if (v.tags?.length) detail += `\nTags: ${v.tags.join(', ')}`
    out.push({
      id: `f${++counter}`,
      category: 'accessibility',
      severity: 'minor',
      title: `needs review: ${v.help}`,
      detail,
      fix: `Manual check required per axe incomplete: ${v.helpUrl}`,
      pageUrl: page.url,
      selector,
      source: 'axe',
      provenance: provenanceForSelector(selector),
      tags: v.tags,
      incomplete: true,
      effort: 'one-line',
      confidence: 'low'
    })
  }
  if ((signals.imagesMissingAlt as number) > 0) {
    out.push(
      mk(page, 'accessibility', (signals.imagesMissingAlt as number) > 5 ? 'major' : 'minor',
        `${signals.imagesMissingAlt as number} images without alt text`,
        `Screen-reader users get filenames or silence.${signals.imagesDecorativeOk ? ` (${signals.imagesDecorativeOk as number} correctly marked decorative with alt="" — not counted.)` : ''}`,
        'Add descriptive alt, or alt="" for decoration (empty alt is correct for decorative images).',
        { effort: 'one-line' })
    )
  }
  if ((signals.h1Count as number) === 0) {
    out.push(mk(page, 'accessibility', 'major', 'No <h1> on the page', 'Document outline has no root heading.', 'Exactly one <h1> that states the page proposition.'))
  } else if ((signals.h1Count as number) > 1) {
    out.push(mk(page, 'accessibility', 'minor', `${signals.h1Count as number} <h1> elements`, 'Multiple document titles confuse assistive tech and SEO.', 'Demote all but the primary to <h2>.'))
  }
  if ((signals.headingOrderIssues as number) > 0) {
    out.push(mk(page, 'accessibility', 'minor', `${signals.headingOrderIssues as number} heading-level skips`, 'Levels jump (e.g. h2 → h4), breaking the outline.', 'Never skip levels; style with classes, not tag choice.'))
  }
  if ((signals.buttonsWithoutLabel as number) > 0) {
    out.push(mk(page, 'accessibility', 'major', `${(signals.buttonsWithoutLabel as number)} icon-only buttons without a label`, 'Buttons with no text and no aria-label are unusable non-visually.', 'Add aria-label, or a visually hidden span.', { effort: 'one-line' }))
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
  const realConsole = page.consoleErrors.filter((e) => !/Download the React DevTools|\[HMR\]|\[vite\]/i.test(e))
  if (realConsole.length > 0) {
    out.push(
      mk(page, 'flow', realConsole.length > 8 ? 'major' : 'minor',
        `${realConsole.length} console errors`,
        realConsole.slice(0, 5).join('\n'),
        'Ship zero console errors. Each one is a feature that is silently broken for someone.')
    )
  }
  const hardFails = page.networkFailures.filter((n) => typeof n.status === 'number' && n.status >= 500)
  const notFound = page.networkFailures.filter(
    (n) => n.status === 404 && !/\.(map|ico|woff2?)(\?|$)/i.test(n.url)
  )
  if (hardFails.length) {
    out.push(mk(page, 'flow', 'critical', `${hardFails.length} server errors (5xx)`, hardFails.slice(0, 5).map((f) => `${f.status} ${f.url}`).join('\n'), 'Fix or remove the failing endpoint; 5xx during page load means the experience is partially dead.'))
  }
  if (notFound.length) {
    out.push(mk(page, 'flow', notFound.length > 5 ? 'major' : 'minor', `${notFound.length} missing resources (404)`, notFound.slice(0, 5).map((f) => f.url).join('\n'), 'Broken assets/endpoints — delete the reference or restore the file.'))
  }
  if (page.status >= 400) {
    out.push(mk(page, 'flow', 'blocker', `Page returned HTTP ${page.status}`, 'The document itself is an error response.', 'Fix routing/permissions before auditing anything else.'))
  }

  /* ---- performance ---- */
  // Lighthouse log-normal curves (mirrors Lighthouse scoring): curve maps value -> 0..1
  const logNormalScore = (value: number, median: number, p10: number): number => {
    // Lighthouse uses log-normal with pODM; approximate via erf for median/p10
    // Fallback to linear interpolation if math fails
    try {
      const logM = Math.log(median)
      const logP10 = Math.log(p10)
      // sigma from p10 = median * exp(sigma * -1.2816)
      const sigma = (logM - logP10) / 1.2816
      const z = (Math.log(value) - logM) / (sigma * Math.SQRT2)
      // erf approximation
      const erf = (x: number): number => {
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911
        const sign = x < 0 ? -1 : 1
        const abs = Math.abs(x)
        const t = 1 / (1 + p * abs)
        const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-abs * abs)
        return sign * y
      }
      return Math.max(0, Math.min(1, 0.5 * (1 - erf(z))))
    } catch { return value <= median ? 1 : value <= p10 ? 0.9 : 0.5 }
  }
  const m = page.metrics
  const devBuild = page.captureContext?.buildMode === 'development'
  const softPerf = (severity: Severity): Severity => (devBuild ? 'nit' : severity)
  const perfSuffix = devBuild
    ? ' [dev-server artifact — not actionable; re-audit a production build]'
    : ''
  // LCP: median 2500 good, p10 4000 poor (Lighthouse desktop)
  if (m.lcpMs != null && m.lcpMs > 0) {
    const s = logNormalScore(m.lcpMs, 2500, 4000)
    if (s < 0.9 || m.lcpMs > 2500) {
      // Keep historic bands for test parity: >4000 critical, >2500 major, blended score shown
      const sev: Severity = m.lcpMs > 4000 ? 'critical' : m.lcpMs > 2500 ? 'major' : s < 0.9 ? 'minor' as Severity : 'nit'
      if (m.lcpMs > 2500) out.push(mk(page, 'performance', softPerf(sev), `LCP ${(m.lcpMs / 1000).toFixed(1)}s${devBuild ? ' (dev)' : ''} (score ${(s*100)|0})`, `Largest Contentful Paint above the 2.5s "good" threshold (log-normal score ${(s*100)|0}).${perfSuffix}`, 'Preload the hero asset, serve modern formats, and cut render-blocking JS.', { effort: 'component', confidence: devBuild ? 'low' : 'high' }))
    }
  }
  // FCP: median 1800, p10 3000
  if ((m as any).fcpMs != null && (m as any).fcpMs > 0) {
    const fcp = (m as any).fcpMs as number
    const s = logNormalScore(fcp, 1800, 3000)
    if (s < 0.9) {
      const sev: Severity = s < 0.5 ? 'major' : 'minor'
      out.push(mk(page, 'performance', softPerf(sev), `FCP ${(fcp/1000).toFixed(1)}s${devBuild ? ' (dev)' : ''}`, `First Contentful Paint ${(s*100)|0}/100.${perfSuffix}`, 'Inline critical CSS, reduce render-blocking resources.', { effort: 'component', confidence: devBuild ? 'low' : 'high' }))
    }
  }
  // CLS: median 0.1, p10 0.25
  if (m.cls !== null && m.cls > 0.01) {
    // CLS is not log-normal in LH; use linear buckets but keep curve
    const clsSc = m.cls <= 0.1 ? 1 : m.cls <= 0.25 ? 0.5 : 0
    if (clsSc < 1) {
      const sev = m.cls > 0.25 ? 'critical' : m.cls > 0.1 ? 'major' : 'nit'
      out.push(mk(page, 'performance', softPerf(sev as Severity), `CLS ${m.cls.toFixed(3)}${devBuild ? ' (dev)' : ''}`, `Layout shifts above 0.1 — content moves under the user (score ${(clsSc*100)|0}).${perfSuffix}`, 'Reserve space for images/embeds and avoid late-injected banners.', { effort: 'component', confidence: devBuild ? 'low' : 'high' }))
    }
  }
  // TBT: median 200ms, p10 600ms
  if ((m as any).tbtMs != null && (m as any).tbtMs > 0) {
    const tbt = (m as any).tbtMs as number
    const s = logNormalScore(tbt, 200, 600)
    if (s < 0.9) {
      const sev: Severity = s < 0.3 ? 'major' : 'minor'
      out.push(mk(page, 'performance', softPerf(sev), `TBT ${tbt}ms${devBuild ? ' (dev)' : ''}`, `Total Blocking Time ${(s*100)|0}/100.${perfSuffix}`, 'Split bundles, defer non-critical work, reduce JS execution.', { effort: 'component', confidence: devBuild ? 'low' : 'high' }))
    }
  } else if (m.longTaskMs > 800) {
    out.push(mk(page, 'performance', softPerf('minor'), `${m.longTaskMs}ms of long tasks${devBuild ? ' (dev)' : ''}`, `The main thread is blocked, so early clicks feel dead.${perfSuffix}`, 'Split bundles, defer non-critical work, hydrate progressively.', { confidence: devBuild ? 'low' : 'high' }))
  }
  if (m.transferBytes > 3_500_000) {
    out.push(mk(page, 'performance', softPerf('major'), `${(m.transferBytes / 1e6).toFixed(1)} MB transferred${devBuild ? ' (dev)' : ''}`, `${m.requestCount} requests.${perfSuffix}`, 'Compress and lazy-load below-the-fold media; audit the JS bundle.', { effort: 'component', confidence: devBuild ? 'low' : 'high' }))
  }
  if (devBuild && (m.lcpMs || m.transferBytes > 500_000)) {
    out.push(
      mk(
        page,
        'performance',
        'nit',
        'Audited against a development server',
        `Build mode: development (${(page.captureContext?.buildHints ?? []).join(', ') || 'localhost'}). LCP/CLS/transfer and CSS sheet counts reflect unbundled Vite/HMR — not what ships.`,
        'Set a Production URL on New audit, or re-run against a built preview (vite preview / next start).',
        { effort: 'one-line', confidence: 'high' }
      )
    )
  }

  /* ---- content ---- */
  if (!signals.metaDescription) {
    out.push(mk(page, 'content', 'nit', 'No meta description', 'Search and link previews get scraped junk.', 'Write a 150-character description per page.'))
  }
  if (signals.title && String(signals.title).length > 65) {
    out.push(mk(page, 'content', 'nit', 'Page title over 65 characters', String(signals.title), 'Trim to fit the SERP truncation limit.'))
  }
  const heroSection = page.sections.find((s) => s.role === 'hero')
  if (heroSection && heroSection.ctaLabels.length === 0) {
    out.push(mk(page, 'flow', 'major', 'Hero has no call to action', 'The first screen offers nothing to click.', 'One primary action, one secondary. Above the fold.', { sectionId: heroSection.id }))
  }
  if (heroSection && (heroSection.headings[0]?.length ?? 0) > 90) {
    out.push(mk(page, 'content', 'minor', 'Hero headline is a paragraph', heroSection.headings[0], 'Under 60 characters. If it needs a comma and an "and", it is two ideas.', { sectionId: heroSection.id }))
  }

  /* ---- Impeccable AI-slop tells (https://impeccable.style/slop) ---- */
  out.push(...auditImpeccableSlop(page))

  /* ---- soft-404 shells + clipped / colliding text ---- */
  out.push(...auditBrokenUi(page))

  /* ---- empty capture: no sections, almost no main text (loading hang) ---- */
  const brokenChars =
    (page.signals as { brokenUi?: { mainContentChars?: number } } | undefined)?.brokenUi
      ?.mainContentChars ?? null
  if (
    (page.sections?.length ?? 0) === 0 &&
    (page.controls?.length ?? 0) < 3 &&
    brokenChars !== null &&
    brokenChars < 40 &&
    page.ok
  ) {
    const alreadyStuck = out.some((f) => /stuck on a bare Loading|stuck in loading/i.test(f.title))
    if (!alreadyStuck) {
      out.push(
        mk(
          page,
          'flow',
          'critical',
          'Page captured as an empty shell',
          `Crawl got HTTP ${page.status} but extracted ${brokenChars} main-content characters with no sections. Typical of a spinner hang or a route that never painted.`,
          'Wait for real content before considering the route ready, or show a timeout empty/error state with a recovery CTA.',
          { effort: 'component', confidence: 'high' }
        )
      )
    }
  }

  /* ---- Premium craft (Linear / Stripe bar) ---- */
  out.push(...auditPremiumCraft(page))

  return out
}

/**
 * SPA apps that never update document.title leave every tab labelled with the
 * brand alone — bad for tabs, history, and assistive tech.
 */
export function auditStaticDocumentTitles(pages: CapturedPage[]): Finding[] {
  const ok = pages.filter((p) => p.ok)
  if (ok.length < 4) return []
  const titles = ok.map((p) => (p.title || '').trim()).filter(Boolean)
  if (titles.length < 4) return []
  const counts = new Map<string, number>()
  for (const t of titles) counts.set(t.toLowerCase(), (counts.get(t.toLowerCase()) ?? 0) + 1)
  let top = ''
  let topN = 0
  for (const [t, n] of counts) {
    if (n > topN) {
      top = t
      topN = n
    }
  }
  if (topN < Math.ceil(ok.length * 0.75)) return []
  const sample = ok.find((p) => (p.title || '').trim().toLowerCase() === top) ?? ok[0]
  const display = sample.title?.trim() || top
  return [
    {
      id: `f${++counter}`,
      category: 'content',
      severity: 'major',
      title: 'Document title never changes across routes',
      detail: `${topN}/${ok.length} captured pages share the title “${display}”. Browser tabs, history, and screen-reader page announcements cannot tell routes apart.`,
      fix: 'Set document.title (or <title>) per route: “Tasks — Brand”, “CLM-1042 — Brand”. Keep the brand last so the unique part is visible in the tab.',
      pageUrl: sample.url,
      source: 'heuristic',
      effort: 'component',
      confidence: 'high',
      affectedPages: topN
    }
  ]
}

/**
 * Collapse the same finding repeated across pages into one.
 *
 * A shared stylesheet produces identical facts on every page ("36 unique font
 * sizes", "z-index max 999999999"). Reporting them per page is noise, and it
 * multiplies the scoring penalty by the number of pages crawled — which is how
 * a site scored worse simply for being crawled more deeply.
 *
 * Page-local layout / a11y / interaction defects must NOT merge — otherwise
 * /chat overlap and /templates clip vanish behind /knowledge's worse count.
 */
export function isPageLocalFinding(f: Finding): boolean {
  if (f.source === 'axe' || f.source === 'pa11y' || f.source === 'ai') return true
  if (f.sectionId || f.viewport || f.selector) return true
  return /clipped or overflowing|overlapping text|not-found|missing-record|skeleton placeholder|stuck in loading|stuck on a bare Loading|empty shell|no hover feedback|dead click|no visible focus|focus state|fake button|accessible name|empty region/i.test(
    f.title
  )
}

export function dedupeFindings(findings: Finding[]): Finding[] {
  const groups = new Map<string, Finding[]>()
  for (const f of findings) {
    // Section- and viewport-specific findings stay separate; they are genuinely
    // different instances.
    // Titles that differ only by their number ("29 distinct colours" vs "15
    // distinct colours") are the same defect measured on different pages.
    // Keying on the numberless shape merges them into one finding instead of
    // billing the same root cause four times — except for page-local defects.
    const shape = f.title.replace(/\d+(\.\d+)?%?/g, '#')
    const key = [
      f.category,
      shape,
      f.sectionId ?? '',
      f.viewport ?? '',
      f.selector ?? '',
      isPageLocalFinding(f) ? f.pageUrl : ''
    ].join('|')
    const list = groups.get(key)
    if (list) list.push(f)
    else groups.set(key, [f])
  }

  const order: Severity[] = ['blocker', 'critical', 'major', 'minor', 'nit']
  const out: Finding[] = []
  for (const group of groups.values()) {
    // Report the worst instance, so merging never downgrades a real problem.
    const first = [...group].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))[0]
    if (group.length === 1) {
      out.push(first)
      continue
    }
    const urls = [...new Set(group.map((f) => f.pageUrl))]
    out.push({
      ...first,
      affectedPages: urls.length,
      effort: first.effort ?? guessEffort(first),
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
  return out.map((f) => ({ ...f, effort: f.effort ?? guessEffort(f) }))
}

/**
 * Cluster raw colour values into design "decisions".
 * Same hue with nearby alphas (0.4 / 0.42 / 0.48 / 0.55) → one decision.
 */
export function clusterColourDecisions(values: string[]): { label: string; members: string[] }[] {
  type Bucket = { h: number; s: number; l: number; members: string[]; alphas: number[] }
  const buckets: Bucket[] = []
  for (const v of values) {
    const p = parseColor(v)
    if (!p) {
      buckets.push({ h: -1, s: 0, l: 0, members: [v], alphas: [1] })
      continue
    }
    // Approximate HSL from RGB for clustering.
    const r = p.r / 255
    const g = p.g / 255
    const b = p.b / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    const d = max - min
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
    let h = 0
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6
      else if (max === g) h = (b - r) / d + 2
      else h = (r - g) / d + 4
      h *= 60
      if (h < 0) h += 360
    }
    const hit = buckets.find(
      (bk) =>
        bk.h >= 0 &&
        Math.abs(bk.h - h) < 18 &&
        Math.abs(bk.s - s) < 0.18 &&
        Math.abs(bk.l - l) < 0.12
    )
    if (hit) {
      hit.members.push(v)
      hit.alphas.push(p.alpha)
    } else {
      buckets.push({ h, s, l, members: [v], alphas: [p.alpha] })
    }
  }
  return buckets.map((bk) => ({
    label:
      bk.members.length > 1
        ? `${bk.members[0]} (+${bk.members.length - 1} alpha/near)`
        : bk.members[0],
    members: bk.members
  }))
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

/**
 * Penalty a category can absorb before it reads as zero.
 *
 * These were tuned when a run produced ~20 findings. With the interaction probe,
 * authored-CSS analysis and a per-section AI critique all contributing, a real
 * product now produces 200+, which pinned seven of eight categories at exactly
 * 0 — the same score for "needs work" and "catastrophic". Budgets are larger,
 * and the curve below is sub-linear so the scale keeps resolving differences at
 * the bad end instead of saturating.
 */
const CATEGORY_BUDGET: Record<Category, number> = {
  coherence: 150,
  variety: 80,
  accessibility: 160,
  responsive: 110,
  flow: 140,
  performance: 90,
  content: 70,
  craft: 90
}

export function scoreRun(findings: Finding[], pageCount: number, brutality: RunConfig['brutality'], lighthouseScores?: { performance?: number | null }): Scorecard {
  const multiplier = brutality === 'ruthless' ? 1.35 : brutality === 'harsh' ? 1.0 : 0.75
  const categories = {} as Scorecard['categories']
  const cats: Category[] = ['coherence', 'variety', 'accessibility', 'responsive', 'flow', 'performance', 'content', 'craft']
  // Effort no longer shapes the grade (kept only for ordering in sortFindingsForBrief)
  for (const c of cats) {
    const list = findings.filter((f) => f.category === c)
    const penalty =
      list.reduce((s, f) => {
        const reach = Math.min(2, 1 + Math.log10(Math.max(1, f.affectedPages ?? 1)))
        return s + SEVERITY_WEIGHT[f.severity] * reach
      }, 0) * multiplier
    const budget = CATEGORY_BUDGET[c] * Math.max(1, pageCount * 0.5)
    const ratio = penalty / budget
    let score = Math.max(2, Math.round(100 * Math.exp(-ratio)))
    // Blend Lighthouse performance into performance category when available
    if (c === 'performance' && lighthouseScores?.performance != null) {
      const lh = Math.round(lighthouseScores.performance * 100)
      // 50/50 blend: heuristic score and Lighthouse score
      score = Math.round(score * 0.5 + lh * 0.5)
    }
    categories[c] = { score, findings: list.length }
  }

  const weights: Record<Category, number> = {
    coherence: 0.14,
    accessibility: 0.22,
    flow: 0.13,
    responsive: 0.11,
    variety: 0.07,
    performance: 0.20,
    craft: 0.08,
    content: 0.05
  }
  let overall = 0
  for (const c of cats) overall += categories[c].score * weights[c]
  // A weighted average lets seven healthy categories hide one broken one, which
  // is how a product with zero keyboard access scored a B. You cannot be good
  // overall while a category is on the floor, so the worst category caps it.
  const worstScore = Math.min(...cats.map((c) => categories[c].score))
  overall = Math.round(Math.min(overall, worstScore + 25))

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

/** Order for “Start here”: easy wins with reach before redesigns. */
export function sortFindingsForBrief(findings: Finding[]): Finding[] {
  const sev: Severity[] = ['blocker', 'critical', 'major', 'minor', 'nit']
  const effortRank: Record<FindingEffort, number> = { 'one-line': 0, component: 1, redesign: 2 }
  return [...findings].sort((a, b) => {
    const ea = effortRank[a.effort ?? guessEffort(a)]
    const eb = effortRank[b.effort ?? guessEffort(b)]
    if (ea !== eb) return ea - eb
    const sa = sev.indexOf(a.severity)
    const sb = sev.indexOf(b.severity)
    if (sa !== sb) return sa - sb
    return (b.affectedPages ?? 1) - (a.affectedPages ?? 1)
  })
}

function findingShape(f: Finding): string {
  let path = f.pageUrl
  try {
    path = new URL(f.pageUrl).pathname
  } catch {}
  return [f.category, path, f.title.replace(/\d+(\.\d+)?%?/g, '#'), f.selector ?? ''].join('|')
}

/** Attach new/fixed/regressed vs a prior run's findings. */
export function diffFindingsAgainstPrior(current: Finding[], prior: Finding[]): Finding[] {
  const priorShapes = new Set(prior.map(findingShape))
  const out = current.map((f) => ({
    ...f,
    delta: (priorShapes.has(findingShape(f)) ? 'unchanged' : 'new') as Finding['delta']
  }))
  return out
}

export function fixedFindingsSincePrior(current: Finding[], prior: Finding[]): Finding[] {
  const currentShapes = new Set(current.map(findingShape))
  return prior
    .filter((f) => !currentShapes.has(findingShape(f)))
    .map((f) => ({ ...f, delta: 'fixed' as const }))
}
