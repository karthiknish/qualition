import { useState } from 'react'
import type { MobbinReference } from '../../../shared/types'
import { api } from '../lib/api'
import { Button, Empty, Input, Panel } from '../components/ui'

export default function Explore({ runId }: { runId?: string }): JSX.Element {
  const [mQuery, setMQuery] = useState('pricing section with plan cards and toggle')
  const [kind, setKind] = useState<'screen' | 'section'>('screen')
  const [refs, setRefs] = useState<MobbinReference[]>([])
  const [mBusy, setMBusy] = useState(false)
  const [mError, setMError] = useState('')

  const [rQuery, setRQuery] = useState('accordion')
  const [items, setItems] = useState<any[]>([])

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

  return (
    <div className="grid grid-cols-2 gap-4 p-6">
      <Panel
        title="Mobbin reference search"
        right={
          <div className="flex gap-1">
            {(['screen', 'section'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={
                  kind === k
                    ? 'rounded-md bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-100'
                    : 'rounded-md px-2 py-0.5 text-[11px] text-zinc-500'
                }
              >
                {k}s
              </button>
            ))}
          </div>
        }
      >
        <div className="flex gap-2">
          <Input value={mQuery} onChange={setMQuery} placeholder="Describe one screen or section in plain language" />
          <Button onClick={searchMobbin} disabled={mBusy}>{mBusy ? '…' : 'Search'}</Button>
        </div>
        {mError && <p className="mt-2 text-[12px] text-red-400">{mError}</p>}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {refs.map((r, i) => (
            <button key={i} onClick={() => r.mobbinUrl && api.openExternal(r.mobbinUrl)} className="text-left">
              {r.imageUrl && (
                <img
                  src={r.imageUrl.startsWith('http') ? r.imageUrl : api.asset(r.imageUrl)}
                  alt={r.title}
                  className="h-40 w-full rounded-lg border border-zinc-800 object-cover object-top"
                />
              )}
              <span className="mt-1 block truncate text-[11px] text-zinc-400">{r.appName ?? r.title}</span>
            </button>
          ))}
        </div>
        {refs.length === 0 && !mBusy && <Empty>Search shipped UI to compare against.</Empty>}
      </Panel>

      <Panel title="shadcn registry search">
        <div className="flex gap-2">
          <Input value={rQuery} onChange={setRQuery} placeholder="e.g. data table, pricing, sidebar, otp" />
          <Button onClick={async () => setItems(await api.searchRegistry(rQuery))}>Search</Button>
        </div>
        <ul className="mt-3 space-y-1.5">
          {items.map((i) => (
            <li key={`${i.registry}/${i.name}`} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] text-zinc-100">
                  {i.name} <span className="text-[10px] uppercase text-zinc-600">{i.type.replace('registry:', '')}</span>
                </span>
                <button
                  onClick={() => navigator.clipboard.writeText(i.addCommand)}
                  className="rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 hover:text-zinc-100"
                >
                  {i.addCommand}
                </button>
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-500">{i.description}</p>
              {i.docs && (
                <button onClick={() => api.openExternal(i.docs)} className="mt-1 text-[10px] text-sky-400 hover:underline">
                  docs
                </button>
              )}
            </li>
          ))}
        </ul>
        {items.length === 0 && <Empty>Find the primitive that should replace hand-rolled markup.</Empty>}
      </Panel>
    </div>
  )
}
