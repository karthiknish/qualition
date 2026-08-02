import { contextBridge, ipcRenderer } from 'electron'
import type {
  IntegrationStatus,
  ProviderId,
  ProviderStatus,
  SavedCredential,
  Run,
  RunConfig,
  RunProgress,
  Settings,
  UpdateStatus,
  Viewport
} from '../shared/types.js'

const api = {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:set', patch),
  listModels: (provider: ProviderId): Promise<string[]> => ipcRenderer.invoke('models:list', provider),
  testModel: (provider: ProviderId): Promise<ProviderStatus> => ipcRenderer.invoke('models:test', provider),
  defaultViewports: (): Promise<Viewport[]> => ipcRenderer.invoke('viewports:default'),
  status: (): Promise<IntegrationStatus> => ipcRenderer.invoke('status:all'),
  mcpServers: (): Promise<unknown[]> => ipcRenderer.invoke('mcp:servers'),

  listRuns: (): Promise<Run[]> => ipcRenderer.invoke('runs:list'),
  getRun: (id: string): Promise<Run | null> => ipcRenderer.invoke('runs:get', id),
  startRun: (config: RunConfig): Promise<Run> => ipcRenderer.invoke('runs:start', config),
  cancelRun: (id: string): Promise<void> => ipcRenderer.invoke('runs:cancel', id),
  deleteRun: (id: string): Promise<void> => ipcRenderer.invoke('runs:delete', id),
  revealRun: (id: string): Promise<string> => ipcRenderer.invoke('runs:reveal', id),
  exportRun: (id: string): Promise<string | null> => ipcRenderer.invoke('runs:export', id),
  buildPrompt: (
    id: string,
    options?: { scope?: 'all' | 'critical' | 'accessibility' | 'coherence' | 'section'; sectionId?: string; pageUrl?: string }
  ): Promise<string | null> => ipcRenderer.invoke('runs:prompt', { id, options }),

  searchRegistry: (q: string): Promise<any[]> => ipcRenderer.invoke('registry:search', q),
  componentDetail: (input: {
    name: string
    registry: string
    homepage?: string
    addCommandArgument?: string
  }): Promise<any> => ipcRenderer.invoke('components:detail', input),
  searchMobbin: (query: string, kind: 'screen' | 'section', runId?: string): Promise<any[]> =>
    ipcRenderer.invoke('mobbin:search', { query, kind, runId }),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open', url),

  /** Saved logins. The password is write-only from the renderer's side. */
  listCredentials: (): Promise<SavedCredential[]> => ipcRenderer.invoke('creds:list'),
  encryptionAvailable: (): Promise<boolean> => ipcRenderer.invoke('creds:encryption'),
  originOf: (url: string): Promise<string> => ipcRenderer.invoke('creds:origin', url),
  saveCredential: (input: {
    origin: string
    username: string
    password: string
    loginUrl?: string
    usernameSelector?: string
    passwordSelector?: string
    submitSelector?: string
  }): Promise<SavedCredential> => ipcRenderer.invoke('creds:save', input),
  deleteCredential: (origin: string): Promise<void> => ipcRenderer.invoke('creds:delete', origin),

  onProgress: (cb: (p: RunProgress) => void): (() => void) => {
    const h = (_e: unknown, p: RunProgress): void => cb(p)
    ipcRenderer.on('run:progress', h)
    return () => ipcRenderer.off('run:progress', h)
  },
  onRunUpdate: (cb: (r: Run) => void): (() => void) => {
    const h = (_e: unknown, r: Run): void => cb(r)
    ipcRenderer.on('run:update', h)
    return () => ipcRenderer.off('run:update', h)
  },
  /* ------------------------------ updates ------------------------------- */
  appVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  updateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:status'),
  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:check'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install'),
  dismissUpdate: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:dismiss'),
  onUpdateStatus: (cb: (s: UpdateStatus) => void): (() => void) => {
    const h = (_e: unknown, s: UpdateStatus): void => cb(s)
    ipcRenderer.on('update:status', h)
    return () => ipcRenderer.off('update:status', h)
  },

  /** file path -> custom protocol URL the renderer can render */
  asset: (p?: string): string | undefined => (p ? `qasset://local${encodeURI(p)}` : undefined)
}

contextBridge.exposeInMainWorld('qualition', api)
export type QualitionApi = typeof api
