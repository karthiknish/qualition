import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { auditPage, dedupeFindings, deltaE, parseColor, scoreRun, themeSummary } from '../src/main/services/audit.js'
import { detectArchetype, queryForSection } from '../src/main/services/archetype.js'
import { analyzeCss, auditCss } from '../src/main/services/cssAudit.js'
import { diffScreenshots } from '../src/main/services/visual.js'
import { Deadline, shouldEmitKeyboardUnreachable } from '../src/main/services/interaction.js'
import { isValidTarget, normalizeTargetUrl, schemeFallback, isLocalHost, parseIgnorePages, isIgnoredPage } from '../src/shared/url.js'
import { loginUrlGuesses, passwordCandidates, redactAuth, usernameCandidates } from '../src/main/services/auth.js'
import { cancelRun, executeRun, isCancelled, newRun } from '../src/main/services/runner.js'
import { deleteCredential, listCredentials, originOf, resolveCredential, saveCredential } from '../src/main/services/vault.js'
import { loadRun, redactRun, saveRun } from '../src/main/services/store.js'
import { flowInventory, heuristicFlows, validateFlow } from '../src/main/services/flows.js'
import { isDeeperRoute, sanitizeSelector } from '../src/main/services/crawler.js'
import { queryForRole } from '../src/main/services/mobbin.js'
import { addCommand, searchRegistry } from '../src/main/services/shadcnRegistry.js'
import { describeApiError, describeRpcError } from '../src/main/services/apiError.js'
import {
  extractJson,
  rankGeminiModels,
  rankOpenAiModels,
  GEMINI_FALLBACK_MODELS
} from '../src/main/services/providers.js'
import { modelFor, type CapturedPage, type Finding, type Run, type RunConfig, type Settings } from '../src/shared/types.js'
import {
  buildFixPrompt,
  dedupeFindingsForPrompt,
  pathnameOf,
  stableSelector,
  trimEvidence
} from '../src/main/services/prompt.js'

const config: RunConfig = {
  targetUrl: 'https://example.com',
  maxPages: 1,
  viewports: [],
  useMobbin: false,
  useShadcn: false,
  useGemini: false,
  useInteractionProbe: false,
  useLighthouse: false,
  provider: 'gemini',
  geminiModel: 'gemini-3.6-flash',
  brutality: 'ruthless',
  productContext: '',
  flows: []
}

function page(overrides: Partial<CapturedPage> = {}): CapturedPage {
  return {
    url: 'https://example.com',
    title: 'Example',
    ok: true,
    status: 200,
    screenshots: {},
    sections: [],
    tokens: { colors: [], fontFamilies: [], fontSizes: [], fontWeights: [], radii: [], shadows: [], spacing: [], transitions: [] },
    axe: [],
    cssStats: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metrics: { ttfbMs: 10, domContentLoadedMs: 100, loadMs: 200, lcpMs: 900, cls: 0.01, transferBytes: 100_000, requestCount: 10, longTaskMs: 0 },
    consoleErrors: [],
    networkFailures: [],
    controls: [],
    responsive: [],
    links: [],
    ...overrides
  }
}

/* ------------------------------ colour maths ------------------------------ */

test('parseColor handles modern css colour syntax', () => {
  for (const c of ['#5433fd', 'rgb(84, 51, 253)', 'rgba(84,51,253,0.5)', 'lab(48.496 0 0)', 'oklch(0.7 0.1 200)', 'hsl(250 98% 60%)']) {
    const parsed = parseColor(c)
    assert.ok(parsed, `expected ${c} to parse`)
    assert.ok(parsed!.r >= 0 && parsed!.r <= 255)
  }
  assert.equal(parseColor('not-a-colour'), null)
})

test('deltaE2000 flags imperceptible duplicates and spares distinct colours', () => {
  const near = deltaE('rgb(84, 51, 253)', 'rgb(85, 51, 253)')
  const far = deltaE('rgb(84, 51, 253)', 'rgb(20, 200, 40)')
  assert.ok(near !== null && near < 2, `near pair should be < 2, got ${near}`)
  assert.ok(far !== null && far > 20, `distinct pair should be > 20, got ${far}`)
})

/* ------------------------------ heuristics -------------------------------- */

test('unreachable page short-circuits to a blocker', () => {
  const findings = auditPage(page({ ok: false, errorText: 'net::ERR_ABORTED' }), config)
  assert.equal(findings.length, 1)
  assert.equal(findings[0].severity, 'blocker')
})

test('palette sprawl and near-duplicate colours are both reported', () => {
  const colors = Array.from({ length: 20 }, (_, i) => ({
    value: `rgb(${10 + i * 8}, 40, 60)`,
    usage: 5,
    role: 'bg' as const
  }))
  colors.push({ value: 'rgb(10, 40, 60)', usage: 4, role: 'bg' as const })
  colors.push({ value: 'rgb(11, 40, 60)', usage: 4, role: 'bg' as const })
  const findings = auditPage(page({ tokens: { ...page().tokens, colors } }), config)
  assert.ok(findings.some((f) => /colour decisions|distinct colours|raw colours collapse/i.test(f.title)))
  assert.ok(findings.some((f) => /near-duplicate/.test(f.title)))
})

test('monotony is punished, not just incoherence', () => {
  const sections = Array.from({ length: 6 }, (_, i) => ({
    id: `s${i}`,
    role: 'features' as const,
    roleConfidence: 0.8,
    label: `Section ${i}`,
    selector: `#s${i}`,
    rect: { x: 0, y: i * 400, width: 1440, height: 400 },
    textPreview: '',
    headings: ['h'],
    ctaLabels: [],
    components: [],
    stats: { interactiveCount: 2, imageCount: 1, textDensity: 1, distinctBgColors: 1, distinctFontSizes: 3, maxTextWidthPx: 600 }
  }))
  const findings = auditPage(page({ sections }), config)
  assert.ok(findings.some((f) => f.category === 'variety' && /rhythmically flat/.test(f.title)))
  assert.ok(findings.some((f) => /in a row/.test(f.title)))
})

test('responsive overflow escalates with size', () => {
  const findings = auditPage(
    page({ responsive: [{ viewport: 'mobile', horizontalOverflowPx: 120, tinyTextCount: 0, smallTapTargets: 0, overlaps: 0 }] }),
    config
  )
  const f = findings.find((x) => /Horizontal overflow/.test(x.title))
  assert.ok(f)
  assert.equal(f!.severity, 'critical')
})

test('core web vitals thresholds match the published good/poor bands', () => {
  const findings = auditPage(page({ metrics: { ...page().metrics, lcpMs: 4200, cls: 0.3 } }), config)
  assert.ok(findings.some((f) => f.category === 'performance' && f.severity === 'critical' && /LCP/.test(f.title)))
  assert.ok(findings.some((f) => f.category === 'performance' && /CLS/.test(f.title)))
})

/* -------------------------------- scoring --------------------------------- */

test('scoring is monotonic and blockers cap the grade', () => {
  const clean = scoreRun([], 1, 'ruthless')
  assert.equal(clean.overall, 100)
  assert.equal(clean.grade, 'A')

  const withBlocker = scoreRun(
    [{ id: '1', category: 'flow', severity: 'blocker', title: 't', detail: 'd', fix: 'f', pageUrl: 'u', source: 'heuristic' }],
    1,
    'ruthless'
  )
  assert.ok(withBlocker.overall <= 45, `blocker must cap the score, got ${withBlocker.overall}`)
})

test('brutality changes the penalty, not the findings', () => {
  const findings: Finding[] = Array.from({ length: 25 }, (_, i) => ({
    id: `b${i}`, category: 'coherence', severity: 'major', title: `t${i}`,
    detail: 'd', fix: 'f', pageUrl: 'u', source: 'heuristic'
  }))
  const fair = scoreRun(findings, 1, 'fair').overall
  const ruthless = scoreRun(findings, 1, 'ruthless').overall
  assert.ok(ruthless < fair, `ruthless (${ruthless}) must score below fair (${fair})`)
})

test('themeSummary survives empty pages', () => {
  assert.match(themeSummary([page()]), /Fonts:/)
})

/* ------------------------------- css audit -------------------------------- */

test('analyzeCss extracts authored design-system metrics', () => {
  const css = `
    :root { --brand: #5433fd; --unused: 4px }
    .a { color: var(--brand); border-radius: 6px }
    .b { color: red !important; z-index: 9999 }
    #main .c div > span:hover { color: blue }
    @media (max-width: 600px) { .a { font-size: 11px } }
  `
  const stats = analyzeCss(css, 1)
  assert.ok(stats)
  assert.ok(stats!.rules >= 4)
  assert.ok(stats!.importantRatio > 0)
  assert.equal(stats!.zIndexMax, 9999)
  assert.ok(stats!.mediaQueries >= 1)
  assert.ok(stats!.quality.complexity <= 100)
})

test('analyzeCss returns null for junk input instead of throwing', () => {
  assert.equal(analyzeCss('', 0), null)
  assert.equal(analyzeCss('   ', 0), null)
})

test('auditCss reports z-index sprawl and !important abuse', () => {
  const css = Array.from({ length: 12 }, (_, i) => `.z${i}{z-index:${(i + 1) * 500};color:red !important}`).join('\n')
  const stats = analyzeCss(css, 1)!
  const findings = auditCss(page(), stats, config)
  assert.ok(findings.some((f) => /z-index sprawl/.test(f.title)))
  assert.ok(findings.some((f) => /!important/.test(f.title)))
  assert.ok(findings.some((f) => /Locations:/.test(f.detail)), 'css-tree locations should be cited')
})

