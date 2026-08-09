/** SARIF export for GitHub Advanced Security (code scanning). */
import type { Run, Finding, Severity } from '../../shared/types.js'

const SEV_LEVEL: Record<Severity, 'error' | 'warning' | 'note'> = {
  blocker: 'error',
  critical: 'error',
  major: 'warning',
  minor: 'warning',
  nit: 'note'
}

function ruleId(f: Finding): string {
  return `${f.category}/${f.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48)}`
}

export function runToSarif(run: Run): unknown {
  const rules = new Map<string, unknown>()
  const results: unknown[] = []
  for (const f of run.findings) {
    const rid = ruleId(f)
    if (!rules.has(rid)) {
      rules.set(rid, {
        id: rid,
        name: f.title,
        shortDescription: { text: f.title },
        fullDescription: { text: f.detail.slice(0, 1000) },
        help: { text: f.fix.slice(0, 2000), markdown: f.fix.slice(0, 2000) },
        properties: { category: f.category, severity: f.severity, source: f.source }
      })
    }
    // best-effort file location: selector → file:line unknown, so uri = pageUrl
    let uri: string
    try {
      const u = new URL(f.pageUrl)
      uri = u.pathname || '/'
    } catch {
      uri = f.pageUrl
    }
    results.push({
      ruleId: rid,
      level: SEV_LEVEL[f.severity],
      message: { text: `${f.title} — ${f.detail.slice(0, 500)}` },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri, uriBaseId: '%SRCROOT%' },
            region: f.evidence?.[0] ? { startLine: 1 } : undefined
          }
        }
      ],
      properties: { severity: f.severity, category: f.category, pageUrl: f.pageUrl, selector: f.selector }
    })
  }
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'Qualition',
            version: '0.1.28',
            informationUri: 'https://github.com/karthiknish/qualition',
            rules: [...rules.values()]
          }
        },
        results,
        automationDetails: { id: `qualition/${run.id}` },
        properties: { runId: run.id, targetUrl: run.config.targetUrl, grade: run.scorecard?.grade, overall: run.scorecard?.overall }
      }
    ]
  }
}
