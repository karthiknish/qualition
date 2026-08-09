/**
 * Lighthouse pass.
 *
 * Our own metrics say *what* is slow; Lighthouse says *why* and scores SEO and
 * best-practices, which nothing else here covers. It drives its own Chrome via
 * CDP, so it runs independently of the Playwright browser and fails soft: a
 * Lighthouse problem must never cost the user their audit.
 *
 * Signed-in audits seed the CDP Chrome from Playwright storageState (cookies +
 * localStorage) with disableStorageReset — Cookie headers alone miss SPA auth.
 */
import type { Finding, Severity } from '../../shared/types.js'
import { importChromeLauncher } from './chromeDeps.js'
import { seedChromeViaCdp } from './sessionSeed.js'

export interface LighthouseScores {
  performance: number | null
  accessibility: number | null
  bestPractices: number | null
  seo: number | null
  pwa?: number | null
}

export interface LighthouseMetrics {
  lcpMs?: number | null
  cls?: number | null
  tbtMs?: number | null
  fcpMs?: number | null
  siMs?: number | null
  inpMs?: number | null
  ttfbMs?: number | null
  lcpPhases?: { ttfb?: number; loadDelay?: number; loadTime?: number; renderDelay?: number } | null
}

export interface LighthouseResult {
  scores: LighthouseScores
  metrics?: LighthouseMetrics
  findings: Finding[]
  /** True when the pass could not complete (soft-fail). */
  failed?: boolean
  failReason?: string
}

/** Audits worth surfacing; dual legacy + Lighthouse 13 insights (Oct 2025). */
const INTERESTING = new Set([
  // legacy perf — still valid under Diagnostics
  'render-blocking-resources',
  'unused-javascript',
  'unused-css-rules',
  'unminified-javascript',
  'unminified-css',
  'total-byte-weight',
  'dom-size',
  'bootup-time',
  'mainthread-work-breakdown',
  'legacy-javascript',
  'font-display',
  // legacy images → consolidated into image-delivery-insight in LH13
  'modern-image-formats',
  'uses-optimized-images',
  'uses-responsive-images',
  'efficient-animated-content',
  // legacy network → document-latency-insight in LH13
  'server-response-time',
  'redirects',
  'uses-text-compression',
  // legacy third-party → third-parties-insight
  'third-party-summary',
  // LH13 insights
  'image-delivery-insight',
  'third-parties-insight',
  'document-latency-insight',
  'lcp-discovery-insight',
  'lcp-phases-insight',
  'interaction-to-next-paint-insight',
  'cls-culprits-insight',
  'render-blocking-insight',
  'network-dependency-tree-insight',
  'duplicated-javascript-insight',
  'viewport-insight',
  'font-display-insight',
  // seo / best-practices
  'is-crawlable',
  'document-title',
  'meta-description',
  'link-text',
  'crawlable-anchors',
  'hreflang',
  'errors-in-console',
  'no-vulnerable-libraries',
  'csp-xss',
  'deprecations'
])

const SEO_AUDITS = new Set([
  'is-crawlable',
  'document-title',
  'meta-description',
  'link-text',
  'crawlable-anchors',
  'hreflang'
])

let seq = 0

function severityFor(score: number | null, savingsMs: number): Severity {
  if (score !== null && score >= 0.9) return 'nit'
  if (savingsMs > 2000 || (score !== null && score < 0.3)) return 'major'
  if (savingsMs > 500 || (score !== null && score < 0.6)) return 'minor'
  return 'nit'
}

