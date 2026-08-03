/** Markdown export — the artefact you paste into a PR or a design review. */
import type { Run, Severity } from '../../shared/types.js'

const ORDER: Severity[] = ['blocker', 'critical', 'major', 'minor', 'nit']

export function renderMarkdownReport(run: Run): string {
  const s = run.scorecard
  const lines: string[] = []
  lines.push(`# Qualition audit — ${run.config.targetUrl}`)
  lines.push('')
  const duration =
    run.finishedAt != null
      ? (() => {
          const total = Math.max(0, Math.floor((run.finishedAt - run.createdAt) / 1000))
          const h = Math.floor(total / 3600)
          const m = Math.floor((total % 3600) / 60)
          const sec = total % 60
          return h > 0
            ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
            : `${m}:${String(sec).padStart(2, '0')}`
        })()
      : null
  lines.push(
    `Run \`${run.id}\` · ${new Date(run.createdAt).toLocaleString()}${duration ? ` · duration: **${duration}**` : ''} · brutality: **${run.config.brutality}** · pages: ${run.pages.length}`
  )
  lines.push('')
  if (s) {
    lines.push(`## Verdict — ${s.grade} (${s.overall}/100)`)
    lines.push('')
    lines.push(`> ${s.verdict}`)
    lines.push('')
    lines.push('| Category | Score | Findings |')
    lines.push('| --- | ---: | ---: |')
    for (const [k, v] of Object.entries(s.categories)) lines.push(`| ${k} | ${v.score} | ${v.findings} |`)
    lines.push('')
  }
  if (run.geminiNotes) {
    lines.push('## Executive read')
    lines.push('')
    lines.push(run.geminiNotes)
    lines.push('')
  }
  if (run.auth) {
    lines.push(`## Session`)
    lines.push('')
    lines.push(`${run.auth.ok ? '✅ Signed in' : '❌ Sign-in failed'} — ${run.auth.detail}`)
    lines.push('')
  }
  if (run.themeSummary) {
    lines.push('## Detected design language')
    lines.push('')
    lines.push(run.themeSummary)
    lines.push('')
  }

  const withCss = run.pages.filter((p) => p.cssStats)
  if (withCss.length) {
    lines.push('## Authored CSS (Project Wallace)')
    lines.push('')
    lines.push('| Page | Size | App/FW | Rules | Colour reuse | Font sizes | Radii | Shadows | !important | Max spec | z-index | Maint./Cplx |')
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
    for (const p of withCss) {
      const c = p.cssStats!
      const a = c.attribution
      const split = a
        ? `${(a.appBytes / 1024).toFixed(0)}/${(((a.frameworkBytes + a.vendorBytes) / 1024)).toFixed(0)}kB${a.scoped ? '' : '*'}`
        : '—'
      lines.push(
        `| ${new URL(p.url).pathname || '/'} | ${(c.bytes / 1024).toFixed(0)} kB | ${split} | ${c.rules} | ${c.colorsUnique}/${c.colorsTotal} (${(c.colorUniquenessRatio * 100).toFixed(0)}%) | ${c.fontSizesUnique} | ${c.radiiUnique} | ${c.shadowsUnique} | ${(c.importantRatio * 100).toFixed(1)}% | (${c.maxSpecificity}) | ${c.zIndexMax} | ${c.quality.maintainability}/${c.quality.complexity} |`
      )
    }
    lines.push('')
  }

  if (run.lighthouse) {
    const s = run.lighthouse
    const pct = (n: number | null): string => (n == null ? '—' : String(Math.round(n * 100)))
    lines.push('## Lighthouse')
    lines.push('')
    lines.push(`| Perf | A11y | Best practices | SEO |`)
    lines.push(`| ---: | ---: | ---: | ---: |`)
    lines.push(`| ${pct(s.performance)} | ${pct(s.accessibility)} | ${pct(s.bestPractices)} | ${pct(s.seo)} |`)
    lines.push('')
  }

  const withTokens = run.pages.filter((p) => p.tokenDictionary && p.tokenDictionary.count > 0)
  if (withTokens.length) {
    lines.push('## Design tokens (Style Dictionary)')
    lines.push('')
    lines.push('| Page | Tokens | FW skipped | Colours | Spacing | Type | Radii | Shadows |')
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
    for (const p of withTokens) {
      const t = p.tokenDictionary!
      lines.push(
        `| ${new URL(p.url).pathname || '/'} | ${t.count} | ${t.frameworkCount ?? 0} | ${t.groups.colors} | ${t.groups.spacing} | ${t.groups.typography} | ${t.groups.radii} | ${t.groups.shadows} |`
      )
    }
    lines.push('')
  }

  if (run.visualDiffs?.length) {
    lines.push('## Visual regression')
    lines.push('')
    lines.push(`Baseline: run \`${run.visualDiffs[0].baselineRunId}\``)
    lines.push('')
    for (const d of [...run.visualDiffs].sort((a, b) => b.changedRatio - a.changedRatio)) {
      lines.push(`- **${(d.changedRatio * 100).toFixed(1)}%** changed · ${d.viewport} · ${d.url}${d.diffImage ? ` — \`${d.diffImage}\`` : ''}`)
    }
    lines.push('')
  }

  if (run.interactions?.length) {
    lines.push('## Interaction probe')
    lines.push('')
    lines.push('Controls were actually hovered, focused, keyboard-driven and safely clicked.')
    lines.push('')
    lines.push('| Page | Probed | Dead clicks | No focus ring | No hover | Unnamed | Fake buttons | Tab stops |')
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
    for (const r of run.interactions) {
      lines.push(
        `| ${new URL(r.url).pathname || '/'} | ${r.controlsProbed} | ${r.deadClicks.length} | ${r.noFocusIndicator.length} | ${r.noHoverFeedback.length} | ${r.unnamedControls.length} | ${r.fakeButtons.length} | ${r.keyboard.tabStops} |`
      )
    }
    lines.push('')
    for (const r of run.interactions) {
      if (r.deadClicks.length) lines.push(`- Dead clicks on ${r.url}: ${r.deadClicks.map((x) => `\`${x}\``).join(', ')}`)
      if (r.noFocusIndicator.length)
        lines.push(`- No focus ring on ${r.url}: ${r.noFocusIndicator.map((x) => `\`${x}\``).join(', ')}`)
      for (const o of r.overlays)
        lines.push(`- Overlay "${o.trigger}": escape ${o.escapeCloses ? 'closes' : '**does not close**'}, focus ${o.focusMoved ? 'moves in' : '**stays behind**'}`)
      for (const f of r.forms)
        lines.push(`- Form "${f.submitLabel || `#${f.index}`}" (${f.required}/${f.fields} required): ${f.validationFeedback ? 'shows validation' : '**submits silently**'}`)
    }
    lines.push('')
  }

  lines.push('## Findings')
  for (const sev of ORDER) {
    const list = run.findings.filter((f) => f.severity === sev)
    if (!list.length) continue
    lines.push('')
    lines.push(`### ${sev.toUpperCase()} (${list.length})`)
    for (const f of list) {
      lines.push('')
      lines.push(`- **${f.title}** \`${f.category}\` · ${f.source}${f.sectionId ? ` · section ${f.sectionId}` : ''}${f.viewport ? ` · ${f.viewport}` : ''}`)
      lines.push(`  - ${f.detail.replace(/\n/g, '\n    ')}`)
      lines.push(`  - **Fix:** ${f.fix}`)
      lines.push(`  - ${f.pageUrl}`)
    }
  }

  if (run.recommendations.length) {
    lines.push('')
    lines.push('## Component replacements (Shoogle community registries → shadcn fallback)')
    for (const r of run.recommendations) {
      lines.push('')
      lines.push(`### ${r.sectionRole} — ${r.sectionId}`)
      lines.push(r.reason)
      lines.push('')
      for (const i of r.items)
        lines.push(`- \`${i.addCommand}\` — ${i.name} [${i.source}${i.registry ? ` ${i.registry}` : ''}]: ${i.description}`)
    }
  }

  if (run.references.length) {
    lines.push('')
    lines.push('## Reference UI (Mobbin)')
    for (const ref of run.references) {
      lines.push(`- [${ref.appName ?? ref.title}](${ref.mobbinUrl ?? ''}) — _${ref.query}_`)
    }
  }

  if (run.flows.length) {
    lines.push('')
    lines.push('## Flow results')
    for (const f of run.flows) {
      lines.push('')
      lines.push(`### ${f.name} — ${f.ok ? 'PASS' : 'FAIL'} (${f.totalMs}ms)`)
      for (const st of f.steps)
        lines.push(`- ${st.ok ? '✅' : '❌'} \`${st.step.action}\` ${st.step.target ?? ''} ${st.error ? `— ${st.error}` : ''}`)
    }
  }
  return lines.join('\n')
}
