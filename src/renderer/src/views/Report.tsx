import { useMemo, useState } from 'react'
import type { CapturedPage, Finding, Run, RunProgress, Severity } from '../../../shared/types'
import { api, CATEGORY_LABEL, cx, gradeColor, SEVERITY_COLOR } from '../lib/api'
import { Badge, Bar, Button, Chip, Empty, Panel } from '../components/ui'

type Tab =
  | 'overview'
  | 'findings'
  | 'replace'
  | 'screens'
  | 'sections'
  | 'interactions'
  | 'flows'
  | 'tokens'
  | 'diffs'
  | 'log'
const TABS: Tab[] = [
  'overview',
  'findings',
  'replace',
  'screens',
  'sections',
  'interactions',
  'flows',
  'tokens',
  'diffs',
  'log'
]
const SEV_ORDER: Severity[] = ['blocker', 'critical', 'major', 'minor', 'nit']

export default function Report({ run, progress }: { run: Run | null; progress: RunProgress | null }): JSX.Element {
  const [tab, setTab] = useState<Tab>('overview')
  const [sevFilter, setSevFilter] = useState<Severity | 'all'>('all')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [pageIdx, setPageIdx] = useState(0)

  if (!run) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <Empty title="No run selected">Open a run from History, or start a new audit.</Empty>
      </div>
    )
  }

  const page: CapturedPage | undefined = run.pages[pageIdx]
  const findings = run.findings
    .filter((f) => sevFilter === 'all' || f.severity === sevFilter)
    .filter((f) => catFilter === 'all' || f.category === catFilter)
    .sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity))

  const statusBadge =
    run.status === 'done'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : run.status === 'running' || run.status === 'queued'
        ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
        : run.status === 'failed'
          ? 'border-red-500/30 bg-red-500/10 text-red-300'
          : run.status === 'cancelled'
            ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            : 'border-zinc-700 bg-zinc-800 text-zinc-400'

  return (
    <div className="space-y-5 px-6 py-8">
      <header className="animate-fade-up flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Report</p>
          <h1 className="truncate text-[22px] font-semibold tracking-tight text-zinc-50">{run.config.targetUrl}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-zinc-500">
            <Badge className={statusBadge}>{run.status}</Badge>
            <span className="tabular-nums text-zinc-600">{run.id}</span>
            <span className="text-zinc-700">·</span>
            <span>
              {run.pages.length} page{run.pages.length === 1 ? '' : 's'}
            </span>
            <span className="text-zinc-700">·</span>
            <span>{run.findings.length} findings</span>
            <span className="text-zinc-700">·</span>
            <span className="capitalize">{run.config.brutality}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <CopyPrompt runId={run.id} />
          <Button size="sm" onClick={() => api.exportRun(run.id)}>
            Export markdown
          </Button>
          <Button size="sm" variant="ghost" onClick={() => api.revealRun(run.id)}>
            Open files
          </Button>
        </div>
      </header>

      {(run.status === 'running' || run.status === 'queued') && progress && (
        <div className="rounded-2xl border border-sky-500/25 bg-sky-500/5 px-4 py-3">
          <div className="flex items-center justify-between gap-3 text-[12px]">
            <span className="flex items-center gap-2 text-sky-200">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-sky-400" />
              {progress.phase}
            </span>
            <span className="tabular-nums text-zinc-400">{progress.pct}%</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-sky-400 transition-all duration-300"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
          <p className="mt-2 text-[12px] leading-snug text-zinc-500">{progress.msg}</p>
        </div>
      )}

      {run.error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">
          {run.error}
        </div>
      )}

      <nav className="sticky top-0 z-10 -mx-6 border-b border-zinc-800/80 bg-zinc-950/85 px-6 backdrop-blur-md">
        <div className="flex gap-0.5 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cx(
                '-mb-px shrink-0 border-b-2 px-3 py-2.5 text-[13px] capitalize transition-colors',
                tab === t
                  ? 'border-zinc-100 text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </nav>

      {tab === 'overview' && <Overview run={run} />}

      {tab === 'findings' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <Chip active={sevFilter === 'all'} onClick={() => setSevFilter('all')}>
              all severities
            </Chip>
            {SEV_ORDER.map((s) => (
              <Chip key={s} active={sevFilter === s} onClick={() => setSevFilter(s)}>
                {s} ({run.findings.filter((f) => f.severity === s).length})
              </Chip>
            ))}
            <span className="mx-1 w-px self-stretch bg-zinc-800" />
            <Chip active={catFilter === 'all'} onClick={() => setCatFilter('all')}>
              all categories
            </Chip>
            {Object.keys(CATEGORY_LABEL).map((c) => (
              <Chip key={c} active={catFilter === c} onClick={() => setCatFilter(c)}>
                {c} ({run.findings.filter((f) => f.category === c).length})
              </Chip>
            ))}
          </div>
          {findings.length === 0 ? (
            <Empty title="Nothing matches">Try clearing a severity or category filter.</Empty>
          ) : (
            findings.map((f) => <FindingCard key={f.id} f={f} />)
          )}
        </div>
      )}

      {tab === 'sections' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {run.pages.map((p, i) => (
              <Chip key={p.url} active={i === pageIdx} onClick={() => setPageIdx(i)}>
                {new URL(p.url).pathname || '/'}
              </Chip>
            ))}
          </div>
          {!page ? <Empty title="No pages captured">Wait for the crawl to finish.</Empty> : <Sections run={run} page={page} />}
        </div>
      )}

      {tab === 'replace' && <Replace run={run} />}
      {tab === 'screens' && <Screens run={run} />}
      {tab === 'interactions' && <Interactions run={run} />}
      {tab === 'flows' && <Flows run={run} />}
      {tab === 'tokens' && page && <Tokens page={page} />}
      {tab === 'diffs' && <Diffs run={run} />}
      {tab === 'log' && (
        <Panel title="Log">
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-zinc-400">
            {run.log.map((l) => `${new Date(l.ts).toLocaleTimeString()}  [${l.level}] ${l.msg}`).join('\n')}
          </pre>
        </Panel>
      )}
    </div>
  )
}

