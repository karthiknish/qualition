/**
 * Authored-CSS analysis.
 *
 * DOM sampling tells you what the page *renders*; this tells you what the team
 * actually *wrote*. Powered by @projectwallace/css-analyzer (200+ metrics, the
 * engine behind Project Wallace) and @projectwallace/css-code-quality.
 *
 * This is where design-system rot shows up before it is visible: uniqueness
 * ratios, !important density, ID selectors, specificity outliers, z-index
 * sprawl, browser hacks, and custom properties that are defined but never used.
 */
import { analyze } from '@projectwallace/css-analyzer'
import { calculate } from '@projectwallace/css-code-quality'
import { formatLocations, locateCssIssues } from './cssLocations.js'
import type {
  CapturedPage,
  Category,
  CssStats,
  Finding,
  RunConfig,
  Severity
} from '../../shared/types.js'

export type { CssStats }

let seq = 0
function mk(
  page: CapturedPage,
  category: Category,
  severity: Severity,
  title: string,
  detail: string,
  fix: string
): Finding {
  return {
    id: `c${++seq}`,
    category,
    severity,
    title,
    detail,
    fix,
    pageUrl: page.url,
    source: 'heuristic'
  }
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

export function analyzeCss(css: string, sheets: number): CssStats | null {
  if (!css || css.length < 40) return null
  let a: any
  try {
    a = analyze(css)
  } catch {
    return null
  }
  let quality = { performance: 100, maintainability: 100, complexity: 100 }
  let qualityViolations: CssStats['qualityViolations'] = []
  try {
    const q = calculate(css)
    quality = {
      performance: num(q.performance?.score, 100),
      maintainability: num(q.maintainability?.score, 100),
      complexity: num(q.complexity?.score, 100)
    }
    qualityViolations = (q.violations ?? []).map((v: any) => ({
      id: String(v.id ?? 'unknown'),
      score: num(v.score, 0),
      value: v.value
    }))
  } catch {
    /* quality scoring is optional */
  }

  const custom = a.properties?.custom ?? {}
  const zi = a.values?.zindexes ?? {}
  const zValues = Object.keys(zi.unique ?? {})
    .map((z) => parseInt(z, 10))
    .filter((n) => Number.isFinite(n))

  return {
    bytes: num(a.stylesheet?.size),
    sheets,
    rules: num(a.rules?.total),
    selectors: num(a.selectors?.total),
    maxSpecificity: (a.selectors?.specificity?.max ?? []).join(','),
    importantRatio: num(a.declarations?.importants?.ratio),
    idSelectorRatio: num(a.selectors?.id?.ratio),
    colorsTotal: num(a.values?.colors?.total),
    colorsUnique: num(a.values?.colors?.totalUnique),
    colorUniquenessRatio: num(a.values?.colors?.uniquenessRatio),
    fontSizesUnique: num(a.values?.fontSizes?.totalUnique),
    fontFamiliesUnique: num(a.values?.fontFamilies?.totalUnique),
    radiiUnique: num(a.values?.borderRadiuses?.totalUnique),
    shadowsUnique: num(a.values?.boxShadows?.totalUnique),
    zIndexUnique: num(zi.totalUnique),
    zIndexMax: zValues.length ? Math.max(...zValues) : 0,
    browserhacks: num(a.values?.browserhacks?.total) + num(a.selectors?.browserhacks?.total),
    vendorPrefixed: num(a.values?.prefixes?.total) + num(a.properties?.prefixed?.total),
    customPropsDefined: num(custom.total),
    customPropsUnused: Array.isArray(custom.unused) ? custom.unused.length : 0,
    mediaQueries: num(a.atrules?.media?.total),
    quality,
    qualityViolations,
    locations: locateCssIssues(css)
  }
}

/** Turn CSS stats into the same Finding shape as everything else. */
export function auditCss(page: CapturedPage, stats: CssStats, config: RunConfig): Finding[] {
  const out: Finding[] = []
  const strict = config.brutality === 'ruthless' ? 1 : config.brutality === 'harsh' ? 0.75 : 0.5

  if (stats.importantRatio > 0.03) {
    const pct = (stats.importantRatio * 100).toFixed(1)
    const where = formatLocations(stats.locations, 'important')
    out.push(
      mk(page, 'coherence', stats.importantRatio > 0.08 ? 'major' : 'minor',
        `${pct}% of declarations use !important`,
        `${stats.rules} rules, ${stats.selectors} selectors. Healthy stylesheets sit under 3%; above that the cascade is being fought rather than designed.${where ? `\n${where}` : ''}`,
        'Delete !important and fix the specificity that made it necessary — usually an over-qualified selector or a global reset.')
    )
  }
  if (stats.idSelectorRatio > 0.02) {
    const where = formatLocations(stats.locations, 'id-selector')
    out.push(
      mk(page, 'coherence', 'minor',
        `${(stats.idSelectorRatio * 100).toFixed(1)}% of selectors use IDs`,
        `Max specificity in the sheet is (${stats.maxSpecificity}). ID selectors cannot be overridden by component classes, so they force !important downstream.${where ? `\n${where}` : ''}`,
        'Swap ID selectors for class or data-attribute hooks.')
    )
  }
  const [a = 0, b = 0] = stats.maxSpecificity.split(',').map(Number)
  if (a > 0 || b > 4) {
    out.push(
      mk(page, 'coherence', 'minor',
        `Specificity peaks at (${stats.maxSpecificity})`,
        'Deeply specific selectors make component styles unpredictable and are the root cause of most "why is this not applying" bugs.',
        'Flatten to single-class selectors; let composition, not specificity, resolve conflicts.')
    )
  }

  // Uniqueness ratio is the real design-token signal: how often a value is
  // written once and never reused.
  if (stats.colorsTotal > 40 && stats.colorUniquenessRatio > 0.35) {
    out.push(
      mk(page, 'coherence', stats.colorUniquenessRatio > 0.55 ? 'major' : 'minor',
        `Colour reuse is low (${stats.colorsUnique} unique / ${stats.colorsTotal} declarations)`,
        `Uniqueness ratio ${(stats.colorUniquenessRatio * 100).toFixed(0)}% — most colours are written once. That is a palette by accident, not by system.`,
        'Promote the repeated values to CSS custom properties and make one-offs illegal in review.')
    )
  }
  if (stats.fontSizesUnique > 12) {
    out.push(
      mk(page, 'coherence', 'major',
        `${stats.fontSizesUnique} unique font sizes in the stylesheet`,
        'Authored CSS confirms there is no type scale — the DOM sample only shows what happened to render.',
        'Define the scale as tokens and refactor call sites to reference them.')
    )
  }
  if (stats.radiiUnique > 6) {
    out.push(
      mk(page, 'coherence', 'minor',
        `${stats.radiiUnique} unique border-radius values authored`,
        'Roundness is being decided per component instead of per system.',
        'Derive every radius from one --radius token.')
    )
  }
  if (stats.shadowsUnique > 8) {
    out.push(
      mk(page, 'coherence', 'minor',
        `${stats.shadowsUnique} unique box-shadow values authored`,
        'Elevation should be a 3–4 step ladder; this many shadows means each component invented its own.',
        'Collapse into elevation tokens applied by role.')
    )
  }
  if (stats.zIndexUnique > 8 || stats.zIndexMax >= 1000) {
    const where = formatLocations(stats.locations, 'high-z')
    out.push(
      mk(page, 'craft', stats.zIndexMax >= 9999 ? 'major' : 'minor',
        `z-index sprawl: ${stats.zIndexUnique} unique values, max ${stats.zIndexMax}`,
        `Ad-hoc stacking values are a stacking-context bug waiting to happen (and the reason modals hide behind headers).${where ? `\n${where}` : ''}`,
        'Define a named layer scale (base/dropdown/sticky/overlay/modal/toast) and forbid raw numbers.')
    )
  }
  if (stats.customPropsUnused > 0 && strict > 0.6) {
    out.push(
      mk(page, 'coherence', 'nit',
        `${stats.customPropsUnused} CSS custom properties defined but never used`,
        `${stats.customPropsDefined} custom properties declared in total.`,
        'Dead tokens confuse the next person; delete them or use them.')
    )
  }
  if (stats.browserhacks > 0) {
    out.push(
      mk(page, 'craft', 'nit',
        `${stats.browserhacks} browser hacks in the stylesheet`,
        'Targeting specific engines with parse hacks is unmaintainable and usually obsolete.',
        'Replace with feature queries (@supports).')
    )
  }
  if (stats.bytes > 500_000) {
    out.push(
      mk(page, 'performance', stats.bytes > 1_000_000 ? 'major' : 'minor',
        `${(stats.bytes / 1024).toFixed(0)} kB of CSS across ${stats.sheets} stylesheet(s)`,
        'Large stylesheets block first render and usually mean dead rules are shipping.',
        'Split per route, purge unused rules, and load non-critical CSS asynchronously.')
    )
  }

  const q = stats.quality
  if (q.maintainability < 70 || q.complexity < 70 || q.performance < 70) {
    out.push(
      mk(page, 'coherence', q.maintainability < 45 || q.complexity < 45 ? 'major' : 'minor',
        `CSS quality: perf ${q.performance}, maintainability ${q.maintainability}, complexity ${q.complexity}`,
        `Project Wallace guards failing: ${stats.qualityViolations.map((v) => v.id).slice(0, 8).join(', ') || 'n/a'}.`,
        'Attack the lowest score first — these guards map directly to selector complexity, !important use and specificity spread.')
    )
  }

  return out
}