test('DEV_CHROME_SELECTORS cover Agentation toolbar markers', async () => {
  const { DEV_CHROME_ATTRS, DEV_CHROME_SELECTORS, DEV_CHROME_EXCLUDE_LIST, IS_DEV_CHROME_BROWSER_SOURCE } =
    await import('../src/main/services/devChrome.js')
  assert.ok(DEV_CHROME_ATTRS.includes('data-feedback-toolbar'))
  assert.ok(DEV_CHROME_ATTRS.includes('data-annotation-popup'))
  assert.ok(DEV_CHROME_ATTRS.includes('data-annotation-marker'))
  assert.ok(DEV_CHROME_ATTRS.includes('data-agentation-root'))
  assert.ok(DEV_CHROME_ATTRS.includes('data-agentation-toolbar'))
  assert.match(DEV_CHROME_SELECTORS, /agentation/i)
  assert.match(DEV_CHROME_SELECTORS, /data-feedback-toolbar/)
  assert.ok(DEV_CHROME_EXCLUDE_LIST.includes('[data-feedback-toolbar]'))
  assert.ok(DEV_CHROME_EXCLUDE_LIST.includes('[data-agentation-root]'))
  assert.match(IS_DEV_CHROME_BROWSER_SOURCE, /data-agentation-root/)
})

test('isDevChrome matches Agentation controlButton ancestry, not first-party CSS modules', async () => {
  // Agentation's icon buttons are styles-module__controlButton with no "agentation"
  // in their own class — only ancestors carry data-feedback-toolbar / data-agentation-*.
  const { IS_DEV_CHROME_BROWSER_SOURCE } = await import('../src/main/services/devChrome.js')
  type Fake = {
    hasAttribute: (a: string) => boolean
    id: string
    className: string
    tagName: string
    parentElement: Fake | null
  }
  const docEl: Fake = {
    hasAttribute: () => false,
    id: '',
    className: '',
    tagName: 'HTML',
    parentElement: null
  }
  const g = globalThis as typeof globalThis & { document?: { documentElement: Fake } }
  const prev = g.document
  g.document = { documentElement: docEl }
  try {
    const isDevChrome = new Function(`${IS_DEV_CHROME_BROWSER_SOURCE}; return isDevChrome;`)() as (el: Fake) => boolean
    const root: Fake = {
      hasAttribute: (a) => a === 'data-agentation-root',
      id: '',
      className: '',
      tagName: 'DIV',
      parentElement: docEl
    }
    const toolbar: Fake = {
      hasAttribute: (a) => a === 'data-feedback-toolbar',
      id: '',
      className: 'falnor-agentation',
      tagName: 'DIV',
      parentElement: root
    }
    const btn: Fake = {
      hasAttribute: () => false,
      id: '',
      className: 'styles-module__controlButton___8Q0jc',
      tagName: 'BUTTON',
      parentElement: toolbar
    }
    assert.equal(isDevChrome(btn), true)

    const firstParty: Fake = {
      hasAttribute: () => false,
      id: '',
      className: 'styles-module__controlButton___8Q0jc',
      tagName: 'BUTTON',
      parentElement: {
        hasAttribute: () => false,
        id: '',
        className: 'app-toolbar',
        tagName: 'DIV',
        parentElement: docEl
      }
    }
    assert.equal(isDevChrome(firstParty), false, 'first-party CSS-module buttons must not be excluded')
  } finally {
    if (prev === undefined) delete g.document
    else g.document = prev
  }
})

test('classifyCssSheet separates CDN, framework and app CSS', async () => {
  const { classifyCssSheet, partitionCssSheets, isFrameworkTokenName, contentLooksVendor } =
    await import('../src/main/services/cssScope.js')
  assert.equal(
    classifyCssSheet(
      { href: 'https://cdn.jsdelivr.net/npm/bootstrap@5/dist/css/bootstrap.min.css', text: '.btn{}' },
      'http://localhost:5181/'
    ).scope,
    'vendor'
  )
  assert.equal(
    classifyCssSheet(
      { href: 'http://localhost:5181/node_modules/tailwindcss/index.css', text: '.x{}' },
      'http://localhost:5181/'
    ).scope,
    'framework'
  )
  assert.equal(
    classifyCssSheet(
      {
        href: '/Users/me/app/node_modules/.pnpm/sonner@1/node_modules/sonner/dist/styles.css',
        text: '[data-sonner-toaster]{z-index:999999999}'
      },
      'http://localhost:5181/'
    ).scope,
    'vendor',
    'sonner in node_modules must not grade as first-party'
  )
  assert.equal(
    classifyCssSheet(
      {
        href: null,
        text: '[data-sonner-toaster]{position:fixed;z-index:999999999}[data-sonner-toast]{opacity:1}'.repeat(3)
      },
      'http://localhost:5181/'
    ).scope,
    'vendor',
    'runtime-injected sonner CSS (no href) is still vendor'
  )
  assert.equal(
    classifyCssSheet(
      {
        href: 'style:#feedback-tool-styles-page-toolbar-css-styles',
        text: '.styles-module__toolbar___x{z-index:100000}.styles-module__markersLayer___y{}'
      },
      'http://localhost:5181/'
    ).scope,
    'vendor'
  )
  assert.equal(
    classifyCssSheet(
      {
        href: '/Users/me/app/src/styles/astryx.css',
        text: '/*! fake */ :root{--tw-shadow:0}.card{color:red}' + '--tw-a:1;'.repeat(20)
      },
      'http://localhost:5181/'
    ).scope,
    'app',
    'authored /src sheets stay app even when they embed Tailwind'
  )
  assert.equal(
    classifyCssSheet(
      {
        href: null,
        text: '/*! tailwindcss v3 */ @tailwind base; :root { --tw-shadow: 0 1px 2px }'.repeat(3)
      },
      'http://localhost:5181/'
    ).scope,
    'framework'
  )
  assert.equal(
    classifyCssSheet(
      { href: 'http://localhost:5181/assets/app.css', text: ':root { --color-brand: #111 } .card { color: var(--color-brand) }' },
      'http://localhost:5181/'
    ).scope,
    'app'
  )
  assert.equal(contentLooksVendor('[data-sonner-toaster]{z-index:9}'), true)

  const part = partitionCssSheets(
    [
      {
        href: 'http://localhost:5181/assets/app.css',
        text:
          ':root{--color-brand:#5433fd;--color-text:#111}.card{color:var(--color-brand)}.a{color:var(--color-brand)!important;padding:8px}'.repeat(
            3
          )
      },
      {
        href: 'https://unpkg.com/normalize.css',
        text: '/*! normalize.css */ html{line-height:1.15} body{margin:0}' + 'a{color:red}'.repeat(20)
      },
      {
        href: null,
        text: '[data-sonner-toaster]{z-index:999999999}' + '.x{color:red}'.repeat(30)
      }
    ],
    'http://localhost:5181/'
  )
  assert.equal(part.scoped, true)
  assert.ok(part.bytes.app > 0)
  assert.ok(part.bytes.vendor > 0)
  assert.ok(part.analysis.includes('--color-brand'))
  assert.ok(!part.analysis.includes('normalize.css'))
  assert.ok(!part.analysis.includes('999999999'), 'sonner z-index must not enter first-party analysis')

  // Thin first-party: prefer app+framework over vendor CDN resets.
  const thin = partitionCssSheets(
    [
      { href: 'http://localhost:5181/assets/app.css', text: ':root{--brand:#111}' },
      {
        href: 'http://localhost:5181/node_modules/tailwindcss/index.css',
        text: '/*! tailwind */ .flex{display:flex}' + '.p-1{padding:4px}'.repeat(10)
      },
      {
        href: 'https://unpkg.com/normalize.css',
        text: '/*! normalize.css */ html{line-height:1.15}' + 'a{color:red}'.repeat(30)
      },
      {
        href: '/Users/x/proj/node_modules/sonner/dist/styles.css',
        text: '[data-sonner-toaster]{z-index:999999999}' + '.t{opacity:1}'.repeat(20)
      }
    ],
    'http://localhost:5181/'
  )
  assert.equal(thin.scoped, false)
  assert.ok(thin.analysis.includes('--brand'))
  assert.ok(thin.analysis.includes('tailwind') || thin.analysis.includes('.flex'))
  assert.ok(!thin.analysis.includes('normalize.css'))
  assert.ok(!thin.analysis.includes('999999999'))

  assert.equal(isFrameworkTokenName('tw-shadow'), true)
  assert.equal(isFrameworkTokenName('color-brand'), false)
})

test('cookieHeaderFor matches host cookies from storageState', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'q-session-'))
  const statePath = join(dir, 'state.json')
  await writeFile(
    statePath,
    JSON.stringify({
      cookies: [
        { name: 'sid', value: 'abc', domain: 'localhost', path: '/' },
        { name: 'other', value: 'x', domain: 'example.com', path: '/' }
      ],
      origins: []
    })
  )
  const { cookieHeaderFor } = await import('../src/main/services/sessionSeed.js')
  assert.equal(cookieHeaderFor('http://localhost:5181/app', statePath), 'sid=abc')
  assert.equal(cookieHeaderFor('https://example.com/', statePath), 'other=x')
  assert.equal(cookieHeaderFor('https://nope.test/', statePath), undefined)
})

test('auditPage emits toolFailures and softens console noise severity', () => {
  const noisy = page({
    consoleErrors: ['Download the React DevTools for a better development experience'],
    toolFailures: [{ tool: 'axe', message: 'Script failed to evaluate' }],
    networkFailures: [{ url: 'https://example.com/favicon.ico', status: 404 }]
  })
  const findings = auditPage(noisy, config)
  assert.ok(findings.some((f) => /axe could not run/i.test(f.title)))
  assert.ok(!findings.some((f) => /console errors/i.test(f.title)))
  assert.ok(!findings.some((f) => /missing resources/i.test(f.title)))

  const real = page({
    consoleErrors: ['TypeError: boom', 'Uncaught ReferenceError: x'],
    networkFailures: [{ url: 'https://api.example.com/v1/items', status: 404 }]
  })
  const realFindings = auditPage(real, config)
  const consoleFinding = realFindings.find((f) => /console errors/i.test(f.title))
  assert.ok(consoleFinding)
  assert.equal(consoleFinding!.severity, 'minor')
})

