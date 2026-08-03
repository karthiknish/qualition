/**
 * Run orchestrator: crawl → heuristics → Mobbin references → Gemini critique →
 * shadcn recommendations → flows → score. Emits progress as it goes.
 */
import { randomUUID } from 'node:crypto'
import type { Browser } from 'playwright'
import { capturePage, crawl, launch, runFlow, DEFAULT_VIEWPORTS } from './crawler.js'
import { auditPage, dedupeFindings, diffFindingsAgainstPrior, fixedFindingsSincePrior, scoreRun, themeSummary, auditStaticDocumentTitles } from './audit.js'
import { auditBrandAcrossProject, auditComponentTheme, inferBrandProfile } from './brandTheme.js'
import { findingsFromFlowGaps, flowGapsFromMobbin, flowsSuggestedByMobbinGaps } from './flowGaps.js'
import { critiquePage, critiqueSectionAgainstReferences, finalVerdict, makeCritic, proposeFlows } from './critic.js'
import { credsFromSettings } from './providers.js'
import { probeInteractions } from './interaction.js'
import { flowInventory, heuristicFlows, detailRecordFlows, validateFlows } from './flows.js'
import { performLogin } from './auth.js'
import { modelFor } from '../../shared/types.js'
import { closeMobbin, searchScreens, searchSections, searchFlows } from './mobbin.js'
import { detectArchetype, queryForFlows, queryForSection, refineRoles } from './archetype.js'
import { closeShoogle } from './shoogle.js'
import { recommendForSection, pickSectionsForRecommendations } from './shadcnRegistry.js'
import { auditCss } from './cssAudit.js'
import { auditTokens } from './tokens.js'
import { compareWithBaseline } from './visual.js'
import { runLighthouse } from './lighthouse.js'
import { runPa11y } from './pa11y.js'
import { assetsDir, ensureRunDir, listRuns, saveRun } from './store.js'
import { resolveCredential, saveCredential } from './vault.js'
import { applyProductionPresence, partitionProductFindings } from './provenance.js'
import { isKitSpecimenPath, pickCritiqueTargets, pickInteractionTargets } from './brokenUi.js'
import { summarizePremiumCraft, type PremiumDimensionScores } from './premiumCraft.js'
import { mapPool } from './pool.js'
import type { Finding, Run, RunConfig, RunProgress, Settings } from '../../shared/types.js'

type Emit = (p: RunProgress) => void

/** Thrown at any checkpoint once the user has asked to stop. */
class CancelledError extends Error {
  constructor() {
    super('cancelled')
    this.name = 'CancelledError'
  }
}

interface ActiveRun {
  cancelled: boolean
  browser?: Browser
  controller: AbortController
  /** Resolves the moment cancellation is requested, so slow phases can lose a race. */
  cancelledPromise: Promise<never>
  reject: (e: Error) => void
}

const active = new Map<string, ActiveRun>()
/** Runs cancelled between "start" and the first line of executeRun. */
const cancelledBeforeStart = new Set<string>()

export function cancelRun(id: string): boolean {
  const s = active.get(id)
  if (!s) {
    // The run may not have reached executeRun yet; remember the intent.
    cancelledBeforeStart.add(id)
    return false
  }
  if (s.cancelled) return true
  s.cancelled = true
  s.controller.abort()
  s.reject(new CancelledError())
  s.browser?.close().catch(() => {})
  return true
}

export function isCancelled(id: string): boolean {
  return active.get(id)?.cancelled ?? cancelledBeforeStart.has(id)
}

export function newRun(config: RunConfig): Run {
  return {
    id: randomUUID().slice(0, 8),
    createdAt: Date.now(),
    status: 'queued',
    // The live run needs the real credentials to sign in; redaction happens at
    // the persistence and IPC boundaries (store.saveRun / redactRun), never here
    // — redacting at construction meant the browser typed "••••••••" as the password.
    config,
    pages: [],
    findings: [],
    flows: [],
    references: [],
    recommendations: [],
    visualDiffs: [],
    interactions: [],
    log: []
  }
}

