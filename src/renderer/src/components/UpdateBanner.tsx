import { useEffect, useState } from 'react'
import type { UpdateStatus } from '../../../shared/types'
import { api, cx } from '../lib/api'

/**
 * Update popup. Appears only when there is something to act on, and is honest
 * about what it can do: an unsigned macOS build cannot replace itself, so it
 * offers the download page instead of a fake "Restart to install".
 */
export default function UpdateBanner(): JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void api.updateStatus().then(setStatus)
    return api.onUpdateStatus(setStatus)
  }, [])

  if (!status) return null
  const { state, version, currentVersion, percent, canSelfInstall } = status
  if (state === 'idle' || state === 'checking' || state === 'dismissed' || state === 'dev') return null
  if (state === 'error') return null

  const isReady = state === 'ready'
  const isDownloading = state === 'downloading'

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
      <div className="flex items-start gap-3 p-3.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-[13px] text-emerald-300">
          ↑
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-zinc-100">
            {isReady ? 'Update ready to install' : isDownloading ? 'Downloading update…' : 'Update available'}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Qualition {version ?? ''} · you have {currentVersion}
          </p>

          {isDownloading && typeof percent === 'number' && (
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
            </div>
          )}

          {status.releaseNotes && !isDownloading && (
            <p className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-zinc-400">
              {status.releaseNotes.replace(/<[^>]+>/g, '').slice(0, 180)}
            </p>
          )}

          {!canSelfInstall && !isDownloading && (
            <p className="mt-1.5 text-[10px] leading-snug text-zinc-600">
              This build is unsigned, so it cannot replace itself — the download page will open instead.
            </p>
          )}

          <div className="mt-2.5 flex gap-2">
            <button
              disabled={busy || isDownloading}
              onClick={async () => {
                setBusy(true)
                await api.installUpdate()
                setBusy(false)
              }}
              className={cx(
                'rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors',
                isDownloading
                  ? 'cursor-not-allowed bg-zinc-800 text-zinc-500'
                  : 'bg-zinc-100 text-zinc-900 hover:bg-white'
              )}
            >
              {isReady && canSelfInstall ? 'Restart & install' : canSelfInstall ? 'Install' : 'Download'}
            </button>
            <button
              onClick={() => void api.dismissUpdate()}
              className="rounded-lg px-2.5 py-1 text-[12px] text-zinc-400 hover:text-zinc-100"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
