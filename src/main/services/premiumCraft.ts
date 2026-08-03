/**
 * Premium craft heuristics — Linear / Stripe bar for visual quality.
 *
 * Deterministic scores from measured `signals.premium` (and light fallbacks).
 * Complements AI critique dimensional scores; does not invent aesthetics.
 */
import type { CapturedPage, Finding, Severity } from '../../shared/types.js'
import { isKitSpecimenPath } from './brokenUi.js'

export interface PremiumSignals {
  bodyFontSizePx: number
  bodyLineHeight: number
  uniqueFontSizes: number
  fontSizesOff4pxLadder: number
  uniqueFontWeights: number
  headingMaxSizePx: number
  hierarchySizeDeltaPx: number
  headingBodyWeightContrast: boolean
  avgTextDensity: number
  contentAreaRatio: number
  avgCardPaddingPx: number
  uniqueCardShadows: number
  uniqueIconSizes: number
  iconSizeVariance: number
  harshControlBorders: number
  uniqueBorderWidths: number
  crampedSiblingGaps: number
}

export type PremiumDimension =
  | 'hierarchy'
  | 'typography'
  | 'spacing'
  | 'density'
  | 'elevation'
  | 'consistency'
  | 'distinctiveness'

export type PremiumDimensionScores = Record<PremiumDimension, number>

export interface PremiumCraftSummary {
  score: number
  grade: string
  dimensions: PremiumDimensionScores
  pageCount: number
  aiBlend?: boolean
}

let counter = 0
function mk(
  page: CapturedPage,
  severity: Severity,
  title: string,
  detail: string,
  fix: string,
  extra: Partial<Finding> = {}
): Finding {
  return {
    id: `prem${++counter}`,
    category: 'craft',
    severity,
    title,
    detail,
    fix,
    pageUrl: page.url,
    source: 'heuristic',
    effort: 'component',
    confidence: 'high',
    ...extra
  }
}

export function premiumFromSignals(page: CapturedPage): PremiumSignals | null {
  const raw = (page.signals as { premium?: PremiumSignals } | undefined)?.premium
  return raw ?? null
}

