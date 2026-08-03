import type { QualitionApi } from '../../../preload/index'

declare global {
  interface Window {
    qualition: QualitionApi
  }
}

export const api = window.qualition

export const SEVERITY_COLOR: Record<string, string> = {
  blocker: 'bg-red-500/15 text-red-300 border-red-500/40',
  critical: 'bg-orange-500/15 text-orange-300 border-orange-500/40',
  major: 'bg-amber-500/15 text-amber-200 border-amber-500/40',
  minor: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  nit: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/40'
}

export const CATEGORY_LABEL: Record<string, string> = {
  coherence: 'Theme coherence',
  variety: 'Variety & rhythm',
  accessibility: 'Accessibility',
  responsive: 'Responsive',
  flow: 'Flow & runtime',
  performance: 'Performance',
  content: 'Content',
  craft: 'Craft'
}

export function gradeColor(score: number): string {
  if (score >= 85) return 'text-emerald-400'
  if (score >= 70) return 'text-lime-400'
  if (score >= 55) return 'text-amber-400'
  if (score >= 40) return 'text-orange-400'
  return 'text-red-400'
}

export function cx(...parts: (string | false | undefined | null)[]): string {
  return parts.filter(Boolean).join(' ')
}

/** Elapsed run time as `m:ss` or `h:mm:ss`. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
