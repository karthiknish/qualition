/** Shared contract between Electron main, preload and renderer. */

export type Severity = 'blocker' | 'critical' | 'major' | 'minor' | 'nit'

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  blocker: 40,
  critical: 18,
  major: 8,
  minor: 3,
  nit: 1
}

export type Category =
  | 'coherence'
  | 'variety'
  | 'accessibility'
  | 'responsive'
  | 'flow'
  | 'performance'
  | 'content'
  | 'craft'

export type Viewport = { name: string; width: number; height: number; isMobile: boolean }

/** Who owns the DOM/CSS node behind a finding. */
export type FindingOwnership = 'first-party' | 'third-party' | 'dev-chrome' | 'unknown'

export type FindingEffort = 'one-line' | 'component' | 'redesign'

export type FindingDelta = 'new' | 'fixed' | 'regressed' | 'unchanged'

export interface FindingProvenance {
  ownership: FindingOwnership
  /** null = not checked against a production build. */
  shipsInProduction: boolean | null
  bundle?: 'app' | 'framework' | 'vendor' | 'node_modules' | 'vite-dev'
  sourceFile?: string
  sourceLine?: number
  note?: string
}

export interface Finding {
  id: string
  category: Category
  severity: Severity
  title: string
  detail: string
  /** What a senior designer would demand instead. */
  fix: string
  pageUrl: string
  sectionId?: string
  viewport?: string
  selector?: string
  evidence?: string[]
  source: 'heuristic' | 'axe' | 'ai' | 'lighthouse' | 'pa11y'
  provenance?: FindingProvenance
  /** How hard the fix is — used for “Start here” ordering, not grade weight alone. */
  effort?: FindingEffort
  /** low = probe could not use real Tab / soft evidence. */
  confidence?: 'high' | 'low'
  /** Vs prior done run with the same targetUrl. */
  delta?: FindingDelta
  /** Pages this finding was observed on (after dedupe). */
  affectedPages?: number
  /** axe tags passthrough for filtering (wcag2a, wcag2aa, best-practice, cat.*) */
  tags?: string[]
  /** True when from axe incomplete (needs review) */
  incomplete?: boolean
}

export type BuildMode = 'development' | 'production' | 'unknown'

export interface CaptureContext {
  buildMode: BuildMode
  isLocalTarget: boolean
  hiddenDevChromeNodes: number
  buildHints: ('vite-hmr' | 'next-dev' | 'react-refresh' | 'vite-client')[]
  /** Nodes excluded from a11y counts because they are not first-party. */
  excludedDevChromeControls?: number
}

export interface SectionComponent {
  tag: string
  role: string | null
  text: string
  count: number
}

export type SectionRole =
  | 'nav'
  | 'hero'
  | 'features'
  | 'pricing'
  | 'testimonials'
  | 'logos'
  | 'faq'
  | 'cta'
  | 'form'
  | 'table'
  | 'gallery'
  | 'stats'
  | 'footer'
  | 'content'

export interface PageSection {
  id: string
  role: SectionRole
  roleConfidence: number
  label: string
  selector: string
  rect: { x: number; y: number; width: number; height: number }
  textPreview: string
  headings: string[]
  ctaLabels: string[]
  components: SectionComponent[]
  screenshot?: string
  /** Local heuristic stats used by scoring + Gemini prompt. */
  stats: {
    interactiveCount: number
    imageCount: number
    textDensity: number
    distinctBgColors: number
    distinctFontSizes: number
    maxTextWidthPx: number
  }
}

export interface DesignTokens {
  colors: { value: string; usage: number; role: 'bg' | 'text' | 'border' }[]
  fontFamilies: { value: string; usage: number }[]
  fontSizes: { value: number; usage: number }[]
  fontWeights: { value: number; usage: number }[]
  radii: { value: string; usage: number }[]
  shadows: { value: string; usage: number }[]
  spacing: { value: number; usage: number }[]
  transitions: { value: string; usage: number }[]
}

