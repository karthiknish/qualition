/**
 * Shoogle — component search across every community shadcn registry.
 *
 * https://mcp.shoogle.dev/mcp indexes 11,000+ blocks/components across
 * community registries (@shadcnuikit, @shadcnblocks, @cult-ui, …) and returns
 * ready-to-use `npx shadcn@latest add` arguments. It is the PRIMARY source for
 * replacement recommendations; the first-party shadcn registry is the fallback
 * when Shoogle is unreachable or returns nothing for a section role.
 *
 * Tools:
 *   search_registry_items        { query, offset?, limit? }
 *   search_registry_items_scoped { query, registries[], offset?, limit? }
 */
import { McpClient } from './mcpClient.js'
import { discoverMcpServers } from './credentials.js'
import type { SectionRole } from '../../shared/types.js'

const DEFAULT_URL = 'https://mcp.shoogle.dev/mcp'

export interface ShoogleItem {
  name: string
  registry: string
  type: string
  description: string
  addCommandArgument: string
  homepage?: string
}

let client: McpClient | null = null

async function getClient(): Promise<McpClient> {
  if (client) return client
  const servers = await discoverMcpServers()
  const cfg = servers.find((s) => s.url?.includes('shoogle.dev'))
  client = new McpClient(cfg?.url ?? DEFAULT_URL, cfg?.headers ?? {})
  return client
}

/** Release the MCP connection (its open stream would keep the process alive). */
export async function closeShoogle(): Promise<void> {
  await client?.close()
  client = null
}

export async function shoogleStatus(): Promise<{ ok: boolean; detail: string }> {
  try {
    const c = await getClient()
    const tools = await c.listTools()
    return { ok: tools.length > 0, detail: `${tools.length} tools via ${c.transport}: ${tools.map((t) => t.name).join(', ')}` }
  } catch (e) {
    return { ok: false, detail: (e as Error).message.slice(0, 200) }
  }
}

function parseItems(text: string): ShoogleItem[] {
  try {
    const json = JSON.parse(text)
    const items: any[] = json.items ?? json.results ?? []
    return items.map((i) => ({
      name: String(i.name ?? ''),
      registry: String(i.registry ?? ''),
      type: String(i.type ?? 'registry:block'),
      description: String(i.description ?? ''),
      addCommandArgument: String(i.addCommandArgument ?? `${i.registry}/${i.name}`),
      homepage: i.homepage
    }))
  } catch {
    return []
  }
}

/** Free-text search across every indexed community registry. */
export async function searchShoogle(query: string, limit = 8, registries?: string[]): Promise<ShoogleItem[]> {
  const c = await getClient()
  const tool = registries?.length ? 'search_registry_items_scoped' : 'search_registry_items'
  const args: Record<string, unknown> = { query, limit }
  if (registries?.length) args.registries = registries
  const res = await c.callTool(tool, args)
  const text = res.content.find((x) => x.type === 'text')?.text
  return text ? parseItems(text) : []
}

/**
 * Section roles map to the vocabulary community registries actually use for
 * block names, which is what Shoogle full-text matches on.
 */
const ROLE_QUERIES: Record<SectionRole, string[]> = {
  nav: ['sidebar navigation', 'navbar', 'app sidebar', 'settings nav'],
  hero: ['hero', 'banner', 'landing hero'],
  features: ['feature', 'bento', 'feature grid'],
  pricing: ['pricing', 'pricing table', 'plan cards'],
  testimonials: ['testimonial', 'review', 'social proof'],
  logos: ['logo cloud', 'logos', 'marquee'],
  faq: ['faq', 'accordion faq'],
  cta: ['cta', 'call to action'],
  form: ['login form', 'signup', 'settings form', 'contact form'],
  table: ['data table', 'tanstack table', 'orders table'],
  gallery: ['gallery', 'carousel', 'template gallery', 'card grid'],
  stats: ['stats', 'kpi cards', 'dashboard metrics', 'chart'],
  footer: ['footer'],
  // "content" is the catch-all for app shells — query product UI, not "section/card".
  content: ['dashboard', 'empty state', 'settings page', 'chat', 'kanban', 'activity feed']
}

/** Extra search phrases pulled from section copy + finding titles. */
export function queriesForSection(
  role: SectionRole,
  section: { label?: string; headings?: string[]; ctaLabels?: string[]; textPreview?: string },
  problems: string[] = []
): string[] {
  const out: string[] = [...(ROLE_QUERIES[role] ?? [role])]
  const blob = [section.label, ...(section.headings ?? []), ...(section.ctaLabels ?? []), section.textPreview ?? '', ...problems]
    .join(' ')
    .toLowerCase()

  const hints: [RegExp, string][] = [
    [/\bsettings?\b/, 'settings page'],
    [/\bsidebar\b|\bnavigation\b/, 'app sidebar'],
    [/\bchat\b|\bcomposer\b|\binbox\b|\bmessage\b/, 'chat interface'],
    [/\btask\b|\bkanban\b|\bboard\b|\bcolumn\b/, 'kanban board'],
    [/\btemplate\b|\bstarter\b/, 'template gallery'],
    [/\bdashboard\b|\boverview\b|\bkpi\b/, 'dashboard'],
    [/\bchart\b|\bmetrics?\b|\bspark\b/, 'chart stats'],
    [/\bempty\b|\bno (results|data|items)\b/, 'empty state'],
    [/\bpricing\b|\bplan\b/, 'pricing'],
    [/\blogin\b|\bsign[- ]?in\b|\bauth\b/, 'login form'],
    [/\btable\b|\bgrid\b/, 'data table'],
    [/\bmodal\b|\bdialog\b|\bsheet\b|\boverlay\b/, 'dialog sheet'],
    [/\bcommand\b|\bpalette\b|\bsearch\b/, 'command menu']
  ]
  for (const [re, q] of hints) {
    if (re.test(blob)) out.push(q)
  }

  // Short free-text from the section label itself when it looks intentional.
  const label = (section.label ?? '').trim()
  if (label.length >= 4 && label.length <= 48 && !/^s\d+$/i.test(label)) out.push(label)

  // Dedupe, keep order, cap.
  const seen = new Set<string>()
  const unique: string[] = []
  for (const q of out) {
    const k = q.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    unique.push(q)
  }
  return unique.slice(0, 6)
}

