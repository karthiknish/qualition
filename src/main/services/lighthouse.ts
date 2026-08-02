/**
 * Lighthouse pass.
 *
 * Our own metrics say *what* is slow; Lighthouse says *why* and scores SEO and
 * best-practices, which nothing else here covers. It drives its own Chrome via
 * CDP, so it runs independently of the Playwright browser and fails soft: a
 * Lighthouse problem must never cost the user their audit.
 */
import { readFileSync } from 'node:fs'
import type { Finding, Severity } from '../../shared/types.js'

export interface LighthouseScores {
  performance: number | null
  accessibility: number | null
  bestPractices: number | null
  seo: number | null
}

export interface LighthouseResult {
  scores: LighthouseScores
  findings: Finding[]
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

let seq = 0

function severityFor(score: number | null, savingsMs: number): Severity {
  if (score !== null && score >= 0.9) return 'nit'
  if (savingsMs > 2000 || (score !== null && score < 0.3)) return 'major'
  if (savingsMs > 500 || (score !== null && score < 0.6)) return 'minor'
  return 'nit'
}

function cookieHeader(url: string, storageStatePath?: string): string | undefined {
  if (!storageStatePath) return undefined
  try {
    const state = JSON.parse(readFileSync(storageStatePath, 'utf8')) as {
      cookies?: { name: string; value: string; domain: string }[]
    }
    const host = new URL(url).hostname
    const cookies = (state.cookies ?? []).filter((c) => {
      const d = c.domain?.replace(/^\./, '') ?? ''
      return host === d || host.endsWith(`.${d}`)
    })
    if (!cookies.length) return undefined
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  } catch {
    return undefined
  }
}

export async function runLighthouse(
  url: string,
  opts: { storageStatePath?: string; onLog?: (m: string) => void } = {}
): Promise<LighthouseResult | null> {
  let chrome: { kill: () => Promise<void>; port: number } | null = null
  try {
    const { launch } = await import('chrome-launcher')
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

    const extraHeaders: Record<string, string> = {}
    const cookie = cookieHeader(url, opts.storageStatePath)
    if (cookie) extraHeaders.Cookie = cookie

    const runnerResult = await lighthouse(
      url,
      {
        port: chrome!.port,
        output: 'json',
        logLevel: 'silent'
      },
      {
        extends: 'lighthouse:default',
        settings: {
          // Qualition audits desktop product UI (not Moto G Power). Mobile
          // form-factor scoring would under/over-weight the wrong metrics.
          formFactor: 'desktop',
          screenEmulation: {
            mobile: false,
            width: 1350,
            height: 940,
            deviceScaleFactor: 1,
            disabled: false
          },
          emulatedUserAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
          maxWaitForLoad: 45_000,
          extraHeaders: Object.keys(extraHeaders).length ? extraHeaders : undefined
        }
      }
    )
    const lhr = runnerResult?.lhr
    if (!lhr) return null

    const scores: LighthouseScores = {
      performance: lhr.categories?.performance?.score ?? null,
      accessibility: lhr.categories?.accessibility?.score ?? null,
      bestPractices: lhr.categories?.['best-practices']?.score ?? null,
      seo: lhr.categories?.seo?.score ?? null
    }

    const findings: Finding[] = []
    for (const [id, audit] of Object.entries<any>(lhr.audits ?? {})) {
      if (!INTERESTING.has(id)) continue
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
      `Lighthouse: perf ${Math.round((scores.performance ?? 0) * 100)}, a11y ${Math.round((scores.accessibility ?? 0) * 100)}, best-practices ${Math.round((scores.bestPractices ?? 0) * 100)}, seo ${Math.round((scores.seo ?? 0) * 100)} · ${findings.length} finding(s)`
    )
    return { scores, findings }
  } catch (e) {
    opts.onLog?.(`Lighthouse skipped: ${(e as Error).message.slice(0, 160)}`)
    return null
  } finally {
    try {
      await chrome?.kill()
    } catch {
      /* already gone */
    }
  }
}
