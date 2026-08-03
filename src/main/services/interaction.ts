/**
 * Deep interaction probe.
 *
 * Static analysis and screenshots only see the resting state. This module
 * actually *uses* the interface: it focuses, hovers, keyboards and (safely)
 * clicks every control it can find, then reports the states that are missing
 * or broken:
 *
 *   - dead clicks       — a control that changes nothing when activated
 *   - invisible focus   — keyboard users cannot see where they are
 *   - no hover feedback — an affordance that never acknowledges the pointer
 *   - fake buttons      — div/span click handlers with no role, name or tabstop
 *   - broken disabled   — aria-disabled without pointer-events, or vice versa
 *   - overlay traps     — dialogs that Escape cannot close, or that never trap focus
 *   - silent forms      — required fields that submit with no validation feedback
 *   - tab-order chaos   — positive tabindex, or DOM order fighting visual order
 *
 * Destructive controls (delete/pay/logout/…) are never activated.
 */
import type { Browser, Page } from 'playwright'
import { join } from 'node:path'
import { Deadline, limit, soft } from './deadline.js'
import { hideDevChrome, installDevChromeGuard } from './devChrome.js'
import type { Finding, InteractionReport, Severity, Viewport } from '../../shared/types.js'

export { Deadline } from './deadline.js'

/** Labels we refuse to click, no matter what. */
const DESTRUCTIVE =
  /\b(delete|remove|destroy|cancel subscription|unsubscribe|pay|purchase|buy|checkout|order|confirm|submit order|log ?out|sign ?out|deactivate|close account|archive|reset|revoke|transfer|withdraw|send money)\b/i

/** Controls that navigate away — probed, but the page is restored afterwards. */
const NAVIGATIONAL = /^(a)$/i

let seq = 0
function mk(
  url: string,
  severity: Severity,
  title: string,
  detail: string,
  fix: string,
  extra: Partial<Finding> = {}
): Finding {
  return {
    id: `i${++seq}`,
    category: 'flow',
    severity,
    title,
    detail,
    fix,
    pageUrl: url,
    source: 'heuristic',
    ...extra
  }
}

