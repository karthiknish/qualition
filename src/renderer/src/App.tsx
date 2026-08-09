import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Compass,
  FileBarChart2,
  FolderKanban,
  History,
  Radar,
  Settings as SettingsIcon,
  SquareLibrary
} from 'lucide-react'
import type { IntegrationStatus, Run, RunProgress } from '../../shared/types'
import { api, cx, formatDuration } from './lib/api'
import { BrandLogo, providerBrand, type BrandId } from './components/BrandLogo'
import { ErrorBoundary } from './components/ErrorBoundary'
import NewRun from './views/NewRun'
import UpdateBanner from './components/UpdateBanner'

const Runs = lazy(() => import('./views/Runs'))
const Report = lazy(() => import('./views/Report'))
const Explore = lazy(() => import('./views/Explore'))
const SettingsView = lazy(() => import('./views/Settings'))
const Projects = lazy(() => import('./views/Projects'))

type View = 'new' | 'projects' | 'runs' | 'report' | 'explore' | 'settings'

const NAV: { id: View; label: string; hint: string; icon: LucideIcon }[] = [
  { id: 'new', label: 'New audit', hint: 'Point it at a URL', icon: Radar },
  { id: 'projects', label: 'Projects', hint: 'By origin · diff', icon: FolderKanban },
  { id: 'runs', label: 'Runs', hint: 'History', icon: History },
  { id: 'report', label: 'Report', hint: 'Findings & fixes', icon: FileBarChart2 },
  { id: 'explore', label: 'Explore', hint: 'Mobbin + registry', icon: Compass },
  { id: 'settings', label: 'Settings', hint: 'Models & MCP', icon: SettingsIcon }
]

