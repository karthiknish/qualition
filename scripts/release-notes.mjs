#!/usr/bin/env node
/**
 * Build markdown release notes from commits since the previous semver tag.
 *
 * Usage:
 *   node scripts/release-notes.mjs [version|vX.Y.Z]
 *   node scripts/release-notes.mjs 0.1.30 > .release-notes.md
 *
 * Env:
 *   PREV_TAG=v0.1.29   force the compare base (optional)
 *   REPO=owner/name    default karthiknish/qualition
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = process.env.REPO || 'karthiknish/qualition'

function sh(cmd) {
  return execSync(cmd, { cwd: root, encoding: 'utf8' }).trim()
}

function shOut(cmd) {
  try {
    return sh(cmd)
  } catch {
    return ''
  }
}

function parseSemver(tag) {
  const m = String(tag)
    .replace(/^v/, '')
    .match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function cmpSemver(a, b) {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa || !pb) return String(a).localeCompare(String(b))
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i]
  }
  return 0
}

function readPkgVersion() {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
}

function normalizeTag(input) {
  const raw = (input || readPkgVersion()).trim()
  const v = raw.replace(/^v/, '')
  return { version: v, tag: `v${v}` }
}

function previousTag(tag) {
  if (process.env.PREV_TAG) return process.env.PREV_TAG.trim()
  const tags = shOut('git tag -l "v*"')
    .split('\n')
    .map((t) => t.trim())
    .filter((t) => parseSemver(t))
    .sort(cmpSemver)
  const idx = tags.indexOf(tag)
  if (idx > 0) return tags[idx - 1]
  // Tag may not exist locally yet (CI just created it) — use highest older tag.
  const older = tags.filter((t) => cmpSemver(t, tag) < 0)
  return older.at(-1) || ''
}

/** @returns {{ type: string, scope: string, subject: string, raw: string } | null} */
function parseCommit(subject) {
  const raw = subject.trim()
  if (!raw) return null
  if (/^Merge (pull request|branch)\b/i.test(raw)) return null
  if (/^chore\(release\):/i.test(raw)) return null
  if (/^v\d+\.\d+\.\d+$/i.test(raw)) return null

  const m = /^(feat|fix|perf|refactor|docs|test|build|ci|chore|style)(?:\(([^)]+)\))?!?:\s*(.+)$/i.exec(raw)
  if (m) {
    return {
      type: m[1].toLowerCase(),
      scope: (m[2] || '').trim(),
      subject: m[3].trim().replace(/\s*\[skip-release\]\s*/gi, '').trim(),
      raw
    }
  }
  return {
    type: 'other',
    scope: '',
    subject: raw.replace(/\s*\[skip-release\]\s*/gi, '').trim(),
    raw
  }
}

function bucket(type) {
  if (type === 'feat') return 'Features'
  if (type === 'fix') return 'Fixes'
  if (type === 'perf') return 'Performance'
  if (type === 'docs') return 'Docs'
  return 'Other'
}

function bullet(entry) {
  const scope = entry.scope ? `**${entry.scope}:** ` : ''
  return `- ${scope}${entry.subject}`
}

function main() {
  const { version, tag } = normalizeTag(process.argv[2])
  const prev = previousTag(tag)
  const range = prev ? `${prev}..${tag}` : tag

  // Prefer the tag tip; fall back to HEAD when the tag is not yet reachable.
  const revList = shOut(`git rev-list --count ${range} 2>/dev/null`)
  const logRange = revList || shOut(`git rev-list --count ${prev ? `${prev}..HEAD` : 'HEAD'} 2>/dev/null`)
  const useRange = revList ? range : prev ? `${prev}..HEAD` : 'HEAD'

  const subjects = shOut(`git log ${useRange} --pretty=format:%s --no-merges`)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  const entries = subjects.map(parseCommit).filter(Boolean)
  const groups = new Map()
  for (const e of entries) {
    const key = bucket(e.type)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(e)
  }

  const order = ['Features', 'Fixes', 'Performance', 'Docs', 'Other']
  const lines = [`## Qualition ${version}`, '']

  let wrote = false
  for (const key of order) {
    const list = groups.get(key)
    if (!list?.length) continue
    wrote = true
    lines.push(`### ${key}`, '')
    for (const e of list) lines.push(bullet(e))
    lines.push('')
  }

  if (!wrote) {
    lines.push('Maintenance release.', '')
  }

  if (prev) {
    lines.push(`[Full changelog](https://github.com/${REPO}/compare/${prev}...${tag})`)
  } else {
    lines.push(`[Releases](https://github.com/${REPO}/releases/tag/${tag})`)
  }
  lines.push('')

  process.stdout.write(lines.join('\n'))
  if (process.env.DEBUG_NOTES === '1') {
    console.error(`# range=${useRange} commits=${subjects.length} kept=${entries.length} prev=${prev || '(none)'}`)
  }
}

main()