/** A pinpoint inside concatenated authored CSS (css-tree positions). */
export interface CssLocation {
  reason: 'important' | 'id-selector' | 'high-z' | 'vendor-prefix'
  line: number
  column: number
  property?: string
  selector?: string
  value?: string
}

/** Style Dictionary–shaped token inventory extracted from authored CSS. */
export interface TokenDictionary {
  tokens: Record<string, unknown>
  /** First-party custom properties kept in the publishable tree. */
  count: number
  /** Framework/vendor custom properties skipped (e.g. --tw-*). */
  frameworkCount?: number
  groups: {
    colors: number
    spacing: number
    typography: number
    radii: number
    shadows: number
    other: number
  }
  file?: string
  builtCss?: string
  buildError?: string
}

/** Authored-CSS metrics produced by @projectwallace/css-analyzer. */
export interface CssStats {
  bytes: number
  sheets: number
  rules: number
  selectors: number
  maxSpecificity: string
  importantRatio: number
  idSelectorRatio: number
  colorsTotal: number
  colorsUnique: number
  colorUniquenessRatio: number
  fontSizesUnique: number
  fontFamiliesUnique: number
  radiiUnique: number
  shadowsUnique: number
  zIndexUnique: number
  zIndexMax: number
  browserhacks: number
  vendorPrefixed: number
  customPropsDefined: number
  customPropsUnused: number
  mediaQueries: number
  quality: { performance: number; maintainability: number; complexity: number }
  qualityViolations: { id: string; score: number; value: unknown }[]
  /** css-tree source locations for the issues we care about. */
  locations: CssLocation[]
  /**
   * Attribution: metrics above are computed on first-party CSS when `scoped`
   * is true. Totals always describe everything we could collect.
   */
  attribution?: {
    scoped: boolean
    appBytes: number
    frameworkBytes: number
    vendorBytes: number
    totalBytes: number
    appSheets: number
    frameworkSheets: number
    vendorSheets: number
    missedExternals: number
    truncated: boolean
    styleAttrCount: number
    adoptedSheetCount: number
  }
}

export interface AxeViolation {
  id: string
  impact: string | null
  help: string
  helpUrl: string
  nodes: { target: string[]; failureSummary: string }[]
  /** axe tags: wcag2a, wcag2aa, best-practice, cat.*, act, section508 */
  tags?: string[]
  /** True for axe incomplete (needs review) vs violations */
  incomplete?: boolean
}

export interface PageMetrics {
  ttfbMs: number
  domContentLoadedMs: number
  loadMs: number
  lcpMs: number | null
  /** First Contentful Paint (ms) */
  fcpMs: number | null
  cls: number | null
  /** Total Blocking Time (ms) Lab approximation */
  tbtMs: number | null
  /** Interaction to Next Paint (ms) when available */
  inpMs?: number | null
  transferBytes: number
  requestCount: number
  longTaskMs: number
}

export interface CapturedPage {
  url: string
  title: string
  ok: boolean
  status: number
  errorText?: string
  screenshots: Record<string, string> // viewport name -> file path
  sections: PageSection[]
  tokens: DesignTokens
  axe: AxeViolation[]
  /** axe incomplete = needs review (not counted as violation but triaged). */
  axeIncomplete?: AxeViolation[]
  /** Authored-CSS metrics (Project Wallace); null when no CSS could be read. */
  cssStats: CssStats | null
  /** Style Dictionary token tree extracted from authored CSS custom properties. */
  tokenDictionary?: TokenDictionary | null
  metrics: PageMetrics
  consoleErrors: string[]
  networkFailures: { url: string; status: number | string }[]
  /** Soft tool failures (axe / CSS / …) so the report is not silently incomplete. */
  toolFailures?: { tool: string; message: string }[]
  /** Verbatim targetable controls found on the page. */
  controls: PageControl[]
  /** Dev vs prod honesty + how much debug chrome was hidden. */
  captureContext?: CaptureContext
  /** Raw extract signals (a11y counts etc.). */
  signals?: Record<string, unknown>

