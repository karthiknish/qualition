/**
 * Fix-it prompt generation.
 *
 * Turns a run into instructions you can paste into an AI coding chat. The point
 * is that the receiving model gets *evidence and constraints*, not vibes: exact
 * measured numbers, the section it applies to, the registry component to reach
 * for, and an explicit instruction not to redesign things that are fine.
 */
import type { Finding, Run, Severity } from '../../shared/types.js'

const SEVERITY_ORDER: Severity[] = ['blocker', 'critical', 'major', 'minor', 'nit']

export type PromptScope = 'all' | 'critical' | 'accessibility' | 'coherence' | 'section'

export interface PromptOptions {
  scope?: PromptScope
  sectionId?: string
  pageUrl?: string
  maxFindings?: number
}

function severityRank(f: Finding): number {
  return SEVERITY_ORDER.indexOf(f.severity)
}

function selectFindings(run: Run, opts: PromptOptions): Finding[] {
  const max = opts.maxFindings ?? 40
  let list = [...run.findings]

  switch (opts.scope) {
    case 'critical':
      list = list.filter((f) => f.severity === 'blocker' || f.severity === 'critical' || f.severity === 'major')
      break
    case 'accessibility':
      list = list.filter((f) => f.category === 'accessibility')
      break
    case 'coherence':
      list = list.filter((f) => f.category === 'coherence' || f.category === 'craft' || f.category === 'variety')
      break
    case 'section':
      list = list.filter((f) => f.sectionId === opts.sectionId && (!opts.pageUrl || f.pageUrl === opts.pageUrl))
      break
  }

  return list.sort((a, b) => severityRank(a) - severityRank(b)).slice(0, max)
}

