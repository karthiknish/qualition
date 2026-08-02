/**
 * Mobbin reference lookup.
 *
 * Uses the Mobbin MCP server (https://api.mobbin.com/mcp) with the OAuth token
 * already provisioned on this machine (see credentials.ts). Tool results come
 * back as one JSON text block plus one inline image per result; we persist the
 * images next to the run so the report works offline.
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { McpClient } from './mcpClient.js'
import { discoverMcpServers, getBearerFor } from './credentials.js'
import type { MobbinReference, SectionRole } from '../../shared/types.js'

const DEFAULT_URL = 'https://api.mobbin.com/mcp'

let client: McpClient | null = null

async function getClient(): Promise<McpClient> {
  if (client) return client
  const servers = await discoverMcpServers()
  const cfg = servers.find((s) => s.url?.includes('api.mobbin.com'))
  client = new McpClient(cfg?.url ?? DEFAULT_URL, cfg?.headers ?? {})
  return client
}

/**
 * Release the MCP connection. The streamable-HTTP transport holds an open
 * stream, which keeps the Node event loop (and therefore a CLI process) alive
 * after the work is done, so every entry point must call this when finished.
 */
export async function closeMobbin(): Promise<void> {
  await client?.close()
  client = null
}

export async function mobbinStatus(): Promise<{ ok: boolean; detail: string; source?: string }> {
  try {
    const servers = await discoverMcpServers()
    const cfg = servers.find((s) => s.url?.includes('api.mobbin.com'))
    const url = cfg?.url ?? DEFAULT_URL
    const bearer = await getBearerFor(url)
    if (!bearer && !cfg?.headers?.Authorization) {
      return {
        ok: false,
        detail: 'No Mobbin OAuth token found in Keychain (service "pi-mcp-adapter.oauth"). Authenticate Mobbin in pi or Cursor once, then reload.',
        source: cfg?.origin
      }
    }
    const c = await getClient()
    const tools = await c.listTools()
    return {
      ok: true,
      detail: `${tools.length} tools via ${c.transport}: ${tools.map((t) => t.name).join(', ')}`,
      source: cfg?.origin ?? 'default'
    }
  } catch (e) {
    return { ok: false, detail: (e as Error).message }
  }
}

/** Natural-language query per section role — Mobbin rewards specific prose. */
export function queryForRole(role: SectionRole, context: string): string {
  const c = context ? ` for ${context}` : ''
  const map: Record<SectionRole, string> = {
    nav: `website top navigation bar with product menu and sign up button${c}`,
    hero: `landing page hero section with headline, subtext and primary call to action${c}`,
    features: `feature grid section with icons, titles and short descriptions${c}`,
    pricing: `pricing section with plan cards, feature list and upgrade buttons${c}`,
    testimonials: `customer testimonial section with quotes, avatars and company names${c}`,
    logos: `logo wall section showing customer company logos${c}`,
    faq: `frequently asked questions section with expandable accordion items${c}`,
    cta: `closing call to action band with headline and signup button${c}`,
    form: `signup form with email and password fields and submit button${c}`,
    table: `data table page with sortable columns, filters and row actions${c}`,
    gallery: `media gallery grid with image cards and captions${c}`,
    stats: `metrics section showing large numbers with labels${c}`,
    footer: `website footer with grouped link columns and social icons${c}`,
    content: `long form content page with headings and body text${c}`
  }
  return map[role]
}

/**
 * The MCP inlines a downscaled preview (768px wide). The screen's own page
 * carries the full asset — a single <img> whose src is the bytescale `file.*`
 * URL, typically 1440px+ (~3.5x the pixels), plus a human alt description.
 * Fetching that gives references you can actually judge a design against.
 *
 * Entirely best-effort: any failure keeps the inline preview.
 */
async function fetchHiRes(
  mobbinUrl: string,
  minBytes: number
): Promise<{ buffer: Buffer; ext: string; alt?: string } | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 9000)
    const page = await fetch(mobbinUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      }
    })
    clearTimeout(timer)
    if (!page.ok) return null
    const html = (await page.text()).replace(/&amp;/g, '&')

    const tag = /<img[^>]+src="(https:\/\/bytescale[^"]*\/file\.(webp|jpg|jpeg|png)[^"]*)"[^>]*>/i.exec(html)
    const alsoAlt = tag ? /alt="([^"]+)"/i.exec(tag[0])?.[1] : undefined
    const src = tag?.[1]
    if (!src) return null

    const imgRes = await fetch(src)
    if (!imgRes.ok) return null
    const buffer = Buffer.from(await imgRes.arrayBuffer())
    // Only take it if it is genuinely better than what we already have.
    if (buffer.byteLength <= minBytes) return null
    const ext = (imgRes.headers.get('content-type') ?? 'image/webp').split('/')[1].replace('jpeg', 'jpg')
    return { buffer, ext, alt: alsoAlt }
  } catch {
    return null
  }
}

