/** React 19 removed the global JSX namespace; re-expose the bits we annotate with. */
import type { JSX as ReactJSX } from 'react'

declare global {
  namespace JSX {
    type Element = ReactJSX.Element
    type ElementType = ReactJSX.ElementType
    interface IntrinsicElements extends ReactJSX.IntrinsicElements {}
  }
}

export {}