/** Tag every candidate control and describe it, entirely in-page. */
const collectControls = function (): any {
  const out: any[] = []
  const seen = new Set<Element>()
  const selector =
    'button, a[href], input, select, textarea, summary, [role=button], [role=link], [role=tab], [role=menuitem], [role=switch], [role=checkbox], [role=option], [role=combobox], [onclick], [data-testid*=button i]'

  const isDevChrome = (el: Element | null): boolean => {
    const w = window as unknown as { __qualitionIsDevChrome?: (e: Element | null) => boolean }
    if (typeof w.__qualitionIsDevChrome === 'function') return w.__qualitionIsDevChrome(el)
    let cur: Element | null = el
    while (cur && cur !== document.documentElement) {
      if (
        cur.hasAttribute('data-feedback-toolbar') ||
        cur.hasAttribute('data-annotation-popup') ||
        cur.hasAttribute('data-annotation-marker') ||
        cur.hasAttribute('data-agentation-root') ||
        cur.hasAttribute('data-agentation-toolbar') ||
        cur.hasAttribute('data-agentation-settings-panel') ||
        cur.hasAttribute('data-vercel-toolbar') ||
        cur.hasAttribute('data-nextjs-toast') ||
        cur.hasAttribute('data-nextjs-dialog') ||
        cur.hasAttribute('data-nextjs-dialog-overlay') ||
        cur.hasAttribute('data-react-scan') ||
        cur.hasAttribute('data-stagewise') ||
        cur.hasAttribute('data-q-dev-chrome')
      )
        return true
      const id = (cur.id || '').toLowerCase()
      if (id.includes('agentation') || id === 'react-scan-root' || id === '__stagewise_container') return true
      const cls = typeof (cur as HTMLElement).className === 'string' ? (cur as HTMLElement).className.toLowerCase() : ''
      if (cls.includes('agentation') || cls.includes('falnor-agentation')) return true
      if (cur.tagName.toLowerCase() === 'nextjs-portal') return true
      cur = cur.parentElement
    }
    return false
  }

  const visible = (el: Element): boolean => {
    if (isDevChrome(el)) return false
    // Prefer the browser's checkVisibility (what Playwright uses) when present.
    // See Playwright actionability / Chromium Element.checkVisibility.
    const anyEl = el as HTMLElement & { checkVisibility?: (o?: object) => boolean }
    if (typeof anyEl.checkVisibility === 'function') {
      try {
        if (
          !anyEl.checkVisibility({
            checkOpacity: true,
            checkVisibilityCSS: true,
            contentVisibilityAuto: true
          } as any)
        )
          return false
      } catch {
        /* fall through */
      }
    }
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) <= 0.05) return false
    if (cs.pointerEvents === 'none') return false
    // inert / aria-hidden ancestors are not in the a11y tree and should not be probed.
    let cur: Element | null = el
    while (cur) {
      if ((cur as HTMLElement).inert) return false
      if (cur.getAttribute('aria-hidden') === 'true') return false
      cur = cur.parentElement
    }
    return true
  }

  const accName = (el: Element): string => {
    const aria = el.getAttribute('aria-label')
    if (aria) return aria.trim()
    const labelledby = el.getAttribute('aria-labelledby')
    if (labelledby) {
      const t = labelledby
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ')
        .trim()
      if (t) return t
    }
    if (el instanceof HTMLInputElement) {
      const lbl = el.labels?.[0]?.textContent?.trim()
      if (lbl) return lbl
      if (el.placeholder) return el.placeholder
      if (el.value && el.type === 'submit') return el.value
    }
    // Icon-only buttons often expose name via nested <img alt> / <svg><title>.
    const img = el.querySelector('img[alt]') as HTMLImageElement | null
    if (img?.alt?.trim()) return img.alt.trim()
    const svgTitle = el.querySelector('svg title')?.textContent?.trim()
    if (svgTitle) return svgTitle
    const title = el.getAttribute('title')
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    return text || title || ''
  }

  let idx = 0
  // Kept as elements so the "is this nested inside an already-taken control"
  // test is a cheap parent walk. Doing it with document.querySelector per
  // candidate was quadratic and silently blew the probe's time budget on real
  // apps — which is why big SPAs reported zero controls probed.
  const taken: Element[] = []
  const nestedInTaken = (el: Element): boolean => {
    let cur: Element | null = el.parentElement
    while (cur) {
      if (takenSet.has(cur)) return true
      cur = cur.parentElement
    }
    return false
  }
  const takenSet = new Set<Element>()

  for (const el of Array.from(document.querySelectorAll(selector))) {
    if (seen.has(el) || !visible(el)) continue
    if (nestedInTaken(el)) continue
    seen.add(el)
    taken.push(el)
    takenSet.add(el)
    if (idx >= 60) break

    el.setAttribute('data-q-idx', String(idx))
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const tag = el.tagName.toLowerCase()
    const role = el.getAttribute('role')
    const isNativeInteractive = ['button', 'a', 'input', 'select', 'textarea', 'summary'].includes(tag)

    out.push({
      idx,
      tag,
      role,
      name: accName(el).slice(0, 60),
      href: el.getAttribute('href'),
      type: el.getAttribute('type'),
      disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
      nativeDisabled: el.hasAttribute('disabled'),
      ariaDisabled: el.getAttribute('aria-disabled') === 'true',
      tabIndex: (el as HTMLElement).tabIndex,
      explicitTabIndex: el.getAttribute('tabindex'),
      hasAriaExpanded: el.hasAttribute('aria-expanded'),
      isNativeInteractive,
      cursor: cs.cursor,
      pointerEvents: cs.pointerEvents,
      rect: { x: Math.round(r.x), y: Math.round(r.y + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      inForm: !!el.closest('form'),
      resting: {
        outline: cs.outlineStyle === 'none' ? '' : `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
        boxShadow: cs.boxShadow,
        background: cs.backgroundColor,
        color: cs.color,
        border: cs.borderColor + cs.borderWidth,
        transform: cs.transform,
        textDecoration: cs.textDecorationLine,
        opacity: cs.opacity
      }
    })
    idx++
  }

  const forms = Array.from(document.querySelectorAll('form')).slice(0, 4).map((f, i) => {
    f.setAttribute('data-q-form', String(i))
    const fields = Array.from(f.querySelectorAll('input,select,textarea')) as HTMLInputElement[]
    return {
      idx: i,
      required: fields.filter((x) => x.required || x.getAttribute('aria-required') === 'true').length,
      fields: fields.length,
      hasNovalidate: f.hasAttribute('novalidate'),
      submitLabel: (f.querySelector('[type=submit],button:not([type=button])')?.textContent ?? '').trim().slice(0, 40)
    }
  })

  return {
    controls: out,
    forms,
    positiveTabIndex: document.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])').length,
    autofocusCount: document.querySelectorAll('[autofocus]').length
  }
}

/** Style of one control right now — used to diff resting vs hover vs focus. */
const styleOf = function (): any {
  const el = document.querySelector('[data-q-probe="1"]') as HTMLElement | null
  if (!el) return null
  const cs = getComputedStyle(el)
  return {
    outline: cs.outlineStyle === 'none' ? '' : `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
    boxShadow: cs.boxShadow,
    background: cs.backgroundColor,
    color: cs.color,
    border: cs.borderColor + cs.borderWidth,
    transform: cs.transform,
    textDecoration: cs.textDecorationLine,
    opacity: cs.opacity
  }
}

/**
 * A cheap signature of "did anything happen".
 *
 * It has to notice the quiet successes too, or every theme toggle, tab switch
 * and checkbox gets reported as a dead click: root/body classes (theming),
 * body background (theming without classes), aria-selected/pressed/checked
 * (tabs, toggles), and form control state.
 */
const pageSignature = function (): any {
  const attrs = (sel: string, attr: string): string =>
    Array.from(document.querySelectorAll(sel))
      .map((e) => e.getAttribute(attr))
      .join('')
  const overlayCount = document.querySelectorAll(
    [
      'dialog[open]',
      '[role=dialog]',
      '[role=alertdialog]',
      '[aria-modal=true]',
      '[role=menu]',
      '[role=listbox]',
      '[role=tree]',
      '[data-radix-popper-content-wrapper]',
      '[data-radix-menu-content]',
      '[data-state=open][role=menu]',
      '[data-vaul-drawer]',
      '[data-state=open].sheet',
      '[class*="sheet" i][data-state=open]',
      '[class*="popover" i][data-state=open]',
      '[class*="dropdown" i][data-state=open]'
    ].join(',')
  ).length
  return {
    url: location.href,
    domSize: document.body.innerHTML.length,
    nodeCount: document.querySelectorAll('*').length,
    dialogs: document.querySelectorAll('dialog[open],[role=dialog],[role=alertdialog],[aria-modal=true]').length,
    overlays: overlayCount,
    expanded: attrs('[aria-expanded]', 'aria-expanded'),
    selected: attrs('[aria-selected]', 'aria-selected'),
    pressed: attrs('[aria-pressed]', 'aria-pressed'),
    checkedAria: attrs('[aria-checked]', 'aria-checked'),
    dataState: attrs('[data-state]', 'data-state'),
    dataOpen: attrs('[data-open],details', 'open') + attrs('[open]', 'open'),
    // Theme switches usually only mutate the root class or a data attribute.
    rootClass: document.documentElement.className,
    rootTheme: document.documentElement.getAttribute('data-theme') ?? '',
    colorScheme: document.documentElement.style.colorScheme ?? '',
    bodyClass: document.body.className,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    mainTextLen: (document.querySelector('main')?.textContent ?? document.body.textContent ?? '').length,
    // Form state: checkboxes, radios, selects, and text length (not content).
    controlState: Array.from(document.querySelectorAll('input,select,textarea'))
      .slice(0, 120)
      .map((el) => {
        const i = el as HTMLInputElement
        return `${i.checked ? 1 : 0}${(i.value ?? '').length}${i.getAttribute('aria-invalid') ?? ''}`
      })
      .join('|'),
    focused: document.activeElement?.tagName + (document.activeElement?.getAttribute('data-q-idx') ?? ''),
    scrollY: Math.round(window.scrollY)
  }
}

function styleChanged(a: any, b: any): boolean {
  if (!a || !b) return false
  return Object.keys(a).some((k) => String(a[k]) !== String(b[k]))
}

/** True when focused styles show a ring / outline / glow a keyboard user can see. */
function hasFocusCue(resting: any, focused: any): boolean {
  if (!focused) return false
  if (styleChanged(resting, focused)) return true
  // Some designs keep the same boxShadow string but grow outlineWidth via :focus-visible
  // after a real Tab — catch non-none outlines explicitly.
  if (focused.outline && String(focused.outline).trim()) return true
  return false
}

/**
 * Count visible tabbable / interactive controls — used to gate the false
 * "Nothing is reachable by keyboard" critical when Tab leaves the page into
 * browser chrome (playwright#39268) or headless focus is soft.
 *
 * Must stay wider than `a[href], button` alone: SPA nav often uses role=button
 * / role=link without a native href, which the mouse probe still exercises.
 */
export async function countPlaywrightFocusables(page: Page): Promise<number> {
  try {
    const fromDom = await page.evaluate(() => {
      const isDev =
        (window as unknown as { __qualitionIsDevChrome?: (e: Element | null) => boolean }).__qualitionIsDevChrome
      const sel =
        'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, [role=button], [role=link], [role=tab], [role=menuitem], [role=switch], [tabindex]:not([tabindex="-1"])'
      return Array.from(document.querySelectorAll(sel)).filter((el) => {
        if (typeof isDev === 'function' && isDev(el)) return false
        const r = (el as HTMLElement).getBoundingClientRect()
        if (r.width < 1 || r.height < 1) return false
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden') return false
        if ((el as HTMLElement).inert || el.closest('[inert], [aria-hidden="true"]')) return false
        return true
      }).length
    })
    if (fromDom > 0) return fromDom
    const loc = page.locator(
      'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, [role=button], [role=link], [tabindex]:not([tabindex="-1"])'
    )
    return await loc.count()
  } catch {
    return 0
  }
}

/**
 * Whether to emit the critical "nothing reachable by keyboard" finding.
 * Skip when the mouse probe already operated controls, or when the DOM has
 * focusables but Tab escaped to chrome / headless focus glitched.
 */
export function shouldEmitKeyboardUnreachable(opts: {
  tabStops: number
  focusableCount: number
  controlsProbed: number
  /** Skip link or other landmark navigation present. */
  hasSkipLink?: boolean
}): boolean {
  if (opts.tabStops > 0) return false
  if (opts.focusableCount > 0) return false
  if (opts.controlsProbed > 0) return false
  if (opts.hasSkipLink) return false
  return true
}

export interface ProbeOptions {
  outDir: string
  viewport: Viewport
  maxControls: number
  /** Hard wall-clock ceiling for the whole probe. Partial results are kept. */
  budgetMs?: number
  /** Signed-in session from the login step, if any. */
  storageState?: string
  onLog?: (msg: string) => void
}



export async function probeInteractions(
  browser: Browser,
  url: string,
  opts: ProbeOptions
): Promise<{ report: InteractionReport; findings: Finding[] }> {
  const ctx = await browser.newContext({
    viewport: { width: opts.viewport.width, height: opts.viewport.height },
    isMobile: opts.viewport.isMobile,
    hasTouch: opts.viewport.isMobile,
    bypassCSP: true,
    ...(opts.storageState ? { storageState: opts.storageState } : {})
  })
  const page = await ctx.newPage()
  const deadline = new Deadline(opts.budgetMs ?? 120_000)
  // Page-level defaults so no Playwright action can block indefinitely.
  page.setDefaultTimeout(3000)
  page.setDefaultNavigationTimeout(20_000)
  await installDevChromeGuard(page).catch(() => {})
  // A window.confirm/alert from a probed click would freeze everything.
  page.on('dialog', (d) => {
    d.dismiss().catch(() => {})
  })
  let renavigations = 0
  const restore = async (): Promise<void> => {
    if (renavigations >= 4 || deadline.expired) return
    renavigations++
    await soft(
      page.goto(url, { waitUntil: 'domcontentloaded', timeout: deadline.slice(15_000) }).then(() => undefined),
      deadline.slice(16_000),
      'restore navigation',
      undefined
    )
    await page.waitForTimeout(500)
    await hideDevChrome(page)
    await soft(page.evaluate(collectControls), deadline.slice(5000), 're-collect', null)
  }
  const findings: Finding[] = []
  const report: InteractionReport = {
    url,
    viewport: opts.viewport.name,
    controlsProbed: 0,
    deadClicks: [],
    noFocusIndicator: [],
    noHoverFeedback: [],
    fakeButtons: [],
    unnamedControls: [],
    brokenDisabled: [],
    overlays: [],
    forms: [],
    keyboard: { positiveTabIndex: 0, tabStops: 0, reachableRatio: 1, escapeClosesOverlay: null, focusTrapOk: null }
  }

  try {
    await limit(
      page.goto(url, { waitUntil: 'domcontentloaded', timeout: deadline.slice(30_000) }),
      deadline.slice(32_000),
      'probe initial navigation'
    )
    // A client-rendered app has an empty DOM at domcontentloaded. Probing then
    // reports "no interactive controls" on a perfectly good screen, so wait for
    // the app to actually paint something interactive before inventorying.
    await soft(
      page.waitForLoadState('networkidle', { timeout: deadline.slice(8000) }),
      deadline.slice(9000),
      'probe networkidle',
      undefined
    )
    await soft(
      page.waitForFunction(
        () => document.querySelectorAll('a[href], button, input, select, textarea, [role=button]').length > 0,
        undefined,
        { timeout: deadline.slice(8000), polling: 250 }
      ).then(() => undefined),
      deadline.slice(9000),
      'probe hydration wait',
      undefined
    )
    await page.waitForTimeout(600)

    const hiddenChrome = await hideDevChrome(page)
    if (hiddenChrome > 0) opts.onLog?.(`hid ${hiddenChrome} dev-chrome node(s) before interaction probe`)

    const inventory: any = await soft(page.evaluate(collectControls), deadline.slice(20_000), 'collectControls', {
      controls: [],
      forms: [],
      positiveTabIndex: 0,
      failed: true
    })
    const controls: any[] = (inventory.controls ?? []).slice(0, opts.maxControls)
    if (controls.length === 0) {
      // Silence here used to look like "a perfect page"; say what happened.
      opts.onLog?.(
        inventory.failed
          ? `interaction probe could not read controls on ${url} (page too slow or blocked)`
          : `no interactive controls found on ${url}`
      )
    }
    report.controlsProbed = controls.length
    report.keyboard.positiveTabIndex = inventory.positiveTabIndex

    if (inventory.positiveTabIndex > 0) {
      findings.push(
        mk(url, 'major', `${inventory.positiveTabIndex} elements use a positive tabindex`,
          'Positive tabindex values jump the keyboard order out of document order; anyone tabbing through gets thrown around the page.',
          'Use tabindex="0" (or nothing) and fix the DOM order instead.',
          { viewport: opts.viewport.name, category: 'accessibility' })
      )
    }

    /* ---------------------- per-control state probing ---------------------- */
    for (const c of controls) {
      if (deadline.expired) {
        opts.onLog?.(`probe budget reached during state probing (${report.controlsProbed} controls inventoried)`)
        break
      }
      const sel = `[data-q-idx="${c.idx}"]`
      const locator = page.locator(sel).first()
      const label = c.name || `${c.tag}${c.role ? `[${c.role}]` : ''} @${c.rect.x},${c.rect.y}`

      // Missing accessible name — the single most common blocker.
      if (!c.name && !c.disabled) {
        report.unnamedControls.push(label)
      }

      // Fake button: not a native control, no role, not focusable, but styled clickable.
      if (!c.isNativeInteractive && !c.role && c.tabIndex < 0) {
        report.fakeButtons.push(label)
      }

      // Broken disabled semantics.
      if (c.ariaDisabled && !c.nativeDisabled && c.pointerEvents !== 'none') {
        report.brokenDisabled.push(label)
      }

      if (c.disabled) continue

      try {
        await soft(
          page.evaluate((s) => {
            document.querySelectorAll('[data-q-probe]').forEach((e) => e.removeAttribute('data-q-probe'))
            document.querySelector(s)?.setAttribute('data-q-probe', '1')
          }, sel),
          deadline.slice(2500),
          'mark probe',
          undefined
        )

        // Hover feedback — dwell long enough for CSS transitions (often 150–200ms).
        await soft(
          page.evaluate((s) => {
            document.querySelectorAll('[data-q-probe]').forEach((e) => e.removeAttribute('data-q-probe'))
            document.querySelector(s)?.setAttribute('data-q-probe', '1')
          }, sel),
          deadline.slice(2500),
          'mark probe for hover',
          undefined
        )
        const beforeChild = await soft(
          page.evaluate(() => {
            const child = document.querySelector('[data-q-probe="1"]')?.firstElementChild as HTMLElement | null
            if (!child) return null
            const cs = getComputedStyle(child)
            return {
              background: cs.backgroundColor,
              color: cs.color,
              opacity: cs.opacity,
              transform: cs.transform,
              boxShadow: cs.boxShadow,
              filter: cs.filter
            }
          }),
          deadline.slice(2000),
          'child rest style',
          null
        )
        await limit(locator.hover({ timeout: deadline.slice(2000), force: true }), deadline.slice(2500), 'hover')
        await page.waitForTimeout(220)
        const hovered = await soft(
          page.evaluate(() => {
            const el = document.querySelector('[data-q-probe="1"]') as HTMLElement | null
            if (!el) return null
            const read = (node: Element): any => {
              const cs = getComputedStyle(node)
              return {
                outline: cs.outlineStyle === 'none' ? '' : `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
                boxShadow: cs.boxShadow,
                background: cs.backgroundColor,
                color: cs.color,
                border: cs.borderColor + cs.borderWidth,
                transform: cs.transform,
                textDecoration: cs.textDecorationLine,
                opacity: cs.opacity,
                filter: cs.filter
              }
            }
            return { self: read(el), child: el.firstElementChild ? read(el.firstElementChild) : null }
          }),
          deadline.slice(2000),
          'hover style',
          null
        )
        if (
          hovered &&
          c.cursor === 'pointer' &&
          !styleChanged(c.resting, hovered.self) &&
          !styleChanged(beforeChild, hovered.child)
        ) {
          report.noHoverFeedback.push(label)
        }

        // Focus indicator — Tab-first so :focus-visible matches. Programmatic
        // .focus() alone never lights a correct :focus-visible ring in Chrome.
        let usedTab = false
        let focusVisible = false
        await soft(
          page.evaluate((s) => {
            const el = document.querySelector(s) as HTMLElement | null
            if (el && typeof el.focus === 'function') el.focus({ preventScroll: true })
          }, sel),
          deadline.slice(1500),
          'seed for tab',
          undefined
        )
        // Walk Tab until our control is active (cap 8 hops).
        for (let hop = 0; hop < 8; hop++) {
          const onTarget = await soft(
            page.evaluate((s) => document.activeElement === document.querySelector(s), sel),
            deadline.slice(1000),
            'tab hop check',
            false
          )
          if (onTarget) {
            usedTab = hop > 0 || true
            break
          }
          await soft(page.keyboard.press('Tab'), deadline.slice(1200), 'tab-to-control', undefined)
        }
        await page.waitForTimeout(80)
        let focused = await soft(page.evaluate(styleOf), deadline.slice(2000), 'focus style', null)
        let isFocused = await soft(
          page.evaluate((s) => document.activeElement === document.querySelector(s), sel),
          deadline.slice(2000),
          'focus check',
          false
        )
        focusVisible = !!(await soft(
          page.evaluate((s) => {
            const el = document.querySelector(s)
            try {
              return !!el && typeof (el as HTMLElement).matches === 'function' && (el as HTMLElement).matches(':focus-visible')
            } catch {
              return false
            }
          }, sel),
          deadline.slice(1000),
          'focus-visible',
          false
        ))
        if (!isFocused) {
          // Fall back to locator.focus — mark confidence low if we later flag.
          await soft(locator.focus({ timeout: deadline.slice(2000) }), deadline.slice(2500), 'focus', undefined)
          await page.waitForTimeout(80)
          focused = await soft(page.evaluate(styleOf), deadline.slice(2000), 'focus style', null)
          isFocused = await soft(
            page.evaluate((s) => document.activeElement === document.querySelector(s), sel),
            deadline.slice(2000),
            'focus check',
            false
          )
          usedTab = false
        }
        if (isFocused && focused && !hasFocusCue(c.resting, focused) && !focusVisible) {
          report.noFocusIndicator.push(label)
          ;(report as any)._focusMethod = usedTab ? 'tab' : 'programmatic'
        }
      } catch {
        /* control moved, is covered, or timed out — not fatal */
      }
    }

    /* ------------------------- safe click probing -------------------------- */
    const clickable = controls.filter(
      (c) =>
        !c.disabled &&
        !DESTRUCTIVE.test(c.name) &&
        !(NAVIGATIONAL.test(c.tag) && c.href && !c.href.startsWith('#')) &&
        c.type !== 'submit' &&
        !(c.tag === 'input' && ['text', 'email', 'password', 'search', 'number', 'tel'].includes(c.type ?? ''))
    )

    for (const c of clickable.slice(0, Math.min(20, opts.maxControls))) {
      if (deadline.expired) {
        opts.onLog?.('probe budget reached during click probing')
        break
      }
      const sel = `[data-q-idx="${c.idx}"]`
      const label = c.name || `${c.tag} @${c.rect.x},${c.rect.y}`
      try {
        const before = await soft(page.evaluate(pageSignature), deadline.slice(2000), 'signature', null)
        if (!before) continue
        await limit(
          page.locator(sel).first().click({ timeout: deadline.slice(2500), noWaitAfter: true }),
          deadline.slice(3000),
          'click'
        )
        await page.waitForTimeout(750)
        const after = await soft(page.evaluate(pageSignature), deadline.slice(2000), 'signature', before)

        const changed =
          before.url !== after.url ||
          Math.abs(before.domSize - after.domSize) > 40 ||
          before.nodeCount !== after.nodeCount ||
          before.dialogs !== after.dialogs ||
          before.overlays !== after.overlays ||
          before.expanded !== after.expanded ||
          before.selected !== after.selected ||
          before.pressed !== after.pressed ||
          before.checkedAria !== after.checkedAria ||
          before.dataState !== after.dataState ||
          before.dataOpen !== after.dataOpen ||
          before.rootClass !== after.rootClass ||
          before.rootTheme !== after.rootTheme ||
          before.colorScheme !== after.colorScheme ||
          before.bodyClass !== after.bodyClass ||
          before.bodyBg !== after.bodyBg ||
          before.controlState !== after.controlState ||
          Math.abs((before.mainTextLen ?? 0) - (after.mainTextLen ?? 0)) > 20 ||
          before.focused !== after.focused ||
          Math.abs(before.scrollY - after.scrollY) > 20

        // Skip dead-click on controls that are expected to be no-ops when already active
        // (selected tab, pressed toggle) — signature may not move.
        const likelyStateful =
          c.role === 'tab' || c.role === 'menuitem' || c.role === 'option' || c.role === 'switch' || c.role === 'checkbox'
        if (!changed && !likelyStateful) {
          // Second look after another beat — animations / portals often land late.
          await page.waitForTimeout(400)
          const after2 = await soft(page.evaluate(pageSignature), deadline.slice(2000), 'signature-retry', after)
          const changedLate =
            before.url !== after2.url ||
            before.dialogs !== after2.dialogs ||
            before.overlays !== after2.overlays ||
            before.expanded !== after2.expanded ||
            before.dataState !== after2.dataState ||
            before.dataOpen !== after2.dataOpen ||
            Math.abs(before.domSize - after2.domSize) > 40
          if (!changedLate) report.deadClicks.push(label)
        }

        // If an overlay / menu / sheet opened, test Escape and focus containment.
        const overlayOpened = after.overlays > before.overlays || after.dialogs > before.dialogs
        if (overlayOpened) {
          const trapped = await soft(
            page.evaluate(() => {
              const dlg = document.querySelector(
                'dialog[open],[role=dialog],[role=alertdialog],[aria-modal=true],[role=menu],[data-radix-popper-content-wrapper],[data-state=open]'
              )
              return !!dlg && !!dlg.contains(document.activeElement)
            }),
            deadline.slice(2000),
            'focus trap check',
            false
          )
          await soft(page.keyboard.press('Escape'), deadline.slice(1500), 'escape', undefined)
          await page.waitForTimeout(350)
          const afterEsc = await soft(page.evaluate(pageSignature), deadline.slice(2000), 'signature', after)
          const closed = afterEsc.overlays < after.overlays || afterEsc.dialogs < after.dialogs
          report.overlays.push({ trigger: label, focusMoved: trapped, escapeCloses: closed })
          report.keyboard.escapeClosesOverlay = closed
          report.keyboard.focusTrapOk = trapped
          if (!closed) await restore()
        }

        if (before.url !== after.url) await restore()
      } catch {
        /* covered/detached control, or step timed out */
      }
    }

    /* ---------------------------- form probing ----------------------------- */
    for (const f of inventory.forms ?? []) {
      if (deadline.expired) break
      if (f.required === 0 && f.fields === 0) continue
      if (DESTRUCTIVE.test(f.submitLabel)) continue
      try {
        const before = await soft(page.evaluate(pageSignature), deadline.slice(2000), 'signature', null)
        if (!before) break
        const shot = join(opts.outDir, `form-${f.idx}-${opts.viewport.name}.png`)
        // Submit empty and see whether the UI says anything at all.
        await soft(
          page.evaluate((i) => {
            const form = document.querySelector(`[data-q-form="${i}"]`) as HTMLFormElement | null
            const btn = form?.querySelector('[type=submit],button:not([type=button])') as HTMLElement | null
            btn?.click()
          }, f.idx),
          deadline.slice(3000),
          'form submit',
          undefined
        )
        await page.waitForTimeout(700)
        const feedback = await soft(page.evaluate(() => {
          const invalid = document.querySelectorAll(':invalid, [aria-invalid="true"]').length
          const errorText = Array.from(document.querySelectorAll('[role=alert],[class*=error i],[class*=invalid i]'))
            .filter((e) => (e.textContent ?? '').trim().length > 0).length
          const nativeTooltip = Array.from(document.querySelectorAll('input,select,textarea')).some(
            (el) => !(el as HTMLInputElement).validity?.valid
          )
          return { invalid, errorText, nativeTooltip }
        }), deadline.slice(3000), 'validation check', { invalid: 0, errorText: 0, nativeTooltip: false })
        const after = await soft(page.evaluate(pageSignature), deadline.slice(2000), 'signature', before)
        const gaveFeedback = feedback.errorText > 0 || feedback.nativeTooltip || feedback.invalid > 0 || after.url !== before.url
        report.forms.push({
          index: f.idx,
          fields: f.fields,
          required: f.required,
          submitLabel: f.submitLabel,
          validationFeedback: gaveFeedback,
          screenshot: shot
        })
        if (!gaveFeedback && f.required > 0) {
          findings.push(
            mk(url, 'major', `Form "${f.submitLabel || `#${f.idx}`}" submits empty with no visible feedback`,
              `${f.required} required field(s) and no error state, no aria-invalid, no native validation. The user presses the button and nothing tells them why nothing happened.`,
              'Show inline, field-level errors on submit, set aria-invalid, and move focus to the first invalid field.',
              { viewport: opts.viewport.name })
          )
        }
        if (f.hasNovalidate && f.required > 0 && !gaveFeedback) {
          findings.push(
            mk(url, 'minor', `Form "${f.submitLabel || `#${f.idx}`}" disables native validation without replacing it`,
              'novalidate is set but no custom validation surfaced.',
              'If you take over validation, you own the error UI too.',
              { viewport: opts.viewport.name })
          )
        }
        if (after.url !== before.url) await restore()
      } catch {
        /* form vanished or step timed out */
      }
    }

    /* --------------------------- keyboard sweep ---------------------------- */
    try {
      if (deadline.remaining < 6000) throw new Error('no budget left for keyboard sweep')
      renavigations = 0
      await restore()
      await hideDevChrome(page)
      // Re-tag controls after restore so we can seed focus on a real control.
      await soft(page.evaluate(collectControls), deadline.slice(8000), 're-collect for tab', null)

      // Playwright#39268: Tab can escape into browser chrome; document.hasFocus()
      // goes false and activeElement looks like <body>. Bring the page forward
      // and seed focus on a known focusable before sweeping.
      await soft(page.bringToFront(), 2000, 'bringToFront', undefined)
      await soft(page.locator('body').click({ position: { x: 2, y: 2 }, timeout: 1500 }), 2000, 'activate page', undefined)

      const pwFocusables = await countPlaywrightFocusables(page)
      const seed = page
        .locator(
          'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        .first()
      if (pwFocusables > 0) {
        await soft(seed.focus({ timeout: deadline.slice(2000) }), deadline.slice(2500), 'seed focus', undefined)
      } else {
        await soft(page.evaluate(() => (document.body as HTMLElement).focus()), 2000, 'body focus', undefined)
      }

      const stops: string[] = []
      let lostDocumentFocus = false
      for (let i = 0; i < 25; i++) {
        if (deadline.expired) break
        await soft(page.keyboard.press('Tab'), deadline.slice(1500), 'tab', undefined)
        const el = await soft(
          page.evaluate(() => {
            if (!document.hasFocus()) return { lostFocus: true as const }
            const a = document.activeElement as HTMLElement | null
            if (!a || a === document.body || a === document.documentElement) return null
            const r = a.getBoundingClientRect()
            const cs = getComputedStyle(a)
            return {
              lostFocus: false as const,
              tag: a.tagName.toLowerCase(),
              name: (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
              offscreen: r.width === 0 || r.height === 0,
              hidden: cs.visibility === 'hidden' || cs.display === 'none',
              y: Math.round(r.top + window.scrollY)
            }
          }),
          deadline.slice(2000),
          'tab stop',
          null
        )
        if (!el) break
        if ('lostFocus' in el && el.lostFocus) {
          // One recovery attempt: Tab often escapes to Chromium chrome in headed/headless.
          await soft(page.bringToFront(), 1500, 're-focus recover', undefined)
          await soft(
            page.locator('body').click({ position: { x: 4, y: 4 }, timeout: 1000 }),
            1500,
            're-activate',
            undefined
          )
          if (pwFocusables > 0) {
            await soft(seed.focus({ timeout: 1500 }), 2000, 're-seed focus', undefined)
          }
          const stillLost = await soft(
            page.evaluate(() => !document.hasFocus()),
            1000,
            'check focus',
            true
          )
          if (stillLost) {
            lostDocumentFocus = true
            break
          }
          continue
        }
        if (!('tag' in el) || !el.tag) break
        stops.push(`${el.tag}:${el.name}`)
        if (el.hidden) {
          findings.push(
            mk(
              url,
              'major',
              'Keyboard focus lands on a hidden element',
              `Tab stop ${i + 1} (${el.tag} "${el.name}") is not visible but still focusable — the focus ring disappears into nothing.`,
              'Remove hidden controls from the tab order with inert, display:none, or tabindex="-1".',
              { viewport: opts.viewport.name, category: 'accessibility' }
            )
          )
          break
        }
      }
      report.keyboard.tabStops = stops.length
      // Only emit the critical when Tab found nothing AND the page truly has no
      // interactive controls. Mouse-probed pages with a soft Tab sweep are a
      // Playwright/headless focus quirk, not "unusable without a mouse".
      const hasSkipLink = await soft(
        page.evaluate(
          () =>
            !!document.querySelector(
              'a[href^="#"][class*=skip i], a[href="#main"], a[href="#content"], a.skip-to-content, a[href="#app"]'
            )
        ),
        2000,
        'skip-link',
        false
      )
      if (
        shouldEmitKeyboardUnreachable({
          tabStops: stops.length,
          focusableCount: pwFocusables,
          controlsProbed: report.controlsProbed,
          hasSkipLink: !!hasSkipLink
        })
      ) {
        findings.push(
          mk(
            url,
            'critical',
            'Nothing is reachable by keyboard',
            'Pressing Tab from the top of the document never lands on a focusable control, and Playwright found no tabbable elements in the DOM.',
            'This page is unusable without a mouse — check for tabindex="-1" on wrappers or a focus-stealing overlay.',
            { viewport: opts.viewport.name, category: 'accessibility' }
          )
        )
      } else if (stops.length === 0) {
        opts.onLog?.(
          `keyboard sweep found 0 tab stops (focusables=${pwFocusables}, probed=${report.controlsProbed})${lostDocumentFocus ? ' (document lost focus — likely Tab escaped to chrome)' : ''} — skipping false critical on ${url}`
        )
        report.keyboard.tabStops = Math.min(Math.max(pwFocusables, report.controlsProbed, 1), 25)
      }
    } catch {
      /* navigation raced */
    }
  } catch (e) {
    opts.onLog?.(`interaction probe stopped early on ${url}: ${(e as Error).message}`)
  } finally {
    await ctx.close().catch(() => {})
  }

  findings.push(...summarise(report, url, opts.viewport.name))
  return { report, findings }
}

/** Turn the raw probe report into findings with real numbers attached. */
function summarise(r: InteractionReport, url: string, viewport: string): Finding[] {
  const out: Finding[] = []
  const list = (xs: string[], n = 4): string => xs.slice(0, n).map((x) => `"${x}"`).join(', ')

  if (r.deadClicks.length) {
    out.push(
      mk(url, r.deadClicks.length > 6 ? 'major' : 'minor',
        `${r.deadClicks.length} control(s) do nothing when clicked`,
        `Activated with no URL change, no DOM change, no dialog/menu, no aria-expanded change, no scroll: ${list(r.deadClicks)}. Either they are broken, or their effect is invisible — both read as broken to a user.`,
        'Wire the handler, or give the click visible consequence (state change, toast, navigation, loading state).',
        { viewport })
    )
  }
  if (r.noFocusIndicator.length) {
    out.push(
      mk(url, r.noFocusIndicator.length > 5 ? 'critical' : 'major',
        `${r.noFocusIndicator.length} control(s) have no visible focus state`,
        `After keyboard Tab focus, zero computed-style change and :focus-visible did not match: ${list(r.noFocusIndicator)}. Keyboard users cannot tell where they are (WCAG 2.4.7).`,
        'Use :focus-visible only (not :focus / :active): a soft offset ring or outline with the token ring colour. Do not thicken the control border on press — that reads as a harsh active state. Never outline:none without a replacement.',
        { viewport, category: 'accessibility', confidence: 'high', effort: 'one-line' })
    )
  }
  if (r.noHoverFeedback.length) {
    out.push(
      mk(url, 'minor',
        `${r.noHoverFeedback.length} control(s) show cursor:pointer but no hover feedback`,
        `${list(r.noHoverFeedback)} — the cursor promises interactivity the UI never acknowledges.`,
        'Add a hover state (background, border, or elevation) on every pointer-cursor element.',
        { viewport })
    )
  }
  if (r.fakeButtons.length) {
    out.push(
      mk(url, 'major',
        `${r.fakeButtons.length} fake button(s): clickable elements with no role and no tab stop`,
        `${list(r.fakeButtons)} respond to a mouse but do not exist for assistive tech or the keyboard.`,
        'Use <button>. If you must keep the div, add role="button", tabindex="0" and Enter/Space handlers.',
        { viewport, category: 'accessibility' })
    )
  }
  if (r.unnamedControls.length) {
    out.push(
      mk(url, r.unnamedControls.length > 8 ? 'major' : 'minor',
        `${r.unnamedControls.length} control(s) have no accessible name`,
        `Icon-only or empty controls: ${list(r.unnamedControls)}. A screen reader announces "button" and nothing else.`,
        'Add aria-label or visually hidden text describing the action, not the icon.',
        { viewport, category: 'accessibility' })
    )
  }
  if (r.brokenDisabled.length) {
    out.push(
      mk(url, 'minor',
        `${r.brokenDisabled.length} control(s) claim aria-disabled but still accept clicks`,
        `${list(r.brokenDisabled)} — the UI says "unavailable" while the handler still fires.`,
        'Either truly disable it, or drop aria-disabled and explain why the action is unavailable.',
        { viewport, category: 'accessibility' })
    )
  }
  for (const o of r.overlays) {
    if (!o.escapeCloses) {
      out.push(
        mk(url, 'major', `Overlay opened by "${o.trigger}" does not close on Escape`,
          'Every dismissible overlay must respond to Escape; users try it before hunting for the X.',
          'Bind Escape to close, and restore focus to the trigger afterwards.',
          { viewport, category: 'accessibility' })
      )
    }
    if (!o.focusMoved) {
      out.push(
        mk(url, 'major', `Overlay opened by "${o.trigger}" never moves focus into itself`,
          'Focus stays behind the overlay, so keyboard users tab through the page underneath.',
          'Move focus to the dialog on open, trap it while open, and return it on close.',
          { viewport, category: 'accessibility' })
      )
    }
  }
  return out
}
