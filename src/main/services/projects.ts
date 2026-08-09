/** Project grouping: one folder per origin under userData/projects/<slug> and runs under runs/<slug>/<runId>. */
import { app } from 'electron'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { originOfUrl, slugForOrigin, projectNameForOrigin } from '../../shared/project.js'
import type { Project, Run } from '../../shared/types.js'

function projectsRoot(): string {
  return join(app.getPath('userData'), 'projects')
}
function projectsIndexPath(): string {
  return join(projectsRoot(), '_index.json')
}

async function loadIndex(): Promise<Record<string, Project>> {
  try {
    return JSON.parse(await readFile(projectsIndexPath(), 'utf8')) as Record<string, Project>
  } catch {
    return {}
  }
}
async function saveIndex(idx: Record<string, Project>): Promise<void> {
  await mkdir(projectsRoot(), { recursive: true })
  const dest = projectsIndexPath()
  const tmp = `${dest}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`
  await writeFile(tmp, JSON.stringify(idx, null, 2), 'utf8')
  try {
    const { rename, unlink } = await import('node:fs/promises')
    await rename(tmp, dest)
  } catch {
    await writeFile(dest, JSON.stringify(idx, null, 2), 'utf8')
    try { const { unlink } = await import('node:fs/promises'); await unlink(tmp) } catch {}
  }
}

export function projectSlugForUrl(targetUrl: string): string {
  const origin = originOfUrl(targetUrl) ?? targetUrl
  return slugForOrigin(origin)
}

export async function ensureProjectForUrl(targetUrl: string): Promise<Project> {
  const origin = originOfUrl(targetUrl)
  if (!origin) throw new Error(`Cannot derive project from url: ${targetUrl.slice(0, 120)}`)
  const slug = slugForOrigin(origin)
  const id = slug
  const idx = await loadIndex()
  const existing = idx[id]
  if (existing) {
    existing.updatedAt = Date.now()
    existing.targetUrl = targetUrl
    await saveIndex(idx)
    await mkdir(join(projectsRoot(), slug), { recursive: true })
    return existing
  }
  const proj: Project = {
    id,
    slug,
    name: projectNameForOrigin(origin),
    origin,
    targetUrl,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    runCount: 0
  }
  idx[id] = proj
  await saveIndex(idx)
  await mkdir(join(projectsRoot(), slug), { recursive: true })
  return proj
}

export async function getProject(id: string): Promise<Project | null> {
  const idx = await loadIndex()
  return idx[id] ?? null
}

export async function listProjects(): Promise<Project[]> {
  const idx = await loadIndex()
  // Reconcile runCount/lastRun from runs on disk if index stale
  // Keep it cheap: only if missing
  const list = Object.values(idx).sort((a, b) => b.updatedAt - a.updatedAt)
  // Also surface slugs that exist on disk but not in index (legacy/manual)
  try {
    const entries = await readdir(projectsRoot())
    for (const slug of entries) {
      if (slug.startsWith('.') || slug === '_index.json') continue
      if (idx[slug]) continue
      const dir = join(projectsRoot(), slug)
      try {
        const stat = existsSync(dir) ? true : false
        if (!stat) continue
        const proj: Project = {
          id: slug,
          slug,
          name: slug,
          origin: slug,
          targetUrl: `https://${slug}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          runCount: 0
        }
        list.push(proj)
      } catch {}
    }
  } catch {}
  return list
}

export async function bumpProjectRunCount(projectId: string, runId: string): Promise<void> {
  const idx = await loadIndex()
  const p = idx[projectId]
  if (!p) return
  p.runCount = (p.runCount ?? 0) + 1
  p.lastRunId = runId
  p.lastRunAt = Date.now()
  p.updatedAt = Date.now()
  await saveIndex(idx)
}

export async function updateProjectMeta(projectId: string, patch: Partial<Pick<Project, 'name'>>): Promise<Project | null> {
  const idx = await loadIndex()
  const p = idx[projectId]
  if (!p) return null
  if (patch.name !== undefined) p.name = patch.name.trim().slice(0, 80) || p.name
  p.updatedAt = Date.now()
  await saveIndex(idx)
  return p
}

export function resolveProjectDir(slug: string): string {
  const root = resolve(projectsRoot())
  const dir = resolve(root, slug)
  if (dir !== root && !dir.startsWith(root + '/')) throw new Error(`Invalid project slug: ${slug}`)
  return dir
}
