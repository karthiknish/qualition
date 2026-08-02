/**
 * Model providers.
 *
 * Three backends, one interface:
 *   - gemini  : @google/genai, vision, JSON schema output, models listed live
 *               from the API (so "latest" is whatever your key can actually see)
 *   - openai  : /v1/responses with image_url parts + json_schema output,
 *               models listed live from /v1/models
 *   - cursor  : the local `cursor-agent` CLI in headless JSON mode — uses your
 *               existing Cursor subscription/auth, no extra key. Text only:
 *               the CLI has no image channel, so vision calls fall back to the
 *               structured evidence summary instead of screenshots.
 */
import { GoogleGenAI } from '@google/genai'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ProviderId, ProviderStatus } from '../../shared/types.js'

export interface ImageInput {
  path: string
  caption?: string
}

export interface GenerateRequest {
  system: string
  prompt: string
  images?: ImageInput[]
  /** JSON Schema; when present the provider must return parseable JSON. */
  schema?: Record<string, unknown>
  temperature?: number
  maxOutputTokens?: number
}

export interface Provider {
  id: ProviderId
  supportsVision: boolean
  listModels(): Promise<string[]>
  generate(model: string, req: GenerateRequest): Promise<string>
  status(model: string): Promise<ProviderStatus>
}

export interface ProviderCredentials {
  geminiApiKey?: string
  openaiApiKey?: string
  openaiBaseUrl?: string
  cursorBinary?: string
  cursorApiKey?: string
}

/* ------------------------------ shared utils ------------------------------ */

async function imageToBase64(path: string): Promise<{ data: string; mime: string } | null> {
  try {
    const buf = await readFile(path)
    if (buf.byteLength > 6_000_000) return null
    const mime = path.endsWith('.webp')
      ? 'image/webp'
      : path.endsWith('.jpg') || path.endsWith('.jpeg')
        ? 'image/jpeg'
        : 'image/png'
    return { data: buf.toString('base64'), mime }
  } catch {
    return null
  }
}

export function extractJson(text: string): any {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '')
  try {
    return JSON.parse(trimmed)
  } catch {
    const m = /\{[\s\S]*\}/.exec(trimmed)
    if (m) {
      try {
        return JSON.parse(m[0])
      } catch {
        /* fall through */
      }
    }
    return null
  }
}

/** Retry transient rate limits / outages with backoff + jitter. */
export async function withBackoff<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      const msg = (e as Error).message ?? ''
      const retryable = /429|RESOURCE_EXHAUSTED|rate.?limit|503|UNAVAILABLE|500|INTERNAL|overloaded|fetch failed|ECONN|ETIMEDOUT|timeout/i.test(msg)
      if (!retryable || i === attempts - 1) break
      const hinted = /retry(?:Delay|-after)"?[:\s]+"?(\d+)/i.exec(msg)?.[1]
      const waitMs = hinted ? Number(hinted) * 1000 : 1500 * 2 ** i + Math.random() * 700
      await new Promise((r) => setTimeout(r, Math.min(waitMs, 45_000)))
    }
  }
  throw new Error(`${label}: ${(lastError as Error)?.message ?? 'unknown error'}`)
}

/* --------------------------------- gemini --------------------------------- */

/** Fallback list if the API cannot be reached; the live list wins when it can. */
export const GEMINI_FALLBACK_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.1-pro-preview',
  'gemini-3-pro-preview',
  'gemini-flash-latest',
  'gemini-pro-latest',
  'gemini-2.5-flash',
  'gemini-2.5-pro'
]

/** Newest-first ordering that survives new releases (3.6 > 3.5 > 3.1 > 3 > 2.5). */
export function rankGeminiModels(names: string[]): string[] {
  const version = (n: string): number => {
    const m = /gemini-(\d+)(?:\.(\d+))?/.exec(n)
    return m ? Number(m[1]) * 100 + Number(m[2] ?? 0) : 0
  }
  const tierScore = (n: string): number => (/pro/.test(n) ? 3 : /flash-lite/.test(n) ? 1 : /flash/.test(n) ? 2 : 0)
  return names
    .filter((n) => !/(image|tts|embedding|computer-use|customtools|learnlm|aqa|gemma)/i.test(n))
    .sort((a, b) => {
      const stable = (n: string): number => (/preview|exp/.test(n) ? 0 : 1)
      return (
        version(b) - version(a) ||
        stable(b) - stable(a) ||
        tierScore(b) - tierScore(a) ||
        a.length - b.length
      )
    })
}

class GeminiProvider implements Provider {
  id: ProviderId = 'gemini'
  supportsVision = true
  private client: GoogleGenAI | null = null
  private key = ''

  constructor(private creds: ProviderCredentials) {}

  private sdk(): GoogleGenAI {
    const key = this.creds.geminiApiKey ?? ''
    if (!key) throw new Error('No Gemini API key set (Settings → Models, or GEMINI_API_KEY).')
    if (!this.client || this.key !== key) {
      this.client = new GoogleGenAI({ apiKey: key })
      this.key = key
    }
    return this.client
  }

