#!/usr/bin/env node
/** Headless CLI: `npx qualition --site https://example.com --budget budget.json --out ./qualition-report` */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

type Args = Record<string, string | boolean>

function parseArgs(argv: string[]): Args {
  const out: Args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) out[key] = true
      else {
        out[key] = next
        i++
      }
    }
  }
  return out
}

function help(): string {
  return `qualition — brutal UI audit CLI

Usage:
  npx qualition --site https://example.com [options]

Options:
  --site <url>          Target to audit (required)
  --budget <path>       budget.json with { "minScore": 80, "maxFindings": { "blocker": 0 } }
  --maxPages <n>        Pages to crawl (default 5, 0 = unlimited with 45m cap)
  --out <dir>           Output dir for run.json + report.html + results.sarif (default ./qualition-report)
  --format <list>       Comma list: json,html,sarif,markdown (default json,html,sarif)
  --diff <mode>         full | changed-only (requires prior run in same project dir; default full)
  --help                Show this
`
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || args.h) {
    console.log(help())
    process.exit(0)
  }
  const site = (args.site as string) || (args.s as string)
  if (!site) {
    console.error(help())
    console.error('error: --site is required')
    process.exit(2)
  }
  const outDir = (args.out as string) || './qualition-report'
  const maxPages = args.maxPages ? Number(args.maxPages) : 5
  const diffMode = (args.diff as string) === 'changed-only' ? 'changed-only' as const : 'full' as const
  const format = ((args.format as string) || 'json,html,sarif').split(',').map((s) => s.trim().toLowerCase())
  const budgetPath = (args.budget as string) || null

  // Lazy imports so --help stays fast and avoids Electron deps
  const { launch, crawl, DEFAULT_VIEWPORTS } = await import('./main/services/crawler.js')
  const { scoreRun, themeSummary, dedupeFindings } = await import('./main/services/audit.js')
  const { renderMarkdownReport } = await import('./main/services/report.js')
  const { renderHtmlReport } = await import('./main/services/staticHtml.js')
  const { runToSarif } = await import('./main/services/sarif.js')

  const browser = await launch()
  const t0 = Date.now()
  console.log(`qualition: crawling ${site} (maxPages=${maxPages}, diff=${diffMode})`)
  const pages = await crawl(browser, site, maxPages, {
    viewports: DEFAULT_VIEWPORTS,
    outDir,
    budgetMs: !maxPages || maxPages <= 0 ? 45 * 60_000 : undefined,
    onLog: (m) => console.log(`  ${m}`)
  })
  await browser.close().catch(() => {})
  console.log(`captured ${pages.length} page(s)`)

  // Lightweight in-process audit (no Mobbin/Gemini/Lighthouse in CLI v1)
  const cfg = { targetUrl: site, brutality: 'ruthless' as const, viewports: DEFAULT_VIEWPORTS } as never
  const findings: unknown[] = []
  for (const p of pages) {
    const { auditPage: ap } = await import('./main/services/audit.js')
    // @ts-ignore
    findings.push(...ap(p, cfg))
    if ((p as { cssStats?: unknown }).cssStats) {
      const { auditCss: ac } = await import('./main/services/cssAudit.js')
      // @ts-ignore
      findings.push(...ac(p as never, (p as { cssStats: never }).cssStats, cfg))
    }
    if ((p as { tokenDictionary?: unknown }).tokenDictionary) {
      const { auditTokens: at } = await import('./main/services/tokens.js')
      // @ts-ignore
      findings.push(...at(p as never, (p as { tokenDictionary: never }).tokenDictionary, cfg))
    }
  }
  const brandMod = await import('./main/services/brandTheme.js')
  const brand = brandMod.inferBrandProfile(pages as never, '')
  for (const p of pages) findings.push(...brandMod.auditComponentTheme(p as never, brand, cfg))
  findings.push(...brandMod.auditBrandAcrossProject(pages as never, brand, cfg))
  const deduped = dedupeFindings(findings as never)
  const score = scoreRun(deduped as never, pages.length, 'ruthless')

  const run = {
    id: `cli-${Date.now()}`,
    projectId: site.replace(/https?:\/\//, '').replace(/\W+/g, '-').slice(0, 48),
    createdAt: t0,
    finishedAt: Date.now(),
    status: 'done' as const,
    config: { targetUrl: site, maxPages, viewports: DEFAULT_VIEWPORTS, brutality: 'ruthless', provider: 'gemini' as const, geminiModel: 'cli', diffMode } as never,
    pages,
    findings: deduped,
    flows: [],
    references: [],
    recommendations: [],
    visualDiffs: [],
    interactions: [],
    scorecard: score,
    themeSummary: themeSummary(pages as never),
    log: []
  }

  await mkdir(outDir, { recursive: true })
  const writes: Promise<void>[] = []
  if (format.includes('json')) writes.push(writeFile(join(outDir, 'run.json'), JSON.stringify(run, null, 2), 'utf8').then(() => console.log(`wrote ${join(outDir, 'run.json')}`)))
  if (format.includes('html')) writes.push(writeFile(join(outDir, 'report.html'), renderHtmlReport(run as never), 'utf8').then(() => console.log(`wrote ${join(outDir, 'report.html')}`)))
  if (format.includes('sarif')) writes.push(writeFile(join(outDir, 'results.sarif'), JSON.stringify(runToSarif(run as never), null, 2), 'utf8').then(() => console.log(`wrote ${join(outDir, 'results.sarif')}`)))
  if (format.includes('markdown') || format.includes('md')) writes.push(writeFile(join(outDir, 'report.md'), renderMarkdownReport(run as never), 'utf8').then(() => console.log(`wrote ${join(outDir, 'report.md')}`)))
  await Promise.all(writes)

  console.log(`done: grade ${score.grade} (${score.overall}/100) · ${deduped.length} findings`)

  // Budget gate
  if (budgetPath) {
    try {
      const raw = JSON.parse(await (await import('node:fs/promises')).readFile(budgetPath, 'utf8'))
      let failed = false
      if (typeof raw.minScore === 'number' && score.overall < raw.minScore) {
        console.error(`budget failed: overall ${score.overall} < minScore ${raw.minScore}`)
        failed = true
      }
      if (raw.maxFindings) {
        for (const [sev, max] of Object.entries(raw.maxFindings as Record<string, number>)) {
          const n = (deduped as { severity: string }[]).filter((f) => f.severity === sev).length
          if (n > (max as number)) {
            console.error(`budget failed: ${sev} findings ${n} > ${max}`)
            failed = true
          }
        }
      }
      if (failed) process.exit(1)
      console.log('budget: pass')
    } catch (e) {
      console.error(`budget check failed to run: ${(e as Error).message}`)
      process.exit(1)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
