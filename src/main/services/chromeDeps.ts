/**
 * chrome-launcher imports `lighthouse-logger` as a bare specifier. In packaged
 * Electron builds electron-builder sometimes nests that package only under
 * `lighthouse/node_modules`, so chrome-launcher's ESM resolve fails with
 * "Cannot find package 'lighthouse-logger'" and both Lighthouse and pa11y abort.
 *
 * Call before importing chrome-launcher. Prefers a top-level resolve; otherwise
 * registers a short-lived ESM resolve hook aimed at lighthouse's nested copy.
 */
import { createRequire, register } from 'node:module'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

let ready = false

export function ensureLighthouseLoggerResolvable(): void {
  if (ready) return
  const req = createRequire(import.meta.url)

  try {
    req.resolve('lighthouse-logger')
    ready = true
    return
  } catch {
    /* fall through to nested hook */
  }

  let nestedDir: string | null = null
  for (const candidate of [
    'lighthouse/node_modules/lighthouse-logger/package.json',
    // Some installs hoist under chrome-launcher instead.
    'chrome-launcher/node_modules/lighthouse-logger/package.json'
  ]) {
    try {
      nestedDir = dirname(req.resolve(candidate))
      break
    } catch {
      /* try next */
    }
  }
  if (!nestedDir) return

  const parentURL = pathToFileURL(nestedDir + '/').href
  const hookSource = `
    export async function resolve(specifier, context, nextResolve) {
      if (specifier === 'lighthouse-logger') {
        try {
          return await nextResolve(specifier, context);
        } catch (err) {
          return nextResolve(specifier, { ...context, parentURL: ${JSON.stringify(parentURL)} });
        }
      }
      return nextResolve(specifier, context);
    }
  `
  try {
    register(`data:text/javascript,${encodeURIComponent(hookSource)}`, import.meta.url)
    ready = true
  } catch {
    /* older Node / Electron without module.register — direct dep must cover packaging */
  }
}

export async function importChromeLauncher(): Promise<typeof import('chrome-launcher')> {
  ensureLighthouseLoggerResolvable()
  try {
    await import('lighthouse-logger')
  } catch {
    /* hook may still satisfy chrome-launcher's import */
  }
  return import('chrome-launcher')
}
