#!/usr/bin/env node
/**
 * Ensure package.json has a version that is tagged for release.
 *
 * - While v$version exists → patch-bump until free
 * - If v$version is missing → tag the current version
 *
 * Env:
 *   GIT_PUSH=1     push the release tag to origin (not main — branch protection)
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

function bumpPatch(version) {
  const parts = version.split('.').map((n) => Number(n))
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`expected semver x.y.z, got ${version}`)
  }
  parts[2] += 1
  return parts.join('.')
}

const msg = shOut('git log -1 --pretty=%B')
if (/\[skip-release\]/i.test(msg)) {
  console.log('skip-release in commit message — nothing to do')
  process.exit(0)
}

let version = readVersion()
let didBump = false
let guard = 0

while (tagExists(`v${version}`)) {
  if (++guard > 50) throw new Error('could not find a free patch version')
  const next = bumpPatch(version)
  console.log(`tag v${version} already exists → bump ${version} → ${next}`)
  if (!dry) {
    sh('npm version patch --no-git-tag-version')
    version = readVersion()
  } else {
    version = next
  }
  didBump = true
}

if (!didBump) console.log(`no tag for v${version} — will tag current version`)

const tag = `v${version}`
writeFileSync(join(root, '.release-version'), `${version}\n`)
writeFileSync(join(root, '.release-bumped'), didBump ? 'true\n' : 'false\n')

if (dry) {
  console.log(`DRY_RUN: would ${didBump ? 'commit + ' : ''}tag ${tag}${doPush ? ' and push tag' : ''}`)
  console.log(`VERSION=${version}`)
  console.log(`TAG=${tag}`)
  console.log(`BUMPED=${didBump}`)
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
  // Never push to main here — protected branches reject GITHUB_TOKEN without
  // the required status check. Tags are enough for GitHub Releases.
  sh(`git push origin ${tag}`)
  console.log(`pushed ${tag}`)
}

console.log(`VERSION=${version}`)
console.log(`TAG=${tag}`)
console.log(`BUMPED=${didBump}`)
