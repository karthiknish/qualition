/**
 * Compare Mobbin *flow* references to the crawled product + executed journeys.
 * Surfaces missing steps (confirm, success, undo, stepper, …) that shipped
 * products include but this audit never saw.
 */
import type { CapturedPage, Finding, FlowResult, MobbinReference } from '../../shared/types.js'

export interface FlowGap {
  id: string
  title: string
  detail: string
  fix: string
  severity: 'major' | 'minor' | 'nit'
  /** Suggested flow steps when the crawl has matching controls. */
  suggestedSteps?: { action: 'goto' | 'click' | 'fill' | 'assertText' | 'wait'; target?: string; value?: string; intent?: string }[]
}

const FLOW_GAP_PATTERNS: {
  id: string
  mobbin: RegExp
  present: RegExp
  title: string
  detail: string
  fix: string
  severity: FlowGap['severity']
}[] = [
  {
    id: 'confirm-before-submit',
    mobbin: /\bconfirm(ation)?\b|\breview (before|and) (submit|send|publish)\b|\bare you sure\b/i,
    present: /\bconfirm\b|\breview (changes|before)\b|\bare you sure\b/i,
    title: 'Mobbin flows confirm before irreversible submit',
    detail: 'Reference flows include an explicit confirmation/review step before commit. This product shows no confirm/review copy in the crawl.',
    fix: 'Add a review step or confirm dialog before destructive or publishing actions.',
    severity: 'major'
  },
  {
    id: 'success-feedback',
    mobbin: /\bsuccess (toast|screen|state|message)\b|\bconfirmation (toast|screen)\b|\ball set\b|\byou.?re done\b/i,
    present: /\bsuccess\b|\bsaved\b|\ball set\b|\btoast\b|\bsonner\b/i,
    title: 'Mobbin flows end with success feedback',
    detail: 'Reference journeys close with a success toast or confirmation screen. No success/saved feedback vocabulary was observed.',
    fix: 'After completing the core action, show a success toast or dedicated confirmation state.',
    severity: 'major'
  },
  {
    id: 'undo',
    mobbin: /\bundo\b|\brestore\b|\bsnackbar with undo\b/i,
    present: /\bundo\b|\brestore\b|\brevert\b/i,
    title: 'Mobbin flows offer undo after mutation',
    detail: 'Reference flows expose undo/restore after a change. The crawl has no undo affordance.',
    fix: 'Add an undo snackbar or restore action for reversible mutations.',
    severity: 'minor'
  },
  {
    id: 'stepper',
    mobbin: /\b(stepper|multi[- ]?step|wizard|progress steps|step \d of \d)\b/i,
    present: /\bstep \d\b|\bwizard\b|\bstepper\b|\bprogress steps\b/i,
    title: 'Mobbin flows use a multi-step progress pattern',
    detail: 'Reference flows show a stepper/wizard. This product’s crawl has no step progress UI for long journeys.',
    fix: 'For multi-stage setup flows, add a visible step indicator with clear current/complete states.',
    severity: 'minor'
  },
  {
    id: 'empty-after-clear',
    mobbin: /\bempty (queue|inbox|state) after\b|\ball caught up\b|\bno (items|tasks) left\b/i,
    present: /\bcaught up\b|\ball clear\b|\bno (tasks|items|alerts) (left|remaining)\b|\bempty (queue|inbox)\b/i,
    title: 'Mobbin flows celebrate an emptied queue',
    detail: 'Reference flows land on a deliberate empty/caught-up state after clearing work. No such completion empty-state was found.',
    fix: 'When the queue is empty, show a purposeful empty state with next-step guidance — not a blank panel.',
    severity: 'minor'
  },
  {
    id: 'search-open-detail',
    mobbin: /\bsearch .*(open|select|view) (detail|item|row|record)\b|\bfilter then open\b|\bfind and open\b/i,
    present: /\b(search|filter).{0,60}(open (detail|record|item)|view (detail|record))\b/i,
    title: 'Mobbin flows search then open a record',
    detail: 'Reference flows combine search/filter with opening a detail record. Prefer testing that depth rather than sidebar-only hops.',
    fix: 'Ensure list search results navigate into a detail view; audit that journey end-to-end.',
    severity: 'nit'
  },
  {
    id: 'invite-share',
    mobbin: /\binvite (member|teammate|user)\b|\bshare (link|workspace)\b|\badd collaborator\b/i,
    present: /\binvite\b|\bshare (link|with)\b|\bcollaborator\b|\badd member\b/i,
    title: 'Mobbin flows include invite/share',
    detail: 'Reference flows cover inviting or sharing. No invite/share controls appeared in the crawl inventory.',
    fix: 'If collaboration is part of the product, expose a clear invite/share path with success feedback.',
    severity: 'nit'
  },
  {
    id: 'export-download',
    mobbin: /\bexport (csv|pdf|data)\b|\bdownload (report|csv)\b/i,
    present: /\bexport\b|\bdownload (csv|pdf|report)\b/i,
    title: 'Mobbin flows include export/download',
    detail: 'Reference flows finish with export/download. The crawl shows no export action.',
    fix: 'Add an export path for tabular/operational data if users need to take work offline.',
    severity: 'nit'
  }
]

function productBlob(pages: CapturedPage[], flows: FlowResult[] = []): string {
  const pageText = pages
    .map((p) =>
      [
        p.title,
        ...(p.controls ?? []).flatMap((c) => [c.text, c.label, c.ariaLabel, c.placeholder]),
        ...p.sections.flatMap((s) => [s.label, s.textPreview, ...s.headings, ...s.ctaLabels])
      ].join(' ')
    )
    .join('\n')
  const flowText = flows
    .flatMap((f) => f.steps.map((s) => [f.name, s.step.intent, s.step.target, s.step.value, s.step.action].join(' ')))
    .join('\n')
  return `${pageText}\n${flowText}`.toLowerCase()
}

