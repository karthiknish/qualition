/** Run persistence: one directory per run under userData/runs/<id>. */
import { app } from 'electron'
import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { redactAuth } from './auth.js'
import type { Run, Settings } from '../../shared/types.js'

/**
 * The only copy of a run that leaves main memory — disk or renderer — must not
 * carry credentials. The live in-memory run keeps them so the login can work.
 */
export function redactRun(run: Run): Run {
  return { ...run, config: redactAuth(run.config) }
}

export function runsRoot(): string {
  return join(app.getPath('userData'), 'runs')
}

export function runDir(id: string): string {
  return join(runsRoot(), id)
}

export async function ensureRunDir(id: string): Promise<string> {
  const dir = runDir(id)
  await mkdir(join(dir, 'assets'), { recursive: true })
  return dir
}

export function assetsDir(id: string): string {
  return join(runDir(id), 'assets')
}

export async function saveRun(run: Run): Promise<void> {
  await ensureRunDir(run.id)
  await writeFile(join(runDir(run.id), 'run.json'), JSON.stringify(redactRun(run), null, 2), 'utf8')
}

export async function loadRun(id: string): Promise<Run | null> {
  try {
    return JSON.parse(await readFile(join(runDir(id), 'run.json'), 'utf8')) as Run
  } catch {
    return null
  }
}

export async function listRuns(): Promise<Run[]> {
  try {
    const ids = await readdir(runsRoot())
    const runs: Run[] = []
    for (const id of ids) {
      const r = await loadRun(id)
      if (r) runs.push({ ...r, pages: r.pages?.map((p) => ({ ...p })) ?? [] })
    }
    return runs.sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

export async function deleteRun(id: string): Promise<void> {
  await rm(runDir(id), { recursive: true, force: true })
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
      openaiApiKey: raw.openaiApiKey || DEFAULT_SETTINGS.openaiApiKey
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function saveSettings(s: Partial<Settings>): Promise<Settings> {
  const merged = { ...(await loadSettings()), ...s }
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(settingsPath(), JSON.stringify(merged, null, 2), 'utf8')
  return merged
}