  responsive: {
    viewport: string
    horizontalOverflowPx: number
    tinyTextCount: number
    smallTapTargets: number
    overlaps: number
  }[]
  links: string[]
  /** Stable hash of the page's HTML (sha256, hex slice) for incremental diff. */
  htmlHash?: string
}

export interface FlowStep {
  action: 'goto' | 'click' | 'fill' | 'press' | 'wait' | 'assertText' | 'scroll'
  target?: string
  value?: string
  note?: string
  /** Human-readable intent that survives refactors better than a selector. */
  intent?: string
}

/** A control that genuinely exists on the page — the only legal flow target. */
export interface PageControl {
  tag: string
  type: string
  role: string
  /** False for readonly/disabled fields — they can never be filled. */
  editable?: boolean
  text: string
  placeholder: string
  label: string
  ariaLabel: string
  name: string
  href: string
  testId: string
}

export type FlowStepOutcome = 'ok' | 'refused' | 'absent' | 'timeout' | 'error' | 'skipped'

export interface FlowStartingState {
  signedInAs?: string
  storageStateId?: string
  seededDataNote?: string
}

export interface FlowResult {
  name: string
  steps: {
    step: FlowStep
    ok: boolean
    ms: number
    error?: string
    screenshot?: string
    /** True when the step never ran because its target does not exist. */
    skipped?: boolean
    outcome?: FlowStepOutcome
    domSnapshot?: string
    humanConfirmed?: boolean
  }[]
  ok: boolean
  totalMs: number
  /** Where the flow came from, and whether it was runnable at all. */
  origin: 'user' | 'ai' | 'derived'
  invalid?: string
  startingState?: FlowStartingState
}

export interface MobbinReference {
  sectionId?: string
  query: string
  kind: 'screen' | 'flow' | 'section'
  title: string
  appName?: string
  /** Human description of the screen, taken from the full-resolution asset. */
  description?: string
  imageUrl?: string
  mobbinUrl?: string
}

export interface ComponentRecommendation {
  sectionId: string
  /** Page this section was captured on — used for page-scoped fix prompts. */
  pageUrl?: string
  sectionRole: SectionRole
  reason: string
  /** Which catalogue answered: shoogle (community registries) or shadcn (first-party). */
  source: 'shoogle' | 'shadcn' | 'mixed'
  items: {
    name: string
    registry: string
    type: string
    description: string
    addCommand: string
    docs?: string
    source: 'shoogle' | 'shadcn'
  }[]
}

/* ------------------------------ interaction ------------------------------- */

export interface InteractionReport {
  url: string
  viewport: string
  controlsProbed: number
  deadClicks: string[]
  noFocusIndicator: string[]
  noHoverFeedback: string[]
  fakeButtons: string[]
  unnamedControls: string[]
  brokenDisabled: string[]
  overlays: { trigger: string; focusMoved: boolean; escapeCloses: boolean }[]
  forms: {
    index: number
    fields: number
    required: number
    submitLabel: string
    validationFeedback: boolean
    screenshot?: string
  }[]
  keyboard: {
    positiveTabIndex: number
    tabStops: number
    reachableRatio: number
    escapeClosesOverlay: boolean | null
    focusTrapOk: boolean | null
  }
}

/* -------------------------------- providers ------------------------------- */

export type ProviderId = 'gemini' | 'openai' | 'cursor' | 'openrouter'

/** A selectable model, with cost when the provider publishes it. */
export interface ModelInfo {
  id: string
  label?: string
  /** USD per 1M tokens. */
  promptPrice?: number
  completionPrice?: number
  contextTokens?: number
  vision?: boolean
  /** live = fetched from the provider now; list = published list price. */
  priceSource?: 'live' | 'list'
}

export interface ProviderStatus {
  id: ProviderId
  ok: boolean
  detail: string
  model?: string
}

export interface VisualDiff {
  url: string
  viewport: string
  changedRatio: number
  changedPixels: number
  baselineRunId: string
  diffImage?: string
  currentImage?: string
  baselineImage?: string
}

