/**
 * Design-token extraction via Style Dictionary.
 *
 * Authored CSS custom properties become a Style Dictionary token tree, which
 * we validate by building a CSS variables platform. That is the difference
 * between "we saw some colours in the DOM" and "this stylesheet has a real
 * token system that can be published".
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as csstree from 'css-tree'
import type { CapturedPage, Finding, RunConfig, Severity, TokenDictionary } from '../../shared/types.js'

let seq = 0

function mk(
  page: CapturedPage,
  severity: Severity,
  title: string,
  detail: string,
  fix: string
): Finding {
  return {
    id: `tok${++seq}`,
    category: 'coherence',
    severity,
    title,
    detail,
    fix,
    pageUrl: page.url,
    source: 'heuristic'
  }
}

function inferType(name: string, value: string): string {
  const n = name.toLowerCase()
  const v = value.toLowerCase()
  if (/color|colour|bg|foreground|fill|stroke|border/.test(n) || /^(#|rgb|hsl|oklch|lab)/.test(v))
    return 'color'
  if (/radius|rounded/.test(n) || /px|rem|em|%/.test(v) && /radius/.test(n)) return 'borderRadius'
  if (/shadow|elevation/.test(n) || /rgba?\([^)]+\)\s+-?\d/.test(v)) return 'boxShadow'
  if (/font|family|typeface/.test(n)) return 'fontFamilies'
  if (/size|text|leading|line-height/.test(n) && /px|rem|em|%/.test(v)) return 'fontSizes'
  if (/space|gap|pad|margin|inset/.test(n)) return 'spacing'
  if (/duration|ease|timing|transition/.test(n)) return 'duration'
  if (/z-?index|layer/.test(n)) return 'zIndex'
  return 'other'
}

function nestToken(
  tree: Record<string, any>,
  path: string[],
  entry: Record<string, unknown>
): void {
  let cur = tree
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {}
    cur = cur[key]
  }
  cur[path[path.length - 1]] = entry
}

/** Pull `--*` custom properties out of authored CSS into a Style Dictionary tree. */
export function extractTokenTree(css: string): { tokens: Record<string, any>; flat: { name: string; value: string; type: string }[] } {
  const flat: { name: string; value: string; type: string }[] = []
  if (!css || css.length < 20) return { tokens: {}, flat }

  try {
    const ast = csstree.parse(css, { positions: false, parseValue: false, parseCustomProperty: true })
    csstree.walk(ast, (node) => {
      if (node.type !== 'Declaration') return
      const prop = node.property
      if (!prop.startsWith('--')) return
      let value = ''
      try {
        value = csstree.generate(node.value).trim()
      } catch {
        return
      }
      if (!value || value.length > 200) return
      const name = prop.slice(2)
      const type = inferType(name, value)
      flat.push({ name, value, type })
    })
  } catch {
    return { tokens: {}, flat }
  }

  // Dedupe by name (last wins — later themes override).
  const byName = new Map<string, { value: string; type: string }>()
  for (const t of flat) byName.set(t.name, { value: t.value, type: t.type })

  const tokens: Record<string, any> = {}
  for (const [name, { value, type }] of byName) {
    const parts = name.split(/[-_]/).filter(Boolean)
    const path = parts.length ? parts : [name]
    // DTCG shape ($value / $type) is what Style Dictionary v5 expects; keep
    // legacy value/type alongside so older tooling still reads the JSON.
    nestToken(tokens, path, { $value: value, $type: type, value, type })
  }
  return { tokens, flat: [...byName.entries()].map(([name, v]) => ({ name, ...v })) }
}

function groupCounts(flat: { type: string }[]): TokenDictionary['groups'] {
  const groups = { colors: 0, spacing: 0, typography: 0, radii: 0, shadows: 0, other: 0 }
  for (const t of flat) {
    if (t.type === 'color') groups.colors++
    else if (t.type === 'spacing') groups.spacing++
    else if (t.type === 'fontFamilies' || t.type === 'fontSizes') groups.typography++
    else if (t.type === 'borderRadius') groups.radii++
    else if (t.type === 'boxShadow') groups.shadows++
    else groups.other++
  }
  return groups
}

/**
 * Extract tokens, optionally build them through Style Dictionary, and write
 * artefacts into the run assets directory.
 */
export async function buildTokenDictionary(
  css: string,
  outDir: string,
  slug = 'tokens'
): Promise<TokenDictionary | null> {
  const { tokens, flat } = extractTokenTree(css)
  if (flat.length < 2) return null

  const dict: TokenDictionary = {
    tokens,
    count: flat.length,
    groups: groupCounts(flat)
  }

  try {
    await mkdir(outDir, { recursive: true })
    const tokensPath = join(outDir, `${slug}.tokens.json`)
    await writeFile(tokensPath, JSON.stringify(tokens, null, 2))
    dict.file = tokensPath

    // Validate the tree by asking Style Dictionary to emit CSS variables.
    const StyleDictionary = (await import('style-dictionary')).default
    const sd = new StyleDictionary({
      tokens,
      platforms: {
        css: {
          transformGroup: 'css',
          buildPath: join(outDir, `${slug}-sd`) + '/',
          files: [{ destination: 'variables.css', format: 'css/variables' }]
        }
      }
    })
    await sd.hasInitialized
    await sd.buildAllPlatforms()
    dict.builtCss = join(outDir, `${slug}-sd`, 'variables.css')
  } catch (e) {
    dict.buildError = (e as Error).message.slice(0, 240)
  }

  return dict
}

/** Findings about the quality of the extracted token system. */
export function auditTokens(
  page: CapturedPage,
  dict: TokenDictionary | null | undefined,
  config: RunConfig
): Finding[] {
  if (!dict) return []
  const out: Finding[] = []
  const strict = config.brutality === 'ruthless' ? 1 : config.brutality === 'harsh' ? 0.75 : 0.5
  const g = dict.groups

  if (dict.count >= 8 && g.colors === 0 && strict > 0.5) {
    out.push(
      mk(
        page,
        'minor',
        `${dict.count} CSS custom properties, none look like colour tokens`,
        `Groups: spacing ${g.spacing}, type ${g.typography}, radii ${g.radii}, other ${g.other}. A design system without colour tokens is a naming convention, not a palette.`,
        'Rename colour variables to --color-* (or --bg/--fg) so the token tree is publishable.'
      )
    )
  }
  if (dict.count > 120) {
    out.push(
      mk(
        page,
        dict.count > 250 ? 'major' : 'minor',
        `${dict.count} design tokens extracted from authored CSS`,
        `Style Dictionary groups — colour ${g.colors}, spacing ${g.spacing}, type ${g.typography}, radii ${g.radii}, shadows ${g.shadows}, other ${g.other}.`,
        'Collapse one-offs. A publishable token set is usually under ~80 names with clear aliases.'
      )
    )
  }
  if (dict.buildError) {
    out.push(
      mk(
        page,
        'minor',
        'Style Dictionary could not build the extracted tokens',
        dict.buildError,
        'Fix invalid token values (empty, circular refs, illegal characters) so the set can emit CSS variables.'
      )
    )
  } else if (dict.builtCss && dict.count >= 4) {
    // Positive signal — keep it quiet unless ruthless wants the inventory noted.
    if (strict > 0.9) {
      out.push(
        mk(
          page,
          'nit',
          `Style Dictionary built ${dict.count} tokens → CSS variables`,
          `Wrote ${dict.file ?? 'tokens.json'} and ${dict.builtCss}.`,
          'Nothing to fix — this is the inventory the rest of the coherence findings refer to.'
        )
      )
    }
  }

  return out
}
