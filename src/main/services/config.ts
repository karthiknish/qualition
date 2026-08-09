/** .qualitionrc.json — per-project rule toggles (like .hintrc / .lighthouserc). */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { app } from 'electron'

export interface QualitionRc {
  /** Disable specific heuristic categories entirely. */
  disableCategories?: string[]
  /** Disable specific finding title substrings (case-insensitive). */
  ignoreTitles?: string[]
  /** Override thresholds (e.g. { "purpleUsage": 24, "sideTabBorders": 5 }). */
  thresholds?: Record<string, number>
  /** Visual regression: threshold 0..1 (default 0.02) and selectors to hide before diff. */
  visual?: { diffThreshold?: number; ignoreSelectors?: string[] }
  /** Budget gates: fail run (non-zero exit in CLI) when violated. e.g. { "maxFindings": { "blocker": 0 } } */
  budgets?: {
    maxFindings?: Record<string, number>
    minScore?: number
    metrics?: {
      maxLcpMs?: number
      maxCls?: number
      maxTbtMs?: number
      maxFcpMs?: number
      maxTransferBytes?: number
      minLighthousePerformance?: number
      minLighthouseAccessibility?: number
      minLighthouseBestPractices?: number
      minLighthouseSeo?: number
    }
    perCategory?: Record<string, number>
  }
  /** Reference branch/commit overrides (Argos/Percy parity: ARGOS_REFERENCE_BRANCH etc.). */
  baseline?: { referenceBranch?: string; referenceCommit?: string; autoApproveBranch?: string }
  /** Approve main automatically (Chromatic autoAcceptChanges parity). */
  approvals?: { autoApprove?: boolean; autoApproveBranches?: string[] }
  /** Number of runs to median for flaky metrics (LHCI numberOfRuns). */
  runs?: { numberOfRuns?: number }
}

const RC_NAMES = ['.qualitionrc.json', '.qualitionrc', 'qualition.config.json']

export async function loadQualitionRc(cwd?: string): Promise<{ rc: QualitionRc | null; path: string | null }> {
  const dirs: string[] = []
  if (cwd) dirs.push(cwd)
  try {
    dirs.push(app.getPath('userData'))
  } catch {}
  dirs.push(process.cwd())
  for (const dir of dirs) {
    for (const name of RC_NAMES) {
      const p = join(dir, name)
      if (existsSync(p)) {
        try {
          const raw = JSON.parse(await readFile(p, 'utf8')) as QualitionRc
          return { rc: raw, path: p }
        } catch {}
      }
    }
  }
  return { rc: null, path: null }
}

export function shouldSuppressFinding(rc: QualitionRc | null, finding: { category: string; title: string }): boolean {
  if (!rc) return false
  if (rc.disableCategories?.includes(finding.category)) return true
  if (rc.ignoreTitles?.some((t) => finding.title.toLowerCase().includes(t.toLowerCase()))) return true
  return false
}

export function visualThreshold(rc: QualitionRc | null): number | undefined {
  if (rc?.visual?.diffThreshold != null) {
    const v = Number(rc.visual.diffThreshold)
    if (Number.isFinite(v) && v >= 0 && v <= 1) return v
  }
  if (rc?.thresholds?.visualDiffThreshold != null) {
    const v = Number(rc.thresholds.visualDiffThreshold)
    if (Number.isFinite(v) && v >= 0 && v <= 1) return v
  }
  return undefined
}

export function visualIgnoreSelectors(rc: QualitionRc | null): string[] {
  const a = rc?.visual?.ignoreSelectors ?? []
  return Array.isArray(a) ? a.filter((s) => typeof s === 'string' && s.trim()).slice(0, 20) : []
}
