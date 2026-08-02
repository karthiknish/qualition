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
import { canInstallInPlace, downloadAndInstall, fetchLatestRelease, type ReleaseInfo } from './selfUpdate.js'
import type { UpdateStatus } from '../../shared/types.js'

const { autoUpdater } = electronUpdater

const RELEASES_URL = 'https://github.com/karthiknish/qualition/releases/latest'
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

let win: BrowserWindow | null = null
let status: UpdateStatus = { state: 'idle', currentVersion: app.getVersion() }
let timer: NodeJS.Timeout | null = null

/**
 * Squirrel.Mac cannot apply an update to an unsigned bundle, but we can: see
 * selfUpdate.ts, which downloads, verifies and swaps the bundle directly. So
 * the app *can* update itself in place — it just does not use Squirrel to do
 * it on macOS.
 */
function canSelfInstall(): boolean {
  if (process.env.QUALITION_AUTO_INSTALL === '1') return true
  return app.isPackaged
}

/** Cached metadata for the release we are offering. */
let pendingRelease: ReleaseInfo | null = null

function emit(next: Partial<UpdateStatus>): void {
  status = { ...status, ...next, currentVersion: app.getVersion(), canSelfInstall: canSelfInstall() }
  win?.webContents.send('update:status', status)
}

export function getUpdateStatus(): UpdateStatus {
  return { ...status, canSelfInstall: canSelfInstall() }
}

export function initUpdater(window: BrowserWindow): void {
  win = window

  // On macOS we drive the download ourselves, so never let Squirrel try.
  const useSquirrel = process.platform !== 'darwin'
  autoUpdater.autoDownload = useSquirrel && canSelfInstall()
  autoUpdater.autoInstallOnAppQuit = useSquirrel && canSelfInstall()
  autoUpdater.allowPrerelease = false
  autoUpdater.logger = null

  autoUpdater.on('checking-for-update', () => emit({ state: 'checking', error: undefined }))
  autoUpdater.on('update-available', (info) =>
    emit({
      state: useSquirrel && canSelfInstall() ? 'downloading' : 'available',
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

function isNewer(candidate: string, current: string): boolean {
  const parse = (v: string): number[] => v.replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0)
  const [a, b] = [parse(candidate), parse(current)]
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) > (b[i] ?? 0)) return true
    if ((a[i] ?? 0) < (b[i] ?? 0)) return false
  }
  return false
}

export async function checkForUpdates(userInitiated = true): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    emit({ state: 'dev', error: undefined })
    return getUpdateStatus()
  }

  // macOS: ask GitHub directly. electron-updater's mac path involves Squirrel
  // signature checks that an unsigned build cannot satisfy, and it reports that
  // as a generic failure — which is why an available update looked like "no
  // update" before.
  if (process.platform === 'darwin') {
    emit({ state: 'checking', error: undefined })
    try {
      const release = await fetchLatestRelease()
      if (release && isNewer(release.version, app.getVersion())) {
        pendingRelease = release
        emit({ state: 'available', version: release.version, releaseNotes: release.notes?.slice(0, 4000) })
      } else {
        pendingRelease = null
        emit({ state: 'idle', version: undefined })
      }
    } catch (e) {
      emit({ state: 'error', error: (e as Error).message.slice(0, 300) })
    }
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

/**
 * Install without leaving the app. On macOS this downloads, verifies and swaps
 * the bundle ourselves; elsewhere Squirrel handles it.
 */
export async function installUpdate(): Promise<void> {
  if (process.platform === 'darwin' && app.isPackaged) {
    const release = pendingRelease ?? (await fetchLatestRelease().catch(() => null))
    if (!release) {
      emit({ state: 'error', error: 'Could not resolve the latest release.' })
      return
    }
    if (!(await canInstallInPlace())) {
      emit({ state: 'error', error: 'App is not in a writable location — move it to /Applications.' })
      await shell.openExternal(RELEASES_URL)
      return
    }
    try {
      emit({ state: 'downloading', version: release.version, percent: 0 })
      await downloadAndInstall(release, (p) =>
        emit({
          state: p.stage === 'downloading' ? 'downloading' : 'installing',
          version: release.version,
          percent: p.percent
        })
      )
    } catch (e) {
      emit({ state: 'error', error: (e as Error).message.slice(0, 300) })
    }
    return
  }

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
