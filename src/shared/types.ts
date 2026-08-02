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
  count: number
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
}

export interface AxeViolation {
  id: string
  impact: string | null
  help: string
  helpUrl: string
  nodes: { target: string[]; failureSummary: string }[]
}

export interface PageMetrics {
  ttfbMs: number
  domContentLoadedMs: number
  loadMs: number
  lcpMs: number | null
  cls: number | null
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
  /** Authored-CSS metrics (Project Wallace); null when no CSS could be read. */
  cssStats: CssStats | null
  /** Style Dictionary token tree extracted from authored CSS custom properties. */
  tokenDictionary?: TokenDictionary | null
  metrics: PageMetrics
  consoleErrors: string[]
  networkFailures: { url: string; status: number | string }[]
  /** Verbatim targetable controls found on the page. */
  controls: PageControl[]
  responsive: {
    viewport: string
    horizontalOverflowPx: number
    tinyTextCount: number
    smallTapTargets: number
    overlaps: number
  }[]
  links: string[]
}

export interface FlowStep {
  action: 'goto' | 'click' | 'fill' | 'press' | 'wait' | 'assertText' | 'scroll'
  target?: string
  value?: string
  note?: string
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
  }[]
  ok: boolean
  totalMs: number
  /** Where the flow came from, and whether it was runnable at all. */
  origin: 'user' | 'ai' | 'derived'
  invalid?: string
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
  maxPages: number
  viewports: Viewport[]
  useMobbin: boolean
  useShadcn: boolean
  useGemini: boolean
  /** Deep interaction probing (hover/focus/click/keyboard/forms). */
  useInteractionProbe: boolean
  provider: ProviderId
  geminiModel: string
  /** Injected by main from Settings; never persisted inside a run. */
  geminiApiKey?: string
  brutality: 'fair' | 'harsh' | 'ruthless'
  productContext: string
  flows: { name: string; steps: FlowStep[] }[]
  auth?: AuthConfig
}

export interface Run {
  id: string
  createdAt: number
  finishedAt?: number
  status: RunStatus
  config: RunConfig
  pages: CapturedPage[]
  findings: Finding[]
  flows: FlowResult[]
  references: MobbinReference[]
  recommendations: ComponentRecommendation[]
  visualDiffs: VisualDiff[]
  interactions: InteractionReport[]
  auth?: AuthResult
  scorecard?: Scorecard
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
