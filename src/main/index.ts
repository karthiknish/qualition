import { app, BrowserWindow, ipcMain, shell, dialog, protocol, net, nativeImage } from 'electron'
import { join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { executeRun, cancelRun, newRun } from './services/runner.js'
import { deleteRun, listRuns, loadRun, loadSettings, saveSettings, runDir, runsRoot, redactRun } from './services/store.js'
import { ensureProjectForUrl, listProjects, getProject, bumpProjectRunCount, updateProjectMeta } from './services/projects.js'
import { deleteCredential, encryptionAvailable, listCredentials, originOf, saveCredential } from './services/vault.js'
import { mobbinStatus, searchScreens, searchSections } from './services/mobbin.js'
import { loadRegistry, registryStatus, searchRegistry, addCommand } from './services/shadcnRegistry.js'
import { fetchComponentDetail, searchShoogle, shoogleAddCommand, shoogleStatus } from './services/shoogle.js'
import { createProvider, credsFromSettings } from './services/providers.js'
import { DEFAULT_VIEWPORTS } from './services/crawler.js'
import { discoverUsedServers } from './services/credentials.js'
import { renderMarkdownReport } from './services/report.js'
import {
  checkForUpdates,
  dismissUpdate,
  disposeUpdater,
  getUpdateStatus,
  initUpdater,
  installUpdate
} from './services/updater.js'
import { buildFixPrompt, type PromptOptions } from './services/prompt.js'
import { configurePlaywrightBrowsersPath } from './services/browsers.js'
import { modelFor, type IntegrationStatus, type ProviderId, type Run, type RunConfig, type Settings } from '../shared/types.js'
import { normalizeTargetUrl } from '../shared/url.js'

const __dirname_ = fileURLToPath(new URL('.', import.meta.url))
let win: BrowserWindow | null = null

/**
 * Single source of truth for the product name. Packaged builds take it from
 * electron-builder's productName; in dev the menu bar would otherwise read
 * "Electron", so set it before the app is ready.
 * Keep this in sync with `build.productName` in package.json.
 */
const APP_NAME = 'Qualition'
app.setName(APP_NAME)

/**
 * Packaged builds get the icon from electron-builder, but in development the
 * dock/taskbar would otherwise show the generic Electron logo. Resolve the
 * bundled asset from either layout (out/main -> ../../resources in dev,
 * app.asar -> resources when packaged).
 */
function iconPath(): string | null {
  const candidates = [
    join(__dirname_, '../../resources/icon.png'),
    join(process.resourcesPath ?? '', 'icon.png'),
    join(app.getAppPath(), 'resources/icon.png')
  ]
  return candidates.find((p) => p && existsSync(p)) ?? null
}

/** qasset://<abs path> so the renderer can show screenshots without nodeIntegration. */
protocol.registerSchemesAsPrivileged([
  { scheme: 'qasset', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } }
])

function isSafeExternalUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function createWindow(): void {
  const icon = iconPath()
  win = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1100,
    show: false,
    title: APP_NAME,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#09090b',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname_, '../preload/index.mjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  })
  win.on('ready-to-show', () => {
    win?.show()
    if (win) initUpdater(win)
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    let ok = false
    try {
      const u = new URL(rendererUrl)
      ok = (u.protocol === 'http:' || u.protocol === 'https:') && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1')
    } catch {}
    if (ok) win.loadURL(rendererUrl)
    else {
      console.error(`Refusing to load ELECTRON_RENDERER_URL with unexpected origin: ${rendererUrl}`)
      win.loadFile(join(__dirname_, '../renderer/index.html'))
    }
  } else win.loadFile(join(__dirname_, '../renderer/index.html'))
}

app.whenReady().then(() => {
  configurePlaywrightBrowsersPath()

  // Dock icon for `npm run dev` / preview, where there is no .icns bundle yet.
  const icon = iconPath()
  if (icon && process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(icon))
  }

  protocol.handle('qasset', (req) => {
    try {
      const rawPath = decodeURIComponent(new URL(req.url).pathname)
      // Only serve files from known safe roots: runs/assets and temp
      const allowedRoots = [resolve(runsRoot()), resolve(app.getPath('temp'))]
      // Also allow the resolved path itself if it is under one of those roots
      const resolved = resolve(rawPath)
      const allowed = allowedRoots.some((root) => resolved === root || resolved.startsWith(root + '/'))
      if (!allowed) return new Response('Forbidden', { status: 403 })
      if (!existsSync(resolved)) return new Response('Not found', { status: 404 })
      return net.fetch(pathToFileURL(resolved).toString())
    } catch {
      return new Response('Bad request', { status: 400 })
    }
  })
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  disposeUpdater()
  if (process.platform !== 'darwin') app.quit()
})

