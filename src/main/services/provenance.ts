/**
 * First-party vs third-party / dev-chrome attribution for findings.
 *
 * Tools like Agentation live in node_modules and never ship. Without ownership
 * on each finding, audits invent ~30 product defects per run that are not the
 * product. Classification is heuristic (DOM markers, URL patterns, CSS scope)
 * plus best-effort React fiber / data-source when present.
 */
import type { Finding, FindingEffort, FindingOwnership, FindingProvenance } from '../../shared/types.js'
import { DEV_CHROME_ATTRS } from './devChrome.js'

export const DEV_CHROME_PROVENANCE: FindingProvenance = {
  ownership: 'dev-chrome',
  shipsInProduction: false,
  bundle: 'node_modules',
  note: 'Dev-only overlay (e.g. Agentation); gated out of production builds'
}

/** Browser-side classifier — keep in sync with isDevChrome + fiber helpers. */
export const CLASSIFY_NODE_BROWSER_SOURCE = `function classifyNodeProvenance(el) {
  if (!el || el.nodeType !== 1) {
    return { ownership: 'unknown', shipsInProduction: null };
  }
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
    ) {
      return {
        ownership: 'dev-chrome',
        shipsInProduction: false,
        bundle: 'node_modules',
        note: 'Dev-only overlay chrome'
      };
    }
    var id = (cur.id || '').toLowerCase();
    if (id.indexOf('agentation') !== -1 || id === 'react-scan-root' || id === '__stagewise_container') {
      return {
        ownership: 'dev-chrome',
        shipsInProduction: false,
        bundle: 'node_modules',
        note: 'Dev-only overlay chrome'
      };
    }
    var cls = typeof cur.className === 'string' ? cur.className.toLowerCase() : '';
    if (cls.indexOf('agentation') !== -1 || cls.indexOf('falnor-agentation') !== -1) {
      return {
        ownership: 'dev-chrome',
        shipsInProduction: false,
        bundle: 'node_modules',
        note: 'Agentation toolbar (class marker)'
      };
    }
    if (cur.tagName && cur.tagName.toLowerCase() === 'nextjs-portal') {
      return {
        ownership: 'dev-chrome',
        shipsInProduction: false,
        bundle: 'framework',
        note: 'Next.js dev portal'
      };
    }
    var ds = cur.getAttribute('data-source');
    if (ds && /node_modules|agentation/i.test(ds)) {
      var parts = ds.split(':');
      return {
        ownership: /agentation/i.test(ds) ? 'dev-chrome' : 'third-party',
        shipsInProduction: /agentation/i.test(ds) ? false : null,
        bundle: 'node_modules',
        sourceFile: parts[0],
        sourceLine: parts[1] ? Number(parts[1]) : undefined,
        note: 'data-source points at node_modules'
      };
    }
    cur = cur.parentElement;
  }

  // React fiber _debugSource (dev builds only).
  try {
    var keys = Object.keys(el);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k.indexOf('__reactFiber') === 0 || k.indexOf('__reactInternalInstance') === 0) {
        var fiber = el[k];
        var walk = fiber;
        var depth = 0;
        while (walk && depth < 40) {
          var src = walk._debugSource;
          if (src && src.fileName) {
            var file = String(src.fileName);
            var line = src.lineNumber;
            if (/node_modules|agentation/i.test(file)) {
              return {
                ownership: /agentation/i.test(file) ? 'dev-chrome' : 'third-party',
                shipsInProduction: /agentation/i.test(file) ? false : null,
                bundle: 'node_modules',
                sourceFile: file,
                sourceLine: line,
                note: 'React fiber source in node_modules'
              };
            }
            return {
              ownership: 'first-party',
              shipsInProduction: null,
              bundle: 'app',
              sourceFile: file,
              sourceLine: line
            };
          }
          walk = walk.return || walk._debugOwner;
          depth++;
        }
        break;
      }
    }
  } catch (e) { /* fiber unavailable */ }

  return { ownership: 'first-party', shipsInProduction: null, bundle: 'app' };
}`

/** Detect Vite / Next / HMR markers on the live document. */
export const DETECT_BUILD_MODE_BROWSER_SOURCE = `function detectBuildMode() {
  var hints = [];
  var scripts = Array.from(document.scripts || []).map(function (s) { return s.src || ''; });
  var hrefs = Array.from(document.querySelectorAll('link[rel=stylesheet]')).map(function (l) {
    return l.href || '';
  });
  var all = scripts.concat(hrefs).join('\\n');
  if (/\\/@vite\\/client|\\/\\.vite\\/|@fs\\//i.test(all)) hints.push('vite-client');
  if (/@react-refresh|react-refresh/i.test(all)) hints.push('react-refresh');
  if (/_next\\/static|__next/i.test(all) && /localhost|127\\.0\\.0\\.1/.test(location.host)) hints.push('next-dev');
  try {
    if (typeof window !== 'undefined' && window.__vite_plugin_react_preamble_installed__) hints.push('vite-hmr');
  } catch (e) {}
  var host = (location.hostname || '').toLowerCase();
  var isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local');
  var buildMode = 'unknown';
  if (hints.length > 0) buildMode = 'development';
  else if (!isLocal && document.querySelector('script[src*=\"assets/\"]')) buildMode = 'production';
  else if (!isLocal) buildMode = 'production';
  else if (isLocal) buildMode = 'development';
  return { buildMode: buildMode, isLocalTarget: isLocal, buildHints: hints };
}`

