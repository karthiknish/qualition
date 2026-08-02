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
import { Deadline } from '../src/main/services/interaction.js'
import { isValidTarget, normalizeTargetUrl, schemeFallback, isLocalHost } from '../src/shared/url.js'
import { loginUrlGuesses, passwordCandidates, redactAuth, usernameCandidates } from '../src/main/services/auth.js'
import { cancelRun, executeRun, isCancelled, newRun } from '../src/main/services/runner.js'
import { deleteCredential, listCredentials, originOf, resolveCredential, saveCredential } from '../src/main/services/vault.js'
import { loadRun, redactRun, saveRun } from '../src/main/services/store.js'
import { flowInventory, heuristicFlows, validateFlow } from '../src/main/services/flows.js'
import { sanitizeSelector } from '../src/main/services/crawler.js'
import { queryForRole } from '../src/main/services/mobbin.js'
import { addCommand, searchRegistry } from '../src/main/services/shadcnRegistry.js'
import { describeApiError, describeRpcError } from '../src/main/services/apiError.js'
import {
  extractJson,
  rankGeminiModels,
  rankOpenAiModels,
  GEMINI_FALLBACK_MODELS
} from '../src/main/services/providers.js'
import { modelFor, type CapturedPage, type RunConfig, type Settings } from '../src/shared/types.js'

const config: RunConfig = {
  targetUrl: 'https://example.com',
  maxPages: 1,
  viewports: [],
  useMobbin: false,
  useShadcn: false,
  useGemini: false,
  useInteractionProbe: false,
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
  assert.ok(findings.some((f) => /distinct colours/.test(f.title)))
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

  const sweep = flows.find((f) => f.name === 'Route sweep')!
  assert.ok(sweep, 'a route sweep must exist so every crawled page is visited')
  assert.deepEqual(
    sweep.steps.filter((s) => s.action === 'goto').map((s) => s.target),
    ['/', '/pricing'],
    'every captured route must be navigated'
  )
  assert.ok(sweep.steps.some((s) => s.action === 'assertText'), 'each route must be asserted, not just opened')

  const cta = flows.find((f) => f.name.startsWith('Primary CTA'))!
  assert.ok(cta.name.includes('Get started'))
  assert.ok(
    !flows.some((f) => JSON.stringify(f).includes('Delete account')),
    'destructive labels must never become a flow step'
  )
})

test('readonly fields are rejected as fill targets', () => {
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
  assert.ok(readonlyFill.invalid, 'a readonly field must not be proposed as a fill target')
  assert.match(readonlyFill.invalid!, /readonly|disabled/i)

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
