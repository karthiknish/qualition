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
  { id: 'settings', label: 'Settings', hint: 'Gemini & MCP' }
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

  // Clear the "cancelling" state once the run actually stops.
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
    <div className="flex h-full flex-col bg-zinc-950">
      <UpdateBanner />
      <header className="drag-region flex h-11 shrink-0 items-center justify-between border-b border-zinc-800 pl-20 pr-3">
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] font-semibold tracking-tight text-zinc-100">Qualition</span>
          <span className="text-[11px] text-zinc-600">brutal UI/UX audits</span>
          {version && (
            <button
              onClick={() => void api.checkForUpdates()}
              title="Check for updates"
              className="no-drag rounded px-1 text-[10px] text-zinc-700 hover:text-zinc-400"
            >
              v{version}
            </button>
          )}
        </div>
        <div className="no-drag flex items-center gap-2">
          <StatusPill ok={status?.playwright.ok} label="browser" detail={status?.playwright.detail} />
          <StatusPill ok={status?.mobbin.ok} label="mobbin" detail={status?.mobbin.detail} />
          <StatusPill ok={status?.shoogle.ok} label="shoogle" detail={status?.shoogle.detail} />
          <StatusPill ok={status?.shadcn.ok} label="shadcn" detail={status?.shadcn.detail} />
          <StatusPill ok={status?.model.ok} label={status?.model.id ?? 'model'} detail={status?.model.detail} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-52 shrink-0 flex-col gap-0.5 border-r border-zinc-800 p-2.5">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              className={cx(
                'rounded-lg px-3 py-2 text-left transition-colors',
                view === n.id ? 'bg-zinc-800/80 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
              )}
            >
              <span className="block text-[13px]">{n.label}</span>
              <span className="block text-[11px] text-zinc-600">{n.hint}</span>
            </button>
          ))}

          <div className="mt-auto space-y-2 px-1 pb-1">
            {running && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="uppercase tracking-wider">{progress?.phase ?? 'running'}</span>
                  <span>{progress?.pct ?? 0}%</span>
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={cx('h-full transition-all', cancelling === running.id ? 'bg-amber-500' : 'bg-emerald-500')}
                    style={{ width: `${progress?.pct ?? 0}%` }}
                  />
                </div>
                <p className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-zinc-500">
                  {cancelling === running.id ? 'Stopping after the current step — partial results are kept.' : progress?.msg}
                </p>
                <button
                  onClick={() => {
                    setCancelling(running.id)
                    void api.cancelRun(running.id)
                  }}
                  disabled={cancelling === running.id}
                  className={cx(
                    'mt-2 w-full rounded-md border px-2 py-1 text-[11px] transition-colors',
                    cancelling === running.id
                      ? 'border-zinc-700 bg-zinc-800 text-zinc-500'
                      : 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                  )}
                >
                  {cancelling === running.id ? 'Cancelling…' : 'Cancel'}
                </button>
              </div>
            )}
            <p className="text-[10px] leading-tight text-zinc-700">
              MCP config + Mobbin OAuth reused from your local pi / Cursor setup.
            </p>
          </div>
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto">
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
        'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider',
        ok === undefined
          ? 'border-zinc-800 text-zinc-600'
          : ok
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            : 'border-red-500/30 bg-red-500/10 text-red-300'
      )}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', ok ? 'bg-emerald-400' : ok === false ? 'bg-red-400' : 'bg-zinc-600')} />
      {label}
    </span>
  )
}
