/**
 * shadcn registry search + section-level replacement recommendations.
 *
 * Talks to the public registry over HTTP (no npx spawn):
 *   - component index: https://ui.shadcn.com/r/index.json
 *   - item payload:    https://ui.shadcn.com/r/styles/new-york/<name>.json
 * Extra registries (registry.json / index.json shaped) can be added in Settings.
 */
import { shoogleForSection, shoogleAddCommand } from './shoogle.js'
import type { ComponentRecommendation, PageSection, SectionRole } from '../../shared/types.js'

export interface RegistryItem {
  name: string
  type: string
  description?: string
  registry: string
  docs?: string
  dependencies?: string[]
  registryDependencies?: string[]
  keywords: string[]
}

export interface RegistryDef {
  name: string // e.g. "@shadcn"
  indexUrl: string
  itemUrl: (name: string) => string
}

export const SHADCN: RegistryDef = {
  name: '@shadcn',
  indexUrl: 'https://ui.shadcn.com/r/index.json',
  itemUrl: (n) => `https://ui.shadcn.com/r/styles/new-york/${n}.json`
}

/**
 * Blocks are not listed in index.json but are addressable by name. This curated
 * catalogue is what makes "replace this section with X" concrete.
 */
const BLOCKS: { name: string; description: string; roles: SectionRole[] }[] = [
  { name: 'login-01', description: 'Centered email/password login card', roles: ['form'] },
  { name: 'login-02', description: 'Two-column login with cover image', roles: ['form'] },
  { name: 'login-03', description: 'Login card with social providers', roles: ['form'] },
  { name: 'login-04', description: 'Split login, form right, art left', roles: ['form'] },
  { name: 'login-05', description: 'Minimal login with logo and muted footer', roles: ['form'] },
  { name: 'signup-01', description: 'Signup card with name/email/password', roles: ['form'] },
  { name: 'dashboard-01', description: 'App shell: sidebar, header, KPI cards, chart, data table', roles: ['stats', 'table', 'content'] },
  { name: 'sidebar-07', description: 'Collapsible icon sidebar with nav groups', roles: ['nav'] },
  { name: 'sidebar-08', description: 'Inset sidebar with secondary navigation', roles: ['nav'] },
  { name: 'sidebar-13', description: 'Sidebar in a dialog for settings', roles: ['nav'] },
  { name: 'products-01', description: 'Product list with filters, table and detail drawer', roles: ['table', 'gallery'] },
  { name: 'calendar-11', description: 'Range calendar with presets', roles: ['content'] }
]

/** Which primitives a given section role is normally built from. */
const ROLE_COMPONENTS: Record<SectionRole, string[]> = {
  nav: ['navigation-menu', 'sheet', 'button', 'dropdown-menu', 'separator'],
  hero: ['button', 'badge', 'aspect-ratio', 'input-group'],
  features: ['card', 'item', 'badge', 'separator', 'hover-card'],
  pricing: ['card', 'badge', 'toggle-group', 'button', 'tooltip', 'separator'],
  testimonials: ['card', 'avatar', 'carousel', 'quote' as string],
  logos: ['carousel', 'aspect-ratio', 'separator'],
  faq: ['accordion', 'collapsible', 'separator'],
  cta: ['button', 'card', 'input-group', 'badge'],
  form: ['form', 'field', 'input', 'label', 'select', 'checkbox', 'button', 'input-otp', 'sonner'],
  table: ['table', 'pagination', 'dropdown-menu', 'checkbox', 'input', 'skeleton', 'empty'],
  gallery: ['carousel', 'aspect-ratio', 'card', 'dialog', 'scroll-area'],
  stats: ['card', 'chart', 'progress', 'badge'],
  footer: ['separator', 'navigation-menu', 'button', 'input-group'],
  content: ['card', 'button', 'separator']
}

let indexCache: { at: number; items: RegistryItem[] } | null = null

export async function loadRegistry(extra: { name: string; url: string }[] = []): Promise<RegistryItem[]> {
  if (indexCache && Date.now() - indexCache.at < 30 * 60_000) return indexCache.items
  const items: RegistryItem[] = []

  try {
    const res = await fetch(SHADCN.indexUrl)
    const raw = (await res.json()) as any[]
    for (const it of raw) {
      const links = it.meta?.links ?? {}
      const docs = links.base?.docs ?? links.radix?.docs ?? links.aria?.docs
      items.push({
        name: it.name,
        type: it.type,
        description: it.description ?? humanize(it.name),
        registry: SHADCN.name,
        docs,
        dependencies: it.dependencies,
        registryDependencies: it.registryDependencies,
        keywords: keywordsFor(it.name, it.description)
      })
    }
  } catch {
    /* offline: fall through with blocks only */
  }

  for (const b of BLOCKS) {
    items.push({
      name: b.name,
      type: 'registry:block',
      description: b.description,
      registry: SHADCN.name,
      docs: `https://ui.shadcn.com/blocks`,
      keywords: keywordsFor(b.name, b.description).concat(b.roles)
    })
  }

  for (const reg of extra) {
    try {
      const res = await fetch(reg.url)
      const raw = (await res.json()) as any
      const list: any[] = Array.isArray(raw) ? raw : (raw.items ?? [])
      for (const it of list) {
        items.push({
          name: it.name,
          type: it.type ?? 'registry:ui',
          description: it.description ?? humanize(it.name),
          registry: reg.name.startsWith('@') ? reg.name : `@${reg.name}`,
          keywords: keywordsFor(it.name, it.description)
        })
      }
    } catch {
      /* ignore bad registry */
    }
  }

  indexCache = { at: Date.now(), items }
  return items
}

