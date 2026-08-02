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
import type { ModelInfo, ProviderId, ProviderStatus } from '../../shared/types.js'

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
  listModels(): Promise<ModelInfo[]>
  generate(model: string, req: GenerateRequest): Promise<string>
  status(model: string): Promise<ProviderStatus>
}

/**
 * Published list prices, USD per 1M tokens, for providers with no pricing API.
 * Marked `list` so the UI can say these are quoted prices rather than something
 * fetched now — they will drift as vendors change them.
 */
const LIST_PRICES: Record<string, [number, number]> = {
  'gemini-3.6-flash': [0.3, 2.5],
  'gemini-3.5-flash': [0.3, 2.5],
  'gemini-3-pro-preview': [1.25, 10],
  'gemini-3.1-pro-preview': [1.25, 10],
  'gemini-flash-latest': [0.3, 2.5],
  'gemini-pro-latest': [1.25, 10],
  'gemini-2.5-flash': [0.3, 2.5],
  'gemini-2.5-flash-lite': [0.1, 0.4],
  'gemini-2.5-pro': [1.25, 10],
  'gemini-2.0-flash': [0.1, 0.4],
  'gpt-5.2': [1.25, 10],
  'gpt-5.1': [1.25, 10],
  'gpt-5': [1.25, 10],
  'gpt-5-mini': [0.25, 2],
  'gpt-4.1': [2, 8],
  'gpt-4.1-mini': [0.4, 1.6],
  'o4-mini': [1.1, 4.4]
}

function withListPrice(id: string): ModelInfo {
  const p = LIST_PRICES[id]
  return p ? { id, promptPrice: p[0], completionPrice: p[1], priceSource: 'list' } : { id }
}

export interface ProviderCredentials {
  geminiApiKey?: string
  openaiApiKey?: string
  openaiBaseUrl?: string
  cursorBinary?: string
  cursorApiKey?: string
  openrouterApiKey?: string
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

/** Hard ceiling for a single model request. */
export const REQUEST_TIMEOUT_MS = 120_000

/**
 * Bound one request. `withBackoff` only retries promises that *reject*; a
 * request that simply never settles would hang the whole run forever, which is
 * exactly what a stalled vision call did.
 */
export async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
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

/** Retry transient rate limits / outages with backoff + jitter. */
export async function withBackoff<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      const msg = (e as Error).message ?? ''
      const retryable =
        /429|RESOURCE_EXHAUSTED|rate.?limit|503|UNAVAILABLE|500|INTERNAL|overloaded|fetch failed|ECONN|ETIMEDOUT|timed out|timeout/i.test(msg)
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

