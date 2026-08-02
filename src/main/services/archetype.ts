/**
 * What kind of product is this, and what should we compare it against?
 *
 * The section classifier is inherently marketing-shaped: the first tall block
 * with a heading looks like a "hero", repeated items look like a "feature
 * grid". For an internal tool that is nonsense, and it poisons everything
 * downstream — searching Mobbin for "landing page hero section" when the page
 * is a task queue returns references that share nothing with the product.
 *
 * So: infer the archetype from the whole crawl, use it to correct section
 * roles, and build reference queries out of real evidence (route, headings,
 * controls) rather than a fixed marketing phrase.
 */
import type { CapturedPage, PageSection, SectionRole } from '../../shared/types.js'

export type Archetype = 'app' | 'marketing' | 'docs' | 'commerce'

export interface ArchetypeResult {
  archetype: Archetype
  confidence: number
  signals: string[]
}

const APP_ROUTES =
  /\/(dashboard|app|admin|settings|account|profile|inbox|tasks|projects|workspace|console|reports?|analytics|billing|team|members|chat|messages|notifications|library|templates|jobs|runs|agents|queue|logs)\b/i
const MARKETING_ROUTES = /\/(pricing|features|solutions|customers|testimonials|about|contact|careers|blog|press|partners)\b/i
const DOCS_ROUTES = /\/(docs|documentation|guide|reference|api|changelog|handbook)\b/i
const COMMERCE_ROUTES = /\/(products?|shop|store|cart|checkout|collections?|category|catalog)\b/i

export function detectArchetype(pages: CapturedPage[], signedIn = false): ArchetypeResult {
  const signals: string[] = []
  let app = 0
  let marketing = 0
  let docs = 0
  let commerce = 0
  let appRouteSeen = false

  if (signedIn) {
    app += 3
    signals.push('audit ran signed in')
  }

  for (const p of pages) {
    let path = ''
    try {
      path = new URL(p.url).pathname
    } catch {
      /* ignore */
    }
    const isDocs = DOCS_ROUTES.test(path)
    const isMarketing = MARKETING_ROUTES.test(path)
    if (APP_ROUTES.test(path) && !isDocs) {
      app += 2
      appRouteSeen = true
      signals.push(`app route ${path}`)
    }
    if (isMarketing) {
      marketing += 2
      signals.push(`marketing route ${path}`)
    }
    if (isDocs) {
      // Docs sites are control-dense by nature, so this has to outweigh the
      // density heuristic below or every component showcase reads as an app.
      docs += 3
      signals.push(`docs route ${path}`)
    }
    if (COMMERCE_ROUTES.test(path)) {
      commerce += 2
      signals.push(`commerce route ${path}`)
    }

    const text = p.sections.map((s) => s.textPreview).join(' ').toLowerCase()
    if (/\$\d|\/mo\b|per month|billed annually|most popular|start free trial/.test(text)) {
      marketing += 2
      signals.push('pricing/marketing copy')
    }
    if (/add to (cart|bag)|checkout|free shipping|in stock/.test(text)) {
      commerce += 2
      signals.push('commerce copy')
    }

    // Dense, control-heavy screens with little prose *hint* at application UI,
    // but it is weak evidence on its own: docs, galleries and component
    // showcases all look like this. Weight it low and never on a docs page.
    const controls = p.controls?.length ?? 0
    const prose = text.length
    if (controls >= 30 && prose < 4000 && !isDocs && !isMarketing) {
      app += 1
      signals.push(`${controls} controls with little prose`)
    }
    if (p.sections.some((s) => s.role === 'table')) {
      app += 2
      signals.push('data table present')
    }
    if (p.sections.some((s) => s.role === 'testimonials' || s.role === 'logos')) {
      marketing += 2
      signals.push('testimonials/logo wall')
    }
    // A persistent side rail is the strongest app-shell tell.
    if (p.controls?.some((c) => c.tag === 'a') && controls > 20 && p.sections.length <= 3) {
      app += 1
    }
  }

  const scores: [Archetype, number][] = [
    ['app', app],
    ['marketing', marketing],
    ['docs', docs],
    ['commerce', commerce]
  ]
  scores.sort((a, b) => b[1] - a[1])
  let [winner, top] = scores[0]

  // "It is an app" is a strong claim that changes every reference query, so it
  // needs corroboration: either we were signed in, or we saw a real app route.
  // Density alone is not enough.
  if (winner === 'app' && !signedIn && !appRouteSeen) {
    const runnerUp = scores.find(([name]) => name !== 'app' && scores[0][1] > 0)
    if (runnerUp && runnerUp[1] > 0) {
      signals.push('app signals lacked corroboration (not signed in, no app route)')
      winner = runnerUp[0]
      top = runnerUp[1]
    }
  }

  const total = app + marketing + docs + commerce || 1
  return {
    archetype: top === 0 ? 'marketing' : winner,
    confidence: Math.min(1, top / total),
    signals: [...new Set(signals)].slice(0, 8)
  }
}

