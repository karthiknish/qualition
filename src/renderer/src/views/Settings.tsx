import { useCallback, useEffect, useState } from 'react'
import type {
  IntegrationStatus,
  ProviderId,
  ProviderStatus,
  SavedCredential,
  Settings,
  UpdateStatus
} from '../../../shared/types'
import { api, cx } from '../lib/api'
import { Button, Input, Panel } from '../components/ui'

const PROVIDERS: { id: ProviderId; label: string; blurb: string; vision: boolean }[] = [
  { id: 'gemini', label: 'Gemini', blurb: 'Google AI Studio key. Vision + JSON schema.', vision: true },
  { id: 'openai', label: 'OpenAI', blurb: 'Responses API. Vision + structured output. Any compatible base URL.', vision: true },
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
  const [models, setModels] = useState<string[]>([])
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

  if (!s) return <div className="p-6 text-[13px] text-zinc-500">Loading…</div>

  const save = async (patch: Partial<Settings>): Promise<void> => {
    setSaving(true)
    const next = await api.setSettings(patch)
    setS(next)
    setSaving(false)
  }

  const currentModel = s.provider === 'openai' ? s.openaiModel : s.provider === 'cursor' ? s.cursorModel : s.geminiModel
  const setModel = (m: string): Promise<void> =>
    save(s.provider === 'openai' ? { openaiModel: m } : s.provider === 'cursor' ? { cursorModel: m } : { geminiModel: m })

  const testConnection = async (): Promise<void> => {
    setProbe(null)
    setSaving(true)
    const res = await api.testModel(s.provider)
    setProbe(res)
    onStatus(await api.status())
    setSaving(false)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>

      <Panel title="Model provider" right={saving ? <span className="text-[11px] text-zinc-500">working…</span> : null}>
        <div className="grid grid-cols-3 gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={async () => {
                await save({ provider: p.id })
                void refreshModels(p.id)
              }}
              className={cx(
                'rounded-lg border p-3 text-left',
                s.provider === p.id ? 'border-zinc-500 bg-zinc-800/70' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
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
                <span className="text-[10px] text-zinc-600">{models.length} available</span>
              </span>
            }
          >
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {models.map((m) => (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  className={cx(
                    'rounded-lg border px-2.5 py-1 text-[12px]',
                    currentModel === m ? 'border-zinc-500 bg-zinc-800 text-zinc-100' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </Field>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={async () => {
                await save({
                  geminiApiKey: s.geminiApiKey,
                  openaiApiKey: s.openaiApiKey,
                  openaiBaseUrl: s.openaiBaseUrl,
                  cursorBinary: s.cursorBinary,
                  cursorApiKey: s.cursorApiKey
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
          <span className="text-zinc-300">Shoogle</span> (mcp.shoogle.dev) is queried first — 11,000+ blocks across every
          community shadcn registry. The first-party <span className="text-zinc-300">shadcn</span> registry is the
          fallback and supplies primitives. Extra registries below are merged into the shadcn side.
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

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <label className="mb-1 block text-[12px] text-zinc-400">{label}</label>
      {children}
    </div>
  )
}
