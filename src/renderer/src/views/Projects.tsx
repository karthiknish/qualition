import { useEffect, useState } from 'react'
import { FolderKanban, ExternalLink, Clock, Hash } from 'lucide-react'
import type { Project, Run } from '../../../shared/types'
import { api, cx } from '../lib/api'
import { Button, Empty, PageHeader, Panel, Badge, Input } from '../components/ui'

export default function Projects({ onOpenProject }: { onOpenProject: (projectId: string) => void }): JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const refresh = async (): Promise<void> => {
    const [ps, rs] = await Promise.all([api.listProjects(), api.listRuns()])
    setProjects(ps)
    setRuns(rs)
  }
  useEffect(() => { void refresh() }, [])

  const runCountFor = (id: string): number => runs.filter((r) => r.projectId === id || r.config.projectId === id).length

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-6 py-8">
      <PageHeader
        eyebrow="Projects"
        title="Projects"
        description="Runs are grouped by origin. Each project keeps its own baseline for diff-based audits — re-audit only what changed."
      />
      <Panel bodyClassName="p-2">
        {projects.length === 0 ? (
          <Empty title="No projects yet" icon={<FolderKanban size={18} />}>
            Run an audit — a project is created automatically from the target origin.
          </Empty>
        ) : (
          <ul className="space-y-1">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center gap-4 rounded-xl px-3 py-3 hover:bg-zinc-800/40">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-400">
                  <FolderKanban size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  {editing === p.id ? (
                    <div className="flex items-center gap-2">
                      <Input value={editName} onChange={setEditName} placeholder="Project name" />
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={async () => {
                          await api.updateProject(p.id, editName)
                          setEditing(null)
                          void refresh()
                        }}
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-zinc-100">{p.name}</span>
                        <Badge className="border-zinc-700 bg-zinc-800 text-zinc-400"><Hash size={10} />{p.slug}</Badge>
                        <button
                          onClick={() => { setEditing(p.id); setEditName(p.name) }}
                          className="text-[11px] text-zinc-500 hover:text-zinc-300"
                        >
                          rename
                        </button>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
                        <span className="flex items-center gap-1"><ExternalLink size={11} />{p.origin}</span>
                        <span className="text-zinc-700">·</span>
                        <span>{runCountFor(p.id)} run{runCountFor(p.id) === 1 ? '' : 's'}</span>
                        {p.lastRunAt && (
                          <>
                            <span className="text-zinc-700">·</span>
                            <span className="flex items-center gap-1"><Clock size={11} />{new Date(p.lastRunAt).toLocaleString()}</span>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <Button size="sm" variant="primary" onClick={() => onOpenProject(p.id)}>Open</Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="px-1 text-[11px] leading-relaxed text-zinc-600">
        Storage: <code className="text-zinc-500">userData/runs/&lt;project-slug&gt;/&lt;runId&gt;</code> — legacy flat runs are still read. Diff mode compares fingerprints (url + tokens + sections) vs the latest done run in the same project and scopes heavy phases (interaction probe + AI critique) to changed pages.
      </p>
    </div>
  )
}
