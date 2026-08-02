/**
 * In-app updates from GitHub Releases.
 *
 * Honest constraint worth stating up front: Squirrel.Mac will only *install* an
 * update when the app is code-signed. This build is intentionally unsigned
 * (see package.json > build.mac.identity), so on macOS we still check for and
 * announce new versions, but hand the user to the release page to download
 * rather than pretending an auto-install will work and failing silently.
 *
 * Once a Developer ID certificate is configured, set QUALITION_AUTO_INSTALL=1
 * (or flip `canSelfInstall`) and the same flow downloads and installs in place.
 */
import { app, shell, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '../../shared/types.js'

const { autoUpdater } = electronUpdater

const RELEASES_URL = 'https://github.com/karthiknish/qualition/releases/latest'
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

let win: BrowserWindow | null = null
let status: UpdateStatus = { state: 'idle', currentVersion: app.getVersion() }
let timer: NodeJS.Timeout | null = null

/**
 * Signed builds can replace themselves; unsigned ones cannot. Never claim the
 * former when we are the latter.
 */
function canSelfInstall(): boolean {
  if (process.env.QUALITION_AUTO_INSTALL === '1') return true
  if (process.platform === 'darwin') return false
  return app.isPackaged
}

function emit(next: Partial<UpdateStatus>): void {
  status = { ...status, ...next, currentVersion: app.getVersion(), canSelfInstall: canSelfInstall() }
  win?.webContents.send('update:status', status)
}

export function getUpdateStatus(): UpdateStatus {
  return { ...status, canSelfInstall: canSelfInstall() }
}

export function initUpdater(window: BrowserWindow): void {
  win = window

  autoUpdater.autoDownload = canSelfInstall()
  autoUpdater.autoInstallOnAppQuit = canSelfInstall()
  autoUpdater.allowPrerelease = false
  autoUpdater.logger = null

  autoUpdater.on('checking-for-update', () => emit({ state: 'checking', error: undefined }))
  autoUpdater.on('update-available', (info) =>
    emit({
      state: canSelfInstall() ? 'downloading' : 'available',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes.slice(0, 4000) : undefined,
      releaseDate: info.releaseDate
    })
  )
  autoUpdater.on('update-not-available', () => emit({ state: 'idle', version: undefined }))
  autoUpdater.on('download-progress', (p) => emit({ state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => emit({ state: 'ready', version: info.version, percent: 100 }))
  autoUpdater.on('error', (err) =>
    emit({ state: 'error', error: String(err?.message ?? err).slice(0, 300) })
  )

  // Only meaningful for a packaged app; in dev there is no release to compare.
  if (app.isPackaged) {
    void checkForUpdates(false)
    timer = setInterval(() => void checkForUpdates(false), CHECK_INTERVAL_MS)
    timer.unref?.()
  } else {
    emit({ state: 'idle' })
  }
}

export async function checkForUpdates(userInitiated = true): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    emit({ state: 'dev', error: undefined })
    return getUpdateStatus()
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    emit({ state: 'error', error: (e as Error).message.slice(0, 300) })
    if (userInitiated) await shell.openExternal(RELEASES_URL)
  }
  return getUpdateStatus()
}

/** Install a downloaded update, or open the release page when we cannot. */
export async function installUpdate(): Promise<void> {
  if (status.state === 'ready' && canSelfInstall()) {
    autoUpdater.quitAndInstall(false, true)
    return
  }
  await shell.openExternal(RELEASES_URL)
}

export function dismissUpdate(): UpdateStatus {
  emit({ state: 'dismissed' })
  return getUpdateStatus()
}

export function disposeUpdater(): void {
  if (timer) clearInterval(timer)
  timer = null
  win = null
}