export async function executeRun(
  run: Run,
  settings: Settings,
  emit: Emit,
  onUpdate: (run: Run) => void
): Promise<Run> {
  let rejectCancelled: (e: Error) => void = () => {}
  const cancelledPromise = new Promise<never>((_, reject) => {
    rejectCancelled = reject
  })
  // Nothing listens synchronously; without this Node logs an unhandled rejection.
  cancelledPromise.catch(() => {})
  const state: ActiveRun = {
    cancelled: cancelledBeforeStart.delete(run.id),
    controller: new AbortController(),
    cancelledPromise,
    reject: rejectCancelled
  }
  active.set(run.id, state)

  /** Throw immediately if the user has asked to stop. Call it liberally. */
  const checkpoint = (): void => {
    if (state.cancelled) throw new CancelledError()
  }
  /**
   * Run a slow phase but stop waiting the instant cancellation is requested.
   * The underlying request may still settle in the background; the run does
   * not wait for it, which is what makes Cancel feel immediate.
   */
  const raceCancel = async <T>(p: Promise<T>): Promise<T> => {
    if (state.cancelled) throw new CancelledError()
    return Promise.race([p, state.cancelledPromise])
  }

  const log = (level: 'info' | 'warn' | 'error', msg: string): void => {
    run.log.push({ ts: Date.now(), level, msg })
    if (run.log.length > 500) run.log.shift()
  }
  const progress = (phase: string, pct: number, msg: string): void => {
    emit({ runId: run.id, phase, pct, msg })
    log('info', msg)
    onUpdate(run)
  }

  if (state.cancelled) {
    // Cancelled before we even launched a browser.
    run.status = 'cancelled'
    run.finishedAt = Date.now()
    log('info', 'Cancelled before start')
    emit({ runId: run.id, phase: 'cancelled', pct: 100, msg: 'Cancelled' })
    active.delete(run.id)
    await saveRun(run)
    onUpdate(run)
    return run
  }

  const dir = await ensureRunDir(run.id)
  const assets = assetsDir(run.id)
  run.status = 'running'
  const cfg: RunConfig = { ...run.config, geminiApiKey: settings.geminiApiKey }
  const creds = credsFromSettings(settings)
  const critic = makeCritic(cfg, creds)
  const model = modelFor(settings)
  const providerKey =
    cfg.provider === 'openai'
      ? settings.openaiApiKey
      : cfg.provider === 'openrouter'
        ? settings.openrouterApiKey
        : settings.geminiApiKey
  const aiEnabled = cfg.useGemini && (cfg.provider === 'cursor' || !!providerKey)

  try {
    progress('launch', 2, `Launching Chromium · target ${cfg.targetUrl}`)
    const browser = await launch()
    state.browser = browser

    /* 0. sign in, so the audit sees the real product and not the marketing shell */
    let storageState: string | undefined
    // A saved login for this origin is used when no password was typed.
    let credentials = cfg.auth
    if (cfg.auth && (!cfg.auth.password || cfg.auth.useSaved)) {
      const saved = await resolveCredential(cfg.targetUrl)
      if (saved) {
        credentials = { ...cfg.auth, ...saved }
        log('info', `Using saved credentials for ${saved.username}`)
      }
    }

    if (credentials?.username && credentials.password) {
      progress('auth', 4, `Signing in as ${credentials.username}`)
      const result = await performLogin(browser, cfg.targetUrl, credentials, assets, (m) => log('info', m))
      run.auth = result
      if (result.ok) {
        storageState = result.storageStatePath
        log('info', result.detail)
        if (cfg.auth?.remember) {
          try {
            await saveCredential({
              origin: cfg.targetUrl,
              username: credentials.username,
              password: credentials.password,
              loginUrl: credentials.loginUrl,
              usernameSelector: credentials.usernameSelector,
              passwordSelector: credentials.passwordSelector,
              submitSelector: credentials.submitSelector
            })
            log('info', 'Credentials saved to the encrypted vault')
          } catch (e) {
            log('warn', `could not save credentials: ${(e as Error).message}`)
          }
        }
      } else {
        log('error', result.detail)
        run.findings.push({
          id: 'auth-1',
          category: 'flow',
          severity: 'blocker',
          title: 'Could not sign in with the supplied credentials',
          detail: result.detail,
          fix: 'Check the credentials, set an explicit login URL, or provide CSS selectors for the username/password/submit controls. Everything below was audited signed-out.',
          pageUrl: cfg.targetUrl,
          evidence: result.screenshot ? [result.screenshot] : undefined,
          source: 'heuristic'
        })
      }
      await saveRun(run)
    }

    /* 1. crawl + capture */
    progress(
      'crawl',
      6,
      `Crawling ${!cfg.maxPages || cfg.maxPages <= 0 ? 'every reachable page' : `up to ${cfg.maxPages} page(s)`}${storageState ? ' (signed in)' : ''}`
    )
    // Pages land as they finish, so cancelling mid-crawl keeps completed work.
    const unlimited = !cfg.maxPages || cfg.maxPages <= 0
    run.pages = []
    await crawl(browser, cfg.targetUrl, cfg.maxPages, {
      viewports: cfg.viewports.length ? cfg.viewports : DEFAULT_VIEWPORTS,
      outDir: assets,
      storageState,
      // Unlimited crawls still get a safety net so a generated URL space
      // cannot trap the run indefinitely.
      budgetMs: unlimited ? 45 * 60_000 : undefined,
      shouldStop: () => state.cancelled,
      ignorePages: cfg.ignorePages,
      onPage: (p) => {
        run.pages.push(p)
        progress(
          'crawl',
          unlimited ? Math.min(28, 6 + run.pages.length) : Math.min(28, 6 + run.pages.length * 4),
          `Captured ${p.url} (${run.pages.length}${unlimited ? '' : `/${cfg.maxPages}`})`
        )
      },
      onLog: (m) => log('info', m)
    })
    checkpoint()
    progress('crawl', 30, `Captured ${run.pages.length} page(s), ${run.pages.reduce((n, p) => n + p.sections.length, 0)} section(s)`)

    /* 2. deterministic audit */
    // What kind of product is this? Everything reference-related depends on it.
    const detected = detectArchetype(run.pages, !!storageState)
    refineRoles(run.pages, detected.archetype)
    run.archetype = detected
    log(
      'info',
      `Product archetype: ${detected.archetype} (${Math.round(detected.confidence * 100)}% — ${detected.signals.slice(0, 4).join(', ') || 'no strong signals'})`
    )

    const findings: Finding[] = []
    for (const page of run.pages) {
      findings.push(...auditPage(page, cfg))
      // Authored-CSS evidence (Project Wallace) on top of the DOM sample.
      if (page.cssStats) findings.push(...auditCss(page, page.cssStats, cfg))
      if (page.tokenDictionary) findings.push(...auditTokens(page, page.tokenDictionary, cfg))
    }
    const brand = inferBrandProfile(run.pages, cfg.productContext)
    for (const page of run.pages) {
      findings.push(...auditComponentTheme(page, brand, cfg))
    }
    findings.push(...auditBrandAcrossProject(run.pages, brand, cfg))
    findings.push(...auditStaticDocumentTitles(run.pages))
    run.findings = findings
    run.themeSummary = [themeSummary(run.pages), brand.summary !== 'insufficient brand signal' ? `Brand: ${brand.summary}` : '']
      .filter(Boolean)
      .join('\n')
    progress('heuristics', 36, `${findings.length} heuristic finding(s) · ${run.themeSummary.split('\n')[0]}`)
    await saveRun(run)

    /* 2a. Lighthouse ∥ pa11y ∥ visual-diff — independent Chrome / CPU work */
    {
      checkpoint()
      const primary = run.pages[0]?.url ?? cfg.targetUrl
      const skipSeo = run.archetype?.archetype === 'app'
      const knownAxeIds = new Set(run.pages.flatMap((p) => p.axe.map((v) => v.id)))
      // Default on when field missing (older run configs / tests).
      const lighthouseOn = cfg.useLighthouse !== false
      progress(
        lighthouseOn ? 'lighthouse' : 'pa11y',
        38,
        lighthouseOn ? 'Running Lighthouse + pa11y in parallel' : 'Running pa11y (Lighthouse off)'
      )

      const previousPromise = listRuns().then((runs) =>
        runs.find((r) => r.id !== run.id && r.status === 'done' && r.config.targetUrl === cfg.targetUrl)
      )

      const [lhSettled, pa11ySettled, visualSettled] = await Promise.all([
        lighthouseOn
          ? raceCancel(
              runLighthouse(primary, {
                storageStatePath: storageState,
                skipSeo,
                onLog: (m) => log('info', m)
              })
            )
              .then((v) => ({ ok: true as const, v, skipped: false as const }))
              .catch((e) => ({ ok: false as const, e, skipped: false as const }))
          : Promise.resolve({ ok: true as const, v: null, skipped: true as const }),
        raceCancel(
          runPa11y(primary, {
            storageStatePath: storageState,
            knownAxeIds,
            onLog: (m) => log('info', m)
          })
        )
          .then((v) => ({ ok: true as const, v }))
          .catch((e) => ({ ok: false as const, e })),
        previousPromise
          .then(async (previous) => {
            if (!previous) return { ok: true as const, previous: null, diffs: null }
            const result = await compareWithBaseline(run.pages, previous, assets)
            return { ok: true as const, previous, diffs: result }
          })
          .catch((e) => ({ ok: false as const, e }))
      ])

      if (lhSettled.skipped) {
        log('info', 'Lighthouse skipped (turned off for this run)')
      } else if (lhSettled.ok) {
        const lh = lhSettled.v
        if (lh) {
          run.lighthouse = lh.scores
          run.findings.push(...lh.findings)
          if (lh.failed) {
            run.lighthouseNote = lh.failReason ?? 'Lighthouse did not complete'
          } else if (skipSeo) {
            run.lighthouseNote = 'SEO category skipped for signed-in / app UI'
          }
        }
      } else {
        if ((lhSettled.e as Error).name === 'CancelledError') throw lhSettled.e
        log('warn', `Lighthouse failed: ${(lhSettled.e as Error).message}`)
        run.lighthouseNote = (lhSettled.e as Error).message.slice(0, 200)
        run.findings.push({
          id: `lh-fail-${Date.now()}`,
          category: 'flow',
          severity: 'minor',
          title: 'Lighthouse could not run',
          detail: (lhSettled.e as Error).message.slice(0, 200),
          fix: 'Re-run the audit. If this persists, check that Chrome can launch.',
          pageUrl: cfg.targetUrl,
          source: 'lighthouse'
        })
      }

      if (pa11ySettled.ok) {
        const p11y = pa11ySettled.v
        if (p11y) run.findings.push(...p11y.findings)
      } else {
        if ((pa11ySettled.e as Error).name === 'CancelledError') throw pa11ySettled.e
        log('warn', `pa11y failed: ${(pa11ySettled.e as Error).message}`)
        run.findings.push({
          id: `p11y-fail-${Date.now()}`,
          category: 'accessibility',
          severity: 'minor',
          title: 'pa11y could not run',
          detail: (pa11ySettled.e as Error).message.slice(0, 200),
          fix: 'Re-run the audit. axe still covers the primary accessibility pass.',
          pageUrl: cfg.targetUrl,
          source: 'pa11y'
        })
      }

      if (visualSettled.ok) {
        if (visualSettled.diffs && visualSettled.previous) {
          run.visualDiffs = visualSettled.diffs.diffs
          run.findings.push(...visualSettled.diffs.findings)
          progress(
            'visual-diff',
            42,
            `Compared against run ${visualSettled.previous.id}: ${visualSettled.diffs.diffs.length} viewport diff(s), ${visualSettled.diffs.findings.length} regression finding(s)`
          )
        } else {
          log('info', 'No previous run for this target — this run becomes the visual baseline.')
        }
      } else {
        log('warn', `visual diff failed: ${(visualSettled.e as Error).message}`)
      }
      await saveRun(run)
    }

    /* 2c. deep interaction probe — mix of deep, list, and broken pages */
    if (cfg.useInteractionProbe) {
      const probeViewport = (cfg.viewports.length ? cfg.viewports : DEFAULT_VIEWPORTS)[0]
      const PROBE_PAGE_CAP = 8
      const PROBE_CONCURRENCY = 2
      const PROBE_BUDGET_MS = 60_000
      const probeTargets = pickInteractionTargets(run.pages, PROBE_PAGE_CAP, 3)
      if (run.pages.length > PROBE_PAGE_CAP) {
        log(
          'info',
          `Interaction probe capped at ${PROBE_PAGE_CAP} page(s) incl. reserved product lists (of ${run.pages.length}); concurrency ${PROBE_CONCURRENCY}`
        )
      }
      progress('interaction', 44, `Probing ${probeTargets.length} page(s) (×${PROBE_CONCURRENCY})`)
      let probedDone = 0
      try {
        const probeResults = await mapPool(
          probeTargets,
          PROBE_CONCURRENCY,
          async (page) => {
            checkpoint()
            try {
              const { report, findings: probeFindings } = await raceCancel(
                probeInteractions(browser, page.url, {
                  outDir: assets,
                  viewport: probeViewport,
                  maxControls: settings.maxControlsProbed ?? 30,
                  budgetMs: PROBE_BUDGET_MS,
                  storageState,
                  onLog: (m) => log('warn', m)
                })
              )
              probedDone++
              progress(
                'interaction',
                44 + Math.round((probedDone / Math.max(1, probeTargets.length)) * 5),
                `Probed ${probedDone}/${probeTargets.length}: ${page.url}`
              )
              log(
                'info',
                `${page.url}: probed ${report.controlsProbed} controls → ${probeFindings.length} finding(s), ${report.deadClicks.length} dead click(s)`
              )
              return { report, findings: probeFindings }
            } catch (e) {
              if ((e as Error).name === 'CancelledError') throw e
              log('warn', `interaction probe failed: ${(e as Error).message}`)
              return null
            }
          },
          { shouldStop: () => state.cancelled }
        )
        for (const r of probeResults) {
          if (!r) continue
          run.interactions.push(r.report)
          run.findings.push(...r.findings)
        }
      } catch (e) {
        if ((e as Error).message === 'cancelled' || (e as Error).name === 'CancelledError') throw new CancelledError()
        throw e
      }
      progress('interaction', 50, `${run.interactions.reduce((n, i) => n + i.controlsProbed, 0)} controls exercised`)
      await saveRun(run)
    }

    /* 3. Mobbin references — distinct queries in parallel */
    if (cfg.useMobbin) {
      progress('mobbin', 45, 'Pulling reference UI from Mobbin')
      // One search per *distinct screen intent*, built from the route,
      // headings and controls rather than a generic role template.
      const seenQueries = new Set<string>()
      const screenJobs: { query: string; sectionId: string; role: string; path: string }[] = []
      for (const page of run.pages) {
        for (const s of page.sections) {
          if (seenQueries.size >= 10) break
          const query = queryForSection(s, page, detected.archetype, cfg.productContext)
          if (seenQueries.has(query)) continue
          seenQueries.add(query)
          let path = '/'
          try {
            path = new URL(page.url).pathname
          } catch {
            /* ignore */
          }
          screenJobs.push({ query, sectionId: s.id, role: s.role, path })
        }
      }
      const MOBBIN_CONCURRENCY = 3
      try {
        const batches = await mapPool(
          screenJobs,
          MOBBIN_CONCURRENCY,
          async (job) => {
            checkpoint()
            log('info', `Mobbin query (${job.role} @ ${job.path}): ${job.query}`)
            const refs = []
            try {
              refs.push(
                ...(await raceCancel(
                  searchScreens(job.query, {
                    platform: 'web',
                    limit: 3,
                    outDir: assets,
                    sectionId: job.sectionId
                  })
                ))
              )
            } catch (e) {
              if (state.cancelled || (e as Error).name === 'CancelledError') throw new CancelledError()
              log('warn', `Mobbin screens (${job.role}): ${(e as Error).message}`)
            }
            // Section search only pays off for marketing-style pages; app screens
            // are better matched by whole screens.
            if (detected.archetype !== 'app') {
              try {
                refs.push(
                  ...(await raceCancel(
                    searchSections(job.query, { limit: 2, outDir: assets, sectionId: job.sectionId })
                  ))
                )
              } catch (e) {
                if (state.cancelled || (e as Error).name === 'CancelledError') throw new CancelledError()
                log('warn', `Mobbin sections (${job.role}): ${(e as Error).message}`)
              }
            }
            return refs
          },
          { shouldStop: () => state.cancelled }
        )
        for (const batch of batches) run.references.push(...batch)
      } catch (e) {
        if ((e as Error).message === 'cancelled' || (e as Error).name === 'CancelledError') {
          throw new CancelledError()
        }
        throw e
      }
      try {
        const flowQuery = queryForFlows(detected.archetype, cfg.productContext, run.pages)
        log('info', `Mobbin flow query: ${flowQuery}`)
        run.references.push(...(await raceCancel(searchFlows(flowQuery, { limit: 4, outDir: assets }))))
        const earlyGaps = flowGapsFromMobbin(
          run.references.filter((r) => r.kind === 'flow'),
          run.pages,
          []
        )
        if (earlyGaps.length) {
          log('info', `Mobbin flow gaps (pre-run): ${earlyGaps.map((g) => g.id).join(', ')}`)
        }
      } catch (e) {
        if (state.cancelled) throw new CancelledError()
        log('warn', `Mobbin flows: ${(e as Error).message}`)
      }
      progress('mobbin', 55, `${run.references.length} Mobbin reference(s) cached locally`)
      await saveRun(run)
    }

    /* 4. AI critique — bounded pages, concurrent requests */
    if (aiEnabled) {
      // Each critique is a slow network round trip, so the work has to be
      // bounded: an "everything" crawl of 24 pages would otherwise queue ~48
      // sequential requests (tens of minutes) behind a single progress tick.
      const PAGE_BUDGET = 12
      const SECTION_BUDGET = 12
      const CRITIQUE_CONCURRENCY = 3
      const findingCountFor = (p: (typeof run.pages)[0]) =>
        run.findings.filter((f) => f.pageUrl === p.url).length
      const targetsForCritique = pickCritiqueTargets(run.pages, findingCountFor, PAGE_BUDGET, 3)
      if (run.pages.length > PAGE_BUDGET) {
        log(
          'info',
          `Critiquing ${PAGE_BUDGET} pages (incl. reserved product lists); skipping ${run.pages.length - PAGE_BUDGET} quieter page(s) to keep the run bounded`
        )
      }
      progress(
        'critique',
        58,
        `Critiquing ${targetsForCritique.length} page(s) with ${cfg.provider}/${model} (×${CRITIQUE_CONCURRENCY})${critic.supportsVision ? '' : ' (text-only)'}`
      )

      let pagesDone = 0
      const aiPremiumAcc: Partial<PremiumDimensionScores> = {}
      const aiPremiumCounts: Partial<Record<keyof PremiumDimensionScores, number>> = {}
      try {
        const pageCritiques = await mapPool(
          targetsForCritique,
          CRITIQUE_CONCURRENCY,
          async (page, index) => {
            checkpoint()
            const interaction = run.interactions.find((i) => i.url === page.url)
            try {
              const res = await raceCancel(critiquePage(critic, model, page, cfg, interaction))
              pagesDone++
              progress(
                'critique',
                58 + Math.round((pagesDone / Math.max(1, targetsForCritique.length)) * 10),
                `Critiqued ${pagesDone}/${targetsForCritique.length}: ${new URL(page.url).pathname || '/'}`
              )
              log('info', `${cfg.provider}: ${res.findings.length} finding(s) on ${page.url}`)
              return { page, index, res, error: null as string | null }
            } catch (e) {
              if (state.cancelled || (e as Error).name === 'CancelledError') throw new CancelledError()
              log('error', `page critique failed on ${page.url}: ${(e as Error).message}`)
              return { page, index, res: null, error: (e as Error).message }
            }
          },
          { shouldStop: () => state.cancelled }
        )

        for (const row of pageCritiques) {
          if (!row.res) continue
          run.findings.push(...row.res.findings)
          if (row.res.themeRead) run.themeSummary = `${run.themeSummary}\n\n${row.res.themeRead}`
          if (row.res.premiumVerdict) {
            run.themeSummary = `${run.themeSummary}\n\nPremium: ${row.res.premiumVerdict}`
          }
          if (row.res.premiumScores && !isKitSpecimenPath(row.page.url)) {
            for (const [k, v] of Object.entries(row.res.premiumScores) as [
              keyof PremiumDimensionScores,
              number
            ][]) {
              aiPremiumAcc[k] = (aiPremiumAcc[k] ?? 0) + v
              aiPremiumCounts[k] = (aiPremiumCounts[k] ?? 0) + 1
            }
          }
        }
        // Stash averaged AI premium dims on the run object for scorecard blend.
        const aiAvg: Partial<PremiumDimensionScores> = {}
        for (const k of Object.keys(aiPremiumCounts) as (keyof PremiumDimensionScores)[]) {
          const n = aiPremiumCounts[k] ?? 0
          if (n > 0) aiAvg[k] = Math.round(((aiPremiumAcc[k] ?? 0) / n) * 10) / 10
        }
        ;(run as { _aiPremiumDims?: Partial<PremiumDimensionScores> })._aiPremiumDims = aiAvg

        // Section critiques after page pass — shared budget, concurrent.
        const sectionJobs: { page: (typeof targetsForCritique)[0]; sectionId: string }[] = []
        for (const page of targetsForCritique) {
          const targets = page.sections
            .filter((s) => s.screenshot)
            .sort((a, b) => b.rect.height - a.rect.height)
            .slice(0, 3)
          for (const s of targets) {
            if (sectionJobs.length >= SECTION_BUDGET) break
            sectionJobs.push({ page, sectionId: s.id })
          }
          if (sectionJobs.length >= SECTION_BUDGET) break
        }

        if (sectionJobs.length) {
          progress('critique', 70, `Section critiques (${sectionJobs.length}, ×${CRITIQUE_CONCURRENCY})`)
          const sectionFindings = await mapPool(
            sectionJobs,
            CRITIQUE_CONCURRENCY,
            async (job) => {
              checkpoint()
              const s = job.page.sections.find((x) => x.id === job.sectionId)
              if (!s) return []
              const refs = run.references.filter((r) => r.sectionId === s.id)
              try {
                return await raceCancel(
                  critiqueSectionAgainstReferences(critic, model, job.page, s, refs, cfg)
                )
              } catch (e) {
                if (state.cancelled || (e as Error).name === 'CancelledError') throw new CancelledError()
                log('warn', `section critique ${s.id}: ${(e as Error).message}`)
                return []
              }
            },
            { shouldStop: () => state.cancelled }
          )
          for (const batch of sectionFindings) run.findings.push(...batch)
        }
      } catch (e) {
        if ((e as Error).message === 'cancelled' || (e as Error).name === 'CancelledError') {
          throw new CancelledError()
        }
        throw e
      }

      progress('critique', 74, `${run.findings.filter((f) => f.source === 'ai').length} AI finding(s)`)
      await saveRun(run)
    } else if (cfg.useGemini) {
      log('warn', `AI critique enabled but ${cfg.provider} is not configured — skipped.`)
    }

    /* 5. registry recommendations — only immature / heavily repeated sections */
    if (cfg.useShadcn) {
      progress('components', 78, 'Matching Mobbin gaps to Shoogle + shadcn components')
      let skippedMature = 0
      const picks: ReturnType<typeof pickSectionsForRecommendations> = []
      for (const page of run.pages) {
        const pagePicks = pickSectionsForRecommendations(page.url, page.sections, run.findings, 6)
        skippedMature += Math.max(0, page.sections.length - pagePicks.length)
        picks.push(...pagePicks)
      }
      const REGISTRY_CONCURRENCY = 3
      try {
        const recs = await mapPool(
          picks,
          REGISTRY_CONCURRENCY,
          async (pick) => {
            checkpoint()
            try {
              const refs = run.references.filter(
                (r) => r.sectionId === pick.section.id || (!r.sectionId && r.kind !== 'flow')
              )
              // Resolve page URL from findings or section ownership across pages.
              const pageUrl =
                run.pages.find((p) => p.sections.some((s) => s.id === pick.section.id))?.url ??
                run.findings.find((f) => f.sectionId === pick.section.id)?.pageUrl
              const rec = await raceCancel(
                recommendForSection(
                  pick.section,
                  pick.problems,
                  settings.extraRegistries,
                  true,
                  refs,
                  pageUrl
                )
              )
              rec.reason = `[${pick.reasons.join(', ')}] ${rec.reason}`
              return rec
            } catch (e) {
              if (state.cancelled || (e as Error).name === 'CancelledError') throw new CancelledError()
              log('warn', `registry (${pick.section.role}): ${(e as Error).message}`)
              return null
            }
          },
          { shouldStop: () => state.cancelled }
        )
        for (const rec of recs) if (rec?.items?.length) run.recommendations.push(rec)
      } catch (e) {
        if ((e as Error).message === 'cancelled' || (e as Error).name === 'CancelledError') {
          throw new CancelledError()
        }
        throw e
      }
      const shoogleBacked = run.recommendations.filter((r) => r.source !== 'shadcn').length
      if (skippedMature > 0) {
        log('info', `Skipped Shoogle/shadcn for ${skippedMature} mature/unique section(s)`)
      }
      progress(
        'components',
        84,
        `${run.recommendations.length} section recommendation(s) · ${shoogleBacked} with Shoogle components${shoogleBacked === 0 ? ' (shadcn-only fallback)' : ''}`
      )
      await saveRun(run)
    }

    /* 6. flows */
    let flows = cfg.flows
    let flowOrigin: 'user' | 'ai' | 'derived' = 'user'
    checkpoint()
    if (flows.length === 0 && aiEnabled) {
      try {
        // Ground the proposal in the verbatim inventory the crawl produced.
        const inventory = flowInventory(run.pages)
        flows = (await raceCancel(proposeFlows(critic, model, run.pages, inventory))) as RunConfig['flows']
        flowOrigin = 'ai'
        log('info', `${cfg.provider} proposed ${flows.length} flow(s)`)
      } catch (e) {
        if (state.cancelled) throw new CancelledError()
        log('warn', `flow proposal failed: ${(e as Error).message}`)
      }
    }
    if (flows.length === 0) {
      // No hand-written flows and no model: derive journeys from the crawl so
      // "leave it empty" still tests something real.
      flows = heuristicFlows(run.pages)
      flowOrigin = 'derived'
      log('info', `Derived ${flows.length} flow(s) from the crawl (routes, primary CTA, navigation, footer)`)
    }

    // Nothing runs against targets the crawl never saw.
    const validated = validateFlows(flows, run.pages)
    const rejected = validated.filter((f) => f.invalid)
    for (const f of rejected) {
      log('warn', `flow "${f.name}" not run — ${f.invalid}`)
    }
    if (rejected.length && flowOrigin === 'ai') {
      run.findings.push({
        id: `flow-invalid-${run.id}`,
        category: 'flow',
        severity: 'nit',
        title: `${rejected.length} proposed flow(s) referenced things this product does not have`,
        detail: rejected.map((f) => `"${f.name}": ${f.invalid}`).join('\n'),
        fix: 'No action needed on the product — these were discarded before running so they could not produce false failures. Write your own flows on the New audit screen to test journeys that matter here.',
        pageUrl: cfg.targetUrl,
        source: 'ai'
      })
    }
    // AI proposals that all fail validation must not skip the flow phase —
    // fall back to crawl-derived journeys so the product still gets exercised.
    let runnable = validated.filter((f) => !f.invalid)
    if (runnable.length === 0 && flowOrigin === 'ai') {
      const derived = heuristicFlows(run.pages)
      const derivedValidated = validateFlows(derived, run.pages)
      runnable = derivedValidated.filter((f) => !f.invalid)
      if (runnable.length) {
        flowOrigin = 'derived'
        log(
          'info',
          `All ${rejected.length} AI flow(s) were invalid — falling back to ${runnable.length} crawl-derived flow(s)`
        )
      }
    }

    // AI flows often hop sidebar labels and never open detail/ID records.
    // Always append crawl-proven list→detail journeys so depth is exercised.
    if (runnable.length > 0) {
      const deep = validateFlows(detailRecordFlows(run.pages), run.pages).filter((f) => !f.invalid)
      const covered = new Set(runnable.map((f) => f.name.toLowerCase()))
      let added = 0
      for (const d of deep) {
        if (covered.has(d.name.toLowerCase())) continue
        runnable.push({ ...d })
        covered.add(d.name.toLowerCase())
        added++
      }
      if (added) log('info', `Added ${added} list→detail flow(s) for depth coverage`)
    }

    // Mobbin flow references → exercise gaps the product may be missing.
    {
      const mobbinFlowGaps = flowGapsFromMobbin(
        run.references.filter((r) => r.kind === 'flow'),
        run.pages,
        []
      )
      const suggested = validateFlows(flowsSuggestedByMobbinGaps(mobbinFlowGaps, run.pages), run.pages).filter(
        (f) => !f.invalid
      )
      const covered = new Set(runnable.map((f) => f.name.toLowerCase()))
      let added = 0
      for (const s of suggested) {
        if (covered.has(s.name.toLowerCase())) continue
        runnable.push({ ...s })
        covered.add(s.name.toLowerCase())
        added++
      }
      if (added) log('info', `Added ${added} Mobbin-gap flow(s)`)
    }

    if (runnable.length === 0) {
      log('info', 'No runnable flows for this product — skipping the flow phase.')
    }
    // Exercise as many journeys as the crawl produced, not an arbitrary handful.
    const flowBudget = Math.max(4, Math.min(20, run.pages.length + 3))
    for (const [i, flow] of runnable.slice(0, flowBudget).entries()) {
      checkpoint()
      progress('flows', 86, `Replaying flow ${i + 1}/${Math.min(runnable.length, flowBudget)}: "${flow.name}"`)
      try {
        const result = await raceCancel(
          runFlow(
            browser,
            cfg.targetUrl,
            {
              ...flow,
              origin: flowOrigin,
              refusedFills: flow.refusedFills,
              startingState: {
                signedInAs: cfg.auth?.username,
                storageStateId: storageState,
                seededDataNote: storageState ? 'signed-in storageState' : 'anonymous'
              }
            },
            assets,
            storageState
          )
        )
        run.flows.push(result)
        if (!result.ok) {
          const failed = result.steps.find((s) => !s.ok)
          const outcome = failed?.outcome ?? 'error'
          const sev =
            outcome === 'refused' ? ('nit' as const) : outcome === 'absent' ? ('major' as const) : ('critical' as const)
          run.findings.push({
            id: `flow-${run.flows.length}`,
            category: 'flow',
            severity: sev,
            title: `Flow "${flow.name}" ${outcome === 'refused' ? 'hit a refused control' : 'broke'} at step ${result.steps.filter((s) => s.ok).length + 1} of ${result.steps.length}`,
            detail: `${failed?.step.intent ?? failed?.step.action} ${failed?.step.target ?? ''} — ${failed?.error ?? 'unknown error'} (outcome=${outcome})\nStarting state: ${JSON.stringify(result.startingState ?? {})}\nThe target existed during the crawl, so the journey stops working somewhere after the preceding step.`,
            fix:
              outcome === 'refused'
                ? 'No product change — the control correctly refuses (readonly/disabled). Update the flow to skip this field or use an editable one.'
                : 'Confirm by hand before changing code: open the page, perform this step and watch what happens. If the control responds normally to a human, treat this as a flaky selector rather than a product defect — timeouts on elements that resolved but never became clickable are usually a wrapper/overlay issue, not a dead end.',
            pageUrl: cfg.targetUrl,
            evidence: failed?.screenshot ? [failed.screenshot] : undefined,
            source: 'heuristic',
            effort: outcome === 'refused' ? 'one-line' : 'component',
            confidence: 'high'
          })
        } else if (result.steps.some((s) => s.outcome === 'refused')) {
          log(
            'info',
            `flow "${flow.name}" passed with ${result.steps.filter((s) => s.outcome === 'refused').length} correctly refused fill(s)`
          )
        }
      } catch (e) {
        if (state.cancelled) throw new CancelledError()
        log('error', `flow "${flow.name}" crashed: ${(e as Error).message}`)
      }
    }

    // After journeys run, call out structural gaps vs Mobbin flow references.
    {
      const gaps = flowGapsFromMobbin(
        run.references.filter((r) => r.kind === 'flow'),
        run.pages,
        run.flows
      )
      if (gaps.length) {
        const gapFindings = findingsFromFlowGaps(gaps, cfg.targetUrl)
        run.findings.push(...gapFindings)
        log('info', `Mobbin flow gaps: ${gaps.map((g) => g.id).join(', ')}`)
        progress('flows', 88, `${gaps.length} Mobbin flow gap(s) called out`)
      }
    }

    /* 6b. optional production URL — lightweight presence + CSS-bytes compare */
    if (cfg.productionUrl && cfg.productionUrl.replace(/\/$/, '') !== cfg.targetUrl.replace(/\/$/, '')) {
      checkpoint()
      progress('prod-pass', 92, `Comparing against production ${cfg.productionUrl}`)
      try {
        const desktop = (cfg.viewports.length ? cfg.viewports : DEFAULT_VIEWPORTS).find((v) => !v.isMobile) ??
          DEFAULT_VIEWPORTS[0]
        const prodPage = await raceCancel(
          capturePage(browser, cfg.productionUrl, {
            viewports: [desktop],
            outDir: assets,
            onLog: (m) => log('info', m)
          })
        )
        const sels = [...new Set(run.findings.map((f) => f.selector).filter((s): s is string => !!s))].slice(0, 200)
        const presence: Record<string, boolean> = {}
        if (sels.length) {
          const ctx = await browser.newContext({
            viewport: { width: desktop.width, height: desktop.height },
            bypassCSP: true
          })
          const page = await ctx.newPage()
          try {
            await page.goto(prodPage.url || cfg.productionUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
            await page.waitForTimeout(800)
            const found = await page.evaluate((list: string[]) => {
              const out: Record<string, boolean> = {}
              for (const s of list) {
                try {
                  out[s] = !!document.querySelector(s)
                } catch {
                  out[s] = false
                }
              }
              return out
            }, sels)
            Object.assign(presence, found)
          } finally {
            await ctx.close().catch(() => {})
          }
        }
        const auditCssBytes = run.pages.reduce(
          (n, p) => n + (p.cssStats?.attribution?.totalBytes ?? p.cssStats?.bytes ?? 0),
          0
        )
        const prodCssBytes = prodPage.cssStats?.attribution?.totalBytes ?? prodPage.cssStats?.bytes ?? 0
        run.findings = applyProductionPresence(run.findings, presence, {
          prodCssBytes: prodCssBytes || undefined,
          auditCssBytes: auditCssBytes || undefined,
          productionUrl: cfg.productionUrl
        })
        const absent = Object.values(presence).filter((v) => !v).length
        log(
          'info',
          `Production pass: ${sels.length - absent}/${sels.length} selectors present; CSS ${prodCssBytes}B vs audit ${auditCssBytes}B`
        )
        if (prodPage.axe?.length) {
          // Lightweight a11y signal only — do not merge axe defects (different origin).
          log('info', `Production page reported ${prodPage.axe.length} axe violation(s) (informational; not graded)`)
        }
      } catch (e) {
        if (state.cancelled) throw new CancelledError()
        log('warn', `Production URL pass failed: ${(e as Error).message}`)
      }
    }

    /* 7. score + verdict */
    progress('scoring', 94, 'Scoring')
    // Collapse repeats before scoring so a deeper crawl cannot inflate the
    // penalty for a single shared-stylesheet fact.
    const beforeDedupe = run.findings.length
    run.findings = dedupeFindings(run.findings)
    if (beforeDedupe !== run.findings.length) {
      log('info', `Merged ${beforeDedupe - run.findings.length} repeated finding(s) reported on multiple pages`)
    }
    // Drop Agentation / vendor chrome from the product grade; keep an explanatory nit.
    const parted = partitionProductFindings(run.findings, cfg.targetUrl)
    run.excludedFindings = parted.excluded
    run.findings = parted.meta ? [...parted.product, parted.meta] : parted.product
    if (parted.excluded.length) {
      log('info', `Excluded ${parted.excluded.length} non-first-party finding(s) from the product grade`)
    }

    // Build-mode banner on the run.
    const modes = run.pages.map((p) => p.captureContext?.buildMode).filter(Boolean)
    run.buildMode =
      modes.includes('development') ? 'development' : modes.includes('production') ? 'production' : 'unknown'

    // Per-finding delta vs prior done run for this target.
    try {
      const prior = (await listRuns())
        .filter((r) => r.status === 'done' && r.id !== run.id && r.config.targetUrl === cfg.targetUrl)
        .sort((a, b) => (b.finishedAt ?? b.createdAt) - (a.finishedAt ?? a.createdAt))[0]
      if (prior?.findings?.length) {
        run.comparedToRunId = prior.id
        run.findings = diffFindingsAgainstPrior(run.findings, prior.findings)
        const fixed = fixedFindingsSincePrior(run.findings, prior.findings)
        if (fixed.length) {
          log(
            'info',
            `Since run ${prior.id}: ${run.findings.filter((f) => f.delta === 'new').length} new, ${fixed.length} fixed`
          )
        }
      }
    } catch {
      /* listRuns may fail mid-run */
    }

    run.scorecard = scoreRun(run.findings, run.pages.length, cfg.brutality)
    const aiDims = (run as { _aiPremiumDims?: Partial<PremiumDimensionScores> })._aiPremiumDims
    run.scorecard.premium = summarizePremiumCraft(run.pages, aiDims)
    delete (run as { _aiPremiumDims?: Partial<PremiumDimensionScores> })._aiPremiumDims
    if (aiEnabled && !state.cancelled) {
      try {
        run.geminiNotes = await raceCancel(
          finalVerdict(critic, model, run.findings, run.themeSummary ?? '', run.pages.map((p) => p.url))
        )
      } catch (e) {
        if (state.cancelled) throw new CancelledError()
        log('warn', `verdict failed: ${(e as Error).message}`)
      }
    }

    await browser.close()
    run.status = 'done'
    run.finishedAt = Date.now()
    progress('done', 100, `Done · grade ${run.scorecard.grade} (${run.scorecard.overall}/100)${run.scorecard.premium ? ` · premium ${run.scorecard.premium.grade}` : ''} · ${run.findings.length} findings`)
  } catch (e) {
    const msg = (e as Error).message
    // Cancelling closes the browser, so in-flight Playwright calls throw their
    // own errors — the user's intent decides the status, not the message.
    const wasCancelled = state.cancelled || e instanceof CancelledError || msg === 'cancelled'
    run.status = wasCancelled ? 'cancelled' : 'failed'
    run.finishedAt = Date.now()
    if (wasCancelled) {
      run.error = undefined
      // Salvage: audit whatever finished capturing before the stop.
      if (run.pages.length > 0 && run.findings.length === 0) {
        for (const page of run.pages) {
          try {
            run.findings.push(...auditPage(page, cfg))
            if (page.cssStats) run.findings.push(...auditCss(page, page.cssStats, cfg))
            if (page.tokenDictionary) run.findings.push(...auditTokens(page, page.tokenDictionary, cfg))
          } catch {
            /* partial page data */
          }
        }
        run.themeSummary = themeSummary(run.pages)
      }
      if (!run.scorecard && run.findings.length > 0) {
        run.scorecard = scoreRun(run.findings, Math.max(1, run.pages.length), cfg.brutality)
        run.scorecard.premium = summarizePremiumCraft(run.pages)
      }
      log('info', `Cancelled by user — keeping ${run.findings.length} finding(s) from ${run.pages.length} page(s)`)
      emit({
        runId: run.id,
        phase: 'cancelled',
        pct: 100,
        msg: `Cancelled · kept ${run.pages.length} page(s) and ${run.findings.length} finding(s)`
      })
    } else {
      run.error = msg
      log('error', msg)
      emit({ runId: run.id, phase: 'failed', pct: 100, msg })
    }
    try {
      await state.browser?.close()
    } catch {
      /* already gone */
    }
  } finally {
    // MCP transports hold open streams; drop them when the run is over.
    await Promise.allSettled([closeMobbin(), closeShoogle()])
    active.delete(run.id)
    await saveRun(run)
    onUpdate(run)
  }
  void dir
  return run
}
