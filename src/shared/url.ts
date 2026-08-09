/**
 * Target URL handling, shared by the renderer (validation) and main (crawling).
 *
 * The first thing anyone audits is their own dev server, so `localhost:5173`,
 * `127.0.0.1:3000`, `[::1]:8080` and bare hostnames must all be first-class —
 * a "must contain a dot" rule silently locks out the primary use case.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]', 'host.docker.internal'])

export function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (LOCAL_HOSTS.has(h)) return true
  if (h.endsWith('.local') || h.endsWith('.localhost')) return true
  if (/^192\.168\./.test(h)) return true
  if (/^10\./.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true
  if (/^169\.254\./.test(h)) return true
  if (h === '::ffff:127.0.0.1' || h.startsWith('::ffff:10.') || h.startsWith('::ffff:192.168.')) return true
  if (h.startsWith('fd') || h.startsWith('fc')) return true
  if (h === 'metadata.google.internal' || h.endsWith('.internal')) return true
  return false
}

/** Returns true for SSRF-sensitive metadata endpoints that should never be crawled. */
export function isMetadataHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return h === '169.254.169.254' || h === 'metadata.google.internal' || h === 'instance-data' || /^169\.254\./.test(h)
}

/**
 * Accepts what a human types and returns a URL, or null when it cannot be one.
 * Adds a scheme when missing — http for local hosts, https for everything else.
 */
export function normalizeTargetUrl(input: string): string | null {
  const raw = input.trim()
  if (!raw || raw === 'https://' || raw === 'http://') return null

  let candidate = raw
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    const hostPart = candidate.split(/[/?#]/)[0]
    const host = hostPart.split(':')[0]
    candidate = `${isLocalHost(host) ? 'http' : 'https'}://${candidate}`
  }

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!url.hostname) return null

  // A hostname is valid if it is local, an IP, or a dotted/registered name.
  const host = url.hostname.toLowerCase()
  const looksRoutable =
    isLocalHost(host) ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.startsWith('[') ||
    host.includes('.') ||
    // single-label intranet hostnames (e.g. "staging") are legitimate too
    /^[a-z0-9][a-z0-9-]*$/.test(host)
  return looksRoutable ? url.toString() : null
}

export function isValidTarget(input: string): boolean {
  return normalizeTargetUrl(input) !== null
}

/**
 * Dev servers are usually http even when someone types https. Given a URL that
 * failed to load, return the scheme-flipped alternative worth retrying once.
 */
export function schemeFallback(url: string): string | null {
  try {
    const u = new URL(url)
    if (!isLocalHost(u.hostname)) return null
    u.protocol = u.protocol === 'https:' ? 'http:' : 'https:'
    return u.toString()
  } catch {
    return null
  }
}

/** Split a New Run ignore field into patterns (comma or newline separated). */
export function parseIgnorePages(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * True when `url` should be skipped during crawl/audit.
 * Patterns are path prefixes (`/settings`, `/admin`), wildcards (`/docs/*`),
 * or full URL prefixes (`http://localhost:5173/legacy`).
 */
export function isIgnoredPage(url: string, patterns: string[] | undefined | null): boolean {
  if (!patterns?.length) return false
  let path: string
  let hrefNoHash: string
  try {
    const u = new URL(decodeURIComponent(url))
    path = decodeURIComponent(u.pathname).replace(/\/+$/, '') || '/'
    hrefNoHash = `${u.origin}${path}${u.search}`
  } catch {
    try {
      path = decodeURIComponent(url)
    } catch {
      path = url
    }
    hrefNoHash = path
  }

  for (const raw of patterns) {
    const p = raw.trim()
    if (!p) continue

    if (/^https?:\/\//i.test(p)) {
      try {
        const want = new URL(p)
        const wantPath = want.pathname.replace(/\/+$/, '') || '/'
        const wantBase = `${want.origin}${wantPath}`
        if (hrefNoHash === wantBase || hrefNoHash.startsWith(wantBase + '/') || hrefNoHash.startsWith(wantBase + '?')) {
          return true
        }
      } catch {
        if (hrefNoHash.startsWith(p.replace(/\/$/, ''))) return true
      }
      continue
    }

    let pat = p.startsWith('/') ? p : `/${p}`
    pat = pat.replace(/\/+$/, '') || '/'

    if (pat.includes('*')) {
      const re = new RegExp(`^${pat.split('*').map(escapeRegex).join('.*')}(?:/)?(?:\\?.*)?$`, 'i')
      if (re.test(path) || re.test(`${path}/`)) return true
      continue
    }

    if (path === pat || path.startsWith(`${pat}/`)) return true
  }
  return false
}