/**
 * Correct marketing-shaped role guesses once we know this is an application.
 * A "hero" inside a signed-in console is really the page header or main work
 * area; a "feature grid" is really a list of records.
 */
export function refineRoles(pages: CapturedPage[], archetype: Archetype): void {
  if (archetype !== 'app') return
  for (const p of pages) {
    for (const s of p.sections) {
      const hasTable = s.components.some((c) => c.tag === 'table')
      const listish = s.components.some((c) => c.tag === 'li' && c.count >= 3)
      // Almost every app screen contains a global search box. Counting a single
      // input as "this is a form" turned every section of every page into
      // role=form, which then asked the component registry for login blocks on
      // a Kanban board. A form needs an actual <form> or several fields.
      const fieldCount = s.components
        .filter((c) => ['input', 'select', 'textarea'].includes(c.tag))
        .reduce((n, c) => n + c.count, 0)
      const isForm = s.components.some((c) => c.tag === 'form') || fieldCount >= 3

      if (s.role === 'hero' || s.role === 'features' || s.role === 'cta') {
        s.role = hasTable ? 'table' : isForm ? 'form' : listish ? 'gallery' : 'content'
        s.roleConfidence = Math.min(s.roleConfidence, 0.5)
      }
    }
  }
}

/* --------------------------- reference queries ---------------------------- */

const APP_VOCAB: Partial<Record<SectionRole, string>> = {
  nav: 'app sidebar navigation with sections and workspace switcher',
  table: 'data table screen with filters, sortable columns and row actions',
  form: 'settings form screen with grouped fields and save action',
  stats: 'dashboard overview with metric cards and charts',
  gallery: 'list view with cards, status labels and quick actions',
  content: 'application main work area with header, toolbar and content list',
  footer: 'application footer bar with status and help links'
}

/** Route name → what that screen actually is, in the words Mobbin indexes. */
const ROUTE_VOCAB: { match: RegExp; phrase: string }[] = [
  { match: /chat|message|assistant|conversation|desk/i, phrase: 'chat interface with message thread, composer and suggested prompts' },
  { match: /task|todo|queue|job|run|ticket/i, phrase: 'task list screen with status labels, filters and row actions' },
  { match: /template|librar|gallery|preset/i, phrase: 'template gallery with category filters and preview cards' },
  { match: /setting|preference|account|profile/i, phrase: 'settings screen with sidebar sections and grouped form fields' },
  { match: /billing|invoice|payment|subscription/i, phrase: 'billing screen with plan summary, usage and invoice table' },
  { match: /team|member|user|people|org/i, phrase: 'team members screen with roles table and invite action' },
  { match: /report|analytic|insight|metric|dashboard|overview|home/i, phrase: 'analytics dashboard with metric cards, charts and date range' },
  { match: /notification|inbox|activity|feed|alert/i, phrase: 'notification inbox with unread items and filters' },
  { match: /integration|connect|api|webhook/i, phrase: 'integrations screen with connected app cards and toggles' },
  { match: /log|audit|event|history/i, phrase: 'activity log screen with timestamped rows and filters' },
  { match: /project|workspace|board/i, phrase: 'project workspace screen with items and status columns' },
  { match: /search|explore|browse|directory/i, phrase: 'search results screen with filters and result list' },
  { match: /agent|workflow|automation|pipeline/i, phrase: 'workflow automation screen with steps, runs and status' }
]

function routePhrase(url: string): string | null {
  let path = ''
  try {
    path = new URL(url).pathname
  } catch {
    return null
  }
  const segments = path.split('/').filter(Boolean)
  // The entry screen of an app is its home/dashboard, whatever the first
  // heading happens to say (often an empty-state like "Caught up").
  if (segments.length === 0) return 'dashboard home screen with overview widgets, recent activity and sidebar navigation'
  const last = segments[segments.length - 1] ?? ''
  const hay = `${path} ${last}`
  for (const { match, phrase } of ROUTE_VOCAB) if (match.test(hay)) return phrase
  return null
}

