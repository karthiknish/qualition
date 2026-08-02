/**
 * pa11y pass (HTML_CodeSniffer).
 *
 * axe already covers the Deque rule set via Playwright. pa11y runs the W3C
 * HTML_CodeSniffer ruleset, which catches a different slice of WCAG failures
 * (and fails soft — a pa11y crash must never cost the user their audit).
 *
 * When a Playwright storageState is available we launch Chrome ourselves,
 * seed cookies + localStorage via CDP, then hand the browser to pa11y so
 * signed-in SPAs are audited as the user sees them.
 */
import type { Finding, Severity } from '../../shared/types.js'
import { cookieHeaderFor, seedChromeViaCdp } from './sessionSeed.js'

export { cookieHeaderFor }

export interface Pa11yResult {
  findings: Finding[]
  issueCount: number
  failed?: boolean
  failReason?: string
}

const IMPACT: Record<string, Severity> = {
  error: 'major',
  warning: 'minor',
  notice: 'nit'
}

let seq = 0

export async function runPa11y(
  url: string,
  opts: { storageStatePath?: string; onLog?: (m: string) => void; knownAxeIds?: Set<string> } = {}
): Promise<Pa11yResult | null> {
  let chrome: { kill: () => Promise<void>; port: number } | null = null
  try {
    const pa11yMod: any = await import('pa11y')
    const pa11y = pa11yMod.default ?? pa11yMod

    const headers: Record<string, string> = {}
    const cookie = cookieHeaderFor(url, opts.storageStatePath)
    if (cookie) headers.Cookie = cookie

    const pa11yOpts: Record<string, unknown> = {
      standard: 'WCAG2AA',
      runners: ['htmlcs'],
      timeout: 60_000,
      chromeLaunchConfig: {
        args: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage']
      },
      headers,
      includeNotices: false,
      includeWarnings: true
    }

    // Full session (cookies + localStorage): seed a chrome-launcher instance and
    // tell pa11y to reuse it via puppeteer-core connect.
    if (opts.storageStatePath) {
      const { launch } = await import('chrome-launcher')
      const puppeteer = await import('puppeteer-core')
      const launched = await launch({
        chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage']
      })
      chrome = {
        port: launched.port,
        kill: async () => {
          launched.kill()
        }
      }
      const seeded = await seedChromeViaCdp(
        `http://127.0.0.1:${chrome.port}`,
        url,
        opts.storageStatePath
      )
      opts.onLog?.(
        `pa11y session seeded: ${seeded.cookies} cookie(s), ${seeded.localStorage} localStorage entr${seeded.localStorage === 1 ? 'y' : 'ies'}`
      )

      const browser = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${chrome.port}`,
        defaultViewport: null
      })
      pa11yOpts.browser = browser
      pa11yOpts.chromeLaunchConfig = undefined
      // Keep storage; pa11y would otherwise open a fresh context.
      delete (pa11yOpts as { headers?: unknown }).headers
    }

    const result = await pa11y(url, pa11yOpts)

    const issues: any[] = result?.issues ?? []
    const findings: Finding[] = []
    const seen = new Set<string>()

    for (const issue of issues.slice(0, 40)) {
      const code = String(issue.code ?? issue.runnerExtras?.code ?? 'unknown')
      // Skip if axe already filed the same WCAG criterion (code often embeds it).
      const axeOverlap = [...(opts.knownAxeIds ?? [])].some((id) => code.toLowerCase().includes(id.toLowerCase()))
      if (axeOverlap) continue
      const key = `${code}|${issue.selector ?? ''}|${issue.message ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)

      const type = String(issue.type ?? 'warning').toLowerCase()
      findings.push({
        id: `p11y${++seq}`,
        category: 'accessibility',
        severity: IMPACT[type] ?? 'minor',
        title: `pa11y: ${String(issue.message ?? code).slice(0, 140)}`,
        detail: [
          code,
          issue.selector ? `Selector: ${issue.selector}` : '',
          issue.context ? `Context: ${String(issue.context).replace(/\s+/g, ' ').slice(0, 200)}` : ''
        ]
          .filter(Boolean)
          .join('\n'),
        fix: 'Resolve the WCAG criterion named in the code. HTML_CodeSniffer flags what axe did not.',
        pageUrl: url,
        selector: issue.selector ? String(issue.selector).slice(0, 200) : undefined,
        source: 'pa11y'
      })
    }

    opts.onLog?.(
      `pa11y: ${issues.length} issue(s) from HTML_CodeSniffer · ${findings.length} new finding(s) after axe dedupe`
    )
    return { findings, issueCount: issues.length }
  } catch (e) {
    const failReason = (e as Error).message.slice(0, 200)
    opts.onLog?.(`pa11y skipped: ${failReason}`)
    return {
      findings: [
        {
          id: `p11y${++seq}`,
          category: 'accessibility',
          severity: 'minor',
          title: 'pa11y could not run',
          detail: failReason,
          fix: 'Re-run the audit. axe still covers the primary accessibility pass.',
          pageUrl: url,
          source: 'pa11y'
        }
      ],
      issueCount: 0,
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