export function buildFixPrompt(run: Run, opts: PromptOptions = {}): string {
  const findings = selectFindings(run, opts)
  const scope = opts.scope ?? 'all'
  const out: string[] = []

  out.push('# UI/UX remediation brief')
  out.push('')
  out.push(
    `You are improving a shipping product. An automated audit (Qualition) crawled it in a real browser, measured the design system, exercised the controls and graded the result. Below are the verified findings. Fix them in the codebase.`
  )
  out.push('')
  out.push('## Ground rules')
  out.push(
    '- Items marked [measured] come from static analysis or from driving the UI: treat those numbers as facts.'
  )
  out.push(
    '- Items marked [review] are a design critique of screenshots. They are judgement, not measurement — confirm before acting on one.'
  )
  out.push('- Fix the cause, not the symptom: prefer one token/component change over N one-off patches.')
  out.push('- Do not redesign anything that is not listed. No new visual direction, no library swaps beyond what is suggested.')
  out.push('- Keep the existing design language; the goal is coherence and correctness, not novelty.')
  out.push('- After each change, state which finding id it resolves.')
  out.push('')

  out.push('## Context')
  out.push(`- Target: ${run.config.targetUrl}`)
  out.push(`- Pages audited: ${run.pages.map((p) => new URL(p.url).pathname || '/').join(', ') || 'n/a'}`)
  if (run.scorecard) {
    out.push(`- Overall grade: ${run.scorecard.grade} (${run.scorecard.overall}/100)`)
    out.push(
      `- Category scores: ${Object.entries(run.scorecard.categories)
        .map(([k, v]) => `${k} ${v.score}`)
        .join(', ')}`
    )
  }
  if (run.themeSummary) out.push(`- Detected design language: ${run.themeSummary.split('\n')[0]}`)

  const css = run.pages.find((p) => p.cssStats)?.cssStats
  if (css) {
    out.push(
      `- Authored CSS: ${(css.bytes / 1024).toFixed(0)}kB, ${css.rules} rules, ${css.colorsUnique} unique colours across ${css.colorsTotal} declarations (${(css.colorUniquenessRatio * 100).toFixed(0)}% uniqueness), ${css.fontSizesUnique} font sizes, ${css.radiiUnique} radii, ${css.shadowsUnique} shadows, !important on ${(css.importantRatio * 100).toFixed(1)}% of declarations, max specificity (${css.maxSpecificity}), z-index max ${css.zIndexMax}`
    )
  }
  out.push('')

  /* ------------------------------- findings ------------------------------ */
  out.push(`## Findings to fix (${findings.length}${scope === 'all' ? '' : `, scope: ${scope}`})`)
  for (const sev of SEVERITY_ORDER) {
    const group = findings.filter((f) => f.severity === sev)
    if (!group.length) continue
    out.push('')
    out.push(`### ${sev.toUpperCase()}`)
    for (const f of group) {
      const where = [f.pageUrl, f.sectionId ? `section ${f.sectionId}` : '', f.viewport ?? '', f.selector ?? '']
        .filter(Boolean)
        .join(' · ')
      out.push('')
      out.push(`**[${f.id}] ${f.title}** _(${f.category})_ ${f.source === 'ai' ? '`[review]`' : '`[measured]`'}`)
      out.push(`- Evidence: ${f.detail.replace(/\n+/g, ' ').slice(0, 500)}`)
      out.push(`- Required fix: ${f.fix}`)
      out.push(`- Where: ${where}`)
    }
  }

  /* --------------------------- component swaps --------------------------- */
  const recs =
    scope === 'section' && opts.sectionId
      ? run.recommendations.filter((r) => r.sectionId === opts.sectionId)
      : run.recommendations
  if (recs.length) {
    out.push('')
    out.push('## Suggested component replacements')
    out.push('These are real registry components. Prefer them over hand-rolled markup.')
    for (const r of recs.slice(0, 8)) {
      out.push('')
      out.push(`### ${r.sectionRole} (${r.sectionId})`)
      out.push(r.reason)
      for (const i of r.items.slice(0, 5)) out.push(`- \`${i.addCommand}\` — ${i.name}: ${i.description}`)
    }
  }

  /* ------------------------- interaction evidence ------------------------ */
  const probes = run.interactions?.filter(
    (i) => i.deadClicks.length || i.noFocusIndicator.length || i.unnamedControls.length || i.fakeButtons.length
  )
  if (probes?.length) {
    out.push('')
    out.push('## Broken interaction states (measured by driving the UI)')
    for (const p of probes.slice(0, 6)) {
      out.push('')
      out.push(`### ${p.url} (${p.viewport})`)
      if (p.deadClicks.length) out.push(`- Clicked with no observable effect: ${p.deadClicks.slice(0, 8).join(', ')}`)
      if (p.noFocusIndicator.length) out.push(`- No visible focus state: ${p.noFocusIndicator.slice(0, 8).join(', ')}`)
      if (p.noHoverFeedback.length) out.push(`- Pointer cursor but no hover feedback: ${p.noHoverFeedback.slice(0, 8).join(', ')}`)
      if (p.unnamedControls.length) out.push(`- No accessible name: ${p.unnamedControls.slice(0, 8).join(', ')}`)
      if (p.fakeButtons.length) out.push(`- Clickable but not focusable (fake buttons): ${p.fakeButtons.slice(0, 8).join(', ')}`)
      for (const o of p.overlays) {
        if (!o.escapeCloses) out.push(`- Overlay "${o.trigger}" does not close on Escape`)
        if (!o.focusMoved) out.push(`- Overlay "${o.trigger}" does not move focus into itself`)
      }
      for (const f of p.forms.filter((x) => !x.validationFeedback && x.required > 0)) {
        out.push(`- Form "${f.submitLabel || `#${f.index}`}" submits empty (${f.required} required fields) with no visible validation`)
      }
    }
  }

  /* ------------------------------- flows -------------------------------- */
  const brokenFlows = run.flows?.filter((f) => !f.ok && !f.invalid)
  if (brokenFlows?.length) {
    out.push('')
    out.push('## User journeys that break')
    for (const f of brokenFlows.slice(0, 6)) {
      const failed = f.steps.find((s) => !s.ok)
      out.push(
        `- **${f.name}** failed at step ${f.steps.filter((s) => s.ok).length + 1}: \`${failed?.step.action} ${failed?.step.target ?? ''}\` — ${failed?.error?.split('\n')[0] ?? 'unknown'}`
      )
    }
  }

  /* ------------------------------ reference ------------------------------ */
  if (run.references?.length) {
    const refs = [...new Set(run.references.map((r) => r.appName).filter(Boolean))].slice(0, 8)
    if (refs.length) {
      out.push('')
      out.push('## Reference products')
      out.push(
        `For visual/structural reference on the same section types, the audit pulled shipped UI from: ${refs.join(', ')}. Match their information hierarchy, not their branding.`
      )
    }
  }

  out.push('')
  out.push('## Output expected from you')
  out.push('1. A short plan grouping the findings into root causes (tokens, components, states, content).')
  out.push('2. The actual code changes, smallest coherent diffs first.')
  out.push('3. A list of finding ids you did NOT fix, with the reason.')

  return out.join('\n')
}
