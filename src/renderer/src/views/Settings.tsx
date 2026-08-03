import { useCallback, useEffect, useState } from 'react'
import type {
  IntegrationStatus,
  ProviderId,
  ProviderStatus,
  ModelInfo,
  SavedCredential,
  Settings,
  UpdateStatus
} from '../../../shared/types'
import { api, cx } from '../lib/api'
import { Button, Field, Input, PageHeader, Panel } from '../components/ui'

const PROVIDERS: { id: ProviderId; label: string; blurb: string; vision: boolean }[] = [
  { id: 'gemini', label: 'Gemini', blurb: 'Google AI Studio key. Vision + JSON schema.', vision: true },
  { id: 'openai', label: 'OpenAI', blurb: 'Responses API. Vision + structured output. Any compatible base URL.', vision: true },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    blurb: 'One key, 300+ models from every vendor. Live per-model pricing.',
    vision: true
  },
  {
    id: 'cursor',
    label: 'Cursor',
    blurb: 'Local cursor-agent CLI, your existing subscription. Text-only — screenshots are replaced by measured evidence.',
    vision: false
  }
]

export default function SettingsView({
  status,
  onStatus
}: {
  status: IntegrationStatus | null
  onStatus: (s: IntegrationStatus) => void
}): JSX.Element {
  const [s, setS] = useState<Settings | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [servers, setServers] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [probe, setProbe] = useState<ProviderStatus | null>(null)
  const [regName, setRegName] = useState('')
  const [regUrl, setRegUrl] = useState('')
  const [creds, setCreds] = useState<SavedCredential[]>([])
  const [encryption, setEncryption] = useState(true)
  const [version, setVersion] = useState('')
  const [update, setUpdate] = useState<UpdateStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [modelQuery, setModelQuery] = useState('')
  const [visionOnly, setVisionOnly] = useState(false)

  const refreshModels = useCallback(async (provider: ProviderId) => {
    setLoadingModels(true)
    try {
      setModels(await api.listModels(provider))
    } finally {
      setLoadingModels(false)
    }
  }, [])

  useEffect(() => {
    void api.getSettings().then((loaded) => {
      setS(loaded)
      void refreshModels(loaded.provider)
    })
    void api.mcpServers().then(setServers)
    void api.listCredentials().then(setCreds)
    void api.encryptionAvailable().then(setEncryption)
    void api.appVersion().then(setVersion)
    void api.updateStatus().then(setUpdate)
    return api.onUpdateStatus(setUpdate)
  }, [refreshModels])

  if (!s) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8 text-[13px] text-zinc-500 animate-pulse-soft">
        Loading settings…
      </div>
    )
  }

  const save = async (patch: Partial<Settings>): Promise<void> => {
    setSaving(true)
    const next = await api.setSettings(patch)
    setS(next)
    setSaving(false)
  }

  const currentModel =
    s.provider === 'openai'
      ? s.openaiModel
      : s.provider === 'cursor'
        ? s.cursorModel
        : s.provider === 'openrouter'
          ? s.openrouterModel
          : s.geminiModel
  const setModel = (m: string): Promise<void> =>
    save(
      s.provider === 'openai'
        ? { openaiModel: m }
        : s.provider === 'cursor'
          ? { cursorModel: m }
          : s.provider === 'openrouter'
            ? { openrouterModel: m }
            : { geminiModel: m }
    )

  // 300+ models on OpenRouter is unusable without filtering.
  const providerConfigured =
    s.provider === 'cursor' ||
    !!(s.provider === 'openai' ? s.openaiApiKey : s.provider === 'openrouter' ? s.openrouterApiKey : s.geminiApiKey)

  const q = modelQuery.trim().toLowerCase()
  const visibleModels = models
    .filter((m) => !visionOnly || m.vision !== false)
    .filter((m) => !q || m.id.toLowerCase().includes(q) || (m.label ?? '').toLowerCase().includes(q))
    .slice(0, 120)

  const testConnection = async (): Promise<void> => {
    setProbe(null)
    setSaving(true)
    const res = await api.testModel(s.provider)
    setProbe(res)
    onStatus(await api.status())
    setSaving(false)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-6 py-8">
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        description="Choose the model, wire MCP and Mobbin, and tune defaults for every new audit."
      />

      <Panel
        title="Model provider"
        className="animate-fade-up"
        right={saving ? <span className="text-[11px] text-zinc-500">working…</span> : null}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={async () => {
                await save({ provider: p.id })
                void refreshModels(p.id)
              }}
              className={cx(
                'rounded-xl border p-3 text-left transition-colors',
                s.provider === p.id
                  ? 'border-zinc-400/50 bg-zinc-800/80 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.04)]'
                  : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] text-zinc-100">{p.label}</span>
                {!p.vision && <span className="rounded bg-amber-500/15 px-1 text-[9px] uppercase text-amber-300">no vision</span>}
              </div>
              <div className="mt-0.5 text-[11px] leading-snug text-zinc-500">{p.blurb}</div>
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {s.provider === 'gemini' && (
            <Field label="Gemini API key">
              <Input
                type="password"
                value={s.geminiApiKey}
                onChange={(v) => setS({ ...s, geminiApiKey: v })}
                placeholder="AIza… (or GEMINI_API_KEY in your environment)"
              />
            </Field>
          )}
          {s.provider === 'openai' && (
            <>
              <Field label="OpenAI API key">
                <Input
                  type="password"
                  value={s.openaiApiKey}
                  onChange={(v) => setS({ ...s, openaiApiKey: v })}
                  placeholder="sk-… (or OPENAI_API_KEY)"
                />
              </Field>
              <Field label="Base URL (optional — for Azure/proxies/compatible gateways)">
                <Input value={s.openaiBaseUrl} onChange={(v) => setS({ ...s, openaiBaseUrl: v })} placeholder="https://api.openai.com/v1" />
              </Field>
            </>
          )}
          {s.provider === 'openrouter' && (
            <Field label="OpenRouter API key">
              <Input
                type="password"
                value={s.openrouterApiKey}
                onChange={(v) => setS({ ...s, openrouterApiKey: v })}
                placeholder="sk-or-… (or OPENROUTER_API_KEY)"
              />
            </Field>
          )}
          {s.provider === 'cursor' && (
            <>
              <Field label="cursor-agent binary (blank = ~/.local/bin/cursor-agent)">
                <Input value={s.cursorBinary} onChange={(v) => setS({ ...s, cursorBinary: v })} placeholder="/Users/you/.local/bin/cursor-agent" />
              </Field>
              <Field label="CURSOR_API_KEY (optional — CLI login is used when blank)">
                <Input type="password" value={s.cursorApiKey} onChange={(v) => setS({ ...s, cursorApiKey: v })} placeholder="key_…" />
              </Field>
              <p className="text-[11px] leading-snug text-amber-400/90">
                The Cursor CLI has no image channel, so screenshots are not sent. Critique runs on the measured evidence
                (sections, tokens, authored CSS, axe, interaction probe) instead — still grounded, but not visual.
              </p>
            </>
          )}

          <Field
            label={
              <span className="flex items-center gap-2">
                Model
                <button onClick={() => refreshModels(s.provider)} className="text-[10px] text-sky-400 hover:underline">
                  {loadingModels ? 'refreshing…' : 'refresh from API'}
                </button>
                <span className="text-[10px] text-zinc-600">
                  {visibleModels.length === models.length
                    ? `${models.length} available`
                    : `${visibleModels.length} of ${models.length}`}
                </span>
              </span>
            }
          >
            <div className="mb-1.5 flex gap-2">
              <Input
                value={modelQuery}
                onChange={setModelQuery}
                placeholder={`Search ${models.length} model${models.length === 1 ? '' : 's'}…`}
              />
              <button
                onClick={() => setVisionOnly(!visionOnly)}
                title="Screenshot critique needs a vision-capable model"
                className={cx(
                  'shrink-0 rounded-lg border px-2.5 py-1 text-[11px]',
                  visionOnly
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
                )}
              >
                vision only
              </button>
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
              {visibleModels.length === 0 && (
                <p className="px-1 py-2 text-[11px] text-zinc-600">
                  No model matches “{modelQuery}”{visionOnly ? ' with vision support' : ''}.
                </p>
              )}
              {visibleModels.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setModel(m.id)}
                  className={cx(
                    'flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left',
                    currentModel === m.id
                      ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                      : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-[12px]">{m.id}</span>
                  {m.vision === false && (
                    <span className="shrink-0 rounded bg-amber-500/15 px-1 text-[9px] uppercase text-amber-300">
                      no vision
                    </span>
                  )}
                  {m.contextTokens ? (
                    <span className="shrink-0 text-[10px] tabular-nums text-zinc-600">
                      {Math.round(m.contextTokens / 1000)}k ctx
                    </span>
                  ) : null}
                  <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">{priceLabel(m)}</span>
                </button>
              ))}
            </div>
            {models.some((m) => m.priceSource === 'list') && (
              <p className="mt-1 text-[10px] text-zinc-600">
                Prices are USD per 1M tokens (in / out). Gemini and OpenAI figures are published list prices and may
                drift; OpenRouter figures are fetched live.
              </p>
            )}
          </Field>

          {!providerConfigured && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-300">
              No API key set for {s.provider} — AI critique will be skipped on the next run. Add a key, or switch
              provider above.
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={async () => {
                await save({
                  geminiApiKey: s.geminiApiKey,
                  openaiApiKey: s.openaiApiKey,
                  openaiBaseUrl: s.openaiBaseUrl,
                  cursorBinary: s.cursorBinary,
                  cursorApiKey: s.cursorApiKey,
                  openrouterApiKey: s.openrouterApiKey
                })
                await testConnection()
              }}
            >
              Save &amp; test
            </Button>
            <span className={cx('text-[12px]', (probe ?? status?.model)?.ok ? 'text-emerald-400' : 'text-zinc-500')}>
              {(probe ?? status?.model)?.detail}
            </span>
          </div>
        </div>
      </Panel>

      <Panel title="Audit defaults">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-zinc-400">Brutality</span>
            {(['fair', 'harsh', 'ruthless'] as const).map((b) => (
              <button
                key={b}
                onClick={() => save({ defaultBrutality: b })}
                className={cx(
                  'rounded-lg border px-2.5 py-1 text-[12px]',
                  s.defaultBrutality === b ? 'border-zinc-500 bg-zinc-800 text-zinc-100' : 'border-zinc-800 text-zinc-500'
                )}
              >
                {b}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-zinc-400">Default pages</span>
            <input
              type="number"
              min={0}
              max={500}
              value={s.maxPages}
              onChange={(e) => save({ maxPages: Number(e.target.value) })}
              className="w-16 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-[12px] text-zinc-200"
            />
            <span className="text-[11px] text-zinc-600">{s.maxPages === 0 ? 'no limit — crawl everything' : 'per audit'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-zinc-400">Controls probed / page</span>
            <input
              type="number"
              min={5}
              max={60}
              value={s.maxControlsProbed}
              onChange={(e) => save({ maxControlsProbed: Number(e.target.value) })}
              className="w-16 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-[12px] text-zinc-200"
            />
          </div>
          <button
            onClick={() => save({ interactionProbe: !s.interactionProbe })}
            className={cx(
              'rounded-lg border px-2.5 py-1 text-[12px]',
              s.interactionProbe ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-zinc-800 text-zinc-500'
            )}
          >
            interaction probe {s.interactionProbe ? 'on' : 'off'}
          </button>
        </div>
      </Panel>

      <Panel title="Component sources">
        <p className="mb-2 text-[11px] leading-snug text-zinc-500">
          <span className="text-zinc-300">Shoogle</span> (mcp.shoogle.dev) is queried for unique components
          Mobbin references show that the audited UI is missing — not whole dashboard shells. First-party{' '}
          <span className="text-zinc-300">shadcn</span> fills primitives. Extra registries below merge into the
          shadcn side.
        </p>
        <div className="mb-3 space-y-1 text-[12px]">
          <div className={cx(status?.shoogle.ok ? 'text-emerald-400' : 'text-amber-400')}>Shoogle: {status?.shoogle.detail}</div>
          <div className={cx(status?.shadcn.ok ? 'text-emerald-400' : 'text-amber-400')}>
            shadcn: {status?.shadcn.detail} · {status?.shadcn.registries.join(', ')}
          </div>
        </div>
        <div className="flex gap-2">
          <Input value={regName} onChange={setRegName} placeholder="@acme" className="max-w-32" />
          <Input value={regUrl} onChange={setRegUrl} placeholder="https://acme.dev/r/registry.json" />
          <Button
            onClick={() => {
              if (!regName || !regUrl) return
              void save({ extraRegistries: [...s.extraRegistries, { name: regName, url: regUrl }] })
              setRegName('')
              setRegUrl('')
            }}
          >
            Add
          </Button>
        </div>
        <ul className="mt-2 space-y-1">
          {s.extraRegistries.map((r) => (
            <li key={r.url} className="flex items-center justify-between gap-2 rounded-md border border-zinc-800 px-2 py-1 text-[12px]">
              <span className="text-zinc-300">{r.name}</span>
              <span className="truncate text-zinc-600">{r.url}</span>
              <button onClick={() => save({ extraRegistries: s.extraRegistries.filter((x) => x.url !== r.url) })} className="text-red-400">
                remove
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="Saved logins"
        right={
          <span className={cx('text-[11px]', encryption ? 'text-emerald-400' : 'text-amber-400')}>
            {encryption ? 'encrypted via OS keychain' : 'keychain unavailable — obfuscated only'}
          </span>
        }
      >
        {creds.length === 0 ? (
          <p className="text-[12px] text-zinc-500">
            No saved logins. Tick “Remember this login” on the New audit screen and the password is encrypted with your
            OS keychain, then reused automatically for that site.
          </p>
        ) : (
          <ul className="space-y-1">
            {creds.map((c) => (
              <li
                key={c.origin}
                className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 text-[12px]"
              >
                <span className="min-w-0 flex-1 truncate text-zinc-200">{c.origin}</span>
                <span className="shrink-0 text-zinc-400">{c.username}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-zinc-600">
                  {c.encrypted ? 'encrypted' : 'plain'}
                </span>
                <span className="shrink-0 text-[10px] text-zinc-700">{new Date(c.updatedAt).toLocaleDateString()}</span>
                <button
                  onClick={async () => {
                    await api.deleteCredential(c.origin)
                    setCreds(await api.listCredentials())
                  }}
                  className="shrink-0 text-red-400 hover:text-red-300"
                >
                  forget
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Updates">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] text-zinc-200">Qualition {version || '…'}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{describeUpdate(update, checking)}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            {update?.state === 'ready' || update?.state === 'available' || update?.state === 'error' ? (
              <Button variant="primary" onClick={() => void api.installUpdate()}>
                {update.state === 'ready' ? 'Restart & install' : update.state === 'error' ? 'Retry install' : 'Download & install'}
              </Button>
            ) : null}
            <Button
              disabled={checking}
              onClick={async () => {
                setChecking(true)
                try {
                  setUpdate(await api.checkForUpdates())
                } finally {
                  setChecking(false)
                }
              }}
            >
              {checking ? 'Checking…' : 'Check for updates'}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[10px] leading-snug text-zinc-600">
          Releases come from github.com/karthiknish/qualition. Updates are checked on launch and every 6 hours.
          {' Updates are downloaded, checksum-verified and installed in place — no browser needed.'}
        </p>
      </Panel>

      <Panel title="Connected services">
        <p className="mb-2 text-[11px] leading-snug text-zinc-500">
          Qualition only uses the services below. It reads their config from your existing MCP setup
          (<code>~/.pi/agent/mcp.json</code>, <code>~/.cursor/mcp.json</code>, Claude Desktop, Windsurf) and reuses the
          Mobbin OAuth token from the Keychain service <code>pi-mcp-adapter.oauth</code>, refreshing it automatically.
          Other MCP servers on this machine are ignored and never contacted.
        </p>
        <ul className="space-y-1">
          {servers.map((sv) => (
            <li key={sv.name} className="flex items-center gap-2 text-[12px]">
              <span className="w-20 shrink-0 truncate text-zinc-300">{sv.name}</span>
              <span className="w-28 shrink-0 text-[10px] uppercase tracking-wider text-zinc-500">{sv.role}</span>
              <span className="truncate text-zinc-500">{sv.url ?? sv.command}</span>
              <span className="ml-auto shrink-0 text-[10px] text-zinc-700">via {sv.origin}</span>
            </li>
          ))}
        </ul>
        <p className={cx('mt-2 text-[12px]', status?.mobbin.ok ? 'text-emerald-400' : 'text-amber-400')}>
          Mobbin: {status?.mobbin.detail}
        </p>
      </Panel>
    </div>
  )
}

/** USD per 1M tokens, in / out. Cursor bills by subscription, so it has none. */
function priceLabel(m: ModelInfo): string {
  if (m.promptPrice === undefined || m.completionPrice === undefined) return 'incl. in plan'
  if (m.promptPrice === 0 && m.completionPrice === 0) return 'free'
  const fmt = (n: number): string => (n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`)
  return `${fmt(m.promptPrice)} / ${fmt(m.completionPrice)}`
}

/** Plain-language description of where the updater currently stands. */
function describeUpdate(u: UpdateStatus | null, checking: boolean): string {
  if (checking) return 'Checking GitHub Releases…'
  if (!u) return 'Update state unknown.'
  switch (u.state) {
    case 'dev':
      return 'Running from source — updates only apply to the packaged app.'
    case 'checking':
      return 'Checking GitHub Releases…'
    case 'available':
      return `Version ${u.version} is available.`
    case 'downloading':
      return `Downloading ${u.version}… ${u.percent ?? 0}%`
    case 'installing':
      return `Installing ${u.version}… the app will relaunch itself.`
    case 'ready':
      return `Version ${u.version} downloaded and ready to install.`
    case 'error':
      return `Could not check for updates: ${u.error ?? 'unknown error'}`
    case 'dismissed':
      return `Version ${u.version} is available (reminder dismissed).`
    default:
      return 'You are on the latest version.'
  }
}

