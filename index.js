import { app, safeStorage, protocol, nativeImage, net, BrowserWindow, ipcMain, shell, dialog } from "electron";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { analyze } from "@projectwallace/css-analyzer";
import { calculate } from "@projectwallace/css-code-quality";
import { converter, differenceCiede2000, parse } from "culori";
import { GoogleGenAI } from "@google/genai";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { promisify } from "node:util";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const extractFn = function() {
  const clamp = (s, n) => s.length > n ? s.slice(0, n) + "…" : s;
  const bump = (m, k) => {
    m.set(k, (m.get(k) ?? 0) + 1);
  };
  const cctx = document.createElement("canvas").getContext("2d");
  const colorCache = /* @__PURE__ */ new Map();
  const norm2 = (c) => {
    if (!c || !cctx) return c;
    if (c.startsWith("rgb") || c.startsWith("#")) return c;
    const hit = colorCache.get(c);
    if (hit) return hit;
    let out = c;
    try {
      cctx.clearRect(0, 0, 1, 1);
      cctx.fillStyle = c;
      cctx.fillRect(0, 0, 1, 1);
      const d = cctx.getImageData(0, 0, 1, 1).data;
      out = d[3] === 255 ? `rgb(${d[0]}, ${d[1]}, ${d[2]})` : `rgba(${d[0]}, ${d[1]}, ${d[2]}, ${(d[3] / 255).toFixed(2)})`;
    } catch {
    }
    colorCache.set(c, out);
    return out;
  };
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.05;
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
    if (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)") bump(colorBg, norm2(cs.backgroundColor));
    if (el.textContent && el.textContent.trim().length > 0) {
      bump(colorText, norm2(cs.color));
      bump(fonts, cs.fontFamily.split(",")[0].replace(/["']/g, "").trim());
      bump(sizes, String(Math.round(parseFloat(cs.fontSize))));
      bump(weights, String(cs.fontWeight));
    }
    if (cs.borderTopWidth !== "0px" && cs.borderTopColor) bump(colorBorder, norm2(cs.borderTopColor));
    if (cs.borderRadius && cs.borderRadius !== "0px") {
      const parts = cs.borderRadius.split(" ");
      bump(radii, parts.every((p) => p === parts[0]) ? parts[0] : cs.borderRadius);
    }
    if (cs.boxShadow && cs.boxShadow !== "none") bump(shadows, clamp(cs.boxShadow, 60));
    for (const p of ["paddingTop", "paddingBottom", "marginTop", "marginBottom", "gap"]) {
      const v = parseFloat(cs[p]);
      if (v > 0) bump(spacing, String(Math.round(v)));
    }
    if (cs.transitionDuration && cs.transitionDuration !== "0s")
      bump(transitions, `${cs.transitionDuration} ${cs.transitionTimingFunction}`);
  }
  const toArr = (m, numeric = false) => Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([value, usage]) => ({ value: numeric ? Number(value) : value, usage }));
  const tokens = {
    colors: [
      ...toArr(colorBg).map((c) => ({ ...c, role: "bg" })),
      ...toArr(colorText).map((c) => ({ ...c, role: "text" })),
      ...toArr(colorBorder).map((c) => ({ ...c, role: "border" }))
    ],
    fontFamilies: toArr(fonts),
    fontSizes: toArr(sizes, true),
    fontWeights: toArr(weights, true),
    radii: toArr(radii),
    shadows: toArr(shadows),
    spacing: toArr(spacing, true),
    transitions: toArr(transitions)
  };
  const cssPath = (el) => {
    const parts = [];
    let cur = el;
    let depth2 = 0;
    while (cur && cur !== document.body && depth2 < 5) {
      let part = cur.tagName.toLowerCase();
      if (cur.id) {
        part += `#${cur.id}`;
        parts.unshift(part);
        break;
      }
      const cls = (cur.getAttribute("class") ?? "").split(/\s+/).filter((c) => c && !/^(css-|sc-|jsx-)/.test(c) && c.length < 24).slice(0, 2);
      if (cls.length) part += "." + cls.join(".");
      const parent = cur.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter((c) => c.tagName === cur.tagName);
        if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
      }
      parts.unshift(part);
      cur = cur.parentElement;
      depth2++;
    }
    return parts.join(" > ");
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
  if (candidates.length < 3) {
    const main = document.querySelector("main, [role=main], #root, #app, [data-app]") ?? document.body;
    let best = main;
    let bestScore = substance(main);
    const queue = [main];
    let guard = 0;
    while (queue.length && guard++ < 200) {
      const node = queue.shift();
      for (const child of Array.from(node.children)) {
        if (!isVisible(child)) continue;
        const s = substance(child);
        const r = child.getBoundingClientRect();
        if (s > bestScore * 0.9 && r.height > 200) {
          best = child;
          bestScore = s;
          queue.push(child);
        }
      }
    }
    const blocks = Array.from(best.children).filter((c) => isVisible(c) && hasSubstance(c));
    if (blocks.length >= 2) {
      for (const b of blocks) candidates.push(b);
    } else {
      candidates.push(best);
      for (const el of Array.from(document.querySelectorAll("aside, nav, [role=navigation], [role=complementary], [role=dialog]"))) {
        if (isVisible(el) && hasSubstance(el)) candidates.push(el);
      }
    }
  }
  const footer = document.querySelector("footer, [role=contentinfo]");
  if (footer) candidates.push(footer);
  const vh = window.innerHeight;
  const splitOnce = (list) => {
    const out = [];
    let changed = false;
    for (const el of list) {
      const h = el.getBoundingClientRect().height;
      const isLandmark = /^(header|footer|nav)$/.test(el.tagName.toLowerCase());
      if (!isLandmark && h > vh * 1.35) {
        const kids = Array.from(el.children).filter((k) => {
          const r = k.getBoundingClientRect();
          return r.height > 120 && r.width > 200 && isVisible(k);
        });
        if (kids.length >= 2) {
          out.push(...kids);
          changed = true;
          continue;
        }
        if (kids.length === 1) {
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
  const seen = /* @__PURE__ */ new Set();
  const docH = document.documentElement.scrollHeight;
  const sections = [];
  for (const el of candidates) {
    if (seen.has(el) || !isVisible(el)) continue;
    const rect = el.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    if (rect.height < 80 || rect.height > docH * 1.2) continue;
    if (!hasSubstance(el)) continue;
    if (sections.some((s) => top >= s.rect.y - 4 && top + rect.height <= s.rect.y + s.rect.height + 4))
      continue;
    seen.add(el);
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    const headings = Array.from(el.querySelectorAll("h1,h2,h3")).map((h) => (h.textContent ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 6);
    const interactives = Array.from(el.querySelectorAll("a,button,input,select,textarea,[role=button]"));
    const ctaLabels = interactives.map((b) => (b.textContent ?? b.value ?? "").replace(/\s+/g, " ").trim()).filter((t) => t && t.length < 40).slice(0, 8);
    const images = el.querySelectorAll("img,svg,video,picture,canvas");
    const tagCounts = /* @__PURE__ */ new Map();
    for (const c of Array.from(el.querySelectorAll("*")).slice(0, 800)) bump(tagCounts, c.tagName.toLowerCase());
    const bgSet = /* @__PURE__ */ new Set();
    const fsSet = /* @__PURE__ */ new Set();
    let maxTextWidth = 0;
    for (const c of Array.from(el.querySelectorAll("*")).slice(0, 600)) {
      if (!isVisible(c)) continue;
      const cs = getComputedStyle(c);
      if (cs.backgroundColor !== "rgba(0, 0, 0, 0)") bgSet.add(norm2(cs.backgroundColor));
      const t = (c.textContent ?? "").trim();
      if (t.length > 0 && c.children.length === 0) {
        fsSet.add(cs.fontSize);
        const w = c.getBoundingClientRect().width;
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
    for (const [k, v] of Object.entries(scores)) if (v > best) {
      best = v;
      role = k;
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
    const clickable = el.matches("a,button,input,select,[role=button],[onclick]");
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
      if (ox > 4 && oy > 4) overlaps++;
    }
  }
  const links = Array.from(document.querySelectorAll("a[href]")).map((a) => a.href).filter((h) => h.startsWith("http"));
  const controls = [];
  for (const el of Array.from(
    document.querySelectorAll("a[href], button, input, select, textarea, [role=button], [role=link], [role=tab]")
  )) {
    if (!isVisible(el) || controls.length >= 120) continue;
    const input = el;
    const labelText = input.labels && input.labels.length > 0 ? (input.labels[0].textContent ?? "").replace(/\s+/g, " ").trim() : "";
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    controls.push({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type") ?? "",
      role: el.getAttribute("role") ?? "",
      text: clamp(text, 60),
      placeholder: clamp(el.getAttribute("placeholder") ?? "", 60),
      label: clamp(labelText, 60),
      ariaLabel: clamp(el.getAttribute("aria-label") ?? "", 60),
      name: el.getAttribute("name") ?? "",
      href: el.getAttribute("href") ?? "",
      testId: el.getAttribute("data-testid") ?? el.getAttribute("data-test-id") ?? ""
    });
  }
  const imagesMissingAlt = Array.from(document.querySelectorAll("img")).filter(
    (i) => !i.getAttribute("alt") && !i.getAttribute("aria-hidden")
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
  let cssText = "";
  const externalSheets = [];
  let sheetCount = 0;
  for (const sheet of Array.from(document.styleSheets)) {
    sheetCount++;
    try {
      const rules = sheet.cssRules;
      let chunk = "";
      for (const rule of Array.from(rules)) chunk += rule.cssText + "\n";
      cssText += chunk;
    } catch {
      if (sheet.href) externalSheets.push(sheet.href);
    }
  }
  for (const el of Array.from(document.querySelectorAll("style"))) cssText += el.textContent ?? "";
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
  return {
    title: document.title,
    tokens,
    sections,
    responsive: { horizontalOverflowPx, tinyTextCount, smallTapTargets, overlaps },
    links: Array.from(new Set(links)).slice(0, 200),
    css: { text: cssText.slice(0, 4e6), external: externalSheets.slice(0, 30), sheetCount },
    controls,
    signals: {
      imagesMissingAlt,
      h1Count,
      headingOrderIssues,
      focusableWithoutOutline,
      animatedCount,
      docHeight: docH,
      viewportWidth: vw,
      langAttr: document.documentElement.getAttribute("lang"),
      title: document.title,
      metaDescription: document.querySelector("meta[name=description]")?.content ?? null,
      hasSkipLink: !!document.querySelector('a[href^="#"][class*=skip], a[href="#main"]'),
      buttonsWithoutLabel: Array.from(document.querySelectorAll("button")).filter(
        (b) => !(b.textContent ?? "").trim() && !b.getAttribute("aria-label")
      ).length
    },
    perf
  };
};
const observerInit = function() {
  try {
    ;
    window.__q_cls = 0;
    window.__q_longtask = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__q_lcp = Math.round(e.startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        if (!e.hadRecentInput) window.__q_cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__q_longtask += Math.round(e.duration);
    }).observe({ type: "longtask", buffered: true });
  } catch {
  }
};
let seq$1 = 0;
function mk$2(page, category, severity, title, detail, fix) {
  return {
    id: `c${++seq$1}`,
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
function analyzeCss(css, sheets) {
  if (!css || css.length < 40) return null;
  let a;
  try {
    a = analyze(css);
  } catch {
    return null;
  }
  let quality = { performance: 100, maintainability: 100, complexity: 100 };
  let qualityViolations = [];
  try {
    const q = calculate(css);
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
  const custom = a.properties?.custom ?? {};
  const zi = a.values?.zindexes ?? {};
  const zValues = Object.keys(zi.unique ?? {}).map((z) => parseInt(z, 10)).filter((n) => Number.isFinite(n));
  return {
    bytes: num(a.stylesheet?.size),
    sheets,
    rules: num(a.rules?.total),
    selectors: num(a.selectors?.total),
    maxSpecificity: (a.selectors?.specificity?.max ?? []).join(","),
    importantRatio: num(a.declarations?.importants?.ratio),
    idSelectorRatio: num(a.selectors?.id?.ratio),
    colorsTotal: num(a.values?.colors?.total),
    colorsUnique: num(a.values?.colors?.totalUnique),
    colorUniquenessRatio: num(a.values?.colors?.uniquenessRatio),
    fontSizesUnique: num(a.values?.fontSizes?.totalUnique),
    fontFamiliesUnique: num(a.values?.fontFamilies?.totalUnique),
    radiiUnique: num(a.values?.borderRadiuses?.totalUnique),
    shadowsUnique: num(a.values?.boxShadows?.totalUnique),
    zIndexUnique: num(zi.totalUnique),
    zIndexMax: zValues.length ? Math.max(...zValues) : 0,
    browserhacks: num(a.values?.browserhacks?.total) + num(a.selectors?.browserhacks?.total),
    vendorPrefixed: num(a.values?.prefixes?.total) + num(a.properties?.prefixed?.total),
    customPropsDefined: num(custom.total),
    customPropsUnused: Array.isArray(custom.unused) ? custom.unused.length : 0,
    mediaQueries: num(a.atrules?.media?.total),
    quality,
    qualityViolations
  };
}
function auditCss(page, stats, config) {
  const out = [];
  const strict = config.brutality === "ruthless" ? 1 : config.brutality === "harsh" ? 0.75 : 0.5;
  if (stats.importantRatio > 0.03) {
    const pct = (stats.importantRatio * 100).toFixed(1);
    out.push(
      mk$2(
        page,
        "coherence",
        stats.importantRatio > 0.08 ? "major" : "minor",
        `${pct}% of declarations use !important`,
        `${stats.rules} rules, ${stats.selectors} selectors. Healthy stylesheets sit under 3%; above that the cascade is being fought rather than designed.`,
        "Delete !important and fix the specificity that made it necessary — usually an over-qualified selector or a global reset."
      )
    );
  }
  if (stats.idSelectorRatio > 0.02) {
    out.push(
      mk$2(
        page,
        "coherence",
        "minor",
        `${(stats.idSelectorRatio * 100).toFixed(1)}% of selectors use IDs`,
        `Max specificity in the sheet is (${stats.maxSpecificity}). ID selectors cannot be overridden by component classes, so they force !important downstream.`,
        "Swap ID selectors for class or data-attribute hooks."
      )
    );
  }
  const [a = 0, b = 0] = stats.maxSpecificity.split(",").map(Number);
  if (a > 0 || b > 4) {
    out.push(
      mk$2(
        page,
        "coherence",
        "minor",
        `Specificity peaks at (${stats.maxSpecificity})`,
        'Deeply specific selectors make component styles unpredictable and are the root cause of most "why is this not applying" bugs.',
        "Flatten to single-class selectors; let composition, not specificity, resolve conflicts."
      )
    );
  }
  if (stats.colorsTotal > 40 && stats.colorUniquenessRatio > 0.35) {
    out.push(
      mk$2(
        page,
        "coherence",
        stats.colorUniquenessRatio > 0.55 ? "major" : "minor",
        `Colour reuse is low (${stats.colorsUnique} unique / ${stats.colorsTotal} declarations)`,
        `Uniqueness ratio ${(stats.colorUniquenessRatio * 100).toFixed(0)}% — most colours are written once. That is a palette by accident, not by system.`,
        "Promote the repeated values to CSS custom properties and make one-offs illegal in review."
      )
    );
  }
  if (stats.fontSizesUnique > 12) {
    out.push(
      mk$2(
        page,
        "coherence",
        "major",
        `${stats.fontSizesUnique} unique font sizes in the stylesheet`,
        "Authored CSS confirms there is no type scale — the DOM sample only shows what happened to render.",
        "Define the scale as tokens and refactor call sites to reference them."
      )
    );
  }
  if (stats.radiiUnique > 6) {
    out.push(
      mk$2(
        page,
        "coherence",
        "minor",
        `${stats.radiiUnique} unique border-radius values authored`,
        "Roundness is being decided per component instead of per system.",
        "Derive every radius from one --radius token."
      )
    );
  }
  if (stats.shadowsUnique > 8) {
    out.push(
      mk$2(
        page,
        "coherence",
        "minor",
        `${stats.shadowsUnique} unique box-shadow values authored`,
        "Elevation should be a 3–4 step ladder; this many shadows means each component invented its own.",
        "Collapse into elevation tokens applied by role."
      )
    );
  }
  if (stats.zIndexUnique > 8 || stats.zIndexMax >= 1e3) {
    out.push(
      mk$2(
        page,
        "craft",
        stats.zIndexMax >= 9999 ? "major" : "minor",
        `z-index sprawl: ${stats.zIndexUnique} unique values, max ${stats.zIndexMax}`,
        "Ad-hoc stacking values are a stacking-context bug waiting to happen (and the reason modals hide behind headers).",
        "Define a named layer scale (base/dropdown/sticky/overlay/modal/toast) and forbid raw numbers."
      )
    );
  }
  if (stats.customPropsUnused > 0 && strict > 0.6) {
    out.push(
      mk$2(
        page,
        "coherence",
        "nit",
        `${stats.customPropsUnused} CSS custom properties defined but never used`,
        `${stats.customPropsDefined} custom properties declared in total.`,
        "Dead tokens confuse the next person; delete them or use them."
      )
    );
  }
  if (stats.browserhacks > 0) {
    out.push(
      mk$2(
        page,
        "craft",
        "nit",
        `${stats.browserhacks} browser hacks in the stylesheet`,
        "Targeting specific engines with parse hacks is unmaintainable and usually obsolete.",
        "Replace with feature queries (@supports)."
      )
    );
  }
  if (stats.bytes > 5e5) {
    out.push(
      mk$2(
        page,
        "performance",
        stats.bytes > 1e6 ? "major" : "minor",
        `${(stats.bytes / 1024).toFixed(0)} kB of CSS across ${stats.sheets} stylesheet(s)`,
        "Large stylesheets block first render and usually mean dead rules are shipping.",
        "Split per route, purge unused rules, and load non-critical CSS asynchronously."
      )
    );
  }
  const q = stats.quality;
  if (q.maintainability < 70 || q.complexity < 70 || q.performance < 70) {
    out.push(
      mk$2(
        page,
        "coherence",
        q.maintainability < 45 || q.complexity < 45 ? "major" : "minor",
        `CSS quality: perf ${q.performance}, maintainability ${q.maintainability}, complexity ${q.complexity}`,
        `Project Wallace guards failing: ${stats.qualityViolations.map((v) => v.id).slice(0, 8).join(", ") || "n/a"}.`,
        "Attack the lowest score first — these guards map directly to selector complexity, !important use and specificity spread."
      )
    );
  }
  return out;
}
const LOCAL_HOSTS = /* @__PURE__ */ new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]", "host.docker.internal"]);
function isLocalHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return LOCAL_HOSTS.has(h) || h.endsWith(".local") || h.endsWith(".localhost") || /^192\.168\./.test(h) || /^10\./.test(h);
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
async function withRetry(label, attempts, fn, onLog) {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      onLog?.(`${label} attempt ${i}/${attempts} failed: ${e.message.slice(0, 160)}`);
      if (i < attempts) await new Promise((r) => setTimeout(r, 800 * i));
    }
  }
  throw lastError;
}
const DEFAULT_VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, isMobile: false },
  { name: "tablet", width: 834, height: 1112, isMobile: false },
  { name: "mobile", width: 390, height: 844, isMobile: true }
];
async function launch() {
  return chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
}
function sameOrigin(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}
const JUNK_PARAMS = /^(utm_|ref$|referrer$|fbclid$|gclid$|msclkid$|mc_[ce]id$|_ga|igshid$|source$|preset$|variant$|v$|t$|ts$|cache|hash)/i;
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
  let url = normalizeTargetUrl(rawUrl) ?? rawUrl;
  const consoleErrors = [];
  const networkFailures = [];
  const screenshots = {};
  const responsive = [];
  const slug = url.replace(/https?:\/\//, "").replace(/[^a-z0-9]/gi, "_").slice(0, 60);
  let extracted = null;
  let axe = [];
  let cssStats = null;
  let status = 0;
  let ok = true;
  let errorText;
  let sections = [];
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
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(`[${vp.name}] ${m.text().slice(0, 300)}`);
    });
    page.on("pageerror", (e) => consoleErrors.push(`[${vp.name}] pageerror: ${e.message.slice(0, 300)}`));
    page.on(
      "requestfailed",
      (r) => networkFailures.push({ url: r.url().slice(0, 200), status: r.failure()?.errorText ?? "failed" })
    );
    page.on("response", (r) => {
      if (r.status() >= 400) networkFailures.push({ url: r.url().slice(0, 200), status: r.status() });
    });
    try {
      const res = await withRetry(
        `goto ${url} (${vp.name})`,
        2,
        async () => {
          try {
            return await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45e3 });
          } catch (e) {
            const alt = schemeFallback(url);
            if (!alt) throw e;
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
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(700);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);
      const shot = join(opts.outDir, `${slug}-${vp.name}.png`);
      await page.screenshot({ path: shot, fullPage: true, animations: "disabled" });
      screenshots[vp.name] = shot;
      const data = await page.evaluate(extractFn);
      responsive.push({
        viewport: vp.name,
        horizontalOverflowPx: data.responsive.horizontalOverflowPx,
        tinyTextCount: data.responsive.tinyTextCount,
        smallTapTargets: data.responsive.smallTapTargets,
        overlaps: data.responsive.overlaps
      });
      if (vp.name === opts.viewports[0].name) {
        extracted = data;
        sections = data.sections;
        for (const s of sections.slice(0, 14)) {
          try {
            const el = page.locator(s.selector).first();
            const file = join(opts.outDir, `${slug}-${s.id}.png`);
            await el.screenshot({ path: file, timeout: 6e3 });
            s.screenshot = file;
          } catch {
          }
        }
        try {
          let cssText = data.css?.text ?? "";
          for (const href of data.css?.external ?? []) {
            try {
              const res2 = await ctx.request.get(href, { timeout: 8e3 });
              if (res2.ok()) cssText += "\n" + await res2.text();
            } catch {
            }
          }
          cssStats = analyzeCss(cssText, data.css?.sheetCount ?? 0);
        } catch (e) {
          opts.onLog?.(`css analysis failed on ${url}: ${e.message}`);
        }
        try {
          const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
          axe = (result.violations ?? []).map((v) => ({
            id: v.id,
            impact: v.impact ?? null,
            help: v.help,
            helpUrl: v.helpUrl,
            nodes: (v.nodes ?? []).slice(0, 5).map((n) => ({
              target: n.target,
              failureSummary: (n.failureSummary ?? "").slice(0, 400)
            }))
          }));
        } catch (e) {
          opts.onLog?.(`axe failed on ${url}: ${e.message}`);
        }
      }
    } catch (e) {
      ok = false;
      errorText = e.message;
      opts.onLog?.(`capture failed (${vp.name}) ${url}: ${errorText}`);
    } finally {
      await ctx.close();
    }
  }
  const perf = extracted?.perf ?? {};
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
    networkFailures: networkFailures.slice(0, 40),
    controls: extracted?.controls ?? [],
    responsive,
    links: extracted?.links ?? [],
    // signals ride along for the heuristic pass
    ...{ signals: extracted?.signals ?? {} }
  };
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
  if (unlimited) opts.onLog?.("crawling every reachable same-origin route (no page limit)");
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
    const identity = pageIdentity(url);
    if (visited.has(url) || seenPaths.has(identity)) continue;
    visited.add(url);
    seenPaths.add(identity);
    opts.onLog?.(`capturing ${url}`);
    const page = await capturePage(browser, url, opts);
    pages.push(page);
    opts.onPage?.(page);
    const candidates = page.links.map(normalize).filter((l) => sameOrigin(l, startUrl)).filter((l) => !visited.has(l) && !seenPaths.has(pageIdentity(l))).filter((l) => !/\.(pdf|zip|png|jpe?g|svg|webp|gif|mp4|dmg|exe|css|js|xml|txt|rss)$/i.test(l)).filter((l) => !/\/(cdn-cgi|api|_next|static|assets)\//i.test(l));
    const byPath = /* @__PURE__ */ new Map();
    for (const l of candidates) {
      const id = pageIdentity(l);
      const existing = byPath.get(id);
      if (!existing || existing.includes("?") && !l.includes("?")) byPath.set(id, l);
    }
    const queuedPaths = new Set(queue.map(pageIdentity));
    const ranked = [...byPath.values()].filter((l) => !queuedPaths.has(pageIdentity(l))).sort((a, b) => score(b) - score(a) || depth(a) - depth(b) || a.length - b.length);
    for (const l of ranked) {
      queue.push(l);
      queuedPaths.add(pageIdentity(l));
    }
  }
  if (queue.length === 0) {
    opts.onLog?.(
      `crawl exhausted the site: ${pages.length} distinct route(s) captured, no further same-origin links found`
    );
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
async function runFlow(browser, baseUrl, flow, outDir, storageState) {
  const origin = flow.origin ?? "user";
  if (flow.invalid) {
    return {
      name: flow.name,
      steps: flow.steps.map((step) => ({ step, ok: false, ms: 0, skipped: true, error: "not run — target does not exist" })),
      ok: false,
      totalMs: 0,
      origin,
      invalid: flow.invalid
    };
  }
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...storageState ? { storageState } : {}
  });
  const page = await ctx.newPage();
  const results = [];
  const started = Date.now();
  let ok = true;
  for (let i = 0; i < flow.steps.length; i++) {
    const step = flow.steps[i];
    const t0 = Date.now();
    try {
      await execStep(page, step, baseUrl);
      const shot = join(outDir, `flow-${flow.name.replace(/\W+/g, "_")}-${i}.png`);
      await page.screenshot({ path: shot });
      results.push({ step, ok: true, ms: Date.now() - t0, screenshot: shot });
    } catch (e) {
      ok = false;
      const shot = join(outDir, `flow-${flow.name.replace(/\W+/g, "_")}-${i}-FAIL.png`);
      try {
        await page.screenshot({ path: shot });
      } catch {
      }
      results.push({ step, ok: false, ms: Date.now() - t0, error: e.message.slice(0, 300), screenshot: shot });
      break;
    }
  }
  await ctx.close();
  return { name: flow.name, steps: results, ok, totalMs: Date.now() - started, origin };
}
async function execStep(page, step, baseUrl) {
  const timeout = 6e3;
  switch (step.action) {
    case "goto":
      await page.goto(new URL(step.target ?? "/", baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: 3e4 });
      await page.waitForLoadState("networkidle", { timeout: 5e3 }).catch(() => {
      });
      await page.waitForTimeout(500);
      return;
    case "click":
      await resolve(page, step.target).click({ timeout });
      await page.waitForTimeout(700);
      return;
    case "fill":
      await resolve(page, step.target).fill(step.value ?? "", { timeout });
      return;
    case "press":
      await page.keyboard.press(step.value ?? "Enter");
      await page.waitForTimeout(700);
      return;
    case "scroll":
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(400);
      return;
    case "wait":
      await page.waitForTimeout(Number(step.value ?? 1e3));
      return;
    case "assertText": {
      const needle = step.value ?? step.target ?? "";
      if (!needle) throw new Error("assertText step has no text to assert");
      try {
        await page.getByText(needle, { exact: false }).first().waitFor({ state: "visible", timeout });
      } catch {
        throw new Error(`text not visible after ${timeout}ms: ${needle}`);
      }
      return;
    }
  }
}
function resolve(page, target) {
  if (target.startsWith("text=")) return page.getByText(target.slice(5), { exact: false }).first();
  if (target.startsWith("role=")) {
    const [role, name] = target.slice(5).split(":");
    return page.getByRole(role, name ? { name } : void 0).first();
  }
  if (target.startsWith("label=")) return page.getByLabel(target.slice(6)).first();
  if (target.startsWith("placeholder=")) return page.getByPlaceholder(target.slice(12)).first();
  return page.locator(target).first();
}
const SEVERITY_WEIGHT = {
  blocker: 40,
  critical: 18,
  major: 8,
  minor: 3,
  nit: 1
};
function modelFor(s) {
  return s.provider === "openai" ? s.openaiModel : s.provider === "cursor" ? s.cursorModel : s.geminiModel;
}
let counter$1 = 0;
function mk$1(page, category, severity, title, detail, fix, extra = {}) {
  return {
    id: `f${++counter$1}`,
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
const toRgb = converter("rgb");
const ciede2000 = differenceCiede2000();
function parseColor(c) {
  try {
    const parsed = parse(c.trim());
    if (!parsed) return null;
    const rgb = toRgb(parsed);
    if (!rgb) return null;
    return { r: rgb.r * 255, g: rgb.g * 255, b: rgb.b * 255, alpha: rgb.alpha ?? 1 };
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
function auditPage(page, config) {
  const out = [];
  const signals = page.signals ?? {};
  const strict = config.brutality === "ruthless" ? 1 : config.brutality === "harsh" ? 0.75 : 0.5;
  const t = page.tokens;
  if (!page.ok) {
    out.push(
      mk$1(page, "flow", "blocker", "Page failed to capture", page.errorText ?? "Navigation error", "Fix the route or the redirect chain before anything else — an unreachable page is a 0.")
    );
    return out;
  }
  const meaningful = t.colors.filter((c) => c.usage >= 2);
  meaningful.filter((c) => c.role === "text");
  meaningful.filter((c) => c.role === "bg");
  const distinct = new Set(meaningful.map((c) => c.value)).size;
  const colorBudget = config.brutality === "ruthless" ? 12 : 18;
  if (distinct > colorBudget) {
    out.push(
      mk$1(
        page,
        "coherence",
        distinct > colorBudget * 1.8 ? "critical" : "major",
        `${distinct} distinct colours in use`,
        `Palette budget for a coherent product surface is ~${colorBudget} (bg/text/border combined). Found ${distinct}, top offenders: ${meaningful.slice(0, 8).map((c) => c.value).join(", ")}.`,
        "Collapse to a token set (background/foreground/muted/accent/destructive + 2 states). Anything not expressible as a CSS variable is drift."
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
        dupes.push(`${meaningful[i].value} ≈ ${meaningful[j].value} (ΔE2000 ${d.toFixed(2)})`);
    }
  }
  if (dupes.length >= 2) {
    out.push(
      mk$1(
        page,
        "coherence",
        dupes.length > 5 ? "major" : "minor",
        `${dupes.length} near-duplicate colour pairs`,
        `Visually identical colours defined separately — the signature of hand-typed hexes: ${dupes.slice(0, 5).join("; ")}.`,
        "Deduplicate into one token each. Below ΔE2000 2.0 the difference is imperceptible to users but very visible in your CSS."
      )
    );
  }
  const families = t.fontFamilies.filter((f) => f.usage >= 3);
  if (families.length > 2) {
    out.push(
      mk$1(
        page,
        "coherence",
        families.length > 3 ? "major" : "minor",
        `${families.length} font families on one page`,
        `Families: ${families.map((f) => `${f.value} (${f.usage})`).join(", ")}.`,
        "Two families max: one for UI/body, optionally one display face. A third family reads as an unfinished migration."
      )
    );
  }
  const sizes = t.fontSizes.filter((s) => s.usage >= 2).map((s) => s.value).sort((a, b) => a - b);
  const sizeBudget = config.brutality === "ruthless" ? 7 : 9;
  if (sizes.length > sizeBudget) {
    out.push(
      mk$1(
        page,
        "coherence",
        "major",
        `${sizes.length} distinct font sizes`,
        `Sizes: ${sizes.join(", ")}px. A type scale should be a short geometric ladder, not a continuum.`,
        "Define a 6–8 step scale (12/14/16/18/24/30/36/48) and delete every orphan value."
      )
    );
  }
  const orphans = t.fontSizes.filter((s) => s.usage <= 2 && s.value % 2 !== 0);
  if (orphans.length >= 2 && strict > 0.6) {
    out.push(
      mk$1(
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
      mk$1(
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
      mk$1(
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
      mk$1(
        page,
        "coherence",
        "major",
        `${Math.round(offGrid.length / spacingValues.length * 100)}% of spacing is off the 4px grid`,
        `Off-grid values: ${offGrid.slice(0, 10).join(", ")}px.`,
        "Move to a 4px (ideally 8px) rhythm. Off-grid spacing is why sections never quite align."
      )
    );
  }
  if (t.transitions.length > 5) {
    out.push(
      mk$1(
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
      mk$1(
        page,
        "variety",
        "major",
        "Page is rhythmically flat",
        `${page.sections.length} sections but only ${uniqueRoles} distinct section type(s): ${[...new Set(roles)].join(", ")}. Everything is the same slab.`,
        "Alternate density: hero → proof → 2-col explainer → metrics band → testimonial → FAQ → CTA. Vary background weight and column count to create scan anchors."
      )
    );
  }
  const repeatedRun = longestRun(roles);
  if (repeatedRun.count >= 4) {
    out.push(
      mk$1(
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
      mk$1(
        page,
        "variety",
        "nit",
        "No background contrast between sections",
        "Every section shares the same surface colour, so the page reads as one endless scroll.",
        "Alternate surface/muted backgrounds, or add a full-bleed accent band at the conversion point."
      )
    );
  }
  const ctaTexts = page.sections.flatMap((s) => s.ctaLabels).map((c) => c.toLowerCase().trim()).filter(Boolean);
  const ctaCounts = /* @__PURE__ */ new Map();
  for (const c of ctaTexts) ctaCounts.set(c, (ctaCounts.get(c) ?? 0) + 1);
  const topCta = [...ctaCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topCta && topCta[1] >= 5) {
    out.push(
      mk$1(
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
        mk$1(
          page,
          "craft",
          "minor",
          `Body copy runs ${Math.round(s.stats.maxTextWidthPx)}px wide`,
          "Optimal measure is 45–75 characters (~600–720px at 16px). Long lines destroy return-sweep accuracy.",
          "Cap with max-w-prose / max-w-2xl on text blocks.",
          { sectionId: s.id, selector: s.selector }
        )
      );
    }
    if (s.stats.distinctFontSizes > 6) {
      out.push(
        mk$1(
          page,
          "coherence",
          "minor",
          `Section "${s.label}" uses ${s.stats.distinctFontSizes} font sizes`,
          "A single section rarely needs more than 3–4 steps of hierarchy.",
          "Collapse to heading / body / caption and let weight and colour do the rest.",
          { sectionId: s.id, selector: s.selector }
        )
      );
    }
  }
  for (const v of page.axe) {
    const sev = v.impact === "critical" ? "critical" : v.impact === "serious" ? "major" : v.impact === "moderate" ? "minor" : "nit";
    out.push({
      id: `f${++counter$1}`,
      category: "accessibility",
      severity: sev,
      title: `axe: ${v.help}`,
      detail: `${v.nodes.length} node(s). ${v.nodes[0]?.failureSummary ?? ""} Targets: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`,
      fix: `Resolve per WCAG guidance: ${v.helpUrl}`,
      pageUrl: page.url,
      selector: v.nodes[0]?.target?.join(" "),
      source: "axe"
    });
  }
  if (signals.imagesMissingAlt > 0) {
    out.push(
      mk$1(
        page,
        "accessibility",
        signals.imagesMissingAlt > 5 ? "major" : "minor",
        `${signals.imagesMissingAlt} images without alt text`,
        "Screen-reader users get filenames or silence.",
        'Add descriptive alt, or alt="" + aria-hidden for decoration.'
      )
    );
  }
  if (signals.h1Count === 0) {
    out.push(mk$1(page, "accessibility", "major", "No <h1> on the page", "Document outline has no root heading.", "Exactly one <h1> that states the page proposition."));
  } else if (signals.h1Count > 1) {
    out.push(mk$1(page, "accessibility", "minor", `${signals.h1Count} <h1> elements`, "Multiple document titles confuse assistive tech and SEO.", "Demote all but the primary to <h2>."));
  }
  if (signals.headingOrderIssues > 0) {
    out.push(mk$1(page, "accessibility", "minor", `${signals.headingOrderIssues} heading-level skips`, "Levels jump (e.g. h2 → h4), breaking the outline.", "Never skip levels; style with classes, not tag choice."));
  }
  if (signals.buttonsWithoutLabel > 0) {
    out.push(mk$1(page, "accessibility", "major", `${signals.buttonsWithoutLabel} icon-only buttons without a label`, "Buttons with no text and no aria-label are unusable non-visually.", "Add aria-label, or a visually hidden span."));
  }
  if (!signals.hasSkipLink && strict > 0.7) {
    out.push(mk$1(page, "accessibility", "nit", "No skip-to-content link", "Keyboard users must tab through the whole nav on every page.", "Add a focus-visible skip link as the first focusable element."));
  }
  if (!signals.langAttr) {
    out.push(mk$1(page, "accessibility", "minor", "Missing <html lang>", "Screen readers pick the wrong voice.", "Set lang on the html element."));
  }
  for (const r of page.responsive) {
    if (r.horizontalOverflowPx > 4) {
      out.push(
        mk$1(
          page,
          "responsive",
          r.horizontalOverflowPx > 40 ? "critical" : "major",
          `Horizontal overflow of ${r.horizontalOverflowPx}px at ${r.viewport}`,
          "The page scrolls sideways — usually a fixed-width child, a wide table, or an un-wrapped flex row.",
          "Find the offender with overflow-x debugging and constrain with min-w-0 / max-w-full / overflow-x-auto on the container.",
          { viewport: r.viewport }
        )
      );
    }
    if (r.tinyTextCount > 3) {
      out.push(
        mk$1(
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
        mk$1(
          page,
          "accessibility",
          "major",
          `${r.smallTapTargets} tap targets below 32px at mobile`,
          "WCAG 2.5.8 asks for 24px minimum; platform guidance is 44px. Small targets are the top mobile complaint.",
          "Pad to at least 44×44 hit area; visual size can stay small.",
          { viewport: r.viewport }
        )
      );
    }
    if (r.overlaps > 2) {
      out.push(
        mk$1(
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
  if (page.consoleErrors.length > 0) {
    out.push(
      mk$1(
        page,
        "flow",
        page.consoleErrors.length > 5 ? "critical" : "major",
        `${page.consoleErrors.length} console errors`,
        page.consoleErrors.slice(0, 5).join("\n"),
        "Ship zero console errors. Each one is a feature that is silently broken for someone."
      )
    );
  }
  const hardFails = page.networkFailures.filter((n) => typeof n.status === "number" && n.status >= 500);
  const notFound = page.networkFailures.filter((n) => n.status === 404);
  if (hardFails.length) {
    out.push(mk$1(page, "flow", "critical", `${hardFails.length} server errors (5xx)`, hardFails.slice(0, 5).map((f) => `${f.status} ${f.url}`).join("\n"), "Fix or remove the failing endpoint; 5xx during page load means the experience is partially dead."));
  }
  if (notFound.length) {
    out.push(mk$1(page, "flow", "major", `${notFound.length} missing resources (404)`, notFound.slice(0, 5).map((f) => f.url).join("\n"), "Broken assets/endpoints — delete the reference or restore the file."));
  }
  if (page.status >= 400) {
    out.push(mk$1(page, "flow", "blocker", `Page returned HTTP ${page.status}`, "The document itself is an error response.", "Fix routing/permissions before auditing anything else."));
  }
  const m = page.metrics;
  if (m.lcpMs && m.lcpMs > 2500) {
    out.push(mk$1(page, "performance", m.lcpMs > 4e3 ? "critical" : "major", `LCP ${(m.lcpMs / 1e3).toFixed(1)}s`, 'Largest Contentful Paint above the 2.5s "good" threshold.', "Preload the hero asset, serve modern formats, and cut render-blocking JS."));
  }
  if (m.cls !== null && m.cls > 0.1) {
    out.push(mk$1(page, "performance", m.cls > 0.25 ? "critical" : "major", `CLS ${m.cls.toFixed(3)}`, "Layout shifts above 0.1 — content moves under the user.", "Reserve space for images/embeds and avoid late-injected banners."));
  }
  if (m.transferBytes > 35e5) {
    out.push(mk$1(page, "performance", "major", `${(m.transferBytes / 1e6).toFixed(1)} MB transferred`, `${m.requestCount} requests.`, "Compress and lazy-load below-the-fold media; audit the JS bundle."));
  }
  if (m.longTaskMs > 800) {
    out.push(mk$1(page, "performance", "minor", `${m.longTaskMs}ms of long tasks`, "The main thread is blocked, so early clicks feel dead.", "Split bundles, defer non-critical work, hydrate progressively."));
  }
  if (!signals.metaDescription) {
    out.push(mk$1(page, "content", "nit", "No meta description", "Search and link previews get scraped junk.", "Write a 150-character description per page."));
  }
  if (signals.title && signals.title.length > 65) {
    out.push(mk$1(page, "content", "nit", "Page title over 65 characters", signals.title, "Trim to fit the SERP truncation limit."));
  }
  const heroSection = page.sections.find((s) => s.role === "hero");
  if (heroSection && heroSection.ctaLabels.length === 0) {
    out.push(mk$1(page, "flow", "major", "Hero has no call to action", "The first screen offers nothing to click.", "One primary action, one secondary. Above the fold.", { sectionId: heroSection.id }));
  }
  if (heroSection && (heroSection.headings[0]?.length ?? 0) > 90) {
    out.push(mk$1(page, "content", "minor", "Hero headline is a paragraph", heroSection.headings[0], 'Under 60 characters. If it needs a comma and an "and", it is two ideas.', { sectionId: heroSection.id }));
  }
  return out;
}
function dedupeFindings(findings) {
  const groups = /* @__PURE__ */ new Map();
  for (const f of findings) {
    const key = [f.category, f.severity, f.title, f.sectionId ?? "", f.viewport ?? "", f.selector ?? ""].join("|");
    const list = groups.get(key);
    if (list) list.push(f);
    else groups.set(key, [f]);
  }
  const out = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (group.length === 1) {
      out.push(first);
      continue;
    }
    const urls = [...new Set(group.map((f) => f.pageUrl))];
    out.push({
      ...first,
      detail: urls.length > 1 ? `${first.detail}

Affects ${urls.length} pages: ${urls.map((u) => {
        try {
          return new URL(u).pathname || "/";
        } catch {
          return u;
        }
      }).join(", ")}` : first.detail
    });
  }
  return out;
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
const CATEGORY_BUDGET = {
  coherence: 55,
  variety: 30,
  accessibility: 70,
  responsive: 45,
  flow: 60,
  performance: 45,
  content: 25,
  craft: 30
};
function scoreRun(findings, pageCount, brutality) {
  const multiplier = brutality === "ruthless" ? 1.35 : brutality === "harsh" ? 1 : 0.75;
  const categories = {};
  const cats = ["coherence", "variety", "accessibility", "responsive", "flow", "performance", "content", "craft"];
  for (const c of cats) {
    const list = findings.filter((f) => f.category === c);
    const penalty = list.reduce((s, f) => s + SEVERITY_WEIGHT[f.severity], 0) * multiplier;
    const budget = CATEGORY_BUDGET[c] * Math.max(1, pageCount * 0.7);
    const score2 = Math.max(0, Math.round(100 - penalty / budget * 100));
    categories[c] = { score: score2, findings: list.length };
  }
  const weights = {
    coherence: 0.2,
    accessibility: 0.2,
    flow: 0.16,
    responsive: 0.14,
    variety: 0.1,
    performance: 0.1,
    craft: 0.06,
    content: 0.04
  };
  let overall = 0;
  for (const c of cats) overall += categories[c].score * weights[c];
  overall = Math.round(overall);
  const blockers = findings.filter((f) => f.severity === "blocker").length;
  if (blockers) overall = Math.min(overall, 45);
  const grade = overall >= 90 ? "A" : overall >= 80 ? "B" : overall >= 70 ? "C" : overall >= 60 ? "D" : overall >= 45 ? "E" : "F";
  const worst = [...cats].sort((a, b) => categories[a].score - categories[b].score).slice(0, 2);
  const verdict = overall >= 88 ? `Genuinely tight. Weakest link is ${worst[0]} (${categories[worst[0]].score}); everything else holds up under scrutiny.` : overall >= 72 ? `Competent but not finished. ${worst[0]} and ${worst[1]} are dragging it down — ${findings.filter((f) => f.severity === "critical" || f.severity === "blocker").length} critical issue(s) still open.` : overall >= 55 ? `This ships as "fine" and reads as unfinished. ${worst[0]} (${categories[worst[0]].score}) and ${worst[1]} (${categories[worst[1]].score}) need a dedicated pass, not touch-ups.` : `Not defensible in front of users. ${findings.filter((f) => f.severity === "blocker" || f.severity === "critical").length} blocking/critical issues, with ${worst[0]} at ${categories[worst[0]].score}. Rebuild the offending sections on system primitives rather than patching.`;
  return { overall, grade, verdict, categories };
}
function themeSummary(pages) {
  const colors = /* @__PURE__ */ new Map();
  const fonts = /* @__PURE__ */ new Map();
  const radii = /* @__PURE__ */ new Map();
  for (const p of pages) {
    for (const c of p.tokens.colors) colors.set(c.value, (colors.get(c.value) ?? 0) + c.usage);
    for (const f of p.tokens.fontFamilies) fonts.set(f.value, (fonts.get(f.value) ?? 0) + f.usage);
    for (const r of p.tokens.radii) radii.set(r.value, (radii.get(r.value) ?? 0) + r.usage);
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  return [
    `Fonts: ${top(fonts, 3).join(", ") || "n/a"}`,
    `Dominant colours: ${top(colors, 6).join(", ") || "n/a"}`,
    `Radii: ${top(radii, 4).join(", ") || "none"}`
  ].join(" · ");
}
async function imageToBase64(path) {
  try {
    const buf = await readFile(path);
    if (buf.byteLength > 6e6) return null;
    const mime = path.endsWith(".webp") ? "image/webp" : path.endsWith(".jpg") || path.endsWith(".jpeg") ? "image/jpeg" : "image/png";
    return { data: buf.toString("base64"), mime };
  } catch {
    return null;
  }
}
function extractJson(text) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const m = /\{[\s\S]*\}/.exec(trimmed);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
      }
    }
    return null;
  }
}
async function withBackoff(label, fn, attempts = 4) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const msg = e.message ?? "";
      const retryable = /429|RESOURCE_EXHAUSTED|rate.?limit|503|UNAVAILABLE|500|INTERNAL|overloaded|fetch failed|ECONN|ETIMEDOUT|timeout/i.test(msg);
      if (!retryable || i === attempts - 1) break;
      const hinted = /retry(?:Delay|-after)"?[:\s]+"?(\d+)/i.exec(msg)?.[1];
      const waitMs = hinted ? Number(hinted) * 1e3 : 1500 * 2 ** i + Math.random() * 700;
      await new Promise((r) => setTimeout(r, Math.min(waitMs, 45e3)));
    }
  }
  throw new Error(`${label}: ${lastError?.message ?? "unknown error"}`);
}
const GEMINI_FALLBACK_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-pro-preview",
  "gemini-3-pro-preview",
  "gemini-flash-latest",
  "gemini-pro-latest",
  "gemini-2.5-flash",
  "gemini-2.5-pro"
];
function rankGeminiModels(names) {
  const version = (n) => {
    const m = /gemini-(\d+)(?:\.(\d+))?/.exec(n);
    return m ? Number(m[1]) * 100 + Number(m[2] ?? 0) : 0;
  };
  const tierScore = (n) => /pro/.test(n) ? 3 : /flash-lite/.test(n) ? 1 : /flash/.test(n) ? 2 : 0;
  return names.filter((n) => !/(image|tts|embedding|computer-use|customtools|learnlm|aqa|gemma)/i.test(n)).sort((a, b) => {
    const stable = (n) => /preview|exp/.test(n) ? 0 : 1;
    return version(b) - version(a) || stable(b) - stable(a) || tierScore(b) - tierScore(a) || a.length - b.length;
  });
}
class GeminiProvider {
  constructor(creds) {
    this.creds = creds;
  }
  id = "gemini";
  supportsVision = true;
  client = null;
  key = "";
  sdk() {
    const key = this.creds.geminiApiKey ?? "";
    if (!key) throw new Error("No Gemini API key set (Settings → Models, or GEMINI_API_KEY).");
    if (!this.client || this.key !== key) {
      this.client = new GoogleGenAI({ apiKey: key });
      this.key = key;
    }
    return this.client;
  }
  async listModels() {
    const key = this.creds.geminiApiKey;
    if (!key) return GEMINI_FALLBACK_MODELS;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=200`);
      if (!res.ok) return GEMINI_FALLBACK_MODELS;
      const json = await res.json();
      const names = (json.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name.replace(/^models\//, ""));
      return names.length ? rankGeminiModels(names) : GEMINI_FALLBACK_MODELS;
    } catch {
      return GEMINI_FALLBACK_MODELS;
    }
  }
  async generate(model, req) {
    const parts = [{ text: req.prompt }];
    for (const img of req.images ?? []) {
      const enc = await imageToBase64(img.path);
      if (!enc) continue;
      if (img.caption) parts.push({ text: img.caption });
      parts.push({ inlineData: { mimeType: enc.mime, data: enc.data } });
    }
    const res = await withBackoff(
      "gemini",
      () => this.sdk().models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: req.system,
          temperature: req.temperature ?? 0.4,
          ...req.schema ? { responseMimeType: "application/json", responseSchema: req.schema } : {}
        }
      })
    );
    return res.text ?? "";
  }
  async status(model) {
    if (!this.creds.geminiApiKey) return { id: "gemini", ok: false, detail: "No API key set.", model };
    try {
      const out = await this.generate(model, { system: "Reply with one word.", prompt: "Say: ready" });
      return { id: "gemini", ok: true, detail: `${model}: ${out.trim().slice(0, 30)}`, model };
    } catch (e) {
      return { id: "gemini", ok: false, detail: e.message.slice(0, 200), model };
    }
  }
}
const OPENAI_FALLBACK_MODELS = ["gpt-5.2", "gpt-5.1", "gpt-5", "gpt-5-mini", "gpt-4.1", "o4-mini"];
function rankOpenAiModels(names) {
  return names.filter((n) => /^(gpt-|o\d|chatgpt-)/.test(n)).filter((n) => !/(audio|realtime|tts|whisper|embedding|moderation|image|transcribe|search|dall)/i.test(n)).sort((a, b) => {
    const v = (n) => {
      const m = /(\d+)(?:\.(\d+))?/.exec(n.replace(/^o/, "99."));
      return m ? Number(m[1]) * 100 + Number(m[2] ?? 0) : 0;
    };
    const mini = (n) => /mini|nano/.test(n) ? 0 : 1;
    return v(b) - v(a) || mini(b) - mini(a) || a.length - b.length;
  });
}
class OpenAiProvider {
  constructor(creds) {
    this.creds = creds;
  }
  id = "openai";
  supportsVision = true;
  base() {
    return (this.creds.openaiBaseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  }
  headers() {
    const key = this.creds.openaiApiKey ?? "";
    if (!key) throw new Error("No OpenAI API key set (Settings → Models, or OPENAI_API_KEY).");
    return { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
  }
  async listModels() {
    if (!this.creds.openaiApiKey) return OPENAI_FALLBACK_MODELS;
    try {
      const res = await fetch(`${this.base()}/models`, { headers: this.headers() });
      if (!res.ok) return OPENAI_FALLBACK_MODELS;
      const json = await res.json();
      const ranked = rankOpenAiModels((json.data ?? []).map((m) => m.id));
      return ranked.length ? ranked : OPENAI_FALLBACK_MODELS;
    } catch {
      return OPENAI_FALLBACK_MODELS;
    }
  }
  async generate(model, req) {
    const content = [{ type: "input_text", text: req.prompt }];
    for (const img of req.images ?? []) {
      const enc = await imageToBase64(img.path);
      if (!enc) continue;
      if (img.caption) content.push({ type: "input_text", text: img.caption });
      content.push({ type: "input_image", image_url: `data:${enc.mime};base64,${enc.data}` });
    }
    const body = {
      model,
      instructions: req.system,
      input: [{ role: "user", content }],
      ...req.maxOutputTokens ? { max_output_tokens: req.maxOutputTokens } : {}
    };
    if (req.schema) {
      body.text = {
        format: { type: "json_schema", name: "qualition_findings", schema: req.schema, strict: false }
      };
    }
    const text = await withBackoff("openai", async () => {
      const res = await fetch(`${this.base()}/responses`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body)
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(`${res.status} ${raw.slice(0, 300)}`);
      const json = JSON.parse(raw);
      if (typeof json.output_text === "string" && json.output_text) return json.output_text;
      const chunks = [];
      for (const item of json.output ?? []) {
        for (const c of item.content ?? []) if (typeof c.text === "string") chunks.push(c.text);
      }
      return chunks.join("\n");
    });
    return text;
  }
  async status(model) {
    if (!this.creds.openaiApiKey) return { id: "openai", ok: false, detail: "No API key set.", model };
    try {
      const out = await this.generate(model, { system: "Reply with one word.", prompt: "Say: ready" });
      return { id: "openai", ok: true, detail: `${model}: ${out.trim().slice(0, 30)}`, model };
    } catch (e) {
      return { id: "openai", ok: false, detail: e.message.slice(0, 200), model };
    }
  }
}
const CURSOR_FALLBACK_MODELS = ["auto", "gpt-5.2", "composer-2.5", "claude-opus-5-high", "cursor-grok-4.5-high"];
function cursorBinary(creds) {
  return creds.cursorBinary || join(homedir(), ".local/bin/cursor-agent");
}
function runCursor(bin, args, input, env, timeoutMs = 18e4) {
  return new Promise((resolve2, reject) => {
    const child = execFile(
      bin,
      args,
      { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, env },
      (err, stdout, stderr) => {
        if (err && !stdout) return reject(new Error(`${err.message} ${String(stderr).slice(0, 300)}`));
        resolve2(stdout);
      }
    );
    child.stdin?.end(input);
  });
}
class CursorProvider {
  constructor(creds) {
    this.creds = creds;
  }
  id = "cursor";
  /** The CLI has no image channel — callers must send evidence as text. */
  supportsVision = false;
  env() {
    return this.creds.cursorApiKey ? { ...process.env, CURSOR_API_KEY: this.creds.cursorApiKey } : { ...process.env };
  }
  async listModels() {
    try {
      const out = await runCursor(cursorBinary(this.creds), ["--list-models"], "", this.env(), 3e4);
      const models = out.split("\n").map((l) => l.trim()).filter((l) => /^[a-z0-9][\w.\-]*\s+-\s+/i.test(l)).map((l) => l.split(/\s+-\s+/)[0]);
      return models.length ? models : CURSOR_FALLBACK_MODELS;
    } catch {
      return CURSOR_FALLBACK_MODELS;
    }
  }
  async generate(model, req) {
    const schemaNote = req.schema ? `

Respond with ONLY a JSON object matching this schema. No prose, no markdown fence:
${JSON.stringify(req.schema)}` : "";
    const prompt = `${req.system}

---

${req.prompt}${schemaNote}`;
    const args = [
      "-p",
      "--trust",
      "--output-format",
      "json",
      "--mode",
      "ask",
      ...model && model !== "auto" ? ["--model", model] : []
    ];
    const raw = await withBackoff("cursor", () => runCursor(cursorBinary(this.creds), args, prompt, this.env()));
    for (const line of raw.split("\n").reverse()) {
      const t = line.trim();
      if (!t.startsWith("{")) continue;
      try {
        const j = JSON.parse(t);
        if (typeof j.result === "string") return j.result;
      } catch {
      }
    }
    return raw;
  }
  async status(model) {
    try {
      const out = await this.generate(model, { system: "Reply with one word.", prompt: "Say: ready" });
      const ok = out.trim().length > 0;
      return {
        id: "cursor",
        ok,
        detail: ok ? `${model || "auto"}: ${out.trim().slice(0, 30)} (text-only, no vision)` : "No output from cursor-agent.",
        model
      };
    } catch (e) {
      return {
        id: "cursor",
        ok: false,
        detail: `${e.message.slice(0, 160)} — install the Cursor CLI and run 'cursor-agent login'.`,
        model
      };
    }
  }
}
function createProvider(id, creds) {
  switch (id) {
    case "openai":
      return new OpenAiProvider(creds);
    case "cursor":
      return new CursorProvider(creds);
    default:
      return new GeminiProvider(creds);
  }
}
function credsFromSettings(s) {
  return {
    geminiApiKey: s.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    openaiApiKey: s.openaiApiKey || process.env.OPENAI_API_KEY,
    openaiBaseUrl: s.openaiBaseUrl || process.env.OPENAI_BASE_URL,
    cursorBinary: s.cursorBinary,
    cursorApiKey: s.cursorApiKey || process.env.CURSOR_API_KEY
  };
}
const PERSONA = `You are Qualition's principal design critic. You have shipped and killed a lot of interfaces.
You are blunt, specific and evidence-driven. You never praise generically, never hedge, and never invent details you cannot see in the evidence.
You care, in order: (1) does the interface communicate hierarchy in one glance, (2) is the visual system coherent — one type scale, one spacing rhythm, one radius language, one colour semantic, (3) is there enough *variety* that the page has rhythm rather than being an endless stack of identical slabs, (4) does the flow remove friction — including the states most teams forget: hover, focus, disabled, loading, empty, error, (5) craft details: alignment, optical spacing, contrast, focus states.
When reference imagery from Mobbin is supplied, compare against it concretely: what the reference does structurally that this does not.`;
const findingSchema = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["coherence", "variety", "accessibility", "responsive", "flow", "performance", "content", "craft"]
          },
          severity: { type: "string", enum: ["blocker", "critical", "major", "minor", "nit"] },
          title: { type: "string" },
          detail: { type: "string" },
          fix: { type: "string" },
          sectionId: { type: "string" }
        },
        required: ["category", "severity", "title", "detail", "fix"]
      }
    },
    themeRead: { type: "string" },
    verdict: { type: "string" }
  },
  required: ["findings"]
};
function brutalityLine(b) {
  return b === "ruthless" ? 'Grade as if this were a portfolio review at a top product studio: nothing is "good enough". Flag everything a senior designer would redline, including optical details.' : b === "harsh" ? "Grade as a demanding design lead in a shipping review: call out anything that would block a release or embarrass the team." : "Grade as a helpful peer reviewer: focus on issues that materially affect users.";
}
let counter = 0;
function clampSeverity(s) {
  const value = s ?? "minor";
  return value === "blocker" ? "critical" : value;
}
function toFindings(raw, pageUrl) {
  const list = raw?.findings ?? [];
  return list.slice(0, 40).map((f) => ({
    id: `g${++counter}`,
    category: f.category ?? "craft",
    severity: clampSeverity(f.severity),
    title: String(f.title ?? "").slice(0, 160),
    detail: String(f.detail ?? "").slice(0, 1200),
    fix: String(f.fix ?? "").slice(0, 800),
    pageUrl,
    sectionId: f.sectionId || void 0,
    source: "ai"
  }));
}
function makeCritic(config, creds) {
  return createProvider(config.provider, creds);
}
function evidenceText(page, interaction) {
  const t = page.tokens;
  const c = page.cssStats;
  const lines = [
    `URL: ${page.url}`,
    `TITLE: ${page.title}`,
    `SECTIONS (id · role · label · height):`,
    ...page.sections.map((s) => `  ${s.id} · ${s.role} · ${s.label} · ${s.rect.height}px · ${s.stats.interactiveCount} interactive · ${s.stats.distinctFontSizes} type sizes · headings: ${s.headings.slice(0, 3).join(" | ")} · CTAs: ${s.ctaLabels.slice(0, 4).join(" | ")}`),
    `RENDERED TOKENS: ${new Set(t.colors.map((x) => x.value)).size} colours, fonts ${t.fontFamilies.map((f) => f.value).join("/")}, sizes ${t.fontSizes.map((s) => s.value).join(",")}px, radii ${t.radii.map((r) => r.value).join("|")}, ${t.shadows.length} shadows`,
    c ? `AUTHORED CSS: ${(c.bytes / 1024).toFixed(0)}kB, ${c.rules} rules, colour uniqueness ${(c.colorUniquenessRatio * 100).toFixed(0)}%, ${c.fontSizesUnique} font sizes, ${c.radiiUnique} radii, ${c.shadowsUnique} shadows, !important ${(c.importantRatio * 100).toFixed(1)}%, max specificity (${c.maxSpecificity}), z-index max ${c.zIndexMax}, maintainability ${c.quality.maintainability}` : "AUTHORED CSS: unavailable",
    `METRICS: LCP ${page.metrics.lcpMs ?? "n/a"}ms, CLS ${page.metrics.cls ?? "n/a"}, ${(page.metrics.transferBytes / 1e6).toFixed(1)}MB, ${page.metrics.requestCount} requests`,
    `AXE: ${page.axe.length} violations — ${page.axe.slice(0, 6).map((v) => v.help).join("; ")}`,
    `CONSOLE ERRORS: ${page.consoleErrors.length}`
  ];
  if (interaction) {
    lines.push(
      `INTERACTION PROBE (${interaction.controlsProbed} controls actually exercised):`,
      `  dead clicks: ${interaction.deadClicks.length ? interaction.deadClicks.slice(0, 6).join(", ") : "none"}`,
      `  no focus indicator: ${interaction.noFocusIndicator.length ? interaction.noFocusIndicator.slice(0, 6).join(", ") : "none"}`,
      `  no hover feedback: ${interaction.noHoverFeedback.length ? interaction.noHoverFeedback.slice(0, 6).join(", ") : "none"}`,
      `  unnamed controls: ${interaction.unnamedControls.length ? interaction.unnamedControls.slice(0, 6).join(", ") : "none"}`,
      `  fake buttons: ${interaction.fakeButtons.length}`,
      `  overlays: ${interaction.overlays.map((o) => `${o.trigger}(esc=${o.escapeCloses}, focus=${o.focusMoved})`).join(", ") || "none opened"}`,
      `  forms: ${interaction.forms.map((f) => `${f.submitLabel || `#${f.index}`}: ${f.required} required, validation feedback=${f.validationFeedback}`).join("; ") || "none"}`,
      `  keyboard: ${interaction.keyboard.tabStops} tab stops, positive tabindex ${interaction.keyboard.positiveTabIndex}`
    );
  }
  return lines.join("\n");
}
async function generateFindings(provider, model, system, prompt, images, pageUrl) {
  const text = await provider.generate(model, {
    system,
    prompt,
    images: provider.supportsVision ? images : void 0,
    schema: findingSchema,
    temperature: 0.4
  });
  const raw = extractJson(text) ?? { findings: [] };
  return { findings: toFindings(raw, pageUrl), themeRead: raw.themeRead, verdict: raw.verdict };
}
async function critiquePage(provider, model, page, config, interaction) {
  const images = Object.entries(page.screenshots).map(([vp, path]) => ({
    path,
    caption: `Viewport: ${vp}`
  }));
  const prompt = `${brutalityLine(config.brutality)}
PRODUCT CONTEXT: ${config.productContext || "unspecified"}
${provider.supportsVision ? `Full-page screenshots follow, one per viewport (${Object.keys(page.screenshots).join(", ")}).` : "No imagery is available to you — reason strictly from the measured evidence below and say so rather than guessing at visuals."}

MEASURED EVIDENCE (already verified by static analysis and by actually operating the UI — do not repeat it, build on it):
${evidenceText(page, interaction)}

Return findings a static analyser could NOT produce: visual hierarchy failures, theme incoherence, monotony/rhythm problems, mismatched component vocabulary, missing interaction states, copy that undercuts the design, sections that look unfinished or templated. Attribute each finding to a sectionId when possible. Then give themeRead (one paragraph describing the actual design language: palette temperature, type personality, density, era) and verdict (3 sentences, brutal, specific).`;
  return generateFindings(provider, model, PERSONA, prompt, images, page.url);
}
async function critiqueSectionAgainstReferences(provider, model, page, section, refs, config) {
  if (!section.screenshot && provider.supportsVision) return [];
  const images = [];
  if (section.screenshot) images.push({ path: section.screenshot, caption: "Section under review" });
  for (const r of refs.slice(0, 3)) {
    if (r.imageUrl && !r.imageUrl.startsWith("http"))
      images.push({ path: r.imageUrl, caption: `Mobbin reference — ${r.appName ?? r.title} (${r.mobbinUrl ?? ""})` });
  }
  const prompt = `SECTION UNDER REVIEW — id ${section.id}, detected role "${section.role}", label "${section.label}", page ${page.url}.
${brutalityLine(config.brutality)}
${provider.supportsVision ? `Its own screenshot comes first, then ${images.length - 1} reference screenshot(s) from Mobbin of the same section type in shipped products.` : `Reference products for this section type: ${refs.map((r) => r.appName ?? r.title).join(", ") || "none available"}.`}

Section facts: ${section.stats.interactiveCount} interactive elements, ${section.stats.imageCount} media, ${section.stats.distinctFontSizes} type sizes, ${section.stats.distinctBgColors} surfaces, longest text measure ${section.stats.maxTextWidthPx}px.
Headings: ${section.headings.join(" | ") || "none"}
CTAs: ${section.ctaLabels.join(" | ") || "none"}

Compare structurally, not stylistically-by-imitation. What does the reference class do that this section fails to do (information order, proof placement, density, focal contrast, use of imagery, CTA framing)? Where is the theme incoherent with the rest of the product? What component vocabulary is hand-rolled that should be a system primitive?
Every finding must set sectionId to "${section.id}".`;
  const res = await generateFindings(provider, model, PERSONA, prompt, images, page.url);
  return res.findings.map((f) => ({ ...f, sectionId: f.sectionId ?? section.id }));
}
async function proposeFlows(provider, model, pages, inventory) {
  const schema = {
    type: "object",
    properties: {
      flows: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            steps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  action: { type: "string", enum: ["goto", "click", "fill", "press", "wait", "assertText", "scroll"] },
                  target: { type: "string" },
                  value: { type: "string" },
                  note: { type: "string" }
                },
                required: ["action"]
              }
            }
          },
          required: ["name", "steps"]
        }
      }
    },
    required: ["flows"]
  };
  const text = await provider.generate(model, {
    system: "You design end-to-end UI test flows for a site that has already been crawled. You may only use routes and controls that were actually observed. Inventing plausible-sounding routes or field labels produces false failures and is worse than proposing nothing. Output JSON only.",
    prompt: `Below is the VERBATIM inventory of what the crawler actually found: every route it captured, and the exact clickable labels and form fields present on each. This is the complete set of things that exist.

HARD RULES — a flow that breaks any of these will be discarded:
- goto targets MUST be one of the ROUTE paths listed below. Do not invent /login, /contact, /pricing or any other route that is not listed.
- click targets MUST use a label copied EXACTLY from that route's "clickable" list, as "text=<label>".
- fill targets MUST use a handle copied EXACTLY from that route's "fields" list ("placeholder=…", "label=…" or a [name=…] selector).
- assertText values MUST be text that appears in the inventory.
- if a route has no fields, do not propose a form flow for it.
- never pay, purchase, delete, or create a real account; use qualition+test@example.com for any email field.
- 4–12 steps per flow, ending with an assertText that proves the journey worked.

WHAT MAKES A GOOD FLOW HERE: click *through* the product. A flow that only opens URLs proves
almost nothing — prefer journeys that click a control, verify the resulting screen, then act again
from there (open a menu → pick an item → assert the destination; filter a table → assert the rows
changed; open a dialog → interact → close it). Chain 3+ clicks where the inventory supports it, and
put an assertText after each click so a dead control is caught at the exact step it fails.

Propose up to 8 flows, covering different routes rather than variations of one. If the inventory
does not support a meaningful flow, return fewer — an empty list is a valid answer.

INVENTORY:
${inventory}`,
    schema,
    temperature: 0.3
  });
  return extractJson(text)?.flows ?? [];
}
async function finalVerdict(provider, model, findings, theme, pageUrls) {
  const bySeverity = ["blocker", "critical", "major", "minor", "nit"].map((s) => `${s}: ${findings.filter((f) => f.severity === s).length}`).join(", ");
  const top = findings.filter((f) => f.severity === "blocker" || f.severity === "critical" || f.severity === "major").slice(0, 30).map((f) => `- [${f.category}/${f.severity}] ${f.title}`).join("\n");
  return (await provider.generate(model, {
    system: PERSONA,
    prompt: `Pages audited: ${pageUrls.join(", ")}
Detected design language: ${theme}
Finding counts: ${bySeverity}
Top issues:
${top}

Write the executive verdict: 5–8 sentences. Name the single systemic root cause behind most findings, state what to fix first in order, and say plainly whether this is shippable. No pleasantries, no summary of the list.`,
    temperature: 0.5
  })).trim();
}
class Deadline {
  end;
  constructor(budgetMs) {
    this.end = Date.now() + budgetMs;
  }
  get expired() {
    return Date.now() >= this.end;
  }
  get remaining() {
    return Math.max(0, this.end - Date.now());
  }
  /** Time allowed for one step: never more than what is left in the budget. */
  slice(ms) {
    return Math.max(250, Math.min(ms, this.remaining));
  }
}
async function limit(p, ms, label) {
  let timer;
  try {
    return await Promise.race([
      p,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
        timer.unref?.();
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function soft(p, ms, label, fallback) {
  try {
    return await limit(p, ms, label);
  } catch {
    return fallback;
  }
}
const DESTRUCTIVE = /\b(delete|remove|destroy|cancel subscription|unsubscribe|pay|purchase|buy|checkout|order|confirm|submit order|log ?out|sign ?out|deactivate|close account|archive|reset|revoke|transfer|withdraw|send money)\b/i;
const NAVIGATIONAL = /^(a)$/i;
let seq = 0;
function mk(url, severity, title, detail, fix, extra = {}) {
  return {
    id: `i${++seq}`,
    category: "flow",
    severity,
    title,
    detail,
    fix,
    pageUrl: url,
    source: "heuristic",
    ...extra
  };
}
const collectControls = function() {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const selector = "button, a[href], input, select, textarea, summary, [role=button], [role=link], [role=tab], [role=menuitem], [role=switch], [role=checkbox], [onclick], [data-testid*=button i]";
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.05;
  };
  const accName = (el) => {
    const aria = el.getAttribute("aria-label");
    if (aria) return aria.trim();
    const labelledby = el.getAttribute("aria-labelledby");
    if (labelledby) {
      const t = labelledby.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
      if (t) return t;
    }
    if (el instanceof HTMLInputElement) {
      const lbl = el.labels?.[0]?.textContent?.trim();
      if (lbl) return lbl;
      if (el.placeholder) return el.placeholder;
      if (el.value && el.type === "submit") return el.value;
    }
    const title = el.getAttribute("title");
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    return text || title || "";
  };
  let idx = 0;
  const nestedInTaken = (el) => {
    let cur = el.parentElement;
    while (cur) {
      if (takenSet.has(cur)) return true;
      cur = cur.parentElement;
    }
    return false;
  };
  const takenSet = /* @__PURE__ */ new Set();
  for (const el of Array.from(document.querySelectorAll(selector))) {
    if (seen.has(el) || !visible(el)) continue;
    if (nestedInTaken(el)) continue;
    seen.add(el);
    takenSet.add(el);
    if (idx >= 60) break;
    el.setAttribute("data-q-idx", String(idx));
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role");
    const isNativeInteractive = ["button", "a", "input", "select", "textarea", "summary"].includes(tag);
    out.push({
      idx,
      tag,
      role,
      name: accName(el).slice(0, 60),
      href: el.getAttribute("href"),
      type: el.getAttribute("type"),
      disabled: el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true",
      nativeDisabled: el.hasAttribute("disabled"),
      ariaDisabled: el.getAttribute("aria-disabled") === "true",
      tabIndex: el.tabIndex,
      explicitTabIndex: el.getAttribute("tabindex"),
      hasAriaExpanded: el.hasAttribute("aria-expanded"),
      isNativeInteractive,
      cursor: cs.cursor,
      pointerEvents: cs.pointerEvents,
      rect: { x: Math.round(r.x), y: Math.round(r.y + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      inForm: !!el.closest("form"),
      resting: {
        outline: cs.outlineStyle === "none" ? "" : `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
        boxShadow: cs.boxShadow,
        background: cs.backgroundColor,
        color: cs.color,
        border: cs.borderColor + cs.borderWidth,
        transform: cs.transform,
        textDecoration: cs.textDecorationLine,
        opacity: cs.opacity
      }
    });
    idx++;
  }
  const forms = Array.from(document.querySelectorAll("form")).slice(0, 4).map((f, i) => {
    f.setAttribute("data-q-form", String(i));
    const fields = Array.from(f.querySelectorAll("input,select,textarea"));
    return {
      idx: i,
      required: fields.filter((x) => x.required || x.getAttribute("aria-required") === "true").length,
      fields: fields.length,
      hasNovalidate: f.hasAttribute("novalidate"),
      submitLabel: (f.querySelector("[type=submit],button:not([type=button])")?.textContent ?? "").trim().slice(0, 40)
    };
  });
  return {
    controls: out,
    forms,
    positiveTabIndex: document.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])').length,
    autofocusCount: document.querySelectorAll("[autofocus]").length
  };
};
const styleOf = function() {
  const el = document.querySelector('[data-q-probe="1"]');
  if (!el) return null;
  const cs = getComputedStyle(el);
  return {
    outline: cs.outlineStyle === "none" ? "" : `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
    boxShadow: cs.boxShadow,
    background: cs.backgroundColor,
    color: cs.color,
    border: cs.borderColor + cs.borderWidth,
    transform: cs.transform,
    textDecoration: cs.textDecorationLine,
    opacity: cs.opacity
  };
};
const pageSignature = function() {
  const attrs = (sel, attr) => Array.from(document.querySelectorAll(sel)).map((e) => e.getAttribute(attr)).join("");
  return {
    url: location.href,
    domSize: document.body.innerHTML.length,
    nodeCount: document.querySelectorAll("*").length,
    dialogs: document.querySelectorAll("dialog[open],[role=dialog],[role=alertdialog],[aria-modal=true]").length,
    expanded: attrs("[aria-expanded]", "aria-expanded"),
    selected: attrs("[aria-selected]", "aria-selected"),
    pressed: attrs("[aria-pressed]", "aria-pressed"),
    checkedAria: attrs("[aria-checked]", "aria-checked"),
    dataState: attrs("[data-state]", "data-state"),
    // Theme switches usually only mutate the root class or a data attribute.
    rootClass: document.documentElement.className,
    rootTheme: document.documentElement.getAttribute("data-theme") ?? "",
    colorScheme: document.documentElement.style.colorScheme ?? "",
    bodyClass: document.body.className,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    // Form state: checkboxes, radios, selects, and text length (not content).
    controlState: Array.from(document.querySelectorAll("input,select,textarea")).slice(0, 120).map((el) => {
      const i = el;
      return `${i.checked ? 1 : 0}${(i.value ?? "").length}${i.getAttribute("aria-invalid") ?? ""}`;
    }).join("|"),
    focused: document.activeElement?.tagName + (document.activeElement?.getAttribute("data-q-idx") ?? ""),
    scrollY: Math.round(window.scrollY)
  };
};
function styleChanged(a, b) {
  if (!a || !b) return false;
  return Object.keys(a).some((k) => String(a[k]) !== String(b[k]));
}
async function probeInteractions(browser, url, opts) {
  const ctx = await browser.newContext({
    viewport: { width: opts.viewport.width, height: opts.viewport.height },
    isMobile: opts.viewport.isMobile,
    hasTouch: opts.viewport.isMobile,
    bypassCSP: true,
    ...opts.storageState ? { storageState: opts.storageState } : {}
  });
  const page = await ctx.newPage();
  const deadline = new Deadline(opts.budgetMs ?? 12e4);
  page.setDefaultTimeout(3e3);
  page.setDefaultNavigationTimeout(2e4);
  page.on("dialog", (d) => {
    d.dismiss().catch(() => {
    });
  });
  let renavigations = 0;
  const restore = async () => {
    if (renavigations >= 4 || deadline.expired) return;
    renavigations++;
    await soft(
      page.goto(url, { waitUntil: "domcontentloaded", timeout: deadline.slice(15e3) }).then(() => void 0),
      deadline.slice(16e3),
      "restore navigation",
      void 0
    );
    await page.waitForTimeout(500);
    await soft(page.evaluate(collectControls), deadline.slice(5e3), "re-collect", null);
  };
  const findings = [];
  const report = {
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
  };
  try {
    await limit(
      page.goto(url, { waitUntil: "domcontentloaded", timeout: deadline.slice(3e4) }),
      deadline.slice(32e3),
      "probe initial navigation"
    );
    await page.waitForTimeout(1200);
    const inventory = await soft(page.evaluate(collectControls), deadline.slice(2e4), "collectControls", {
      controls: [],
      forms: [],
      positiveTabIndex: 0,
      failed: true
    });
    const controls = (inventory.controls ?? []).slice(0, opts.maxControls);
    if (controls.length === 0) {
      opts.onLog?.(
        inventory.failed ? `interaction probe could not read controls on ${url} (page too slow or blocked)` : `no interactive controls found on ${url}`
      );
    }
    report.controlsProbed = controls.length;
    report.keyboard.positiveTabIndex = inventory.positiveTabIndex;
    if (inventory.positiveTabIndex > 0) {
      findings.push(
        mk(
          url,
          "major",
          `${inventory.positiveTabIndex} elements use a positive tabindex`,
          "Positive tabindex values jump the keyboard order out of document order; anyone tabbing through gets thrown around the page.",
          'Use tabindex="0" (or nothing) and fix the DOM order instead.',
          { viewport: opts.viewport.name, category: "accessibility" }
        )
      );
    }
    for (const c of controls) {
      if (deadline.expired) {
        opts.onLog?.(`probe budget reached during state probing (${report.controlsProbed} controls inventoried)`);
        break;
      }
      const sel = `[data-q-idx="${c.idx}"]`;
      const locator = page.locator(sel).first();
      const label = c.name || `${c.tag}${c.role ? `[${c.role}]` : ""} @${c.rect.x},${c.rect.y}`;
      if (!c.name && !c.disabled) {
        report.unnamedControls.push(label);
      }
      if (!c.isNativeInteractive && !c.role && c.tabIndex < 0) {
        report.fakeButtons.push(label);
      }
      if (c.ariaDisabled && !c.nativeDisabled && c.pointerEvents !== "none") {
        report.brokenDisabled.push(label);
      }
      if (c.disabled) continue;
      try {
        await soft(
          page.evaluate((s) => {
            document.querySelectorAll("[data-q-probe]").forEach((e) => e.removeAttribute("data-q-probe"));
            document.querySelector(s)?.setAttribute("data-q-probe", "1");
          }, sel),
          deadline.slice(2500),
          "mark probe",
          void 0
        );
        await limit(locator.hover({ timeout: deadline.slice(2e3) }), deadline.slice(2500), "hover");
        await page.waitForTimeout(120);
        const hovered = await soft(page.evaluate(styleOf), deadline.slice(2e3), "hover style", null);
        if (hovered && !styleChanged(c.resting, hovered) && c.cursor === "pointer") {
          report.noHoverFeedback.push(label);
        }
        await soft(
          page.evaluate((s) => document.querySelector(s)?.focus?.(), sel),
          deadline.slice(2e3),
          "focus",
          void 0
        );
        await page.waitForTimeout(100);
        const focused = await soft(page.evaluate(styleOf), deadline.slice(2e3), "focus style", null);
        const isFocused = await soft(
          page.evaluate((s) => document.activeElement === document.querySelector(s), sel),
          deadline.slice(2e3),
          "focus check",
          false
        );
        if (isFocused && focused && !styleChanged(c.resting, focused)) {
          report.noFocusIndicator.push(label);
        }
      } catch {
      }
    }
    const clickable = controls.filter(
      (c) => !c.disabled && !DESTRUCTIVE.test(c.name) && !(NAVIGATIONAL.test(c.tag) && c.href && !c.href.startsWith("#")) && c.type !== "submit" && !(c.tag === "input" && ["text", "email", "password", "search", "number", "tel"].includes(c.type ?? ""))
    );
    for (const c of clickable.slice(0, Math.min(20, opts.maxControls))) {
      if (deadline.expired) {
        opts.onLog?.("probe budget reached during click probing");
        break;
      }
      const sel = `[data-q-idx="${c.idx}"]`;
      const label = c.name || `${c.tag} @${c.rect.x},${c.rect.y}`;
      try {
        const before = await soft(page.evaluate(pageSignature), deadline.slice(2e3), "signature", null);
        if (!before) continue;
        await limit(
          page.locator(sel).first().click({ timeout: deadline.slice(2500), noWaitAfter: true }),
          deadline.slice(3e3),
          "click"
        );
        await page.waitForTimeout(500);
        const after = await soft(page.evaluate(pageSignature), deadline.slice(2e3), "signature", before);
        const changed = before.url !== after.url || Math.abs(before.domSize - after.domSize) > 40 || before.nodeCount !== after.nodeCount || before.dialogs !== after.dialogs || before.expanded !== after.expanded || before.selected !== after.selected || before.pressed !== after.pressed || before.checkedAria !== after.checkedAria || before.dataState !== after.dataState || before.rootClass !== after.rootClass || before.rootTheme !== after.rootTheme || before.colorScheme !== after.colorScheme || before.bodyClass !== after.bodyClass || before.bodyBg !== after.bodyBg || before.controlState !== after.controlState || Math.abs(before.scrollY - after.scrollY) > 20;
        if (!changed) {
          report.deadClicks.push(label);
        }
        if (after.dialogs > before.dialogs) {
          const trapped = await soft(
            page.evaluate(() => {
              const dlg = document.querySelector("dialog[open],[role=dialog],[aria-modal=true]");
              return !!dlg && !!dlg.contains(document.activeElement);
            }),
            deadline.slice(2e3),
            "focus trap check",
            false
          );
          await soft(page.keyboard.press("Escape"), deadline.slice(1500), "escape", void 0);
          await page.waitForTimeout(350);
          const afterEsc = await soft(page.evaluate(pageSignature), deadline.slice(2e3), "signature", after);
          const closed = afterEsc.dialogs < after.dialogs;
          report.overlays.push({ trigger: label, focusMoved: trapped, escapeCloses: closed });
          report.keyboard.escapeClosesOverlay = closed;
          report.keyboard.focusTrapOk = trapped;
          if (!closed) await restore();
        }
        if (before.url !== after.url) await restore();
      } catch {
      }
    }
    for (const f of inventory.forms ?? []) {
      if (deadline.expired) break;
      if (f.required === 0 && f.fields === 0) continue;
      if (DESTRUCTIVE.test(f.submitLabel)) continue;
      try {
        const before = await soft(page.evaluate(pageSignature), deadline.slice(2e3), "signature", null);
        if (!before) break;
        const shot = join(opts.outDir, `form-${f.idx}-${opts.viewport.name}.png`);
        await soft(
          page.evaluate((i) => {
            const form = document.querySelector(`[data-q-form="${i}"]`);
            const btn = form?.querySelector("[type=submit],button:not([type=button])");
            btn?.click();
          }, f.idx),
          deadline.slice(3e3),
          "form submit",
          void 0
        );
        await page.waitForTimeout(700);
        const feedback = await soft(page.evaluate(() => {
          const invalid = document.querySelectorAll(':invalid, [aria-invalid="true"]').length;
          const errorText = Array.from(document.querySelectorAll("[role=alert],[class*=error i],[class*=invalid i]")).filter((e) => (e.textContent ?? "").trim().length > 0).length;
          const nativeTooltip = Array.from(document.querySelectorAll("input,select,textarea")).some(
            (el) => !el.validity?.valid
          );
          return { invalid, errorText, nativeTooltip };
        }), deadline.slice(3e3), "validation check", { invalid: 0, errorText: 0, nativeTooltip: false });
        const after = await soft(page.evaluate(pageSignature), deadline.slice(2e3), "signature", before);
        const gaveFeedback = feedback.errorText > 0 || feedback.nativeTooltip || feedback.invalid > 0 || after.url !== before.url;
        report.forms.push({
          index: f.idx,
          fields: f.fields,
          required: f.required,
          submitLabel: f.submitLabel,
          validationFeedback: gaveFeedback,
          screenshot: shot
        });
        if (!gaveFeedback && f.required > 0) {
          findings.push(
            mk(
              url,
              "major",
              `Form "${f.submitLabel || `#${f.idx}`}" submits empty with no visible feedback`,
              `${f.required} required field(s) and no error state, no aria-invalid, no native validation. The user presses the button and nothing tells them why nothing happened.`,
              "Show inline, field-level errors on submit, set aria-invalid, and move focus to the first invalid field.",
              { viewport: opts.viewport.name }
            )
          );
        }
        if (f.hasNovalidate && f.required > 0 && !gaveFeedback) {
          findings.push(
            mk(
              url,
              "minor",
              `Form "${f.submitLabel || `#${f.idx}`}" disables native validation without replacing it`,
              "novalidate is set but no custom validation surfaced.",
              "If you take over validation, you own the error UI too.",
              { viewport: opts.viewport.name }
            )
          );
        }
        if (after.url !== before.url) await restore();
      } catch {
      }
    }
    try {
      if (deadline.remaining < 6e3) throw new Error("no budget left for keyboard sweep");
      renavigations = 0;
      await restore();
      await soft(page.evaluate(() => document.body.focus()), 2e3, "body focus", void 0);
      const stops = [];
      for (let i = 0; i < 25; i++) {
        if (deadline.expired) break;
        await soft(page.keyboard.press("Tab"), deadline.slice(1500), "tab", void 0);
        const el = await soft(page.evaluate(() => {
          const a = document.activeElement;
          if (!a || a === document.body) return null;
          const r = a.getBoundingClientRect();
          const cs = getComputedStyle(a);
          return {
            tag: a.tagName.toLowerCase(),
            name: (a.getAttribute("aria-label") || a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
            offscreen: r.width === 0 || r.height === 0,
            hidden: cs.visibility === "hidden" || cs.display === "none",
            y: Math.round(r.top + window.scrollY)
          };
        }), deadline.slice(2e3), "tab stop", null);
        if (!el) break;
        stops.push(`${el.tag}:${el.name}`);
        if (el.hidden) {
          findings.push(
            mk(
              url,
              "major",
              "Keyboard focus lands on a hidden element",
              `Tab stop ${i + 1} (${el.tag} "${el.name}") is not visible but still focusable — the focus ring disappears into nothing.`,
              'Remove hidden controls from the tab order with inert, display:none, or tabindex="-1".',
              { viewport: opts.viewport.name, category: "accessibility" }
            )
          );
          break;
        }
      }
      report.keyboard.tabStops = stops.length;
      if (stops.length === 0) {
        findings.push(
          mk(
            url,
            "critical",
            "Nothing is reachable by keyboard",
            "Pressing Tab from the top of the document never lands on a focusable control.",
            'This page is unusable without a mouse — check for tabindex="-1" on wrappers or a focus-stealing overlay.',
            { viewport: opts.viewport.name, category: "accessibility" }
          )
        );
      }
    } catch {
    }
  } catch (e) {
    opts.onLog?.(`interaction probe stopped early on ${url}: ${e.message}`);
  } finally {
    await ctx.close().catch(() => {
    });
  }
  findings.push(...summarise(report, url, opts.viewport.name));
  return { report, findings };
}
function summarise(r, url, viewport) {
  const out = [];
  const list = (xs, n = 4) => xs.slice(0, n).map((x) => `"${x}"`).join(", ");
  if (r.deadClicks.length) {
    out.push(
      mk(
        url,
        r.deadClicks.length > 3 ? "critical" : "major",
        `${r.deadClicks.length} control(s) do nothing when clicked`,
        `Activated with no URL change, no DOM change, no dialog, no aria-expanded change, no scroll: ${list(r.deadClicks)}. Either they are broken, or their effect is invisible — both read as broken to a user.`,
        "Wire the handler, or give the click visible consequence (state change, toast, navigation, loading state).",
        { viewport }
      )
    );
  }
  if (r.noFocusIndicator.length) {
    out.push(
      mk(
        url,
        r.noFocusIndicator.length > 5 ? "critical" : "major",
        `${r.noFocusIndicator.length} control(s) have no visible focus state`,
        `Focused programmatically with zero computed-style change: ${list(r.noFocusIndicator)}. Keyboard users cannot tell where they are (WCAG 2.4.7).`,
        "Add a :focus-visible ring using the token ring colour — never outline:none without a replacement.",
        { viewport, category: "accessibility" }
      )
    );
  }
  if (r.noHoverFeedback.length) {
    out.push(
      mk(
        url,
        "minor",
        `${r.noHoverFeedback.length} control(s) show cursor:pointer but no hover feedback`,
        `${list(r.noHoverFeedback)} — the cursor promises interactivity the UI never acknowledges.`,
        "Add a hover state (background, border, or elevation) on every pointer-cursor element.",
        { viewport }
      )
    );
  }
  if (r.fakeButtons.length) {
    out.push(
      mk(
        url,
        "major",
        `${r.fakeButtons.length} fake button(s): clickable elements with no role and no tab stop`,
        `${list(r.fakeButtons)} respond to a mouse but do not exist for assistive tech or the keyboard.`,
        'Use <button>. If you must keep the div, add role="button", tabindex="0" and Enter/Space handlers.',
        { viewport, category: "accessibility" }
      )
    );
  }
  if (r.unnamedControls.length) {
    out.push(
      mk(
        url,
        "critical",
        `${r.unnamedControls.length} control(s) have no accessible name`,
        `Icon-only or empty controls: ${list(r.unnamedControls)}. A screen reader announces "button" and nothing else.`,
        "Add aria-label or visually hidden text describing the action, not the icon.",
        { viewport, category: "accessibility" }
      )
    );
  }
  if (r.brokenDisabled.length) {
    out.push(
      mk(
        url,
        "minor",
        `${r.brokenDisabled.length} control(s) claim aria-disabled but still accept clicks`,
        `${list(r.brokenDisabled)} — the UI says "unavailable" while the handler still fires.`,
        "Either truly disable it, or drop aria-disabled and explain why the action is unavailable.",
        { viewport, category: "accessibility" }
      )
    );
  }
  for (const o of r.overlays) {
    if (!o.escapeCloses) {
      out.push(
        mk(
          url,
          "major",
          `Overlay opened by "${o.trigger}" does not close on Escape`,
          "Every dismissible overlay must respond to Escape; users try it before hunting for the X.",
          "Bind Escape to close, and restore focus to the trigger afterwards.",
          { viewport, category: "accessibility" }
        )
      );
    }
    if (!o.focusMoved) {
      out.push(
        mk(
          url,
          "major",
          `Overlay opened by "${o.trigger}" never moves focus into itself`,
          "Focus stays behind the overlay, so keyboard users tab through the page underneath.",
          "Move focus to the dialog on open, trap it while open, and return it on close.",
          { viewport, category: "accessibility" }
        )
      );
    }
  }
  return out;
}
const UNSAFE = /\b(delete|remove|destroy|cancel|unsubscribe|pay|purchase|buy|checkout|order|log ?out|sign ?out|deactivate|close account|upgrade now|billing)\b/i;
function pathOf(url) {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return "/";
  }
}
function assertionFor(page) {
  const heading = page.sections.flatMap((s) => s.headings).find((h) => h.length > 3 && h.length < 60);
  if (heading) return heading;
  const title = page.title?.split(/[|\-–]/)[0]?.trim();
  return title && title.length > 3 && title.length < 60 ? title : null;
}
function norm(s) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
function handlesOf(c) {
  return [c.text, c.placeholder, c.label, c.ariaLabel, c.name, c.testId].filter(Boolean).map(norm);
}
function isField(c) {
  return ["input", "textarea", "select"].includes(c.tag) && !["submit", "button", "reset"].includes(c.type);
}
function fieldHandlesOf(c) {
  if (!isField(c)) return [];
  return [c.placeholder, c.label, c.ariaLabel, c.name, c.testId].filter(Boolean).map(norm);
}
function pathsOf(pages) {
  const set = /* @__PURE__ */ new Set();
  for (const p of pages) {
    try {
      const u = new URL(p.url);
      set.add(u.pathname.replace(/\/$/, "") || "/");
    } catch {
    }
  }
  return set;
}
function validateFlow(flow, pages) {
  const paths = pathsOf(pages);
  const allHandles = new Set(pages.flatMap((p) => (p.controls ?? []).flatMap(handlesOf)));
  const fieldHandles = new Set(pages.flatMap((p) => (p.controls ?? []).flatMap(fieldHandlesOf)));
  const allText = pages.map(
    (p) => norm(
      [
        p.title,
        ...p.sections.flatMap((s) => [s.textPreview, s.label, ...s.headings, ...s.ctaLabels])
      ].join(" ")
    )
  );
  const problems = [];
  for (const step of flow.steps) {
    if (step.action === "goto") {
      const target = step.target ?? "/";
      let path = target;
      try {
        path = target.startsWith("http") ? new URL(target).pathname : new URL(target, "https://x.invalid").pathname;
      } catch {
      }
      path = path.replace(/\/$/, "") || "/";
      if (!paths.has(path)) problems.push(`route ${path} was never found by the crawl`);
      continue;
    }
    if (step.action === "click" || step.action === "fill") {
      const target = step.target ?? "";
      const value = target.replace(/^(text|label|placeholder|role)=/, "");
      const roleName = target.startsWith("role=") ? value.split(":")[1] ?? "" : "";
      const needle = norm(roleName || value);
      if (!needle) {
        problems.push(`${step.action} step has no target`);
        continue;
      }
      const isSemantic = /^(text|label|placeholder|role)=/.test(target);
      if (!isSemantic) continue;
      const corpus = step.action === "fill" ? fieldHandles : allHandles;
      const exists = [...corpus].some((h) => h === needle || h.includes(needle) || needle.includes(h));
      if (!exists) {
        problems.push(
          step.action === "fill" ? `no input/textarea/select matching "${target}" exists on any crawled page` : `no control matching "${target}" exists on any crawled page`
        );
      }
      continue;
    }
    if (step.action === "assertText") {
      const needle = norm(step.value ?? step.target ?? "");
      if (!needle) {
        problems.push("assertText step has no text to assert");
        continue;
      }
      const seen = allText.some((t) => t.includes(needle)) || [...allHandles].some((h) => h.includes(needle));
      if (!seen) problems.push(`text "${needle}" was never seen on any crawled page`);
    }
  }
  return problems.length > 0 ? { ...flow, invalid: problems.slice(0, 3).join("; ") } : { ...flow };
}
function validateFlows(flows, pages) {
  return flows.map((f) => validateFlow(f, pages));
}
function flowInventory(pages) {
  const lines = [];
  for (const p of pages) {
    let path = p.url;
    try {
      path = new URL(p.url).pathname || "/";
    } catch {
    }
    const controls = (p.controls ?? []).slice(0, 40);
    const clickable = controls.filter((c) => c.tag === "button" || c.tag === "a" || c.role === "button" || c.type === "submit").map((c) => c.text || c.ariaLabel || c.testId).filter(Boolean).slice(0, 18);
    const fields = controls.filter((c) => ["input", "textarea", "select"].includes(c.tag) && c.type !== "submit").map((c) => {
      if (c.placeholder) return `placeholder=${c.placeholder}`;
      if (c.label) return `label=${c.label}`;
      if (c.ariaLabel) return `label=${c.ariaLabel}`;
      return c.name ? `[name="${c.name}"]` : null;
    }).filter(Boolean).slice(0, 12);
    lines.push(
      `ROUTE ${path}
  clickable: ${clickable.join(" | ") || "(none)"}
  fields: ${fields.join(" | ") || "(none)"}`
    );
  }
  return lines.join("\n");
}
function heuristicFlows(pages, maxFlows = 0) {
  const flows = [];
  const ok = pages.filter((p) => p.ok && p.status < 400);
  if (ok.length === 0) return flows;
  const limit2 = maxFlows > 0 ? maxFlows : Math.max(4, Math.min(20, ok.length + 3));
  const sweep = [];
  for (const page of ok.slice(0, 6)) {
    sweep.push({ action: "goto", target: pathOf(page.url), note: page.title });
    const assertion = assertionFor(page);
    if (assertion) sweep.push({ action: "assertText", value: assertion });
  }
  if (sweep.length >= 2) flows.push({ name: "Route sweep", steps: sweep });
  const entry = ok[0];
  const ctaPriority = { hero: 0, cta: 1, form: 2, nav: 3 };
  const heroCta = entry.sections.filter((s) => s.role in ctaPriority).sort((a, b) => ctaPriority[a.role] - ctaPriority[b.role]).flatMap((s) => s.ctaLabels).find((label) => label.length > 2 && label.length < 30 && !UNSAFE.test(label));
  if (heroCta) {
    const steps = [
      { action: "goto", target: pathOf(entry.url) },
      { action: "click", target: `text=${heroCta}`, note: "primary call to action" },
      { action: "wait", value: "1200" }
    ];
    const target = ok.find((p) => p.url !== entry.url);
    const assertion = target ? assertionFor(target) : assertionFor(entry);
    if (assertion) steps.push({ action: "assertText", value: assertion });
    flows.push({ name: `Primary CTA — "${heroCta}"`, steps });
  }
  const navLabels = ok[0].sections.filter((s) => s.role === "nav").flatMap((s) => s.ctaLabels).filter((l) => l.length > 2 && l.length < 24 && !UNSAFE.test(l)).slice(0, 3);
  if (navLabels.length >= 2) {
    const steps = [{ action: "goto", target: pathOf(entry.url) }];
    for (const label of navLabels) {
      steps.push({ action: "click", target: `text=${label}` });
      steps.push({ action: "wait", value: "900" });
      steps.push({ action: "goto", target: pathOf(entry.url) });
    }
    flows.push({ name: "Header navigation", steps: steps.slice(0, 10) });
  }
  for (const p of ok.slice(0, 12)) {
    const path = pathOf(p.url);
    const controls = (p.controls ?? []).filter((c) => {
      const label = (c.text || c.ariaLabel || "").trim();
      return label.length > 1 && label.length < 32 && !UNSAFE.test(label) && (c.tag === "button" || c.role === "button" || c.tag === "a" && !!c.href);
    });
    const seen = /* @__PURE__ */ new Set();
    const targets = [];
    for (const c of controls) {
      const label = (c.text || c.ariaLabel).trim();
      const key = norm(label);
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push(label);
      if (targets.length >= 5) break;
    }
    if (targets.length < 2) continue;
    const assertion = assertionFor(p);
    const steps = [{ action: "goto", target: path }];
    for (const label of targets) {
      steps.push({ action: "click", target: `text=${label}`, note: `click “${label}”` });
      steps.push({ action: "wait", value: "800" });
      if (assertion) steps.push({ action: "assertText", value: assertion });
      steps.push({ action: "goto", target: path });
    }
    flows.push({ name: `Click through ${path}`, steps });
  }
  const longest = [...ok].sort(
    (a, b) => (b.sections.at(-1)?.rect.y ?? 0) - (a.sections.at(-1)?.rect.y ?? 0)
  )[0];
  const footerText = longest?.sections.find((s) => s.role === "footer")?.ctaLabels[0];
  if (footerText && !UNSAFE.test(footerText)) {
    flows.push({
      name: "Scroll to footer",
      steps: [
        { action: "goto", target: pathOf(longest.url) },
        { action: "scroll" },
        { action: "scroll" },
        { action: "scroll" },
        { action: "assertText", value: footerText }
      ]
    });
  }
  return flows.slice(0, limit2);
}
function usernameCandidates() {
  return [
    'input[type="email"]',
    'input[name="email" i]',
    'input[id="email" i]',
    'input[autocomplete="username"]',
    'input[name="username" i]',
    'input[id="username" i]',
    'input[name*="user" i]',
    'input[placeholder*="email" i]',
    'input[placeholder*="username" i]',
    'input[type="text"]'
  ];
}
function passwordCandidates() {
  return [
    'input[type="password"]',
    'input[name="password" i]',
    'input[id="password" i]',
    'input[autocomplete="current-password"]',
    'input[placeholder*="password" i]'
  ];
}
function submitCandidates() {
  return [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Sign in")',
    'button:has-text("Log in")',
    'button:has-text("Login")',
    'button:has-text("Continue")',
    'button:has-text("Submit")',
    '[role="button"]:has-text("Sign in")',
    "form button"
  ];
}
function loginUrlGuesses(base) {
  const paths = ["", "/login", "/signin", "/sign-in", "/auth/login", "/users/sign_in"];
  const out = [];
  for (const p of paths) {
    try {
      const u = p === "" ? new URL(base) : new URL(p, base);
      const s = u.toString();
      if (!out.includes(s)) out.push(s);
    } catch {
    }
  }
  return out;
}
function redactAuth(config) {
  if (!config.auth) return config;
  return {
    ...config,
    auth: {
      ...config.auth,
      password: config.auth.password ? "••••••••" : "",
      username: config.auth.username
    }
  };
}
async function performLogin(browser, targetUrl, auth, outDir, onLog, budgetMs = 75e3) {
  const deadline = new Deadline(budgetMs);
  const statePath = join(outDir, "auth-state.json");
  const shotPath = join(outDir, "auth-result.png");
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(6e3);
  page.setDefaultNavigationTimeout(2e4);
  page.on("dialog", (d) => {
    d.dismiss().catch(() => {
    });
  });
  const urls = auth.loginUrl ? [normalizeTargetUrl(auth.loginUrl) ?? auth.loginUrl] : loginUrlGuesses(normalizeTargetUrl(targetUrl) ?? targetUrl);
  try {
    for (const url of urls) {
      if (deadline.expired) {
        onLog?.("login budget exhausted while looking for a form");
        break;
      }
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: deadline.slice(15e3) });
        await page.waitForTimeout(900);
      } catch {
        continue;
      }
      const pwSel = auth.passwordSelector ?? await firstVisible(page, passwordCandidates(), deadline);
      if (!pwSel) {
        onLog?.(`no password field at ${url}`);
        continue;
      }
      const userSel = auth.usernameSelector ?? await firstVisible(page, usernameCandidates(), deadline);
      if (!userSel) {
        onLog?.(`password field but no username field at ${url}`);
        continue;
      }
      onLog?.(`login form found at ${url}`);
      await soft(page.locator(userSel).first().fill(auth.username), deadline.slice(6e3), "fill user", void 0);
      await soft(page.locator(pwSel).first().fill(auth.password), deadline.slice(6e3), "fill password", void 0);
      const submitSel = auth.submitSelector ?? await firstVisible(page, submitCandidates(), deadline);
      const before = page.url();
      if (submitSel) {
        await soft(page.locator(submitSel).first().click({ timeout: deadline.slice(6e3) }), deadline.slice(7e3), "submit", void 0);
      } else {
        await soft(page.locator(pwSel).first().press("Enter"), deadline.slice(5e3), "submit via Enter", void 0);
      }
      await Promise.race([
        page.waitForURL((u) => u.toString() !== before, { timeout: deadline.slice(12e3) }).catch(() => {
        }),
        page.waitForTimeout(deadline.slice(6e3))
      ]);
      await page.waitForTimeout(900);
      const stillHasPassword = await soft(
        page.locator('input[type="password"]').first().isVisible(),
        deadline.slice(4e3),
        "password check",
        false
      );
      const errorText = await soft(
        page.locator('[role=alert], [class*="error" i], [class*="invalid" i]').first().textContent(),
        deadline.slice(4e3),
        "error text",
        null
      );
      await soft(page.screenshot({ path: shotPath }).then(() => void 0), 8e3, "auth screenshot", void 0);
      if (!stillHasPassword) {
        const state = await ctx.storageState({ path: statePath });
        const cookies = state.cookies?.length ?? 0;
        const stored = (state.origins ?? []).reduce((n, o) => n + (o.localStorage?.length ?? 0), 0);
        await ctx.close();
        return {
          ok: true,
          detail: `Signed in as ${auth.username} via ${url} — session captured (${cookies} cookie(s), ${stored} localStorage entr${stored === 1 ? "y" : "ies"})`,
          storageStatePath: statePath,
          landedUrl: page.url(),
          screenshot: shotPath
        };
      }
      return {
        ok: false,
        detail: `Login rejected at ${url}${errorText ? `: ${errorText.trim().slice(0, 160)}` : " — password field still present, no navigation"}`,
        screenshot: shotPath
      };
    }
    await ctx.close();
    return {
      ok: false,
      detail: `No login form found. Tried: ${urls.join(", ")}. Set an explicit login URL or CSS selectors.`
    };
  } catch (e) {
    await ctx.close().catch(() => {
    });
    return { ok: false, detail: `Login failed: ${e.message.slice(0, 200)}` };
  }
}
async function firstVisible(page, selectors, deadline) {
  for (const sel of selectors) {
    if (deadline.expired) return null;
    const visible = await soft(
      page.locator(sel).first().isVisible({ timeout: deadline.slice(900) }),
      deadline.slice(1200),
      `probe ${sel}`,
      false
    );
    if (visible) return sel;
  }
  return null;
}
const exec = promisify(execFile);
const KEYCHAIN_SERVICE = "pi-mcp-adapter.oauth";
const CONFIG_PATHS = [
  { path: join(homedir(), ".pi/agent/mcp.json"), origin: "pi" },
  { path: join(homedir(), ".cursor/mcp.json"), origin: "cursor" },
  {
    path: join(homedir(), "Library/Application Support/Claude/claude_desktop_config.json"),
    origin: "claude-desktop"
  },
  { path: join(homedir(), ".codeium/windsurf/mcp_config.json"), origin: "windsurf" }
];
const USED_SERVERS = [
  { match: (n, u) => n === "mobbin" || !!u?.includes("api.mobbin.com"), role: "Reference UI" },
  { match: (n, u) => n === "shadcn" || !!u?.includes("ui.shadcn.com"), role: "Component registry" }
];
function serverRole(name, url) {
  return USED_SERVERS.find((s) => s.match(name.toLowerCase(), url))?.role ?? null;
}
async function discoverUsedServers() {
  const all = await discoverMcpServers();
  return all.map((s) => ({ ...s, role: serverRole(s.name, s.url) })).filter((s) => s.role !== null);
}
async function discoverMcpServers() {
  const out = /* @__PURE__ */ new Map();
  for (const { path, origin } of CONFIG_PATHS) {
    let raw;
    try {
      raw = await readFile(path, "utf8");
    } catch {
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const servers = parsed.mcpServers ?? parsed.servers ?? {};
    for (const [name, def] of Object.entries(servers)) {
      const url = def.url ?? def.serverUrl;
      const key = name.toLowerCase();
      const entry = {
        name,
        type: def.type ?? (url ? "http" : "stdio"),
        url,
        headers: def.headers,
        command: def.command,
        args: def.args,
        env: def.env,
        origin
      };
      const existing = out.get(key);
      if (!existing) out.set(key, entry);
      else if (!existing.url && entry.url) out.set(key, entry);
    }
  }
  return [...out.values()];
}
async function keychainAccounts() {
  const { stdout } = await exec("security", ["dump-keychain"], { maxBuffer: 64 * 1024 * 1024 });
  const accounts = [];
  let lastAcct = null;
  for (const line of stdout.split("\n")) {
    const m = /"acct"<blob>="([^"]+)"/.exec(line);
    if (m) lastAcct = m[1];
    if (line.includes(`"svce"<blob>="${KEYCHAIN_SERVICE}"`) && lastAcct) accounts.push(lastAcct);
  }
  return accounts;
}
async function keychainRead(account) {
  const { stdout } = await exec("security", [
    "find-generic-password",
    "-s",
    KEYCHAIN_SERVICE,
    "-a",
    account,
    "-w"
  ]);
  return stdout.trim();
}
async function readOAuthBlobs() {
  if (process.platform !== "darwin") return [];
  let accounts = [];
  try {
    accounts = await keychainAccounts();
  } catch {
    return [];
  }
  const groups = /* @__PURE__ */ new Map();
  for (const acct of accounts) {
    const m = /^(.+)\.chunk\.([0-9a-f]+)\.(\d+)$/.exec(acct);
    if (!m) continue;
    const key = `${m[1]}.chunk.${m[2]}`;
    const arr = groups.get(key) ?? [];
    arr.push(Number(m[3]));
    groups.set(key, arr);
  }
  const blobs = [];
  for (const [prefix, indices] of groups) {
    try {
      const parts = [];
      for (const i of indices.sort((a, b) => a - b)) parts.push(await keychainRead(`${prefix}.${i}`));
      blobs.push(JSON.parse(parts.join("")));
    } catch {
    }
  }
  return blobs;
}
const tokenCache = /* @__PURE__ */ new Map();
async function getBearerFor(serverUrl) {
  const cached = tokenCache.get(serverUrl);
  if (cached && cached.expiresAt - 6e4 > Date.now()) return cached.token;
  const blobs = await readOAuthBlobs();
  const blob = blobs.find((b) => b.serverUrl === serverUrl || b.serverUrl?.startsWith(serverUrl));
  if (!blob?.tokens?.accessToken) return null;
  const expiresAtMs = (blob.tokens.expiresAt ?? 0) * (blob.tokens.expiresAt > 1e12 ? 1 : 1e3);
  if (expiresAtMs - 6e4 > Date.now()) {
    tokenCache.set(serverUrl, { token: blob.tokens.accessToken, expiresAt: expiresAtMs });
    return blob.tokens.accessToken;
  }
  const issuer = blob.tokens.issuer ?? blob.clientInfo?.issuer;
  const refreshToken = blob.tokens.refreshToken;
  const clientId = blob.clientInfo?.clientId;
  if (!issuer || !refreshToken) return blob.tokens.accessToken;
  const res = await fetch(`${issuer.replace(/\/$/, "")}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId })
  });
  if (!res.ok) return blob.tokens.accessToken;
  const json = await res.json();
  const expiresAt = Date.now() + (json.expires_in ?? 3600) * 1e3;
  tokenCache.set(serverUrl, { token: json.access_token, expiresAt });
  return json.access_token;
}
function parseBody(text, contentType) {
  if (contentType.includes("text/event-stream")) {
    const payloads = [];
    for (const chunk of text.split("\n\n")) {
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data:")) {
          const raw = line.slice(5).trim();
          if (!raw || raw === "[DONE]") continue;
          try {
            payloads.push(JSON.parse(raw));
          } catch {
          }
        }
      }
    }
    return payloads.find((p) => p.result || p.error) ?? payloads[payloads.length - 1];
  }
  return text ? JSON.parse(text) : null;
}
class McpHttpClient {
  constructor(url, staticHeaders = {}) {
    this.url = url;
    this.staticHeaders = staticHeaders;
  }
  sessionId = null;
  nextId = 1;
  initialized = false;
  async headers() {
    const h = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
      ...this.staticHeaders
    };
    if (!h.Authorization && !h.authorization) {
      const bearer = await getBearerFor(this.url);
      if (bearer) h.Authorization = `Bearer ${bearer}`;
    }
    if (this.sessionId) h["Mcp-Session-Id"] = this.sessionId;
    return h;
  }
  async send(method, params, isNotification = false) {
    const body = { jsonrpc: "2.0", method };
    if (params !== void 0) body.params = params;
    if (!isNotification) body.id = this.nextId++;
    const res = await fetch(this.url, {
      method: "POST",
      headers: await this.headers(),
      body: JSON.stringify(body)
    });
    const sid = res.headers.get("Mcp-Session-Id") ?? res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    if (res.status === 202) return null;
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`MCP ${method} failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const parsed = parseBody(text, res.headers.get("content-type") ?? "");
    if (parsed?.error) throw new Error(`MCP ${method} error: ${JSON.stringify(parsed.error).slice(0, 300)}`);
    return parsed?.result ?? null;
  }
  async init() {
    if (this.initialized) return;
    await this.send("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "qualition", version: "0.1.0" }
    });
    try {
      await this.send("notifications/initialized", {}, true);
    } catch {
    }
    this.initialized = true;
  }
  async listTools() {
    await this.init();
    const r = await this.send("tools/list", {});
    return r?.tools ?? [];
  }
  async callTool(name, args) {
    await this.init();
    const r = await this.send("tools/call", { name, arguments: args });
    return { content: r?.content ?? [], structuredContent: r?.structuredContent, isError: r?.isError };
  }
}
const CONNECT_TIMEOUT_MS = 12e3;
const CALL_TIMEOUT_MS = 9e4;
async function withTimeout(p, ms, label) {
  let timer;
  try {
    return await Promise.race([
      p,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        timer.unref?.();
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
class McpClient {
  constructor(url, staticHeaders = {}) {
    this.url = url;
    this.staticHeaders = staticHeaders;
  }
  sdk = null;
  legacy = null;
  mode = "none";
  connecting = null;
  /** Which transport actually carried the last successful call. */
  get transport() {
    return this.mode;
  }
  async headers() {
    const h = { ...this.staticHeaders };
    if (!h.Authorization && !h.authorization) {
      const bearer = await getBearerFor(this.url);
      if (bearer) h.Authorization = `Bearer ${bearer}`;
    }
    return h;
  }
  async connect() {
    if (this.mode !== "none") return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const headers = await this.headers();
      let pending = null;
      try {
        const client2 = new Client({ name: "qualition", version: "0.1.0" }, { capabilities: {} });
        pending = client2;
        const transport = new StreamableHTTPClientTransport(new URL(this.url), {
          requestInit: { headers }
        });
        await withTimeout(client2.connect(transport), CONNECT_TIMEOUT_MS, "sdk connect");
        pending = null;
        this.sdk = client2;
        this.mode = "sdk";
        return;
      } catch (sdkError) {
        try {
          await pending?.close();
        } catch {
        }
        try {
          const legacy = new McpHttpClient(this.url, headers);
          await withTimeout(legacy.listTools(), CONNECT_TIMEOUT_MS, "fallback connect");
          this.legacy = legacy;
          this.mode = "legacy";
          return;
        } catch (legacyError) {
          this.mode = "none";
          throw new Error(
            `MCP connect failed. sdk: ${sdkError.message.slice(0, 160)} | fallback: ${legacyError.message.slice(0, 160)}`
          );
        }
      } finally {
        this.connecting = null;
      }
    })();
    return this.connecting;
  }
  async listTools() {
    await this.connect();
    if (this.mode === "sdk") {
      const res = await withTimeout(this.sdk.listTools(), CONNECT_TIMEOUT_MS, "listTools");
      return res.tools ?? [];
    }
    return withTimeout(this.legacy.listTools(), CONNECT_TIMEOUT_MS, "listTools");
  }
  async callTool(name, args) {
    await this.connect();
    if (this.mode === "sdk") {
      const res = await withTimeout(
        this.sdk.callTool({ name, arguments: args }),
        CALL_TIMEOUT_MS,
        `callTool ${name}`
      );
      return { content: res.content ?? [], structuredContent: res.structuredContent, isError: res.isError };
    }
    return withTimeout(this.legacy.callTool(name, args), CALL_TIMEOUT_MS, `callTool ${name}`);
  }
  async close() {
    try {
      await this.sdk?.close();
    } catch {
    }
    this.sdk = null;
    this.legacy = null;
    this.mode = "none";
  }
}
const DEFAULT_URL$1 = "https://api.mobbin.com/mcp";
let client$1 = null;
async function getClient$1() {
  if (client$1) return client$1;
  const servers = await discoverMcpServers();
  const cfg = servers.find((s) => s.url?.includes("api.mobbin.com"));
  client$1 = new McpClient(cfg?.url ?? DEFAULT_URL$1, cfg?.headers ?? {});
  return client$1;
}
async function closeMobbin() {
  await client$1?.close();
  client$1 = null;
}
async function mobbinStatus() {
  try {
    const servers = await discoverMcpServers();
    const cfg = servers.find((s) => s.url?.includes("api.mobbin.com"));
    const url = cfg?.url ?? DEFAULT_URL$1;
    const bearer = await getBearerFor(url);
    if (!bearer && !cfg?.headers?.Authorization) {
      return {
        ok: false,
        detail: 'No Mobbin OAuth token found in Keychain (service "pi-mcp-adapter.oauth"). Authenticate Mobbin in pi or Cursor once, then reload.',
        source: cfg?.origin
      };
    }
    const c = await getClient$1();
    const tools = await c.listTools();
    return {
      ok: true,
      detail: `${tools.length} tools via ${c.transport}: ${tools.map((t) => t.name).join(", ")}`,
      source: cfg?.origin ?? "default"
    };
  } catch (e) {
    return { ok: false, detail: e.message };
  }
}
async function fetchHiRes(mobbinUrl, minBytes) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9e3);
    const page = await fetch(mobbinUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
      }
    });
    clearTimeout(timer);
    if (!page.ok) return null;
    const html = (await page.text()).replace(/&amp;/g, "&");
    const tag = /<img[^>]+src="(https:\/\/bytescale[^"]*\/file\.(webp|jpg|jpeg|png)[^"]*)"[^>]*>/i.exec(html);
    const alsoAlt = tag ? /alt="([^"]+)"/i.exec(tag[0])?.[1] : void 0;
    const src = tag?.[1];
    if (!src) return null;
    const imgRes = await fetch(src);
    if (!imgRes.ok) return null;
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    if (buffer.byteLength <= minBytes) return null;
    const ext = (imgRes.headers.get("content-type") ?? "image/webp").split("/")[1].replace("jpeg", "jpg");
    return { buffer, ext, alt: alsoAlt };
  } catch {
    return null;
  }
}
async function callWithRetry(tool, args, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await (await getClient$1()).callTool(tool, args);
    } catch (e) {
      lastError = e;
      const msg = e.message ?? "";
      if (/401|403|unauthor/i.test(msg)) {
        await client$1?.close();
        client$1 = null;
      } else if (!/429|5\d\d|timeout|fetch failed|ECONN/i.test(msg)) {
        break;
      }
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
  }
  throw lastError;
}
async function callAndPersist(tool, args, kind, outDir, sectionId) {
  const res = await callWithRetry(tool, args);
  const textBlock = res.content.find((c) => c.type === "text")?.text;
  const images = res.content.filter((c) => c.type === "image");
  let parsed = {};
  if (textBlock) {
    try {
      parsed = JSON.parse(textBlock);
    } catch {
    }
  }
  const rows = parsed.screens ?? parsed.flows ?? parsed.sections ?? parsed.results ?? [];
  await mkdir(outDir, { recursive: true });
  const refs = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let imageUrl = row.image_url;
    let description;
    const img = images[i];
    const inline = img?.data ? Buffer.from(String(img.data), "base64") : null;
    const stem = join(outDir, `mobbin-${kind}-${sectionId ?? "general"}-${i}`);
    if (inline) {
      const ext = (img.mimeType ?? "image/webp").split("/")[1] ?? "webp";
      try {
        await writeFile(`${stem}.${ext}`, inline);
        imageUrl = `${stem}.${ext}`;
      } catch {
      }
    }
    if (row.mobbin_url) {
      const hi = await fetchHiRes(row.mobbin_url, inline?.byteLength ?? 0);
      if (hi) {
        try {
          const file = `${stem}-hi.${hi.ext}`;
          await writeFile(file, hi.buffer);
          imageUrl = file;
          description = hi.alt;
        } catch {
        }
      }
    }
    refs.push({
      sectionId,
      query: String(args.query ?? ""),
      kind,
      title: row.title ?? row.name ?? row.app_name ?? `${kind} ${i + 1}`,
      appName: row.app_name,
      description,
      imageUrl,
      mobbinUrl: row.mobbin_url
    });
  }
  return refs;
}
async function searchScreens(query, opts) {
  return callAndPersist(
    "search_screens",
    { query, platform: opts.platform ?? "web", limit: opts.limit ?? 4, mode: "standard" },
    "screen",
    opts.outDir,
    opts.sectionId
  );
}
async function searchSections(query, opts) {
  return callAndPersist(
    "search_sections",
    { query, limit: opts.limit ?? 4 },
    "section",
    opts.outDir,
    opts.sectionId
  );
}
async function searchFlows(query, opts) {
  return callAndPersist(
    "search_flows",
    { query, platform: opts.platform ?? "web", limit: opts.limit ?? 2, mode: "standard" },
    "flow",
    opts.outDir
  );
}
const APP_ROUTES = /\/(dashboard|app|admin|settings|account|profile|inbox|tasks|projects|workspace|console|reports?|analytics|billing|team|members|chat|messages|notifications|library|templates|jobs|runs|agents|queue|logs)\b/i;
const MARKETING_ROUTES = /\/(pricing|features|solutions|customers|testimonials|about|contact|careers|blog|press|partners)\b/i;
const DOCS_ROUTES = /\/(docs|documentation|guide|reference|api|changelog|handbook)\b/i;
const COMMERCE_ROUTES = /\/(products?|shop|store|cart|checkout|collections?|category|catalog)\b/i;
function detectArchetype(pages, signedIn = false) {
  const signals = [];
  let app2 = 0;
  let marketing = 0;
  let docs = 0;
  let commerce = 0;
  let appRouteSeen = false;
  if (signedIn) {
    app2 += 3;
    signals.push("audit ran signed in");
  }
  for (const p of pages) {
    let path = "";
    try {
      path = new URL(p.url).pathname;
    } catch {
    }
    const isDocs = DOCS_ROUTES.test(path);
    const isMarketing = MARKETING_ROUTES.test(path);
    if (APP_ROUTES.test(path) && !isDocs) {
      app2 += 2;
      appRouteSeen = true;
      signals.push(`app route ${path}`);
    }
    if (isMarketing) {
      marketing += 2;
      signals.push(`marketing route ${path}`);
    }
    if (isDocs) {
      docs += 3;
      signals.push(`docs route ${path}`);
    }
    if (COMMERCE_ROUTES.test(path)) {
      commerce += 2;
      signals.push(`commerce route ${path}`);
    }
    const text = p.sections.map((s) => s.textPreview).join(" ").toLowerCase();
    if (/\$\d|\/mo\b|per month|billed annually|most popular|start free trial/.test(text)) {
      marketing += 2;
      signals.push("pricing/marketing copy");
    }
    if (/add to (cart|bag)|checkout|free shipping|in stock/.test(text)) {
      commerce += 2;
      signals.push("commerce copy");
    }
    const controls = p.controls?.length ?? 0;
    const prose = text.length;
    if (controls >= 30 && prose < 4e3 && !isDocs && !isMarketing) {
      app2 += 1;
      signals.push(`${controls} controls with little prose`);
    }
    if (p.sections.some((s) => s.role === "table")) {
      app2 += 2;
      signals.push("data table present");
    }
    if (p.sections.some((s) => s.role === "testimonials" || s.role === "logos")) {
      marketing += 2;
      signals.push("testimonials/logo wall");
    }
    if (p.controls?.some((c) => c.tag === "a") && controls > 20 && p.sections.length <= 3) {
      app2 += 1;
    }
  }
  const scores = [
    ["app", app2],
    ["marketing", marketing],
    ["docs", docs],
    ["commerce", commerce]
  ];
  scores.sort((a, b) => b[1] - a[1]);
  let [winner, top] = scores[0];
  if (winner === "app" && !signedIn && !appRouteSeen) {
    const runnerUp = scores.find(([name]) => name !== "app" && scores[0][1] > 0);
    if (runnerUp && runnerUp[1] > 0) {
      signals.push("app signals lacked corroboration (not signed in, no app route)");
      winner = runnerUp[0];
      top = runnerUp[1];
    }
  }
  const total = app2 + marketing + docs + commerce || 1;
  return {
    archetype: top === 0 ? "marketing" : winner,
    confidence: Math.min(1, top / total),
    signals: [...new Set(signals)].slice(0, 8)
  };
}
function refineRoles(pages, archetype) {
  if (archetype !== "app") return;
  for (const p of pages) {
    for (const s of p.sections) {
      const hasTable = s.components.some((c) => c.tag === "table");
      const listish = s.components.some((c) => c.tag === "li" && c.count >= 3);
      const fieldy = s.components.some((c) => ["input", "select", "textarea"].includes(c.tag));
      if (s.role === "hero" || s.role === "features" || s.role === "cta") {
        s.role = hasTable ? "table" : fieldy ? "form" : listish ? "gallery" : "content";
        s.roleConfidence = Math.min(s.roleConfidence, 0.5);
      }
    }
  }
}
const APP_VOCAB = {
  nav: "app sidebar navigation with sections and workspace switcher",
  table: "data table screen with filters, sortable columns and row actions",
  form: "settings form screen with grouped fields and save action",
  stats: "dashboard overview with metric cards and charts",
  gallery: "list view with cards, status labels and quick actions",
  content: "application main work area with header, toolbar and content list",
  footer: "application footer bar with status and help links"
};
const ROUTE_VOCAB = [
  { match: /chat|message|assistant|conversation|desk/i, phrase: "chat interface with message thread, composer and suggested prompts" },
  { match: /task|todo|queue|job|run|ticket/i, phrase: "task list screen with status labels, filters and row actions" },
  { match: /template|librar|gallery|preset/i, phrase: "template gallery with category filters and preview cards" },
  { match: /setting|preference|account|profile/i, phrase: "settings screen with sidebar sections and grouped form fields" },
  { match: /billing|invoice|payment|subscription/i, phrase: "billing screen with plan summary, usage and invoice table" },
  { match: /team|member|user|people|org/i, phrase: "team members screen with roles table and invite action" },
  { match: /report|analytic|insight|metric|dashboard|overview|home/i, phrase: "analytics dashboard with metric cards, charts and date range" },
  { match: /notification|inbox|activity|feed|alert/i, phrase: "notification inbox with unread items and filters" },
  { match: /integration|connect|api|webhook/i, phrase: "integrations screen with connected app cards and toggles" },
  { match: /log|audit|event|history/i, phrase: "activity log screen with timestamped rows and filters" },
  { match: /project|workspace|board/i, phrase: "project workspace screen with items and status columns" },
  { match: /search|explore|browse|directory/i, phrase: "search results screen with filters and result list" },
  { match: /agent|workflow|automation|pipeline/i, phrase: "workflow automation screen with steps, runs and status" }
];
function routePhrase(url) {
  let path = "";
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return "dashboard home screen with overview widgets, recent activity and sidebar navigation";
  const last = segments[segments.length - 1] ?? "";
  const hay = `${path} ${last}`;
  for (const { match, phrase } of ROUTE_VOCAB) if (match.test(hay)) return phrase;
  return null;
}
function marketingVocab(role, context) {
  const c = context ? ` for ${context}` : "";
  const map = {
    nav: `website top navigation bar with product menu and sign up button${c}`,
    hero: `landing page hero section with headline, subtext and primary call to action${c}`,
    features: `feature grid section with icons, titles and short descriptions${c}`,
    pricing: `pricing section with plan cards, feature list and upgrade buttons${c}`,
    testimonials: `customer testimonial section with quotes, avatars and company names${c}`,
    logos: `logo wall section showing customer company logos${c}`,
    faq: `frequently asked questions section with expandable accordion items${c}`,
    cta: `closing call to action band with headline and signup button${c}`,
    form: `signup form with email and password fields and submit button${c}`,
    table: `data table page with sortable columns, filters and row actions${c}`,
    gallery: `media gallery grid with image cards and captions${c}`,
    stats: `metrics section showing large numbers with labels${c}`,
    footer: `website footer with grouped link columns and social icons${c}`,
    content: `long form content page with headings and body text${c}`
  };
  return map[role];
}
function queryForSection(section, page, archetype, context) {
  if (archetype !== "app") {
    const base2 = marketingVocab(section.role, context);
    const heading2 = section.headings[0];
    return heading2 && heading2.length > 3 && heading2.length < 50 && section.role !== "nav" ? `${base2} titled "${heading2}"` : base2;
  }
  const fromRoute = routePhrase(page.url);
  const heading = section.headings.find((h) => h.length > 2 && h.length < 40);
  const base = fromRoute ?? (heading ? `${heading.toLowerCase()} screen in a web application` : APP_VOCAB[section.role] ?? "application screen with sidebar navigation and main content area");
  const said = new Set(base.toLowerCase().split(/[^a-z]+/).filter(Boolean));
  const evidence = [];
  const add = (phrase, keywords) => {
    if (evidence.length >= 1) return;
    if (keywords.some((k) => said.has(k))) return;
    evidence.push(phrase);
  };
  if (section.components.some((c) => c.tag === "table")) add("a data table", ["table", "rows"]);
  if (section.ctaLabels.length >= 4) add("a toolbar of actions", ["toolbar", "actions"]);
  if (section.components.some((c) => c.tag === "input" || c.tag === "select")) add("filters", ["filters", "fields", "form"]);
  if (section.stats.imageCount >= 4) add("preview thumbnails", ["thumbnails", "preview", "cards", "gallery"]);
  const parts = [base];
  if (evidence.length) parts.push(`and ${evidence[0]}`);
  if (context) parts.push(`in a ${context}`);
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 480);
}
function queryForFlows(archetype, context, pages) {
  const suffix = context ? ` in a ${context}` : "";
  if (archetype !== "app") return `onboarding and signup flow${suffix || " for a web product"}`;
  const routes = pages.map((p) => {
    try {
      return new URL(p.url).pathname;
    } catch {
      return "";
    }
  }).join(" ");
  if (/chat|assistant|desk/i.test(routes)) return `starting a new conversation in a chat assistant app${suffix}`;
  if (/task|job|queue|run/i.test(routes)) return `creating and assigning a task in a productivity app${suffix}`;
  if (/setting|account/i.test(routes)) return `updating account settings in a web application${suffix}`;
  return `completing a core action inside a web application dashboard${suffix}`;
}
const DEFAULT_URL = "https://mcp.shoogle.dev/mcp";
let client = null;
async function getClient() {
  if (client) return client;
  const servers = await discoverMcpServers();
  const cfg = servers.find((s) => s.url?.includes("shoogle.dev"));
  client = new McpClient(cfg?.url ?? DEFAULT_URL, cfg?.headers ?? {});
  return client;
}
async function closeShoogle() {
  await client?.close();
  client = null;
}
async function shoogleStatus() {
  try {
    const c = await getClient();
    const tools = await c.listTools();
    return { ok: tools.length > 0, detail: `${tools.length} tools via ${c.transport}: ${tools.map((t) => t.name).join(", ")}` };
  } catch (e) {
    return { ok: false, detail: e.message.slice(0, 200) };
  }
}
function parseItems(text) {
  try {
    const json = JSON.parse(text);
    const items = json.items ?? json.results ?? [];
    return items.map((i) => ({
      name: String(i.name ?? ""),
      registry: String(i.registry ?? ""),
      type: String(i.type ?? "registry:block"),
      description: String(i.description ?? ""),
      addCommandArgument: String(i.addCommandArgument ?? `${i.registry}/${i.name}`),
      homepage: i.homepage
    }));
  } catch {
    return [];
  }
}
async function searchShoogle(query, limit2 = 8, registries) {
  const c = await getClient();
  const tool = "search_registry_items";
  const args = { query, limit: limit2 };
  const res = await c.callTool(tool, args);
  const text = res.content.find((x) => x.type === "text")?.text;
  return text ? parseItems(text) : [];
}
const ROLE_QUERIES = {
  nav: ["navbar", "header", "menu"],
  hero: ["hero", "banner"],
  features: ["feature", "bento", "grid"],
  pricing: ["pricing", "plan"],
  testimonials: ["testimonial", "review"],
  logos: ["logo cloud", "logos", "marquee"],
  faq: ["faq", "accordion"],
  cta: ["cta", "call to action"],
  form: ["login", "signup", "contact form"],
  table: ["data table", "table"],
  gallery: ["gallery", "carousel"],
  stats: ["stats", "metrics", "chart"],
  footer: ["footer"],
  content: ["section", "card"]
};
async function shoogleForRole(role, perQuery = 4) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const q of ROLE_QUERIES[role] ?? [role]) {
    let items = [];
    try {
      items = await searchShoogle(q, perQuery);
    } catch {
      break;
    }
    for (const it of items) {
      const key = it.addCommandArgument;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(it);
      }
    }
    if (out.length >= perQuery * 2) break;
  }
  return out;
}
function shoogleAddCommand(item) {
  return `npx shadcn@latest add ${item.addCommandArgument}`;
}
async function fetchComponentDetail(input) {
  const base = {
    ok: false,
    name: input.name,
    registry: input.registry,
    dependencies: [],
    registryDependencies: [],
    files: [],
    homepage: input.homepage
  };
  const candidates = [];
  if (input.registry === "@shadcn") {
    candidates.push(`https://ui.shadcn.com/r/styles/new-york/${input.name}.json`);
  }
  if (input.homepage) {
    try {
      const origin = new URL(input.homepage).origin;
      candidates.push(`${origin}/r/${input.name}.json`, `${origin}/registry/${input.name}.json`);
    } catch {
    }
  }
  for (const url of candidates) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      const text = await res.text();
      if (!res.ok || !text.trim().startsWith("{")) {
        base.error = res.status === 401 || res.status === 403 || /Authentication/i.test(text) ? "This registry requires a paid licence to read the source." : res.status === 429 ? "Registry is rate-limiting requests; try again shortly." : `Registry returned ${res.status}.`;
        continue;
      }
      const json = JSON.parse(text);
      return {
        ok: true,
        name: json.name ?? input.name,
        registry: input.registry,
        title: json.title,
        description: json.description,
        dependencies: json.dependencies ?? [],
        registryDependencies: json.registryDependencies ?? [],
        files: (json.files ?? []).map((f) => ({
          path: f.path,
          type: f.type,
          lines: typeof f.content === "string" ? f.content.split("\n").length : void 0,
          preview: typeof f.content === "string" ? f.content.slice(0, 4e3) : void 0
        })),
        sourceUrl: url,
        homepage: input.homepage
      };
    } catch (e) {
      base.error = e.message.slice(0, 140);
    }
  }
  return base;
}
const SHADCN = {
  name: "@shadcn",
  indexUrl: "https://ui.shadcn.com/r/index.json",
  itemUrl: (n) => `https://ui.shadcn.com/r/styles/new-york/${n}.json`
};
const BLOCKS = [
  { name: "login-01", description: "Centered email/password login card", roles: ["form"] },
  { name: "login-02", description: "Two-column login with cover image", roles: ["form"] },
  { name: "login-03", description: "Login card with social providers", roles: ["form"] },
  { name: "login-04", description: "Split login, form right, art left", roles: ["form"] },
  { name: "login-05", description: "Minimal login with logo and muted footer", roles: ["form"] },
  { name: "signup-01", description: "Signup card with name/email/password", roles: ["form"] },
  { name: "dashboard-01", description: "App shell: sidebar, header, KPI cards, chart, data table", roles: ["stats", "table", "content"] },
  { name: "sidebar-07", description: "Collapsible icon sidebar with nav groups", roles: ["nav"] },
  { name: "sidebar-08", description: "Inset sidebar with secondary navigation", roles: ["nav"] },
  { name: "sidebar-13", description: "Sidebar in a dialog for settings", roles: ["nav"] },
  { name: "products-01", description: "Product list with filters, table and detail drawer", roles: ["table", "gallery"] },
  { name: "calendar-11", description: "Range calendar with presets", roles: ["content"] }
];
const ROLE_COMPONENTS = {
  nav: ["navigation-menu", "sheet", "button", "dropdown-menu", "separator"],
  hero: ["button", "badge", "aspect-ratio", "input-group"],
  features: ["card", "item", "badge", "separator", "hover-card"],
  pricing: ["card", "badge", "toggle-group", "button", "tooltip", "separator"],
  testimonials: ["card", "avatar", "carousel", "quote"],
  logos: ["carousel", "aspect-ratio", "separator"],
  faq: ["accordion", "collapsible", "separator"],
  cta: ["button", "card", "input-group", "badge"],
  form: ["form", "field", "input", "label", "select", "checkbox", "button", "input-otp", "sonner"],
  table: ["table", "pagination", "dropdown-menu", "checkbox", "input", "skeleton", "empty"],
  gallery: ["carousel", "aspect-ratio", "card", "dialog", "scroll-area"],
  stats: ["card", "chart", "progress", "badge"],
  footer: ["separator", "navigation-menu", "button", "input-group"],
  content: ["card", "separator", "breadcrumb", "tabs", "scroll-area"]
};
let indexCache = null;
async function loadRegistry(extra = []) {
  if (indexCache && Date.now() - indexCache.at < 30 * 6e4) return indexCache.items;
  const items = [];
  try {
    const res = await fetch(SHADCN.indexUrl);
    const raw = await res.json();
    for (const it of raw) {
      const links = it.meta?.links ?? {};
      const docs = links.base?.docs ?? links.radix?.docs ?? links.aria?.docs;
      items.push({
        name: it.name,
        type: it.type,
        description: it.description ?? humanize(it.name),
        registry: SHADCN.name,
        docs,
        dependencies: it.dependencies,
        registryDependencies: it.registryDependencies,
        keywords: keywordsFor(it.name, it.description)
      });
    }
  } catch {
  }
  for (const b of BLOCKS) {
    items.push({
      name: b.name,
      type: "registry:block",
      description: b.description,
      registry: SHADCN.name,
      docs: `https://ui.shadcn.com/blocks`,
      keywords: keywordsFor(b.name, b.description).concat(b.roles)
    });
  }
  for (const reg of extra) {
    try {
      const res = await fetch(reg.url);
      const raw = await res.json();
      const list = Array.isArray(raw) ? raw : raw.items ?? [];
      for (const it of list) {
        items.push({
          name: it.name,
          type: it.type ?? "registry:ui",
          description: it.description ?? humanize(it.name),
          registry: reg.name.startsWith("@") ? reg.name : `@${reg.name}`,
          keywords: keywordsFor(it.name, it.description)
        });
      }
    } catch {
    }
  }
  indexCache = { at: Date.now(), items };
  return items;
}
function humanize(name) {
  return name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function keywordsFor(name, description) {
  return `${name} ${description ?? ""}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
function searchRegistry(items, query, limit2 = 8) {
  const q = query.toLowerCase().trim();
  const tokens = q.split(/[^a-z0-9]+/).filter(Boolean);
  const scored = items.map((it) => {
    let score2 = 0;
    const name = it.name.toLowerCase();
    if (name === q) score2 += 100;
    if (name.startsWith(q)) score2 += 40;
    if (name.includes(q)) score2 += 20;
    for (const t of tokens) {
      if (name.includes(t)) score2 += 12;
      if (it.keywords.includes(t)) score2 += 8;
      else if (it.keywords.some((k) => k.startsWith(t))) score2 += 4;
    }
    if (it.type === "registry:block") score2 += 2;
    return { it, score: score2 };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit2).map((s) => s.it);
}
function addCommand(item) {
  const ref = item.registry === "@shadcn" ? item.name : `${item.registry}/${item.name}`;
  return `npx shadcn@latest add ${ref}`;
}
async function recommendForSection(section, problems, extra = [], useShoogle = true) {
  const out = [];
  let shoogleCount = 0;
  if (useShoogle) {
    try {
      for (const it of await shoogleForRole(section.role, 4)) {
        out.push({
          name: it.name,
          registry: it.registry,
          type: it.type,
          description: it.description,
          addCommand: shoogleAddCommand(it),
          docs: it.homepage,
          source: "shoogle"
        });
        shoogleCount++;
        if (shoogleCount >= 4) break;
      }
    } catch {
    }
  }
  const fallback = await recommendFromShadcn(section, extra, 6 - out.length);
  out.push(...fallback);
  const reason = problems.length > 0 ? `This ${section.role} section has: ${problems.slice(0, 3).join("; ")}. ${shoogleCount > 0 ? "Community blocks below are drop-in replacements for the whole section; " : ""}registry primitives fix token drift, focus states and a11y semantics in one pass.` : `Standardise this ${section.role} section on registry components so spacing, radius, focus rings and dark-mode tokens stay coherent with the rest of the product.`;
  return {
    sectionId: section.id,
    sectionRole: section.role,
    reason,
    source: shoogleCount > 0 && fallback.length > 0 ? "mixed" : shoogleCount > 0 ? "shoogle" : "shadcn",
    items: out.slice(0, 8)
  };
}
async function recommendFromShadcn(section, extra, limit2) {
  if (limit2 <= 0) return [];
  const items = await loadRegistry(extra);
  const byName = new Map(items.map((i) => [`${i.registry}/${i.name}`, i]));
  const picks = [];
  const push = (it) => {
    if (it && !picks.some((p) => p.name === it.name && p.registry === it.registry)) picks.push(it);
  };
  for (const n of ROLE_COMPONENTS[section.role] ?? []) push(byName.get(`@shadcn/${n}`));
  const textQuery = [section.label, ...section.headings.slice(0, 2), ...section.ctaLabels.slice(0, 2)].join(" ");
  for (const it of searchRegistry(items, textQuery, 4)) push(it);
  for (const b of BLOCKS.filter((b2) => b2.roles.includes(section.role)))
    push(byName.get(`@shadcn/${b.name}`));
  return picks.slice(0, limit2).map((it) => ({
    name: it.name,
    registry: it.registry,
    type: it.type,
    description: it.description ?? "",
    addCommand: addCommand(it),
    docs: it.docs,
    source: "shadcn"
  }));
}
async function registryStatus(extra = []) {
  try {
    const items = await loadRegistry(extra);
    const registries = [...new Set(items.map((i) => i.registry))];
    return { ok: items.length > 0, detail: `${items.length} items indexed`, registries };
  } catch (e) {
    return { ok: false, detail: e.message, registries: [] };
  }
}
async function readPng(path) {
  try {
    return PNG.sync.read(await readFile(path));
  } catch {
    return null;
  }
}
async function diffScreenshots(baselinePath, currentPath, diffPath) {
  const [a, b] = await Promise.all([readPng(baselinePath), readPng(currentPath)]);
  if (!a || !b) return null;
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  if (width < 8 || height < 8) return null;
  const crop = (src) => {
    if (src.width === width && src.height === height) return src;
    const dst = new PNG({ width, height });
    PNG.bitblt(src, dst, 0, 0, width, height, 0, 0);
    return dst;
  };
  const A = crop(a);
  const B = crop(b);
  const diff = new PNG({ width, height });
  const changedPixels = pixelmatch(A.data, B.data, diff.data, width, height, {
    threshold: 0.12,
    includeAA: false,
    alpha: 0.4
  });
  const heightDelta = Math.abs(a.height - b.height) * width;
  const totalArea = width * Math.max(a.height, b.height);
  const changedRatio = (changedPixels + heightDelta) / Math.max(1, totalArea);
  let diffImage;
  if (changedPixels > 0) {
    await writeFile(diffPath, PNG.sync.write(diff));
    diffImage = diffPath;
  }
  return { changedRatio, changedPixels, diffImage };
}
async function compareWithBaseline(pages, baseline, assetsDir2, threshold = 0.02) {
  const diffs = [];
  const findings = [];
  if (!baseline) return { diffs, findings };
  let n = 0;
  for (const page of pages) {
    const before = baseline.pages.find((p) => p.url === page.url);
    if (!before) {
      findings.push({
        id: `vr-new-${++n}`,
        category: "flow",
        severity: "nit",
        title: "New page since last audit",
        detail: `${page.url} did not exist in run ${baseline.id}.`,
        fix: "Nothing to fix — noted so the diff is honest about scope changes.",
        pageUrl: page.url,
        source: "heuristic"
      });
      continue;
    }
    for (const [vp, current] of Object.entries(page.screenshots)) {
      const baseShot = before.screenshots[vp];
      if (!baseShot) continue;
      const diffPath = join(assetsDir2, `diff-${vp}-${n++}.png`);
      const res = await diffScreenshots(baseShot, current, diffPath);
      if (!res) continue;
      const diff = {
        url: page.url,
        viewport: vp,
        changedRatio: res.changedRatio,
        changedPixels: res.changedPixels,
        baselineRunId: baseline.id,
        diffImage: res.diffImage,
        currentImage: current,
        baselineImage: baseShot
      };
      diffs.push(diff);
      if (res.changedRatio > threshold) {
        const pct = (res.changedRatio * 100).toFixed(1);
        findings.push({
          id: `vr-${n}`,
          category: "craft",
          severity: res.changedRatio > 0.25 ? "major" : res.changedRatio > 0.08 ? "minor" : "nit",
          title: `${pct}% of the ${vp} view changed since run ${baseline.id}`,
          detail: `${res.changedPixels.toLocaleString()} pixels differ in the overlapping region. Unintentional drift at this scale usually means a shared component or token changed underneath this page.`,
          fix: "Open the diff image. If the change was not deliberate, you have found a regression; if it was, this is your visual changelog entry.",
          pageUrl: page.url,
          viewport: vp,
          evidence: res.diffImage ? [res.diffImage] : void 0,
          source: "heuristic"
        });
      }
    }
  }
  return { diffs, findings };
}
function redactRun(run) {
  return { ...run, config: redactAuth(run.config) };
}
function runsRoot() {
  return join(app.getPath("userData"), "runs");
}
function runDir(id) {
  return join(runsRoot(), id);
}
async function ensureRunDir(id) {
  const dir = runDir(id);
  await mkdir(join(dir, "assets"), { recursive: true });
  return dir;
}
function assetsDir(id) {
  return join(runDir(id), "assets");
}
async function saveRun(run) {
  await ensureRunDir(run.id);
  await writeFile(join(runDir(run.id), "run.json"), JSON.stringify(redactRun(run), null, 2), "utf8");
}
async function loadRun(id) {
  try {
    return JSON.parse(await readFile(join(runDir(id), "run.json"), "utf8"));
  } catch {
    return null;
  }
}
async function listRuns() {
  try {
    const ids = await readdir(runsRoot());
    const runs = [];
    for (const id of ids) {
      const r = await loadRun(id);
      if (r) runs.push({ ...r, pages: r.pages?.map((p) => ({ ...p })) ?? [] });
    }
    return runs.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}
async function deleteRun(id) {
  await rm(runDir(id), { recursive: true, force: true });
}
const DEFAULT_SETTINGS = {
  provider: "gemini",
  geminiApiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "",
  geminiModel: "gemini-3.6-flash",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "",
  openaiModel: "gpt-5.2",
  cursorBinary: "",
  cursorApiKey: process.env.CURSOR_API_KEY ?? "",
  cursorModel: "auto",
  defaultBrutality: "ruthless",
  maxPages: 5,
  interactionProbe: true,
  maxControlsProbed: 30,
  lastAuthUsername: "",
  extraRegistries: []
};
function settingsPath() {
  return join(app.getPath("userData"), "settings.json");
}
async function loadSettings() {
  try {
    const raw = JSON.parse(await readFile(settingsPath(), "utf8"));
    return {
      ...DEFAULT_SETTINGS,
      ...raw,
      geminiApiKey: raw.geminiApiKey || DEFAULT_SETTINGS.geminiApiKey,
      openaiApiKey: raw.openaiApiKey || DEFAULT_SETTINGS.openaiApiKey
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
async function saveSettings(s) {
  const merged = { ...await loadSettings(), ...s };
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(settingsPath(), JSON.stringify(merged, null, 2), "utf8");
  return merged;
}
function vaultPath() {
  return join(app.getPath("userData"), "credentials.json");
}
function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}
async function readAll() {
  try {
    const raw = await readFile(vaultPath(), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
async function writeAll(items) {
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(vaultPath(), JSON.stringify(items, null, 2), "utf8");
}
function encryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}
async function listCredentials() {
  const items = await readAll();
  return items.map((c) => ({
    origin: c.origin,
    username: c.username,
    loginUrl: c.loginUrl,
    encrypted: c.encrypted,
    updatedAt: c.updatedAt
  })).sort((a, b) => b.updatedAt - a.updatedAt);
}
async function saveCredential(input) {
  const origin = originOf(input.origin);
  const canEncrypt = encryptionAvailable();
  const secret = canEncrypt ? safeStorage.encryptString(input.password).toString("base64") : Buffer.from(input.password, "utf8").toString("base64");
  const entry = {
    origin,
    username: input.username,
    secret,
    encrypted: canEncrypt,
    loginUrl: input.loginUrl,
    usernameSelector: input.usernameSelector,
    passwordSelector: input.passwordSelector,
    submitSelector: input.submitSelector,
    updatedAt: Date.now()
  };
  const items = (await readAll()).filter((c) => c.origin !== origin);
  items.push(entry);
  await writeAll(items);
  return { origin, username: entry.username, loginUrl: entry.loginUrl, encrypted: canEncrypt, updatedAt: entry.updatedAt };
}
async function deleteCredential(origin) {
  const target = originOf(origin);
  await writeAll((await readAll()).filter((c) => c.origin !== target));
}
async function resolveCredential(url) {
  const origin = originOf(url);
  const found = (await readAll()).find((c) => c.origin === origin);
  if (!found) return null;
  let password = "";
  try {
    password = found.encrypted ? safeStorage.decryptString(Buffer.from(found.secret, "base64")) : Buffer.from(found.secret, "base64").toString("utf8");
  } catch {
    return null;
  }
  return {
    username: found.username,
    password,
    loginUrl: found.loginUrl,
    usernameSelector: found.usernameSelector,
    passwordSelector: found.passwordSelector,
    submitSelector: found.submitSelector
  };
}
class CancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "CancelledError";
  }
}
const active = /* @__PURE__ */ new Map();
const cancelledBeforeStart = /* @__PURE__ */ new Set();
function cancelRun(id) {
  const s = active.get(id);
  if (!s) {
    cancelledBeforeStart.add(id);
    return false;
  }
  if (s.cancelled) return true;
  s.cancelled = true;
  s.controller.abort();
  s.reject(new CancelledError());
  s.browser?.close().catch(() => {
  });
  return true;
}
function newRun(config) {
  return {
    id: randomUUID().slice(0, 8),
    createdAt: Date.now(),
    status: "queued",
    // The live run needs the real credentials to sign in; redaction happens at
    // the persistence and IPC boundaries (store.saveRun / redactRun), never here
    // — redacting at construction meant the browser typed "••••••••" as the password.
    config,
    pages: [],
    findings: [],
    flows: [],
    references: [],
    recommendations: [],
    visualDiffs: [],
    interactions: [],
    log: []
  };
}
async function executeRun(run, settings, emit, onUpdate) {
  let rejectCancelled = () => {
  };
  const cancelledPromise = new Promise((_, reject) => {
    rejectCancelled = reject;
  });
  cancelledPromise.catch(() => {
  });
  const state = {
    cancelled: cancelledBeforeStart.delete(run.id),
    controller: new AbortController(),
    cancelledPromise,
    reject: rejectCancelled
  };
  active.set(run.id, state);
  const checkpoint = () => {
    if (state.cancelled) throw new CancelledError();
  };
  const raceCancel = async (p) => {
    if (state.cancelled) throw new CancelledError();
    return Promise.race([p, state.cancelledPromise]);
  };
  const log = (level, msg) => {
    run.log.push({ ts: Date.now(), level, msg });
    if (run.log.length > 500) run.log.shift();
  };
  const progress = (phase, pct, msg) => {
    emit({ runId: run.id, phase, pct, msg });
    log("info", msg);
    onUpdate(run);
  };
  if (state.cancelled) {
    run.status = "cancelled";
    run.finishedAt = Date.now();
    log("info", "Cancelled before start");
    emit({ runId: run.id, phase: "cancelled", pct: 100, msg: "Cancelled" });
    active.delete(run.id);
    await saveRun(run);
    onUpdate(run);
    return run;
  }
  await ensureRunDir(run.id);
  const assets = assetsDir(run.id);
  run.status = "running";
  const cfg = { ...run.config, geminiApiKey: settings.geminiApiKey };
  const creds = credsFromSettings(settings);
  const critic = makeCritic(cfg, creds);
  const model = modelFor(settings);
  const aiEnabled = cfg.useGemini && (cfg.provider === "cursor" || !!(cfg.provider === "openai" ? settings.openaiApiKey : settings.geminiApiKey));
  try {
    progress("launch", 2, `Launching Chromium · target ${cfg.targetUrl}`);
    const browser = await launch();
    state.browser = browser;
    let storageState;
    let credentials = cfg.auth;
    if (cfg.auth && (!cfg.auth.password || cfg.auth.useSaved)) {
      const saved = await resolveCredential(cfg.targetUrl);
      if (saved) {
        credentials = { ...cfg.auth, ...saved };
        log("info", `Using saved credentials for ${saved.username}`);
      }
    }
    if (credentials?.username && credentials.password) {
      progress("auth", 4, `Signing in as ${credentials.username}`);
      const result = await performLogin(browser, cfg.targetUrl, credentials, assets, (m) => log("info", m));
      run.auth = result;
      if (result.ok) {
        storageState = result.storageStatePath;
        log("info", result.detail);
        if (cfg.auth?.remember) {
          try {
            await saveCredential({
              origin: cfg.targetUrl,
              username: credentials.username,
              password: credentials.password,
              loginUrl: credentials.loginUrl,
              usernameSelector: credentials.usernameSelector,
              passwordSelector: credentials.passwordSelector,
              submitSelector: credentials.submitSelector
            });
            log("info", "Credentials saved to the encrypted vault");
          } catch (e) {
            log("warn", `could not save credentials: ${e.message}`);
          }
        }
      } else {
        log("error", result.detail);
        run.findings.push({
          id: "auth-1",
          category: "flow",
          severity: "blocker",
          title: "Could not sign in with the supplied credentials",
          detail: result.detail,
          fix: "Check the credentials, set an explicit login URL, or provide CSS selectors for the username/password/submit controls. Everything below was audited signed-out.",
          pageUrl: cfg.targetUrl,
          evidence: result.screenshot ? [result.screenshot] : void 0,
          source: "heuristic"
        });
      }
      await saveRun(run);
    }
    progress(
      "crawl",
      6,
      `Crawling ${!cfg.maxPages || cfg.maxPages <= 0 ? "every reachable page" : `up to ${cfg.maxPages} page(s)`}${storageState ? " (signed in)" : ""}`
    );
    const unlimited = !cfg.maxPages || cfg.maxPages <= 0;
    run.pages = [];
    await crawl(browser, cfg.targetUrl, cfg.maxPages, {
      viewports: cfg.viewports.length ? cfg.viewports : DEFAULT_VIEWPORTS,
      outDir: assets,
      storageState,
      // Unlimited crawls still get a safety net so a generated URL space
      // cannot trap the run indefinitely.
      budgetMs: unlimited ? 45 * 6e4 : void 0,
      shouldStop: () => state.cancelled,
      onPage: (p) => {
        run.pages.push(p);
        progress(
          "crawl",
          unlimited ? Math.min(28, 6 + run.pages.length) : Math.min(28, 6 + run.pages.length * 4),
          `Captured ${p.url} (${run.pages.length}${unlimited ? "" : `/${cfg.maxPages}`})`
        );
      },
      onLog: (m) => log("info", m)
    });
    checkpoint();
    progress("crawl", 30, `Captured ${run.pages.length} page(s), ${run.pages.reduce((n, p) => n + p.sections.length, 0)} section(s)`);
    const detected = detectArchetype(run.pages, !!storageState);
    refineRoles(run.pages, detected.archetype);
    run.archetype = detected;
    log(
      "info",
      `Product archetype: ${detected.archetype} (${Math.round(detected.confidence * 100)}% — ${detected.signals.slice(0, 4).join(", ") || "no strong signals"})`
    );
    const findings = [];
    for (const page of run.pages) {
      findings.push(...auditPage(page, cfg));
      if (page.cssStats) findings.push(...auditCss(page, page.cssStats, cfg));
    }
    run.findings = findings;
    run.themeSummary = themeSummary(run.pages);
    progress("heuristics", 36, `${findings.length} heuristic finding(s) · ${run.themeSummary}`);
    await saveRun(run);
    try {
      const previous = (await listRuns()).find(
        (r) => r.id !== run.id && r.status === "done" && r.config.targetUrl === cfg.targetUrl
      );
      if (previous) {
        const { diffs, findings: vrFindings } = await compareWithBaseline(run.pages, previous, assets);
        run.visualDiffs = diffs;
        run.findings.push(...vrFindings);
        progress("visual-diff", 42, `Compared against run ${previous.id}: ${diffs.length} viewport diff(s), ${vrFindings.length} regression finding(s)`);
      } else {
        log("info", "No previous run for this target — this run becomes the visual baseline.");
      }
    } catch (e) {
      log("warn", `visual diff failed: ${e.message}`);
    }
    if (cfg.useInteractionProbe) {
      const probeViewport = (cfg.viewports.length ? cfg.viewports : DEFAULT_VIEWPORTS)[0];
      for (const page of run.pages.slice(0, 4)) {
        checkpoint();
        progress("interaction", 44, `Operating controls on ${page.url}`);
        try {
          const { report, findings: probeFindings } = await raceCancel(
            probeInteractions(browser, page.url, {
              outDir: assets,
              viewport: probeViewport,
              maxControls: settings.maxControlsProbed ?? 30,
              budgetMs: 12e4,
              storageState,
              onLog: (m) => log("warn", m)
            })
          );
          run.interactions.push(report);
          run.findings.push(...probeFindings);
          log("info", `${page.url}: probed ${report.controlsProbed} controls → ${probeFindings.length} finding(s), ${report.deadClicks.length} dead click(s)`);
        } catch (e) {
          log("warn", `interaction probe failed: ${e.message}`);
        }
      }
      progress("interaction", 50, `${run.interactions.reduce((n, i) => n + i.controlsProbed, 0)} controls exercised`);
      await saveRun(run);
    }
    if (cfg.useMobbin) {
      progress("mobbin", 45, "Pulling reference UI from Mobbin");
      const seenQueries = /* @__PURE__ */ new Set();
      for (const page of run.pages) {
        for (const s of page.sections) {
          checkpoint();
          if (seenQueries.size >= 10) break;
          const query = queryForSection(s, page, detected.archetype, cfg.productContext);
          if (seenQueries.has(query)) continue;
          seenQueries.add(query);
          log("info", `Mobbin query (${s.role} @ ${new URL(page.url).pathname}): ${query}`);
          try {
            const refs = await raceCancel(
              searchScreens(query, { platform: "web", limit: 3, outDir: assets, sectionId: s.id })
            );
            run.references.push(...refs);
          } catch (e) {
            if (state.cancelled) throw new CancelledError();
            log("warn", `Mobbin screens (${s.role}): ${e.message}`);
          }
          if (detected.archetype !== "app") {
            try {
              const secRefs = await raceCancel(
                searchSections(query, { limit: 2, outDir: assets, sectionId: s.id })
              );
              run.references.push(...secRefs);
            } catch (e) {
              if (state.cancelled) throw new CancelledError();
              log("warn", `Mobbin sections (${s.role}): ${e.message}`);
            }
          }
        }
      }
      try {
        const flowQuery = queryForFlows(detected.archetype, cfg.productContext, run.pages);
        log("info", `Mobbin flow query: ${flowQuery}`);
        run.references.push(...await raceCancel(searchFlows(flowQuery, { limit: 2, outDir: assets })));
      } catch (e) {
        if (state.cancelled) throw new CancelledError();
        log("warn", `Mobbin flows: ${e.message}`);
      }
      progress("mobbin", 55, `${run.references.length} Mobbin reference(s) cached locally`);
      await saveRun(run);
    }
    if (aiEnabled) {
      progress("critique", 58, `Critiquing with ${cfg.provider}/${model}${critic.supportsVision ? "" : " (text-only)"}`);
      for (const page of run.pages) {
        checkpoint();
        const interaction = run.interactions.find((i) => i.url === page.url);
        try {
          const res = await raceCancel(critiquePage(critic, model, page, cfg, interaction));
          run.findings.push(...res.findings);
          if (res.themeRead) run.themeSummary = `${run.themeSummary}

${res.themeRead}`;
          log("info", `${cfg.provider}: ${res.findings.length} finding(s) on ${page.url}`);
        } catch (e) {
          if (state.cancelled) throw new CancelledError();
          log("error", `page critique failed: ${e.message}`);
        }
        const targets = page.sections.filter((s) => s.screenshot).sort((a, b) => b.rect.height - a.rect.height).slice(0, 5);
        for (const s of targets) {
          checkpoint();
          const refs = run.references.filter((r) => r.sectionId === s.id);
          try {
            run.findings.push(...await raceCancel(critiqueSectionAgainstReferences(critic, model, page, s, refs, cfg)));
          } catch (e) {
            if (state.cancelled) throw new CancelledError();
            log("warn", `section critique ${s.id}: ${e.message}`);
          }
        }
      }
      progress("critique", 74, `${run.findings.filter((f) => f.source === "ai").length} AI finding(s)`);
      await saveRun(run);
    } else if (cfg.useGemini) {
      log("warn", `AI critique enabled but ${cfg.provider} is not configured — skipped.`);
    }
    if (cfg.useShadcn) {
      progress("shadcn", 78, "Matching sections to shadcn registry components");
      for (const page of run.pages) {
        for (const s of page.sections) {
          checkpoint();
          const problems = run.findings.filter((f) => f.sectionId === s.id && f.pageUrl === page.url).map((f) => f.title);
          try {
            run.recommendations.push(await raceCancel(recommendForSection(s, problems, settings.extraRegistries, true)));
          } catch (e) {
            if (state.cancelled) throw new CancelledError();
            log("warn", `registry (${s.role}): ${e.message}`);
          }
        }
      }
      const shoogleBacked = run.recommendations.filter((r) => r.source !== "shadcn").length;
      progress("components", 84, `${run.recommendations.length} section recommendation(s) · ${shoogleBacked} from Shoogle community registries`);
      await saveRun(run);
    }
    let flows = cfg.flows;
    let flowOrigin = "user";
    checkpoint();
    if (flows.length === 0 && aiEnabled) {
      try {
        const inventory = flowInventory(run.pages);
        flows = await raceCancel(proposeFlows(critic, model, run.pages, inventory));
        flowOrigin = "ai";
        log("info", `${cfg.provider} proposed ${flows.length} flow(s)`);
      } catch (e) {
        if (state.cancelled) throw new CancelledError();
        log("warn", `flow proposal failed: ${e.message}`);
      }
    }
    if (flows.length === 0) {
      flows = heuristicFlows(run.pages);
      flowOrigin = "derived";
      log("info", `Derived ${flows.length} flow(s) from the crawl (routes, primary CTA, navigation, footer)`);
    }
    const validated = validateFlows(flows, run.pages);
    const runnable = validated.filter((f) => !f.invalid);
    const rejected = validated.filter((f) => f.invalid);
    for (const f of rejected) {
      log("warn", `flow "${f.name}" not run — ${f.invalid}`);
    }
    if (rejected.length && flowOrigin === "ai") {
      run.findings.push({
        id: `flow-invalid-${run.id}`,
        category: "flow",
        severity: "nit",
        title: `${rejected.length} proposed flow(s) referenced things this product does not have`,
        detail: rejected.map((f) => `"${f.name}": ${f.invalid}`).join("\n"),
        fix: "No action needed on the product — these were discarded before running so they could not produce false failures. Write your own flows on the New audit screen to test journeys that matter here.",
        pageUrl: cfg.targetUrl,
        source: "ai"
      });
    }
    if (runnable.length === 0) {
      log("info", "No runnable flows for this product — skipping the flow phase.");
    }
    const flowBudget = Math.max(4, Math.min(20, run.pages.length + 3));
    for (const [i, flow] of runnable.slice(0, flowBudget).entries()) {
      checkpoint();
      progress("flows", 86, `Replaying flow ${i + 1}/${Math.min(runnable.length, flowBudget)}: "${flow.name}"`);
      try {
        const result = await raceCancel(
          runFlow(browser, cfg.targetUrl, { ...flow, origin: flowOrigin }, assets, storageState)
        );
        run.flows.push(result);
        if (!result.ok) {
          const failed = result.steps.find((s) => !s.ok);
          run.findings.push({
            id: `flow-${run.flows.length}`,
            category: "flow",
            severity: "critical",
            title: `Flow "${flow.name}" broke at step ${result.steps.filter((s) => s.ok).length + 1} of ${result.steps.length}`,
            detail: `${failed?.step.action} ${failed?.step.target ?? ""} — ${failed?.error ?? "unknown error"}
The target was present during the crawl, so this is a real dead end rather than a bad test.`,
            fix: "Either the control stops working after the preceding step, or the journey genuinely dead-ends. Both are user-facing failures.",
            pageUrl: cfg.targetUrl,
            evidence: failed?.screenshot ? [failed.screenshot] : void 0,
            source: "heuristic"
          });
        }
      } catch (e) {
        if (state.cancelled) throw new CancelledError();
        log("error", `flow "${flow.name}" crashed: ${e.message}`);
      }
    }
    progress("scoring", 94, "Scoring");
    const beforeDedupe = run.findings.length;
    run.findings = dedupeFindings(run.findings);
    if (beforeDedupe !== run.findings.length) {
      log("info", `Merged ${beforeDedupe - run.findings.length} repeated finding(s) reported on multiple pages`);
    }
    run.scorecard = scoreRun(run.findings, run.pages.length, cfg.brutality);
    if (aiEnabled && !state.cancelled) {
      try {
        run.geminiNotes = await raceCancel(
          finalVerdict(critic, model, run.findings, run.themeSummary ?? "", run.pages.map((p) => p.url))
        );
      } catch (e) {
        if (state.cancelled) throw new CancelledError();
        log("warn", `verdict failed: ${e.message}`);
      }
    }
    await browser.close();
    run.status = "done";
    run.finishedAt = Date.now();
    progress("done", 100, `Done · grade ${run.scorecard.grade} (${run.scorecard.overall}/100) · ${run.findings.length} findings`);
  } catch (e) {
    const msg = e.message;
    const wasCancelled = state.cancelled || e instanceof CancelledError || msg === "cancelled";
    run.status = wasCancelled ? "cancelled" : "failed";
    run.finishedAt = Date.now();
    if (wasCancelled) {
      run.error = void 0;
      if (run.pages.length > 0 && run.findings.length === 0) {
        for (const page of run.pages) {
          try {
            run.findings.push(...auditPage(page, cfg));
            if (page.cssStats) run.findings.push(...auditCss(page, page.cssStats, cfg));
          } catch {
          }
        }
        run.themeSummary = themeSummary(run.pages);
      }
      if (!run.scorecard && run.findings.length > 0) {
        run.scorecard = scoreRun(run.findings, Math.max(1, run.pages.length), cfg.brutality);
      }
      log("info", `Cancelled by user — keeping ${run.findings.length} finding(s) from ${run.pages.length} page(s)`);
      emit({
        runId: run.id,
        phase: "cancelled",
        pct: 100,
        msg: `Cancelled · kept ${run.pages.length} page(s) and ${run.findings.length} finding(s)`
      });
    } else {
      run.error = msg;
      log("error", msg);
      emit({ runId: run.id, phase: "failed", pct: 100, msg });
    }
    try {
      await state.browser?.close();
    } catch {
    }
  } finally {
    await Promise.allSettled([closeMobbin(), closeShoogle()]);
    active.delete(run.id);
    await saveRun(run);
    onUpdate(run);
  }
  return run;
}
const ORDER = ["blocker", "critical", "major", "minor", "nit"];
function renderMarkdownReport(run) {
  const s = run.scorecard;
  const lines = [];
  lines.push(`# Qualition audit — ${run.config.targetUrl}`);
  lines.push("");
  lines.push(`Run \`${run.id}\` · ${new Date(run.createdAt).toLocaleString()} · brutality: **${run.config.brutality}** · pages: ${run.pages.length}`);
  lines.push("");
  if (s) {
    lines.push(`## Verdict — ${s.grade} (${s.overall}/100)`);
    lines.push("");
    lines.push(`> ${s.verdict}`);
    lines.push("");
    lines.push("| Category | Score | Findings |");
    lines.push("| --- | ---: | ---: |");
    for (const [k, v] of Object.entries(s.categories)) lines.push(`| ${k} | ${v.score} | ${v.findings} |`);
    lines.push("");
  }
  if (run.geminiNotes) {
    lines.push("## Executive read");
    lines.push("");
    lines.push(run.geminiNotes);
    lines.push("");
  }
  if (run.auth) {
    lines.push(`## Session`);
    lines.push("");
    lines.push(`${run.auth.ok ? "✅ Signed in" : "❌ Sign-in failed"} — ${run.auth.detail}`);
    lines.push("");
  }
  if (run.themeSummary) {
    lines.push("## Detected design language");
    lines.push("");
    lines.push(run.themeSummary);
    lines.push("");
  }
  const withCss = run.pages.filter((p) => p.cssStats);
  if (withCss.length) {
    lines.push("## Authored CSS (Project Wallace)");
    lines.push("");
    lines.push("| Page | Size | Rules | Colour reuse | Font sizes | Radii | Shadows | !important | Max spec | z-index | Maint./Cplx |");
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const p of withCss) {
      const c = p.cssStats;
      lines.push(
        `| ${new URL(p.url).pathname || "/"} | ${(c.bytes / 1024).toFixed(0)} kB | ${c.rules} | ${c.colorsUnique}/${c.colorsTotal} (${(c.colorUniquenessRatio * 100).toFixed(0)}%) | ${c.fontSizesUnique} | ${c.radiiUnique} | ${c.shadowsUnique} | ${(c.importantRatio * 100).toFixed(1)}% | (${c.maxSpecificity}) | ${c.zIndexMax} | ${c.quality.maintainability}/${c.quality.complexity} |`
      );
    }
    lines.push("");
  }
  if (run.visualDiffs?.length) {
    lines.push("## Visual regression");
    lines.push("");
    lines.push(`Baseline: run \`${run.visualDiffs[0].baselineRunId}\``);
    lines.push("");
    for (const d of [...run.visualDiffs].sort((a, b) => b.changedRatio - a.changedRatio)) {
      lines.push(`- **${(d.changedRatio * 100).toFixed(1)}%** changed · ${d.viewport} · ${d.url}${d.diffImage ? ` — \`${d.diffImage}\`` : ""}`);
    }
    lines.push("");
  }
  if (run.interactions?.length) {
    lines.push("## Interaction probe");
    lines.push("");
    lines.push("Controls were actually hovered, focused, keyboard-driven and safely clicked.");
    lines.push("");
    lines.push("| Page | Probed | Dead clicks | No focus ring | No hover | Unnamed | Fake buttons | Tab stops |");
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const r of run.interactions) {
      lines.push(
        `| ${new URL(r.url).pathname || "/"} | ${r.controlsProbed} | ${r.deadClicks.length} | ${r.noFocusIndicator.length} | ${r.noHoverFeedback.length} | ${r.unnamedControls.length} | ${r.fakeButtons.length} | ${r.keyboard.tabStops} |`
      );
    }
    lines.push("");
    for (const r of run.interactions) {
      if (r.deadClicks.length) lines.push(`- Dead clicks on ${r.url}: ${r.deadClicks.map((x) => `\`${x}\``).join(", ")}`);
      if (r.noFocusIndicator.length)
        lines.push(`- No focus ring on ${r.url}: ${r.noFocusIndicator.map((x) => `\`${x}\``).join(", ")}`);
      for (const o of r.overlays)
        lines.push(`- Overlay "${o.trigger}": escape ${o.escapeCloses ? "closes" : "**does not close**"}, focus ${o.focusMoved ? "moves in" : "**stays behind**"}`);
      for (const f of r.forms)
        lines.push(`- Form "${f.submitLabel || `#${f.index}`}" (${f.required}/${f.fields} required): ${f.validationFeedback ? "shows validation" : "**submits silently**"}`);
    }
    lines.push("");
  }
  lines.push("## Findings");
  for (const sev of ORDER) {
    const list = run.findings.filter((f) => f.severity === sev);
    if (!list.length) continue;
    lines.push("");
    lines.push(`### ${sev.toUpperCase()} (${list.length})`);
    for (const f of list) {
      lines.push("");
      lines.push(`- **${f.title}** \`${f.category}\` · ${f.source}${f.sectionId ? ` · section ${f.sectionId}` : ""}${f.viewport ? ` · ${f.viewport}` : ""}`);
      lines.push(`  - ${f.detail.replace(/\n/g, "\n    ")}`);
      lines.push(`  - **Fix:** ${f.fix}`);
      lines.push(`  - ${f.pageUrl}`);
    }
  }
  if (run.recommendations.length) {
    lines.push("");
    lines.push("## Component replacements (Shoogle community registries → shadcn fallback)");
    for (const r of run.recommendations) {
      lines.push("");
      lines.push(`### ${r.sectionRole} — ${r.sectionId}`);
      lines.push(r.reason);
      lines.push("");
      for (const i of r.items)
        lines.push(`- \`${i.addCommand}\` — ${i.name} [${i.source}${i.registry ? ` ${i.registry}` : ""}]: ${i.description}`);
    }
  }
  if (run.references.length) {
    lines.push("");
    lines.push("## Reference UI (Mobbin)");
    for (const ref of run.references) {
      lines.push(`- [${ref.appName ?? ref.title}](${ref.mobbinUrl ?? ""}) — _${ref.query}_`);
    }
  }
  if (run.flows.length) {
    lines.push("");
    lines.push("## Flow results");
    for (const f of run.flows) {
      lines.push("");
      lines.push(`### ${f.name} — ${f.ok ? "PASS" : "FAIL"} (${f.totalMs}ms)`);
      for (const st of f.steps)
        lines.push(`- ${st.ok ? "✅" : "❌"} \`${st.step.action}\` ${st.step.target ?? ""} ${st.error ? `— ${st.error}` : ""}`);
    }
  }
  return lines.join("\n");
}
const SEVERITY_ORDER = ["blocker", "critical", "major", "minor", "nit"];
function severityRank(f) {
  return SEVERITY_ORDER.indexOf(f.severity);
}
function selectFindings(run, opts) {
  const max = opts.maxFindings ?? 40;
  let list = [...run.findings];
  switch (opts.scope) {
    case "critical":
      list = list.filter((f) => f.severity === "blocker" || f.severity === "critical" || f.severity === "major");
      break;
    case "accessibility":
      list = list.filter((f) => f.category === "accessibility");
      break;
    case "coherence":
      list = list.filter((f) => f.category === "coherence" || f.category === "craft" || f.category === "variety");
      break;
    case "section":
      list = list.filter((f) => f.sectionId === opts.sectionId && (!opts.pageUrl || f.pageUrl === opts.pageUrl));
      break;
  }
  return list.sort((a, b) => severityRank(a) - severityRank(b)).slice(0, max);
}
function buildFixPrompt(run, opts = {}) {
  const findings = selectFindings(run, opts);
  const scope = opts.scope ?? "all";
  const out = [];
  out.push("# UI/UX remediation brief");
  out.push("");
  out.push(
    `You are improving a shipping product. An automated audit (Qualition) crawled it in a real browser, measured the design system, exercised the controls and graded the result. Below are the verified findings. Fix them in the codebase.`
  );
  out.push("");
  out.push("## Ground rules");
  out.push("- Every item below was measured, not guessed. Treat the numbers as facts about the current build.");
  out.push("- Fix the cause, not the symptom: prefer one token/component change over N one-off patches.");
  out.push("- Do not redesign anything that is not listed. No new visual direction, no library swaps beyond what is suggested.");
  out.push("- Keep the existing design language; the goal is coherence and correctness, not novelty.");
  out.push("- After each change, state which finding id it resolves.");
  out.push("");
  out.push("## Context");
  out.push(`- Target: ${run.config.targetUrl}`);
  out.push(`- Pages audited: ${run.pages.map((p) => new URL(p.url).pathname || "/").join(", ") || "n/a"}`);
  if (run.scorecard) {
    out.push(`- Overall grade: ${run.scorecard.grade} (${run.scorecard.overall}/100)`);
    out.push(
      `- Category scores: ${Object.entries(run.scorecard.categories).map(([k, v]) => `${k} ${v.score}`).join(", ")}`
    );
  }
  if (run.themeSummary) out.push(`- Detected design language: ${run.themeSummary.split("\n")[0]}`);
  const css = run.pages.find((p) => p.cssStats)?.cssStats;
  if (css) {
    out.push(
      `- Authored CSS: ${(css.bytes / 1024).toFixed(0)}kB, ${css.rules} rules, ${css.colorsUnique} unique colours across ${css.colorsTotal} declarations (${(css.colorUniquenessRatio * 100).toFixed(0)}% uniqueness), ${css.fontSizesUnique} font sizes, ${css.radiiUnique} radii, ${css.shadowsUnique} shadows, !important on ${(css.importantRatio * 100).toFixed(1)}% of declarations, max specificity (${css.maxSpecificity}), z-index max ${css.zIndexMax}`
    );
  }
  out.push("");
  out.push(`## Findings to fix (${findings.length}${scope === "all" ? "" : `, scope: ${scope}`})`);
  for (const sev of SEVERITY_ORDER) {
    const group = findings.filter((f) => f.severity === sev);
    if (!group.length) continue;
    out.push("");
    out.push(`### ${sev.toUpperCase()}`);
    for (const f of group) {
      const where = [f.pageUrl, f.sectionId ? `section ${f.sectionId}` : "", f.viewport ?? "", f.selector ?? ""].filter(Boolean).join(" · ");
      out.push("");
      out.push(`**[${f.id}] ${f.title}** _(${f.category})_`);
      out.push(`- Evidence: ${f.detail.replace(/\n+/g, " ").slice(0, 500)}`);
      out.push(`- Required fix: ${f.fix}`);
      out.push(`- Where: ${where}`);
    }
  }
  const recs = scope === "section" && opts.sectionId ? run.recommendations.filter((r) => r.sectionId === opts.sectionId) : run.recommendations;
  if (recs.length) {
    out.push("");
    out.push("## Suggested component replacements");
    out.push("These are real registry components. Prefer them over hand-rolled markup.");
    for (const r of recs.slice(0, 8)) {
      out.push("");
      out.push(`### ${r.sectionRole} (${r.sectionId})`);
      out.push(r.reason);
      for (const i of r.items.slice(0, 5)) out.push(`- \`${i.addCommand}\` — ${i.name}: ${i.description}`);
    }
  }
  const probes = run.interactions?.filter(
    (i) => i.deadClicks.length || i.noFocusIndicator.length || i.unnamedControls.length || i.fakeButtons.length
  );
  if (probes?.length) {
    out.push("");
    out.push("## Broken interaction states (measured by driving the UI)");
    for (const p of probes.slice(0, 6)) {
      out.push("");
      out.push(`### ${p.url} (${p.viewport})`);
      if (p.deadClicks.length) out.push(`- Clicked with no observable effect: ${p.deadClicks.slice(0, 8).join(", ")}`);
      if (p.noFocusIndicator.length) out.push(`- No visible focus state: ${p.noFocusIndicator.slice(0, 8).join(", ")}`);
      if (p.noHoverFeedback.length) out.push(`- Pointer cursor but no hover feedback: ${p.noHoverFeedback.slice(0, 8).join(", ")}`);
      if (p.unnamedControls.length) out.push(`- No accessible name: ${p.unnamedControls.slice(0, 8).join(", ")}`);
      if (p.fakeButtons.length) out.push(`- Clickable but not focusable (fake buttons): ${p.fakeButtons.slice(0, 8).join(", ")}`);
      for (const o of p.overlays) {
        if (!o.escapeCloses) out.push(`- Overlay "${o.trigger}" does not close on Escape`);
        if (!o.focusMoved) out.push(`- Overlay "${o.trigger}" does not move focus into itself`);
      }
      for (const f of p.forms.filter((x) => !x.validationFeedback && x.required > 0)) {
        out.push(`- Form "${f.submitLabel || `#${f.index}`}" submits empty (${f.required} required fields) with no visible validation`);
      }
    }
  }
  const brokenFlows = run.flows?.filter((f) => !f.ok && !f.invalid);
  if (brokenFlows?.length) {
    out.push("");
    out.push("## User journeys that break");
    for (const f of brokenFlows.slice(0, 6)) {
      const failed = f.steps.find((s) => !s.ok);
      out.push(
        `- **${f.name}** failed at step ${f.steps.filter((s) => s.ok).length + 1}: \`${failed?.step.action} ${failed?.step.target ?? ""}\` — ${failed?.error?.split("\n")[0] ?? "unknown"}`
      );
    }
  }
  if (run.references?.length) {
    const refs = [...new Set(run.references.map((r) => r.appName).filter(Boolean))].slice(0, 8);
    if (refs.length) {
      out.push("");
      out.push("## Reference products");
      out.push(
        `For visual/structural reference on the same section types, the audit pulled shipped UI from: ${refs.join(", ")}. Match their information hierarchy, not their branding.`
      );
    }
  }
  out.push("");
  out.push("## Output expected from you");
  out.push("1. A short plan grouping the findings into root causes (tokens, components, states, content).");
  out.push("2. The actual code changes, smallest coherent diffs first.");
  out.push("3. A list of finding ids you did NOT fix, with the reason.");
  return out.join("\n");
}
const __dirname_ = fileURLToPath(new URL(".", import.meta.url));
let win = null;
const APP_NAME = "Qualition";
app.setName(APP_NAME);
function iconPath() {
  const candidates = [
    join(__dirname_, "../../resources/icon.png"),
    join(process.resourcesPath ?? "", "icon.png"),
    join(app.getAppPath(), "resources/icon.png")
  ];
  return candidates.find((p) => p && existsSync(p)) ?? null;
}
protocol.registerSchemesAsPrivileged([
  { scheme: "qasset", privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } }
]);
function createWindow() {
  const icon = iconPath();
  win = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1100,
    show: false,
    title: APP_NAME,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#09090b",
    ...icon ? { icon } : {},
    webPreferences: {
      preload: join(__dirname_, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true
    }
  });
  win.on("ready-to-show", () => win?.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(__dirname_, "../renderer/index.html"));
}
app.whenReady().then(() => {
  const icon = iconPath();
  if (icon && process.platform === "darwin" && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(icon));
  }
  protocol.handle("qasset", (req) => {
    const path = decodeURIComponent(new URL(req.url).pathname);
    return net.fetch(pathToFileURL(path).toString());
  });
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
function registerIpc() {
  ipcMain.handle("settings:get", () => loadSettings());
  ipcMain.handle("settings:set", (_e, patch) => saveSettings(patch));
  ipcMain.handle("models:list", async (_e, provider) => {
    const settings = await loadSettings();
    return createProvider(provider, credsFromSettings(settings)).listModels();
  });
  ipcMain.handle("models:test", async (_e, provider) => {
    const settings = await loadSettings();
    const model = provider === "openai" ? settings.openaiModel : provider === "cursor" ? settings.cursorModel : settings.geminiModel;
    return createProvider(provider, credsFromSettings(settings)).status(model);
  });
  ipcMain.handle("viewports:default", () => DEFAULT_VIEWPORTS);
  ipcMain.handle("status:all", async () => {
    const settings = await loadSettings();
    const provider = createProvider(settings.provider, credsFromSettings(settings));
    const [mob, shoog, reg, model] = await Promise.all([
      mobbinStatus(),
      shoogleStatus(),
      registryStatus(settings.extraRegistries),
      provider.status(modelFor(settings))
    ]);
    let playwright = { ok: true, detail: "chromium ready" };
    try {
      const { chromium: chromium2 } = await import("playwright");
      const b = await chromium2.launch({ headless: true });
      playwright = { ok: true, detail: `chromium ${b.version()}` };
      await b.close();
    } catch (e) {
      playwright = { ok: false, detail: `${e.message.slice(0, 200)} — run: npx playwright install chromium` };
    }
    return { mobbin: mob, shoogle: shoog, shadcn: reg, model, playwright };
  });
  ipcMain.handle("mcp:servers", () => discoverUsedServers());
  ipcMain.handle("runs:list", () => listRuns());
  ipcMain.handle("runs:get", (_e, id) => loadRun(id));
  ipcMain.handle("runs:delete", (_e, id) => deleteRun(id));
  ipcMain.handle("runs:reveal", (_e, id) => shell.openPath(runDir(id)));
  ipcMain.handle("runs:start", async (_e, config) => {
    const settings = await loadSettings();
    const run = newRun({
      ...config,
      provider: config.provider || settings.provider,
      geminiModel: config.geminiModel || modelFor(settings)
    });
    void executeRun(
      run,
      settings,
      (p) => win?.webContents.send("run:progress", p),
      // Credentials never cross the IPC boundary, even to our own renderer.
      (r) => win?.webContents.send("run:update", redactRun(r))
    );
    return redactRun(run);
  });
  ipcMain.handle("runs:cancel", (_e, id) => cancelRun(id));
  ipcMain.handle("runs:export", async (_e, id) => {
    const run = await loadRun(id);
    if (!run) return null;
    const md = renderMarkdownReport(run);
    const res = await dialog.showSaveDialog({
      defaultPath: `qualition-${run.config.targetUrl.replace(/https?:\/\//, "").replace(/\W+/g, "-")}-${id}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }]
    });
    if (res.canceled || !res.filePath) return null;
    await writeFile(res.filePath, md, "utf8");
    return res.filePath;
  });
  ipcMain.handle("runs:prompt", async (_e, args) => {
    const run = await loadRun(args.id);
    return run ? buildFixPrompt(run, args.options ?? {}) : null;
  });
  ipcMain.handle(
    "components:detail",
    (_e, input) => fetchComponentDetail(input)
  );
  ipcMain.handle("registry:search", async (_e, query) => {
    const settings = await loadSettings();
    const results = [];
    try {
      for (const it of await searchShoogle(query, 12)) {
        results.push({
          name: it.name,
          registry: it.registry,
          type: it.type,
          description: it.description,
          addCommand: shoogleAddCommand(it),
          docs: it.homepage,
          source: "shoogle"
        });
      }
    } catch {
    }
    try {
      const items = await loadRegistry(settings.extraRegistries);
      for (const i of searchRegistry(items, query, 10)) {
        results.push({ ...i, addCommand: addCommand(i), source: "shadcn" });
      }
    } catch {
    }
    return results;
  });
  ipcMain.handle("mobbin:search", async (_e, args) => {
    const dir = args.runId ? join(runDir(args.runId), "assets") : app.getPath("temp");
    return args.kind === "section" ? searchSections(args.query, { limit: 6, outDir: dir }) : searchScreens(args.query, { limit: 6, outDir: dir, platform: "web" });
  });
  ipcMain.handle("creds:list", () => listCredentials());
  ipcMain.handle("creds:encryption", () => encryptionAvailable());
  ipcMain.handle("creds:origin", (_e, url) => originOf(url));
  ipcMain.handle(
    "creds:save",
    (_e, input) => saveCredential(input)
  );
  ipcMain.handle("creds:delete", (_e, origin) => deleteCredential(origin));
  ipcMain.handle("shell:open", (_e, url) => shell.openExternal(url));
}