  async listModels(): Promise<string[]> {
    const key = this.creds.geminiApiKey
    if (!key) return GEMINI_FALLBACK_MODELS
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=200`)
      if (!res.ok) return GEMINI_FALLBACK_MODELS
      const json = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
      const names = (json.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => m.name.replace(/^models\//, ''))
      return names.length ? rankGeminiModels(names) : GEMINI_FALLBACK_MODELS
    } catch {
      return GEMINI_FALLBACK_MODELS
    }
  }

  async generate(model: string, req: GenerateRequest): Promise<string> {
    const parts: any[] = [{ text: req.prompt }]
    for (const img of req.images ?? []) {
      const enc = await imageToBase64(img.path)
      if (!enc) continue
      if (img.caption) parts.push({ text: img.caption })
      parts.push({ inlineData: { mimeType: enc.mime, data: enc.data } })
    }
    const res = await withBackoff('gemini', () =>
      this.sdk().models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: req.system,
          temperature: req.temperature ?? 0.4,
          ...(req.schema ? { responseMimeType: 'application/json', responseSchema: req.schema as any } : {})
        }
      })
    )
    return res.text ?? ''
  }

  async status(model: string): Promise<ProviderStatus> {
    if (!this.creds.geminiApiKey) return { id: 'gemini', ok: false, detail: 'No API key set.', model }
    try {
      const out = await this.generate(model, { system: 'Reply with one word.', prompt: 'Say: ready' })
      return { id: 'gemini', ok: true, detail: `${model}: ${out.trim().slice(0, 30)}`, model }
    } catch (e) {
      return { id: 'gemini', ok: false, detail: (e as Error).message.slice(0, 200), model }
    }
  }
}

/* --------------------------------- openai --------------------------------- */

export const OPENAI_FALLBACK_MODELS = ['gpt-5.2', 'gpt-5.1', 'gpt-5', 'gpt-5-mini', 'gpt-4.1', 'o4-mini']

export function rankOpenAiModels(names: string[]): string[] {
  return names
    .filter((n) => /^(gpt-|o\d|chatgpt-)/.test(n))
    .filter((n) => !/(audio|realtime|tts|whisper|embedding|moderation|image|transcribe|search|dall)/i.test(n))
    .sort((a, b) => {
      const v = (n: string): number => {
        const m = /(\d+)(?:\.(\d+))?/.exec(n.replace(/^o/, '99.'))
        return m ? Number(m[1]) * 100 + Number(m[2] ?? 0) : 0
      }
      const mini = (n: string): number => (/mini|nano/.test(n) ? 0 : 1)
      return v(b) - v(a) || mini(b) - mini(a) || a.length - b.length
    })
}

class OpenAiProvider implements Provider {
  id: ProviderId = 'openai'
  supportsVision = true

  constructor(private creds: ProviderCredentials) {}

  private base(): string {
    return (this.creds.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
  }

  private headers(): Record<string, string> {
    const key = this.creds.openaiApiKey ?? ''
    if (!key) throw new Error('No OpenAI API key set (Settings → Models, or OPENAI_API_KEY).')
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }
  }

  async listModels(): Promise<string[]> {
    if (!this.creds.openaiApiKey) return OPENAI_FALLBACK_MODELS
    try {
      const res = await fetch(`${this.base()}/models`, { headers: this.headers() })
      if (!res.ok) return OPENAI_FALLBACK_MODELS
      const json = (await res.json()) as { data?: { id: string }[] }
      const ranked = rankOpenAiModels((json.data ?? []).map((m) => m.id))
      return ranked.length ? ranked : OPENAI_FALLBACK_MODELS
    } catch {
      return OPENAI_FALLBACK_MODELS
    }
  }

  async generate(model: string, req: GenerateRequest): Promise<string> {
    const content: any[] = [{ type: 'input_text', text: req.prompt }]
    for (const img of req.images ?? []) {
      const enc = await imageToBase64(img.path)
      if (!enc) continue
      if (img.caption) content.push({ type: 'input_text', text: img.caption })
      content.push({ type: 'input_image', image_url: `data:${enc.mime};base64,${enc.data}` })
    }

    const body: Record<string, unknown> = {
      model,
      instructions: req.system,
      input: [{ role: 'user', content }],
      ...(req.maxOutputTokens ? { max_output_tokens: req.maxOutputTokens } : {})
    }
    if (req.schema) {
      body.text = {
        format: { type: 'json_schema', name: 'qualition_findings', schema: req.schema, strict: false }
      }
    }

    const text = await withBackoff('openai', async () => {
      const res = await fetch(`${this.base()}/responses`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body)
      })
      const raw = await res.text()
      if (!res.ok) throw new Error(`${res.status} ${raw.slice(0, 300)}`)
      const json = JSON.parse(raw)
      if (typeof json.output_text === 'string' && json.output_text) return json.output_text
      const chunks: string[] = []
      for (const item of json.output ?? []) {
        for (const c of item.content ?? []) if (typeof c.text === 'string') chunks.push(c.text)
      }
      return chunks.join('\n')
    })
    return text
  }

  async status(model: string): Promise<ProviderStatus> {
    if (!this.creds.openaiApiKey) return { id: 'openai', ok: false, detail: 'No API key set.', model }
    try {
      const out = await this.generate(model, { system: 'Reply with one word.', prompt: 'Say: ready' })
      return { id: 'openai', ok: true, detail: `${model}: ${out.trim().slice(0, 30)}`, model }
    } catch (e) {
      return { id: 'openai', ok: false, detail: (e as Error).message.slice(0, 200), model }
    }
  }
}

/* --------------------------------- cursor --------------------------------- */

const CURSOR_FALLBACK_MODELS = ['auto', 'gpt-5.2', 'composer-2.5', 'claude-opus-5-high', 'cursor-grok-4.5-high']

function cursorBinary(creds: ProviderCredentials): string {
  return creds.cursorBinary || join(homedir(), '.local/bin/cursor-agent')
}

function runCursor(bin: string, args: string[], input: string, env: NodeJS.ProcessEnv, timeoutMs = 180_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      bin,
      args,
      { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, env },
      (err, stdout, stderr) => {
        if (err && !stdout) return reject(new Error(`${err.message} ${String(stderr).slice(0, 300)}`))
        resolve(stdout)
      }
    )
    child.stdin?.end(input)
  })
}

class CursorProvider implements Provider {
  id: ProviderId = 'cursor'
  /** The CLI has no image channel — callers must send evidence as text. */
  supportsVision = false

  constructor(private creds: ProviderCredentials) {}

  private env(): NodeJS.ProcessEnv {
    return this.creds.cursorApiKey
      ? { ...process.env, CURSOR_API_KEY: this.creds.cursorApiKey }
      : { ...process.env }
  }

  async listModels(): Promise<string[]> {
    try {
      const out = await runCursor(cursorBinary(this.creds), ['--list-models'], '', this.env(), 30_000)
      const models = out
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => /^[a-z0-9][\w.\-]*\s+-\s+/i.test(l))
        .map((l) => l.split(/\s+-\s+/)[0])
      return models.length ? models : CURSOR_FALLBACK_MODELS
    } catch {
      return CURSOR_FALLBACK_MODELS
    }
  }

  async generate(model: string, req: GenerateRequest): Promise<string> {
    const schemaNote = req.schema
      ? `\n\nRespond with ONLY a JSON object matching this schema. No prose, no markdown fence:\n${JSON.stringify(req.schema)}`
      : ''
    const prompt = `${req.system}\n\n---\n\n${req.prompt}${schemaNote}`
    const args = [
      '-p',
      '--trust',
      '--output-format',
      'json',
      '--mode',
      'ask',
      ...(model && model !== 'auto' ? ['--model', model] : [])
    ]
    const raw = await withBackoff('cursor', () => runCursor(cursorBinary(this.creds), args, prompt, this.env()))
    // Headless JSON: {"type":"result","result":"…"} — sometimes preceded by event lines.
    for (const line of raw.split('\n').reverse()) {
      const t = line.trim()
      if (!t.startsWith('{')) continue
      try {
        const j = JSON.parse(t)
        if (typeof j.result === 'string') return j.result
      } catch {
        /* not the result line */
      }
    }
    return raw
  }

  async status(model: string): Promise<ProviderStatus> {
    try {
      const out = await this.generate(model, { system: 'Reply with one word.', prompt: 'Say: ready' })
      const ok = out.trim().length > 0
      return {
        id: 'cursor',
        ok,
        detail: ok ? `${model || 'auto'}: ${out.trim().slice(0, 30)} (text-only, no vision)` : 'No output from cursor-agent.',
        model
      }
    } catch (e) {
      return {
        id: 'cursor',
        ok: false,
        detail: `${(e as Error).message.slice(0, 160)} — install the Cursor CLI and run 'cursor-agent login'.`,
        model
      }
    }
  }
}

/* --------------------------------- factory -------------------------------- */

export function createProvider(id: ProviderId, creds: ProviderCredentials): Provider {
  switch (id) {
    case 'openai':
      return new OpenAiProvider(creds)
    case 'cursor':
      return new CursorProvider(creds)
    default:
      return new GeminiProvider(creds)
  }
}

export function credsFromSettings(s: {
  geminiApiKey?: string
  openaiApiKey?: string
  openaiBaseUrl?: string
  cursorBinary?: string
  cursorApiKey?: string
}): ProviderCredentials {
  return {
    geminiApiKey: s.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    openaiApiKey: s.openaiApiKey || process.env.OPENAI_API_KEY,
    openaiBaseUrl: s.openaiBaseUrl || process.env.OPENAI_BASE_URL,
    cursorBinary: s.cursorBinary,
    cursorApiKey: s.cursorApiKey || process.env.CURSOR_API_KEY
  }
}