/** Best-effort block candidates for a section, deduplicated. */
export async function shoogleForRole(role: SectionRole, perQuery = 4): Promise<ShoogleItem[]> {
  return shoogleForQueries(ROLE_QUERIES[role] ?? [role], perQuery)
}

/** Context-aware Shoogle search for a concrete page section. */
export async function shoogleForSection(
  role: SectionRole,
  section: { label?: string; headings?: string[]; ctaLabels?: string[]; textPreview?: string },
  problems: string[] = [],
  limit = 6
): Promise<ShoogleItem[]> {
  const queries = queriesForSection(role, section, problems)
  const items = await shoogleForQueries(queries, Math.max(3, Math.ceil(limit / 2)))
  return items.slice(0, limit)
}

async function shoogleForQueries(queries: string[], perQuery: number): Promise<ShoogleItem[]> {
  const out: ShoogleItem[] = []
  const seen = new Set<string>()
  let hardFail = 0
  for (const q of queries) {
    let items: ShoogleItem[] = []
    try {
      items = await searchShoogle(q, perQuery)
    } catch {
      hardFail++
      // One flaky query should not abandon the rest; bail only if nothing works.
      if (hardFail >= 2 && out.length === 0) break
      continue
    }
    for (const it of items) {
      const key = it.addCommandArgument
      if (!seen.has(key)) {
        seen.add(key)
        out.push(it)
      }
    }
    if (out.length >= perQuery * 2) break
  }
  return out
}

export function shoogleAddCommand(item: ShoogleItem): string {
  return `npx shadcn@latest add ${item.addCommandArgument}`
}

/* --------------------------- component detail ----------------------------- */

export interface ComponentDetail {
  ok: boolean
  name: string
  registry: string
  title?: string
  description?: string
  dependencies: string[]
  registryDependencies: string[]
  files: { path: string; type?: string; preview?: string; lines?: number }[]
  sourceUrl?: string
  homepage?: string
  error?: string
}

/**
 * Shoogle indexes names, not previews — so "what does this component actually
 * contain?" is answered by fetching the item from its own registry using the
 * shadcn registry protocol (`<origin>/r/<name>.json`). Public registries return
 * the real source; paid/pro ones answer 401/404, which we report honestly
 * rather than pretending the component is empty.
 */
export async function fetchComponentDetail(input: {
  name: string
  registry: string
  homepage?: string
  addCommandArgument?: string
}): Promise<ComponentDetail> {
  const base: ComponentDetail = {
    ok: false,
    name: input.name,
    registry: input.registry,
    dependencies: [],
    registryDependencies: [],
    files: [],
    homepage: input.homepage
  }

  // First-party shadcn has its own layout; community registries follow /r/<name>.json.
  const candidates: string[] = []
  if (input.registry === '@shadcn') {
    candidates.push(`https://ui.shadcn.com/r/styles/new-york/${input.name}.json`)
  }
  if (input.homepage) {
    try {
      const origin = new URL(input.homepage).origin
      candidates.push(`${origin}/r/${input.name}.json`, `${origin}/registry/${input.name}.json`)
    } catch {
      /* bad homepage */
    }
  }

  for (const url of candidates) {
    try {
      const res = await fetch(url, { redirect: 'follow' })
      const text = await res.text()
      if (!res.ok || !text.trim().startsWith('{')) {
        base.error =
          res.status === 401 || res.status === 403 || /Authentication/i.test(text)
            ? 'This registry requires a paid licence to read the source.'
            : res.status === 429
              ? 'Registry is rate-limiting requests; try again shortly.'
              : `Registry returned ${res.status}.`
        continue
      }
      const json = JSON.parse(text)
      return {
        ok: true,
        name: json.name ?? input.name,
        registry: input.registry,
        title: json.title,
        description: json.description,
        dependencies: json.dependencies ?? [],
        registryDependencies: json.registryDependencies ?? [],
        files: (json.files ?? []).map((f: any) => ({
          path: f.path,
          type: f.type,
          lines: typeof f.content === 'string' ? f.content.split('\n').length : undefined,
          preview: typeof f.content === 'string' ? f.content.slice(0, 4000) : undefined
        })),
        sourceUrl: url,
        homepage: input.homepage
      }
    } catch (e) {
      base.error = (e as Error).message.slice(0, 140)
    }
  }
  return base
}
