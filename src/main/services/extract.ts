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

  const isVisible = (el: Element): boolean => {
    if (isDevChrome(el)) return false
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
        /* fall through to geometric check */
      }
    }
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) <= 0.05) return false
    if (cs.pointerEvents === 'none') return false
    let cur: Element | null = el
    while (cur) {
      if ((cur as HTMLElement).inert) return false
      if (cur.getAttribute('aria-hidden') === 'true') return false
      cur = cur.parentElement
    }
    return true
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
    const interactives = Array.from(
      el.querySelectorAll(
        'a,button,input,select,textarea,[role=button],[role=link],[role=tab],[role=menuitem],[role=switch],[role=checkbox]'
      )
    )
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
    const clickable = el.matches(
      'a,button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=switch],[onclick]'
    )
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
      if (ox <= 4 || oy <= 4) continue
      // BBox overlap alone is noisy (stacked cards, absolute badges). Confirm with
      // hit-testing the way Playwright actionability does — centre of A must
      // actually land on B (or vice versa) for a real tap collision.
      const ax = a.left + a.width / 2
      const ay = a.top + a.height / 2
      const bx = b.left + b.width / 2
      const by = b.top + b.height / 2
      const hitA = document.elementFromPoint(ax, ay)
      const hitB = document.elementFromPoint(bx, by)
      const aHitsB =
        !!hitA && (hitA === boxes[j].el || boxes[j].el.contains(hitA)) && !boxes[i].el.contains(hitA)
      const bHitsA =
        !!hitB && (hitB === boxes[i].el || boxes[i].el.contains(hitB)) && !boxes[j].el.contains(hitB)
      if (aHitsB || bHitsA) overlaps++
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
    document.querySelectorAll(
      'a[href], button, input, select, textarea, summary, [role=button], [role=link], [role=tab], [role=menuitem], [role=switch], [role=checkbox], [role=option], [role=combobox]'
    )
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
  const imagesMissingAlt = Array.from(document.querySelectorAll('img')).filter((i) => {
    if (isDevChrome(i) || !isVisible(i)) return false
    // alt="" is a correct decorative marking — only *missing* alt is a defect.
    if (!i.hasAttribute('alt')) return true
    return false
  }).length
  const imagesDecorativeOk = Array.from(document.querySelectorAll('img')).filter(
    (i) => !isDevChrome(i) && isVisible(i) && i.getAttribute('alt') === ''
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
  // document.styleSheets already includes <style> elements — do NOT also
  // append querySelectorAll('style') textContent or bytes/rules double-count.
  const CSS_CAP = 4_000_000
  const sheetsOut: { href: string | null; text: string }[] = []
  const externalSheets: string[] = []
  let sheetCount = 0
  let cssBytes = 0
  let truncated = false
  for (const sheet of Array.from(document.styleSheets)) {
    sheetCount++
    try {
      const rules = (sheet as CSSStyleSheet).cssRules
      let chunk = ''
      for (const rule of Array.from(rules)) chunk += rule.cssText + '\n'
      if (cssBytes >= CSS_CAP) {
        truncated = true
        continue
      }
      if (cssBytes + chunk.length > CSS_CAP) {
        chunk = chunk.slice(0, CSS_CAP - cssBytes)
        truncated = true
      }
      cssBytes += chunk.length
      // Vite injects CSS as <style data-vite-dev-id="/…/node_modules/sonner/…">
      // with sheet.href === null. Without that id, every package sheet looks
      // first-party and sonner's z-index:999999999 grades the product.
      const owner = (sheet as CSSStyleSheet).ownerNode as Element | null
      const viteId = owner?.getAttribute?.('data-vite-dev-id')
      const styleId = owner?.id ? `style:#${owner.id}` : null
      sheetsOut.push({ href: sheet.href ?? viteId ?? styleId, text: chunk })
    } catch {
      if (sheet.href) externalSheets.push(sheet.href)
    }
  }

  let adoptedSheetCount = 0
  try {
    adoptedSheetCount = (document as any).adoptedStyleSheets?.length ?? 0
  } catch {
    adoptedSheetCount = 0
  }
  const styleAttrCount = Array.from(document.querySelectorAll('[style]')).length

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

  /* --------------------- padding / margin / layout ---------------------- */
  // App-shell content column only — nav chrome would drown the signal.
  const layoutRoot =
    document.querySelector('main, [role=main], [class*=layout-content]') || document.body
  const layoutKids = flatChildren(layoutRoot)
    .filter((el) => isVisible(el) && hasSubstance(el))
    .filter((el) => {
      const r = el.getBoundingClientRect()
      return r.height > 40 && r.width > 80
    })
    .slice(0, 40)

  const leftEdges = layoutKids.map((el) => Math.round(el.getBoundingClientRect().left))
  const medianLeft = (() => {
    if (!leftEdges.length) return 0
    const s = [...leftEdges].sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)]
  })()
  const misalignedBands = leftEdges.filter((l) => Math.abs(l - medianLeft) > 8).length

  // Vertical rhythm between consecutive bands (external margin / gap).
  const bandGaps: number[] = []
  for (let i = 1; i < layoutKids.length; i++) {
    const prev = layoutKids[i - 1].getBoundingClientRect()
    const cur = layoutKids[i].getBoundingClientRect()
    const g = Math.round(cur.top - prev.bottom)
    if (g > 0 && g < 240) bandGaps.push(g)
  }
  const gapBuckets = new Map<number, number>()
  for (const g of bandGaps) {
    const bucket = Math.round(g / 4) * 4
    gapBuckets.set(bucket, (gapBuckets.get(bucket) ?? 0) + 1)
  }
  const distinctBandGaps = gapBuckets.size
  const dominantGap = [...gapBuckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
  const offRhythmGaps = bandGaps.filter((g) => dominantGap && Math.abs(g - dominantGap) > 8).length

  // Card-like boxes: asymmetric horizontal padding, sibling padding drift.
  let asymmetricPadding = 0
  let siblingPaddingMismatches = 0
  const cardLike = Array.from(
    (layoutRoot as Element).querySelectorAll('article, [class*=card], [role=listitem], li, section')
  )
    .filter((el) => isVisible(el) && !isDevChrome(el))
    .filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 120 && r.width < 720 && r.height > 48 && r.height < 480
    })
    .slice(0, 80)

  for (const el of cardLike) {
    const cs = getComputedStyle(el)
    const pl = parseFloat(cs.paddingLeft) || 0
    const pr = parseFloat(cs.paddingRight) || 0
    const pt = parseFloat(cs.paddingTop) || 0
    const pb = parseFloat(cs.paddingBottom) || 0
    if (Math.min(pl, pr, pt, pb) >= 4 && (Math.abs(pl - pr) >= 8 || Math.abs(pt - pb) >= 12)) {
      asymmetricPadding++
    }
  }

  // Sibling groups that share a parent: padding-left should match.
  const parents = new Map<Element, Element[]>()
  for (const el of cardLike) {
    const p = el.parentElement
    if (!p) continue
    const list = parents.get(p) ?? []
    list.push(el)
    parents.set(p, list)
  }
  for (const sibs of parents.values()) {
    if (sibs.length < 3) continue
    const pads = sibs.map((el) => {
      const cs = getComputedStyle(el)
      return Math.round(parseFloat(cs.paddingLeft) || 0)
    })
    const mode = [...pads.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<number, number>()).entries()].sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0]
    if (mode == null) continue
    const drift = pads.filter((p) => Math.abs(p - mode) >= 8).length
    if (drift >= 2) siblingPaddingMismatches += drift
  }

  // Unique padding/margin values in the content column (sprawl).
  const padValues = new Set<number>()
  const marginValues = new Set<number>()
  for (const el of Array.from((layoutRoot as Element).querySelectorAll('*'))
    .filter((el) => isVisible(el) && !isDevChrome(el))
    .slice(0, 600)) {
    const cs = getComputedStyle(el)
    for (const p of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const) {
      const v = Math.round(parseFloat(cs[p]) || 0)
      if (v > 0 && v < 200) padValues.add(v)
    }
    for (const p of ['marginTop', 'marginBottom'] as const) {
      const v = Math.round(parseFloat(cs[p]) || 0)
      if (v > 0 && v < 200) marginValues.add(v)
    }
  }

  const layout = {
    bandCount: layoutKids.length,
    misalignedBands,
    distinctBandGaps,
    dominantGap,
    offRhythmGaps,
    asymmetricPadding,
    siblingPaddingMismatches,
    uniquePaddingValues: padValues.size,
    uniqueMarginValues: marginValues.size
  }

  /* --------------------- product polish signals ------------------------- */
  // Empty / loading / microcopy — NN/G empty-state + interaction-states model.
  const VAGUE_EMPTY = /^(no (data|items|results|content|records)|nothing (here|yet|found)|n\/?a|empty|—|-)$/i
  const GENERIC_CTA = /^(submit|click here|learn more|ok|okay|continue|next|save|send|go)$/i
  const vagueEmptyCopy: string[] = []
  const genericCtaLabels: string[] = []
  let emptyRegionsWithoutCta = 0
  let skeletonCount = 0
  let skeletonWithoutMinHeight = 0
  let ariaBusyCount = 0
  let disabledWithoutAria = 0

  for (const el of Array.from(document.querySelectorAll('button, a[href], [role=button]'))
    .filter((e) => isVisible(e) && !isDevChrome(e))
    .slice(0, 200)) {
    const label = ((el as HTMLElement).innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()
    if (label && GENERIC_CTA.test(label)) genericCtaLabels.push(label)
  }

  for (const el of Array.from(
    document.querySelectorAll('[class*=empty], [class*=Empty], [data-empty], [aria-label*=empty i]')
  )
    .filter((e) => isVisible(e) && !isDevChrome(e))
    .slice(0, 40)) {
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    if (t && VAGUE_EMPTY.test(t.split(/[.!]/)[0].trim())) vagueEmptyCopy.push(t.slice(0, 60))
    const hasCta = !!el.querySelector('a[href], button, [role=button]')
    if (!hasCta && (el.textContent || '').trim().length < 120) emptyRegionsWithoutCta++
  }

  // Sparse main-column bands that look empty (no CTA, almost no copy).
  for (const el of layoutKids.slice(0, 20)) {
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim()
    const r = el.getBoundingClientRect()
    if (r.height < 160 || t.length > 80) continue
    const hasCta = !!el.querySelector('a[href], button, [role=button]')
    if (!hasCta && t.length < 40) emptyRegionsWithoutCta++
    if (t && VAGUE_EMPTY.test(t.split(/[.!]/)[0].trim())) vagueEmptyCopy.push(t.slice(0, 60))
  }

  for (const el of Array.from(
    document.querySelectorAll(
      '[class*=skeleton], [class*=Skeleton], [aria-busy=true], [data-loading], .animate-pulse'
    )
  ).slice(0, 60)) {
    if (isDevChrome(el)) continue
    const busy = el.getAttribute('aria-busy') === 'true'
    if (busy) ariaBusyCount++
    const cls = typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className : ''
    if (/skeleton|animate-pulse/i.test(cls) || el.hasAttribute('data-loading')) {
      skeletonCount++
      const mh = parseFloat(getComputedStyle(el).minHeight) || 0
      const h = el.getBoundingClientRect().height
      if (mh < 8 && h < 8) skeletonWithoutMinHeight++
    }
  }

  for (const el of Array.from(document.querySelectorAll('button, input, select, textarea, [role=button]'))
    .filter((e) => isVisible(e) && !isDevChrome(e))
    .slice(0, 200)) {
    const input = el as HTMLInputElement
    if (input.disabled && el.getAttribute('aria-disabled') !== 'true') disabledWithoutAria++
  }

  const polish = {
    emptyRegionsWithoutCta,
    vagueEmptyCopy: [...new Set(vagueEmptyCopy)].slice(0, 8),
    genericCtaLabels: [...new Set(genericCtaLabels)].slice(0, 8),
    skeletonCount,
    skeletonWithoutMinHeight,
    ariaBusyCount,
    disabledWithoutAria
  }

  return {
    title: document.title,
    tokens,
    sections,
    responsive: { horizontalOverflowPx, tinyTextCount, smallTapTargets, overlaps },
    links: Array.from(new Set(links)).slice(0, 200),
    css: {
      sheets: sheetsOut,
      /** @deprecated concat kept for older callers; prefer sheets[] */
      text: sheetsOut.map((s) => s.text).join('\n').slice(0, CSS_CAP),
      external: externalSheets.slice(0, 30),
      sheetCount,
      truncated,
      missedExternalCap: externalSheets.length > 30,
      styleAttrCount,
      adoptedSheetCount
    },
    controls,
    signals: {
      imagesMissingAlt,
      imagesDecorativeOk,
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
      hasSkipLink: !!document.querySelector(
        'a[href^="#"][class*=skip i], a[href="#main"], a[href="#content"], a.skip-to-content, a[href="#app"]'
      ),
      layout,
      polish,
      // Must skip Agentation / Vercel toolbar / etc. — they stay in the DOM
      // after hideDevChrome (display:none) and would otherwise inflate this
      // count into a false "icon-only buttons" finding on every page.
      buttonsWithoutLabel: Array.from(document.querySelectorAll('button')).filter(
        (b) =>
          !isDevChrome(b) &&
          isVisible(b) &&
          !(b.textContent ?? '').trim() &&
          !b.getAttribute('aria-label') &&
          !b.getAttribute('title')
      ).length
    },
    buildContext: (() => {
      const hints: string[] = []
      const scripts = Array.from(document.scripts).map((s) => s.src || '')
      const hrefs = Array.from(document.querySelectorAll('link[rel=stylesheet]')).map(
        (l) => (l as HTMLLinkElement).href || ''
      )
      const all = scripts.concat(hrefs).join('\n')
      if (/\/@vite\/client|\/\.vite\/|@fs\//i.test(all)) hints.push('vite-client')
      if (/@react-refresh|react-refresh/i.test(all)) hints.push('react-refresh')
      if (/_next\/static/i.test(all) && /localhost|127\.0\.0\.1/.test(location.host)) hints.push('next-dev')
      try {
        if ((window as any).__vite_plugin_react_preamble_installed__) hints.push('vite-hmr')
      } catch {
        /* ignore */
      }
      const host = (location.hostname || '').toLowerCase()
      const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')
      let buildMode: 'development' | 'production' | 'unknown' = 'unknown'
      if (hints.length > 0 || isLocal) buildMode = 'development'
      else buildMode = 'production'
      return { buildMode, isLocalTarget: isLocal, buildHints: hints }
    })(),
    perf
  }
}

/**
 * Secondary viewports only need overflow / tap / overlap signals + a screenshot.
 * Full token/section/CSS extraction stays on the primary (desktop) pass.
 */
export const responsiveOnlyFn = function (): {
  horizontalOverflowPx: number
  tinyTextCount: number
  smallTapTargets: number
  overlaps: number
} {
  const vw = window.innerWidth
  let horizontalOverflowPx = Math.max(0, document.documentElement.scrollWidth - vw)
  let tinyTextCount = 0
  let smallTapTargets = 0
  let overlaps = 0
  const isDevChrome = (el: Element | null): boolean => {
    const w = window as unknown as { __qualitionIsDevChrome?: (e: Element | null) => boolean }
    if (typeof w.__qualitionIsDevChrome === 'function') return w.__qualitionIsDevChrome(el)
    return false
  }
  const isVisible = (el: Element): boolean => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    const cs = getComputedStyle(el)
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0'
  }
  const sample = Array.from(document.querySelectorAll('body *'))
    .filter((el) => isVisible(el) && !isDevChrome(el))
    .slice(0, 400)
  for (const el of sample) {
    const r = el.getBoundingClientRect()
    if (r.right > vw + 1) horizontalOverflowPx = Math.max(horizontalOverflowPx, Math.round(r.right - vw))
    const cs = getComputedStyle(el)
    const txt = (el.textContent || '').trim()
    if (txt.length >= 4 && el.children.length === 0 && parseFloat(cs.fontSize) < 12) tinyTextCount++
    const clickable =
      el.tagName === 'A' ||
      el.tagName === 'BUTTON' ||
      el.getAttribute('role') === 'button' ||
      (el as HTMLElement).onclick != null
    if (clickable && (r.height < 32 || r.width < 32) && r.height > 0) smallTapTargets++
  }
  // Cheap overlap sample: adjacent pairs in document order among large boxes.
  const boxes = sample
    .filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 40 && r.height > 40
    })
    .slice(0, 80)
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i].getBoundingClientRect()
    for (let j = i + 1; j < Math.min(i + 6, boxes.length); j++) {
      const b = boxes[j].getBoundingClientRect()
      const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
      const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
      if (ox > 20 && oy > 20 && ox * oy > 400) overlaps++
    }
  }
  return { horizontalOverflowPx, tinyTextCount, smallTapTargets, overlaps }
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
