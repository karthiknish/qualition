import type { ReactNode } from 'react'
import { cx } from '../lib/api'

export function Panel({
  title,
  right,
  children,
  className
}: {
  title?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
}): JSX.Element {
  return (
    <section className={cx('rounded-xl border border-zinc-800 bg-zinc-900/40', className)}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-2.5">
          <h2 className="text-[13px] font-medium tracking-wide text-zinc-300">{title}</h2>
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function Button({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  disabled,
  className
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
}): JSX.Element {
  const variants = {
    default: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700',
    primary: 'bg-zinc-100 hover:bg-white text-zinc-900 border-transparent font-medium',
    ghost: 'bg-transparent hover:bg-zinc-800/60 text-zinc-300 border-transparent',
    danger: 'bg-red-500/10 hover:bg-red-500/20 text-red-300 border-red-500/30'
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-[13px]',
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  )
}

export function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  className
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  className?: string
}): JSX.Element {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cx(
        'w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-600',
        className
      )}
    />
  )
}

export function Badge({
  children,
  className
}: {
  children: ReactNode
  className?: string
}): JSX.Element {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider',
        className ?? 'border-zinc-700 bg-zinc-800/60 text-zinc-300'
      )}
    >
      {children}
    </span>
  )
}

export function Bar({ value, className }: { value: number; className?: string }): JSX.Element {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
      <div className={cx('h-full rounded-full', className ?? 'bg-zinc-300')} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }): JSX.Element {
  return <div className="py-10 text-center text-[13px] text-zinc-500">{children}</div>
}

export function Toggle({
  checked,
  onChange,
  label,
  hint
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}): JSX.Element {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-left hover:border-zinc-700"
    >
      <span
        className={cx(
          'mt-0.5 flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors',
          checked ? 'bg-emerald-500/80' : 'bg-zinc-700'
        )}
      >
        <span className={cx('h-3 w-3 rounded-full bg-white transition-transform', checked && 'translate-x-3')} />
      </span>
      <span>
        <span className="block text-[13px] text-zinc-200">{label}</span>
        {hint && <span className="block text-[11px] leading-snug text-zinc-500">{hint}</span>}
      </span>
    </button>
  )
}
