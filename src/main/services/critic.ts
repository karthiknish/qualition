/**
 * AI critique layer — provider agnostic.
 *
 * Heuristics catch what is measurable; the critic judges what is only visible:
 * hierarchy, theme coherence, whether a section looks like the reference-class
 * work pulled from Mobbin. Vision providers get screenshots; text-only
 * providers (Cursor CLI) get the same evidence rendered as structured text so
 * the critique is still grounded rather than invented.
 */
import type {
  CapturedPage,
  Category,
  Finding,
  InteractionReport,
  MobbinReference,
  PageSection,
  RunConfig,
  Severity
} from '../../shared/types.js'
import { createProvider, extractJson, type Provider, type ImageInput } from './providers.js'
import {
  findingsFromAiPremiumScores,
  type PremiumDimensionScores
} from './premiumCraft.js'

const PERSONA = `You are Qualition's principal design critic. You have shipped and killed a lot of interfaces.
You are blunt, specific and evidence-driven. You never praise generically, never hedge, and never invent details you cannot see in the evidence.
You care, in order: (1) does the interface communicate hierarchy in one glance, (2) is the visual system coherent — one type scale, one spacing rhythm, one radius language, one colour semantic, (3) is there enough *variety* that the page has rhythm rather than being an endless stack of identical slabs, (4) does the flow remove friction — including the states most teams forget: hover, focus, disabled, loading, empty, error, (5) craft details: alignment, optical spacing, contrast, focus states.
Finding categories MUST be one of: coherence, variety, accessibility, responsive, flow, performance, content, craft. Never invent categories like hierarchy/typography/spacing/density — fold those into craft or coherence.
When reference imagery from Mobbin is supplied, compare against it concretely: what the reference does structurally that this does not.
AI-SLOP BAN (impeccable.style): flag purple/violet gradients, cyan-on-dark neon, cream/beige default surfaces, Inter/Geist/Roboto as the whole personality, gradient text, side colour accents on cards/sections/list items (no coloured left/right edge stripes), nested cards, icon-tile-above-heading feature grids, hero eyebrow pills, bounce/elastic easing, colored glow shadows, decorative pulsing dots. Prefer distinctive type and intentional palette over fake depth.
FOCUS CRAFT: when calling for a focus indicator, require :focus-visible only — soft offset ring/outline via tokens. Ban thick border-on-:focus or border-on-:active “rings” that leave a harsh pressed look for mouse users.
PREMIUM BAR: grade visual craft against Linear/Stripe — clear hierarchy (size+weight+contrast), 6–8 step type scale, 8px spacing rhythm, intentional density, 1–3 elevation layers, one icon/border language, soft states. Score premiumScores 0–4 per dimension; write premiumVerdict in one blunt sentence.`

const findingSchema = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['coherence', 'variety', 'accessibility', 'responsive', 'flow', 'performance', 'content', 'craft']
          },
          severity: { type: 'string', enum: ['blocker', 'critical', 'major', 'minor', 'nit'] },
          title: { type: 'string' },
          detail: { type: 'string' },
          fix: { type: 'string' },
          sectionId: { type: 'string' }
        },
        required: ['category', 'severity', 'title', 'detail', 'fix']
      }
    },
    themeRead: { type: 'string' },
    verdict: { type: 'string' },
    premiumScores: {
      type: 'object',
      properties: {
        hierarchy: { type: 'number' },
        typography: { type: 'number' },
        spacing: { type: 'number' },
        density: { type: 'number' },
        elevation: { type: 'number' },
        consistency: { type: 'number' },
        distinctiveness: { type: 'number' }
      }
    },
    premiumVerdict: { type: 'string' }
  },
  required: ['findings', 'premiumScores']
}

function brutalityLine(b: RunConfig['brutality']): string {
  return b === 'ruthless'
    ? 'Grade as if this were a portfolio review at a top product studio: nothing is "good enough". Flag everything a senior designer would redline, including optical details.'
    : b === 'harsh'
      ? 'Grade as a demanding design lead in a shipping review: call out anything that would block a release or embarrass the team.'
      : 'Grade as a helpful peer reviewer: focus on issues that materially affect users.'
}

