/**
 * Minimal Electron stub so main-process modules (which reach for app.getPath)
 * can be unit-tested headlessly. Aliased in via esbuild in the test script.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'qualition-test-'))

export const app = {
  getPath: (name: string): string => join(root, name),
  getAppPath: (): string => root
}

/** Reversible stand-in for the OS keychain so vault logic is testable. */
export const safeStorage = {
  isEncryptionAvailable: (): boolean => true,
  encryptString: (plain: string): Buffer => Buffer.from(`enc:${plain}`, 'utf8'),
  decryptString: (buf: Buffer): string => {
    const s = buf.toString('utf8')
    if (!s.startsWith('enc:')) throw new Error('not encrypted by this keychain')
    return s.slice(4)
  }
}

export const ipcMain = { handle: (): void => {} }
export const shell = { openExternal: async (): Promise<void> => {}, openPath: async (): Promise<string> => '' }
export const dialog = { showSaveDialog: async (): Promise<{ canceled: boolean }> => ({ canceled: true }) }
export const BrowserWindow = class {}
export const protocol = { registerSchemesAsPrivileged: (): void => {}, handle: (): void => {} }
export const net = { fetch: async (): Promise<Response> => new Response('') }

export default { app, ipcMain, shell, dialog, BrowserWindow, protocol, net, safeStorage }
