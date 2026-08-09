export const PROJECT_ID_RE = /^[a-z0-9-]{3,64}$/i
export const PROJECT_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function originOfUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.origin
  } catch {
    return null
  }
}

export function slugForOrigin(origin: string): string {
  try {
    const u = new URL(origin)
    let slug = `${u.hostname}${u.port ? `-${u.port}` : ''}`
    slug = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (slug.length < 3) slug = `project-${slug}`
    return slug.slice(0, 48) || 'project'
  } catch {
    return 'project'
  }
}

export function slugForProjectId(id: string): string {
  return slugForOrigin(id) // id may be origin
}

export function projectNameForOrigin(origin: string): string {
  try {
    const u = new URL(origin)
    return u.hostname + (u.port ? `:${u.port}` : '')
  } catch {
    return origin.slice(0, 48)
  }
}

export function assertValidProjectId(id: string): void {
  if (!PROJECT_ID_RE.test(id) || id.includes('..') || id.includes('/') || id.includes('\\')) {
    throw new Error(`Invalid project id: ${id}`)
  }
}

export function assertValidProjectSlug(slug: string): void {
  if (!PROJECT_SLUG_RE.test(slug)) throw new Error(`Invalid project slug: ${slug}`)
}