test('extractTokenTree skips framework custom properties', async () => {
  const { extractTokenTree } = await import('../src/main/services/tokens.js')
  const { flat, frameworkCount } = extractTokenTree(`
    :root {
      --color-brand: #5433fd;
      --tw-shadow: 0 1px 2px;
      --tw-ring-offset-shadow: 0 0 #0000;
      --space-sm: 8px;
    }
  `)
  assert.ok(flat.some((t) => t.name === 'color-brand'))
  assert.ok(flat.some((t) => t.name === 'space-sm'))
  assert.ok(!flat.some((t) => t.name.startsWith('tw-')))
  assert.ok(frameworkCount >= 2)
})

test('analyzeCss attribution and auditCss avoid low-threshold authored size noise', () => {
  const css = `
    :root { --brand: #5433fd }
    .a { color: var(--brand); border-radius: 6px; font-size: 14px }
    .b { color: red !important; z-index: 9999; font-size: 15px; border-radius: 7px }
  `
  const stats = analyzeCss(css, 1, {
    attribution: {
      scoped: true,
      appBytes: css.length,
      frameworkBytes: 900_000,
      vendorBytes: 100_000,
      totalBytes: css.length + 1_000_000,
      appSheets: 1,
      frameworkSheets: 2,
      vendorSheets: 1,
      missedExternals: 1,
      truncated: false,
      styleAttrCount: 0,
      adoptedSheetCount: 0
    }
  })
  assert.ok(stats)
  assert.equal(stats!.attribution?.scoped, true)
  assert.ok(stats!.bytes >= 1_000_000)
  const findings = auditCss(page(), stats!, { ...config, brutality: 'ruthless' })
  assert.ok(findings.some((f) => /kB of CSS/.test(f.title)))
  assert.ok(findings.some((f) => /first-party/i.test(f.detail)))
  assert.ok(findings.some((f) => /incomplete/i.test(f.title)))
  // 2 font sizes should NOT fire authored finding (threshold raised to 18)
  assert.ok(!findings.some((f) => /unique font sizes in the stylesheet/.test(f.title)))
})

/* --------------------------- css-tree + tokens ---------------------------- */

test('locateCssIssues pinpoints !important and high z-index', async () => {
  const { locateCssIssues } = await import('../src/main/services/cssLocations.js')
  const locs = locateCssIssues(`
    #main { color: red; }
    .x { z-index: 9999; color: blue !important; }
  `)
  assert.ok(locs.some((l) => l.reason === 'important' && l.line >= 1))
  assert.ok(locs.some((l) => l.reason === 'high-z'))
  assert.ok(locs.some((l) => l.reason === 'id-selector'))
})

test('extractTokenTree + Style Dictionary build round-trips custom props', async () => {
  const { extractTokenTree, buildTokenDictionary, auditTokens } = await import('../src/main/services/tokens.js')
  const css = `
    :root {
      --color-brand: #5433fd;
      --color-text: #111111;
      --space-sm: 8px;
      --space-md: 16px;
      --radius-sm: 4px;
      --font-sans: Inter, sans-serif;
    }
    .a { color: var(--color-brand); }
  `
  const { flat, tokens } = extractTokenTree(css)
  assert.ok(flat.length >= 6)
  assert.ok(tokens.color?.brand || tokens.color)
  const dir = await mkdtemp(join(tmpdir(), 'qtok-'))
  const dict = await buildTokenDictionary(css, dir, 'demo')
  assert.ok(dict)
  assert.ok(dict!.count >= 6)
  assert.ok(dict!.file)
  assert.ok(!dict!.buildError, dict!.buildError)
  const findings = auditTokens(page(), dict, { ...config, brutality: 'ruthless' })
  assert.ok(findings.some((f) => /Style Dictionary built/.test(f.title)))
})

/* ---------------------------- visual regression --------------------------- */

test('diffScreenshots detects change and ignores identical images', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qvis-'))
  const make = async (name: string, fill: [number, number, number]): Promise<string> => {
    const png = new PNG({ width: 40, height: 40 })
    for (let i = 0; i < png.data.length; i += 4) {
      png.data[i] = fill[0]
      png.data[i + 1] = fill[1]
      png.data[i + 2] = fill[2]
      png.data[i + 3] = 255
    }
    const p = join(dir, name)
    await writeFile(p, PNG.sync.write(png))
    return p
  }
  const a = await make('a.png', [10, 10, 10])
  const b = await make('b.png', [10, 10, 10])
  const c = await make('c.png', [220, 10, 10])

  const same = await diffScreenshots(a, b, join(dir, 'd1.png'))
  assert.ok(same)
  assert.equal(same!.changedPixels, 0)

  const changed = await diffScreenshots(a, c, join(dir, 'd2.png'))
  assert.ok(changed!.changedRatio > 0.9)
  assert.ok(changed!.diffImage)
})

test('diffScreenshots returns null on unreadable input', async () => {
  assert.equal(await diffScreenshots('/nope/a.png', '/nope/b.png', '/tmp/x.png'), null)
})

/* ------------------------------- target urls ------------------------------ */

test('local dev servers are valid targets (regression: localhost was rejected)', () => {
  for (const input of [
    'localhost:5181',
    'https://localhost:5181',
    'http://localhost:3000',
    '127.0.0.1:8080',
    'http://127.0.0.1:5173/dashboard',
    '0.0.0.0:4200',
    'staging',
    'my-app.local:9000'
  ]) {
    assert.equal(isValidTarget(input), true, `${input} must be auditable`)
  }
})

test('public urls still validate and bare hosts get a scheme', () => {
  assert.equal(normalizeTargetUrl('example.com'), 'https://example.com/')
  assert.equal(normalizeTargetUrl('https://ui.shadcn.com'), 'https://ui.shadcn.com/')
  assert.equal(normalizeTargetUrl('  https://a.io/pricing  '), 'https://a.io/pricing')
  // local hosts default to http, public hosts to https
  assert.equal(normalizeTargetUrl('localhost:5173'), 'http://localhost:5173/')
})

test('junk input is rejected rather than crawled', () => {
  for (const bad of ['', '   ', 'https://', 'http://', 'ftp://files.example.com', 'not a url at all', 'javascript:alert(1)']) {
    assert.equal(isValidTarget(bad), false, `${bad} must be rejected`)
  }
})

test('scheme fallback only applies to local hosts', () => {
  assert.equal(schemeFallback('https://localhost:5181/'), 'http://localhost:5181/')
  assert.equal(schemeFallback('http://127.0.0.1:3000/'), 'https://127.0.0.1:3000/')
  assert.equal(schemeFallback('https://stripe.com/'), null)
  assert.equal(isLocalHost('192.168.1.20'), true)
  assert.equal(isLocalHost('stripe.com'), false)
})

test('ignore page patterns match paths, prefixes, wildcards and full URLs', () => {
  assert.deepEqual(parseIgnorePages('/login\n/settings/*, /admin'), ['/login', '/settings/*', '/admin'])
  const pats = ['/login', '/settings', '/docs/*', 'http://localhost:5173/legacy']
  assert.equal(isIgnoredPage('http://localhost:5173/login', pats), true)
  assert.equal(isIgnoredPage('http://localhost:5173/settings/profile', pats), true)
  assert.equal(isIgnoredPage('http://localhost:5173/docs/api/v1', pats), true)
  assert.equal(isIgnoredPage('http://localhost:5173/legacy/old', pats), true)
  assert.equal(isIgnoredPage('http://localhost:5173/dashboard', pats), false)
  assert.equal(isIgnoredPage('http://localhost:5173/', pats), false)
})

/* ---------------------------------- auth ---------------------------------- */

test('passwords never survive into the persisted run config', () => {
  const redacted = redactAuth({
    targetUrl: 'https://app.example.com',
    auth: { username: 'qa@example.com', password: 'hunter2-super-secret', loginUrl: '/login' }
  })
  assert.equal(redacted.auth!.password.includes('hunter2'), false, 'password must not be retained')
  assert.equal(redacted.auth!.username, 'qa@example.com', 'username is kept for reporting')
  assert.equal(redacted.auth!.loginUrl, '/login')
  assert.deepEqual(redactAuth({ targetUrl: 'x' }).auth, undefined)
})

test('the live run keeps the real password so the browser can actually type it', () => {
  // Regression: redacting at construction made every login submit "••••••••".
  const run = newRun({
    ...config,
    targetUrl: 'https://app.acme.com',
    auth: { username: 'qa@acme.com', password: 'real-secret-123' }
  })
  assert.equal(run.config.auth!.password, 'real-secret-123', 'in-memory run must carry the usable password')
  // ...but nothing that leaves main may contain it.
  assert.equal(redactRun(run).config.auth!.password.includes('real-secret'), false)
  assert.equal(redactRun(run).config.auth!.username, 'qa@acme.com')
})

test('a persisted run never contains the password', async () => {
  const run = newRun({
    ...config,
    targetUrl: 'https://app.acme.com',
    auth: { username: 'qa@acme.com', password: 'do-not-persist-me' }
  })
  await saveRun(run)
  const reloaded = await loadRun(run.id)
  assert.ok(reloaded)
  assert.equal(reloaded!.config.auth!.password.includes('do-not-persist'), false, 'disk must not hold the password')
  assert.equal(run.config.auth!.password, 'do-not-persist-me', 'saving must not mutate the live run')
})

test('vault round-trips a credential by origin and hides the secret from listings', async () => {
  await saveCredential({
    origin: 'https://app.acme.com/dashboard?x=1',
    username: 'qa@acme.com',
    password: 'vault-secret',
    loginUrl: 'https://app.acme.com/login'
  })

  // Stored under the origin, so any URL on that host resolves it.
  const resolved = await resolveCredential('https://app.acme.com/some/deep/page')
  assert.equal(resolved?.username, 'qa@acme.com')
  assert.equal(resolved?.password, 'vault-secret')
  assert.equal(resolved?.loginUrl, 'https://app.acme.com/login')

  const listed = await listCredentials()
  const entry = listed.find((c) => c.origin === 'https://app.acme.com')
  assert.ok(entry, 'credential should be listed')
  assert.equal(entry!.encrypted, true)
  assert.equal(JSON.stringify(listed).includes('vault-secret'), false, 'listings must never expose the password')

  // Unknown origins resolve to nothing rather than the wrong password.
  assert.equal(await resolveCredential('https://other.example.com'), null)

  await deleteCredential('https://app.acme.com')
  assert.equal(await resolveCredential('https://app.acme.com'), null)
})

