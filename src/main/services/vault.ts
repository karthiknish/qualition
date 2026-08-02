/**
 * Saved logins.
 *
 * Passwords are encrypted with Electron's `safeStorage`, which is backed by the
 * OS keychain (Keychain on macOS, libsecret on Linux, DPAPI on Windows) — the
 * ciphertext on disk is useless to anyone without this user's login session.
 * Plaintext exists only in memory, only while a run is signing in.
 *
 * Credentials are keyed by origin, so auditing `https://app.acme.com/anything`
 * finds the entry saved for `https://app.acme.com`.
 */
import { app, safeStorage } from 'electron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { SavedCredential } from '../../shared/types.js'

interface StoredCredential {
  origin: string
  username: string
  /** base64 safeStorage ciphertext, or plaintext when encryption is unavailable */
  secret: string
  encrypted: boolean
  loginUrl?: string
  usernameSelector?: string
  passwordSelector?: string
  submitSelector?: string
  updatedAt: number
}

function vaultPath(): string {
  return join(app.getPath('userData'), 'credentials.json')
}

export function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}

async function readAll(): Promise<StoredCredential[]> {
  try {
    const raw = await readFile(vaultPath(), 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeAll(items: StoredCredential[]): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(vaultPath(), JSON.stringify(items, null, 2), 'utf8')
}

export function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

/** Metadata only — never the password. Safe to hand to the renderer. */
export async function listCredentials(): Promise<SavedCredential[]> {
  const items = await readAll()
  return items
    .map((c) => ({
      origin: c.origin,
      username: c.username,
      loginUrl: c.loginUrl,
      encrypted: c.encrypted,
      updatedAt: c.updatedAt
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveCredential(input: {
  origin: string
  username: string
  password: string
  loginUrl?: string
  usernameSelector?: string
  passwordSelector?: string
  submitSelector?: string
}): Promise<SavedCredential> {
  const origin = originOf(input.origin)
  const canEncrypt = encryptionAvailable()
  const secret = canEncrypt
    ? safeStorage.encryptString(input.password).toString('base64')
    : Buffer.from(input.password, 'utf8').toString('base64')

  const entry: StoredCredential = {
    origin,
    username: input.username,
    secret,
    encrypted: canEncrypt,
    loginUrl: input.loginUrl,
    usernameSelector: input.usernameSelector,
    passwordSelector: input.passwordSelector,
    submitSelector: input.submitSelector,
    updatedAt: Date.now()
  }

  const items = (await readAll()).filter((c) => c.origin !== origin)
  items.push(entry)
  await writeAll(items)
  return { origin, username: entry.username, loginUrl: entry.loginUrl, encrypted: canEncrypt, updatedAt: entry.updatedAt }
}

export async function deleteCredential(origin: string): Promise<void> {
  const target = originOf(origin)
  await writeAll((await readAll()).filter((c) => c.origin !== target))
}

/** Full credential including the decrypted password. Main process only. */
/**
 * Environment fallback for headless and CI runs, where there is no Electron
 * keychain to read. Deliberately env-only: this app never writes credentials to
 * a plaintext file, because a file is one `git add -f` away from a public repo
 * and offers none of the protection the keychain does.
 *
 *   QUALITION_AUTH_USERNAME=… QUALITION_AUTH_PASSWORD=… npm run smoke -- <url>
 */
function credentialFromEnv(): { username: string; password: string; loginUrl?: string } | null {
  const username = process.env.QUALITION_AUTH_USERNAME
  const password = process.env.QUALITION_AUTH_PASSWORD
  if (!username || !password) return null
  return { username, password, loginUrl: process.env.QUALITION_AUTH_LOGIN_URL }
}

export async function resolveCredential(url: string): Promise<{
  username: string
  password: string
  loginUrl?: string
  usernameSelector?: string
  passwordSelector?: string
  submitSelector?: string
} | null> {
  const origin = originOf(url)
  const found = (await readAll()).find((c) => c.origin === origin)
  // The keychain wins; env is the fallback for environments without one.
  if (!found) return credentialFromEnv()
  let password = ''
  try {
    password = found.encrypted
      ? safeStorage.decryptString(Buffer.from(found.secret, 'base64'))
      : Buffer.from(found.secret, 'base64').toString('utf8')
  } catch {
    return null // keychain refused; treat as unavailable rather than sending junk
  }
  return {
    username: found.username,
    password,
    loginUrl: found.loginUrl,
    usernameSelector: found.usernameSelector,
    passwordSelector: found.passwordSelector,
    submitSelector: found.submitSelector
  }
}
