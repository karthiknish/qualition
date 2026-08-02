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

  // Design-system shells (Astryx et al.) wrap the tree in `display: contents`
  // nodes. Those paint through their children but report a 0×0 box, so a naive
  // visibility check drops the entire app and descent dies at `#root`.
  const isContents = (el: Element): boolean => getComputedStyle(el).display === 'contents'
  const flatChildren = (el: Element): Element[] => {
    const out: Element[] = []
    for (const c of Array.from(el.children)) {
      if (isContents(c)) out.push(...flatChildren(c))
      else out.push(c)
    }
    return out
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
      // A huge px radius is the browser's way of saying "pill"; printing
      // 3.35544e+07px as a design token is noise.
      const normalise = (v: string): string => {
        const px = parseFloat(v)
        return Number.isFinite(px) && px >= 1000 ? 'full' : v
      }
      const parts = cs.borderRadius.split(' ').map(normalise)
      bump(radii, parts.every((p) => p === parts[0]) ? parts[0] : parts.join(' '))
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
  /**
   * Build tools generate class names that change on every build — CSS modules
   * (`styles-module__row___a1B2c`), atomic runtimes (`x1o57wo1`),
   * styled-components (`sc-hKMtZM`), emotion (`css-1a2b3c`), Tailwind
   * arbitrary values. A selector built from those is worthless in a report:
   * it cannot be searched for in the codebase and it is stale by the next
   * deploy. Prefer stable, authored hooks instead.
   */
  const isHashedClass = (c: string): boolean =>
    /^(css-|sc-|jsx-|emotion-|svelte-|_)/.test(c) || // known CSS-in-JS prefixes
    /__[A-Za-z0-9]{4,}$|___[A-Za-z0-9]{4,}$/.test(c) || // CSS modules suffix hash
    /^[a-z]{1,2}[0-9a-z]{6,}$/.test(c) || // atomic runtime (x1o57wo1)
    /^[a-f0-9]{6,}$/i.test(c) || // raw hex hash
    /\[|\]|\//.test(c) // tailwind arbitrary values / variants

  /** A hook a human can actually grep for. */
  const stableHandle = (el: Element): string | null => {
    for (const attr of ['data-testid', 'data-test-id', 'data-test', 'data-component', 'data-qa']) {
      const v = el.getAttribute(attr)
      if (v) return `[${attr}="${v}"]`
    }
    const role = el.getAttribute('role')
    if (role) return `[role="${role}"]`
    const aria = el.getAttribute('aria-label')
    if (aria && aria.length < 40) return `[aria-label="${aria}"]`
    return null
  }

  const cssPath = (el: Element): string => {
    const parts: string[] = []
    let cur: Element | null = el
    let depth = 0
    while (cur && cur !== document.body && depth < 5) {
      let part = cur.tagName.toLowerCase()
      if (cur.id && !isHashedClass(cur.id)) {
        part += `#${cur.id}`
        parts.unshift(part)
        break
      }
      const handle = stableHandle(cur)
      if (handle) {
        part += handle
        parts.unshift(part)
        break
      }
      const cls = (cur.getAttribute('class') ?? '')
        .split(/\s+/)
        .filter((c) => c && !isHashedClass(c) && c.length < 24)
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
    const path = parts.join(' > ')
    // If nothing stable survived, the path is just "div > div > span" — useless
    // on its own, so anchor it with the element's visible text.
    if (!/[#.\[]/.test(path)) {
      const label = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30)
      if (label) return `${path} — text: "${label}"`
    }
    return path
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

  const substantialKids = (el: Element): Element[] =>
    flatChildren(el).filter((c) => isVisible(c) && hasSubstance(c))
  // Thin chrome (top bars, toolbars) is not a section row. Keep descending
  // past "topbar + fill" so we reach the scrollable stack of real bands.
  const contentKids = (el: Element): Element[] => {
    const kids = substantialKids(el)
    const ph = Math.max(el.getBoundingClientRect().height, 1)
    return kids.filter((k) => {
      const h = k.getBoundingClientRect().height
      return h > 100 && h > ph * 0.12
    })
  }
  const descendToBands = (start: Element): Element[] => {
    let best: Element = start
    for (let depth = 0; depth < 40; depth++) {
      const kids = contentKids(best)
      if (kids.length === 1) {
        best = kids[0]
        continue
      }
      break
    }
    return substantialKids(best)
  }

  // SPA fallback: no real section markup — or the only "roots" are viewport-
  // filling shells (`[role=main] > *` matching one 900px stack). Descend into
  // the shell and split the scrollable band stack.
  // Prefer real landmarks over `#root`. `querySelector('main, #root, …')` is
  // document-order, so `#root` wins even when `[role=main]` exists deeper —
  // and `#root`'s only child is often `display: contents`.
  const vh = window.innerHeight
  const realRoots = roots.filter((r) => r.getBoundingClientRect().height < vh * 0.85)
  if (realRoots.length < 2) {
    const pickMain = (): Element => {
      for (const sel of ['main', '[role=main]', '[data-app]', '#app', '#root']) {
        const el = document.querySelector(sel)
        if (el) return el
      }
      return document.body
    }

    const bestStart = pickMain()
    const blocks = descendToBands(bestStart)
    if (blocks.length >= 2) {
      for (const b of blocks) candidates.push(b)
    } else if (bestStart.querySelectorAll('h1,h2,h3,[role=heading]').length >= 2) {
      // One container holding the whole screen is not a section. Slice it at
      // heading boundaries so each labelled area becomes its own section -
      // otherwise every page reports a single 's1' and the per-section
      // references, component picks and critique all collapse onto it.
      let best: Element = bestStart
      for (let depth = 0; depth < 40; depth++) {
        const kids = contentKids(best)
        if (kids.length === 1) {
          best = kids[0]
          continue
        }
        break
      }
      const heads = Array.from(best.querySelectorAll('h1,h2,h3,[role=heading]')).filter(isVisible)
      const headingBlocks = new Set<Element>()
      for (const h of heads) {
        let block: Element | null = h
        // Climb to the block that owns this heading but not the whole screen.
        // Pierce display:contents so every heading does not collapse onto the
        // same zero-box wrapper under `#root`.
        while (block?.parentElement && block.parentElement !== best) {
          const parent: Element = block.parentElement
          if (isContents(parent) || parent.children.length < 2) {
            block = parent
            continue
          }
          break
        }
        while (block && block.parentElement && block.parentElement !== best) block = block.parentElement
        if (block && isVisible(block) && hasSubstance(block)) headingBlocks.add(block)
      }
      if (headingBlocks.size >= 2) for (const b of headingBlocks) candidates.push(b)
      else candidates.push(best)
    } else {
      candidates.push(bestStart)
    }
  }

  // App chrome is a section of its own — always surface it, not only when the
  // content split failed. Otherwise a sidebar+main shell reports as one blob.
  for (const el of Array.from(
    document.querySelectorAll('aside, nav, [role=navigation], [role=complementary]')
  )) {
    if (isVisible(el) && hasSubstance(el) && !candidates.includes(el)) candidates.push(el)
  }

  const footer = document.querySelector('footer, [role=contentinfo]')
  if (footer) candidates.push(footer)

  // Split any candidate that is really a wrapper around several bands, so a
  // single <main> does not become one 1700px "hero".
  // App shells are ~viewport tall with overflow inside — use scrollHeight too,
  // otherwise a 900px shell never crosses the old 1.35×vh gate and never splits.
  const splitOnce = (list: Element[]): { out: Element[]; changed: boolean } => {
    const out: Element[] = []
    let changed = false
    for (const el of list) {
      const h = el.getBoundingClientRect().height
      const sh = (el as HTMLElement).scrollHeight || h
      const isLandmark = /^(header|footer|nav)$/.test(el.tagName.toLowerCase())
      const overflow = sh > vh * 1.15 || h > vh * 1.35
      const viewportShell = h > vh * 0.85
      if (!isLandmark && (overflow || viewportShell)) {
        // Prefer deep band split (pierces chrome + display:contents) over a
        // shallow topbar/fill split that leaves the page as one content blob.
        const deep = descendToBands(el)
        if (deep.length >= 2 && !deep.every((d) => d === el)) {
          out.push(...deep)
          changed = true
          continue
        }
        const kids = substantialKids(el).filter((k) => {
          const r = k.getBoundingClientRect()
          return r.height > 80 && r.width > 160
        })
        if (kids.length >= 2) {
          out.push(...kids)
          changed = true
          continue
        }
        if (kids.length === 1 && kids[0] !== el) {
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

  // A candidate that contains two or more other candidates is a layout shell,
  // not a section. Keeping it made the first accepted section span the whole
  // screen, after which the containment check rejected every real block inside
  // it - which is why every page reported a single 's1'.
  const structural = candidates.filter(
    (el) => candidates.filter((other) => other !== el && el.contains(other)).length >= 2
  )
  const leafCandidates = candidates.filter((el) => !structural.includes(el))
  candidates.length = 0
  candidates.push(...(leafCandidates.length >= 2 ? leafCandidates : [...structural, ...leafCandidates]))

  const seen = new Set<Element>()
  const docH = document.documentElement.scrollHeight
  const sections: any[] = []
  for (const el of candidates) {
    if (seen.has(el) || !isVisible(el)) continue
    const rect = el.getBoundingClientRect()
    const top = rect.top + window.scrollY
    if (rect.height < 56 || rect.height > docH * 1.2) continue
    // Toasts, FABs and floating popovers are not page sections.
    const pos = getComputedStyle(el).position
    if ((pos === 'fixed' || pos === 'absolute') && rect.height < vh * 0.4) continue
    // Empty scaffolding is not a section.
    if (!hasSubstance(el)) continue
    // Skip if nested inside an already-captured section. Must be 2D: a
    // full-height sidebar shares the same y-span as every main band, so a
    // vertical-only check would drop the whole page after accepting nav.
    if (
      sections.some(
        (s) =>
          top >= s.rect.y - 4 &&
          top + rect.height <= s.rect.y + s.rect.height + 4 &&
          rect.x >= s.rect.x - 4 &&
          rect.x + rect.width <= s.rect.x + s.rect.width + 4
      )
    )
      continue
    seen.add(el)

    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    // Ignore headings in hidden popovers/toasts — they steal the section label
    // (e.g. notifications "Caught up" beating the page H1).
    const headings = Array.from(el.querySelectorAll('h1,h2,h3'))
      .filter(isVisible)
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

    // These strings are used verbatim as selectors, so they must NOT be
    // clamped: appending an ellipsis produces a handle that exists nowhere on
    // the page, and a flow built from it can only ever time out.
    const handle = (s: string): string => s.slice(0, 120)

    // A field that is readonly or disabled can never be filled; proposing one
    // as a fill target guarantees a timeout.
    const editable =
      ['input', 'textarea', 'select'].includes(el.tagName.toLowerCase()) &&
      !input.readOnly &&
      !input.disabled &&
      el.getAttribute('aria-disabled') !== 'true' &&
      el.getAttribute('aria-readonly') !== 'true' &&
      !['submit', 'button', 'reset', 'hidden'].includes(el.getAttribute('type') ?? '')

    controls.push({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') ?? '',
      role: el.getAttribute('role') ?? '',
      editable,
      text: handle(text),
      placeholder: handle(el.getAttribute('placeholder') ?? ''),
      label: handle(labelText),
      ariaLabel: handle(el.getAttribute('aria-label') ?? ''),
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