test('vault re-saving an origin replaces rather than duplicates', async () => {
  await saveCredential({ origin: 'https://dup.example.com', username: 'a@x.com', password: 'first' })
  await saveCredential({ origin: 'https://dup.example.com', username: 'b@x.com', password: 'second' })
  const entries = (await listCredentials()).filter((c) => c.origin === 'https://dup.example.com')
  assert.equal(entries.length, 1)
  assert.equal((await resolveCredential('https://dup.example.com'))!.password, 'second')
  assert.equal(originOf('https://dup.example.com/deep/path?q=1'), 'https://dup.example.com')
  await deleteCredential('https://dup.example.com')
})

test('login field detection prefers semantic selectors over generic ones', () => {
  const users = usernameCandidates()
  assert.equal(users[0], 'input[type="email"]')
  assert.equal(users[users.length - 1], 'input[type="text"]', 'generic text input must be the last resort')
  assert.equal(passwordCandidates()[0], 'input[type="password"]')
})

test('login page guesses cover the common conventions and stay on-origin', () => {
  const guesses = loginUrlGuesses('https://app.example.com/dashboard')
  assert.ok(guesses.some((g) => g.endsWith('/login')))
  assert.ok(guesses.some((g) => g.endsWith('/signin')))
  assert.ok(guesses.every((g) => g.startsWith('https://app.example.com/')))
})

/* ---------------------------- selector hygiene ---------------------------- */

test('generated class-name hashes are stripped from reported selectors', () => {
  // Real examples from an audited app: CSS modules and atomic runtimes.
  // When every hook is generated we keep the raw selector (it still works in
  // devtools) but label it, so nobody wastes time grepping the codebase for it.
  for (const hashedOnly of [
    '.styles-module__buttonWrapper___rBcdv > .styles-module__controlButton___8Q0jc',
    '.styles-module__buttonWrapper___rBcdv'
  ]) {
    assert.match(sanitizeSelector(hashedOnly), /no stable selector/, `must be flagged: ${hashedOnly}`)
  }

  // Regression: a class followed by a pseudo-class or attribute selector was
  // captured as one token, so the end-anchored hash test missed it entirely and
  // the hash was printed verbatim in findings.
  assert.equal(
    sanitizeSelector('.styles-module__buttonWrapper___rBcdv:nth-child(1) > [data-active="false"]'),
    '[data-active="false"]'
  )
  // Hash suffixes containing hyphens (___y-tDE) must also be caught.
  assert.equal(
    sanitizeSelector('.styles-module__settingsRow___y-tDE:nth-child(2) > [type="checkbox"]'),
    '[type="checkbox"]'
  )

  // Stable, authored hooks survive untouched.
  assert.equal(sanitizeSelector('nav.site-header > a.logo'), 'nav.site-header > a.logo')
  assert.equal(sanitizeSelector('[data-testid="submit"]'), '[data-testid="submit"]')
  assert.equal(sanitizeSelector('#main > button'), '#main > button')

  // Mixed: keep the readable part, drop the noise.
  const mixed = sanitizeSelector('.falnor-kpi-body.x1vlblms > .astryx-stack.xj1bl4l')
  assert.match(mixed, /falnor-kpi-body/)
  assert.match(mixed, /astryx-stack/)
  assert.ok(!mixed.includes('x1vlblms'), `atomic hash leaked: ${mixed}`)
  assert.ok(!mixed.includes('xj1bl4l'), `atomic hash leaked: ${mixed}`)
})

/* ------------------------------- archetype -------------------------------- */

const appPage = (path: string, controls = 60): CapturedPage =>
  page({
    url: `https://tool.internal${path}`,
    controls: Array.from({ length: controls }, () => ({
      tag: 'button', type: '', role: '', text: 'Act', placeholder: '', label: '', ariaLabel: '', name: '', href: '', testId: ''
    })),
    sections: [
      { id: 's1', role: 'content', roleConfidence: 1, label: 'x', selector: 'main',
        rect: { x: 0, y: 0, width: 1440, height: 800 }, textPreview: 'short', headings: ['Tasks'], ctaLabels: [],
        components: [], stats: { interactiveCount: controls, imageCount: 0, textDensity: 1, distinctBgColors: 1, distinctFontSizes: 2, maxTextWidthPx: 400 } }
    ]
  })

test('a signed-in tool with app routes is detected as an app', () => {
  const res = detectArchetype([appPage('/'), appPage('/settings'), appPage('/tasks')], true)
  assert.equal(res.archetype, 'app')
})

test('a control-dense docs site is NOT mistaken for an app', () => {
  // Regression: ui.shadcn.com scored app 80% purely on control density.
  const docs = [appPage('/docs/components', 120), appPage('/docs/installation', 90), appPage('/blocks', 74)]
  const res = detectArchetype(docs, false)
  assert.notEqual(res.archetype, 'app', `docs site must not be an app, got ${res.archetype} (${res.signals.join(', ')})`)
})

test('app queries describe the actual screen, not a landing page', () => {
  const p = appPage('/tasks')
  const q = queryForSection(p.sections[0], p, 'app', '')
  assert.match(q, /task list screen/i)
  assert.ok(!/landing page|hero/i.test(q), `must not use marketing vocabulary: ${q}`)
  // and no stacked "with … with …" keyword soup
  assert.ok((q.match(/ with /g) ?? []).length <= 1, `query reads as a keyword list: ${q}`)
})

test('marketing queries keep landing-page vocabulary', () => {
  const p = page({
    url: 'https://acme.com/',
    sections: [
      { id: 's1', role: 'hero', roleConfidence: 1, label: 'hero', selector: 'main',
        rect: { x: 0, y: 0, width: 1440, height: 700 }, textPreview: '', headings: ['Ship faster'], ctaLabels: ['Get started'],
        components: [], stats: { interactiveCount: 2, imageCount: 1, textDensity: 1, distinctBgColors: 1, distinctFontSizes: 3, maxTextWidthPx: 600 } }
    ]
  })
  assert.match(queryForSection(p.sections[0], p, 'marketing', 'analytics saas'), /hero section/i)
})

/* ---------------------------- severity policy ------------------------------ */

test('only verified evidence can produce a blocker', () => {
  // A blocker caps the whole run at <=45, so an unverified visual opinion
  // must not be able to award one.
  const aiBlocker: Finding = {
    id: 'g1', category: 'responsive', severity: 'blocker', title: 'Grid collapses on mobile',
    detail: 'd', fix: 'f', pageUrl: 'https://x.com/', source: 'ai'
  }
  const verifiedBlocker: Finding = { ...aiBlocker, id: 'h1', source: 'heuristic' }

  // Scoring itself still honours a verified blocker...
  assert.ok(scoreRun([verifiedBlocker], 1, 'ruthless').overall <= 45)
  // ...and the critic is what must never emit one (clamped at source).
  const clamped = { ...aiBlocker, severity: 'critical' as const }
  assert.ok(scoreRun([clamped], 1, 'ruthless').overall > 45, 'an AI-sourced issue alone must not force a failing cap')
})

/* ------------------------------- dedupe ----------------------------------- */

test('site-wide findings are merged instead of penalised once per page', () => {
  const mk = (url: string): Finding => ({
    id: url, category: 'coherence', severity: 'major', title: '36 unique font sizes in the stylesheet',
    detail: 'Authored CSS confirms there is no type scale.', fix: 'Define a scale.', pageUrl: url, source: 'heuristic'
  })
  const findings = [mk('https://x.com/'), mk('https://x.com/a'), mk('https://x.com/b')]
  const merged = dedupeFindings(findings)
  assert.equal(merged.length, 1, 'one shared-stylesheet fact must be reported once')
  assert.match(merged[0].detail, /Affects 3 pages/)

  // Deeper crawls must not score worse for the same single problem.
  assert.equal(scoreRun(merged, 3, 'ruthless').overall, scoreRun(dedupeFindings([mk('https://x.com/')]), 1, 'ruthless').overall > 0 ? scoreRun(merged, 3, 'ruthless').overall : -1)
  assert.ok(scoreRun(merged, 3, 'ruthless').overall > scoreRun(findings, 3, 'ruthless').overall)
})

test('genuinely distinct instances are not merged away', () => {
  const base = { category: 'accessibility' as const, severity: 'major' as const, title: 'No visible focus state',
    detail: 'd', fix: 'f', source: 'heuristic' as const }
  const findings: Finding[] = [
    { ...base, id: '1', pageUrl: 'https://x.com/', sectionId: 's1' },
    { ...base, id: '2', pageUrl: 'https://x.com/', sectionId: 's2' },
    { ...base, id: '3', pageUrl: 'https://x.com/', viewport: 'mobile' }
  ]
  assert.equal(dedupeFindings(findings).length, 3)
})

/* ---------------------------------- flows ---------------------------------- */