export default function App(): JSX.Element {
  const [view, setView] = useState<View>(() => {
    const hash = window.location.hash.replace('#', '').split('?')[0] as View
    return (['new', 'projects', 'runs', 'report', 'explore', 'settings'] as View[]).includes(hash) ? hash : 'new'
  })
  const [runs, setRuns] = useState<Run[]>([])
  const [activeId, setActiveId] = useState<string | null>(() => {
    try {
      const h = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
      return h.get('runId')
    } catch {
      return null
    }
  })
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [version, setVersion] = useState('')
  const [appError, setAppError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setRuns(await api.listRuns())
      setAppError(null)
    } catch (e) {
      setAppError((e as Error).message)
    }
  }, [])

  // Persist view + activeId in hash for reload/back
  useEffect(() => {
    const hash = activeId ? `#${view}?runId=${encodeURIComponent(activeId)}` : `#${view}`
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash)
  }, [view, activeId])

  useEffect(() => {
    refresh().catch(() => {})
    api.status().then(setStatus).catch(() => {})
    api.appVersion().then(setVersion).catch(() => {})
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
    const onHash = (): void => {
      const hash = window.location.hash.replace('#', '').split('?')[0] as View
      if ((['new', 'projects', 'runs', 'report', 'explore', 'settings'] as View[]).includes(hash)) setView(hash)
    }
    window.addEventListener('hashchange', onHash)
    return () => {
      offP()
      offU()
      window.removeEventListener('hashchange', onHash)
    }
  }, [refresh])

  const activeRun = useMemo(
    () => runs.find((r) => r.id === activeId) ?? runs[0] ?? null,
    [runs, activeId]
  )
  const running = runs.find((r) => r.status === 'running' || r.status === 'queued')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [running?.id])

  useEffect(() => {
    if (cancelling && !runs.some((r) => r.id === cancelling && (r.status === 'running' || r.status === 'queued'))) {
      setCancelling(null)
    }
  }, [runs, cancelling])

  const openRun = (id: string): void => {
    setActiveId(id)
    setView('report')
    window.history.replaceState(null, '', `#report?runId=${encodeURIComponent(id)}`)
  }

  const modelBrand = providerBrand(status?.model.id)

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
          <StatusPill
            ok={status?.playwright.ok}
            label="browser"
            detail={status?.playwright.detail}
            brand="playwright"
          />
          <StatusPill
            ok={status?.mobbin.ok}
            label="mobbin"
            detail={status?.mobbin.detail}
            icon={<SquareLibrary size={11} strokeWidth={1.75} />}
          />
          <StatusPill ok={status?.shoogle.ok} label="shoogle" detail={status?.shoogle.detail} />
          <StatusPill
            ok={status?.shadcn.ok}
            label="shadcn"
            detail={status?.shadcn.detail}
            brand="shadcn"
          />
          <StatusPill
            ok={status?.model.ok}
            label={status?.model.id ?? 'model'}
            detail={status?.model.detail}
            brand={modelBrand ?? undefined}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Main navigation" className="flex w-56 shrink-0 flex-col gap-1 border-r border-zinc-800/80 bg-zinc-950/40 p-3">
          <div role="tablist" aria-orientation="vertical" className="flex flex-col gap-1">
          {NAV.map((n) => {
            const active = view === n.id
            const Icon = n.icon
            return (
              <button
                key={n.id}
                role="tab"
                aria-selected={active}
                aria-current={active ? 'page' : undefined}
                onClick={() => setView(n.id)}
                className={cx(
                  'group relative rounded-xl px-3 py-2.5 text-left transition-colors',
                  active ? 'bg-zinc-800/70 text-zinc-50' : 'text-zinc-400 hover:bg-zinc-900/80 hover:text-zinc-200'
                )}
              >
                {active && (
                  <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-zinc-100" />
                )}
                <span className="flex items-center gap-2">
                  <Icon
                    size={15}
                    strokeWidth={1.75}
                    className={cx('shrink-0', active ? 'text-zinc-100' : 'text-zinc-500 group-hover:text-zinc-300')}
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium">{n.label}</span>
                    <span className={cx('block text-[11px]', active ? 'text-zinc-500' : 'text-zinc-600')}>
                      {n.hint}
                    </span>
                  </span>
                </span>
              </button>
            )
          })}
          </div>

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
                  <span className="font-mono tabular-nums text-zinc-300">
                    {formatDuration(now - running.createdAt)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-end text-[10px] tabular-nums text-zinc-600">
                  {progress?.pct ?? 0}%
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
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
          {appError && (
            <div className="mx-6 mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-300" role="alert">
              {appError}
            </div>
          )}
          <Suspense fallback={<div className="p-8 text-sm text-zinc-500 animate-pulse">Loading…</div>}>
          <ErrorBoundary>
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
          {view === 'projects' && <Projects onOpenProject={(pid) => { setView('runs'); window.history.replaceState(null, '', `#runs?projectId=${encodeURIComponent(pid)}`) }} />}
          {view === 'runs' && <Runs runs={runs} onOpen={openRun} onRefresh={refresh} />}
          {view === 'report' && <Report run={activeRun} progress={progress} />}
          {view === 'explore' && <Explore runId={activeRun?.id} />}
          {view === 'settings' && <SettingsView onStatus={setStatus} status={status} />}
          </ErrorBoundary>
          </Suspense>
        </main>
      </div>
    </div>
  )
}

function StatusPill({
  ok,
  label,
  detail,
  brand,
  icon
}: {
  ok?: boolean
  label: string
  detail?: string
  brand?: BrandId
  icon?: JSX.Element
}): JSX.Element {
  return (
    <span
      title={detail}
      role="status"
      aria-label={`${label}: ${ok === undefined ? 'unknown' : ok ? 'ok' : 'error'}${detail ? ` — ${detail}` : ''}`}
      className={cx(
        'flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] uppercase tracking-wider transition-colors',
        ok === undefined
          ? 'border-zinc-800/80 text-zinc-600'
          : ok
            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
            : 'border-red-500/25 bg-red-500/10 text-red-300'
      )}
    >
      {brand ? (
        <BrandLogo id={brand} size={11} className="opacity-90" />
      ) : icon ? (
        icon
      ) : (
        <span
          className={cx(
            'h-1.5 w-1.5 rounded-full',
            ok ? 'bg-emerald-400' : ok === false ? 'bg-red-400' : 'bg-zinc-600'
          )}
        />
      )}
      {label}
    </span>
  )
}
