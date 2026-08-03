/**
 * Registry recommendation policy — dashboard / Operate chrome only.
 *
 * Qualition must not suggest marketing-heavy registries or Recharts-backed
 * shadcn charts. Aligns with product rules like Falnor’s dashboard-registries
 * (Visx for charts; no @cult-ui / @aceternity / @magicui gallery pulls).
 */

/** Community namespaces that ship marketing motion or wrong design systems. */
export const BANNED_REGISTRIES = new Set([
  '@aceternity',
  '@magicui',
  '@shadcnblocks',
  '@mui-treasury',
  '@cult-ui'
])

/** First-party / piece names that pull Recharts or equivalent chart stacks. */
const BANNED_COMPONENT_RE =
  /^(chart|chart-.+|area-chart|bar-chart|line-chart|pie-chart|radial-chart|stats-12)$/i

const BANNED_BLOB_RE = /\brecharts\b|\bshadcn\/chart\b|\b@shadcn\/chart\b/i

export function normalizeRegistry(registry: string): string {
  const r = String(registry || '').trim().toLowerCase()
  if (!r) return '@shadcn'
  return r.startsWith('@') ? r : `@${r}`
}

export function isBannedRegistry(registry: string): boolean {
  return BANNED_REGISTRIES.has(normalizeRegistry(registry))
}

/** True when this install is allowed in remediation / report suggestions. */
export function isAllowedRegistryRecommendation(item: {
  name: string
  registry?: string
  description?: string
  addCommand?: string
  type?: string
}): boolean {
  const registry = normalizeRegistry(item.registry ?? '@shadcn')
  if (isBannedRegistry(registry)) return false

  const name = String(item.name || '').trim()
  const leaf = name.includes('/') ? name.split('/').pop() || name : name
  if (BANNED_COMPONENT_RE.test(leaf) || BANNED_COMPONENT_RE.test(name)) return false

  const blob = `${name} ${item.description ?? ''} ${item.addCommand ?? ''}`
  if (BANNED_BLOB_RE.test(blob)) return false

  return true
}

export function filterRegistryRecommendations<T extends {
  name: string
  registry?: string
  description?: string
  addCommand?: string
  type?: string
}>(items: T[]): T[] {
  return items.filter(isAllowedRegistryRecommendation)
}
