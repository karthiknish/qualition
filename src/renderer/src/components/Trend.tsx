import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { Run } from '../../../shared/types'

export function RunTrend({ runs }: { runs: Run[] }): JSX.Element | null {
  const data = runs
    .filter((r) => r.status === 'done' && r.scorecard)
    .slice(0, 20)
    .reverse()
    .map((r) => ({
      id: r.id.slice(0, 6),
      overall: r.scorecard!.overall,
      grade: r.scorecard!.grade,
      findings: r.findings.length,
      craft: r.scorecard!.categories.craft?.score ?? 0,
      a11y: r.scorecard!.categories.accessibility?.score ?? 0,
      at: new Date(r.createdAt).toLocaleDateString()
    }))
  if (data.length < 2) return null
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-zinc-500">Trend · last {data.length} runs</span>
        <span className="flex gap-2 text-[10px]">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />overall</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" />craft</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />a11y</span>
        </span>
      </div>
      <div className="h-28 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="id" tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#a1a1aa' }} width={28} />
            <Tooltip
              contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 10, fontSize: 12 }}
              formatter={(v: number, name: string) => [v, name]}
              labelFormatter={(l) => `run ${l}`}
            />
            <Line type="monotone" dataKey="overall" stroke="#a1a1aa" strokeWidth={1.75} dot={{ r: 2, strokeWidth: 1 }} activeDot={{ r: 3 }} />
            <Line type="monotone" dataKey="craft" stroke="#0ea5e9" strokeWidth={1.25} dot={false} />
            <Line type="monotone" dataKey="a11y" stroke="#f59e0b" strokeWidth={1.25} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex gap-2 text-[11px] text-zinc-500">
        {data.slice(-3).map((d) => (
          <span key={d.id} className="rounded bg-zinc-800 px-1.5 py-0.5">
            {d.id} · {d.grade} {d.overall} · {d.findings}f
          </span>
        ))}
      </div>
    </div>
  )
}
