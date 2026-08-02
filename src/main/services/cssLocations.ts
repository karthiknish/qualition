/**
 * css-tree source locations for authored-CSS findings.
 *
 * Project Wallace tells you *that* !important / ID selectors / z-index sprawl
 * exist. css-tree tells you *where* — line:column in the concatenated sheet —
 * so the fix prompt can point at a real place in the codebase.
 */
import * as csstree from 'css-tree'
import type { CssLocation } from '../../shared/types.js'

export function locateCssIssues(css: string, limit = 50): CssLocation[] {
  if (!css || css.length < 20) return []
  const out: CssLocation[] = []
  let ast: csstree.CssNode
  try {
    ast = csstree.parse(css, {
      positions: true,
      parseValue: true,
      parseCustomProperty: false
    })
  } catch {
    return []
  }

  const push = (loc: CssLocation): void => {
    if (out.length < limit) out.push(loc)
  }

  csstree.walk(ast, (node) => {
    if (out.length >= limit) return

    if (node.type === 'Rule' && node.prelude) {
      let selector = ''
      try {
        selector = csstree.generate(node.prelude)
      } catch {
        return
      }
      // ID selectors force specificity wars.
      if (/(^|[\s>+~|,])#[A-Za-z_][\w-]*/.test(selector) && node.loc?.start) {
        push({
          reason: 'id-selector',
          selector: selector.slice(0, 120),
          line: node.loc.start.line,
          column: node.loc.start.column
        })
      }
    }

    if (node.type === 'Declaration' && node.loc?.start) {
      const prop = node.property
      let value = ''
      try {
        value = csstree.generate(node.value).trim()
      } catch {
        value = ''
      }
      if (node.important) {
        push({
          reason: 'important',
          property: prop,
          value: value.slice(0, 80),
          line: node.loc.start.line,
          column: node.loc.start.column
        })
      }
      if (prop === 'z-index') {
        const n = parseInt(value, 10)
        if (Number.isFinite(n) && Math.abs(n) >= 1000) {
          push({
            reason: 'high-z',
            property: prop,
            value,
            line: node.loc.start.line,
            column: node.loc.start.column
          })
        }
      }
      if (prop.startsWith('-webkit-') || prop.startsWith('-moz-') || prop.startsWith('-ms-')) {
        push({
          reason: 'vendor-prefix',
          property: prop,
          value: value.slice(0, 80),
          line: node.loc.start.line,
          column: node.loc.start.column
        })
      }
    }
  })

  return out
}

/** Format a handful of locations for a finding detail line. */
export function formatLocations(locs: CssLocation[], reason: CssLocation['reason'], max = 5): string {
  const hits = locs.filter((l) => l.reason === reason).slice(0, max)
  if (!hits.length) return ''
  return (
    'Locations: ' +
    hits
      .map((l) => {
        const what = l.selector ?? `${l.property ?? ''}${l.value ? `: ${l.value}` : ''}`
        return `${what.trim()} @ ${l.line}:${l.column}`
      })
      .join('; ')
  )
}