const RUN_ID_RE = /^[a-z0-9-]{4,64}$/i
function assertRunId(id: unknown): string {
  if (typeof id !== 'string' || !RUN_ID_RE.test(id)) throw new Error(`Invalid run id: ${String(id).slice(0, 40)}`)
  return id
}
function assertNonEmptyString(v: unknown, label: string): string {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Invalid ${label}`)
  return v.trim()
}
function assertSettingsPatch(patch: unknown): Partial<Settings> {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid settings patch')
  const p = patch as Record<string, unknown>
  // Guard openaiBaseUrl hijack: must be http(s) or empty
  if (p.openaiBaseUrl !== undefined) {
    const v = String(p.openaiBaseUrl).trim()
    if (v && !/^https?:\/\/.+/.test(v)) throw new Error('Invalid openaiBaseUrl')
  }
  return patch as Partial<Settings>
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('settings:set', (_e, patch: unknown) => saveSettings(assertSettingsPatch(patch)))
  // Live model list per provider — "latest" is whatever the key can actually see.
  ipcMain.handle('models:list', async (_e, provider: unknown) => {
    if (!['gemini', 'openai', 'cursor', 'openrouter'].includes(String(provider))) throw new Error('Invalid provider')
    const settings = await loadSettings()
    return createProvider(provider as ProviderId, credsFromSettings(settings)).listModels()
  })
  ipcMain.handle('models:test', async (_e, provider: unknown) => {
    if (!['gemini', 'openai', 'cursor', 'openrouter'].includes(String(provider))) throw new Error('Invalid provider')
    const pid = provider as ProviderId
    const settings = await loadSettings()
    const model =
      pid === 'openai'
        ? settings.openaiModel
        : pid === 'cursor'
          ? settings.cursorModel
          : pid === 'openrouter'
            ? settings.openrouterModel
            : settings.geminiModel
    return createProvider(pid, credsFromSettings(settings)).status(model)
  })
  ipcMain.handle('viewports:default', () => DEFAULT_VIEWPORTS)

  ipcMain.handle('status:all', async (): Promise<IntegrationStatus> => {
    const settings = await loadSettings()
    const provider = createProvider(settings.provider, credsFromSettings(settings))
    const [mob, shoog, reg, model] = await Promise.all([
      mobbinStatus(),
      shoogleStatus(),
      registryStatus(settings.extraRegistries),
      provider.status(modelFor(settings))
    ])
    let playwright = { ok: true, detail: 'chromium ready' }
    try {
      const { chromium } = await import('playwright')
      const b = await chromium.launch({ headless: true })
      playwright = { ok: true, detail: `chromium ${b.version()}` }
      await b.close()
    } catch (e) {
      playwright = { ok: false, detail: `${(e as Error).message.slice(0, 200)} — run: npx playwright install chromium` }
    }
    return { mobbin: mob, shoogle: shoog, shadcn: reg, model, playwright }
  })

  // Only the servers Qualition uses — the rest of the machine's MCP inventory
  // is deliberately not read into the app or shown in the UI.
  ipcMain.handle('mcp:servers', () => discoverUsedServers())

  ipcMain.handle('runs:list', (_e, projectId: unknown) => {
    if (typeof projectId === 'string' && projectId.trim()) return listRuns(projectId.trim())
    return listRuns()
  })
  ipcMain.handle('runs:get', (_e, id: unknown) => loadRun(assertRunId(id)))
  ipcMain.handle('runs:delete', (_e, id: unknown) => deleteRun(assertRunId(id)))
  ipcMain.handle('runs:reveal', (_e, id: unknown) => shell.openPath(runDir(assertRunId(id))))
  ipcMain.handle('runs:approve', async (_e, id: unknown) => {
    const runId = assertRunId(String(id))
    const run = await loadRun(runId)
    if (!run) throw new Error(`Run not found: ${runId}`)
    run.approved = true
    const { saveRun } = await import('./services/store.js')
    await saveRun(run)
    return run
  })
  ipcMain.handle('projects:list', () => listProjects())
  ipcMain.handle('projects:get', (_e, id: unknown) => getProject(assertNonEmptyString(id, 'project id')))
  ipcMain.handle('projects:update', async (_e, args: unknown) => {
    const a = args as { id?: unknown; name?: unknown }
    const id = assertNonEmptyString(a?.id, 'project id')
    const name = typeof a?.name === 'string' ? a.name : ''
    return updateProjectMeta(id, { name })
  })

  ipcMain.handle('runs:start', async (_e, config: unknown) => {
    if (!config || typeof config !== 'object') throw new Error('Invalid run config')
    const cfg = config as RunConfig
    const target = String((cfg as { targetUrl?: unknown }).targetUrl ?? '')
    const normalized = normalizeTargetUrl(target)
    if (!normalized) throw new Error(`Invalid targetUrl: ${target.slice(0, 120)}`)
    if (String(normalized).startsWith('file:')) throw new Error('file: URLs are not allowed')
    cfg.targetUrl = normalized
    if (cfg.productionUrl) {
      const pn = normalizeTargetUrl(String(cfg.productionUrl))
      if (!pn) throw new Error(`Invalid productionUrl: ${String(cfg.productionUrl).slice(0, 120)}`)
      cfg.productionUrl = pn
    }
    if (cfg.diffMode && !['full', 'changed-only'].includes(String(cfg.diffMode))) {
      throw new Error('Invalid diffMode')
    }
    if (cfg.baselineRunId) assertRunId(String(cfg.baselineRunId))
    const project = await ensureProjectForUrl(normalized)
    cfg.projectId = project.id
    const settings = await loadSettings()
    const run = newRun({
      ...cfg,
      projectId: project.id,
      provider: cfg.provider || settings.provider,
      geminiModel: cfg.geminiModel || modelFor(settings)
    })
    void executeRun(
      run,
      settings,
      (p) => win?.webContents.send('run:progress', p),
      (r: Run) => {
        win?.webContents.send('run:update', redactRun(r))
        if (r.status === 'done' || r.status === 'failed' || r.status === 'cancelled') {
          void bumpProjectRunCount(project.id, r.id).catch(() => {})
        }
      }
    )
    return redactRun(run)
  })
  ipcMain.handle('runs:cancel', (_e, id: unknown) => cancelRun(assertRunId(String(id))))

  ipcMain.handle('runs:export', async (_e, id: unknown) => {
    const run = await loadRun(assertRunId(String(id)))
    if (!run) return null
    const md = renderMarkdownReport(run)
    const res = await dialog.showSaveDialog({
      defaultPath: `qualition-${run.config.targetUrl.replace(/https?:\/\//, '').replace(/\W+/g, '-')}-${id}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (res.canceled || !res.filePath) return null
    await writeFile(res.filePath, md, 'utf8')
    return res.filePath
  })
  ipcMain.handle('runs:exportSarif', async (_e, id: unknown) => {
    const { runToSarif } = await import('./services/sarif.js')
    const run = await loadRun(assertRunId(String(id)))
    if (!run) return null
    const sarif = runToSarif(run)
    const res = await dialog.showSaveDialog({
      defaultPath: `qualition-${run.config.targetUrl.replace(/https?:\/\//, '').replace(/\W+/g, '-')}-${id}.sarif`,
      filters: [{ name: 'SARIF', extensions: ['sarif', 'json'] }]
    })
    if (res.canceled || !res.filePath) return null
    await writeFile(res.filePath, JSON.stringify(sarif, null, 2), 'utf8')
    return res.filePath
  })
  ipcMain.handle('runs:exportHtml', async (_e, id: unknown) => {
    const { renderHtmlReport } = await import('./services/staticHtml.js')
    const run = await loadRun(assertRunId(String(id)))
    if (!run) return null
    const html = renderHtmlReport(run)
    const res = await dialog.showSaveDialog({
      defaultPath: `qualition-${run.config.targetUrl.replace(/https?:\/\//, '').replace(/\W+/g, '-')}-${id}.html`,
      filters: [{ name: 'HTML', extensions: ['html'] }]
    })
    if (res.canceled || !res.filePath) return null
    await writeFile(res.filePath, html, 'utf8')
    return res.filePath
  })

  /**
   * Component search: Shoogle first (11k+ community blocks), first-party
   * shadcn registry appended as fallback/complement.
   */
  /** Paste-ready remediation brief for an AI coding chat. */
  ipcMain.handle('runs:prompt', async (_e, args: unknown) => {
    const a = args as { id?: unknown; options?: PromptOptions }
    if (!a?.id) throw new Error('Missing run id')
    const run = await loadRun(assertRunId(String(a.id)))
    return run ? buildFixPrompt(run, a.options ?? {}) : null
  })

  /** What is actually inside a suggested component: deps, files, source. */
  ipcMain.handle(
    'components:detail',
    (_e, input: unknown) => {
      const v = input as { name?: unknown; registry?: unknown }
      if (!v?.name || !v?.registry) throw new Error('Invalid component detail input')
      return fetchComponentDetail(input as { name: string; registry: string; homepage?: string; addCommandArgument?: string })
    }
  )

  ipcMain.handle('registry:search', async (_e, query: unknown) => {
    const q = assertNonEmptyString(query, 'query').slice(0, 200)
    const settings = await loadSettings()
    const results: unknown[] = []
    try {
      for (const it of await searchShoogle(q, 12)) {
        results.push({
          name: it.name,
          registry: it.registry,
          type: it.type,
          description: it.description,
          addCommand: shoogleAddCommand(it),
          docs: it.homepage,
          source: 'shoogle'
        })
      }
    } catch {
      /* fall through to shadcn */
    }
    try {
      const items = await loadRegistry(settings.extraRegistries)
      for (const i of searchRegistry(items, q, 10)) {
        results.push({ ...i, addCommand: addCommand(i), source: 'shadcn' })
      }
    } catch {
      /* registry offline */
    }
    return results
  })

  ipcMain.handle('mobbin:search', async (_e, args: unknown) => {
    const a = args as { query?: unknown; kind?: unknown; runId?: unknown }
    const query = assertNonEmptyString(a?.query, 'query').slice(0, 200)
    const kind = a?.kind === 'section' ? 'section' : a?.kind === 'screen' ? 'screen' : null
    if (!kind) throw new Error('Invalid mobbin kind')
    const runId = a?.runId ? assertRunId(String(a.runId)) : undefined
    const dir = runId ? join(runDir(runId), 'assets') : app.getPath('temp')
    return kind === 'section'
      ? searchSections(query, { limit: 6, outDir: dir })
      : searchScreens(query, { limit: 6, outDir: dir, platform: 'web' })
  })

  /* --------------------------- saved logins ---------------------------- */
  ipcMain.handle('creds:list', () => listCredentials())
  ipcMain.handle('creds:encryption', () => encryptionAvailable())
  ipcMain.handle('creds:origin', (_e, url: unknown) => {
    const origin = originOf(String(url ?? ''))
    if (!origin) throw new Error(`Invalid URL: ${String(url).slice(0, 120)}`)
    return origin
  })
  ipcMain.handle(
    'creds:save',
    (
      _e,
      input: unknown
    ) => {
      const v = input as { origin?: unknown; username?: unknown; password?: unknown }
      if (!v?.origin || !v?.username || !v?.password) throw new Error('Missing credential fields')
      assertNonEmptyString(v.origin, 'origin')
      assertNonEmptyString(v.username, 'username')
      assertNonEmptyString(v.password, 'password')
      return saveCredential(input as { origin: string; username: string; password: string; loginUrl?: string; usernameSelector?: string; passwordSelector?: string; submitSelector?: string })
    }
  )
  ipcMain.handle('creds:delete', (_e, origin: unknown) => deleteCredential(assertNonEmptyString(origin, 'origin')))

  /* ----------------------------- updates ------------------------------- */
  ipcMain.handle('update:status', () => getUpdateStatus())
  ipcMain.handle('update:check', () => checkForUpdates(true))
  ipcMain.handle('update:install', () => installUpdate())
  ipcMain.handle('update:dismiss', () => dismissUpdate())
  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle('shell:open', (_e, url: unknown) => {
    const u = String(url ?? '')
    if (!isSafeExternalUrl(u)) throw new Error(`Refusing to open non-http(s) URL: ${u.slice(0, 120)}`)
    return shell.openExternal(u)
  })
}
