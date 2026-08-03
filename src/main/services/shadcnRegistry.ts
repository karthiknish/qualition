/**
 * shadcn registry search + section-level component recommendations.
 *
 * Prefers unique primitives Mobbin references show that the page is missing —
 * not whole dashboard / app-shell blocks. Shoogle community registries are
 * searched with those gap queries; first-party shadcn fills the rest.
 *
 * Talks to the public registry over HTTP (no npx spawn):
 *   - component index: https://ui.shadcn.com/r/index.json
 *   - item payload:    https://ui.shadcn.com/r/styles/new-york/<name>.json
 * Extra registries (registry.json / index.json shaped) can be added in Settings.
 */
import { shoogleForSection, shoogleAddCommand } from './shoogle.js'
import { filterRegistryRecommendations, isAllowedRegistryRecommendation } from './registryPolicy.js'
import { gapsFromMobbin, isFullPageShell, pickUniqueComponents, componentFamily } from './componentGaps.js'
import type { ComponentRecommendation, MobbinReference, PageSection, SectionRole } from '../../shared/types.js'

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
 * Small composable blocks only. Full-page shells (dashboard-01, products-01,
 * sidebar-*) are deliberately omitted — Mobbin gaps drive unique components.
 */
const BLOCKS: { name: string; description: string; roles: SectionRole[] }[] = [
  { name: 'calendar-11', description: 'Range calendar with presets', roles: ['content', 'form'] }
]

/** Which primitives a given section role is normally built from. */
const ROLE_COMPONENTS: Record<SectionRole, string[]> = {
  nav: ['navigation-menu', 'breadcrumb', 'sheet'],
  hero: ['badge', 'input-group'],
  features: ['hover-card', 'item'],
  pricing: ['toggle-group', 'tooltip'],
  testimonials: ['carousel', 'avatar'],
  logos: ['carousel'],
  faq: ['accordion', 'collapsible'],
  cta: ['input-group', 'badge'],
  form: ['field', 'input-otp', 'sonner'],
  table: ['pagination', 'empty', 'skeleton'],
  gallery: ['carousel', 'dialog'],
  stats: ['chart', 'progress'],
  footer: ['navigation-menu'],
  content: ['empty', 'command', 'tabs', 'sheet', 'sonner']
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
    if (it.type === 'registry:block') score -= 4
    if (it.type === 'registry:ui') score += 6
    if (isFullPageShell(it.name, it.type, it.description)) score -= 80
    return { it, score }
  })
  return scored
    .filter((s) => s.score > 0 && !isFullPageShell(s.it.name, s.it.type, s.it.description))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.it)
}

export function addCommand(item: RegistryItem): string {
  const ref = item.registry === '@shadcn' ? item.name : `${item.registry}/${item.name}`
  return `npx shadcn@latest add ${ref}`
}

/**
 * Recommend unique components this section is missing vs Mobbin references.
 *
 * Full-page dashboard / app-shell blocks are filtered out. Shoogle is searched
 * with Mobbin-derived gap queries first; first-party shadcn fills primitives.
 */
