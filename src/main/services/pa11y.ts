/**
 * pa11y pass (HTML_CodeSniffer).
 *
 * axe already covers the Deque rule set via Playwright. pa11y runs the W3C
 * HTML_CodeSniffer ruleset, which catches a different slice of WCAG failures
 * (and fails soft — a pa11y crash must never cost the user their audit).
 */
import { readFileSync } from 'node:fs'
import type { Finding, Severity } from '../../shared/types.js'

export interface Pa11yResult {
  findings: Finding[]
  issueCount: number
}

const IMPACT: Record<string, Severity> = {
  error: 'major',
  warning: 'minor',
  notice: 'nit'
}

let seq = 0

/** Map a storageState cookie list into a Cookie request header for one origin. */
export function cookieHeaderFor(url: string, storageStatePath?: string): string | undefined {
  if (!storageStatePath) return undefined
  try {
    const state = JSON.parse(readFileSync(storageStatePath, 'utf8')) as {
      cookies?: { name: string; value: string; domain: string; path?: string }[]
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

export async function runPa11y(
  url: string,
  opts: { storageStatePath?: string; onLog?: (m: string) => void; knownAxeIds?: Set<string> } = {}
): Promise<Pa11yResult | null> {
  try {
    const pa11yMod: any = await import('pa11y')
    const pa11y = pa11yMod.default ?? pa11yMod
    const headers: Record<string, string> = {}
    const cookie = cookieHeaderFor(url, opts.storageStatePath)
    if (cookie) headers.Cookie = cookie

    const result = await pa11y(url, {
      standard: 'WCAG2AA',
      runners: ['htmlcs'],
      timeout: 60_000,
      chromeLaunchConfig: {
        args: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage']
      },
      headers,
      includeNotices: false,
      includeWarnings: true
    })

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
    opts.onLog?.(`pa11y skipped: ${(e as Error).message.slice(0, 160)}`)
    return null
  }
}
