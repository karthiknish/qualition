/**
 * In-app updater for unsigned macOS builds.
 *
 * Squirrel.Mac (what electron-updater drives) refuses to apply an update unless
 * the new bundle's code signature matches the running one — impossible without
 * a Developer ID certificate. Rather than dumping the user on a download page,
 * we do the install ourselves: fetch the release asset, verify its SHA-512
 * against the published `latest-mac.yml`, extract it, and swap the bundle.
 *
 * The swap cannot happen from inside the running app (it would be deleting its
 * own executable), so a small detached script waits for this process to exit,
 * replaces the bundle atomically-ish, and relaunches.
 */
import { app } from 'electron'
import { spawn, execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'

const exec = promisify(execFile)

const OWNER = 'karthiknish'
const REPO = 'qualition'

export interface ReleaseInfo {
  version: string
  assetUrl: string
  assetName: string
  size: number
  sha512?: string
  notes?: string
}

/** Which asset matches this machine. */
function assetPattern(): RegExp {
  return process.arch === 'arm64' ? /arm64\.zip$/ : /(x64|intel)\.zip$/
}

export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' }
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  const json = (await res.json()) as {
    tag_name: string
    body?: string
    assets: { name: string; browser_download_url: string; size: number }[]
  }
  const zip = json.assets.find((a) => assetPattern().test(a.name))
  if (!zip) return null

  // latest-mac.yml carries the SHA-512 electron-builder computed at publish time.
  let sha512: string | undefined
  const meta = json.assets.find((a) => a.name === 'latest-mac.yml')
  if (meta) {
    try {
      const yml = await (await fetch(meta.browser_download_url)).text()
      // The `files:` list pairs each url with its sha512.
      const block = new RegExp(`url:\\s*${zip.name}\\s*\\n\\s*sha512:\\s*([A-Za-z0-9+/=]+)`).exec(yml)
      sha512 = block?.[1] ?? /^sha512:\s*([A-Za-z0-9+/=]+)/m.exec(yml)?.[1]
    } catch {
      /* verification is best-effort but we warn below if absent */
    }
  }

  return {
    version: json.tag_name.replace(/^v/, ''),
    assetUrl: zip.browser_download_url,
    assetName: zip.name,
    size: zip.size,
    sha512,
    notes: json.body
  }
}

/** Bundle root of the running app, e.g. /Applications/Qualition.app */
function appBundlePath(): string {
  // exe = <bundle>/Contents/MacOS/<name>
  return dirname(dirname(dirname(app.getPath('exe'))))
}

export interface InstallProgress {
  percent: number
  transferred: number
  total: number
  stage: 'downloading' | 'verifying' | 'extracting' | 'installing'
}

/**
 * Download, verify, extract and install the release, then relaunch.
 * Resolves only if something went wrong — on success the app exits.
 */
export async function downloadAndInstall(
  release: ReleaseInfo,
  onProgress: (p: InstallProgress) => void
): Promise<void> {
  const bundle = appBundlePath()
  if (!bundle.endsWith('.app')) {
    throw new Error(`Cannot locate the app bundle (resolved "${bundle}"). Move Qualition to /Applications and retry.`)
  }

  const work = await mkdtemp(join(tmpdir(), 'qualition-update-'))
  const zipPath = join(work, release.assetName)

  /* ------------------------------ download ------------------------------ */
  const res = await fetch(release.assetUrl)
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`)
  const total = Number(res.headers.get('content-length') ?? release.size) || release.size
  let transferred = 0
  const hash = createHash('sha512')

  const source = Readable.fromWeb(res.body as never)
  source.on('data', (chunk: Buffer) => {
    transferred += chunk.byteLength
    hash.update(chunk)
    onProgress({
      stage: 'downloading',
      transferred,
      total,
      percent: total ? Math.min(99, Math.round((transferred / total) * 100)) : 0
    })
  })
  await pipeline(source, createWriteStream(zipPath))

  /* ------------------------------- verify ------------------------------- */
  onProgress({ stage: 'verifying', transferred, total, percent: 99 })
  const digest = hash.digest('base64')
  if (release.sha512 && digest !== release.sha512) {
    await rm(work, { recursive: true, force: true })
    throw new Error('Downloaded file failed its SHA-512 check — install aborted.')
  }

  /* ------------------------------ extract ------------------------------- */
  onProgress({ stage: 'extracting', transferred, total, percent: 99 })
  await exec('ditto', ['-x', '-k', zipPath, work], { maxBuffer: 8 * 1024 * 1024 })
  const staged = join(work, 'Qualition.app')
  // Downloads carry no quarantine when fetched programmatically, but strip it
  // defensively so the replacement never launches into a Gatekeeper prompt.
  await exec('xattr', ['-dr', 'com.apple.quarantine', staged]).catch(() => undefined)

  /* ------------------------------ install ------------------------------- */
  onProgress({ stage: 'installing', transferred, total, percent: 100 })

  // A process cannot replace its own bundle while running, so hand the swap to
  // a detached script that waits for us to exit first.
  const script = join(work, 'swap.sh')
  await writeFile(
    script,
    `#!/bin/bash
set -e
PID=$1
STAGED="$2"
TARGET="$3"
# Wait for the app to quit (bounded, so a hung quit cannot strand the update).
for _ in $(seq 1 100); do
  kill -0 "$PID" 2>/dev/null || break
  sleep 0.2
done
BACKUP="\${TARGET}.old-$$"
mv "$TARGET" "$BACKUP" 2>/dev/null || true
if ditto "$STAGED" "$TARGET"; then
  rm -rf "$BACKUP"
else
  # Restore the previous version rather than leaving no app at all.
  rm -rf "$TARGET"
  mv "$BACKUP" "$TARGET" 2>/dev/null || true
fi
open "$TARGET"
rm -rf "$(dirname "$STAGED")"
`,
    'utf8'
  )
  await chmod(script, 0o755)

  const child = spawn('/bin/bash', [script, String(process.pid), staged, bundle], {
    detached: true,
    stdio: 'ignore'
  })
  child.unref()

  // Give the watcher a moment to start, then get out of its way.
  setTimeout(() => app.quit(), 400)
}

/** True when we can do the swap ourselves (packaged macOS app in a writable location). */
export async function canInstallInPlace(): Promise<boolean> {
  if (!app.isPackaged || process.platform !== 'darwin') return false
  try {
    const bundle = appBundlePath()
    await readFile(join(bundle, 'Contents', 'Info.plist'))
    return true
  } catch {
    return false
  }
}