export async function recommendForSection(
  section: PageSection,
  problems: string[],
  extra: { name: string; url: string }[] = [],
  useShoogle = true,
  mobbinRefs: MobbinReference[] = [],
  pageUrl?: string
): Promise<ComponentRecommendation> {
  const out: ComponentRecommendation['items'] = []
  let shoogleCount = 0
  let shoogleAttempted = false

  const gaps = gapsFromMobbin(mobbinRefs, section)
  const gapQueries = gaps.map((g) => g.query)
  const gapFamilies = new Set(
    gaps.flatMap((g) => [...(g.shadcn ?? []).map(componentFamily), componentFamily(g.query.replace(/\s+/g, '-'))])
  )

  if (useShoogle) {
    shoogleAttempted = true
    try {
      const raw = await shoogleForSection(section.role, section, problems, 10, gapQueries)
      const unique = pickUniqueComponents(raw, { section, gapFamilies, limit: 6 })
        .filter(isAllowedRegistryRecommendation)
        .slice(0, 3)
      for (const it of unique) {
        out.push({
          name: it.name,
          registry: it.registry,
          type: it.type,
          description: it.description || `${it.registry} component`,
          addCommand: shoogleAddCommand(it),
          docs: it.homepage,
          source: 'shoogle'
        })
        shoogleCount++
      }
    } catch {
      /* Shoogle down — shadcn fallback below still runs */
    }
  }

  // Only fill remaining slots from first-party when we have real Mobbin gaps
  // or Shoogle returned nothing — never pad with button/input/form noise.
  const shadcnSlots = Math.max(0, 3 - out.length)
  if (shadcnSlots > 0 && (gaps.length > 0 || shoogleCount === 0)) {
    const fallback = await recommendFromShadcn(section, extra, shadcnSlots, gaps)
    const more = pickUniqueComponents(fallback, {
      section,
      gapFamilies,
      limit: shadcnSlots + 2,
      allowBasic: false
    }).filter(isAllowedRegistryRecommendation)
    // Skip families already chosen from Shoogle.
    const taken = new Set(out.map((i) => componentFamily(i.name)))
    for (const it of more) {
      if (taken.has(componentFamily(it.name))) continue
      out.push(it)
      taken.add(componentFamily(it.name))
      if (out.length >= 3) break
    }
  }

  const filtered = filterRegistryRecommendations(out).slice(0, 3)
  const filteredShoogle = filtered.filter((i) => i.source === 'shoogle').length

  const gapNote =
    gaps.length > 0
      ? `Mobbin references use ${gaps
          .slice(0, 4)
          .map((g) => g.id)
          .join(', ')} — missing here. `
      : mobbinRefs.length > 0
        ? 'Mobbin references for this section did not expose clear missing primitives; suggesting role-matched components. '
        : ''

  const communityNote =
    filteredShoogle > 0
      ? 'One best match per component family (not multiple registries of the same widget). '
      : shoogleAttempted
        ? 'Shoogle returned no unique component hits — falling back to first-party shadcn for gaps only. '
        : ''

  const reason =
    problems.length > 0
      ? `This ${section.role} section has: ${problems.slice(0, 3).join('; ')}. ${gapNote}${communityNote}Add the missing primitives rather than swapping the whole layout.`
      : `${gapNote}${communityNote}Standardise missing ${section.role} widgets on registry primitives so spacing, focus rings and tokens stay coherent.`

  return {
    sectionId: section.id,
    pageUrl,
    sectionRole: section.role,
    reason: reason.trim(),
    source:
      filteredShoogle > 0 && filtered.some((i) => i.source === 'shadcn')
        ? 'mixed'
        : filteredShoogle > 0
          ? 'shoogle'
          : 'shadcn',
    items: filtered
  }
}

export type RecommendReason =
  | 'repeated-role'
  | 'many-findings'
  | 'low-confidence'
  | 'empty-slab'
  | 'generic-content'

/**
 * Only search Shoogle/shadcn for sections that look immature or are stamped
 * out repeatedly. Mature, unique, low-finding sections stay out of the
 * recommendation noise.
 */
export function shouldRecommendReplacement(
  section: PageSection,
  opts: {
    problems: string[]
    roleCountOnPage: number
    severityBoost?: number
  }
): { yes: boolean; reasons: RecommendReason[] } {
  const reasons: RecommendReason[] = []
  const roleCount = opts.roleCountOnPage
  const problems = opts.problems
  const severityBoost = opts.severityBoost ?? 0
  const textLen = (section.textPreview ?? '').trim().length
  const emptySlab = section.rect.height >= 220 && textLen < 40 && section.ctaLabels.length === 0

  // Mature & unique with no defects — do not bother Shoogle.
  if (roleCount <= 2 && section.roleConfidence >= 0.7 && problems.length === 0 && !emptySlab) {
    return { yes: false, reasons: [] }
  }

  // Repeated content blobs or any role with 5+ clones → high leverage to replace once.
  if (roleCount >= 5 || (roleCount >= 4 && section.role === 'content')) {
    reasons.push('repeated-role')
  }
  if (problems.length >= 2 || (problems.length >= 1 && severityBoost >= 2)) {
    reasons.push('many-findings')
  }
  if (section.roleConfidence > 0 && section.roleConfidence < 0.55) {
    reasons.push('low-confidence')
  }
  if (emptySlab) reasons.push('empty-slab')
  if (
    section.role === 'content' &&
    (problems.length >= 1 || section.stats.interactiveCount >= 8) &&
    section.headings.length === 0
  ) {
    reasons.push('generic-content')
  }

  return { yes: reasons.length > 0, reasons }
}

