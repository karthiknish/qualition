/**
 * Credential + MCP config discovery.
 *
 * Qualition does NOT run its own OAuth dance. It reuses the MCP setup that is
 * already on this machine:
 *   - server definitions from ~/.pi/agent/mcp.json and ~/.cursor/mcp.json
 *     (and Claude desktop config, if present)
 *   - OAuth tokens from the macOS Keychain service `pi-mcp-adapter.oauth`,
 *     which pi writes as chunked JSON blobs:
 *       <sha256-hash>.chunk.<chunkId>.<index>
 *     Each reassembled blob is:
 *       { serverUrl, clientInfo:{clientId,...}, codeVerifier, tokens:{accessToken,refreshToken,expiresAt,issuer} }
 *   - expired access tokens are refreshed against the blob's issuer
 *     (`<issuer>/oauth/token`, refresh_token grant) and cached in memory.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const exec = promisify(execFile)

const KEYCHAIN_SERVICE = 'pi-mcp-adapter.oauth'

export interface McpServerConfig {
  name: string
  type: 'http' | 'sse' | 'stdio'
  url?: string
  headers?: Record<string, string>
  command?: string
  args?: string[]
  env?: Record<string, string>
  origin: string
}

export interface OAuthBlob {
  serverUrl: string
  clientInfo?: { clientId?: string; redirectUris?: string[]; issuer?: string }
  tokens?: {
    accessToken: string
    refreshToken?: string
    expiresAt?: number
    issuer?: string
  }
}

const CONFIG_PATHS = [
  { path: join(homedir(), '.pi/agent/mcp.json'), origin: 'pi' },
  { path: join(homedir(), '.cursor/mcp.json'), origin: 'cursor' },
  {
    path: join(homedir(), 'Library/Application Support/Claude/claude_desktop_config.json'),
    origin: 'claude-desktop'
  },
  { path: join(homedir(), '.codeium/windsurf/mcp_config.json'), origin: 'windsurf' }
]

/**
 * Servers Qualition actually talks to. Everything else on the machine is none
 * of this app's business — we neither connect to it nor surface it in the UI.
 */
const USED_SERVERS: { match: (name: string, url?: string) => boolean; role: string }[] = [
  { match: (n, u) => n === 'mobbin' || !!u?.includes('api.mobbin.com'), role: 'Reference UI' },
  { match: (n, u) => n === 'shadcn' || !!u?.includes('ui.shadcn.com'), role: 'Component registry' }
]

export function serverRole(name: string, url?: string): string | null {
  return USED_SERVERS.find((s) => s.match(name.toLowerCase(), url))?.role ?? null
}

/**
 * Only the servers this app uses, with their role attached — this is what the
 * UI shows and what status checks probe.
 */
export async function discoverUsedServers(): Promise<(McpServerConfig & { role: string })[]> {
  const all = await discoverMcpServers()
  return all
    .map((s) => ({ ...s, role: serverRole(s.name, s.url) }))
    .filter((s): s is McpServerConfig & { role: string } => s.role !== null)
}

/** Merge every MCP server definition we can find on this machine. */
export async function discoverMcpServers(): Promise<McpServerConfig[]> {
  const out = new Map<string, McpServerConfig>()
  for (const { path, origin } of CONFIG_PATHS) {
    let raw: string
    try {
      raw = await readFile(path, 'utf8')
    } catch {
      continue
    }
    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch {
      continue
    }
    const servers = parsed.mcpServers ?? parsed.servers ?? {}
    for (const [name, def] of Object.entries<any>(servers)) {
      const url = def.url ?? def.serverUrl
      const key = name.toLowerCase()
      const entry: McpServerConfig = {
        name,
        type: def.type ?? (url ? 'http' : 'stdio'),
        url,
        headers: def.headers,
        command: def.command,
        args: def.args,
        env: def.env,
        origin
      }
      // Prefer the first definition found (pi > cursor > claude > windsurf),
      // but upgrade an entry that gained headers/url later.
      const existing = out.get(key)
      if (!existing) out.set(key, entry)
      else if (!existing.url && entry.url) out.set(key, entry)
    }
  }
  return [...out.values()]
}