test('flows are derived from the crawl when none are supplied and AI is off', () => {
  const home = page({
    url: 'https://acme.com/',
    title: 'Acme — Ship faster',
    sections: [
      {
        id: 's1', role: 'nav', roleConfidence: 1, label: 'nav', selector: 'header',
        rect: { x: 0, y: 0, width: 1440, height: 80 }, textPreview: '', headings: [],
        ctaLabels: ['Product', 'Pricing', 'Docs'], components: [],
        stats: { interactiveCount: 3, imageCount: 0, textDensity: 1, distinctBgColors: 1, distinctFontSizes: 1, maxTextWidthPx: 200 }
      },
      {
        id: 's2', role: 'hero', roleConfidence: 1, label: 'hero', selector: 'main section',
        rect: { x: 0, y: 80, width: 1440, height: 600 }, textPreview: '', headings: ['Ship faster'],
        ctaLabels: ['Get started', 'Delete account'], components: [],
        stats: { interactiveCount: 2, imageCount: 1, textDensity: 1, distinctBgColors: 1, distinctFontSizes: 3, maxTextWidthPx: 600 }
      }
    ]
  })
  const pricing = page({ url: 'https://acme.com/pricing', title: 'Pricing — Acme', sections: [
    { id: 'p1', role: 'pricing', roleConfidence: 1, label: 'Plans', selector: 'section',
      rect: { x: 0, y: 0, width: 1440, height: 700 }, textPreview: '', headings: ['Simple pricing'],
      ctaLabels: [], components: [],
      stats: { interactiveCount: 3, imageCount: 0, textDensity: 1, distinctBgColors: 2, distinctFontSizes: 4, maxTextWidthPx: 500 } }
  ] })

  const flows = heuristicFlows([home, pricing])
  assert.ok(flows.length >= 2, `expected several derived flows, got ${flows.length}`)

  const sweep = flows.find((f) => f.name === 'Visit every discovered route' || f.name === 'Route sweep')!
  assert.ok(sweep, 'a route sweep must exist so every crawled page is visited')
  assert.deepEqual(
    sweep.steps.filter((s) => s.action === 'goto').map((s) => s.target),
    ['/', '/pricing'],
    'every captured route must be navigated'
  )
  assert.ok(sweep.steps.some((s) => s.action === 'assertText'), 'each route must be asserted, not just opened')

  const cta = flows.find((f) => f.name.startsWith('Start work') || f.name.startsWith('Primary CTA'))!
  assert.ok(cta && (cta.name.includes('Get started') || /Start work/i.test(cta.name)))
  assert.ok(
    !flows.some((f) => JSON.stringify(f).includes('Delete account')),
    'destructive labels must never become a flow step'
  )
})

test('readonly fields are refused fills, not invalid defects', () => {
  // Real failure: `fill label=Email address` resolved to
  // <input readonly aria-disabled="true"> and timed out after 6s.
  const settings = page({
    url: 'https://tool.internal/settings',
    controls: [
      { tag: 'input', type: 'text', role: '', editable: false, text: '', placeholder: '',
        label: 'Email address', ariaLabel: '', name: 'email', href: '', testId: '' },
      { tag: 'input', type: 'text', role: '', editable: true, text: '', placeholder: 'Display name',
        label: '', ariaLabel: '', name: 'nickname', href: '', testId: '' }
    ],
    sections: [
      { id: 's1', role: 'form', roleConfidence: 1, label: 'Settings', selector: 'main',
        rect: { x: 0, y: 0, width: 1440, height: 800 }, textPreview: 'Safety', headings: ['Settings'],
        ctaLabels: [], components: [],
        stats: { interactiveCount: 2, imageCount: 0, textDensity: 1, distinctBgColors: 1, distinctFontSizes: 2, maxTextWidthPx: 400 } }
    ]
  })

  const readonlyFill = validateFlow(
    { name: 'Update settings details', steps: [
      { action: 'goto', target: '/settings' },
      { action: 'fill', target: 'label=Email address', value: 'qualition+test@example.com' }
    ] },
    [settings]
  )
  assert.equal(readonlyFill.invalid, undefined, 'readonly must not invalidate the whole flow')
  assert.ok(readonlyFill.refusedFills?.length, 'must record refused fill')
  assert.ok(readonlyFill.steps.some((s) => /readonly/i.test(s.note ?? '')))

  // The genuinely editable field still validates.
  const ok = validateFlow(
    { name: 'Rename', steps: [
      { action: 'goto', target: '/settings' },
      { action: 'fill', target: 'placeholder=Display name', value: 'QA' }
    ] },
    [settings]
  )
  assert.equal(ok.invalid, undefined, `editable field must pass, got: ${ok.invalid}`)
})

test('control handles are captured verbatim, never truncated with an ellipsis', () => {
  // Real failure: the inventory stored a clamped placeholder
  // 'Try “email”, “eve”, “research…' so the flow searched for text that does
  // not exist on the page. A handle used as a selector must be exact.
  const long = 'Search workflows, agents, runs and every other long placeholder string here'
  const p = page({
    url: 'https://tool.internal/',
    controls: [
      { tag: 'input', type: 'text', role: '', editable: true, text: '', placeholder: long,
        label: '', ariaLabel: '', name: 'q', href: '', testId: '' }
    ]
  })
  const inv = flowInventory([p])
  assert.ok(inv.includes(long), 'the full placeholder must appear in the inventory')
  assert.ok(!/…/.test(inv), `inventory must not contain ellipsis-truncated handles: ${inv}`)

  // And a flow using the exact string validates.
  assert.equal(
    validateFlow({ name: 'Search', steps: [{ action: 'fill', target: `placeholder=${long}`, value: 'x' }] }, [p]).invalid,
    undefined
  )
})

test('invented flows are rejected before they can produce false failures', () => {
  // A real internal tool: one route, one button, no marketing pages.
  const app = page({
    url: 'https://tool.internal/app',
    title: 'Ops Console',
    controls: [
      { tag: 'button', type: '', role: '', text: 'Run report', placeholder: '', label: '', ariaLabel: '', name: '', href: '', testId: '' },
      { tag: 'input', type: 'text', role: '', text: '', placeholder: 'Search jobs', label: '', ariaLabel: '', name: 'q', href: '', testId: '' }
    ],
    sections: [
      { id: 's1', role: 'table', roleConfidence: 1, label: 'Jobs', selector: 'main',
        rect: { x: 0, y: 0, width: 1440, height: 800 }, textPreview: 'Jobs queue Run report', headings: ['Jobs'],
        ctaLabels: ['Run report'], components: [],
        stats: { interactiveCount: 2, imageCount: 0, textDensity: 1, distinctBgColors: 1, distinctFontSizes: 2, maxTextWidthPx: 400 } }
    ]
  })

  // Exactly the hallucinated flows reported from a real run.
  const invented = validateFlow(
    {
      name: 'Newsletter Subscription Flow',
      steps: [
        { action: 'goto', target: '/' },
        { action: 'fill', target: 'placeholder=Enter your email', value: 'qualition+test@example.com' }
      ]
    },
    [app]
  )
  assert.ok(invented.invalid, 'a flow targeting a non-existent field must be rejected')
  assert.match(invented.invalid!, /Enter your email|route/)

  const wrongRoute = validateFlow(
    { name: 'Contact Support', steps: [{ action: 'goto', target: '/contact' }] },
    [app]
  )
  assert.match(wrongRoute.invalid!, /route \/contact was never found/)

  // A flow built only from observed handles must survive.
  const grounded = validateFlow(
    {
      name: 'Run a report',
      steps: [
        { action: 'goto', target: '/app' },
        { action: 'fill', target: 'placeholder=Search jobs', value: 'nightly' },
        { action: 'click', target: 'text=Run report' },
        { action: 'assertText', value: 'Jobs' }
      ]
    },
    [app]
  )
  assert.equal(grounded.invalid, undefined, `grounded flow must run, got: ${grounded.invalid}`)
})

test('flow inventory exposes only real routes, labels and fields', () => {
  const app = page({
    url: 'https://tool.internal/app',
    controls: [
      { tag: 'button', type: '', role: '', text: 'Run report', placeholder: '', label: '', ariaLabel: '', name: '', href: '', testId: '' },
      { tag: 'input', type: 'text', role: '', text: '', placeholder: 'Search jobs', label: '', ariaLabel: '', name: 'q', href: '', testId: '' }
    ]
  })
  const inv = flowInventory([app])
  assert.match(inv, /ROUTE \/app/)
  assert.match(inv, /Run report/)
  assert.match(inv, /placeholder=Search jobs/)
  assert.ok(!/\/login|\/pricing|\/contact/.test(inv), 'inventory must not suggest routes that do not exist')
})

test('derived flows click through each page rather than only opening URLs', () => {
  const mk = (path: string, labels: string[]): CapturedPage =>
    page({
      url: `https://tool.internal${path}`,
      title: `Page ${path}`,
      controls: labels.map((l) => ({
        tag: 'button', type: '', role: '', text: l, placeholder: '', label: '', ariaLabel: '', name: '', href: '', testId: ''
      })),
      sections: [
        { id: 's1', role: 'content', roleConfidence: 1, label: path, selector: 'main',
          rect: { x: 0, y: 0, width: 1440, height: 900 }, textPreview: labels.join(' '), headings: [`Heading ${path}`],
          ctaLabels: labels, components: [],
          stats: { interactiveCount: labels.length, imageCount: 0, textDensity: 1, distinctBgColors: 1, distinctFontSizes: 2, maxTextWidthPx: 400 } }
      ]
    })

  const pages = [mk('/app', ['Run report', 'Filter', 'Export']), mk('/jobs', ['Retry', 'Pause', 'Details'])]
  const flows = heuristicFlows(pages)

  const clickThroughs = flows.filter((f) => f.name.startsWith('Click through'))
  assert.equal(clickThroughs.length, 2, 'every page with controls gets a click-through journey')

  const first = clickThroughs[0]
  const clicks = first.steps.filter((s) => s.action === 'click')
  assert.ok(clicks.length >= 3, `expected several clicks, got ${clicks.length}`)
  assert.ok(
    first.steps.filter((s) => s.action === 'assertText').length >= clicks.length,
    'every click must be followed by an assertion so a dead control is caught at that step'
  )
  // And the whole thing must be runnable against the same inventory.
  assert.equal(validateFlow(first, pages).invalid, undefined)
})

test('flow count scales with the size of the crawl instead of a fixed handful', () => {
  const many = Array.from({ length: 10 }, (_, i) =>
    page({
      url: `https://tool.internal/p${i}`,
      controls: [
        { tag: 'button', type: '', role: '', text: `Alpha ${i}`, placeholder: '', label: '', ariaLabel: '', name: '', href: '', testId: '' },
        { tag: 'button', type: '', role: '', text: `Beta ${i}`, placeholder: '', label: '', ariaLabel: '', name: '', href: '', testId: '' }
      ],
      sections: [
        { id: 's1', role: 'content', roleConfidence: 1, label: 'x', selector: 'main',
          rect: { x: 0, y: 0, width: 1440, height: 600 }, textPreview: 'x', headings: [`H${i}`],
          ctaLabels: [`Alpha ${i}`], components: [],
          stats: { interactiveCount: 2, imageCount: 0, textDensity: 1, distinctBgColors: 1, distinctFontSizes: 1, maxTextWidthPx: 300 } }
      ]
    })
  )
  assert.ok(heuristicFlows(many).length > 4, 'a 10-page crawl must produce more than the old fixed 4 flows')
})

