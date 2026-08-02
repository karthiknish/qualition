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
 * than delete it, so React does not remount mid-audit. A MutationObserver
 * re-hides nodes that remount after the first pass.
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
 * Self-contained browser source for page.evaluate / addInitScript.
 * Keep extract.ts and interaction.ts in sync by calling installDevChromeGuard
 * before DOM walks — they also fall back to an identical inline check.
 */
export const IS_DEV_CHROME_BROWSER_SOURCE = `function isDevChrome(el) {
  var cur = el;
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
    ) return true;
    var id = (cur.id || '').toLowerCase();
    if (id.indexOf('agentation') !== -1 || id === 'react-scan-root' || id === '__stagewise_container') return true;
    var cls = typeof cur.className === 'string' ? cur.className.toLowerCase() : '';
    if (cls.indexOf('agentation') !== -1 || cls.indexOf('falnor-agentation') !== -1) return true;
    if (cur.tagName && cur.tagName.toLowerCase() === 'nextjs-portal') return true;
    cur = cur.parentElement;
  }
  return false;
}`

/**
 * Install window.__qualitionIsDevChrome + a MutationObserver that re-hides
 * remounted Agentation/toolbars, then hide whatever is already present.
 */
export async function installDevChromeGuard(page: Page): Promise<number> {
  try {
    await page.addInitScript(
      ({ selector, detectSrc }) => {
        // eslint-disable-next-line no-new-func
        const fn = new Function(`${detectSrc}; return isDevChrome;`)() as (el: Element | null) => boolean
        ;(window as unknown as { __qualitionIsDevChrome: typeof fn }).__qualitionIsDevChrome = fn
        ;(window as unknown as { __qualitionDevChromeSelector: string }).__qualitionDevChromeSelector = selector
      },
      { selector: DEV_CHROME_SELECTORS, detectSrc: IS_DEV_CHROME_BROWSER_SOURCE }
    )
  } catch {
    /* page may already be past init — still hide below */
  }

  return hideDevChrome(page)
}

/** Hide every known debug overlay before screenshots / extraction / probes. */
export async function hideDevChrome(page: Page): Promise<number> {
  try {
    return await page.evaluate(
      ({ selector, detectSrc }) => {
        // Ensure the shared detector exists even when addInitScript was too late.
        const w = window as unknown as {
          __qualitionIsDevChrome?: (el: Element | null) => boolean
          __qualitionDevChromeWatch?: MutationObserver
        }
        if (!w.__qualitionIsDevChrome) {
          // eslint-disable-next-line no-new-func
          w.__qualitionIsDevChrome = new Function(`${detectSrc}; return isDevChrome;`)() as (
            el: Element | null
          ) => boolean
        }

        const hide = (): number => {
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
          return n
        }

        const first = hide()
        if (!w.__qualitionDevChromeWatch && typeof MutationObserver !== 'undefined') {
          let scheduled = false
          w.__qualitionDevChromeWatch = new MutationObserver(() => {
            if (scheduled) return
            scheduled = true
            requestAnimationFrame(() => {
              scheduled = false
              hide()
            })
          })
          w.__qualitionDevChromeWatch.observe(document.documentElement, {
            childList: true,
            subtree: true
          })
        }
        return first
      },
      { selector: DEV_CHROME_SELECTORS, detectSrc: IS_DEV_CHROME_BROWSER_SOURCE }
    )
  } catch {
    return 0
  }
}