const PROMPT_SCOPES: { id: 'all' | 'critical' | 'accessibility' | 'coherence'; label: string; hint: string }[] = [
  { id: 'critical', label: 'Blockers first', hint: 'blocker + critical + major only' },
  { id: 'all', label: 'Everything', hint: 'the full finding list' },
  { id: 'accessibility', label: 'Accessibility', hint: 'a11y findings only' },
  { id: 'coherence', label: 'Design system', hint: 'coherence, craft and variety' }
]

/**
 * Copies a paste-ready brief for an AI coding chat: measured evidence, required
 * fixes, component swaps and explicit "do not redesign the rest" constraints.
 */
function CopyPrompt({ runId, sectionId, label = 'Copy fix prompt' }: { runId: string; sectionId?: string; label?: string }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (scope: 'all' | 'critical' | 'accessibility' | 'coherence' | 'section'): Promise<void> => {
    const text = await api.buildPrompt(runId, { scope, sectionId })
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(`${(text.length / 1000).toFixed(1)}k chars copied`)
    setOpen(false)
    setTimeout(() => setCopied(null), 2600)
  }

  if (sectionId) {
    return (
      <button
        onClick={() => copy('section')}
        className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
        title="Copy an AI prompt to fix just this section"
      >
        {copied ? '✓ copied' : label}
      </button>
    )
  }

  return (
    <div className="relative">
      <Button size="sm" variant="primary" onClick={() => setOpen(!open)}>
        {copied ?? label}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
            {PROMPT_SCOPES.map((s) => (
              <button
                key={s.id}
                onClick={() => copy(s.id)}
                className="block w-full px-3 py-2 text-left hover:bg-zinc-800"
              >
                <span className="block text-[12px] text-zinc-100">{s.label}</span>
                <span className="block text-[10px] text-zinc-500">{s.hint}</span>
              </button>
            ))}
            <p className="border-t border-zinc-800 px-3 py-2 text-[10px] leading-snug text-zinc-600">
              Paste into Claude, Cursor or ChatGPT. Includes measured evidence, required fixes, component add-commands
              and a rule not to redesign anything else.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

function Overview({ run }: { run: Run }): JSX.Element {
  const s = run.scorecard
  const worstPages = useMemo(() => {
    const map = new Map<string, number>()
    for (const f of run.findings) map.set(f.pageUrl, (map.get(f.pageUrl) ?? 0) + 1)
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [run.findings])

  return (
    <div className="grid grid-cols-3 gap-4">
      <Panel className="col-span-1" title="Score">
        {s ? (
          <div>
            <div className="flex items-baseline gap-3">
              <span className={cx('text-5xl font-semibold', gradeColor(s.overall))}>{s.grade}</span>
              <span className="text-2xl tabular-nums text-zinc-400">{s.overall}<span className="text-sm text-zinc-600">/100</span></span>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-zinc-300">{s.verdict}</p>
            <div className="mt-4 space-y-2">
              {Object.entries(s.categories).map(([k, v]) => (
                <div key={k}>
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>{CATEGORY_LABEL[k] ?? k}</span>
                    <span className="tabular-nums">{v.score} · {v.findings}</span>
                  </div>
                  <Bar
                    value={v.score}
                    className={v.score >= 80 ? 'bg-emerald-500' : v.score >= 60 ? 'bg-amber-500' : 'bg-red-500'}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Empty>Scoring pending.</Empty>
        )}
      </Panel>

      <div className="col-span-2 space-y-4">
        {run.lighthouse && (
          <Panel title="Lighthouse">
            <div className="grid grid-cols-4 gap-3">
              {(
                [
                  ['Perf', run.lighthouse.performance],
                  ['A11y', run.lighthouse.accessibility],
                  ['Best practices', run.lighthouse.bestPractices],
                  ['SEO', run.lighthouse.seo]
                ] as const
              ).map(([label, score]) => (
                <div key={label}>
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
                  <div
                    className={cx(
                      'mt-1 text-2xl tabular-nums font-semibold',
                      score == null
                        ? 'text-zinc-600'
                        : score >= 0.9
                          ? 'text-emerald-400'
                          : score >= 0.5
                            ? 'text-amber-400'
                            : 'text-red-400'
                    )}
                  >
                    {score == null ? '—' : Math.round(score * 100)}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}
        {run.geminiNotes && (
          <Panel title="Executive read · Gemini">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-200">{run.geminiNotes}</p>
          </Panel>
        )}
        {run.themeSummary && (
          <Panel title="Detected design language">
            <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-400">{run.themeSummary}</p>
          </Panel>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Panel title="Worst pages">
            <ul className="space-y-1.5">
              {worstPages.map(([url, n]) => (
                <li key={url} className="flex items-center justify-between gap-3 text-[12px]">
                  <span className="truncate text-zinc-300">{url}</span>
                  <span className="shrink-0 tabular-nums text-zinc-500">{n}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Runtime">
            {run.pages.map((p) => (
              <div key={p.url} className="mb-2 text-[11px] text-zinc-400">
                <div className="truncate text-zinc-300">{new URL(p.url).pathname || '/'}</div>
                <div className="tabular-nums text-zinc-500">
                  LCP {p.metrics.lcpMs ?? '–'}ms · CLS {p.metrics.cls?.toFixed(3) ?? '–'} ·{' '}
                  {(p.metrics.transferBytes / 1e6).toFixed(1)}MB · {p.metrics.requestCount} reqs ·{' '}
                  {p.consoleErrors.length} console errors
                </div>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  )
}

function Sections({ run, page }: { run: Run; page: CapturedPage }): JSX.Element {
  const [zoom, setZoom] = useState<{ src: string; label: string; link?: string } | null>(null)
  return (
    <div className="space-y-4">
      <Lightbox shot={zoom} onClose={() => setZoom(null)} />
      {page.sections.map((s) => {
        const findings = run.findings.filter((f) => f.sectionId === s.id && f.pageUrl === page.url)
        const rec = run.recommendations.find((r) => r.sectionId === s.id)
        const refs = run.references.filter((r) => r.sectionId === s.id).slice(0, 4)
        return (
          <Panel
            key={s.id}
            title={
              <span className="flex items-center gap-2">
                <Badge>{s.role}</Badge>
                <span className="text-zinc-200">{s.label}</span>
                <span className="text-[11px] text-zinc-600">{s.rect.width}×{s.rect.height}</span>
              </span>
            }
            right={
              <span className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-500">{findings.length} findings</span>
                <CopyPrompt runId={run.id} sectionId={s.id} label="copy fix prompt" />
              </span>
            }
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                {s.screenshot ? (
                  <img
                    src={api.asset(s.screenshot)}
                    alt={s.label}
                    onClick={() => setZoom({ src: s.screenshot!, label: `${s.role} — ${s.label}` })}
                    className="max-h-72 w-full cursor-zoom-in rounded-lg border border-zinc-800 object-cover object-top hover:border-zinc-600"
                  />
                ) : (
                  <div className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-[11px] text-zinc-600">
                    no section capture
                  </div>
                )}
                <p className="text-[11px] leading-snug text-zinc-500">
                  {s.stats.interactiveCount} interactive · {s.stats.imageCount} media · {s.stats.distinctFontSizes} type sizes ·{' '}
                  {s.stats.distinctBgColors} surfaces · max measure {s.stats.maxTextWidthPx}px
                </p>
                <code className="block truncate text-[10px] text-zinc-600">{s.selector}</code>
              </div>

              <div className="space-y-3">
                {findings.length > 0 && (
                  <div className="space-y-1.5">
                    {findings.slice(0, 6).map((f) => (
                      <div key={f.id} className="rounded-md border border-zinc-800 bg-zinc-950/60 p-2">
                        <div className="flex items-center gap-2">
                          <Badge className={SEVERITY_COLOR[f.severity]}>{f.severity}</Badge>
                          <span className="text-[12px] text-zinc-200">{f.title}</span>
                        </div>
                        <p className="mt-1 text-[11px] leading-snug text-zinc-500">{f.fix}</p>
                      </div>
                    ))}
                  </div>
                )}

                {refs.length > 0 && (
                  <div>
                    <h4 className="mb-1.5 text-[11px] uppercase tracking-wider text-zinc-500">Reference UI · Mobbin</h4>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {refs.map((r, i) => (
                        <button
                          key={i}
                          onClick={() =>
                            r.imageUrl &&
                            setZoom({ src: r.imageUrl, label: `${r.appName ?? r.title} — ${r.query}`, link: r.mobbinUrl })
                          }
                          className="w-28 shrink-0 text-left"
                          title={`${r.query} — click to enlarge`}
                        >
                          {r.imageUrl && (
                            <img
                              src={r.imageUrl.startsWith('http') ? r.imageUrl : api.asset(r.imageUrl)}
                              alt={r.title}
                              className="h-24 w-28 rounded-md border border-zinc-800 object-cover object-top"
                            />
                          )}
                          <span className="mt-1 block truncate text-[10px] text-zinc-500">{r.appName ?? r.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {rec && (
                  <div>
                    <h4 className="mb-1 text-[11px] uppercase tracking-wider text-zinc-500">Replace with · shadcn</h4>
                    <p className="mb-1.5 text-[11px] leading-snug text-zinc-500">{rec.reason}</p>
                    <ul className="space-y-1">
                      {rec.items.map((i) => (
                        <li key={`${i.registry}/${i.name}`} className="flex items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1">
                          <span className="min-w-0">
                            <span className="text-[12px] text-zinc-200">{i.name}</span>
                            <span className="ml-1 text-[9px] uppercase text-zinc-600">{i.registry}</span>
                            {i.source === 'shoogle' && (
                              <span className="ml-1 rounded bg-sky-500/15 px-1 text-[9px] uppercase text-sky-300">shoogle</span>
                            )}
                            <span className="ml-1.5 truncate text-[10px] text-zinc-600">{i.description}</span>
                          </span>
                          <button
                            onClick={() => navigator.clipboard.writeText(i.addCommand)}
                            className="shrink-0 rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 hover:text-zinc-100"
                            title={i.addCommand}
                          >
                            copy add
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </Panel>
        )
      })}
    </div>
  )
}

function Flows({ run }: { run: Run }): JSX.Element {
  if (run.flows.length === 0) return <Empty>No flows were replayed.</Empty>
  return (
    <div className="space-y-3">
      {run.flows.map((f) => (
        <Panel
          key={f.name}
          title={
            <span className="flex items-center gap-2">
              <span>{f.name}</span>
              <Badge className="border-zinc-700 bg-zinc-800 text-zinc-400">{f.origin ?? 'user'}</Badge>
            </span>
          }
          right={
            <Badge
              className={
                f.invalid
                  ? 'border-zinc-600 bg-zinc-800 text-zinc-400'
                  : f.ok
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-red-500/30 bg-red-500/10 text-red-300'
              }
            >
              {f.invalid ? 'not run' : f.ok ? 'pass' : 'fail'} · {f.totalMs}ms
            </Badge>
          }
        >
          {f.invalid && (
            <p className="mb-2 rounded-md border border-zinc-800 bg-zinc-950/60 p-2 text-[11px] leading-snug text-zinc-400">
              Skipped before running: {f.invalid}. This is a bad test, not a product defect — so it was not counted
              against the score.
            </p>
          )}
          <ol className="space-y-2">
            {f.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className={cx(
                    'mt-1 h-2 w-2 shrink-0 rounded-full',
                    s.ok ? 'bg-emerald-400' : s.skipped ? 'bg-zinc-600' : 'bg-red-400'
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[12px] text-zinc-300">
                    {s.step.action} {s.step.target ?? ''} {s.step.value ? `| ${s.step.value}` : ''}
                    <span className="ml-2 text-[11px] text-zinc-600">{s.ms}ms</span>
                  </div>
                  {s.error && <div className="text-[11px] text-red-400">{s.error}</div>}
                </div>
                {s.screenshot && (
                  <img src={api.asset(s.screenshot)} alt="" className="h-16 w-28 rounded border border-zinc-800 object-cover object-top" />
                )}
              </li>
            ))}
          </ol>
        </Panel>
      ))}
    </div>
  )
}

function Tokens({ page }: { page: CapturedPage }): JSX.Element {
  const t = page.tokens
  return (
    <div className="grid grid-cols-2 gap-4">
      <Panel title={`Colours (${t.colors.length})`}>
        <div className="flex flex-wrap gap-1.5">
          {t.colors.slice(0, 60).map((c, i) => (
            <div key={i} className="flex items-center gap-1.5 rounded-md border border-zinc-800 px-1.5 py-1" title={`${c.role} · ${c.usage}×`}>
              <span className="h-4 w-4 rounded border border-zinc-700" style={{ background: c.value }} />
              <span className="font-mono text-[10px] text-zinc-500">{c.usage}×</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Type">
        <div className="space-y-1 text-[12px] text-zinc-300">
          <div>Families: {t.fontFamilies.map((f) => `${f.value} (${f.usage})`).join(', ')}</div>
          <div>Sizes: {t.fontSizes.map((s) => `${s.value}px`).join(' · ')}</div>
          <div>Weights: {t.fontWeights.map((w) => w.value).join(' · ')}</div>
        </div>
      </Panel>
      <Panel title="Shape & elevation">
        <div className="space-y-1 text-[12px] text-zinc-300">
          <div>Radii: {t.radii.map((r) => r.value).join(' · ') || 'none'}</div>
          <div className="text-zinc-500">Shadows: {t.shadows.length}</div>
          <div className="text-zinc-500">Transitions: {t.transitions.length}</div>
        </div>
      </Panel>
      {page.cssStats && (
        <Panel title="Authored CSS · Project Wallace" className="col-span-2">
          <div className="grid grid-cols-4 gap-3 text-[12px]">
            <Stat label="stylesheet" value={`${(page.cssStats.bytes / 1024).toFixed(0)} kB`} sub={`${page.cssStats.sheets} sheets · ${page.cssStats.rules} rules`} />
            <Stat
              label="colour reuse"
              value={`${(page.cssStats.colorUniquenessRatio * 100).toFixed(0)}%`}
              sub={`${page.cssStats.colorsUnique} unique / ${page.cssStats.colorsTotal} declared`}
              bad={page.cssStats.colorUniquenessRatio > 0.35}
            />
            <Stat label="font sizes" value={String(page.cssStats.fontSizesUnique)} sub="authored, not rendered" bad={page.cssStats.fontSizesUnique > 12} />
            <Stat label="radii / shadows" value={`${page.cssStats.radiiUnique} / ${page.cssStats.shadowsUnique}`} sub="unique values" bad={page.cssStats.radiiUnique > 6} />
            <Stat label="!important" value={`${(page.cssStats.importantRatio * 100).toFixed(1)}%`} sub="of declarations" bad={page.cssStats.importantRatio > 0.03} />
            <Stat label="max specificity" value={`(${page.cssStats.maxSpecificity})`} sub={`ids ${(page.cssStats.idSelectorRatio * 100).toFixed(1)}%`} />
            <Stat label="z-index" value={String(page.cssStats.zIndexMax)} sub={`${page.cssStats.zIndexUnique} unique`} bad={page.cssStats.zIndexMax >= 1000} />
            <Stat
              label="quality"
              value={`${page.cssStats.quality.maintainability}/${page.cssStats.quality.complexity}`}
              sub="maintainability / complexity"
              bad={page.cssStats.quality.maintainability < 70}
            />
          </div>
          {page.cssStats.locations?.length > 0 && (
            <p className="mt-3 text-[11px] text-zinc-500">
              css-tree located {page.cssStats.locations.length} issue site(s) — cited on coherence findings.
            </p>
          )}
        </Panel>
      )}
      {page.tokenDictionary && page.tokenDictionary.count > 0 && (
        <Panel title="Design tokens · Style Dictionary" className="col-span-2">
          <div className="grid grid-cols-4 gap-3 text-[12px]">
            <Stat label="tokens" value={String(page.tokenDictionary.count)} sub={page.tokenDictionary.buildError ? 'build failed' : 'extracted'} bad={!!page.tokenDictionary.buildError} />
            <Stat label="colours" value={String(page.tokenDictionary.groups.colors)} sub="--color-* family" />
            <Stat label="spacing" value={String(page.tokenDictionary.groups.spacing)} sub="space / gap / pad" />
            <Stat label="type / radii / shadows" value={`${page.tokenDictionary.groups.typography} / ${page.tokenDictionary.groups.radii} / ${page.tokenDictionary.groups.shadows}`} sub="grouped" />
          </div>
        </Panel>
      )}

      <Panel title="Spacing rhythm">
        <div className="flex flex-wrap gap-1">
          {page.tokens.spacing.map((s) => (
            <span
              key={s.value}
              className={cx(
                'rounded border px-1.5 py-0.5 font-mono text-[10px]',
                s.value % 4 === 0 ? 'border-zinc-800 text-zinc-400' : 'border-amber-500/40 text-amber-300'
              )}
            >
              {s.value}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-zinc-600">Amber = off the 4px grid.</p>
      </Panel>
    </div>
  )
}

/**
 * Everything the audit suggests you *replace this with*: shipped reference UI
 * from Mobbin for each section type, and the concrete registry components
 * (Shoogle community registries first, shadcn as fallback) that implement it.
 */
/** Shared full-screen image viewer. */
function Lightbox({
  shot,
  onClose
}: {
  shot: { src: string; label: string; link?: string } | null
  onClose: () => void
}): JSX.Element | null {
  if (!shot) return null
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto bg-black/85 p-6 backdrop-blur-sm"
    >
      <div className="mb-2 flex w-full max-w-[1440px] items-center justify-between gap-3">
        <span className="truncate text-[12px] text-zinc-300">{shot.label}</span>
        <span className="flex shrink-0 items-center gap-3">
          {shot.link && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                api.openExternal(shot.link!)
              }}
              className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:text-white"
            >
              open in Mobbin ↗
            </button>
          )}
          <span className="text-[11px] text-zinc-500">click anywhere to close</span>
        </span>
      </div>
      <img
        src={shot.src.startsWith('http') ? shot.src : api.asset(shot.src)}
        alt={shot.label}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[1440px] rounded-lg border border-zinc-700"
      />
    </div>
  )
}

/** One suggested component, expandable to its real contents. */
function ComponentRow({ item }: { item: Run['recommendations'][number]['items'][number] }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const toggle = async (): Promise<void> => {
    const next = !open
    setOpen(next)
    if (next && !detail) {
      setLoading(true)
      try {
        setDetail(
          await api.componentDetail({
            name: item.name,
            registry: item.registry,
            homepage: item.docs,
            addCommandArgument: item.addCommand.replace('npx shadcn@latest add ', '')
          })
        )
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <li className="rounded-md border border-zinc-800 bg-zinc-950/60">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <button onClick={toggle} className="min-w-0 flex-1 text-left">
          <span className="text-[12px] text-zinc-100">{item.name}</span>
          <span
            className={cx(
              'ml-1.5 rounded px-1 text-[9px] uppercase',
              item.source === 'shoogle' ? 'bg-sky-500/15 text-sky-300' : 'bg-zinc-800 text-zinc-500'
            )}
          >
            {item.source === 'shoogle' ? `shoogle ${item.registry}` : 'shadcn'}
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-zinc-600">{item.description}</span>
        </button>
        <span className="flex shrink-0 gap-1">
          <button
            onClick={toggle}
            className="rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-200"
          >
            {open ? 'hide' : 'preview'}
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(item.addCommand)
              setCopied(true)
              setTimeout(() => setCopied(false), 1600)
            }}
            className="rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 hover:text-zinc-100"
            title={item.addCommand}
          >
            {copied ? '✓' : 'copy add'}
          </button>
        </span>
      </div>

      {open && (
        <div className="border-t border-zinc-800 px-2 py-2">
          {loading && <p className="text-[11px] text-zinc-500">Fetching component from {item.registry}…</p>}
          {!loading && detail && !detail.ok && (
            <p className="text-[11px] text-amber-400">
              {detail.error ?? 'Could not read this component from its registry.'}{' '}
              {item.docs && (
                <button onClick={() => api.openExternal(item.docs!)} className="text-sky-400 hover:underline">
                  open the registry site ↗
                </button>
              )}
            </p>
          )}
          {!loading && detail?.ok && (
            <div className="space-y-1.5">
              {(detail.title || detail.description) && (
                <p className="text-[11px] text-zinc-300">{detail.title ?? detail.description}</p>
              )}
              <p className="text-[10px] text-zinc-500">
                {detail.files.length} file(s)
                {detail.dependencies.length > 0 && <> · npm: {detail.dependencies.join(', ')}</>}
                {detail.registryDependencies.length > 0 && <> · registry: {detail.registryDependencies.join(', ')}</>}
              </p>
              {detail.files.map((f: any) => (
                <details key={f.path} className="rounded border border-zinc-800 bg-black/40">
                  <summary className="cursor-pointer px-2 py-1 text-[10px] text-zinc-400">
                    {f.path} {f.lines ? `· ${f.lines} lines` : ''}
                  </summary>
                  <pre className="max-h-72 overflow-auto px-2 pb-2 text-[10px] leading-relaxed text-zinc-400">
                    {f.preview ?? 'no source returned'}
                  </pre>
                </details>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function Replace({ run }: { run: Run }): JSX.Element {
  const [copiedAll, setCopiedAll] = useState(false)
  const [zoom, setZoom] = useState<{ src: string; label: string; link?: string } | null>(null)

  // Group by section role so references and components line up on the same row.
  const roles = new Map<
    string,
    { role: string; sectionIds: string[]; refs: typeof run.references; recs: typeof run.recommendations }
  >()

  const sectionRole = new Map<string, string>()
  for (const p of run.pages) for (const s of p.sections) sectionRole.set(s.id, s.role)

  for (const rec of run.recommendations) {
    const key = rec.sectionRole
    const entry = roles.get(key) ?? { role: key, sectionIds: [], refs: [], recs: [] }
    entry.recs.push(rec)
    if (!entry.sectionIds.includes(rec.sectionId)) entry.sectionIds.push(rec.sectionId)
    roles.set(key, entry)
  }
  for (const ref of run.references) {
    // Attach by the section it was searched for; fall back to the query text so
    // references still surface when section ids shift between pages.
    const role = (ref.sectionId && sectionRole.get(ref.sectionId)) || guessRoleFromQuery(ref.query)
    const entry = roles.get(role) ?? { role, sectionIds: ref.sectionId ? [ref.sectionId] : [], refs: [], recs: [] }
    entry.refs.push(ref)
    roles.set(role, entry)
  }

  const groups = [...roles.values()].sort((a, b) => b.refs.length + b.recs.length - (a.refs.length + a.recs.length))
  const allCommands = [
    ...new Set(run.recommendations.flatMap((r) => r.items.map((i) => i.addCommand)))
  ]

  if (groups.length === 0) {
    return (
      <Empty>
        No references or component suggestions in this run — enable “Mobbin references” and “Component replacements” on
        the New audit screen.
      </Empty>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
        <p className="text-[12px] text-zinc-400">
          <span className="text-zinc-200">{run.references.length}</span> reference screens from Mobbin ·{' '}
          <span className="text-zinc-200">{allCommands.length}</span> components to install across{' '}
          {run.recommendations.length} section(s)
        </p>
        <Button
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(allCommands.join('\n'))
            setCopiedAll(true)
            setTimeout(() => setCopiedAll(false), 2200)
          }}
        >
          {copiedAll ? '✓ copied' : 'Copy all add commands'}
        </Button>
      </div>

      {groups.map((g) => (
        <Panel
          key={g.role}
          title={
            <span className="flex items-center gap-2">
              <Badge>{g.role}</Badge>
              <span className="text-zinc-300">{g.sectionIds.join(', ') || 'general'}</span>
            </span>
          }
          right={
            <span className="text-[11px] text-zinc-500">
              {g.refs.length} reference(s) · {g.recs.reduce((n, r) => n + r.items.length, 0)} component(s)
            </span>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="mb-1.5 text-[11px] uppercase tracking-wider text-zinc-500">How shipped products do it · Mobbin</h4>
              {g.refs.length === 0 ? (
                <p className="text-[11px] text-zinc-600">No reference pulled for this section type.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {g.refs.slice(0, 6).map((r, i) => (
                    <button
                      key={i}
                      onClick={() =>
                        r.imageUrl &&
                        setZoom({
                          src: r.imageUrl,
                          label: `${r.appName ?? r.title} — ${r.query}`,
                          link: r.mobbinUrl
                        })
                      }
                      className="text-left"
                      title={`${r.description ?? r.query} — click to enlarge`}
                    >
                      {r.imageUrl ? (
                        <img
                          src={r.imageUrl.startsWith('http') ? r.imageUrl : api.asset(r.imageUrl)}
                          alt={r.title}
                          className="h-28 w-full rounded-md border border-zinc-800 object-cover object-top hover:border-zinc-500"
                        />
                      ) : (
                        <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-zinc-800 text-[10px] text-zinc-600">
                          no image
                        </div>
                      )}
                      <span className="mt-1 block truncate text-[10px] text-zinc-400">{r.appName ?? r.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="mb-1.5 text-[11px] uppercase tracking-wider text-zinc-500">Replace it with</h4>
              {g.recs.length === 0 ? (
                <p className="text-[11px] text-zinc-600">No component suggestion for this section type.</p>
              ) : (
                <>
                  <p className="mb-1.5 text-[11px] leading-snug text-zinc-500">{g.recs[0].reason}</p>
                  <ul className="space-y-1">
                    {[...new Map(g.recs.flatMap((r) => r.items).map((i) => [i.addCommand, i])).values()]
                      .slice(0, 10)
                      .map((i) => (
                        <ComponentRow key={i.addCommand} item={i} />
                      ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </Panel>
      ))}
      <Lightbox shot={zoom} onClose={() => setZoom(null)} />
    </div>
  )
}

function guessRoleFromQuery(query: string): string {
  const q = query.toLowerCase()
  for (const role of ['pricing', 'hero', 'testimonial', 'faq', 'footer', 'nav', 'form', 'table', 'gallery', 'stats', 'logo', 'cta'])
    if (q.includes(role)) return role === 'testimonial' ? 'testimonials' : role === 'logo' ? 'logos' : role
  return 'content'
}

function Screens({ run }: { run: Run }): JSX.Element {
  const [zoom, setZoom] = useState<{ src: string; label: string } | null>(null)
  const viewports = [...new Set(run.pages.flatMap((p) => Object.keys(p.screenshots)))]
  const [vp, setVp] = useState<string>('all')

  const shots: { src: string; label: string; sub: string; group: string }[] = []
  for (const page of run.pages) {
    for (const [name, path] of Object.entries(page.screenshots)) {
      if (vp !== 'all' && vp !== name) continue
      shots.push({
        src: path,
        label: new URL(page.url).pathname || '/',
        sub: `${name} · ${page.status}`,
        group: 'Pages'
      })
    }
  }
  for (const page of run.pages) {
    for (const s of page.sections) {
      if (!s.screenshot || (vp !== 'all' && vp !== 'desktop')) continue
      shots.push({ src: s.screenshot, label: s.label || s.role, sub: `${s.role} · ${s.id}`, group: 'Sections' })
    }
  }
  for (const f of run.flows) {
    for (const [i, step] of f.steps.entries()) {
      if (!step.screenshot || (vp !== 'all' && vp !== 'desktop')) continue
      shots.push({
        src: step.screenshot,
        label: `${f.name} · step ${i + 1}`,
        sub: `${step.step.action} ${step.step.target ?? ''}${step.ok ? '' : ' — FAILED'}`,
        group: 'Flows'
      })
    }
  }
  if (run.auth?.screenshot) {
    shots.push({
      src: run.auth.screenshot,
      label: 'Login attempt',
      sub: run.auth.ok ? 'signed in' : 'sign-in failed',
      group: 'Session'
    })
  }

  if (shots.length === 0) return <Empty>No screenshots captured yet.</Empty>
  const groups = [...new Set(shots.map((s) => s.group))]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <Chip active={vp === 'all'} onClick={() => setVp('all')}>
          all ({shots.length})
        </Chip>
        {viewports.map((v) => (
          <Chip key={v} active={vp === v} onClick={() => setVp(v)}>
            {v}
          </Chip>
        ))}
      </div>

      {groups.map((g) => {
        const items = shots.filter((s) => s.group === g)
        return (
          <Panel key={g} title={g} right={<span className="text-[11px] text-zinc-500">{items.length}</span>}>
            <div className="grid grid-cols-4 gap-3">
              {items.map((s, i) => (
                <button key={i} onClick={() => setZoom({ src: s.src, label: `${s.label} — ${s.sub}` })} className="group text-left">
                  <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 group-hover:border-zinc-600">
                    <img src={api.asset(s.src)} alt={s.label} className="h-44 w-full object-cover object-top" />
                  </div>
                  <div className="mt-1 truncate text-[11px] text-zinc-300">{s.label}</div>
                  <div className={cx('truncate text-[10px]', s.sub.includes('FAILED') ? 'text-red-400' : 'text-zinc-600')}>
                    {s.sub}
                  </div>
                </button>
              ))}
            </div>
          </Panel>
        )
      })}

      {zoom && (
        <div
          onClick={() => setZoom(null)}
          className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto bg-black/85 p-6 backdrop-blur-sm"
        >
          <div className="mb-2 flex w-full max-w-5xl items-center justify-between">
            <span className="text-[12px] text-zinc-300">{zoom.label}</span>
            <span className="text-[11px] text-zinc-500">click anywhere to close</span>
          </div>
          <img src={api.asset(zoom.src)} alt={zoom.label} className="w-full max-w-5xl rounded-lg border border-zinc-700" />
        </div>
      )}
    </div>
  )
}

function Interactions({ run }: { run: Run }): JSX.Element {
  if (!run.interactions?.length)
    return <Empty>The interaction probe did not run for this audit (enable it on the New audit screen).</Empty>

  return (
    <div className="space-y-4">
      {run.interactions.map((r, i) => {
        const groups: { label: string; items: string[]; tone: string; blurb: string }[] = [
          { label: 'Dead clicks', items: r.deadClicks, tone: 'text-red-300', blurb: 'clicked, nothing changed' },
          { label: 'No focus ring', items: r.noFocusIndicator, tone: 'text-orange-300', blurb: 'invisible to keyboard users' },
          { label: 'No hover feedback', items: r.noHoverFeedback, tone: 'text-amber-200', blurb: 'pointer cursor, no response' },
          { label: 'Unnamed controls', items: r.unnamedControls, tone: 'text-red-300', blurb: 'no accessible name' },
          { label: 'Fake buttons', items: r.fakeButtons, tone: 'text-orange-300', blurb: 'clickable, not focusable' },
          { label: 'Broken disabled', items: r.brokenDisabled, tone: 'text-sky-300', blurb: 'aria-disabled but still clickable' }
        ]
        return (
          <Panel
            key={i}
            title={
              <span className="flex items-center gap-2">
                <Badge>{r.viewport}</Badge>
                <span className="truncate text-zinc-300">{r.url}</span>
              </span>
            }
            right={
              <span className="text-[11px] text-zinc-500">
                {r.controlsProbed} controls exercised · {r.keyboard.tabStops} tab stops
              </span>
            }
          >
            <div className="grid grid-cols-3 gap-3">
              {groups.map((g) => (
                <div key={g.label} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] uppercase tracking-wider text-zinc-500">{g.label}</span>
                    <span className={cx('text-[15px] tabular-nums', g.items.length ? g.tone : 'text-zinc-600')}>
                      {g.items.length}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-600">{g.blurb}</div>
                  {g.items.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {g.items.slice(0, 6).map((x, j) => (
                        <li key={j} className="truncate text-[11px] text-zinc-400">
                          · {x}
                        </li>
                      ))}
                      {g.items.length > 6 && <li className="text-[10px] text-zinc-600">+{g.items.length - 6} more</li>}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            {(r.overlays.length > 0 || r.forms.length > 0) && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <h4 className="mb-1 text-[11px] uppercase tracking-wider text-zinc-500">Overlays opened</h4>
                  {r.overlays.length === 0 ? (
                    <p className="text-[11px] text-zinc-600">none triggered</p>
                  ) : (
                    <ul className="space-y-1">
                      {r.overlays.map((o, j) => (
                        <li key={j} className="flex items-center gap-2 text-[11px]">
                          <span className="truncate text-zinc-300">{o.trigger}</span>
                          <Badge className={o.escapeCloses ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}>
                            esc {o.escapeCloses ? 'ok' : 'fail'}
                          </Badge>
                          <Badge className={o.focusMoved ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}>
                            focus {o.focusMoved ? 'ok' : 'fail'}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h4 className="mb-1 text-[11px] uppercase tracking-wider text-zinc-500">Forms submitted empty</h4>
                  {r.forms.length === 0 ? (
                    <p className="text-[11px] text-zinc-600">no forms found</p>
                  ) : (
                    <ul className="space-y-1">
                      {r.forms.map((f) => (
                        <li key={f.index} className="flex items-center gap-2 text-[11px]">
                          <span className="truncate text-zinc-300">{f.submitLabel || `form #${f.index}`}</span>
                          <span className="text-zinc-600">
                            {f.required}/{f.fields} required
                          </span>
                          <Badge className={f.validationFeedback ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}>
                            {f.validationFeedback ? 'validated' : 'silent'}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </Panel>
        )
      })}
    </div>
  )
}

function Diffs({ run }: { run: Run }): JSX.Element {
  if (!run.visualDiffs?.length)
    return (
      <Empty>
        No baseline to compare against — this run is the baseline. Audit the same URL again and every pixel that
        moves shows up here.
      </Empty>
    )
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-zinc-500">
        Compared against run <span className="text-zinc-300">{run.visualDiffs[0].baselineRunId}</span>. Anything you
        did not intend to change is a regression.
      </p>
      {run.visualDiffs
        .slice()
        .sort((a, b) => b.changedRatio - a.changedRatio)
        .map((d, i) => (
          <Panel
            key={i}
            title={
              <span className="flex items-center gap-2">
                <Badge
                  className={
                    d.changedRatio > 0.25
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                      : d.changedRatio > 0.02
                        ? 'border-sky-500/40 bg-sky-500/10 text-sky-300'
                        : 'border-zinc-700 bg-zinc-800 text-zinc-400'
                  }
                >
                  {(d.changedRatio * 100).toFixed(1)}% changed
                </Badge>
                <span className="text-zinc-300">{d.viewport}</span>
                <span className="truncate text-[11px] text-zinc-600">{d.url}</span>
              </span>
            }
            right={<span className="text-[11px] tabular-nums text-zinc-500">{d.changedPixels.toLocaleString()} px</span>}
          >
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'baseline', src: d.baselineImage },
                { label: 'current', src: d.currentImage },
                { label: 'diff', src: d.diffImage }
              ].map((img) => (
                <div key={img.label}>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-600">{img.label}</div>
                  {img.src ? (
                    <img
                      src={api.asset(img.src)}
                      alt={img.label}
                      className="max-h-80 w-full rounded-lg border border-zinc-800 object-cover object-top"
                    />
                  ) : (
                    <div className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-[11px] text-zinc-600">
                      identical
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        ))}
    </div>
  )
}

function FindingCard({ f }: { f: Finding }): JSX.Element {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={SEVERITY_COLOR[f.severity]}>{f.severity}</Badge>
        <Badge>{f.category}</Badge>
        <Badge className="border-zinc-800 bg-zinc-900 text-zinc-500">{f.source}</Badge>
        <span className="text-[13px] font-medium text-zinc-100">{f.title}</span>
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-400">{f.detail}</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-emerald-300/90">→ {f.fix}</p>
      <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-zinc-600">
        <span>{f.pageUrl}</span>
        {f.sectionId && <span>· section {f.sectionId}</span>}
        {f.viewport && <span>· {f.viewport}</span>}
        {f.selector && <code className="truncate">· {f.selector}</code>}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  bad
}: {
  label: string
  value: string
  sub?: string
  bad?: boolean
}): JSX.Element {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</div>
      <div className={cx('mt-0.5 text-[15px] tabular-nums', bad ? 'text-amber-300' : 'text-zinc-100')}>{value}</div>
      {sub && <div className="text-[10px] text-zinc-600">{sub}</div>}
    </div>
  )
}

