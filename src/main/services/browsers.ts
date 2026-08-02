/**
 * Resolve Playwright Chromium for packaged Electron builds.
 *
 * Dev uses the default cache (`~/Library/Caches/ms-playwright` etc.).
 * Packaged apps expect browsers under `resources/ms-playwright`, copied by
 * `scripts/bundle-browsers.mjs` during `npm run dist`.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export function configurePlaywrightBrowsersPath(): void {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return
  const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (!resources) return
  const bundled = join(resources, 'ms-playwright')
  if (existsSync(bundled)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = bundled
  }
}
