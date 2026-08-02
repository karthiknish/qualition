/**
 * First-party vs framework/vendor CSS attribution.
 *
 * Authored-CSS metrics are only useful when they describe what the product team
 * maintains. Tailwind, CDNs and node_modules otherwise inflate uniqueness,
 * bytes and token counts until the brief reads like a false indictment.
 */
export type CssSheetScope = 'app' | 'framework' | 'vendor'

export interface CssSheetInput {
  href: string | null
  text: string
}

export interface ClassifiedCssSheet extends CssSheetInput {
  scope: CssSheetScope
  reason: string
}

const CDN_HOST =
  /(unpkg\.com|jsdelivr\.net|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|bootstrapcdn\.com|cdn\.tailwindcss\.com|use\.typekit\.net|fastly\.jsdelivr\.net)/i

const FRAMEWORK_PATH =
  /(node_modules|\/@fs\/|\/\.vite\/|tailwind|bootstrap|bulma|normalize|preflight|reset\.css|antd|mui|chakra|mantine|radix-ui|emotion|styled-components)/i

const FRAMEWORK_TOKEN =
  /^(tw|chakra|mantine|radix|mui|antd|emotion|css|sc|styled|joao|phosphor|fa|lucide)-/i

/** Custom props that are framework plumbing, not a product token system. */
export function isFrameworkTokenName(name: string): boolean {
  const n = name.replace(/^--/, '')
  if (FRAMEWORK_TOKEN.test(n)) return true
  // Tailwind arbitrary / internal: --tw-shadow, --tw-ring-offset-shadow
  if (/^tw[_-]/i.test(n)) return true
  // Emotion/styled hashed vars: --1a2b3c4 or short opaque ids
  if (/^[a-f0-9]{6,}$/i.test(n)) return true
  if (/^[a-z]{1,2}[a-z0-9]{5,8}$/i.test(n) && !/(color|space|size|radius|font|shadow|z|gap|pad|bg|fg|text|border)/i.test(n)) {
    return true
  }
  return false
}

function contentLooksFramework(text: string): boolean {
  if (!text || text.length < 40) return false
  const sample = text.slice(0, 80_000)
  if (/@tailwind\s+(base|components|utilities)/i.test(sample)) return true
  if (/\/\*!?\s*tailwindcss/i.test(sample)) return true
  if (/\/\*!?\s*normalize\.css/i.test(sample)) return true
  if (/\/\*!?\s*Bootstrap\s+v?\d/i.test(sample)) return true
  // Dense --tw-* custom props
  const tw = sample.match(/--tw-[a-z0-9-]+/gi)
  if (tw && tw.length >= 12) return true
  return false
}

export function classifyCssSheet(sheet: CssSheetInput, pageUrl?: string): ClassifiedCssSheet {
  const href = sheet.href
  let pageOrigin = ''
  try {
    pageOrigin = pageUrl ? new URL(pageUrl).origin : ''
  } catch {
    pageOrigin = ''
  }

  if (href) {
    try {
      const u = new URL(href, pageUrl || undefined)
      if (CDN_HOST.test(u.hostname) || CDN_HOST.test(href)) {
        return { ...sheet, scope: 'vendor', reason: `cdn:${u.hostname}` }
      }
      if (FRAMEWORK_PATH.test(u.pathname) || FRAMEWORK_PATH.test(href)) {
        return { ...sheet, scope: 'framework', reason: 'path' }
      }
      if (pageOrigin && u.origin !== pageOrigin && u.protocol.startsWith('http')) {
        // Third-party stylesheet on another origin — vendor unless content says framework.
        if (contentLooksFramework(sheet.text)) {
          return { ...sheet, scope: 'framework', reason: 'cross-origin-content' }
        }
        return { ...sheet, scope: 'vendor', reason: `origin:${u.origin}` }
      }
    } catch {
      if (CDN_HOST.test(href) || FRAMEWORK_PATH.test(href)) {
        return {
          ...sheet,
          scope: CDN_HOST.test(href) ? 'vendor' : 'framework',
          reason: 'href-heuristic'
        }
      }
    }
  }

  if (contentLooksFramework(sheet.text)) {
    return { ...sheet, scope: 'framework', reason: 'content' }
  }

  return { ...sheet, scope: 'app', reason: href ? 'same-origin' : 'inline' }
}

export interface CssPartition {
  app: string
  framework: string
  vendor: string
  /** CSS used for Wallace metrics: app when non-trivial, else all (with scoped=false). */
  analysis: string
  scoped: boolean
  sheets: ClassifiedCssSheet[]
  bytes: { app: number; framework: number; vendor: number; total: number }
  sheetCounts: { app: number; framework: number; vendor: number; total: number }
}

export function partitionCssSheets(sheets: CssSheetInput[], pageUrl?: string): CssPartition {
  const classified = sheets.map((s) => classifyCssSheet(s, pageUrl))
  const join = (scope: CssSheetScope): string =>
    classified
      .filter((s) => s.scope === scope)
      .map((s) => s.text)
      .filter(Boolean)
      .join('\n')

  const app = join('app')
  const framework = join('framework')
  const vendor = join('vendor')
  const total = [app, framework, vendor].join('\n')
  const bytes = {
    app: app.length,
    framework: framework.length,
    vendor: vendor.length,
    total: total.length
  }
  const sheetCounts = {
    app: classified.filter((s) => s.scope === 'app').length,
    framework: classified.filter((s) => s.scope === 'framework').length,
    vendor: classified.filter((s) => s.scope === 'vendor').length,
    total: classified.length
  }

  // Prefer first-party CSS for design-system metrics. Fall back to everything
  // when the app sheet is empty (SSR shell, CSS-in-JS-only, etc.).
  const scoped = app.length >= 80
  const analysis = scoped ? app : total

  return { app, framework, vendor, analysis, scoped, sheets: classified, bytes, sheetCounts }
}
