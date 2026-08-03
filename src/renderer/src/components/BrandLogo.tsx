import type { ComponentType, SVGProps } from 'react'
import {
  Chrome,
  CursorDark,
  Electron,
  Gemini,
  OpenAIDark,
  OpenRouterDark,
  Playwright,
  ShadcnUiDark
} from '@ridemountainpig/svgl-react'
import { cx } from '../lib/api'

export type BrandId =
  | 'gemini'
  | 'openai'
  | 'openrouter'
  | 'cursor'
  | 'playwright'
  | 'chrome'
  | 'shadcn'
  | 'electron'

type SvgComp = ComponentType<SVGProps<SVGSVGElement>>

const BRANDS: Record<BrandId, SvgComp> = {
  gemini: Gemini,
  openai: OpenAIDark,
  openrouter: OpenRouterDark,
  cursor: CursorDark,
  playwright: Playwright,
  chrome: Chrome,
  shadcn: ShadcnUiDark,
  electron: Electron
}

/** Brand SVG from https://svgl.app via @ridemountainpig/svgl-react. */
export function BrandLogo({
  id,
  size = 14,
  className,
  title
}: {
  id: BrandId
  size?: number
  className?: string
  title?: string
}): JSX.Element {
  const Comp = BRANDS[id]
  return (
    <Comp
      width={size}
      height={size}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      role={title ? 'img' : undefined}
      className={cx('shrink-0', className)}
    />
  )
}

export function providerBrand(id: string | undefined): BrandId | null {
  if (id === 'gemini' || id === 'openai' || id === 'openrouter' || id === 'cursor') return id
  return null
}
