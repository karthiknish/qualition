import type { ReactNode } from 'react'
import { cx } from '../lib/api'

export function PageHeader({
  title,
  description,
  actions,
  eyebrow
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
}): JSX.Element {
  return (
    <header className="animate-fade-up flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-2xl">
        {eyebrow && (
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">{eyebrow}</p>
        )}
        <h1 className="text-[22px] font-semibold tracking-tight text-zinc-50">{title}</h1>
        {description && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Panel({
  title,
  right,
  children,
  className,
  bodyClassName
}: {
  title?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}): JSX.Element {
  return (
    <section
      className={cx(
        'rounded-2xl border border-zinc-800/90 bg-zinc-900/35 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.03)] backdrop-blur-[2px]',
        className
      )}
    >
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 border-b border-zinc-800/80 px-4 py-2.5">
          <h2 className="text-[12px] font-medium tracking-wide text-zinc-300">{title}</h2>
          {right}
        </header>
      )}
      <div className={cx('p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

export function Button({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  disabled,
  className,
  type = 'button'
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit'
}): JSX.Element {
  const variants = {
    default: 'bg-zinc-800/90 hover:bg-zinc-700 text-zinc-100 border-zinc-700/80',
    primary:
      'bg-zinc-100 hover:bg-white text-zinc-950 border-transparent font-medium shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_8px_24px_-12px_rgb(255_255_255/0.35)]',
    ghost: 'bg-transparent hover:bg-zinc-800/70 text-zinc-300 border-transparent',
    danger: 'bg-red-500/10 hover:bg-red-500/20 text-red-300 border-red-500/30'
  }
  const sizes = {
    sm: 'px-2.5 py-1 text-xs',
    md: 'px-3.5 py-1.5 text-[13px]',
    lg: 'px-4 py-2.5 text-[14px]'
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-xl border transition-[background-color,border-color,transform,box-shadow] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100',
        sizes[size],
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
  className,
  autoFocus,
  id
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  className?: string
  autoFocus?: boolean
  id?: string
}): JSX.Element {
  return (
    <input
      id={id}
      type={type}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      className={cx(
        'w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-[13px] text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-500 focus:bg-zinc-950',
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
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/90">
      <div
        className={cx('h-full rounded-full transition-[width] duration-500 ease-out', className ?? 'bg-zinc-300')}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

export function Empty({
  children,
  title,
  icon
}: {
  children: ReactNode
  title?: string
  icon?: ReactNode
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60 text-zinc-500">
        {icon ?? <span className="text-lg leading-none">·</span>}
      </div>
      {title && <p className="text-[13px] font-medium text-zinc-300">{title}</p>}
      <div className={cx('max-w-sm text-[13px] leading-relaxed text-zinc-500', title && 'mt-1')}>{children}</div>
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  icon
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
  icon?: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cx(
        'flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
        checked
          ? 'border-zinc-600/80 bg-zinc-900/80'
          : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700'
      )}
    >
      <span
        className={cx(
          'mt-0.5 flex h-5 w-8 shrink-0 items-center rounded-full p-0.5 transition-colors',
          checked ? 'bg-emerald-500/85' : 'bg-zinc-700'
        )}
      >
        <span
          className={cx(
            'h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150',
            checked && 'translate-x-3'
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[13px] text-zinc-100">
          {icon}
          {label}
        </span>
        {hint && <span className="mt-0.5 block text-[11px] leading-snug text-zinc-500">{hint}</span>}
      </span>
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options
}: {
  value: T
  onChange: (v: T) => void
  options: { id: T; label: string; hint?: string }[]
}): JSX.Element {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const active = value === o.id
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={cx(
              'rounded-xl border p-3 text-left transition-colors',
              active
                ? 'border-zinc-400/50 bg-zinc-800/80 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.04)]'
                : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
            )}
          >
            <div className={cx('text-[13px]', active ? 'text-zinc-50' : 'text-zinc-200')}>{o.label}</div>
            {o.hint && <div className="mt-0.5 text-[11px] leading-snug text-zinc-500">{o.hint}</div>}
          </button>
        )
      })}
    </div>
  )
}

export function Chip({
  active,
  onClick,
  children
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'rounded-lg border px-2.5 py-1 text-[12px] transition-colors',
        active
          ? 'border-zinc-500 bg-zinc-800 text-zinc-50'
          : 'border-zinc-800 bg-zinc-950/60 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
      )}
    >
      {children}
    </button>
  )
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }): JSX.Element {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] text-zinc-400">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] leading-snug text-zinc-600">{hint}</p>}
    </div>
  )
}