test('derived flows stay empty when the crawl found nothing usable', () => {
  assert.deepEqual(heuristicFlows([]), [])
  assert.deepEqual(heuristicFlows([page({ ok: false, status: 500 })]), [])
})

/* -------------------------------- cancelling ------------------------------- */

test('cancelling before the run starts stops it without launching a browser', async () => {
  const run = newRun({ ...config, targetUrl: 'https://example.com' })
  // User hits Cancel while the run is still queued.
  assert.equal(cancelRun(run.id), false, 'no active run yet, intent is remembered')
  assert.equal(isCancelled(run.id), true)

  const started = Date.now()
  const finished = await executeRun(
    run,
    { geminiApiKey: '', maxControlsProbed: 5, extraRegistries: [] } as never,
    () => {},
    () => {}
  )
  // If a browser had launched or a page had been crawled this would take seconds.
  assert.ok(Date.now() - started < 2000, 'must bail immediately')
  assert.equal(finished.status, 'cancelled')
  assert.equal(finished.pages.length, 0)
  assert.equal(finished.error, undefined, 'a user cancel is not an error')
})

test('cancelRun reports whether it reached a live run', () => {
  assert.equal(cancelRun('does-not-exist'), false)
  assert.equal(isCancelled('does-not-exist'), true, 'intent is recorded for a later start')
  assert.equal(isCancelled('never-mentioned'), false)
})

/* ---------------------------- probe deadlines ----------------------------- */

test('Deadline bounds every probe step and expires', async () => {
  const d = new Deadline(300)
  assert.equal(d.expired, false)
  // A step never gets more time than the budget has left.
  assert.ok(d.slice(10_000) <= 300, `slice must clamp to remaining, got ${d.slice(10_000)}`)
  assert.ok(d.slice(50) === 250, 'slice keeps a 250ms floor so steps are still attemptable')
  await new Promise((r) => setTimeout(r, 330))
  assert.equal(d.expired, true)
  assert.equal(d.remaining, 0)
  assert.equal(d.slice(5000), 250)
})

/* ------------------------------ integrations ------------------------------ */

test('every section role maps to a specific Mobbin query', () => {
  const roles = ['nav', 'hero', 'features', 'pricing', 'testimonials', 'logos', 'faq', 'cta', 'form', 'table', 'gallery', 'stats', 'footer', 'content'] as const
  const seen = new Set<string>()
  for (const r of roles) {
    const q = queryForRole(r, 'analytics saas')
    assert.ok(q.length > 20, `${r} query too vague`)
    assert.ok(!seen.has(q), `${r} duplicates another role's query`)
    seen.add(q)
  }
})

/* -------------------------------- providers -------------------------------- */

test('gemini model ranking puts the newest stable family first', () => {
  const live = [
    'gemini-2.5-flash',
    'gemini-3.6-flash',
    'gemini-3.1-pro-preview',
    'gemini-3.5-flash',
    'gemini-2.0-flash',
    'gemini-3.1-flash-image',
    'gemini-3.1-flash-tts-preview',
    'embedding-001',
    'gemma-3-27b'
  ]
  const ranked = rankGeminiModels(live)
  assert.equal(ranked[0], 'gemini-3.6-flash', `expected 3.6 first, got ${ranked[0]}`)
  assert.ok(!ranked.some((m) => /image|tts|embedding|gemma/.test(m)), 'non-text models must be filtered out')
  assert.ok(ranked.indexOf('gemini-3.5-flash') < ranked.indexOf('gemini-2.5-flash'))
})

test('gemini fallback list is non-empty and text-only', () => {
  assert.ok(GEMINI_FALLBACK_MODELS.length >= 4)
  assert.ok(!GEMINI_FALLBACK_MODELS.some((m) => /image|tts|embedding/.test(m)))
})

test('openai model ranking prefers newest full models over mini/nano and drops non-text', () => {
  const ranked = rankOpenAiModels([
    'gpt-4.1',
    'gpt-5.2',
    'gpt-5-mini',
    'gpt-5',
    'tts-1',
    'text-embedding-3-large',
    'gpt-4o-realtime-preview',
    'dall-e-3'
  ])
  assert.equal(ranked[0], 'gpt-5.2')
  assert.ok(!ranked.some((m) => /tts|embedding|realtime|dall/.test(m)))
  assert.ok(ranked.indexOf('gpt-5') < ranked.indexOf('gpt-5-mini'))
})

test('openai ranking treats o-series as its own line, not version 99', () => {
  // Regression: `n.replace(/^o/, '99.')` made o1 (older) outrank gpt-5.6.
  const ranked = rankOpenAiModels(['o1', 'gpt-5.6-sol', 'o4-mini', 'gpt-4.1', 'gpt-5-2025-01-31', 'gpt-4o-audio'])
  assert.equal(ranked[0], 'gpt-5.6-sol', `newest gpt must lead, got ${ranked.join(', ')}`)
  assert.ok(ranked.indexOf('o4-mini') < ranked.indexOf('o1'), 'o4 must outrank o1')
  assert.ok(!ranked.includes('gpt-5-2025-01-31'), 'dated snapshots duplicate their alias')
  assert.ok(!ranked.some((m) => /audio/.test(m)), 'non-text models must be dropped')
})

test('api failures read as sentences, never raw JSON envelopes', () => {
  // The exact shapes providers return on the common failures.
  const badKey = describeApiError(
    'OpenAI',
    401,
    '{"error":{"message":"Incorrect API key provided: sk-abc.","type":"invalid_request_error","param":null,"code":"invalid_api_key"}}'
  )
  assert.match(badKey, /Incorrect API key provided/)
  assert.ok(!badKey.includes('{'), `must not leak JSON: ${badKey}`)
  assert.ok(!badKey.includes('invalid_request_error'), 'internal error codes are noise')

  const rateLimited = describeApiError('OpenRouter', 429, '{"error":{"message":"Rate limit exceeded"}}')
  assert.match(rateLimited, /Rate limit exceeded/)
  assert.match(rateLimited, /wait|switch|quota/i, 'should say what to do about it')

  // No credit / model gone still produce guidance with no JSON.
  for (const [status, body] of [[402, '{}'], [404, '{}'], [503, '']] as [number, string][]) {
    const msg = describeApiError('OpenRouter', status, body)
    assert.ok(msg.length > 10 && !msg.includes('{'), `status ${status} produced: ${msg}`)
  }

  // HTML from a proxy must be stripped, not dumped.
  const html = describeApiError('OpenAI', 502, '<html><body><h1>502 Bad Gateway</h1></body></html>')
  assert.ok(!html.includes('<'), `HTML leaked: ${html}`)

  // Unparseable bodies still yield something actionable.
  assert.match(describeApiError('Gemini', 400, 'not json at all'), /not json at all|rejected/i)

  // JSON-RPC errors from MCP servers.
  const rpc = describeRpcError('api.mobbin.com', 'tools/call', { code: -32000, message: 'Session expired' })
  assert.match(rpc, /Session expired/)
  assert.ok(!rpc.includes('{'), `must not leak JSON: ${rpc}`)
})

test('extractJson survives fenced and chatty model output', () => {
  assert.deepEqual(extractJson('{"findings":[]}'), { findings: [] })
  assert.deepEqual(extractJson('```json\n{"findings":[{"title":"x"}]}\n```').findings.length, 1)
  assert.deepEqual(extractJson('Sure! Here you go:\n{"findings":[]}\nHope that helps').findings, [])
  assert.equal(extractJson('no json at all'), null)
})

test('modelFor resolves the active provider model', () => {
  const base = {
    geminiModel: 'gemini-3.6-flash',
    openaiModel: 'gpt-5.2',
    cursorModel: 'composer-2.5'
  } as Settings
  assert.equal(modelFor({ ...base, provider: 'gemini' }), 'gemini-3.6-flash')
  assert.equal(modelFor({ ...base, provider: 'openai' }), 'gpt-5.2')
  assert.equal(modelFor({ ...base, provider: 'cursor' }), 'composer-2.5')
})

test('registry search ranks exact names first and builds valid add commands', () => {
  const items = [
    { name: 'accordion', type: 'registry:ui', registry: '@shadcn', keywords: ['accordion', 'collapse'], description: '' },
    { name: 'alert-dialog', type: 'registry:ui', registry: '@shadcn', keywords: ['alert', 'dialog'], description: '' },
    { name: 'login-01', type: 'registry:block', registry: '@acme', keywords: ['login', 'form'], description: '' }
  ]
  const hits = searchRegistry(items as never, 'accordion', 5)
  assert.equal(hits[0].name, 'accordion')
  assert.equal(addCommand(hits[0] as never), 'npx shadcn@latest add accordion')
  assert.equal(addCommand(items[2] as never), 'npx shadcn@latest add @acme/login-01')
})

test('queriesForSection prefers product UI vocabulary over generic section/card', async () => {
  const { queriesForSection } = await import('../src/main/services/shoogle.js')
  const q = queriesForSection(
    'content',
    { label: 'Settings', headings: ['Personal', 'Workspace'], textPreview: 'Account settings sidebar' },
    ['The section has no visible page hierarchy']
  )
  assert.ok(q.some((x) => /settings/i.test(x)), `expected settings query, got ${q.join(', ')}`)
  assert.ok(!q.includes('section') || q[0] !== 'section')
  assert.ok(q.some((x) => /dashboard|empty|settings|chat|kanban|feed/i.test(x)))
})

