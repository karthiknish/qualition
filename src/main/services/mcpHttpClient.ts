/**
 * Tiny MCP client for streamable-HTTP servers.
 *
 * Enough of the spec for our purposes: initialize -> notifications/initialized
 * -> tools/list + tools/call. Responses may come back as `application/json`
 * or as an SSE stream (`event: message\ndata: {...}`); both are handled.
 */
import { getBearerFor } from './credentials.js'

export interface McpContent {
  type: string
  text?: string
  data?: string
  mimeType?: string
  resource?: { uri?: string; text?: string; mimeType?: string }
  [k: string]: unknown
}

export interface McpToolResult {
  content: McpContent[]
  structuredContent?: unknown
  isError?: boolean
}

function parseBody(text: string, contentType: string): any {
  if (contentType.includes('text/event-stream')) {
    const payloads: any[] = []
    for (const chunk of text.split('\n\n')) {
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data:')) {
          const raw = line.slice(5).trim()
          if (!raw || raw === '[DONE]') continue
          try {
            payloads.push(JSON.parse(raw))
          } catch {
            /* ignore keepalive */
          }
        }
      }
    }
    return payloads.find((p) => p.result || p.error) ?? payloads[payloads.length - 1]
  }
  return text ? JSON.parse(text) : null
}

export class McpHttpClient {
  private sessionId: string | null = null
  private nextId = 1
  private initialized = false

  constructor(
    readonly url: string,
    private staticHeaders: Record<string, string> = {}
  ) {}

  private async headers(): Promise<Record<string, string>> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-06-18',
      ...this.staticHeaders
    }
    if (!h.Authorization && !h.authorization) {
      const bearer = await getBearerFor(this.url)
      if (bearer) h.Authorization = `Bearer ${bearer}`
    }
    if (this.sessionId) h['Mcp-Session-Id'] = this.sessionId
    return h
  }

  private async send(method: string, params?: unknown, isNotification = false): Promise<any> {
    const body: Record<string, unknown> = { jsonrpc: '2.0', method }
    if (params !== undefined) body.params = params
    if (!isNotification) body.id = this.nextId++

    const res = await fetch(this.url, {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify(body)
    })
    const sid = res.headers.get('Mcp-Session-Id') ?? res.headers.get('mcp-session-id')
    if (sid) this.sessionId = sid
    if (res.status === 202) return null
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`MCP ${method} failed (${res.status}): ${text.slice(0, 300)}`)
    }
    const parsed = parseBody(text, res.headers.get('content-type') ?? '')
    if (parsed?.error) throw new Error(`MCP ${method} error: ${JSON.stringify(parsed.error).slice(0, 300)}`)
    return parsed?.result ?? null
  }

  async init(): Promise<void> {
    if (this.initialized) return
    await this.send('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'qualition', version: '0.1.0' }
    })
    try {
      await this.send('notifications/initialized', {}, true)
    } catch {
      /* some servers 404 the notification; harmless */
    }
    this.initialized = true
  }

  async listTools(): Promise<{ name: string; description?: string; inputSchema?: unknown }[]> {
    await this.init()
    const r = await this.send('tools/list', {})
    return r?.tools ?? []
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    await this.init()
    const r = await this.send('tools/call', { name, arguments: args })
    return { content: r?.content ?? [], structuredContent: r?.structuredContent, isError: r?.isError }
  }
}
