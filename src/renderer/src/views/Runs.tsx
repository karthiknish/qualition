import type { Run } from '../../../shared/types'
import { api, cx, gradeColor } from '../lib/api'
import { Badge, Button, Empty, Panel } from '../components/ui'

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
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Runs</h1>
        <Button size="sm" onClick={onRefresh}>
          Refresh
        </Button>
      </div>

      <Panel>
        {runs.length === 0 ? (
          <Empty>No audits yet. Start one from “New audit”.</Empty>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {runs.map((r) => (
              <li key={r.id} className="flex items-center gap-4 py-3">
                <div className={cx('w-12 shrink-0 text-center text-2xl font-semibold', gradeColor(r.scorecard?.overall ?? 0))}>
                  {r.scorecard?.grade ?? '–'}
                </div>
                <div className="min-w-0 flex-1">
                  <button onClick={() => onOpen(r.id)} className="block truncate text-left text-[13px] text-zinc-100 hover:underline">
                    {r.config.targetUrl}
                  </button>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                    <span>{new Date(r.createdAt).toLocaleString()}</span>
                    <span>·</span>
                    <span>{r.pages.length} pages</span>
                    <span>·</span>
                    <span>{r.findings.length} findings</span>
                    <span>·</span>
                    <span>{r.config.brutality}</span>
                    <Badge
                      className={
                        r.status === 'done'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : r.status === 'running'
                            ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                            : r.status === 'failed'
                              ? 'border-red-500/30 bg-red-500/10 text-red-300'
                              : 'border-zinc-700 bg-zinc-800 text-zinc-400'
                      }
                    >
                      {r.status}
                    </Badge>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button size="sm" onClick={() => onOpen(r.id)}>
                    Open
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => api.exportRun(r.id)}>
                    Export
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => api.revealRun(r.id)}>
                    Files
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      await api.deleteRun(r.id)
                      onRefresh()
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