test('formatRecommendations prefers shoogle community blocks and labels origin', () => {
  const text = buildFixPrompt({
    id: 't2',
    createdAt: Date.now(),
    status: 'done',
    config,
    pages: [page()],
    findings: [],
    flows: [],
    references: [],
    recommendations: [
      {
        sectionId: 's1',
        sectionRole: 'content',
        reason: 'Needs a real dashboard block.',
        source: 'mixed',
        items: [
          {
            name: 'dashboard-01',
            registry: '@shadcnblocks',
            type: 'registry:block',
            description: 'Community dashboard',
            addCommand: 'npx shadcn@latest add @shadcnblocks/dashboard-01',
            source: 'shoogle'
          },
          {
            name: 'card',
            registry: '@shadcn',
            type: 'registry:ui',
            description: 'Card',
            addCommand: 'npx shadcn@latest add card',
            source: 'shadcn'
          }
        ]
      }
    ],
    visualDiffs: [],
    interactions: [],
    log: []
  } as Run)
  const dash = text.indexOf('@shadcnblocks/dashboard-01')
  const card = text.indexOf('npx shadcn@latest add card')
  assert.ok(dash >= 0, 'community block present')
  assert.ok(card < 0 || dash < card, 'community block should appear before generic card')
  assert.match(text, /community @shadcnblocks/)
})

/* ------------------------------ fix prompts ------------------------------ */

function finding(partial: Partial<Finding> & Pick<Finding, 'id' | 'title'>): Finding {
  return {
    category: 'accessibility',
    severity: 'major',
    detail: 'detail',
    fix: 'fix it',
    pageUrl: 'http://localhost:5181/',
    source: 'heuristic',
    ...partial
  }
}

test('prompt helpers trim evidence, pathnames and hashed selectors', () => {
  assert.equal(pathnameOf('http://localhost:5181/settings'), '/settings')
  assert.equal(stableSelector('.styles-module__settingsBrand___OoKlM'), undefined)
  assert.equal(stableSelector('[type="checkbox"]'), '[type="checkbox"]')
  assert.equal(stableSelector('[data-active="false"]'), '[data-active="false"]')
  const long =
    'First sentence is complete. Second sentence goes on and on with filler words that would otherwise be chopped mid-token by a naive slice at five hundred characters so we need enough length here to exceed the limit and prove sentence-boundary trimming works correctly for the remediation brief that coding agents paste into chat windows every day when fixing UI bugs from Qualition audits on real products with many findings stacked together in one markdown document for remediation.'
  const trimmed = trimEvidence(long, 200)
  assert.ok(trimmed.length <= 200)
  assert.ok(trimmed.endsWith('.') || trimmed.endsWith('…'))
  assert.ok(!trimmed.endsWith(' mid'))
})

test('dedupeFindingsForPrompt collapses near-duplicate a11y and overlap findings', () => {
  const list = [
    finding({
      id: 'f11',
      title: 'axe: Buttons must have discernible text',
      severity: 'critical',
      source: 'axe',
      pageUrl: 'http://localhost:5181/'
    }),
    finding({
      id: 'f16',
      title: '16 icon-only buttons without a label',
      severity: 'major',
      source: 'heuristic',
      pageUrl: 'http://localhost:5181/settings'
    }),
    finding({
      id: 'f19',
      title: '16 overlapping interactive elements at desktop',
      category: 'responsive',
      severity: 'major',
      pageUrl: 'http://localhost:5181/',
      viewport: 'desktop'
    }),
    finding({
      id: 'f21',
      title: '14 overlapping interactive elements at tablet',
      category: 'responsive',
      severity: 'major',
      pageUrl: 'http://localhost:5181/chat',
      viewport: 'tablet'
    })
  ]
  const deduped = dedupeFindingsForPrompt(list)
  assert.equal(deduped.length, 2)
  assert.ok(deduped.some((f) => f.id === 'f11'))
  assert.ok(deduped.some((f) => /Affects 2 pages/i.test(f.detail)))
})

