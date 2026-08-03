/**
 * Infer UI primitives Mobbin references show that the audited section lacks.
 * Feeds Shoogle/shadcn search so we recommend unique components, not whole
 * dashboard shells.
 */
import type { MobbinReference, PageSection } from '../../shared/types.js'

/** Pattern seen in Mobbin copy → registry search phrase + “already on page” test. */
const GAP_PATTERNS: { id: string; mobbin: RegExp; query: string; present: RegExp; shadcn?: string[] }[] = [
  {
    id: 'empty-state',
    mobbin: /\bempty state\b|\bno (results|items|data|projects|tasks|messages)\b|\bnothing (here|yet)\b/i,
    query: 'empty state',
    present: /\bempty\b|\bno (results|data|items)\b/i,
    shadcn: ['empty']
  },
  {
    id: 'command-menu',
    mobbin: /\bcommand (palette|menu|k)\b|\bcmd\s*\+?\s*k\b|\bspotlight search\b/i,
    query: 'command menu',
    present: /\bcommand\b|\bpalette\b|\bcmdk\b/i,
    shadcn: ['command']
  },
  {
    id: 'data-table',
    mobbin: /\bdata table\b|\bsortable columns?\b|\brow actions?\b|\btanstack\b/i,
    query: 'data table',
    present: /\btable\b|\bgrid\b/i,
    shadcn: ['table', 'pagination']
  },
  {
    id: 'filters',
    mobbin: /\bfilter (bar|chip|pill|row)\b|\bfacets?\b|\brefine results\b/i,
    query: 'filter bar chips',
    present: /\bfilter\b|\bfacet\b/i,
    shadcn: ['dropdown-menu', 'toggle-group', 'badge']
  },
  {
    id: 'date-picker',
    mobbin: /\bdate (picker|range)\b|\bcalendar picker\b|\bschedule\b/i,
    query: 'date picker calendar',
    present: /\bcalendar\b|\bdatepicker\b|\bdate range\b/i,
    shadcn: ['calendar', 'popover']
  },
  {
    id: 'toast',
    mobbin: /\btoast\b|\bsnackbar\b|\bin[- ]app notification\b/i,
    query: 'toast notification',
    present: /\btoast\b|\bsonner\b|\bsnackbar\b/i,
    shadcn: ['sonner']
  },
  {
    id: 'chart',
    mobbin: /\b(line|bar|area|donut|pie) chart\b|\bsparkline\b|\banalytic/i,
    query: 'chart',
    present: /\bchart\b|\bsparkline\b/i,
    shadcn: ['chart']
  },
  {
    id: 'kpi',
    mobbin: /\bkpi\b|\bmetric card\b|\bstat card\b|\bkey metrics?\b/i,
    query: 'kpi stat card',
    present: /\bkpi\b|\bmetric\b|\bstat\b/i,
    shadcn: ['card', 'badge']
  },
  {
    id: 'tabs',
    mobbin: /\btab(s|bed)\b|\bsegment(ed)? control\b/i,
    query: 'tabs',
    present: /\btab\b|\bsegment/i,
    shadcn: ['tabs']
  },
  {
    id: 'breadcrumb',
    mobbin: /\bbreadcrumb/i,
    query: 'breadcrumb',
    present: /\bbreadcrumb/i,
    shadcn: ['breadcrumb']
  },
  {
    id: 'sheet',
    mobbin: /\b(side )?sheet\b|\bslide[- ]?over\b|\bdrawer\b/i,
    query: 'sheet drawer',
    present: /\bsheet\b|\bdrawer\b|\bslideover\b/i,
    shadcn: ['sheet']
  },
  {
    id: 'dialog',
    mobbin: /\bmodal\b|\bdialog\b|\bconfirm(ation)?\b/i,
    query: 'dialog modal',
    present: /\bmodal\b|\bdialog\b/i,
    shadcn: ['dialog', 'alert-dialog']
  },
  {
    id: 'skeleton',
    mobbin: /\bskeleton( loader| screen)?\b|\bshimmer\b|\bplaceholder loading\b/i,
    query: 'skeleton loader',
    present: /\bskeleton\b|\bshimmer\b|\banimate-pulse\b/i,
    shadcn: ['skeleton']
  },
  {
    id: 'pagination',
    mobbin: /\bpagination\b|\bpage (controls|nav)\b/i,
    query: 'pagination',
    present: /\bpagination\b|\bnext page\b/i,
    shadcn: ['pagination']
  },
  {
    id: 'avatar',
    mobbin: /\bavatar(s| stack| group)?\b|\buser chip\b/i,
    query: 'avatar',
    present: /\bavatar\b/i,
    shadcn: ['avatar']
  },
  {
    id: 'combobox',
    mobbin: /\bcombobox\b|\bautocomplete\b|\btypeahead\b/i,
    query: 'combobox autocomplete',
    present: /\bcombobox\b|\bautocomplete\b|\btypeahead\b/i,
    shadcn: ['combobox']
  },
  {
    id: 'select',
    mobbin: /\b(select|dropdown) (menu|field|input)\b|\bnative select\b/i,
    query: 'select',
    present: /\bselect\b|\bdropdown\b/i,
    shadcn: ['select']
  },
  {
    id: 'tooltip',
    mobbin: /\btooltip\b/i,
    query: 'tooltip',
    present: /\btooltip\b/i,
    shadcn: ['tooltip']
  },
  {
    id: 'hover-card',
    mobbin: /\bhover card\b|\bpreview card on hover\b/i,
    query: 'hover card',
    present: /\bhover[- ]?card\b/i,
    shadcn: ['hover-card']
  },
  {
    id: 'progress',
    mobbin: /\bprogress (bar|indicator)\b|\bcompletion %\b/i,
    query: 'progress',
    present: /\bprogress\b/i,
    shadcn: ['progress']
  },
  {
    id: 'accordion',
    mobbin: /\baccordion\b|\bcollapsible (faq|list)\b/i,
    query: 'accordion',
    present: /\baccordion\b|\bcollapsible\b/i,
    shadcn: ['accordion', 'collapsible']
  },
  {
    id: 'carousel',
    mobbin: /\bcarousel\b|\bslider\b|\bswiper\b/i,
    query: 'carousel',
    present: /\bcarousel\b|\bswiper\b|\bslider\b/i,
    shadcn: ['carousel']
  },
  {
    id: 'input-otp',
    mobbin: /\botp\b|\bverification code\b|\bone[- ]time (pass|code)\b/i,
    query: 'otp input',
    present: /\botp\b|\bverification code\b/i,
    shadcn: ['input-otp']
  },
  {
    id: 'menubar',
    mobbin: /\bmenu ?bar\b|\bapp menu\b/i,
    query: 'menubar',
    present: /\bmenubar\b/i,
    shadcn: ['menubar']
  },
  {
    id: 'context-menu',
    mobbin: /\bcontext menu\b|\bright[- ]?click menu\b/i,
    query: 'context menu',
    present: /\bcontext[- ]?menu\b/i,
    shadcn: ['context-menu']
  },
  {
    id: 'resizable',
    mobbin: /\bresizable (panel|pane|split)\b|\bsplit (view|pane)\b/i,
    query: 'resizable panels',
    present: /\bresizable\b|\bsplit pane\b/i,
    shadcn: ['resizable']
  },
  {
    id: 'scroll-area',
    mobbin: /\binfinite scroll\b|\bvirtual(ised|ized)? list\b|\bscroll area\b/i,
    query: 'scroll area',
    present: /\bscroll[- ]?area\b|\bvirtual(ised|ized)?\b/i,
    shadcn: ['scroll-area']
  }
]

