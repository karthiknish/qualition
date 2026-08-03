/**
 * Component-level theme application + brand awareness across the crawl.
 *
 * Uses per-control theme samples from the DOM extractor to catch:
 *   - the same component kind using inconsistent radii / fonts / accents
 *   - pages that abandon the dominant brand fonts and accent colours
 */
import type { CapturedPage, Finding, RunConfig, Severity } from '../../shared/types.js'
import { deltaE, parseColor } from './audit.js'

let brandCounter = 0
function nextBrandId(): string {
  return `brand-${++brandCounter}`
}

export interface ComponentThemeSample {
  kind: string
  tag: string
  text: string
  bg: string
  color: string
  borderRadius: string
  fontFamily: string
  fontSize: string
  fontWeight: string
  borderColor: string
}

export interface BrandProfile {
  fonts: string[]
  radii: string[]
  /** Non-neutral accents that look like brand / primary action colour. */
  accents: string[]
  contextHints: string[]
  summary: string
}

function samplesOf(page: CapturedPage): ComponentThemeSample[] {
  const raw = (page.signals?.componentTheme ?? []) as ComponentThemeSample[]
  return Array.isArray(raw) ? raw : []
}

function isNeutral(c: string): boolean {
  const p = parseColor(c)
  if (!p || p.alpha < 0.08) return true
  const max = Math.max(p.r, p.g, p.b)
  const min = Math.min(p.r, p.g, p.b)
  // Greys + near-white / near-black
  if (max - min < 18) return true
  if (max > 245 && min > 230) return true
  if (max < 40) return true
  return false
}

function topN(map: Map<string, number>, n: number): string[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k)
}

function bump(map: Map<string, number>, key: string, n = 1): void {
  if (!key) return
  map.set(key, (map.get(key) ?? 0) + n)
}

