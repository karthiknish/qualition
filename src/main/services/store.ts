/** Run persistence: projects/<slug>/runs/<runId> plus legacy flat runs/<runId> for migration. */
import { app } from 'electron'
import { mkdir, readdir, readFile, writeFile, rm, chmod, rename, unlink, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { redactAuth } from './auth.js'
import type { Run, Settings } from '../../shared/types.js'
import { slugForOrigin } from '../../shared/project.js'

const RUN_ID_RE = /^[a-z0-9-]{4,64}$/i

function assertValidRunId(id: string): void {
  if (!RUN_ID_RE.test(id) || id.includes('..') || id.includes('/') || id.includes('\\')) {
    throw new Error(`Invalid run id: ${id}`)
  }
}

async function atomicWriteFile(dest: string, data: string): Promise<void> {
  const tmp = `${dest}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`
  await writeFile(tmp, data, 'utf8')
  try {
    await rename(tmp, dest)
  } catch {
    await writeFile(dest, data, 'utf8')
    try {
      await unlink(tmp)
    } catch {}
  }
}

export function redactRun(run: Run): Run {
  return { ...run, config: redactAuth(run.config) }
}

export function runsRoot(): string {
  return join(app.getPath('userData'), 'runs')
}

function projectSlugForRun(run: Pick<Run, 'projectId' | 'config'>): string | null {
  if (run.projectId) return run.projectId
  try {
    return slugForOrigin(new URL(run.config.targetUrl).origin)
  } catch {
    return null
  }
}

export function runDir(id: string, projectId?: string): string {
  assertValidRunId(id)
  if (projectId) {
    const slug = projectId
    if (/^[a-z0-9-]+$/.test(slug) === false) throw new Error(`Invalid project id: ${slug}`)
    const base = join(runsRoot(), slug)
    const resolved = resolve(base, id)
    if (!resolved.startsWith(resolve(base) + '/') && resolved !== resolve(base, id)) throw new Error(`Invalid run id path: ${id}`)
    return join(base, id)
  }
  const resolved = resolve(runsRoot(), id)
  if (!resolved.startsWith(resolve(runsRoot()) + '/') && resolved !== resolve(runsRoot(), id)) throw new Error(`Invalid run id path: ${id}`)
  return join(runsRoot(), id)
}

export async function ensureRunDir(id: string, projectId?: string): Promise<string> {
  assertValidRunId(id)
  const dir = runDir(id, projectId)
  await mkdir(join(dir, 'assets'), { recursive: true })
  return dir
}

export function assetsDir(id: string, projectId?: string): string {
  return join(runDir(id, projectId), 'assets')
}

const saveRunLocks = new Map<string, Promise<void>>()

export async function saveRun(run: Run): Promise<void> {
  const slug = projectSlugForRun(run)
  const dirProject = slug ?? run.projectId
  await ensureRunDir(run.id, dirProject ?? undefined)
  const dest = join(runDir(run.id, dirProject ?? undefined), 'run.json')
  const payload = JSON.stringify(redactRun(run), null, 2)
  const key = run.id
  const pending = saveRunLocks.get(key) ?? Promise.resolve()
  const next = pending.then(() => atomicWriteFile(dest, payload)).catch(() => atomicWriteFile(dest, payload))
  saveRunLocks.set(key, next.catch(() => {}))
  await next
  // Also ensure legacy flat path is cleaned if we migrated? keep both readable.
}

async function tryLoadRunAt(dir: string): Promise<Run | null> {
  try {
    return JSON.parse(await readFile(join(dir, 'run.json'), 'utf8')) as Run
  } catch {
    return null
  }
}

export async function loadRun(id: string): Promise<Run | null> {
  try {
    assertValidRunId(id)
    // Prefer project-scoped locations: scan one level
    try {
      const entries = await readdir(runsRoot())
      for (const entry of entries) {
        const maybe = join(runsRoot(), entry, id)
        if (existsSync(join(maybe, 'run.json'))) {
          const r = await tryLoadRunAt(maybe)
          if (r) return r
        }
      }
    } catch {}
    return JSON.parse(await readFile(join(runDir(id), 'run.json'), 'utf8')) as Run
  } catch {
    return null
  }
}

export async function listRuns(projectId?: string): Promise<Run[]> {
  const runs: Run[] = []
  try {
    if (projectId) {
      const base = join(runsRoot(), projectId)
      const ids = await readdir(base).catch(() => [] as string[])
      for (const id of ids) {
        if (id.startsWith('.') || !RUN_ID_RE.test(id)) continue
        const r = await tryLoadRunAt(join(base, id))
        if (r) runs.push({ ...r, pages: structuredClone(r.pages ?? []) })
      }
      return runs.sort((a, b) => b.createdAt - a.createdAt)
    }
    const entries = await readdir(runsRoot())
    for (const entry of entries) {
      if (entry.startsWith('.')) continue
      // entry may be a project slug dir or a legacy run id
      if (RUN_ID_RE.test(entry)) {
        // legacy flat run?
        const direct = join(runsRoot(), entry, 'run.json')
        if (existsSync(direct)) {
          const r = await tryLoadRunAt(join(runsRoot(), entry))
          if (r) runs.push({ ...r, pages: structuredClone(r.pages ?? []) })
          continue
        }
      }
      // treat as project dir
      const projDir = join(runsRoot(), entry)
      let st: Awaited<ReturnType<typeof stat>> | null = null
      try { st = await stat(projDir) } catch {}
      if (!st?.isDirectory()) continue
      let ids: string[] = []
      try { ids = await readdir(projDir) } catch { continue }
      for (const id of ids) {
        if (id.startsWith('.') || !RUN_ID_RE.test(id)) continue
        const r = await tryLoadRunAt(join(projDir, id))
        if (r) runs.push({ ...r, pages: structuredClone(r.pages ?? []) })
      }
    }
    return runs.sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

export async function deleteRun(id: string): Promise<void> {
  assertValidRunId(id)
  // Find and delete wherever it lives
  try {
    const entries = await readdir(runsRoot())
    for (const entry of entries) {
      const maybe = join(runsRoot(), entry, id)
      if (existsSync(join(maybe, 'run.json'))) {
        await rm(maybe, { recursive: true, force: true })
        return
      }
    }
  } catch {}
  await rm(runDir(id), { recursive: true, force: true })
}

export async function listRunsForProject(projectId: string): Promise<Run[]> {
  return listRuns(projectId)
}

/* -------------------------------- settings -------------------------------- */

const DEFAULT_SETTINGS: Settings = {
  provider: 'gemini',
  geminiApiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '',
  geminiModel: 'gemini-3.6-flash',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? '',
  openaiModel: 'gpt-5.2',
  cursorBinary: '',
  cursorApiKey: process.env.CURSOR_API_KEY ?? '',
  cursorModel: 'auto',
  openrouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
  openrouterModel: 'google/gemini-2.5-flash',
  defaultBrutality: 'ruthless',
  maxPages: 5,
  interactionProbe: true,
  maxControlsProbed: 30,
  lastAuthUsername: '',
  extraRegistries: []
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = JSON.parse(await readFile(settingsPath(), 'utf8'))
    return {
      ...DEFAULT_SETTINGS,
      ...raw,
      geminiApiKey: raw.geminiApiKey || DEFAULT_SETTINGS.geminiApiKey,
      openaiApiKey: raw.openaiApiKey || DEFAULT_SETTINGS.openaiApiKey,
      openrouterApiKey: raw.openrouterApiKey || DEFAULT_SETTINGS.openrouterApiKey
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function saveSettings(s: Partial<Settings>): Promise<Settings> {
  const merged = { ...(await loadSettings()), ...s }
  await mkdir(app.getPath('userData'), { recursive: true })
  await atomicWriteFile(settingsPath(), JSON.stringify(merged, null, 2))
  try {
    await chmod(settingsPath(), 0o600)
  } catch {}
  return merged
}
