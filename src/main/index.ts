import { app, BrowserWindow, ipcMain, shell, dialog, protocol, net, nativeImage } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { executeRun, cancelRun, newRun } from './services/runner.js'
import { deleteRun, listRuns, loadRun, loadSettings, saveSettings, runDir, redactRun } from './services/store.js'
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
import { modelFor, type IntegrationStatus, type ProviderId, type Run, type RunConfig, type Settings } from '../shared/types.js'

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
      sandbox: false,
      contextIsolation: true
    }
  })
  win.on('ready-to-show', () => {
    win?.show()
    if (win) initUpdater(win)
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname_, '../renderer/index.html'))
}

app.whenReady().then(() => {
  // Dock icon for `npm run dev` / preview, where there is no .icns bundle yet.
  const icon = iconPath()
  if (icon && process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(icon))
  }

  protocol.handle('qasset', (req) => {
    const path = decodeURIComponent(new URL(req.url).pathname)
    return net.fetch(pathToFileURL(path).toString())
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

function registerIpc(): void {
  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => saveSettings(patch))
  // Live model list per provider — "latest" is whatever the key can actually see.
  ipcMain.handle('models:list', async (_e, provider: ProviderId) => {
    const settings = await loadSettings()
    return createProvider(provider, credsFromSettings(settings)).listModels()
  })
  ipcMain.handle('models:test', async (_e, provider: ProviderId) => {
    const settings = await loadSettings()
    const model = provider === 'openai' ? settings.openaiModel : provider === 'cursor' ? settings.cursorModel : settings.geminiModel
    return createProvider(provider, credsFromSettings(settings)).status(model)
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

  ipcMain.handle('runs:list', () => listRuns())
  ipcMain.handle('runs:get', (_e, id: string) => loadRun(id))
  ipcMain.handle('runs:delete', (_e, id: string) => deleteRun(id))
  ipcMain.handle('runs:reveal', (_e, id: string) => shell.openPath(runDir(id)))

  ipcMain.handle('runs:start', async (_e, config: RunConfig) => {
    const settings = await loadSettings()
    const run = newRun({
      ...config,
      provider: config.provider || settings.provider,
      geminiModel: config.geminiModel || modelFor(settings)
    })
    void executeRun(
      run,
      settings,
      (p) => win?.webContents.send('run:progress', p),
      // Credentials never cross the IPC boundary, even to our own renderer.
      (r: Run) => win?.webContents.send('run:update', redactRun(r))
    )
    return redactRun(run)
  })
  ipcMain.handle('runs:cancel', (_e, id: string) => cancelRun(id))

  ipcMain.handle('runs:export', async (_e, id: string) => {
    const run = await loadRun(id)
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

  /**
   * Component search: Shoogle first (11k+ community blocks), first-party
   * shadcn registry appended as fallback/complement.
   */
  /** Paste-ready remediation brief for an AI coding chat. */
  ipcMain.handle('runs:prompt', async (_e, args: { id: string; options?: PromptOptions }) => {
    const run = await loadRun(args.id)
    return run ? buildFixPrompt(run, args.options ?? {}) : null
  })

  /** What is actually inside a suggested component: deps, files, source. */
  ipcMain.handle(
    'components:detail',
    (_e, input: { name: string; registry: string; homepage?: string; addCommandArgument?: string }) =>
      fetchComponentDetail(input)
  )

  ipcMain.handle('registry:search', async (_e, query: string) => {
    const settings = await loadSettings()
    const results: any[] = []
    try {
      for (const it of await searchShoogle(query, 12)) {
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
      for (const i of searchRegistry(items, query, 10)) {
        results.push({ ...i, addCommand: addCommand(i), source: 'shadcn' })
      }
    } catch {
      /* registry offline */
    }
    return results
  })

  ipcMain.handle('mobbin:search', async (_e, args: { query: string; kind: 'screen' | 'section'; runId?: string }) => {
    const dir = args.runId ? join(runDir(args.runId), 'assets') : app.getPath('temp')
    return args.kind === 'section'
      ? searchSections(args.query, { limit: 6, outDir: dir })
      : searchScreens(args.query, { limit: 6, outDir: dir, platform: 'web' })
  })

  /* --------------------------- saved logins ---------------------------- */
  ipcMain.handle('creds:list', () => listCredentials())
  ipcMain.handle('creds:encryption', () => encryptionAvailable())
  ipcMain.handle('creds:origin', (_e, url: string) => originOf(url))
  ipcMain.handle(
    'creds:save',
    (
      _e,
      input: {
        origin: string
        username: string
        password: string
        loginUrl?: string
        usernameSelector?: string
        passwordSelector?: string
        submitSelector?: string
      }
    ) => saveCredential(input)
  )
  ipcMain.handle('creds:delete', (_e, origin: string) => deleteCredential(origin))

  /* ----------------------------- updates ------------------------------- */
  ipcMain.handle('update:status', () => getUpdateStatus())
  ipcMain.handle('update:check', () => checkForUpdates(true))
  ipcMain.handle('update:install', () => installUpdate())
  ipcMain.handle('update:dismiss', () => dismissUpdate())
  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle('shell:open', (_e, url: string) => shell.openExternal(url))
}