export interface ComponentGap {
  id: string
  query: string
  shadcn: string[]
}

function sectionBlob(section: PageSection): string {
  return [
    section.label,
    section.role,
    ...section.headings,
    ...section.ctaLabels,
    section.textPreview,
    ...section.components.flatMap((c) => [c.tag, c.role ?? '', c.text])
  ]
    .join(' ')
    .toLowerCase()
}

function mobbinBlob(refs: MobbinReference[]): string {
  return refs
    .map((r) => [r.title, r.description, r.query, r.appName].filter(Boolean).join(' '))
    .join('\n')
}

/**
 * Unique components Mobbin shows for this section that the live UI does not
 * obviously already include.
 */
export function gapsFromMobbin(refs: MobbinReference[], section: PageSection): ComponentGap[] {
  if (!refs.length) return []
  const mob = mobbinBlob(refs)
  const page = sectionBlob(section)
  const out: ComponentGap[] = []
  const seen = new Set<string>()

  for (const p of GAP_PATTERNS) {
    if (!p.mobbin.test(mob)) continue
    if (p.present.test(page)) continue
    if (seen.has(p.id)) continue
    seen.add(p.id)
    out.push({ id: p.id, query: p.query, shadcn: p.shadcn ?? [] })
  }
  return out.slice(0, 8)
}

/** Full-page / app-shell registry items — not useful as component fills. */
export function isFullPageShell(name: string, type?: string, description?: string): boolean {
  const n = name.toLowerCase()
  const d = (description ?? '').toLowerCase()
  // Numbered app shells (dashboard-01, products-7) — not bare "sidebar" widgets.
  if (/^(dashboard|products|login|signup)(-\d+)?$/.test(n)) return true
  if (/^sidebar-\d+$/.test(n)) return true
  if (/^dashboard[-_]/.test(n) || /[-_]dashboard\b/.test(n)) return true
  if (/\bdashboard\b/.test(d) && /(kpi|chart|ledger|metric|revenue|workforce|ops desk|claimable|payout)/i.test(d)) {
    return true
  }
  if (
    /app shell|full[- ]page|admin (dashboard|panel)|entire (dashboard|layout)|finance desk|commerce revenue|creator finance|workforce ops|shift coverage|royalties|claimable balance/i.test(
      d
    )
  ) {
    return true
  }
  if (type === 'registry:block' && /kpi cards?.{0,40}(chart|data table)|sidebar.{0,30}header.{0,30}(kpi|chart)/i.test(d)) {
    return true
  }
  // Landing/marketing top nav is the wrong primitive for product sidebars.
  if (/top-navigation|navbar|landing.?nav/i.test(n) && /(center-aligned|whitespace|brand anchored|marketing)/i.test(d)) {
    return true
  }
  return false
}

/** Path looks like a detail/id route (/tasks/:id, /agents/agt-0007). */
export function isDetailPath(pathname: string): boolean {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length < 2) return false
  const last = parts[parts.length - 1] ?? ''
  return (
    /^[a-z]{2,}-?\d+/i.test(last) ||
    /^[a-z0-9_-]{16,}$/i.test(last) ||
    /^(agt|tsk|ins|tr|xh|mn|md|td)-/i.test(last)
  )
}
