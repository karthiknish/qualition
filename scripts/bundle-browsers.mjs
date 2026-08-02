/**
 * Copy Playwright Chromium into resources/ms-playwright for electron-builder.
 * Run before packaging so the desktop app can launch Chromium offline.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const dest = join(root, 'resources', 'ms-playwright')

const candidates = [
  process.env.PLAYWRIGHT_BROWSERS_PATH,
  join(homedir(), 'Library', 'Caches', 'ms-playwright'),
  join(homedir(), '.cache', 'ms-playwright'),
  join(process.env.LOCALAPPDATA || '', 'ms-playwright')
].filter(Boolean)

const src = candidates.find((p) => p && existsSync(p))
mkdirSync(join(root, 'resources'), { recursive: true })
if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })

if (!src) {
  console.warn('[bundle-browsers] No Playwright browser cache found — run `npx playwright install chromium` first.')
  console.warn('[bundle-browsers] Created empty resources/ms-playwright so electron-builder still packs.')
  process.exit(0)
}

const entries = readdirSync(src).filter((n) => /^(chromium|ffmpeg|chromium_headless_shell)/i.test(n))
if (!entries.length) {
  console.warn(`[bundle-browsers] No chromium entries under ${src}`)
  process.exit(0)
}

for (const name of entries) {
  cpSync(join(src, name), join(dest, name), { recursive: true })
  console.log(`[bundle-browsers] copied ${name}`)
}
console.log(`[bundle-browsers] ready at ${dest}`)