/** Heuristic craft findings for a single page. */
export function auditPremiumCraft(page: CapturedPage): Finding[] {
  const p = premiumFromSignals(page)
  if (!p) return []
  const out: Finding[] = []

  if (p.bodyFontSizePx > 0 && p.bodyFontSizePx < 14) {
    out.push(
      mk(
        page,
        'major',
        `Body text is ${p.bodyFontSizePx}px — below premium readability`,
        'S-tier product UIs keep body copy at 14–16px+. Sub-14px body reads unfinished and strains scanning.',
        'Raise the body token to at least 14px (prefer 15–16px) and reflow dense tables with secondary 12px meta only.'
      )
    )
  }

  if (p.bodyLineHeight > 0 && p.bodyLineHeight < 1.35 && p.bodyFontSizePx >= 14) {
    out.push(
      mk(
        page,
        'minor',
        `Body line-height ${p.bodyLineHeight} is cramped`,
        'Premium body leading sits around 1.45–1.7. Tight leading makes dense product copy feel cheap.',
        'Set body line-height to ~1.5 (or a matching design token) and keep captions slightly tighter if needed.'
      )
    )
  }

  if (p.uniqueFontSizes > 8) {
    out.push(
      mk(
        page,
        'major',
        `${p.uniqueFontSizes} distinct font sizes on one page`,
        'A premium type scale is 6–8 steps. More sizes read as ad-hoc CSS, not a system.',
        'Collapse to a documented scale (e.g. 12/14/16/20/24/32) and ban one-off sizes.'
      )
    )
  } else if (p.fontSizesOff4pxLadder >= 3) {
    out.push(
      mk(
        page,
        'minor',
        `${p.fontSizesOff4pxLadder} odd-pixel font sizes off the type ladder`,
        'Orphan sizes (13, 15, 17…) break optical rhythm and fight the 4/8 grid.',
        'Snap every size to the type scale; prefer even steps.'
      )
    )
  }

  if (p.headingMaxSizePx > 0 && p.hierarchySizeDeltaPx < 4 && p.uniqueFontSizes >= 2) {
    out.push(
      mk(
        page,
        'major',
        'Flat typographic hierarchy — heading barely larger than body',
        `Heading max ${p.headingMaxSizePx}px vs body ${p.bodyFontSizePx}px (Δ ${p.hierarchySizeDeltaPx}px). Premium UIs make the primary title unmistakable.`,
        'Increase page/section titles by at least 6–8px (and usually weight) over body.'
      )
    )
  }

  if (p.uniqueFontWeights > 4) {
    out.push(
      mk(
        page,
        'major',
        `${p.uniqueFontWeights} font weights in use`,
        'Premium systems use 3–4 weights (e.g. 400/500/600/700). More weights look uncoordinated.',
        'Pick Regular, Medium, SemiBold, Bold — drop the rest.'
      )
    )
  } else if (p.headingMaxSizePx > 0 && !p.headingBodyWeightContrast && p.hierarchySizeDeltaPx < 8) {
    out.push(
      mk(
        page,
        'minor',
        'Headings lack weight contrast against body',
        'Size alone is a weak hierarchy when weight stays flat. Premium craft stacks size + weight.',
        'Bump headings to SemiBold/Bold while body stays Regular/Medium.'
      )
    )
  }

  if (p.avgTextDensity >= 2.2 && p.avgCardPaddingPx > 0 && p.avgCardPaddingPx < 12) {
    out.push(
      mk(
        page,
        'major',
        'Cramped density — high text load with tight card padding',
        `Avg text density ${p.avgTextDensity}, card padding ~${p.avgCardPaddingPx}px. Premium product UIs give content breathing room.`,
        'Raise card/panel padding to 16–24px and loosen row gaps on the densest bands.'
      )
    )
  } else if (p.contentAreaRatio > 0.85 && p.avgCardPaddingPx > 0 && p.avgCardPaddingPx < 10) {
    out.push(
      mk(
        page,
        'major',
        'Wall-to-wall content with almost no inset',
        `Content fills ${(p.contentAreaRatio * 100).toFixed(0)}% of main with ~${p.avgCardPaddingPx}px padding — reads as unfinished packing.`,
        'Inset primary surfaces and separate bands with a consistent 16–32px rhythm.'
      )
    )
  }

  if (p.uniqueCardShadows > 4) {
    out.push(
      mk(
        page,
        'major',
        `${p.uniqueCardShadows} distinct card elevations`,
        'Premium elevation is 1–3 semantic layers (flat / raised / overlay). Shadow soup kills coherence.',
        'Define two shadow tokens (and maybe a dialog layer) and delete the rest.'
      )
    )
  }

  if (p.iconSizeVariance >= 4 && p.uniqueIconSizes >= 4) {
    out.push(
      mk(
        page,
        'minor',
        `Inconsistent icon sizes (σ ${p.iconSizeVariance}px across ${p.uniqueIconSizes} sizes)`,
        'Mixed icon boxes look hand-rolled. Premium UI keeps icons on 1–2 sizes per context (nav vs inline).',
        'Standardise nav icons (e.g. 16 or 20) and inline icons (14–16); stop mixing freely.'
      )
    )
  }

  if (p.harshControlBorders >= 2) {
    out.push(
      mk(
        page,
        'major',
        `${p.harshControlBorders} control(s) use a harsh thick dark border`,
        'Thick near-black borders on inputs/buttons read as a pressed/focus mistake, not premium chrome.',
        'Use a soft 1px neutral border at rest and a :focus-visible offset ring — never a 2–3px black border as the default or active look.'
      )
    )
  }

  if (p.uniqueBorderWidths >= 5) {
    out.push(
      mk(
        page,
        'minor',
        `${p.uniqueBorderWidths} distinct border widths on controls/cards`,
        'Too many stroke weights fight the radius/elevation system.',
        'Standardise on one hairline (1px) plus one emphasis stroke if needed.'
      )
    )
  }

  if (p.crampedSiblingGaps >= 4) {
    out.push(
      mk(
        page,
        'minor',
        'Uneven vertical rhythm between major bands',
        `${p.crampedSiblingGaps} neighbouring section gaps drift off the dominant spacing — premium layouts keep a steady cadence.`,
        'Pick one section gap token (24/32/48) and apply it between primary bands.'
      )
    )
  }

  return out
}

