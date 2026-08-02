/**
 * Playwright capture layer: crawl pages, screenshot every viewport, extract
 * design tokens + sections, run axe-core, record console/network failures,
 * and replay user flows.
 */
import { chromium, type Browser, type Page } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { join } from 'node:path'
import { extractFn, observerInit } from './extract.js'
import { analyzeCss } from './cssAudit.js'
import { normalizeTargetUrl, schemeFallback } from '../../shared/url.js'
import type {
  AxeViolation,
  CapturedPage,
  FlowResult,
  FlowStep,
  PageSection,
  Viewport
} from '../../shared/types.js'

/** Retry wrapper: transient navigation/network failures should not kill a run. */
async function withRetry<T>(label: string, attempts: number, fn: () => Promise<T>, onLog?: (m: string) => void): Promise<T> {
  let lastError: unknown
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      onLog?.(`${label} attempt ${i}/${attempts} failed: ${(e as Error).message.slice(0, 160)}`)
      if (i < attempts) await new Promise((r) => setTimeout(r, 800 * i))
    }
  }
  throw lastError
}

export const DEFAULT_VIEWPORTS: Viewport[] = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false },
  { name: 'tablet', width: 834, height: 1112, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true }
]

export async function launch(): Promise<Browser> {
  return chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] })
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return false
  }
}

/** Params that never change the page, only analytics/session noise. */
const JUNK_PARAMS =
  /^(utm_|ref$|referrer$|fbclid$|gclid$|msclkid$|mc_[ce]id$|_ga|igshid$|source$|preset$|variant$|v$|t$|ts$|cache|hash)/i

function normalize(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    for (const key of [...u.searchParams.keys()]) {
      if (JUNK_PARAMS.test(key)) u.searchParams.delete(key)
    }
    u.search = u.searchParams.toString() ? `?${u.searchParams.toString()}` : ''
    return u.toString().replace(/\/$/, '')
  } catch {
    return url
  }
}

/**
 * Identity for de-duplication: same path = same page as far as an audit is
 * concerned. Without this, one route with a few query permutations eats the
 * whole page budget and genuinely distinct routes never get visited.
 */