/** Pick at most `limit` sections across a page that deserve registry search. */
export function pickSectionsForRecommendations(
  pageUrl: string,
  sections: PageSection[],
  findings: { sectionId?: string; pageUrl: string; severity: string; title: string }[],
  limit = 8
): { section: PageSection; problems: string[]; reasons: RecommendReason[] }[] {
  const roleCounts = new Map<string, number>()
  for (const s of sections) roleCounts.set(s.role, (roleCounts.get(s.role) ?? 0) + 1)

  const severityWeight = (sev: string): number =>
    sev === 'blocker' || sev === 'critical' ? 3 : sev === 'major' ? 2 : sev === 'minor' ? 1 : 0

  const scored: {
    section: PageSection
    problems: string[]
    reasons: RecommendReason[]
    score: number
  }[] = []

  // One recommendation per repeated role (worst instance), not every clone.
  const seenRoles = new Set<string>()

  for (const s of sections) {
    const problems = findings
      .filter((f) => f.sectionId === s.id && f.pageUrl === pageUrl)
      .map((f) => f.title)
    const boost = findings
      .filter((f) => f.sectionId === s.id && f.pageUrl === pageUrl)
      .reduce((n, f) => n + severityWeight(f.severity), 0)
    const roleCount = roleCounts.get(s.role) ?? 1
    const gate = shouldRecommendReplacement(s, { problems, roleCountOnPage: roleCount, severityBoost: boost })
    if (!gate.yes) continue

    if (gate.reasons.includes('repeated-role')) {
      if (seenRoles.has(s.role)) continue
      seenRoles.add(s.role)
    }

    const score =
      boost * 10 +
      problems.length * 3 +
      (gate.reasons.includes('repeated-role') ? 20 : 0) +
      (gate.reasons.includes('empty-slab') ? 15 : 0) +
      (gate.reasons.includes('low-confidence') ? 8 : 0) +
      (1 - (s.roleConfidence || 0)) * 5

    scored.push({ section: s, problems, reasons: gate.reasons, score })
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ section, problems, reasons }) => ({ section, problems, reasons }))
}

async function recommendFromShadcn(
  section: PageSection,
  extra: { name: string; url: string }[],
  limit: number,
  gaps: { id: string; query: string; shadcn: string[] }[] = []
): Promise<ComponentRecommendation['items']> {
  if (limit <= 0) return []
  const items = await loadRegistry(extra)
  const byName = new Map(items.map((i) => [`${i.registry}/${i.name}`, i]))

  const picks: RegistryItem[] = []
  const push = (it?: RegistryItem): void => {
    if (!it || isFullPageShell(it.name, it.type, it.description)) return
    if (!picks.some((p) => p.name === it.name && p.registry === it.registry)) picks.push(it)
  }

  // Mobbin gaps first — the missing unique primitives only.
  for (const g of gaps) {
    for (const n of g.shadcn) push(byName.get(`@shadcn/${n}`))
    for (const it of searchRegistry(items, g.query, 2)) push(it)
  }

  // Role hints only when we still have slots — skip basics like button/input.
  if (picks.length < limit) {
    for (const n of ROLE_COMPONENTS[section.role] ?? []) {
      push(byName.get(`@shadcn/${n}`))
    }
  }

  for (const b of BLOCKS.filter((b) => b.roles.includes(section.role))) push(byName.get(`@shadcn/${b.name}`))

  const gapFamilies = new Set(gaps.flatMap((g) => (g.shadcn ?? []).map(componentFamily)))
  return pickUniqueComponents(
    picks.map((it) => ({
      name: it.name,
      registry: it.registry,
      type: it.type,
      description: it.description ?? '',
      addCommand: addCommand(it),
      docs: it.docs,
      source: 'shadcn' as const
    })),
    { section, gapFamilies, limit }
  )
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