/**
 * Deterministic 0–100 craft score for one page from signals.
 * Starts at 100 and subtracts for each defect class.
 */
export function premiumCraftScore(page: CapturedPage): number {
  const p = premiumFromSignals(page)
  if (!p) {
    // Soft fallback from tokens when older captures lack signals.premium
    const sizes = page.tokens.fontSizes?.length ?? 0
    let score = 78
    if (sizes > 9) score -= 12
    if ((page.tokens.shadows?.length ?? 0) > 5) score -= 10
    return Math.max(20, Math.min(100, score))
  }
  let score = 100
  if (p.bodyFontSizePx > 0 && p.bodyFontSizePx < 14) score -= 18
  if (p.bodyLineHeight > 0 && p.bodyLineHeight < 1.35) score -= 6
  if (p.uniqueFontSizes > 8) score -= 14
  else if (p.uniqueFontSizes > 6) score -= 6
  if (p.fontSizesOff4pxLadder >= 3) score -= 5
  if (p.headingMaxSizePx > 0 && p.hierarchySizeDeltaPx < 4) score -= 16
  else if (p.hierarchySizeDeltaPx < 6) score -= 6
  if (p.uniqueFontWeights > 4) score -= 10
  else if (!p.headingBodyWeightContrast && p.hierarchySizeDeltaPx < 8) score -= 4
  if (p.avgTextDensity >= 2.2 && p.avgCardPaddingPx > 0 && p.avgCardPaddingPx < 12) score -= 14
  if (p.contentAreaRatio > 0.85 && p.avgCardPaddingPx > 0 && p.avgCardPaddingPx < 10) score -= 10
  if (p.uniqueCardShadows > 4) score -= 12
  else if (p.uniqueCardShadows > 3) score -= 5
  if (p.iconSizeVariance >= 4 && p.uniqueIconSizes >= 4) score -= 5
  if (p.harshControlBorders >= 2) score -= 14
  else if (p.harshControlBorders >= 1) score -= 6
  if (p.uniqueBorderWidths >= 5) score -= 4
  if (p.crampedSiblingGaps >= 4) score -= 5
  return Math.max(12, Math.min(100, Math.round(score)))
}

/** Map a page score into 0–4 dimension estimates for the report. */
export function premiumDimensionsFromPage(page: CapturedPage): PremiumDimensionScores {
  const p = premiumFromSignals(page)
  const clamp4 = (n: number): number => Math.max(0, Math.min(4, Math.round(n)))
  if (!p) {
    const s = premiumCraftScore(page) / 25
    const v = clamp4(s)
    return {
      hierarchy: v,
      typography: v,
      spacing: v,
      density: v,
      elevation: v,
      consistency: v,
      distinctiveness: v
    }
  }
  return {
    hierarchy: clamp4(
      4 -
        (p.hierarchySizeDeltaPx < 4 ? 2 : p.hierarchySizeDeltaPx < 6 ? 1 : 0) -
        (!p.headingBodyWeightContrast ? 0.5 : 0)
    ),
    typography: clamp4(
      4 -
        (p.bodyFontSizePx < 14 ? 1.5 : 0) -
        (p.uniqueFontSizes > 8 ? 1.5 : p.uniqueFontSizes > 6 ? 0.5 : 0) -
        (p.bodyLineHeight < 1.35 ? 0.5 : 0)
    ),
    spacing: clamp4(
      4 - (p.crampedSiblingGaps >= 4 ? 1 : 0) - (p.avgCardPaddingPx > 0 && p.avgCardPaddingPx < 12 ? 1 : 0)
    ),
    density: clamp4(
      4 -
        (p.avgTextDensity >= 2.2 && p.avgCardPaddingPx < 12 ? 1.5 : 0) -
        (p.contentAreaRatio > 0.85 ? 1 : 0)
    ),
    elevation: clamp4(4 - (p.uniqueCardShadows > 4 ? 2 : p.uniqueCardShadows > 3 ? 1 : 0)),
    consistency: clamp4(
      4 -
        (p.uniqueFontWeights > 4 ? 1 : 0) -
        (p.iconSizeVariance >= 4 ? 0.5 : 0) -
        (p.uniqueBorderWidths >= 5 ? 0.5 : 0) -
        (p.harshControlBorders >= 2 ? 1 : 0)
    ),
    distinctiveness: clamp4(premiumCraftScore(page) / 25)
  }
}

