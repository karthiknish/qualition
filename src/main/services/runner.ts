/**
 * Run orchestrator: crawl → heuristics → Mobbin references → Gemini critique →
 * shadcn recommendations → flows → score. Emits progress as it goes.
 */
import { randomUUID } from 'node:crypto'
import type { Browser } from 'playwright'
import { crawl, launch, runFlow, DEFAULT_VIEWPORTS } from './crawler.js'
import { auditPage, dedupeFindings, scoreRun, themeSummary } from './audit.js'
import { critiquePage, critiqueSectionAgainstReferences, finalVerdict, makeCritic, proposeFlows } from './critic.js'
import { credsFromSettings } from './providers.js'
import { probeInteractions } from './interaction.js'
import { flowInventory, heuristicFlows, validateFlows } from './flows.js'
import { performLogin } from './auth.js'
import { modelFor } from '../../shared/types.js'
import { closeMobbin, searchScreens, searchSections, searchFlows } from './mobbin.js'
import { detectArchetype, queryForFlows, queryForSection, refineRoles } from './archetype.js'
import { closeShoogle } from './shoogle.js'
import { recommendForSection } from './shadcnRegistry.js'
import { auditCss } from './cssAudit.js'
import { compareWithBaseline } from './visual.js'
import { assetsDir, ensureRunDir, listRuns, saveRun } from './store.js'
import { resolveCredential, saveCredential } from './vault.js'
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
    }
    run.findings = findings
    run.themeSummary = themeSummary(run.pages)
    progress('heuristics', 36, `${findings.length} heuristic finding(s) · ${run.themeSummary}`)
    await saveRun(run)

    /* 2b. visual regression against the previous audit of the same target */
    try {
      const previous = (await listRuns()).find(
        (r) => r.id !== run.id && r.status === 'done' && r.config.targetUrl === cfg.targetUrl
      )
      if (previous) {
        const { diffs, findings: vrFindings } = await compareWithBaseline(run.pages, previous, assets)
        run.visualDiffs = diffs
        run.findings.push(...vrFindings)
        progress('visual-diff', 42, `Compared against run ${previous.id}: ${diffs.length} viewport diff(s), ${vrFindings.length} regression finding(s)`)
      } else {
        log('info', 'No previous run for this target — this run becomes the visual baseline.')
      }
    } catch (e) {
      log('warn', `visual diff failed: ${(e as Error).message}`)
    }

    /* 2c. deep interaction probe — actually operate the UI */
    if (cfg.useInteractionProbe) {
      const probeViewport = (cfg.viewports.length ? cfg.viewports : DEFAULT_VIEWPORTS)[0]
      for (const page of run.pages.slice(0, 4)) {
        checkpoint()
        progress('interaction', 44, `Operating controls on ${page.url}`)
        try {
          const { report, findings: probeFindings } = await raceCancel(
            probeInteractions(browser, page.url, {
            outDir: assets,
            viewport: probeViewport,
            maxControls: settings.maxControlsProbed ?? 30,
              budgetMs: 120_000,
              storageState,
              onLog: (m) => log('warn', m)
            })
          )
          run.interactions.push(report)
          run.findings.push(...probeFindings)
          log('info', `${page.url}: probed ${report.controlsProbed} controls → ${probeFindings.length} finding(s), ${report.deadClicks.length} dead click(s)`)
        } catch (e) {
          log('warn', `interaction probe failed: ${(e as Error).message}`)
        }
      }
      progress('interaction', 50, `${run.interactions.reduce((n, i) => n + i.controlsProbed, 0)} controls exercised`)
      await saveRun(run)
    }

    /* 3. Mobbin references per distinct section role */
    if (cfg.useMobbin) {
      progress('mobbin', 45, 'Pulling reference UI from Mobbin')
      // One search per *distinct screen intent*, built from the route,
      // headings and controls rather than a generic role template.
      const seenQueries = new Set<string>()
      for (const page of run.pages) {
        for (const s of page.sections) {
          checkpoint()
          if (seenQueries.size >= 10) break
          const query = queryForSection(s, page, detected.archetype, cfg.productContext)
          if (seenQueries.has(query)) continue
          seenQueries.add(query)
          log('info', `Mobbin query (${s.role} @ ${new URL(page.url).pathname}): ${query}`)
          try {
            const refs = await raceCancel(
              searchScreens(query, { platform: 'web', limit: 3, outDir: assets, sectionId: s.id })
            )
            run.references.push(...refs)
          } catch (e) {
            if (state.cancelled) throw new CancelledError()
            log('warn', `Mobbin screens (${s.role}): ${(e as Error).message}`)
          }
          // Section search only pays off for marketing-style pages; app screens
          // are better matched by whole screens.
          if (detected.archetype !== 'app') {
            try {
              const secRefs = await raceCancel(
                searchSections(query, { limit: 2, outDir: assets, sectionId: s.id })
              )
              run.references.push(...secRefs)
            } catch (e) {
              if (state.cancelled) throw new CancelledError()
              log('warn', `Mobbin sections (${s.role}): ${(e as Error).message}`)
            }
          }
        }
      }
      try {
        const flowQuery = queryForFlows(detected.archetype, cfg.productContext, run.pages)
        log('info', `Mobbin flow query: ${flowQuery}`)
        run.references.push(...(await raceCancel(searchFlows(flowQuery, { limit: 2, outDir: assets }))))
      } catch (e) {
        if (state.cancelled) throw new CancelledError()
        log('warn', `Mobbin flows: ${(e as Error).message}`)
      }
      progress('mobbin', 55, `${run.references.length} Mobbin reference(s) cached locally`)
      await saveRun(run)
    }

    /* 4. AI critique */
    if (aiEnabled) {
      // Each critique is a slow network round trip, so the work has to be
      // bounded: an "everything" crawl of 24 pages would otherwise queue ~48
      // sequential requests (tens of minutes) behind a single progress tick.
      const PAGE_BUDGET = 12
      const SECTION_BUDGET = 12
      const ranked = [...run.pages].sort(
        (a, b) =>
          run.findings.filter((f) => f.pageUrl === b.url).length -
          run.findings.filter((f) => f.pageUrl === a.url).length
      )
      const targetsForCritique = ranked.slice(0, PAGE_BUDGET)
      if (ranked.length > PAGE_BUDGET) {
        log(
          'info',
          `Critiquing the ${PAGE_BUDGET} pages with the most findings; skipping ${ranked.length - PAGE_BUDGET} quieter page(s) to keep the run bounded`
        )
      }
      let sectionBudgetLeft = SECTION_BUDGET
      progress(
        'critique',
        58,
        `Critiquing ${targetsForCritique.length} page(s) with ${cfg.provider}/${model}${critic.supportsVision ? '' : ' (text-only)'}`
      )

      for (const [index, page] of targetsForCritique.entries()) {
        checkpoint()
        // 58 -> 74 spread across the pages so the UI never looks frozen.
        const pct = 58 + Math.round(((index + 1) / targetsForCritique.length) * 14)
        progress('critique', pct, `Critiquing ${index + 1}/${targetsForCritique.length}: ${new URL(page.url).pathname || '/'}`)
        const interaction = run.interactions.find((i) => i.url === page.url)
        try {
          const res = await raceCancel(critiquePage(critic, model, page, cfg, interaction))
          run.findings.push(...res.findings)
          if (res.themeRead) run.themeSummary = `${run.themeSummary}\n\n${res.themeRead}`
          log('info', `${cfg.provider}: ${res.findings.length} finding(s) on ${page.url}`)
        } catch (e) {
          if (state.cancelled) throw new CancelledError()
          log('error', `page critique failed on ${page.url}: ${(e as Error).message}`)
        }
        // section-level comparison against references, worst sections first
        const targets = page.sections
          .filter((s) => s.screenshot)
          .sort((a, b) => b.rect.height - a.rect.height)
          .slice(0, Math.max(0, Math.min(3, sectionBudgetLeft)))
        for (const s of targets) {
          checkpoint()
          if (sectionBudgetLeft <= 0) break
          sectionBudgetLeft--
          const refs = run.references.filter((r) => r.sectionId === s.id)
          try {
            run.findings.push(...(await raceCancel(critiqueSectionAgainstReferences(critic, model, page, s, refs, cfg))))
          } catch (e) {
            if (state.cancelled) throw new CancelledError()
            log('warn', `section critique ${s.id}: ${(e as Error).message}`)
          }
        }
      }
      progress('critique', 74, `${run.findings.filter((f) => f.source === 'ai').length} AI finding(s)`)
      await saveRun(run)
    } else if (cfg.useGemini) {
      log('warn', `AI critique enabled but ${cfg.provider} is not configured — skipped.`)
    }

    /* 5. shadcn recommendations per section */
    if (cfg.useShadcn) {
      progress('shadcn', 78, 'Matching sections to shadcn registry components')
      for (const page of run.pages) {
        for (const s of page.sections) {
          checkpoint()
          const problems = run.findings
            .filter((f) => f.sectionId === s.id && f.pageUrl === page.url)
            .map((f) => f.title)
          try {
            run.recommendations.push(await raceCancel(recommendForSection(s, problems, settings.extraRegistries, true)))
          } catch (e) {
            if (state.cancelled) throw new CancelledError()
            log('warn', `registry (${s.role}): ${(e as Error).message}`)
          }
        }
      }
      const shoogleBacked = run.recommendations.filter((r) => r.source !== 'shadcn').length
      progress('components', 84, `${run.recommendations.length} section recommendation(s) · ${shoogleBacked} from Shoogle community registries`)
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
    const runnable = validated.filter((f) => !f.invalid)
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
          runFlow(browser, cfg.targetUrl, { ...flow, origin: flowOrigin }, assets, storageState)
        )
        run.flows.push(result)
        if (!result.ok) {
          const failed = result.steps.find((s) => !s.ok)
          // Every target here was verified to exist before the run, so a
          // failure now really is the product misbehaving.
          run.findings.push({
            id: `flow-${run.flows.length}`,
            category: 'flow',
            severity: 'critical',
            title: `Flow "${flow.name}" broke at step ${result.steps.filter((s) => s.ok).length + 1} of ${result.steps.length}`,
            detail: `${failed?.step.action} ${failed?.step.target ?? ''} — ${failed?.error ?? 'unknown error'}\nThe target existed during the crawl, so the journey stops working somewhere after the preceding step.`,
            fix: 'Confirm by hand before changing code: open the page, perform this step and watch what happens. If the control responds normally to a human, treat this as a flaky selector rather than a product defect — timeouts on elements that resolved but never became clickable are usually a wrapper/overlay issue, not a dead end.',
            pageUrl: cfg.targetUrl,
            evidence: failed?.screenshot ? [failed.screenshot] : undefined,
            source: 'heuristic'
          })
        }
      } catch (e) {
        if (state.cancelled) throw new CancelledError()
        log('error', `flow "${flow.name}" crashed: ${(e as Error).message}`)
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
    run.scorecard = scoreRun(run.findings, run.pages.length, cfg.brutality)
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
    progress('done', 100, `Done · grade ${run.scorecard.grade} (${run.scorecard.overall}/100) · ${run.findings.length} findings`)
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
          } catch {
            /* partial page data */
          }
        }
        run.themeSummary = themeSummary(run.pages)
      }
      if (!run.scorecard && run.findings.length > 0) {
        run.scorecard = scoreRun(run.findings, Math.max(1, run.pages.length), cfg.brutality)
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
