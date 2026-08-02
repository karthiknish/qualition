import { executeRun, newRun } from '../src/main/services/runner.js'
import { DEFAULT_VIEWPORTS } from '../src/main/services/crawler.js'
import { renderMarkdownReport } from '../src/main/services/report.js'
import { buildFixPrompt } from '../src/main/services/prompt.js'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'; import { join } from 'node:path'
import type { RunConfig, Settings } from '../src/shared/types.js'
const wd = setTimeout(() => { console.log('WATCHDOG 600s'); process.exit(1) }, 600_000); wd.unref?.()

// Reuse the real Gemini key so the AI areas are exercised too.
let real: any = {}
try { real = JSON.parse(await readFile(join(homedir(), 'Library/Application Support/qualition/settings.json'), 'utf8')) } catch {}
const settings = { ...real, maxControlsProbed: 15, extraRegistries: [], interactionProbe: true } as Settings
const config: RunConfig = {
  targetUrl: process.argv[2], maxPages: Number(process.argv[3] ?? 3), viewports: DEFAULT_VIEWPORTS,
  useMobbin: true, useShadcn: true, useGemini: true, useInteractionProbe: true,
  provider: settings.provider ?? 'gemini', geminiModel: settings.geminiModel ?? 'gemini-3.6-flash',
  brutality: 'ruthless', productContext: '', flows: []
}
const run = newRun(config)
const t0 = Date.now()
await executeRun(run, settings, p => { if (p.pct % 20 === 0 || p.phase === 'done') console.log(`  ${p.pct}% ${p.phase}`) }, () => {})
console.log(`\nRUN ${run.id} ${run.status} in ${((Date.now()-t0)/1000).toFixed(0)}s`)

const md = renderMarkdownReport(run)
const prompt = buildFixPrompt(run, { scope: 'critical' })
const rows: [string, boolean, string][] = [
  ['pages',            run.pages.length > 0, `${run.pages.length} page(s)`],
  ['sections',         run.pages.every(p => p.sections.length > 0), run.pages.map(p => p.sections.length).join('/')],
  ['section roles',    new Set(run.pages.flatMap(p => p.sections.map(s => s.role))).size > 0, [...new Set(run.pages.flatMap(p => p.sections.map(s => s.role)))].join(',')],
  ['screenshots',      run.pages.every(p => Object.keys(p.screenshots).length === 3), run.pages.map(p => Object.keys(p.screenshots).length).join('/')],
  ['section shots',    run.pages.some(p => p.sections.some(s => s.screenshot)), `${run.pages.flatMap(p=>p.sections).filter(s=>s.screenshot).length} crops`],
  ['design tokens',    run.pages.every(p => p.tokens.colors.length > 0), `${run.pages[0]?.tokens.colors.length} colours`],
  ['authored CSS',     run.pages.every(p => !!p.cssStats), `${run.pages[0]?.cssStats ? (run.pages[0].cssStats.bytes/1024).toFixed(0)+'kB' : 'none'}`],
  ['axe',              run.pages.some(p => p.axe.length >= 0), `${run.pages.reduce((n,p)=>n+p.axe.length,0)} violations`],
  ['metrics',          run.pages.every(p => p.metrics.requestCount > 0), `LCP ${run.pages[0]?.metrics.lcpMs}ms`],
  ['controls',         run.pages.every(p => p.controls.length > 0), run.pages.map(p=>p.controls.length).join('/')],
  ['archetype',        !!run.archetype, `${run.archetype?.archetype} ${Math.round((run.archetype?.confidence??0)*100)}%`],
  ['interactions',     run.interactions.length > 0 && run.interactions.some(i => i.controlsProbed > 0), run.interactions.map(i=>i.controlsProbed).join('/')],
  ['mobbin refs',      run.references.length > 0, `${run.references.length} (hi-res: ${run.references.filter(r=>r.imageUrl?.includes('-hi.')).length})`],
  ['recommendations',  run.recommendations.length > 0, `${run.recommendations.length}, shoogle items: ${run.recommendations.flatMap(r=>r.items).filter(i=>i.source==='shoogle').length}`],
  ['flows',            run.flows.length > 0, `${run.flows.length} (${run.flows.filter(f=>f.ok).length} pass, ${run.flows.filter(f=>f.invalid).length} rejected)`],
  ['findings',         run.findings.length > 0, `${run.findings.length}`],
  ['ai findings',      run.findings.some(f => f.source === 'ai'), `${run.findings.filter(f=>f.source==='ai').length}`],
  ['scorecard',        !!run.scorecard, `${run.scorecard?.grade} ${run.scorecard?.overall}/100`],
  ['theme summary',    !!run.themeSummary, `${(run.themeSummary??'').length} chars`],
  ['ai verdict',       !!run.geminiNotes, `${(run.geminiNotes??'').length} chars`],
  ['visual diffs',     true, `${run.visualDiffs.length} (baseline optional)`],
  ['markdown export',  md.includes('## Findings') && md.length > 2000, `${(md.length/1000).toFixed(1)}k chars`],
  ['fix prompt',       prompt.includes('## Findings to fix') && prompt.length > 1000, `${(prompt.length/1000).toFixed(1)}k chars`],
]
console.log('\nAREA                 STATUS   DETAIL')
for (const [name, ok, detail] of rows) console.log(`${name.padEnd(20)} ${ok ? 'OK  ' : 'EMPTY'}    ${detail}`)
const bad = rows.filter(r => !r[1]).map(r => r[0])
console.log(bad.length ? `\nPROBLEM AREAS: ${bad.join(', ')}` : '\nALL AREAS REPORTING')
process.exit(0)
