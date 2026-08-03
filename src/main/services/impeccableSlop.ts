/**
 * Impeccable-inspired AI-slop detector (https://impeccable.style/slop).
 *
 * Deterministic tells from measured tokens/signals — not a full 59-rule CLI
 * port, but the highest-signal patterns that show up in audited product UIs.
 */
import { parse as parseCssColor, converter } from 'culori'
import type { CapturedPage, Finding, Severity } from '../../shared/types.js'

const toRgb = converter('rgb')
const OVERUSED_FONTS =
  /^(inter|roboto|geist|geist mono|plus jakarta sans|space grotesk|arial|system-ui|ui-sans-serif)$/i

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
    id: `slop${++counter}`,
    category: 'craft',
    severity,
    title,
    detail,
    fix,
    pageUrl: page.url,
    source: 'heuristic',
    effort: 'component',
    ...extra
  }
}

function rgbOf(c: string): { r: number; g: number; b: number; alpha: number } | null {
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

function isPurpleish(c: string): boolean {
  const rgb = rgbOf(c)
  if (!rgb || rgb.alpha < 0.4) return false
  const { r, g, b } = rgb
  // Violet / purple: blue+red dominate green, not near grey.
  return b > 120 && r > 80 && r > g + 20 && b > g + 30 && Math.abs(r - b) < 100
}

function isCyanOnDark(fg: string, bg: string): boolean {
  const f = rgbOf(fg)
  const b = rgbOf(bg)
  if (!f || !b || f.alpha < 0.4 || b.alpha < 0.4) return false
  const bgLum = (b.r + b.g + b.b) / 3
  const cyan = f.g > 140 && f.b > 140 && f.r < 120
  return bgLum < 60 && cyan
}

function isCreamBeige(c: string): boolean {
  const rgb = rgbOf(c)
  if (!rgb || rgb.alpha < 0.4) return false
  const { r, g, b } = rgb
  const lum = (r + g + b) / 3
  // Warm off-white / beige: high luminance, red ≥ green > blue, not pure white.
  return lum > 220 && lum < 248 && r >= g && g > b + 8 && r - b > 12
}

function isGlowShadow(shadow: string): boolean {
  // Colored halo (non-black/grey blur) or neon-ish glow language.
  if (/0px\s+0px\s+\d+px/.test(shadow) && /rgba?\([^)]*\)|#(?:[0-9a-f]{3}){1,2}/i.test(shadow)) {
    if (/rgba?\(\s*0\s*,\s*0\s*,\s*0/i.test(shadow)) return false
    if (/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0?\.?[0-2]\d*\s*\)/i.test(shadow) && /0,\s*0,\s*0/.test(shadow))
      return false
    return /rgba?\(\s*([1-9]\d*)\s*,\s*([1-9]\d*)\s*,\s*([1-9]\d*)/i.test(shadow) || /#[0-9a-f]{3,8}/i.test(shadow)
  }
  return false
}

/**
 * Audit one page for Impeccable-class AI design tells.
 * @see https://impeccable.style/slop
 */
export function auditImpeccableSlop(page: CapturedPage): Finding[] {
  const out: Finding[] = []
  const t = page.tokens
  const signals = (page as { signals?: Record<string, unknown> }).signals ?? {}
  const slop = (signals.slop ?? {}) as {
    gradientBackgrounds?: number
    gradientTexts?: number
    bounceTransitions?: number
    pulsingDots?: number
    sideTabBorders?: number
    nestedCards?: number
    iconTileHeadings?: number
    heroEyebrowChips?: number
  }

  const fonts = t.fontFamilies.map((f) => f.value)
  const overused = fonts.filter((f) => OVERUSED_FONTS.test(f.split(',')[0].trim()))
  if (overused.length && overused[0] === fonts[0]) {
    out.push(
      mk(
        page,
        'major',
        `Overused font “${overused[0]}” dominates the UI`,
        'Inter / Roboto / Geist / Plus Jakarta / Space Grotesk are the default AI type stack — they no longer feel intentional.',
        'Pick a distinctive face (or a deliberate pairing) that matches the product voice. See impeccable.style/slop · overused-font.',
        { evidence: fonts.slice(0, 4) }
      )
    )
  }

  const bgs = t.colors.filter((c) => c.role === 'bg')
  const texts = t.colors.filter((c) => c.role === 'text')
  const purpleHits = bgs.filter((c) => isPurpleish(c.value))
  if (purpleHits.length >= 2 || (purpleHits[0] && purpleHits[0].usage >= 8)) {
    out.push(
      mk(
        page,
        'major',
        'AI purple / violet palette',
        `Purple-violet surfaces show up ${purpleHits.reduce((s, c) => s + c.usage, 0)}× — the most recognizable AI-generated colour tell.`,
        'Choose a distinctive, intentional palette. Ban purple-to-blue gradients as decoration. See impeccable.style/slop · ai-color-palette.',
        { evidence: purpleHits.slice(0, 3).map((c) => c.value) }
      )
    )
  }

  const creamHits = bgs.filter((c) => isCreamBeige(c.value))
  if (creamHits.some((c) => c.usage >= 10)) {
    out.push(
      mk(
        page,
        'minor',
        'Cream / beige default surface',
        'Warm cream page backgrounds have become the safe AI “tasteful” default.',
        'Pick a background from a deliberate brand palette, not #F4F1EA-adjacent beige. See impeccable.style/slop · cream-palette.',
        { evidence: creamHits.slice(0, 2).map((c) => c.value) }
      )
    )
  }

  for (const bg of bgs.slice(0, 6)) {
    for (const fg of texts.slice(0, 6)) {
      if (isCyanOnDark(fg.value, bg.value)) {
        out.push(
          mk(
            page,
            'minor',
            'Cyan-on-dark AI accent pairing',
            `Text ${fg.value} on dark ${bg.value} matches the stock “AI SaaS dark mode” look.`,
            'Use brand accents with intentional contrast, not cyan neon on charcoal.',
            { evidence: [fg.value, bg.value] }
          )
        )
        break
      }
    }
  }

  const glow = t.shadows.filter((s) => isGlowShadow(s.value))
  if (glow.length >= 1 && glow.some((s) => s.usage >= 2)) {
    out.push(
      mk(
        page,
        'major',
        'Glowing chromatic shadows',
        'Colored glow / halo shadows are a default AI “cool dark UI” tell.',
        'Use neutral elevation shadows; reserve colour for intentional light, not decoration. See impeccable.style/slop · dark-glow.',
        { evidence: glow.slice(0, 3).map((s) => s.value) }
      )
    )
  }

  const bounce = t.transitions.filter((tr) => /cubic-bezier\([^)]+\)|bounce|elastic|back/i.test(tr.value))
  if ((slop.bounceTransitions ?? 0) >= 1 || bounce.length >= 2) {
    out.push(
      mk(
        page,
        'minor',
        'Bounce / elastic motion',
        'Bounce and elastic easing feel dated and tacky in product UI.',
        'Use ease-out-quart/quint/expo. See impeccable.style/slop · bounce-easing.'
      )
    )
  }

  if ((slop.gradientTexts ?? 0) >= 1) {
    out.push(
      mk(
        page,
        'major',
        'Gradient text',
        `${slop.gradientTexts} text node(s) use gradient fills — decorative AI tell on headings/metrics.`,
        'Use solid colours for text. See impeccable.style/slop · gradient-text.'
      )
    )
  }

  if ((slop.gradientBackgrounds ?? 0) >= 3) {
    out.push(
      mk(
        page,
        'minor',
        'Decorative gradient backgrounds',
        `${slop.gradientBackgrounds} gradient background wash(es) — often paired with purple orbs / radial halos.`,
        'Ground surfaces with solid or subtly shifted brand colour. See impeccable.style/slop · radial-halo / ai-color-palette.'
      )
    )
  }

  if ((slop.sideTabBorders ?? 0) >= 1) {
    out.push(
      mk(
        page,
        'major',
        'Side colour accents on cards / sections',
        `${slop.sideTabBorders} card, section, or list item(s) use a thick coloured border on one side — the classic AI “side-tab” tell. Do not add side colour stripes to cards, panels, or sections.`,
        'Remove the one-sided accent border. Signal status with a badge, icon, or text — not a coloured left/right edge. See impeccable.style/slop · side-tab.',
        { effort: 'one-line' }
      )
    )
  }

  if ((slop.nestedCards ?? 0) >= 3) {
    out.push(
      mk(
        page,
        'major',
        'Nested cards',
        `${slop.nestedCards} card-in-card nesting(s) — visual noise and fake depth.`,
        'Flatten: spacing, type, and dividers instead of nested containers. See impeccable.style/slop · nested-cards.'
      )
    )
  }

  if ((slop.iconTileHeadings ?? 0) >= 3) {
    out.push(
      mk(
        page,
        'minor',
        'Icon-tile feature stack',
        `${slop.iconTileHeadings} rounded icon tile(s) stacked above headings — universal AI feature-card template.`,
        'Try side-by-side icon + heading, or drop the tile container. See impeccable.style/slop · icon-tile-stack.'
      )
    )
  }

  if ((slop.heroEyebrowChips ?? 0) >= 1) {
    out.push(
      mk(
        page,
        'minor',
        'Hero eyebrow / pill chip',
        'Tiny uppercase tracked label (or pill) above a large hero headline is the default AI SaaS hero.',
        'Drop the eyebrow, fold it into the headline, or use a real breadcrumb. See impeccable.style/slop · hero-eyebrow-chip.'
      )
    )
  }

  if ((slop.pulsingDots ?? 0) >= 2) {
    out.push(
      mk(
        page,
        'nit',
        'Decorative pulsing status dots',
        `${slop.pulsingDots} pulsing dot(s) — often fake liveness.`,
        'Pulse only for genuinely live data; otherwise use a static labeled indicator. See impeccable.style/slop · pulsing-dot.'
      )
    )
  }

  // Pill-everything: too many full radii.
  const fullRadii = t.radii.filter((r) => r.value === 'full' || parseFloat(r.value) >= 999)
  const totalRadiusUsage = t.radii.reduce((s, r) => s + r.usage, 0) || 1
  const fullUsage = fullRadii.reduce((s, r) => s + r.usage, 0)
  if (fullUsage / totalRadiusUsage > 0.45 && fullUsage >= 12) {
    out.push(
      mk(
        page,
        'nit',
        'Pill radius overuse',
        `${fullUsage} elements use full/pill radius — common AI over-rounding.`,
        'Reserve pills for true chips/tags; use a tighter radius language for cards and controls.'
      )
    )
  }

  return out
}

/** One-line block for AI critic prompts. */
export const IMPECCABLE_SLOP_GUIDANCE = `AI-SLOP BAN LIST (impeccable.style): refuse purple/violet gradients, cyan-on-dark neon, cream/beige default surfaces, Inter/Geist/Roboto as the whole personality, gradient text, side colour accents on cards/sections/list items (no coloured left/right edge stripes), nested cards, icon-tile-above-heading feature grids, hero eyebrow pills, bounce/elastic easing, colored glow shadows, decorative pulsing dots. Prefer distinctive type, intentional palette, flat hierarchy via spacing/type — not fake depth.`
