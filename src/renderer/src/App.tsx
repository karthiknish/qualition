import { useCallback, useEffect, useMemo, useState } from 'react'
import type { IntegrationStatus, Run, RunProgress } from '../../shared/types'
import { api, cx } from './lib/api'
import NewRun from './views/NewRun'
import Runs from './views/Runs'
import Report from './views/Report'
import Explore from './views/Explore'
import SettingsView from './views/Settings'
import UpdateBanner from './components/UpdateBanner'

type View = 'new' | 'runs' | 'report' | 'explore' | 'settings'

const NAV: { id: View; label: string; hint: string }[] = [
  { id: 'new', label: 'New audit', hint: 'Point it at a URL' },
  { id: 'runs', label: 'Runs', hint: 'History' },
  { id: 'report', label: 'Report', hint: 'Findings & fixes' },
  { id: 'explore', label: 'Explore', hint: 'Mobbin + registry' },
  { id: 'settings', label: 'Settings', hint: 'Models & MCP' }
]

export default function App(): JSX.Element {
  const [view, setView] = useState<View>('new')
  const [runs, setRuns] = useState<Run[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [version, setVersion] = useState('')

  const refresh = useCallback(async () => setRuns(await api.listRuns()), [])

  useEffect(() => {
    void refresh()
    void api.status().then(setStatus)
    void api.appVersion().then(setVersion)
    const offP = api.onProgress(setProgress)
    const offU = api.onRunUpdate((r) => {
      setRuns((prev) => {
        const idx = prev.findIndex((p) => p.id === r.id)
        if (idx === -1) return [r, ...prev]
        const next = [...prev]
        next[idx] = r
        return next
      })
    })
    return () => {
      offP()
      offU()
    }
  }, [refresh])

  const activeRun = useMemo(
    () => runs.find((r) => r.id === activeId) ?? runs[0] ?? null,
    [runs, activeId]
  )
  const running = runs.find((r) => r.status === 'running' || r.status === 'queued')

  useEffect(() => {
    if (cancelling && !runs.some((r) => r.id === cancelling && (r.status === 'running' || r.status === 'queued'))) {
      setCancelling(null)
    }
  }, [runs, cancelling])

  const openRun = (id: string): void => {
    setActiveId(id)
    setView('report')
  }

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      <UpdateBanner />
      <header className="drag-region flex h-12 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-zinc-950/80 pl-20 pr-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-100 text-[11px] font-bold tracking-tight text-zinc-950">
            Q
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold tracking-tight text-zinc-50">Qualition</div>
            <div className="text-[10px] text-zinc-600">brutal UI/UX audits</div>
          </div>
          {version && (
            <button
              onClick={() => void api.checkForUpdates()}
              title="Check for updates"
              className="no-drag ml-1 rounded-md px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-600 transition-colors hover:bg-zinc-900 hover:text-zinc-400"
            >
              v{version}
            </button>
          )}
        </div>
        <div className="no-drag flex items-center gap-1.5">
          <StatusPill ok={status?.playwright.ok} label="browser" detail={status?.playwright.detail} />
          <StatusPill ok={status?.mobbin.ok} label="mobbin" detail={status?.mobbin.detail} />
          <StatusPill ok={status?.shoogle.ok} label="shoogle" detail={status?.shoogle.detail} />
          <StatusPill ok={status?.shadcn.ok} label="shadcn" detail={status?.shadcn.detail} />
          <StatusPill ok={status?.model.ok} label={status?.model.id ?? 'model'} detail={status?.model.detail} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-zinc-800/80 bg-zinc-950/40 p-3">
          {NAV.map((n) => {
            const active = view === n.id
            return (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                className={cx(
                  'group relative rounded-xl px-3 py-2.5 text-left transition-colors',
                  active ? 'bg-zinc-800/70 text-zinc-50' : 'text-zinc-400 hover:bg-zinc-900/80 hover:text-zinc-200'
                )}
              >
                {active && (
                  <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-zinc-100" />
                )}
                <span className="block text-[13px] font-medium">{n.label}</span>
                <span className={cx('block text-[11px]', active ? 'text-zinc-500' : 'text-zinc-600')}>{n.hint}</span>
              </button>
            )
          })}

          <div className="mt-auto space-y-2 px-0.5 pb-1">
            {running && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3 shadow-inner">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="flex items-center gap-1.5 uppercase tracking-wider">
                    <span
                      className={cx(
                        'h-1.5 w-1.5 rounded-full bg-emerald-400',
                        cancelling !== running.id && 'animate-pulse-soft'
                      )}
                    />
                    {progress?.phase ?? 'running'}
                  </span>
                  <span className="tabular-nums">{progress?.pct ?? 0}%</span>
                </div>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={cx(
                      'h-full rounded-full transition-all duration-300',
                      cancelling === running.id ? 'bg-amber-500' : 'bg-emerald-500'
                    )}
                    style={{ width: `${progress?.pct ?? 0}%` }}
                  />
                </div>
                <p className="mt-2 line-clamp-3 text-[11px] leading-snug text-zinc-500">
                  {cancelling === running.id
                    ? 'Stopping after the current step — partial results are kept.'
                    : progress?.msg}
                </p>
                <button
                  onClick={() => {
                    setCancelling(running.id)
                    void api.cancelRun(running.id)
                  }}
                  disabled={cancelling === running.id}
                  className={cx(
                    'mt-2.5 w-full rounded-lg border px-2 py-1.5 text-[11px] transition-colors',
                    cancelling === running.id
                      ? 'border-zinc-700 bg-zinc-800 text-zinc-500'
                      : 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                  )}
                >
                  {cancelling === running.id ? 'Cancelling…' : 'Cancel run'}
                </button>
              </div>
            )}
            <p className="px-1 text-[10px] leading-relaxed text-zinc-700">
              MCP + Mobbin OAuth reused from your local pi / Cursor setup.
            </p>
          </div>
        </nav>

        <main className="app-atmosphere min-w-0 flex-1 overflow-y-auto">
          {view === 'new' && (
            <NewRun
              status={status}
              onStarted={(r) => {
                setRuns((p) => [r, ...p])
                setActiveId(r.id)
                setView('report')
              }}
            />
          )}
          {view === 'runs' && <Runs runs={runs} onOpen={openRun} onRefresh={refresh} />}
          {view === 'report' && <Report run={activeRun} progress={progress} />}
          {view === 'explore' && <Explore runId={activeRun?.id} />}
          {view === 'settings' && <SettingsView onStatus={setStatus} status={status} />}
        </main>
      </div>
    </div>
  )
}

function StatusPill({ ok, label, detail }: { ok?: boolean; label: string; detail?: string }): JSX.Element {
  return (
    <span
      title={detail}
      className={cx(
        'flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] uppercase tracking-wider transition-colors',
        ok === undefined
          ? 'border-zinc-800/80 text-zinc-600'
          : ok
            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
            : 'border-red-500/25 bg-red-500/10 text-red-300'
      )}
    >
      <span
        className={cx(
          'h-1.5 w-1.5 rounded-full',
          ok ? 'bg-emerald-400' : ok === false ? 'bg-red-400' : 'bg-zinc-600'
        )}
      />
      {label}
    </span>
  )
}
