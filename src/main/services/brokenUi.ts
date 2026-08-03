/**
 * Detect broken / not-found / overflow UI that HTTP 200 + empty-state chrome
 * otherwise hides from the audit.
 */
import type { CapturedPage, Finding, Severity } from '../../shared/types.js'
import { isDetailPath } from './componentGaps.js'

/** Soft-404 / missing-record copy that renders inside a 200 OK shell. */
export const SOFT_404_RE =
  /\b(not found|no [^\n.]{0,40} at this address|does(?:\s*not|n't) exist|page not found|could(?:\s*not|n't) find|nothing (here|to show)|no longer available|unknown (run|record|item|id|trace|task)|invalid (run|id|link|url)|was deleted|has been removed|no (run|record|task|item|trace|agent|page) (here|found|at|with)|can't find|cannot find|not on this desk|is not on this)\b/i

export function looksLikeSoft404(text: string): boolean {
  return SOFT_404_RE.test(String(text || ''))
}

export interface BrokenUiSignals {
  soft404: boolean
  soft404Evidence?: string
  clippedTextNodes: number
  overlappingTextPairs: number
  mainContentChars: number
}

let counter = 0
function mk(
  page: CapturedPage,
  category: Finding['category'],
  severity: Severity,
  title: string,
  detail: string,
  fix: string,
  extra: Partial<Finding> = {}
): Finding {
  return {
    id: `brk${++counter}`,
    category,
    severity,
    title,
    detail,
    fix,
    pageUrl: page.url,
    source: 'heuristic',
    ...extra
  }
}

export function brokenUiFromSignals(page: CapturedPage): BrokenUiSignals | null {
  const raw = (page.signals as { brokenUi?: BrokenUiSignals } | undefined)?.brokenUi
  return raw ?? null
}

/** Heuristic findings for soft-404 shells and clipped / colliding text. */
function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

export function auditBrokenUi(page: CapturedPage): Finding[] {
  const out: Finding[] = []
  const broken = brokenUiFromSignals(page)
  if (!broken) {
    // Fall back to section / title text when older captures lack the signal.
    const blob = [
      page.title,
      ...page.sections.map((s) => `${s.label} ${s.headings.join(' ')} ${s.textPreview}`)
    ].join('\n')
    if (looksLikeSoft404(blob)) {
      const detail = isDetailPath(pathnameOf(page.url))
      out.push(
        mk(
          page,
          'flow',
          detail ? 'critical' : 'major',
          detail ? 'Detail route renders a not-found / missing-record state' : 'Page reads as not-found',
          `Copy matches a soft-404 pattern while HTTP still succeeded${detail ? ' on an ID/detail URL' : ''}.`,
          'Fix the link, seed, or loader that produced this URL — or return a real HTTP 404. A green empty-state shell is still a broken journey.',
          { effort: 'component', confidence: 'high' }
        )
      )
    }
    return out
  }

  if (broken.soft404) {
    const detail = isDetailPath(pathnameOf(page.url))
    out.push(
      mk(
        page,
        'flow',
        detail ? 'critical' : 'major',
        detail ? 'Detail route renders a not-found / missing-record state' : 'Page reads as not-found',
        `${broken.soft404Evidence ? `Evidence: “${broken.soft404Evidence.slice(0, 120)}”. ` : ''}Main content is a missing-record shell (${broken.mainContentChars} chars) — the crawl got HTTP 200, so this would otherwise look “fine”.`,
        'Fix routing, data seeding, or stale links that open dead IDs. Prefer a hard 404 or a recovery path that restores a real record — not a quiet empty card inside the app chrome.',
        { effort: 'component', confidence: 'high' }
      )
    )
  }

  if (broken.clippedTextNodes >= 3) {
    out.push(
      mk(
        page,
        'craft',
        broken.clippedTextNodes >= 8 ? 'critical' : 'major',
        `${broken.clippedTextNodes} text node(s) clipped or overflowing their boxes`,
        'Labels, timestamps, or step names are cut off (scrollWidth/Height exceeds the box). Users cannot read the UI — this is broken layout, not a polish nit.',
        'Widen the column, allow wrap, or drop lower-priority columns. Never truncate operational labels without a tooltip that shows the full value.',
        { effort: 'component', confidence: 'high' }
      )
    )
  }

  if (broken.overlappingTextPairs >= 2) {
    out.push(
      mk(
        page,
        'craft',
        broken.overlappingTextPairs >= 6 ? 'critical' : 'major',
        `${broken.overlappingTextPairs} overlapping text pairs`,
        'Text nodes physically collide — timelines, axis labels, and dense headers often stack on top of each other.',
        'Give each label its own row or lane; stop absolute-stacking timestamps into a width that cannot fit them.',
        { effort: 'component', confidence: 'high' }
      )
    )
  }

  return out
}

/** Boost pages that must enter the AI critique budget even with few other findings. */
export function brokenUiCritiqueBoost(page: CapturedPage): number {
  const b = brokenUiFromSignals(page)
  const polish = (page.signals as { polish?: { stuckLoading?: boolean; connectingCopy?: boolean; skeletonCount?: number } } | undefined)
    ?.polish
  let score = 0
  if (polish?.stuckLoading || (polish?.connectingCopy && (polish.skeletonCount ?? 0) >= 4)) score += 400
  else if ((polish?.skeletonCount ?? 0) >= 10) score += 120
  if (!b) {
    const blob = [page.title, ...page.sections.map((s) => s.headings.join(' ') + s.textPreview)].join(' ')
    if (looksLikeSoft404(blob)) score += 500
    return score
  }
  if (b.soft404) score += 500
  if (b.clippedTextNodes >= 3) score += 80 + b.clippedTextNodes
  if (b.overlappingTextPairs >= 2) score += 60 + b.overlappingTextPairs
  return score
}

/** Specimen / kit routes soak critique budget without representing product UX. */
const KIT_PATH_RE =
  /\/(ui-kit|desk-kit|primitives|foundation|charts|styleguide|storybook|components|tokens|sandbox|gallery)(\/|$)/i

export function isKitSpecimenPath(url: string): boolean {
  try {
    return KIT_PATH_RE.test(new URL(url).pathname)
  } catch {
    return KIT_PATH_RE.test(url)
  }
}

/** Score used to pick which pages get AI critique (higher = sooner). */
export function critiquePriorityScore(page: CapturedPage, findingCount: number): number {
  let score = findingCount + brokenUiCritiqueBoost(page)
  if (isKitSpecimenPath(page.url)) score -= 220
  try {
    const depth = new URL(page.url).pathname.split('/').filter(Boolean).length
    if (depth >= 2) score += 15
  } catch {
    /* ignore */
  }
  return score
}

/** Score used to pick interaction-probe targets. */
export function interactionProbeScore(page: CapturedPage): number {
  let score = brokenUiCritiqueBoost(page)
  try {
    const parts = new URL(page.url).pathname.split('/').filter(Boolean)
    score += parts.length * 12
    // Prefer real product lists over kit pages.
    if (parts.length === 1 && !isKitSpecimenPath(page.url)) score += 40
  } catch {
    /* ignore */
  }
  if (isKitSpecimenPath(page.url)) score -= 100
  const controls = page.controls?.length ?? 0
  score += Math.min(30, Math.floor(controls / 3))
  return score
}