let counter = 0

/**
 * A model's visual judgement is valuable but not verified, so it may not award
 * `blocker` — that severity hard-caps the run's score and is reserved for
 * things we proved: a page that did not load, an HTTP error, a journey that
 * genuinely dead-ends. Without this, one confident sentence about a mobile
 * layout sinks an entire audit.
 */
function clampSeverity(s: unknown): Severity {
  const value = (s ?? 'minor') as Severity
  return value === 'blocker' ? 'critical' : value
}

const VALID_CATEGORIES = new Set<Category>([
  'coherence',
  'variety',
  'accessibility',
  'responsive',
  'flow',
  'performance',
  'content',
  'craft'
])

/** Map premium-dimension / freeform labels the model invents onto scored categories. */
const CATEGORY_ALIASES: Record<string, Category> = {
  hierarchy: 'craft',
  typography: 'craft',
  spacing: 'craft',
  density: 'craft',
  elevation: 'craft',
  consistency: 'coherence',
  distinctiveness: 'variety',
  comparison: 'craft',
  visual: 'craft',
  layout: 'craft',
  ux: 'flow',
  ui: 'craft',
  a11y: 'accessibility',
  a11yity: 'accessibility',
  copy: 'content',
  writing: 'content',
  motion: 'craft',
  animation: 'craft',
  color: 'coherence',
  colour: 'coherence',
  theme: 'coherence'
}

export function clampCategory(c: unknown): Category {
  const raw = String(c ?? 'craft').toLowerCase().trim()
  if (VALID_CATEGORIES.has(raw as Category)) return raw as Category
  return CATEGORY_ALIASES[raw] ?? 'craft'
}

function toFindings(raw: any, pageUrl: string): Finding[] {
  const list: any[] = raw?.findings ?? []
  return list.slice(0, 40).map((f) => ({
    id: `g${++counter}`,
    category: clampCategory(f.category),
    severity: clampSeverity(f.severity),
    title: String(f.title ?? '').slice(0, 160),
    detail: String(f.detail ?? '').slice(0, 1200),
    fix: String(f.fix ?? '').slice(0, 800),
    pageUrl,
    sectionId: f.sectionId || undefined,
    source: 'ai' as const
  }))
}

export function makeCritic(config: RunConfig, creds: Parameters<typeof createProvider>[1]): Provider {
  return createProvider(config.provider, creds)
}

