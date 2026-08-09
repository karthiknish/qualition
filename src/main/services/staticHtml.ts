/** Static HTML artifact for CI (`--out ./report`). */
import type { Run } from '../../shared/types.js'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderHtmlReport(run: Run): string {
  const s = run.scorecard
  const cats = s ? Object.entries(s.categories).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.score}</td><td>${v.findings}</td></tr>`).join('') : ''
  const findings = run.findings
    .slice()
    .sort((a, b) => ({ blocker: 0, critical: 1, major: 2, minor: 3, nit: 4 }[a.severity] - { blocker: 0, critical: 1, major: 2, minor: 3, nit: 4 }[b.severity]))
    .map((f) => `<tr><td><span class="pill ${esc(f.severity)}">${esc(f.severity)}</span></td><td>${esc(f.category)}</td><td><strong>${esc(f.title)}</strong><div class="muted">${esc(f.detail).replace(/\n/g, '<br>')}</div><div class="fix">Fix: ${esc(f.fix)}</div><div class="muted">${esc(f.pageUrl)}${f.selector ? ` · ${esc(f.selector)}` : ''}</div></td></tr>`)
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Qualition — ${esc(run.config.targetUrl)}</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui;background:#09090b;color:#e4e4e7}
  header{padding:24px 28px;border-bottom:1px solid #27272a;background:#18181b;position:sticky;top:0}
  h1{margin:0;font-size:18px}h2{margin:28px 0 12px;font-size:15px;color:#fafafa}
  .wrap{max-width:1100px;margin:0 auto;padding:0 28px 40px}
  table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:8px 10px;border:1px solid #27272a;text-align:left;vertical-align:top}
  th{background:#18181b;color:#a1a1aa}
  .pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;border:1px solid #27272a}
  .pill.blocker,.pill.critical{background:#ef444420;color:#fca5a5;border-color:#ef444440}
  .pill.major{background:#f59e0b20;color:#fde68a;border-color:#f59e0b40}
  .pill.minor{background:#0ea5e920;color:#7dd3fc;border-color:#0ea5e940}
  .pill.nit{background:#71717a20;color:#d4d4d8}
  .muted{color:#a1a1aa;font-size:12px;margin-top:4px}.fix{margin-top:6px;color:#d4d4d8}
  .kpi{display:inline-flex;align-items:baseline;gap:10px;padding:10px 14px;border:1px solid #27272a;border-radius:12px;background:#18181b;margin-right:8px}
  .grade{font-size:22px;font-weight:700}code{background:#27272a;padding:1px 6px;border-radius:6px;font-size:12px}
  </style></head><body><header><h1>Qualition audit — ${esc(run.config.targetUrl)}</h1><div class="muted">Run <code>${esc(run.id)}</code> · ${new Date(run.createdAt).toLocaleString()} · brutality <strong>${esc(run.config.brutality)}</strong> · ${run.pages.length} pages</div></header><div class="wrap">
  ${s ? `<h2>Verdict — ${esc(s.grade)} (${s.overall}/100)</h2><div class="kpi"><span class="grade">${esc(s.grade)}</span><span>${s.overall}/100</span></div><p class="muted">${esc(s.verdict)}</p><table><tr><th>Category</th><th>Score</th><th>Findings</th></tr>${cats}</table>` : ''}
  ${run.themeSummary ? `<h2>Design language</h2><pre style="white-space:pre-wrap;background:#18181b;border:1px solid #27272a;padding:12px;border-radius:12px">${esc(run.themeSummary)}</pre>` : ''}
  ${run.lighthouse ? `<h2>Lighthouse</h2><table><tr><th>Perf</th><th>A11y</th><th>Best practices</th><th>SEO</th></tr><tr><td>${run.lighthouse.performance==null?'—':Math.round(run.lighthouse.performance*100)}</td><td>${run.lighthouse.accessibility==null?'—':Math.round(run.lighthouse.accessibility*100)}</td><td>${run.lighthouse.bestPractices==null?'—':Math.round(run.lighthouse.bestPractices*100)}</td><td>${run.lighthouse.seo==null?'—':Math.round(run.lighthouse.seo*100)}</td></tr></table>` : ''}
  ${run.diffSummary ? `<h2>Diff vs baseline <code>${esc(run.diffSummary.baselineRunId)}</code></h2><p class="muted">${run.diffSummary.changedPages} changed / ${run.diffSummary.unchangedPages} unchanged / ${run.diffSummary.newPages} new / ${run.diffSummary.removedPages} removed</p>` : ''}
  <h2>Findings (${run.findings.length})</h2><table><tr><th>Severity</th><th>Category</th><th>Detail</th></tr>${findings || '<tr><td colspan=3 class="muted">No findings</td></tr>'}</table>
  ${run.visualDiffs?.length ? `<h2>Visual regression — baseline <code>${esc(run.visualDiffs[0].baselineRunId)}</code></h2><ul>${run.visualDiffs.map((d)=>`<li>${(d.changedRatio*100).toFixed(1)}% · ${esc(d.viewport)} · ${esc(d.url)}</li>`).join('')}</ul>` : ''}
  </div></body></html>`
}