function mobbinFlowBlob(refs: MobbinReference[]): string {
  return refs
    .filter((r) => r.kind === 'flow')
    .map((r) => [r.title, r.description, r.query, r.appName].filter(Boolean).join(' '))
    .join('\n')
}

/** Gaps between Mobbin flow references and what this product/journeys show. */
export function flowGapsFromMobbin(
  refs: MobbinReference[],
  pages: CapturedPage[],
  flows: FlowResult[] = []
): FlowGap[] {
  const flowRefs = refs.filter((r) => r.kind === 'flow')
  if (!flowRefs.length) return []
  const mob = mobbinFlowBlob(flowRefs)
  if (!mob.trim()) return []
  const product = productBlob(pages, flows)
  const out: FlowGap[] = []

  for (const p of FLOW_GAP_PATTERNS) {
    if (!p.mobbin.test(mob)) continue
    if (p.present.test(product)) continue
    out.push({
      id: p.id,
      title: p.title,
      detail: `${p.detail} Mobbin refs: ${flowRefs
        .map((r) => r.appName || r.title)
        .filter(Boolean)
        .slice(0, 4)
        .join(', ')}.`,
      fix: p.fix,
      severity: p.severity
    })
  }
  return out.slice(0, 8)
}

export function findingsFromFlowGaps(gaps: FlowGap[], targetUrl: string): Finding[] {
  return gaps.map((g, i) => ({
    id: `flow-gap-${i + 1}`,
    category: 'flow' as const,
    severity: g.severity,
    title: g.title,
    detail: g.detail,
    fix: g.fix,
    pageUrl: targetUrl,
    source: 'heuristic' as const,
    effort: 'component' as const,
    confidence: 'low' as const
  }))
}

/**
 * Turn Mobbin flow gaps into extra runnable journeys when the crawl already
 * has matching controls (so we exercise the gap instead of only reporting it).
 */
export function flowsSuggestedByMobbinGaps(
  gaps: FlowGap[],
  pages: CapturedPage[]
): { name: string; steps: { action: 'goto' | 'click' | 'fill' | 'assertText' | 'wait'; target?: string; value?: string; intent?: string }[] }[] {
  const ok = pages.filter((p) => p.ok && p.status < 400)
  if (!ok.length || !gaps.length) return []
  const entry = ok[0]
  let entryPath = '/'
  try {
    entryPath = new URL(entry.url).pathname || '/'
  } catch {
    /* keep */
  }

  const out: { name: string; steps: { action: 'goto' | 'click' | 'fill' | 'assertText' | 'wait'; target?: string; value?: string; intent?: string }[] }[] = []
  const seen = new Set<string>()
  const push = (flow: (typeof out)[number]): void => {
    const key = flow.name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(flow)
  }

  for (const gap of gaps) {
    if (gap.id === 'search-open-detail') {
      const searchPage = ok.find((p) =>
        (p.controls ?? []).some((c) => /search|filter/i.test(`${c.placeholder} ${c.label} ${c.ariaLabel}`))
      )
      if (!searchPage) continue
      let path = '/'
      try {
        path = new URL(searchPage.url).pathname || '/'
      } catch {
        /* keep */
      }
      const field = (searchPage.controls ?? []).find((c) =>
        /search|filter/i.test(`${c.placeholder} ${c.label} ${c.ariaLabel}`)
      )
      const handle = field?.placeholder
        ? `placeholder=${field.placeholder}`
        : field?.label
          ? `label=${field.label}`
          : null
      if (!handle) continue
      const detail = ok.find((p) => {
        try {
          const u = new URL(p.url)
          const parent = new URL(searchPage.url)
          return u.pathname !== parent.pathname && u.pathname.startsWith(parent.pathname.replace(/\/$/, '') + '/')
        } catch {
          return false
        }
      })
      const steps: { action: 'goto' | 'click' | 'fill' | 'assertText' | 'wait'; target?: string; value?: string; intent?: string }[] = [
        { action: 'goto', target: path, intent: `Open ${path} to search` },
        { action: 'fill', target: handle, value: 'a', intent: 'Type into search/filter' },
        { action: 'wait', value: '800', intent: 'Wait for results' }
      ]
      if (detail) {
        let dPath = '/'
        try {
          dPath = new URL(detail.url).pathname || '/'
        } catch {
          /* keep */
        }
        steps.push({ action: 'goto', target: dPath, intent: `Open detail ${dPath}` })
        const assertion = detail.sections.flatMap((s) => s.headings).find((h) => h.length > 2)
        if (assertion) steps.push({ action: 'assertText', value: assertion, intent: `Confirm “${assertion}”` })
      }
      push({ name: 'Mobbin gap — search then open detail', steps })
    }

    if (gap.id === 'success-feedback' || gap.id === 'confirm-before-submit') {
      const save = (entry.controls ?? [])
        .map((c) => (c.text || c.ariaLabel || '').trim())
        .find((t) => /save|publish|submit|create|send/i.test(t) && t.length < 24)
      if (!save) continue
      push({
        name: `Mobbin gap — exercise “${save}” for feedback`,
        steps: [
          { action: 'goto', target: entryPath, intent: 'Open entry page' },
          { action: 'click', target: `text=${save}`, intent: `Activate “${save}”` },
          { action: 'wait', value: '1000', intent: 'Wait for feedback' }
        ]
      })
    }
  }

  return out.slice(0, 3)
}
