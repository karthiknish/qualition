import { useEffect, useState } from 'react'
import type { FlowStep, IntegrationStatus, Run, RunConfig, SavedCredential, Settings, Viewport } from '../../../shared/types'
import { api, cx } from '../lib/api'
import { isValidTarget, normalizeTargetUrl, parseIgnorePages } from '../../../shared/url'
import { Button, Chip, Input, PageHeader, Panel, Segmented, Toggle } from '../components/ui'

const BRUTALITY: { id: RunConfig['brutality']; label: string; hint: string }[] = [
  { id: 'fair', label: 'Fair', hint: 'Issues that materially hurt users.' },
  { id: 'harsh', label: 'Harsh', hint: 'Release-blocking design-lead review.' },
  { id: 'ruthless', label: 'Ruthless', hint: 'Portfolio review. Nothing is good enough.' }
]

export default function NewRun({
  status,
  onStarted
}: {
  status: IntegrationStatus | null
  onStarted: (r: Run) => void
}): JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [viewports, setViewports] = useState<Viewport[]>([])
  const [enabledVps, setEnabledVps] = useState<Record<string, boolean>>({})
  const [url, setUrl] = useState('https://')
  const [ignorePages, setIgnorePages] = useState('')
  const [context, setContext] = useState('')
  const [maxPages, setMaxPages] = useState(5)
  const [brutality, setBrutality] = useState<RunConfig['brutality']>('ruthless')
  const [productionUrl, setProductionUrl] = useState('')
  const [useMobbin, setUseMobbin] = useState(true)
  const [useShadcn, setUseShadcn] = useState(true)
  const [useGemini, setUseGemini] = useState(true)
  const [useLighthouse, setUseLighthouse] = useState(true)
  const [probe, setProbe] = useState(true)
  const [flowText, setFlowText] = useState('')
  const [busy, setBusy] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginUrl, setLoginUrl] = useState('')
  const [userSel, setUserSel] = useState('')
  const [passSel, setPassSel] = useState('')
  const [submitSel, setSubmitSel] = useState('')
  const [remember, setRemember] = useState(true)
  const [saved, setSaved] = useState<SavedCredential[]>([])
  const [matchedCred, setMatchedCred] = useState<SavedCredential | null>(null)
  const [encryption, setEncryption] = useState(true)

  useEffect(() => {
    void api.getSettings().then((s) => {
      setSettings(s)
      setBrutality(s.defaultBrutality)
      setMaxPages(s.maxPages)
      setProbe(s.interactionProbe)
      if (s.lastAuthUsername) {
        setEmail(s.lastAuthUsername)
        setAuthOpen(true)
      }
    })
    void api.defaultViewports().then((v) => {
      setViewports(v)
      setEnabledVps(Object.fromEntries(v.map((x) => [x.name, true])))
    })
    void api.listCredentials().then(setSaved)
    void api.encryptionAvailable().then(setEncryption)
  }, [])

  // Offer a saved login as soon as the URL points at an origin we know.
  useEffect(() => {
    let cancelled = false
    const normalized = normalizeTargetUrl(url)
    if (!normalized || saved.length === 0) {
      setMatchedCred(null)
      return
    }
    void api.originOf(normalized).then((origin) => {
      if (cancelled) return
      const hit = saved.find((c) => c.origin === origin) ?? null
      setMatchedCred(hit)
      if (hit) {
        setAuthOpen(true)
        setEmail((prev) => prev || hit.username)
      }
    })
    return () => {
      cancelled = true
    }
  }, [url, saved])

  const start = async (): Promise<void> => {
    setBusy(true)
    try {
      const config: RunConfig = {
        targetUrl: normalizeTargetUrl(url) ?? url.trim(),
        productionUrl: productionUrl.trim() ? normalizeTargetUrl(productionUrl) ?? productionUrl.trim() : undefined,
        maxPages,
        ignorePages: parseIgnorePages(ignorePages),
        viewports: viewports.filter((v) => enabledVps[v.name]),
        useMobbin,
        useShadcn,
        useGemini,
        useLighthouse,
        useInteractionProbe: probe,
        provider: settings?.provider ?? 'gemini',
        geminiModel:
          (settings?.provider === 'openai'
            ? settings?.openaiModel
            : settings?.provider === 'cursor'
              ? settings?.cursorModel
              : settings?.geminiModel) ?? 'gemini-3.6-flash',
        brutality,
        productContext: context.trim(),
        flows: parseFlows(flowText),
        auth:
          authOpen && (password || matchedCred)
            ? {
                username: email.trim() || matchedCred?.username || '',
                password,
                useSaved: !password && !!matchedCred,
                remember: remember && !!password,
                loginUrl: loginUrl.trim() || matchedCred?.loginUrl || undefined,
                usernameSelector: userSel.trim() || undefined,
                passwordSelector: passSel.trim() || undefined,
                submitSelector: submitSel.trim() || undefined
              }
            : undefined
      }
      if (authOpen && email.trim()) void api.setSettings({ lastAuthUsername: email.trim() })
      onStarted(await api.startRun(config))
    } finally {
      setBusy(false)
    }
  }

  const valid = isValidTarget(url)
  const normalized = normalizeTargetUrl(url)

  return (
    <div className="relative mx-auto max-w-3xl space-y-5 px-6 pb-8 pt-8">
      <PageHeader
        eyebrow="Start"
        title="New audit"
        description="Crawls the target in a real browser, measures the design system, probes interactions, compares against shipped UI, and names what to replace."
      />

      <Panel title="Target" className="animate-fade-up">
        <div className="space-y-3.5">
          <Input value={url} onChange={setUrl} placeholder="https://yourapp.com · localhost:5173 · 127.0.0.1:3000" autoFocus />
          {normalized && normalized.replace(/\/$/, '') !== url.trim().replace(/\/$/, '') && (
            <p className="-mt-1 text-[11px] text-zinc-500">
              will audit <span className="text-zinc-300">{normalized}</span>
            </p>
          )}
          <div>
            <label className="mb-1 block text-[12px] text-zinc-400">Ignore pages</label>
            <textarea
              value={ignorePages}
              onChange={(e) => setIgnorePages(e.target.value)}
              rows={2}
              spellCheck={false}
              placeholder={'/login\n/settings/*\n/admin'}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 font-mono text-[12px] text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-500 focus:bg-zinc-950"
            />
            <p className="mt-1 text-[11px] leading-snug text-zinc-600">
              Paths or URLs to skip (one per line or comma-separated). Prefixes match children;{' '}
              <code className="text-zinc-500">*</code> is a wildcard. The start URL is always captured.
            </p>
          </div>
          <Input
            value={productionUrl}
            onChange={setProductionUrl}
            placeholder="Optional production URL — compare so Vite/HMR findings are marked “does not ship”"
          />
          <Input
            value={context}
            onChange={setContext}
            placeholder="Product context — e.g. “B2B analytics SaaS, technical buyers, dark UI”"
          />
          <div className="flex items-center gap-3">
            <label className="w-12 shrink-0 text-[12px] text-zinc-400">Pages</label>
            <input
              type="range"
              min={1}
              max={60}
              value={maxPages || 60}
              disabled={maxPages === 0}
              onChange={(e) => setMaxPages(Number(e.target.value))}
              className="flex-1 accent-zinc-200 disabled:opacity-30"
            />
            <span className="w-16 text-right text-[12px] tabular-nums text-zinc-300">
              {maxPages === 0 ? '∞' : maxPages}
            </span>
            <Chip active={maxPages === 0} onClick={() => setMaxPages(maxPages === 0 ? 5 : 0)}>
              crawl everything
            </Chip>
          </div>
          {maxPages === 0 && (
            <p className="-mt-1 text-[11px] leading-snug text-zinc-500">
              Every reachable same-origin route will be captured. Large sites can take a while; a 45-minute safety cap
              applies and Cancel keeps whatever finished.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {viewports.map((v) => (
              <Chip
                key={v.name}
                active={!!enabledVps[v.name]}
                onClick={() => setEnabledVps((p) => ({ ...p, [v.name]: !p[v.name] }))}
              >
                {v.name} · {v.width}×{v.height}
              </Chip>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="Brutality" className="animate-fade-up" bodyClassName="pt-3">
        <Segmented value={brutality} onChange={setBrutality} options={BRUTALITY} />
      </Panel>

      <div className="grid grid-cols-2 gap-3 animate-fade-up">
        <Toggle
          checked={probe}
          onChange={setProbe}
          label="Deep interaction probe"
          hint="Hover, focus, keyboard and safe-click every control; overlays, escape, focus traps and empty-form validation"
        />
        <Toggle
          checked={useMobbin}
          onChange={setUseMobbin}
          label="Mobbin references"
          hint={status?.mobbin.ok ? 'Auth reused from local MCP setup' : 'Not authenticated — will be skipped'}
        />
        <Toggle
          checked={useShadcn}
          onChange={setUseShadcn}
          label="Component replacements"
          hint={status?.shoogle.ok ? 'Shoogle community registries, shadcn fallback' : 'shadcn registry only — Shoogle unreachable'}
        />
        <Toggle
          checked={useGemini}
          onChange={setUseGemini}
          label="AI critique"
          hint={status?.model.ok ? `${status.model.id} · ${status.model.model} ready` : `${status?.model.id ?? 'model'} not configured — set it in Settings`}
        />
        <Toggle
          checked={useLighthouse}
          onChange={setUseLighthouse}
          label="Lighthouse"
          hint="Perf, accessibility, best-practices and SEO via a separate Chrome pass — slowest independent tool"
        />
      </div>

      <Panel
        title="Login credentials"
        right={
          <button onClick={() => setAuthOpen(!authOpen)} className="text-[11px] text-zinc-400 hover:text-zinc-200">
            {authOpen ? 'not needed' : 'this site needs a login'}
          </button>
        }
      >
        {!authOpen ? (
          <p className="text-[12px] text-zinc-500">
            Auditing a signed-out marketing page. Turn this on to sign in first and audit the real product.
          </p>
        ) : (
          <div className="space-y-3">
            {matchedCred && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                <span className="text-[12px] text-emerald-200">
                  Saved login found for <span className="font-medium">{matchedCred.origin}</span> — signing in as{' '}
                  {matchedCred.username}. Leave the password blank to use it.
                </span>
                <button
                  onClick={async () => {
                    await api.deleteCredential(matchedCred.origin)
                    setSaved(await api.listCredentials())
                    setMatchedCred(null)
                  }}
                  className="shrink-0 text-[11px] text-emerald-300/80 hover:text-red-300"
                >
                  forget
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[12px] text-zinc-400">Email / username</label>
                <Input value={email} onChange={setEmail} placeholder="you@company.com" />
              </div>
              <div>
                <label className="mb-1 block text-[12px] text-zinc-400">
                  Password{' '}
                  {matchedCred && <span className="text-zinc-600">— blank uses the saved one</span>}
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={setPassword}
                  placeholder={matchedCred ? 'using saved password' : '••••••••'}
                />
              </div>
            </div>
            {password && (
              <button
                onClick={() => setRemember(!remember)}
                className="flex items-center gap-2 text-left text-[12px] text-zinc-300"
              >
                <span
                  className={cx(
                    'flex h-4 w-4 items-center justify-center rounded border text-[10px]',
                    remember ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300' : 'border-zinc-700 text-transparent'
                  )}
                >
                  ✓
                </span>
                Remember this login for {matchedCred?.origin ?? 'this site'}
                <span className="text-[11px] text-zinc-600">
                  {encryption ? '(encrypted with your OS keychain)' : '(keychain unavailable — stored obfuscated only)'}
                </span>
              </button>
            )}
            <div>
              <label className="mb-1 block text-[12px] text-zinc-400">
                Login page <span className="text-zinc-600">optional — /login, /signin, /auth/login are tried automatically</span>
              </label>
              <Input value={loginUrl} onChange={setLoginUrl} placeholder="https://app.example.com/login" />
            </div>
            <details className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5">
              <summary className="cursor-pointer text-[12px] text-zinc-400">
                Custom selectors (only if the form is not auto-detected)
              </summary>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Input value={userSel} onChange={setUserSel} placeholder="#email" />
                <Input value={passSel} onChange={setPassSel} placeholder="#password" />
                <Input value={submitSel} onChange={setSubmitSel} placeholder="button[type=submit]" />
              </div>
            </details>
            <p className="text-[11px] leading-snug text-zinc-600">
              The password is never written to the run file or sent to the report UI. Saved logins are encrypted with
              your OS keychain. The resulting session (cookies + localStorage) is stored in the run folder so the crawl,
              interaction probe and flows all run as this user — treat that folder as sensitive, and prefer a dedicated
              test account.
            </p>
          </div>
        )}
      </Panel>

      <Panel
        title="Flows to stress-test"
        right={<span className="text-[11px] text-zinc-600">leave empty to let Gemini propose them</span>}
      >
        <textarea
          value={flowText}
          onChange={(e) => setFlowText(e.target.value)}
          rows={7}
          spellCheck={false}
          placeholder={`Signup
goto /
click text=Get started
fill placeholder=Email | qualition+test@example.com
click role=button:Continue
assertText Check your inbox`}
          className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[12px] text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-zinc-600"
        />
        <p className="mt-2 text-[11px] leading-snug text-zinc-600">
          One flow per block: first line is the name, then <code>action target | value</code>. Targets accept{' '}
          <code>text=</code>, <code>role=button:Name</code>, <code>label=</code>, <code>placeholder=</code> or CSS.
        </p>
      </Panel>

      <div className="sticky bottom-0 z-20 -mx-6 mt-2 border-t border-zinc-800/80 bg-zinc-950/90 px-6 py-3.5 backdrop-blur-md">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 text-[12px] text-zinc-500">
            {valid ? (
              <span className="line-clamp-1">
                Ready to audit <span className="text-zinc-300">{normalized ?? url}</span>
                {' · '}
                <span className="text-zinc-400">{brutality}</span>
                {authOpen && (password || matchedCred) ? ' · signed in' : ''}
              </span>
            ) : (
              <span>
                Enter a URL or host — <code className="text-zinc-400">localhost:5173</code>,{' '}
                <code className="text-zinc-400">https://yourapp.com</code>
              </span>
            )}
          </div>
          <Button variant="primary" size="lg" onClick={start} disabled={!valid || busy}>
            {busy ? 'Starting…' : 'Run audit'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function parseFlows(text: string): { name: string; steps: FlowStep[] }[] {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
  return blocks.map((block) => {
    const [name, ...rest] = block.split('\n')
    const steps: FlowStep[] = []
    for (const line of rest) {
      const [head, value] = line.split('|').map((s) => s.trim())
      const [action, ...targetParts] = head.split(/\s+/)
      steps.push({
        action: action as FlowStep['action'],
        target: targetParts.join(' ') || undefined,
        value
      })
    }
    return { name: name.trim(), steps }
  })
}