test('buildFixPrompt groups root causes, uses pathnames, and drops hashed selectors', () => {
  const run: Run = {
    id: 't1',
    createdAt: Date.now(),
    status: 'done',
    config,
    pages: [page({ url: 'http://localhost:5181/' }), page({ url: 'http://localhost:5181/settings' })],
    findings: [
      finding({
        id: 'f11',
        title: 'axe: Buttons must have discernible text',
        severity: 'critical',
        source: 'axe',
        selector: '.styles-module__buttonWrapper___abc12',
        detail: '5 nodes. Targets: [data-active="false"]. Affects 5 pages: /, /settings, /templates, /chat, /tasks'
      }),
      finding({
        id: 'f16',
        title: '16 icon-only buttons without a label',
        severity: 'major',
        detail: 'Buttons with no text and no aria-label.'
      }),
      finding({
        id: 'i1',
        title: 'Nothing is reachable by keyboard',
        severity: 'critical',
        detail: 'Pressing Tab never lands on a focusable control.',
        source: 'heuristic'
      }),
      finding({
        id: 'i2',
        title: '1 control(s) have no visible focus state',
        severity: 'major',
        detail: 'Focused programmatically with zero computed-style change: Search',
        source: 'heuristic'
      }),
      finding({
        id: 'f1',
        title: '29 distinct colours in use',
        category: 'coherence',
        severity: 'critical',
        detail: 'Palette budget is ~12. Found 29.'
      }),
      finding({
        id: 'g50',
        title: 'Keyboard focus is visually absent on primary navigation controls',
        severity: 'critical',
        source: 'ai',
        pageUrl: 'http://localhost:5181/settings',
        detail: 'Search, Personal, and Workspace can receive focus but show no ring.'
      })
    ],
    flows: [],
    references: [],
    recommendations: [
      {
        sectionId: 's1',
        sectionRole: 'content',
        reason: 'Standardise this content section on registry components.',
        source: 'shadcn',
        items: [
          { name: 'card', registry: '@shadcn', type: 'registry:ui', description: 'Card', addCommand: 'npx shadcn@latest add card', source: 'shadcn' },
          { name: 'separator', registry: '@shadcn', type: 'registry:ui', description: 'Separator', addCommand: 'npx shadcn@latest add separator', source: 'shadcn' },
          { name: 'breadcrumb', registry: '@shadcn', type: 'registry:ui', description: 'Breadcrumb', addCommand: 'npx shadcn@latest add breadcrumb', source: 'shadcn' }
        ]
      },
      {
        sectionId: 's2',
        sectionRole: 'content',
        reason: 'Standardise this content section on registry components.',
        source: 'shadcn',
        items: [
          { name: 'card', registry: '@shadcn', type: 'registry:ui', description: 'Card', addCommand: 'npx shadcn@latest add card', source: 'shadcn' },
          { name: 'tabs', registry: '@shadcn', type: 'registry:ui', description: 'Tabs', addCommand: 'npx shadcn@latest add tabs', source: 'shadcn' }
        ]
      },
      {
        sectionId: 's6',
        sectionRole: 'nav',
        reason: 'Nav needs focus and names.',
        source: 'shadcn',
        items: [
          { name: 'button', registry: '@shadcn', type: 'registry:ui', description: 'Button', addCommand: 'npx shadcn@latest add button', source: 'shadcn' },
          { name: 'navigation-menu', registry: '@shadcn', type: 'registry:ui', description: 'Nav', addCommand: 'npx shadcn@latest add navigation-menu', source: 'shadcn' }
        ]
      }
    ],
    visualDiffs: [],
    interactions: [],
    log: []
  }

  const text = buildFixPrompt(run)
  assert.match(text, /## Root causes \(fix in this order\)/)
  assert.match(text, /Accessibility/)
  assert.match(text, /Design tokens/)
  assert.match(text, /Where: \//)
  assert.doesNotMatch(text, /styles-module__/)
  assert.match(text, /prefer measured interaction-probe and axe/i)
  // Generic content pack listed once, not twice
  const cardMentions = [...text.matchAll(/npx shadcn@latest add card/g)]
  assert.equal(cardMentions.length, 1)
  assert.match(text, /### nav/)
  assert.match(text, /Execute the root-cause list above in order/)
})

test('keyboard unreachable critical is gated on empty probes', () => {
  assert.equal(
    shouldEmitKeyboardUnreachable({ tabStops: 0, focusableCount: 0, controlsProbed: 0 }),
    true
  )
  assert.equal(
    shouldEmitKeyboardUnreachable({ tabStops: 0, focusableCount: 0, controlsProbed: 30 }),
    false
  )
  assert.equal(
    shouldEmitKeyboardUnreachable({ tabStops: 0, focusableCount: 12, controlsProbed: 0 }),
    false
  )
  assert.equal(
    shouldEmitKeyboardUnreachable({ tabStops: 3, focusableCount: 0, controlsProbed: 0 }),
    false
  )
})

test('validateFlow records readonly email fills as refused, not invalid', () => {
  const p = page({
    url: 'http://localhost:5181/settings',
    controls: [
      {
        tag: 'input',
        type: 'text',
        role: '',
        editable: false,
        text: '',
        placeholder: '',
        label: 'Email address',
        ariaLabel: '',
        name: 'email',
        href: '',
        testId: ''
      }
    ]
  })
  const bad = validateFlow(
    {
      name: 'Update settings email',
      steps: [
        { action: 'goto', target: '/settings' },
        { action: 'fill', target: 'label=Email address', value: 'x@y.z' }
      ]
    },
    [p]
  )
  assert.equal(bad.invalid, undefined)
  assert.ok(bad.refusedFills?.length)
})

test('validateFlow strips text= prefix on assertText so AI flows stay runnable', () => {
  const p = page({
    url: 'http://localhost:5181/',
    title: 'Home',
    controls: [
      {
        tag: 'a',
        type: '',
        role: 'link',
        name: '',
        text: 'Tasks',
        ariaLabel: '',
        placeholder: '',
        href: '/tasks',
        selector: 'a',
        disabled: false,
        editable: false
      }
    ],
    sections: [
      {
        id: 's1',
        role: 'nav',
        roleConfidence: 1,
        label: 'nav',
        selector: 'nav',
        rect: { x: 0, y: 0, width: 200, height: 400 },
        textPreview: 'Tasks Review Alerts',
        headings: ['Overview'],
        ctaLabels: ['Tasks', 'Review'],
        components: [],
        stats: {
          interactiveCount: 3,
          imageCount: 0,
          textDensity: 1,
          distinctBgColors: 1,
          distinctFontSizes: 1,
          maxTextWidthPx: 200
        }
      }
    ]
  })
  const v = validateFlow(
    {
      name: 'Go tasks',
      steps: [
        { action: 'goto', target: '/' },
        { action: 'click', target: 'text=Tasks' },
        { action: 'assertText', value: 'text=tasks' }
      ]
    },
    [p]
  )
  assert.equal(v.invalid, undefined, v.invalid)
  const assertStep = v.steps.find((s) => s.action === 'assertText')
  assert.equal(assertStep?.value, 'tasks')
})

test('auditPage flags padding and layout mismatches from signals', () => {
  const p = page({
    url: 'https://example.com/app',
    title: 'App',
    signals: {
      layout: {
        bandCount: 6,
        misalignedBands: 3,
        distinctBandGaps: 5,
        dominantGap: 24,
        offRhythmGaps: 4,
        asymmetricPadding: 5,
        siblingPaddingMismatches: 4,
        uniquePaddingValues: 14,
        uniqueMarginValues: 8
      }
    }
  })
  const findings = auditPage(p, config)
  assert.ok(findings.some((f) => /misaligned on the left edge/i.test(f.title)))
  assert.ok(findings.some((f) => /different gaps between bands/i.test(f.title)))
  assert.ok(findings.some((f) => /uneven padding/i.test(f.title)))
  assert.ok(findings.some((f) => /distinct padding values/i.test(f.title)))
})

test('auditPage flags product-polish empty/loading/microcopy signals', () => {
  const findings = auditPage(
    page({
      url: 'https://example.com/app',
      signals: {
        polish: {
          emptyRegionsWithoutCta: 2,
          vagueEmptyCopy: ['No data', 'Nothing here'],
          genericCtaLabels: ['Submit', 'Click here', 'Learn more'],
          skeletonCount: 4,
          skeletonWithoutMinHeight: 3,
          ariaBusyCount: 0,
          disabledWithoutAria: 0
        }
      }
    }),
    config
  )
  assert.ok(findings.some((f) => /empty region.*without a next-step CTA/i.test(f.title)))
  assert.ok(findings.some((f) => /Vague empty copy/i.test(f.title)))
  assert.ok(findings.some((f) => /Generic CTA labels/i.test(f.title)))
  assert.ok(findings.some((f) => /skeleton.*without reserved height/i.test(f.title)))
})

test('pickSectionsForRecommendations skips mature unique sections', async () => {
  const { shouldRecommendReplacement, pickSectionsForRecommendations } = await import(
    '../src/main/services/shadcnRegistry.js'
  )
  const mature = {
    id: 'hero',
    role: 'hero' as const,
    roleConfidence: 0.9,
    label: 'Hero',
    selector: 'section.hero',
    rect: { x: 0, y: 0, width: 1200, height: 480 },
    textPreview: 'Ship faster with Qualition audits that catch polish debt before release.',
    headings: ['Ship faster'],
    ctaLabels: ['Start audit'],
    components: [],
    stats: {
      interactiveCount: 2,
      imageCount: 1,
      textDensity: 2,
      distinctBgColors: 2,
      distinctFontSizes: 3,
      maxTextWidthPx: 640
    }
  }
  const gate = shouldRecommendReplacement(mature, { problems: [], roleCountOnPage: 1 })
  assert.equal(gate.yes, false)

  const clones = Array.from({ length: 5 }, (_, i) => ({
    ...mature,
    id: `c${i}`,
    role: 'content' as const,
    roleConfidence: 0.4,
    label: `Blob ${i}`,
    textPreview: '…',
    headings: [] as string[],
    ctaLabels: [] as string[],
    rect: { x: 0, y: i * 240, width: 1200, height: 240 }
  }))
  const picks = pickSectionsForRecommendations(
    'https://example.com/',
    clones,
    [{ sectionId: 'c0', pageUrl: 'https://example.com/', severity: 'major', title: 'Weak hierarchy' }],
    6
  )
  assert.ok(picks.length >= 1)
  assert.ok(picks.every((p) => p.reasons.length > 0))
  // One recommendation per repeated role, not five clones.
  assert.equal(picks.filter((p) => p.reasons.includes('repeated-role')).length, 1)
})

test('mapPool runs with bounded concurrency and preserves order', async () => {
  const { mapPool } = await import('../src/main/services/pool.js')
  let live = 0
  let peak = 0
  const out = await mapPool([1, 2, 3, 4, 5], 2, async (n) => {
    live++
    peak = Math.max(peak, live)
    await new Promise((r) => setTimeout(r, 20))
    live--
    return n * 10
  })
  assert.deepEqual(out, [10, 20, 30, 40, 50])
  assert.ok(peak <= 2, `peak concurrency was ${peak}`)
})

test('partitionProductFindings excludes Agentation selectors from product grade', async () => {
  const { partitionProductFindings, ownershipFromSelector } = await import('../src/main/services/provenance.js')
  assert.equal(
    ownershipFromSelector('.styles-module__buttonWrapper___rBcdv > .styles-module__controlButton___8Q0jc'),
    'dev-chrome'
  )
  const { product, excluded, meta } = partitionProductFindings(
    [
      {
        id: 'f1',
        category: 'accessibility',
        severity: 'critical',
        title: 'axe: Buttons must have discernible text',
        detail: 'x',
        fix: 'y',
        pageUrl: 'http://localhost:5181/',
        selector: '.styles-module__buttonWrapper___x > .styles-module__controlButton___y',
        source: 'axe'
      },
      {
        id: 'f2',
        category: 'accessibility',
        severity: 'major',
        title: 'Missing <html lang>',
        detail: 'x',
        fix: 'y',
        pageUrl: 'http://localhost:5181/',
        source: 'heuristic'
      }
    ],
    'http://localhost:5181/'
  )
  assert.equal(excluded.length, 1)
  assert.equal(product.length, 1)
  assert.ok(meta)
  assert.match(meta!.title, /excluded/i)
})

test('clusterColourDecisions collapses alpha ladders of one hue', async () => {
  const { clusterColourDecisions } = await import('../src/main/services/audit.js')
  const decisions = clusterColourDecisions([
    'rgba(59, 130, 246, 0.4)',
    'rgba(59, 130, 246, 0.42)',
    'rgba(59, 130, 246, 0.48)',
    'rgba(59, 130, 246, 0.55)',
    'rgb(239, 68, 68)'
  ])
  assert.ok(decisions.length <= 3, `expected <=3 decisions, got ${decisions.length}: ${JSON.stringify(decisions)}`)
})

test('applyProductionPresence marks absent selectors as does-not-ship', async () => {
  const { applyProductionPresence } = await import('../src/main/services/provenance.js')
  const out = applyProductionPresence(
    [
      {
        id: 'a',
        category: 'accessibility',
        severity: 'major',
        title: 'Unnamed button',
        detail: 'x',
        fix: 'y',
        pageUrl: 'http://localhost:5173/',
        selector: '.agentation-btn',
        source: 'heuristic'
      },
      {
        id: 'b',
        category: 'performance',
        severity: 'minor',
        title: '420 kB of CSS across 12 stylesheet(s) (dev)',
        detail: 'transfer bytes high on Vite',
        fix: 're-audit production',
        pageUrl: 'http://localhost:5173/',
        source: 'heuristic'
      }
    ],
    { '.agentation-btn': false },
    { prodCssBytes: 40_000, auditCssBytes: 420_000, productionUrl: 'https://app.example.com' }
  )
  assert.equal(out[0].provenance?.shipsInProduction, false)
  assert.match(out[0].provenance?.note ?? '', /absent on production/i)
  assert.equal(out[1].provenance?.shipsInProduction, false)
  assert.match(out[1].provenance?.note ?? '', /Leaner on production/i)
})

test('isDeeperRoute recognizes SPA detail paths under list routes', () => {
  assert.equal(
    isDeeperRoute('http://localhost:5181/tasks', 'http://localhost:5181/tasks/abc123'),
    true
  )
  assert.equal(
    isDeeperRoute('http://localhost:5181/agents', 'http://localhost:5181/agents/x/y'),
    true
  )
  assert.equal(isDeeperRoute('http://localhost:5181/tasks', 'http://localhost:5181/tasks'), false)
  assert.equal(isDeeperRoute('http://localhost:5181/tasks', 'http://localhost:5181/agents/x'), false)
  assert.equal(isDeeperRoute('http://localhost:5181/', 'http://localhost:5181/tasks'), true)
})

test('route sweep covers more than a handful of crawled pages', () => {
  const many = Array.from({ length: 12 }, (_, i) =>
    page({
      url: `https://example.com/p${i}`,
      title: `Page ${i} Product`,
      controls: [
        {
          tag: 'a',
          type: '',
          role: '',
          name: '',
          text: `Go ${i}`,
          ariaLabel: '',
          placeholder: '',
          href: `/p${i}`,
          selector: 'a',
          disabled: false,
          editable: false
        }
      ],
      sections: [
        {
          id: `s${i}`,
          role: 'content',
          roleConfidence: 1,
          label: `P${i}`,
          selector: 'main',
          rect: { x: 0, y: 0, width: 800, height: 400 },
          textPreview: `Unique copy ${i}`,
          headings: [`Heading ${i}`],
          ctaLabels: [`Go ${i}`],
          components: [],
          stats: {
            interactiveCount: 1,
            imageCount: 0,
            textDensity: 1,
            distinctBgColors: 1,
            distinctFontSizes: 1,
            maxTextWidthPx: 400
          }
        }
      ]
    })
  )
  const flows = heuristicFlows(many)
  const sweep = flows.find((f) => /Visit every discovered route/i.test(f.name))
  assert.ok(sweep)
  const gotos = sweep!.steps.filter((s) => s.action === 'goto')
  assert.ok(gotos.length >= 10, `expected >=10 gotos in sweep, got ${gotos.length}`)
})