export function ownershipFromSelector(selector?: string): FindingOwnership {
  if (!selector) return 'unknown'
  const s = selector.toLowerCase()
  if (
    DEV_CHROME_ATTRS.some((a) => s.includes(a)) ||
    s.includes('agentation') ||
    s.includes('data-feedback-toolbar') ||
    s.includes('data-annotation-') ||
    s.includes('react-scan') ||
    s.includes('stagewise') ||
    s.includes('vercel-toolbar') ||
    s.includes('nextjs-portal')
  ) {
    return 'dev-chrome'
  }
  // Agentation's CSS modules — only when paired with its buttonWrapper pattern.
  if (/styles-module__buttonwrapper/i.test(s) && /styles-module__controlbutton/i.test(s)) {
    return 'dev-chrome'
  }
  if (/node_modules|\/@fs\/|\/\.vite\//i.test(s)) return 'third-party'
  return 'unknown'
}

export function provenanceForSelector(selector?: string): FindingProvenance | undefined {
  const ownership = ownershipFromSelector(selector)
  if (ownership === 'dev-chrome') return { ...DEV_CHROME_PROVENANCE }
  if (ownership === 'third-party') {
    return {
      ownership: 'third-party',
      shipsInProduction: null,
      bundle: 'node_modules',
      note: 'Selector points at vendor / node_modules'
    }
  }
  return undefined
}

/** True when the finding should not count against the product grade. */
export function isNonProductFinding(f: Finding): boolean {
  const o = f.provenance?.ownership
  if (o === 'dev-chrome' || o === 'third-party') return true
  if (ownershipFromSelector(f.selector) === 'dev-chrome') return true
  return false
}

/**
 * Split product findings from excluded chrome/vendor noise.
 * Emits one explanatory nit when anything was excluded.
 */
export function partitionProductFindings(
  findings: Finding[],
  pageUrl: string
): { product: Finding[]; excluded: Finding[]; meta?: Finding } {
  const product: Finding[] = []
  const excluded: Finding[] = []
  for (const f of findings) {
    const prov = f.provenance ?? provenanceForSelector(f.selector)
    const enriched = prov ? { ...f, provenance: f.provenance ?? prov } : f
    if (isNonProductFinding(enriched)) excluded.push(enriched)
    else product.push(enriched)
  }
  let meta: Finding | undefined
  if (excluded.length > 0) {
    meta = {
      id: `excl-${excluded.length}`,
      category: 'craft',
      severity: 'nit',
      title: `${excluded.length} finding(s) excluded — not first-party / may not ship`,
      detail: excluded
        .slice(0, 12)
        .map((f) => `• ${f.title}${f.provenance?.note ? ` (${f.provenance.note})` : ''}`)
        .join('\n'),
      fix: 'No product change needed. These nodes come from dev-only toolbars or vendor packages. Re-audit a production build to confirm they are absent.',
      pageUrl,
      source: 'heuristic',
      provenance: DEV_CHROME_PROVENANCE,
      effort: 'one-line',
      confidence: 'high'
    }
  }
  return { product, excluded, meta }
}

export function guessEffort(f: Finding): FindingEffort {
  if (f.effort) return f.effort
  const t = `${f.title} ${f.detail} ${f.fix}`.toLowerCase()
  if (/mobile|ia |information architecture|redesign|navigation pattern|breakpoint/.test(t)) return 'redesign'
  if (/contrast|colour|color|!important|z-index|font-size|one line|opacity|alt text|aria-label|lang=/.test(t)) {
    return 'one-line'
  }
  return 'component'
}

/**
 * After an optional production-URL pass: mark findings whose selectors are
 * absent on prod as shipsInProduction:false, and flag heavy CSS/perf nits when
 * the production bundle is materially leaner (Vite-dev artifact).
 */
export function applyProductionPresence(
  findings: Finding[],
  presence: Record<string, boolean>,
  opts?: { prodCssBytes?: number; auditCssBytes?: number; productionUrl?: string }
): Finding[] {
  const leanerProd =
    opts?.prodCssBytes != null &&
    opts?.auditCssBytes != null &&
    opts.auditCssBytes > 0 &&
    opts.prodCssBytes < opts.auditCssBytes * 0.6

  return findings.map((f) => {
    let ships = f.provenance?.shipsInProduction ?? null
    const notes: string[] = f.provenance?.note ? [f.provenance.note] : []

    if (f.selector && Object.prototype.hasOwnProperty.call(presence, f.selector)) {
      ships = presence[f.selector]
      if (!ships) {
        notes.push(
          `Selector absent on production URL${opts?.productionUrl ? ` (${opts.productionUrl})` : ''}`
        )
      }
    }

    if (
      leanerProd &&
      /css weight|transfer bytes|request count|\bLCP\b|\bCLS\b|dev-server artifact/i.test(`${f.title} ${f.detail}`)
    ) {
      ships = false
      notes.push(
        `Leaner on production (${opts!.prodCssBytes}B CSS vs ${opts!.auditCssBytes}B on audit target) — treat as Vite/HMR noise`
      )
    }

    if (ships === (f.provenance?.shipsInProduction ?? null) && notes.length === (f.provenance?.note ? 1 : 0)) {
      return f
    }

    return {
      ...f,
      provenance: {
        ownership: f.provenance?.ownership ?? 'unknown',
        bundle: f.provenance?.bundle,
        sourceFile: f.provenance?.sourceFile,
        sourceLine: f.provenance?.sourceLine,
        ...f.provenance,
        shipsInProduction: ships,
        note: notes.length ? [...new Set(notes)].join('; ') : f.provenance?.note
      }
    }
  })
}
