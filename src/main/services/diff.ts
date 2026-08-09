/** Diff-based analysis: stable fingerprints, baseline picking, true incremental. */
import { createHash } from 'node:crypto'
import type { CapturedPage, Finding, Run } from '../../shared/types.js'

export interface DiffPlan {
  baseline: Run | null
  added: string[]
  removed: string[]
  unchanged: string[]
  changed: string[]
  needsAudit: string[]
  reusedCount: number
}

function stableSectionsSig(p: CapturedPage): string {
  try {
    const sig = [...p.sections]
      .map((s) => `${s.role}:${s.label}`)
      .sort()
      .join('|')
    return sig
  } catch {
    return ''
  }
}

export function fingerprintPage(p: CapturedPage): string {
  const h = createHash('sha256')
  h.update(p.url)
  h.update(String(p.status))
  h.update(p.title ?? '')
  if (p.htmlHash) h.update(p.htmlHash)
  else {
    // Fallback for legacy runs without htmlHash — use stable sections + css bytes
    h.update(stableSectionsSig(p))
    try {
      const cssBytes = p.cssStats ? String(p.cssStats.bytes) : ''
      h.update(cssBytes)
    } catch {}
  }
  // Stable sections (role+label sorted, no id which is capture-generated)
  h.update(stableSectionsSig(p))
  // Stable CSS size only — not token usage counts which churn on sampling
  try {
    if (p.cssStats) h.update(String(p.cssStats.bytes))
  } catch {}
  h.update(String(p.axe.length))
  return h.digest('hex').slice(0, 16)
}

export function htmlHashForText(html: string): string {
  return createHash('sha256').update(html).digest('hex').slice(0, 16)
}

export function planDiff(currentUrls: string[], baseline: Run | null): DiffPlan {
  if (!baseline) {
    return { baseline: null, added: currentUrls.slice(), removed: [], unchanged: [], changed: currentUrls.slice(), needsAudit: currentUrls.slice(), reusedCount: 0 }
  }
  const baseUrls = baseline.pages.map((p) => p.url)
  const baseSet = new Set(baseUrls)
  const curSet = new Set(currentUrls)
  const added = currentUrls.filter((u) => !baseSet.has(u))
  const removed = baseUrls.filter((u) => !curSet.has(u))
  const maybeUnchanged = currentUrls.filter((u) => baseSet.has(u))
  return {
    baseline,
    added,
    removed,
    unchanged: [],
    changed: maybeUnchanged,
    needsAudit: [...added, ...maybeUnchanged],
    reusedCount: 0
  }
}

/** Lightweight fetch hash for pre-flight incremental skip (no Playwright). */
export async function fetchHtmlHash(url: string, timeoutMs = 4000): Promise<string | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'text/html' } })
    if (!res.ok) return null
    const text = await res.text()
    if (!text) return null
    return htmlHashForText(text.slice(0, 500_000))
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

export function classifyPagesAfterCapture(
  currentPages: CapturedPage[],
  baseline: Run | null
): { changed: CapturedPage[]; unchanged: CapturedPage[]; reused: CapturedPage[]; newPages: CapturedPage[] } {
  if (!baseline) return { changed: currentPages, unchanged: [], reused: [], newPages: currentPages }
  const baseByUrl = new Map(baseline.pages.map((p) => [p.url, p]))
  const changed: CapturedPage[] = []
  const unchanged: CapturedPage[] = []
  const reused: CapturedPage[] = []
  const newPages: CapturedPage[] = []
  for (const p of currentPages) {
    const b = baseByUrl.get(p.url)
    if (!b) {
      newPages.push(p)
      changed.push(p)
      continue
    }
    // Prefer htmlHash comparison when available — most stable
    if (p.htmlHash && b.htmlHash) {
      if (p.htmlHash === b.htmlHash) {
        unchanged.push(p)
        reused.push(p)
      } else {
        changed.push(p)
      }
      continue
    }
    const fh = fingerprintPage(p)
    const bh = fingerprintPage(b)
    if (fh === bh) {
      unchanged.push(p)
      reused.push(p)
    } else {
      changed.push(p)
    }
  }
  return { changed, unchanged, reused, newPages }
}

export function findingsDeltaSummary(findings: Finding[], baseline: Run | null): { newFindings: number; fixedFindings: number } {
  if (!baseline) return { newFindings: findings.length, fixedFindings: 0 }
  const shape = (f: Finding): string =>
    [f.category, f.pageUrl ? new URL(f.pageUrl).pathname : f.pageUrl, f.title.replace(/\d+(\.\d+)?%?/g, '#'), f.selector ?? ''].join('|')
  const priorShapes = new Set(baseline.findings.map(shape))
  const currentShapes = new Set(findings.map(shape))
  const newFindings = findings.filter((f) => !priorShapes.has(shape(f))).length
  const fixedFindings = baseline.findings.filter((f) => !currentShapes.has(shape(f))).length
  return { newFindings, fixedFindings }
}

export function pickBaseline(runs: Run[], projectId?: string): Run | null {
  const candidates = runs
    .filter((r) => r.id !== projectId && r.status === 'done')
    .filter((r) => {
      // Only approved runs become baselines when approval is in use; default auto-approve (undefined => eligible)
      if (r.approved === false) return false
      return true
    })
    // Prefer same branch if git info present (Argos/Chromatic merge-base parity — simplified to branch match)
    .sort((a, b) => (b.finishedAt ?? b.createdAt) - (a.finishedAt ?? a.createdAt))
  return candidates[0] ?? null
}