/** Infer the product's brand language from tokens + component samples + context. */
export function inferBrandProfile(pages: CapturedPage[], productContext = ''): BrandProfile {
  const fonts = new Map<string, number>()
  const radii = new Map<string, number>()
  const accents = new Map<string, number>()

  for (const page of pages) {
    for (const f of page.tokens.fontFamilies) bump(fonts, f.value, f.usage)
    for (const r of page.tokens.radii) bump(radii, r.value, r.usage)
    for (const c of page.tokens.colors) {
      if (c.role === 'bg' && !isNeutral(c.value)) bump(accents, c.value, c.usage)
    }
    for (const s of samplesOf(page)) {
      if (s.fontFamily) bump(fonts, s.fontFamily, 2)
      if (s.borderRadius) bump(radii, s.borderRadius, 2)
      if (s.kind === 'button' && s.bg && !isNeutral(s.bg)) bump(accents, s.bg, 4)
    }
  }

  const contextHints = productContext
    .split(/[,;/|]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
    .slice(0, 8)

  const topFonts = topN(fonts, 3)
  const topRadii = topN(radii, 4)
  const topAccents = topN(accents, 4)
  const summary = [
    topFonts.length ? `brand fonts ${topFonts.join(', ')}` : null,
    topAccents.length ? `accents ${topAccents.join(', ')}` : null,
    topRadii.length ? `radii ${topRadii.join(', ')}` : null,
    contextHints.length ? `context “${contextHints.slice(0, 3).join(', ')}”` : null
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    fonts: topFonts,
    radii: topRadii,
    accents: topAccents,
    contextHints,
    summary: summary || 'insufficient brand signal'
  }
}

function mk(
  page: CapturedPage,
  severity: Severity,
  title: string,
  detail: string,
  fix: string,
  extra: Partial<Finding> = {}
): Finding {
  return {
    id: nextBrandId(),
    category: 'coherence',
    severity,
    title,
    detail,
    fix,
    pageUrl: page.url,
    source: 'heuristic',
    effort: 'component',
    confidence: 'low',
    ...extra
  }
}

function distinct(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function radiusPx(v: string): number | null {
  const m = /^([\d.]+)px/.exec(v)
  return m ? Number(m[1]) : null
}

/** Within-page: same component kind must share theme application. */
export function auditComponentTheme(
  page: CapturedPage,
  brand: BrandProfile,
  config: RunConfig
): Finding[] {
  const out: Finding[] = []
  const samples = samplesOf(page)
  if (samples.length < 3) return out
  const strict = config.brutality === 'ruthless' ? 1 : config.brutality === 'harsh' ? 0.75 : 0.5

  for (const kind of ['button', 'input', 'nav', 'badge', 'card']) {
    const group = samples.filter((s) => s.kind === kind)
    if (group.length < 3) continue

    const radii = distinct(group.map((s) => s.borderRadius))
    const fonts = distinct(group.map((s) => s.fontFamily))
    const threshold = kind === 'button' || kind === 'input' ? 2 : 3

    if (radii.length > threshold) {
      out.push(
        mk(
          page,
          radii.length >= 4 ? 'major' : 'minor',
          `${kind} components use ${radii.length} different radii`,
          `${kind} samples disagree on corner radius: ${radii.slice(0, 6).join(', ')}. A component primitive should resolve to one radius token so the product feels designed, not assembled.`,
          `Define a single ${kind} radius token (brand uses ${brand.radii[0] ?? 'the dominant radius'}) and apply it to every ${kind}.`,
          { sectionId: page.sections.find((s) => s.role === (kind === 'nav' ? 'nav' : 'content'))?.id }
        )
      )
    }

    if (fonts.length > threshold && fonts.length >= 3) {
      out.push(
        mk(
          page,
          'minor',
          `${kind} components mix ${fonts.length} typefaces`,
          `${kind} samples use: ${fonts.slice(0, 5).join(', ')}. Mixing faces inside one control family breaks brand rhythm.`,
          `Bind ${kind} typography to the brand stack (${brand.fonts.slice(0, 2).join(' / ') || 'the primary family'}).`
        )
      )
    }

    if (kind === 'button') {
      const accents = distinct(group.map((s) => s.bg).filter((c) => c && !isNeutral(c)))
      if (accents.length >= 3 + (strict < 1 ? 1 : 0)) {
        // How many are truly far from the brand accent?
        const brandAccent = brand.accents[0]
        const strangers = brandAccent
          ? accents.filter((a) => {
              const d = deltaE(a, brandAccent)
              return d == null || d > 18
            })
          : accents
        if (strangers.length >= 2) {
          out.push(
            mk(
              page,
              'major',
              `Primary actions use ${accents.length} competing accent colours`,
              `Button fills include ${accents.slice(0, 5).join(', ')}. Brand accents elsewhere are ${brand.accents.slice(0, 3).join(', ') || 'unclear'}. Competing CTAs dilute brand recognition.`,
              'Reserve one brand accent for primary actions; map secondary/destructive to explicit semantic tokens.'
            )
          )
        }
      }

      // Buttons vs inputs: large radius mismatch without a documented system.
      const inputs = samples.filter((s) => s.kind === 'input')
      if (inputs.length >= 2 && group.length >= 2 && brand.radii.length) {
        const btnR = radiusPx(group[0].borderRadius)
        const inR = radiusPx(inputs[0].borderRadius)
        if (btnR != null && inR != null && Math.abs(btnR - inR) >= 10) {
          out.push(
            mk(
              page,
              'nit',
              'Button and input radii diverge sharply',
              `Buttons ~${btnR}px vs inputs ~${inR}px. Large gaps between control families read as two design systems on one page.`,
              'Align control radii on one scale (e.g. sm/md/lg) so buttons and fields feel related.'
            )
          )
        }
      }
    }
  }

  // Brand font abandonment on this page
  if (brand.fonts.length && samples.length >= 4) {
    const pageFonts = distinct(samples.map((s) => s.fontFamily))
    const usesBrand = pageFonts.some((f) =>
      brand.fonts.some((b) => f.toLowerCase().includes(b.toLowerCase().split(' ')[0]!) || b.toLowerCase().includes(f.toLowerCase().split(' ')[0]!))
    )
    if (!usesBrand && pageFonts.length) {
      out.push(
        mk(
          page,
          'major',
          'Page controls ignore the project brand typeface',
          `Sampled controls use ${pageFonts.slice(0, 4).join(', ')} while the project brand stack is ${brand.fonts.join(', ')}.`,
          'Apply the brand font tokens to buttons, inputs, and navigation — do not leave chrome on the browser default.'
        )
      )
    }
  }

  return out
}

/** Across pages: brand awareness — fonts, accents, radii must travel with the product. */
export function auditBrandAcrossProject(
  pages: CapturedPage[],
  brand: BrandProfile,
  config: RunConfig
): Finding[] {
  if (pages.length < 2) return []
  const out: Finding[] = []
  const anchor = pages[0]

  type PageSig = { url: string; fonts: string[]; radii: string[]; accents: string[] }
  const sigs: PageSig[] = pages.map((p) => {
    const samples = samplesOf(p)
    const fonts = new Map<string, number>()
    const radii = new Map<string, number>()
    const accents = new Map<string, number>()
    for (const s of samples) {
      bump(fonts, s.fontFamily)
      bump(radii, s.borderRadius)
      if (s.kind === 'button' && s.bg && !isNeutral(s.bg)) bump(accents, s.bg)
    }
    for (const f of p.tokens.fontFamilies.slice(0, 5)) bump(fonts, f.value, f.usage)
    return {
      url: p.url,
      fonts: topN(fonts, 3),
      radii: topN(radii, 3),
      accents: topN(accents, 3)
    }
  })

  const primaryFont = brand.fonts[0]
  const fontDrift = sigs.filter((s) => {
    if (!primaryFont || !s.fonts.length) return false
    const needle = primaryFont.toLowerCase().split(/\s+/)[0]!
    return !s.fonts.some((f) => f.toLowerCase().includes(needle) || needle.includes(f.toLowerCase().split(/\s+/)[0]!))
  })
  if (fontDrift.length >= 1) {
    out.push(
      mk(
        anchor,
        fontDrift.length >= 2 ? 'major' : 'minor',
        `Brand typeface missing on ${fontDrift.length} pages`,
        `Pages without the brand stack (${brand.fonts.join(', ')}): ${fontDrift
          .slice(0, 6)
          .map((s) => {
            try {
              return new URL(s.url).pathname
            } catch {
              return s.url
            }
          })
          .join(', ')}. Brand awareness requires the same families in chrome and content.`,
        'Load brand fonts globally and reference them from shared button/input/nav primitives.'
      )
    )
  }

  if (brand.accents.length) {
    const brandAccent = brand.accents[0]
    const accentDrift = sigs.filter((s) => {
      if (!s.accents.length) return false
      return s.accents.every((a) => {
        const d = deltaE(a, brandAccent)
        return d == null || d > 22
      })
    })
    if (accentDrift.length >= 2 && config.brutality !== 'fair') {
      out.push(
        mk(
          anchor,
          'major',
          `Brand accent does not travel across ${accentDrift.length} pages`,
          `Dominant brand accent ${brandAccent} is absent from primary actions on: ${accentDrift
            .slice(0, 6)
            .map((s) => {
              try {
                return new URL(s.url).pathname
              } catch {
                return s.url
              }
            })
            .join(', ')}. Each page invents its own CTA colour.`,
          'Expose one --brand / --primary token and use it for every primary button and key selected state.'
        )
      )
    }
  }

  // Radius system drift between first and later pages
  const radiusSets = sigs.map((s) => s.radii[0]).filter(Boolean)
  const uniqueRadii = distinct(radiusSets)
  if (uniqueRadii.length >= 3) {
    out.push(
      mk(
        anchor,
        'minor',
        `Corner radius language changes across ${uniqueRadii.length} page treatments`,
        `Dominant control radii by page: ${uniqueRadii.join(', ')}. Brand systems usually keep one radius family site-wide.`,
        `Pick the brand radius (${brand.radii[0] ?? uniqueRadii[0]}) and apply it through shared primitives.`
      )
    )
  }

  return out
}