/** Evidence rendered as text — used verbatim for text-only providers. */
function evidenceText(page: CapturedPage, interaction?: InteractionReport): string {
  const t = page.tokens
  const c = page.cssStats
  const lines = [
    `URL: ${page.url}`,
    `TITLE: ${page.title}`,
    `SECTIONS (id · role · label · height):`,
    ...page.sections.map((s) => `  ${s.id} · ${s.role} · ${s.rect.height}px · ${s.stats.interactiveCount} interactive · ${s.stats.distinctFontSizes} type sizes · headings: ${s.headings.slice(0, 3).join(' | ')} · CTAs: ${s.ctaLabels.slice(0, 4).join(' | ')}`),
    `RENDERED TOKENS: ${new Set(t.colors.map((x) => x.value)).size} colours, fonts ${t.fontFamilies.map((f) => f.value).join('/')}, sizes ${t.fontSizes.map((s) => s.value).join(',')}px, radii ${t.radii.map((r) => r.value).join('|')}, ${t.shadows.length} shadows`,
    c
      ? `AUTHORED CSS: ${(c.bytes / 1024).toFixed(0)}kB, ${c.rules} rules, colour uniqueness ${(c.colorUniquenessRatio * 100).toFixed(0)}%, ${c.fontSizesUnique} font sizes, ${c.radiiUnique} radii, ${c.shadowsUnique} shadows, !important ${(c.importantRatio * 100).toFixed(1)}%, max specificity (${c.maxSpecificity}), z-index max ${c.zIndexMax}, maintainability ${c.quality.maintainability}`
      : 'AUTHORED CSS: unavailable',
    `METRICS: LCP ${page.metrics.lcpMs ?? 'n/a'}ms, CLS ${page.metrics.cls ?? 'n/a'}, ${(page.metrics.transferBytes / 1e6).toFixed(1)}MB, ${page.metrics.requestCount} requests`,
    `AXE: ${page.axe.length} violations — ${page.axe.slice(0, 6).map((v) => v.help).join('; ')}`,
    `CONSOLE ERRORS: ${page.consoleErrors.length}`
  ]
  if (interaction) {
    lines.push(
      `INTERACTION PROBE (${interaction.controlsProbed} controls actually exercised):`,
      `  dead clicks: ${interaction.deadClicks.length ? interaction.deadClicks.slice(0, 6).join(', ') : 'none'}`,
      `  no focus indicator: ${interaction.noFocusIndicator.length ? interaction.noFocusIndicator.slice(0, 6).join(', ') : 'none'}`,
      `  no hover feedback: ${interaction.noHoverFeedback.length ? interaction.noHoverFeedback.slice(0, 6).join(', ') : 'none'}`,
      `  unnamed controls: ${interaction.unnamedControls.length ? interaction.unnamedControls.slice(0, 6).join(', ') : 'none'}`,
      `  fake buttons: ${interaction.fakeButtons.length}`,
      `  overlays: ${interaction.overlays.map((o) => `${o.trigger}(esc=${o.escapeCloses}, focus=${o.focusMoved})`).join(', ') || 'none opened'}`,
      `  forms: ${interaction.forms.map((f) => `${f.submitLabel || `#${f.index}`}: ${f.required} required, validation feedback=${f.validationFeedback}`).join('; ') || 'none'}`,
      `  keyboard: ${interaction.keyboard.tabStops} tab stops, positive tabindex ${interaction.keyboard.positiveTabIndex}`
    )
  }
  const premium = (page.signals as { premium?: Record<string, unknown> } | undefined)?.premium
  if (premium) {
    lines.push(
      `PREMIUM SIGNALS (measured — treat as facts for scoring): ${JSON.stringify(premium)}`
    )
  }
  return lines.join('\n')
}

function parsePremiumScores(raw: unknown): PremiumDimensionScores | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const keys: (keyof PremiumDimensionScores)[] = [
    'hierarchy',
    'typography',
    'spacing',
    'density',
    'elevation',
    'consistency',
    'distinctiveness'
  ]
  const out = {} as PremiumDimensionScores
  let n = 0
  for (const k of keys) {
    const v = Number(o[k])
    if (Number.isFinite(v)) {
      out[k] = Math.max(0, Math.min(4, v))
      n++
    }
  }
  return n >= 4 ? out : undefined
}

async function generateFindings(
  provider: Provider,
  model: string,
  system: string,
  prompt: string,
  images: ImageInput[],
  pageUrl: string
): Promise<{
  findings: Finding[]
  themeRead?: string
  verdict?: string
  premiumScores?: PremiumDimensionScores
  premiumVerdict?: string
}> {
  const text = await provider.generate(model, {
    system,
    prompt,
    images: provider.supportsVision ? images : undefined,
    schema: findingSchema,
    temperature: 0.4
  })
  const raw = extractJson(text) ?? { findings: [] }
  return {
    findings: toFindings(raw, pageUrl),
    themeRead: raw.themeRead,
    verdict: raw.verdict,
    premiumScores: parsePremiumScores(raw.premiumScores),
    premiumVerdict: raw.premiumVerdict ? String(raw.premiumVerdict).slice(0, 280) : undefined
  }
}

