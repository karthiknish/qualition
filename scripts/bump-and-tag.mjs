#!/usr/bin/env node
/**
 * Ensure package.json has a version that is tagged for release.
 *
 * - If v$version already exists → patch-bump + commit
 * - If v$version is missing → tag the current version (already bumped in-commit)
 *
 * Env:
 *   GIT_PUSH=1     push commit + tag to origin
 *   DRY_RUN=1      print actions only
 *
 * Skip when the triggering commit message contains [skip-release].
 * Writes `.release-version` for CI consumers.
 */
import { execFileSync, execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dry = process.env.DRY_RUN === '1'
const doPush = process.env.GIT_PUSH === '1'

function sh(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts
  }).trim()
}

function shOut(cmd) {
  try {
    return sh(cmd)
  } catch {
    return ''
  }
}

function tagExists(tag) {
  try {
    execFileSync('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`], {
      cwd: root,
      stdio: 'ignore'
    })
    return true
  } catch {
    return false
  }
}

function readVersion() {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
}

const msg = shOut('git log -1 --pretty=%B')
if (/\[skip-release\]/i.test(msg)) {
  console.log('skip-release in commit message — nothing to do')
  process.exit(0)
}

let version = readVersion()
let didBump = false

if (tagExists(`v${version}`)) {
  const nextHint = version.replace(/(\d+)$/, (_, n) => String(Number(n) + 1))
  console.log(`tag v${version} already exists → npm version patch (${version} → ~${nextHint})`)
  if (!dry) {
    sh('npm version patch --no-git-tag-version')
    version = readVersion()
    didBump = true
  } else {
    version = nextHint
    didBump = true
  }
} else {
  console.log(`no tag for v${version} — will tag current version`)
}

const tag = `v${version}`
writeFileSync(join(root, '.release-version'), `${version}\n`)

if (dry) {
  console.log(`DRY_RUN: would ${didBump ? 'commit + ' : ''}tag ${tag}${doPush ? ' and push' : ''}`)
  console.log(`VERSION=${version}`)
  console.log(`TAG=${tag}`)
  process.exit(0)
}

if (didBump) {
  sh('git add package.json package-lock.json')
  try {
    sh(`git commit -m "chore(release): ${tag} [skip-release]"`)
  } catch (e) {
    const err = `${e.stderr || ''} ${e.stdout || ''} ${e.message || ''}`
    if (!/nothing to commit/i.test(err)) throw e
  }
}

if (!tagExists(tag)) {
  sh(`git tag -a ${tag} -m ${tag}`)
  console.log(`created ${tag}`)
} else {
  console.log(`tag ${tag} already present`)
}

if (doPush) {
  sh('git push origin HEAD:main')
  sh(`git push origin ${tag}`)
  console.log(`pushed HEAD and ${tag}`)
}

console.log(`VERSION=${version}`)
console.log(`TAG=${tag}`)
