import { useState } from 'react'
import { FileText, FolderOpen, MoreHorizontal, RefreshCw, Trash2 } from 'lucide-react'
import type { Run } from '../../../shared/types'
import { api, cx, formatDuration, gradeColor } from '../lib/api'
import { Badge, Button, Empty, PageHeader, Panel } from '../components/ui'
import { RunTrend } from '../components/Trend'

export default function Runs({
  runs,
  onOpen,
  onRefresh
}: {
  runs: Run[]
  onOpen: (id: string) => void
  onRefresh: () => void
}): JSX.Element {
  const projectFilter = (() => {
    try {
      return new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('projectId')
    } catch {
      return null
    }
  })()
  const filtered = projectFilter ? runs.filter((r) => (r.projectId ?? r.config.projectId) === projectFilter) : runs
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-6 py-8">
      <PageHeader
        eyebrow="History"
        title={projectFilter ? `Runs · ${projectFilter}` : 'Runs'}
        description={
          projectFilter
            ? `Filtered to project ${projectFilter} — ${filtered.length} run(s). Clear the filter to see everything.`
            : 'Every audit kept on this machine — open a report, export markdown, or clear a run.'
        }
        actions={
          <div className="flex items-center gap-2">
            {projectFilter && (
              <Button size="sm" variant="ghost" onClick={() => window.history.replaceState(null, '', '#runs')}>
                Clear filter
              </Button>
            )}
            <Button size="sm" onClick={onRefresh}>
              <RefreshCw size={13} />
              Refresh
            </Button>
          </div>
        }
      />

      {filtered.length >= 2 && <RunTrend runs={filtered} />}
      <Panel bodyClassName="p-2" className="animate-fade-up">
        {filtered.length === 0 ? (
          <Empty title="No audits yet" icon={<FileText size={18} />}>
            Start one from New audit — results land here.
          </Empty>
        ) : (
          <ul className="space-y-1">
            {filtered.map((r) => (
              <RunRow key={r.id} run={r} onOpen={onOpen} onRefresh={onRefresh} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function RunRow({
  run: r,
  onOpen,
  onRefresh
}: {
  run: Run
  onOpen: (id: string) => void
  onRefresh: () => void
}): JSX.Element {
  const [menu, setMenu] = useState(false)
  const statusClass =
    r.status === 'done'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : r.status === 'running' || r.status === 'queued'
        ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
        : r.status === 'failed'
          ? 'border-red-500/30 bg-red-500/10 text-red-300'
          : r.status === 'cancelled'
            ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            : 'border-zinc-700 bg-zinc-800 text-zinc-400'

  return (
    <li className="group relative flex items-center gap-4 rounded-xl px-3 py-3 transition-colors hover:bg-zinc-800/40">
      <button
        onClick={() => onOpen(r.id)}
        className={cx(
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-xl font-semibold tracking-tight',
          gradeColor(r.scorecard?.overall ?? 0)
        )}
      >
        {r.scorecard?.grade ?? '–'}
      </button>
      <button onClick={() => onOpen(r.id)} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5 truncate text-[13px] font-medium text-zinc-100 group-hover:underline">
          <span className="truncate">{r.config.targetUrl}</span>
          {(r.projectId || r.config.projectId) && (
            <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">{r.projectId ?? r.config.projectId}</span>
          )}
          {r.config.diffMode === 'changed-only' && (
            <span className="shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-300">diff</span>
          )}
        </div>
        {r.diffSummary && (
          <div className="mt-1 text-[11px] text-zinc-500">
            vs {r.diffSummary.baselineRunId.slice(0, 8)} · {r.diffSummary.changedPages} changed / {r.diffSummary.unchangedPages} unchanged · {r.diffSummary.newPages} new
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
          <span>{new Date(r.createdAt).toLocaleString()}</span>
          {r.finishedAt && (
            <>
              <span className="text-zinc-700">·</span>
              <span className="font-mono tabular-nums text-zinc-400">
                {formatDuration(r.finishedAt - r.createdAt)}
              </span>
            </>
          )}
          <span className="text-zinc-700">·</span>
          <span>
            {r.pages.length} page{r.pages.length === 1 ? '' : 's'}
          </span>
          <span className="text-zinc-700">·</span>
          <span>{r.findings.length} findings</span>
          <span className="text-zinc-700">·</span>
          <span className="capitalize">{r.config.brutality}</span>
          <Badge className={statusClass}>{r.status}</Badge>
          {r.approved === false && <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-300">not baseline</Badge>}
          {r.git?.branch && <span className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[10px] text-zinc-500">{r.git.branch}</span>}
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-1.5 opacity-80 transition-opacity group-hover:opacity-100">
        <Button size="sm" variant="primary" onClick={() => onOpen(r.id)}>
          Open
        </Button>
        <div className="relative">
          <Button size="sm" variant="ghost" onClick={() => setMenu(!menu)}>
            <MoreHorizontal size={14} />
          </Button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
                <MenuItem
                  onClick={() => {
                    void api.exportRun(r.id)
                    setMenu(false)
                  }}
                >
                  <FileText size={12} />
                  Export markdown
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    void api.revealRun(r.id)
                    setMenu(false)
                  }}
                >
                  <FolderOpen size={12} />
                  Reveal files
                </MenuItem>
                {r.approved === false && (
                  <MenuItem
                    onClick={async () => {
                      setMenu(false)
                      await api.approveRun(r.id)
                      onRefresh()
                    }}
                  >
                    Approve as baseline
                  </MenuItem>
                )}
                <MenuItem
                  danger
                  onClick={async () => {
                    setMenu(false)
                    await api.deleteRun(r.id)
                    onRefresh()
                  }}
                >
                  <Trash2 size={12} />
                  Delete
                </MenuItem>
              </div>
            </>
          )}
        </div>
      </div>
    </li>
  )
}

function MenuItem({
  children,
  onClick,
  danger
}: {
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-zinc-800',
        danger ? 'text-red-300' : 'text-zinc-200'
      )}
    >
      {children}
    </button>
  )
}