/** Whole-page critique across viewports. */
export async function critiquePage(
  provider: Provider,
  model: string,
  page: CapturedPage,
  config: RunConfig,
  interaction?: InteractionReport
): Promise<{
  findings: Finding[]
  themeRead?: string
  verdict?: string
  premiumScores?: PremiumDimensionScores
  premiumVerdict?: string
}> {
  const images: ImageInput[] = Object.entries(page.screenshots).map(([vp, path]) => ({
    path,
    caption: `Viewport: ${vp}`
  }))

  const prompt = `${brutalityLine(config.brutality)}
PRODUCT CONTEXT: ${config.productContext || 'unspecified'}
${provider.supportsVision ? `Full-page screenshots follow, one per viewport (${Object.keys(page.screenshots).join(', ')}).` : 'No imagery is available to you — reason strictly from the measured evidence below and say so rather than guessing at visuals.'}

MEASURED EVIDENCE (already verified by static analysis and by actually operating the UI — do not repeat it, build on it):
${evidenceText(page, interaction)}

Return findings a static analyser could NOT produce: visual hierarchy failures, theme incoherence, monotony/rhythm problems, mismatched component vocabulary, missing interaction states, copy that undercuts the design, sections that look unfinished or templated. Attribute each finding to a sectionId when possible.
Also return premiumScores (0–4 each: hierarchy, typography, spacing, density, elevation, consistency, distinctiveness) against a Linear/Stripe bar — use PREMIUM SIGNALS as facts, do not invent font sizes — and premiumVerdict (one sentence).
Then give themeRead (one paragraph describing the actual design language: palette temperature, type personality, density, era) and verdict (3 sentences, brutal, specific).`

  const res = await generateFindings(provider, model, PERSONA, prompt, images, page.url)
  if (res.premiumScores) {
    const extra = findingsFromAiPremiumScores(
      page,
      res.premiumScores,
      res.findings.map((f) => f.title)
    )
    res.findings = [...res.findings, ...extra]
  }
  return res
}

/** Section-level critique against Mobbin reference imagery. */
export async function critiqueSectionAgainstReferences(
  provider: Provider,
  model: string,
  page: CapturedPage,
  section: PageSection,
  refs: MobbinReference[],
  config: RunConfig
): Promise<Finding[]> {
  if (!section.screenshot && provider.supportsVision) return []

  const images: ImageInput[] = []
  if (section.screenshot) images.push({ path: section.screenshot, caption: 'Section under review' })
  for (const r of refs.slice(0, 3)) {
    if (r.imageUrl && !r.imageUrl.startsWith('http'))
      images.push({ path: r.imageUrl, caption: `Mobbin reference — ${r.appName ?? r.title} (${r.mobbinUrl ?? ''})` })
  }

  const prompt = `SECTION UNDER REVIEW — id ${section.id}, detected role "${section.role}", page ${page.url}.
NOTE: this tool labels a section with the first heading it finds inside it, which is often NOT the section's real name. Do not report a mismatch between that label and the visible heading as a product defect — judge only what is visible in the evidence.
${brutalityLine(config.brutality)}
${provider.supportsVision ? `Its own screenshot comes first, then ${images.length - 1} reference screenshot(s) from Mobbin of the same section type in shipped products.` : `Reference products for this section type: ${refs.map((r) => r.appName ?? r.title).join(', ') || 'none available'}.`}

Section facts: ${section.stats.interactiveCount} interactive elements, ${section.stats.imageCount} media, ${section.stats.distinctFontSizes} type sizes, ${section.stats.distinctBgColors} surfaces, longest text measure ${section.stats.maxTextWidthPx}px.
Headings: ${section.headings.join(' | ') || 'none'}
CTAs: ${section.ctaLabels.join(' | ') || 'none'}

Compare structurally, not stylistically-by-imitation. What does the reference class do that this section fails to do (information order, proof placement, density, focal contrast, use of imagery, CTA framing)? Where is the theme incoherent with the rest of the product? What component vocabulary is hand-rolled that should be a system primitive?
Every finding must set sectionId to "${section.id}".`

  const res = await generateFindings(provider, model, PERSONA, prompt, images, page.url)
  return res.findings.map((f) => ({ ...f, sectionId: f.sectionId ?? section.id }))
}