function pageIdentity(url: string): string {
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname.replace(/\/$/, '')}`
  } catch {
    return url
  }
}

export interface CaptureOptions {
  viewports: Viewport[]
  outDir: string
  /** Playwright storageState from a completed login; audits run signed-in. */
  storageState?: string
  /** Called as each page completes, so a cancelled crawl keeps finished work. */
  onPage?: (page: CapturedPage) => void
  /** Safety net for unlimited crawls; omit for no time limit. */
  budgetMs?: number
  /** Cooperative stop (cancellation) checked between pages. */
  shouldStop?: () => boolean
  onLog?: (msg: string) => void
}

export async function capturePage(
  browser: Browser,
  rawUrl: string,
  opts: CaptureOptions
): Promise<CapturedPage> {
  let url = normalizeTargetUrl(rawUrl) ?? rawUrl
  const consoleErrors: string[] = []
  const networkFailures: { url: string; status: number | string }[] = []
  const screenshots: Record<string, string> = {}
  const responsive: CapturedPage['responsive'] = []
  const slug = url.replace(/https?:\/\//, '').replace(/[^a-z0-9]/gi, '_').slice(0, 60)

  let extracted: any = null
  let axe: AxeViolation[] = []
  let cssStats: CapturedPage['cssStats'] = null
  let status = 0
  let ok = true
  let errorText: string | undefined
  let sections: PageSection[] = []

  for (const vp of opts.viewports) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile,
      deviceScaleFactor: 1,
      // axe + extraction are injected scripts; strict CSP sites would block them
      bypassCSP: true,
      ...(opts.storageState ? { storageState: opts.storageState } : {}),
      userAgent: vp.isMobile
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        : undefined
    })
    const page = await ctx.newPage()
    await page.addInitScript(observerInit)

    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(`[${vp.name}] ${m.text().slice(0, 300)}`)
    })
    page.on('pageerror', (e) => consoleErrors.push(`[${vp.name}] pageerror: ${e.message.slice(0, 300)}`))
    page.on('requestfailed', (r) =>
      networkFailures.push({ url: r.url().slice(0, 200), status: r.failure()?.errorText ?? 'failed' })
    )
    page.on('response', (r) => {
      if (r.status() >= 400) networkFailures.push({ url: r.url().slice(0, 200), status: r.status() })
    })

    try {
      const res = await withRetry(
        `goto ${url} (${vp.name})`,
        2,
        async () => {
          try {
            return await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
          } catch (e) {
            // Local dev servers are usually http even when https was typed
            // (and vice versa). Flip the scheme once before giving up.
            const alt = schemeFallback(url)
            if (!alt) throw e
            opts.onLog?.(`retrying ${url} as ${alt}`)
            const r = await page.goto(alt, { waitUntil: 'domcontentloaded', timeout: 45_000 })
            url = alt
            return r
          }
        },
        opts.onLog
      )
      if (vp.name === opts.viewports[0].name) status = res?.status() ?? 0
      await page.waitForTimeout(1200)
      try {
        await page.waitForLoadState('networkidle', { timeout: 8000 })
      } catch {
        /* long-poll sites never idle */
      }
      // Trigger lazy content, then return to top for a clean screenshot.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(700)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(400)

      const shot = join(opts.outDir, `${slug}-${vp.name}.png`)
      await page.screenshot({ path: shot, fullPage: true, animations: 'disabled' })
      screenshots[vp.name] = shot

      const data = await page.evaluate(extractFn)
      responsive.push({
        viewport: vp.name,
        horizontalOverflowPx: data.responsive.horizontalOverflowPx,
        tinyTextCount: data.responsive.tinyTextCount,
        smallTapTargets: data.responsive.smallTapTargets,
        overlaps: data.responsive.overlaps
      })

      if (vp.name === opts.viewports[0].name) {
        extracted = data
        sections = data.sections as PageSection[]
        // Per-section screenshots make the Gemini critique and the report concrete.
        for (const s of sections.slice(0, 14)) {
          try {
            const el = page.locator(s.selector).first()
            const file = join(opts.outDir, `${slug}-${s.id}.png`)
            await el.screenshot({ path: file, timeout: 6000 })
            s.screenshot = file
          } catch {
            /* selector drifted; section still reported */
          }
        }
        // Authored CSS: same-origin text came back inline; fetch the rest.
        try {
          let cssText: string = data.css?.text ?? ''
          for (const href of data.css?.external ?? []) {
            try {
              const res = await ctx.request.get(href, { timeout: 8000 })
              if (res.ok()) cssText += '\n' + (await res.text())
            } catch {
              /* blocked or gone */
            }
          }
          cssStats = analyzeCss(cssText, data.css?.sheetCount ?? 0)
        } catch (e) {
          opts.onLog?.(`css analysis failed on ${url}: ${(e as Error).message}`)
        }

        try {
          // Official Deque integration: handles iframes, CSP and version drift.
          const result: any = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
            .analyze()
          axe = (result.violations ?? []).map((v: any) => ({
            id: v.id,
            impact: v.impact ?? null,
            help: v.help,
            helpUrl: v.helpUrl,
            nodes: (v.nodes ?? []).slice(0, 5).map((n: any) => ({
              target: n.target,
              failureSummary: (n.failureSummary ?? '').slice(0, 400)
            }))
          }))
        } catch (e) {
          opts.onLog?.(`axe failed on ${url}: ${(e as Error).message}`)
        }
      }
    } catch (e) {
      ok = false
      errorText = (e as Error).message
      opts.onLog?.(`capture failed (${vp.name}) ${url}: ${errorText}`)
    } finally {
      await ctx.close()
    }
  }

  const perf = extracted?.perf ?? {}
  return {
    url,
    title: extracted?.title ?? '',
    ok,
    status,
    errorText,
    screenshots,
    sections,
    tokens: extracted?.tokens ?? {
      colors: [], fontFamilies: [], fontSizes: [], fontWeights: [], radii: [], shadows: [], spacing: [], transitions: []
    },
    axe,
    cssStats,
    metrics: {
      ttfbMs: perf.ttfbMs ?? 0,
      domContentLoadedMs: perf.domContentLoadedMs ?? 0,
      loadMs: perf.loadMs ?? 0,
      lcpMs: perf.lcpMs ?? null,
      cls: perf.cls ?? null,
      transferBytes: perf.transferBytes ?? 0,
      requestCount: perf.requestCount ?? 0,
      longTaskMs: perf.longTaskMs ?? 0
    },
    consoleErrors: [...new Set(consoleErrors)].slice(0, 40),
    networkFailures: networkFailures.slice(0, 40),
    controls: extracted?.controls ?? [],
    responsive,
    links: extracted?.links ?? [],
    // signals ride along for the heuristic pass
    ...({ signals: extracted?.signals ?? {} } as any)
  }
}

/** Breadth-first same-origin crawl. */
/**
 * Breadth-first same-origin crawl.
 *
 * `maxPages <= 0` means no page limit: keep going until the site runs out of
 * distinct routes. A wall-clock budget is still honoured so an infinite/
 * generated URL space cannot trap the run forever.
 */
export async function crawl(
  browser: Browser,
  rawStartUrl: string,
  maxPages: number,
  opts: CaptureOptions
): Promise<CapturedPage[]> {
  const startUrl = normalizeTargetUrl(rawStartUrl) ?? rawStartUrl
  const first = normalize(startUrl)
  const queue = [first]
  const visited = new Set<string>()
  const seenPaths = new Set<string>()
  const pages: CapturedPage[] = []
  const unlimited = !maxPages || maxPages <= 0
  const pageLimit = unlimited ? Number.POSITIVE_INFINITY : maxPages
  const deadline = opts.budgetMs ? Date.now() + opts.budgetMs : Number.POSITIVE_INFINITY

  if (unlimited) opts.onLog?.('crawling every reachable same-origin route (no page limit)')

  while (queue.length && pages.length < pageLimit) {
    if (Date.now() > deadline) {
      opts.onLog?.(`crawl time budget reached after ${pages.length} page(s); ${queue.length} route(s) left unvisited`)
      break
    }
    if (opts.shouldStop?.()) {
      opts.onLog?.(`crawl stopped after ${pages.length} page(s)`)
      break
    }
    const url = queue.shift()!
    const identity = pageIdentity(url)
    if (visited.has(url) || seenPaths.has(identity)) continue
    visited.add(url)
    seenPaths.add(identity)

    opts.onLog?.(`capturing ${url}`)
    const page = await capturePage(browser, url, opts)
    pages.push(page)
    opts.onPage?.(page)

    const candidates = page.links
      .map(normalize)
      .filter((l) => sameOrigin(l, startUrl))
      .filter((l) => !visited.has(l) && !seenPaths.has(pageIdentity(l)))
      .filter((l) => !/\.(pdf|zip|png|jpe?g|svg|webp|gif|mp4|dmg|exe|css|js|xml|txt|rss)$/i.test(l))
      .filter((l) => !/\/(cdn-cgi|api|_next|static|assets)\//i.test(l))

    // One entry per distinct path, highest value first.
    const byPath = new Map<string, string>()
    for (const l of candidates) {
      const id = pageIdentity(l)
      const existing = byPath.get(id)
      // Prefer the cleaner URL (no query string) for a given path.
      if (!existing || (existing.includes('?') && !l.includes('?'))) byPath.set(id, l)
    }

    const queuedPaths = new Set(queue.map(pageIdentity))
    const ranked = [...byPath.values()]
      .filter((l) => !queuedPaths.has(pageIdentity(l)))
      .sort((a, b) => score(b) - score(a) || depth(a) - depth(b) || a.length - b.length)

    for (const l of ranked) {
      queue.push(l)
      queuedPaths.add(pageIdentity(l))
    }
  }

  if (queue.length === 0) {
    opts.onLog?.(
      `crawl exhausted the site: ${pages.length} distinct route(s) captured, no further same-origin links found`
    )
  }
  return pages
}

function depth(u: string): number {
  try {
    return new URL(u).pathname.split('/').filter(Boolean).length
  } catch {
    return 9
  }
}
/** Product surfaces first, legal/blog boilerplate last. */
function score(u: string): number {
  if (/\/(privacy|terms|legal|cookie|imprint|dpa|sitemap)/i.test(u)) return -2
  if (/\/(blog|news|press|changelog|careers|jobs)\/.+/i.test(u)) return -1
  if (/(pricing|signup|sign-up|register|login|sign-in|checkout|cart|account|dashboard|settings)/i.test(u)) return 3
  if (/(product|features|solutions|platform|use-cases|integrations|templates|components|blocks)/i.test(u)) return 2
  if (/(docs|documentation|guide|about|contact|support)/i.test(u)) return 1
  return 0
}

/* --------------------------------- flows --------------------------------- */

export async function runFlow(
  browser: Browser,
  baseUrl: string,
  flow: { name: string; steps: FlowStep[]; invalid?: string; origin?: FlowResult['origin'] },
  outDir: string,
  storageState?: string
): Promise<FlowResult> {
  const origin = flow.origin ?? 'user'
  // A flow whose targets do not exist is not a product failure; do not spend
  // 15s per step proving it, and do not blame the site for it.
  if (flow.invalid) {
    return {
      name: flow.name,
      steps: flow.steps.map((step) => ({ step, ok: false, ms: 0, skipped: true, error: 'not run — target does not exist' })),
      ok: false,
      totalMs: 0,
      origin,
      invalid: flow.invalid
    }
  }
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(storageState ? { storageState } : {})
  })
  const page = await ctx.newPage()
  const results: FlowResult['steps'] = []
  const started = Date.now()
  let ok = true

  for (let i = 0; i < flow.steps.length; i++) {
    const step = flow.steps[i]
    const t0 = Date.now()
    try {
      await execStep(page, step, baseUrl)
      const shot = join(outDir, `flow-${flow.name.replace(/\W+/g, '_')}-${i}.png`)
      await page.screenshot({ path: shot })
      results.push({ step, ok: true, ms: Date.now() - t0, screenshot: shot })
    } catch (e) {
      ok = false
      const shot = join(outDir, `flow-${flow.name.replace(/\W+/g, '_')}-${i}-FAIL.png`)
      try {
        await page.screenshot({ path: shot })
      } catch {
        /* page may be gone */
      }
      results.push({ step, ok: false, ms: Date.now() - t0, error: (e as Error).message.slice(0, 300), screenshot: shot })
      break
    }
  }
  await ctx.close()
  return { name: flow.name, steps: results, ok, totalMs: Date.now() - started, origin }
}

async function execStep(page: Page, step: FlowStep, baseUrl: string): Promise<void> {
  // Short: a target that exists is found in well under this, and a target that
  // does not exist should fail fast rather than stalling the whole run.
  const timeout = 6000
  switch (step.action) {
    case 'goto':
      await page.goto(new URL(step.target ?? '/', baseUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 })
      // Give client-rendered views a chance to paint before the next step.
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(500)
      return
    case 'click':
      await resolve(page, step.target!).click({ timeout })
      await page.waitForTimeout(700)
      return
    case 'fill':
      await resolve(page, step.target!).fill(step.value ?? '', { timeout })
      return
    case 'press':
      await page.keyboard.press(step.value ?? 'Enter')
      await page.waitForTimeout(700)
      return
    case 'scroll':
      await page.evaluate(() => window.scrollBy(0, window.innerHeight))
      await page.waitForTimeout(400)
      return
    case 'wait':
      await page.waitForTimeout(Number(step.value ?? 1000))
      return
    case 'assertText': {
      const needle = step.value ?? step.target ?? ''
      if (!needle) throw new Error('assertText step has no text to assert')
      // waitFor polls until the timeout; isVisible() answers immediately and
      // therefore reports "missing" for anything that renders just after
      // navigation — producing false "this journey is broken" findings.
      try {
        await page.getByText(needle, { exact: false }).first().waitFor({ state: 'visible', timeout })
      } catch {
        throw new Error(`text not visible after ${timeout}ms: ${needle}`)
      }
      return
    }
  }
}

/** `text=`, `role=`, or raw CSS/XPath selector. */
function resolve(page: Page, target: string) {
  if (target.startsWith('text=')) return page.getByText(target.slice(5), { exact: false }).first()
  if (target.startsWith('role=')) {
    const [role, name] = target.slice(5).split(':')
    return page.getByRole(role as any, name ? { name } : undefined).first()
  }
  if (target.startsWith('label=')) return page.getByLabel(target.slice(6)).first()
  if (target.startsWith('placeholder=')) return page.getByPlaceholder(target.slice(12)).first()
  return page.locator(target).first()
}
