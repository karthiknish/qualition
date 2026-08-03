/**
 * Playwright capture layer: crawl pages, screenshot every viewport, extract
 * design tokens + sections, run axe-core, record console/network failures,
 * and replay user flows.
 */
import { chromium, type Browser, type Page } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { join } from 'node:path'
import { extractFn, observerInit, responsiveOnlyFn } from './extract.js'
import { analyzeCss } from './cssAudit.js'
import { partitionCssSheets, type CssSheetInput } from './cssScope.js'
import { buildTokenDictionary } from './tokens.js'
import { DEV_CHROME_EXCLUDE_LIST, hideDevChrome, installDevChromeGuard } from './devChrome.js'
import { configurePlaywrightBrowsersPath } from './browsers.js'
import { normalizeTargetUrl, schemeFallback, isIgnoredPage } from '../../shared/url.js'
import type {
  AxeViolation,
  CapturedPage,
  FlowResult,
  FlowStep,
  PageSection,
  TokenDictionary,
  Viewport
} from '../../shared/types.js'

/**
 * axe reports whatever selector uniquely identifies a node, which on a modern
 * build is a wall of generated hashes
 * (`.styles-module__row___a1B2c`, `.x1o57wo1`). Those cannot be grepped for and
 * change every deploy, so strip them and keep only what a human can act on.
 */
