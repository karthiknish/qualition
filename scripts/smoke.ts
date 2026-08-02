/**
 * Headless smoke test of the audit pipeline (no Electron).
 *   npm run smoke -- https://example.com
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crawl, launch, DEFAULT_VIEWPORTS } from '../src/main/services/crawler.js'
import { auditPage, scoreRun, themeSummary } from '../src/main/services/audit.js'
import { auditCss } from '../src/main/services/cssAudit.js'
import { closeMobbin, mobbinStatus, queryForRole, searchScreens } from '../src/main/services/mobbin.js'
import { closeShoogle } from '../src/main/services/shoogle.js'
import { recommendForSection, registryStatus } from '../src/main/services/shadcnRegistry.js'
import { compareWithBaseline } from '../src/main/services/visual.js'
import { probeInteractions } from '../src/main/services/interaction.js'
import { shoogleStatus } from '../src/main/services/shoogle.js'
import type { Finding, Run, RunConfig } from '../src/shared/types.js'

const target = process.argv[2] ?? 'https://ui.shadcn.com'

const config: RunConfig = {
  targetUrl: target,
  maxPages: 1,
  viewports: DEFAULT_VIEWPORTS,
  useMobbin: true,
  useShadcn: true,
  useGemini: false,
  useInteractionProbe: true,
  provider: 'gemini',
  geminiModel: 'gemini-3.6-flash',
  brutality: 'ruthless',
  productContext: 'developer tool marketing site',
  flows: []
}

const dir = await mkdtemp(join(tmpdir(), 'qualition-'))
console.log('assets ->', dir)

console.log('registry:', await registryStatus())
console.log('shoogle:', await shoogleStatus())
console.log('mobbin:', await mobbinStatus())

const browser = await launch()
const pages = await crawl(browser, target, config.maxPages, {
  viewports: config.viewports,
  outDir: dir,
  onLog: (m) => console.log('  ·', m)
})
const browser2 = browser

const findings: Finding[] = []
for (const p of pages) {
  findings.push(...auditPage(p, config))
  if (p.cssStats) findings.push(...auditCss(p, p.cssStats, config))
}

const page = pages[0]
console.log('\nPAGE', page.url, '| status', page.status, '| sections', page.sections.length)
console.log('sections:', page.sections.map((s) => `${s.id}:${s.role}(${s.rect.height}px)`).join(' '))
console.log('tokens: colors', page.tokens.colors.length, 'fonts', page.tokens.fontFamilies.length,
  'sizes', page.tokens.fontSizes.length, 'radii', page.tokens.radii.length)
console.log('axe violations:', page.axe.length, '| console errors:', page.consoleErrors.length)
if (page.cssStats) {
  const c = page.cssStats
  console.log(`css: ${(c.bytes / 1024).toFixed(0)}kB across ${c.sheets} sheets | ${c.rules} rules, ${c.selectors} selectors`)
  console.log(`  colours ${c.colorsUnique}/${c.colorsTotal} (uniqueness ${(c.colorUniquenessRatio * 100).toFixed(0)}%) | fontSizes ${c.fontSizesUnique} | radii ${c.radiiUnique} | shadows ${c.shadowsUnique}`)
  console.log(`  !important ${(c.importantRatio * 100).toFixed(1)}% | id-selectors ${(c.idSelectorRatio * 100).toFixed(1)}% | max specificity (${c.maxSpecificity}) | z-index ${c.zIndexUnique} max ${c.zIndexMax}`)
  console.log(`  quality: perf ${c.quality.performance} maint ${c.quality.maintainability} cplx ${c.quality.complexity}`)
} else {
  console.log('css: no stylesheet text captured')
}
console.log('theme:', themeSummary(pages))

const score = scoreRun(findings, pages.length, config.brutality)
console.log(`\nSCORE ${score.grade} ${score.overall}/100 — ${score.verdict}`)
console.log('by category:', Object.entries(score.categories).map(([k, v]) => `${k}=${v.score}(${v.findings})`).join(' '))
console.log('\nTOP FINDINGS')
for (const f of findings.slice(0, 12)) console.log(` [${f.severity}/${f.category}] ${f.title}`)

// Visual-regression plumbing against real full-page PNGs (self-baseline must be ~0%).
const baseline = { id: 'self', pages, status: 'done' } as unknown as Run
const { diffs } = await compareWithBaseline(pages, baseline, dir)
console.log(
  '\nVISUAL DIFF (self-baseline, expect ~0%):',
  diffs.map((d) => `${d.viewport} ${(d.changedRatio * 100).toFixed(2)}%`).join(' | ') || 'none'
)

// Deep interaction probe — actually operate the controls.
const { report, findings: probeFindings } = await probeInteractions(browser2, target, {
  outDir: dir,
  viewport: DEFAULT_VIEWPORTS[0],
  maxControls: 25,
  onLog: (m) => console.log('  probe·', m)
})
await browser2.close()
console.log('\nINTERACTION PROBE')
console.log(` controls exercised: ${report.controlsProbed} | tab stops: ${report.keyboard.tabStops} | positive tabindex: ${report.keyboard.positiveTabIndex}`)
console.log(` dead clicks: ${report.deadClicks.length} ${report.deadClicks.slice(0, 4).join(', ')}`)
console.log(` no focus ring: ${report.noFocusIndicator.length} ${report.noFocusIndicator.slice(0, 4).join(', ')}`)
console.log(` no hover feedback: ${report.noHoverFeedback.length} | unnamed: ${report.unnamedControls.length} | fake buttons: ${report.fakeButtons.length}`)
console.log(` overlays: ${report.overlays.map((o) => `${o.trigger}(esc=${o.escapeCloses},focus=${o.focusMoved})`).join(', ') || 'none'}`)
console.log(` forms: ${report.forms.map((f) => `${f.submitLabel || f.index}: validation=${f.validationFeedback}`).join('; ') || 'none'}`)
console.log(' findings:', probeFindings.map((f) => `[${f.severity}] ${f.title}`).join(' | ') || 'none')

const s0 = page.sections[0]
if (s0) {
  const rec = await recommendForSection(s0, findings.filter((f) => f.sectionId === s0.id).map((f) => f.title))
  console.log(`\nRECS for ${s0.id} (${s0.role}) source=${rec.source}`)
  for (const i of rec.items) console.log(`  [${i.source}] ${i.addCommand}  — ${i.description.slice(0, 60)}`)
  try {
    const refs = await searchScreens(queryForRole(s0.role, config.productContext), {
      limit: 2, outDir: dir, sectionId: s0.id
    })
    console.log('MOBBIN refs:', refs.map((r) => `${r.appName ?? r.title} ${r.imageUrl ? '[img]' : ''}`).join(' | '))
  } catch (e) {
    console.log('MOBBIN failed:', (e as Error).message)
  }
}

// MCP transports keep open streams; without this the CLI never exits.
await Promise.allSettled([closeMobbin(), closeShoogle()])
console.log('\ndone.')
process.exit(0)
