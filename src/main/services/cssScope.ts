/**
 * First-party vs framework/vendor CSS attribution.
 *
 * Authored-CSS metrics are only useful when they describe what the product team
 * maintains. Tailwind, CDNs and node_modules otherwise inflate uniqueness,
 * bytes and token counts until the brief reads like a false indictment.
 *
 * Vite-dev nuance: CSS imports become `<style data-vite-dev-id="…">` with
 * `sheet.href === null`. Without the vite id / content heuristics, sonner,
 * xyflow and Agentation all count as first-party (z-index 999999999 etc.).
 */
export type CssSheetScope = 'app' | 'framework' | 'vendor'

export interface CssSheetInput {
  /** Link href, Vite `data-vite-dev-id` filesystem path, or `style:#id`. */
  href: string | null
  text: string
}

export interface ClassifiedCssSheet extends CssSheetInput {
  scope: CssSheetScope
  reason: string
}

const CDN_HOST =
  /(unpkg\.com|jsdelivr\.net|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|bootstrapcdn\.com|cdn\.tailwindcss\.com|use\.typekit\.net|fastly\.jsdelivr\.net)/i

/** Package path — third-party CSS the product did not author. */
const NODE_MODULES_PATH = /(node_modules|\/@fs\/|\/\.vite\/deps)/i

/** Design-system / reset packages that belong in the "framework" bucket. */
const FRAMEWORK_PACKAGE =
  /(?:^|\/)(tailwindcss|@tailwindcss|bootstrap|bulma|normalize\.css|antd|@?mui\b|@chakra|@mantine|@radix-ui|styled-components|@emotion)(?:\/|$)/i

const FRAMEWORK_PATH_HINT =
  /(tailwind|bootstrap|bulma|normalize|preflight|reset\.css|antd|mui|chakra|mantine|radix-ui|emotion|styled-components)/i

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
  if (
    /^[a-z]{1,2}[a-z0-9]{5,8}$/i.test(n) &&
    !/(color|space|size|radius|font|shadow|z|gap|pad|bg|fg|text|border)/i.test(n)
  ) {
    return true
  }
  return false
}

/** Authored entry under /src or /app — keep as app even when Tailwind is compiled in. */
export function isFirstPartySourcePath(href: string): boolean {
  if (!href) return false
  if (NODE_MODULES_PATH.test(href)) return false
  // Absolute Vite ids: /Users/…/project/src/styles/app.css
  if (/[/\\]src[/\\]/i.test(href) || /[/\\]app[/\\]styles?[/\\]/i.test(href)) return true
  // URL path: http://localhost/src/styles/app.css
  try {
    const path = href.includes('://') ? new URL(href).pathname : href
    if (/^\/src\//i.test(path) || /^\/app\//i.test(path)) return true
  } catch {
    /* ignore */
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

/**
 * Injected component/library CSS with no useful href (Sonner runtime inject,
 * Agentation toolbar, etc.).
 */
export function contentLooksVendor(text: string): boolean {
  if (!text || text.length < 20) return false
  const sample = text.slice(0, 40_000)
  if (/\[data-sonner-toaster\]|\[data-sonner-toast\]/i.test(sample)) return true
  if (/feedback-tool-styles|data-feedback-toolbar/i.test(sample)) return true
  // Agentation CSS modules — controlButton + toolbar/markers co-occur.
  if (
    /styles-module__(?:toolbar|markersLayer|overlay|controlButton)/i.test(sample) &&
    /styles-module__/i.test(sample)
  ) {
    return true
  }
  // React Flow / xyflow default theme (also matched via node_modules path).
  if (/\.react-flow__|\[data-testid=["']rf__/i.test(sample) && sample.length > 2_000) return true
  return false
}

function classifyByPath(href: string): { scope: CssSheetScope; reason: string } | null {
  if (CDN_HOST.test(href)) {
    return { scope: 'vendor', reason: 'cdn' }
  }
  if (/^style:#feedback-tool/i.test(href) || /agentation/i.test(href)) {
    return { scope: 'vendor', reason: 'dev-chrome-style' }
  }
  if (NODE_MODULES_PATH.test(href)) {
    if (FRAMEWORK_PACKAGE.test(href) || FRAMEWORK_PATH_HINT.test(href)) {
      return { scope: 'framework', reason: 'node_modules-framework' }
    }
    return { scope: 'vendor', reason: 'node_modules' }
  }
  if (FRAMEWORK_PACKAGE.test(href) || (FRAMEWORK_PATH_HINT.test(href) && !isFirstPartySourcePath(href))) {
    return { scope: 'framework', reason: 'path-framework' }
  }
  return null
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
    const byPath = classifyByPath(href)
    if (byPath) return { ...sheet, ...byPath }

    try {
      const u = new URL(href, pageUrl || undefined)
      const pathHit = classifyByPath(u.href) || classifyByPath(u.pathname)
      if (pathHit) return { ...sheet, ...pathHit }

      if (pageOrigin && u.origin !== pageOrigin && u.protocol.startsWith('http')) {
        if (contentLooksFramework(sheet.text)) {
          return { ...sheet, scope: 'framework', reason: 'cross-origin-content' }
        }
        return { ...sheet, scope: 'vendor', reason: `origin:${u.origin}` }
      }
    } catch {
      const loose = classifyByPath(href)
      if (loose) return { ...sheet, ...loose }
    }

    // First-party source path wins over "looks like Tailwind" content — product
    // sheets often compile utilities into /src/styles/*.css.
    if (isFirstPartySourcePath(href)) {
      return { ...sheet, scope: 'app', reason: 'src-path' }
    }
  }

  if (contentLooksVendor(sheet.text)) {
    return { ...sheet, scope: 'vendor', reason: 'content-vendor' }
  }

  // Only treat dense Tailwind as framework when it is not an authored /src sheet.
  if (contentLooksFramework(sheet.text) && !isFirstPartySourcePath(href ?? '')) {
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

  // Prefer first-party CSS for design-system metrics. When the app sheet is
  // thin (CSS-in-JS / Tailwind-heavy), analyze app+framework and drop vendor
  // noise rather than scoring CDN resets / sonner / Agentation as the system.
  const useAppOnly = app.length >= 200
  const appPlusFramework = [app, framework].filter(Boolean).join('\n')
  const scoped = useAppOnly
  const analysis = useAppOnly
    ? app
    : appPlusFramework.length >= 80
      ? appPlusFramework
      : total

  return { app, framework, vendor, analysis, scoped, sheets: classified, bytes, sheetCounts }
}