export function sanitizeSelector(selector: string): string {
  const hashed = (c: string): boolean =>
    /^(css-|sc-|jsx-|emotion-|svelte-|_)/.test(c) ||
    /__[A-Za-z0-9][A-Za-z0-9_-]{3,}$/.test(c) ||
    /^[a-z]{1,2}[0-9a-z]{6,}$/.test(c) ||
    /^[a-f0-9]{6,}$/i.test(c)

  // A class name ends at the next combinator, pseudo-class or attribute
  // selector. Consuming those too meant `.foo___a1B2c:nth-child(1)` was tested
  // as one token, the end-anchored hash patterns missed it, and the hash was
  // printed verbatim.
  const cleaned = selector
    .split(/\s*>\s*/)
    .map((step) => step.replace(/\.(-?[A-Za-z_][\w-]*)/g, (match, cls: string) => (hashed(cls) ? '' : match)))
    .map((step) => step.trim())
    // `.foo___a1B2c:nth-child(1)` -> `:nth-child(1)` is meaningless on its own.
    .map((step) => (step.startsWith(':') ? step.replace(/^(:[\w-]+(\([^)]*\))?)+/, '').trim() : step))
    .filter(Boolean)
    .join(' > ')

  // Nothing meaningful left (e.g. "div > div")? Say so rather than pretending.
  return /[#.\[]/.test(cleaned) ? cleaned : `${cleaned || selector} (no stable selector — generated class names only)`
}

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
  // Headless Chromium can soft-lose document focus so Tab sweeps report zero
  // stops (playwright#39268). Interaction probes call bringToFront() + seed
  // focus on a real control before Tabing; keep launch minimal.
  configurePlaywrightBrowsersPath()
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
  /** Path/URL patterns to skip (never captured). Seed URL is always kept. */
  ignorePages?: string[]
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
  let tokenDictionary: TokenDictionary | null = null
  let status = 0
  let ok = true
  let errorText: string | undefined
  let sections: PageSection[] = []
  const toolFailures: { tool: string; message: string }[] = []
  let hiddenChromeTotal = 0

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
    // Install before navigation so __qualitionIsDevChrome exists on first paint.
    await installDevChromeGuard(page).catch(() => {})

    page.on('console', (m) => {
      if (m.type() !== 'error') return
      const text = m.text().slice(0, 300)
      if (isNoisyConsole(text)) return
      consoleErrors.push(`[${vp.name}] ${text}`)
    })
    page.on('pageerror', (e) => {
      const text = e.message.slice(0, 300)
      if (isNoisyConsole(text)) return
      consoleErrors.push(`[${vp.name}] pageerror: ${text}`)
    })
    page.on('requestfailed', (r) => {
      const u = r.url()
      if (isNoisyNetworkUrl(u)) return
      networkFailures.push({ url: u.slice(0, 200), status: r.failure()?.errorText ?? 'failed' })
    })
    page.on('response', (r) => {
      if (r.status() < 400) return
      const u = r.url()
      if (isNoisyNetworkUrl(u)) return
      // Favicon / sourcemap 404s are noise; keep app API and document failures.
      if (r.status() === 404 && isBenign404(u)) return
      networkFailures.push({ url: u.slice(0, 200), status: r.status() })
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
      // App shells scroll inside overflow panes (not document). Sweep those so
      // lazy rows hydrate and detail cards exist before we screenshot/extract.
      await scrollAppShells(page)
      await page.waitForTimeout(400)

      // Hide Agentation / Vercel toolbar / similar before we screenshot or walk the DOM.
      // MutationObserver (from installDevChromeGuard) re-hides remounts.
      const hiddenChrome = await hideDevChrome(page)
      if (hiddenChrome > 0) {
        hiddenChromeTotal += hiddenChrome
        opts.onLog?.(`hid ${hiddenChrome} dev-chrome node(s) (Agentation etc.) on ${url}`)
      }

      const shot = join(opts.outDir, `${slug}-${vp.name}.png`)
      await page.screenshot({ path: shot, fullPage: true, animations: 'disabled' })
      screenshots[vp.name] = shot

      const isPrimary = vp.name === opts.viewports[0].name

      if (!isPrimary) {
        // Light pass: responsive metrics only — axe/CSS/sections stay on desktop.
        const light = await page.evaluate(responsiveOnlyFn)
        responsive.push({
          viewport: vp.name,
          horizontalOverflowPx: light.horizontalOverflowPx,
          tinyTextCount: light.tinyTextCount,
          smallTapTargets: light.smallTapTargets,
          overlaps: light.overlaps
        })
      } else {
        const data = await page.evaluate(extractFn)
        responsive.push({
          viewport: vp.name,
          horizontalOverflowPx: data.responsive.horizontalOverflowPx,
          tinyTextCount: data.responsive.tinyTextCount,
          smallTapTargets: data.responsive.smallTapTargets,
          overlaps: data.responsive.overlaps
        })

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
        // Authored CSS: same-origin text came back per-sheet; fetch the rest in parallel.
        try {
          const sheetInputs: CssSheetInput[] = Array.isArray(data.css?.sheets)
            ? data.css.sheets.map((s: { href?: string | null; text?: string }) => ({
                href: s.href ?? null,
                text: s.text ?? ''
              }))
            : data.css?.text
              ? [{ href: null, text: String(data.css.text) }]
              : []

          let missedExternals = 0
          const externalList: string[] = data.css?.external ?? []
          const fetched = await Promise.all(
            externalList.map(async (href) => {
              try {
                const res = await ctx.request.get(href, { timeout: 8000 })
                if (res.ok()) return { href, text: await res.text(), ok: true as const }
                return { href, ok: false as const }
              } catch {
                return { href, ok: false as const }
              }
            })
          )
          for (const f of fetched) {
            if (f.ok) sheetInputs.push({ href: f.href, text: f.text })
            else missedExternals++
          }
          // Cap was applied in-page for listed externals; anything beyond still counts as missed.
          if (data.css?.missedExternalCap) missedExternals += Math.max(0, (data.css?.external?.length ?? 0) === 30 ? 1 : 0)

          const partition = partitionCssSheets(sheetInputs, url)
          cssStats = analyzeCss(partition.analysis, partition.scoped ? partition.sheetCounts.app : partition.sheetCounts.total, {
            attribution: {
              scoped: partition.scoped,
              appBytes: partition.bytes.app,
              frameworkBytes: partition.bytes.framework,
              vendorBytes: partition.bytes.vendor,
              totalBytes: partition.bytes.total,
              appSheets: partition.sheetCounts.app,
              frameworkSheets: partition.sheetCounts.framework,
              vendorSheets: partition.sheetCounts.vendor,
              missedExternals,
              truncated: !!data.css?.truncated,
              styleAttrCount: Number(data.css?.styleAttrCount ?? 0),
              adoptedSheetCount: Number(data.css?.adoptedSheetCount ?? 0)
            }
          })
          try {
            const slugTok = slug.replace(/_+/g, '-').slice(0, 40) || 'page'
            // Tokens from first-party CSS when available; otherwise full concat.
            tokenDictionary = await buildTokenDictionary(
              partition.scoped ? partition.app : partition.analysis,
              opts.outDir,
              slugTok
            )
          } catch (e) {
            opts.onLog?.(`token extract failed on ${url}: ${(e as Error).message}`)
          }
        } catch (e) {
          opts.onLog?.(`css analysis failed on ${url}: ${(e as Error).message}`)
        }

        try {
          // Re-hide in case Agentation remounted during CSS fetch / section shots.
          await hideDevChrome(page)
          // Official Deque integration: handles iframes, CSP and version drift.
          // Exclude known debug overlays so a remount race cannot invent button-name
          // findings for Agentation's styles-module__controlButton icons.
          let builder = new AxeBuilder({ page }).withTags([
            'wcag2a',
            'wcag2aa',
            'wcag21a',
            'wcag21aa',
            'wcag22a',
            'wcag22aa',
            'best-practice'
          ])
          for (const sel of DEV_CHROME_EXCLUDE_LIST) {
            try {
              builder = builder.exclude(sel)
            } catch {
              /* invalid selector for this axe version — skip */
            }
          }
          const result: any = await builder.analyze()
          axe = (result.violations ?? []).map((v: any) => ({
            id: v.id,
            impact: v.impact ?? null,
            help: v.help,
            helpUrl: v.helpUrl,
            nodes: (v.nodes ?? []).slice(0, 5).map((n: any) => ({
              target: (n.target ?? []).map((t: string) => sanitizeSelector(String(t))),
              failureSummary: (n.failureSummary ?? '').slice(0, 400)
            }))
          }))
        } catch (e) {
          const msg = (e as Error).message.slice(0, 200)
          opts.onLog?.(`axe failed on ${url}: ${msg}`)
          toolFailures.push({ tool: 'axe', message: msg })
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
  const build = extracted?.buildContext ?? {
    buildMode: 'unknown' as const,
    isLocalTarget: false,
    buildHints: [] as string[]
  }
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
    tokenDictionary,
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
    networkFailures: dedupeNetwork(networkFailures).slice(0, 40),
    toolFailures: toolFailures.length ? toolFailures : undefined,
    controls: extracted?.controls ?? [],
    captureContext: {
      buildMode: build.buildMode,
      isLocalTarget: !!build.isLocalTarget,
      hiddenDevChromeNodes: hiddenChromeTotal,
      buildHints: build.buildHints ?? [],
      excludedDevChromeControls: Number(extracted?.signals?.excludedDevChromeControls ?? 0) || undefined
    },
    signals: extracted?.signals ?? {},
    responsive,
    links: extracted?.links ?? []
  }
}

/** Devtools / extension / HMR noise that should not tank the flow score. */
function isNoisyConsole(text: string): boolean {
  return (
    /Download the React DevTools/i.test(text) ||
    /\[HMR\]|\[vite\]|Fast Refresh|webpackHotUpdate/i.test(text) ||
    /third-party cookie|Deprecated.*Synchronous XMLHttpRequest/i.test(text) ||
    /Failed to load resource:.*favicon/i.test(text) ||
    /net::ERR_BLOCKED_BY_CLIENT|ERR_FAILED.*chrome-extension/i.test(text) ||
    /Agentation|react-scan|stagingwise/i.test(text)
  )
}

function isNoisyNetworkUrl(u: string): boolean {
  return (
    /chrome-extension:|moz-extension:/i.test(u) ||
    /\/favicon\.ico(\?|$)/i.test(u) ||
    /hot-update|__vite|@react-refresh|sockjs-node|webpack-hmr/i.test(u) ||
    /googletagmanager|google-analytics|doubleclick|facebook\.net\/tr/i.test(u)
  )
}

function isBenign404(u: string): boolean {
  return /\.(map|ico|woff2?|ttf|eot)(\?|$)/i.test(u) || /\/favicon/i.test(u) || /apple-touch-icon/i.test(u)
}

function dedupeNetwork(
  rows: { url: string; status: number | string }[]
): { url: string; status: number | string }[] {
  const seen = new Set<string>()
  const out: typeof rows = []
  for (const r of rows) {
    const key = `${r.status}|${r.url}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

/**
 * Scroll overflow panes used by app shells, then the document. Window-only
 * scroll misses list rows that live inside `overflow:auto` main columns.
 */
export async function scrollAppShells(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const panes = Array.from(document.querySelectorAll('main, [role=main], [class*=layout-content], [class*=scroll]'))
      .concat(Array.from(document.querySelectorAll('*')))
      .filter((el, i, arr) => arr.indexOf(el) === i)
      .filter((el) => {
        const s = getComputedStyle(el)
        const oy = s.overflowY
        return (oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight + 48
      })
      .slice(0, 6)
    for (const el of panes) {
      const top = el.scrollTop
      el.scrollTop = el.scrollHeight
      await sleep(280)
      el.scrollTop = 0
      await sleep(120)
      el.scrollTop = top
    }
    window.scrollTo(0, document.body.scrollHeight)
    await sleep(400)
    window.scrollTo(0, 0)
  })
}

/** True when `candidate` is a same-origin path nested under `parent`. */
export function isDeeperRoute(parent: string, candidate: string): boolean {
  try {
    const p = new URL(parent)
    const c = new URL(candidate)
    if (p.origin !== c.origin) return false
    const pp = p.pathname.replace(/\/$/, '') || '/'
    const cp = c.pathname.replace(/\/$/, '') || '/'
    if (cp === pp) return false
    return cp.startsWith(pp === '/' ? '/' : pp + '/')
  } catch {
    return false
  }
}

/**
 * Many SPAs open detail routes via onClick/navigate() with no `<a href>`.
 * Click a few cards in the visible main column and collect new URLs.
 */
export async function probeInnerRoutes(
  browser: Browser,
  listUrl: string,
  opts: Pick<CaptureOptions, 'storageState' | 'onLog' | 'shouldStop'> & {
    max?: number
    viewport?: Viewport
  }
): Promise<string[]> {
  const max = opts.max ?? 2
  const vp = opts.viewport ?? DEFAULT_VIEWPORTS[0]
  const found: string[] = []
  const skipTexts: string[] = []
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    bypassCSP: true,
    ...(opts.storageState ? { storageState: opts.storageState } : {})
  })
  const page = await ctx.newPage()
  try {
    await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForTimeout(2500)
    await scrollAppShells(page)
    await page.waitForTimeout(400)

    for (let attempt = 0; attempt < max * 4 && found.length < max; attempt++) {
      if (opts.shouldStop?.()) break
      const before = page.url()
      const pt = await page.evaluate((skipped: string[]) => {
        const mains = Array.from(
          document.querySelectorAll('main, [role=main], [class*=layout-content]')
        ).filter((el) => {
          const r = el.getBoundingClientRect()
          const s = getComputedStyle(el)
          return (
            r.width > 280 &&
            r.height > 180 &&
            s.display !== 'none' &&
            s.visibility !== 'hidden' &&
            Number(s.opacity) > 0.5
          )
        })
        const main = mains.sort(
          (a, b) =>
            b.getBoundingClientRect().width * b.getBoundingClientRect().height -
            a.getBoundingClientRect().width * a.getBoundingClientRect().height
        )[0]
        if (!main) return null

        for (const el of Array.from(main.querySelectorAll('div, article, li, button, a, [role=button], [role=row]'))) {
          if (el.closest('nav, aside, header, [role=navigation], [role=banner]')) continue
          const r = el.getBoundingClientRect()
          const t = (el.textContent ?? '').trim().replace(/\s+/g, ' ')
          if (r.width < 160 || r.height < 48 || r.height > 200) continue
          if (r.top < 72 || r.top > window.innerHeight - 40) continue
          if (t.length < 18 || t.length > 420) continue
          if (skipped.some((s) => t.includes(s) || s.includes(t.slice(0, 40)))) continue
          if (
            /^(all\b|needs you|working|done|failed|start work|search|filter|create|new |show all|sign in)/i.test(
              t
            )
          )
            continue
          // Prefer leaf-ish cards over giant wrappers: stop at first mid-size hit.
          return { x: r.x + Math.min(r.width / 2, 120), y: r.y + Math.min(24, r.height / 3), t: t.slice(0, 80) }
        }
        return null
      }, skipTexts)

      if (!pt) break
      skipTexts.push(pt.t.slice(0, 48))
      await page.mouse.click(pt.x, pt.y)
      await page.waitForTimeout(900)
      const after = normalize(page.url())
      if (after !== normalize(before) && isDeeperRoute(listUrl, after)) {
        if (!found.includes(after)) {
          found.push(after)
          opts.onLog?.(`discovered inner route ${after} from ${listUrl}`)
        }
        await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await page.waitForTimeout(1200)
        await scrollAppShells(page)
      }
    }
  } catch (e) {
    opts.onLog?.(`inner-route probe failed on ${listUrl}: ${(e as Error).message.slice(0, 160)}`)
  } finally {
    await ctx.close().catch(() => {})
  }
  return [...new Set(found)]
}

/**
 * Breadth-first same-origin crawl.
 *
 * `maxPages <= 0` means no page limit: keep going until the site runs out of
 * distinct routes. A wall-clock budget is still honoured so an infinite/
 * generated URL space cannot trap the run forever.
 *
 * After each list-depth page, a small click probe discovers detail routes that
 * SPAs open via navigate() without an `<a href>` (e.g. `/tasks/:id`).
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
  const INNER_BUDGET = Math.min(16, unlimited ? 16 : Math.max(4, Math.floor(pageLimit / 2)))
  let innersFound = 0

  if (unlimited) opts.onLog?.('crawling every reachable same-origin route (no page limit)')
  const ignore = opts.ignorePages?.filter(Boolean) ?? []
  if (ignore.length) opts.onLog?.(`ignoring ${ignore.length} page pattern(s): ${ignore.join(', ')}`)

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

    // Never skip the seed URL — ignore only applies to discovered routes.
    if (url !== first && ignore.length && isIgnoredPage(url, ignore)) {
      opts.onLog?.(`skipping ignored page ${url}`)
      continue
    }

    opts.onLog?.(`capturing ${url}`)
    const page = await capturePage(browser, url, opts)
    pages.push(page)
    opts.onPage?.(page)

    // Detail routes often have no href — click a couple of main-column cards.
    if (innersFound < INNER_BUDGET && depth(url) <= 1 && page.ok && !opts.shouldStop?.()) {
      const room = Math.min(2, INNER_BUDGET - innersFound)
      const desktop =
        (opts.viewports.length ? opts.viewports : DEFAULT_VIEWPORTS).find((v) => !v.isMobile) ??
        DEFAULT_VIEWPORTS[0]
      try {
        const inner = await probeInnerRoutes(browser, page.url, {
          storageState: opts.storageState,
          onLog: opts.onLog,
          max: room,
          viewport: desktop,
          shouldStop: opts.shouldStop
        })
        innersFound += inner.length
        page.links = [...new Set([...(page.links ?? []), ...inner])]
      } catch (e) {
        opts.onLog?.(`inner discovery skipped: ${(e as Error).message.slice(0, 120)}`)
      }
    }

    const candidates = page.links
      .map(normalize)
      .filter((l) => sameOrigin(l, startUrl))
      .filter((l) => !visited.has(l) && !seenPaths.has(pageIdentity(l)))
      .filter((l) => !/\.(pdf|zip|png|jpe?g|svg|webp|gif|mp4|dmg|exe|css|js|xml|txt|rss)$/i.test(l))
      .filter((l) => !/\/(cdn-cgi|api|_next|static|assets)\//i.test(l))
      .filter((l) => !(ignore.length && isIgnoredPage(l, ignore)))

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
      // Prefer deeper product routes (detail pages) slightly over shallow chrome.
      .sort(
        (a, b) =>
          score(b) - score(a) ||
          (isDeeperRoute(url, b) ? 1 : 0) - (isDeeperRoute(url, a) ? 1 : 0) ||
          depth(a) - depth(b) ||
          a.length - b.length
      )

    for (const l of ranked) {
      queue.push(l)
      queuedPaths.add(pageIdentity(l))
    }
  }

  if (queue.length === 0) {
    opts.onLog?.(
      `crawl exhausted the site: ${pages.length} distinct route(s) captured, no further same-origin links found`
    )
  } else if (innersFound > 0) {
    opts.onLog?.(`crawl finished with ${innersFound} inner route(s) discovered via card clicks`)
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
  flow: {
    name: string
    steps: FlowStep[]
    invalid?: string
    origin?: FlowResult['origin']
    refusedFills?: string[]
    startingState?: FlowResult['startingState']
  },
  outDir: string,
  storageState?: string
): Promise<FlowResult> {
  const origin = flow.origin ?? 'user'
  if (flow.invalid) {
    return {
      name: flow.name,
      steps: flow.steps.map((step) => ({
        step,
        ok: false,
        ms: 0,
        skipped: true,
        outcome: 'absent',
        error: 'not run — target does not exist'
      })),
      ok: false,
      totalMs: 0,
      origin,
      invalid: flow.invalid,
      startingState: flow.startingState
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
  const refusedSet = new Set((flow.refusedFills ?? []).map((t) => t.toLowerCase()))

  for (let i = 0; i < flow.steps.length; i++) {
    const step = flow.steps[i]
    const t0 = Date.now()
    const isRefusedFill =
      step.action === 'fill' &&
      (!!step.note?.includes('readonly') || refusedSet.has((step.target ?? '').toLowerCase()))
    try {
      if (isRefusedFill) {
        let snap = ''
        try {
          snap = await page
            .locator(step.target?.startsWith('label=') ? `text=${step.target.slice(6)}` : 'body')
            .first()
            .evaluate((n) => (n.parentElement ?? n).outerHTML.slice(0, 800))
            .catch(() => '')
        } catch {
          /* ignore */
        }
        results.push({
          step,
          ok: true,
          ms: Date.now() - t0,
          skipped: true,
          outcome: 'refused',
          domSnapshot: snap || undefined,
          error: 'control correctly refused fill (readonly/disabled)'
        })
        continue
      }
      await execStep(page, step, baseUrl)
      const shot = join(outDir, `flow-${flow.name.replace(/\W+/g, '_')}-${i}.png`)
      await page.screenshot({ path: shot })
      let domSnapshot: string | undefined
      try {
        if (step.target) {
          domSnapshot = await resolve(page, step.target)
            .first()
            .evaluate((n) => (n.parentElement ?? n).outerHTML.slice(0, 800))
            .catch(() => undefined)
        }
      } catch {
        /* ignore */
      }
      results.push({ step, ok: true, ms: Date.now() - t0, screenshot: shot, outcome: 'ok', domSnapshot })
    } catch (e) {
      const msg = (e as Error).message.slice(0, 300)
      const outcome =
        /timeout|waiting for/i.test(msg) ? ('timeout' as const) : /not found|no element|strict mode/i.test(msg) ? ('absent' as const) : ('error' as const)
      ok = false
      const shot = join(outDir, `flow-${flow.name.replace(/\W+/g, '_')}-${i}-FAIL.png`)
      try {
        await page.screenshot({ path: shot })
      } catch {
        /* page may be gone */
      }
      results.push({
        step,
        ok: false,
        ms: Date.now() - t0,
        error: msg,
        screenshot: shot,
        outcome
      })
      break
    }
  }
  await ctx.close()
  return {
    name: flow.name,
    steps: results,
    ok,
    totalMs: Date.now() - started,
    origin,
    startingState: flow.startingState ?? (storageState ? { storageStateId: storageState, seededDataNote: 'Playwright storageState' } : undefined)
  }
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
      await clickResiliently(page, step.target!, timeout)
      await page.waitForTimeout(700)
      return
    case 'fill': {
      const loc = resolve(page, step.target!).first()
      const blocked = await loc
        .evaluate((node) => {
          const i = node as HTMLInputElement
          return !!(
            i.readOnly ||
            i.disabled ||
            node.getAttribute('aria-disabled') === 'true' ||
            node.getAttribute('aria-readonly') === 'true'
          )
        })
        .catch(() => false)
      if (blocked) {
        // Soft-skip: product-correct refusal — caller records outcome=refused.
        return
      }
      await loc.fill(step.value ?? '', { timeout })
      return
    }
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

/**
 * Text selectors match the deepest node containing the text, which in a
 * component library is usually a decorative <span> inside the real control.
 * Playwright then waits for that span to become "stable and enabled" and times
 * out even though the button beside it is perfectly clickable. So: try the
 * match, then its nearest clickable ancestor, then a forced click.
 */
async function clickResiliently(page: Page, target: string, timeout: number): Promise<void> {
  const primary = resolve(page, target)
  const half = Math.max(1500, Math.round(timeout / 2))

  try {
    await primary.click({ timeout: half })
    return
  } catch (directError) {
    // The nearest interactive ancestor is what a user actually clicks.
    const ancestor = primary.locator('xpath=ancestor-or-self::*[self::a or self::button or self::summary or @role="button" or @role="link" or @role="tab" or @role="menuitem"][1]').first()
    try {
      if (await ancestor.count()) {
        await ancestor.click({ timeout: half })
        return
      }
    } catch {
      /* fall through to the forced attempt */
    }

    // Last resort: the element is there but something (an overlay, an
    // animation that never settles) keeps it from passing the actionability
    // checks. Dispatching the click still proves whether the handler works.
    try {
      await primary.dispatchEvent('click', { timeout: half })
      return
    } catch {
      throw directError
    }
  }
}

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