export async function runLighthouse(
  url: string,
  opts: {
    storageStatePath?: string
    skipSeo?: boolean
    includePwa?: boolean
    formFactor?: 'desktop' | 'mobile'
    onlyCategories?: string[]
    throttling?: { rttMs?: number; throughputKbps?: number; cpuSlowdownMultiplier?: number; method?: 'simulate' | 'devtools' }
    runs?: number
    onLog?: (m: string) => void
  } = {}
): Promise<LighthouseResult | null> {
  let chrome: { kill: () => Promise<void>; port: number } | null = null
  try {
    const { launch } = await importChromeLauncher()
    const lighthouseMod: any = await import('lighthouse')
    const lighthouse = lighthouseMod.default ?? lighthouseMod

    const launched = await launch({
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage']
    })
    chrome = {
      port: launched.port,
      kill: async () => {
        launched.kill()
      }
    }

    if (opts.storageStatePath) {
      const seeded = await seedChromeViaCdp(
        `http://127.0.0.1:${chrome.port}`,
        url,
        opts.storageStatePath
      )
      opts.onLog?.(
        `Lighthouse session seeded: ${seeded.cookies} cookie(s), ${seeded.localStorage} localStorage entr${seeded.localStorage === 1 ? 'y' : 'ies'}`
      )
    }

    let categories: string[] | undefined = opts.onlyCategories
    if (!categories) {
      categories = opts.skipSeo ? ['performance', 'accessibility', 'best-practices'] : ['performance', 'accessibility', 'best-practices', 'seo']
      if (opts.includePwa) categories.push('pwa')
    }

    // median over runs
    const runs = Math.max(1, Math.min(5, opts.runs ?? 1))
    const collected: any[] = []
    let lastRunner: any = null
    for (let r=0; r<runs; r++) {
      const rr = await lighthouse(
      url,
      {
        port: chrome!.port,
        output: 'json',
        logLevel: 'silent',
        disableStorageReset: !!opts.storageStatePath
      },
      {
        extends: 'lighthouse:default',
        settings: {
          formFactor: opts.formFactor ?? 'desktop',
          throttlingMethod: opts.throttling?.method ?? 'simulate',
          ...(opts.throttling?.rttMs || opts.throttling?.throughputKbps ? { throttling: { rttMs: opts.throttling.rttMs ?? 40, throughputKbps: opts.throttling.throughputKbps ?? 10240, cpuSlowdownMultiplier: opts.throttling.cpuSlowdownMultiplier ?? 1 } } : {}),
          screenEmulation: opts.formFactor === 'mobile' ? { mobile: true, width: 360, height: 640, deviceScaleFactor: 2, disabled: false } : {
            mobile: false,
            width: 1350,
            height: 940,
            deviceScaleFactor: 1,
            disabled: false
          },
          emulatedUserAgent: opts.formFactor === 'mobile' ? 'Mozilla/5.0 (Linux; Android 11; moto g power) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          onlyCategories: categories,
          maxWaitForLoad: 45_000,
          disableStorageReset: !!opts.storageStatePath
        }
      }
    )
      collected.push(rr)
      lastRunner = rr
      if (runs > 1) opts.onLog?.(`Lighthouse run ${r+1}/${runs} done`)
    }
    const runnerResult = collected.length>1 ? (()=>{ // median by performance score
      const scores = collected.map(c=> c.lhr?.categories?.performance?.score ?? 0)
      const sorted = [...scores].sort((a,b)=>a-b)
      const med = sorted[Math.floor(sorted.length/2)]
      return collected.find(c=> (c.lhr?.categories?.performance?.score ?? 0)===med) ?? lastRunner
    })() : lastRunner
    const lhr = runnerResult?.lhr
    if (!lhr) {
      return {
        scores: { performance: null, accessibility: null, bestPractices: null, seo: null },
        findings: [],
        failed: true,
        failReason: 'Lighthouse returned no result object'
      }
    }

    const scores: LighthouseScores = {
      performance: lhr.categories?.performance?.score ?? null,
      accessibility: lhr.categories?.accessibility?.score ?? null,
      bestPractices: lhr.categories?.['best-practices']?.score ?? null,
      seo: opts.skipSeo ? null : (lhr.categories?.seo?.score ?? null),
      pwa: opts.includePwa ? (lhr.categories?.pwa?.score ?? null) : null
    }
    // Extract metrics with LH13 insight fallbacks (legacy ids may be absent)
    const auditNum = (id: string): number | null => {
      const v = lhr.audits?.[id]?.numericValue
      return typeof v === 'number' && Number.isFinite(v) ? v : null
    }
    const insightDetail = (id: string): any => lhr.audits?.[id]?.details ?? null
    // LCP: legacy largest-contentful-paint → lcp-phases-insight / lcp-discovery-insight numericValue or phases
    let lcpMs: number | null = auditNum('largest-contentful-paint')
    if (lcpMs == null) lcpMs = auditNum('lcp-phases-insight') ?? auditNum('lcp-discovery-insight')
    if (lcpMs == null) {
      const phases = insightDetail('lcp-phases-insight')
      // phases subItems: ttfb, loadDelay, loadTime, renderDelay
      if (phases?.items?.[0]) {
        const it = phases.items[0]
        const sum = (it.ttfb ?? 0) + (it.loadDelay ?? 0) + (it.loadTime ?? 0) + (it.renderDelay ?? 0)
        if (sum > 0) lcpMs = sum
      }
    }
    let lcpPhases: LighthouseMetrics['lcpPhases'] = null
    {
      const d: any = insightDetail('lcp-phases-insight')
      const it = d?.items?.[0]
      if (it) lcpPhases = { ttfb: it.ttfb ?? undefined, loadDelay: it.loadDelay ?? undefined, loadTime: it.loadTime ?? undefined, renderDelay: it.renderDelay ?? undefined }
    }
    // TTFB: server-response-time → document-latency-insight
    let ttfbMs: number | null = auditNum('server-response-time')
    if (ttfbMs == null) {
      const d: any = insightDetail('document-latency-insight')
      // document latency insight exposes serverResponseTime in items
      ttfbMs = d?.items?.[0]?.serverResponseTime ?? auditNum('document-latency-insight')
    }
    const metrics: LighthouseMetrics = {
      lcpMs,
      cls: auditNum('cumulative-layout-shift') ?? auditNum('cls-culprits-insight'),
      tbtMs: auditNum('total-blocking-time'),
      fcpMs: auditNum('first-contentful-paint'),
      siMs: auditNum('speed-index'),
      inpMs: auditNum('interaction-to-next-paint') ?? auditNum('interaction-to-next-paint-insight') ?? auditNum('experimental-interaction-to-next-paint'),
      ttfbMs,
      lcpPhases,
    }

    const findings: Finding[] = []
    for (const [id, audit] of Object.entries<any>(lhr.audits ?? {})) {
      if (!INTERESTING.has(id)) continue
      if (opts.skipSeo && SEO_AUDITS.has(id)) continue
      const score = typeof audit.score === 'number' ? audit.score : null
      if (score === null || score >= 0.9) continue
      const savingsMs = Number(audit.details?.overallSavingsMs ?? 0)
      const savingsBytes = Number(audit.details?.overallSavingsBytes ?? 0)
      const measured = [
        audit.displayValue,
        savingsMs > 0 ? `est. ${(savingsMs / 1000).toFixed(1)}s saving` : '',
        savingsBytes > 0 ? `${Math.round(savingsBytes / 1024)} kB saving` : ''
      ]
        .filter(Boolean)
        .join(' · ')

      findings.push({
        id: `lh${++seq}`,
        category: /crawlable|title|description|link-text|hreflang/.test(id)
          ? 'content'
          : /console|vulnerable|csp|deprecation/.test(id)
            ? 'flow'
            : 'performance',
        severity: severityFor(score, savingsMs),
        title: `Lighthouse: ${audit.title}`,
        detail: `${String(audit.description ?? '')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .slice(0, 400)}${measured ? `\nMeasured: ${measured}` : ''}`,
        fix: 'Follow the Lighthouse guidance for this audit; the saving above is what it estimates you recover.',
        pageUrl: url,
        source: 'lighthouse'
      })
    }

    opts.onLog?.(
      `Lighthouse: perf ${Math.round((scores.performance ?? 0) * 100)}, a11y ${Math.round((scores.accessibility ?? 0) * 100)}, best-practices ${Math.round((scores.bestPractices ?? 0) * 100)}${opts.skipSeo ? ', seo skipped (app)' : `, seo ${Math.round((scores.seo ?? 0) * 100)}`} · ${findings.length} finding(s)`
    )
    return { scores, metrics, findings }
  } catch (e) {
    const failReason = (e as Error).message.slice(0, 200)
    opts.onLog?.(`Lighthouse skipped: ${failReason}`)
    return {
      scores: { performance: null, accessibility: null, bestPractices: null, seo: null },
      findings: [
        {
          id: `lh${++seq}`,
          category: 'flow',
          severity: 'minor',
          title: 'Lighthouse could not run',
          detail: failReason,
          fix: 'Re-run the audit. If this persists, check that Chrome can launch and the target is reachable.',
          pageUrl: url,
          source: 'lighthouse'
        }
      ],
      failed: true,
      failReason
    }
  } finally {
    try {
      await chrome?.kill()
    } catch {
      /* already gone */
    }
  }
}