export interface Scorecard {
  overall: number
  grade: string
  verdict: string
  categories: Record<Category, { score: number; findings: number }>
  /** Linear/Stripe-bar craft subscore (heuristics ± optional AI blend). */
  premium?: {
    score: number
    grade: string
    dimensions: {
      hierarchy: number
      typography: number
      spacing: number
      density: number
      elevation: number
      consistency: number
      distinctiveness: number
    }
    pageCount: number
    aiBlend?: boolean
  }
}

export type RunStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

/** Credentials for auditing a signed-in experience. Never persisted with the run. */
export interface AuthConfig {
  username: string
  password: string
  /** Optional explicit login page; guessed from common paths when blank. */
  loginUrl?: string
  usernameSelector?: string
  passwordSelector?: string
  submitSelector?: string
  /** Persist to the encrypted vault once the login succeeds. */
  remember?: boolean
  /** Use the vault entry for this origin instead of a typed password. */
  useSaved?: boolean
}

/** Vault entry as exposed to the UI — never contains the password. */
export interface SavedCredential {
  origin: string
  username: string
  loginUrl?: string
  encrypted: boolean
  updatedAt: number
}

export interface AuthResult {
  ok: boolean
  detail: string
  storageStatePath?: string
  landedUrl?: string
  screenshot?: string
}

export interface RunConfig {
  targetUrl: string
  /** Optional production URL for a lightweight second pass (provenance / CSS weight). */
  productionUrl?: string
  maxPages: number
  /**
   * Path/URL patterns to skip during crawl (never captured or audited).
   * e.g. `/login`, `/settings/*`, `http://localhost:5173/legacy`
   */
  ignorePages?: string[]
  viewports: Viewport[]
  useMobbin: boolean
  useShadcn: boolean
  useGemini: boolean
  /** Deep interaction probing (hover/focus/click/keyboard/forms). */
  useInteractionProbe: boolean
  /** Lighthouse perf / a11y / best-practices / SEO pass (own Chrome). */
  useLighthouse: boolean
  provider: ProviderId
  geminiModel: string
  /** Injected by main from Settings; never persisted inside a run. */
  geminiApiKey?: string
  brutality: 'fair' | 'harsh' | 'ruthless'
  productContext: string
  flows: { name: string; steps: FlowStep[] }[]
  auth?: AuthConfig
  /** Project grouping — assigned by main from targetUrl origin. */
  projectId?: string
  /** Diff mode: only deep-audit pages that changed vs baseline. */
  diffMode?: 'full' | 'changed-only'
  /** Explicit baseline for diff mode; defaults to latest done run for project. */
  baselineRunId?: string
  /** Locale-aware budgets (LHCI/sitespeed-style): minScore / maxFindings per severity + per-metric. */
  budgets?: {
    minScore?: number
    maxFindings?: Partial<Record<Severity, number>>
    /** Per-metric thresholds: fail gate when violated */
    metrics?: {
      maxLcpMs?: number
      maxCls?: number
      maxTbtMs?: number
      maxFcpMs?: number
      maxTransferBytes?: number
      minLighthousePerformance?: number
      minLighthouseAccessibility?: number
      minLighthouseBestPractices?: number
      minLighthouseSeo?: number
    }
    /** Per-URL budgets (Sitespeed budget.json) */
    budgets?: Array<{ url: string; metrics: { maxLcpMs?: number; maxCls?: number; maxTbtMs?: number; maxTransferBytes?: number; maxFcpMs?: number } }>
    /** Per-category minimum scores (0-100) */
    perCategory?: Partial<Record<Category, number>>
  }
  /** Lighthouse formFactor / throttling parity */
  formFactor?: 'desktop' | 'mobile'
  throttling?: { rttMs?: number; throughputKbps?: number; cpuSlowdownMultiplier?: number; method?: 'simulate' | 'devtools' }
  /** axe runOptions parity */
  axe?: { tags?: string[]; disabledRules?: string[]; runOnly?: string[] }
  /** Number of runs to median for flaky metrics (LHCI numberOfRuns) */
  numberOfRuns?: number
  /** Lighthouse onlyCategories override */
  onlyCategories?: string[]
  /** PWA audits */
  includePwa?: boolean
  /** When true, skip sitemap discovery and use BFS only. */
  disableSitemap?: boolean
}

