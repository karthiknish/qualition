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
}

export interface LighthouseMetrics {
  lcpMs?: number | null
  cls?: number | null
  tbtMs?: number | null
  fcpMs?: number | null
  siMs?: number | null
}

export interface LighthouseResult {
  scores: LighthouseScores
  metrics?: LighthouseMetrics
  findings: Finding[]
  /** True when the pass could not complete (soft-fail). */
  failed?: boolean
  failReason?: string
}

/** Audits worth surfacing; the rest is noise at this level. */
const INTERESTING = new Set([
  'render-blocking-resources',
  'unused-javascript',
  'unused-css-rules',
  'unminified-javascript',
  'unminified-css',
  'modern-image-formats',
  'uses-optimized-images',
  'uses-responsive-images',
  'efficient-animated-content',
  'total-byte-weight',
  'dom-size',
  'bootup-time',
  'mainthread-work-breakdown',
  'third-party-summary',
  'legacy-javascript',
  'font-display',
  'server-response-time',
  'redirects',
  'uses-text-compression',
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
    /** Skip SEO category for signed-in product UIs (marketing SEO does not apply). */
    skipSeo?: boolean
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

    const categories = opts.skipSeo
      ? ['performance', 'accessibility', 'best-practices']
      : ['performance', 'accessibility', 'best-practices', 'seo']

    const runnerResult = await lighthouse(
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
          // Qualition audits desktop product UI (not Moto G Power). Mobile
          // form-factor scoring would under/over-weight the wrong metrics.
          formFactor: 'desktop',
          throttlingMethod: 'simulate',
          screenEmulation: {
            mobile: false,
            width: 1350,
            height: 940,
            deviceScaleFactor: 1,
            disabled: false
          },
          emulatedUserAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          onlyCategories: categories,
          maxWaitForLoad: 45_000,
          disableStorageReset: !!opts.storageStatePath
        }
      }
    )
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
      seo: opts.skipSeo ? null : (lhr.categories?.seo?.score ?? null)
    }
    const metrics: LighthouseMetrics = {
      lcpMs: lhr.audits?.['largest-contentful-paint']?.numericValue as number | null ?? null,
      cls: lhr.audits?.['cumulative-layout-shift']?.numericValue as number | null ?? null,
      tbtMs: lhr.audits?.['total-blocking-time']?.numericValue as number | null ?? null,
      fcpMs: lhr.audits?.['first-contentful-paint']?.numericValue as number | null ?? null,
      siMs: lhr.audits?.['speed-index']?.numericValue as number | null ?? null,
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
