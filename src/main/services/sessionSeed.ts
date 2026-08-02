/**
 * Apply a Playwright storageState (cookies + origin localStorage) into a
 * separately launched Chrome so Lighthouse / pa11y see the signed-in app —
 * Cookie headers alone miss SPA sessions that live in localStorage.
 */
import { readFileSync } from 'node:fs'
import { chromium, type Cookie } from 'playwright'

export interface StorageStateFile {
  cookies?: Cookie[]
  origins?: { origin: string; localStorage?: { name: string; value: string }[] }[]
}

export function readStorageState(path: string): StorageStateFile | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as StorageStateFile
  } catch {
    return null
  }
}

/** Cookie header for one URL from a storageState file (legacy / header-only tools). */
export function cookieHeaderFor(url: string, storageStatePath?: string): string | undefined {
  if (!storageStatePath) return undefined
  const state = readStorageState(storageStatePath)
  if (!state?.cookies?.length) return undefined
  try {
    const host = new URL(url).hostname
    const cookies = state.cookies.filter((c) => {
      const d = (c.domain ?? '').replace(/^\./, '')
      return host === d || host.endsWith(`.${d}`)
    })
    if (!cookies.length) return undefined
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  } catch {
    return undefined
  }
}

function originFor(url: string, state: StorageStateFile): string {
  try {
    const want = new URL(url).origin
    const hit = state.origins?.find((o) => o.origin === want)
    if (hit) return hit.origin
  } catch {
    /* fall through */
  }
  return state.origins?.[0]?.origin ?? new URL(url).origin
}

/**
 * Connect to a chrome-launcher / CDP endpoint, inject cookies + localStorage,
 * then disconnect. Call before Lighthouse/pa11y with `disableStorageReset`.
 */
export async function seedChromeViaCdp(
  cdpUrl: string,
  pageUrl: string,
  storageStatePath: string
): Promise<{ cookies: number; localStorage: number }> {
  const state = readStorageState(storageStatePath)
  if (!state) return { cookies: 0, localStorage: 0 }

  const browser = await chromium.connectOverCDP(cdpUrl)
  let cookieCount = 0
  let storageCount = 0
  try {
    const context = browser.contexts()[0] ?? (await browser.newContext())
    if (state.cookies?.length) {
      const usable = state.cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite
      }))
      await context.addCookies(usable)
      cookieCount = usable.length
    }

    const page = context.pages()[0] ?? (await context.newPage())
    const origin = originFor(pageUrl, state)
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30_000 })

    const items =
      state.origins?.find((o) => o.origin === origin)?.localStorage ??
      state.origins?.flatMap((o) => o.localStorage ?? []) ??
      []
    if (items.length) {
      await page.evaluate((entries) => {
        for (const { name, value } of entries) {
          try {
            window.localStorage.setItem(name, value)
          } catch {
            /* quota / security */
          }
        }
      }, items)
      storageCount = items.length
    }

    // Touch the real target once so any path-scoped cookies settle.
    if (pageUrl !== origin) {
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {})
    }
  } finally {
    // Disconnect only — do not kill chrome-launcher's process.
    await browser.close().catch(() => {})
  }
  return { cookies: cookieCount, localStorage: storageCount }
}