function gradeOf(score: number): string {
  return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : score >= 45 ? 'E' : 'F'
}

/**
 * Average premium craft across product pages (excludes kit/specimen routes).
 * Optionally blend AI dimension scores (0–4) at 30% when provided.
 */
export function summarizePremiumCraft(
  pages: CapturedPage[],
  aiDimensions?: Partial<PremiumDimensionScores> | null
): PremiumCraftSummary {
  const product = pages.filter((p) => p.ok && !isKitSpecimenPath(p.url))
  const sample = product.length ? product : pages.filter((p) => p.ok)
  if (!sample.length) {
    return {
      score: 0,
      grade: 'F',
      dimensions: {
        hierarchy: 0,
        typography: 0,
        spacing: 0,
        density: 0,
        elevation: 0,
        consistency: 0,
        distinctiveness: 0
      },
      pageCount: 0
    }
  }

  const heurScore =
    sample.reduce((s, p) => s + premiumCraftScore(p), 0) / sample.length
  const dimAcc: PremiumDimensionScores = {
    hierarchy: 0,
    typography: 0,
    spacing: 0,
    density: 0,
    elevation: 0,
    consistency: 0,
    distinctiveness: 0
  }
  for (const page of sample) {
    const d = premiumDimensionsFromPage(page)
    for (const k of Object.keys(dimAcc) as PremiumDimension[]) dimAcc[k] += d[k]
  }
  for (const k of Object.keys(dimAcc) as PremiumDimension[]) {
    dimAcc[k] = Math.round((dimAcc[k] / sample.length) * 10) / 10
  }

  let score = heurScore
  let aiBlend = false
  if (aiDimensions) {
    const keys = Object.keys(dimAcc) as PremiumDimension[]
    const aiVals = keys.map((k) => aiDimensions[k]).filter((n): n is number => typeof n === 'number')
    if (aiVals.length >= 4) {
      const aiAvg = (aiVals.reduce((s, n) => s + n, 0) / aiVals.length) * 25
      score = heurScore * 0.7 + aiAvg * 0.3
      aiBlend = true
      for (const k of keys) {
        const ai = aiDimensions[k]
        if (typeof ai === 'number') dimAcc[k] = Math.round((dimAcc[k] * 0.7 + ai * 0.3) * 10) / 10
      }
    }
  }

  const rounded = Math.round(Math.max(0, Math.min(100, score)))
  return {
    score: rounded,
    grade: gradeOf(rounded),
    dimensions: dimAcc,
    pageCount: sample.length,
    aiBlend: aiBlend || undefined
  }
}

/** Turn weak AI dimension scores into craft findings (skip if heuristic already covers). */
export function findingsFromAiPremiumScores(
  page: CapturedPage,
  scores: Partial<PremiumDimensionScores>,
  existingTitles: string[]
): Finding[] {
  const out: Finding[] = []
  const blob = existingTitles.join(' ').toLowerCase()
  const labels: Record<PremiumDimension, string> = {
    hierarchy: 'visual hierarchy',
    typography: 'typography',
    spacing: 'spacing rhythm',
    density: 'information density',
    elevation: 'elevation language',
    consistency: 'visual consistency',
    distinctiveness: 'distinctiveness'
  }
  for (const [key, score] of Object.entries(scores) as [PremiumDimension, number][]) {
    if (typeof score !== 'number' || score >= 2) continue
    const label = labels[key]
    if (blob.includes(label.split(' ')[0]!)) continue
    out.push(
      mk(
        page,
        score < 1 ? 'major' : 'minor',
        `Premium ${label} scores ${score}/4`,
        `AI craft rubric rated ${label} below the Linear/Stripe bar. Confirm against the screenshot before rewriting.`,
        `Raise ${label}: clearer primary focal, tighter system tokens, and less competing chrome.`,
        { source: 'ai', confidence: 'low' }
      )
    )
  }
  return out
}