function humanize(name: string): string {
  return name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function keywordsFor(name: string, description?: string): string[] {
  return `${name} ${description ?? ''}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Fuzzy-ish scoring: exact > prefix > token overlap > substring. */
export function searchRegistry(items: RegistryItem[], query: string, limit = 8): RegistryItem[] {
  const q = query.toLowerCase().trim()
  const tokens = q.split(/[^a-z0-9]+/).filter(Boolean)
  const scored = items.map((it) => {
    let score = 0
    const name = it.name.toLowerCase()
    if (name === q) score += 100
    if (name.startsWith(q)) score += 40
    if (name.includes(q)) score += 20
    for (const t of tokens) {
      if (name.includes(t)) score += 12
      if (it.keywords.includes(t)) score += 8
      else if (it.keywords.some((k) => k.startsWith(t))) score += 4
    }
    if (it.type === 'registry:block') score += 2
    return { it, score }
  })
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.it)
}

export function addCommand(item: RegistryItem): string {
  const ref = item.registry === '@shadcn' ? item.name : `${item.registry}/${item.name}`
  return `npx shadcn@latest add ${ref}`
}

/**
 * Recommend replacements for a section.
 *
 * Shoogle (11k+ community blocks across every registry) is tried FIRST because
 * a whole pre-built block beats assembling card+badge+button by hand.
 * First-party shadcn fills a small primitive gap only when Shoogle returns
 * nothing useful, or to cover a11y primitives (button/label/dialog) once.
 */
export async function recommendForSection(
  section: PageSection,
  problems: string[],
  extra: { name: string; url: string }[] = [],
  useShoogle = true
): Promise<ComponentRecommendation> {
  const out: ComponentRecommendation['items'] = []
  let shoogleCount = 0
  let shoogleAttempted = false

  if (useShoogle) {
    shoogleAttempted = true
    try {
      for (const it of await shoogleForSection(section.role, section, problems, 6)) {
        out.push({
          name: it.name,
          registry: it.registry,
          type: it.type,
          description: it.description || `${it.registry} community block`,
          addCommand: shoogleAddCommand(it),
          docs: it.homepage,
          source: 'shoogle'
        })
        shoogleCount++
        if (shoogleCount >= 5) break
      }
    } catch {
      /* Shoogle down — shadcn fallback below still runs */
    }
  }

  // When community blocks landed, only add 1–2 first-party primitives (not the
  // whole ROLE_COMPONENTS dump). When Shoogle missed, fill more from shadcn.
  const shadcnSlots = shoogleCount > 0 ? Math.min(2, 6 - out.length) : Math.min(5, 6 - out.length)
  const fallback = await recommendFromShadcn(section, extra, shadcnSlots, shoogleCount > 0)
  out.push(...fallback)

  const communityNote =
    shoogleCount > 0
      ? 'Community registry blocks below are drop-in section replacements; first-party shadcn items are primitives only. '
      : shoogleAttempted
        ? 'Shoogle returned no community blocks for this section — falling back to first-party shadcn primitives. '
        : ''

  const reason =
    problems.length > 0
      ? `This ${section.role} section has: ${problems.slice(0, 3).join('; ')}. ${communityNote}Prefer a matching block over hand-rolling markup.`
      : `${communityNote}Standardise this ${section.role} section on a registry block or primitive so spacing, radius, focus rings and tokens stay coherent.`

  return {
    sectionId: section.id,
    sectionRole: section.role,
    reason: reason.trim(),
    source: shoogleCount > 0 && fallback.length > 0 ? 'mixed' : shoogleCount > 0 ? 'shoogle' : 'shadcn',
    items: out.slice(0, 8)
  }
}

async function recommendFromShadcn(
  section: PageSection,
  extra: { name: string; url: string }[],
  limit: number,
  primitivesOnly = false
): Promise<ComponentRecommendation['items']> {
  if (limit <= 0) return []
  const items = await loadRegistry(extra)
  const byName = new Map(items.map((i) => [`${i.registry}/${i.name}`, i]))

  const picks: RegistryItem[] = []
  const push = (it?: RegistryItem): void => {
    if (it && !picks.some((p) => p.name === it.name && p.registry === it.registry)) picks.push(it)
  }

  const roleList = primitivesOnly
    ? (ROLE_COMPONENTS[section.role] ?? []).filter((n) =>
        /^(button|label|input|checkbox|dialog|sheet|dropdown-menu|navigation-menu|form|field|select)$/.test(n)
      )
    : (ROLE_COMPONENTS[section.role] ?? [])

  for (const n of roleList) push(byName.get(`@shadcn/${n}`))

  if (!primitivesOnly) {
    const textQuery = [section.label, ...section.headings.slice(0, 2), ...section.ctaLabels.slice(0, 2)].join(' ')
    for (const it of searchRegistry(items, textQuery, 4)) push(it)
    for (const b of BLOCKS.filter((b) => b.roles.includes(section.role))) push(byName.get(`@shadcn/${b.name}`))
  }

  return picks.slice(0, limit).map((it) => ({
    name: it.name,
    registry: it.registry,
    type: it.type,
    description: it.description ?? '',
    addCommand: addCommand(it),
    docs: it.docs,
    source: 'shadcn' as const
  }))
}

export async function registryStatus(
  extra: { name: string; url: string }[] = []
): Promise<{ ok: boolean; detail: string; registries: string[] }> {
  try {
    const items = await loadRegistry(extra)
    const registries = [...new Set(items.map((i) => i.registry))]
    return { ok: items.length > 0, detail: `${items.length} items indexed`, registries }
  } catch (e) {
    return { ok: false, detail: (e as Error).message, registries: [] }
  }
}