/** Ask the model to propose realistic user flows to stress-test. */
export async function proposeFlows(
  provider: Provider,
  model: string,
  pages: CapturedPage[],
  inventory: string
): Promise<{ name: string; steps: any[] }[]> {
  const schema = {
    type: 'object',
    properties: {
      flows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  action: { type: 'string', enum: ['goto', 'click', 'fill', 'press', 'wait', 'assertText', 'scroll'] },
                  target: { type: 'string' },
                  value: { type: 'string' },
                  note: { type: 'string' }
                },
                required: ['action']
              }
            }
          },
          required: ['name', 'steps']
        }
      }
    },
    required: ['flows']
  }

  const text = await provider.generate(model, {
    system:
      'You design end-to-end UI test flows for a site that has already been crawled. You may only use routes and controls that were actually observed. Inventing plausible-sounding routes or field labels produces false failures and is worse than proposing nothing. Output JSON only.',
    prompt: `Below is the VERBATIM inventory of what the crawler actually found: every route it captured, and the exact clickable labels and form fields present on each. This is the complete set of things that exist.

HARD RULES — a flow that breaks any of these will be discarded:
- goto targets MUST be one of the ROUTE paths listed below. Do not invent /login, /contact, /pricing or any other route that is not listed.
- click targets MUST use a label copied EXACTLY from that route's "clickable" list, as "text=<label>".
- fill targets MUST use a handle copied EXACTLY from that route's "fields" list ("placeholder=…", "label=…" or a [name=…] selector).
- assertText values MUST be distinctive visible copy from the inventory — never "body", "html", "page", or "content".
- NEVER assertText a field placeholder (e.g. "Search tasks…") — placeholders disappear after fill and cause false failures. Assert a result heading, empty-state message, or detail title instead.
- NEVER assertText soft-404 / missing-record copy ("not found", "no run at this address", "not on this desk"). Landing there means the journey failed.
- if a route has no fields, do not propose a form flow for it.
- never pay, purchase, delete, or create a real account; use qualition+test@example.com for any email field.
- 5–12 steps per flow, ending with an assertText that proves the journey worked.

WHAT MAKES A GOOD FLOW HERE: go *deep* into the product. Prefer journeys that:
1. Open a list/index route, then goto a nested detail/ID route from the inventory (e.g. /tasks → /tasks/<id>), assert the detail, interact with a control there.
2. Fill a real field, then assert an *outcome* (filtered list, empty state CTA, detail title) — never re-assert the placeholder you just typed into.
3. Chain 3+ clicks with an assertText after each so a dead control is caught at the exact step.
4. When possible, mirror steps common in polished product flows: search→open, confirm before submit, land on success feedback.

Sidebar-only hops (Overview → Tasks → Review with no detail open) are weak — include at least 2 flows that visit a nested detail route when the inventory lists any.

Propose up to 8 flows, covering different routes rather than variations of one. If the inventory
does not support a meaningful flow, return fewer — an empty list is a valid answer.

INVENTORY:
${inventory}`,
    schema,
    temperature: 0.3
  })
  return extractJson(text)?.flows ?? []
}

/** Final cross-page verdict, written after everything else is known. */
export async function finalVerdict(
  provider: Provider,
  model: string,
  findings: Finding[],
  theme: string,
  pageUrls: string[]
): Promise<string> {
  const bySeverity = ['blocker', 'critical', 'major', 'minor', 'nit']
    .map((s) => `${s}: ${findings.filter((f) => f.severity === s).length}`)
    .join(', ')
  const top = findings
    .filter((f) => f.severity === 'blocker' || f.severity === 'critical' || f.severity === 'major')
    .slice(0, 30)
    .map((f) => `- [${f.category}/${f.severity}] ${f.title}`)
    .join('\n')

  return (
    await provider.generate(model, {
      system: PERSONA,
      prompt: `Pages audited: ${pageUrls.join(', ')}
Detected design language: ${theme}
Finding counts: ${bySeverity}
Top issues:
${top}

Write the executive verdict: 5–8 sentences. Name the single systemic root cause behind most findings, state what to fix first in order, and say plainly whether this is shippable. No pleasantries, no summary of the list.`,
      temperature: 0.5
    })
  ).trim()
}