export async function findServerByUrlHost(host: string): Promise<McpServerConfig | undefined> {
  const servers = await discoverMcpServers()
  return servers.find((s) => s.url?.includes(host))
}

/* ------------------------------- keychain -------------------------------- */

async function keychainAccounts(): Promise<string[]> {
  // `security dump-keychain` lists attributes; we pair acct <-> svce lines.
  const { stdout } = await exec('security', ['dump-keychain'], { maxBuffer: 64 * 1024 * 1024 })
  const accounts: string[] = []
  let lastAcct: string | null = null
  for (const line of stdout.split('\n')) {
    const m = /"acct"<blob>="([^"]+)"/.exec(line)
    if (m) lastAcct = m[1]
    if (line.includes(`"svce"<blob>="${KEYCHAIN_SERVICE}"`) && lastAcct) accounts.push(lastAcct)
  }
  return accounts
}

async function keychainRead(account: string): Promise<string> {
  const { stdout } = await exec('security', [
    'find-generic-password',
    '-s',
    KEYCHAIN_SERVICE,
    '-a',
    account,
    '-w'
  ])
  return stdout.trim()
}

/** Reassemble every chunked OAuth blob pi has stored. */
export async function readOAuthBlobs(): Promise<OAuthBlob[]> {
  if (process.platform !== 'darwin') return []
  let accounts: string[] = []
  try {
    accounts = await keychainAccounts()
  } catch {
    return []
  }
  const groups = new Map<string, number[]>()
  for (const acct of accounts) {
    const m = /^(.+)\.chunk\.([0-9a-f]+)\.(\d+)$/.exec(acct)
    if (!m) continue
    const key = `${m[1]}.chunk.${m[2]}`
    const arr = groups.get(key) ?? []
    arr.push(Number(m[3]))
    groups.set(key, arr)
  }
  const blobs: OAuthBlob[] = []
  for (const [prefix, indices] of groups) {
    try {
      const parts: string[] = []
      for (const i of indices.sort((a, b) => a - b)) parts.push(await keychainRead(`${prefix}.${i}`))
      blobs.push(JSON.parse(parts.join('')))
    } catch {
      /* skip unreadable/foreign blob */
    }
  }
  return blobs
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>()

/**
 * Return a currently-valid bearer token for an MCP server URL, refreshing
 * against the issuer when the cached/keychain token has expired.
 */
export async function getBearerFor(serverUrl: string): Promise<string | null> {
  const cached = tokenCache.get(serverUrl)
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token

  const blobs = await readOAuthBlobs()
  const blob = blobs.find((b) => b.serverUrl === serverUrl || b.serverUrl?.startsWith(serverUrl))
  if (!blob?.tokens?.accessToken) return null

  const expiresAtMs = (blob.tokens.expiresAt ?? 0) * (blob.tokens.expiresAt! > 1e12 ? 1 : 1000)
  if (expiresAtMs - 60_000 > Date.now()) {
    tokenCache.set(serverUrl, { token: blob.tokens.accessToken, expiresAt: expiresAtMs })
    return blob.tokens.accessToken
  }

  const issuer = blob.tokens.issuer ?? blob.clientInfo?.issuer
  const refreshToken = blob.tokens.refreshToken
  const clientId = blob.clientInfo?.clientId
  if (!issuer || !refreshToken) return blob.tokens.accessToken // stale, but let the server decide

  const res = await fetch(`${issuer.replace(/\/$/, '')}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId })
  })
  if (!res.ok) return blob.tokens.accessToken
  const json = (await res.json()) as { access_token: string; expires_in?: number }
  const expiresAt = Date.now() + (json.expires_in ?? 3600) * 1000
  tokenCache.set(serverUrl, { token: json.access_token, expiresAt })
  return json.access_token
}
