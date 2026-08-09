// ../../../../private/tmp/stress-stress.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as join4 } from "node:path";

// src/main/services/crawler.ts
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { join as join3 } from "node:path";

// src/main/services/extract.ts
var extractFn = function() {
  const clamp = (s, n) => s.length > n ? s.slice(0, n) + "\u2026" : s;
  const bump = (m, k4) => {
    m.set(k4, (m.get(k4) ?? 0) + 1);
  };
  const cctx = document.createElement("canvas").getContext("2d");
  const colorCache = /* @__PURE__ */ new Map();
  const norm = (c2) => {
    if (!c2 || !cctx) return c2;
    if (c2.startsWith("rgb") || c2.startsWith("#")) return c2;
    const hit = colorCache.get(c2);
    if (hit) return hit;
    let out = c2;
    try {
      cctx.clearRect(0, 0, 1, 1);
      cctx.fillStyle = c2;
      cctx.fillRect(0, 0, 1, 1);
      const d = cctx.getImageData(0, 0, 1, 1).data;
      out = d[3] === 255 ? `rgb(${d[0]}, ${d[1]}, ${d[2]})` : `rgba(${d[0]}, ${d[1]}, ${d[2]}, ${(d[3] / 255).toFixed(2)})`;
    } catch {
    }
    colorCache.set(c2, out);
    return out;
  };
  const isDevChrome = (el) => {
    const w = window;
    if (typeof w.__qualitionIsDevChrome === "function") return w.__qualitionIsDevChrome(el);
    let cur = el;
    while (cur && cur !== document.documentElement) {
      if (cur.hasAttribute("data-feedback-toolbar") || cur.hasAttribute("data-annotation-popup") || cur.hasAttribute("data-annotation-marker") || cur.hasAttribute("data-agentation-root") || cur.hasAttribute("data-agentation-toolbar") || cur.hasAttribute("data-agentation-settings-panel") || cur.hasAttribute("data-vercel-toolbar") || cur.hasAttribute("data-nextjs-toast") || cur.hasAttribute("data-nextjs-dialog") || cur.hasAttribute("data-nextjs-dialog-overlay") || cur.hasAttribute("data-react-scan") || cur.hasAttribute("data-stagewise") || cur.hasAttribute("data-q-dev-chrome"))
        return true;
      const id = (cur.id || "").toLowerCase();
      if (id.includes("agentation") || id === "react-scan-root" || id === "__stagewise_container") return true;
      const cls = typeof cur.className === "string" ? cur.className.toLowerCase() : "";
      if (cls.includes("agentation") || cls.includes("falnor-agentation")) return true;
      if (cur.tagName.toLowerCase() === "nextjs-portal") return true;
      cur = cur.parentElement;
    }
    return false;
  };
  const isVisible = (el) => {
    if (isDevChrome(el)) return false;
    const anyEl = el;
    if (typeof anyEl.checkVisibility === "function") {
      try {
        if (!anyEl.checkVisibility({
          checkOpacity: true,
          checkVisibilityCSS: true,
          contentVisibilityAuto: true
        }))
          return false;
      } catch {
      }
    }
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) <= 0.05) return false;
    if (cs.pointerEvents === "none") return false;
    let cur = el;
    while (cur) {
      if (cur.inert) return false;
      if (cur.getAttribute("aria-hidden") === "true") return false;
      cur = cur.parentElement;
    }
    return true;
  };
  const isContents = (el) => getComputedStyle(el).display === "contents";
  const flatChildren = (el) => {
    const out = [];
    for (const c2 of Array.from(el.children)) {
      if (isContents(c2)) out.push(...flatChildren(c2));
      else out.push(c2);
    }
    return out;
  };
  const colorBg = /* @__PURE__ */ new Map();
  const colorText = /* @__PURE__ */ new Map();
  const colorBorder = /* @__PURE__ */ new Map();
  const fonts = /* @__PURE__ */ new Map();
  const sizes = /* @__PURE__ */ new Map();
  const weights = /* @__PURE__ */ new Map();
  const radii = /* @__PURE__ */ new Map();
  const shadows = /* @__PURE__ */ new Map();
  const spacing = /* @__PURE__ */ new Map();
  const transitions = /* @__PURE__ */ new Map();
  const all = Array.from(document.querySelectorAll("body *")).filter(isVisible).slice(0, 4e3);
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)") bump(colorBg, norm(cs.backgroundColor));
    if (el.textContent && el.textContent.trim().length > 0) {
      bump(colorText, norm(cs.color));
      bump(fonts, cs.fontFamily.split(",")[0].replace(/["']/g, "").trim());
      bump(sizes, String(Math.round(parseFloat(cs.fontSize))));
      bump(weights, String(cs.fontWeight));
    }
    if (cs.borderTopWidth !== "0px" && cs.borderTopColor) bump(colorBorder, norm(cs.borderTopColor));
    if (cs.borderRadius && cs.borderRadius !== "0px") {
      const normalise = (v) => {
        const px = parseFloat(v);
        return Number.isFinite(px) && px >= 1e3 ? "full" : v;
      };
      const parts = cs.borderRadius.split(" ").map(normalise);
      bump(radii, parts.every((p4) => p4 === parts[0]) ? parts[0] : parts.join(" "));
    }
    if (cs.boxShadow && cs.boxShadow !== "none") bump(shadows, clamp(cs.boxShadow, 60));
    for (const p4 of ["paddingTop", "paddingBottom", "marginTop", "marginBottom", "gap"]) {
      const v = parseFloat(cs[p4]);
      if (v > 0) bump(spacing, String(Math.round(v)));
    }
    if (cs.transitionDuration && cs.transitionDuration !== "0s")
      bump(transitions, `${cs.transitionDuration} ${cs.transitionTimingFunction}`);
  }
  const toArr = (m, numeric = false) => Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([value, usage]) => ({ value: numeric ? Number(value) : value, usage }));
  const tokens = {
    colors: [
      ...toArr(colorBg).map((c2) => ({ ...c2, role: "bg" })),
      ...toArr(colorText).map((c2) => ({ ...c2, role: "text" })),
      ...toArr(colorBorder).map((c2) => ({ ...c2, role: "border" }))
    ],
    fontFamilies: toArr(fonts),
    fontSizes: toArr(sizes, true),
    fontWeights: toArr(weights, true),
    radii: toArr(radii),
    shadows: toArr(shadows),
    spacing: toArr(spacing, true),
    transitions: toArr(transitions)
  };
  const isHashedClass = (c2) => /^(css-|sc-|jsx-|emotion-|svelte-|_)/.test(c2) || // known CSS-in-JS prefixes
  /__[A-Za-z0-9]{4,}$|___[A-Za-z0-9]{4,}$/.test(c2) || // CSS modules suffix hash
  /^[a-z]{1,2}[0-9a-z]{6,}$/.test(c2) || // atomic runtime (x1o57wo1)
  /^[a-f0-9]{6,}$/i.test(c2) || // raw hex hash
  /\[|\]|\//.test(c2);
  const stableHandle = (el) => {
    for (const attr of ["data-testid", "data-test-id", "data-test", "data-component", "data-qa"]) {
      const v = el.getAttribute(attr);
      if (v) return `[${attr}="${v}"]`;
    }
    const role = el.getAttribute("role");
    if (role) return `[role="${role}"]`;
    const aria = el.getAttribute("aria-label");
    if (aria && aria.length < 40) return `[aria-label="${aria}"]`;
    return null;
  };
  const cssPath = (el) => {
    const parts = [];
    let cur = el;
    let depth2 = 0;
    while (cur && cur !== document.body && depth2 < 5) {
      let part = cur.tagName.toLowerCase();
      if (cur.id && !isHashedClass(cur.id)) {
        part += `#${cur.id}`;
        parts.unshift(part);
        break;
      }
      const handle = stableHandle(cur);
      if (handle) {
        part += handle;
        parts.unshift(part);
        break;
      }
      const cls = (cur.getAttribute("class") ?? "").split(/\s+/).filter((c2) => c2 && !isHashedClass(c2) && c2.length < 24).slice(0, 2);
      if (cls.length) part += "." + cls.join(".");
      const parent = cur.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter((c2) => c2.tagName === cur.tagName);
        if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
      }
      parts.unshift(part);
      cur = cur.parentElement;
      depth2++;
    }
    const path = parts.join(" > ");
    if (!/[#.\[]/.test(path)) {
      const label = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
      if (label) return `${path} \u2014 text: "${label}"`;
    }
    return path;
  };
  const substance = (el) => {
    const text = (el.textContent ?? "").trim().length;
    const controls2 = el.querySelectorAll("a,button,input,select,textarea,[role=button]").length;
    const media = el.querySelectorAll("img,svg,video,canvas,picture").length;
    return text + controls2 * 40 + media * 25;
  };
  const hasSubstance = (el) => substance(el) >= 60;
  const candidates = [];
  const header = document.querySelector("header, [role=banner]");
  if (header) candidates.push(header);
  const roots = Array.from(
    document.querySelectorAll(
      "main > section, main > article, main > div[class], body > section, body > div > section, main section, article, [data-section], [role=region], [role=main] > *"
    )
  ).filter(hasSubstance);
  for (const r of roots) candidates.push(r);
  const substantialKids = (el) => flatChildren(el).filter((c2) => isVisible(c2) && hasSubstance(c2));
  const contentKids = (el) => {
    const kids = substantialKids(el);
    const ph = Math.max(el.getBoundingClientRect().height, 1);
    return kids.filter((k4) => {
      const h = k4.getBoundingClientRect().height;
      return h > 100 && h > ph * 0.12;
    });
  };
  const descendToBands = (start) => {
    let best = start;
    for (let depth2 = 0; depth2 < 40; depth2++) {
      const kids = contentKids(best);
      if (kids.length === 1) {
        best = kids[0];
        continue;
      }
      break;
    }
    return substantialKids(best);
  };
  const vh = window.innerHeight;
  const realRoots = roots.filter((r) => r.getBoundingClientRect().height < vh * 0.85);
  if (realRoots.length < 2) {
    const pickMain = () => {
      for (const sel of ["main", "[role=main]", "[data-app]", "#app", "#root"]) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return document.body;
    };
    const bestStart = pickMain();
    const blocks = descendToBands(bestStart);
    if (blocks.length >= 2) {
      for (const b of blocks) candidates.push(b);
    } else if (bestStart.querySelectorAll("h1,h2,h3,[role=heading]").length >= 2) {
      let best = bestStart;
      for (let depth2 = 0; depth2 < 40; depth2++) {
        const kids = contentKids(best);
        if (kids.length === 1) {
          best = kids[0];
          continue;
        }
        break;
      }
      const heads = Array.from(best.querySelectorAll("h1,h2,h3,[role=heading]")).filter(isVisible);
      const headingBlocks = /* @__PURE__ */ new Set();
      for (const h of heads) {
        let block = h;
        while (block?.parentElement && block.parentElement !== best) {
          const parent = block.parentElement;
          if (isContents(parent) || parent.children.length < 2) {
            block = parent;
            continue;
          }
          break;
        }
        while (block && block.parentElement && block.parentElement !== best) block = block.parentElement;
        if (block && isVisible(block) && hasSubstance(block)) headingBlocks.add(block);
      }
      if (headingBlocks.size >= 2) for (const b of headingBlocks) candidates.push(b);
      else candidates.push(best);
    } else {
      candidates.push(bestStart);
    }
  }
  for (const el of Array.from(
    document.querySelectorAll("aside, nav, [role=navigation], [role=complementary]")
  )) {
    if (isVisible(el) && hasSubstance(el) && !candidates.includes(el)) candidates.push(el);
  }
  const footer = document.querySelector("footer, [role=contentinfo]");
  if (footer) candidates.push(footer);
  const splitOnce = (list) => {
    const out = [];
    let changed = false;
    for (const el of list) {
      const h = el.getBoundingClientRect().height;
      const sh = el.scrollHeight || h;
      const isLandmark = /^(header|footer|nav)$/.test(el.tagName.toLowerCase());
      const overflow = sh > vh * 1.15 || h > vh * 1.35;
      const viewportShell = h > vh * 0.85;
      if (!isLandmark && (overflow || viewportShell)) {
        const deep = descendToBands(el);
        if (deep.length >= 2 && !deep.every((d) => d === el)) {
          out.push(...deep);
          changed = true;
          continue;
        }
        const kids = substantialKids(el).filter((k4) => {
          const r = k4.getBoundingClientRect();
          return r.height > 80 && r.width > 160;
        });
        if (kids.length >= 2) {
          out.push(...kids);
          changed = true;
          continue;
        }
        if (kids.length === 1 && kids[0] !== el) {
          out.push(kids[0]);
          changed = true;
          continue;
        }
      }
      out.push(el);
    }
    return { out, changed };
  };
  let work = candidates.slice();
  for (let pass = 0; pass < 4; pass++) {
    const { out, changed } = splitOnce(work);
    work = out;
    if (!changed) break;
  }
  candidates.length = 0;
  candidates.push(...work);
  const structural = candidates.filter(
    (el) => candidates.filter((other) => other !== el && el.contains(other)).length >= 2
  );
  const leafCandidates = candidates.filter((el) => !structural.includes(el));
  candidates.length = 0;
  candidates.push(...leafCandidates.length >= 2 ? leafCandidates : [...structural, ...leafCandidates]);
  const seen = /* @__PURE__ */ new Set();
  const docH = document.documentElement.scrollHeight;
  const sections = [];
  for (const el of candidates) {
    if (seen.has(el) || !isVisible(el)) continue;
    const rect = el.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    if (rect.height < 56 || rect.height > docH * 1.2) continue;
    const pos = getComputedStyle(el).position;
    if ((pos === "fixed" || pos === "absolute") && rect.height < vh * 0.4) continue;
    if (!hasSubstance(el)) continue;
    if (sections.some(
      (s) => top >= s.rect.y - 4 && top + rect.height <= s.rect.y + s.rect.height + 4 && rect.x >= s.rect.x - 4 && rect.x + rect.width <= s.rect.x + s.rect.width + 4
    ))
      continue;
    seen.add(el);
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    const headings = Array.from(el.querySelectorAll("h1,h2,h3")).filter(isVisible).map((h) => (h.textContent ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 6);
    const interactives = Array.from(
      el.querySelectorAll(
        "a,button,input,select,textarea,[role=button],[role=link],[role=tab],[role=menuitem],[role=switch],[role=checkbox]"
      )
    );
    const ctaLabels = interactives.map((b) => (b.textContent ?? b.value ?? "").replace(/\s+/g, " ").trim()).filter((t) => t && t.length < 40).slice(0, 8);
    const images = el.querySelectorAll("img,svg,video,picture,canvas");
    const tagCounts = /* @__PURE__ */ new Map();
    for (const c2 of Array.from(el.querySelectorAll("*")).slice(0, 800)) bump(tagCounts, c2.tagName.toLowerCase());
    const bgSet = /* @__PURE__ */ new Set();
    const fsSet = /* @__PURE__ */ new Set();
    let maxTextWidth = 0;
    for (const c2 of Array.from(el.querySelectorAll("*")).slice(0, 600)) {
      if (!isVisible(c2)) continue;
      const cs = getComputedStyle(c2);
      if (cs.backgroundColor !== "rgba(0, 0, 0, 0)") bgSet.add(norm(cs.backgroundColor));
      const t = (c2.textContent ?? "").trim();
      if (t.length > 0 && c2.children.length === 0) {
        fsSet.add(cs.fontSize);
        const w = c2.getBoundingClientRect().width;
        if (t.length > 80 && w > maxTextWidth) maxTextWidth = w;
      }
    }
    const lower = text.toLowerCase().slice(0, 4e3);
    const tag = el.tagName.toLowerCase();
    const scores = {
      nav: 0,
      hero: 0,
      features: 0,
      pricing: 0,
      testimonials: 0,
      logos: 0,
      faq: 0,
      cta: 0,
      form: 0,
      table: 0,
      gallery: 0,
      stats: 0,
      footer: 0,
      content: 0.4
    };
    if (tag === "header" || tag === "nav" || el.getAttribute("role") === "banner") scores.nav += 2.2;
    else if (el.querySelector("nav") && rect.height < 220) scores.nav += 1.4;
    if (tag === "footer" || el.getAttribute("role") === "contentinfo") scores.footer += 3;
    if (top < 200 && rect.height > 260 && headings.length > 0) scores.hero += 2.4;
    if (/\$|\/mo|per month|pricing|free plan|most popular|billed annually/.test(lower)) scores.pricing += 2.2;
    if (/testimonial|“|”|loved by|what our|customers say|trusted by \d/.test(lower)) scores.testimonials += 1.6;
    if (el.querySelectorAll("img").length >= 4 && text.length < 400) scores.logos += 1.6;
    if (/faq|frequently asked|question/.test(lower) || el.querySelectorAll("details,[data-state]").length >= 3)
      scores.faq += 1.8;
    if (el.querySelector("form") || el.querySelectorAll("input,textarea,select").length >= 2) scores.form += 2.2;
    if (el.querySelector("table") || el.querySelectorAll("[role=row]").length > 2) scores.table += 2.6;
    if (el.querySelectorAll("img,picture,video").length >= 6) scores.gallery += 1.4;
    if (/\b\d{1,3}(\.\d+)?(%|k|m|x|\+)\b/i.test(lower) && text.length < 700) scores.stats += 1.2;
    if (interactives.length <= 3 && headings.length === 1 && text.length < 320 && top > 400) scores.cta += 1.5;
    const repeated = Array.from(tagCounts.entries()).some(([t, n]) => ["li", "article"].includes(t) && n >= 3);
    if (repeated && headings.length >= 2) scores.features += 1.4;
    if (/feature|why |built for|everything you need|how it works/.test(lower)) scores.features += 1.1;
    let role = "content";
    let best = 0;
    for (const [k4, v] of Object.entries(scores)) if (v > best) {
      best = v;
      role = k4;
    }
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
      components: Array.from(tagCounts.entries()).filter(([t]) => ["a", "button", "input", "img", "svg", "li", "table", "form", "select", "video", "article", "h1", "h2", "h3"].includes(t)).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tagName, count]) => ({ tag: tagName, role: null, text: "", count })),
      stats: {
        interactiveCount: interactives.length,
        imageCount: images.length,
        textDensity: Math.round(text.length / Math.max(1, rect.width * rect.height) * 1e5) / 100,
        distinctBgColors: bgSet.size,
        distinctFontSizes: fsSet.size,
        maxTextWidthPx: Math.round(maxTextWidth)
      }
    });
  }
  const vw = window.innerWidth;
  let horizontalOverflowPx = Math.max(0, document.documentElement.scrollWidth - vw);
  let tinyTextCount = 0;
  let smallTapTargets = 0;
  let overlaps = 0;
  const boxes = [];
  for (const el of all) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const txt = (el.textContent ?? "").trim();
    if (txt.length >= 4 && el.children.length === 0 && parseFloat(cs.fontSize) < 12) tinyTextCount++;
    const clickable = el.matches(
      "a,button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=switch],[onclick]"
    );
    if (clickable && (r.height < 32 || r.width < 32) && r.height > 0) smallTapTargets++;
    if (clickable && r.width > 0) boxes.push({ r, el });
  }
  for (let i = 0; i < Math.min(boxes.length, 120); i++) {
    for (let j = i + 1; j < Math.min(boxes.length, 120); j++) {
      const a = boxes[i].r;
      const b = boxes[j].r;
      if (boxes[i].el.contains(boxes[j].el) || boxes[j].el.contains(boxes[i].el)) continue;
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox <= 4 || oy <= 4) continue;
      const ax = a.left + a.width / 2;
      const ay = a.top + a.height / 2;
      const bx = b.left + b.width / 2;
      const by = b.top + b.height / 2;
      const hitA = document.elementFromPoint(ax, ay);
      const hitB = document.elementFromPoint(bx, by);
      const aHitsB = !!hitA && (hitA === boxes[j].el || boxes[j].el.contains(hitA)) && !boxes[i].el.contains(hitA);
      const bHitsA = !!hitB && (hitB === boxes[i].el || boxes[i].el.contains(hitB)) && !boxes[j].el.contains(hitB);
      if (aHitsB || bHitsA) overlaps++;
    }
  }
  const links = Array.from(document.querySelectorAll("a[href]")).map((a) => a.href).filter((h) => h.startsWith("http"));
  const controls = [];
  for (const el of Array.from(
    document.querySelectorAll(
      "a[href], button, input, select, textarea, summary, [role=button], [role=link], [role=tab], [role=menuitem], [role=switch], [role=checkbox], [role=option], [role=combobox]"
    )
  )) {
    if (!isVisible(el) || controls.length >= 120) continue;
    const input = el;
    const labelText = input.labels && input.labels.length > 0 ? (input.labels[0].textContent ?? "").replace(/\s+/g, " ").trim() : "";
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    const handle = (s) => s.slice(0, 120);
    const editable = ["input", "textarea", "select"].includes(el.tagName.toLowerCase()) && !input.readOnly && !input.disabled && el.getAttribute("aria-disabled") !== "true" && el.getAttribute("aria-readonly") !== "true" && !["submit", "button", "reset", "hidden"].includes(el.getAttribute("type") ?? "");
    controls.push({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type") ?? "",
      role: el.getAttribute("role") ?? "",
      editable,
      text: handle(text),
      placeholder: handle(el.getAttribute("placeholder") ?? ""),
      label: handle(labelText),
      ariaLabel: handle(el.getAttribute("aria-label") ?? ""),
      name: el.getAttribute("name") ?? "",
      href: el.getAttribute("href") ?? "",
      testId: el.getAttribute("data-testid") ?? el.getAttribute("data-test-id") ?? ""
    });
  }
  const imagesMissingAlt = Array.from(document.querySelectorAll("img")).filter((i) => {
    if (isDevChrome(i) || !isVisible(i)) return false;
    if (!i.hasAttribute("alt")) return true;
    return false;
  }).length;
  const imagesDecorativeOk = Array.from(document.querySelectorAll("img")).filter(
    (i) => !isDevChrome(i) && isVisible(i) && i.getAttribute("alt") === ""
  ).length;
  const h1Count = document.querySelectorAll("h1").length;
  const headingOrderIssues = (() => {
    let last = 0;
    let bad = 0;
    for (const h of Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))) {
      const lvl = Number(h.tagName[1]);
      if (last && lvl > last + 1) bad++;
      last = lvl;
    }
    return bad;
  })();
  const focusableWithoutOutline = (() => {
    let n = 0;
    for (const el of Array.from(document.querySelectorAll("a,button,input,select,textarea")).slice(0, 200)) {
      const cs = getComputedStyle(el);
      if (cs.outlineStyle === "none" && !/focus/.test(el.getAttribute("class") ?? "")) n++;
    }
    return n;
  })();
  const animatedCount = all.filter((el) => {
    const cs = getComputedStyle(el);
    return cs.animationName !== "none" || cs.transitionDuration !== "0s";
  }).length;
  const CSS_CAP = 4e6;
  const sheetsOut = [];
  const externalSheets = [];
  let sheetCount = 0;
  let cssBytes = 0;
  let truncated = false;
  for (const sheet of Array.from(document.styleSheets)) {
    sheetCount++;
    try {
      const rules = sheet.cssRules;
      let chunk = "";
      for (const rule of Array.from(rules)) chunk += rule.cssText + "\n";
      if (cssBytes >= CSS_CAP) {
        truncated = true;
        continue;
      }
      if (cssBytes + chunk.length > CSS_CAP) {
        chunk = chunk.slice(0, CSS_CAP - cssBytes);
        truncated = true;
      }
      cssBytes += chunk.length;
      const owner = sheet.ownerNode;
      const viteId = owner?.getAttribute?.("data-vite-dev-id");
      const styleId = owner?.id ? `style:#${owner.id}` : null;
      sheetsOut.push({ href: sheet.href ?? viteId ?? styleId, text: chunk });
    } catch {
      if (sheet.href) externalSheets.push(sheet.href);
    }
  }
  let adoptedSheetCount = 0;
  try {
    adoptedSheetCount = document.adoptedStyleSheets?.length ?? 0;
  } catch {
    adoptedSheetCount = 0;
  }
  const styleAttrCount = Array.from(document.querySelectorAll("[style]")).length;
  const perf = (() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const res = performance.getEntriesByType("resource");
    return {
      ttfbMs: nav ? Math.round(nav.responseStart) : 0,
      domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : 0,
      loadMs: nav ? Math.round(nav.loadEventEnd) : 0,
      transferBytes: res.reduce((s, r) => s + (r.transferSize || 0), 0) + (nav?.transferSize ?? 0),
      requestCount: res.length,
      lcpMs: window.__q_lcp ?? null,
      cls: window.__q_cls ?? null,
      longTaskMs: window.__q_longtask ?? 0
    };
  })();
  const layoutRoot = document.querySelector("main, [role=main], [class*=layout-content]") || document.body;
  const layoutKids = flatChildren(layoutRoot).filter((el) => isVisible(el) && hasSubstance(el)).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.height > 40 && r.width > 80;
  }).slice(0, 40);
  const leftEdges = layoutKids.map((el) => Math.round(el.getBoundingClientRect().left));
  const medianLeft = (() => {
    if (!leftEdges.length) return 0;
    const s = [...leftEdges].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  })();
  const misalignedBands = leftEdges.filter((l) => Math.abs(l - medianLeft) > 8).length;
  const bandGaps = [];
  for (let i = 1; i < layoutKids.length; i++) {
    const prev = layoutKids[i - 1].getBoundingClientRect();
    const cur = layoutKids[i].getBoundingClientRect();
    const g = Math.round(cur.top - prev.bottom);
    if (g > 0 && g < 240) bandGaps.push(g);
  }
  const gapBuckets = /* @__PURE__ */ new Map();
  for (const g of bandGaps) {
    const bucket = Math.round(g / 4) * 4;
    gapBuckets.set(bucket, (gapBuckets.get(bucket) ?? 0) + 1);
  }
  const distinctBandGaps = gapBuckets.size;
  const dominantGap = [...gapBuckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const offRhythmGaps = bandGaps.filter((g) => dominantGap && Math.abs(g - dominantGap) > 8).length;
  let asymmetricPadding = 0;
  let siblingPaddingMismatches = 0;
  const cardLike = Array.from(
    layoutRoot.querySelectorAll("article, [class*=card], [role=listitem], li, section")
  ).filter((el) => isVisible(el) && !isDevChrome(el)).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 120 && r.width < 720 && r.height > 48 && r.height < 480;
  }).slice(0, 80);
  for (const el of cardLike) {
    const cs = getComputedStyle(el);
    const pl = parseFloat(cs.paddingLeft) || 0;
    const pr = parseFloat(cs.paddingRight) || 0;
    const pt = parseFloat(cs.paddingTop) || 0;
    const pb = parseFloat(cs.paddingBottom) || 0;
    if (Math.min(pl, pr, pt, pb) >= 4 && (Math.abs(pl - pr) >= 8 || Math.abs(pt - pb) >= 12)) {
      asymmetricPadding++;
    }
  }
  const parents = /* @__PURE__ */ new Map();
  for (const el of cardLike) {
    const p4 = el.parentElement;
    if (!p4) continue;
    const list = parents.get(p4) ?? [];
    list.push(el);
    parents.set(p4, list);
  }
  for (const sibs of parents.values()) {
    if (sibs.length < 3) continue;
    const pads = sibs.map((el) => {
      const cs = getComputedStyle(el);
      return Math.round(parseFloat(cs.paddingLeft) || 0);
    });
    const mode = [...pads.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), /* @__PURE__ */ new Map()).entries()].sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0];
    if (mode == null) continue;
    const drift = pads.filter((p4) => Math.abs(p4 - mode) >= 8).length;
    if (drift >= 2) siblingPaddingMismatches += drift;
  }
  const padValues = /* @__PURE__ */ new Set();
  const marginValues = /* @__PURE__ */ new Set();
  for (const el of Array.from(layoutRoot.querySelectorAll("*")).filter((el2) => isVisible(el2) && !isDevChrome(el2)).slice(0, 600)) {
    const cs = getComputedStyle(el);
    for (const p4 of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]) {
      const v = Math.round(parseFloat(cs[p4]) || 0);
      if (v > 0 && v < 200) padValues.add(v);
    }
    for (const p4 of ["marginTop", "marginBottom"]) {
      const v = Math.round(parseFloat(cs[p4]) || 0);
      if (v > 0 && v < 200) marginValues.add(v);
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
  };
  const VAGUE_EMPTY = /^(no (data|items|results|content|records)|nothing (here|yet|found)|n\/?a|empty|—|-)$/i;
  const GENERIC_CTA = /^(submit|click here|learn more|ok|okay|continue|next|save|send|go)$/i;
  const vagueEmptyCopy = [];
  const genericCtaLabels = [];
  let emptyRegionsWithoutCta = 0;
  let skeletonCount = 0;
  let skeletonWithoutMinHeight = 0;
  let ariaBusyCount = 0;
  let disabledWithoutAria = 0;
  for (const el of Array.from(document.querySelectorAll("button, a[href], [role=button]")).filter((e4) => isVisible(e4) && !isDevChrome(e4)).slice(0, 200)) {
    const label = (el.innerText || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
    if (label && GENERIC_CTA.test(label)) genericCtaLabels.push(label);
  }
  for (const el of Array.from(
    document.querySelectorAll("[class*=empty], [class*=Empty], [data-empty], [aria-label*=empty i]")
  ).filter((e4) => isVisible(e4) && !isDevChrome(e4)).slice(0, 40)) {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (t && VAGUE_EMPTY.test(t.split(/[.!]/)[0].trim())) vagueEmptyCopy.push(t.slice(0, 60));
    const hasCta = !!el.querySelector("a[href], button, [role=button]");
    if (!hasCta && (el.textContent || "").trim().length < 120) emptyRegionsWithoutCta++;
  }
  for (const el of layoutKids.slice(0, 20)) {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    const r = el.getBoundingClientRect();
    if (r.height < 160 || t.length > 80) continue;
    const hasCta = !!el.querySelector("a[href], button, [role=button]");
    if (!hasCta && t.length < 40) emptyRegionsWithoutCta++;
    if (t && VAGUE_EMPTY.test(t.split(/[.!]/)[0].trim())) vagueEmptyCopy.push(t.slice(0, 60));
  }
  for (const el of Array.from(
    document.querySelectorAll(
      "[class*=skeleton], [class*=Skeleton], [aria-busy=true], [data-loading], .animate-pulse"
    )
  ).slice(0, 60)) {
    if (isDevChrome(el)) continue;
    const busy = el.getAttribute("aria-busy") === "true";
    if (busy) ariaBusyCount++;
    const cls = typeof el.className === "string" ? el.className : "";
    if (/skeleton|animate-pulse/i.test(cls) || el.hasAttribute("data-loading")) {
      skeletonCount++;
      const mh = parseFloat(getComputedStyle(el).minHeight) || 0;
      const h = el.getBoundingClientRect().height;
      if (mh < 8 && h < 8) skeletonWithoutMinHeight++;
    }
  }
  for (const el of Array.from(document.querySelectorAll("button, input, select, textarea, [role=button]")).filter((e4) => isVisible(e4) && !isDevChrome(e4)).slice(0, 200)) {
    const input = el;
    if (input.disabled && el.getAttribute("aria-disabled") !== "true") disabledWithoutAria++;
  }
  const polishRoot = document.querySelector("main, [role=main]") || document.body;
  const polishText = (polishRoot.innerText || polishRoot.textContent || "").replace(/\s+/g, " ").trim();
  const connectingCopy = /\b(connecting|still loading|please wait|loading)\b/i.test(
    polishText.slice(0, 280)
  );
  const spinnerLikely = !!document.querySelector(
    '[class*="spinner" i], [class*="loading" i], [role="progressbar"], svg[class*="spin" i], [data-loading], [aria-busy="true"]'
  );
  const bareLoadingShell = connectingCopy && polishText.length < 120 && skeletonCount < 4 && (spinnerLikely || polishText.length < 48);
  const stuckLoading = connectingCopy && skeletonCount >= 4 || bareLoadingShell;
  const polish = {
    emptyRegionsWithoutCta,
    vagueEmptyCopy: [...new Set(vagueEmptyCopy)].slice(0, 8),
    genericCtaLabels: [...new Set(genericCtaLabels)].slice(0, 8),
    skeletonCount,
    skeletonWithoutMinHeight,
    ariaBusyCount,
    disabledWithoutAria,
    connectingCopy,
    stuckLoading,
    bareLoadingShell
  };
  const SOFT_404 = /\b((?:run|task|agent|record|item|trace|page|instruction|instructions|workflow|claim)\s+not\s+found|not\s+found|no\s+[^\n.]{0,40}\s+at\s+this\s+address|does(?:\s*not|n't)\s+exist|page\s+not\s+found|could(?:\s*not|n't)\s+find|nothing\s+(here|to\s+show)|no\s+longer\s+available|unknown\s+(run|record|item|id|trace|task)|invalid\s+(run|id|link|url)|was\s+deleted|has\s+been\s+removed|no\s+(run|record|task|item|trace|agent|page)\s+(here|found|at\s+this)|can't\s+find|cannot\s+find|not\s+on\s+this\s+desk)\b/i;
  const RECORD_CHROME = /\b(waiting on you|waiting on a person|stop this run|open workflow|open task|open review|approve|keep waiting|steps|send back|park for human|claim\s+[a-z0-9-]+)\b/gi;
  const mainEl = document.querySelector("main, [role=main]") || document.querySelector("[data-testid*=content i], [class*=page-content i], [class*=main-content i]") || document.body;
  const stripChromeText = (root) => {
    const clone = root.cloneNode(true);
    for (const n of Array.from(
      clone.querySelectorAll("nav, aside, [role=navigation], [role=complementary], header, footer, [data-sidebar]")
    )) {
      n.remove();
    }
    return (clone.innerText || clone.textContent || "").replace(/\s+/g, " ").trim();
  };
  const mainText = stripChromeText(mainEl);
  const h1Text = Array.from(document.querySelectorAll("h1")).filter((h) => {
    const r = h.getBoundingClientRect();
    const cs = getComputedStyle(h);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  }).map((h) => (h.textContent || "").trim()).filter(Boolean).join(" \xB7 ");
  const titleText = document.title || "";
  const mainActions = mainEl.querySelectorAll("a[href], button, [role=button]").length;
  const headingSoft = SOFT_404.test(h1Text) || SOFT_404.test(titleText);
  let recordSignals = 0;
  const recordBlob = `${h1Text} ${mainText.slice(0, 800)}`;
  while (RECORD_CHROME.exec(recordBlob)) recordSignals++;
  const soft404Evidence = headingSoft ? [h1Text, titleText].find((t) => SOFT_404.test(t)) || h1Text || titleText : "";
  const soft404 = !!(headingSoft && recordSignals < 2 && !(mainText.length >= 650 && mainActions >= 5) && mainText.length < 1100);
  let clippedTextNodes = 0;
  for (const el of Array.from(mainEl.querySelectorAll("*")).filter((e4) => isVisible(e4) && !isDevChrome(e4)).slice(0, 900)) {
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (text.length < 2) continue;
    const childText = Array.from(el.children).some((c2) => (c2.textContent || "").trim().length > 0);
    if (childText && el.children.length > 2) continue;
    const cs = getComputedStyle(el);
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const sw = el.scrollWidth;
    const sh = el.scrollHeight;
    if (cw >= 8 && sw > cw + 4) clippedTextNodes++;
    else if (ch >= 8 && sh > ch + 4 && cs.overflowY !== "auto" && cs.overflowY !== "scroll" && cs.overflow !== "auto" && cs.overflow !== "scroll") {
      clippedTextNodes++;
    }
  }
  let overlappingTextPairs = 0;
  const textBoxes = [];
  for (const el of Array.from(
    mainEl.querySelectorAll(
      "span, p, h1, h2, h3, h4, h5, h6, label, td, th, li, time, code, small, a, button, div"
    )
  ).filter((e4) => isVisible(e4) && !isDevChrome(e4)).slice(0, 320)) {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (t.length < 1) continue;
    if (el.tagName === "DIV" && t.length > 48) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3 || r.width > 900) continue;
    const hasTextChild = Array.from(el.children).some((c2) => {
      const cr = c2.getBoundingClientRect();
      return (c2.textContent || "").trim().length > 0 && cr.height > 2;
    });
    if (hasTextChild) continue;
    textBoxes.push({ el, r });
  }
  for (let i = 0; i < Math.min(textBoxes.length, 160); i++) {
    for (let j = i + 1; j < Math.min(textBoxes.length, 160); j++) {
      const a = textBoxes[i];
      const b = textBoxes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ox > 3 && oy > 3 && ox * oy > 36) overlappingTextPairs++;
    }
  }
  const brokenUi = {
    soft404,
    soft404Evidence: soft404Evidence.slice(0, 160) || void 0,
    clippedTextNodes,
    overlappingTextPairs,
    mainContentChars: mainText.length
  };
  const sizeUsage = /* @__PURE__ */ new Map();
  const weightUsage = /* @__PURE__ */ new Map();
  const lineHeights = [];
  let headingMaxSizePx = 0;
  let headingMaxWeight = 400;
  const iconSizes = [];
  const cardShadows = /* @__PURE__ */ new Set();
  const borderWidths = /* @__PURE__ */ new Set();
  let harshControlBorders = 0;
  let cardPadSum = 0;
  let cardPadN = 0;
  let contentBoxArea = 0;
  const premiumScope = Array.from(mainEl.querySelectorAll("*")).filter((e4) => isVisible(e4) && !isDevChrome(e4)).slice(0, 400);
  for (const el of premiumScope) {
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    if (text.length >= 1 && r.width > 4 && r.height > 4) {
      const hasTextChild = Array.from(el.children).some((c2) => (c2.textContent || "").trim().length > 0);
      if (!hasTextChild || el.children.length <= 1) {
        const size = Math.round(parseFloat(cs.fontSize) || 0);
        const weight = parseInt(cs.fontWeight, 10) || 400;
        if (size >= 10 && size <= 96) {
          sizeUsage.set(size, (sizeUsage.get(size) ?? 0) + Math.min(text.length, 40));
          weightUsage.set(weight, (weightUsage.get(weight) ?? 0) + 1);
          const lh = parseFloat(cs.lineHeight);
          if (Number.isFinite(lh) && size > 0) {
            const ratio2 = lh > 4 ? lh / size : lh;
            if (ratio2 >= 0.8 && ratio2 <= 3) lineHeights.push(ratio2);
          }
        }
        if (/^h[1-3]$/.test(tag) || cs.fontSize && parseFloat(cs.fontSize) >= 22 && weight >= 600) {
          if (size > headingMaxSizePx) {
            headingMaxSizePx = size;
            headingMaxWeight = weight;
          }
        }
        contentBoxArea += Math.min(r.width * r.height, 12e4);
      }
    }
    if (tag === "svg" || /icon/i.test(typeof el.className === "string" ? el.className : "")) {
      const w = Math.round(r.width);
      if (w >= 8 && w <= 64) iconSizes.push(w);
    }
    const cls = typeof el.className === "string" ? el.className : "";
    if (/card|panel|tile|surface/i.test(cls) || tag === "article" || el.getAttribute("data-slot") === "card") {
      const sh = cs.boxShadow || "none";
      if (sh && sh !== "none") cardShadows.add(sh.replace(/\s+/g, " ").slice(0, 120));
      const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.paddingLeft) || 0);
      if (pad > 0 && r.width > 80) {
        cardPadSum += pad / 4;
        cardPadN++;
      }
    }
    if (tag === "button" || tag === "input" || tag === "a" || el.getAttribute("role") === "button") {
      const bw = Math.max(
        parseFloat(cs.borderTopWidth) || 0,
        parseFloat(cs.borderRightWidth) || 0,
        parseFloat(cs.borderBottomWidth) || 0,
        parseFloat(cs.borderLeftWidth) || 0
      );
      if (bw > 0) borderWidths.add(Math.round(bw * 2) / 2);
      const bc = cs.borderTopColor || "";
      const dark = /rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i.exec(bc) || /#([0-9a-f]{3,8})/i.exec(bc);
      let isHarshColor = false;
      if (dark && dark[1] && dark[2] && dark[3] && !bc.startsWith("#")) {
        const lum = (Number(dark[1]) + Number(dark[2]) + Number(dark[3])) / 3;
        isHarshColor = lum < 50;
      } else if (bc.startsWith("#")) {
        const hex2 = bc.slice(1);
        const full = hex2.length === 3 ? hex2.split("").map((c2) => c2 + c2).join("") : hex2.slice(0, 6);
        const n = parseInt(full, 16);
        if (Number.isFinite(n)) {
          const rr = n >> 16 & 255;
          const gg = n >> 8 & 255;
          const bb = n & 255;
          isHarshColor = (rr + gg + bb) / 3 < 50;
        }
      }
      if (bw >= 2.5 && isHarshColor) harshControlBorders++;
    }
  }
  const sizesSorted = [...sizeUsage.entries()].sort((a, b) => b[1] - a[1]);
  const bodyFontSizePx = sizesSorted[0]?.[0] ?? 16;
  const bodyLineHeight = lineHeights.length > 0 ? Math.round(lineHeights.reduce((s, x) => s + x, 0) / lineHeights.length * 100) / 100 : 1.5;
  const uniqueFontSizes = sizeUsage.size;
  const fontSizesOff4pxLadder = [...sizeUsage.keys()].filter((sz) => sz % 2 !== 0).length;
  const uniqueFontWeights = weightUsage.size;
  const hierarchySizeDeltaPx = Math.max(0, headingMaxSizePx - bodyFontSizePx);
  const bodyWeight = [...weightUsage.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 400;
  const headingBodyWeightContrast = headingMaxWeight >= bodyWeight + 200;
  const mainRect = mainEl.getBoundingClientRect();
  const mainArea = Math.max(1, mainRect.width * Math.max(mainRect.height, 400));
  const contentAreaRatio = Math.min(1, contentBoxArea / mainArea);
  let avgTextDensity = 0;
  if (sections.length) {
    avgTextDensity = sections.reduce((s, sec) => s + (sec.stats?.textDensity ?? 0), 0) / sections.length;
  }
  let iconSizeVariance = 0;
  const uniqueIconSizes = new Set(iconSizes).size;
  if (iconSizes.length >= 3) {
    const mean = iconSizes.reduce((s, x) => s + x, 0) / iconSizes.length;
    iconSizeVariance = Math.round(
      Math.sqrt(iconSizes.reduce((s, x) => s + (x - mean) ** 2, 0) / iconSizes.length) * 10
    ) / 10;
  }
  const crampedSiblingGaps = layout.offRhythmGaps ?? 0;
  const premium = {
    bodyFontSizePx,
    bodyLineHeight,
    uniqueFontSizes,
    fontSizesOff4pxLadder,
    uniqueFontWeights,
    headingMaxSizePx,
    hierarchySizeDeltaPx,
    headingBodyWeightContrast,
    avgTextDensity: Math.round(avgTextDensity * 100) / 100,
    contentAreaRatio: Math.round(contentAreaRatio * 100) / 100,
    avgCardPaddingPx: cardPadN ? Math.round(cardPadSum / cardPadN) : 0,
    uniqueCardShadows: cardShadows.size,
    uniqueIconSizes,
    iconSizeVariance,
    harshControlBorders,
    uniqueBorderWidths: borderWidths.size,
    crampedSiblingGaps
  };
  let gradientBackgrounds = 0;
  let gradientTexts = 0;
  let bounceTransitions = 0;
  let pulsingDots = 0;
  let sideTabBorders = 0;
  let nestedCards = 0;
  let iconTileHeadings = 0;
  let heroEyebrowChips = 0;
  const isColoredBorder = (color) => {
    const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(color || "");
    if (!m) return /#(?:[0-9a-f]{3}){1,2}/i.test(color) && !/^#([89a-f]|[89a-f]{2})\1\1$/i.test(color.trim());
    const r = Number(m[1]);
    const g = Number(m[2]);
    const b = Number(m[3]);
    const max2 = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max2 - min >= 25 && max2 >= 60;
  };
  const hasSideColorAccent = (cs) => {
    const sides = [
      { w: parseFloat(cs.borderLeftWidth) || 0, c: cs.borderLeftColor },
      { w: parseFloat(cs.borderRightWidth) || 0, c: cs.borderRightColor },
      { w: parseFloat(cs.borderTopWidth) || 0, c: cs.borderTopColor },
      { w: parseFloat(cs.borderBottomWidth) || 0, c: cs.borderBottomColor }
    ];
    const maxW = Math.max(...sides.map((s) => s.w));
    if (maxW < 3) return false;
    const thick = sides.filter((s) => s.w >= 3 && s.w >= maxW - 0.5);
    const thin = sides.filter((s) => s.w < maxW - 1.5);
    if (thin.length < 2) return false;
    return thick.some((s) => isColoredBorder(s.c));
  };
  const sideAccentCandidates = Array.from(
    document.querySelectorAll(
      "article, section, li, [class*=card i], [data-slot=card], [class*=panel i], [class*=tile i], [class*=section i], [role=listitem], [role=article]"
    )
  ).filter((e4) => isVisible(e4) && !isDevChrome(e4)).slice(0, 120);
  for (const el of sideAccentCandidates) {
    const r = el.getBoundingClientRect();
    if (r.width < 80 || r.height < 40) continue;
    if (hasSideColorAccent(getComputedStyle(el))) sideTabBorders++;
  }
  for (const el of all.slice(0, 1200)) {
    const cs = getComputedStyle(el);
    const bgImage = cs.backgroundImage || "";
    if (/gradient\(/i.test(bgImage)) {
      gradientBackgrounds++;
      if (cs.webkitBackgroundClip === "text" || cs.backgroundClip === "text") gradientTexts++;
    }
    if (/cubic-bezier\([^)]+\)/i.test(cs.transitionTimingFunction) && /bounce|elastic|back/i.test(cs.transitionTimingFunction)) {
      bounceTransitions++;
    }
    if (/bounce|elastic/i.test(cs.animationName || "")) bounceTransitions++;
    if (/pulse/i.test(cs.animationName || "") && el.getBoundingClientRect().width <= 16) pulsingDots++;
  }
  for (const card of Array.from(document.querySelectorAll("[class*=card i], [data-slot=card], article")).filter((e4) => isVisible(e4) && !isDevChrome(e4)).slice(0, 60)) {
    if (card.querySelector("[class*=card i], [data-slot=card], article")) nestedCards++;
  }
  for (const h of Array.from(document.querySelectorAll("h1, h2, h3")).filter((e4) => isVisible(e4)).slice(0, 40)) {
    const prev = h.previousElementSibling;
    if (!prev) continue;
    const r = prev.getBoundingClientRect();
    if (r.width >= 28 && r.width <= 72 && r.height >= 28 && r.height <= 72) {
      const cs = getComputedStyle(prev);
      if (parseFloat(cs.borderRadius) >= 6) iconTileHeadings++;
    }
    if (prev.tagName === "P" || prev.tagName === "SPAN" || /chip|badge|eyebrow|kicker/i.test(prev.className)) {
      const pcs = getComputedStyle(prev);
      const hs = getComputedStyle(h);
      if (parseFloat(pcs.fontSize) <= 14 && (pcs.textTransform === "uppercase" || /tracking|uppercase/i.test(prev.className)) && parseFloat(hs.fontSize) >= 36) {
        heroEyebrowChips++;
      }
    }
  }
  const slop = {
    gradientBackgrounds,
    gradientTexts,
    bounceTransitions,
    pulsingDots,
    sideTabBorders,
    nestedCards,
    iconTileHeadings,
    heroEyebrowChips
  };
  const sampleTheme = (selector, kind, limit = 10) => {
    const out = [];
    for (const el of Array.from(document.querySelectorAll(selector)).filter((e4) => isVisible(e4) && !isDevChrome(e4)).slice(0, limit * 3)) {
      const r = el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) continue;
      const cs = getComputedStyle(el);
      const text = clamp((el.textContent ?? el.value ?? "").replace(/\s+/g, " ").trim(), 36);
      out.push({
        kind,
        tag: el.tagName.toLowerCase(),
        text,
        bg: norm(cs.backgroundColor),
        color: norm(cs.color),
        borderRadius: (cs.borderRadius || "").split(" ")[0] || "0px",
        fontFamily: (cs.fontFamily || "").split(",")[0].replace(/['"]/g, "").trim(),
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        borderColor: norm(cs.borderTopColor || cs.borderColor)
      });
      if (out.length >= limit) break;
    }
    return out;
  };
  const componentTheme = [
    ...sampleTheme("button, [role=button], input[type=submit], input[type=button]", "button"),
    ...sampleTheme(
      "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]), textarea, select",
      "input"
    ),
    ...sampleTheme("nav a, [role=navigation] a, aside a, [class*=sidebar i] a", "nav"),
    ...sampleTheme("[class*=badge i], [class*=chip i], [data-slot=badge]", "badge"),
    ...sampleTheme("[class*=card i], [data-slot=card]", "card")
  ];
  return {
    title: document.title,
    tokens,
    sections,
    responsive: { horizontalOverflowPx, tinyTextCount, smallTapTargets, overlaps },
    links: Array.from(new Set(links)).slice(0, 200),
    css: {
      sheets: sheetsOut,
      /** @deprecated concat kept for older callers; prefer sheets[] */
      text: sheetsOut.map((s) => s.text).join("\n").slice(0, CSS_CAP),
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
      langAttr: document.documentElement.getAttribute("lang"),
      title: document.title,
      metaDescription: document.querySelector("meta[name=description]")?.content ?? null,
      hasSkipLink: !!document.querySelector(
        'a[href^="#"][class*=skip i], a[href="#main"], a[href="#content"], a.skip-to-content, a[href="#app"]'
      ),
      layout,
      polish,
      brokenUi,
      premium,
      slop,
      componentTheme,
      // Must skip Agentation / Vercel toolbar / etc. — they stay in the DOM
      // after hideDevChrome (display:none) and would otherwise inflate this
      // count into a false "icon-only buttons" finding on every page.
      buttonsWithoutLabel: Array.from(document.querySelectorAll("button")).filter(
        (b) => !isDevChrome(b) && isVisible(b) && !(b.textContent ?? "").trim() && !b.getAttribute("aria-label") && !b.getAttribute("title")
      ).length
    },
    buildContext: (() => {
      const hints = [];
      const scripts = Array.from(document.scripts).map((s) => s.src || "");
      const hrefs = Array.from(document.querySelectorAll("link[rel=stylesheet]")).map(
        (l) => l.href || ""
      );
      const all2 = scripts.concat(hrefs).join("\n");
      if (/\/@vite\/client|\/\.vite\/|@fs\//i.test(all2)) hints.push("vite-client");
      if (/@react-refresh|react-refresh/i.test(all2)) hints.push("react-refresh");
      if (/_next\/static/i.test(all2) && /localhost|127\.0\.0\.1/.test(location.host)) hints.push("next-dev");
      try {
        if (window.__vite_plugin_react_preamble_installed__) hints.push("vite-hmr");
      } catch {
      }
      const host = (location.hostname || "").toLowerCase();
      const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
      let buildMode = "unknown";
      if (hints.length > 0 || isLocal) buildMode = "development";
      else buildMode = "production";
      return { buildMode, isLocalTarget: isLocal, buildHints: hints };
    })(),
    perf
  };
};
var responsiveOnlyFn = function() {
  const vw = window.innerWidth;
  let horizontalOverflowPx = Math.max(0, document.documentElement.scrollWidth - vw);
  let tinyTextCount = 0;
  let smallTapTargets = 0;
  let overlaps = 0;
  const isDevChrome = (el) => {
    const w = window;
    if (typeof w.__qualitionIsDevChrome === "function") return w.__qualitionIsDevChrome(el);
    return false;
  };
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0";
  };
  const sample = Array.from(document.querySelectorAll("body *")).filter((el) => isVisible(el) && !isDevChrome(el)).slice(0, 400);
  for (const el of sample) {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1) horizontalOverflowPx = Math.max(horizontalOverflowPx, Math.round(r.right - vw));
    const cs = getComputedStyle(el);
    const txt = (el.textContent || "").trim();
    if (txt.length >= 4 && el.children.length === 0 && parseFloat(cs.fontSize) < 12) tinyTextCount++;
    const clickable = el.tagName === "A" || el.tagName === "BUTTON" || el.getAttribute("role") === "button" || el.onclick != null;
    if (clickable && (r.height < 32 || r.width < 32) && r.height > 0) smallTapTargets++;
  }
  const boxes = sample.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 40 && r.height > 40;
  }).slice(0, 80);
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i].getBoundingClientRect();
    for (let j = i + 1; j < Math.min(i + 6, boxes.length); j++) {
      const b = boxes[j].getBoundingClientRect();
      const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      if (ox > 20 && oy > 20 && ox * oy > 400) overlaps++;
    }
  }
  return { horizontalOverflowPx, tinyTextCount, smallTapTargets, overlaps };
};
var observerInit = function() {
  try {
    ;
    window.__q_cls = 0;
    window.__q_longtask = 0;
    new PerformanceObserver((list) => {
      for (const e4 of list.getEntries()) window.__q_lcp = Math.round(e4.startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const e4 of list.getEntries())
        if (!e4.hadRecentInput) window.__q_cls += e4.value;
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      for (const e4 of list.getEntries()) window.__q_longtask += Math.round(e4.duration);
    }).observe({ type: "longtask", buffered: true });
  } catch {
  }
};

// node_modules/@projectwallace/css-parser/dist/tokenize-DK24ACbY.js
var CHAR_ALPHA = 1;
var CHAR_HEX = 4;
var char_types = /* @__PURE__ */ new Uint8Array(128);
for (let i = 48; i <= 57; i++) char_types[i] = 2;
for (let i = 48; i <= 57; i++) char_types[i] |= CHAR_HEX;
for (let i = 65; i <= 70; i++) char_types[i] = CHAR_HEX;
for (let i = 97; i <= 102; i++) char_types[i] = CHAR_HEX;
for (let i = 65; i <= 90; i++) char_types[i] |= CHAR_ALPHA;
for (let i = 97; i <= 122; i++) char_types[i] |= CHAR_ALPHA;
char_types[32] = 8;
char_types[9] = 8;
char_types[10] = 16;
char_types[13] = 16;
char_types[12] = 16;
for (let i = 0; i < 128; i++) if (char_types[i] & 3) char_types[i] |= 32;
char_types[45] |= 32;
char_types[95] |= 32;
function is_hex_digit(ch) {
  return ch < 128 && (char_types[ch] & CHAR_HEX) !== 0;
}
function is_alpha(ch) {
  return ch < 128 && (char_types[ch] & CHAR_ALPHA) !== 0;
}
function is_ident_start(ch) {
  if (ch >= 128) return true;
  if (ch === 95) return true;
  return is_alpha(ch);
}
function is_newline(ch) {
  return ch < 128 && (char_types[ch] & 16) !== 0;
}
var CHAR_LEFT_BRACE = 123;
var CHAR_RIGHT_BRACE = 125;
var CHAR_COLON = 58;
var CHAR_SEMICOLON = 59;
var CHAR_COMMA = 44;
var CHAR_LEFT_BRACKET = 91;
var CHAR_RIGHT_BRACKET = 93;
var CHAR_LEFT_PAREN = 40;
var CHAR_RIGHT_PAREN = 41;
var CHAR_FORWARD_SLASH = 47;
var CHAR_ASTERISK = 42;
var CHAR_DOUBLE_QUOTE = 34;
var CHAR_SINGLE_QUOTE = 39;
var CHAR_DOT = 46;
var CHAR_LESS_THAN = 60;
var CHAR_EXCLAMATION = 33;
var CHAR_HYPHEN = 45;
var CHAR_GREATER_THAN = 62;
var CHAR_AT_SIGN = 64;
var CHAR_HASH = 35;
var CHAR_BACKSLASH = 92;
var CHAR_PLUS = 43;
var CHAR_PERCENT = 37;
var CHAR_LOWERCASE_E = 101;
var CHAR_UPPERCASE_E = 69;
var CHAR_LOWERCASE_U = 117;
var CHAR_UPPERCASE_U = 85;
var CHAR_QUESTION_MARK = 63;
var CHAR_CARRIAGE_RETURN = 13;
var CHAR_LINE_FEED = 10;
var CHAR_FORM_FEED = 12;
var SKIP_SCAN_INTERESTING = /* @__PURE__ */ new Uint8Array(128);
SKIP_SCAN_INTERESTING[CHAR_DOUBLE_QUOTE] = 1;
SKIP_SCAN_INTERESTING[CHAR_SINGLE_QUOTE] = 1;
SKIP_SCAN_INTERESTING[CHAR_FORWARD_SLASH] = 1;
SKIP_SCAN_INTERESTING[CHAR_LINE_FEED] = 1;
SKIP_SCAN_INTERESTING[CHAR_CARRIAGE_RETURN] = 1;
SKIP_SCAN_INTERESTING[CHAR_FORM_FEED] = 1;
var DECL_VALUE_STOP = /* @__PURE__ */ new Uint8Array(128);
DECL_VALUE_STOP[CHAR_SEMICOLON] = 1;
DECL_VALUE_STOP[CHAR_LEFT_BRACE] = 1;
DECL_VALUE_STOP[CHAR_RIGHT_BRACE] = 1;
DECL_VALUE_STOP[CHAR_LEFT_PAREN] = 1;
DECL_VALUE_STOP[CHAR_RIGHT_PAREN] = 1;
DECL_VALUE_STOP[CHAR_EXCLAMATION] = 1;
var Lexer = class {
  source;
  pos;
  _line;
  _line_offset;
  on_comment;
  token_type;
  token_start;
  token_end;
  token_line;
  token_column;
  constructor(source, on_comment) {
    this.source = source;
    this.pos = 0;
    this._line = 1;
    this._line_offset = 0;
    this.on_comment = on_comment;
    this.token_type = 26;
    this.token_start = 0;
    this.token_end = 0;
    this.token_line = 1;
    this.token_column = 1;
  }
  get line() {
    return this._line;
  }
  get column() {
    return this.pos - this._line_offset + 1;
  }
  seek(pos, line, column = 1) {
    this.pos = pos;
    this._line = line;
    this._line_offset = pos - column + 1;
  }
  next_token_fast(skip_whitespace = false) {
    const source = this.source;
    const source_length = source.length;
    while (true) {
      if (skip_whitespace) {
        let pos = this.pos;
        let line = this._line;
        let line_offset = this._line_offset;
        while (pos < source_length) {
          let ch2 = source.charCodeAt(pos);
          if (ch2 >= 128 || (char_types[ch2] & 24) === 0) break;
          pos++;
          if ((char_types[ch2] & 16) !== 0) {
            if (ch2 === CHAR_CARRIAGE_RETURN && pos < source_length && source.charCodeAt(pos) === CHAR_LINE_FEED) pos++;
            line++;
            line_offset = pos;
          }
        }
        this.pos = pos;
        this._line = line;
        this._line_offset = line_offset;
      }
      if (this.pos >= source_length) return this.make_token(26, this.pos, this.pos);
      let ch = source.charCodeAt(this.pos);
      let start = this.pos;
      let start_line = this._line;
      let start_column = this.pos - this._line_offset + 1;
      switch (ch) {
        case CHAR_LEFT_BRACE:
          this.pos++;
          return this.make_token(23, start, this.pos, start_line, start_column);
        case CHAR_RIGHT_BRACE:
          this.pos++;
          return this.make_token(24, start, this.pos, start_line, start_column);
        case CHAR_COLON:
          this.pos++;
          return this.make_token(16, start, this.pos, start_line, start_column);
        case CHAR_SEMICOLON:
          this.pos++;
          return this.make_token(17, start, this.pos, start_line, start_column);
        case CHAR_COMMA:
          this.pos++;
          return this.make_token(18, start, this.pos, start_line, start_column);
        case CHAR_LEFT_BRACKET:
          this.pos++;
          return this.make_token(19, start, this.pos, start_line, start_column);
        case CHAR_RIGHT_BRACKET:
          this.pos++;
          return this.make_token(20, start, this.pos, start_line, start_column);
        case CHAR_LEFT_PAREN:
          this.pos++;
          return this.make_token(21, start, this.pos, start_line, start_column);
        case CHAR_RIGHT_PAREN:
          this.pos++;
          return this.make_token(22, start, this.pos, start_line, start_column);
      }
      if (ch < 128 && (char_types[ch] & 24) !== 0) return this.consume_whitespace(start_line, start_column);
      if (ch === CHAR_FORWARD_SLASH && this.pos + 1 < source_length && source.charCodeAt(this.pos + 1) === CHAR_ASTERISK) {
        this._skip_comment();
        continue;
      }
      if (is_ident_start(ch)) return this.consume_ident_or_function(start_line, start_column);
      if (ch === CHAR_HYPHEN) {
        let next = this.pos + 1 < source_length ? source.charCodeAt(this.pos + 1) : 0;
        if (next === CHAR_HYPHEN && this.pos + 2 < source_length && source.charCodeAt(this.pos + 2) === CHAR_GREATER_THAN) {
          this.pos += 3;
          return this.make_token(15, start, this.pos, start_line, start_column);
        }
        if (is_ident_start(next) || next === CHAR_HYPHEN) return this.consume_ident_or_function(start_line, start_column);
        if (next < 128 && (char_types[next] & 2) !== 0) return this.consume_number(start_line, start_column);
        if (next === CHAR_DOT) {
          let next2 = this.pos + 2 < source_length ? source.charCodeAt(this.pos + 2) : 0;
          if (next2 < 128 && (char_types[next2] & 2) !== 0) return this.consume_number(start_line, start_column);
        }
      }
      if (ch === CHAR_BACKSLASH) {
        let next = this.pos + 1 < source_length ? source.charCodeAt(this.pos + 1) : 0;
        if (next !== 0 && !is_newline(next)) return this.consume_ident_or_function(start_line, start_column);
      }
      if (ch < 128 && (char_types[ch] & 2) !== 0) return this.consume_number(start_line, start_column);
      if (ch === CHAR_DOT) {
        let next = this.pos + 1 < source_length ? source.charCodeAt(this.pos + 1) : 0;
        if (next < 128 && (char_types[next] & 2) !== 0) return this.consume_number(start_line, start_column);
      }
      if (ch === CHAR_PLUS) {
        let next = this.pos + 1 < source_length ? source.charCodeAt(this.pos + 1) : 0;
        if (next < 128 && (char_types[next] & 2) !== 0) return this.consume_number(start_line, start_column);
        if (next === CHAR_DOT) {
          let next2 = this.pos + 2 < source_length ? source.charCodeAt(this.pos + 2) : 0;
          if (next2 < 128 && (char_types[next2] & 2) !== 0) return this.consume_number(start_line, start_column);
        }
      }
      if (ch === CHAR_DOUBLE_QUOTE || ch === CHAR_SINGLE_QUOTE) return this.consume_string(ch, start_line, start_column);
      if (ch === CHAR_AT_SIGN) return this.consume_at_keyword(start_line, start_column);
      if (ch === CHAR_HASH) return this.consume_hash(start_line, start_column);
      if (ch === CHAR_LESS_THAN && this.pos + 3 < source_length) {
        if (source.charCodeAt(this.pos + 1) === CHAR_EXCLAMATION && source.charCodeAt(this.pos + 2) === CHAR_HYPHEN && source.charCodeAt(this.pos + 3) === CHAR_HYPHEN) {
          this.pos += 4;
          return this.make_token(14, start, this.pos, start_line, start_column);
        }
      }
      this.pos++;
      return this.make_token(9, start, this.pos, start_line, start_column);
    }
  }
  _scan_newlines(from, to) {
    const source = this.source;
    for (let i = from; i < to; i++) {
      let c2 = source.charCodeAt(i);
      if (c2 === CHAR_LINE_FEED) {
        this._line++;
        this._line_offset = i + 1;
      } else if (c2 === CHAR_CARRIAGE_RETURN) {
        this._line++;
        if (i + 1 < to && source.charCodeAt(i + 1) === CHAR_LINE_FEED) i++;
        this._line_offset = i + 1;
      } else if (c2 === CHAR_FORM_FEED) {
        this._line++;
        this._line_offset = i + 1;
      }
    }
  }
  _skip_comment() {
    const source = this.source;
    const source_length = source.length;
    let comment_start = this.pos;
    let comment_line = this._line;
    let comment_column = this.pos - this._line_offset + 1;
    this.pos += 2;
    let end_idx = source.indexOf("*/", this.pos);
    if (end_idx < 0) {
      this._scan_newlines(this.pos, source_length);
      this.pos = source_length;
    } else {
      this._scan_newlines(this.pos, end_idx);
      this.pos = end_idx + 2;
    }
    if (this.on_comment) this.on_comment({
      start: comment_start,
      end: this.pos,
      length: this.pos - comment_start,
      line: comment_line,
      column: comment_column
    });
  }
  /**
  * Fast-forward to the next `target` char that isn't inside a string or comment, without
  * fully tokenizing what's in between — used by callers that only need to know *where a
  * construct ends* (e.g. a selector's `{`), since the sub-parser for that construct
  * re-tokenizes the span properly afterward.
  *
  * Strings go through consume_string and comments through _skip_comment, so escapes and
  * on_comment callbacks behave identically to real tokenization. Ordinary characters cost
  * one SKIP_SCAN_INTERESTING lookup each, same as consume_ident_or_function's inner loop.
  *
  * Returns true with this.pos at target, or false with this.pos at source_length.
  */
  skip_to_unquoted(target) {
    const source = this.source;
    const source_length = source.length;
    let pos = this.pos;
    while (pos < source_length) {
      let ch = source.charCodeAt(pos);
      if (ch === target) {
        this.pos = pos;
        return true;
      }
      if (ch >= 128 || SKIP_SCAN_INTERESTING[ch] === 0) {
        pos++;
        continue;
      }
      if (ch === CHAR_DOUBLE_QUOTE || ch === CHAR_SINGLE_QUOTE) {
        this.pos = pos;
        this.consume_string(ch, this._line, 1);
        pos = this.pos;
        continue;
      }
      if (ch === CHAR_FORWARD_SLASH) {
        if (pos + 1 < source_length && source.charCodeAt(pos + 1) === CHAR_ASTERISK) {
          this.pos = pos;
          this._skip_comment();
          pos = this.pos;
        } else pos++;
        continue;
      }
      pos++;
      if (ch === CHAR_CARRIAGE_RETURN && pos < source_length && source.charCodeAt(pos) === CHAR_LINE_FEED) pos++;
      this._line++;
      this._line_offset = pos;
    }
    this.pos = pos;
    return false;
  }
  /**
  * Same approach as skip_to_unquoted, but stops at any of `; { } ( ) !` — the stop
  * characters parse-declaration.ts's value scan needs (paren depth, statement end,
  * !important). The caller decides what each one means; this only locates the next one.
  *
  * Returns the stop character's code (this.pos left at it), or 0 at `end` if none found.
  */
  skip_to_declaration_stop(end) {
    const source = this.source;
    let pos = this.pos;
    while (pos < end) {
      let ch = source.charCodeAt(pos);
      if (ch < 128 && DECL_VALUE_STOP[ch] !== 0) {
        this.pos = pos;
        return ch;
      }
      if (ch >= 128 || SKIP_SCAN_INTERESTING[ch] === 0) {
        pos++;
        continue;
      }
      if (ch === CHAR_DOUBLE_QUOTE || ch === CHAR_SINGLE_QUOTE) {
        this.pos = pos;
        this.consume_string(ch, this._line, 1);
        pos = this.pos;
        continue;
      }
      if (ch === CHAR_FORWARD_SLASH) {
        if (pos + 1 < end && source.charCodeAt(pos + 1) === CHAR_ASTERISK) {
          this.pos = pos;
          this._skip_comment();
          pos = this.pos;
        } else pos++;
        continue;
      }
      pos++;
      if (ch === CHAR_CARRIAGE_RETURN && pos < end && source.charCodeAt(pos) === CHAR_LINE_FEED) pos++;
      this._line++;
      this._line_offset = pos;
    }
    this.pos = pos;
    return 0;
  }
  consume_whitespace(start_line, start_column) {
    const source = this.source;
    const source_length = source.length;
    let start = this.pos;
    let pos = start;
    let line = this._line;
    let line_offset = this._line_offset;
    while (pos < source_length) {
      let ch = source.charCodeAt(pos);
      if (ch >= 128 || (char_types[ch] & 24) === 0) break;
      pos++;
      if ((char_types[ch] & 16) !== 0) {
        if (ch === CHAR_CARRIAGE_RETURN && pos < source_length && source.charCodeAt(pos) === CHAR_LINE_FEED) pos++;
        line++;
        line_offset = pos;
      }
    }
    this.pos = pos;
    this._line = line;
    this._line_offset = line_offset;
    return this.make_token(13, start, pos, start_line, start_column);
  }
  consume_string(quote, start_line, start_column) {
    const source = this.source;
    const source_length = source.length;
    let start = this.pos;
    this.pos++;
    while (this.pos < source_length) {
      let ch = source.charCodeAt(this.pos);
      if (ch === quote) {
        this.pos++;
        return this.make_token(5, start, this.pos, start_line, start_column);
      }
      if (ch < 128 && (char_types[ch] & 16) !== 0) return this.make_token(6, start, this.pos, start_line, start_column);
      if (ch === CHAR_BACKSLASH) {
        this.pos++;
        if (this.pos < source_length) {
          let next = source.charCodeAt(this.pos);
          if (is_hex_digit(next)) this.consume_hex_escape();
          else if (next < 128 && (char_types[next] & 16) !== 0) {
            this.pos++;
            if (next === CHAR_CARRIAGE_RETURN && this.pos < source_length && source.charCodeAt(this.pos) === CHAR_LINE_FEED) this.pos++;
            this._line++;
            this._line_offset = this.pos;
          } else this.pos++;
        }
        continue;
      }
      this.pos++;
    }
    return this.make_token(6, start, this.pos, start_line, start_column);
  }
  consume_hex_escape() {
    const source = this.source;
    const source_length = source.length;
    let count = 0;
    while (count < 6 && this.pos < source_length) {
      if (!is_hex_digit(source.charCodeAt(this.pos))) break;
      this.pos++;
      count++;
    }
    if (this.pos < source_length) {
      let ch = source.charCodeAt(this.pos);
      if (ch < 128 && (char_types[ch] & 24) !== 0) {
        this.pos++;
        if ((char_types[ch] & 16) !== 0) {
          if (ch === CHAR_CARRIAGE_RETURN && this.pos < source_length && source.charCodeAt(this.pos) === CHAR_LINE_FEED) this.pos++;
          this._line++;
          this._line_offset = this.pos;
        }
      }
    }
  }
  consume_number(start_line, start_column) {
    const source = this.source;
    const source_length = source.length;
    let start = this.pos;
    let pos = start;
    let ch = source.charCodeAt(pos);
    if (ch === CHAR_PLUS || ch === CHAR_HYPHEN) pos++;
    while (pos < source_length) {
      let ch2 = source.charCodeAt(pos);
      if (ch2 >= 128 || (char_types[ch2] & 2) === 0) break;
      pos++;
    }
    if (pos < source_length && source.charCodeAt(pos) === CHAR_DOT && pos + 1 < source_length) {
      let next = source.charCodeAt(pos + 1);
      if (next < 128 && (char_types[next] & 2) !== 0) {
        pos++;
        while (pos < source_length) {
          let ch2 = source.charCodeAt(pos);
          if (ch2 >= 128 || (char_types[ch2] & 2) === 0) break;
          pos++;
        }
      }
    }
    if (pos < source_length) {
      let ch2 = source.charCodeAt(pos);
      if (ch2 === CHAR_LOWERCASE_E || ch2 === CHAR_UPPERCASE_E) {
        let next = pos + 1 < source_length ? source.charCodeAt(pos + 1) : 0;
        let is_next_digit = next < 128 && (char_types[next] & 2) !== 0;
        let next2 = pos + 2 < source_length ? source.charCodeAt(pos + 2) : 0;
        let is_next2_digit = next2 < 128 && (char_types[next2] & 2) !== 0;
        if (is_next_digit || (next === CHAR_PLUS || next === CHAR_HYPHEN) && is_next2_digit) {
          pos++;
          if (pos < source_length) {
            let sign = source.charCodeAt(pos);
            if (sign === CHAR_PLUS || sign === CHAR_HYPHEN) pos++;
          }
          while (pos < source_length) {
            let ch3 = source.charCodeAt(pos);
            if (ch3 >= 128 || (char_types[ch3] & 2) === 0) break;
            pos++;
          }
        }
      }
    }
    if (pos < source_length) {
      let ch2 = source.charCodeAt(pos);
      if (ch2 === CHAR_PERCENT) {
        pos++;
        this.pos = pos;
        return this.make_token(11, start, pos, start_line, start_column);
      }
      if (is_ident_start(ch2) || ch2 === CHAR_HYPHEN && is_ident_start(pos + 1 < source_length ? source.charCodeAt(pos + 1) : 0)) {
        while (pos < source_length) {
          let ch3 = source.charCodeAt(pos);
          if (ch3 < 128 && (char_types[ch3] & 32) === 0) break;
          pos++;
        }
        this.pos = pos;
        return this.make_token(12, start, pos, start_line, start_column);
      }
    }
    this.pos = pos;
    return this.make_token(10, start, pos, start_line, start_column);
  }
  consume_ident_or_function(start_line, start_column) {
    const source = this.source;
    const source_length = source.length;
    let start = this.pos;
    let pos = start;
    while (pos < source_length) {
      let ch = source.charCodeAt(pos);
      if (ch === CHAR_BACKSLASH) {
        this.pos = pos;
        if (this.pos + 1 >= source_length) break;
        let next = source.charCodeAt(this.pos + 1);
        if (is_newline(next)) break;
        this.pos++;
        if (is_hex_digit(next)) {
          this.pos++;
          for (let i = 0; i < 5 && this.pos < source_length; i++) {
            if (!is_hex_digit(source.charCodeAt(this.pos))) break;
            this.pos++;
          }
          if (this.pos < source_length) {
            let ws = source.charCodeAt(this.pos);
            if (ws < 128 && (char_types[ws] & 24) !== 0) this.advance();
          }
        } else this.pos++;
        pos = this.pos;
      } else if (ch >= 128 || (char_types[ch] & 32) !== 0) pos++;
      else break;
    }
    this.pos = pos;
    if (this.pos - start === 1) {
      let first_ch = source.charCodeAt(start);
      if ((first_ch === CHAR_LOWERCASE_U || first_ch === CHAR_UPPERCASE_U) && this.pos < source_length && source.charCodeAt(this.pos) === CHAR_PLUS) return this.consume_unicode_range(start, start_line, start_column);
    }
    if (this.pos < source_length && source.charCodeAt(this.pos) === CHAR_LEFT_PAREN) {
      this.pos++;
      return this.make_token(2, start, this.pos, start_line, start_column);
    }
    return this.make_token(1, start, this.pos, start_line, start_column);
  }
  consume_unicode_range(start, start_line, start_column) {
    const source = this.source;
    const source_length = source.length;
    this.pos++;
    let hex_digits = 0;
    let has_question = false;
    while (this.pos < source_length && hex_digits < 6) {
      let ch = source.charCodeAt(this.pos);
      if (is_hex_digit(ch)) {
        if (has_question) break;
        this.pos++;
        hex_digits++;
      } else if (ch === CHAR_QUESTION_MARK) {
        this.pos++;
        hex_digits++;
        has_question = true;
      } else break;
    }
    if (has_question) return this.make_token(27, start, this.pos, start_line, start_column);
    if (this.pos < source_length && source.charCodeAt(this.pos) === CHAR_HYPHEN) {
      if (this.pos + 1 < source_length && is_hex_digit(source.charCodeAt(this.pos + 1))) {
        this.pos++;
        let end_hex_digits = 0;
        while (this.pos < source_length && end_hex_digits < 6) if (is_hex_digit(source.charCodeAt(this.pos))) {
          this.pos++;
          end_hex_digits++;
        } else break;
      }
    }
    return this.make_token(27, start, this.pos, start_line, start_column);
  }
  consume_at_keyword(start_line, start_column) {
    const source = this.source;
    const source_length = source.length;
    let start = this.pos;
    let pos = start + 1;
    while (pos < source_length) {
      let ch = source.charCodeAt(pos);
      if (ch < 128 && (char_types[ch] & 32) === 0) break;
      pos++;
    }
    this.pos = pos;
    return this.make_token(3, start, pos, start_line, start_column);
  }
  consume_hash(start_line, start_column) {
    const source = this.source;
    const source_length = source.length;
    let start = this.pos;
    let pos = start + 1;
    while (pos < source_length) {
      let ch = source.charCodeAt(pos);
      if (ch < 128 && (char_types[ch] & 32) === 0) break;
      pos++;
    }
    this.pos = pos;
    return this.make_token(4, start, pos, start_line, start_column);
  }
  advance(count = 1) {
    if (count === 1) {
      if (this.pos >= this.source.length) return;
      let ch = this.source.charCodeAt(this.pos);
      this.pos++;
      if (ch < 128 && (char_types[ch] & 16) !== 0) {
        if (ch === CHAR_CARRIAGE_RETURN && this.pos < this.source.length && this.source.charCodeAt(this.pos) === CHAR_LINE_FEED) this.pos++;
        this._line++;
        this._line_offset = this.pos;
      }
      return;
    }
    for (let i = 0; i < count; i++) {
      if (this.pos >= this.source.length) break;
      let ch = this.source.charCodeAt(this.pos);
      this.pos++;
      if (ch < 128 && (char_types[ch] & 16) !== 0) {
        if (ch === CHAR_CARRIAGE_RETURN && this.pos < this.source.length && this.source.charCodeAt(this.pos) === CHAR_LINE_FEED) {
          this.pos++;
          i++;
        }
        this._line++;
        this._line_offset = this.pos;
      }
    }
  }
  peek(offset = 1) {
    let index = this.pos + offset;
    if (index >= this.source.length) return 0;
    return this.source.charCodeAt(index);
  }
  make_token(type, start, end, line = this._line, column = this.pos - this._line_offset + 1) {
    this.token_type = type;
    this.token_start = start;
    this.token_end = end;
    this.token_line = line;
    this.token_column = column;
    return type;
  }
  next_token(skip_whitespace = false) {
    this.next_token_fast(skip_whitespace);
    return {
      type: this.token_type,
      start: this.token_start,
      end: this.token_end,
      line: this.token_line,
      column: this.token_column
    };
  }
  /**
  * Save complete lexer state for backtracking
  * @returns Object containing all lexer state
  */
  save_position() {
    return {
      pos: this.pos,
      line: this._line,
      column: this.pos - this._line_offset + 1,
      _line_offset: this._line_offset,
      token_type: this.token_type,
      token_start: this.token_start,
      token_end: this.token_end,
      token_line: this.token_line,
      token_column: this.token_column
    };
  }
  /**
  * Restore lexer state from saved position
  * @param saved The saved position to restore
  */
  restore_position(saved) {
    this.pos = saved.pos;
    this._line = saved.line;
    this._line_offset = saved._line_offset;
    this.token_type = saved.token_type;
    this.token_start = saved.token_start;
    this.token_end = saved.token_end;
    this.token_line = saved.token_line;
    this.token_column = saved.token_column;
  }
  /**
  * Skip whitespace and comments within a range, maintaining line/column tracking
  * @param end The end boundary (exclusive)
  */
  skip_whitespace_in_range(end) {
    while (this.pos < end) {
      let ch = this.source.charCodeAt(this.pos);
      if (ch < 128 && (char_types[ch] & 24) !== 0) {
        this.advance();
        continue;
      }
      if (ch === CHAR_FORWARD_SLASH && this.pos + 1 < end && this.source.charCodeAt(this.pos + 1) === CHAR_ASTERISK) {
        this.advance();
        this.advance();
        while (this.pos < end) {
          if (this.source.charCodeAt(this.pos) === CHAR_ASTERISK && this.pos + 1 < end && this.source.charCodeAt(this.pos + 1) === CHAR_FORWARD_SLASH) {
            this.advance();
            this.advance();
            break;
          }
          this.advance();
        }
        continue;
      }
      break;
    }
  }
};

// node_modules/@projectwallace/css-parser/dist/arena-CFwM4uQs.js
var BYTES_PER_NODE = 32;
var TYPE_SELECTOR = 21;
var CLASS_SELECTOR = 22;
var ID_SELECTOR = 23;
var ATTRIBUTE_SELECTOR = 24;
var PSEUDO_CLASS_SELECTOR = 25;
var PSEUDO_ELEMENT_SELECTOR = 26;
var CSSDataArena = class CSSDataArena2 {
  buffer;
  view;
  capacity;
  count;
  growth_count;
  overflow_lengths;
  static GROWTH_FACTOR = 1.3;
  static NODES_PER_KB = 210;
  static CAPACITY_BUFFER = 1.1;
  constructor(initial_capacity = 1024) {
    this.capacity = initial_capacity;
    this.count = 1;
    this.growth_count = 0;
    this.buffer = /* @__PURE__ */ new ArrayBuffer(initial_capacity * BYTES_PER_NODE);
    this.view = new DataView(this.buffer);
    this.overflow_lengths = /* @__PURE__ */ new Map();
  }
  static capacity_for_source(source_length) {
    let size_in_kb = source_length / 1024;
    let estimated_nodes = Math.ceil(size_in_kb * CSSDataArena2.NODES_PER_KB);
    let capacity = Math.ceil(estimated_nodes * CSSDataArena2.CAPACITY_BUFFER);
    return Math.max(16, capacity);
  }
  get_count() {
    return this.count;
  }
  get_capacity() {
    return this.capacity;
  }
  get_growth_count() {
    return this.growth_count;
  }
  node_offset(node_index) {
    return node_index * BYTES_PER_NODE;
  }
  get_type(node_index) {
    return this.view.getUint8(this.node_offset(node_index));
  }
  get_flags(node_index) {
    return this.view.getUint8(this.node_offset(node_index) + 1);
  }
  get_start_offset(node_index) {
    return this.view.getUint32(this.node_offset(node_index) + 12, true);
  }
  get_length(node_index) {
    if (this.has_flag(node_index, 4)) {
      const overflow_length = this.overflow_lengths.get(node_index);
      if (overflow_length !== void 0) return overflow_length;
    }
    return this.view.getUint16(this.node_offset(node_index) + 2, true);
  }
  get_content_start(node_index) {
    return this.get_start_offset(node_index) + this.view.getUint16(this.node_offset(node_index) + 16, true);
  }
  get_content_length(node_index) {
    return this.view.getUint16(this.node_offset(node_index) + 20, true);
  }
  get_first_child(node_index) {
    return this.view.getUint32(this.node_offset(node_index) + 4, true);
  }
  get_next_sibling(node_index) {
    return this.view.getUint32(this.node_offset(node_index) + 8, true);
  }
  get_start_line(node_index) {
    return this.view.getUint32(this.node_offset(node_index) + 24, true);
  }
  get_start_column(node_index) {
    return this.view.getUint32(this.node_offset(node_index) + 28, true);
  }
  get_value_start(node_index) {
    return this.get_start_offset(node_index) + this.view.getUint16(this.node_offset(node_index) + 18, true);
  }
  get_value_length(node_index) {
    return this.view.getUint16(this.node_offset(node_index) + 22, true);
  }
  set_type(node_index, type) {
    this.view.setUint8(this.node_offset(node_index), type);
  }
  set_flags(node_index, flags) {
    this.view.setUint8(this.node_offset(node_index) + 1, flags);
  }
  set_length(node_index, length) {
    if (length > 65535) {
      this.view.setUint16(this.node_offset(node_index) + 2, 65535, true);
      this.set_flag(node_index, 4);
      this.overflow_lengths.set(node_index, length);
    } else this.view.setUint16(this.node_offset(node_index) + 2, length, true);
  }
  set_content_start_delta(node_index, delta) {
    this.view.setUint16(this.node_offset(node_index) + 16, delta, true);
  }
  set_content_length(node_index, length) {
    this.view.setUint16(this.node_offset(node_index) + 20, length, true);
  }
  set_first_child(node_index, childIndex) {
    this.view.setUint32(this.node_offset(node_index) + 4, childIndex, true);
  }
  set_next_sibling(node_index, siblingIndex) {
    this.view.setUint32(this.node_offset(node_index) + 8, siblingIndex, true);
  }
  set_value_start_delta(node_index, delta) {
    this.view.setUint16(this.node_offset(node_index) + 18, delta, true);
  }
  set_value_length(node_index, length) {
    this.view.setUint16(this.node_offset(node_index) + 22, length, true);
  }
  grow() {
    this.growth_count++;
    let new_capacity = Math.ceil(this.capacity * CSSDataArena2.GROWTH_FACTOR);
    let new_buffer = /* @__PURE__ */ new ArrayBuffer(new_capacity * BYTES_PER_NODE);
    new Uint8Array(new_buffer).set(new Uint8Array(this.buffer));
    this.buffer = new_buffer;
    this.view = new DataView(new_buffer);
    this.capacity = new_capacity;
  }
  create_node(type, start_offset, length, start_line, start_column) {
    if (this.count >= this.capacity) this.grow();
    const node_index = this.count;
    this.count++;
    const offset = node_index * BYTES_PER_NODE;
    this.view.setUint8(offset, type);
    this.view.setUint32(offset + 12, start_offset, true);
    this.view.setUint32(offset + 24, start_line, true);
    this.view.setUint32(offset + 28, start_column, true);
    this.set_length(node_index, length);
    return node_index;
  }
  append_children(parent_index, children) {
    if (children.length === 0) return;
    const offset = this.node_offset(parent_index);
    this.view.setUint32(offset + 4, children[0], true);
    for (let i = 0; i < children.length - 1; i++) this.set_next_sibling(children[i], children[i + 1]);
  }
  /** Shrink the buffer to the live node count, releasing wasted capacity. Call once after parsing; no-op if already tight. */
  trim() {
    if (this.count === this.capacity) return;
    let byte_count = this.count * BYTES_PER_NODE;
    let new_buffer = new ArrayBuffer(byte_count);
    new Uint8Array(new_buffer).set(new Uint8Array(this.buffer, 0, byte_count));
    this.buffer = new_buffer;
    this.view = new DataView(new_buffer);
    this.capacity = this.count;
  }
  get_last_sibling(node_index) {
    let node = node_index;
    let next = this.get_next_sibling(node);
    while (next !== 0) {
      node = next;
      next = this.get_next_sibling(node);
    }
    return node;
  }
  has_children(node_index) {
    return this.get_first_child(node_index) !== 0;
  }
  has_next_sibling(node_index) {
    return this.get_next_sibling(node_index) !== 0;
  }
  set_flag(node_index, flag) {
    let current_flags = this.get_flags(node_index);
    this.set_flags(node_index, current_flags | flag);
  }
  clear_flag(node_index, flag) {
    let current_flags = this.get_flags(node_index);
    this.set_flags(node_index, current_flags & ~flag);
  }
  has_flag(node_index, flag) {
    return (this.get_flags(node_index) & flag) !== 0;
  }
};

// node_modules/@projectwallace/css-parser/dist/parse-dimension-ouWXNHdx.js
function is_whitespace(ch) {
  return ch === 32 || ch === 9 || ch === 10 || ch === 13 || ch === 12;
}
function is_combinator(ch) {
  return ch === 62 || ch === 43 || ch === 126;
}
function is_digit(ch) {
  return ch >= 48 && ch <= 57;
}
function str_equals(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    let ca = a.charCodeAt(i);
    let cb = b.charCodeAt(i);
    cb |= 32;
    if (ca !== cb) return false;
  }
  return true;
}
function str_starts_with(str, prefix) {
  if (str.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    let ca = str.charCodeAt(i);
    let cb = prefix.charCodeAt(i);
    if (ca >= 65 && ca <= 90) ca |= 32;
    if (ca !== cb) return false;
  }
  return true;
}
function str_index_of(str, searchChar) {
  if (searchChar.length === 0) return -1;
  if (searchChar.length === 1) {
    const searchCode = searchChar.charCodeAt(0);
    for (let i = 0; i < str.length; i++) {
      let ca = str.charCodeAt(i);
      if (ca >= 65 && ca <= 90) ca |= 32;
      if (ca === searchCode) return i;
    }
    return -1;
  }
  for (let i = 0; i <= str.length - searchChar.length; i++) {
    let match = true;
    for (let j = 0; j < searchChar.length; j++) {
      let ca = str.charCodeAt(i + j);
      let cb = searchChar.charCodeAt(j);
      if (ca >= 65 && ca <= 90) ca |= 32;
      if (ca !== cb) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}
function is_vendor_prefixed(source, start, end) {
  if (start === void 0 || end === void 0) {
    start = 0;
    end = source.length;
  }
  if (source.charCodeAt(start) !== 45) return false;
  if (source.charCodeAt(start + 1) === 45) return false;
  if (end - start < 3) return false;
  for (let i = start + 2; i < end; i++) if (source.charCodeAt(i) === 45) return true;
  return false;
}
function is_custom(str) {
  if (str.length < 3) return false;
  return str.charCodeAt(0) === 45 && str.charCodeAt(1) === 45;
}
function strip_vendor_prefix(str) {
  if (!is_vendor_prefixed(str)) return str;
  for (let i = 2; i < str.length; i++) if (str.charCodeAt(i) === 45) return str.substring(i + 1);
  return str;
}
function parse_dimension(text) {
  let num_end = 0;
  for (let i = 0; i < text.length; i++) {
    let ch = text.charCodeAt(i);
    if (ch === 101 || ch === 69) {
      if (i + 1 < text.length) {
        let next_ch = text.charCodeAt(i + 1);
        if (is_digit(next_ch)) {
          num_end = i + 1;
          continue;
        }
        if ((next_ch === 43 || next_ch === 45) && i + 2 < text.length) {
          if (is_digit(text.charCodeAt(i + 2))) {
            num_end = i + 1;
            continue;
          }
        }
      }
      break;
    }
    if (is_digit(ch) || ch === 46 || ch === 45 || ch === 43) num_end = i + 1;
    else break;
  }
  let num_str = text.substring(0, num_end);
  let unit = text.substring(num_end);
  return {
    value: num_str ? Number.parseFloat(num_str) : 0,
    unit
  };
}

// node_modules/@projectwallace/css-parser/dist/css-node-Cf8K9nWd.js
var TYPE_NAMES = {
  [1]: "StyleSheet",
  [2]: "Rule",
  [3]: "Atrule",
  [4]: "Declaration",
  [5]: "Selector",
  [6]: "Comment",
  [7]: "Block",
  [8]: "Raw",
  [10]: "Identifier",
  [11]: "Number",
  [12]: "Dimension",
  [13]: "String",
  [14]: "Hash",
  [15]: "Function",
  [16]: "Operator",
  [17]: "Parentheses",
  [18]: "Url",
  [19]: "UnicodeRange",
  [50]: "Value",
  [20]: "SelectorList",
  [21]: "TypeSelector",
  [22]: "ClassSelector",
  [23]: "IdSelector",
  [24]: "AttributeSelector",
  [25]: "PseudoClassSelector",
  [26]: "PseudoElementSelector",
  [27]: "Combinator",
  [28]: "UniversalSelector",
  [29]: "NestingSelector",
  [30]: "Nth",
  [31]: "NthOf",
  [56]: "Lang",
  [32]: "MediaQuery",
  [33]: "Feature",
  [34]: "MediaType",
  [35]: "ContainerQuery",
  [36]: "SupportsQuery",
  [57]: "SupportsDeclaration",
  [37]: "Layer",
  [38]: "Operator",
  [39]: "MediaFeatureRange",
  [40]: "AtrulePrelude",
  [41]: "PreludeSelectorList"
};
var nodes_with_name = /* @__PURE__ */ new Set([
  3,
  10,
  15,
  21,
  22,
  23,
  24,
  25,
  26,
  27,
  28,
  56,
  37,
  39
]);
var nodes_with_children = /* @__PURE__ */ new Set([
  1,
  5,
  20,
  7,
  15,
  17,
  50,
  25,
  26,
  40,
  32,
  33,
  35,
  39,
  36,
  57
]);
var enumerable_properties = [
  "name",
  "namespace",
  "property",
  "value",
  "unit",
  "attr_operator",
  "attr_flags",
  "nth_a",
  "nth_b",
  "selector",
  "is_browserhack",
  "is_vendor_prefixed",
  "has_error",
  "is_important"
];
var CSSNode = class CSSNode2 {
  arena;
  source;
  index;
  constructor(arena, source, index) {
    this.arena = arena;
    this.source = source;
    this.index = index;
  }
  /**
  * @internal
  * Get the arena (for internal/advanced use only)
  */
  __get_arena() {
    return this.arena;
  }
  /** @internal */
  __get_source() {
    return this.source;
  }
  /** @internal */
  __get_index() {
    return this.index;
  }
  get_content() {
    let start = this.arena.get_content_start(this.index);
    let length = this.arena.get_content_length(this.index);
    if (length === 0) return "";
    return this.source.substring(start, start + length);
  }
  /** Get node type as number (for performance) */
  get type() {
    return this.arena.get_type(this.index);
  }
  /** Get node type as human-readable string */
  get type_name() {
    return TYPE_NAMES[this.type] || "unknown";
  }
  /** Get the full text of this node from source */
  get text() {
    let start = this.arena.get_start_offset(this.index);
    let length = this.arena.get_length(this.index);
    return this.source.substring(start, start + length);
  }
  /** Get the "content" text (at-rule name for at-rules, layer name for import layers) */
  get name() {
    if (!nodes_with_name.has(this.type)) return;
    let { type } = this;
    if (type === 28) return null;
    let content = this.get_content();
    if (type === 56 && content === "") return null;
    return content;
  }
  /** Namespace prefix for type/universal selectors: null (none), '' (`|div`), 'ns' (`ns|div`), or '*' (`*|div`). */
  get namespace() {
    let { type } = this;
    if (type !== 21 && type !== 28) return void 0;
    if (!this.arena.has_flag(this.index, 16)) return null;
    let start = this.arena.get_value_start(this.index);
    let length = this.arena.get_value_length(this.index);
    return this.source.substring(start, start + length);
  }
  /** Alias for `name` on declarations ("color" in "color: blue"), more semantic than `name` there. */
  get property() {
    let { type } = this;
    if (type !== 4 && type !== 33 && type !== 57) return;
    return this.get_content();
  }
  /**
  * Declarations: the value text ("1px solid blue"). Dimension/number: the numeric value.
  * String: content without quotes. URL: quoted string keeps quotes, unquoted URL doesn't.
  */
  get value() {
    let { type, text, first_child } = this;
    if (type === 3) return void 0;
    if (type === 34) return text;
    if (type === 4 && first_child) return first_child;
    if (type === 33) return first_child ?? null;
    if (type === 57) return first_child?.first_child ?? null;
    if (type === 12) return parse_dimension(text).value;
    if (type === 11) return Number(text);
    if (type === 18) {
      if (first_child?.type === 13) return first_child.text;
      if (str_starts_with(text, "url(")) {
        let open_paren = text.indexOf("(");
        let close_paren = text.lastIndexOf(")");
        if (open_paren !== -1 && close_paren !== -1 && close_paren > open_paren) return text.substring(open_paren + 1, close_paren).trim();
      } else if (text.startsWith('"') || text.startsWith("'")) return text;
    }
    if (type === 16 || type === 37) return this.get_content();
    if (type !== 4 && type !== 15 && type !== 24 && type !== 36 && type !== 41) return;
    let start = this.arena.get_value_start(this.index);
    let length = this.arena.get_value_length(this.index);
    if (length === 0) return null;
    return this.source.substring(start, start + length);
  }
  /** At-rules: AT_RULE_PRELUDE wrapper (media queries, layer names, …). Style rules: SELECTOR_LIST/SELECTOR. Null if none. */
  get prelude() {
    if (this.type === 3) {
      let first = this.first_child;
      if (first?.type === 40 || first?.type === 8) return first;
      return null;
    }
    if (this.type === 2) return this.first_child;
  }
  /** Attribute selector operator (=, ~=, |=, ^=, $=, *=), or null for the bare `[attr]` form. */
  get attr_operator() {
    if (this.type !== 24) return void 0;
    let content_end = this.arena.get_content_start(this.index) + this.arena.get_content_length(this.index);
    let node_end = this.arena.get_start_offset(this.index) + this.arena.get_length(this.index);
    let pos = content_end;
    while (pos < node_end && is_whitespace(this.source.charCodeAt(pos))) pos++;
    if (pos >= node_end) return null;
    let ch1 = this.source.charCodeAt(pos);
    let ch2 = pos + 1 < node_end ? this.source.charCodeAt(pos + 1) : 0;
    if (ch1 === 61) return this.source.substring(pos, pos + 1);
    if (ch1 === 126 && ch2 === 61) return this.source.substring(pos, pos + 2);
    if (ch1 === 124 && ch2 === 61) return this.source.substring(pos, pos + 2);
    if (ch1 === 94 && ch2 === 61) return this.source.substring(pos, pos + 2);
    if (ch1 === 36 && ch2 === 61) return this.source.substring(pos, pos + 2);
    if (ch1 === 42 && ch2 === 61) return this.source.substring(pos, pos + 2);
    return null;
  }
  /** Attribute selector flag: "i" (case-insensitive), "s" (case-sensitive), or null if absent. */
  get attr_flags() {
    if (this.type !== 24) return void 0;
    let value_len = this.arena.get_value_length(this.index);
    if (value_len === 0) return null;
    let value_end = this.arena.get_value_start(this.index) + value_len;
    let node_end = this.arena.get_start_offset(this.index) + this.arena.get_length(this.index);
    let pos = value_end;
    while (pos < node_end && is_whitespace(this.source.charCodeAt(pos))) pos++;
    if (pos >= node_end) return null;
    let flag_ch = this.source.charCodeAt(pos);
    if (flag_ch === 105 || flag_ch === 73 || flag_ch === 115 || flag_ch === 83) return this.source.substring(pos, pos + 1);
    return null;
  }
  /** Get the unit for dimension nodes (e.g., "px" from "100px", "%" from "50%") */
  get unit() {
    if (this.type !== 12) return void 0;
    return parse_dimension(this.text).unit;
  }
  /** Check if this declaration has !important */
  get is_important() {
    if (this.type !== 4) return void 0;
    return this.arena.has_flag(this.index, 1);
  }
  /** Check if this declaration has a browser hack prefix */
  get is_browserhack() {
    if (this.type !== 4) return void 0;
    return this.arena.has_flag(this.index, 128);
  }
  /** Check if this has a vendor prefix (computed on-demand) */
  get is_vendor_prefixed() {
    switch (this.type) {
      case 4:
        return is_vendor_prefixed(this.get_content());
      case 25:
      case 26:
        return is_vendor_prefixed(this.get_content());
      case 3:
        return is_vendor_prefixed(this.get_content());
      case 15:
        return is_vendor_prefixed(this.get_content());
      case 10:
        return is_vendor_prefixed(this.text);
      case 33:
        return is_vendor_prefixed(this.get_content());
      default:
        return false;
    }
  }
  /** Check if this node has an error */
  get has_error() {
    return this.arena.has_flag(this.index, 2);
  }
  /** Check if this node has a prelude (at-rules and style rules) */
  get has_prelude() {
    let { type } = this;
    if (type === 3) return this.first_child !== null && this.first_child.type !== 7;
    if (type === 2) return this.first_child !== null;
    return false;
  }
  /** Check if this rule has a block { } */
  get has_block() {
    return this.arena.has_flag(this.index, 8);
  }
  /** Check if this style rule has declarations */
  get has_declarations() {
    let { type } = this;
    if (type !== 3 && type !== 2) return void 0;
    return this.arena.has_flag(this.index, 32);
  }
  /** Get the block node (for style rules and at-rules with blocks) */
  get block() {
    let { type } = this;
    if (type === 2) {
      let first = this.first_child;
      if (!first) return null;
      let block_node = first.next_sibling;
      if (block_node?.type === 7) return block_node;
      return null;
    }
    if (type === 3) {
      let child = this.first_child;
      while (child) {
        if (child.type === 7 && !child.next_sibling) return child;
        child = child.next_sibling;
      }
      return null;
    }
    return null;
  }
  /** Check if this block is empty (no declarations or rules, only comments allowed) */
  get is_empty() {
    if (this.type !== 7) return void 0;
    let child = this.first_child;
    while (child) {
      if (child.type !== 6) return false;
      child = child.next_sibling;
    }
    return true;
  }
  /** Get start line number */
  get line() {
    return this.arena.get_start_line(this.index);
  }
  /** Get start column number */
  get column() {
    return this.arena.get_start_column(this.index);
  }
  /** Get start offset in source */
  get start() {
    return this.arena.get_start_offset(this.index);
  }
  /** Get length in source */
  get length() {
    return this.arena.get_length(this.index);
  }
  /**
  * Get end offset in source
  * End is not stored, must be calculated
  */
  get end() {
    return this.start + this.length;
  }
  /** Get first child node */
  get first_child() {
    let child_index = this.arena.get_first_child(this.index);
    if (child_index === 0) return null;
    return new CSSNode2(this.arena, this.source, child_index);
  }
  /** Get next sibling node */
  get next_sibling() {
    let sibling_index = this.arena.get_next_sibling(this.index);
    if (sibling_index === 0) return null;
    return new CSSNode2(this.arena, this.source, sibling_index);
  }
  /** Check if this node has a next sibling */
  get has_next() {
    return this.arena.get_next_sibling(this.index) !== 0;
  }
  /** Whether this node has children. For pseudo-class/element functions, tracks FLAG_HAS_PARENS so formatters can tell `:lang()` from `:hover`. */
  get has_children() {
    let { type } = this;
    if (type === 25 || type === 26) {
      if (this.arena.has_flag(this.index, 64)) return true;
    }
    return this.arena.has_children(this.index);
  }
  /** Count children without allocating an intermediate array */
  get child_count() {
    let count = 0;
    let child_index = this.arena.get_first_child(this.index);
    while (child_index !== 0) {
      count++;
      child_index = this.arena.get_next_sibling(child_index);
    }
    return count;
  }
  /** Get all children as an array */
  get children() {
    let result = [];
    let child = this.first_child;
    while (child) {
      result.push(child);
      child = child.next_sibling;
    }
    return result;
  }
  /** Make CSSNode iterable over its children */
  *[Symbol.iterator]() {
    let child = this.first_child;
    while (child) {
      yield child;
      child = child.next_sibling;
    }
  }
  /** Get the 'a' coefficient from An+B expression (e.g., "2n" from "2n+1", "odd" from "odd") */
  get nth_a() {
    let { type, arena, index } = this;
    if (type !== 30 && type !== 31) return void 0;
    let len = arena.get_content_length(index);
    if (len === 0) return null;
    let start = arena.get_content_start(index);
    return this.source.substring(start, start + len);
  }
  /** Get the 'b' coefficient from An+B expression (e.g., "+1" from "2n+1") */
  get nth_b() {
    let { type, arena, index, source } = this;
    if (type !== 30 && type !== 31) return void 0;
    let len = arena.get_value_length(index);
    if (len === 0) return null;
    let start = arena.get_value_start(index);
    let value = source.substring(start, start + len);
    let check_pos = start - 1;
    while (check_pos >= 0) {
      let ch = source.charCodeAt(check_pos);
      if (is_whitespace(ch)) {
        check_pos--;
        continue;
      }
      if (ch === 45) value = "-" + value;
      else if (ch === 43) value = "+" + value;
      break;
    }
    return value;
  }
  /** Get the An+B formula node from :nth-child(2n+1 of .foo) */
  get nth() {
    if (this.type !== 31) return void 0;
    return this.first_child ?? void 0;
  }
  /** Get the selector list from :nth-child(2n+1 of .foo) */
  get selector() {
    if (this.type !== 31) return void 0;
    return this.first_child?.next_sibling ?? void 0;
  }
  /**
  * Clone this node as a mutable plain object with children as arrays.
  * Use sparingly — can consume a lot of memory.
  */
  clone(options = {}) {
    const { deep = true, locations = false } = options;
    let { type } = this;
    let plain = {
      type,
      type_name: this.type_name,
      text: this.text
    };
    for (let key of enumerable_properties) {
      let val = this[key];
      if (val !== void 0 && val !== false) plain[key] = val;
    }
    if (locations) {
      plain.line = this.line;
      plain.column = this.column;
      plain.start = this.start;
      plain.length = this.length;
      plain.end = this.end;
    }
    if (deep && nodes_with_children.has(type)) {
      plain.children = [];
      plain.child_count = this.child_count;
      plain.has_children = this.has_children;
      let children = this.children;
      if (children) for (let child of children) plain.children.push(child.clone({
        deep: true,
        locations
      }));
    }
    return plain;
  }
};

// node_modules/@projectwallace/css-parser/dist/parse-utils-D7srNG13.js
function skip_whitespace_forward(source, pos, end) {
  while (pos < end && is_whitespace(source.charCodeAt(pos))) pos++;
  return pos;
}
function skip_whitespace_and_comments_forward(source, pos, end) {
  while (pos < end) {
    let ch = source.charCodeAt(pos);
    if (is_whitespace(ch)) {
      pos++;
      continue;
    }
    if (ch === 47 && pos + 1 < end && source.charCodeAt(pos + 1) === 42) {
      pos += 2;
      while (pos < end) {
        if (source.charCodeAt(pos) === 42 && pos + 1 < end && source.charCodeAt(pos + 1) === 47) {
          pos += 2;
          break;
        }
        pos++;
      }
      continue;
    }
    break;
  }
  return pos;
}
function skip_whitespace_and_comments_backward(source, pos, start) {
  while (pos > start) {
    let ch = source.charCodeAt(pos - 1);
    if (is_whitespace(ch)) {
      pos--;
      continue;
    }
    if (pos >= 2 && ch === 47 && source.charCodeAt(pos - 2) === 42) {
      pos -= 2;
      while (pos > start) {
        if (pos >= 2 && source.charCodeAt(pos - 2) === 47 && source.charCodeAt(pos - 1) === 42) {
          pos -= 2;
          break;
        }
        pos--;
      }
      continue;
    }
    break;
  }
  return pos;
}
function trim_boundaries(source, start, end) {
  start = skip_whitespace_and_comments_forward(source, start, end);
  end = skip_whitespace_and_comments_backward(source, end, start);
  if (start >= end) return null;
  return [start, end];
}

// node_modules/@projectwallace/css-parser/dist/parse-anplusb.js
var ANplusBParser = class {
  lexer;
  arena;
  source;
  expr_end;
  constructor(arena, source) {
    this.arena = arena;
    this.source = source;
    this.lexer = new Lexer(source);
    this.expr_end = 0;
  }
  /**
  * Parse An+B expression
  * Examples: odd, even, 3, n, -n, 2n, 2n+1, -3n-5
  */
  parse_anplusb(start, end, line = 1) {
    this.expr_end = end;
    this.lexer.seek(start, line);
    let b = null;
    let a_start = start;
    let a_end = start;
    let b_start = start;
    let b_end = start;
    const node_start = start;
    this.skip_whitespace();
    if (this.lexer.pos >= this.expr_end) return null;
    this.lexer.next_token_fast(true);
    if (this.lexer.token_type === 1) {
      const text = this.source.substring(this.lexer.token_start, this.lexer.token_end);
      if (str_equals("odd", text) || str_equals("even", text)) {
        a_start = this.lexer.token_start;
        a_end = this.lexer.token_end;
        return this.create_anplusb_node(node_start, a_start, a_end, 0, 0);
      }
      const first_char = this.source.charCodeAt(this.lexer.token_start);
      const second_char = this.lexer.token_end > this.lexer.token_start + 1 ? this.source.charCodeAt(this.lexer.token_start + 1) : 0;
      if (first_char === 45 && second_char === 110) {
        if (this.lexer.token_end > this.lexer.token_start + 2) {
          if (this.source.charCodeAt(this.lexer.token_start + 2) === 45) {
            a_start = this.lexer.token_start;
            a_end = this.lexer.token_start + 2;
            b = this.source.substring(this.lexer.token_start + 2, this.lexer.token_end);
            b_start = this.lexer.token_start + 2;
            b_end = this.lexer.token_end;
            return this.create_anplusb_node(node_start, a_start, a_end, b_start, b_end);
          }
        }
        a_start = this.lexer.token_start;
        a_end = this.lexer.token_start + 2;
        b = this.parse_b_part();
        if (b !== null) {
          b_start = this.lexer.token_start;
          b_end = this.lexer.token_end;
        }
        return this.create_anplusb_node(node_start, a_start, a_end, b === null ? 0 : b_start, b === null ? 0 : b_end);
      }
      if (first_char === 110) {
        if (this.lexer.token_end > this.lexer.token_start + 1) {
          if (this.source.charCodeAt(this.lexer.token_start + 1) === 45) {
            a_start = this.lexer.token_start;
            a_end = this.lexer.token_start + 1;
            b = this.source.substring(this.lexer.token_start + 1, this.lexer.token_end);
            b_start = this.lexer.token_start + 1;
            b_end = this.lexer.token_end;
            return this.create_anplusb_node(node_start, a_start, a_end, b_start, b_end);
          }
        }
        a_start = this.lexer.token_start;
        a_end = this.lexer.token_start + 1;
        b = this.parse_b_part();
        if (b !== null) {
          b_start = this.lexer.token_start;
          b_end = this.lexer.token_end;
        }
        return this.create_anplusb_node(node_start, a_start, a_end, b === null ? 0 : b_start, b === null ? 0 : b_end);
      }
      return null;
    }
    if (this.lexer.token_type === 9 && this.source.charCodeAt(this.lexer.token_start) === 43) {
      const saved = this.lexer.save_position();
      this.lexer.next_token_fast(true);
      if (this.lexer.token_type === 1) {
        if (this.source.substring(this.lexer.token_start, this.lexer.token_end).charCodeAt(0) === 110) {
          a_start = saved.pos - 1;
          a_end = this.lexer.token_start + 1;
          if (this.lexer.token_end > this.lexer.token_start + 1) {
            if (this.source.charCodeAt(this.lexer.token_start + 1) === 45) {
              b = this.source.substring(this.lexer.token_start + 1, this.lexer.token_end);
              b_start = this.lexer.token_start + 1;
              b_end = this.lexer.token_end;
              return this.create_anplusb_node(node_start, a_start, a_end, b_start, b_end);
            }
          }
          b = this.parse_b_part();
          if (b !== null) {
            b_start = this.lexer.token_start;
            b_end = this.lexer.token_end;
          }
          return this.create_anplusb_node(node_start, a_start, a_end, b === null ? 0 : b_start, b === null ? 0 : b_end);
        }
      }
      this.lexer.restore_position(saved);
    }
    if (this.lexer.token_type === 12) {
      const token_text = this.source.substring(this.lexer.token_start, this.lexer.token_end);
      const n_index = str_index_of(token_text, "n");
      if (n_index !== -1) {
        a_start = this.lexer.token_start;
        a_end = this.lexer.token_start + n_index + 1;
        if (n_index + 1 < token_text.length) {
          const remainder = token_text.substring(n_index + 1);
          if (remainder.charCodeAt(0) === 45) {
            b = remainder;
            b_start = this.lexer.token_start + n_index + 1;
            b_end = this.lexer.token_end;
            return this.create_anplusb_node(node_start, a_start, a_end, b_start, b_end);
          }
        }
        b = this.parse_b_part();
        if (b !== null) {
          b_start = this.lexer.token_start;
          b_end = this.lexer.token_end;
        }
        return this.create_anplusb_node(node_start, a_start, a_end, b_start, b_end);
      }
    }
    if (this.lexer.token_type === 10) {
      b = this.source.substring(this.lexer.token_start, this.lexer.token_end);
      b_start = this.lexer.token_start;
      b_end = this.lexer.token_end;
      return this.create_anplusb_node(node_start, 0, 0, b_start, b_end);
    }
    return null;
  }
  /**
  * Parse the b part after 'n'
  * Handles: +5, -3, whitespace variations
  */
  parse_b_part() {
    this.skip_whitespace();
    if (this.lexer.pos >= this.expr_end) return null;
    this.lexer.next_token_fast(true);
    if (this.lexer.token_type === 9) {
      const ch = this.source.charCodeAt(this.lexer.token_start);
      if (ch === 43 || ch === 45) {
        const sign = ch === 45 ? "-" : "";
        this.skip_whitespace();
        this.lexer.next_token_fast(true);
        if (this.lexer.token_type === 10) {
          let num_text = this.source.substring(this.lexer.token_start, this.lexer.token_end);
          if (num_text.charCodeAt(0) === 43) num_text = num_text.substring(1);
          return sign === "-" ? sign + num_text : num_text;
        }
      }
    }
    if (this.lexer.token_type === 10) {
      let num_text = this.source.substring(this.lexer.token_start, this.lexer.token_end);
      const first_char = num_text.charCodeAt(0);
      if (first_char === 43 || first_char === 45) {
        if (first_char === 43) num_text = num_text.substring(1);
        return num_text;
      }
    }
    return null;
  }
  skip_whitespace() {
    this.lexer.skip_whitespace_in_range(this.expr_end);
  }
  create_anplusb_node(start, a_start, a_end, b_start, b_end) {
    const node = this.arena.create_node(30, start, this.lexer.pos - start, this.lexer.line, 1);
    if (a_end > a_start) {
      this.arena.set_content_start_delta(node, a_start - start);
      this.arena.set_content_length(node, a_end - a_start);
    }
    if (b_end > b_start) {
      this.arena.set_value_start_delta(node, b_start - start);
      this.arena.set_value_length(node, b_end - b_start);
    }
    return node;
  }
};

// node_modules/@projectwallace/css-parser/dist/parse-selector.js
var SelectorParser = class {
  lexer;
  arena;
  source;
  selector_end;
  anplusb_parser;
  constructor(arena, source) {
    this.arena = arena;
    this.source = source;
    this.lexer = new Lexer(source);
    this.selector_end = 0;
    this.anplusb_parser = new ANplusBParser(arena, source);
  }
  parse_selector(start, end, line = 1, column = 1, allow_relative = true) {
    this.selector_end = end;
    this.lexer.seek(start, line, column);
    return this.parse_selector_list(allow_relative);
  }
  parse_selector_list(allow_relative = true) {
    let first_selector = 0;
    let last_selector = 0;
    let list_start = this.lexer.pos;
    let list_line = this.lexer.line;
    let list_column = this.lexer.column;
    while (this.lexer.pos < this.selector_end) {
      let selector_start = this.lexer.pos;
      let selector_line = this.lexer.line;
      let selector_column = this.lexer.column;
      let complex_selector = this.parse_complex_selector(allow_relative);
      if (complex_selector !== null) {
        let selector_wrapper = this.arena.create_node(5, selector_start, this.lexer.pos - selector_start, selector_line, selector_column);
        this.arena.set_content_start_delta(selector_wrapper, 0);
        this.arena.set_content_length(selector_wrapper, this.lexer.pos - selector_start);
        this.arena.set_first_child(selector_wrapper, complex_selector);
        if (first_selector === 0) first_selector = selector_wrapper;
        else this.arena.set_next_sibling(last_selector, selector_wrapper);
        last_selector = selector_wrapper;
      }
      this.skip_whitespace();
      if (this.lexer.pos >= this.selector_end) break;
      this.lexer.next_token_fast(false);
      if (this.lexer.token_type === 18) {
        this.skip_whitespace();
        continue;
      } else break;
    }
    if (first_selector !== 0) {
      let list_node = this.arena.create_node(20, list_start, this.lexer.pos - list_start, list_line, list_column);
      this.arena.set_first_child(list_node, first_selector);
      return list_node;
    }
    return null;
  }
  parse_complex_selector(allow_relative = true) {
    let first_component = 0;
    let chain_tail = 0;
    this.skip_whitespace();
    if (allow_relative && this.lexer.pos < this.selector_end) {
      const saved = this.lexer.save_position();
      this.lexer.next_token_fast(false);
      if (this.lexer.token_type === 9) {
        let ch = this.source.charCodeAt(this.lexer.token_start);
        if (ch === 62 || ch === 43 || ch === 126) {
          let combinator = this.create_node(27, this.lexer.token_start, this.lexer.token_end);
          first_component = combinator;
          chain_tail = combinator;
          this.skip_whitespace();
        } else this.lexer.restore_position(saved);
      } else this.lexer.restore_position(saved);
    }
    while (this.lexer.pos < this.selector_end) {
      let compound = this.parse_compound_selector();
      if (compound === null) break;
      if (chain_tail === 0) first_component = compound;
      else this.arena.set_next_sibling(chain_tail, compound);
      chain_tail = this.arena.get_last_sibling(compound);
      let combinator = this.try_parse_combinator();
      if (combinator !== null) {
        this.arena.set_next_sibling(chain_tail, combinator);
        chain_tail = combinator;
        this.skip_whitespace();
        continue;
      }
      const saved = this.lexer.save_position();
      this.skip_whitespace();
      if (this.lexer.pos >= this.selector_end) {
        this.lexer.restore_position(saved);
        break;
      }
      this.lexer.next_token_fast(false);
      if (this.lexer.token_type === 18 || this.lexer.pos >= this.selector_end) {
        this.lexer.restore_position(saved);
        break;
      }
      this.lexer.restore_position(saved);
      break;
    }
    return first_component === 0 ? null : first_component;
  }
  parse_compound_selector() {
    let first_part = 0;
    let last_part = 0;
    while (this.lexer.pos < this.selector_end) {
      const saved = this.lexer.save_position();
      this.lexer.next_token_fast(false);
      if (this.lexer.token_start >= this.selector_end) break;
      if (this.lexer.token_type === 26) break;
      let part = this.parse_simple_selector();
      if (part === null) {
        this.lexer.restore_position(saved);
        break;
      }
      if (first_part === 0) first_part = part;
      else this.arena.set_next_sibling(last_part, part);
      last_part = part;
    }
    return first_part === 0 ? null : first_part;
  }
  parse_simple_selector() {
    let token_type = this.lexer.token_type;
    let start = this.lexer.token_start;
    let end = this.lexer.token_end;
    switch (token_type) {
      case 1:
        return this.parse_type_or_namespace_selector(start, end);
      case 4:
        return this.create_node(23, start, end);
      case 9: {
        let ch = this.source.charCodeAt(start);
        if (ch === 46) return this.parse_class_selector(start);
        else if (ch === 42) return this.parse_universal_or_namespace_selector(start, end);
        else if (ch === 38) return this.create_node(29, start, end);
        else if (ch === 124) return this.parse_empty_namespace_selector(start);
        return null;
      }
      case 19:
        return this.parse_attribute_selector(start);
      case 16:
        return this.parse_pseudo(start);
      case 2:
        return this.parse_pseudo_function(start, end);
      case 11:
        return this.create_node(12, start, end);
      case 13:
      case 18:
        return null;
      default:
        return null;
    }
  }
  parse_namespace_local_part(selector_start, namespace_start, namespace_prefix_length) {
    const saved = this.lexer.save_position();
    this.lexer.next_token_fast(false);
    let node_type;
    if (this.lexer.token_type === 1) node_type = 21;
    else if (this.lexer.token_type === 9 && this.source.charCodeAt(this.lexer.token_start) === 42) node_type = 28;
    else {
      this.lexer.restore_position(saved);
      return null;
    }
    let local_start = this.lexer.token_start;
    let local_end = this.lexer.token_end;
    let node = this.create_node(node_type, selector_start, local_end);
    this.arena.set_flag(node, 16);
    this.arena.set_content_start_delta(node, local_start - selector_start);
    this.arena.set_content_length(node, local_end - local_start);
    this.arena.set_value_start_delta(node, namespace_start - selector_start);
    this.arena.set_value_length(node, namespace_prefix_length);
    return node;
  }
  parse_type_or_namespace_selector(start, end) {
    if (this.source.charCodeAt(start) === 45 && this.source.charCodeAt(start + 1) === 45) return null;
    const saved = this.lexer.save_position();
    this.skip_whitespace();
    if (this.lexer.pos < this.selector_end && this.source.charCodeAt(this.lexer.pos) === 124) {
      this.lexer.pos++;
      let node = this.parse_namespace_local_part(start, start, end - start);
      if (node !== null) return node;
    }
    this.lexer.restore_position(saved);
    return this.create_node(21, start, end);
  }
  parse_universal_or_namespace_selector(start, end) {
    const saved = this.lexer.save_position();
    this.skip_whitespace();
    if (this.lexer.pos < this.selector_end && this.source.charCodeAt(this.lexer.pos) === 124) {
      this.lexer.pos++;
      let node = this.parse_namespace_local_part(start, start, end - start);
      if (node !== null) return node;
    }
    this.lexer.restore_position(saved);
    return this.create_node(28, start, end);
  }
  parse_empty_namespace_selector(start) {
    return this.parse_namespace_local_part(start, start, 0);
  }
  try_parse_combinator() {
    const saved_whitespace_start = this.lexer.save_position();
    let has_whitespace = this.lexer.pos < this.selector_end;
    this.skip_whitespace();
    has_whitespace = has_whitespace && this.lexer.pos > saved_whitespace_start.pos;
    if (this.lexer.pos >= this.selector_end) {
      this.lexer.restore_position(saved_whitespace_start);
      return null;
    }
    this.lexer.next_token_fast(false);
    if (this.lexer.token_type === 9) {
      let ch = this.source.charCodeAt(this.lexer.token_start);
      if (is_combinator(ch)) return this.create_node(27, this.lexer.token_start, this.lexer.token_end);
    }
    if (has_whitespace) {
      this.lexer.restore_position(saved_whitespace_start);
      this.skip_whitespace();
      return this.create_node(27, saved_whitespace_start.pos, this.lexer.pos, saved_whitespace_start.line, saved_whitespace_start.column);
    }
    this.lexer.restore_position(saved_whitespace_start);
    return null;
  }
  parse_class_selector(dot_pos) {
    const saved = this.lexer.save_position();
    this.lexer.next_token_fast(false);
    if (this.lexer.token_type !== 1) {
      this.lexer.restore_position(saved);
      return null;
    }
    return this.create_node(22, dot_pos, this.lexer.token_end);
  }
  parse_attribute_selector(start) {
    let bracket_depth = 1;
    let end = this.lexer.token_end;
    let content_start = start + 1;
    let content_end = content_start;
    while (this.lexer.pos < this.selector_end && bracket_depth > 0) {
      this.lexer.next_token_fast(false);
      let token_type = this.lexer.token_type;
      if (token_type === 19) bracket_depth++;
      else if (token_type === 20) {
        bracket_depth--;
        if (bracket_depth === 0) {
          content_end = this.lexer.token_start;
          end = this.lexer.token_end;
          break;
        }
      }
    }
    let node = this.create_node(24, start, end);
    this.parse_attribute_content(node, content_start, content_end);
    return node;
  }
  parse_attribute_content(node, start, end) {
    start = skip_whitespace_and_comments_forward(this.source, start, end);
    end = skip_whitespace_and_comments_backward(this.source, end, start);
    if (start >= end) return;
    let name_start = start;
    let name_end = start;
    let operator_end = -1;
    let value_start = -1;
    let value_end = -1;
    while (name_end < end) {
      let ch3 = this.source.charCodeAt(name_end);
      if (is_whitespace(ch3) || ch3 === 61 || ch3 === 126 || ch3 === 124 || ch3 === 94 || ch3 === 36 || ch3 === 42) break;
      name_end++;
    }
    if (name_end > name_start) {
      this.arena.set_content_start_delta(node, name_start - this.arena.get_start_offset(node));
      this.arena.set_content_length(node, name_end - name_start);
    }
    let pos = skip_whitespace_and_comments_forward(this.source, name_end, end);
    if (pos >= end) return;
    let ch1 = this.source.charCodeAt(pos);
    let ch2 = pos + 1 < end ? this.source.charCodeAt(pos + 1) : 0;
    if (ch1 === 61) operator_end = pos + 1;
    else if (ch1 === 126 && ch2 === 61) operator_end = pos + 2;
    else if (ch1 === 124 && ch2 === 61) operator_end = pos + 2;
    else if (ch1 === 94 && ch2 === 61) operator_end = pos + 2;
    else if (ch1 === 36 && ch2 === 61) operator_end = pos + 2;
    else if (ch1 === 42 && ch2 === 61) operator_end = pos + 2;
    else return;
    pos = skip_whitespace_and_comments_forward(this.source, operator_end, end);
    if (pos >= end) return;
    value_start = pos;
    let ch = this.source.charCodeAt(pos);
    if (ch === 39 || ch === 34) {
      let quote = ch;
      value_start = pos;
      pos++;
      while (pos < end) {
        let c2 = this.source.charCodeAt(pos);
        if (c2 === quote) {
          pos++;
          break;
        }
        if (c2 === 92) pos += 2;
        else pos++;
      }
    } else while (pos < end) {
      let c2 = this.source.charCodeAt(pos);
      if (is_whitespace(c2)) break;
      pos++;
    }
    value_end = pos;
    if (value_end > value_start) {
      this.arena.set_value_start_delta(node, value_start - this.arena.get_start_offset(node));
      this.arena.set_value_length(node, value_end - value_start);
    }
  }
  parse_pseudo(start) {
    const saved = this.lexer.save_position();
    const saved_ws = this.lexer.save_position();
    this.skip_whitespace();
    let is_pseudo_element = false;
    if (this.lexer.pos < this.selector_end && this.source.charCodeAt(this.lexer.pos) === 58) {
      is_pseudo_element = true;
      this.lexer.pos++;
    } else this.lexer.restore_position(saved_ws);
    this.lexer.next_token_fast(false);
    let token_type = this.lexer.token_type;
    if (token_type === 1) {
      let node = this.create_node(is_pseudo_element ? 26 : 25, start, this.lexer.token_end);
      this.arena.set_content_start_delta(node, this.lexer.token_start - start);
      this.arena.set_content_length(node, this.lexer.token_end - this.lexer.token_start);
      return node;
    } else if (token_type === 2) return this.parse_pseudo_function_after_colon(start, is_pseudo_element);
    this.lexer.restore_position(saved);
    return null;
  }
  parse_pseudo_function(_start, _end) {
    return null;
  }
  parse_pseudo_function_after_colon(start, is_pseudo_element) {
    let func_name_start = this.lexer.token_start;
    let func_name_end = this.lexer.token_end - 1;
    let content_start = this.lexer.pos;
    let content_end = content_start;
    let paren_depth = 1;
    let end = this.lexer.token_end;
    while (this.lexer.pos < this.selector_end && paren_depth > 0) {
      this.lexer.next_token_fast(false);
      let token_type = this.lexer.token_type;
      if (token_type === 21 || token_type === 2) paren_depth++;
      else if (token_type === 22) {
        paren_depth--;
        if (paren_depth === 0) {
          content_end = this.lexer.token_start;
          end = this.lexer.token_end;
          break;
        }
      }
    }
    let node = this.create_node(is_pseudo_element ? 26 : 25, start, end);
    this.arena.set_content_start_delta(node, func_name_start - start);
    this.arena.set_content_length(node, func_name_end - func_name_start);
    this.arena.set_flag(node, 64);
    if (content_end > content_start) {
      let func_name_substr = this.source.substring(func_name_start, func_name_end);
      if (this.is_nth_pseudo(func_name_substr)) {
        let child = this.parse_nth_expression(content_start, content_end);
        if (child !== null) this.arena.set_first_child(node, child);
      } else if (str_equals("lang", func_name_substr)) this.parse_lang_identifiers(content_start, content_end, node);
      else {
        let saved_selector_end = this.selector_end;
        const saved = this.lexer.save_position();
        let allow_relative = str_equals("has", func_name_substr);
        let child_selector = this.parse_selector(content_start, content_end, this.lexer.line, this.lexer.column, allow_relative);
        this.selector_end = saved_selector_end;
        this.lexer.restore_position(saved);
        if (child_selector !== null) this.arena.set_first_child(node, child_selector);
      }
    }
    return node;
  }
  is_nth_pseudo(name) {
    return str_equals("nth-child", name) || str_equals("nth-last-child", name) || str_equals("nth-of-type", name) || str_equals("nth-last-of-type", name) || str_equals("nth-col", name) || str_equals("nth-last-col", name);
  }
  parse_lang_identifiers(start, end, parent_node) {
    const saved_position = this.lexer.save_position();
    this.lexer.seek(start, this.lexer.line, this.lexer.column);
    let saved_selector_end = this.selector_end;
    this.selector_end = end;
    let first_child = null;
    let last_child = null;
    while (this.lexer.pos < end) {
      this.lexer.next_token_fast(false);
      let token_type = this.lexer.token_type;
      let token_start = this.lexer.token_start;
      let token_end = this.lexer.token_end;
      if (token_type === 13) continue;
      if (token_type === 18) continue;
      if (token_type === 5 || token_type === 1) {
        let lang_node = this.create_node(56, token_start, token_end);
        if (first_child === null) first_child = lang_node;
        if (last_child !== null) this.arena.set_next_sibling(last_child, lang_node);
        last_child = lang_node;
      }
      if (this.lexer.pos >= end) break;
    }
    if (first_child !== null) this.arena.set_first_child(parent_node, first_child);
    this.selector_end = saved_selector_end;
    this.lexer.restore_position(saved_position);
  }
  parse_nth_expression(start, end) {
    let of_index = this.find_of_keyword(start, end);
    let anplusb_parser = this.anplusb_parser;
    if (of_index === -1) return anplusb_parser.parse_anplusb(start, end, this.lexer.line);
    let anplusb_node = anplusb_parser.parse_anplusb(start, of_index, this.lexer.line);
    let selector_start = of_index + 2;
    selector_start = skip_whitespace_forward(this.source, selector_start, end);
    let saved_selector_end = this.selector_end;
    const saved = this.lexer.save_position();
    this.selector_end = end;
    this.lexer.pos = selector_start;
    let selector_list = this.parse_selector_list();
    this.selector_end = saved_selector_end;
    this.lexer.restore_position(saved);
    let of_node = this.arena.create_node(31, start, end - start, this.lexer.line, 1);
    if (anplusb_node !== null && selector_list !== null) {
      this.arena.set_first_child(of_node, anplusb_node);
      this.arena.set_next_sibling(anplusb_node, selector_list);
    } else if (anplusb_node !== null) this.arena.set_first_child(of_node, anplusb_node);
    return of_node;
  }
  find_of_keyword(start, end) {
    let i = start;
    while (i < end - 1) {
      i = skip_whitespace_and_comments_forward(this.source, i, end);
      if (i >= end - 1) break;
      let ch1 = this.source.charCodeAt(i);
      let ch2 = this.source.charCodeAt(i + 1);
      if ((ch1 === 111 || ch1 === 79) && (ch2 === 102 || ch2 === 70)) {
        let before_ok = i === start || is_whitespace(this.source.charCodeAt(i - 1));
        let after_ok = i + 2 >= end || is_whitespace(this.source.charCodeAt(i + 2));
        if (before_ok && after_ok) return i;
      }
      i++;
    }
    return -1;
  }
  create_node(type, start, end, line = this.lexer.token_line, column = this.lexer.token_column) {
    let node = this.arena.create_node(type, start, end - start, line, column);
    this.arena.set_content_start_delta(node, 0);
    this.arena.set_content_length(node, end - start);
    return node;
  }
  skip_whitespace() {
    this.lexer.skip_whitespace_in_range(this.selector_end);
  }
};
function parse_selector_list(source) {
  const arena = new CSSDataArena(CSSDataArena.capacity_for_source(source.length));
  const selector_index = new SelectorParser(arena, source).parse_selector(0, source.length);
  if (selector_index === null) {
    const empty = arena.create_node(20, 0, 0, 1, 1);
    return new CSSNode(arena, source, empty);
  }
  return new CSSNode(arena, source, selector_index);
}

// node_modules/@projectwallace/css-parser/dist/value-node-parser-jRoWXgOr.js
var ValueNodeParser = class {
  lexer;
  arena;
  source;
  end = 0;
  last_chain_node = 0;
  constructor(arena, source) {
    this.arena = arena;
    this.source = source;
    this.lexer = new Lexer(source);
  }
  parse_chain(start, end, start_line, start_column) {
    this.end = end;
    this.lexer.seek(start, start_line, start_column);
    let first_node = 0;
    let last_node = 0;
    while (this.lexer.pos < this.end) {
      this.lexer.next_token_fast(false);
      if (this.lexer.token_start >= this.end) break;
      if (this.lexer.token_type === 26) break;
      if (this.is_whitespace_inline()) continue;
      let node = this.parse_value_node();
      if (node !== null) {
        if (first_node === 0) first_node = node;
        else this.arena.set_next_sibling(last_node, node);
        last_node = node;
      }
    }
    this.last_chain_node = last_node;
    return first_node;
  }
  is_whitespace_inline() {
    if (this.lexer.token_start >= this.lexer.token_end) return false;
    for (let i = this.lexer.token_start; i < this.lexer.token_end; i++) if (!is_whitespace(this.source.charCodeAt(i))) return false;
    return true;
  }
  parse_value_node() {
    let token_type = this.lexer.token_type;
    let start = this.lexer.token_start;
    let end = this.lexer.token_end;
    switch (token_type) {
      case 1:
        return this.create_node(10, start, end);
      case 10:
        return this.create_node(11, start, end);
      case 11:
      case 12:
        return this.create_node(12, start, end);
      case 5:
        return this.create_node(13, start, end);
      case 4:
        return this.create_node(14, start, end);
      case 27:
        return this.create_node(19, start, end);
      case 2:
        return this.parse_function_node(start, end);
      case 9:
        return this.parse_operator_node(start, end);
      case 18:
        return this.create_node(16, start, end);
      case 21:
        return this.parse_parenthesis_node(start, end);
      default:
        return null;
    }
  }
  create_node(node_type, start, end) {
    let node = this.arena.create_node(node_type, start, end - start, this.lexer.token_line, this.lexer.token_column);
    this.arena.set_content_length(node, end - start);
    return node;
  }
  parse_operator_node(start, end) {
    let ch = this.source.charCodeAt(start);
    if (ch === 43 || ch === 45 || ch === 42 || ch === 47) return this.create_node(16, start, end);
    return null;
  }
  parse_function_node(start, end) {
    let name_end = end - 1;
    let func_name_substr = this.source.substring(start, name_end);
    let node = this.arena.create_node(str_equals("url", func_name_substr) ? 18 : 15, start, 0, this.lexer.token_line, this.lexer.token_column);
    this.arena.set_content_start_delta(node, 0);
    this.arena.set_content_length(node, name_end - start);
    if (str_equals("url", func_name_substr) || str_equals("src", func_name_substr)) {
      let save_pos = this.lexer.save_position();
      this.lexer.next_token_fast(false);
      while (this.is_whitespace_inline() && this.lexer.pos < this.end) this.lexer.next_token_fast(false);
      let first_token_type = this.lexer.token_type;
      this.lexer.restore_position(save_pos);
      if (first_token_type === 5) {
      } else {
        let paren_depth2 = 1;
        let func_end2 = end;
        let content_start2 = end;
        let content_end2 = end;
        while (paren_depth2 > 0) {
          this.lexer.next_token_fast(false);
          let token_type = this.lexer.token_type;
          if (token_type === 26) break;
          if (token_type === 21 || token_type === 2) paren_depth2++;
          else if (token_type === 22) {
            paren_depth2--;
            if (paren_depth2 === 0) {
              content_end2 = this.lexer.token_start;
              func_end2 = this.lexer.token_end;
              break;
            }
          }
        }
        this.arena.set_length(node, func_end2 - start);
        this.arena.set_value_start_delta(node, content_start2 - start);
        this.arena.set_value_length(node, content_end2 - content_start2);
        return node;
      }
    }
    let first_arg = 0;
    let last_arg = 0;
    let paren_depth = 1;
    let func_end = end;
    let content_start = end;
    let content_end = end;
    while (this.lexer.pos < this.end && paren_depth > 0) {
      this.lexer.next_token_fast(false);
      let token_type = this.lexer.token_type;
      if (token_type === 26) break;
      if (this.lexer.token_start >= this.end) break;
      if (token_type === 22) {
        paren_depth--;
        if (paren_depth === 0) {
          content_end = this.lexer.token_start;
          func_end = this.lexer.token_end;
          break;
        }
      }
      if (this.is_whitespace_inline()) continue;
      let arg_node = this.parse_value_node();
      if (arg_node !== null) {
        if (first_arg === 0) first_arg = arg_node;
        else this.arena.set_next_sibling(last_arg, arg_node);
        last_arg = arg_node;
      }
    }
    this.arena.set_length(node, func_end - start);
    this.arena.set_value_start_delta(node, content_start - start);
    this.arena.set_value_length(node, content_end - content_start);
    if (first_arg !== 0) this.arena.set_first_child(node, first_arg);
    return node;
  }
  parse_parenthesis_node(start, end) {
    let node = this.arena.create_node(17, start, 0, this.lexer.token_line, this.lexer.token_column);
    let first_child = 0;
    let last_child = 0;
    let paren_depth = 1;
    let paren_end = end;
    while (this.lexer.pos < this.end && paren_depth > 0) {
      this.lexer.next_token_fast(false);
      let token_type = this.lexer.token_type;
      if (token_type === 26) break;
      if (this.lexer.token_start >= this.end) break;
      if (token_type === 22) {
        paren_depth--;
        if (paren_depth === 0) {
          paren_end = this.lexer.token_end;
          break;
        }
      }
      if (this.is_whitespace_inline()) continue;
      let child_node = this.parse_value_node();
      if (child_node !== null) {
        if (first_child === 0) first_child = child_node;
        else this.arena.set_next_sibling(last_child, child_node);
        last_child = child_node;
      }
    }
    this.arena.set_length(node, paren_end - start);
    if (first_child !== 0) this.arena.set_first_child(node, first_child);
    return node;
  }
};

// node_modules/@projectwallace/css-parser/dist/parse-atrule-prelude.js
var AtRulePreludeParser = class {
  lexer;
  arena;
  source;
  prelude_end;
  value_node_parser;
  selector_parser;
  constructor(arena, source) {
    this.arena = arena;
    this.source = source;
    this.lexer = new Lexer(source);
    this.prelude_end = 0;
    this.value_node_parser = new ValueNodeParser(arena, source);
    this.selector_parser = new SelectorParser(arena, source);
  }
  parse_prelude(at_rule_name, start, end, line = 1, column = 1) {
    this.prelude_end = end;
    this.lexer.seek(start, line, column);
    return this.parse_prelude_dispatch(at_rule_name);
  }
  parse_prelude_dispatch(at_rule_name) {
    switch (strip_vendor_prefix(at_rule_name).toLowerCase()) {
      case "media":
        return this.parse_media_query_list();
      case "container":
        return this.parse_container_query();
      case "supports":
        return this.parse_supports_query();
      case "layer":
        return this.parse_layer_names();
      case "keyframes":
      case "property":
      case "counter-style":
      case "color-profile":
      case "font-palette-values":
      case "position-try":
      case "font-feature-values":
      case "page":
        return this.parse_identifier();
      case "function":
        return this.parse_function_prelude();
      case "import":
        return this.parse_import_prelude();
      case "charset":
        return this.parse_charset_prelude();
      case "namespace":
        return this.parse_namespace_prelude();
      case "scope":
        return this.parse_scope_prelude();
      case "custom-media":
        return this.parse_custom_media_prelude();
    }
    return [];
  }
  parse_media_query_list() {
    let nodes = [];
    while (this.lexer.pos < this.prelude_end) {
      this.skip_whitespace();
      if (this.lexer.pos >= this.prelude_end) break;
      let query = this.parse_single_media_query();
      if (query !== null) nodes.push(query);
      this.skip_whitespace();
      const saved = this.lexer.save_position();
      this.next_token();
      if (this.lexer.token_type !== 18) this.lexer.restore_position(saved);
    }
    return nodes;
  }
  create_node(type, start, end) {
    return this.arena.create_node(type, start, end - start, this.lexer.token_line, this.lexer.token_column);
  }
  is_and_or_not(str) {
    return str_equals("and", str) || str_equals("or", str) || str_equals("not", str);
  }
  scan_matching_paren() {
    let depth2 = 1;
    let content_end = this.lexer.pos;
    let close_end = this.lexer.token_end;
    while (this.lexer.pos < this.prelude_end && depth2 > 0) {
      let token_type = this.next_token();
      if (token_type === 21 || token_type === 2) depth2++;
      else if (token_type === 22) {
        depth2--;
        if (depth2 === 0) {
          content_end = this.lexer.token_start;
          close_end = this.lexer.token_end;
        }
      } else if (token_type === 26) break;
    }
    return [
      content_end,
      close_end,
      depth2 === 0
    ];
  }
  parse_function_condition() {
    let func_name = this.source.substring(this.lexer.token_start, this.lexer.token_end - 1);
    let func_start = this.lexer.token_start;
    let content_start = this.lexer.token_end;
    let [content_end, func_end] = this.scan_matching_paren();
    let func_node = this.create_node(15, func_start, func_end);
    this.arena.set_content_start_delta(func_node, 0);
    this.arena.set_content_length(func_node, func_name.length);
    this.arena.set_value_start_delta(func_node, content_start - func_start);
    this.arena.set_value_length(func_node, content_end - content_start);
    if (str_equals("selector", func_name)) {
      let selector_list = this.selector_parser.parse_selector(content_start, content_end, this.lexer.line, this.lexer.column);
      if (selector_list !== null) this.arena.set_first_child(func_node, selector_list);
    } else if (str_equals("style", func_name)) {
      let colon_pos = this.find_colon_at_depth_zero(content_start, content_end);
      if (colon_pos !== -1) {
        let decl_child = this.create_supports_declaration(content_start, content_end, colon_pos);
        this.arena.set_first_child(func_node, decl_child);
      }
    }
    return func_node;
  }
  parse_single_media_query() {
    let query_start = this.lexer.pos;
    this.skip_whitespace();
    if (this.lexer.pos >= this.prelude_end) return null;
    let first_component = 0;
    let last_component = 0;
    const saved_token_start = this.lexer.save_position();
    this.next_token();
    if (this.lexer.token_type === 1) {
      let text = this.source.substring(this.lexer.token_start, this.lexer.token_end);
      if (str_equals("only", text) || str_equals("not", text)) {
        let modifier = this.create_node(38, this.lexer.token_start, this.lexer.token_end);
        first_component = modifier;
        last_component = modifier;
      } else this.lexer.restore_position(saved_token_start);
    } else this.lexer.restore_position(saved_token_start);
    while (this.lexer.pos < this.prelude_end) {
      this.skip_whitespace();
      if (this.lexer.pos >= this.prelude_end) break;
      if (this.peek_token_type() === 18) break;
      this.next_token();
      let token_type = this.lexer.token_type;
      let component = null;
      if (token_type === 21) component = this.parse_media_feature();
      else if (token_type === 1) {
        let text = this.source.substring(this.lexer.token_start, this.lexer.token_end);
        if (this.is_and_or_not(text)) component = this.create_node(38, this.lexer.token_start, this.lexer.token_end);
        else component = this.create_node(34, this.lexer.token_start, this.lexer.token_end);
      } else break;
      if (component !== null) {
        if (first_component === 0) first_component = component;
        else this.arena.set_next_sibling(last_component, component);
        last_component = component;
      }
    }
    if (first_component === 0) return null;
    let query_node = this.create_node(32, query_start, this.lexer.pos);
    this.arena.set_first_child(query_node, first_component);
    return query_node;
  }
  parse_media_feature() {
    let feature_start = this.lexer.token_start;
    let content_start = this.lexer.pos;
    let [content_end, feature_end, matched] = this.scan_matching_paren();
    if (!matched) return null;
    let has_comparison = false;
    let i = content_start;
    while (i < content_end) {
      i = skip_whitespace_and_comments_forward(this.source, i, content_end);
      if (i >= content_end) break;
      let ch = this.source.charCodeAt(i);
      if (ch === 60 || ch === 62 || ch === 61) {
        has_comparison = true;
        break;
      }
      i++;
    }
    if (has_comparison) return this.parse_feature_range(feature_start, feature_end, content_start, content_end);
    let feature = this.create_node(33, feature_start, feature_end);
    let colon_pos = -1;
    let j = content_start;
    while (j < content_end) {
      j = skip_whitespace_and_comments_forward(this.source, j, content_end);
      if (j >= content_end) break;
      if (this.source.charCodeAt(j) === 58) {
        colon_pos = j;
        break;
      }
      j++;
    }
    if (colon_pos === -1) {
      let trimmed = trim_boundaries(this.source, content_start, content_end);
      if (trimmed) {
        this.arena.set_content_start_delta(feature, trimmed[0] - feature_start);
        this.arena.set_content_length(feature, trimmed[1] - trimmed[0]);
      }
    } else {
      let name_trimmed = trim_boundaries(this.source, content_start, colon_pos);
      if (name_trimmed) {
        this.arena.set_content_start_delta(feature, name_trimmed[0] - feature_start);
        this.arena.set_content_length(feature, name_trimmed[1] - name_trimmed[0]);
      }
      let value_trimmed = trim_boundaries(this.source, colon_pos + 1, content_end);
      if (value_trimmed) {
        let value_first = this.parse_feature_value(value_trimmed[0], value_trimmed[1]);
        if (value_first !== 0) this.arena.set_first_child(feature, value_first);
      }
    }
    return feature;
  }
  parse_container_query() {
    let query_start = this.lexer.pos;
    let first_component = 0;
    let last_component = 0;
    while (this.lexer.pos < this.prelude_end) {
      this.skip_whitespace();
      if (this.lexer.pos >= this.prelude_end) break;
      this.next_token();
      let token_type = this.lexer.token_type;
      let component = null;
      if (token_type === 21) component = this.parse_media_feature();
      else if (token_type === 2) component = this.parse_function_condition();
      else if (token_type === 1) {
        let text = this.source.substring(this.lexer.token_start, this.lexer.token_end);
        if (this.is_and_or_not(text)) component = this.create_node(38, this.lexer.token_start, this.lexer.token_end);
        else component = this.create_node(10, this.lexer.token_start, this.lexer.token_end);
      }
      if (component !== null) {
        if (first_component === 0) first_component = component;
        else this.arena.set_next_sibling(last_component, component);
        last_component = component;
      }
    }
    if (first_component === 0) return [];
    let query_node = this.create_node(35, query_start, this.lexer.pos);
    this.arena.set_first_child(query_node, first_component);
    return [query_node];
  }
  parse_supports_query() {
    let nodes = [];
    while (this.lexer.pos < this.prelude_end) {
      this.skip_whitespace();
      if (this.lexer.pos >= this.prelude_end) break;
      this.next_token();
      let token_type = this.lexer.token_type;
      if (token_type === 21) {
        let feature_start = this.lexer.token_start;
        let content_start = this.lexer.pos;
        let [content_end, feature_end, matched] = this.scan_matching_paren();
        if (matched) {
          let query = this.create_node(36, feature_start, feature_end);
          let trimmed = trim_boundaries(this.source, content_start, content_end);
          if (trimmed) {
            this.arena.set_value_start_delta(query, trimmed[0] - feature_start);
            this.arena.set_value_length(query, trimmed[1] - trimmed[0]);
            let colon_pos = this.find_colon_at_depth_zero(trimmed[0], trimmed[1]);
            if (colon_pos !== -1) {
              let decl_child = this.create_supports_declaration(trimmed[0], trimmed[1], colon_pos);
              this.arena.set_first_child(query, decl_child);
            }
          }
          nodes.push(query);
        }
      } else if (token_type === 1) {
        let text = this.source.substring(this.lexer.token_start, this.lexer.token_end);
        if (this.is_and_or_not(text)) {
          let op = this.create_node(38, this.lexer.token_start, this.lexer.token_end);
          nodes.push(op);
        }
      } else if (token_type === 2) nodes.push(this.parse_function_condition());
    }
    return nodes;
  }
  find_colon_at_depth_zero(start, end) {
    let depth2 = 0;
    for (let i = start; i < end; i++) {
      let ch = this.source.charCodeAt(i);
      if (ch === 40) depth2++;
      else if (ch === 41) depth2--;
      else if (ch === 58 && depth2 === 0) return i;
    }
    return -1;
  }
  create_supports_declaration(content_start, content_end, colon_pos) {
    let prop_trimmed = trim_boundaries(this.source, content_start, colon_pos);
    let val_trimmed = trim_boundaries(this.source, colon_pos + 1, content_end);
    if (!prop_trimmed) return this.create_node(57, content_start, content_end);
    let decl_start = prop_trimmed[0];
    let decl_end = val_trimmed ? val_trimmed[1] : colon_pos + 1;
    let decl = this.create_node(4, decl_start, decl_end);
    this.arena.set_content_start_delta(decl, 0);
    this.arena.set_content_length(decl, prop_trimmed[1] - prop_trimmed[0]);
    if (val_trimmed) {
      let value_first = this.parse_feature_value(val_trimmed[0], val_trimmed[1]);
      let value_node;
      if (value_first === 0) value_node = this.arena.create_node(50, val_trimmed[0], 0, this.lexer.token_line, this.lexer.token_column);
      else {
        value_node = this.arena.create_node(50, val_trimmed[0], val_trimmed[1] - val_trimmed[0], this.lexer.token_line, this.lexer.token_column);
        this.arena.set_first_child(value_node, value_first);
      }
      this.arena.set_first_child(decl, value_node);
    }
    let supports_decl = this.create_node(57, content_start, content_end);
    this.arena.set_content_start_delta(supports_decl, prop_trimmed[0] - content_start);
    this.arena.set_content_length(supports_decl, prop_trimmed[1] - prop_trimmed[0]);
    this.arena.set_first_child(supports_decl, decl);
    return supports_decl;
  }
  parse_layer_names() {
    let nodes = [];
    while (this.lexer.pos < this.prelude_end) {
      this.skip_whitespace();
      if (this.lexer.pos >= this.prelude_end) break;
      this.next_token();
      let token_type = this.lexer.token_type;
      if (token_type === 1) {
        let name_start = this.lexer.token_start;
        let name_end = this.lexer.token_end;
        while (this.lexer.pos < this.prelude_end) {
          let saved = this.lexer.save_position();
          if (this.next_token() !== 9 || this.source.charCodeAt(this.lexer.token_start) !== 46 || this.lexer.token_start !== name_end) {
            this.lexer.restore_position(saved);
            break;
          }
          let dot_end = this.lexer.token_end;
          if (this.next_token() !== 1 || this.lexer.token_start !== dot_end) {
            this.lexer.restore_position(saved);
            break;
          }
          name_end = this.lexer.token_end;
        }
        let layer = this.create_node(37, name_start, name_end);
        this.arena.set_content_start_delta(layer, 0);
        this.arena.set_content_length(layer, name_end - name_start);
        nodes.push(layer);
      } else if (token_type === 18) continue;
      else if (token_type === 13) continue;
    }
    return nodes;
  }
  parse_function_prelude() {
    this.skip_whitespace();
    if (this.lexer.pos >= this.prelude_end) return [];
    this.next_token();
    if (this.lexer.token_type !== 2) return [];
    let name_start = this.lexer.token_start;
    let name_end = this.lexer.token_end - 1;
    return [this.create_node(10, name_start, name_end)];
  }
  parse_identifier() {
    this.skip_whitespace();
    if (this.lexer.pos >= this.prelude_end) return [];
    this.next_token();
    if (this.lexer.token_type !== 1) return [];
    return [this.create_node(10, this.lexer.token_start, this.lexer.token_end)];
  }
  parse_charset_prelude() {
    this.skip_whitespace();
    if (this.lexer.pos >= this.prelude_end) return [];
    this.next_token();
    if (this.lexer.token_type !== 5) return [];
    return [this.create_node(13, this.lexer.token_start, this.lexer.token_end)];
  }
  parse_import_prelude() {
    let nodes = [];
    this.skip_whitespace();
    if (this.lexer.pos >= this.prelude_end) return [];
    let url_node = this.parse_import_url();
    if (url_node === null) return [];
    nodes.push(url_node);
    this.skip_whitespace();
    if (this.lexer.pos >= this.prelude_end) return nodes;
    let layer_node = this.parse_import_layer();
    if (layer_node !== null) nodes.push(layer_node);
    this.skip_whitespace();
    if (this.lexer.pos >= this.prelude_end) return nodes;
    let supports_node = this.parse_import_supports();
    if (supports_node !== null) nodes.push(supports_node);
    this.skip_whitespace();
    if (this.lexer.pos >= this.prelude_end) return nodes;
    let media_nodes = this.parse_media_query_list();
    nodes.push(...media_nodes);
    return nodes;
  }
  parse_import_url() {
    this.next_token();
    if (this.lexer.token_type !== 7 && this.lexer.token_type !== 2 && this.lexer.token_type !== 5) return null;
    let url_start = this.lexer.token_start;
    let url_end = this.lexer.token_end;
    if (this.lexer.token_type === 2) {
      let [, close_end] = this.scan_matching_paren();
      url_end = close_end;
    }
    return this.create_node(18, url_start, url_end);
  }
  parse_import_layer() {
    const saved = this.lexer.save_position();
    this.next_token();
    if (this.lexer.token_type === 1 || this.lexer.token_type === 2) {
      let text = this.source.substring(this.lexer.token_start, this.lexer.token_end);
      if (this.lexer.token_type === 2 && text.endsWith("(")) text = text.slice(0, -1);
      if (str_equals("layer", text)) {
        let layer_start = this.lexer.token_start;
        let layer_end = this.lexer.token_end;
        let content_start = 0;
        let content_length = 0;
        if (this.lexer.token_type === 2) {
          content_start = this.lexer.pos;
          let [content_end, close_end, matched] = this.scan_matching_paren();
          if (matched) {
            content_length = content_end - content_start;
            layer_end = close_end;
          }
        }
        let layer_node = this.create_node(37, layer_start, layer_end);
        if (content_length > 0) {
          let trimmed = trim_boundaries(this.source, content_start, content_start + content_length);
          if (trimmed) {
            this.arena.set_content_start_delta(layer_node, trimmed[0] - layer_start);
            this.arena.set_content_length(layer_node, trimmed[1] - trimmed[0]);
          }
        }
        return layer_node;
      }
    }
    this.lexer.restore_position(saved);
    return null;
  }
  parse_import_supports() {
    const saved = this.lexer.save_position();
    this.next_token();
    if (this.lexer.token_type === 2) {
      let text = this.source.substring(this.lexer.token_start, this.lexer.token_end - 1);
      if (str_equals("supports", text)) {
        let supports_start = this.lexer.token_start;
        let content_start = this.lexer.token_end;
        let [content_end, supports_end] = this.scan_matching_paren();
        let supports_node = this.create_node(36, supports_start, supports_end);
        let trimmed = trim_boundaries(this.source, content_start, content_end);
        if (trimmed) {
          this.arena.set_value_start_delta(supports_node, trimmed[0] - supports_start);
          this.arena.set_value_length(supports_node, trimmed[1] - trimmed[0]);
          let colon_pos = this.find_colon_at_depth_zero(trimmed[0], trimmed[1]);
          if (colon_pos !== -1) {
            let decl_child = this.create_supports_declaration(trimmed[0], trimmed[1], colon_pos);
            this.arena.set_first_child(supports_node, decl_child);
          }
        }
        return supports_node;
      }
    }
    this.lexer.restore_position(saved);
    return null;
  }
  skip_whitespace() {
    this.lexer.skip_whitespace_in_range(this.prelude_end);
  }
  peek_token_type() {
    const saved = this.lexer.save_position();
    this.next_token();
    let type = this.lexer.token_type;
    this.lexer.restore_position(saved);
    return type;
  }
  next_token() {
    if (this.lexer.pos >= this.prelude_end) {
      this.lexer.token_type = 26;
      return 26;
    }
    return this.lexer.next_token_fast(false);
  }
  parse_feature_value(start, end) {
    return this.value_node_parser.parse_chain(start, end, this.lexer.line, this.lexer.column);
  }
  parse_namespace_prelude() {
    let nodes = [];
    this.skip_whitespace();
    if (this.lexer.pos >= this.prelude_end) return [];
    const saved = this.lexer.save_position();
    this.next_token();
    if (this.lexer.token_type === 1) {
      nodes.push(this.create_node(10, this.lexer.token_start, this.lexer.token_end));
      this.skip_whitespace();
    } else this.lexer.restore_position(saved);
    const url_node = this.parse_import_url();
    if (url_node !== null) nodes.push(url_node);
    return nodes;
  }
  parse_scope_prelude() {
    let nodes = [];
    while (this.lexer.pos < this.prelude_end) {
      this.skip_whitespace();
      if (this.lexer.pos >= this.prelude_end) break;
      const token_type = this.peek_token_type();
      if (token_type === 21) {
        this.next_token();
        let paren_start = this.lexer.token_start;
        let content_start = this.lexer.pos;
        let [content_end, paren_end] = this.scan_matching_paren();
        let scope_node = this.create_node(41, paren_start, paren_end);
        let trimmed = trim_boundaries(this.source, content_start, content_end);
        if (trimmed) {
          this.arena.set_value_start_delta(scope_node, trimmed[0] - paren_start);
          this.arena.set_value_length(scope_node, trimmed[1] - trimmed[0]);
        }
        nodes.push(scope_node);
      } else if (token_type === 1) {
        this.next_token();
        let text = this.source.substring(this.lexer.token_start, this.lexer.token_end);
        if (str_equals("to", text)) nodes.push(this.create_node(38, this.lexer.token_start, this.lexer.token_end));
      } else this.next_token();
    }
    return nodes;
  }
  parse_custom_media_prelude() {
    let nodes = [];
    this.skip_whitespace();
    if (this.lexer.pos >= this.prelude_end) return [];
    this.next_token();
    if (this.lexer.token_type !== 1) return [];
    nodes.push(this.create_node(10, this.lexer.token_start, this.lexer.token_end), ...this.parse_media_query_list());
    return nodes;
  }
  parse_feature_range(feature_start, feature_end, content_start, content_end) {
    let range_node = this.create_node(39, feature_start, feature_end);
    let first_child = 0;
    let last_child = 0;
    let feature_name_start = -1;
    let feature_name_end = -1;
    let pos = content_start;
    while (pos < content_end) {
      pos = skip_whitespace_and_comments_forward(this.source, pos, content_end);
      if (pos >= content_end) break;
      let ch = this.source.charCodeAt(pos);
      if (ch === 60 || ch === 62 || ch === 61) {
        let op_start = pos++;
        if (pos < content_end && this.source.charCodeAt(pos) === 61) pos++;
        let op = this.create_node(38, op_start, pos);
        if (first_child === 0) first_child = op;
        else this.arena.set_next_sibling(last_child, op);
        last_child = op;
      } else {
        let saved = this.lexer.save_position();
        this.lexer.pos = pos;
        this.next_token();
        if (this.lexer.token_type === 1) {
          feature_name_start = this.lexer.token_start;
          feature_name_end = this.lexer.token_end;
        } else {
          let value_first = this.parse_feature_value(this.lexer.token_start, this.lexer.token_end);
          if (value_first !== 0) {
            if (first_child === 0) first_child = value_first;
            else this.arena.set_next_sibling(last_child, value_first);
            last_child = this.arena.get_last_sibling(value_first);
          }
        }
        pos = this.lexer.pos;
        this.lexer.restore_position(saved);
      }
    }
    if (feature_name_start !== -1) {
      this.arena.set_content_start_delta(range_node, feature_name_start - feature_start);
      this.arena.set_content_length(range_node, feature_name_end - feature_name_start);
    }
    if (first_child !== 0) this.arena.set_first_child(range_node, first_child);
    return range_node;
  }
};

// node_modules/@projectwallace/css-parser/dist/parse-value.js
var ValueParser = class {
  nodes;
  arena;
  constructor(arena, source) {
    this.arena = arena;
    this.nodes = new ValueNodeParser(arena, source);
  }
  parse_value(start, end, start_line, start_column) {
    let first_node = this.nodes.parse_chain(start, end, start_line, start_column);
    if (first_node === 0) return this.arena.create_node(50, start, 0, start_line, start_column);
    let last_node = this.nodes.last_chain_node;
    let first_node_start = this.arena.get_start_offset(first_node);
    let last_node_end = this.arena.get_start_offset(last_node) + this.arena.get_length(last_node);
    let value_node = this.arena.create_node(50, first_node_start, last_node_end - first_node_start, start_line, start_column);
    this.arena.set_first_child(value_node, first_node);
    return value_node;
  }
};

// node_modules/@projectwallace/css-parser/dist/parse-declaration.js
var DeclarationParser = class {
  arena;
  source;
  value_parser;
  constructor(arena, source, parse_values = true) {
    this.arena = arena;
    this.source = source;
    this.value_parser = parse_values ? new ValueParser(arena, source) : null;
  }
  parse_declaration(start, end, line = 1, column = 1) {
    const lexer = new Lexer(this.source);
    lexer.seek(start, line, column);
    lexer.next_token_fast(true);
    return this.parse_declaration_with_lexer(lexer, end);
  }
  parse_declaration_with_lexer(lexer, end) {
    const initial_saved = lexer.save_position();
    let has_browser_hack = false;
    let has_delimiter_prefix = false;
    let browser_hack_start = 0;
    let browser_hack_line = 1;
    let browser_hack_column = 1;
    if (lexer.token_type === 1) {
      const first_char = this.source.charCodeAt(lexer.token_start);
      if (first_char === 95) {
        has_browser_hack = true;
        browser_hack_start = lexer.token_start;
        browser_hack_line = lexer.token_line;
        browser_hack_column = lexer.token_column;
      } else if (first_char === 45) {
        if (this.source.charCodeAt(lexer.token_start + 1) !== 45 && !is_vendor_prefixed(this.source, lexer.token_start, lexer.token_end)) {
          has_browser_hack = true;
          browser_hack_start = lexer.token_start;
          browser_hack_line = lexer.token_line;
          browser_hack_column = lexer.token_column;
        }
      }
    } else if (lexer.token_type === 3 || lexer.token_type === 4) {
      has_browser_hack = true;
      browser_hack_start = lexer.token_start;
      browser_hack_line = lexer.token_line;
      browser_hack_column = lexer.token_column;
    } else if (lexer.token_type === 9 || lexer.token_type === 21 || lexer.token_type === 22 || lexer.token_type === 19 || lexer.token_type === 20 || lexer.token_type === 18 || lexer.token_type === 16) {
      const delim_saved = lexer.save_position();
      browser_hack_start = lexer.token_start;
      browser_hack_line = lexer.token_line;
      browser_hack_column = lexer.token_column;
      lexer.next_token_fast(true);
      if (lexer.token_type === 1) {
        has_browser_hack = true;
        has_delimiter_prefix = true;
      } else lexer.restore_position(delim_saved);
    }
    if (lexer.token_type !== 1 && lexer.token_type !== 3 && lexer.token_type !== 4) return null;
    let prop_start = has_browser_hack ? browser_hack_start : lexer.token_start;
    let prop_end = lexer.token_end;
    let decl_line = has_browser_hack ? browser_hack_line : lexer.token_line;
    let decl_column = has_browser_hack ? browser_hack_column : lexer.token_column;
    const saved = lexer.save_position();
    lexer.next_token_fast(true);
    if (lexer.token_type !== 16) {
      lexer.restore_position(has_delimiter_prefix ? initial_saved : saved);
      return null;
    }
    lexer.pos = lexer.token_end;
    lexer.skip_whitespace_in_range(this.source.length);
    let declaration = this.arena.create_node(4, prop_start, 0, decl_line, decl_column);
    this.arena.set_content_start_delta(declaration, 0);
    this.arena.set_content_length(declaration, prop_end - prop_start);
    let value_start = lexer.pos;
    let value_start_line = lexer.line;
    let value_start_column = lexer.column;
    let value_end = value_start;
    let has_important = false;
    let last_end = value_start;
    let paren_depth = 0;
    while (true) {
      let stop_ch = lexer.skip_to_declaration_stop(end);
      if (stop_ch === 40) {
        paren_depth++;
        lexer.pos++;
        continue;
      }
      if (stop_ch === 41) {
        paren_depth--;
        lexer.pos++;
        continue;
      }
      if (stop_ch === 59 && paren_depth === 0) {
        value_end = skip_whitespace_and_comments_backward(this.source, lexer.pos, value_start);
        lexer.next_token_fast(false);
        break;
      }
      if (stop_ch === 125 && paren_depth === 0) {
        if (lexer.pos === value_start) {
          last_end = lexer.pos + 1;
          value_end = value_start;
        } else {
          last_end = skip_whitespace_and_comments_backward(this.source, lexer.pos, value_start);
          value_end = last_end;
        }
        lexer.next_token_fast(false);
        break;
      }
      if (stop_ch === 123) {
        lexer.restore_position(saved);
        return null;
      }
      if (stop_ch === 33) {
        value_end = lexer.pos;
        lexer.pos++;
        if (lexer.next_token_fast(true) === 1) {
          has_important = true;
          last_end = lexer.token_end;
          lexer.next_token_fast(true);
          break;
        }
        last_end = lexer.token_end;
        value_end = last_end;
        continue;
      }
      if (stop_ch === 0) {
        last_end = skip_whitespace_and_comments_backward(this.source, lexer.pos, value_start);
        value_end = last_end;
        lexer.next_token_fast(false);
        break;
      }
      lexer.pos++;
    }
    let trimmed = trim_boundaries(this.source, value_start, value_end);
    if (trimmed) {
      this.arena.set_value_start_delta(declaration, trimmed[0] - prop_start);
      this.arena.set_value_length(declaration, trimmed[1] - trimmed[0]);
      if (this.value_parser) {
        let valueNode = this.value_parser.parse_value(value_start, trimmed[1], value_start_line, value_start_column);
        this.arena.set_first_child(declaration, valueNode);
      } else {
        let rawNode = this.arena.create_node(8, trimmed[0], trimmed[1] - trimmed[0], value_start_line, value_start_column);
        this.arena.set_first_child(declaration, rawNode);
      }
    } else {
      this.arena.set_value_start_delta(declaration, value_start - prop_start);
      this.arena.set_value_length(declaration, 0);
      if (this.value_parser) {
        let valueNode = this.value_parser.parse_value(value_start, value_start, value_start_line, value_start_column);
        this.arena.set_first_child(declaration, valueNode);
      }
    }
    if (has_important) this.arena.set_flag(declaration, 1);
    if (has_browser_hack) this.arena.set_flag(declaration, 128);
    if (lexer.token_type === 17) {
      last_end = lexer.token_end;
      lexer.next_token_fast(true);
    }
    this.arena.set_length(declaration, last_end - prop_start);
    return declaration;
  }
};

// node_modules/@projectwallace/css-parser/dist/parse.js
var DECLARATION_AT_RULES = /* @__PURE__ */ new Set([
  "font-face",
  "font-feature-values",
  "page",
  "property",
  "counter-style",
  "color-profile",
  "font-palette-values",
  "position-try",
  "view-transition"
]);
var Parser = class {
  source;
  lexer;
  arena;
  selector_parser;
  prelude_parser;
  declaration_parser;
  parse_values_enabled;
  parse_selectors_enabled;
  parse_atrule_preludes_enabled;
  constructor(source, options) {
    this.source = source;
    let opts = options || {};
    this.parse_values_enabled = opts.parse_values ?? true;
    this.parse_selectors_enabled = opts.parse_selectors ?? true;
    this.parse_atrule_preludes_enabled = opts.parse_atrule_preludes ?? true;
    this.lexer = new Lexer(source, opts.on_comment);
    let capacity = CSSDataArena.capacity_for_source(source.length);
    this.arena = new CSSDataArena(capacity);
    this.selector_parser = this.parse_selectors_enabled ? new SelectorParser(this.arena, source) : null;
    this.prelude_parser = this.parse_atrule_preludes_enabled ? new AtRulePreludeParser(this.arena, source) : null;
    this.declaration_parser = new DeclarationParser(this.arena, source, this.parse_values_enabled);
  }
  get_arena() {
    return this.arena;
  }
  get_source() {
    return this.source;
  }
  next_token() {
    this.lexer.next_token_fast(true);
  }
  peek_type() {
    return this.lexer.token_type;
  }
  is_eof() {
    return this.peek_type() === 26;
  }
  parse() {
    this.next_token();
    let stylesheet = this.arena.create_node(1, 0, this.source.length, 1, 1);
    let first_rule = 0;
    let last_rule = 0;
    while (!this.is_eof()) {
      let rule = this.parse_rule();
      if (rule === null) this.next_token();
      else {
        if (first_rule === 0) first_rule = rule;
        else this.arena.set_next_sibling(last_rule, rule);
        last_rule = rule;
      }
    }
    if (first_rule !== 0) this.arena.set_first_child(stylesheet, first_rule);
    this.arena.trim();
    return new CSSNode(this.arena, this.source, stylesheet);
  }
  parse_rule() {
    if (this.is_eof()) return null;
    if (this.peek_type() === 3) return this.parse_atrule();
    return this.parse_style_rule();
  }
  parse_block_children(owner, declarations_only) {
    let first_child = 0;
    let last_child = 0;
    while (!this.is_eof()) {
      let token_type = this.peek_type();
      if (token_type === 24) break;
      let child = null;
      if (!declarations_only && token_type === 3) {
        child = this.parse_atrule();
        if (child === null) this.next_token();
      } else {
        child = this.parse_declaration();
        if (child !== null) this.arena.set_flag(owner, 32);
        else if (declarations_only) this.next_token();
        else {
          child = this.parse_style_rule();
          if (child === null) this.next_token();
        }
      }
      if (child !== null) {
        if (first_child === 0) first_child = child;
        else this.arena.set_next_sibling(last_child, child);
        last_child = child;
      }
    }
    return first_child;
  }
  parse_style_rule() {
    if (this.is_eof()) return null;
    let rule_start = this.lexer.token_start;
    let rule_line = this.lexer.token_line;
    let rule_column = this.lexer.token_column;
    let style_rule = this.arena.create_node(2, rule_start, 0, rule_line, rule_column);
    let selector = this.parse_selector();
    if (this.peek_type() !== 23) return null;
    let block_start = this.lexer.token_end;
    this.next_token();
    this.arena.set_flag(style_rule, 8);
    let block_line = this.lexer.token_line;
    let block_column = this.lexer.token_column;
    let block_node = this.arena.create_node(7, block_start, 0, block_line, block_column);
    let first_child = this.parse_block_children(style_rule, false);
    let block_end = this.lexer.token_start;
    let rule_end = this.lexer.token_end;
    if (this.peek_type() === 24) {
      block_end = this.lexer.token_start;
      rule_end = this.lexer.token_end;
      this.next_token();
    }
    this.arena.set_length(block_node, block_end - block_start);
    if (first_child !== 0) this.arena.set_first_child(block_node, first_child);
    this.arena.set_length(style_rule, rule_end - rule_start);
    if (selector === null) this.arena.set_first_child(style_rule, block_node);
    else {
      this.arena.set_first_child(style_rule, selector);
      this.arena.set_next_sibling(selector, block_node);
    }
    return style_rule;
  }
  parse_selector() {
    if (this.is_eof()) return null;
    let selector_start = this.lexer.token_start;
    let selector_line = this.lexer.token_line;
    let selector_column = this.lexer.token_column;
    let last_end = this.lexer.token_end;
    if (this.peek_type() !== 23) {
      this.lexer.skip_to_unquoted(123);
      last_end = skip_whitespace_and_comments_backward(this.source, this.lexer.pos, selector_start);
      this.next_token();
    }
    if (this.parse_selectors_enabled && this.selector_parser) {
      let selector = this.selector_parser.parse_selector(selector_start, last_end, selector_line, selector_column);
      if (selector !== null) return selector;
    }
    let node_type = this.parse_selectors_enabled ? 20 : 8;
    return this.arena.create_node(node_type, selector_start, last_end - selector_start, selector_line, selector_column);
  }
  parse_declaration() {
    const token_type = this.peek_type();
    if (token_type === 9 || token_type === 21 || token_type === 22 || token_type === 19 || token_type === 20 || token_type === 18 || token_type === 16) {
      const char_code = this.source.charCodeAt(this.lexer.token_start);
      if (char_code === 46 || char_code === 62 || char_code === 43 || char_code === 126 || char_code === 38) return null;
    } else if (token_type !== 1 && token_type !== 3 && token_type !== 4) return null;
    return this.declaration_parser.parse_declaration_with_lexer(this.lexer, this.source.length);
  }
  parse_atrule() {
    if (this.peek_type() !== 3) return null;
    let at_rule_start = this.lexer.token_start;
    let at_rule_line = this.lexer.token_line;
    let at_rule_column = this.lexer.token_column;
    let name_start = this.lexer.token_start + 1;
    let name_length = this.lexer.token_end - name_start;
    let at_rule_name = this.source.substring(name_start, this.lexer.token_end);
    this.next_token();
    let at_rule = this.arena.create_node(3, at_rule_start, 0, at_rule_line, at_rule_column);
    this.arena.set_content_start_delta(at_rule, name_start - at_rule_start);
    this.arena.set_content_length(at_rule, name_length);
    let prelude_start = this.lexer.token_start;
    let prelude_end = prelude_start;
    let paren_depth = 0;
    while (!this.is_eof()) {
      let token_type = this.peek_type();
      if (token_type === 21 || token_type === 2) paren_depth++;
      else if (token_type === 22) paren_depth--;
      if (token_type === 23 && paren_depth === 0) break;
      if (token_type === 17 && paren_depth === 0) break;
      prelude_end = this.lexer.token_end;
      this.next_token();
    }
    let trimmed = trim_boundaries(this.source, prelude_start, prelude_end);
    let prelude_wrapper = null;
    if (trimmed) if (this.prelude_parser) {
      let prelude_nodes = this.prelude_parser.parse_prelude(at_rule_name, trimmed[0], trimmed[1], at_rule_line, at_rule_column);
      if (prelude_nodes.length > 0) {
        prelude_wrapper = this.arena.create_node(40, trimmed[0], trimmed[1] - trimmed[0], at_rule_line, at_rule_column);
        this.arena.append_children(prelude_wrapper, prelude_nodes);
      } else prelude_wrapper = this.arena.create_node(8, trimmed[0], trimmed[1] - trimmed[0], at_rule_line, at_rule_column);
    } else prelude_wrapper = this.arena.create_node(8, trimmed[0], trimmed[1] - trimmed[0], at_rule_line, at_rule_column);
    let last_end = this.lexer.token_end;
    if (this.peek_type() === 23) {
      let block_start = this.lexer.token_end;
      this.next_token();
      this.arena.set_flag(at_rule, 8);
      let block_line = this.lexer.token_line;
      let block_column = this.lexer.token_column;
      let block_node = this.arena.create_node(7, block_start, 0, block_line, block_column);
      let declarations_only = this.atrule_has_declarations(at_rule_name);
      let first_child = this.parse_block_children(at_rule, declarations_only);
      if (this.peek_type() === 24) {
        let block_end = this.lexer.token_start;
        last_end = this.lexer.token_end;
        this.next_token();
        this.arena.set_length(block_node, block_end - block_start);
      } else this.arena.set_length(block_node, last_end - block_start);
      if (first_child !== 0) this.arena.set_first_child(block_node, first_child);
      this.arena.set_length(at_rule, last_end - at_rule_start);
      if (prelude_wrapper === null) this.arena.set_first_child(at_rule, block_node);
      else {
        this.arena.set_first_child(at_rule, prelude_wrapper);
        this.arena.set_next_sibling(prelude_wrapper, block_node);
      }
    } else {
      if (this.peek_type() === 17) {
        last_end = this.lexer.token_end;
        this.next_token();
      }
      this.arena.set_length(at_rule, last_end - at_rule_start);
      if (prelude_wrapper !== null) this.arena.set_first_child(at_rule, prelude_wrapper);
    }
    return at_rule;
  }
  atrule_has_declarations(name) {
    return DECLARATION_AT_RULES.has(name.toLowerCase());
  }
};
function parse(source, options) {
  return new Parser(source, options).parse();
}

// node_modules/@projectwallace/css-parser/dist/walk.js
var SKIP = Symbol("SKIP");
var BREAK = Symbol("BREAK");
function walk(node, callback, depth2 = 0) {
  const impl = node;
  return _walk(impl.__get_arena(), impl.__get_source(), impl.__get_index(), callback, depth2);
}
function _walk(arena, source, index, callback, depth2) {
  const result = callback(new CSSNode(arena, source, index), depth2);
  if (result === BREAK) return false;
  if (result === SKIP) return true;
  const type = arena.get_type(index);
  const child_depth = type === 2 || type === 3 ? depth2 + 1 : depth2;
  let child = arena.get_first_child(index);
  while (child !== 0) {
    if (!_walk(arena, source, child, callback, child_depth)) return false;
    child = arena.get_next_sibling(child);
  }
  return true;
}

// node_modules/@projectwallace/css-parser/dist/index.js
function is_rule(node) {
  return node.type === 2;
}
function is_atrule(node) {
  return node.type === 3;
}
function is_declaration(node) {
  return node.type === 4;
}
function is_selector(node) {
  return node.type === 5;
}
function is_selector_list(node) {
  return node.type === 20;
}
function is_raw(node) {
  return node.type === 8;
}
function is_identifier(node) {
  return node.type === 10;
}
function is_number(node) {
  return node.type === 11;
}
function is_dimension(node) {
  return node.type === 12;
}
function is_string(node) {
  return node.type === 13;
}
function is_hash(node) {
  return node.type === 14;
}
function is_function(node) {
  return node.type === 15;
}
function is_operator(node) {
  return node.type === 16;
}
function is_url(node) {
  return node.type === 18;
}
function is_type_selector(node) {
  return node.type === 21;
}
function is_attribute_selector(node) {
  return node.type === 24;
}
function is_pseudo_class_selector(node) {
  return node.type === 25;
}
function is_pseudo_element_selector(node) {
  return node.type === 26;
}
function is_combinator2(node) {
  return node.type === 27;
}
function is_nth_selector(node) {
  return node.type === 30;
}
function is_nth_of_selector(node) {
  return node.type === 31;
}
function is_atrule_prelude(node) {
  return node.type === 40;
}
function is_media_feature(node) {
  return node.type === 33;
}
function is_media_type(node) {
  return node.type === 34;
}
function is_container_query(node) {
  return node.type === 35;
}
function is_supports_query(node) {
  return node.type === 36;
}
function is_supports_declaration(node) {
  return node.type === 57;
}
function is_layer_name(node) {
  return node.type === 37;
}

// node_modules/@projectwallace/css-analyzer/dist/atrules-BGhbEuC_.js
function isSupportsBrowserhack(prelude, on_hack) {
  walk(prelude, function(node) {
    if (is_supports_query(node)) {
      const normalizedPrelude = node.value.toString().toLowerCase().replaceAll(/\s+/g, "");
      if (normalizedPrelude.includes("-webkit-appearance:none")) {
        on_hack("-webkit-appearance: none");
        return BREAK;
      }
      if (normalizedPrelude.includes("-moz-appearance:meterbar")) {
        on_hack("-moz-appearance: meterbar");
        return BREAK;
      }
    }
  });
}
function isMediaBrowserhack(prelude, on_hack) {
  walk(prelude, function(node) {
    if (is_media_type(node)) {
      const text = node.value;
      if (text.startsWith("\\0")) {
        on_hack("\\0");
        return BREAK;
      }
      if (text.includes("\\9")) {
        on_hack("\\9");
        return BREAK;
      }
    }
    if (is_media_feature(node)) {
      const name = node.property;
      if (str_equals("-moz-images-in-menus", name)) {
        on_hack("-moz-images-in-menus");
        return BREAK;
      }
      if (str_equals("min--moz-device-pixel-ratio", name)) {
        on_hack("min--moz-device-pixel-ratio");
        return BREAK;
      }
      if (str_equals("-ms-high-contrast", name)) {
        on_hack("-ms-high-contrast");
        return BREAK;
      }
      if (str_equals("min-resolution", name) && node.value !== null && is_dimension(node.value)) {
        const dimension = node.value;
        if (dimension.value === 1e-3 && str_equals("dpcm", dimension.unit || "")) {
          on_hack("min-resolution: .001dpcm");
          return BREAK;
        }
      }
      if (str_equals("-webkit-min-device-pixel-ratio", name) && node.value !== null && is_number(node.value)) {
        const num4 = node.value.value;
        if (num4 === 0 || num4 === 1e4) {
          on_hack("-webkit-min-device-pixel-ratio");
          return BREAK;
        }
      }
    }
    if (is_identifier(node) && node.text === "\\0") {
      on_hack("\\0");
      return BREAK;
    }
  });
}

// node_modules/@projectwallace/css-analyzer/dist/keyword-set-DmR2M4uh.js
var KeywordSet = class {
  set;
  constructor(items) {
    this.set = new Set(items);
  }
  has(item) {
    return this.set.has(item.toLowerCase());
  }
};

// node_modules/@projectwallace/css-analyzer/dist/string-utils-CsY6OsHO.js
function unquote(str) {
  return str.replaceAll(/(?:^['"])|(?:['"]$)/g, "");
}
function compareChar(referenceCode, testCode) {
  if (testCode >= 65 && testCode <= 90) testCode = testCode | 32;
  return referenceCode === testCode;
}
function endsWith(base, maybe) {
  if (base === maybe) return true;
  let len = maybe.length;
  let offset = len - base.length;
  if (offset < 0) return false;
  for (let i = len - 1; i >= offset; i--) if (compareChar(base.charCodeAt(i - offset), maybe.charCodeAt(i)) === false) return false;
  return true;
}

// node_modules/@projectwallace/css-analyzer/dist/specificity-DwcbHPCf.js
var PSEUDO_FUNCTIONS = new KeywordSet([
  "nth-child",
  "where",
  "not",
  "is",
  "has",
  "nth-last-child",
  "matches",
  "-webkit-any",
  "-moz-any"
]);
function isPrefixed(selector, on_selector) {
  walk(selector, function(node) {
    if (is_pseudo_element_selector(node) || is_pseudo_class_selector(node) || is_type_selector(node)) {
      if (node.is_vendor_prefixed) {
        let prefix = "";
        if (is_pseudo_class_selector(node)) prefix = ":";
        else if (is_pseudo_element_selector(node)) prefix = "::";
        on_selector(prefix + node.name);
      }
    }
  });
}
function isAccessibility(selector, on_selector) {
  function normalize2(node) {
    let clone = node.clone();
    if (clone.value) return "[" + clone.name?.toLowerCase() + clone.attr_operator + '"' + unquote(clone.value.toString()) + '"]';
    return "[" + clone.name?.toLowerCase() + "]";
  }
  walk(selector, function(node) {
    if (is_attribute_selector(node)) {
      const name = node.name || "";
      if (str_equals("role", name) || str_starts_with(name, "aria-")) on_selector(normalize2(node));
    }
  });
}
function getComplexity(selector) {
  let complexity = 0;
  function findSelectors(tree, complexities) {
    walk(tree, function(node) {
      if (is_selector(node)) complexities.push(getComplexity(node));
    });
  }
  walk(selector, function(node) {
    node.type;
    if (is_selector(node)) return;
    if (is_nth_selector(node)) {
      if (node.text.trim()) complexity++;
      return;
    }
    complexity++;
    if (is_pseudo_class_selector(node) || is_type_selector(node) || is_pseudo_element_selector(node)) {
      if (node.is_vendor_prefixed) complexity++;
    }
    if (is_attribute_selector(node)) {
      if (node.value) complexity++;
      return SKIP;
    }
    if (is_pseudo_class_selector(node)) {
      const name = node.name;
      if (PSEUDO_FUNCTIONS.has(name.toLowerCase())) {
        const childComplexities = [];
        if (node.has_children) for (const child of node) if (is_selector(child)) childComplexities.push(getComplexity(child));
        else findSelectors(child, childComplexities);
        if (childComplexities.length > 0) {
          for (const c2 of childComplexities) complexity += c2;
          return SKIP;
        }
      }
    }
  });
  return complexity;
}
function getCombinators(selector, onMatch) {
  walk(selector, function(node) {
    if (is_combinator2(node)) onMatch({
      name: node.name.trim() === "" ? " " : node.name,
      loc: {
        offset: node.start,
        line: node.line,
        column: node.column,
        length: 1
      }
    });
  });
}
function compare(s1, s2) {
  if (s1[0] === s2[0]) {
    if (s1[1] === s2[1]) return s1[2] - s2[2];
    return s1[1] - s2[1];
  }
  return s1[0] - s2[0];
}
function max(list) {
  return list.sort(compare).at(-1);
}
var calculateForAST = (selectorAST) => {
  let a = 0;
  let b = 0;
  let c2 = 0;
  let current = selectorAST.first_child;
  while (current) {
    switch (current.type) {
      case ID_SELECTOR:
        a += 1;
        break;
      case ATTRIBUTE_SELECTOR:
      case CLASS_SELECTOR:
        b += 1;
        break;
      case PSEUDO_CLASS_SELECTOR:
        switch (current.name.toLowerCase()) {
          case "where":
            break;
          case "-webkit-any":
          case "any":
            if (current.first_child) b += 1;
            break;
          case "-moz-any":
          case "is":
          case "matches":
          case "not":
          case "has":
            if (current.has_children) {
              const childSelectorList = current.first_child;
              if (childSelectorList && is_selector_list(childSelectorList)) {
                const max1 = max(calculate(childSelectorList));
                a += max1[0];
                b += max1[1];
                c2 += max1[2];
              }
            }
            break;
          case "nth-child":
          case "nth-last-child": {
            b += 1;
            const nthOf = current.first_child;
            if (nthOf && is_nth_of_selector(nthOf) && nthOf.selector) {
              const max2 = max(calculate(nthOf.selector));
              a += max2[0];
              b += max2[1];
              c2 += max2[2];
            }
            break;
          }
          case "host-context":
          case "host": {
            b += 1;
            const childSelector = current.first_child?.first_child;
            if (childSelector && is_selector(childSelector)) {
              let childPart = childSelector.first_child;
              while (childPart) {
                if (is_combinator2(childPart)) break;
                const partSpecificity = calculateForAST({
                  type_name: "Selector",
                  first_child: childPart,
                  has_children: true
                });
                a += partSpecificity[0] ?? 0;
                b += partSpecificity[1] ?? 0;
                c2 += partSpecificity[2] ?? 0;
                childPart = childPart.next_sibling;
              }
            }
            break;
          }
          case "after":
          case "before":
          case "first-letter":
          case "first-line":
            c2 += 1;
            break;
          default:
            b += 1;
            break;
        }
        break;
      case PSEUDO_ELEMENT_SELECTOR:
        switch (current.name.toLowerCase()) {
          case "slotted": {
            c2 += 1;
            const childSelector = current.first_child?.first_child;
            if (childSelector && is_selector(childSelector)) {
              let childPart = childSelector.first_child;
              while (childPart) {
                if (is_combinator2(childPart)) break;
                const partSpecificity = calculateForAST({
                  type_name: "Selector",
                  first_child: childPart,
                  has_children: true
                });
                a += partSpecificity[0] ?? 0;
                b += partSpecificity[1] ?? 0;
                c2 += partSpecificity[2] ?? 0;
                childPart = childPart.next_sibling;
              }
            }
            break;
          }
          case "view-transition-group":
          case "view-transition-image-pair":
          case "view-transition-old":
          case "view-transition-new":
            if (current.first_child?.text === "*") break;
            c2 += 1;
            break;
          default:
            c2 += 1;
            break;
        }
        break;
      case TYPE_SELECTOR: {
        let typeSelector = current.name ?? "";
        if (typeSelector.includes("|")) typeSelector = typeSelector.split("|")[1] ?? "";
        if (typeSelector !== "*") c2 += 1;
        break;
      }
      default:
        break;
    }
    current = current.next_sibling;
  }
  return [
    a,
    b,
    c2
  ];
};
var convertToAST = (source) => {
  if (typeof source === "string") try {
    return parse_selector_list(source);
  } catch (e4) {
    const message = e4 instanceof Error ? e4.message : String(e4);
    throw new TypeError(`Could not convert passed in source '${source}' to SelectorList: ${message}`);
  }
  if (source instanceof Object) {
    if (is_selector_list(source)) return source;
    throw new TypeError(`Passed in source is an Object but no AST / AST of the type SelectorList`);
  }
  throw new TypeError(`Passed in source is not a String nor an Object. I don't know what to do with it.`);
};
var calculate = (selector) => {
  if (!selector) return [];
  const selector_list = convertToAST(selector);
  const specificities = [];
  for (const selector_node of selector_list) specificities.push(calculateForAST(selector_node));
  return specificities;
};

// node_modules/@projectwallace/css-analyzer/dist/browserhacks-DcFslSJt.js
var namedColors = new KeywordSet([
  "white",
  "black",
  "red",
  "gray",
  "silver",
  "grey",
  "green",
  "orange",
  "blue",
  "dimgray",
  "whitesmoke",
  "lightgray",
  "lightgrey",
  "yellow",
  "gold",
  "pink",
  "gainsboro",
  "magenta",
  "purple",
  "darkgray",
  "navy",
  "darkred",
  "teal",
  "maroon",
  "darkgrey",
  "tomato",
  "darkorange",
  "brown",
  "crimson",
  "lightyellow",
  "slategray",
  "salmon",
  "lightgreen",
  "lightblue",
  "orangered",
  "aliceblue",
  "dodgerblue",
  "lime",
  "darkblue",
  "darkgoldenrod",
  "skyblue",
  "royalblue",
  "darkgreen",
  "ivory",
  "olive",
  "aqua",
  "turquoise",
  "cyan",
  "khaki",
  "beige",
  "snow",
  "ghostwhite",
  "limegreen",
  "coral",
  "dimgrey",
  "hotpink",
  "midnightblue",
  "firebrick",
  "indigo",
  "wheat",
  "mediumblue",
  "lightpink",
  "plum",
  "azure",
  "violet",
  "lavender",
  "deepskyblue",
  "darkslategrey",
  "goldenrod",
  "cornflowerblue",
  "lightskyblue",
  "indianred",
  "yellowgreen",
  "saddlebrown",
  "palegreen",
  "bisque",
  "tan",
  "antiquewhite",
  "steelblue",
  "forestgreen",
  "fuchsia",
  "mediumaquamarine",
  "seagreen",
  "sienna",
  "deeppink",
  "mediumseagreen",
  "peru",
  "greenyellow",
  "lightgoldenrodyellow",
  "orchid",
  "cadetblue",
  "navajowhite",
  "lightsteelblue",
  "slategrey",
  "linen",
  "lightseagreen",
  "darkcyan",
  "lightcoral",
  "aquamarine",
  "blueviolet",
  "cornsilk",
  "lightsalmon",
  "chocolate",
  "lightslategray",
  "floralwhite",
  "darkturquoise",
  "darkslategray",
  "rebeccapurple",
  "burlywood",
  "chartreuse",
  "lightcyan",
  "lemonchiffon",
  "palevioletred",
  "darkslateblue",
  "mediumpurple",
  "lawngreen",
  "slateblue",
  "darkseagreen",
  "blanchedalmond",
  "mistyrose",
  "darkolivegreen",
  "seashell",
  "olivedrab",
  "peachpuff",
  "darkviolet",
  "powderblue",
  "darkmagenta",
  "lightslategrey",
  "honeydew",
  "palegoldenrod",
  "darkkhaki",
  "oldlace",
  "mintcream",
  "sandybrown",
  "mediumturquoise",
  "papayawhip",
  "paleturquoise",
  "mediumvioletred",
  "thistle",
  "springgreen",
  "moccasin",
  "rosybrown",
  "lavenderblush",
  "mediumslateblue",
  "darkorchid",
  "mediumorchid",
  "darksalmon",
  "mediumspringgreen"
]);
var systemColors = new KeywordSet([
  "accentcolor",
  "accentcolortext",
  "activetext",
  "buttonborder",
  "buttonface",
  "buttontext",
  "canvas",
  "canvastext",
  "field",
  "fieldtext",
  "graytext",
  "highlight",
  "highlighttext",
  "linktext",
  "mark",
  "marktext",
  "selecteditem",
  "selecteditemtext",
  "visitedtext"
]);
var colorFunctions = new KeywordSet([
  "rgba",
  "rgb",
  "hsla",
  "hsl",
  "oklch",
  "color",
  "hwb",
  "lch",
  "lab",
  "oklab"
]);
var colorKeywords = new KeywordSet(["transparent", "currentcolor"]);
var keywords = new KeywordSet([
  "auto",
  "none",
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer"
]);
function isValueReset(value) {
  for (let node of value) {
    if (is_number(node) && node.value === 0) continue;
    if (is_dimension(node) && node.value === 0) continue;
    return false;
  }
  return true;
}
var SYSTEM_FONTS = new KeywordSet([
  "caption",
  "icon",
  "menu",
  "message-box",
  "small-caption",
  "status-bar"
]);
var SIZE_KEYWORDS = new KeywordSet([
  "xx-small",
  "x-small",
  "small",
  "medium",
  "large",
  "x-large",
  "xx-large",
  "xxx-large",
  "smaller",
  "larger"
]);
var PRE_SIZE_KEYWORDS = new KeywordSet([
  "italic",
  "oblique",
  "small-caps",
  "bold",
  "bolder",
  "lighter",
  "ultra-condensed",
  "extra-condensed",
  "condensed",
  "semi-condensed",
  "semi-expanded",
  "expanded",
  "extra-expanded",
  "ultra-expanded",
  "normal"
]);
var SLASH = 47;
function destructure(value, cb) {
  if (!value.has_children) return null;
  if (value.child_count === 1 && is_function(value.first_child)) return null;
  for (const child of value) if (is_identifier(child) && keywords.has(child.name)) cb(child.name);
  let children = value.children;
  let font_size;
  let line_height;
  let font_family_start = -1;
  let slash_index = -1;
  for (let i = 0; i < value.child_count; i++) {
    const child = children[i];
    if (child && is_operator(child) && child.text.charCodeAt(0) === SLASH) {
      slash_index = i;
      break;
    }
  }
  if (slash_index === -1) for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child) continue;
    if (is_dimension(child)) {
      font_size = child.text;
      font_family_start = i + 1;
      break;
    }
    if (is_function(child)) {
      font_size = child.text;
      font_family_start = i + 1;
      break;
    }
    if (is_identifier(child)) {
      const name = child.name;
      if (SIZE_KEYWORDS.has(name)) {
        font_size = child.text;
        font_family_start = i + 1;
        break;
      }
      if (PRE_SIZE_KEYWORDS.has(name) || keywords.has(name)) continue;
      font_family_start = i;
      break;
    }
    if (is_string(child)) {
      font_family_start = i;
      break;
    }
  }
  else {
    if (slash_index > 0) font_size = children[slash_index - 1].text;
    const after_slash = slash_index + 1;
    if (after_slash < children.length) {
      line_height = children[after_slash].text;
      font_family_start = after_slash + 1;
    }
  }
  let font_family = null;
  if (font_family_start >= 0 && font_family_start < children.length) {
    const first = children[font_family_start];
    const last = children.at(-1);
    if (first && last) font_family = value.text.substring(first.start - value.start, last.end - value.start);
  }
  return {
    font_size,
    line_height,
    font_family
  };
}
var TIMING_KEYWORDS = new KeywordSet([
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "step-start",
  "step-end"
]);
var TIMING_FUNCTION_VALUES = new KeywordSet(["cubic-bezier", "steps"]);
var ANIMATION_NON_NAME_KEYWORDS = new KeywordSet([
  "normal",
  "reverse",
  "alternate",
  "alternate-reverse",
  "forwards",
  "backwards",
  "both",
  "running",
  "paused",
  "infinite"
]);
function analyzeAnimation(value, cb) {
  let durationFound = false;
  for (let node of value) if (is_operator(node)) durationFound = false;
  else if (is_dimension(node) && durationFound === false) {
    durationFound = true;
    cb({
      type: "duration",
      value: node
    });
  } else if (is_identifier(node)) {
    if (TIMING_KEYWORDS.has(node.name)) cb({
      type: "fn",
      value: node
    });
    else if (keywords.has(node.name)) cb({
      type: "keyword",
      value: node
    });
    else if (!ANIMATION_NON_NAME_KEYWORDS.has(node.name)) cb({
      type: "name",
      value: node
    });
  } else if (is_function(node) && TIMING_FUNCTION_VALUES.has(node.name)) cb({
    type: "fn",
    value: node
  });
}
function isValuePrefixed(value, on_value) {
  walk(value, function(node) {
    if (node.is_vendor_prefixed) if (is_identifier(node) || is_function(node)) on_value(node.name);
    else on_value(node.text);
  });
}
function isValueBrowserhack(node, on_hack) {
  let text = node.text;
  if (/progid:/i.test(node.text)) on_hack("progid:");
  if (text.endsWith("\\9")) on_hack("\\9");
  if (text.endsWith("\\7")) on_hack("\\7");
  walk(node, function(child) {
    if (is_function(child)) {
      const name = child.name.toLowerCase();
      if (name === "alpha") on_hack("alpha()");
      else if (name === "expression") on_hack("expression()");
    }
    if (is_url(child) && endsWith(".htc", unquote(child.value ?? ""))) on_hack(".htc");
  });
}

// node_modules/@projectwallace/css-analyzer/dist/property-utils-B-Tgge5V.js
var shorthand_properties = /* @__PURE__ */ new Set([
  "all",
  "animation",
  "background",
  "border",
  "border-block-end",
  "border-block-start",
  "border-bottom",
  "border-color",
  "border-image",
  "border-inline-end",
  "border-inline-start",
  "border-left",
  "border-radius",
  "border-right",
  "border-style",
  "border-top",
  "border-width",
  "column-rule",
  "columns",
  "contain-intrinsic-size",
  "flex",
  "flex-flow",
  "font",
  "gap",
  "grid",
  "grid-area",
  "grid-column",
  "grid-row",
  "grid-template",
  "inset",
  "list-style",
  "margin",
  "mask",
  "offset",
  "outline",
  "overflow",
  "padding",
  "place-content",
  "place-items",
  "place-self",
  "scroll-margin",
  "scroll-padding",
  "scroll-timeline",
  "text-decoration",
  "text-emphasis",
  "transition",
  "vertical-align"
]);
var SPACING_RESET_PROPERTIES = /* @__PURE__ */ new Set([
  "margin",
  "margin-block",
  "margin-inline",
  "margin-top",
  "margin-block-start",
  "margin-block-end",
  "margin-inline-end",
  "margin-inline-end",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding",
  "padding-block",
  "padding-inline",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "padding-block-start",
  "padding-block-end",
  "padding-inline-start",
  "padding-inline-end"
]);
var border_radius_properties = new KeywordSet([
  "border-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "border-start-start-radius",
  "border-start-end-radius",
  "border-end-end-radius",
  "border-end-start-radius"
]);
function isHack(property) {
  if (is_custom(property) || is_vendor_prefixed(property)) return false;
  let code = property.charCodeAt(0);
  return code === 47 || code === 42 || code === 95 || code === 43 || code === 38 || code === 36 || code === 35;
}
function basename(property) {
  if (is_custom(property)) return property;
  if (is_vendor_prefixed(property)) return property.slice(property.indexOf("-", 2) + 1).toLowerCase();
  if (isHack(property)) return property.slice(1).toLowerCase();
  return property.toLowerCase();
}

// node_modules/@projectwallace/css-analyzer/dist/index.js
var Collection = class {
  #items;
  #total;
  #nodes = [];
  #useLocations;
  constructor(useLocations = false) {
    this.#items = /* @__PURE__ */ new Map();
    this.#total = 0;
    if (useLocations) this.#nodes = [];
    this.#useLocations = useLocations;
  }
  p(item, node_location) {
    let index = this.#total;
    if (this.#useLocations) {
      let position = index * 4;
      this.#nodes[position] = node_location.line;
      this.#nodes[position + 1] = node_location.column;
      this.#nodes[position + 2] = node_location.offset;
      this.#nodes[position + 3] = node_location.length;
    }
    if (this.#items.has(item)) {
      this.#items.get(item).push(index);
      this.#total++;
      return;
    }
    this.#items.set(item, [index]);
    this.#total++;
  }
  size() {
    return this.#total;
  }
  c() {
    let uniqueWithLocations = /* @__PURE__ */ new Map();
    let unique = {};
    let useLocations = this.#useLocations;
    let items = this.#items;
    let _nodes = this.#nodes;
    let size = items.size;
    items.forEach((list, key) => {
      if (useLocations) {
        let nodes = list.map(function(index) {
          let position = index * 4;
          return {
            line: _nodes[position],
            column: _nodes[position + 1],
            offset: _nodes[position + 2],
            length: _nodes[position + 3]
          };
        });
        uniqueWithLocations.set(key, nodes);
      } else unique[key] = list.length;
    });
    let total = this.#total;
    if (useLocations) return {
      total,
      totalUnique: size,
      unique,
      uniquenessRatio: total === 0 ? 0 : size / total,
      uniqueWithLocations: Object.fromEntries(uniqueWithLocations)
    };
    return {
      total,
      totalUnique: size,
      unique,
      uniquenessRatio: total === 0 ? 0 : size / total,
      uniqueWithLocations: void 0
    };
  }
};
var ContextCollection = class {
  #list;
  #contexts;
  #useLocations;
  constructor(useLocations) {
    this.#list = new Collection(useLocations);
    this.#contexts = /* @__PURE__ */ new Map();
    this.#useLocations = useLocations;
  }
  /**
  * Add an item to this #list's context
  * @param item Item to push
  * @param context Context to push Item to
  * @param node_location
  */
  push(item, context, node_location) {
    this.#list.p(item, node_location);
    if (!this.#contexts.has(context)) this.#contexts.set(context, new Collection(this.#useLocations));
    this.#contexts.get(context).p(item, node_location);
  }
  count() {
    let itemsPerContext = /* @__PURE__ */ new Map();
    for (let [context, value] of this.#contexts.entries()) itemsPerContext.set(context, value.c());
    return Object.assign(this.#list.c(), { itemsPerContext: Object.fromEntries(itemsPerContext) });
  }
};
function Mode(arr) {
  let frequencies = /* @__PURE__ */ new Map();
  let maxOccurrences = -1;
  let maxOccurenceCount = 0;
  let sum = 0;
  let len = arr.length;
  for (let i = 0; i < len; i++) {
    let element = arr[i];
    let updatedCount = (frequencies.get(element) || 0) + 1;
    frequencies.set(element, updatedCount);
    if (updatedCount > maxOccurrences) {
      maxOccurrences = updatedCount;
      maxOccurenceCount = 0;
      sum = 0;
    }
    if (updatedCount >= maxOccurrences) {
      maxOccurenceCount++;
      sum += element;
    }
  }
  return sum / maxOccurenceCount;
}
var AggregateCollection = class {
  #items;
  #sum;
  constructor() {
    this.#items = [];
    this.#sum = 0;
  }
  /**
  * Add a new Integer at the end of this AggregateCollection
  * @param item - The item to add
  */
  push(item) {
    this.#items.push(item);
    this.#sum += item;
  }
  size() {
    return this.#items.length;
  }
  aggregate() {
    let len = this.#items.length;
    if (len === 0) return {
      min: 0,
      max: 0,
      mean: 0,
      mode: 0,
      range: 0,
      sum: 0
    };
    let sorted = this.#items.slice().sort((a, b) => a - b);
    let min = sorted[0];
    let max2 = sorted[len - 1];
    let mode = Mode(sorted);
    let sum = this.#sum;
    return {
      min,
      max: max2,
      mean: sum / len,
      mode,
      range: max2 - min,
      sum
    };
  }
  toArray() {
    return this.#items;
  }
};
var DefinedUsed = class {
  #defined = /* @__PURE__ */ new Set();
  #used = /* @__PURE__ */ new Set();
  #unused = /* @__PURE__ */ new Set();
  #unknown = /* @__PURE__ */ new Set();
  define(name) {
    if (this.#defined.has(name)) return;
    this.#defined.add(name);
    if (this.#used.has(name)) this.#unknown.delete(name);
    else this.#unused.add(name);
  }
  use(name) {
    if (this.#used.has(name)) return;
    this.#used.add(name);
    if (this.#defined.has(name)) this.#unused.delete(name);
    else this.#unknown.add(name);
  }
  analyze() {
    return {
      defined: [...this.#defined],
      used: [...this.#used],
      unused: [...this.#unused],
      unknown: [...this.#unknown]
    };
  }
};
function getEmbedType(embed) {
  let start = 5;
  let semicolon = embed.indexOf(";");
  let comma = embed.indexOf(",");
  if (semicolon === -1) return embed.substring(start, comma);
  if (comma !== -1 && comma < semicolon) return embed.substring(start, comma);
  return embed.substring(start, semicolon);
}
function ratio(part, total) {
  if (total === 0) return 0;
  return part / total;
}
function analyze(css, options = {}) {
  if (options.useLocations === true) return analyzeInternal(css, options, true);
  return analyzeInternal(css, options, false);
}
function analyzeInternal(css, options, useLocations) {
  let start = Date.now();
  let linesOfCode = (css.match(/\n/g) || []).length + 1;
  let totalComments = 0;
  let commentsSize = 0;
  let embedSize = 0;
  let embedTypes = {
    total: 0,
    unique: /* @__PURE__ */ new Map()
  };
  let startParse = Date.now();
  let ast = parse(css, { on_comment({ length }) {
    totalComments++;
    commentsSize += length;
  } });
  let startAnalysis = Date.now();
  let atrules = new Collection(useLocations);
  let atRuleComplexities = new AggregateCollection();
  let fontfaces = [];
  let fontfaces_with_loc = new Collection(useLocations);
  let layers = new Collection(useLocations);
  let imports = new Collection(useLocations);
  let medias = new Collection(useLocations);
  let mediaBrowserhacks = new Collection(useLocations);
  let mediaFeatures = new Collection(useLocations);
  let charsets = new Collection(useLocations);
  let supports = new Collection(useLocations);
  let supportsBrowserhacks = new Collection(useLocations);
  let keyframes = new Collection(useLocations);
  let prefixedKeyframes = new Collection(useLocations);
  let containers = new Collection(useLocations);
  let containerNames = new Collection(useLocations);
  let registeredProperties = new Collection(useLocations);
  let functions = new Collection(useLocations);
  let scopes = new Collection(useLocations);
  let atruleNesting = new AggregateCollection();
  let uniqueAtruleNesting = new Collection(useLocations);
  let totalRules = 0;
  let emptyRules = 0;
  let ruleSizes = new AggregateCollection();
  let selectorsPerRule = new AggregateCollection();
  let declarationsPerRule = new AggregateCollection();
  let uniqueRuleSize = new Collection(useLocations);
  let uniqueSelectorsPerRule = new Collection(useLocations);
  let uniqueDeclarationsPerRule = new Collection(useLocations);
  let ruleNesting = new AggregateCollection();
  let uniqueRuleNesting = new Collection(useLocations);
  let keyframeSelectors = new Collection(useLocations);
  let uniqueSelectors = /* @__PURE__ */ new Set();
  let prefixedSelectors = new Collection(useLocations);
  let maxSpecificity;
  let minSpecificity;
  let specificityA = new AggregateCollection();
  let specificityB = new AggregateCollection();
  let specificityC = new AggregateCollection();
  let uniqueSpecificities = new Collection(useLocations);
  let selectorComplexities = new AggregateCollection();
  let uniqueSelectorComplexities = new Collection(useLocations);
  let specificities = [];
  let ids = new Collection(useLocations);
  let a11y = new Collection(useLocations);
  let pseudoClasses = new Collection(useLocations);
  let pseudoElements = new Collection(useLocations);
  let attributeSelectors = new Collection(useLocations);
  let customElementSelectors = new Collection(useLocations);
  let combinators = new Collection(useLocations);
  let selectorNesting = new AggregateCollection();
  let uniqueSelectorNesting = new Collection(useLocations);
  let uniqueDeclarations = /* @__PURE__ */ new Set();
  let totalDeclarations = 0;
  let declarationComplexities = new AggregateCollection();
  let importantDeclarations = 0;
  let importantsInKeyframes = 0;
  let importantCustomProperties = new Collection(useLocations);
  let declarationNesting = new AggregateCollection();
  let uniqueDeclarationNesting = new Collection(useLocations);
  let properties = new Collection(useLocations);
  let propertyHacks = new Collection(useLocations);
  let propertyVendorPrefixes = new Collection(useLocations);
  let customProperties = new Collection(useLocations);
  let shorthands = new Collection(useLocations);
  let propertyComplexities = new AggregateCollection();
  let valueComplexities = new AggregateCollection();
  let vendorPrefixedValues = new Collection(useLocations);
  let valueBrowserhacks = new Collection(useLocations);
  let displays = new Collection(useLocations);
  let zindex = new Collection(useLocations);
  let textShadows = new Collection(useLocations);
  let boxShadows = new Collection(useLocations);
  let fontFamilies = new Collection(useLocations);
  let fontSizes = new Collection(useLocations);
  let lineHeights = new Collection(useLocations);
  let timingFunctions = new Collection(useLocations);
  let durations = new Collection(useLocations);
  let animationNames = new Collection(useLocations);
  let colors = new ContextCollection(useLocations);
  let colorFormats = new Collection(useLocations);
  let units = new ContextCollection(useLocations);
  let gradients = new Collection(useLocations);
  let valueKeywords = new Collection(useLocations);
  let borderRadiuses = new ContextCollection(useLocations);
  let resets = new Collection(useLocations);
  let customPropsTracking = new DefinedUsed();
  let animationNamesTracking = new DefinedUsed();
  let containerNamesTracking = new DefinedUsed();
  let layerNamesTracking = new DefinedUsed();
  let anchorNamesTracking = new DefinedUsed();
  function toLoc(node) {
    return {
      line: node.line,
      column: node.column,
      offset: node.start,
      length: node.length
    };
  }
  let keyframesDepth = -1;
  walk(ast, (node, depth2) => {
    if (keyframesDepth >= 0 && depth2 <= keyframesDepth) keyframesDepth = -1;
    let inKeyframes = keyframesDepth >= 0 && depth2 > keyframesDepth;
    if (is_atrule(node)) {
      let atruleLoc = toLoc(node);
      atruleNesting.push(depth2);
      uniqueAtruleNesting.p(depth2, atruleLoc);
      let normalized_name = basename(node.name ?? "");
      atrules.p(normalized_name, atruleLoc);
      if (normalized_name === "font-face") {
        let descriptors = /* @__PURE__ */ Object.create(null);
        if (useLocations) fontfaces_with_loc.p(node.start, toLoc(node));
        let block = node.block;
        for (let descriptor of block?.children || []) if (is_declaration(descriptor) && descriptor.value) descriptors[descriptor.property] = descriptor.value.text;
        atRuleComplexities.push(1);
        fontfaces.push(descriptors);
      }
      if (!node.has_prelude) {
        if (normalized_name === "layer") {
          layers.p("<anonymous>", toLoc(node));
          atRuleComplexities.push(2);
        }
      } else {
        let complexity = 1;
        if (normalized_name === "media") {
          medias.p(node.prelude.text, toLoc(node));
          isMediaBrowserhack(node.prelude, (hack) => {
            mediaBrowserhacks.p(hack, toLoc(node));
            complexity++;
          });
        } else if (normalized_name === "supports") {
          supports.p(node.prelude.text, toLoc(node));
          isSupportsBrowserhack(node.prelude, (hack) => {
            supportsBrowserhacks.p(hack, toLoc(node));
            complexity++;
          });
        } else if (normalized_name.endsWith("keyframes")) {
          let prelude = node.prelude.text;
          keyframes.p(prelude, toLoc(node));
          animationNamesTracking.define(prelude);
          if (node.is_vendor_prefixed) {
            prefixedKeyframes.p(`@${node.name?.toLowerCase()} ${node.prelude.text}`, toLoc(node));
            complexity++;
          }
          keyframesDepth = depth2;
        } else if (normalized_name === "layer") for (let layer of node.prelude.text.split(",").map((s) => s.trim())) {
          layers.p(layer, toLoc(node));
          if (node.block) layerNamesTracking.use(layer);
          else layerNamesTracking.define(layer);
        }
        else if (normalized_name === "import") {
          imports.p(node.prelude.text, toLoc(node));
          if (is_atrule_prelude(node.prelude) && node.prelude.has_children) {
            for (let child of node.prelude) if (is_supports_query(child)) supports.p(child.value, toLoc(child));
            else if (is_layer_name(child) && child.value) {
              layers.p(child.value, toLoc(child));
              layerNamesTracking.use(child.value);
            }
          }
        } else if (normalized_name === "container") {
          let { prelude } = node;
          containers.p(prelude.text, toLoc(node));
          if (is_atrule_prelude(prelude) && is_container_query(prelude.first_child)) {
            let container_name = prelude.first_child.first_child;
            if (container_name && is_identifier(container_name)) {
              containerNames.p(container_name.text, toLoc(node));
              containerNamesTracking.use(container_name.text);
            }
          }
        } else if (normalized_name === "property") {
          registeredProperties.p(node.prelude.text, toLoc(node));
          customPropsTracking.define(node.prelude.text);
        } else if (normalized_name === "function") {
          let prelude = node.prelude.text;
          let name = prelude.includes("(") ? prelude.slice(0, prelude.indexOf("(")).trim() : prelude.trim();
          functions.p(name, toLoc(node));
        } else if (normalized_name === "charset") charsets.p(node.prelude.text.toLowerCase(), toLoc(node));
        else if (normalized_name === "scope") scopes.p(node.prelude.text, toLoc(node));
        atRuleComplexities.push(complexity);
      }
    } else if (is_rule(node)) if (inKeyframes && node.has_prelude) {
      if (is_selector_list(node.prelude) && node.prelude.child_count > 0) for (let keyframe_selector of node.prelude) keyframeSelectors.p(keyframe_selector.text, toLoc(keyframe_selector));
    } else {
      totalRules++;
      if (node.block?.is_empty) emptyRules++;
      let numSelectors = 0;
      let numDeclarations = 0;
      let loc = toLoc(node);
      if (node.has_prelude && is_selector_list(node.prelude)) {
        for (const selector of node.prelude) if (is_selector(selector)) numSelectors++;
      }
      if (node.block) {
        for (const declaration of node.block) if (is_declaration(declaration)) numDeclarations++;
      }
      ruleSizes.push(numSelectors + numDeclarations);
      uniqueRuleSize.p(numSelectors + numDeclarations, loc);
      selectorsPerRule.push(numSelectors);
      uniqueSelectorsPerRule.p(numSelectors, loc);
      declarationsPerRule.push(numDeclarations);
      uniqueDeclarationsPerRule.p(numDeclarations, loc);
      ruleNesting.push(depth2);
      uniqueRuleNesting.p(depth2, loc);
    }
    else if (is_selector(node)) {
      if (inKeyframes) return SKIP;
      let loc = toLoc(node);
      selectorNesting.push(depth2 > 0 ? depth2 - 1 : 0);
      uniqueSelectorNesting.p(depth2 > 0 ? depth2 - 1 : 0, loc);
      uniqueSelectors.add(node.text);
      let complexity = getComplexity(node);
      selectorComplexities.push(complexity);
      uniqueSelectorComplexities.p(complexity, loc);
      isPrefixed(node, (prefix) => {
        prefixedSelectors.p(prefix.toLowerCase(), loc);
      });
      isAccessibility(node, (a11y_selector) => {
        a11y.p(a11y_selector, loc);
      });
      walk(node, (child) => {
        if (is_attribute_selector(child)) attributeSelectors.p(child.name.toLowerCase(), loc);
        else if (is_type_selector(child) && !child.name.startsWith("--") && child.name.includes("-")) customElementSelectors.p(child.name.toLowerCase(), loc);
        else if (is_pseudo_class_selector(child)) pseudoClasses.p(child.name.toLowerCase(), loc);
        else if (is_pseudo_element_selector(child)) pseudoElements.p(child.name.toLowerCase(), loc);
      });
      getCombinators(node, (combinator) => {
        let name = combinator.name.trim() === "" ? " " : combinator.name;
        combinators.p(name, combinator.loc);
      });
      let specificity = calculateForAST(node);
      let [sa, sb, sc] = specificity;
      uniqueSpecificities.p(specificity.toString(), loc);
      specificityA.push(sa);
      specificityB.push(sb);
      specificityC.push(sc);
      if (maxSpecificity === void 0) maxSpecificity = specificity;
      if (minSpecificity === void 0) minSpecificity = specificity;
      if (minSpecificity !== void 0 && compareSpecificity(minSpecificity, specificity) < 0) minSpecificity = specificity;
      if (maxSpecificity !== void 0 && compareSpecificity(maxSpecificity, specificity) > 0) maxSpecificity = specificity;
      specificities.push(specificity);
      if (sa > 0) ids.p(node.text, loc);
      return SKIP;
    } else if (is_supports_declaration(node)) return SKIP;
    else if (is_declaration(node)) {
      totalDeclarations++;
      let declaration = node.text;
      uniqueDeclarations.add(declaration);
      let loc = toLoc(node);
      let declarationDepth = depth2 > 0 ? depth2 - 1 : 0;
      declarationNesting.push(declarationDepth);
      uniqueDeclarationNesting.p(declarationDepth, loc);
      let complexity = 1;
      if (node.is_important) {
        complexity++;
        if (!declaration.toLowerCase().includes("!important")) valueBrowserhacks.p("!ie", toLoc(node.value));
        if (inKeyframes) {
          importantsInKeyframes++;
          complexity++;
        }
      }
      declarationComplexities.push(complexity);
      let { is_important, property, is_browserhack, is_vendor_prefixed: is_vendor_prefixed2 } = node;
      if (!property) return;
      let propertyLoc = toLoc(node);
      propertyLoc.length = property.length;
      let normalizedProperty = basename(property);
      properties.p(normalizedProperty, propertyLoc);
      if (is_important) importantDeclarations++;
      if (is_vendor_prefixed2) {
        propertyComplexities.push(2);
        propertyVendorPrefixes.p(property, propertyLoc);
      } else if (is_custom(property)) {
        customProperties.p(property, propertyLoc);
        customPropsTracking.define(property);
        propertyComplexities.push(is_important ? 3 : 2);
        if (is_important) importantCustomProperties.p(property, propertyLoc);
      } else if (is_browserhack) {
        propertyHacks.p(property.charAt(0), propertyLoc);
        propertyComplexities.push(2);
      } else propertyComplexities.push(1);
      if (shorthand_properties.has(normalizedProperty)) shorthands.p(property, propertyLoc);
      {
        let value = node.value;
        if (!value) return;
        if (is_raw(value)) return;
        let { text } = value;
        let valueLoc = toLoc(value);
        let complexity2 = 1;
        if (keywords.has(text)) {
          valueKeywords.p(text.toLowerCase(), valueLoc);
          valueComplexities.push(complexity2);
          if (normalizedProperty === "display") displays.p(text.toLowerCase(), valueLoc);
          return;
        }
        isValuePrefixed(value, (prefixed) => {
          vendorPrefixedValues.p(prefixed.toLowerCase(), valueLoc);
          complexity2++;
        });
        if (!is_custom(property)) isValueBrowserhack(value, (hack) => {
          valueBrowserhacks.p(hack, valueLoc);
          complexity2++;
          if (hack === "\\9" || hack === "\\7") text = text.slice(0, -2);
        });
        valueComplexities.push(complexity2);
        if (SPACING_RESET_PROPERTIES.has(normalizedProperty)) {
          if (isValueReset(value)) resets.p(normalizedProperty, valueLoc);
        } else if (normalizedProperty === "display") if (/var\(/i.test(text)) displays.p(text, valueLoc);
        else displays.p(text.toLowerCase(), valueLoc);
        else if (normalizedProperty === "z-index") {
          zindex.p(text, valueLoc);
          return SKIP;
        } else if (normalizedProperty === "font") {
          if (!SYSTEM_FONTS.has(text)) {
            let result = destructure(value, function(keyword) {
              valueKeywords.p(keyword.toLowerCase(), valueLoc);
            });
            if (!result) return SKIP;
            let { font_size, line_height, font_family } = result;
            if (font_family) fontFamilies.p(font_family, valueLoc);
            if (font_size) fontSizes.p(font_size.toLowerCase(), valueLoc);
            if (line_height) lineHeights.p(line_height.toLowerCase(), valueLoc);
          }
        } else if (normalizedProperty === "font-size") {
          if (!SYSTEM_FONTS.has(text)) {
            let normalized = text.toLowerCase();
            if (normalized.includes("var(")) fontSizes.p(text, valueLoc);
            else fontSizes.p(normalized, valueLoc);
          }
        } else if (normalizedProperty === "font-family") {
          if (!SYSTEM_FONTS.has(text)) fontFamilies.p(text, valueLoc);
          return SKIP;
        } else if (normalizedProperty === "line-height") {
          let normalized = text.toLowerCase();
          if (normalized.includes("var(")) lineHeights.p(text, valueLoc);
          else lineHeights.p(normalized, valueLoc);
        } else if (normalizedProperty === "transition" || normalizedProperty === "animation") {
          let isAnimation = normalizedProperty === "animation";
          analyzeAnimation(value, function(item) {
            if (item.type === "fn") timingFunctions.p(item.value.text.toLowerCase(), valueLoc);
            else if (item.type === "duration") durations.p(item.value.text.toLowerCase(), valueLoc);
            else if (item.type === "keyword") valueKeywords.p(item.value.text.toLowerCase(), valueLoc);
            else if (item.type === "name" && isAnimation) {
              animationNames.p(item.value.text, valueLoc);
              animationNamesTracking.use(item.value.text);
            }
          });
          return SKIP;
        } else if (normalizedProperty === "animation-duration" || normalizedProperty === "transition-duration") {
          for (let child of value.children) if (!is_operator(child)) {
            let text2 = child.text;
            if (/var\(/i.test(text2)) durations.p(text2, valueLoc);
            else durations.p(text2.toLowerCase(), valueLoc);
          }
        } else if (normalizedProperty === "transition-timing-function" || normalizedProperty === "animation-timing-function") {
          for (let child of value.children) if (!is_operator(child)) timingFunctions.p(child.text, valueLoc);
        } else if (normalizedProperty === "animation-name") {
          for (let child of value.children) if (is_identifier(child) && !keywords.has(child.name)) {
            animationNames.p(child.text, valueLoc);
            animationNamesTracking.use(child.text);
          }
        } else if (normalizedProperty === "container-name") {
          for (let child of value.children) if (is_identifier(child) && !keywords.has(child.name)) {
            containerNames.p(child.text, toLoc(child));
            containerNamesTracking.define(child.text);
          }
        } else if (normalizedProperty === "container") {
          if (value.first_child && is_identifier(value.first_child)) {
            containerNames.p(value.first_child.text, valueLoc);
            if (!keywords.has(value.first_child.name)) containerNamesTracking.define(value.first_child.text);
          }
        } else if (normalizedProperty === "anchor-name") {
          for (let child of value.children) if (is_identifier(child) && str_starts_with(child.text, "--")) anchorNamesTracking.define(child.text);
        } else if (normalizedProperty === "position-anchor") {
          if (value.first_child && is_identifier(value.first_child) && str_starts_with(value.first_child.text, "--")) anchorNamesTracking.use(value.first_child.text);
        } else if (border_radius_properties.has(normalizedProperty)) borderRadiuses.push(text, property, valueLoc);
        else if (normalizedProperty === "text-shadow") textShadows.p(text, valueLoc);
        else if (normalizedProperty === "box-shadow") boxShadows.p(text, valueLoc);
        walk(value, (valueNode) => {
          if (is_dimension(valueNode)) {
            let unit = valueNode.unit.toLowerCase();
            let loc2 = toLoc(valueNode);
            units.push(unit, property, loc2);
            return SKIP;
          }
          if (is_hash(valueNode)) {
            let hashText = valueNode.text;
            if (!hashText || !hashText.startsWith("#")) return SKIP;
            let hashValue = hashText.toLowerCase();
            let hexLength = hashValue.length - 1;
            if (endsWith("\\9", hashValue) || endsWith("\\7", hashValue)) hexLength = hexLength - 2;
            let hashLoc = toLoc(valueNode);
            colors.push(hashValue, property, hashLoc);
            colorFormats.p(`hex` + hexLength, hashLoc);
            return SKIP;
          }
          if (is_identifier(valueNode)) {
            let identifierText = valueNode.text;
            let identifierLoc = toLoc(valueNode);
            if (normalizedProperty === "font" || normalizedProperty === "font-family") return SKIP;
            if (keywords.has(identifierText)) valueKeywords.p(identifierText.toLowerCase(), identifierLoc);
            let nodeLen = identifierText.length;
            if (nodeLen > 20 || nodeLen < 3) return SKIP;
            if (colorKeywords.has(identifierText)) {
              let colorKeyword = identifierText.toLowerCase();
              colors.push(colorKeyword, property, identifierLoc);
              colorFormats.p(colorKeyword, identifierLoc);
              return;
            }
            if (namedColors.has(identifierText)) {
              colors.push(identifierText.toLowerCase(), property, identifierLoc);
              colorFormats.p("named", identifierLoc);
              return;
            }
            if (systemColors.has(identifierText)) {
              colors.push(identifierText.toLowerCase(), property, identifierLoc);
              colorFormats.p("system", identifierLoc);
              return;
            }
            return SKIP;
          }
          if (is_function(valueNode)) {
            let funcName = valueNode.name;
            let funcLoc = toLoc(valueNode);
            let firstFuncChild = valueNode.first_child;
            if (funcName === "var" && firstFuncChild && is_identifier(firstFuncChild) && str_starts_with(firstFuncChild.text, "--")) customPropsTracking.use(firstFuncChild.text);
            if ((funcName === "anchor" || funcName === "anchor-size") && firstFuncChild && is_identifier(firstFuncChild) && str_starts_with(firstFuncChild.text, "--")) anchorNamesTracking.use(firstFuncChild.text);
            if (colorFunctions.has(funcName)) {
              colors.push(valueNode.text, property, funcLoc);
              colorFormats.p(funcName.toLowerCase(), funcLoc);
              return;
            }
            if (endsWith("gradient", funcName)) gradients.p(valueNode.text, funcLoc);
          }
        });
      }
    } else if (is_url(node)) {
      let { value } = node;
      let embed = unquote(value ?? "");
      if (str_starts_with(embed, "data:")) {
        let size = embed.length;
        let type = getEmbedType(embed);
        embedTypes.total++;
        embedSize += size;
        let loc = {
          line: node.line,
          column: node.column,
          offset: node.start,
          length: node.length
        };
        if (embedTypes.unique.has(type)) {
          let item = embedTypes.unique.get(type);
          item.count++;
          item.size += size;
          embedTypes.unique.set(type, item);
          if (useLocations && item.uniqueWithLocations) item.uniqueWithLocations.push(loc);
        } else {
          let item = {
            count: 1,
            size,
            uniqueWithLocations: useLocations ? [loc] : void 0
          };
          embedTypes.unique.set(type, item);
        }
      }
    } else if (is_media_feature(node)) {
      mediaFeatures.p(node.property?.toLowerCase(), toLoc(node));
      return SKIP;
    }
  });
  let totalUniqueDeclarations = uniqueDeclarations.size;
  let totalSelectors = selectorComplexities.size();
  let specificitiesA = specificityA.aggregate();
  let specificitiesB = specificityB.aggregate();
  let specificitiesC = specificityC.aggregate();
  let totalUniqueSelectors = uniqueSelectors.size;
  let assign = Object.assign;
  let cssLen = css.length;
  let fontFacesCount = fontfaces.length;
  let atRuleComplexity = atRuleComplexities.aggregate();
  let selectorComplexity = selectorComplexities.aggregate();
  let declarationComplexity = declarationComplexities.aggregate();
  let propertyComplexity = propertyComplexities.aggregate();
  let valueComplexity = valueComplexities.aggregate();
  let atruleCount = atrules.c();
  return {
    stylesheet: {
      sourceLinesOfCode: atruleCount.total + totalSelectors + totalDeclarations + keyframeSelectors.size(),
      linesOfCode,
      size: cssLen,
      complexity: atRuleComplexity.sum + selectorComplexity.sum + declarationComplexity.sum + propertyComplexity.sum + valueComplexity.sum,
      comments: {
        total: totalComments,
        size: commentsSize
      },
      embeddedContent: {
        size: {
          total: embedSize,
          ratio: ratio(embedSize, cssLen)
        },
        types: {
          total: embedTypes.total,
          totalUnique: embedTypes.unique.size,
          uniquenessRatio: ratio(embedTypes.unique.size, embedTypes.total),
          unique: Object.fromEntries(embedTypes.unique)
        }
      }
    },
    atrules: assign(atruleCount, {
      fontface: assign({
        total: fontFacesCount,
        totalUnique: fontFacesCount,
        unique: fontfaces,
        uniquenessRatio: fontFacesCount === 0 ? 0 : 1
      }, useLocations ? { uniqueWithLocations: fontfaces_with_loc.c().uniqueWithLocations } : {}),
      import: imports.c(),
      media: assign(medias.c(), {
        browserhacks: mediaBrowserhacks.c(),
        features: mediaFeatures.c()
      }),
      charset: charsets.c(),
      supports: assign(supports.c(), { browserhacks: supportsBrowserhacks.c() }),
      keyframes: assign(keyframes.c(), animationNamesTracking.analyze(), { prefixed: assign(prefixedKeyframes.c(), { ratio: ratio(prefixedKeyframes.size(), keyframes.size()) }) }),
      container: assign(containers.c(), { names: assign(containerNames.c(), containerNamesTracking.analyze()) }),
      layer: assign(layers.c(), layerNamesTracking.analyze()),
      property: registeredProperties.c(),
      function: functions.c(),
      scope: scopes.c(),
      complexity: atRuleComplexity,
      nesting: assign(atruleNesting.aggregate(), { items: atruleNesting.toArray() }, uniqueAtruleNesting.c())
    }),
    rules: {
      total: totalRules,
      empty: {
        total: emptyRules,
        ratio: ratio(emptyRules, totalRules)
      },
      sizes: assign(ruleSizes.aggregate(), { items: ruleSizes.toArray() }, uniqueRuleSize.c()),
      nesting: assign(ruleNesting.aggregate(), { items: ruleNesting.toArray() }, uniqueRuleNesting.c()),
      selectors: assign(selectorsPerRule.aggregate(), { items: selectorsPerRule.toArray() }, uniqueSelectorsPerRule.c()),
      declarations: assign(declarationsPerRule.aggregate(), { items: declarationsPerRule.toArray() }, uniqueDeclarationsPerRule.c())
    },
    selectors: {
      total: totalSelectors,
      totalUnique: totalUniqueSelectors,
      uniquenessRatio: ratio(totalUniqueSelectors, totalSelectors),
      specificity: assign({
        /** @type Specificity */
        min: minSpecificity === void 0 ? [
          0,
          0,
          0
        ] : minSpecificity,
        /** @type Specificity */
        max: maxSpecificity === void 0 ? [
          0,
          0,
          0
        ] : maxSpecificity,
        /** @type Specificity */
        sum: [
          specificitiesA.sum,
          specificitiesB.sum,
          specificitiesC.sum
        ],
        /** @type Specificity */
        mean: [
          specificitiesA.mean,
          specificitiesB.mean,
          specificitiesC.mean
        ],
        /** @type Specificity */
        mode: [
          specificitiesA.mode,
          specificitiesB.mode,
          specificitiesC.mode
        ],
        /** @type Specificity */
        items: specificities
      }, uniqueSpecificities.c()),
      complexity: assign(selectorComplexity, uniqueSelectorComplexities.c(), { items: selectorComplexities.toArray() }),
      nesting: assign(selectorNesting.aggregate(), { items: selectorNesting.toArray() }, uniqueSelectorNesting.c()),
      id: assign(ids.c(), { ratio: ratio(ids.size(), totalSelectors) }),
      pseudoClasses: pseudoClasses.c(),
      pseudoElements: pseudoElements.c(),
      accessibility: assign(a11y.c(), { ratio: ratio(a11y.size(), totalSelectors) }),
      attributes: attributeSelectors.c(),
      customElements: customElementSelectors.c(),
      keyframes: keyframeSelectors.c(),
      prefixed: assign(prefixedSelectors.c(), { ratio: ratio(prefixedSelectors.size(), totalSelectors) }),
      combinators: combinators.c()
    },
    declarations: {
      total: totalDeclarations,
      totalUnique: totalUniqueDeclarations,
      uniquenessRatio: ratio(totalUniqueDeclarations, totalDeclarations),
      importants: {
        total: importantDeclarations,
        ratio: ratio(importantDeclarations, totalDeclarations),
        inKeyframes: {
          total: importantsInKeyframes,
          ratio: ratio(importantsInKeyframes, importantDeclarations)
        }
      },
      complexity: declarationComplexity,
      nesting: assign(declarationNesting.aggregate(), { items: declarationNesting.toArray() }, uniqueDeclarationNesting.c())
    },
    properties: assign(properties.c(), {
      prefixed: assign(propertyVendorPrefixes.c(), { ratio: ratio(propertyVendorPrefixes.size(), properties.size()) }),
      custom: assign(customProperties.c(), customPropsTracking.analyze(), {
        ratio: ratio(customProperties.size(), properties.size()),
        importants: assign(importantCustomProperties.c(), { ratio: ratio(importantCustomProperties.size(), customProperties.size()) })
      }),
      shorthands: assign(shorthands.c(), { ratio: ratio(shorthands.size(), properties.size()) }),
      browserhacks: assign(propertyHacks.c(), { ratio: ratio(propertyHacks.size(), properties.size()) }),
      complexity: propertyComplexity,
      anchorNames: anchorNamesTracking.analyze()
    }),
    values: {
      colors: assign(colors.count(), { formats: colorFormats.c() }),
      gradients: gradients.c(),
      fontFamilies: fontFamilies.c(),
      fontSizes: fontSizes.c(),
      lineHeights: lineHeights.c(),
      zindexes: zindex.c(),
      textShadows: textShadows.c(),
      boxShadows: boxShadows.c(),
      borderRadiuses: borderRadiuses.count(),
      animations: {
        durations: durations.c(),
        timingFunctions: timingFunctions.c(),
        names: animationNames.c()
      },
      prefixes: vendorPrefixedValues.c(),
      browserhacks: valueBrowserhacks.c(),
      units: units.count(),
      complexity: valueComplexity,
      keywords: valueKeywords.c(),
      resets: resets.c(),
      displays: displays.c()
    },
    __meta__: {
      parseTime: startAnalysis - startParse,
      analyzeTime: Date.now() - startAnalysis,
      total: Date.now() - start
    }
  };
}
function compareSpecificity(a, b) {
  if (a[0] === b[0]) {
    if (a[1] === b[1]) return b[2] - a[2];
    return b[1] - a[1];
  }
  return b[0] - a[0];
}

// node_modules/@projectwallace/css-code-quality/dist/core-BSewSOxK.js
var guards$2 = [
  (result) => ({
    id: "Imports",
    score: result.atrules.import.total * 10,
    value: result.atrules.import.total,
    actuals: Object.keys(result.atrules.import.unique)
  }),
  (result) => ({
    id: "EmptyRules",
    score: result.rules.empty.total,
    value: result.rules.empty.total
  }),
  (result) => {
    const outcome = {
      id: "SelectorDuplications",
      score: 0,
      value: 1 - result.selectors.uniquenessRatio
    };
    if (result.selectors.uniquenessRatio < 0.66) outcome.score = Math.floor((1 - result.selectors.uniquenessRatio) * 10);
    return outcome;
  },
  (result) => {
    const outcome = {
      id: "DeclarationDuplications",
      score: 0,
      value: 1 - result.declarations.uniquenessRatio
    };
    if (result.declarations.uniquenessRatio < 0.66) outcome.score = Math.floor((1 - result.declarations.uniquenessRatio) * 10);
    return outcome;
  },
  (result) => ({
    id: "CssSize",
    score: result.stylesheet.size > 2e5 ? 5 : 0,
    value: result.stylesheet.size
  }),
  (result) => {
    const { comments } = result.stylesheet;
    return {
      id: "TooMuchComments",
      score: Math.min(10, Math.floor(comments.size / 250)),
      value: comments.size
    };
  },
  (result) => {
    const { size } = result.stylesheet.embeddedContent;
    return {
      id: "TooMuchEmbeddedContent",
      score: Math.min(20, Math.floor(size.total / 250)),
      value: size.total
    };
  }
];
var guards$1 = [
  (result) => {
    const outcome = {
      id: "SourceLinesOfCode",
      score: 0,
      value: result.stylesheet.sourceLinesOfCode
    };
    if (result.stylesheet.sourceLinesOfCode > 1e4) {
      const score2 = Math.floor((result.stylesheet.sourceLinesOfCode - 1e4) / 1e3);
      outcome.score = Math.min(15, score2);
    }
    return outcome;
  },
  (result) => {
    const ALLOWED_SELECTORS_PER_RULESET = 2;
    const actual = result.rules.selectors.mean;
    const outcome = {
      id: "AverageSelectorsPerRule",
      score: 0,
      value: actual,
      actuals: result.rules.selectors.items
    };
    if (actual > ALLOWED_SELECTORS_PER_RULESET) {
      const score2 = Math.floor((actual - ALLOWED_SELECTORS_PER_RULESET) * 5);
      outcome.score = Math.min(15, score2);
    }
    return outcome;
  },
  (result) => {
    const ALLOWED_DECLARATIONS_PER_RULESET = 5;
    const outcome = {
      id: "AverageDeclarationsPerRule",
      score: 0,
      value: result.rules.declarations.mean,
      actuals: result.rules.declarations.items
    };
    if (result.rules.declarations.mean > ALLOWED_DECLARATIONS_PER_RULESET) {
      const score2 = Math.floor((result.rules.declarations.mean - ALLOWED_DECLARATIONS_PER_RULESET) * 5);
      outcome.score = Math.min(15, score2);
    }
    return outcome;
  },
  (result) => {
    const MAX_SELECTORS_PER_RULESET = 10;
    const max2 = result.rules.selectors.max;
    const outcome = {
      id: "MaxSelectorsPerRule",
      score: 0,
      value: max2,
      actuals: result.rules.selectors.items
    };
    if (max2 > MAX_SELECTORS_PER_RULESET) {
      const score2 = Math.ceil((max2 - MAX_SELECTORS_PER_RULESET) * 0.5);
      outcome.score = Math.min(score2, 15);
    }
    return outcome;
  },
  (result) => {
    const MAX_DECLARATIONS_PER_RULESET = 10;
    const max2 = result.rules.declarations.max || 0;
    const outcome = {
      id: "MaxDeclarationsPerRule",
      score: 0,
      value: max2,
      actuals: result.rules.declarations.items
    };
    if (max2 > MAX_DECLARATIONS_PER_RULESET) {
      const score2 = Math.ceil((max2 - MAX_DECLARATIONS_PER_RULESET) * 0.5);
      outcome.score = Math.min(15, score2);
    }
    return outcome;
  },
  (result) => {
    const mode = result.rules.selectors.mode;
    const rulesHavingMoreThanMode = result.rules.selectors.items.filter((item) => item > mode).length;
    const outcome = {
      id: "MoreThanMostCommonSelectorsPerRule",
      score: 0,
      value: result.rules.selectors.mode,
      actuals: result.rules.selectors.items
    };
    if (rulesHavingMoreThanMode > result.rules.total * 0.1) {
      const score2 = Math.floor(rulesHavingMoreThanMode * 0.01);
      outcome.score = Math.min(15, score2);
    }
    return outcome;
  },
  (result) => {
    const mode = result.rules.selectors.mode;
    const rulesHavingMoreThanMode = result.rules.declarations.items.filter((item) => item > mode).length;
    const outcome = {
      id: "MoreThanMostCommonDeclarationsPerRule",
      score: 0,
      value: result.rules.declarations.mode,
      actuals: result.rules.declarations.items
    };
    if (rulesHavingMoreThanMode > result.rules.total * 0.1) {
      const score2 = Math.floor(rulesHavingMoreThanMode * 0.01);
      outcome.score = Math.min(15, score2);
    }
    return outcome;
  }
];
var guards = [
  (result) => {
    const mode = result.selectors.complexity.mode;
    const selectorsAboveMode = result.selectors.complexity.items.filter((c2) => c2 > mode).length;
    const outcome = {
      id: "MoreThanMostCommonSelectorComplexity",
      score: 0,
      value: result.selectors.total === 0 ? 0 : selectorsAboveMode / result.selectors.total,
      actuals: result.selectors.complexity.items
    };
    if (selectorsAboveMode > result.selectors.total * 0.1) {
      const score2 = Math.floor(selectorsAboveMode * 0.01);
      outcome.score = Math.min(10, score2);
    }
    return outcome;
  },
  (result) => {
    const mode = result.selectors.specificity.mode;
    const selectorsAboveMode = result.selectors.specificity.items.filter((c2) => compare(c2, mode) > 0).length;
    const outcome = {
      id: "MoreThanMostCommonSelectorSpecificity",
      score: 0,
      value: result.selectors.total === 0 ? 0 : selectorsAboveMode / result.selectors.total,
      actuals: result.selectors.specificity.items
    };
    if (selectorsAboveMode > result.selectors.total * 0.1) {
      const score2 = Math.floor(selectorsAboveMode * 0.01);
      outcome.score = Math.min(10, score2);
    }
    return outcome;
  },
  (result) => {
    const MAX_SELECTOR_COMPLEXITY = 5;
    const actual = result.selectors.complexity.max;
    const outcome = {
      id: "MaxSelectorComplexity",
      score: 0,
      value: result.selectors.complexity.max,
      actuals: result.selectors.complexity.items
    };
    if (actual > MAX_SELECTOR_COMPLEXITY) {
      const score2 = Math.ceil((actual - MAX_SELECTOR_COMPLEXITY) * 0.5);
      outcome.score = Math.min(5, score2);
    }
    return outcome;
  },
  (result) => {
    const ALLOWED_COMPLEXITY = 2;
    const actual = result.selectors.complexity.mean;
    const outcome = {
      id: "AverageSelectorComplexity",
      score: 0,
      value: actual,
      actuals: result.selectors.complexity.items
    };
    if (actual > ALLOWED_COMPLEXITY) {
      const score2 = Math.ceil((actual - ALLOWED_COMPLEXITY) * 2);
      outcome.score = Math.min(10, score2);
    }
    return outcome;
  },
  (result) => {
    const ALLOWED = 0.01;
    const actual = result.selectors.id.ratio;
    const outcome = {
      id: "IdSelectorRatio",
      score: 0,
      value: actual,
      actuals: Object.keys(result.selectors.id.unique)
    };
    if (actual > ALLOWED) {
      const score2 = Math.floor((actual - ALLOWED) * 10);
      outcome.score = Math.min(score2, 5);
    }
    return outcome;
  },
  (result) => {
    const ALLOWED = 0.01;
    const actual = result.declarations.importants.ratio;
    const outcome = {
      id: "ImportantRatio",
      score: 0,
      value: actual,
      actuals: result.declarations.importants.total
    };
    if (actual > ALLOWED) {
      const score2 = Math.floor((actual - ALLOWED) * 10);
      outcome.score = Math.min(score2, 5);
    }
    return outcome;
  }
];
function calculateScore(result, guards2) {
  let score2 = 100;
  const violations = [];
  const passes = [];
  for (const guard of guards2) {
    const outcome = guard(result);
    if (outcome.score > 0) {
      score2 -= outcome.score;
      violations.push(outcome);
    } else passes.push(outcome);
  }
  return {
    score: Math.max(score2, 0),
    violations,
    passes
  };
}
function calculate2(analysis) {
  const performance2 = calculateScore(analysis, guards$2);
  const maintainability = calculateScore(analysis, guards$1);
  const complexity = calculateScore(analysis, guards);
  return {
    violations: performance2.violations.concat(maintainability.violations).concat(complexity.violations),
    passes: performance2.passes.concat(maintainability.passes).concat(complexity.passes),
    performance: performance2,
    maintainability,
    complexity
  };
}

// node_modules/@projectwallace/css-code-quality/dist/index.js
function calculate3(css) {
  const analysis = analyze(css);
  return calculate2(analysis);
}

// src/main/services/cssLocations.ts
import * as csstree from "css-tree";
function locateCssIssues(css, limit = 50) {
  if (!css || css.length < 20) return [];
  const out = [];
  let ast;
  try {
    ast = csstree.parse(css, {
      positions: true,
      parseValue: true,
      parseCustomProperty: false
    });
  } catch {
    return [];
  }
  const push = (loc) => {
    if (out.length < limit) out.push(loc);
  };
  csstree.walk(ast, (node) => {
    if (out.length >= limit) return;
    if (node.type === "Rule" && node.prelude) {
      let selector = "";
      try {
        selector = csstree.generate(node.prelude);
      } catch {
        return;
      }
      if (/(^|[\s>+~|,])#[A-Za-z_][\w-]*/.test(selector) && node.loc?.start) {
        push({
          reason: "id-selector",
          selector: selector.slice(0, 120),
          line: node.loc.start.line,
          column: node.loc.start.column
        });
      }
    }
    if (node.type === "Declaration" && node.loc?.start) {
      const prop = node.property;
      let value = "";
      try {
        value = csstree.generate(node.value).trim();
      } catch {
        value = "";
      }
      if (node.important) {
        push({
          reason: "important",
          property: prop,
          value: value.slice(0, 80),
          line: node.loc.start.line,
          column: node.loc.start.column
        });
      }
      if (prop === "z-index") {
        const n = parseInt(value, 10);
        if (Number.isFinite(n) && Math.abs(n) >= 1e3) {
          push({
            reason: "high-z",
            property: prop,
            value,
            line: node.loc.start.line,
            column: node.loc.start.column
          });
        }
      }
      if (prop.startsWith("-webkit-") || prop.startsWith("-moz-") || prop.startsWith("-ms-")) {
        push({
          reason: "vendor-prefix",
          property: prop,
          value: value.slice(0, 80),
          line: node.loc.start.line,
          column: node.loc.start.column
        });
      }
    }
  });
  return out;
}
function formatLocations(locs, reason, max2 = 5) {
  const hits = locs.filter((l) => l.reason === reason).slice(0, max2);
  if (!hits.length) return "";
  return "Locations: " + hits.map((l) => {
    const what = l.selector ?? `${l.property ?? ""}${l.value ? `: ${l.value}` : ""}`;
    return `${what.trim()} @ ${l.line}:${l.column}`;
  }).join("; ");
}

// src/main/services/cssAudit.ts
var seq = 0;
function mk(page, category, severity, title, detail, fix) {
  return {
    id: `c${++seq}`,
    category,
    severity,
    title,
    detail,
    fix,
    pageUrl: page.url,
    source: "heuristic"
  };
}
function num(v, fallback = 0) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function scopeNote(attr) {
  if (!attr) return "";
  if (attr.scoped) {
    return ` Measured on first-party CSS (${(attr.appBytes / 1024).toFixed(0)} kB app \xB7 ${(attr.frameworkBytes / 1024).toFixed(0)} kB framework \xB7 ${(attr.vendorBytes / 1024).toFixed(0)} kB vendor).`;
  }
  return ` First-party CSS was too thin to score alone \u2014 metrics include framework/vendor sheets (${(attr.totalBytes / 1024).toFixed(0)} kB total).`;
}
var cssCache = /* @__PURE__ */ new Map();
function hashCss(css) {
  let h = 0;
  for (let i = 0; i < css.length; i++) h = Math.imul(31, h) + css.charCodeAt(i) | 0;
  return `${css.length}:${h}:${css.slice(0, 64)}`;
}
function analyzeCss(css, sheets, opts = {}) {
  if (!css || css.length < 40) return null;
  const cacheKey = `${hashCss(css)}:${sheets}:${opts.attribution ? `${opts.attribution.appBytes}:${opts.attribution.totalBytes}` : "0"}`;
  if (cssCache.has(cacheKey)) return cssCache.get(cacheKey) ?? null;
  let a;
  try {
    a = analyze(css);
  } catch {
    cssCache.set(cacheKey, null);
    if (cssCache.size > 50) cssCache.delete(cssCache.keys().next().value);
    return null;
  }
  let quality = { performance: 100, maintainability: 100, complexity: 100 };
  let qualityViolations = [];
  try {
    const q = calculate3(css);
    quality = {
      performance: num(q.performance?.score, 100),
      maintainability: num(q.maintainability?.score, 100),
      complexity: num(q.complexity?.score, 100)
    };
    qualityViolations = (q.violations ?? []).map((v) => ({
      id: String(v.id ?? "unknown"),
      score: num(v.score, 0),
      value: v.value
    }));
  } catch {
  }
  const av = a;
  const custom = av.properties?.custom ?? {};
  const zi = av.values?.zindexes ?? {};
  const zValues = Object.keys(zi.unique ?? {}).map((z) => parseInt(z, 10)).filter((n) => Number.isFinite(n));
  const attr = opts.attribution;
  const rawBytes = num(av.stylesheet?.size);
  const trueBytes = css ? Buffer.byteLength(css, "utf8") : rawBytes;
  const bytes = attr?.totalBytes ?? trueBytes;
  const sheetTotal = attr ? attr.appSheets + attr.frameworkSheets + attr.vendorSheets : sheets;
  const result = {
    bytes,
    sheets: sheetTotal || sheets,
    rules: num(av.rules?.total),
    selectors: num(av.selectors?.total),
    maxSpecificity: (av.selectors?.specificity?.max ?? []).join(","),
    importantRatio: num(av.declarations?.importants?.ratio),
    idSelectorRatio: num(av.selectors?.id?.ratio),
    colorsTotal: num(av.values?.colors?.total),
    colorsUnique: num(av.values?.colors?.totalUnique),
    colorUniquenessRatio: num(av.values?.colors?.uniquenessRatio),
    fontSizesUnique: num(av.values?.fontSizes?.totalUnique),
    fontFamiliesUnique: num(av.values?.fontFamilies?.totalUnique),
    radiiUnique: num(av.values?.borderRadiuses?.totalUnique),
    shadowsUnique: num(av.values?.boxShadows?.totalUnique),
    zIndexUnique: num(zi.totalUnique),
    zIndexMax: zValues.length ? Math.max(...zValues) : 0,
    browserhacks: num(av.values?.browserhacks?.total) + num(av.selectors?.browserhacks?.total),
    vendorPrefixed: num(av.values?.prefixes?.total) + num(av.properties?.prefixed?.total),
    customPropsDefined: num(custom.total),
    customPropsUnused: Array.isArray(custom.unused) ? custom.unused.length : 0,
    mediaQueries: num(av.atrules?.media?.total),
    quality,
    qualityViolations,
    locations: locateCssIssues(css),
    attribution: attr
  };
  cssCache.set(cacheKey, result);
  if (cssCache.size > 50) cssCache.delete(cssCache.keys().next().value);
  return result;
}
function auditCss(page, stats, config2) {
  const out = [];
  const strict = config2.brutality === "ruthless" ? 1 : config2.brutality === "harsh" ? 0.75 : 0.5;
  const note = scopeNote(stats.attribution);
  const attr = stats.attribution;
  if (stats.importantRatio > 0.03) {
    const pct = (stats.importantRatio * 100).toFixed(1);
    const where = formatLocations(stats.locations, "important");
    out.push(
      mk(
        page,
        "coherence",
        stats.importantRatio > 0.08 ? "major" : "minor",
        `${pct}% of declarations use !important`,
        `${stats.rules} rules, ${stats.selectors} selectors. Healthy stylesheets sit under 3%; above that the cascade is being fought rather than designed.${note}${where ? `
${where}` : ""}`,
        "Delete !important and fix the specificity that made it necessary \u2014 usually an over-qualified selector or a global reset."
      )
    );
  }
  if (stats.idSelectorRatio > 0.02) {
    const where = formatLocations(stats.locations, "id-selector");
    out.push(
      mk(
        page,
        "coherence",
        "minor",
        `${(stats.idSelectorRatio * 100).toFixed(1)}% of selectors use IDs`,
        `Max specificity in the sheet is (${stats.maxSpecificity}). ID selectors cannot be overridden by component classes, so they force !important downstream.${note}${where ? `
${where}` : ""}`,
        "Swap ID selectors for class or data-attribute hooks."
      )
    );
  }
  const [a = 0, b = 0] = stats.maxSpecificity.split(",").map(Number);
  if (a > 0 || b > 4) {
    out.push(
      mk(
        page,
        "coherence",
        "minor",
        `Specificity peaks at (${stats.maxSpecificity})`,
        `Deeply specific selectors make component styles unpredictable and are the root cause of most "why is this not applying" bugs.${note}`,
        "Flatten to single-class selectors; let composition, not specificity, resolve conflicts."
      )
    );
  }
  if (stats.colorsTotal > 40 && stats.colorUniquenessRatio > 0.35) {
    out.push(
      mk(
        page,
        "coherence",
        stats.colorUniquenessRatio > 0.55 ? "major" : "minor",
        `Authored colour reuse is low (${stats.colorsUnique} unique / ${stats.colorsTotal} declarations)`,
        `Uniqueness ratio ${(stats.colorUniquenessRatio * 100).toFixed(0)}% \u2014 most colours are written once in the stylesheet. That is a palette by accident, not by system.${note}`,
        "Promote the repeated values to CSS custom properties and make one-offs illegal in review."
      )
    );
  }
  if (stats.fontSizesUnique > 18) {
    out.push(
      mk(
        page,
        "coherence",
        "major",
        `${stats.fontSizesUnique} unique font sizes in the stylesheet`,
        `Authored CSS confirms there is no type scale \u2014 the DOM sample only shows what happened to render.${note}`,
        "Define the scale as tokens and refactor call sites to reference them."
      )
    );
  }
  if (stats.radiiUnique > 10) {
    out.push(
      mk(
        page,
        "coherence",
        "minor",
        `${stats.radiiUnique} unique border-radius values authored`,
        `Roundness is being decided per component instead of per system.${note}`,
        "Derive every radius from one --radius token."
      )
    );
  }
  if (stats.shadowsUnique > 12) {
    out.push(
      mk(
        page,
        "coherence",
        "minor",
        `${stats.shadowsUnique} unique box-shadow values authored`,
        `Elevation should be a 3\u20134 step ladder; this many shadows means each component invented its own.${note}`,
        "Collapse into elevation tokens applied by role."
      )
    );
  }
  if (stats.zIndexUnique > 8 || stats.zIndexMax >= 1e3) {
    const where = formatLocations(stats.locations, "high-z");
    out.push(
      mk(
        page,
        "craft",
        stats.zIndexMax >= 9999 ? "major" : "minor",
        `z-index sprawl: ${stats.zIndexUnique} unique values, max ${stats.zIndexMax}`,
        `Ad-hoc stacking values are a stacking-context bug waiting to happen (and the reason modals hide behind headers).${note}${where ? `
${where}` : ""}`,
        "Define a named layer scale (base/dropdown/sticky/overlay/modal/toast) and forbid raw numbers."
      )
    );
  }
  if (stats.customPropsUnused > 0 && strict > 0.6) {
    out.push(
      mk(
        page,
        "coherence",
        "nit",
        `${stats.customPropsUnused} CSS custom properties defined but never used`,
        `${stats.customPropsDefined} custom properties declared in total.${note}`,
        "Dead tokens confuse the next person; delete them or use them."
      )
    );
  }
  if (stats.browserhacks > 0) {
    out.push(
      mk(
        page,
        "craft",
        "nit",
        `${stats.browserhacks} browser hacks in the stylesheet`,
        `Targeting specific engines with parse hacks is unmaintainable and usually obsolete.${note}`,
        "Replace with feature queries (@supports)."
      )
    );
  }
  if (stats.vendorPrefixed > 24 && strict > 0.5) {
    const where = formatLocations(stats.locations, "vendor-prefix");
    out.push(
      mk(
        page,
        "craft",
        "nit",
        `${stats.vendorPrefixed} vendor-prefixed declarations`,
        `Prefixed properties linger after browsers ship unprefixed support.${note}${where ? `
${where}` : ""}`,
        "Drop obsolete -webkit/-moz/-ms prefixes; keep only what caniuse still requires."
      )
    );
  }
  const totalBytes = attr?.totalBytes ?? stats.bytes;
  if (totalBytes > 5e5) {
    const appKb = attr ? (attr.appBytes / 1024).toFixed(0) : "?";
    const fwKb = attr ? ((attr.frameworkBytes + attr.vendorBytes) / 1024).toFixed(0) : "?";
    const dev = page.captureContext?.buildMode === "development";
    out.push(
      mk(
        page,
        "performance",
        dev ? "nit" : totalBytes > 1e6 ? "major" : "minor",
        `${(totalBytes / 1024).toFixed(0)} kB of CSS across ${stats.sheets} stylesheet(s)${dev ? " (dev)" : ""}`,
        `Large stylesheets block first render. First-party ~${appKb} kB; framework/vendor ~${fwKb} kB.${note}${dev ? " [dev-server artifact \u2014 unbundled Vite sheets; re-audit production]" : ""}`,
        "Split per route, purge unused rules, and load non-critical CSS asynchronously. Prefer not shipping full framework CSS if the app only needs a fraction."
      )
    );
  }
  const q = stats.quality;
  if (q.maintainability < 70 || q.complexity < 70 || q.performance < 70) {
    out.push(
      mk(
        page,
        "coherence",
        q.maintainability < 45 || q.complexity < 45 ? "major" : "minor",
        `CSS quality: perf ${q.performance}, maintainability ${q.maintainability}, complexity ${q.complexity}`,
        `Project Wallace guards failing: ${stats.qualityViolations.map((v) => v.id).slice(0, 8).join(", ") || "n/a"}.${note}`,
        "Attack the lowest score first \u2014 these guards map directly to selector complexity, !important use and specificity spread."
      )
    );
  }
  if (attr && (attr.truncated || attr.missedExternals > 0 || attr.adoptedSheetCount > 0) && strict > 0.5) {
    const bits = [];
    if (attr.truncated) bits.push("stylesheet text hit the 4 MB collection cap");
    if (attr.missedExternals > 0) bits.push(`${attr.missedExternals} external sheet(s) could not be fetched`);
    if (attr.adoptedSheetCount > 0) bits.push(`${attr.adoptedSheetCount} adoptedStyleSheets not parsed`);
    if (attr.styleAttrCount > 40) bits.push(`${attr.styleAttrCount} inline style attributes (not analyzed as authored CSS)`);
    if (bits.length) {
      out.push(
        mk(
          page,
          "craft",
          "nit",
          "CSS collection was incomplete",
          `${bits.join("; ")}. Metrics may under-count.`,
          "Ensure critical stylesheets are same-origin or fetchable; avoid shipping CSS only via adoptedStyleSheets without a static fallback."
        )
      );
    }
  }
  return out;
}

// src/main/services/cssScope.ts
var CDN_HOST = /(unpkg\.com|jsdelivr\.net|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|bootstrapcdn\.com|cdn\.tailwindcss\.com|use\.typekit\.net|fastly\.jsdelivr\.net)/i;
var NODE_MODULES_PATH = /(node_modules|\/@fs\/|\/\.vite\/deps)/i;
var FRAMEWORK_PACKAGE = /(?:^|\/)(tailwindcss|@tailwindcss|bootstrap|bulma|normalize\.css|antd|@?mui\b|@chakra|@mantine|@radix-ui|styled-components|@emotion)(?:\/|$)/i;
var FRAMEWORK_PATH_HINT = /(tailwind|bootstrap|bulma|normalize|preflight|reset\.css|antd|mui|chakra|mantine|radix-ui|emotion|styled-components)/i;
var FRAMEWORK_TOKEN = /^(tw|chakra|mantine|radix|mui|antd|emotion|css|sc|styled|joao|phosphor|fa|lucide)-/i;
function isFrameworkTokenName(name) {
  const n = name.replace(/^--/, "");
  if (FRAMEWORK_TOKEN.test(n)) return true;
  if (/^tw[_-]/i.test(n)) return true;
  if (/^[a-f0-9]{6,}$/i.test(n)) return true;
  if (/^[a-z]{1,2}[a-z0-9]{5,8}$/i.test(n) && !/(color|space|size|radius|font|shadow|z|gap|pad|bg|fg|text|border)/i.test(n)) {
    return true;
  }
  return false;
}
function isFirstPartySourcePath(href) {
  if (!href) return false;
  if (NODE_MODULES_PATH.test(href)) return false;
  if (/[/\\]src[/\\]/i.test(href) || /[/\\]app[/\\]styles?[/\\]/i.test(href)) return true;
  try {
    const path = href.includes("://") ? new URL(href).pathname : href;
    if (/^\/src\//i.test(path) || /^\/app\//i.test(path)) return true;
  } catch {
  }
  return false;
}
function contentLooksFramework(text) {
  if (!text || text.length < 40) return false;
  const sample = text.slice(0, 8e4);
  if (/@tailwind\s+(base|components|utilities)/i.test(sample)) return true;
  if (/\/\*!?\s*tailwindcss/i.test(sample)) return true;
  if (/\/\*!?\s*normalize\.css/i.test(sample)) return true;
  if (/\/\*!?\s*Bootstrap\s+v?\d/i.test(sample)) return true;
  const tw = sample.match(/--tw-[a-z0-9-]+/gi);
  if (tw && tw.length >= 12) return true;
  return false;
}
function contentLooksVendor(text) {
  if (!text || text.length < 20) return false;
  const sample = text.slice(0, 4e4);
  if (/\[data-sonner-toaster\]|\[data-sonner-toast\]/i.test(sample)) return true;
  if (/feedback-tool-styles|data-feedback-toolbar/i.test(sample)) return true;
  if (/styles-module__(?:toolbar|markersLayer|overlay|controlButton)/i.test(sample) && /styles-module__/i.test(sample)) {
    return true;
  }
  if (/\.react-flow__|\[data-testid=["']rf__/i.test(sample) && sample.length > 2e3) return true;
  return false;
}
function classifyByPath(href) {
  if (CDN_HOST.test(href)) {
    return { scope: "vendor", reason: "cdn" };
  }
  if (/^style:#feedback-tool/i.test(href) || /agentation/i.test(href)) {
    return { scope: "vendor", reason: "dev-chrome-style" };
  }
  if (NODE_MODULES_PATH.test(href)) {
    if (FRAMEWORK_PACKAGE.test(href) || FRAMEWORK_PATH_HINT.test(href)) {
      return { scope: "framework", reason: "node_modules-framework" };
    }
    return { scope: "vendor", reason: "node_modules" };
  }
  if (FRAMEWORK_PACKAGE.test(href) || FRAMEWORK_PATH_HINT.test(href) && !isFirstPartySourcePath(href)) {
    return { scope: "framework", reason: "path-framework" };
  }
  return null;
}
function classifyCssSheet(sheet, pageUrl) {
  const href = sheet.href;
  let pageOrigin = "";
  try {
    pageOrigin = pageUrl ? new URL(pageUrl).origin : "";
  } catch {
    pageOrigin = "";
  }
  if (href) {
    const byPath = classifyByPath(href);
    if (byPath) return { ...sheet, ...byPath };
    try {
      const u = new URL(href, pageUrl || void 0);
      const pathHit = classifyByPath(u.href) || classifyByPath(u.pathname);
      if (pathHit) return { ...sheet, ...pathHit };
      if (pageOrigin && u.origin !== pageOrigin && u.protocol.startsWith("http")) {
        if (contentLooksFramework(sheet.text)) {
          return { ...sheet, scope: "framework", reason: "cross-origin-content" };
        }
        return { ...sheet, scope: "vendor", reason: `origin:${u.origin}` };
      }
    } catch {
      const loose = classifyByPath(href);
      if (loose) return { ...sheet, ...loose };
    }
    if (isFirstPartySourcePath(href)) {
      return { ...sheet, scope: "app", reason: "src-path" };
    }
  }
  if (contentLooksVendor(sheet.text)) {
    return { ...sheet, scope: "vendor", reason: "content-vendor" };
  }
  if (contentLooksFramework(sheet.text) && !isFirstPartySourcePath(href ?? "")) {
    return { ...sheet, scope: "framework", reason: "content" };
  }
  return { ...sheet, scope: "app", reason: href ? "same-origin" : "inline" };
}
function partitionCssSheets(sheets, pageUrl) {
  const classified = sheets.map((s) => classifyCssSheet(s, pageUrl));
  const join5 = (scope) => classified.filter((s) => s.scope === scope).map((s) => s.text).filter(Boolean).join("\n");
  const app = join5("app");
  const framework = join5("framework");
  const vendor = join5("vendor");
  const total = [app, framework, vendor].join("\n");
  const bytes = {
    app: app.length,
    framework: framework.length,
    vendor: vendor.length,
    total: total.length
  };
  const sheetCounts = {
    app: classified.filter((s) => s.scope === "app").length,
    framework: classified.filter((s) => s.scope === "framework").length,
    vendor: classified.filter((s) => s.scope === "vendor").length,
    total: classified.length
  };
  const useAppOnly = app.length >= 200;
  const appPlusFramework = [app, framework].filter(Boolean).join("\n");
  const scoped = useAppOnly;
  const analysis = useAppOnly ? app : appPlusFramework.length >= 80 ? appPlusFramework : total;
  return { app, framework, vendor, analysis, scoped, sheets: classified, bytes, sheetCounts };
}

// src/main/services/tokens.ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as csstree2 from "css-tree";
var seq2 = 0;
function mk2(page, severity, title, detail, fix) {
  return {
    id: `tok${++seq2}`,
    category: "coherence",
    severity,
    title,
    detail,
    fix,
    pageUrl: page.url,
    source: "heuristic"
  };
}
function inferType(name, value) {
  const n = name.toLowerCase();
  const v = value.toLowerCase();
  if (/color|colour|bg|foreground|fill|stroke|border/.test(n) || /^(#|rgb|hsl|oklch|lab)/.test(v))
    return "color";
  if (/radius|rounded/.test(n) || /px|rem|em|%/.test(v) && /radius/.test(n)) return "borderRadius";
  if (/shadow|elevation/.test(n) || /rgba?\([^)]+\)\s+-?\d/.test(v)) return "boxShadow";
  if (/font|family|typeface/.test(n)) return "fontFamilies";
  if (/size|text|leading|line-height/.test(n) && /px|rem|em|%/.test(v)) return "fontSizes";
  if (/space|gap|pad|margin|inset/.test(n)) return "spacing";
  if (/duration|ease|timing|transition/.test(n)) return "duration";
  if (/z-?index|layer/.test(n)) return "zIndex";
  return "other";
}
function nestToken(tree, path, entry) {
  let cur = tree;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!cur[key] || typeof cur[key] !== "object") cur[key] = {};
    cur = cur[key];
  }
  cur[path[path.length - 1]] = entry;
}
function extractTokenTree(css) {
  const flat = [];
  let frameworkCount = 0;
  if (!css || css.length < 20) return { tokens: {}, flat, frameworkCount: 0 };
  try {
    const ast = csstree2.parse(css, { positions: false, parseValue: false, parseCustomProperty: true });
    csstree2.walk(ast, (node) => {
      if (node.type !== "Declaration") return;
      const prop = node.property;
      if (!prop.startsWith("--")) return;
      let value = "";
      try {
        value = csstree2.generate(node.value).trim();
      } catch {
        return;
      }
      if (!value || value.length > 200) return;
      const name = prop.slice(2);
      if (isFrameworkTokenName(name)) {
        frameworkCount++;
        return;
      }
      const type = inferType(name, value);
      flat.push({ name, value, type });
    });
  } catch {
    return { tokens: {}, flat, frameworkCount };
  }
  const byName = /* @__PURE__ */ new Map();
  for (const t of flat) byName.set(t.name, { value: t.value, type: t.type });
  const tokens = {};
  for (const [name, { value, type }] of byName) {
    const parts = name.split(/[-_]/).filter(Boolean);
    const path = parts.length ? parts : [name];
    nestToken(tokens, path, { $value: value, $type: type, value, type });
  }
  return { tokens, flat: [...byName.entries()].map(([name, v]) => ({ name, ...v })), frameworkCount };
}
function groupCounts(flat) {
  const groups = { colors: 0, spacing: 0, typography: 0, radii: 0, shadows: 0, other: 0 };
  for (const t of flat) {
    if (t.type === "color") groups.colors++;
    else if (t.type === "spacing") groups.spacing++;
    else if (t.type === "fontFamilies" || t.type === "fontSizes") groups.typography++;
    else if (t.type === "borderRadius") groups.radii++;
    else if (t.type === "boxShadow") groups.shadows++;
    else groups.other++;
  }
  return groups;
}
async function buildTokenDictionary(css, outDir, slug = "tokens") {
  const { tokens, flat, frameworkCount } = extractTokenTree(css);
  if (flat.length < 2) return null;
  const dict = {
    tokens,
    count: flat.length,
    frameworkCount,
    groups: groupCounts(flat)
  };
  try {
    await mkdir(outDir, { recursive: true });
    const tokensPath = join(outDir, `${slug}.tokens.json`);
    await writeFile(tokensPath, JSON.stringify(tokens, null, 2));
    dict.file = tokensPath;
    const StyleDictionary = (await import("style-dictionary")).default;
    const sd = new StyleDictionary({
      tokens,
      platforms: {
        css: {
          transformGroup: "css",
          buildPath: join(outDir, `${slug}-sd`) + "/",
          files: [{ destination: "variables.css", format: "css/variables" }]
        }
      }
    });
    await sd.hasInitialized;
    await sd.buildAllPlatforms();
    dict.builtCss = join(outDir, `${slug}-sd`, "variables.css");
  } catch (e4) {
    dict.buildError = e4.message.slice(0, 240);
  }
  return dict;
}
function auditTokens(page, dict, config2) {
  if (!dict) return [];
  const out = [];
  const strict = config2.brutality === "ruthless" ? 1 : config2.brutality === "harsh" ? 0.75 : 0.5;
  const g = dict.groups;
  if (dict.count >= 8 && g.colors === 0 && strict > 0.5) {
    out.push(
      mk2(
        page,
        "minor",
        `${dict.count} CSS custom properties, none look like colour tokens`,
        `Groups: spacing ${g.spacing}, type ${g.typography}, radii ${g.radii}, other ${g.other}. A design system without colour tokens is a naming convention, not a palette.`,
        "Rename colour variables to --color-* (or --bg/--fg) so the token tree is publishable."
      )
    );
  }
  if (dict.count > 120) {
    out.push(
      mk2(
        page,
        dict.count > 250 ? "major" : "minor",
        `${dict.count} design tokens extracted from authored CSS`,
        `Style Dictionary groups \u2014 colour ${g.colors}, spacing ${g.spacing}, type ${g.typography}, radii ${g.radii}, shadows ${g.shadows}, other ${g.other}.${dict.frameworkCount ? ` Skipped ${dict.frameworkCount} framework custom properties (--tw-*, etc.).` : ""}`,
        "Collapse one-offs. A publishable token set is usually under ~80 names with clear aliases."
      )
    );
  }
  if (dict.buildError) {
    out.push(
      mk2(
        page,
        "minor",
        "Style Dictionary could not build the extracted tokens",
        dict.buildError,
        "Fix invalid token values (empty, circular refs, illegal characters) so the set can emit CSS variables."
      )
    );
  } else if (dict.builtCss && dict.count >= 4) {
    if (strict > 0.9) {
      out.push(
        mk2(
          page,
          "nit",
          `Style Dictionary built ${dict.count} tokens \u2192 CSS variables`,
          `Wrote ${dict.file ?? "tokens.json"} and ${dict.builtCss}.`,
          "Nothing to fix \u2014 this is the inventory the rest of the coherence findings refer to."
        )
      );
    }
  }
  return out;
}

// src/main/services/devChrome.ts
var DEV_CHROME_ATTRS = [
  "data-feedback-toolbar",
  "data-annotation-popup",
  "data-annotation-marker",
  "data-agentation-root",
  "data-agentation-toolbar",
  "data-agentation-settings-panel"
];
var DEV_CHROME_SELECTORS = [
  ...DEV_CHROME_ATTRS.map((a) => `[${a}]`),
  '[class*="agentation" i]',
  '[id*="agentation" i]',
  "#agentation-root",
  "#vercel-live-feedback",
  "[data-vercel-toolbar]",
  "[data-nextjs-toast]",
  "[data-nextjs-dialog]",
  "[data-nextjs-dialog-overlay]",
  "nextjs-portal",
  "#react-scan-root",
  "[data-react-scan]",
  "[data-stagewise]",
  "#__stagewise_container"
].join(",");
var DEV_CHROME_EXCLUDE_LIST = DEV_CHROME_SELECTORS.split(",").map((s) => s.trim()).filter(Boolean);
var IS_DEV_CHROME_BROWSER_SOURCE = `function isDevChrome(el) {
  var cur = el;
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
    ) return true;
    var id = (cur.id || '').toLowerCase();
    if (id.indexOf('agentation') !== -1 || id === 'react-scan-root' || id === '__stagewise_container') return true;
    var cls = typeof cur.className === 'string' ? cur.className.toLowerCase() : '';
    if (cls.indexOf('agentation') !== -1 || cls.indexOf('falnor-agentation') !== -1) return true;
    if (cur.tagName && cur.tagName.toLowerCase() === 'nextjs-portal') return true;
    cur = cur.parentElement;
  }
  return false;
}`;
async function installDevChromeGuard(page) {
  try {
    await page.addInitScript(
      ({ selector, detectSrc }) => {
        const fn5 = new Function(`${detectSrc}; return isDevChrome;`)();
        window.__qualitionIsDevChrome = fn5;
        window.__qualitionDevChromeSelector = selector;
      },
      { selector: DEV_CHROME_SELECTORS, detectSrc: IS_DEV_CHROME_BROWSER_SOURCE }
    );
  } catch {
  }
  return hideDevChrome(page);
}
async function hideDevChrome(page) {
  try {
    return await page.evaluate(
      ({ selector, detectSrc }) => {
        const w = window;
        if (!w.__qualitionIsDevChrome) {
          w.__qualitionIsDevChrome = new Function(`${detectSrc}; return isDevChrome;`)();
        }
        const hide = () => {
          let n = 0;
          for (const el of Array.from(document.querySelectorAll(selector))) {
            const h = el;
            if (h.dataset.qDevChromeHidden === "1") continue;
            h.dataset.qDevChrome = "1";
            h.dataset.qDevChromeHidden = "1";
            if (!h.dataset.qDevChromePrevDisplay) h.dataset.qDevChromePrevDisplay = h.style.display || "";
            h.style.setProperty("display", "none", "important");
            h.style.setProperty("pointer-events", "none", "important");
            h.setAttribute("aria-hidden", "true");
            if ("inert" in h) h.inert = true;
            n++;
          }
          return n;
        };
        const first = hide();
        if (!w.__qualitionDevChromeWatch && typeof MutationObserver !== "undefined") {
          let scheduled = false;
          w.__qualitionDevChromeWatch = new MutationObserver(() => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
              scheduled = false;
              hide();
            });
          });
          w.__qualitionDevChromeWatch.observe(document.documentElement, {
            childList: true,
            subtree: true
          });
        }
        return first;
      },
      { selector: DEV_CHROME_SELECTORS, detectSrc: IS_DEV_CHROME_BROWSER_SOURCE }
    );
  } catch {
    return 0;
  }
}

// src/main/services/browsers.ts
import { existsSync } from "node:fs";
import { join as join2 } from "node:path";
function configurePlaywrightBrowsersPath() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return;
  const resources = process.resourcesPath;
  if (!resources) return;
  const bundled = join2(resources, "ms-playwright");
  if (existsSync(bundled)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = bundled;
  }
}

// src/main/services/componentGaps.ts
function isDetailPath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 2) return false;
  const last = parts[parts.length - 1] ?? "";
  return /^[a-z]{2,}-?\d+/i.test(last) || /^[a-z0-9_-]{16,}$/i.test(last) || /^(agt|tsk|ins|tr|xh|mn|md|td)-/i.test(last);
}

// src/main/services/brokenUi.ts
var SOFT_404_RE = /\b((?:run|task|agent|record|item|trace|page|instruction|instructions|workflow|claim)\s+not\s+found|not\s+found|no\s+[^\n.]{0,40}\s+at\s+this\s+address|does(?:\s*not|n't)\s+exist|page\s+not\s+found|could(?:\s*not|n't)\s+find|nothing\s+(here|to\s+show)|no\s+longer\s+available|unknown\s+(run|record|item|id|trace|task)|invalid\s+(run|id|link|url)|was\s+deleted|has\s+been\s+removed|no\s+(run|record|task|item|trace|agent|page)\s+(here|found|at\s+this)|can't\s+find|cannot\s+find|not\s+on\s+this\s+desk)\b/i;
function looksLikeSoft404(text) {
  return SOFT_404_RE.test(String(text || ""));
}
var RECORD_CHROME_RE = /\b(waiting on you|waiting on a person|stop this run|open workflow|open task|open review|approve|keep waiting|steps|send back|park for human|claim\s+[a-z0-9-]+)\b/i;
function isSoft404Shell(info) {
  const headingHit = looksLikeSoft404(info.h1) || looksLikeSoft404(info.title);
  if (!headingHit) return false;
  if (info.recordSignals >= 2) return false;
  if (info.chars >= 650 && info.actions >= 5) return false;
  if (info.chars >= 1100) return false;
  return true;
}
function countRecordSignals(text) {
  const t = String(text || "");
  if (!t) return 0;
  const re = new RegExp(RECORD_CHROME_RE.source, "gi");
  let n = 0;
  while (re.exec(t)) n++;
  return n;
}
var counter = 0;
function mk3(page, category, severity, title, detail, fix, extra = {}) {
  return {
    id: `brk${++counter}`,
    category,
    severity,
    title,
    detail,
    fix,
    pageUrl: page.url,
    source: "heuristic",
    ...extra
  };
}
function brokenUiFromSignals(page) {
  const raw = page.signals?.brokenUi;
  return raw ?? null;
}
function pathnameOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
function auditBrokenUi(page) {
  const out = [];
  const broken = brokenUiFromSignals(page);
  if (!broken) {
    const h1 = page.sections.flatMap((s) => s.headings).join(" \xB7 ");
    const sample = page.sections.map((s) => s.textPreview).join(" ").slice(0, 500);
    const info = {
      h1,
      title: page.title || "",
      sample,
      chars: sample.length,
      actions: page.controls?.length ?? 0,
      recordSignals: countRecordSignals(`${h1} ${sample}`)
    };
    if (isSoft404Shell(info)) {
      const detail = isDetailPath(pathnameOf(page.url));
      out.push(
        mk3(
          page,
          "flow",
          detail ? "critical" : "major",
          detail ? "Detail route renders a not-found / missing-record state" : "Page reads as not-found",
          `Heading/title matches a soft-404 pattern while HTTP still succeeded${detail ? " on an ID/detail URL" : ""}.`,
          "Fix the link, seed, or loader that produced this URL \u2014 or return a real HTTP 404. A green empty-state shell is still a broken journey.",
          { effort: "component", confidence: "high" }
        )
      );
    }
    return out;
  }
  if (broken.soft404) {
    const detail = isDetailPath(pathnameOf(page.url));
    out.push(
      mk3(
        page,
        "flow",
        detail ? "critical" : "major",
        detail ? "Detail route renders a not-found / missing-record state" : "Page reads as not-found",
        `${broken.soft404Evidence ? `Evidence: \u201C${broken.soft404Evidence.slice(0, 120)}\u201D. ` : ""}Main content is a missing-record shell (${broken.mainContentChars} chars) \u2014 the crawl got HTTP 200, so this would otherwise look \u201Cfine\u201D.`,
        "Fix routing, data seeding, or stale links that open dead IDs. Prefer a hard 404 or a recovery path that restores a real record \u2014 not a quiet empty card inside the app chrome.",
        { effort: "component", confidence: "high" }
      )
    );
  }
  if (broken.clippedTextNodes >= 3) {
    out.push(
      mk3(
        page,
        "craft",
        broken.clippedTextNodes >= 8 ? "critical" : "major",
        `${broken.clippedTextNodes} text node(s) clipped or overflowing their boxes`,
        "Labels, timestamps, or step names are cut off (scrollWidth/Height exceeds the box). Users cannot read the UI \u2014 this is broken layout, not a polish nit.",
        "Widen the column, allow wrap, or drop lower-priority columns. Never truncate operational labels without a tooltip that shows the full value.",
        { effort: "component", confidence: "high" }
      )
    );
  }
  if (broken.overlappingTextPairs >= 2) {
    out.push(
      mk3(
        page,
        "craft",
        broken.overlappingTextPairs >= 6 ? "critical" : "major",
        `${broken.overlappingTextPairs} overlapping text pairs`,
        "Text nodes physically collide \u2014 timelines, axis labels, and dense headers often stack on top of each other.",
        "Give each label its own row or lane; stop absolute-stacking timestamps into a width that cannot fit them.",
        { effort: "component", confidence: "high" }
      )
    );
  }
  return out;
}

// src/shared/url.ts
var LOCAL_HOSTS = /* @__PURE__ */ new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]", "host.docker.internal"]);
function isLocalHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (LOCAL_HOSTS.has(h)) return true;
  if (h.endsWith(".local") || h.endsWith(".localhost")) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (h === "::ffff:127.0.0.1" || h.startsWith("::ffff:10.") || h.startsWith("::ffff:192.168.")) return true;
  if (h.startsWith("fd") || h.startsWith("fc")) return true;
  if (h === "metadata.google.internal" || h.endsWith(".internal")) return true;
  return false;
}
function isMetadataHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "169.254.169.254" || h === "metadata.google.internal" || h === "instance-data" || /^169\.254\./.test(h);
}
function normalizeTargetUrl(input) {
  const raw = input.trim();
  if (!raw || raw === "https://" || raw === "http://") return null;
  let candidate = raw;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    const hostPart = candidate.split(/[/?#]/)[0];
    const host2 = hostPart.split(":")[0];
    candidate = `${isLocalHost(host2) ? "http" : "https"}://${candidate}`;
  }
  let url;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  const host = url.hostname.toLowerCase();
  const looksRoutable = isLocalHost(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[") || host.includes(".") || // single-label intranet hostnames (e.g. "staging") are legitimate too
  /^[a-z0-9][a-z0-9-]*$/.test(host);
  return looksRoutable ? url.toString() : null;
}
function schemeFallback(url) {
  try {
    const u = new URL(url);
    if (!isLocalHost(u.hostname)) return null;
    u.protocol = u.protocol === "https:" ? "http:" : "https:";
    return u.toString();
  } catch {
    return null;
  }
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function isIgnoredPage(url, patterns) {
  if (!patterns?.length) return false;
  let path;
  let hrefNoHash;
  try {
    const u = new URL(decodeURIComponent(url));
    path = decodeURIComponent(u.pathname).replace(/\/+$/, "") || "/";
    hrefNoHash = `${u.origin}${path}${u.search}`;
  } catch {
    try {
      path = decodeURIComponent(url);
    } catch {
      path = url;
    }
    hrefNoHash = path;
  }
  for (const raw of patterns) {
    const p4 = raw.trim();
    if (!p4) continue;
    if (/^https?:\/\//i.test(p4)) {
      try {
        const want = new URL(p4);
        const wantPath = want.pathname.replace(/\/+$/, "") || "/";
        const wantBase = `${want.origin}${wantPath}`;
        if (hrefNoHash === wantBase || hrefNoHash.startsWith(wantBase + "/") || hrefNoHash.startsWith(wantBase + "?")) {
          return true;
        }
      } catch {
        if (hrefNoHash.startsWith(p4.replace(/\/$/, ""))) return true;
      }
      continue;
    }
    let pat = p4.startsWith("/") ? p4 : `/${p4}`;
    pat = pat.replace(/\/+$/, "") || "/";
    if (pat.includes("*")) {
      const re = new RegExp(`^${pat.split("*").map(escapeRegex).join(".*")}(?:/)?(?:\\?.*)?$`, "i");
      if (re.test(path) || re.test(`${path}/`)) return true;
      continue;
    }
    if (path === pat || path.startsWith(`${pat}/`)) return true;
  }
  return false;
}

// src/main/services/crawler.ts
function sanitizeSelector(selector) {
  const hashed = (c2) => /^(css-|sc-|jsx-|emotion-|svelte-|_)/.test(c2) || /__[A-Za-z0-9][A-Za-z0-9_-]{3,}$/.test(c2) || /^[a-z]{1,2}[0-9a-z]{6,}$/.test(c2) || /^[a-f0-9]{6,}$/i.test(c2);
  const cleaned = selector.split(/\s*>\s*/).map((step) => step.replace(/\.(-?[A-Za-z_][\w-]*)/g, (match, cls) => hashed(cls) ? "" : match)).map((step) => step.trim()).map((step) => step.startsWith(":") ? step.replace(/^(:[\w-]+(\([^)]*\))?)+/, "").trim() : step).filter(Boolean).join(" > ");
  return /[#.\[]/.test(cleaned) ? cleaned : `${cleaned || selector} (no stable selector \u2014 generated class names only)`;
}
async function withRetry(label, attempts, fn5, onLog) {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn5();
    } catch (e4) {
      lastError = e4;
      onLog?.(`${label} attempt ${i}/${attempts} failed: ${e4.message.slice(0, 160)}`);
      if (i < attempts) await new Promise((r) => setTimeout(r, 800 * i));
    }
  }
  throw lastError;
}
var DEFAULT_VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, isMobile: false },
  { name: "tablet", width: 834, height: 1112, isMobile: false },
  { name: "mobile", width: 390, height: 844, isMobile: true }
];
async function launch() {
  configurePlaywrightBrowsersPath();
  const timeoutMs = 3e4;
  const launchWithTimeout = async () => {
    return chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"], timeout: timeoutMs });
  };
  try {
    return await launchWithTimeout();
  } catch (e4) {
    await new Promise((r) => setTimeout(r, 1e3));
    return launchWithTimeout();
  }
}
function sameOrigin(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}
var JUNK_PARAMS = /^(utm_|ref$|referrer$|fbclid$|gclid$|msclkid$|mc_[ce]id$|_ga|igshid$|source$|preset$|variant$|v$|t$|ts$|cache|hash)/i;
function normalize(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (JUNK_PARAMS.test(key)) u.searchParams.delete(key);
    }
    u.search = u.searchParams.toString() ? `?${u.searchParams.toString()}` : "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}
function pageIdentity(url) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}
async function capturePage(browser, rawUrl, opts) {
  if (/^\s*file:/i.test(rawUrl)) throw new Error(`file: URLs are not allowed: ${rawUrl.slice(0, 120)}`);
  try {
    const u = new URL(rawUrl.startsWith("http") ? rawUrl : normalizeTargetUrl(rawUrl) ?? rawUrl);
    if (isMetadataHost(u.hostname)) throw new Error(`Blocked metadata host: ${u.hostname}`);
  } catch {
  }
  let url = normalizeTargetUrl(rawUrl) ?? rawUrl;
  if (/^\s*file:/i.test(url)) throw new Error(`file: URLs are not allowed: ${url.slice(0, 120)}`);
  const consoleErrors = [];
  const networkFailures = [];
  const screenshots = {};
  const responsive = [];
  const slug = url.replace(/https?:\/\//, "").replace(/[^a-z0-9]/gi, "_").slice(0, 60);
  let extracted = null;
  let axe = [];
  let cssStats = null;
  let tokenDictionary = null;
  let status = 0;
  let ok = true;
  let errorText;
  let sections = [];
  const toolFailures = [];
  let hiddenChromeTotal = 0;
  for (const vp of opts.viewports) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile,
      deviceScaleFactor: 1,
      // axe + extraction are injected scripts; strict CSP sites would block them
      bypassCSP: true,
      ...opts.storageState ? { storageState: opts.storageState } : {},
      userAgent: vp.isMobile ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" : void 0
    });
    const page = await ctx.newPage();
    await page.addInitScript(observerInit);
    await installDevChromeGuard(page).catch(() => {
    });
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const text = m.text().slice(0, 300);
      if (isNoisyConsole(text)) return;
      consoleErrors.push(`[${vp.name}] ${text}`);
    });
    page.on("pageerror", (e4) => {
      const text = e4.message.slice(0, 300);
      if (isNoisyConsole(text)) return;
      consoleErrors.push(`[${vp.name}] pageerror: ${text}`);
    });
    page.on("requestfailed", (r) => {
      const u = r.url();
      if (isNoisyNetworkUrl(u)) return;
      networkFailures.push({ url: u.slice(0, 200), status: r.failure()?.errorText ?? "failed" });
    });
    page.on("response", (r) => {
      if (r.status() < 400) return;
      const u = r.url();
      if (isNoisyNetworkUrl(u)) return;
      if (r.status() === 404 && isBenign404(u)) return;
      networkFailures.push({ url: u.slice(0, 200), status: r.status() });
    });
    try {
      const res = await withRetry(
        `goto ${url} (${vp.name})`,
        2,
        async () => {
          try {
            return await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45e3 });
          } catch (e4) {
            const alt = schemeFallback(url);
            if (!alt) throw e4;
            opts.onLog?.(`retrying ${url} as ${alt}`);
            const r = await page.goto(alt, { waitUntil: "domcontentloaded", timeout: 45e3 });
            url = alt;
            return r;
          }
        },
        opts.onLog
      );
      if (vp.name === opts.viewports[0].name) status = res?.status() ?? 0;
      await page.waitForTimeout(1200);
      try {
        await page.waitForLoadState("networkidle", { timeout: 8e3 });
      } catch {
      }
      await waitForCaptureReady(page);
      await scrollAppShells(page);
      await page.waitForTimeout(400);
      const hiddenChrome = await hideDevChrome(page);
      if (hiddenChrome > 0) {
        hiddenChromeTotal += hiddenChrome;
        opts.onLog?.(`hid ${hiddenChrome} dev-chrome node(s) (Agentation etc.) on ${url}`);
      }
      const shot = join3(opts.outDir, `${slug}-${vp.name}.png`);
      try {
        await withRetry(`screenshot ${url} (${vp.name})`, 2, () => page.screenshot({ path: shot, fullPage: true, animations: "disabled", timeout: 15e3 }), opts.onLog);
      } catch (e4) {
        opts.onLog?.(`screenshot failed ${url} (${vp.name}): ${e4.message.slice(0, 120)}`);
        toolFailures.push({ tool: "screenshot", message: e4.message.slice(0, 200) });
      }
      try {
        const { existsSync: _es } = await import("node:fs");
        if (_es(shot)) screenshots[vp.name] = shot;
      } catch {
      }
      const isPrimary = vp.name === opts.viewports[0].name;
      if (!isPrimary) {
        const light = await page.evaluate(responsiveOnlyFn);
        responsive.push({
          viewport: vp.name,
          horizontalOverflowPx: light.horizontalOverflowPx,
          tinyTextCount: light.tinyTextCount,
          smallTapTargets: light.smallTapTargets,
          overlaps: light.overlaps
        });
      } else {
        const data = await page.evaluate(extractFn);
        responsive.push({
          viewport: vp.name,
          horizontalOverflowPx: data.responsive.horizontalOverflowPx,
          tinyTextCount: data.responsive.tinyTextCount,
          smallTapTargets: data.responsive.smallTapTargets,
          overlaps: data.responsive.overlaps
        });
        extracted = data;
        sections = data.sections;
        for (const s of sections.slice(0, 14)) {
          try {
            const el = page.locator(s.selector).first();
            const file = join3(opts.outDir, `${slug}-${s.id}.png`);
            await el.screenshot({ path: file, timeout: 6e3 });
            s.screenshot = file;
          } catch {
          }
        }
        try {
          const sheetInputs = Array.isArray(data.css?.sheets) ? data.css.sheets.map((s) => ({
            href: s.href ?? null,
            text: s.text ?? ""
          })) : data.css?.text ? [{ href: null, text: String(data.css.text) }] : [];
          let missedExternals = 0;
          const externalList = data.css?.external ?? [];
          const fetched = await Promise.all(
            externalList.map(async (href) => {
              try {
                const u = new URL(href);
                if (u.protocol !== "http:" && u.protocol !== "https:") return { href, ok: false };
                if (isMetadataHost(u.hostname)) return { href, ok: false };
                const res2 = await ctx.request.get(href, { timeout: 8e3 });
                const text = res2.ok() ? await res2.text() : "";
                if (!res2.ok()) return { href, ok: false };
                if (text.length > 2e6) return { href, text: text.slice(0, 2e6), ok: true };
                return { href, text, ok: true };
              } catch {
                return { href, ok: false };
              }
            })
          );
          for (const f3 of fetched) {
            if (f3.ok) sheetInputs.push({ href: f3.href, text: f3.text });
            else missedExternals++;
          }
          if (data.css?.missedExternalCap) missedExternals += Math.max(0, (data.css?.external?.length ?? 0) === 30 ? 1 : 0);
          const partition = partitionCssSheets(sheetInputs, url);
          cssStats = analyzeCss(partition.analysis, partition.scoped ? partition.sheetCounts.app : partition.sheetCounts.total, {
            attribution: {
              scoped: partition.scoped,
              appBytes: partition.bytes.app,
              frameworkBytes: partition.bytes.framework,
              vendorBytes: partition.bytes.vendor,
              totalBytes: partition.bytes.total,
              appSheets: partition.sheetCounts.app,
              frameworkSheets: partition.sheetCounts.framework,
              vendorSheets: partition.sheetCounts.vendor,
              missedExternals,
              truncated: !!data.css?.truncated,
              styleAttrCount: Number(data.css?.styleAttrCount ?? 0),
              adoptedSheetCount: Number(data.css?.adoptedSheetCount ?? 0)
            }
          });
          try {
            const slugTok = slug.replace(/_+/g, "-").slice(0, 40) || "page";
            tokenDictionary = await buildTokenDictionary(
              partition.scoped ? partition.app : partition.analysis,
              opts.outDir,
              slugTok
            );
          } catch (e4) {
            opts.onLog?.(`token extract failed on ${url}: ${e4.message}`);
          }
        } catch (e4) {
          opts.onLog?.(`css analysis failed on ${url}: ${e4.message}`);
        }
        try {
          await hideDevChrome(page);
          let axeResult = null;
          try {
            axeResult = await withRetry(
              `axe ${url}`,
              2,
              async () => {
                let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa", "best-practice"]);
                for (const sel of DEV_CHROME_EXCLUDE_LIST) {
                  try {
                    builder = builder.exclude(sel);
                  } catch {
                  }
                }
                return await builder.analyze();
              },
              opts.onLog
            );
          } catch (e4) {
            throw e4;
          }
          const result = axeResult;
          axe = (result?.violations ?? []).map((v) => {
            const vv = v;
            return {
              id: vv.id,
              impact: vv.impact ?? null,
              help: vv.help,
              helpUrl: vv.helpUrl,
              nodes: (vv.nodes ?? []).slice(0, 5).map((n) => ({
                target: (n.target ?? []).map((t) => sanitizeSelector(String(t))),
                failureSummary: (n.failureSummary ?? "").slice(0, 400)
              }))
            };
          });
        } catch (e4) {
          const msg = e4.message.slice(0, 200);
          opts.onLog?.(`axe failed on ${url}: ${msg}`);
          toolFailures.push({ tool: "axe", message: msg });
        }
      }
    } catch (e4) {
      ok = false;
      errorText = e4.message;
      opts.onLog?.(`capture failed (${vp.name}) ${url}: ${errorText}`);
      toolFailures.push({ tool: `capture:${vp.name}`, message: e4.message.slice(0, 200) });
    } finally {
      await ctx.close().catch(() => {
      });
    }
  }
  const perf = extracted?.perf ?? {};
  const build = extracted?.buildContext ?? {
    buildMode: "unknown",
    isLocalTarget: false,
    buildHints: []
  };
  return {
    url,
    title: extracted?.title ?? "",
    ok,
    status,
    errorText,
    screenshots,
    sections,
    tokens: extracted?.tokens ?? {
      colors: [],
      fontFamilies: [],
      fontSizes: [],
      fontWeights: [],
      radii: [],
      shadows: [],
      spacing: [],
      transitions: []
    },
    axe,
    cssStats,
    tokenDictionary,
    metrics: {
      ttfbMs: perf.ttfbMs ?? 0,
      domContentLoadedMs: perf.domContentLoadedMs ?? 0,
      loadMs: perf.loadMs ?? 0,
      lcpMs: perf.lcpMs ?? null,
      cls: perf.cls ?? null,
      transferBytes: perf.transferBytes ?? 0,
      requestCount: perf.requestCount ?? 0,
      longTaskMs: perf.longTaskMs ?? 0
    },
    consoleErrors: [...new Set(consoleErrors)].slice(0, 40),
    networkFailures: dedupeNetwork(networkFailures).slice(0, 40),
    toolFailures: toolFailures.length ? toolFailures : void 0,
    controls: extracted?.controls ?? [],
    captureContext: {
      buildMode: build.buildMode,
      isLocalTarget: !!build.isLocalTarget,
      hiddenDevChromeNodes: hiddenChromeTotal,
      buildHints: build.buildHints ?? [],
      excludedDevChromeControls: Number(extracted?.signals?.excludedDevChromeControls ?? 0) || void 0
    },
    signals: extracted?.signals ?? {},
    responsive,
    links: extracted?.links ?? []
  };
}
function isNoisyConsole(text) {
  return /Download the React DevTools/i.test(text) || /\[HMR\]|\[vite\]|Fast Refresh|webpackHotUpdate/i.test(text) || /third-party cookie|Deprecated.*Synchronous XMLHttpRequest/i.test(text) || /Failed to load resource:.*favicon/i.test(text) || /net::ERR_BLOCKED_BY_CLIENT|ERR_FAILED.*chrome-extension/i.test(text) || /Agentation|react-scan|stagingwise/i.test(text);
}
function isNoisyNetworkUrl(u) {
  return /chrome-extension:|moz-extension:/i.test(u) || /\/favicon\.ico(\?|$)/i.test(u) || /hot-update|__vite|@react-refresh|sockjs-node|webpack-hmr/i.test(u) || /googletagmanager|google-analytics|doubleclick|facebook\.net\/tr/i.test(u);
}
function isBenign404(u) {
  return /\.(map|ico|woff2?|ttf|eot)(\?|$)/i.test(u) || /\/favicon/i.test(u) || /apple-touch-icon/i.test(u);
}
function dedupeNetwork(rows) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const r of rows) {
    const key = `${r.status}|${r.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
async function scrollAppShells(page) {
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const panes = Array.from(document.querySelectorAll("main, [role=main], [class*=layout-content], [class*=scroll]")).concat(Array.from(document.querySelectorAll("*"))).filter((el, i, arr) => arr.indexOf(el) === i).filter((el) => {
      const s = getComputedStyle(el);
      const oy = s.overflowY;
      return (oy === "auto" || oy === "scroll" || oy === "overlay") && el.scrollHeight > el.clientHeight + 48;
    }).slice(0, 6);
    for (const el of panes) {
      const top = el.scrollTop;
      el.scrollTop = el.scrollHeight;
      await sleep(280);
      el.scrollTop = 0;
      await sleep(120);
      el.scrollTop = top;
    }
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(400);
    window.scrollTo(0, 0);
  });
}
function isDeeperRoute(parent, candidate) {
  try {
    const p4 = new URL(parent);
    const c2 = new URL(candidate);
    if (p4.origin !== c2.origin) return false;
    const pp = p4.pathname.replace(/\/$/, "") || "/";
    const cp = c2.pathname.replace(/\/$/, "") || "/";
    if (cp === pp) return false;
    return cp.startsWith(pp === "/" ? "/" : pp + "/");
  } catch {
    return false;
  }
}
async function probeInnerRoutes(browser, listUrl, opts) {
  const max2 = opts.max ?? 2;
  const vp = opts.viewport ?? DEFAULT_VIEWPORTS[0];
  const found = [];
  const skipTexts = [];
  let ctx;
  let page;
  try {
    ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      bypassCSP: true,
      ...opts.storageState ? { storageState: opts.storageState } : {}
    });
    page = await ctx.newPage();
    await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 45e3 });
    await page.waitForTimeout(2500);
    await scrollAppShells(page);
    await page.waitForTimeout(400);
    for (let attempt = 0; attempt < max2 * 4 && found.length < max2; attempt++) {
      if (opts.shouldStop?.()) break;
      const before = page.url();
      const pt = await page.evaluate((skipped) => {
        const mains = Array.from(
          document.querySelectorAll("main, [role=main], [class*=layout-content]")
        ).filter((el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 280 && r.height > 180 && s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0.5;
        });
        const main = mains.sort(
          (a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height
        )[0];
        if (!main) return null;
        for (const el of Array.from(main.querySelectorAll("div, article, li, button, a, [role=button], [role=row]"))) {
          if (el.closest("nav, aside, header, [role=navigation], [role=banner]")) continue;
          const r = el.getBoundingClientRect();
          const t = (el.textContent ?? "").trim().replace(/\s+/g, " ");
          if (r.width < 160 || r.height < 48 || r.height > 200) continue;
          if (r.top < 72 || r.top > window.innerHeight - 40) continue;
          if (t.length < 18 || t.length > 420) continue;
          if (skipped.some((s) => t.includes(s) || s.includes(t.slice(0, 40)))) continue;
          if (/^(all\b|needs you|working|done|failed|start work|search|filter|create|new |show all|sign in)/i.test(
            t
          ))
            continue;
          return { x: r.x + Math.min(r.width / 2, 120), y: r.y + Math.min(24, r.height / 3), t: t.slice(0, 80) };
        }
        return null;
      }, skipTexts);
      if (!pt) break;
      skipTexts.push(pt.t.slice(0, 48));
      await page.mouse.click(pt.x, pt.y);
      await page.waitForTimeout(900);
      const after = normalize(page.url());
      if (after !== normalize(before) && isDeeperRoute(listUrl, after)) {
        if (!found.includes(after)) {
          found.push(after);
          opts.onLog?.(`discovered inner route ${after} from ${listUrl}`);
        }
        await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 3e4 });
        await page.waitForTimeout(1200);
        await scrollAppShells(page);
      }
    }
  } catch (e4) {
    opts.onLog?.(`inner-route probe failed on ${listUrl}: ${e4.message.slice(0, 160)}`);
  } finally {
    try {
      await page?.close().catch(() => {
      });
    } catch {
    }
    await ctx?.close().catch(() => {
    });
  }
  return [...new Set(found)];
}
async function crawl(browser, rawStartUrl, maxPages, opts) {
  const startUrl = normalizeTargetUrl(rawStartUrl) ?? rawStartUrl;
  const first = normalize(startUrl);
  const queue = [first];
  const visited = /* @__PURE__ */ new Set();
  const seenPaths = /* @__PURE__ */ new Set();
  const pages = [];
  const unlimited = !maxPages || maxPages <= 0;
  const pageLimit = unlimited ? Number.POSITIVE_INFINITY : maxPages;
  const deadline = opts.budgetMs ? Date.now() + opts.budgetMs : Number.POSITIVE_INFINITY;
  const INNER_BUDGET = Math.min(16, unlimited ? 16 : Math.max(4, Math.floor(pageLimit / 2)));
  let innersFound = 0;
  if (unlimited) opts.onLog?.("crawling every reachable same-origin route (no page limit)");
  const ignore = opts.ignorePages?.filter(Boolean) ?? [];
  if (ignore.length) opts.onLog?.(`ignoring ${ignore.length} page pattern(s): ${ignore.join(", ")}`);
  while (queue.length && pages.length < pageLimit) {
    if (Date.now() > deadline) {
      opts.onLog?.(`crawl time budget reached after ${pages.length} page(s); ${queue.length} route(s) left unvisited`);
      break;
    }
    if (opts.shouldStop?.()) {
      opts.onLog?.(`crawl stopped after ${pages.length} page(s)`);
      break;
    }
    const url = queue.shift();
    const identity2 = pageIdentity(url);
    if (visited.has(url) || seenPaths.has(identity2)) continue;
    visited.add(url);
    seenPaths.add(identity2);
    if (url !== first && ignore.length && isIgnoredPage(url, ignore)) {
      opts.onLog?.(`skipping ignored page ${url}`);
      continue;
    }
    opts.onLog?.(`capturing ${url}`);
    const page = await capturePage(browser, url, opts);
    pages.push(page);
    opts.onPage?.(page);
    if (innersFound < INNER_BUDGET && depth(url) <= 1 && page.ok && !opts.shouldStop?.()) {
      const room = Math.min(2, INNER_BUDGET - innersFound);
      const desktop = (opts.viewports.length ? opts.viewports : DEFAULT_VIEWPORTS).find((v) => !v.isMobile) ?? DEFAULT_VIEWPORTS[0];
      try {
        const inner = await probeInnerRoutes(browser, page.url, {
          storageState: opts.storageState,
          onLog: opts.onLog,
          max: room,
          viewport: desktop,
          shouldStop: opts.shouldStop
        });
        innersFound += inner.length;
        page.links = [.../* @__PURE__ */ new Set([...page.links ?? [], ...inner])];
      } catch (e4) {
        opts.onLog?.(`inner discovery skipped: ${e4.message.slice(0, 120)}`);
      }
    }
    const candidates = page.links.map(normalize).filter((l) => sameOrigin(l, startUrl)).filter((l) => !visited.has(l) && !seenPaths.has(pageIdentity(l))).filter((l) => !/\.(pdf|zip|png|jpe?g|svg|webp|gif|mp4|dmg|exe|css|js|xml|txt|rss)$/i.test(l)).filter((l) => !/\/(cdn-cgi|api|_next|static|assets)\//i.test(l)).filter((l) => !(ignore.length && isIgnoredPage(l, ignore)));
    const byPath = /* @__PURE__ */ new Map();
    for (const l of candidates) {
      const id = pageIdentity(l);
      const existing = byPath.get(id);
      if (!existing || existing.includes("?") && !l.includes("?")) byPath.set(id, l);
    }
    const queuedPaths = new Set(queue.map(pageIdentity));
    const ranked = [...byPath.values()].filter((l) => !queuedPaths.has(pageIdentity(l))).sort(
      (a, b) => score(b) - score(a) || (isDeeperRoute(url, b) ? 1 : 0) - (isDeeperRoute(url, a) ? 1 : 0) || depth(a) - depth(b) || a.length - b.length
    );
    for (const l of ranked) {
      queue.push(l);
      queuedPaths.add(pageIdentity(l));
    }
  }
  if (queue.length === 0) {
    opts.onLog?.(
      `crawl exhausted the site: ${pages.length} distinct route(s) captured, no further same-origin links found`
    );
  } else if (innersFound > 0) {
    opts.onLog?.(`crawl finished with ${innersFound} inner route(s) discovered via card clicks`);
  }
  return pages;
}
function depth(u) {
  try {
    return new URL(u).pathname.split("/").filter(Boolean).length;
  } catch {
    return 9;
  }
}
function score(u) {
  if (/\/(privacy|terms|legal|cookie|imprint|dpa|sitemap)/i.test(u)) return -2;
  if (/\/(blog|news|press|changelog|careers|jobs)\/.+/i.test(u)) return -1;
  if (/(pricing|signup|sign-up|register|login|sign-in|checkout|cart|account|dashboard|settings)/i.test(u)) return 3;
  if (/(product|features|solutions|platform|use-cases|integrations|templates|components|blocks)/i.test(u)) return 2;
  if (/(docs|documentation|guide|about|contact|support)/i.test(u)) return 1;
  return 0;
}
async function waitForCaptureReady(page, timeoutMs = 1e4) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const main = document.querySelector("main, [role=main]") || document.body;
      const text = (main.innerText || main.textContent || "").replace(/\s+/g, " ").trim();
      const skeletons = main.querySelectorAll(
        "[class*=skeleton i], [class*=Skeleton], .animate-pulse, [aria-busy=true], [data-loading]"
      ).length;
      const head = text.slice(0, 280);
      const connecting = /\b(connecting|still loading|please wait)\b/i.test(head);
      return { skeletons, connecting, textLen: text.length };
    }).catch(() => ({ skeletons: 0, connecting: false, textLen: 0 }));
    if (!state.connecting && state.skeletons <= 3) return;
    if (!state.connecting && state.textLen > 400 && state.skeletons <= 8) return;
    await page.waitForTimeout(300);
  }
}

// node_modules/culori/src/rgb/parseNumber.js
var parseNumber = (color, len) => {
  if (typeof color !== "number") return;
  if (len === 3) {
    return {
      mode: "rgb",
      r: (color >> 8 & 15 | color >> 4 & 240) / 255,
      g: (color >> 4 & 15 | color & 240) / 255,
      b: (color & 15 | color << 4 & 240) / 255
    };
  }
  if (len === 4) {
    return {
      mode: "rgb",
      r: (color >> 12 & 15 | color >> 8 & 240) / 255,
      g: (color >> 8 & 15 | color >> 4 & 240) / 255,
      b: (color >> 4 & 15 | color & 240) / 255,
      alpha: (color & 15 | color << 4 & 240) / 255
    };
  }
  if (len === 6) {
    return {
      mode: "rgb",
      r: (color >> 16 & 255) / 255,
      g: (color >> 8 & 255) / 255,
      b: (color & 255) / 255
    };
  }
  if (len === 8) {
    return {
      mode: "rgb",
      r: (color >> 24 & 255) / 255,
      g: (color >> 16 & 255) / 255,
      b: (color >> 8 & 255) / 255,
      alpha: (color & 255) / 255
    };
  }
};
var parseNumber_default = parseNumber;

// node_modules/culori/src/colors/named.js
var named = {
  aliceblue: 15792383,
  antiquewhite: 16444375,
  aqua: 65535,
  aquamarine: 8388564,
  azure: 15794175,
  beige: 16119260,
  bisque: 16770244,
  black: 0,
  blanchedalmond: 16772045,
  blue: 255,
  blueviolet: 9055202,
  brown: 10824234,
  burlywood: 14596231,
  cadetblue: 6266528,
  chartreuse: 8388352,
  chocolate: 13789470,
  coral: 16744272,
  cornflowerblue: 6591981,
  cornsilk: 16775388,
  crimson: 14423100,
  cyan: 65535,
  darkblue: 139,
  darkcyan: 35723,
  darkgoldenrod: 12092939,
  darkgray: 11119017,
  darkgreen: 25600,
  darkgrey: 11119017,
  darkkhaki: 12433259,
  darkmagenta: 9109643,
  darkolivegreen: 5597999,
  darkorange: 16747520,
  darkorchid: 10040012,
  darkred: 9109504,
  darksalmon: 15308410,
  darkseagreen: 9419919,
  darkslateblue: 4734347,
  darkslategray: 3100495,
  darkslategrey: 3100495,
  darkturquoise: 52945,
  darkviolet: 9699539,
  deeppink: 16716947,
  deepskyblue: 49151,
  dimgray: 6908265,
  dimgrey: 6908265,
  dodgerblue: 2003199,
  firebrick: 11674146,
  floralwhite: 16775920,
  forestgreen: 2263842,
  fuchsia: 16711935,
  gainsboro: 14474460,
  ghostwhite: 16316671,
  gold: 16766720,
  goldenrod: 14329120,
  gray: 8421504,
  green: 32768,
  greenyellow: 11403055,
  grey: 8421504,
  honeydew: 15794160,
  hotpink: 16738740,
  indianred: 13458524,
  indigo: 4915330,
  ivory: 16777200,
  khaki: 15787660,
  lavender: 15132410,
  lavenderblush: 16773365,
  lawngreen: 8190976,
  lemonchiffon: 16775885,
  lightblue: 11393254,
  lightcoral: 15761536,
  lightcyan: 14745599,
  lightgoldenrodyellow: 16448210,
  lightgray: 13882323,
  lightgreen: 9498256,
  lightgrey: 13882323,
  lightpink: 16758465,
  lightsalmon: 16752762,
  lightseagreen: 2142890,
  lightskyblue: 8900346,
  lightslategray: 7833753,
  lightslategrey: 7833753,
  lightsteelblue: 11584734,
  lightyellow: 16777184,
  lime: 65280,
  limegreen: 3329330,
  linen: 16445670,
  magenta: 16711935,
  maroon: 8388608,
  mediumaquamarine: 6737322,
  mediumblue: 205,
  mediumorchid: 12211667,
  mediumpurple: 9662683,
  mediumseagreen: 3978097,
  mediumslateblue: 8087790,
  mediumspringgreen: 64154,
  mediumturquoise: 4772300,
  mediumvioletred: 13047173,
  midnightblue: 1644912,
  mintcream: 16121850,
  mistyrose: 16770273,
  moccasin: 16770229,
  navajowhite: 16768685,
  navy: 128,
  oldlace: 16643558,
  olive: 8421376,
  olivedrab: 7048739,
  orange: 16753920,
  orangered: 16729344,
  orchid: 14315734,
  palegoldenrod: 15657130,
  palegreen: 10025880,
  paleturquoise: 11529966,
  palevioletred: 14381203,
  papayawhip: 16773077,
  peachpuff: 16767673,
  peru: 13468991,
  pink: 16761035,
  plum: 14524637,
  powderblue: 11591910,
  purple: 8388736,
  // Added in CSS Colors Level 4:
  // https://drafts.csswg.org/css-color/#changes-from-3
  rebeccapurple: 6697881,
  red: 16711680,
  rosybrown: 12357519,
  royalblue: 4286945,
  saddlebrown: 9127187,
  salmon: 16416882,
  sandybrown: 16032864,
  seagreen: 3050327,
  seashell: 16774638,
  sienna: 10506797,
  silver: 12632256,
  skyblue: 8900331,
  slateblue: 6970061,
  slategray: 7372944,
  slategrey: 7372944,
  snow: 16775930,
  springgreen: 65407,
  steelblue: 4620980,
  tan: 13808780,
  teal: 32896,
  thistle: 14204888,
  tomato: 16737095,
  turquoise: 4251856,
  violet: 15631086,
  wheat: 16113331,
  white: 16777215,
  whitesmoke: 16119285,
  yellow: 16776960,
  yellowgreen: 10145074
};
var named_default = named;

// node_modules/culori/src/rgb/parseNamed.js
var parseNamed = (color) => {
  return parseNumber_default(named_default[color.toLowerCase()], 6);
};
var parseNamed_default = parseNamed;

// node_modules/culori/src/rgb/parseHex.js
var hex = /^#?([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})$/i;
var parseHex = (color) => {
  let match;
  return (match = color.match(hex)) ? parseNumber_default(parseInt(match[1], 16), match[1].length) : void 0;
};
var parseHex_default = parseHex;

// node_modules/culori/src/util/regex.js
var num2 = "([+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?)";
var num_none = `(?:${num2}|none)`;
var per = `${num2}%`;
var per_none = `(?:${num2}%|none)`;
var num_per = `(?:${num2}%|${num2})`;
var num_per_none = `(?:${num2}%|${num2}|none)`;
var hue = `(?:${num2}(deg|grad|rad|turn)|${num2})`;
var hue_none = `(?:${num2}(deg|grad|rad|turn)|${num2}|none)`;
var c = `\\s*,\\s*`;
var rx_num_per_none = new RegExp("^" + num_per_none + "$");

// node_modules/culori/src/rgb/parseRgbLegacy.js
var rgb_num_old = new RegExp(
  `^rgba?\\(\\s*${num2}${c}${num2}${c}${num2}\\s*(?:,\\s*${num_per}\\s*)?\\)$`
);
var rgb_per_old = new RegExp(
  `^rgba?\\(\\s*${per}${c}${per}${c}${per}\\s*(?:,\\s*${num_per}\\s*)?\\)$`
);
var parseRgbLegacy = (color) => {
  let res = { mode: "rgb" };
  let match;
  if (match = color.match(rgb_num_old)) {
    if (match[1] !== void 0) {
      res.r = match[1] / 255;
    }
    if (match[2] !== void 0) {
      res.g = match[2] / 255;
    }
    if (match[3] !== void 0) {
      res.b = match[3] / 255;
    }
  } else if (match = color.match(rgb_per_old)) {
    if (match[1] !== void 0) {
      res.r = match[1] / 100;
    }
    if (match[2] !== void 0) {
      res.g = match[2] / 100;
    }
    if (match[3] !== void 0) {
      res.b = match[3] / 100;
    }
  } else {
    return void 0;
  }
  if (match[4] !== void 0) {
    res.alpha = Math.max(0, Math.min(1, match[4] / 100));
  } else if (match[5] !== void 0) {
    res.alpha = Math.max(0, Math.min(1, +match[5]));
  }
  return res;
};
var parseRgbLegacy_default = parseRgbLegacy;

// node_modules/culori/src/_prepare.js
var prepare = (color, mode) => color === void 0 ? void 0 : typeof color !== "object" ? parse_default(color) : color.mode !== void 0 ? color : mode ? { ...color, mode } : void 0;
var prepare_default = prepare;

// node_modules/culori/src/converter.js
var converter = (target_mode = "rgb") => (color) => (color = prepare_default(color, target_mode)) !== void 0 ? (
  // if the color's mode corresponds to our target mode
  color.mode === target_mode ? (
    // then just return the color
    color
  ) : (
    // otherwise check to see if we have a dedicated
    // converter for the target mode
    converters[color.mode][target_mode] ? (
      // and return its result...
      converters[color.mode][target_mode](color)
    ) : (
      // ...otherwise pass through RGB as an intermediary step.
      // if the target mode is RGB...
      target_mode === "rgb" ? (
        // just return the RGB
        converters[color.mode].rgb(color)
      ) : (
        // otherwise convert color.mode -> RGB -> target_mode
        converters.rgb[target_mode](converters[color.mode].rgb(color))
      )
    )
  )
) : void 0;
var converter_default = converter;

// node_modules/culori/src/modes.js
var converters = {};
var modes = {};
var parsers = [];
var colorProfiles = {};
var identity = (v) => v;
var useMode = (definition29) => {
  converters[definition29.mode] = {
    ...converters[definition29.mode],
    ...definition29.toMode
  };
  Object.keys(definition29.fromMode || {}).forEach((k4) => {
    if (!converters[k4]) {
      converters[k4] = {};
    }
    converters[k4][definition29.mode] = definition29.fromMode[k4];
  });
  if (!definition29.ranges) {
    definition29.ranges = {};
  }
  if (!definition29.difference) {
    definition29.difference = {};
  }
  definition29.channels.forEach((channel) => {
    if (definition29.ranges[channel] === void 0) {
      definition29.ranges[channel] = [0, 1];
    }
    if (!definition29.interpolate[channel]) {
      throw new Error(`Missing interpolator for: ${channel}`);
    }
    if (typeof definition29.interpolate[channel] === "function") {
      definition29.interpolate[channel] = {
        use: definition29.interpolate[channel]
      };
    }
    if (!definition29.interpolate[channel].fixup) {
      definition29.interpolate[channel].fixup = identity;
    }
  });
  modes[definition29.mode] = definition29;
  (definition29.parse || []).forEach((parser) => {
    useParser(parser, definition29.mode);
  });
  return converter_default(definition29.mode);
};
var getMode = (mode) => modes[mode];
var useParser = (parser, mode) => {
  if (typeof parser === "string") {
    if (!mode) {
      throw new Error(`'mode' required when 'parser' is a string`);
    }
    colorProfiles[parser] = mode;
  } else if (typeof parser === "function") {
    if (parsers.indexOf(parser) < 0) {
      parsers.push(parser);
    }
  }
};

// node_modules/culori/src/parse.js
var IdentStartCodePoint = /[^\x00-\x7F]|[a-zA-Z_]/;
var IdentCodePoint = /[^\x00-\x7F]|[-\w]/;
var Tok = {
  Function: "function",
  Ident: "ident",
  Number: "number",
  Percentage: "percentage",
  ParenClose: ")",
  None: "none",
  Hue: "hue",
  Alpha: "alpha"
};
var _i = 0;
function is_num(chars) {
  let ch = chars[_i];
  let ch1 = chars[_i + 1];
  if (ch === "-" || ch === "+") {
    return /\d/.test(ch1) || ch1 === "." && /\d/.test(chars[_i + 2]);
  }
  if (ch === ".") {
    return /\d/.test(ch1);
  }
  return /\d/.test(ch);
}
function is_ident(chars) {
  if (_i >= chars.length) {
    return false;
  }
  let ch = chars[_i];
  if (IdentStartCodePoint.test(ch)) {
    return true;
  }
  if (ch === "-") {
    if (chars.length - _i < 2) {
      return false;
    }
    let ch1 = chars[_i + 1];
    if (ch1 === "-" || IdentStartCodePoint.test(ch1)) {
      return true;
    }
    return false;
  }
  return false;
}
var huenits = {
  deg: 1,
  rad: 180 / Math.PI,
  grad: 9 / 10,
  turn: 360
};
function num3(chars) {
  let value = "";
  if (chars[_i] === "-" || chars[_i] === "+") {
    value += chars[_i++];
  }
  value += digits(chars);
  if (chars[_i] === "." && /\d/.test(chars[_i + 1])) {
    value += chars[_i++] + digits(chars);
  }
  if (chars[_i] === "e" || chars[_i] === "E") {
    if ((chars[_i + 1] === "-" || chars[_i + 1] === "+") && /\d/.test(chars[_i + 2])) {
      value += chars[_i++] + chars[_i++] + digits(chars);
    } else if (/\d/.test(chars[_i + 1])) {
      value += chars[_i++] + digits(chars);
    }
  }
  if (is_ident(chars)) {
    let id = ident(chars);
    if (id === "deg" || id === "rad" || id === "turn" || id === "grad") {
      return { type: Tok.Hue, value: value * huenits[id] };
    }
    return void 0;
  }
  if (chars[_i] === "%") {
    _i++;
    return { type: Tok.Percentage, value: +value };
  }
  return { type: Tok.Number, value: +value };
}
function digits(chars) {
  let v = "";
  while (/\d/.test(chars[_i])) {
    v += chars[_i++];
  }
  return v;
}
function ident(chars) {
  let v = "";
  while (_i < chars.length && IdentCodePoint.test(chars[_i])) {
    v += chars[_i++];
  }
  return v;
}
function identlike(chars) {
  let v = ident(chars);
  if (chars[_i] === "(") {
    _i++;
    return { type: Tok.Function, value: v };
  }
  if (v === "none") {
    return { type: Tok.None, value: void 0 };
  }
  return { type: Tok.Ident, value: v };
}
function tokenize(str = "") {
  let chars = str.trim();
  let tokens = [];
  let ch;
  _i = 0;
  while (_i < chars.length) {
    ch = chars[_i++];
    if (ch === "\n" || ch === "	" || ch === " ") {
      while (_i < chars.length && (chars[_i] === "\n" || chars[_i] === "	" || chars[_i] === " ")) {
        _i++;
      }
      continue;
    }
    if (ch === ",") {
      return void 0;
    }
    if (ch === ")") {
      tokens.push({ type: Tok.ParenClose });
      continue;
    }
    if (ch === "+") {
      _i--;
      if (is_num(chars)) {
        tokens.push(num3(chars));
        continue;
      }
      return void 0;
    }
    if (ch === "-") {
      _i--;
      if (is_num(chars)) {
        tokens.push(num3(chars));
        continue;
      }
      if (is_ident(chars)) {
        tokens.push({ type: Tok.Ident, value: ident(chars) });
        continue;
      }
      return void 0;
    }
    if (ch === ".") {
      _i--;
      if (is_num(chars)) {
        tokens.push(num3(chars));
        continue;
      }
      return void 0;
    }
    if (ch === "/") {
      while (_i < chars.length && (chars[_i] === "\n" || chars[_i] === "	" || chars[_i] === " ")) {
        _i++;
      }
      let alpha;
      if (is_num(chars)) {
        alpha = num3(chars);
        if (alpha.type !== Tok.Hue) {
          tokens.push({ type: Tok.Alpha, value: alpha });
          continue;
        }
      }
      if (is_ident(chars)) {
        if (ident(chars) === "none") {
          tokens.push({
            type: Tok.Alpha,
            value: { type: Tok.None, value: void 0 }
          });
          continue;
        }
      }
      return void 0;
    }
    if (/\d/.test(ch)) {
      _i--;
      tokens.push(num3(chars));
      continue;
    }
    if (IdentStartCodePoint.test(ch)) {
      _i--;
      tokens.push(identlike(chars));
      continue;
    }
    return void 0;
  }
  return tokens;
}
function parseColorSyntax(tokens) {
  tokens._i = 0;
  let token = tokens[tokens._i++];
  if (!token || token.type !== Tok.Function || token.value !== "color") {
    return void 0;
  }
  token = tokens[tokens._i++];
  if (token.type !== Tok.Ident) {
    return void 0;
  }
  const mode = colorProfiles[token.value];
  if (!mode) {
    return void 0;
  }
  const res = { mode };
  const coords = consumeCoords(tokens, false);
  if (!coords) {
    return void 0;
  }
  const channels = getMode(mode).channels;
  for (let ii = 0, c2, ch; ii < channels.length; ii++) {
    c2 = coords[ii];
    ch = channels[ii];
    if (c2.type !== Tok.None) {
      res[ch] = c2.type === Tok.Number ? c2.value : c2.value / 100;
      if (ch === "alpha") {
        res[ch] = Math.max(0, Math.min(1, res[ch]));
      }
    }
  }
  return res;
}
function consumeCoords(tokens, includeHue) {
  const coords = [];
  let token;
  while (tokens._i < tokens.length) {
    token = tokens[tokens._i++];
    if (token.type === Tok.None || token.type === Tok.Number || token.type === Tok.Alpha || token.type === Tok.Percentage || includeHue && token.type === Tok.Hue) {
      coords.push(token);
      continue;
    }
    if (token.type === Tok.ParenClose) {
      if (tokens._i < tokens.length) {
        return void 0;
      }
      continue;
    }
    return void 0;
  }
  if (coords.length < 3 || coords.length > 4) {
    return void 0;
  }
  if (coords.length === 4) {
    if (coords[3].type !== Tok.Alpha) {
      return void 0;
    }
    coords[3] = coords[3].value;
  }
  if (coords.length === 3) {
    coords.push({ type: Tok.None, value: void 0 });
  }
  return coords.every((c2) => c2.type !== Tok.Alpha) ? coords : void 0;
}
function parseModernSyntax(tokens, includeHue) {
  tokens._i = 0;
  let token = tokens[tokens._i++];
  if (!token || token.type !== Tok.Function) {
    return void 0;
  }
  let coords = consumeCoords(tokens, includeHue);
  if (!coords) {
    return void 0;
  }
  coords.unshift(token.value);
  return coords;
}
var parse4 = (color) => {
  if (typeof color !== "string") {
    return void 0;
  }
  const tokens = tokenize(color);
  const parsed = tokens ? parseModernSyntax(tokens, true) : void 0;
  let result = void 0;
  let i = 0;
  let len = parsers.length;
  while (i < len) {
    if ((result = parsers[i++](color, parsed)) !== void 0) {
      return result;
    }
  }
  return tokens ? parseColorSyntax(tokens) : void 0;
};
var parse_default = parse4;

// node_modules/culori/src/rgb/parseRgb.js
function parseRgb(color, parsed) {
  if (!parsed || parsed[0] !== "rgb" && parsed[0] !== "rgba") {
    return void 0;
  }
  const res = { mode: "rgb" };
  const [, r, g, b, alpha] = parsed;
  if (r.type === Tok.Hue || g.type === Tok.Hue || b.type === Tok.Hue) {
    return void 0;
  }
  if (r.type !== Tok.None) {
    res.r = r.type === Tok.Number ? r.value / 255 : r.value / 100;
  }
  if (g.type !== Tok.None) {
    res.g = g.type === Tok.Number ? g.value / 255 : g.value / 100;
  }
  if (b.type !== Tok.None) {
    res.b = b.type === Tok.Number ? b.value / 255 : b.value / 100;
  }
  if (alpha.type !== Tok.None) {
    res.alpha = Math.min(
      1,
      Math.max(
        0,
        alpha.type === Tok.Number ? alpha.value : alpha.value / 100
      )
    );
  }
  return res;
}
var parseRgb_default = parseRgb;

// node_modules/culori/src/rgb/parseTransparent.js
var parseTransparent = (c2) => c2 === "transparent" ? { mode: "rgb", r: 0, g: 0, b: 0, alpha: 0 } : void 0;
var parseTransparent_default = parseTransparent;

// node_modules/culori/src/interpolate/lerp.js
var lerp = (a, b, t) => a + t * (b - a);

// node_modules/culori/src/interpolate/piecewise.js
var get_classes = (arr) => {
  let classes = [];
  for (let i = 0; i < arr.length - 1; i++) {
    let a = arr[i];
    let b = arr[i + 1];
    if (a === void 0 && b === void 0) {
      classes.push(void 0);
    } else if (a !== void 0 && b !== void 0) {
      classes.push([a, b]);
    } else {
      classes.push(a !== void 0 ? [a, a] : [b, b]);
    }
  }
  return classes;
};
var interpolatorPiecewise = (interpolator) => (arr) => {
  let classes = get_classes(arr);
  return (t) => {
    let cls = t * classes.length;
    let idx = t >= 1 ? classes.length - 1 : Math.max(Math.floor(cls), 0);
    let pair = classes[idx];
    return pair === void 0 ? void 0 : interpolator(pair[0], pair[1], cls - idx);
  };
};

// node_modules/culori/src/interpolate/linear.js
var interpolatorLinear = interpolatorPiecewise(lerp);

// node_modules/culori/src/fixup/alpha.js
var fixupAlpha = (arr) => {
  let some_defined = false;
  let res = arr.map((v) => {
    if (v !== void 0) {
      some_defined = true;
      return v;
    }
    return 1;
  });
  return some_defined ? res : arr;
};

// node_modules/culori/src/rgb/definition.js
var definition = {
  mode: "rgb",
  channels: ["r", "g", "b", "alpha"],
  parse: [
    parseRgb_default,
    parseHex_default,
    parseRgbLegacy_default,
    parseNamed_default,
    parseTransparent_default,
    "srgb"
  ],
  serialize: "srgb",
  interpolate: {
    r: interpolatorLinear,
    g: interpolatorLinear,
    b: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  },
  gamut: true,
  white: { r: 1, g: 1, b: 1 },
  black: { r: 0, g: 0, b: 0 }
};
var definition_default = definition;

// node_modules/culori/src/a98/convertA98ToXyz65.js
var linearize = (v = 0) => Math.pow(Math.abs(v), 563 / 256) * Math.sign(v);
var convertA98ToXyz65 = (a982) => {
  let r = linearize(a982.r);
  let g = linearize(a982.g);
  let b = linearize(a982.b);
  let res = {
    mode: "xyz65",
    x: 0.5766690429101305 * r + 0.1855582379065463 * g + 0.1882286462349947 * b,
    y: 0.297344975250536 * r + 0.6273635662554661 * g + 0.0752914584939979 * b,
    z: 0.0270313613864123 * r + 0.0706888525358272 * g + 0.9913375368376386 * b
  };
  if (a982.alpha !== void 0) {
    res.alpha = a982.alpha;
  }
  return res;
};
var convertA98ToXyz65_default = convertA98ToXyz65;

// node_modules/culori/src/a98/convertXyz65ToA98.js
var gamma = (v) => Math.pow(Math.abs(v), 256 / 563) * Math.sign(v);
var convertXyz65ToA98 = ({ x, y, z, alpha }) => {
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (z === void 0) z = 0;
  let res = {
    mode: "a98",
    r: gamma(
      x * 2.0415879038107465 - y * 0.5650069742788597 - 0.3447313507783297 * z
    ),
    g: gamma(
      x * -0.9692436362808798 + y * 1.8759675015077206 + 0.0415550574071756 * z
    ),
    b: gamma(
      x * 0.0134442806320312 - y * 0.1183623922310184 + 1.0151749943912058 * z
    )
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz65ToA98_default = convertXyz65ToA98;

// node_modules/culori/src/lrgb/convertRgbToLrgb.js
var fn = (c2 = 0) => {
  const abs2 = Math.abs(c2);
  if (abs2 <= 0.04045) {
    return c2 / 12.92;
  }
  return (Math.sign(c2) || 1) * Math.pow((abs2 + 0.055) / 1.055, 2.4);
};
var convertRgbToLrgb = ({ r, g, b, alpha }) => {
  let res = {
    mode: "lrgb",
    r: fn(r),
    g: fn(g),
    b: fn(b)
  };
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertRgbToLrgb_default = convertRgbToLrgb;

// node_modules/culori/src/xyz65/convertRgbToXyz65.js
var convertRgbToXyz65 = (rgb2) => {
  let { r, g, b, alpha } = convertRgbToLrgb_default(rgb2);
  let res = {
    mode: "xyz65",
    x: 0.4123907992659593 * r + 0.357584339383878 * g + 0.1804807884018343 * b,
    y: 0.2126390058715102 * r + 0.715168678767756 * g + 0.0721923153607337 * b,
    z: 0.0193308187155918 * r + 0.119194779794626 * g + 0.9505321522496607 * b
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertRgbToXyz65_default = convertRgbToXyz65;

// node_modules/culori/src/lrgb/convertLrgbToRgb.js
var fn2 = (c2 = 0) => {
  const abs2 = Math.abs(c2);
  if (abs2 > 31308e-7) {
    return (Math.sign(c2) || 1) * (1.055 * Math.pow(abs2, 1 / 2.4) - 0.055);
  }
  return c2 * 12.92;
};
var convertLrgbToRgb = ({ r, g, b, alpha }, mode = "rgb") => {
  let res = {
    mode,
    r: fn2(r),
    g: fn2(g),
    b: fn2(b)
  };
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertLrgbToRgb_default = convertLrgbToRgb;

// node_modules/culori/src/xyz65/convertXyz65ToRgb.js
var convertXyz65ToRgb = ({ x, y, z, alpha }) => {
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (z === void 0) z = 0;
  let res = convertLrgbToRgb_default({
    r: x * 3.2409699419045226 - y * 1.537383177570094 - 0.4986107602930034 * z,
    g: x * -0.9692436362808796 + y * 1.8759675015077204 + 0.0415550574071756 * z,
    b: x * 0.0556300796969936 - y * 0.2039769588889765 + 1.0569715142428784 * z
  });
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz65ToRgb_default = convertXyz65ToRgb;

// node_modules/culori/src/a98/definition.js
var definition2 = {
  ...definition_default,
  mode: "a98",
  parse: ["a98-rgb"],
  serialize: "a98-rgb",
  fromMode: {
    rgb: (color) => convertXyz65ToA98_default(convertRgbToXyz65_default(color)),
    xyz65: convertXyz65ToA98_default
  },
  toMode: {
    rgb: (color) => convertXyz65ToRgb_default(convertA98ToXyz65_default(color)),
    xyz65: convertA98ToXyz65_default
  }
};
var definition_default2 = definition2;

// node_modules/culori/src/util/normalizeHue.js
var normalizeHue = (hue3) => (hue3 = hue3 % 360) < 0 ? hue3 + 360 : hue3;
var normalizeHue_default = normalizeHue;

// node_modules/culori/src/fixup/hue.js
var hue2 = (hues, fn5) => {
  return hues.map((hue3, idx, arr) => {
    if (hue3 === void 0) {
      return hue3;
    }
    let normalized = normalizeHue_default(hue3);
    if (idx === 0 || hues[idx - 1] === void 0) {
      return normalized;
    }
    return fn5(normalized - normalizeHue_default(arr[idx - 1]));
  }).reduce((acc, curr) => {
    if (!acc.length || curr === void 0 || acc[acc.length - 1] === void 0) {
      acc.push(curr);
      return acc;
    }
    acc.push(curr + acc[acc.length - 1]);
    return acc;
  }, []);
};
var fixupHueShorter = (arr) => hue2(arr, (d) => Math.abs(d) <= 180 ? d : d - 360 * Math.sign(d));

// node_modules/culori/src/cubehelix/constants.js
var M = [-0.14861, 1.78277, -0.29227, -0.90649, 1.97294, 0];
var degToRad = Math.PI / 180;
var radToDeg = 180 / Math.PI;

// node_modules/culori/src/cubehelix/convertRgbToCubehelix.js
var DE = M[3] * M[4];
var BE = M[1] * M[4];
var BCAD = M[1] * M[2] - M[0] * M[3];
var convertRgbToCubehelix = ({ r, g, b, alpha }) => {
  if (r === void 0) r = 0;
  if (g === void 0) g = 0;
  if (b === void 0) b = 0;
  let l = (BCAD * b + r * DE - g * BE) / (BCAD + DE - BE);
  let x = b - l;
  let y = (M[4] * (g - l) - M[2] * x) / M[3];
  let res = {
    mode: "cubehelix",
    l,
    s: l === 0 || l === 1 ? void 0 : Math.sqrt(x * x + y * y) / (M[4] * l * (1 - l))
  };
  if (res.s) res.h = Math.atan2(y, x) * radToDeg - 120;
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertRgbToCubehelix_default = convertRgbToCubehelix;

// node_modules/culori/src/cubehelix/convertCubehelixToRgb.js
var convertCubehelixToRgb = ({ h, s, l, alpha }) => {
  let res = { mode: "rgb" };
  h = (h === void 0 ? 0 : h + 120) * degToRad;
  if (l === void 0) l = 0;
  let amp = s === void 0 ? 0 : s * l * (1 - l);
  let cosh = Math.cos(h);
  let sinh = Math.sin(h);
  res.r = l + amp * (M[0] * cosh + M[1] * sinh);
  res.g = l + amp * (M[2] * cosh + M[3] * sinh);
  res.b = l + amp * (M[4] * cosh + M[5] * sinh);
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertCubehelixToRgb_default = convertCubehelixToRgb;

// node_modules/culori/src/difference.js
var differenceHueSaturation = (std, smp) => {
  if (std.h === void 0 || smp.h === void 0 || !std.s || !smp.s) {
    return 0;
  }
  let std_h = normalizeHue_default(std.h);
  let smp_h = normalizeHue_default(smp.h);
  let dH = Math.sin((smp_h - std_h + 360) / 2 * Math.PI / 180);
  return 2 * Math.sqrt(std.s * smp.s) * dH;
};
var differenceHueNaive = (std, smp) => {
  if (std.h === void 0 || smp.h === void 0) {
    return 0;
  }
  let std_h = normalizeHue_default(std.h);
  let smp_h = normalizeHue_default(smp.h);
  if (Math.abs(smp_h - std_h) > 180) {
    return std_h - (smp_h - 360 * Math.sign(smp_h - std_h));
  }
  return smp_h - std_h;
};
var differenceHueChroma = (std, smp) => {
  if (std.h === void 0 || smp.h === void 0 || !std.c || !smp.c) {
    return 0;
  }
  let std_h = normalizeHue_default(std.h);
  let smp_h = normalizeHue_default(smp.h);
  let dH = Math.sin((smp_h - std_h + 360) / 2 * Math.PI / 180);
  return 2 * Math.sqrt(std.c * smp.c) * dH;
};
var differenceCiede2000 = (Kl = 1, Kc = 1, Kh = 1) => {
  let lab2 = converter_default("lab65");
  return (std, smp) => {
    let LabStd = lab2(std);
    let LabSmp = lab2(smp);
    let lStd = LabStd.l;
    let aStd = LabStd.a;
    let bStd = LabStd.b;
    let cStd = Math.sqrt(aStd * aStd + bStd * bStd);
    let lSmp = LabSmp.l;
    let aSmp = LabSmp.a;
    let bSmp = LabSmp.b;
    let cSmp = Math.sqrt(aSmp * aSmp + bSmp * bSmp);
    let cAvg = (cStd + cSmp) / 2;
    let G = 0.5 * (1 - Math.sqrt(
      Math.pow(cAvg, 7) / (Math.pow(cAvg, 7) + Math.pow(25, 7))
    ));
    let apStd = aStd * (1 + G);
    let apSmp = aSmp * (1 + G);
    let cpStd = Math.sqrt(apStd * apStd + bStd * bStd);
    let cpSmp = Math.sqrt(apSmp * apSmp + bSmp * bSmp);
    let hpStd = Math.abs(apStd) + Math.abs(bStd) === 0 ? 0 : Math.atan2(bStd, apStd);
    hpStd += (hpStd < 0) * 2 * Math.PI;
    let hpSmp = Math.abs(apSmp) + Math.abs(bSmp) === 0 ? 0 : Math.atan2(bSmp, apSmp);
    hpSmp += (hpSmp < 0) * 2 * Math.PI;
    let dL = lSmp - lStd;
    let dC = cpSmp - cpStd;
    let dhp = cpStd * cpSmp === 0 ? 0 : hpSmp - hpStd;
    dhp -= (dhp > Math.PI) * 2 * Math.PI;
    dhp += (dhp < -Math.PI) * 2 * Math.PI;
    let dH = 2 * Math.sqrt(cpStd * cpSmp) * Math.sin(dhp / 2);
    let Lp = (lStd + lSmp) / 2;
    let Cp = (cpStd + cpSmp) / 2;
    let hp;
    if (cpStd * cpSmp === 0) {
      hp = hpStd + hpSmp;
    } else {
      hp = (hpStd + hpSmp) / 2;
      hp -= (Math.abs(hpStd - hpSmp) > Math.PI) * Math.PI;
      hp += (hp < 0) * 2 * Math.PI;
    }
    let Lpm50 = Math.pow(Lp - 50, 2);
    let T = 1 - 0.17 * Math.cos(hp - Math.PI / 6) + 0.24 * Math.cos(2 * hp) + 0.32 * Math.cos(3 * hp + Math.PI / 30) - 0.2 * Math.cos(4 * hp - 63 * Math.PI / 180);
    let Sl = 1 + 0.015 * Lpm50 / Math.sqrt(20 + Lpm50);
    let Sc = 1 + 0.045 * Cp;
    let Sh = 1 + 0.015 * Cp * T;
    let deltaTheta = 30 * Math.PI / 180 * Math.exp(-1 * Math.pow((180 / Math.PI * hp - 275) / 25, 2));
    let Rc = 2 * Math.sqrt(Math.pow(Cp, 7) / (Math.pow(Cp, 7) + Math.pow(25, 7)));
    let Rt = -1 * Math.sin(2 * deltaTheta) * Rc;
    return Math.sqrt(
      Math.pow(dL / (Kl * Sl), 2) + Math.pow(dC / (Kc * Sc), 2) + Math.pow(dH / (Kh * Sh), 2) + Rt * dC / (Kc * Sc) * dH / (Kh * Sh)
    );
  };
};

// node_modules/culori/src/average.js
var averageAngle = (val) => {
  let sum = val.reduce(
    (sum2, val2) => {
      if (val2 !== void 0) {
        let rad = val2 * Math.PI / 180;
        sum2.sin += Math.sin(rad);
        sum2.cos += Math.cos(rad);
      }
      return sum2;
    },
    { sin: 0, cos: 0 }
  );
  let angle = Math.atan2(sum.sin, sum.cos) * 180 / Math.PI;
  return angle < 0 ? 360 + angle : angle;
};

// node_modules/culori/src/cubehelix/definition.js
var definition3 = {
  mode: "cubehelix",
  channels: ["h", "s", "l", "alpha"],
  parse: ["--cubehelix"],
  serialize: "--cubehelix",
  ranges: {
    h: [0, 360],
    s: [0, 4.614],
    l: [0, 1]
  },
  fromMode: {
    rgb: convertRgbToCubehelix_default
  },
  toMode: {
    rgb: convertCubehelixToRgb_default
  },
  interpolate: {
    h: {
      use: interpolatorLinear,
      fixup: fixupHueShorter
    },
    s: interpolatorLinear,
    l: interpolatorLinear,
    alpha: {
      use: interpolatorLinear,
      fixup: fixupAlpha
    }
  },
  difference: {
    h: differenceHueSaturation
  },
  average: {
    h: averageAngle
  }
};
var definition_default3 = definition3;

// node_modules/culori/src/lch/convertLabToLch.js
var convertLabToLch = ({ l, a, b, alpha }, mode = "lch") => {
  if (a === void 0) a = 0;
  if (b === void 0) b = 0;
  let c2 = Math.sqrt(a * a + b * b);
  let res = { mode, l, c: c2 };
  if (c2) res.h = normalizeHue_default(Math.atan2(b, a) * 180 / Math.PI);
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertLabToLch_default = convertLabToLch;

// node_modules/culori/src/lch/convertLchToLab.js
var convertLchToLab = ({ l, c: c2, h, alpha }, mode = "lab") => {
  if (h === void 0) h = 0;
  let res = {
    mode,
    l,
    a: c2 ? c2 * Math.cos(h / 180 * Math.PI) : 0,
    b: c2 ? c2 * Math.sin(h / 180 * Math.PI) : 0
  };
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertLchToLab_default = convertLchToLab;

// node_modules/culori/src/xyz65/constants.js
var k = Math.pow(29, 3) / Math.pow(3, 3);
var e = Math.pow(6, 3) / Math.pow(29, 3);

// node_modules/culori/src/constants.js
var D50 = {
  X: 0.3457 / 0.3585,
  Y: 1,
  Z: (1 - 0.3457 - 0.3585) / 0.3585
};
var D65 = {
  X: 0.3127 / 0.329,
  Y: 1,
  Z: (1 - 0.3127 - 0.329) / 0.329
};
var k2 = Math.pow(29, 3) / Math.pow(3, 3);
var e2 = Math.pow(6, 3) / Math.pow(29, 3);

// node_modules/culori/src/lab65/convertLab65ToXyz65.js
var fn3 = (v) => Math.pow(v, 3) > e ? Math.pow(v, 3) : (116 * v - 16) / k;
var convertLab65ToXyz65 = ({ l, a, b, alpha }) => {
  if (l === void 0) l = 0;
  if (a === void 0) a = 0;
  if (b === void 0) b = 0;
  let fy = (l + 16) / 116;
  let fx = a / 500 + fy;
  let fz = fy - b / 200;
  let res = {
    mode: "xyz65",
    x: fn3(fx) * D65.X,
    y: fn3(fy) * D65.Y,
    z: fn3(fz) * D65.Z
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertLab65ToXyz65_default = convertLab65ToXyz65;

// node_modules/culori/src/lab65/convertLab65ToRgb.js
var convertLab65ToRgb = (lab2) => convertXyz65ToRgb_default(convertLab65ToXyz65_default(lab2));
var convertLab65ToRgb_default = convertLab65ToRgb;

// node_modules/culori/src/lab65/convertXyz65ToLab65.js
var f = (value) => value > e ? Math.cbrt(value) : (k * value + 16) / 116;
var convertXyz65ToLab65 = ({ x, y, z, alpha }) => {
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (z === void 0) z = 0;
  let f0 = f(x / D65.X);
  let f1 = f(y / D65.Y);
  let f22 = f(z / D65.Z);
  let res = {
    mode: "lab65",
    l: 116 * f1 - 16,
    a: 500 * (f0 - f1),
    b: 200 * (f1 - f22)
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz65ToLab65_default = convertXyz65ToLab65;

// node_modules/culori/src/lab65/convertRgbToLab65.js
var convertRgbToLab65 = (rgb2) => {
  let res = convertXyz65ToLab65_default(convertRgbToXyz65_default(rgb2));
  if (rgb2.r === rgb2.b && rgb2.b === rgb2.g) {
    res.a = res.b = 0;
  }
  return res;
};
var convertRgbToLab65_default = convertRgbToLab65;

// node_modules/culori/src/dlch/constants.js
var kE = 1;
var kCH = 1;
var \u03B8 = 26 / 180 * Math.PI;
var cos\u03B8 = Math.cos(\u03B8);
var sin\u03B8 = Math.sin(\u03B8);
var factor = 100 / Math.log(139 / 100);

// node_modules/culori/src/dlch/convertDlchToLab65.js
var convertDlchToLab65 = ({ l, c: c2, h, alpha }) => {
  if (l === void 0) l = 0;
  if (c2 === void 0) c2 = 0;
  if (h === void 0) h = 0;
  let res = {
    mode: "lab65",
    l: (Math.exp(l * kE / factor) - 1) / 39e-4
  };
  let G = (Math.exp(0.0435 * c2 * kCH * kE) - 1) / 0.075;
  let e4 = G * Math.cos(h / 180 * Math.PI - \u03B8);
  let f3 = G * Math.sin(h / 180 * Math.PI - \u03B8);
  res.a = e4 * cos\u03B8 - f3 / 0.83 * sin\u03B8;
  res.b = e4 * sin\u03B8 + f3 / 0.83 * cos\u03B8;
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertDlchToLab65_default = convertDlchToLab65;

// node_modules/culori/src/dlch/convertLab65ToDlch.js
var convertLab65ToDlch = ({ l, a, b, alpha }) => {
  if (l === void 0) l = 0;
  if (a === void 0) a = 0;
  if (b === void 0) b = 0;
  let e4 = a * cos\u03B8 + b * sin\u03B8;
  let f3 = 0.83 * (b * cos\u03B8 - a * sin\u03B8);
  let G = Math.sqrt(e4 * e4 + f3 * f3);
  let res = {
    mode: "dlch",
    l: factor / kE * Math.log(1 + 39e-4 * l),
    c: Math.log(1 + 0.075 * G) / (0.0435 * kCH * kE)
  };
  if (res.c) {
    res.h = normalizeHue_default((Math.atan2(f3, e4) + \u03B8) / Math.PI * 180);
  }
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertLab65ToDlch_default = convertLab65ToDlch;

// node_modules/culori/src/dlab/definition.js
var convertDlabToLab65 = (c2) => convertDlchToLab65_default(convertLabToLch_default(c2, "dlch"));
var convertLab65ToDlab = (c2) => convertLchToLab_default(convertLab65ToDlch_default(c2), "dlab");
var definition4 = {
  mode: "dlab",
  parse: ["--din99o-lab"],
  serialize: "--din99o-lab",
  toMode: {
    lab65: convertDlabToLab65,
    rgb: (c2) => convertLab65ToRgb_default(convertDlabToLab65(c2))
  },
  fromMode: {
    lab65: convertLab65ToDlab,
    rgb: (c2) => convertLab65ToDlab(convertRgbToLab65_default(c2))
  },
  channels: ["l", "a", "b", "alpha"],
  ranges: {
    l: [0, 100],
    a: [-40.09, 45.501],
    b: [-40.469, 44.344]
  },
  interpolate: {
    l: interpolatorLinear,
    a: interpolatorLinear,
    b: interpolatorLinear,
    alpha: {
      use: interpolatorLinear,
      fixup: fixupAlpha
    }
  }
};
var definition_default4 = definition4;

// node_modules/culori/src/dlch/definition.js
var definition5 = {
  mode: "dlch",
  parse: ["--din99o-lch"],
  serialize: "--din99o-lch",
  toMode: {
    lab65: convertDlchToLab65_default,
    dlab: (c2) => convertLchToLab_default(c2, "dlab"),
    rgb: (c2) => convertLab65ToRgb_default(convertDlchToLab65_default(c2))
  },
  fromMode: {
    lab65: convertLab65ToDlch_default,
    dlab: (c2) => convertLabToLch_default(c2, "dlch"),
    rgb: (c2) => convertLab65ToDlch_default(convertRgbToLab65_default(c2))
  },
  channels: ["l", "c", "h", "alpha"],
  ranges: {
    l: [0, 100],
    c: [0, 51.484],
    h: [0, 360]
  },
  interpolate: {
    l: interpolatorLinear,
    c: interpolatorLinear,
    h: {
      use: interpolatorLinear,
      fixup: fixupHueShorter
    },
    alpha: {
      use: interpolatorLinear,
      fixup: fixupAlpha
    }
  },
  difference: {
    h: differenceHueChroma
  },
  average: {
    h: averageAngle
  }
};
var definition_default5 = definition5;

// node_modules/culori/src/hsi/convertHsiToRgb.js
function convertHsiToRgb({ h, s, i, alpha }) {
  h = normalizeHue_default(h !== void 0 ? h : 0);
  if (s === void 0) s = 0;
  if (i === void 0) i = 0;
  let f3 = Math.abs(h / 60 % 2 - 1);
  let res;
  switch (Math.floor(h / 60)) {
    case 0:
      res = {
        r: i * (1 + s * (3 / (2 - f3) - 1)),
        g: i * (1 + s * (3 * (1 - f3) / (2 - f3) - 1)),
        b: i * (1 - s)
      };
      break;
    case 1:
      res = {
        r: i * (1 + s * (3 * (1 - f3) / (2 - f3) - 1)),
        g: i * (1 + s * (3 / (2 - f3) - 1)),
        b: i * (1 - s)
      };
      break;
    case 2:
      res = {
        r: i * (1 - s),
        g: i * (1 + s * (3 / (2 - f3) - 1)),
        b: i * (1 + s * (3 * (1 - f3) / (2 - f3) - 1))
      };
      break;
    case 3:
      res = {
        r: i * (1 - s),
        g: i * (1 + s * (3 * (1 - f3) / (2 - f3) - 1)),
        b: i * (1 + s * (3 / (2 - f3) - 1))
      };
      break;
    case 4:
      res = {
        r: i * (1 + s * (3 * (1 - f3) / (2 - f3) - 1)),
        g: i * (1 - s),
        b: i * (1 + s * (3 / (2 - f3) - 1))
      };
      break;
    case 5:
      res = {
        r: i * (1 + s * (3 / (2 - f3) - 1)),
        g: i * (1 - s),
        b: i * (1 + s * (3 * (1 - f3) / (2 - f3) - 1))
      };
      break;
    default:
      res = { r: i * (1 - s), g: i * (1 - s), b: i * (1 - s) };
  }
  res.mode = "rgb";
  if (alpha !== void 0) res.alpha = alpha;
  return res;
}

// node_modules/culori/src/hsi/convertRgbToHsi.js
function convertRgbToHsi({ r, g, b, alpha }) {
  if (r === void 0) r = 0;
  if (g === void 0) g = 0;
  if (b === void 0) b = 0;
  let M3 = Math.max(r, g, b), m = Math.min(r, g, b);
  let res = {
    mode: "hsi",
    s: r + g + b === 0 ? 0 : 1 - 3 * m / (r + g + b),
    i: (r + g + b) / 3
  };
  if (M3 - m !== 0)
    res.h = (M3 === r ? (g - b) / (M3 - m) + (g < b) * 6 : M3 === g ? (b - r) / (M3 - m) + 2 : (r - g) / (M3 - m) + 4) * 60;
  if (alpha !== void 0) res.alpha = alpha;
  return res;
}

// node_modules/culori/src/hsi/definition.js
var definition6 = {
  mode: "hsi",
  toMode: {
    rgb: convertHsiToRgb
  },
  parse: ["--hsi"],
  serialize: "--hsi",
  fromMode: {
    rgb: convertRgbToHsi
  },
  channels: ["h", "s", "i", "alpha"],
  ranges: {
    h: [0, 360]
  },
  gamut: "rgb",
  interpolate: {
    h: { use: interpolatorLinear, fixup: fixupHueShorter },
    s: interpolatorLinear,
    i: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  },
  difference: {
    h: differenceHueSaturation
  },
  average: {
    h: averageAngle
  }
};
var definition_default6 = definition6;

// node_modules/culori/src/hsl/convertHslToRgb.js
function convertHslToRgb({ h, s, l, alpha }) {
  h = normalizeHue_default(h !== void 0 ? h : 0);
  if (s === void 0) s = 0;
  if (l === void 0) l = 0;
  let m1 = l + s * (l < 0.5 ? l : 1 - l);
  let m2 = m1 - (m1 - l) * 2 * Math.abs(h / 60 % 2 - 1);
  let res;
  switch (Math.floor(h / 60)) {
    case 0:
      res = { r: m1, g: m2, b: 2 * l - m1 };
      break;
    case 1:
      res = { r: m2, g: m1, b: 2 * l - m1 };
      break;
    case 2:
      res = { r: 2 * l - m1, g: m1, b: m2 };
      break;
    case 3:
      res = { r: 2 * l - m1, g: m2, b: m1 };
      break;
    case 4:
      res = { r: m2, g: 2 * l - m1, b: m1 };
      break;
    case 5:
      res = { r: m1, g: 2 * l - m1, b: m2 };
      break;
    default:
      res = { r: 2 * l - m1, g: 2 * l - m1, b: 2 * l - m1 };
  }
  res.mode = "rgb";
  if (alpha !== void 0) res.alpha = alpha;
  return res;
}

// node_modules/culori/src/hsl/convertRgbToHsl.js
function convertRgbToHsl({ r, g, b, alpha }) {
  if (r === void 0) r = 0;
  if (g === void 0) g = 0;
  if (b === void 0) b = 0;
  let M3 = Math.max(r, g, b), m = Math.min(r, g, b);
  let res = {
    mode: "hsl",
    s: M3 === m ? 0 : (M3 - m) / (1 - Math.abs(M3 + m - 1)),
    l: 0.5 * (M3 + m)
  };
  if (M3 - m !== 0)
    res.h = (M3 === r ? (g - b) / (M3 - m) + (g < b) * 6 : M3 === g ? (b - r) / (M3 - m) + 2 : (r - g) / (M3 - m) + 4) * 60;
  if (alpha !== void 0) res.alpha = alpha;
  return res;
}

// node_modules/culori/src/util/hue.js
var hueToDeg = (val, unit) => {
  switch (unit) {
    case "deg":
      return +val;
    case "rad":
      return val / Math.PI * 180;
    case "grad":
      return val / 10 * 9;
    case "turn":
      return val * 360;
  }
};
var hue_default = hueToDeg;

// node_modules/culori/src/hsl/parseHslLegacy.js
var hsl_old = new RegExp(
  `^hsla?\\(\\s*${hue}${c}${per}${c}${per}\\s*(?:,\\s*${num_per}\\s*)?\\)$`
);
var parseHslLegacy = (color) => {
  let match = color.match(hsl_old);
  if (!match) return;
  let res = { mode: "hsl" };
  if (match[3] !== void 0) {
    res.h = +match[3];
  } else if (match[1] !== void 0 && match[2] !== void 0) {
    res.h = hue_default(match[1], match[2]);
  }
  if (match[4] !== void 0) {
    res.s = Math.min(Math.max(0, match[4] / 100), 1);
  }
  if (match[5] !== void 0) {
    res.l = Math.min(Math.max(0, match[5] / 100), 1);
  }
  if (match[6] !== void 0) {
    res.alpha = Math.max(0, Math.min(1, match[6] / 100));
  } else if (match[7] !== void 0) {
    res.alpha = Math.max(0, Math.min(1, +match[7]));
  }
  return res;
};
var parseHslLegacy_default = parseHslLegacy;

// node_modules/culori/src/hsl/parseHsl.js
function parseHsl(color, parsed) {
  if (!parsed || parsed[0] !== "hsl" && parsed[0] !== "hsla") {
    return void 0;
  }
  const res = { mode: "hsl" };
  const [, h, s, l, alpha] = parsed;
  if (h.type !== Tok.None) {
    if (h.type === Tok.Percentage) {
      return void 0;
    }
    res.h = h.value;
  }
  if (s.type !== Tok.None) {
    if (s.type === Tok.Hue) {
      return void 0;
    }
    res.s = s.value / 100;
  }
  if (l.type !== Tok.None) {
    if (l.type === Tok.Hue) {
      return void 0;
    }
    res.l = l.value / 100;
  }
  if (alpha.type !== Tok.None) {
    res.alpha = Math.min(
      1,
      Math.max(
        0,
        alpha.type === Tok.Number ? alpha.value : alpha.value / 100
      )
    );
  }
  return res;
}
var parseHsl_default = parseHsl;

// node_modules/culori/src/hsl/definition.js
var definition7 = {
  mode: "hsl",
  toMode: {
    rgb: convertHslToRgb
  },
  fromMode: {
    rgb: convertRgbToHsl
  },
  channels: ["h", "s", "l", "alpha"],
  ranges: {
    h: [0, 360]
  },
  gamut: "rgb",
  parse: [parseHsl_default, parseHslLegacy_default],
  serialize: (c2) => `hsl(${c2.h !== void 0 ? c2.h : "none"} ${c2.s !== void 0 ? c2.s * 100 + "%" : "none"} ${c2.l !== void 0 ? c2.l * 100 + "%" : "none"}${c2.alpha < 1 ? ` / ${c2.alpha}` : ""})`,
  interpolate: {
    h: { use: interpolatorLinear, fixup: fixupHueShorter },
    s: interpolatorLinear,
    l: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  },
  difference: {
    h: differenceHueSaturation
  },
  average: {
    h: averageAngle
  }
};
var definition_default7 = definition7;

// node_modules/culori/src/hsv/convertHsvToRgb.js
function convertHsvToRgb({ h, s, v, alpha }) {
  h = normalizeHue_default(h !== void 0 ? h : 0);
  if (s === void 0) s = 0;
  if (v === void 0) v = 0;
  let f3 = Math.abs(h / 60 % 2 - 1);
  let res;
  switch (Math.floor(h / 60)) {
    case 0:
      res = { r: v, g: v * (1 - s * f3), b: v * (1 - s) };
      break;
    case 1:
      res = { r: v * (1 - s * f3), g: v, b: v * (1 - s) };
      break;
    case 2:
      res = { r: v * (1 - s), g: v, b: v * (1 - s * f3) };
      break;
    case 3:
      res = { r: v * (1 - s), g: v * (1 - s * f3), b: v };
      break;
    case 4:
      res = { r: v * (1 - s * f3), g: v * (1 - s), b: v };
      break;
    case 5:
      res = { r: v, g: v * (1 - s), b: v * (1 - s * f3) };
      break;
    default:
      res = { r: v * (1 - s), g: v * (1 - s), b: v * (1 - s) };
  }
  res.mode = "rgb";
  if (alpha !== void 0) res.alpha = alpha;
  return res;
}

// node_modules/culori/src/hsv/convertRgbToHsv.js
function convertRgbToHsv({ r, g, b, alpha }) {
  if (r === void 0) r = 0;
  if (g === void 0) g = 0;
  if (b === void 0) b = 0;
  let M3 = Math.max(r, g, b), m = Math.min(r, g, b);
  let res = {
    mode: "hsv",
    s: M3 === 0 ? 0 : 1 - m / M3,
    v: M3
  };
  if (M3 - m !== 0)
    res.h = (M3 === r ? (g - b) / (M3 - m) + (g < b) * 6 : M3 === g ? (b - r) / (M3 - m) + 2 : (r - g) / (M3 - m) + 4) * 60;
  if (alpha !== void 0) res.alpha = alpha;
  return res;
}

// node_modules/culori/src/hsv/definition.js
var definition8 = {
  mode: "hsv",
  toMode: {
    rgb: convertHsvToRgb
  },
  parse: ["--hsv"],
  serialize: "--hsv",
  fromMode: {
    rgb: convertRgbToHsv
  },
  channels: ["h", "s", "v", "alpha"],
  ranges: {
    h: [0, 360]
  },
  gamut: "rgb",
  interpolate: {
    h: { use: interpolatorLinear, fixup: fixupHueShorter },
    s: interpolatorLinear,
    v: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  },
  difference: {
    h: differenceHueSaturation
  },
  average: {
    h: averageAngle
  }
};
var definition_default8 = definition8;

// node_modules/culori/src/hwb/convertHwbToRgb.js
function convertHwbToRgb({ h, w, b, alpha }) {
  if (w === void 0) w = 0;
  if (b === void 0) b = 0;
  if (w + b > 1) {
    let s = w + b;
    w /= s;
    b /= s;
  }
  return convertHsvToRgb({
    h,
    s: b === 1 ? 1 : 1 - w / (1 - b),
    v: 1 - b,
    alpha
  });
}

// node_modules/culori/src/hwb/convertRgbToHwb.js
function convertRgbToHwb(rgba) {
  let hsv2 = convertRgbToHsv(rgba);
  if (hsv2 === void 0) return void 0;
  let s = hsv2.s !== void 0 ? hsv2.s : 0;
  let v = hsv2.v !== void 0 ? hsv2.v : 0;
  let res = {
    mode: "hwb",
    w: (1 - s) * v,
    b: 1 - v
  };
  if (hsv2.h !== void 0) res.h = hsv2.h;
  if (hsv2.alpha !== void 0) res.alpha = hsv2.alpha;
  return res;
}

// node_modules/culori/src/hwb/parseHwb.js
function ParseHwb(color, parsed) {
  if (!parsed || parsed[0] !== "hwb") {
    return void 0;
  }
  const res = { mode: "hwb" };
  const [, h, w, b, alpha] = parsed;
  if (h.type !== Tok.None) {
    if (h.type === Tok.Percentage) {
      return void 0;
    }
    res.h = h.value;
  }
  if (w.type !== Tok.None) {
    if (w.type === Tok.Hue) {
      return void 0;
    }
    res.w = w.value / 100;
  }
  if (b.type !== Tok.None) {
    if (b.type === Tok.Hue) {
      return void 0;
    }
    res.b = b.value / 100;
  }
  if (alpha.type !== Tok.None) {
    res.alpha = Math.min(
      1,
      Math.max(
        0,
        alpha.type === Tok.Number ? alpha.value : alpha.value / 100
      )
    );
  }
  return res;
}
var parseHwb_default = ParseHwb;

// node_modules/culori/src/hwb/definition.js
var definition9 = {
  mode: "hwb",
  toMode: {
    rgb: convertHwbToRgb
  },
  fromMode: {
    rgb: convertRgbToHwb
  },
  channels: ["h", "w", "b", "alpha"],
  ranges: {
    h: [0, 360]
  },
  gamut: "rgb",
  parse: [parseHwb_default],
  serialize: (c2) => `hwb(${c2.h !== void 0 ? c2.h : "none"} ${c2.w !== void 0 ? c2.w * 100 + "%" : "none"} ${c2.b !== void 0 ? c2.b * 100 + "%" : "none"}${c2.alpha < 1 ? ` / ${c2.alpha}` : ""})`,
  interpolate: {
    h: { use: interpolatorLinear, fixup: fixupHueShorter },
    w: interpolatorLinear,
    b: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  },
  difference: {
    h: differenceHueNaive
  },
  average: {
    h: averageAngle
  }
};
var definition_default9 = definition9;

// node_modules/culori/src/hdr/constants.js
var YW = 203;

// node_modules/culori/src/hdr/transfer.js
var M1 = 0.1593017578125;
var M2 = 78.84375;
var C1 = 0.8359375;
var C2 = 18.8515625;
var C3 = 18.6875;
function transferPqDecode(v) {
  if (v < 0) return 0;
  const c2 = Math.pow(v, 1 / M2);
  return 1e4 * Math.pow(Math.max(0, c2 - C1) / (C2 - C3 * c2), 1 / M1);
}
function transferPqEncode(v) {
  if (v < 0) return 0;
  const c2 = Math.pow(v / 1e4, M1);
  return Math.pow((C1 + C2 * c2) / (1 + C3 * c2), M2);
}

// node_modules/culori/src/itp/convertItpToXyz65.js
var toRel = (c2) => Math.max(c2 / YW, 0);
var convertItpToXyz65 = ({ i, t, p: p4, alpha }) => {
  if (i === void 0) i = 0;
  if (t === void 0) t = 0;
  if (p4 === void 0) p4 = 0;
  const l = transferPqDecode(
    i + 0.008609037037932761 * t + 0.11102962500302593 * p4
  );
  const m = transferPqDecode(
    i - 0.00860903703793275 * t - 0.11102962500302599 * p4
  );
  const s = transferPqDecode(
    i + 0.5600313357106791 * t - 0.32062717498731885 * p4
  );
  const res = {
    mode: "xyz65",
    x: toRel(
      2.070152218389422 * l - 1.3263473389671556 * m + 0.2066510476294051 * s
    ),
    y: toRel(
      0.3647385209748074 * l + 0.680566024947227 * m - 0.0453045459220346 * s
    ),
    z: toRel(
      -0.049747207535812 * l - 0.0492609666966138 * m + 1.1880659249923042 * s
    )
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertItpToXyz65_default = convertItpToXyz65;

// node_modules/culori/src/itp/convertXyz65ToItp.js
var toAbs = (c2 = 0) => Math.max(c2 * YW, 0);
var convertXyz65ToItp = ({ x, y, z, alpha }) => {
  const absX = toAbs(x);
  const absY = toAbs(y);
  const absZ = toAbs(z);
  const l = transferPqEncode(
    0.3592832590121217 * absX + 0.6976051147779502 * absY - 0.0358915932320289 * absZ
  );
  const m = transferPqEncode(
    -0.1920808463704995 * absX + 1.1004767970374323 * absY + 0.0753748658519118 * absZ
  );
  const s = transferPqEncode(
    0.0070797844607477 * absX + 0.0748396662186366 * absY + 0.8433265453898765 * absZ
  );
  const i = 0.5 * l + 0.5 * m;
  const t = 1.61376953125 * l - 3.323486328125 * m + 1.709716796875 * s;
  const p4 = 4.378173828125 * l - 4.24560546875 * m - 0.132568359375 * s;
  const res = { mode: "itp", i, t, p: p4 };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz65ToItp_default = convertXyz65ToItp;

// node_modules/culori/src/itp/definition.js
var definition10 = {
  mode: "itp",
  channels: ["i", "t", "p", "alpha"],
  parse: ["--ictcp"],
  serialize: "--ictcp",
  toMode: {
    xyz65: convertItpToXyz65_default,
    rgb: (color) => convertXyz65ToRgb_default(convertItpToXyz65_default(color))
  },
  fromMode: {
    xyz65: convertXyz65ToItp_default,
    rgb: (color) => convertXyz65ToItp_default(convertRgbToXyz65_default(color))
  },
  ranges: {
    i: [0, 0.581],
    t: [-0.369, 0.272],
    p: [-0.164, 0.331]
  },
  interpolate: {
    i: interpolatorLinear,
    t: interpolatorLinear,
    p: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  }
};
var definition_default10 = definition10;

// node_modules/culori/src/jab/convertXyz65ToJab.js
var p = 134.03437499999998;
var d0 = 16295499532821565e-27;
var jabPqEncode = (v) => {
  if (v < 0) return 0;
  let vn3 = Math.pow(v / 1e4, M1);
  return Math.pow((C1 + C2 * vn3) / (1 + C3 * vn3), p);
};
var abs = (v = 0) => Math.max(v * 203, 0);
var convertXyz65ToJab = ({ x, y, z, alpha }) => {
  x = abs(x);
  y = abs(y);
  z = abs(z);
  let xp = 1.15 * x - 0.15 * z;
  let yp = 0.66 * y + 0.34 * x;
  let l = jabPqEncode(0.41478972 * xp + 0.579999 * yp + 0.014648 * z);
  let m = jabPqEncode(-0.20151 * xp + 1.120649 * yp + 0.0531008 * z);
  let s = jabPqEncode(-0.0166008 * xp + 0.2648 * yp + 0.6684799 * z);
  let i = (l + m) / 2;
  let res = {
    mode: "jab",
    j: 0.44 * i / (1 - 0.56 * i) - d0,
    a: 3.524 * l - 4.066708 * m + 0.542708 * s,
    b: 0.199076 * l + 1.096799 * m - 1.295875 * s
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz65ToJab_default = convertXyz65ToJab;

// node_modules/culori/src/jab/convertJabToXyz65.js
var p2 = 134.03437499999998;
var d02 = 16295499532821565e-27;
var jabPqDecode = (v) => {
  if (v < 0) return 0;
  let vp = Math.pow(v, 1 / p2);
  return 1e4 * Math.pow((C1 - vp) / (C3 * vp - C2), 1 / M1);
};
var rel = (v) => v / 203;
var convertJabToXyz65 = ({ j, a, b, alpha }) => {
  if (j === void 0) j = 0;
  if (a === void 0) a = 0;
  if (b === void 0) b = 0;
  let i = (j + d02) / (0.44 + 0.56 * (j + d02));
  let l = jabPqDecode(i + 0.13860504 * a + 0.058047316 * b);
  let m = jabPqDecode(i - 0.13860504 * a - 0.058047316 * b);
  let s = jabPqDecode(i - 0.096019242 * a - 0.8118919 * b);
  let res = {
    mode: "xyz65",
    x: rel(
      1.661373024652174 * l - 0.914523081304348 * m + 0.23136208173913045 * s
    ),
    y: rel(
      -0.3250758611844533 * l + 1.571847026732543 * m - 0.21825383453227928 * s
    ),
    z: rel(-0.090982811 * l - 0.31272829 * m + 1.5227666 * s)
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertJabToXyz65_default = convertJabToXyz65;

// node_modules/culori/src/jab/convertRgbToJab.js
var convertRgbToJab = (rgb2) => {
  let res = convertXyz65ToJab_default(convertRgbToXyz65_default(rgb2));
  if (rgb2.r === rgb2.b && rgb2.b === rgb2.g) {
    res.a = res.b = 0;
  }
  return res;
};
var convertRgbToJab_default = convertRgbToJab;

// node_modules/culori/src/jab/convertJabToRgb.js
var convertJabToRgb = (color) => convertXyz65ToRgb_default(convertJabToXyz65_default(color));
var convertJabToRgb_default = convertJabToRgb;

// node_modules/culori/src/jab/definition.js
var definition11 = {
  mode: "jab",
  channels: ["j", "a", "b", "alpha"],
  parse: ["--jzazbz"],
  serialize: "--jzazbz",
  fromMode: {
    rgb: convertRgbToJab_default,
    xyz65: convertXyz65ToJab_default
  },
  toMode: {
    rgb: convertJabToRgb_default,
    xyz65: convertJabToXyz65_default
  },
  ranges: {
    j: [0, 0.222],
    a: [-0.109, 0.129],
    b: [-0.185, 0.134]
  },
  interpolate: {
    j: interpolatorLinear,
    a: interpolatorLinear,
    b: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  }
};
var definition_default11 = definition11;

// node_modules/culori/src/jch/convertJabToJch.js
var convertJabToJch = ({ j, a, b, alpha }) => {
  if (a === void 0) a = 0;
  if (b === void 0) b = 0;
  let c2 = Math.sqrt(a * a + b * b);
  let res = {
    mode: "jch",
    j,
    c: c2
  };
  if (c2) {
    res.h = normalizeHue_default(Math.atan2(b, a) * 180 / Math.PI);
  }
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertJabToJch_default = convertJabToJch;

// node_modules/culori/src/jch/convertJchToJab.js
var convertJchToJab = ({ j, c: c2, h, alpha }) => {
  if (h === void 0) h = 0;
  let res = {
    mode: "jab",
    j,
    a: c2 ? c2 * Math.cos(h / 180 * Math.PI) : 0,
    b: c2 ? c2 * Math.sin(h / 180 * Math.PI) : 0
  };
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertJchToJab_default = convertJchToJab;

// node_modules/culori/src/jch/definition.js
var definition12 = {
  mode: "jch",
  parse: ["--jzczhz"],
  serialize: "--jzczhz",
  toMode: {
    jab: convertJchToJab_default,
    rgb: (c2) => convertJabToRgb_default(convertJchToJab_default(c2))
  },
  fromMode: {
    rgb: (c2) => convertJabToJch_default(convertRgbToJab_default(c2)),
    jab: convertJabToJch_default
  },
  channels: ["j", "c", "h", "alpha"],
  ranges: {
    j: [0, 0.221],
    c: [0, 0.19],
    h: [0, 360]
  },
  interpolate: {
    h: { use: interpolatorLinear, fixup: fixupHueShorter },
    c: interpolatorLinear,
    j: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  },
  difference: {
    h: differenceHueChroma
  },
  average: {
    h: averageAngle
  }
};
var definition_default12 = definition12;

// node_modules/culori/src/xyz50/constants.js
var k3 = Math.pow(29, 3) / Math.pow(3, 3);
var e3 = Math.pow(6, 3) / Math.pow(29, 3);

// node_modules/culori/src/lab/convertLabToXyz50.js
var fn4 = (v) => Math.pow(v, 3) > e3 ? Math.pow(v, 3) : (116 * v - 16) / k3;
var convertLabToXyz50 = ({ l, a, b, alpha }) => {
  if (l === void 0) l = 0;
  if (a === void 0) a = 0;
  if (b === void 0) b = 0;
  let fy = (l + 16) / 116;
  let fx = a / 500 + fy;
  let fz = fy - b / 200;
  let res = {
    mode: "xyz50",
    x: fn4(fx) * D50.X,
    y: fn4(fy) * D50.Y,
    z: fn4(fz) * D50.Z
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertLabToXyz50_default = convertLabToXyz50;

// node_modules/culori/src/xyz50/convertXyz50ToRgb.js
var convertXyz50ToRgb = ({ x, y, z, alpha }) => {
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (z === void 0) z = 0;
  let res = convertLrgbToRgb_default({
    r: x * 3.1341359569958707 - y * 1.6173863321612538 - 0.4906619460083532 * z,
    g: x * -0.978795502912089 + y * 1.916254567259524 + 0.03344273116131949 * z,
    b: x * 0.07195537988411677 - y * 0.2289768264158322 + 1.405386058324125 * z
  });
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz50ToRgb_default = convertXyz50ToRgb;

// node_modules/culori/src/lab/convertLabToRgb.js
var convertLabToRgb = (lab2) => convertXyz50ToRgb_default(convertLabToXyz50_default(lab2));
var convertLabToRgb_default = convertLabToRgb;

// node_modules/culori/src/xyz50/convertRgbToXyz50.js
var convertRgbToXyz50 = (rgb2) => {
  let { r, g, b, alpha } = convertRgbToLrgb_default(rgb2);
  let res = {
    mode: "xyz50",
    x: 0.436065742824811 * r + 0.3851514688337912 * g + 0.14307845442264197 * b,
    y: 0.22249319175623702 * r + 0.7168870538238823 * g + 0.06061979053616537 * b,
    z: 0.013923904500943465 * r + 0.09708128566574634 * g + 0.7140993584005155 * b
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertRgbToXyz50_default = convertRgbToXyz50;

// node_modules/culori/src/lab/convertXyz50ToLab.js
var f2 = (value) => value > e3 ? Math.cbrt(value) : (k3 * value + 16) / 116;
var convertXyz50ToLab = ({ x, y, z, alpha }) => {
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (z === void 0) z = 0;
  let f0 = f2(x / D50.X);
  let f1 = f2(y / D50.Y);
  let f22 = f2(z / D50.Z);
  let res = {
    mode: "lab",
    l: 116 * f1 - 16,
    a: 500 * (f0 - f1),
    b: 200 * (f1 - f22)
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz50ToLab_default = convertXyz50ToLab;

// node_modules/culori/src/lab/convertRgbToLab.js
var convertRgbToLab = (rgb2) => {
  let res = convertXyz50ToLab_default(convertRgbToXyz50_default(rgb2));
  if (rgb2.r === rgb2.b && rgb2.b === rgb2.g) {
    res.a = res.b = 0;
  }
  return res;
};
var convertRgbToLab_default = convertRgbToLab;

// node_modules/culori/src/lab/parseLab.js
function parseLab(color, parsed) {
  if (!parsed || parsed[0] !== "lab") {
    return void 0;
  }
  const res = { mode: "lab" };
  const [, l, a, b, alpha] = parsed;
  if (l.type === Tok.Hue || a.type === Tok.Hue || b.type === Tok.Hue) {
    return void 0;
  }
  if (l.type !== Tok.None) {
    res.l = Math.min(Math.max(0, l.value), 100);
  }
  if (a.type !== Tok.None) {
    res.a = a.type === Tok.Number ? a.value : a.value * 125 / 100;
  }
  if (b.type !== Tok.None) {
    res.b = b.type === Tok.Number ? b.value : b.value * 125 / 100;
  }
  if (alpha.type !== Tok.None) {
    res.alpha = Math.min(
      1,
      Math.max(
        0,
        alpha.type === Tok.Number ? alpha.value : alpha.value / 100
      )
    );
  }
  return res;
}
var parseLab_default = parseLab;

// node_modules/culori/src/lab/definition.js
var definition13 = {
  mode: "lab",
  toMode: {
    xyz50: convertLabToXyz50_default,
    rgb: convertLabToRgb_default
  },
  fromMode: {
    xyz50: convertXyz50ToLab_default,
    rgb: convertRgbToLab_default
  },
  channels: ["l", "a", "b", "alpha"],
  ranges: {
    l: [0, 100],
    a: [-125, 125],
    b: [-125, 125]
  },
  parse: [parseLab_default],
  serialize: (c2) => `lab(${c2.l !== void 0 ? c2.l : "none"} ${c2.a !== void 0 ? c2.a : "none"} ${c2.b !== void 0 ? c2.b : "none"}${c2.alpha < 1 ? ` / ${c2.alpha}` : ""})`,
  interpolate: {
    l: interpolatorLinear,
    a: interpolatorLinear,
    b: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  }
};
var definition_default13 = definition13;

// node_modules/culori/src/lab65/definition.js
var definition14 = {
  ...definition_default13,
  mode: "lab65",
  parse: ["--lab-d65"],
  serialize: "--lab-d65",
  toMode: {
    xyz65: convertLab65ToXyz65_default,
    rgb: convertLab65ToRgb_default
  },
  fromMode: {
    xyz65: convertXyz65ToLab65_default,
    rgb: convertRgbToLab65_default
  },
  ranges: {
    l: [0, 100],
    a: [-125, 125],
    b: [-125, 125]
  }
};
var definition_default14 = definition14;

// node_modules/culori/src/lch/parseLch.js
function parseLch(color, parsed) {
  if (!parsed || parsed[0] !== "lch") {
    return void 0;
  }
  const res = { mode: "lch" };
  const [, l, c2, h, alpha] = parsed;
  if (l.type !== Tok.None) {
    if (l.type === Tok.Hue) {
      return void 0;
    }
    res.l = Math.min(Math.max(0, l.value), 100);
  }
  if (c2.type !== Tok.None) {
    res.c = Math.max(
      0,
      c2.type === Tok.Number ? c2.value : c2.value * 150 / 100
    );
  }
  if (h.type !== Tok.None) {
    if (h.type === Tok.Percentage) {
      return void 0;
    }
    res.h = h.value;
  }
  if (alpha.type !== Tok.None) {
    res.alpha = Math.min(
      1,
      Math.max(
        0,
        alpha.type === Tok.Number ? alpha.value : alpha.value / 100
      )
    );
  }
  return res;
}
var parseLch_default = parseLch;

// node_modules/culori/src/lch/definition.js
var definition15 = {
  mode: "lch",
  toMode: {
    lab: convertLchToLab_default,
    rgb: (c2) => convertLabToRgb_default(convertLchToLab_default(c2))
  },
  fromMode: {
    rgb: (c2) => convertLabToLch_default(convertRgbToLab_default(c2)),
    lab: convertLabToLch_default
  },
  channels: ["l", "c", "h", "alpha"],
  ranges: {
    l: [0, 100],
    c: [0, 150],
    h: [0, 360]
  },
  parse: [parseLch_default],
  serialize: (c2) => `lch(${c2.l !== void 0 ? c2.l : "none"} ${c2.c !== void 0 ? c2.c : "none"} ${c2.h !== void 0 ? c2.h : "none"}${c2.alpha < 1 ? ` / ${c2.alpha}` : ""})`,
  interpolate: {
    h: { use: interpolatorLinear, fixup: fixupHueShorter },
    c: interpolatorLinear,
    l: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  },
  difference: {
    h: differenceHueChroma
  },
  average: {
    h: averageAngle
  }
};
var definition_default15 = definition15;

// node_modules/culori/src/lch65/definition.js
var definition16 = {
  ...definition_default15,
  mode: "lch65",
  parse: ["--lch-d65"],
  serialize: "--lch-d65",
  toMode: {
    lab65: (c2) => convertLchToLab_default(c2, "lab65"),
    rgb: (c2) => convertLab65ToRgb_default(convertLchToLab_default(c2, "lab65"))
  },
  fromMode: {
    rgb: (c2) => convertLabToLch_default(convertRgbToLab65_default(c2), "lch65"),
    lab65: (c2) => convertLabToLch_default(c2, "lch65")
  },
  ranges: {
    l: [0, 100],
    c: [0, 150],
    h: [0, 360]
  }
};
var definition_default16 = definition16;

// node_modules/culori/src/lchuv/convertLuvToLchuv.js
var convertLuvToLchuv = ({ l, u, v, alpha }) => {
  if (u === void 0) u = 0;
  if (v === void 0) v = 0;
  let c2 = Math.sqrt(u * u + v * v);
  let res = {
    mode: "lchuv",
    l,
    c: c2
  };
  if (c2) {
    res.h = normalizeHue_default(Math.atan2(v, u) * 180 / Math.PI);
  }
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertLuvToLchuv_default = convertLuvToLchuv;

// node_modules/culori/src/lchuv/convertLchuvToLuv.js
var convertLchuvToLuv = ({ l, c: c2, h, alpha }) => {
  if (h === void 0) h = 0;
  let res = {
    mode: "luv",
    l,
    u: c2 ? c2 * Math.cos(h / 180 * Math.PI) : 0,
    v: c2 ? c2 * Math.sin(h / 180 * Math.PI) : 0
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertLchuvToLuv_default = convertLchuvToLuv;

// node_modules/culori/src/luv/convertXyz50ToLuv.js
var u_fn = (x, y, z) => 4 * x / (x + 15 * y + 3 * z);
var v_fn = (x, y, z) => 9 * y / (x + 15 * y + 3 * z);
var un = u_fn(D50.X, D50.Y, D50.Z);
var vn = v_fn(D50.X, D50.Y, D50.Z);
var l_fn = (value) => value <= e3 ? k3 * value : 116 * Math.cbrt(value) - 16;
var convertXyz50ToLuv = ({ x, y, z, alpha }) => {
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (z === void 0) z = 0;
  let l = l_fn(y / D50.Y);
  let u = u_fn(x, y, z);
  let v = v_fn(x, y, z);
  if (!isFinite(u) || !isFinite(v)) {
    l = u = v = 0;
  } else {
    u = 13 * l * (u - un);
    v = 13 * l * (v - vn);
  }
  let res = {
    mode: "luv",
    l,
    u,
    v
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz50ToLuv_default = convertXyz50ToLuv;

// node_modules/culori/src/luv/convertLuvToXyz50.js
var u_fn2 = (x, y, z) => 4 * x / (x + 15 * y + 3 * z);
var v_fn2 = (x, y, z) => 9 * y / (x + 15 * y + 3 * z);
var un2 = u_fn2(D50.X, D50.Y, D50.Z);
var vn2 = v_fn2(D50.X, D50.Y, D50.Z);
var convertLuvToXyz50 = ({ l, u, v, alpha }) => {
  if (l === void 0) l = 0;
  if (l === 0) {
    return { mode: "xyz50", x: 0, y: 0, z: 0 };
  }
  if (u === void 0) u = 0;
  if (v === void 0) v = 0;
  let up = u / (13 * l) + un2;
  let vp = v / (13 * l) + vn2;
  let y = D50.Y * (l <= 8 ? l / k3 : Math.pow((l + 16) / 116, 3));
  let x = y * (9 * up) / (4 * vp);
  let z = y * (12 - 3 * up - 20 * vp) / (4 * vp);
  let res = { mode: "xyz50", x, y, z };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertLuvToXyz50_default = convertLuvToXyz50;

// node_modules/culori/src/lchuv/definition.js
var convertRgbToLchuv = (rgb2) => convertLuvToLchuv_default(convertXyz50ToLuv_default(convertRgbToXyz50_default(rgb2)));
var convertLchuvToRgb = (lchuv2) => convertXyz50ToRgb_default(convertLuvToXyz50_default(convertLchuvToLuv_default(lchuv2)));
var definition17 = {
  mode: "lchuv",
  toMode: {
    luv: convertLchuvToLuv_default,
    rgb: convertLchuvToRgb
  },
  fromMode: {
    rgb: convertRgbToLchuv,
    luv: convertLuvToLchuv_default
  },
  channels: ["l", "c", "h", "alpha"],
  parse: ["--lchuv"],
  serialize: "--lchuv",
  ranges: {
    l: [0, 100],
    c: [0, 176.956],
    h: [0, 360]
  },
  interpolate: {
    h: { use: interpolatorLinear, fixup: fixupHueShorter },
    c: interpolatorLinear,
    l: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  },
  difference: {
    h: differenceHueChroma
  },
  average: {
    h: averageAngle
  }
};
var definition_default17 = definition17;

// node_modules/culori/src/lrgb/definition.js
var definition18 = {
  ...definition_default,
  mode: "lrgb",
  toMode: {
    rgb: convertLrgbToRgb_default
  },
  fromMode: {
    rgb: convertRgbToLrgb_default
  },
  parse: ["srgb-linear"],
  serialize: "srgb-linear"
};
var definition_default18 = definition18;

// node_modules/culori/src/luv/definition.js
var definition19 = {
  mode: "luv",
  toMode: {
    xyz50: convertLuvToXyz50_default,
    rgb: (luv2) => convertXyz50ToRgb_default(convertLuvToXyz50_default(luv2))
  },
  fromMode: {
    xyz50: convertXyz50ToLuv_default,
    rgb: (rgb2) => convertXyz50ToLuv_default(convertRgbToXyz50_default(rgb2))
  },
  channels: ["l", "u", "v", "alpha"],
  parse: ["--luv"],
  serialize: "--luv",
  ranges: {
    l: [0, 100],
    u: [-84.936, 175.042],
    v: [-125.882, 87.243]
  },
  interpolate: {
    l: interpolatorLinear,
    u: interpolatorLinear,
    v: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  }
};
var definition_default19 = definition19;

// node_modules/culori/src/oklab/convertLrgbToOklab.js
var convertLrgbToOklab = ({ r, g, b, alpha }) => {
  if (r === void 0) r = 0;
  if (g === void 0) g = 0;
  if (b === void 0) b = 0;
  let L = Math.cbrt(
    0.412221469470763 * r + 0.5363325372617348 * g + 0.0514459932675022 * b
  );
  let M3 = Math.cbrt(
    0.2119034958178252 * r + 0.6806995506452344 * g + 0.1073969535369406 * b
  );
  let S = Math.cbrt(
    0.0883024591900564 * r + 0.2817188391361215 * g + 0.6299787016738222 * b
  );
  let res = {
    mode: "oklab",
    l: 0.210454268309314 * L + 0.7936177747023054 * M3 - 0.0040720430116193 * S,
    a: 1.9779985324311684 * L - 2.42859224204858 * M3 + 0.450593709617411 * S,
    b: 0.0259040424655478 * L + 0.7827717124575296 * M3 - 0.8086757549230774 * S
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertLrgbToOklab_default = convertLrgbToOklab;

// node_modules/culori/src/oklab/convertRgbToOklab.js
var convertRgbToOklab = (rgb2) => {
  let res = convertLrgbToOklab_default(convertRgbToLrgb_default(rgb2));
  if (rgb2.r === rgb2.b && rgb2.b === rgb2.g) {
    res.a = res.b = 0;
  }
  return res;
};
var convertRgbToOklab_default = convertRgbToOklab;

// node_modules/culori/src/oklab/convertOklabToLrgb.js
var convertOklabToLrgb = ({ l, a, b, alpha }) => {
  if (l === void 0) l = 0;
  if (a === void 0) a = 0;
  if (b === void 0) b = 0;
  let L = Math.pow(l + 0.3963377773761749 * a + 0.2158037573099136 * b, 3);
  let M3 = Math.pow(l - 0.1055613458156586 * a - 0.0638541728258133 * b, 3);
  let S = Math.pow(l - 0.0894841775298119 * a - 1.2914855480194092 * b, 3);
  let res = {
    mode: "lrgb",
    r: 4.076741636075957 * L - 3.3077115392580616 * M3 + 0.2309699031821044 * S,
    g: -1.2684379732850317 * L + 2.6097573492876887 * M3 - 0.3413193760026573 * S,
    b: -0.0041960761386756 * L - 0.7034186179359362 * M3 + 1.7076146940746117 * S
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertOklabToLrgb_default = convertOklabToLrgb;

// node_modules/culori/src/oklab/convertOklabToRgb.js
var convertOklabToRgb = (c2) => convertLrgbToRgb_default(convertOklabToLrgb_default(c2));
var convertOklabToRgb_default = convertOklabToRgb;

// node_modules/culori/src/okhsl/helpers.js
function toe(x) {
  const k_1 = 0.206;
  const k_2 = 0.03;
  const k_3 = (1 + k_1) / (1 + k_2);
  return 0.5 * (k_3 * x - k_1 + Math.sqrt((k_3 * x - k_1) * (k_3 * x - k_1) + 4 * k_2 * k_3 * x));
}
function toe_inv(x) {
  const k_1 = 0.206;
  const k_2 = 0.03;
  const k_3 = (1 + k_1) / (1 + k_2);
  return (x * x + k_1 * x) / (k_3 * (x + k_2));
}
function compute_max_saturation(a, b) {
  let k0, k1, k22, k32, k4, wl, wm, ws;
  if (-1.88170328 * a - 0.80936493 * b > 1) {
    k0 = 1.19086277;
    k1 = 1.76576728;
    k22 = 0.59662641;
    k32 = 0.75515197;
    k4 = 0.56771245;
    wl = 4.0767416621;
    wm = -3.3077115913;
    ws = 0.2309699292;
  } else if (1.81444104 * a - 1.19445276 * b > 1) {
    k0 = 0.73956515;
    k1 = -0.45954404;
    k22 = 0.08285427;
    k32 = 0.1254107;
    k4 = 0.14503204;
    wl = -1.2684380046;
    wm = 2.6097574011;
    ws = -0.3413193965;
  } else {
    k0 = 1.35733652;
    k1 = -915799e-8;
    k22 = -1.1513021;
    k32 = -0.50559606;
    k4 = 692167e-8;
    wl = -0.0041960863;
    wm = -0.7034186147;
    ws = 1.707614701;
  }
  let S = k0 + k1 * a + k22 * b + k32 * a * a + k4 * a * b;
  let k_l = 0.3963377774 * a + 0.2158037573 * b;
  let k_m = -0.1055613458 * a - 0.0638541728 * b;
  let k_s = -0.0894841775 * a - 1.291485548 * b;
  {
    let l_ = 1 + S * k_l;
    let m_ = 1 + S * k_m;
    let s_ = 1 + S * k_s;
    let l = l_ * l_ * l_;
    let m = m_ * m_ * m_;
    let s = s_ * s_ * s_;
    let l_dS = 3 * k_l * l_ * l_;
    let m_dS = 3 * k_m * m_ * m_;
    let s_dS = 3 * k_s * s_ * s_;
    let l_dS2 = 6 * k_l * k_l * l_;
    let m_dS2 = 6 * k_m * k_m * m_;
    let s_dS2 = 6 * k_s * k_s * s_;
    let f3 = wl * l + wm * m + ws * s;
    let f1 = wl * l_dS + wm * m_dS + ws * s_dS;
    let f22 = wl * l_dS2 + wm * m_dS2 + ws * s_dS2;
    S = S - f3 * f1 / (f1 * f1 - 0.5 * f3 * f22);
  }
  return S;
}
function find_cusp(a, b) {
  let S_cusp = compute_max_saturation(a, b);
  let rgb2 = convertOklabToLrgb_default({ l: 1, a: S_cusp * a, b: S_cusp * b });
  let L_cusp = Math.cbrt(1 / Math.max(rgb2.r, rgb2.g, rgb2.b));
  let C_cusp = L_cusp * S_cusp;
  return [L_cusp, C_cusp];
}
function find_gamut_intersection(a, b, L1, C12, L0, cusp = null) {
  if (!cusp) {
    cusp = find_cusp(a, b);
  }
  let t;
  if ((L1 - L0) * cusp[1] - (cusp[0] - L0) * C12 <= 0) {
    t = cusp[1] * L0 / (C12 * cusp[0] + cusp[1] * (L0 - L1));
  } else {
    t = cusp[1] * (L0 - 1) / (C12 * (cusp[0] - 1) + cusp[1] * (L0 - L1));
    {
      let dL = L1 - L0;
      let dC = C12;
      let k_l = 0.3963377774 * a + 0.2158037573 * b;
      let k_m = -0.1055613458 * a - 0.0638541728 * b;
      let k_s = -0.0894841775 * a - 1.291485548 * b;
      let l_dt = dL + dC * k_l;
      let m_dt = dL + dC * k_m;
      let s_dt = dL + dC * k_s;
      {
        let L = L0 * (1 - t) + t * L1;
        let C = t * C12;
        let l_ = L + C * k_l;
        let m_ = L + C * k_m;
        let s_ = L + C * k_s;
        let l = l_ * l_ * l_;
        let m = m_ * m_ * m_;
        let s = s_ * s_ * s_;
        let ldt = 3 * l_dt * l_ * l_;
        let mdt = 3 * m_dt * m_ * m_;
        let sdt = 3 * s_dt * s_ * s_;
        let ldt2 = 6 * l_dt * l_dt * l_;
        let mdt2 = 6 * m_dt * m_dt * m_;
        let sdt2 = 6 * s_dt * s_dt * s_;
        let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s - 1;
        let r1 = 4.0767416621 * ldt - 3.3077115913 * mdt + 0.2309699292 * sdt;
        let r2 = 4.0767416621 * ldt2 - 3.3077115913 * mdt2 + 0.2309699292 * sdt2;
        let u_r = r1 / (r1 * r1 - 0.5 * r * r2);
        let t_r = -r * u_r;
        let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s - 1;
        let g1 = -1.2684380046 * ldt + 2.6097574011 * mdt - 0.3413193965 * sdt;
        let g2 = -1.2684380046 * ldt2 + 2.6097574011 * mdt2 - 0.3413193965 * sdt2;
        let u_g = g1 / (g1 * g1 - 0.5 * g * g2);
        let t_g = -g * u_g;
        let b2 = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s - 1;
        let b1 = -0.0041960863 * ldt - 0.7034186147 * mdt + 1.707614701 * sdt;
        let b22 = -0.0041960863 * ldt2 - 0.7034186147 * mdt2 + 1.707614701 * sdt2;
        let u_b = b1 / (b1 * b1 - 0.5 * b2 * b22);
        let t_b = -b2 * u_b;
        t_r = u_r >= 0 ? t_r : 1e6;
        t_g = u_g >= 0 ? t_g : 1e6;
        t_b = u_b >= 0 ? t_b : 1e6;
        t += Math.min(t_r, Math.min(t_g, t_b));
      }
    }
  }
  return t;
}
function get_ST_max(a_, b_, cusp = null) {
  if (!cusp) {
    cusp = find_cusp(a_, b_);
  }
  let L = cusp[0];
  let C = cusp[1];
  return [C / L, C / (1 - L)];
}
function get_Cs(L, a_, b_) {
  let cusp = find_cusp(a_, b_);
  let C_max = find_gamut_intersection(a_, b_, L, 1, L, cusp);
  let ST_max = get_ST_max(a_, b_, cusp);
  let S_mid = 0.11516993 + 1 / (7.4477897 + 4.1590124 * b_ + a_ * (-2.19557347 + 1.75198401 * b_ + a_ * (-2.13704948 - 10.02301043 * b_ + a_ * (-4.24894561 + 5.38770819 * b_ + 4.69891013 * a_))));
  let T_mid = 0.11239642 + 1 / (1.6132032 - 0.68124379 * b_ + a_ * (0.40370612 + 0.90148123 * b_ + a_ * (-0.27087943 + 0.6122399 * b_ + a_ * (299215e-8 - 0.45399568 * b_ - 0.14661872 * a_))));
  let k4 = C_max / Math.min(L * ST_max[0], (1 - L) * ST_max[1]);
  let C_a = L * S_mid;
  let C_b = (1 - L) * T_mid;
  let C_mid = 0.9 * k4 * Math.sqrt(
    Math.sqrt(
      1 / (1 / (C_a * C_a * C_a * C_a) + 1 / (C_b * C_b * C_b * C_b))
    )
  );
  C_a = L * 0.4;
  C_b = (1 - L) * 0.8;
  let C_0 = Math.sqrt(1 / (1 / (C_a * C_a) + 1 / (C_b * C_b)));
  return [C_0, C_mid, C_max];
}

// node_modules/culori/src/okhsl/convertOklabToOkhsl.js
function convertOklabToOkhsl(lab2) {
  const l = lab2.l !== void 0 ? lab2.l : 0;
  const a = lab2.a !== void 0 ? lab2.a : 0;
  const b = lab2.b !== void 0 ? lab2.b : 0;
  const ret = { mode: "okhsl", l: toe(l) };
  if (lab2.alpha !== void 0) {
    ret.alpha = lab2.alpha;
  }
  let c2 = Math.sqrt(a * a + b * b);
  if (!c2) {
    ret.s = 0;
    return ret;
  }
  let [C_0, C_mid, C_max] = get_Cs(l, a / c2, b / c2);
  let s;
  if (c2 < C_mid) {
    let k_0 = 0;
    let k_1 = 0.8 * C_0;
    let k_2 = 1 - k_1 / C_mid;
    let t = (c2 - k_0) / (k_1 + k_2 * (c2 - k_0));
    s = t * 0.8;
  } else {
    let k_0 = C_mid;
    let k_1 = 0.2 * C_mid * C_mid * 1.25 * 1.25 / C_0;
    let k_2 = 1 - k_1 / (C_max - C_mid);
    let t = (c2 - k_0) / (k_1 + k_2 * (c2 - k_0));
    s = 0.8 + 0.2 * t;
  }
  if (s) {
    ret.s = s;
    ret.h = normalizeHue_default(Math.atan2(b, a) * 180 / Math.PI);
  }
  return ret;
}

// node_modules/culori/src/okhsl/convertOkhslToOklab.js
function convertOkhslToOklab(hsl2) {
  let h = hsl2.h !== void 0 ? hsl2.h : 0;
  let s = hsl2.s !== void 0 ? hsl2.s : 0;
  let l = hsl2.l !== void 0 ? hsl2.l : 0;
  const ret = { mode: "oklab", l: toe_inv(l) };
  if (hsl2.alpha !== void 0) {
    ret.alpha = hsl2.alpha;
  }
  if (!s || l === 1) {
    ret.a = ret.b = 0;
    return ret;
  }
  let a_ = Math.cos(h / 180 * Math.PI);
  let b_ = Math.sin(h / 180 * Math.PI);
  let [C_0, C_mid, C_max] = get_Cs(ret.l, a_, b_);
  let t, k_0, k_1, k_2;
  if (s < 0.8) {
    t = 1.25 * s;
    k_0 = 0;
    k_1 = 0.8 * C_0;
    k_2 = 1 - k_1 / C_mid;
  } else {
    t = 5 * (s - 0.8);
    k_0 = C_mid;
    k_1 = 0.2 * C_mid * C_mid * 1.25 * 1.25 / C_0;
    k_2 = 1 - k_1 / (C_max - C_mid);
  }
  let C = k_0 + t * k_1 / (1 - k_2 * t);
  ret.a = C * a_;
  ret.b = C * b_;
  return ret;
}

// node_modules/culori/src/okhsl/modeOkhsl.js
var modeOkhsl = {
  ...definition_default7,
  mode: "okhsl",
  channels: ["h", "s", "l", "alpha"],
  parse: ["--okhsl"],
  serialize: "--okhsl",
  fromMode: {
    oklab: convertOklabToOkhsl,
    rgb: (c2) => convertOklabToOkhsl(convertRgbToOklab_default(c2))
  },
  toMode: {
    oklab: convertOkhslToOklab,
    rgb: (c2) => convertOklabToRgb_default(convertOkhslToOklab(c2))
  }
};
var modeOkhsl_default = modeOkhsl;

// node_modules/culori/src/okhsv/convertOklabToOkhsv.js
function convertOklabToOkhsv(lab2) {
  let l = lab2.l !== void 0 ? lab2.l : 0;
  let a = lab2.a !== void 0 ? lab2.a : 0;
  let b = lab2.b !== void 0 ? lab2.b : 0;
  let c2 = Math.sqrt(a * a + b * b);
  let a_ = c2 ? a / c2 : 1;
  let b_ = c2 ? b / c2 : 1;
  let [S_max, T] = get_ST_max(a_, b_);
  let S_0 = 0.5;
  let k4 = 1 - S_0 / S_max;
  let t = T / (c2 + l * T);
  let L_v = t * l;
  let C_v = t * c2;
  let L_vt = toe_inv(L_v);
  let C_vt = C_v * L_vt / L_v;
  let rgb_scale = convertOklabToLrgb_default({ l: L_vt, a: a_ * C_vt, b: b_ * C_vt });
  let scale_L = Math.cbrt(
    1 / Math.max(rgb_scale.r, rgb_scale.g, rgb_scale.b, 0)
  );
  l = l / scale_L;
  c2 = c2 / scale_L * toe(l) / l;
  l = toe(l);
  const ret = {
    mode: "okhsv",
    s: c2 ? (S_0 + T) * C_v / (T * S_0 + T * k4 * C_v) : 0,
    v: l ? l / L_v : 0
  };
  if (ret.s) {
    ret.h = normalizeHue_default(Math.atan2(b, a) * 180 / Math.PI);
  }
  if (lab2.alpha !== void 0) {
    ret.alpha = lab2.alpha;
  }
  return ret;
}

// node_modules/culori/src/okhsv/convertOkhsvToOklab.js
function convertOkhsvToOklab(hsv2) {
  const ret = { mode: "oklab" };
  if (hsv2.alpha !== void 0) {
    ret.alpha = hsv2.alpha;
  }
  const h = hsv2.h !== void 0 ? hsv2.h : 0;
  const s = hsv2.s !== void 0 ? hsv2.s : 0;
  const v = hsv2.v !== void 0 ? hsv2.v : 0;
  const a_ = Math.cos(h / 180 * Math.PI);
  const b_ = Math.sin(h / 180 * Math.PI);
  const [S_max, T] = get_ST_max(a_, b_);
  const S_0 = 0.5;
  const k4 = 1 - S_0 / S_max;
  const L_v = 1 - s * S_0 / (S_0 + T - T * k4 * s);
  const C_v = s * T * S_0 / (S_0 + T - T * k4 * s);
  const L_vt = toe_inv(L_v);
  const C_vt = C_v * L_vt / L_v;
  const rgb_scale = convertOklabToLrgb_default({
    l: L_vt,
    a: a_ * C_vt,
    b: b_ * C_vt
  });
  const scale_L = Math.cbrt(
    1 / Math.max(rgb_scale.r, rgb_scale.g, rgb_scale.b, 0)
  );
  const L_new = toe_inv(v * L_v);
  const C = C_v * L_new / L_v;
  ret.l = L_new * scale_L;
  ret.a = C * a_ * scale_L;
  ret.b = C * b_ * scale_L;
  return ret;
}

// node_modules/culori/src/okhsv/modeOkhsv.js
var modeOkhsv = {
  ...definition_default8,
  mode: "okhsv",
  channels: ["h", "s", "v", "alpha"],
  parse: ["--okhsv"],
  serialize: "--okhsv",
  fromMode: {
    oklab: convertOklabToOkhsv,
    rgb: (c2) => convertOklabToOkhsv(convertRgbToOklab_default(c2))
  },
  toMode: {
    oklab: convertOkhsvToOklab,
    rgb: (c2) => convertOklabToRgb_default(convertOkhsvToOklab(c2))
  }
};
var modeOkhsv_default = modeOkhsv;

// node_modules/culori/src/oklab/parseOklab.js
function parseOklab(color, parsed) {
  if (!parsed || parsed[0] !== "oklab") {
    return void 0;
  }
  const res = { mode: "oklab" };
  const [, l, a, b, alpha] = parsed;
  if (l.type === Tok.Hue || a.type === Tok.Hue || b.type === Tok.Hue) {
    return void 0;
  }
  if (l.type !== Tok.None) {
    res.l = Math.min(
      Math.max(0, l.type === Tok.Number ? l.value : l.value / 100),
      1
    );
  }
  if (a.type !== Tok.None) {
    res.a = a.type === Tok.Number ? a.value : a.value * 0.4 / 100;
  }
  if (b.type !== Tok.None) {
    res.b = b.type === Tok.Number ? b.value : b.value * 0.4 / 100;
  }
  if (alpha.type !== Tok.None) {
    res.alpha = Math.min(
      1,
      Math.max(
        0,
        alpha.type === Tok.Number ? alpha.value : alpha.value / 100
      )
    );
  }
  return res;
}
var parseOklab_default = parseOklab;

// node_modules/culori/src/oklab/definition.js
var definition20 = {
  ...definition_default13,
  mode: "oklab",
  toMode: {
    lrgb: convertOklabToLrgb_default,
    rgb: convertOklabToRgb_default
  },
  fromMode: {
    lrgb: convertLrgbToOklab_default,
    rgb: convertRgbToOklab_default
  },
  ranges: {
    l: [0, 1],
    a: [-0.4, 0.4],
    b: [-0.4, 0.4]
  },
  parse: [parseOklab_default],
  serialize: (c2) => `oklab(${c2.l !== void 0 ? c2.l : "none"} ${c2.a !== void 0 ? c2.a : "none"} ${c2.b !== void 0 ? c2.b : "none"}${c2.alpha < 1 ? ` / ${c2.alpha}` : ""})`
};
var definition_default20 = definition20;

// node_modules/culori/src/oklch/parseOklch.js
function parseOklch(color, parsed) {
  if (!parsed || parsed[0] !== "oklch") {
    return void 0;
  }
  const res = { mode: "oklch" };
  const [, l, c2, h, alpha] = parsed;
  if (l.type !== Tok.None) {
    if (l.type === Tok.Hue) {
      return void 0;
    }
    res.l = Math.min(
      Math.max(0, l.type === Tok.Number ? l.value : l.value / 100),
      1
    );
  }
  if (c2.type !== Tok.None) {
    res.c = Math.max(
      0,
      c2.type === Tok.Number ? c2.value : c2.value * 0.4 / 100
    );
  }
  if (h.type !== Tok.None) {
    if (h.type === Tok.Percentage) {
      return void 0;
    }
    res.h = h.value;
  }
  if (alpha.type !== Tok.None) {
    res.alpha = Math.min(
      1,
      Math.max(
        0,
        alpha.type === Tok.Number ? alpha.value : alpha.value / 100
      )
    );
  }
  return res;
}
var parseOklch_default = parseOklch;

// node_modules/culori/src/oklch/definition.js
var definition21 = {
  ...definition_default15,
  mode: "oklch",
  toMode: {
    oklab: (c2) => convertLchToLab_default(c2, "oklab"),
    rgb: (c2) => convertOklabToRgb_default(convertLchToLab_default(c2, "oklab"))
  },
  fromMode: {
    rgb: (c2) => convertLabToLch_default(convertRgbToOklab_default(c2), "oklch"),
    oklab: (c2) => convertLabToLch_default(c2, "oklch")
  },
  parse: [parseOklch_default],
  serialize: (c2) => `oklch(${c2.l !== void 0 ? c2.l : "none"} ${c2.c !== void 0 ? c2.c : "none"} ${c2.h !== void 0 ? c2.h : "none"}${c2.alpha < 1 ? ` / ${c2.alpha}` : ""})`,
  ranges: {
    l: [0, 1],
    c: [0, 0.4],
    h: [0, 360]
  }
};
var definition_default21 = definition21;

// node_modules/culori/src/p3/convertP3ToXyz65.js
var convertP3ToXyz65 = (rgb2) => {
  let { r, g, b, alpha } = convertRgbToLrgb_default(rgb2);
  let res = {
    mode: "xyz65",
    x: 0.486570948648216 * r + 0.265667693169093 * g + 0.1982172852343625 * b,
    y: 0.2289745640697487 * r + 0.6917385218365062 * g + 0.079286914093745 * b,
    z: 0 * r + 0.0451133818589026 * g + 1.043944368900976 * b
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertP3ToXyz65_default = convertP3ToXyz65;

// node_modules/culori/src/p3/convertXyz65ToP3.js
var convertXyz65ToP3 = ({ x, y, z, alpha }) => {
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (z === void 0) z = 0;
  let res = convertLrgbToRgb_default(
    {
      r: x * 2.4934969119414263 - y * 0.9313836179191242 - 0.402710784450717 * z,
      g: x * -0.8294889695615749 + y * 1.7626640603183465 + 0.0236246858419436 * z,
      b: x * 0.0358458302437845 - y * 0.0761723892680418 + 0.9568845240076871 * z
    },
    "p3"
  );
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz65ToP3_default = convertXyz65ToP3;

// node_modules/culori/src/p3/definition.js
var definition22 = {
  ...definition_default,
  mode: "p3",
  parse: ["display-p3"],
  serialize: "display-p3",
  fromMode: {
    rgb: (color) => convertXyz65ToP3_default(convertRgbToXyz65_default(color)),
    xyz65: convertXyz65ToP3_default
  },
  toMode: {
    rgb: (color) => convertXyz65ToRgb_default(convertP3ToXyz65_default(color)),
    xyz65: convertP3ToXyz65_default
  }
};
var definition_default22 = definition22;

// node_modules/culori/src/prophoto/convertXyz50ToProphoto.js
var gamma2 = (v) => {
  let abs2 = Math.abs(v);
  if (abs2 >= 1 / 512) {
    return Math.sign(v) * Math.pow(abs2, 1 / 1.8);
  }
  return 16 * v;
};
var convertXyz50ToProphoto = ({ x, y, z, alpha }) => {
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (z === void 0) z = 0;
  let res = {
    mode: "prophoto",
    r: gamma2(
      x * 1.3457868816471585 - y * 0.2555720873797946 - 0.0511018649755453 * z
    ),
    g: gamma2(
      x * -0.5446307051249019 + y * 1.5082477428451466 + 0.0205274474364214 * z
    ),
    b: gamma2(x * 0 + y * 0 + 1.2119675456389452 * z)
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz50ToProphoto_default = convertXyz50ToProphoto;

// node_modules/culori/src/prophoto/convertProphotoToXyz50.js
var linearize2 = (v = 0) => {
  let abs2 = Math.abs(v);
  if (abs2 >= 16 / 512) {
    return Math.sign(v) * Math.pow(abs2, 1.8);
  }
  return v / 16;
};
var convertProphotoToXyz50 = (prophoto2) => {
  let r = linearize2(prophoto2.r);
  let g = linearize2(prophoto2.g);
  let b = linearize2(prophoto2.b);
  let res = {
    mode: "xyz50",
    x: 0.7977666449006423 * r + 0.1351812974005331 * g + 0.0313477341283922 * b,
    y: 0.2880748288194013 * r + 0.7118352342418731 * g + 899369387256e-16 * b,
    z: 0 * r + 0 * g + 0.8251046025104602 * b
  };
  if (prophoto2.alpha !== void 0) {
    res.alpha = prophoto2.alpha;
  }
  return res;
};
var convertProphotoToXyz50_default = convertProphotoToXyz50;

// node_modules/culori/src/prophoto/definition.js
var definition23 = {
  ...definition_default,
  mode: "prophoto",
  parse: ["prophoto-rgb"],
  serialize: "prophoto-rgb",
  fromMode: {
    xyz50: convertXyz50ToProphoto_default,
    rgb: (color) => convertXyz50ToProphoto_default(convertRgbToXyz50_default(color))
  },
  toMode: {
    xyz50: convertProphotoToXyz50_default,
    rgb: (color) => convertXyz50ToRgb_default(convertProphotoToXyz50_default(color))
  }
};
var definition_default23 = definition23;

// node_modules/culori/src/rec2020/convertXyz65ToRec2020.js
var \u03B1 = 1.09929682680944;
var \u03B2 = 0.018053968510807;
var gamma3 = (v) => {
  const abs2 = Math.abs(v);
  if (abs2 > \u03B2) {
    return (Math.sign(v) || 1) * (\u03B1 * Math.pow(abs2, 0.45) - (\u03B1 - 1));
  }
  return 4.5 * v;
};
var convertXyz65ToRec2020 = ({ x, y, z, alpha }) => {
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (z === void 0) z = 0;
  let res = {
    mode: "rec2020",
    r: gamma3(
      x * 1.7166511879712683 - y * 0.3556707837763925 - 0.2533662813736599 * z
    ),
    g: gamma3(
      x * -0.6666843518324893 + y * 1.6164812366349395 + 0.0157685458139111 * z
    ),
    b: gamma3(
      x * 0.0176398574453108 - y * 0.0427706132578085 + 0.9421031212354739 * z
    )
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz65ToRec2020_default = convertXyz65ToRec2020;

// node_modules/culori/src/rec2020/convertRec2020ToXyz65.js
var \u03B12 = 1.09929682680944;
var \u03B22 = 0.018053968510807;
var linearize3 = (v = 0) => {
  let abs2 = Math.abs(v);
  if (abs2 < \u03B22 * 4.5) {
    return v / 4.5;
  }
  return (Math.sign(v) || 1) * Math.pow((abs2 + \u03B12 - 1) / \u03B12, 1 / 0.45);
};
var convertRec2020ToXyz65 = (rec20202) => {
  let r = linearize3(rec20202.r);
  let g = linearize3(rec20202.g);
  let b = linearize3(rec20202.b);
  let res = {
    mode: "xyz65",
    x: 0.6369580483012911 * r + 0.1446169035862083 * g + 0.1688809751641721 * b,
    y: 0.262700212011267 * r + 0.6779980715188708 * g + 0.059301716469862 * b,
    z: 0 * r + 0.0280726930490874 * g + 1.0609850577107909 * b
  };
  if (rec20202.alpha !== void 0) {
    res.alpha = rec20202.alpha;
  }
  return res;
};
var convertRec2020ToXyz65_default = convertRec2020ToXyz65;

// node_modules/culori/src/rec2020/definition.js
var definition24 = {
  ...definition_default,
  mode: "rec2020",
  fromMode: {
    xyz65: convertXyz65ToRec2020_default,
    rgb: (color) => convertXyz65ToRec2020_default(convertRgbToXyz65_default(color))
  },
  toMode: {
    xyz65: convertRec2020ToXyz65_default,
    rgb: (color) => convertXyz65ToRgb_default(convertRec2020ToXyz65_default(color))
  },
  parse: ["rec2020"],
  serialize: "rec2020"
};
var definition_default24 = definition24;

// node_modules/culori/src/xyb/constants.js
var bias = 0.0037930732552754493;
var bias_cbrt = Math.cbrt(bias);

// node_modules/culori/src/xyb/convertRgbToXyb.js
var transfer = (v) => Math.cbrt(v) - bias_cbrt;
var convertRgbToXyb = (color) => {
  const { r, g, b, alpha } = convertRgbToLrgb_default(color);
  const l = transfer(0.3 * r + 0.622 * g + 0.078 * b + bias);
  const m = transfer(0.23 * r + 0.692 * g + 0.078 * b + bias);
  const s = transfer(
    0.2434226892454782 * r + 0.2047674442449682 * g + 0.5518098665095535 * b + bias
  );
  const res = {
    mode: "xyb",
    x: (l - m) / 2,
    y: (l + m) / 2,
    /* Apply default chroma from luma (subtract Y from B) */
    b: s - (l + m) / 2
  };
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertRgbToXyb_default = convertRgbToXyb;

// node_modules/culori/src/xyb/convertXybToRgb.js
var transfer2 = (v) => Math.pow(v + bias_cbrt, 3);
var convertXybToRgb = ({ x, y, b, alpha }) => {
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (b === void 0) b = 0;
  const l = transfer2(x + y) - bias;
  const m = transfer2(y - x) - bias;
  const s = transfer2(b + y) - bias;
  const res = convertLrgbToRgb_default({
    r: 11.031566904639861 * l - 9.866943908131562 * m - 0.16462299650829934 * s,
    g: -3.2541473810744237 * l + 4.418770377582723 * m - 0.16462299650829934 * s,
    b: -3.6588512867136815 * l + 2.7129230459360922 * m + 1.9459282407775895 * s
  });
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertXybToRgb_default = convertXybToRgb;

// node_modules/culori/src/xyb/definition.js
var definition25 = {
  mode: "xyb",
  channels: ["x", "y", "b", "alpha"],
  parse: ["--xyb"],
  serialize: "--xyb",
  toMode: {
    rgb: convertXybToRgb_default
  },
  fromMode: {
    rgb: convertRgbToXyb_default
  },
  ranges: {
    x: [-0.0154, 0.0281],
    y: [0, 0.8453],
    b: [-0.2778, 0.388]
  },
  interpolate: {
    x: interpolatorLinear,
    y: interpolatorLinear,
    b: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  }
};
var definition_default25 = definition25;

// node_modules/culori/src/xyz50/definition.js
var definition26 = {
  mode: "xyz50",
  parse: ["xyz-d50"],
  serialize: "xyz-d50",
  toMode: {
    rgb: convertXyz50ToRgb_default,
    lab: convertXyz50ToLab_default
  },
  fromMode: {
    rgb: convertRgbToXyz50_default,
    lab: convertLabToXyz50_default
  },
  channels: ["x", "y", "z", "alpha"],
  ranges: {
    x: [0, 0.964],
    y: [0, 0.999],
    z: [0, 0.825]
  },
  interpolate: {
    x: interpolatorLinear,
    y: interpolatorLinear,
    z: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  }
};
var definition_default26 = definition26;

// node_modules/culori/src/xyz65/convertXyz65ToXyz50.js
var convertXyz65ToXyz50 = (xyz652) => {
  let { x, y, z, alpha } = xyz652;
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (z === void 0) z = 0;
  let res = {
    mode: "xyz50",
    x: 1.0479298208405488 * x + 0.0229467933410191 * y - 0.0501922295431356 * z,
    y: 0.0296278156881593 * x + 0.990434484573249 * y - 0.0170738250293851 * z,
    z: -0.0092430581525912 * x + 0.0150551448965779 * y + 0.7518742899580008 * z
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz65ToXyz50_default = convertXyz65ToXyz50;

// node_modules/culori/src/xyz65/convertXyz50ToXyz65.js
var convertXyz50ToXyz65 = (xyz502) => {
  let { x, y, z, alpha } = xyz502;
  if (x === void 0) x = 0;
  if (y === void 0) y = 0;
  if (z === void 0) z = 0;
  let res = {
    mode: "xyz65",
    x: 0.9554734527042182 * x - 0.0230985368742614 * y + 0.0632593086610217 * z,
    y: -0.0283697069632081 * x + 1.0099954580058226 * y + 0.021041398966943 * z,
    z: 0.0123140016883199 * x - 0.0205076964334779 * y + 1.3303659366080753 * z
  };
  if (alpha !== void 0) {
    res.alpha = alpha;
  }
  return res;
};
var convertXyz50ToXyz65_default = convertXyz50ToXyz65;

// node_modules/culori/src/xyz65/definition.js
var definition27 = {
  mode: "xyz65",
  toMode: {
    rgb: convertXyz65ToRgb_default,
    xyz50: convertXyz65ToXyz50_default
  },
  fromMode: {
    rgb: convertRgbToXyz65_default,
    xyz50: convertXyz50ToXyz65_default
  },
  ranges: {
    x: [0, 0.95],
    y: [0, 1],
    z: [0, 1.088]
  },
  channels: ["x", "y", "z", "alpha"],
  parse: ["xyz", "xyz-d65"],
  serialize: "xyz-d65",
  interpolate: {
    x: interpolatorLinear,
    y: interpolatorLinear,
    z: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  }
};
var definition_default27 = definition27;

// node_modules/culori/src/yiq/convertRgbToYiq.js
var convertRgbToYiq = ({ r, g, b, alpha }) => {
  if (r === void 0) r = 0;
  if (g === void 0) g = 0;
  if (b === void 0) b = 0;
  const res = {
    mode: "yiq",
    y: 0.29889531 * r + 0.58662247 * g + 0.11448223 * b,
    i: 0.59597799 * r - 0.2741761 * g - 0.32180189 * b,
    q: 0.21147017 * r - 0.52261711 * g + 0.31114694 * b
  };
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertRgbToYiq_default = convertRgbToYiq;

// node_modules/culori/src/yiq/convertYiqToRgb.js
var convertYiqToRgb = ({ y, i, q, alpha }) => {
  if (y === void 0) y = 0;
  if (i === void 0) i = 0;
  if (q === void 0) q = 0;
  const res = {
    mode: "rgb",
    r: y + 0.95608445 * i + 0.6208885 * q,
    g: y - 0.27137664 * i - 0.6486059 * q,
    b: y - 1.10561724 * i + 1.70250126 * q
  };
  if (alpha !== void 0) res.alpha = alpha;
  return res;
};
var convertYiqToRgb_default = convertYiqToRgb;

// node_modules/culori/src/yiq/definition.js
var definition28 = {
  mode: "yiq",
  toMode: {
    rgb: convertYiqToRgb_default
  },
  fromMode: {
    rgb: convertRgbToYiq_default
  },
  channels: ["y", "i", "q", "alpha"],
  parse: ["--yiq"],
  serialize: "--yiq",
  ranges: {
    i: [-0.595, 0.595],
    q: [-0.522, 0.522]
  },
  interpolate: {
    y: interpolatorLinear,
    i: interpolatorLinear,
    q: interpolatorLinear,
    alpha: { use: interpolatorLinear, fixup: fixupAlpha }
  }
};
var definition_default28 = definition28;

// node_modules/culori/src/index.js
var a98 = useMode(definition_default2);
var cubehelix = useMode(definition_default3);
var dlab = useMode(definition_default4);
var dlch = useMode(definition_default5);
var hsi = useMode(definition_default6);
var hsl = useMode(definition_default7);
var hsv = useMode(definition_default8);
var hwb = useMode(definition_default9);
var itp = useMode(definition_default10);
var jab = useMode(definition_default11);
var jch = useMode(definition_default12);
var lab = useMode(definition_default13);
var lab65 = useMode(definition_default14);
var lch = useMode(definition_default15);
var lch65 = useMode(definition_default16);
var lchuv = useMode(definition_default17);
var lrgb = useMode(definition_default18);
var luv = useMode(definition_default19);
var okhsl = useMode(modeOkhsl_default);
var okhsv = useMode(modeOkhsv_default);
var oklab = useMode(definition_default20);
var oklch = useMode(definition_default21);
var p3 = useMode(definition_default22);
var prophoto = useMode(definition_default23);
var rec2020 = useMode(definition_default24);
var rgb = useMode(definition_default);
var xyb = useMode(definition_default25);
var xyz50 = useMode(definition_default26);
var xyz65 = useMode(definition_default27);
var yiq = useMode(definition_default28);

// src/shared/types.ts
var SEVERITY_WEIGHT = {
  blocker: 40,
  critical: 18,
  major: 8,
  minor: 3,
  nit: 1
};

// src/main/services/provenance.ts
var DEV_CHROME_PROVENANCE = {
  ownership: "dev-chrome",
  shipsInProduction: false,
  bundle: "node_modules",
  note: "Dev-only overlay (e.g. Agentation); gated out of production builds"
};
function ownershipFromSelector(selector) {
  if (!selector) return "unknown";
  const s = selector.toLowerCase();
  if (DEV_CHROME_ATTRS.some((a) => s.includes(a)) || s.includes("agentation") || s.includes("data-feedback-toolbar") || s.includes("data-annotation-") || s.includes("react-scan") || s.includes("stagewise") || s.includes("vercel-toolbar") || s.includes("nextjs-portal")) {
    return "dev-chrome";
  }
  if (/styles-module__buttonwrapper/i.test(s) && /styles-module__controlbutton/i.test(s)) {
    return "dev-chrome";
  }
  if (/node_modules|\/@fs\/|\/\.vite\//i.test(s)) return "third-party";
  return "unknown";
}
function provenanceForSelector(selector) {
  const ownership = ownershipFromSelector(selector);
  if (ownership === "dev-chrome") return { ...DEV_CHROME_PROVENANCE };
  if (ownership === "third-party") {
    return {
      ownership: "third-party",
      shipsInProduction: null,
      bundle: "node_modules",
      note: "Selector points at vendor / node_modules"
    };
  }
  return void 0;
}
function guessEffort(f3) {
  if (f3.effort) return f3.effort;
  const t = `${f3.title} ${f3.detail} ${f3.fix}`.toLowerCase();
  if (/mobile|ia |information architecture|redesign|navigation pattern|breakpoint/.test(t)) return "redesign";
  if (/contrast|colour|color|!important|z-index|font-size|one line|opacity|alt text|aria-label|lang=/.test(t)) {
    return "one-line";
  }
  return "component";
}

// src/main/services/impeccableSlop.ts
var toRgb = converter_default("rgb");
var OVERUSED_FONTS = /^(inter|roboto|geist|geist mono|plus jakarta sans|space grotesk|arial|system-ui|ui-sans-serif)$/i;
var counter2 = 0;
function mk4(page, severity, title, detail, fix, extra = {}) {
  return {
    id: `slop${++counter2}`,
    category: "craft",
    severity,
    title,
    detail,
    fix,
    pageUrl: page.url,
    source: "heuristic",
    effort: "component",
    ...extra
  };
}
function rgbOf(c2) {
  try {
    const parsed = parse_default(c2.trim());
    if (!parsed) return null;
    const rgb2 = toRgb(parsed);
    if (!rgb2) return null;
    return { r: rgb2.r * 255, g: rgb2.g * 255, b: rgb2.b * 255, alpha: rgb2.alpha ?? 1 };
  } catch {
    return null;
  }
}
function isPurpleish(c2) {
  const rgb2 = rgbOf(c2);
  if (!rgb2 || rgb2.alpha < 0.4) return false;
  const { r, g, b } = rgb2;
  return b > 120 && r > 80 && r > g + 20 && b > g + 30 && Math.abs(r - b) < 100;
}
function isCyanOnDark(fg, bg) {
  const f3 = rgbOf(fg);
  const b = rgbOf(bg);
  if (!f3 || !b || f3.alpha < 0.4 || b.alpha < 0.4) return false;
  const bgLum = (b.r + b.g + b.b) / 3;
  const cyan = f3.g > 140 && f3.b > 140 && f3.r < 120;
  return bgLum < 60 && cyan;
}
function isCreamBeige(c2) {
  const rgb2 = rgbOf(c2);
  if (!rgb2 || rgb2.alpha < 0.4) return false;
  const { r, g, b } = rgb2;
  const lum = (r + g + b) / 3;
  return lum > 220 && lum < 248 && r >= g && g > b + 8 && r - b > 12;
}
function isGlowShadow(shadow) {
  if (/0px\s+0px\s+\d+px/.test(shadow) && /rgba?\([^)]*\)|#(?:[0-9a-f]{3}){1,2}/i.test(shadow)) {
    if (/rgba?\(\s*0\s*,\s*0\s*,\s*0/i.test(shadow)) return false;
    if (/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0?\.?[0-2]\d*\s*\)/i.test(shadow) && /0,\s*0,\s*0/.test(shadow))
      return false;
    return /rgba?\(\s*([1-9]\d*)\s*,\s*([1-9]\d*)\s*,\s*([1-9]\d*)/i.test(shadow) || /#[0-9a-f]{3,8}/i.test(shadow);
  }
  return false;
}
function auditImpeccableSlop(page) {
  const out = [];
  const t = page.tokens;
  const signals = page.signals ?? {};
  const slop = signals.slop ?? {};
  const fonts = t.fontFamilies.map((f3) => f3.value);
  const overused = fonts.filter((f3) => OVERUSED_FONTS.test(f3.split(",")[0].trim()));
  if (overused.length && overused[0] === fonts[0]) {
    out.push(
      mk4(
        page,
        "major",
        `Overused font \u201C${overused[0]}\u201D dominates the UI`,
        "Inter / Roboto / Geist / Plus Jakarta / Space Grotesk are the default AI type stack \u2014 they no longer feel intentional.",
        "Pick a distinctive face (or a deliberate pairing) that matches the product voice. See impeccable.style/slop \xB7 overused-font.",
        { evidence: fonts.slice(0, 4) }
      )
    );
  }
  const bgs = t.colors.filter((c2) => c2.role === "bg");
  const texts = t.colors.filter((c2) => c2.role === "text");
  const purpleHits = bgs.filter((c2) => isPurpleish(c2.value));
  if (purpleHits.length >= 2 || purpleHits[0] && purpleHits[0].usage >= 8) {
    out.push(
      mk4(
        page,
        "major",
        "AI purple / violet palette",
        `Purple-violet surfaces show up ${purpleHits.reduce((s, c2) => s + c2.usage, 0)}\xD7 \u2014 the most recognizable AI-generated colour tell.`,
        "Choose a distinctive, intentional palette. Ban purple-to-blue gradients as decoration. See impeccable.style/slop \xB7 ai-color-palette.",
        { evidence: purpleHits.slice(0, 3).map((c2) => c2.value) }
      )
    );
  }
  const creamHits = bgs.filter((c2) => isCreamBeige(c2.value));
  if (creamHits.some((c2) => c2.usage >= 10)) {
    out.push(
      mk4(
        page,
        "minor",
        "Cream / beige default surface",
        "Warm cream page backgrounds have become the safe AI \u201Ctasteful\u201D default.",
        "Pick a background from a deliberate brand palette, not #F4F1EA-adjacent beige. See impeccable.style/slop \xB7 cream-palette.",
        { evidence: creamHits.slice(0, 2).map((c2) => c2.value) }
      )
    );
  }
  for (const bg of bgs.slice(0, 6)) {
    for (const fg of texts.slice(0, 6)) {
      if (isCyanOnDark(fg.value, bg.value)) {
        out.push(
          mk4(
            page,
            "minor",
            "Cyan-on-dark AI accent pairing",
            `Text ${fg.value} on dark ${bg.value} matches the stock \u201CAI SaaS dark mode\u201D look.`,
            "Use brand accents with intentional contrast, not cyan neon on charcoal.",
            { evidence: [fg.value, bg.value] }
          )
        );
        break;
      }
    }
  }
  const glow = t.shadows.filter((s) => isGlowShadow(s.value));
  if (glow.length >= 1 && glow.some((s) => s.usage >= 2)) {
    out.push(
      mk4(
        page,
        "major",
        "Glowing chromatic shadows",
        "Colored glow / halo shadows are a default AI \u201Ccool dark UI\u201D tell.",
        "Use neutral elevation shadows; reserve colour for intentional light, not decoration. See impeccable.style/slop \xB7 dark-glow.",
        { evidence: glow.slice(0, 3).map((s) => s.value) }
      )
    );
  }
  const bounce = t.transitions.filter((tr) => /cubic-bezier\([^)]+\)|bounce|elastic|back/i.test(tr.value));
  if ((slop.bounceTransitions ?? 0) >= 1 || bounce.length >= 2) {
    out.push(
      mk4(
        page,
        "minor",
        "Bounce / elastic motion",
        "Bounce and elastic easing feel dated and tacky in product UI.",
        "Use ease-out-quart/quint/expo. See impeccable.style/slop \xB7 bounce-easing."
      )
    );
  }
  if ((slop.gradientTexts ?? 0) >= 1) {
    out.push(
      mk4(
        page,
        "major",
        "Gradient text",
        `${slop.gradientTexts} text node(s) use gradient fills \u2014 decorative AI tell on headings/metrics.`,
        "Use solid colours for text. See impeccable.style/slop \xB7 gradient-text."
      )
    );
  }
  if ((slop.gradientBackgrounds ?? 0) >= 3) {
    out.push(
      mk4(
        page,
        "minor",
        "Decorative gradient backgrounds",
        `${slop.gradientBackgrounds} gradient background wash(es) \u2014 often paired with purple orbs / radial halos.`,
        "Ground surfaces with solid or subtly shifted brand colour. See impeccable.style/slop \xB7 radial-halo / ai-color-palette."
      )
    );
  }
  if ((slop.sideTabBorders ?? 0) >= 1) {
    out.push(
      mk4(
        page,
        "major",
        "Side colour accents on cards / sections",
        `${slop.sideTabBorders} card, section, or list item(s) use a thick coloured border on one side \u2014 the classic AI \u201Cside-tab\u201D tell. Do not add side colour stripes to cards, panels, or sections.`,
        "Remove the one-sided accent border. Signal status with a badge, icon, or text \u2014 not a coloured left/right edge. See impeccable.style/slop \xB7 side-tab.",
        { effort: "one-line" }
      )
    );
  }
  if ((slop.nestedCards ?? 0) >= 3) {
    out.push(
      mk4(
        page,
        "major",
        "Nested cards",
        `${slop.nestedCards} card-in-card nesting(s) \u2014 visual noise and fake depth.`,
        "Flatten: spacing, type, and dividers instead of nested containers. See impeccable.style/slop \xB7 nested-cards."
      )
    );
  }
  if ((slop.iconTileHeadings ?? 0) >= 3) {
    out.push(
      mk4(
        page,
        "minor",
        "Icon-tile feature stack",
        `${slop.iconTileHeadings} rounded icon tile(s) stacked above headings \u2014 universal AI feature-card template.`,
        "Try side-by-side icon + heading, or drop the tile container. See impeccable.style/slop \xB7 icon-tile-stack."
      )
    );
  }
  if ((slop.heroEyebrowChips ?? 0) >= 1) {
    out.push(
      mk4(
        page,
        "minor",
        "Hero eyebrow / pill chip",
        "Tiny uppercase tracked label (or pill) above a large hero headline is the default AI SaaS hero.",
        "Drop the eyebrow, fold it into the headline, or use a real breadcrumb. See impeccable.style/slop \xB7 hero-eyebrow-chip."
      )
    );
  }
  if ((slop.pulsingDots ?? 0) >= 2) {
    out.push(
      mk4(
        page,
        "nit",
        "Decorative pulsing status dots",
        `${slop.pulsingDots} pulsing dot(s) \u2014 often fake liveness.`,
        "Pulse only for genuinely live data; otherwise use a static labeled indicator. See impeccable.style/slop \xB7 pulsing-dot."
      )
    );
  }
  const fullRadii = t.radii.filter((r) => r.value === "full" || parseFloat(r.value) >= 999);
  const totalRadiusUsage = t.radii.reduce((s, r) => s + r.usage, 0) || 1;
  const fullUsage = fullRadii.reduce((s, r) => s + r.usage, 0);
  if (fullUsage / totalRadiusUsage > 0.45 && fullUsage >= 12) {
    out.push(
      mk4(
        page,
        "nit",
        "Pill radius overuse",
        `${fullUsage} elements use full/pill radius \u2014 common AI over-rounding.`,
        "Reserve pills for true chips/tags; use a tighter radius language for cards and controls."
      )
    );
  }
  return out;
}

// src/main/services/premiumCraft.ts
var counter3 = 0;
function mk5(page, severity, title, detail, fix, extra = {}) {
  return {
    id: `prem${++counter3}`,
    category: "craft",
    severity,
    title,
    detail,
    fix,
    pageUrl: page.url,
    source: "heuristic",
    effort: "component",
    confidence: "high",
    ...extra
  };
}
function premiumFromSignals(page) {
  const raw = page.signals?.premium;
  return raw ?? null;
}
function auditPremiumCraft(page) {
  const p4 = premiumFromSignals(page);
  if (!p4) return [];
  const out = [];
  if (p4.bodyFontSizePx > 0 && p4.bodyFontSizePx < 14) {
    out.push(
      mk5(
        page,
        "major",
        `Body text is ${p4.bodyFontSizePx}px \u2014 below premium readability`,
        "S-tier product UIs keep body copy at 14\u201316px+. Sub-14px body reads unfinished and strains scanning.",
        "Raise the body token to at least 14px (prefer 15\u201316px) and reflow dense tables with secondary 12px meta only."
      )
    );
  }
  if (p4.bodyLineHeight > 0 && p4.bodyLineHeight < 1.35 && p4.bodyFontSizePx >= 14) {
    out.push(
      mk5(
        page,
        "minor",
        `Body line-height ${p4.bodyLineHeight} is cramped`,
        "Premium body leading sits around 1.45\u20131.7. Tight leading makes dense product copy feel cheap.",
        "Set body line-height to ~1.5 (or a matching design token) and keep captions slightly tighter if needed."
      )
    );
  }
  if (p4.uniqueFontSizes > 8) {
    out.push(
      mk5(
        page,
        "major",
        `${p4.uniqueFontSizes} distinct font sizes on one page`,
        "A premium type scale is 6\u20138 steps. More sizes read as ad-hoc CSS, not a system.",
        "Collapse to a documented scale (e.g. 12/14/16/20/24/32) and ban one-off sizes."
      )
    );
  } else if (p4.fontSizesOff4pxLadder >= 3) {
    out.push(
      mk5(
        page,
        "minor",
        `${p4.fontSizesOff4pxLadder} odd-pixel font sizes off the type ladder`,
        "Orphan sizes (13, 15, 17\u2026) break optical rhythm and fight the 4/8 grid.",
        "Snap every size to the type scale; prefer even steps."
      )
    );
  }
  if (p4.headingMaxSizePx > 0 && p4.hierarchySizeDeltaPx < 4 && p4.uniqueFontSizes >= 2) {
    out.push(
      mk5(
        page,
        "major",
        "Flat typographic hierarchy \u2014 heading barely larger than body",
        `Heading max ${p4.headingMaxSizePx}px vs body ${p4.bodyFontSizePx}px (\u0394 ${p4.hierarchySizeDeltaPx}px). Premium UIs make the primary title unmistakable.`,
        "Increase page/section titles by at least 6\u20138px (and usually weight) over body."
      )
    );
  }
  if (p4.uniqueFontWeights > 4) {
    out.push(
      mk5(
        page,
        "major",
        `${p4.uniqueFontWeights} font weights in use`,
        "Premium systems use 3\u20134 weights (e.g. 400/500/600/700). More weights look uncoordinated.",
        "Pick Regular, Medium, SemiBold, Bold \u2014 drop the rest."
      )
    );
  } else if (p4.headingMaxSizePx > 0 && !p4.headingBodyWeightContrast && p4.hierarchySizeDeltaPx < 8) {
    out.push(
      mk5(
        page,
        "minor",
        "Headings lack weight contrast against body",
        "Size alone is a weak hierarchy when weight stays flat. Premium craft stacks size + weight.",
        "Bump headings to SemiBold/Bold while body stays Regular/Medium."
      )
    );
  }
  if (p4.avgTextDensity >= 2.2 && p4.avgCardPaddingPx > 0 && p4.avgCardPaddingPx < 12) {
    out.push(
      mk5(
        page,
        "major",
        "Cramped density \u2014 high text load with tight card padding",
        `Avg text density ${p4.avgTextDensity}, card padding ~${p4.avgCardPaddingPx}px. Premium product UIs give content breathing room.`,
        "Raise card/panel padding to 16\u201324px and loosen row gaps on the densest bands."
      )
    );
  } else if (p4.contentAreaRatio > 0.85 && p4.avgCardPaddingPx > 0 && p4.avgCardPaddingPx < 10) {
    out.push(
      mk5(
        page,
        "major",
        "Wall-to-wall content with almost no inset",
        `Content fills ${(p4.contentAreaRatio * 100).toFixed(0)}% of main with ~${p4.avgCardPaddingPx}px padding \u2014 reads as unfinished packing.`,
        "Inset primary surfaces and separate bands with a consistent 16\u201332px rhythm."
      )
    );
  }
  if (p4.uniqueCardShadows > 4) {
    out.push(
      mk5(
        page,
        "major",
        `${p4.uniqueCardShadows} distinct card elevations`,
        "Premium elevation is 1\u20133 semantic layers (flat / raised / overlay). Shadow soup kills coherence.",
        "Define two shadow tokens (and maybe a dialog layer) and delete the rest."
      )
    );
  }
  if (p4.iconSizeVariance >= 4 && p4.uniqueIconSizes >= 4) {
    out.push(
      mk5(
        page,
        "minor",
        `Inconsistent icon sizes (\u03C3 ${p4.iconSizeVariance}px across ${p4.uniqueIconSizes} sizes)`,
        "Mixed icon boxes look hand-rolled. Premium UI keeps icons on 1\u20132 sizes per context (nav vs inline).",
        "Standardise nav icons (e.g. 16 or 20) and inline icons (14\u201316); stop mixing freely."
      )
    );
  }
  if (p4.harshControlBorders >= 2) {
    out.push(
      mk5(
        page,
        "major",
        `${p4.harshControlBorders} control(s) use a harsh thick dark border`,
        "Thick near-black borders on inputs/buttons read as a pressed/focus mistake, not premium chrome.",
        "Use a soft 1px neutral border at rest and a :focus-visible offset ring \u2014 never a 2\u20133px black border as the default or active look."
      )
    );
  }
  if (p4.uniqueBorderWidths >= 5) {
    out.push(
      mk5(
        page,
        "minor",
        `${p4.uniqueBorderWidths} distinct border widths on controls/cards`,
        "Too many stroke weights fight the radius/elevation system.",
        "Standardise on one hairline (1px) plus one emphasis stroke if needed."
      )
    );
  }
  if (p4.crampedSiblingGaps >= 4) {
    out.push(
      mk5(
        page,
        "minor",
        "Uneven vertical rhythm between major bands",
        `${p4.crampedSiblingGaps} neighbouring section gaps drift off the dominant spacing \u2014 premium layouts keep a steady cadence.`,
        "Pick one section gap token (24/32/48) and apply it between primary bands."
      )
    );
  }
  return out;
}

// src/main/services/audit.ts
var counter4 = 0;
function mk6(page, category, severity, title, detail, fix, extra = {}) {
  return {
    id: `f${++counter4}-${page.url.replace(/[^a-z0-9]/gi, "_").slice(0, 16)}`,
    category,
    severity,
    title,
    detail,
    fix,
    pageUrl: page.url,
    source: "heuristic",
    ...extra
  };
}
var toRgb2 = converter_default("rgb");
var ciede2000 = differenceCiede2000();
function parseColor(c2) {
  try {
    const parsed = parse_default(c2.trim());
    if (!parsed) return null;
    const rgb2 = toRgb2(parsed);
    if (!rgb2) return null;
    return { r: rgb2.r * 255, g: rgb2.g * 255, b: rgb2.b * 255, alpha: rgb2.alpha ?? 1 };
  } catch {
    return null;
  }
}
function deltaE(a, b) {
  try {
    const d = ciede2000(a, b);
    return Number.isFinite(d) ? d : null;
  } catch {
    return null;
  }
}
function auditPage(page, config2) {
  const out = [];
  const signals = page.signals ?? {};
  const strict = config2.brutality === "ruthless" ? 1 : config2.brutality === "harsh" ? 0.75 : 0.5;
  const t = page.tokens;
  if (!page.ok) {
    out.push(
      mk6(page, "flow", "blocker", "Page failed to capture", page.errorText ?? "Navigation error", "Fix the route or the redirect chain before anything else \u2014 an unreachable page is a 0.")
    );
    return out;
  }
  const meaningful = t.colors.filter((c2) => c2.usage >= 2);
  const textColors = meaningful.filter((c2) => c2.role === "text");
  const bgColors = meaningful.filter((c2) => c2.role === "bg");
  const decisions = clusterColourDecisions(meaningful.map((c2) => c2.value));
  const distinct = decisions.length;
  const rawDistinct = new Set(meaningful.map((c2) => c2.value)).size;
  const colorBudget = config2.brutality === "ruthless" ? 12 : 18;
  if (distinct > colorBudget) {
    out.push(
      mk6(
        page,
        "coherence",
        distinct > colorBudget * 1.8 ? "critical" : "major",
        `${distinct} colour decisions in use`,
        `Palette budget for a coherent product surface is ~${colorBudget} decisions (alpha ladders of one hue count as one). Found ${distinct} decisions across ${rawDistinct} raw values. Top: ${decisions.slice(0, 8).map((d) => d.label).join(", ")}.`,
        "Collapse near-duplicate alphas of the same hue into one token; reserve status/chart series separately from brand drift.",
        { effort: "component" }
      )
    );
  } else if (rawDistinct > colorBudget) {
    out.push(
      mk6(
        page,
        "coherence",
        "nit",
        `${rawDistinct} raw colours collapse to ${distinct} decisions`,
        "Multiple alphas of the same hue were clustered \u2014 treat each cluster as one design decision, not N colours.",
        "Name the token once and vary opacity via a scale (e.g. color-mix / token alpha).",
        { effort: "one-line" }
      )
    );
  }
  const dupes = [];
  for (let i = 0; i < meaningful.length; i++) {
    for (let j = i + 1; j < meaningful.length; j++) {
      if (meaningful[i].role !== meaningful[j].role) continue;
      const a = parseColor(meaningful[i].value);
      const b = parseColor(meaningful[j].value);
      if (!a || !b || a.alpha < 0.9 || b.alpha < 0.9) continue;
      const d = deltaE(meaningful[i].value, meaningful[j].value);
      if (d !== null && d > 0.2 && d < 2)
        dupes.push(`${meaningful[i].value} \u2248 ${meaningful[j].value} (\u0394E2000 ${d.toFixed(2)})`);
    }
  }
  if (dupes.length >= 2) {
    out.push(
      mk6(
        page,
        "coherence",
        dupes.length > 5 ? "major" : "minor",
        `${dupes.length} near-duplicate colour pairs`,
        `Visually identical colours defined separately \u2014 the signature of hand-typed hexes: ${dupes.slice(0, 5).join("; ")}.`,
        "Deduplicate into one token each. Below \u0394E2000 2.0 the difference is imperceptible to users but very visible in your CSS.",
        { effort: "one-line" }
      )
    );
  }
  const families = t.fontFamilies.filter((f3) => f3.usage >= 3);
  if (families.length > 2) {
    out.push(
      mk6(
        page,
        "coherence",
        families.length > 3 ? "major" : "minor",
        `${families.length} font families on one page`,
        `Families: ${families.map((f3) => `${f3.value} (${f3.usage})`).join(", ")}.`,
        "Two families max: one for UI/body, optionally one display face. A third family reads as an unfinished migration."
      )
    );
  }
  const sizes = t.fontSizes.filter((s) => s.usage >= 2).map((s) => s.value).sort((a, b) => a - b);
  const sizeBudget = config2.brutality === "ruthless" ? 7 : 9;
  if (sizes.length > sizeBudget) {
    out.push(
      mk6(
        page,
        "coherence",
        "major",
        `${sizes.length} distinct font sizes`,
        `Sizes: ${sizes.join(", ")}px. A type scale should be a short geometric ladder, not a continuum.`,
        "Define a 6\u20138 step scale (12/14/16/18/24/30/36/48) and delete every orphan value."
      )
    );
  }
  const orphans = t.fontSizes.filter((s) => s.usage <= 2 && s.value % 2 !== 0);
  if (orphans.length >= 2 && strict > 0.6) {
    out.push(
      mk6(
        page,
        "coherence",
        "minor",
        `${orphans.length} odd one-off font sizes`,
        `Values like ${orphans.slice(0, 5).map((o) => o.value + "px").join(", ")} appear once or twice and are not on any even ladder.`,
        "Snap to the nearest scale step; one-off sizes are how a design system dies."
      )
    );
  }
  const radii = t.radii.filter((r) => r.usage >= 2);
  if (radii.length > 4) {
    out.push(
      mk6(
        page,
        "coherence",
        "major",
        `${radii.length} distinct border radii`,
        `Radii in use: ${radii.slice(0, 8).map((r) => r.value).join(" | ")}.`,
        "Pick sm/md/lg/full derived from one --radius variable. Mixed roundness makes a UI look assembled from stock parts."
      )
    );
  }
  const shadows = t.shadows.filter((s) => s.usage >= 2);
  if (shadows.length > 4) {
    out.push(
      mk6(
        page,
        "coherence",
        "minor",
        `${shadows.length} distinct box-shadows`,
        "Elevation is a semantic ladder (raised / overlay / popover), not a per-component decision.",
        "Reduce to 3 elevation tokens and apply by role."
      )
    );
  }
  const spacingValues = t.spacing.filter((s) => s.usage >= 3).map((s) => s.value);
  const offGrid = spacingValues.filter((v) => v % 4 !== 0);
  if (spacingValues.length > 0 && offGrid.length / spacingValues.length > 0.35) {
    out.push(
      mk6(
        page,
        "coherence",
        "major",
        `${Math.round(offGrid.length / spacingValues.length * 100)}% of spacing is off the 4px grid`,
        `Off-grid values: ${offGrid.slice(0, 10).join(", ")}px.`,
        "Move to a 4px (ideally 8px) rhythm. Off-grid spacing is why sections never quite align."
      )
    );
  }
  const layout = page.signals?.layout ?? null;
  if (layout) {
    const bands = layout.bandCount ?? 0;
    if (bands >= 4 && (layout.misalignedBands ?? 0) >= 2) {
      out.push(
        mk6(
          page,
          "craft",
          "major",
          `${layout.misalignedBands} content bands misaligned on the left edge`,
          `Of ${bands} main-column bands, ${layout.misalignedBands} sit more than 8px off the median left edge. Stacked sections should share a content gutter.`,
          "Align the main column with one horizontal padding token; stop per-section margin-left overrides.",
          { effort: "one-line", confidence: "high" }
        )
      );
    }
    if ((layout.distinctBandGaps ?? 0) >= 4 && (layout.offRhythmGaps ?? 0) >= 3) {
      out.push(
        mk6(
          page,
          "coherence",
          "minor",
          `Vertical rhythm uses ${layout.distinctBandGaps} different gaps between bands`,
          `Dominant gap ~${layout.dominantGap ?? "?"}px but ${layout.offRhythmGaps} neighbouring pairs drift by >8px. Uneven section spacing reads as unfinished layout.`,
          "Use one stack gap token (e.g. gap-4 / gap-6) between page bands; avoid ad-hoc margin-top per section.",
          { effort: "one-line", confidence: "high" }
        )
      );
    }
    if ((layout.asymmetricPadding ?? 0) >= 4) {
      out.push(
        mk6(
          page,
          "craft",
          "minor",
          `${layout.asymmetricPadding} cards/blocks with uneven padding`,
          "Horizontal or vertical padding differs by \u22658px on the same component. Optical imbalance usually means one side was hand-tuned.",
          "Set padding with a single token (p-3 / p-4) rather than independent padding-left/right values.",
          { effort: "one-line", confidence: "low" }
        )
      );
    }
    if ((layout.siblingPaddingMismatches ?? 0) >= 3) {
      out.push(
        mk6(
          page,
          "coherence",
          "minor",
          `Sibling cards disagree on padding (${layout.siblingPaddingMismatches} outliers)`,
          "Items that share a parent row/list should share the same padding-left. Drift means components were restyled independently.",
          "Extract a shared card/list-item primitive and forbid local padding overrides.",
          { effort: "component", confidence: "high" }
        )
      );
    }
    if ((layout.uniquePaddingValues ?? 0) >= 12) {
      out.push(
        mk6(
          page,
          "coherence",
          "major",
          `${layout.uniquePaddingValues} distinct padding values in the main column`,
          `Plus ${layout.uniqueMarginValues ?? 0} distinct vertical margins. A spacing scale usually needs 4\u20136 steps, not a unique value per component.`,
          "Collapse padding/margin onto the spacing scale (4/8/12/16/24/32) and delete one-off values.",
          { effort: "component", confidence: "high" }
        )
      );
    } else if ((layout.uniqueMarginValues ?? 0) >= 14) {
      out.push(
        mk6(
          page,
          "coherence",
          "minor",
          `${layout.uniqueMarginValues} distinct margin values in the main column`,
          "Margin sprawl between blocks breaks vertical rhythm even when padding looks disciplined.",
          "Prefer gap on the parent flex/stack over per-child margin-top.",
          { effort: "one-line", confidence: "high" }
        )
      );
    }
  }
  const polish = page.signals?.polish ?? null;
  if (polish) {
    if (polish.stuckLoading || (polish.connectingCopy ?? false) && (polish.skeletonCount ?? 0) >= 4) {
      out.push(
        mk6(
          page,
          "flow",
          "critical",
          polish.bareLoadingShell && !(polish.skeletonCount && polish.skeletonCount >= 4) ? "Page stuck on a bare Loading\u2026 shell" : "Page stuck in loading / Connecting state",
          polish.bareLoadingShell && !(polish.skeletonCount && polish.skeletonCount >= 4) ? `Capture settled on loading copy with almost no content (${page.sections?.length ?? 0} sections, ${page.controls?.length ?? 0} controls). A spinner alone is not a product screen.` : `Capture still shows connecting/loading copy with ${polish.skeletonCount ?? 0} skeleton placeholder(s). Users see an unfinished shell, not the product.`,
          "Finish the data load, show a real empty state with recovery CTA, or surface an error with retry \u2014 never leave Connecting\u2026 / Loading\u2026 as the settled UI.",
          { effort: "component", confidence: "high" }
        )
      );
    } else if ((polish.skeletonCount ?? 0) >= 10) {
      out.push(
        mk6(
          page,
          "flow",
          "major",
          `${polish.skeletonCount} skeleton placeholders still visible after capture`,
          "Dense skeleton rows after network idle usually means the list never resolved (or capture raced a hang).",
          "Resolve the fetch, add a timeout empty/error state, and keep skeletons only for the brief in-flight window.",
          { effort: "component", confidence: "low" }
        )
      );
    }
    if ((polish.emptyRegionsWithoutCta ?? 0) >= 1) {
      out.push(
        mk6(
          page,
          "content",
          "major",
          `${polish.emptyRegionsWithoutCta} empty region(s) without a next-step CTA`,
          "Blank or near-blank panels with no action leave users unsure whether the product is broken or incomplete (NN/G empty-state guidance).",
          "Add a short explanation of why it is empty plus one primary CTA that populates the space (Create\u2026, Add\u2026, Import\u2026).",
          { effort: "component", confidence: "high" }
        )
      );
    }
    if ((polish.vagueEmptyCopy?.length ?? 0) >= 1) {
      out.push(
        mk6(
          page,
          "content",
          "minor",
          `Vague empty copy: ${polish.vagueEmptyCopy.slice(0, 3).join(" \xB7 ")}`,
          "Phrases like \u201CNo data\u201D / \u201CNothing here\u201D communicate status but not recovery. Empty states should explain context and offer a path forward.",
          "Rewrite to name what belongs here and how to get the first item (e.g. \u201CNo projects yet \u2014 create one to start\u201D).",
          { effort: "one-line", confidence: "high" }
        )
      );
    }
    if ((polish.genericCtaLabels?.length ?? 0) >= 2) {
      out.push(
        mk6(
          page,
          "content",
          "minor",
          `Generic CTA labels: ${[...new Set(polish.genericCtaLabels)].slice(0, 4).join(", ")}`,
          "Submit / Click here / Learn more do not say what happens next. Verb + object labels scan better and improve accessibility announcements.",
          "Replace with specific actions (Save draft, Create invoice, View pricing).",
          { effort: "one-line", confidence: "high" }
        )
      );
    }
    if ((polish.skeletonWithoutMinHeight ?? 0) >= 2) {
      out.push(
        mk6(
          page,
          "craft",
          "minor",
          `${polish.skeletonWithoutMinHeight} skeleton/pulse placeholders without reserved height`,
          "Zero-height skeletons collapse layout until content arrives (CLS). Skeleton screens should mirror the final content wireframe, not a blank frame (NN/G).",
          "Give each skeleton a min-height (or aspect-ratio) matching the loaded card/row so the page does not jump.",
          { effort: "one-line", confidence: "low" }
        )
      );
    } else if ((polish.skeletonCount ?? 0) >= 3 && (polish.ariaBusyCount ?? 0) === 0) {
      out.push(
        mk6(
          page,
          "accessibility",
          "nit",
          "Loading skeletons present without aria-busy",
          "Sighted users see placeholders; assistive tech may not know content is still loading.",
          'Set aria-busy="true" on the loading region (and clear it when content resolves); optionally aria-live="polite".',
          { effort: "one-line", confidence: "low" }
        )
      );
    }
    if ((polish.disabledWithoutAria ?? 0) >= 4) {
      out.push(
        mk6(
          page,
          "accessibility",
          "nit",
          `${polish.disabledWithoutAria} disabled controls without aria-disabled`,
          "Native disabled is often enough for form controls, but custom role=button patterns and inconsistent styling benefit from an explicit aria-disabled for AT parity.",
          'Mirror disabled state with aria-disabled="true" (and keep focus order intentional \u2014 do not leave dead tab stops).',
          { effort: "one-line", confidence: "low" }
        )
      );
    }
  }
  if (t.transitions.length > 5) {
    out.push(
      mk6(
        page,
        "coherence",
        "nit",
        `${t.transitions.length} distinct transition signatures`,
        `e.g. ${t.transitions.slice(0, 4).map((x) => x.value).join(" | ")}.`,
        "Two durations (fast 150ms, base 250ms) and one easing curve. Motion inconsistency reads as jank."
      )
    );
  }
  const roles = page.sections.map((s) => s.role);
  const uniqueRoles = new Set(roles).size;
  if (page.sections.length >= 5 && uniqueRoles <= 2) {
    out.push(
      mk6(
        page,
        "variety",
        "major",
        "Page is rhythmically flat",
        `${page.sections.length} sections but only ${uniqueRoles} distinct section type(s): ${[...new Set(roles)].join(", ")}. Everything is the same slab.`,
        "Alternate density: hero \u2192 proof \u2192 2-col explainer \u2192 metrics band \u2192 testimonial \u2192 FAQ \u2192 CTA. Vary background weight and column count to create scan anchors."
      )
    );
  }
  const repeatedRun = longestRun(roles);
  if (repeatedRun.count >= 4) {
    out.push(
      mk6(
        page,
        "variety",
        "minor",
        `${repeatedRun.count} identical "${repeatedRun.role}" sections in a row`,
        "Consecutive sections of the same type flatten the scan path; users stop reading after the second.",
        "Merge them, or break the run with a contrasting band (dark section, media, or metrics)."
      )
    );
  }
  const bgVariety = new Set(page.sections.map((s) => s.stats.distinctBgColors > 0)).size;
  if (page.sections.length >= 6 && bgVariety <= 1 && strict > 0.6) {
    out.push(
      mk6(
        page,
        "variety",
        "nit",
        "No background contrast between sections",
        "Every section shares the same surface colour, so the page reads as one endless scroll.",
        "Alternate surface/muted backgrounds, or add a full-bleed accent band at the conversion point."
      )
    );
  }
  const ctaTexts = page.sections.flatMap((s) => s.ctaLabels).map((c2) => c2.toLowerCase().trim()).filter(Boolean);
  const ctaCounts = /* @__PURE__ */ new Map();
  for (const c2 of ctaTexts) ctaCounts.set(c2, (ctaCounts.get(c2) ?? 0) + 1);
  const topCta = [...ctaCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topCta && topCta[1] >= 5) {
    out.push(
      mk6(
        page,
        "content",
        "minor",
        `"${topCta[0]}" repeated ${topCta[1]} times`,
        "Identical CTA copy everywhere gives users no information about what changes when they click.",
        "Differentiate by intent: primary conversion vs. secondary learn-more. Repetition without hierarchy is noise, not persistence."
      )
    );
  }
  for (const s of page.sections) {
    if (s.stats.maxTextWidthPx > 900) {
      out.push(
        mk6(
          page,
          "craft",
          "minor",
          `Body copy runs ${Math.round(s.stats.maxTextWidthPx)}px wide`,
          "Optimal measure is 45\u201375 characters (~600\u2013720px at 16px). Long lines destroy return-sweep accuracy.",
          "Cap with max-w-prose / max-w-2xl on text blocks.",
          { sectionId: s.id, selector: s.selector }
        )
      );
    }
    if (s.stats.distinctFontSizes > 6) {
      out.push(
        mk6(
          page,
          "coherence",
          "minor",
          `Section "${s.label}" uses ${s.stats.distinctFontSizes} font sizes`,
          "A single section rarely needs more than 3\u20134 steps of hierarchy.",
          "Collapse to heading / body / caption and let weight and colour do the rest.",
          { sectionId: s.id, selector: s.selector }
        )
      );
    }
  }
  for (const t2 of page.toolFailures ?? []) {
    out.push(
      mk6(
        page,
        t2.tool === "axe" ? "accessibility" : "flow",
        "minor",
        `${t2.tool} could not run on this page`,
        t2.message,
        "Re-run the audit. If this persists, check CSP, network, or that the page finished loading."
      )
    );
  }
  const axeSeen = /* @__PURE__ */ new Set();
  for (const v of page.axe) {
    if (axeSeen.has(v.id)) continue;
    axeSeen.add(v.id);
    const sev = v.impact === "critical" ? "critical" : v.impact === "serious" ? "major" : v.impact === "moderate" ? "minor" : "nit";
    const selector = v.nodes[0]?.target?.join(" ");
    const prov = provenanceForSelector(selector);
    let detail = `${v.nodes.length} node(s). ${v.nodes[0]?.failureSummary ?? ""} Targets: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`;
    if (/contrast/i.test(v.id) || /contrast/i.test(v.help)) {
      detail += "\nCompositing: if the reported colours look wrong vs design tokens, check ancestor opacity \u2014 e.g. opacity:0.72 on a row composites the token down to the measured pair.";
    }
    out.push({
      id: `f${++counter4}`,
      category: "accessibility",
      severity: sev,
      title: `axe: ${v.help}`,
      detail,
      fix: `Resolve per WCAG guidance: ${v.helpUrl}`,
      pageUrl: page.url,
      selector,
      source: "axe",
      provenance: prov,
      effort: /contrast|name|label|lang|alt/i.test(v.id) ? "one-line" : "component"
    });
  }
  if (signals.imagesMissingAlt > 0) {
    out.push(
      mk6(
        page,
        "accessibility",
        signals.imagesMissingAlt > 5 ? "major" : "minor",
        `${signals.imagesMissingAlt} images without alt text`,
        `Screen-reader users get filenames or silence.${signals.imagesDecorativeOk ? ` (${signals.imagesDecorativeOk} correctly marked decorative with alt="" \u2014 not counted.)` : ""}`,
        'Add descriptive alt, or alt="" for decoration (empty alt is correct for decorative images).',
        { effort: "one-line" }
      )
    );
  }
  if (signals.h1Count === 0) {
    out.push(mk6(page, "accessibility", "major", "No <h1> on the page", "Document outline has no root heading.", "Exactly one <h1> that states the page proposition."));
  } else if (signals.h1Count > 1) {
    out.push(mk6(page, "accessibility", "minor", `${signals.h1Count} <h1> elements`, "Multiple document titles confuse assistive tech and SEO.", "Demote all but the primary to <h2>."));
  }
  if (signals.headingOrderIssues > 0) {
    out.push(mk6(page, "accessibility", "minor", `${signals.headingOrderIssues} heading-level skips`, "Levels jump (e.g. h2 \u2192 h4), breaking the outline.", "Never skip levels; style with classes, not tag choice."));
  }
  if (signals.buttonsWithoutLabel > 0) {
    out.push(mk6(page, "accessibility", "major", `${signals.buttonsWithoutLabel} icon-only buttons without a label`, "Buttons with no text and no aria-label are unusable non-visually.", "Add aria-label, or a visually hidden span.", { effort: "one-line" }));
  }
  if (!signals.hasSkipLink && strict > 0.7) {
    out.push(mk6(page, "accessibility", "nit", "No skip-to-content link", "Keyboard users must tab through the whole nav on every page.", "Add a focus-visible skip link as the first focusable element."));
  }
  if (!signals.langAttr) {
    out.push(mk6(page, "accessibility", "minor", "Missing <html lang>", "Screen readers pick the wrong voice.", "Set lang on the html element."));
  }
  for (const r of page.responsive) {
    if (r.horizontalOverflowPx > 4) {
      out.push(
        mk6(
          page,
          "responsive",
          r.horizontalOverflowPx > 40 ? "critical" : "major",
          `Horizontal overflow of ${r.horizontalOverflowPx}px at ${r.viewport}`,
          "The page scrolls sideways \u2014 usually a fixed-width child, a wide table, or an un-wrapped flex row.",
          "Find the offender with overflow-x debugging and constrain with min-w-0 / max-w-full / overflow-x-auto on the container.",
          { viewport: r.viewport }
        )
      );
    }
    if (r.tinyTextCount > 3) {
      out.push(
        mk6(
          page,
          "responsive",
          "minor",
          `${r.tinyTextCount} text nodes under 12px at ${r.viewport}`,
          "Sub-12px copy is effectively unreadable on device and triggers iOS zoom on inputs.",
          "Minimum 14px body, 16px for inputs.",
          { viewport: r.viewport }
        )
      );
    }
    if (r.smallTapTargets > 3 && r.viewport === "mobile") {
      out.push(
        mk6(
          page,
          "accessibility",
          "major",
          `${r.smallTapTargets} tap targets below 32px at mobile`,
          "WCAG 2.5.8 asks for 24px minimum; platform guidance is 44px. Small targets are the top mobile complaint.",
          "Pad to at least 44\xD744 hit area; visual size can stay small.",
          { viewport: r.viewport }
        )
      );
    }
    if (r.overlaps > 2) {
      out.push(
        mk6(
          page,
          "responsive",
          "major",
          `${r.overlaps} overlapping interactive elements at ${r.viewport}`,
          "Controls physically collide, so taps land on the wrong element.",
          "Reflow with grid/flex-wrap instead of absolute positioning at this breakpoint.",
          { viewport: r.viewport }
        )
      );
    }
  }
  const realConsole = page.consoleErrors.filter((e4) => !/Download the React DevTools|\[HMR\]|\[vite\]/i.test(e4));
  if (realConsole.length > 0) {
    out.push(
      mk6(
        page,
        "flow",
        realConsole.length > 8 ? "major" : "minor",
        `${realConsole.length} console errors`,
        realConsole.slice(0, 5).join("\n"),
        "Ship zero console errors. Each one is a feature that is silently broken for someone."
      )
    );
  }
  const hardFails = page.networkFailures.filter((n) => typeof n.status === "number" && n.status >= 500);
  const notFound = page.networkFailures.filter(
    (n) => n.status === 404 && !/\.(map|ico|woff2?)(\?|$)/i.test(n.url)
  );
  if (hardFails.length) {
    out.push(mk6(page, "flow", "critical", `${hardFails.length} server errors (5xx)`, hardFails.slice(0, 5).map((f3) => `${f3.status} ${f3.url}`).join("\n"), "Fix or remove the failing endpoint; 5xx during page load means the experience is partially dead."));
  }
  if (notFound.length) {
    out.push(mk6(page, "flow", notFound.length > 5 ? "major" : "minor", `${notFound.length} missing resources (404)`, notFound.slice(0, 5).map((f3) => f3.url).join("\n"), "Broken assets/endpoints \u2014 delete the reference or restore the file."));
  }
  if (page.status >= 400) {
    out.push(mk6(page, "flow", "blocker", `Page returned HTTP ${page.status}`, "The document itself is an error response.", "Fix routing/permissions before auditing anything else."));
  }
  const m = page.metrics;
  const devBuild = page.captureContext?.buildMode === "development";
  const softPerf = (severity) => devBuild ? "nit" : severity;
  const perfSuffix = devBuild ? " [dev-server artifact \u2014 not actionable; re-audit a production build]" : "";
  if (m.lcpMs && m.lcpMs > 2500) {
    out.push(mk6(page, "performance", softPerf(m.lcpMs > 4e3 ? "critical" : "major"), `LCP ${(m.lcpMs / 1e3).toFixed(1)}s${devBuild ? " (dev)" : ""}`, `Largest Contentful Paint above the 2.5s "good" threshold.${perfSuffix}`, "Preload the hero asset, serve modern formats, and cut render-blocking JS.", { effort: "component", confidence: devBuild ? "low" : "high" }));
  }
  if (m.cls !== null && m.cls > 0.1) {
    out.push(mk6(page, "performance", softPerf(m.cls > 0.25 ? "critical" : "major"), `CLS ${m.cls.toFixed(3)}${devBuild ? " (dev)" : ""}`, `Layout shifts above 0.1 \u2014 content moves under the user.${perfSuffix}`, "Reserve space for images/embeds and avoid late-injected banners.", { effort: "component", confidence: devBuild ? "low" : "high" }));
  }
  if (m.transferBytes > 35e5) {
    out.push(mk6(page, "performance", softPerf("major"), `${(m.transferBytes / 1e6).toFixed(1)} MB transferred${devBuild ? " (dev)" : ""}`, `${m.requestCount} requests.${perfSuffix}`, "Compress and lazy-load below-the-fold media; audit the JS bundle.", { effort: "component", confidence: devBuild ? "low" : "high" }));
  }
  if (m.longTaskMs > 800) {
    out.push(mk6(page, "performance", softPerf("minor"), `${m.longTaskMs}ms of long tasks${devBuild ? " (dev)" : ""}`, `The main thread is blocked, so early clicks feel dead.${perfSuffix}`, "Split bundles, defer non-critical work, hydrate progressively.", { confidence: devBuild ? "low" : "high" }));
  }
  if (devBuild && (m.lcpMs || m.transferBytes > 5e5)) {
    out.push(
      mk6(
        page,
        "performance",
        "nit",
        "Audited against a development server",
        `Build mode: development (${(page.captureContext?.buildHints ?? []).join(", ") || "localhost"}). LCP/CLS/transfer and CSS sheet counts reflect unbundled Vite/HMR \u2014 not what ships.`,
        "Set a Production URL on New audit, or re-run against a built preview (vite preview / next start).",
        { effort: "one-line", confidence: "high" }
      )
    );
  }
  if (!signals.metaDescription) {
    out.push(mk6(page, "content", "nit", "No meta description", "Search and link previews get scraped junk.", "Write a 150-character description per page."));
  }
  if (signals.title && String(signals.title).length > 65) {
    out.push(mk6(page, "content", "nit", "Page title over 65 characters", String(signals.title), "Trim to fit the SERP truncation limit."));
  }
  const heroSection = page.sections.find((s) => s.role === "hero");
  if (heroSection && heroSection.ctaLabels.length === 0) {
    out.push(mk6(page, "flow", "major", "Hero has no call to action", "The first screen offers nothing to click.", "One primary action, one secondary. Above the fold.", { sectionId: heroSection.id }));
  }
  if (heroSection && (heroSection.headings[0]?.length ?? 0) > 90) {
    out.push(mk6(page, "content", "minor", "Hero headline is a paragraph", heroSection.headings[0], 'Under 60 characters. If it needs a comma and an "and", it is two ideas.', { sectionId: heroSection.id }));
  }
  out.push(...auditImpeccableSlop(page));
  out.push(...auditBrokenUi(page));
  const brokenChars = page.signals?.brokenUi?.mainContentChars ?? null;
  if ((page.sections?.length ?? 0) === 0 && (page.controls?.length ?? 0) < 3 && brokenChars !== null && brokenChars < 40 && page.ok) {
    const alreadyStuck = out.some((f3) => /stuck on a bare Loading|stuck in loading/i.test(f3.title));
    if (!alreadyStuck) {
      out.push(
        mk6(
          page,
          "flow",
          "critical",
          "Page captured as an empty shell",
          `Crawl got HTTP ${page.status} but extracted ${brokenChars} main-content characters with no sections. Typical of a spinner hang or a route that never painted.`,
          "Wait for real content before considering the route ready, or show a timeout empty/error state with a recovery CTA.",
          { effort: "component", confidence: "high" }
        )
      );
    }
  }
  out.push(...auditPremiumCraft(page));
  return out;
}
function clusterColourDecisions(values) {
  const buckets = [];
  for (const v of values) {
    const p4 = parseColor(v);
    if (!p4) {
      buckets.push({ h: -1, s: 0, l: 0, members: [v], alphas: [1] });
      continue;
    }
    const r = p4.r / 255;
    const g = p4.g / 255;
    const b = p4.b / 255;
    const max2 = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max2 + min) / 2;
    const d = max2 - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d !== 0) {
      if (max2 === r) h = (g - b) / d % 6;
      else if (max2 === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    const hit = buckets.find(
      (bk) => bk.h >= 0 && Math.abs(bk.h - h) < 18 && Math.abs(bk.s - s) < 0.18 && Math.abs(bk.l - l) < 0.12
    );
    if (hit) {
      hit.members.push(v);
      hit.alphas.push(p4.alpha);
    } else {
      buckets.push({ h, s, l, members: [v], alphas: [p4.alpha] });
    }
  }
  return buckets.map((bk) => ({
    label: bk.members.length > 1 ? `${bk.members[0]} (+${bk.members.length - 1} alpha/near)` : bk.members[0],
    members: bk.members
  }));
}
function longestRun(arr) {
  let best = { role: arr[0] ?? "", count: 0 };
  let cur = { role: arr[0] ?? "", count: 0 };
  for (const r of arr) {
    if (r === cur.role) cur.count++;
    else cur = { role: r, count: 1 };
    if (cur.count > best.count) best = { ...cur };
  }
  return best;
}
var CATEGORY_BUDGET = {
  coherence: 180,
  variety: 90,
  accessibility: 220,
  responsive: 130,
  flow: 170,
  performance: 120,
  content: 80,
  craft: 110
};
function scoreRun(findings, pageCount, brutality) {
  const multiplier = brutality === "ruthless" ? 1.35 : brutality === "harsh" ? 1 : 0.75;
  const categories = {};
  const cats = ["coherence", "variety", "accessibility", "responsive", "flow", "performance", "content", "craft"];
  const effortEase = { "one-line": 1.15, component: 1, redesign: 0.75 };
  for (const c2 of cats) {
    const list = findings.filter((f3) => f3.category === c2);
    const penalty = list.reduce((s, f3) => {
      const reach = Math.min(2, 1 + Math.log10(Math.max(1, f3.affectedPages ?? 1)));
      const ease = effortEase[f3.effort ?? guessEffort(f3)];
      return s + SEVERITY_WEIGHT[f3.severity] * reach * ease;
    }, 0) * multiplier;
    const budget = CATEGORY_BUDGET[c2] * Math.max(1, pageCount * 0.5);
    const ratio2 = penalty / budget;
    const score2 = Math.max(2, Math.round(100 * Math.exp(-ratio2)));
    categories[c2] = { score: score2, findings: list.length };
  }
  const weights = {
    coherence: 0.19,
    accessibility: 0.19,
    flow: 0.15,
    responsive: 0.13,
    variety: 0.08,
    performance: 0.09,
    craft: 0.12,
    content: 0.05
  };
  let overall = 0;
  for (const c2 of cats) overall += categories[c2].score * weights[c2];
  const worstScore = Math.min(...cats.map((c2) => categories[c2].score));
  overall = Math.round(Math.min(overall, worstScore + 25));
  const blockers = findings.filter((f3) => f3.severity === "blocker").length;
  if (blockers) overall = Math.min(overall, 45);
  const grade = overall >= 90 ? "A" : overall >= 80 ? "B" : overall >= 70 ? "C" : overall >= 60 ? "D" : overall >= 45 ? "E" : "F";
  const worst = [...cats].sort((a, b) => categories[a].score - categories[b].score).slice(0, 2);
  const verdict = overall >= 88 ? `Genuinely tight. Weakest link is ${worst[0]} (${categories[worst[0]].score}); everything else holds up under scrutiny.` : overall >= 72 ? `Competent but not finished. ${worst[0]} and ${worst[1]} are dragging it down \u2014 ${findings.filter((f3) => f3.severity === "critical" || f3.severity === "blocker").length} critical issue(s) still open.` : overall >= 55 ? `This ships as "fine" and reads as unfinished. ${worst[0]} (${categories[worst[0]].score}) and ${worst[1]} (${categories[worst[1]].score}) need a dedicated pass, not touch-ups.` : `Not defensible in front of users. ${findings.filter((f3) => f3.severity === "blocker" || f3.severity === "critical").length} blocking/critical issues, with ${worst[0]} at ${categories[worst[0]].score}. Rebuild the offending sections on system primitives rather than patching.`;
  return { overall, grade, verdict, categories };
}
function themeSummary(pages) {
  const colors = /* @__PURE__ */ new Map();
  const fonts = /* @__PURE__ */ new Map();
  const radii = /* @__PURE__ */ new Map();
  for (const p4 of pages) {
    for (const c2 of p4.tokens.colors) colors.set(c2.value, (colors.get(c2.value) ?? 0) + c2.usage);
    for (const f3 of p4.tokens.fontFamilies) fonts.set(f3.value, (fonts.get(f3.value) ?? 0) + f3.usage);
    for (const r of p4.tokens.radii) radii.set(r.value, (radii.get(r.value) ?? 0) + r.usage);
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k4]) => k4);
  return [
    `Fonts: ${top(fonts, 3).join(", ") || "n/a"}`,
    `Dominant colours: ${top(colors, 6).join(", ") || "n/a"}`,
    `Radii: ${top(radii, 4).join(", ") || "none"}`
  ].join(" \xB7 ");
}

// ../../../../private/tmp/stress-stress.ts
var targets = [
  "https://ui.shadcn.com",
  "https://linear.app",
  "https://stripe.com",
  "https://vercel.com"
];
var config = (url) => ({
  targetUrl: url,
  maxPages: 1,
  viewports: DEFAULT_VIEWPORTS,
  useMobbin: false,
  useShadcn: false,
  useGemini: false,
  useInteractionProbe: false,
  provider: "gemini",
  geminiModel: "gemini-3.6-flash",
  brutality: "ruthless",
  productContext: "",
  flows: []
});
for (const target of targets) {
  const dir = await mkdtemp(join4(tmpdir(), "qualition-stress-"));
  let browser;
  try {
    console.log(`
${"=".repeat(70)}`);
    console.log(`TARGET: ${target}`);
    console.log("=".repeat(70));
    browser = await launch();
    const pages = await crawl(browser, target, 1, {
      viewports: DEFAULT_VIEWPORTS,
      outDir: dir,
      onLog: () => {
      }
    });
    const p4 = pages[0];
    if (!p4) {
      console.log("  NO PAGE CAPTURED");
      continue;
    }
    console.log(`  status=${p4.status} sections=${p4.sections.length} tokens(colors=${p4.tokens.colors.length} fonts=${p4.tokens.fontFamilies.length} sizes=${p4.tokens.fontSizes.length}) axe=${p4.axe.length} consoleErrors=${p4.consoleErrors.length} networkFailures=${p4.networkFailures.length}`);
    if (p4.cssStats) {
      const c2 = p4.cssStats;
      console.log(`  css: ${(c2.bytes / 1024).toFixed(0)}kB ${c2.sheets} sheets ${c2.rules} rules ${c2.selectors} selectors`);
      console.log(`    !important ${(c2.importantRatio * 100).toFixed(1)}% id ${(c2.idSelectorRatio * 100).toFixed(1)}% maxSpec ${c2.maxSpecificity} zMax ${c2.zIndexMax} zUnique ${c2.zIndexUnique}`);
      console.log(`    colors ${c2.colorsUnique}/${c2.colorsTotal} fontSizesU ${c2.fontSizesUnique} radiiU ${c2.radiiUnique} shadowsU ${c2.shadowsUnique}`);
    }
    console.log(`  theme: ${themeSummary(pages).slice(0, 200)}`);
    console.log(`  signals: ${JSON.stringify(p4.signals).slice(0, 500)}`);
    console.log(`  sections: ${p4.sections.map((s) => `${s.role}(${Math.round(s.rect.height)})`).join(", ")}`);
    const findings = [];
    for (const pg of pages) {
      findings.push(...auditPage(pg, config(target)));
      if (pg.cssStats) findings.push(...auditCss(pg, pg.cssStats, config(target)));
      if (pg.tokenDictionary) findings.push(...auditTokens(pg, pg.tokenDictionary, config(target)));
    }
    const score2 = scoreRun(findings, pages.length, "ruthless");
    console.log(`
  SCORE ${score2.grade} ${score2.overall}/100 - ${score2.verdict}`);
    console.log(`  categories: ${Object.entries(score2.categories).map(([k4, v]) => `${k4}:${v.score}(${v.findings})`).join(" ")}`);
    console.log(`  total findings: ${findings.length}`);
    const byCat = {};
    for (const f3 of findings) {
      byCat[f3.category] = (byCat[f3.category] || 0) + 1;
    }
    console.log(`  byCategory: ${JSON.stringify(byCat)}`);
    console.log(`
  ALL FINDINGS:`);
    for (const f3 of findings) {
      console.log(`   [${f3.severity}/${f3.category}/${f3.source}] ${f3.title}`);
      if (f3.detail) console.log(`      detail: ${f3.detail.slice(0, 180).replace(/\n/g, " | ")}`);
    }
  } catch (e4) {
    console.error(`  ERROR on ${target}:`, e4.message, e4.stack?.slice(0, 800));
  } finally {
    try {
      await browser?.close();
    } catch {
    }
  }
}
console.log("\nSTRESS DONE");
