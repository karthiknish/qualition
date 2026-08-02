/**
 * Dev-only chrome that must not pollute audits.
 *
 * Tools like Agentation (https://agentation.com) inject a fixed toolbar,
 * annotation markers and popups into the page under test. Left alone they
 * show up as sections, overlapping controls, unnamed buttons, z-index
 * sprawl and "bottom bar obscures nav" findings — none of which belong to
 * the product.
 *
 * Detection mirrors Agentation's own EXCLUDE_ATTRS, plus a few other common
 * layout/debug overlays. We hide the chrome (display:none + inert) rather
 * than delete it, so React does not remount mid-audit.
 */
import type { Page } from 'playwright'

/** Attribute markers Agentation stamps on its own roots. */
export const DEV_CHROME_ATTRS = [
  'data-feedback-toolbar',
  'data-annotation-popup',
  'data-annotation-marker'
] as const

/**
 * CSS selectors for known debug overlays. Keep this list product-agnostic —
 * host apps may also pass a custom class (e.g. `.falnor-agentation`).
 */
export const DEV_CHROME_SELECTORS = [
  ...DEV_CHROME_ATTRS.map((a) => `[${a}]`),
  '[class*="agentation" i]',
  '[id*="agentation" i]',
  '#agentation-root',
  '#vercel-live-feedback',
  '[data-vercel-toolbar]',
  '[data-nextjs-toast]',
  '[data-nextjs-dialog]',
  '[data-nextjs-dialog-overlay]',
  'nextjs-portal',
  '#react-scan-root',
  '[data-react-scan]',
  '[data-stagewise]',
  '#__stagewise_container'
].join(',')

/**
 * Browser-side: is this node (or an ancestor) debug chrome?
 * Inlined into page.evaluate payloads — keep self-contained.
 */
export function isDevChromeElement(el: Element | null): boolean {
  let cur: Element | null = el
  while (cur && cur !== document.documentElement) {
    if (
      cur.hasAttribute('data-feedback-toolbar') ||
      cur.hasAttribute('data-annotation-popup') ||
      cur.hasAttribute('data-annotation-marker') ||
      cur.hasAttribute('data-vercel-toolbar') ||
      cur.hasAttribute('data-nextjs-toast') ||
      cur.hasAttribute('data-nextjs-dialog') ||
      cur.hasAttribute('data-nextjs-dialog-overlay') ||
      cur.hasAttribute('data-react-scan') ||
      cur.hasAttribute('data-stagewise') ||
      cur.hasAttribute('data-q-dev-chrome')
    ) {
      return true
    }
    const id = (cur.id || '').toLowerCase()
    if (id.includes('agentation') || id === 'react-scan-root' || id === '__stagewise_container') return true
    const cls = typeof (cur as HTMLElement).className === 'string' ? (cur as HTMLElement).className.toLowerCase() : ''
    if (cls.includes('agentation') || cls.includes('falnor-agentation')) return true
    const tag = cur.tagName.toLowerCase()
    if (tag === 'nextjs-portal') return true
    cur = cur.parentElement
  }
  return false
}

/** Hide every known debug overlay before screenshots / extraction / probes. */
export async function hideDevChrome(page: Page): Promise<number> {
  try {
    return await page.evaluate((selector) => {
      let n = 0
      for (const el of Array.from(document.querySelectorAll(selector))) {
        const h = el as HTMLElement
        if (h.dataset.qDevChromeHidden === '1') continue
        h.dataset.qDevChrome = '1'
        h.dataset.qDevChromeHidden = '1'
        if (!h.dataset.qDevChromePrevDisplay) h.dataset.qDevChromePrevDisplay = h.style.display || ''
        h.style.setProperty('display', 'none', 'important')
        h.style.setProperty('pointer-events', 'none', 'important')
        h.setAttribute('aria-hidden', 'true')
        if ('inert' in h) (h as HTMLElement & { inert: boolean }).inert = true
        n++
      }
      // Agentation also sets CSS variables on :root — harmless to leave.
      return n
    }, DEV_CHROME_SELECTORS)
  } catch {
    return 0
  }
}
