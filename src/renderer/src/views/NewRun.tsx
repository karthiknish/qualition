import { useEffect, useState } from 'react'
import type { FlowStep, IntegrationStatus, Run, RunConfig, SavedCredential, Settings, Viewport } from '../../../shared/types'
import { api, cx } from '../lib/api'
import { isValidTarget, normalizeTargetUrl } from '../../../shared/url'
import { Button, Input, Panel, Toggle } from '../components/ui'

const BRUTALITY: { id: RunConfig['brutality']; label: string; blurb: string }[] = [
  { id: 'fair', label: 'Fair', blurb: 'Issues that materially hurt users.' },
  { id: 'harsh', label: 'Harsh', blurb: 'Release-blocking design-lead review.' },
  { id: 'ruthless', label: 'Ruthless', blurb: 'Portfolio review. Nothing is good enough.' }
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
  const [context, setContext] = useState('')
  const [maxPages, setMaxPages] = useState(5)
  const [brutality, setBrutality] = useState<RunConfig['brutality']>('ruthless')
  const [useMobbin, setUseMobbin] = useState(true)
  const [useShadcn, setUseShadcn] = useState(true)
  const [useGemini, setUseGemini] = useState(true)
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
        maxPages,
        viewports: viewports.filter((v) => enabledVps[v.name]),
        useMobbin,
        useShadcn,
        useGemini,
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
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-zinc-100">New audit</h1>
        <p className="text-[13px] text-zinc-500">
          Crawls the target in a real browser, measures the design system, replays flows, compares against
          shipped UI from Mobbin, and names the components to replace.
        </p>
      </div>

      <Panel title="Target">
        <div className="space-y-3">
          <Input value={url} onChange={setUrl} placeholder="https://yourapp.com · localhost:5173 · 127.0.0.1:3000" />
          {normalized && normalized.replace(/\/$/, '') !== url.trim().replace(/\/$/, '') && (
            <p className="-mt-1 text-[11px] text-zinc-500">
              will audit <span className="text-zinc-300">{normalized}</span>
            </p>
          )}
          <Input
            value={context}
            onChange={setContext}
            placeholder="Product context — e.g. “B2B analytics SaaS, technical buyers, dark UI”"
          />
          <div className="flex items-center gap-3">
            <label className="text-[12px] text-zinc-400">Pages</label>
            <input
              type="range"
              min={1}
              max={60}
              value={maxPages || 60}
              disabled={maxPages === 0}
              onChange={(e) => setMaxPages(Number(e.target.value))}
              className="flex-1 accent-zinc-300 disabled:opacity-30"
            />
            <span className="w-20 text-right text-[12px] tabular-nums text-zinc-300">
              {maxPages === 0 ? 'no limit' : maxPages}
            </span>
            <button
              onClick={() => setMaxPages(maxPages === 0 ? 5 : 0)}
              className={cx(
                'shrink-0 rounded-lg border px-2.5 py-1 text-[11px]',
                maxPages === 0
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
              )}
            >
              crawl everything
            </button>
          </div>
          {maxPages === 0 && (
            <p className="-mt-1 text-[11px] leading-snug text-zinc-500">
              Every reachable same-origin route will be captured, probed and flow-tested. Large sites can take a while;
              a 45-minute safety cap applies and Cancel keeps whatever finished.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {viewports.map((v) => (
              <button
                key={v.name}
                onClick={() => setEnabledVps((p) => ({ ...p, [v.name]: !p[v.name] }))}
                className={cx(
                  'rounded-lg border px-3 py-1.5 text-[12px]',
                  enabledVps[v.name]
                    ? 'border-zinc-600 bg-zinc-800 text-zinc-100'
                    : 'border-zinc-800 bg-zinc-950 text-zinc-500'
                )}
              >
                {v.name} · {v.width}×{v.height}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="Brutality">
        <div className="grid grid-cols-3 gap-2">
          {BRUTALITY.map((b) => (
            <button
              key={b.id}
              onClick={() => setBrutality(b.id)}
              className={cx(
                'rounded-lg border p-3 text-left',
                brutality === b.id
                  ? 'border-zinc-500 bg-zinc-800/70'
                  : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
              )}
            >
              <div className="text-[13px] text-zinc-100">{b.label}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-zinc-500">{b.blurb}</div>
            </button>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3">
        <Toggle
          checked={probe}
          onChange={setProbe}
          label="Deep interaction probe"
          hint="Hover, focus, keyboard and safe-click every control; test overlays, escape, focus traps and empty-form validation"
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

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={start} disabled={!valid || busy}>
          {busy ? 'Starting…' : 'Run audit'}
        </Button>
        {!valid && (
          <span className="text-[12px] text-zinc-600">
            Enter a URL or host — <code>localhost:5173</code>, <code>127.0.0.1:3000</code> and{' '}
            <code>https://yourapp.com</code> all work.
          </span>
        )}
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
