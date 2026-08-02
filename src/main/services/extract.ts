/**
 * Browser-side extraction payload.
 *
 * Everything here runs inside the page via page.evaluate, so it must be fully
 * self-contained (no imports, no closures over Node values).
 */
export const extractFn = function (): any {
  const clamp = (s: string, n: number): string => (s.length > n ? s.slice(0, n) + '…' : s)
  const bump = (m: Map<string, number>, k: string): void => {
    m.set(k, (m.get(k) ?? 0) + 1)
  }

  // Chrome now reports computed colours as lab()/oklch(); normalise everything to
  // an rgb/hex string so palette maths downstream is comparable.
  const cctx = document.createElement('canvas').getContext('2d')
  const colorCache = new Map<string, string>()
  const norm = (c: string): string => {
    if (!c || !cctx) return c
    if (c.startsWith('rgb') || c.startsWith('#')) return c
    const hit = colorCache.get(c)
    if (hit) return hit
    let out = c
    try {
      cctx.clearRect(0, 0, 1, 1)
      cctx.fillStyle = c
      cctx.fillRect(0, 0, 1, 1)
      const d = cctx.getImageData(0, 0, 1, 1).data
      out = d[3] === 255 ? `rgb(${d[0]}, ${d[1]}, ${d[2]})` : `rgba(${d[0]}, ${d[1]}, ${d[2]}, ${(d[3] / 255).toFixed(2)})`
    } catch {
      /* unsupported syntax */
    }
    colorCache.set(c, out)
    return out
  }

  const isVisible = (el: Element): boolean => {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    const cs = getComputedStyle(el)
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05
  }

  /* ------------------------------ tokens ------------------------------- */
  const colorBg = new Map<string, number>()
  const colorText = new Map<string, number>()
  const colorBorder = new Map<string, number>()
  const fonts = new Map<string, number>()
  const sizes = new Map<string, number>()
  const weights = new Map<string, number>()
  const radii = new Map<string, number>()
  const shadows = new Map<string, number>()
  const spacing = new Map<string, number>()
  const transitions = new Map<string, number>()

  const all = Array.from(document.querySelectorAll('body *')).filter(isVisible).slice(0, 4000)
  for (const el of all) {
    const cs = getComputedStyle(el)
    if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') bump(colorBg, norm(cs.backgroundColor))
    if (el.textContent && el.textContent.trim().length > 0) {
      bump(colorText, norm(cs.color))
      bump(fonts, cs.fontFamily.split(',')[0].replace(/["']/g, '').trim())
      bump(sizes, String(Math.round(parseFloat(cs.fontSize))))
      bump(weights, String(cs.fontWeight))
    }
    if (cs.borderTopWidth !== '0px' && cs.borderTopColor) bump(colorBorder, norm(cs.borderTopColor))
    if (cs.borderRadius && cs.borderRadius !== '0px') {
      // collapse "6px 6px 6px 6px" -> "6px" so uniform radii are not counted twice
      const parts = cs.borderRadius.split(' ')
      bump(radii, parts.every((p) => p === parts[0]) ? parts[0] : cs.borderRadius)
    }
    if (cs.boxShadow && cs.boxShadow !== 'none') bump(shadows, clamp(cs.boxShadow, 60))
    for (const p of ['paddingTop', 'paddingBottom', 'marginTop', 'marginBottom', 'gap'] as const) {
      const v = parseFloat((cs as any)[p])
      if (v > 0) bump(spacing, String(Math.round(v)))
    }
    if (cs.transitionDuration && cs.transitionDuration !== '0s')
      bump(transitions, `${cs.transitionDuration} ${cs.transitionTimingFunction}`)
  }

  const toArr = (m: Map<string, number>, numeric = false): any[] =>
    Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([value, usage]) => ({ value: numeric ? Number(value) : value, usage }))

  const tokens = {
    colors: [
      ...toArr(colorBg).map((c) => ({ ...c, role: 'bg' })),
      ...toArr(colorText).map((c) => ({ ...c, role: 'text' })),
      ...toArr(colorBorder).map((c) => ({ ...c, role: 'border' }))
    ],
    fontFamilies: toArr(fonts),
    fontSizes: toArr(sizes, true),
    fontWeights: toArr(weights, true),
    radii: toArr(radii),
    shadows: toArr(shadows),
    spacing: toArr(spacing, true),
    transitions: toArr(transitions)
  }

  /* ----------------------------- sections ------------------------------ */
  const cssPath = (el: Element): string => {
    const parts: string[] = []
    let cur: Element | null = el
    let depth = 0
    while (cur && cur !== document.body && depth < 5) {
      let part = cur.tagName.toLowerCase()
      if (cur.id) {
        part += `#${cur.id}`
        parts.unshift(part)
        break
      }
      const cls = (cur.getAttribute('class') ?? '')
        .split(/\s+/)
        .filter((c) => c && !/^(css-|sc-|jsx-)/.test(c) && c.length < 24)
        .slice(0, 2)
      if (cls.length) part += '.' + cls.join('.')
      const parent = cur.parentElement
      if (parent) {
        const sibs = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName)
        if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(cur) + 1})`
      }
      parts.unshift(part)
      cur = cur.parentElement
      depth++
    }
    return parts.join(' > ')
  }

  /**
   * Substance test: an element only counts as a section if a user would see
   * something in it. Layout wrappers and portal roots are invisible scaffolding
   * and must never be reported as "a section" — that is how a whole SPA ends up
   * described as one empty `content` block.
   */
  const substance = (el: Element): number => {
    const text = (el.textContent ?? '').trim().length
    const controls = el.querySelectorAll('a,button,input,select,textarea,[role=button]').length
    const media = el.querySelectorAll('img,svg,video,canvas,picture').length
    return text + controls * 40 + media * 25
  }
  const hasSubstance = (el: Element): boolean => substance(el) >= 60

  const candidates: Element[] = []
  const header = document.querySelector('header, [role=banner]')
  if (header) candidates.push(header)

  // Landmarks and explicit sections first — these are authored intent.
  const roots = Array.from(
    document.querySelectorAll(
      'main > section, main > article, main > div[class], body > section, body > div > section, main section, article, [data-section], [role=region], [role=main] > *'
    )
  ).filter(hasSubstance)
  for (const r of roots) candidates.push(r)

  // SPA fallback: no <section> markup anywhere. Find the densest content
  // container on the page and split *that*, instead of walking arbitrary
  // top-level divs (which lands on toast/portal roots).
  if (candidates.length < 3) {
    const main = document.querySelector('main, [role=main], #root, #app, [data-app]') ?? document.body
    let best: Element = main
    let bestScore = substance(main)
    const queue: Element[] = [main]
    let guard = 0
    while (queue.length && guard++ < 200) {
      const node = queue.shift()!
      for (const child of Array.from(node.children)) {
        if (!isVisible(child)) continue
        const s = substance(child)
        const r = child.getBoundingClientRect()
        // Keep descending while a single child holds most of the substance
        // (that child is the real container, the parent is just a wrapper).
        if (s > bestScore * 0.9 && r.height > 200) {
          best = child
          bestScore = s
          queue.push(child)
        }
      }
    }
    // Split the densest container into its meaningful children.
    const blocks = Array.from(best.children).filter((c) => isVisible(c) && hasSubstance(c))
    if (blocks.length >= 2) {
      for (const b of blocks) candidates.push(b)
    } else {
      candidates.push(best)
      // Also surface obvious app landmarks so a shell is not one blob.
      for (const el of Array.from(document.querySelectorAll('aside, nav, [role=navigation], [role=complementary], [role=dialog]'))) {
        if (isVisible(el) && hasSubstance(el)) candidates.push(el)
      }
    }
  }

  const footer = document.querySelector('footer, [role=contentinfo]')
  if (footer) candidates.push(footer)

  // Split any candidate that is really a wrapper around several bands, so a
  // single <main> does not become one 1700px "hero".
  const vh = window.innerHeight
  const splitOnce = (list: Element[]): { out: Element[]; changed: boolean } => {
    const out: Element[] = []
    let changed = false
    for (const el of list) {
      const h = el.getBoundingClientRect().height
      const isLandmark = /^(header|footer|nav)$/.test(el.tagName.toLowerCase())
      if (!isLandmark && h > vh * 1.35) {
        const kids = Array.from(el.children).filter((k) => {
          const r = k.getBoundingClientRect()
          return r.height > 120 && r.width > 200 && isVisible(k)
        })
        if (kids.length >= 2) {
          out.push(...kids)
          changed = true
          continue
        }
        if (kids.length === 1) {
          out.push(kids[0])
          changed = true
          continue
        }
      }
      out.push(el)
    }
    return { out, changed }
  }
  let work = candidates.slice()
  for (let pass = 0; pass < 4; pass++) {
    const { out, changed } = splitOnce(work)
    work = out
    if (!changed) break
  }
  candidates.length = 0
  candidates.push(...work)

  const seen = new Set<Element>()
  const docH = document.documentElement.scrollHeight
  const sections: any[] = []
  for (const el of candidates) {
    if (seen.has(el) || !isVisible(el)) continue
    const rect = el.getBoundingClientRect()
    const top = rect.top + window.scrollY
    if (rect.height < 80 || rect.height > docH * 1.2) continue
    // Empty scaffolding is not a section.
    if (!hasSubstance(el)) continue
    // Skip if nested inside an already-captured section.
    if (sections.some((s) => top >= s.rect.y - 4 && top + rect.height <= s.rect.y + s.rect.height + 4))
      continue
    seen.add(el)

    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    const headings = Array.from(el.querySelectorAll('h1,h2,h3'))
      .map((h) => (h.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 6)
    const interactives = Array.from(el.querySelectorAll('a,button,input,select,textarea,[role=button]'))
    const ctaLabels = interactives
      .map((b) => (b.textContent ?? (b as HTMLInputElement).value ?? '').replace(/\s+/g, ' ').trim())
      .filter((t) => t && t.length < 40)
      .slice(0, 8)
    const images = el.querySelectorAll('img,svg,video,picture,canvas')

    const tagCounts = new Map<string, number>()
    for (const c of Array.from(el.querySelectorAll('*')).slice(0, 800)) bump(tagCounts, c.tagName.toLowerCase())

    const bgSet = new Set<string>()
    const fsSet = new Set<string>()
    let maxTextWidth = 0
    for (const c of Array.from(el.querySelectorAll('*')).slice(0, 600)) {
      if (!isVisible(c)) continue
      const cs = getComputedStyle(c)
      if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') bgSet.add(norm(cs.backgroundColor))
      const t = (c.textContent ?? '').trim()
      if (t.length > 0 && c.children.length === 0) {
        fsSet.add(cs.fontSize)
        const w = c.getBoundingClientRect().width
        if (t.length > 80 && w > maxTextWidth) maxTextWidth = w
      }
    }

    /* role classification */
    const lower = text.toLowerCase().slice(0, 4000)
    const tag = el.tagName.toLowerCase()
    const scores: Record<string, number> = {
      nav: 0, hero: 0, features: 0, pricing: 0, testimonials: 0, logos: 0, faq: 0,
      cta: 0, form: 0, table: 0, gallery: 0, stats: 0, footer: 0, content: 0.4
    }
    if (tag === 'header' || tag === 'nav' || el.getAttribute('role') === 'banner') scores.nav += 2.2
    else if (el.querySelector('nav') && rect.height < 220) scores.nav += 1.4
    if (tag === 'footer' || el.getAttribute('role') === 'contentinfo') scores.footer += 3
    if (top < 200 && rect.height > 260 && headings.length > 0) scores.hero += 2.4
    if (/\$|\/mo|per month|pricing|free plan|most popular|billed annually/.test(lower)) scores.pricing += 2.2
    if (/testimonial|“|”|loved by|what our|customers say|trusted by \d/.test(lower)) scores.testimonials += 1.6
    if (el.querySelectorAll('img').length >= 4 && text.length < 400) scores.logos += 1.6
    if (/faq|frequently asked|question/.test(lower) || el.querySelectorAll('details,[data-state]').length >= 3)
      scores.faq += 1.8
    if (el.querySelector('form') || el.querySelectorAll('input,textarea,select').length >= 2) scores.form += 2.2
    if (el.querySelector('table') || el.querySelectorAll('[role=row]').length > 2) scores.table += 2.6
    if (el.querySelectorAll('img,picture,video').length >= 6) scores.gallery += 1.4
    if (/\b\d{1,3}(\.\d+)?(%|k|m|x|\+)\b/i.test(lower) && text.length < 700) scores.stats += 1.2
    if (interactives.length <= 3 && headings.length === 1 && text.length < 320 && top > 400) scores.cta += 1.5
    const repeated = Array.from(tagCounts.entries()).some(([t, n]) => ['li', 'article'].includes(t) && n >= 3)
    if (repeated && headings.length >= 2) scores.features += 1.4
    if (/feature|why |built for|everything you need|how it works/.test(lower)) scores.features += 1.1

    let role = 'content'
    let best = 0
    for (const [k, v] of Object.entries(scores)) if (v > best) { best = v; role = k }

    sections.push({
      id: `s${sections.length + 1}`,
      role,
      roleConfidence: Math.min(1, best / 3),
      label: headings[0] ?? clamp(text, 48) ?? role,
      selector: cssPath(el),
      rect: { x: Math.round(rect.x), y: Math.round(top), width: Math.round(rect.width), height: Math.round(rect.height) },
      textPreview: clamp(text, 400),
      headings,
      ctaLabels,
      components: Array.from(tagCounts.entries())
        .filter(([t]) => ['a', 'button', 'input', 'img', 'svg', 'li', 'table', 'form', 'select', 'video', 'article', 'h1', 'h2', 'h3'].includes(t))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tagName, count]) => ({ tag: tagName, role: null, text: '', count })),
      stats: {
        interactiveCount: interactives.length,
        imageCount: images.length,
        textDensity: Math.round((text.length / Math.max(1, rect.width * rect.height)) * 1e5) / 100,
        distinctBgColors: bgSet.size,
        distinctFontSizes: fsSet.size,
        maxTextWidthPx: Math.round(maxTextWidth)
      }
    })
  }

  /* --------------------------- responsive ------------------------------ */
  const vw = window.innerWidth
  let horizontalOverflowPx = Math.max(0, document.documentElement.scrollWidth - vw)
  let tinyTextCount = 0
  let smallTapTargets = 0
  let overlaps = 0
  const boxes: { r: DOMRect; el: Element }[] = []
  for (const el of all) {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const txt = (el.textContent ?? '').trim()
    if (txt.length >= 4 && el.children.length === 0 && parseFloat(cs.fontSize) < 12) tinyTextCount++
    const clickable = el.matches('a,button,input,select,[role=button],[onclick]')
    if (clickable && (r.height < 32 || r.width < 32) && r.height > 0) smallTapTargets++
    if (clickable && r.width > 0) boxes.push({ r, el })
  }
  for (let i = 0; i < Math.min(boxes.length, 120); i++) {
    for (let j = i + 1; j < Math.min(boxes.length, 120); j++) {
      const a = boxes[i].r
      const b = boxes[j].r
      if (boxes[i].el.contains(boxes[j].el) || boxes[j].el.contains(boxes[i].el)) continue
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (ox > 4 && oy > 4) overlaps++
    }
  }

  /* ------------------------- misc page signals -------------------------- */
  const links = Array.from(document.querySelectorAll('a[href]'))
    .map((a) => (a as HTMLAnchorElement).href)
    .filter((h) => h.startsWith('http'))

  /* ------------------------- control inventory -------------------------- */
  // The exact, verbatim handles a test can target on this page. Flows are
  // built from this list instead of being imagined.
  const controls: any[] = []
  for (const el of Array.from(
    document.querySelectorAll('a[href], button, input, select, textarea, [role=button], [role=link], [role=tab]')
  )) {
    if (!isVisible(el) || controls.length >= 120) continue
    const input = el as HTMLInputElement
    const labelText =
      input.labels && input.labels.length > 0 ? (input.labels[0].textContent ?? '').replace(/\s+/g, ' ').trim() : ''
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    controls.push({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') ?? '',
      role: el.getAttribute('role') ?? '',
      text: clamp(text, 60),
      placeholder: clamp(el.getAttribute('placeholder') ?? '', 60),
      label: clamp(labelText, 60),
      ariaLabel: clamp(el.getAttribute('aria-label') ?? '', 60),
      name: el.getAttribute('name') ?? '',
      href: el.getAttribute('href') ?? '',
      testId: el.getAttribute('data-testid') ?? el.getAttribute('data-test-id') ?? ''
    })
  }
  const imagesMissingAlt = Array.from(document.querySelectorAll('img')).filter(
    (i) => !i.getAttribute('alt') && !i.getAttribute('aria-hidden')
  ).length
  const h1Count = document.querySelectorAll('h1').length
  const headingOrderIssues = (() => {
    let last = 0
    let bad = 0
    for (const h of Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))) {
      const lvl = Number(h.tagName[1])
      if (last && lvl > last + 1) bad++
      last = lvl
    }
    return bad
  })()
  const focusableWithoutOutline = (() => {
    let n = 0
    for (const el of Array.from(document.querySelectorAll('a,button,input,select,textarea')).slice(0, 200)) {
      const cs = getComputedStyle(el)
      if (cs.outlineStyle === 'none' && !/focus/.test(el.getAttribute('class') ?? '')) n++
    }
    return n
  })()
  const animatedCount = all.filter((el) => {
    const cs = getComputedStyle(el)
    return cs.animationName !== 'none' || cs.transitionDuration !== '0s'
  }).length

  /* ------------------------------ stylesheets --------------------------- */
  // Same-origin sheets can be read directly; cross-origin ones throw on
  // cssRules, so we hand their URLs back for the main process to fetch.
  let cssText = ''
  const externalSheets: string[] = []
  let sheetCount = 0
  for (const sheet of Array.from(document.styleSheets)) {
    sheetCount++
    try {
      const rules = (sheet as CSSStyleSheet).cssRules
      let chunk = ''
      for (const rule of Array.from(rules)) chunk += rule.cssText + '\n'
      cssText += chunk
    } catch {
      if (sheet.href) externalSheets.push(sheet.href)
    }
  }
  for (const el of Array.from(document.querySelectorAll('style'))) cssText += el.textContent ?? ''

  const perf = (() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    return {
      ttfbMs: nav ? Math.round(nav.responseStart) : 0,
      domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : 0,
      loadMs: nav ? Math.round(nav.loadEventEnd) : 0,
      transferBytes: res.reduce((s, r) => s + (r.transferSize || 0), 0) + (nav?.transferSize ?? 0),
      requestCount: res.length,
      lcpMs: (window as any).__q_lcp ?? null,
      cls: (window as any).__q_cls ?? null,
      longTaskMs: (window as any).__q_longtask ?? 0
    }
  })()

  return {
    title: document.title,
    tokens,
    sections,
    responsive: { horizontalOverflowPx, tinyTextCount, smallTapTargets, overlaps },
    links: Array.from(new Set(links)).slice(0, 200),
    css: { text: cssText.slice(0, 4_000_000), external: externalSheets.slice(0, 30), sheetCount },
    controls,
    signals: {
      imagesMissingAlt,
      h1Count,
      headingOrderIssues,
      focusableWithoutOutline,
      animatedCount,
      docHeight: docH,
      viewportWidth: vw,
      langAttr: document.documentElement.getAttribute('lang'),
      title: document.title,
      metaDescription:
        (document.querySelector('meta[name=description]') as HTMLMetaElement | null)?.content ?? null,
      hasSkipLink: !!document.querySelector('a[href^="#"][class*=skip], a[href="#main"]'),
      buttonsWithoutLabel: Array.from(document.querySelectorAll('button')).filter(
        (b) => !(b.textContent ?? '').trim() && !b.getAttribute('aria-label')
      ).length
    },
    perf
  }
}

/** Installed before navigation so LCP/CLS/long-tasks are observed from t=0. */
export const observerInit = function (): void {
  try {
    ;(window as any).__q_cls = 0
    ;(window as any).__q_longtask = 0
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) (window as any).__q_lcp = Math.round(e.startTime)
    }).observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as any[])
        if (!e.hadRecentInput) (window as any).__q_cls += e.value
    }).observe({ type: 'layout-shift', buffered: true })
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) (window as any).__q_longtask += Math.round(e.duration)
    }).observe({ type: 'longtask', buffered: true })
  } catch {
    /* unsupported */
  }
}