function marketingVocab(role: SectionRole, context: string): string {
  const c = context ? ` for ${context}` : ''
  const map: Record<SectionRole, string> = {
    nav: `website top navigation bar with product menu and sign up button${c}`,
    hero: `landing page hero section with headline, subtext and primary call to action${c}`,
    features: `feature grid section with icons, titles and short descriptions${c}`,
    pricing: `pricing section with plan cards, feature list and upgrade buttons${c}`,
    testimonials: `customer testimonial section with quotes, avatars and company names${c}`,
    logos: `logo wall section showing customer company logos${c}`,
    faq: `frequently asked questions section with expandable accordion items${c}`,
    cta: `closing call to action band with headline and signup button${c}`,
    form: `signup form with email and password fields and submit button${c}`,
    table: `data table page with sortable columns, filters and row actions${c}`,
    gallery: `media gallery grid with image cards and captions${c}`,
    stats: `metrics section showing large numbers with labels${c}`,
    footer: `website footer with grouped link columns and social icons${c}`,
    content: `long form content page with headings and body text${c}`
  }
  return map[role]
}

/**
 * Build the Mobbin query from what this screen actually is: its route, its
 * heading, the controls it contains — not a generic role template.
 */
export function queryForSection(
  section: PageSection,
  page: CapturedPage,
  archetype: Archetype,
  context: string
): string {
  if (archetype !== 'app') {
    const base = marketingVocab(section.role, context)
    const heading = section.headings[0]
    // Anchor a generic template to the section's own words when it has some.
    return heading && heading.length > 3 && heading.length < 50 && section.role !== 'nav'
      ? `${base} titled "${heading}"`
      : base
  }

  const fromRoute = routePhrase(page.url)
  const heading = section.headings.find((h) => h.length > 2 && h.length < 40)

  const base =
    fromRoute ??
    (heading
      ? `${heading.toLowerCase()} screen in a web application`
      : (APP_VOCAB[section.role] ?? 'application screen with sidebar navigation and main content area'))

  // Add structural evidence only when it says something the phrase does not
  // already say. Mobbin matches prose, and repeating "with … with …" or
  // stacking synonyms makes the query read as a keyword list, which scores
  // worse than a clean sentence.
  const said = new Set(base.toLowerCase().split(/[^a-z]+/).filter(Boolean))
  const evidence: string[] = []
  const add = (phrase: string, keywords: string[]): void => {
    if (evidence.length >= 1) return
    if (keywords.some((k) => said.has(k))) return
    evidence.push(phrase)
  }
  if (section.components.some((c) => c.tag === 'table')) add('a data table', ['table', 'rows'])
  if (section.ctaLabels.length >= 4) add('a toolbar of actions', ['toolbar', 'actions'])
  if (section.components.some((c) => c.tag === 'input' || c.tag === 'select')) add('filters', ['filters', 'fields', 'form'])
  if (section.stats.imageCount >= 4) add('preview thumbnails', ['thumbnails', 'preview', 'cards', 'gallery'])

  const parts = [base]
  if (evidence.length) parts.push(`and ${evidence[0]}`)
  // Only qualify the domain when the user actually told us what it is;
  // "in a productivity or internal tool" is the kind of vague filler that
  // dilutes the match.
  if (context) parts.push(`in a ${context}`)

  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 480)
}

/** Flow query that matches the product, instead of always asking for signup. */
export function queryForFlows(archetype: Archetype, context: string, pages: CapturedPage[]): string {
  const suffix = context ? ` in a ${context}` : ''
  if (archetype !== 'app') return `onboarding and signup flow${suffix || ' for a web product'}`
  const routes = pages
    .map((p) => {
      try {
        return new URL(p.url).pathname
      } catch {
        return ''
      }
    })
    .join(' ')
  if (/chat|assistant|desk/i.test(routes)) return `starting a new conversation in a chat assistant app${suffix}`
  if (/task|job|queue|run/i.test(routes)) return `creating and assigning a task in a productivity app${suffix}`
  if (/setting|account/i.test(routes)) return `updating account settings in a web application${suffix}`
  return `completing a core action inside a web application dashboard${suffix}`
}
