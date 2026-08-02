/**
 * MCP client facade.
 *
 * Primary path: the official @modelcontextprotocol/sdk over streamable HTTP —
 * it negotiates protocol versions, manages sessions, handles SSE reconnection
 * and resumption, and validates responses.
 *
 * Fallback path: the minimal in-house client (mcpHttpClient.ts), used when the
 * SDK transport cannot connect (older server, proxy quirks). Auth in both cases
 * comes from the machine's existing MCP credentials.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { McpHttpClient, type McpToolResult } from './mcpHttpClient.js'
import { getBearerFor } from './credentials.js'

export type { McpToolResult }

export interface McpTool {
  name: string
  description?: string
  inputSchema?: unknown
}

const CONNECT_TIMEOUT_MS = 12_000
const CALL_TIMEOUT_MS = 90_000

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        timer.unref?.()
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export class McpClient {
  private sdk: Client | null = null
  private legacy: McpHttpClient | null = null
  private mode: 'sdk' | 'legacy' | 'none' = 'none'
  private connecting: Promise<void> | null = null

  constructor(
    readonly url: string,
    private staticHeaders: Record<string, string> = {}
  ) {}

  /** Which transport actually carried the last successful call. */
  get transport(): string {
    return this.mode
  }

  private async headers(): Promise<Record<string, string>> {
    const h = { ...this.staticHeaders }
    if (!h.Authorization && !h.authorization) {
      const bearer = await getBearerFor(this.url)
      if (bearer) h.Authorization = `Bearer ${bearer}`
    }
    return h
  }

  private async connect(): Promise<void> {
    if (this.mode !== 'none') return
    if (this.connecting) return this.connecting
    this.connecting = (async () => {
      const headers = await this.headers()
      let pending: Client | null = null
      try {
        const client = new Client({ name: 'qualition', version: '0.1.0' }, { capabilities: {} })
        pending = client
        const transport = new StreamableHTTPClientTransport(new URL(this.url), {
          requestInit: { headers }
        })
        // A transport that never settles must not hang the run: bound it and
        // fall through to the fallback client instead.
        await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, 'sdk connect')
        pending = null
        this.sdk = client
        this.mode = 'sdk'
        return
      } catch (sdkError) {
        // Release the half-open SDK client so its stream cannot keep the
        // process (or the Electron main loop) alive.
        try {
          await pending?.close()
        } catch {
          /* nothing to close */
        }
        // Fall back rather than fail the whole run.
        try {
          const legacy = new McpHttpClient(this.url, headers)
          await withTimeout(legacy.listTools(), CONNECT_TIMEOUT_MS, 'fallback connect')
          this.legacy = legacy
          this.mode = 'legacy'
          return
        } catch (legacyError) {
          this.mode = 'none'
          throw new Error(
            `MCP connect failed. sdk: ${(sdkError as Error).message.slice(0, 160)} | fallback: ${(legacyError as Error).message.slice(0, 160)}`
          )
        }
      } finally {
        this.connecting = null
      }
    })()
    return this.connecting
  }

  async listTools(): Promise<McpTool[]> {
    await this.connect()
    if (this.mode === 'sdk') {
      const res = await withTimeout(this.sdk!.listTools(), CONNECT_TIMEOUT_MS, 'listTools')
      return (res.tools ?? []) as McpTool[]
    }
    return withTimeout(this.legacy!.listTools(), CONNECT_TIMEOUT_MS, 'listTools')
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    await this.connect()
    if (this.mode === 'sdk') {
      const res = (await withTimeout(
        this.sdk!.callTool({ name, arguments: args }),
        CALL_TIMEOUT_MS,
        `callTool ${name}`
      )) as any
      return { content: res.content ?? [], structuredContent: res.structuredContent, isError: res.isError }
    }
    return withTimeout(this.legacy!.callTool(name, args), CALL_TIMEOUT_MS, `callTool ${name}`)
  }

  async close(): Promise<void> {
    try {
      await this.sdk?.close()
    } catch {
      /* already closed */
    }
    this.sdk = null
    this.legacy = null
    this.mode = 'none'
  }
}