interface RawResults {
  screens?: any[]
  flows?: any[]
  sections?: any[]
  results?: any[]
}

/** Mobbin's deep search is slow and occasionally rate-limits; retry politely. */
async function callWithRetry(
  tool: string,
  args: Record<string, unknown>,
  attempts = 3
): Promise<Awaited<ReturnType<McpClient['callTool']>>> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await (await getClient()).callTool(tool, args)
    } catch (e) {
      lastError = e
      const msg = (e as Error).message ?? ''
      if (/401|403|unauthor/i.test(msg)) {
        // Token likely expired mid-run: drop the client so the next attempt re-auths.
        await client?.close()
        client = null
      } else if (!/429|5\d\d|timeout|fetch failed|ECONN/i.test(msg)) {
        break
      }
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1200 * (i + 1)))
    }
  }
  throw lastError
}

async function callAndPersist(
  tool: 'search_screens' | 'search_flows' | 'search_sections',
  args: Record<string, unknown>,
  kind: MobbinReference['kind'],
  outDir: string,
  sectionId?: string
): Promise<MobbinReference[]> {
  const res = await callWithRetry(tool, args)
  const textBlock = res.content.find((c) => c.type === 'text')?.text
  const images = res.content.filter((c) => c.type === 'image')
  let parsed: RawResults = {}
  if (textBlock) {
    try {
      parsed = JSON.parse(textBlock)
    } catch {
      /* server may return prose */
    }
  }
  const rows: any[] = parsed.screens ?? parsed.flows ?? parsed.sections ?? parsed.results ?? []
  await mkdir(outDir, { recursive: true })

  const refs: MobbinReference[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    let imageUrl: string | undefined = row.image_url
    let description: string | undefined
    const img = images[i]
    const inline = img?.data ? Buffer.from(String(img.data), 'base64') : null
    const stem = join(outDir, `mobbin-${kind}-${sectionId ?? 'general'}-${i}`)

    if (inline) {
      const ext = (img.mimeType ?? 'image/webp').split('/')[1] ?? 'webp'
      try {
        await writeFile(`${stem}.${ext}`, inline)
        imageUrl = `${stem}.${ext}`
      } catch {
        /* keep remote url */
      }
    }

    // Upgrade to the full-resolution asset from the screen page when possible.
    if (row.mobbin_url) {
      const hi = await fetchHiRes(row.mobbin_url, inline?.byteLength ?? 0)
      if (hi) {
        try {
          const file = `${stem}-hi.${hi.ext}`
          await writeFile(file, hi.buffer)
          imageUrl = file
          description = hi.alt
        } catch {
          /* keep the inline preview */
        }
      }
    }

    refs.push({
      sectionId,
      query: String(args.query ?? ''),
      kind,
      title: row.title ?? row.name ?? row.app_name ?? `${kind} ${i + 1}`,
      appName: row.app_name,
      description,
      imageUrl,
      mobbinUrl: row.mobbin_url
    })
  }
  return refs
}

export async function searchScreens(
  query: string,
  opts: { platform?: 'web' | 'ios'; limit?: number; outDir: string; sectionId?: string }
): Promise<MobbinReference[]> {
  return callAndPersist(
    'search_screens',
    { query, platform: opts.platform ?? 'web', limit: opts.limit ?? 4, mode: 'standard' },
    'screen',
    opts.outDir,
    opts.sectionId
  )
}

export async function searchSections(
  query: string,
  opts: { limit?: number; outDir: string; sectionId?: string }
): Promise<MobbinReference[]> {
  return callAndPersist(
    'search_sections',
    { query, limit: opts.limit ?? 4 },
    'section',
    opts.outDir,
    opts.sectionId
  )
}

export async function searchFlows(
  query: string,
  opts: { platform?: 'web' | 'ios'; limit?: number; outDir: string }
): Promise<MobbinReference[]> {
  return callAndPersist(
    'search_flows',
    { query, platform: opts.platform ?? 'web', limit: opts.limit ?? 2, mode: 'standard' },
    'flow',
    opts.outDir
  )
}
