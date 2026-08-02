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
    'button, a[href], input, select, textarea, summary, [role=button], [role=link], [role=tab], [role=menuitem], [role=switch], [role=checkbox], [onclick], [data-testid*=button i]'

  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    const cs = getComputedStyle(el)
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05
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
  return {
    url: location.href,
    domSize: document.body.innerHTML.length,
    nodeCount: document.querySelectorAll('*').length,
    dialogs: document.querySelectorAll('dialog[open],[role=dialog],[role=alertdialog],[aria-modal=true]').length,
    expanded: attrs('[aria-expanded]', 'aria-expanded'),
    selected: attrs('[aria-selected]', 'aria-selected'),
    pressed: attrs('[aria-pressed]', 'aria-pressed'),
    checkedAria: attrs('[aria-checked]', 'aria-checked'),
    dataState: attrs('[data-state]', 'data-state'),
    // Theme switches usually only mutate the root class or a data attribute.
    rootClass: document.documentElement.className,
    rootTheme: document.documentElement.getAttribute('data-theme') ?? '',
    colorScheme: document.documentElement.style.colorScheme ?? '',
    bodyClass: document.body.className,
    bodyBg: getComputedStyle(document.body).backgroundColor,
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

        // Hover feedback
        await limit(locator.hover({ timeout: deadline.slice(2000) }), deadline.slice(2500), 'hover')
        await page.waitForTimeout(120)
        const hovered = await soft(page.evaluate(styleOf), deadline.slice(2000), 'hover style', null)
        if (hovered && !styleChanged(c.resting, hovered) && c.cursor === 'pointer') {
          report.noHoverFeedback.push(label)
        }

        // Focus indicator
        await soft(
          page.evaluate((s) => (document.querySelector(s) as HTMLElement)?.focus?.(), sel),
          deadline.slice(2000),
          'focus',
          undefined
        )
        await page.waitForTimeout(100)
        const focused = await soft(page.evaluate(styleOf), deadline.slice(2000), 'focus style', null)
        const isFocused = await soft(
          page.evaluate((s) => document.activeElement === document.querySelector(s), sel),
          deadline.slice(2000),
          'focus check',
          false
        )
        if (isFocused && focused && !styleChanged(c.resting, focused)) {
          report.noFocusIndicator.push(label)
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
        await page.waitForTimeout(500)
        const after = await soft(page.evaluate(pageSignature), deadline.slice(2000), 'signature', before)

        const changed =
          before.url !== after.url ||
          Math.abs(before.domSize - after.domSize) > 40 ||
          before.nodeCount !== after.nodeCount ||
          before.dialogs !== after.dialogs ||
          before.expanded !== after.expanded ||
          before.selected !== after.selected ||
          before.pressed !== after.pressed ||
          before.checkedAria !== after.checkedAria ||
          before.dataState !== after.dataState ||
          before.rootClass !== after.rootClass ||
          before.rootTheme !== after.rootTheme ||
          before.colorScheme !== after.colorScheme ||
          before.bodyClass !== after.bodyClass ||
          before.bodyBg !== after.bodyBg ||
          before.controlState !== after.controlState ||
          Math.abs(before.scrollY - after.scrollY) > 20

        if (!changed) {
          report.deadClicks.push(label)
        }

        // If an overlay opened, test Escape and focus containment.
        if (after.dialogs > before.dialogs) {
          const trapped = await soft(
            page.evaluate(() => {
              const dlg = document.querySelector('dialog[open],[role=dialog],[aria-modal=true]')
              return !!dlg && !!dlg.contains(document.activeElement)
            }),
            deadline.slice(2000),
            'focus trap check',
            false
          )
          await soft(page.keyboard.press('Escape'), deadline.slice(1500), 'escape', undefined)
          await page.waitForTimeout(350)
          const afterEsc = await soft(page.evaluate(pageSignature), deadline.slice(2000), 'signature', after)
          const closed = afterEsc.dialogs < after.dialogs
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
      await soft(page.evaluate(() => (document.body as HTMLElement).focus()), 2000, 'body focus', undefined)
      const stops: string[] = []
      for (let i = 0; i < 25; i++) {
        if (deadline.expired) break
        await soft(page.keyboard.press('Tab'), deadline.slice(1500), 'tab', undefined)
        const el = await soft(page.evaluate(() => {
          const a = document.activeElement as HTMLElement | null
          if (!a || a === document.body) return null
          const r = a.getBoundingClientRect()
          const cs = getComputedStyle(a)
          return {
            tag: a.tagName.toLowerCase(),
            name: (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
            offscreen: r.width === 0 || r.height === 0,
            hidden: cs.visibility === 'hidden' || cs.display === 'none',
            y: Math.round(r.top + window.scrollY)
          }
        }), deadline.slice(2000), 'tab stop', null)
        if (!el) break
        stops.push(`${el.tag}:${el.name}`)
        if (el.hidden) {
          findings.push(
            mk(url, 'major', 'Keyboard focus lands on a hidden element',
              `Tab stop ${i + 1} (${el.tag} "${el.name}") is not visible but still focusable — the focus ring disappears into nothing.`,
              'Remove hidden controls from the tab order with inert, display:none, or tabindex="-1".',
              { viewport: opts.viewport.name, category: 'accessibility' })
          )
          break
        }
      }
      report.keyboard.tabStops = stops.length
      if (stops.length === 0) {
        findings.push(
          mk(url, 'critical', 'Nothing is reachable by keyboard',
            'Pressing Tab from the top of the document never lands on a focusable control.',
            'This page is unusable without a mouse — check for tabindex="-1" on wrappers or a focus-stealing overlay.',
            { viewport: opts.viewport.name, category: 'accessibility' })
        )
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
      mk(url, r.deadClicks.length > 3 ? 'critical' : 'major',
        `${r.deadClicks.length} control(s) do nothing when clicked`,
        `Activated with no URL change, no DOM change, no dialog, no aria-expanded change, no scroll: ${list(r.deadClicks)}. Either they are broken, or their effect is invisible — both read as broken to a user.`,
        'Wire the handler, or give the click visible consequence (state change, toast, navigation, loading state).',
        { viewport })
    )
  }
  if (r.noFocusIndicator.length) {
    out.push(
      mk(url, r.noFocusIndicator.length > 5 ? 'critical' : 'major',
        `${r.noFocusIndicator.length} control(s) have no visible focus state`,
        `Focused programmatically with zero computed-style change: ${list(r.noFocusIndicator)}. Keyboard users cannot tell where they are (WCAG 2.4.7).`,
        'Add a :focus-visible ring using the token ring colour — never outline:none without a replacement.',
        { viewport, category: 'accessibility' })
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
      mk(url, 'critical',
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