export interface Project {
  id: string
  slug: string
  name: string
  origin: string
  targetUrl: string
  createdAt: number
  updatedAt: number
  runCount: number
  lastRunId?: string
  lastRunAt?: number
}

export interface Run {
  id: string
  projectId?: string
  baselineRunId?: string
  createdAt: number
  finishedAt?: number
  status: RunStatus
  config: RunConfig
  pages: CapturedPage[]
  findings: Finding[]
  /** Nodes excluded because they are not first-party (explained silence). */
  excludedFindings?: Finding[]
  flows: FlowResult[]
  references: MobbinReference[]
  recommendations: ComponentRecommendation[]
  visualDiffs: VisualDiff[]
  interactions: InteractionReport[]
  auth?: AuthResult
  scorecard?: Scorecard
  /** Dominant capture context across pages (dev vs prod honesty). */
  buildMode?: BuildMode
  /** Prior run this report was diffed against. */
  comparedToRunId?: string
  /** What kind of product this is, and why we think so. */
  archetype?: { archetype: 'app' | 'marketing' | 'docs' | 'commerce'; confidence: number; signals: string[] }
  themeSummary?: string
  geminiNotes?: string
  /** Lighthouse category scores (0–1), when the pass ran. */
  lighthouse?: {
    performance: number | null
    accessibility: number | null
    bestPractices: number | null
    seo: number | null
  }
  /** Why Lighthouse is missing or partial (soft-fail / skipped SEO for apps). */
  lighthouseNote?: string
  /** Incremental diff summary when diffMode === 'changed-only'. */
  diffSummary?: {
    baselineRunId: string
    totalPages: number
    changedPages: number
    unchangedPages: number
    newPages: number
    removedPages: number
    reusedFromBaseline: number
  }
  /** Baseline approval: only approved runs become eligible baselines (auto-approve by default). */
  approved?: boolean
  /** Git context for branch-aware baseline picking (LHCI/Argos parity). */
  git?: { branch?: string; sha?: string; baseSha?: string; baseBranch?: string }
  error?: string
  log: { ts: number; level: 'info' | 'warn' | 'error'; msg: string }[]
}

export interface RunProgress {
  runId: string
  phase: string
  pct: number
  msg: string
}

/** In-app update state, mirrored to the renderer. */
export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'ready' | 'error' | 'dismissed' | 'dev'
  currentVersion: string
  version?: string
  percent?: number
  releaseNotes?: string
  releaseDate?: string
  error?: string
  /** False on unsigned macOS builds — we can announce but not self-install. */
  canSelfInstall?: boolean
}

export interface IntegrationStatus {
  mobbin: { ok: boolean; detail: string; source?: string }
  shoogle: { ok: boolean; detail: string }
  shadcn: { ok: boolean; detail: string; registries: string[] }
  model: ProviderStatus
  playwright: { ok: boolean; detail: string }
}

export interface Settings {
  provider: ProviderId
  geminiApiKey: string
  geminiModel: string
  openaiApiKey: string
  openaiBaseUrl: string
  openaiModel: string
  cursorBinary: string
  cursorApiKey: string
  cursorModel: string
  openrouterApiKey: string
  openrouterModel: string
  defaultBrutality: RunConfig['brutality']
  maxPages: number
  interactionProbe: boolean
  maxControlsProbed: number
  /** Convenience only — the password is never stored. */
  lastAuthUsername: string
  extraRegistries: { name: string; url: string }[]
}

export function modelFor(s: Settings): string {
  switch (s.provider) {
    case 'openai':
      return s.openaiModel
    case 'cursor':
      return s.cursorModel
    case 'openrouter':
      return s.openrouterModel
    default:
      return s.geminiModel
  }
}
