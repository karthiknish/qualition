# Qualition

A desktop app that stress-tests real websites and grades them **brutally** on UI/UX quality,
theme coherence and visual variety — then tells you which components to replace.

```
npm install
npm run browsers      # one-time: playwright chromium
npm run dev
npm test              # 17 unit tests over the deterministic rules
```

## What a run does

1. **Crawls** the target in a real Chromium (Playwright), same-origin, breadth-first, at
   desktop / tablet / mobile viewports. Full-page screenshots per viewport, per-section
   screenshots, console errors, failed requests, LCP / CLS / long-task / transfer metrics.
2. **Extracts the design system two ways.**
   *Rendered:* every colour, font family/size/weight, radius, shadow, spacing value and
   transition signature sampled from the live DOM, plus a section map (hero, pricing, faq,
   form, table, footer…).
   *Authored:* the actual stylesheets are collected (same-origin inline, cross-origin fetched)
   and run through [`@projectwallace/css-analyzer`](https://github.com/projectwallace/css-analyzer)
   + `css-code-quality` — uniqueness ratios, `!important` density, ID-selector ratio,
   specificity peaks, z-index sprawl, browser hacks, unused custom properties, maintainability
   and complexity scores. Rendered CSS shows what users see; authored CSS shows the rot.
   Colour maths uses **CIEDE2000** via [culori](https://github.com/Evercoder/culori), which
   parses `lab()` / `oklch()` / `color()` natively — so "two greys nobody can tell apart" is a
   perceptual claim, not an RGB guess.
3. **Audits deterministically** (`src/main/services/audit.ts`). Two failure modes are punished:
   - *incoherence* — palette sprawl, near-duplicate colours (ΔE < 3.5), font-size continuum
     instead of a scale, five radii, off-4px-grid spacing, motion inconsistency;
   - *monotony* — flat section rhythm, repeated identical bands, no surface contrast, CTA
     copy repeated with no hierarchy.
   Plus [`@axe-core/playwright`](https://github.com/dequelabs/axe-core-npm) (WCAG 2.1 AA +
   best-practice, injected into every frame), responsive overflow / tap-target / overlap checks,
   runtime and Core-Web-Vitals thresholds.
4. **Pulls reference UI from Mobbin** for each detected section role and caches the imagery
   locally next to the run. The MCP inlines a 768×523 preview, so each reference is upgraded to
   the screen's full asset (typically **1440×1024 — ~3.5× the pixels**) by reading the single
   `file.*` image off its screen page, which also yields Mobbin's own human description of the
   screen. Best-effort: any failure keeps the preview.
5. **Critiques with Gemini** — full-page vision pass per page, then a per-section pass that
   compares your section against the Mobbin references and returns structured findings.
6. **Recommends shadcn replacements** per section (registry primitives + blocks) with the
   exact `npx shadcn@latest add …` command.
7. **Actually operates the UI** (`interaction.ts`) — this is the part most audits skip. Every
   control is inventoried, then hovered, focused, keyboard-driven and safely clicked:
   - **dead clicks** — activated with no URL / DOM / dialog / `aria-expanded` / theme / form-state
     change. The change-signature includes root classes, `data-state`, `aria-selected|pressed|checked`
     and body background, so theme toggles and tab switches are *not* false positives.
   - **invisible focus** — focused with zero computed-style delta (WCAG 2.4.7)
   - **no hover feedback** — `cursor:pointer` with no visual response
   - **fake buttons** — clickable divs with no role and no tab stop
   - **broken disabled** — `aria-disabled` that still accepts clicks
   - **overlays** — does Escape close it, does focus move into it
   - **silent forms** — submits empty with required fields and shows no error, no `aria-invalid`,
     no native validation
   - **keyboard** — tab-stop sweep, positive `tabindex`, focus landing on hidden elements
   Destructive controls (delete / pay / logout / …) are never activated. The whole probe runs
   under a wall-clock budget with per-step timeouts, so a hostile page degrades to partial
   results instead of hanging.
8. **Replays flows — grounded in what actually exists.** During the crawl every page's
   targetable controls are recorded verbatim (button labels, field placeholders, labels, names,
   test ids). Flows come from one of three places, in order: **yours**, then a **model proposal**
   constrained to that inventory, then **derived** journeys built directly from the crawl (route
   sweep, primary CTA, header navigation, scroll-to-footer) so leaving the box empty still tests
   something real even with AI switched off.

   Every flow is then **validated before it runs**: a `goto` must target a route the crawl
   captured, and a `click`/`fill`/`assertText` must reference a handle that was actually seen.
   Flows that fail validation are discarded, not executed — this is what stops a model inventing
   `/contact` and `placeholder=Enter your email` for a product that has neither, burning a
   timeout per step and then blaming your product for the failure. Because every surviving
   target is known to exist, a failure at run time really is a dead end, and only those become
   critical findings.
9. **Diffs against your last audit of the same URL** — [pixelmatch](https://github.com/mapbox/pixelmatch)
   over full-page PNGs per viewport, tolerant of page-height changes and anti-aliasing. Drift
   above the threshold becomes a finding with a baseline / current / diff image triptych, so
   the tool works as a regression detector, not just a one-off review.
10. **Scores** 0–100 with a letter grade across 8 categories and writes a verdict. Export the
    whole thing as Markdown, or **copy a fix prompt** — a paste-ready brief for an AI coding
    chat containing the measured evidence, the required fix per finding, the component
    add-commands, the broken interaction states, and an explicit instruction not to redesign
    anything that was not flagged. Scopes: blockers-first, everything, accessibility, design
    system, or a single section.

## Report tabs

| Tab | What it holds |
| --- | --- |
| Overview | Grade, category scores, executive verdict, worst pages, runtime metrics |
| Findings | Every finding, filterable by severity and category |
| **Replace** | Per section role: shipped reference UI from **Mobbin** (click to enlarge in-app) beside the **Shoogle/shadcn** components that implement it — expandable to the component's real source, dependencies and files, with copy-add commands |
| Screens | Every screenshot: pages per viewport, section crops, flow steps, login attempt |
| Sections | Section-by-section breakdown with findings, references and component picks |
| Interactions | Dead clicks, missing focus/hover states, fake buttons, overlays, form validation |
| Flows | Journey replays with per-step status and screenshots |
| Tokens | Rendered tokens plus authored-CSS metrics |
| Diffs | Visual regression against the previous audit |

## Auditing a signed-in product

Most of a product lives behind a login, so the New audit screen takes an email/username and
password. Qualition signs in once with a real browser, then reuses that Playwright
`storageState` (cookies + localStorage) for **every** later context — crawl, interaction probe
and flows — so the whole audit runs as that user.

- The login form is auto-detected (`input[type=email]` → `name/id/autocomplete` → placeholder →
  generic text, and the same ladder for password/submit). The target URL is tried first, then
  `/login`, `/signin`, `/sign-in`, `/auth/login`, `/users/sign_in`. Explicit login URL and CSS
  selectors are available when a form is unusual.
- Success is verified, not assumed: the password field must disappear (or the URL must change).
  Wrong credentials produce a **blocker** finding with the site's own error text and a
  screenshot — never a silent "probably fine".
- **The password is never written to the run file** (`redactAuth` strips it before persistence).
  The captured session *is* saved in the run folder because that is what makes the rest of the
  audit possible — treat that folder as sensitive and prefer a dedicated test account.
- The login step is bounded by its own wall-clock budget, like every other browser phase.
- **Saved logins**: tick “remember” and the password is encrypted with Electron `safeStorage`
  (OS keychain) and reused automatically for that origin on later audits — leave the password
  box empty and the vault fills it in. Manage or forget saved logins in Settings.

## Models

Three interchangeable providers, chosen in Settings. Model lists are fetched **live from each
provider's API**, so "latest" means whatever your key can actually see today (Gemini 3.6 Flash,
Gemini 3.1 Pro, GPT-5.x, Cursor's Composer/Opus/Grok lineup …) rather than a list that rots in
source. A curated fallback list is used when the API is unreachable.

| Provider | Auth | Vision | Notes |
| --- | --- | --- | --- |
| **Gemini** | API key (Settings or `GEMINI_API_KEY`) | yes | JSON-schema structured output |
| **OpenAI** | API key (or `OPENAI_API_KEY`) | yes | `/v1/responses`; custom base URL for Azure/proxies |
| **Cursor** | your existing Cursor CLI login (`cursor-agent`), optional `CURSOR_API_KEY` | no | Headless `-p --output-format json`. No image channel, so screenshots are replaced by the full measured-evidence text (sections, tokens, authored CSS, axe, interaction probe) — grounded, just not visual. |

Brutality is a dial: `fair` → `harsh` → `ruthless` (tightens budgets, raises penalty weights
and changes the critic persona).

## Integrations — no new logins

Qualition reuses the MCP setup already on this machine instead of running its own OAuth:

| Piece | Source |
| --- | --- |
| MCP server definitions | `~/.pi/agent/mcp.json`, `~/.cursor/mcp.json`, Claude Desktop, Windsurf |
| Mobbin OAuth token | macOS Keychain service `pi-mcp-adapter.oauth` (chunked JSON blobs), auto-refreshed against the Supabase issuer |
| Mobbin transport | official `@modelcontextprotocol/sdk` streamable-HTTP client, with a minimal in-house client (`mcpHttpClient.ts`) as automatic fallback; both are bounded by connect/call timeouts so a stalled transport can never hang a run |
| Components (primary) | **Shoogle** MCP — `https://mcp.shoogle.dev/mcp`, 11,000+ blocks/components across every community shadcn registry (`@shadcnuikit`, `@cult-ui`, `@shadcnblocks`, …), returning ready-to-run `npx shadcn@latest add @registry/name` |
| Components (fallback) | first-party shadcn registry (`ui.shadcn.com/r/index.json` + per-item JSON) plus a curated block catalogue; extra registries can be added in Settings. Used to complement Shoogle, and takes over entirely if Shoogle is unreachable |
| Gemini | `@google/genai`; key from Settings or `GEMINI_API_KEY` / `GOOGLE_API_KEY` |

If Mobbin has never been authenticated on this machine, authenticate it once in pi or Cursor
and Qualition picks the token up on the next status refresh.

**Scope:** Qualition only ever reads and connects to the servers it uses (Mobbin, shadcn).
Every other MCP server in your config is ignored and never shown in the UI.

## Resilience

- Navigation retries with backoff; a failed viewport never aborts the page, a failed page never
  aborts the run.
- Gemini calls retry on 429/5xx with exponential backoff + jitter, honouring the API's own
  `retryDelay` hint.
- Mobbin calls retry on transient errors and transparently re-authenticate on 401 (expired
  token mid-run).
- Every optional subsystem (Mobbin, Shoogle, AI critique, CSS analysis, visual diff, interaction
  probe) fails soft and is logged; the audit still completes and scores.
- Page count is optional: **“crawl everything”** visits every reachable same-origin route
  (45-minute safety cap, Cancel keeps partial results).
- Crawl de-duplicates by path and strips tracking/permutation params (`?utm_*`, `?preset=`, …),
  so one route with query variants cannot eat the page budget while real routes go unvisited.
  Product surfaces are prioritised over legal/blog pages.
- **Cancel stops immediately.** Every loop and every slow call (Mobbin, AI critique, component
  search, flows) sits behind a checkpoint and a cancellation race, so pressing Cancel does not
  wait for an in-flight vision request to finish. A cancelled run is reported as `cancelled`
  with no error — not `failed` — and pages captured before the stop are still audited and
  scored, so you keep the partial result.
- Every browser-driving phase (login, interaction probe) is bounded by a wall-clock `Deadline`
  (`deadline.ts`) plus per-step timeouts, dismisses native dialogs, and caps re-navigations —
  a slow or hostile page degrades to partial results instead of hanging the run.
- Targets accept what humans type: `localhost:5173`, `127.0.0.1:3000`, `staging`, bare hosts.
  Local dev servers typed as `https://` are retried once over `http://` (and vice versa).
- MCP transports are explicitly closed when a run ends; their open streams would otherwise keep
  the event loop alive.

## Layout

```
src/main/services/
  credentials.ts     MCP config discovery (scoped) + Keychain token read/refresh
  mcpClient.ts       official MCP SDK client + fallback + timeouts
  mcpHttpClient.ts   minimal MCP streamable-HTTP client (fallback transport)
  mobbin.ts          screen/flow/section search, image persistence
  shadcnRegistry.ts  shadcn registry + Shoogle-first recommendation merge
  crawler.ts         Playwright capture + flow replay
  extract.ts         in-page extraction payload (tokens, sections, responsive)
  audit.ts           heuristic rules + scoring (CIEDE2000 colour maths)
  cssAudit.ts        authored-CSS analysis (Project Wallace) + findings
  auth.ts            login, session capture, credential redaction
  deadline.ts        wall-clock budgets + per-step timeouts
  interaction.ts     deep UX probe: hover/focus/click/keyboard/overlays/forms
  visual.ts          run-to-run visual regression (pixelmatch)
  providers.ts       gemini / openai / cursor backends + live model discovery
  critic.ts          provider-agnostic critique, flow proposal, verdict
  shoogle.ts         Shoogle MCP component search (primary)
  gemini.ts          vision critique, flow proposal, executive verdict
  runner.ts          orchestration + progress events
  store.ts/report.ts persistence + markdown export
src/renderer/        React 19 + Tailwind v4 UI (New audit / Runs / Report / Explore / Settings)
```

## Testing

```
npm test                        # unit tests: colour maths, rules, scoring, css stats, diffing
npm run smoke -- https://stripe.com   # full pipeline without Electron
```

The smoke run prints the section map, authored-CSS metrics, axe count, scorecard, top findings,
registry recommendations, Mobbin references, and a self-baseline visual diff (which must read
0.00% — it is the false-positive check for the regression engine).

Real output on `stripe.com`: 19 sections, 454 kB of CSS across 5 sheets, 357 unique colours in
730 declarations (49% uniqueness), 53 font sizes, 37 shadows, z-index max 99999,
maintainability 64/100.

Real output on `ui.shadcn.com`: 25 controls exercised in 16s — 6 inert demo buttons, 1 control
with no accessible name, and an Alert Dialog that opens without moving focus into itself;
92 CSS custom properties defined and never used; z-index max 999999999.

## Notes

- Flows never submit payments; use obviously fake test data.
- Runs (JSON + screenshots + cached Mobbin imagery) live in the Electron `userData/runs/<id>`
  directory — "Open files" in the UI reveals it.
- `bypassCSP` is enabled for capture contexts so axe-core can be injected into strict-CSP sites.
