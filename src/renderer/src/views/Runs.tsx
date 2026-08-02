import { useState } from 'react'
import type { Run } from '../../../shared/types'
import { api, cx, gradeColor } from '../lib/api'
import { Badge, Button, Empty, PageHeader, Panel } from '../components/ui'

export default function Runs({
  runs,
  onOpen,
  onRefresh
}: {
  runs: Run[]
  onOpen: (id: string) => void
  onRefresh: () => void
}): JSX.Element {
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-6 py-8">
      <PageHeader
        eyebrow="History"
        title="Runs"
        description="Every audit kept on this machine — open a report, export markdown, or clear a run."
        actions={
          <Button size="sm" onClick={onRefresh}>
            Refresh
          </Button>
        }
      />

      <Panel bodyClassName="p-2" className="animate-fade-up">
        {runs.length === 0 ? (
          <Empty title="No audits yet">Start one from New audit — results land here.</Empty>
        ) : (
          <ul className="space-y-1">
            {runs.map((r) => (
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
        <div className="truncate text-[13px] font-medium text-zinc-100 group-hover:underline">
          {r.config.targetUrl}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
          <span>{new Date(r.createdAt).toLocaleString()}</span>
          <span className="text-zinc-700">·</span>
          <span>
            {r.pages.length} page{r.pages.length === 1 ? '' : 's'}
          </span>
          <span className="text-zinc-700">·</span>
          <span>{r.findings.length} findings</span>
          <span className="text-zinc-700">·</span>
          <span className="capitalize">{r.config.brutality}</span>
          <Badge className={statusClass}>{r.status}</Badge>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-1.5 opacity-80 transition-opacity group-hover:opacity-100">
        <Button size="sm" variant="primary" onClick={() => onOpen(r.id)}>
          Open
        </Button>
        <div className="relative">
          <Button size="sm" variant="ghost" onClick={() => setMenu(!menu)}>
            ···
          </Button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
                <MenuItem
                  onClick={() => {
                    void api.exportRun(r.id)
                    setMenu(false)
                  }}
                >
                  Export markdown
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    void api.revealRun(r.id)
                    setMenu(false)
                  }}
                >
                  Reveal files
                </MenuItem>
                <MenuItem
                  danger
                  onClick={async () => {
                    setMenu(false)
                    await api.deleteRun(r.id)
                    onRefresh()
                  }}
                >
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
        'block w-full px-3 py-1.5 text-left text-[12px] hover:bg-zinc-800',
        danger ? 'text-red-300' : 'text-zinc-200'
      )}
    >
      {children}
    </button>
  )
}