  async listModels(): Promise<ModelInfo[]> {
    const key = this.creds.geminiApiKey
    if (!key) return GEMINI_FALLBACK_MODELS.map(withListPrice)
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=200`)
      if (!res.ok) return GEMINI_FALLBACK_MODELS.map(withListPrice)
      const json = (await res.json()) as {
        models?: { name: string; supportedGenerationMethods?: string[]; inputTokenLimit?: number }[]
      }
      const limits = new Map<string, number>()
      for (const m of json.models ?? []) limits.set(m.name.replace(/^models\//, ''), m.inputTokenLimit ?? 0)
      const names = (json.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => m.name.replace(/^models\//, ''))
      const ranked = names.length ? rankGeminiModels(names) : GEMINI_FALLBACK_MODELS
      return ranked.map((id) => ({ ...withListPrice(id), contextTokens: limits.get(id) || undefined, vision: true }))
    } catch {
      return GEMINI_FALLBACK_MODELS.map(withListPrice)
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
      withTimeout(
        this.sdk().models.generateContent({
          model,
          contents: [{ role: 'user', parts }],
          config: {
            systemInstruction: req.system,
            temperature: req.temperature ?? 0.4,
            ...(req.schema ? { responseMimeType: 'application/json', responseSchema: req.schema as any } : {})
          }
        }),
        REQUEST_TIMEOUT_MS,
        'gemini request'
      )
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

  async listModels(): Promise<ModelInfo[]> {
    if (!this.creds.openaiApiKey) return OPENAI_FALLBACK_MODELS.map(withListPrice)
    try {
      const res = await fetch(`${this.base()}/models`, { headers: this.headers() })
      if (!res.ok) return OPENAI_FALLBACK_MODELS.map(withListPrice)
      const json = (await res.json()) as { data?: { id: string }[] }
      const ranked = rankOpenAiModels((json.data ?? []).map((m) => m.id))
      return (ranked.length ? ranked : OPENAI_FALLBACK_MODELS).map((id) => ({ ...withListPrice(id), vision: true }))
    } catch {
      return OPENAI_FALLBACK_MODELS.map(withListPrice)
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
      const res = await withTimeout(
        fetch(`${this.base()}/responses`, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        }),
        REQUEST_TIMEOUT_MS,
        'openai request'
      )
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

  async listModels(): Promise<ModelInfo[]> {
    try {
      const out = await runCursor(cursorBinary(this.creds), ['--list-models'], '', this.env(), 30_000)
      const models = out
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => /^[a-z0-9][\w.\-]*\s+-\s+/i.test(l))
        .map((l) => {
          const [id, label] = l.split(/\s+-\s+/)
          return { id, label }
        })
      // Cursor bills by subscription, not per token — no per-model price exists.
      return models.length ? models : CURSOR_FALLBACK_MODELS.map((id) => ({ id }))
    } catch {
      return CURSOR_FALLBACK_MODELS.map((id) => ({ id }))
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
    const raw = await withBackoff('cursor', () =>
      withTimeout(
        runCursor(cursorBinary(this.creds), args, prompt, this.env(), REQUEST_TIMEOUT_MS),
        REQUEST_TIMEOUT_MS + 5000,
        'cursor request'
      )
    )
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

/* ------------------------------- openrouter ------------------------------- */

/**
 * One key, most models, and the only provider here that publishes live pricing
 * per model — so its costs are fetched rather than quoted from a table.
 */
class OpenRouterProvider implements Provider {
  id: ProviderId = 'openrouter'
  supportsVision = true

  constructor(private creds: ProviderCredentials) {}

  private headers(): Record<string, string> {
    const key = this.creds.openrouterApiKey ?? ''
    if (!key) throw new Error('No OpenRouter API key set (Settings → Models, or OPENROUTER_API_KEY).')
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      // OpenRouter attributes traffic with these.
      'HTTP-Referer': 'https://github.com/karthiknish/qualition',
      'X-Title': 'Qualition'
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models')
      if (!res.ok) return []
      const json = (await res.json()) as {
        data?: {
          id: string
          name?: string
          context_length?: number
          pricing?: { prompt?: string; completion?: string }
          architecture?: { input_modalities?: string[] }
        }[]
      }
      // Media, safety and retrieval models cannot critique a screenshot; they
      // only make the picker harder to use.
      const irrelevant =
        /(tts|whisper|audio|speech|music|lyria|video|veo|sora|image-gen|dall|embed|rerank|moderation|guard|safety|content-safety)/i

      // Ranked so the models people actually audit with surface first, rather
      // than whatever happens to be free.
      const VENDOR_RANK = ['anthropic/', 'openai/', 'google/', 'x-ai/', 'deepseek/', 'meta-llama/', 'mistralai/', 'qwen/']
      const vendorRank = (id: string): number => {
        const i = VENDOR_RANK.findIndex((v) => id.startsWith(v))
        return i === -1 ? VENDOR_RANK.length : i
      }

      const models = (json.data ?? [])
        .filter((m) => !m.id.startsWith('~') && !irrelevant.test(m.id))
        .map((m) => {
          // OpenRouter quotes USD per token; per 1M is the readable unit. It
          // uses -1 for auto-routed models whose price depends on the pick.
          const perM = (v: unknown): number | undefined => {
            const n = Number(v ?? NaN) * 1_000_000
            return Number.isFinite(n) && n >= 0 ? n : undefined
          }
          return {
            id: m.id,
            label: m.name,
            promptPrice: perM(m.pricing?.prompt),
            completionPrice: perM(m.pricing?.completion),
            contextTokens: m.context_length,
            vision: (m.architecture?.input_modalities ?? []).includes('image'),
            priceSource: 'live' as const
          }
        })

      return models.sort(
        (a, b) =>
          Number(b.vision) - Number(a.vision) ||
          vendorRank(a.id) - vendorRank(b.id) ||
          (a.promptPrice ?? 1e9) - (b.promptPrice ?? 1e9)
      )
    } catch {
      return []
    }
  }

  async generate(model: string, req: GenerateRequest): Promise<string> {
    const content: any[] = [{ type: 'text', text: req.prompt }]
    for (const img of req.images ?? []) {
      const enc = await imageToBase64(img.path)
      if (!enc) continue
      if (img.caption) content.push({ type: 'text', text: img.caption })
      content.push({ type: 'image_url', image_url: { url: `data:${enc.mime};base64,${enc.data}` } })
    }

    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content }
      ],
      temperature: req.temperature ?? 0.4,
      ...(req.schema
        ? {
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'qualition_findings', strict: false, schema: req.schema }
            }
          }
        : {})
    }

    return withBackoff('openrouter', async () => {
      const res = await withTimeout(
        fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        }),
        REQUEST_TIMEOUT_MS,
        'openrouter request'
      )
      const raw = await res.text()
      if (!res.ok) throw new Error(`${res.status} ${raw.slice(0, 300)}`)
      const json = JSON.parse(raw)
      if (json.error) throw new Error(String(json.error.message ?? json.error).slice(0, 300))
      return json.choices?.[0]?.message?.content ?? ''
    })
  }

  async status(model: string): Promise<ProviderStatus> {
    if (!this.creds.openrouterApiKey) return { id: 'openrouter', ok: false, detail: 'No API key set.', model }
    try {
      const out = await this.generate(model, { system: 'Reply with one word.', prompt: 'Say: ready' })
      return { id: 'openrouter', ok: true, detail: `${model}: ${out.trim().slice(0, 30)}`, model }
    } catch (e) {
      return { id: 'openrouter', ok: false, detail: (e as Error).message.slice(0, 200), model }
    }
  }
}

export function createProvider(id: ProviderId, creds: ProviderCredentials): Provider {
  switch (id) {
    case 'openai':
      return new OpenAiProvider(creds)
    case 'cursor':
      return new CursorProvider(creds)
    case 'openrouter':
      return new OpenRouterProvider(creds)
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
  openrouterApiKey?: string
}): ProviderCredentials {
  return {
    geminiApiKey: s.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    openaiApiKey: s.openaiApiKey || process.env.OPENAI_API_KEY,
    openaiBaseUrl: s.openaiBaseUrl || process.env.OPENAI_BASE_URL,
    cursorBinary: s.cursorBinary,
    cursorApiKey: s.cursorApiKey || process.env.CURSOR_API_KEY,
    openrouterApiKey: s.openrouterApiKey || process.env.OPENROUTER_API_KEY
  }
}
