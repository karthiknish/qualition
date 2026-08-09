import { useState } from 'react'
import { BookOpen, Copy, Search, SquareLibrary } from 'lucide-react'
import type { MobbinReference } from '../../../shared/types'
import { api, cx } from '../lib/api'
import { BrandLogo } from '../components/BrandLogo'
import { Button, Empty, Input, PageHeader, Panel } from '../components/ui'

export default function Explore({ runId }: { runId?: string }): JSX.Element {
  const [mQuery, setMQuery] = useState('pricing section with plan cards and toggle')
  const [kind, setKind] = useState<'screen' | 'section'>('screen')
  const [refs, setRefs] = useState<{ title: string; appName?: string; imageUrl: string; mobbinUrl?: string }[]>([])
  const [mBusy, setMBusy] = useState(false)
  const [mError, setMError] = useState('')

  const [rQuery, setRQuery] = useState('accordion')
  type RegistryItem = { name: string; registry: string; type?: string; description?: string; addCommand?: string; docs?: string }
  const [items, setItems] = useState<RegistryItem[]>([])
  const [rBusy, setRBusy] = useState(false)

  const searchMobbin = async (): Promise<void> => {
    setMBusy(true)
    setMError('')
    try {
      setRefs(await api.searchMobbin(mQuery, kind, runId))
    } catch (e) {
      setMError((e as Error).message)
    } finally {
      setMBusy(false)
    }
  }

  const searchRegistry = async (): Promise<void> => {
    setRBusy(true)
    try {
      setItems(await api.searchRegistry(rQuery))
    } finally {
      setRBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-6 py-8">
      <PageHeader
        eyebrow="References"
        title="Explore"
        description="Pull shipped UI from Mobbin and find the registry primitive that should replace hand-rolled markup."
      />

      <div className="grid grid-cols-2 gap-4 animate-fade-up">
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <SquareLibrary size={13} className="text-zinc-400" />
              Mobbin
            </span>
          }
          right={
            <div className="flex rounded-lg border border-zinc-800 p-0.5">
              {(['screen', 'section'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={cx(
                    'rounded-md px-2.5 py-1 text-[11px] capitalize transition-colors',
                    kind === k ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                  )}
                >
                  {k}s
                </button>
              ))}
            </div>
          }
        >
          <div className="flex gap-2">
            <Input
              value={mQuery}
              onChange={setMQuery}
              placeholder="Describe one screen or section in plain language"
            />
            <Button variant="primary" onClick={searchMobbin} disabled={mBusy}>
              <Search size={14} />
              {mBusy ? '…' : 'Search'}
            </Button>
          </div>
          {mError && <p className="mt-2 text-[12px] text-red-400">{mError}</p>}
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {refs.map((r, i) => (
              <button
                key={i}
                onClick={() => r.mobbinUrl && api.openExternal(r.mobbinUrl)}
                className="group text-left"
              >
                {r.imageUrl && (
                  <img
                    src={r.imageUrl.startsWith('http') ? r.imageUrl : (api.asset(r.imageUrl) ?? '')}
                    alt={r.title}
                    loading="lazy"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    className="h-44 w-full rounded-xl border border-zinc-800 object-cover object-top transition-[border-color,transform] group-hover:border-zinc-600 group-hover:scale-[1.01]"
                  />
                )}
                <span className="mt-1.5 block truncate text-[11px] text-zinc-400 group-hover:text-zinc-200">
                  {r.appName ?? r.title}
                </span>
              </button>
            ))}
          </div>
          {refs.length === 0 && !mBusy && (
            <Empty title="No references yet" icon={<SquareLibrary size={18} />}>
              Search shipped UI to compare against.
            </Empty>
          )}
        </Panel>

        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <BrandLogo id="shadcn" size={13} />
              Component registry
            </span>
          }
        >
          <div className="flex gap-2">
            <Input value={rQuery} onChange={setRQuery} placeholder="e.g. data table, pricing, sidebar, otp" />
            <Button variant="primary" onClick={searchRegistry} disabled={rBusy}>
              <Search size={14} />
              {rBusy ? '…' : 'Search'}
            </Button>
          </div>
          <ul className="mt-4 space-y-2">
            {items.map((i) => (
              <li
                key={`${i.registry}/${i.name}`}
                className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 transition-colors hover:border-zinc-700"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-zinc-100">
                    {i.name}{' '}
                    <span className="text-[10px] uppercase tracking-wider text-zinc-600">
                      {String(i.type).replace('registry:', '')}
                    </span>
                  </span>
                  <button
                    onClick={() => i.addCommand && navigator.clipboard.writeText(i.addCommand)}
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-1 font-mono text-[10px] text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-100"
                    title="Copy install command"
                  >
                    <Copy size={10} />
                    copy
                  </button>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-zinc-500">{i.description}</p>
                {i.docs && (
                  <button
                    onClick={() => i.docs && api.openExternal(i.docs)}
                    className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-sky-400 hover:underline"
                  >
                    <BookOpen size={10} />
                    docs
                  </button>
                )}
              </li>
            ))}
          </ul>
          {items.length === 0 && (
            <Empty title="No components yet" icon={<BrandLogo id="shadcn" size={18} />}>
              Find the primitive that should replace hand-rolled markup.
            </Empty>
          )}
        </Panel>
      </div>
    </div>
  )
}
