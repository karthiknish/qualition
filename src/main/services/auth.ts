/**
 * Authenticated audits.
 *
 * Logs in once with a real browser, then hands the resulting Playwright
 * storageState (cookies + localStorage) to every later context — crawl,
 * interaction probe and flows — so the whole audit runs as a signed-in user.
 *
 * Credentials are used in-memory for that one login and are never written into
 * the run file. The storageState *is* written to the run directory, because
 * that is what makes the rest of the audit possible; it holds a live session,
 * so the UI says so plainly.
 */
import type { Browser } from 'playwright'
import { join } from 'node:path'
import { Deadline, soft } from './deadline.js'
import type { AuthConfig, AuthResult } from '../../shared/types.js'
import { normalizeTargetUrl } from '../../shared/url.js'

/** Ordered candidate locators for each field, best guess first. */
export function usernameCandidates(): string[] {
  return [
    'input[type="email"]',
    'input[name="email" i]',
    'input[id="email" i]',
    'input[autocomplete="username"]',
    'input[name="username" i]',
    'input[id="username" i]',
    'input[name*="user" i]',
    'input[placeholder*="email" i]',
    'input[placeholder*="username" i]',
    'input[type="text"]'
  ]
}

export function passwordCandidates(): string[] {
  return [
    'input[type="password"]',
    'input[name="password" i]',
    'input[id="password" i]',
    'input[autocomplete="current-password"]',
    'input[placeholder*="password" i]'
  ]
}

export function submitCandidates(): string[] {
  return [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Sign in")',
    'button:has-text("Log in")',
    'button:has-text("Login")',
    'button:has-text("Continue")',
    'button:has-text("Submit")',
    '[role="button"]:has-text("Sign in")',
    'form button'
  ]
}

/** Common places a login form lives when the user did not say. */
export function loginUrlGuesses(base: string): string[] {
  // The target itself first: most apps redirect to their own login page, and
  // that costs one navigation instead of six guesses.
  const paths = ['', '/login', '/signin', '/sign-in', '/auth/login', '/users/sign_in']
  const out: string[] = []
  for (const p of paths) {
    try {
      const u = p === '' ? new URL(base) : new URL(p, base)
      const s = u.toString()
      if (!out.includes(s)) out.push(s)
    } catch {
      /* skip */
    }
  }
  return out
}

/** Strip secrets before anything is persisted or shown. */
export function redactAuth<T extends { auth?: AuthConfig }>(config: T): T {
  if (!config.auth) return config
  return {
    ...config,
    auth: {
      ...config.auth,
      password: config.auth.password ? '••••••••' : '',
      username: config.auth.username
    }
  }
}

export async function performLogin(
  browser: Browser,
  targetUrl: string,
  auth: AuthConfig,
  outDir: string,
  onLog?: (msg: string) => void,
  budgetMs = 75_000
): Promise<AuthResult> {
  // Guessing login URLs means several navigations; without a budget a slow
  // site turns "try 6 paths" into minutes of dead time before the crawl.
  const deadline = new Deadline(budgetMs)
  const statePath = join(outDir, 'auth-state.json')
  const shotPath = join(outDir, 'auth-result.png')
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true })
  const page = await ctx.newPage()
  page.setDefaultTimeout(6000)
  page.setDefaultNavigationTimeout(20_000)
  page.on('dialog', (d) => {
    d.dismiss().catch(() => {})
  })

  const urls = auth.loginUrl
    ? [normalizeTargetUrl(auth.loginUrl) ?? auth.loginUrl]
    : loginUrlGuesses(normalizeTargetUrl(targetUrl) ?? targetUrl)

  try {
    for (const url of urls) {
      if (deadline.expired) {
        onLog?.('login budget exhausted while looking for a form')
        break
      }
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: deadline.slice(15_000) })
        await page.waitForTimeout(900)
      } catch {
        continue
      }

      const pwSel = auth.passwordSelector ?? (await firstVisible(page, passwordCandidates(), deadline))
      if (!pwSel) {
        onLog?.(`no password field at ${url}`)
        continue
      }
      const userSel = auth.usernameSelector ?? (await firstVisible(page, usernameCandidates(), deadline))
      if (!userSel) {
        onLog?.(`password field but no username field at ${url}`)
        continue
      }

      onLog?.(`login form found at ${url}`)
      await soft(page.locator(userSel).first().fill(auth.username), deadline.slice(6000), 'fill user', undefined)
      await soft(page.locator(pwSel).first().fill(auth.password), deadline.slice(6000), 'fill password', undefined)

      const submitSel = auth.submitSelector ?? (await firstVisible(page, submitCandidates(), deadline))
      const before = page.url()
      if (submitSel) {
        await soft(page.locator(submitSel).first().click({ timeout: deadline.slice(6000) }), deadline.slice(7000), 'submit', undefined)
      } else {
        await soft(page.locator(pwSel).first().press('Enter'), deadline.slice(5000), 'submit via Enter', undefined)
      }

      // Success = navigation away, or the password field disappearing.
      await Promise.race([
        page.waitForURL((u) => u.toString() !== before, { timeout: deadline.slice(12_000) }).catch(() => {}),
        page.waitForTimeout(deadline.slice(6000))
      ])
      await page.waitForTimeout(900)

      const stillHasPassword = await soft(
        page.locator('input[type="password"]').first().isVisible(),
        deadline.slice(4000),
        'password check',
        false
      )
      const errorText = await soft(
        page.locator('[role=alert], [class*="error" i], [class*="invalid" i]').first().textContent(),
        deadline.slice(4000),
        'error text',
        null
      )
      const landed = page.url()
      const navigated = landed !== before
      const mfaStep = /\/(mfa|2fa|otp|verify|challenge|confirm-email|magic)/i.test(landed)
      // Soft SPA nav: same document URL but session already written (Supabase etc.).
      const softSession = await soft(
        page.evaluate(() => {
          const keys = Object.keys(localStorage)
          return keys.some((k) => /supabase|auth|token|session|sb-|clerk|firebase/i.test(k))
        }),
        deadline.slice(3000),
        'session keys',
        false
      )

      await soft(page.screenshot({ path: shotPath }).then(() => undefined), 8000, 'auth screenshot', undefined)

      if (!stillHasPassword || (navigated && softSession) || (mfaStep && softSession)) {
        const state = await ctx.storageState({ path: statePath })
        const cookies = state.cookies?.length ?? 0
        const stored = (state.origins ?? []).reduce((n, o) => n + (o.localStorage?.length ?? 0), 0)
        // Prefer a session with actual storage even when password field lingers (MFA).
        if (cookies + stored === 0 && stillHasPassword && !mfaStep) {
          await ctx.close().catch(() => {})
          return {
            ok: false,
            detail: `Login rejected at ${url}${errorText ? `: ${errorText.trim().slice(0, 160)}` : ' — password field still present, no session'}`,
            screenshot: shotPath
          }
        }
        await ctx.close()
        const note = mfaStep
          ? `Reached MFA/verify step at ${landed} — session partial (${cookies} cookie(s), ${stored} localStorage)`
          : `Signed in as ${auth.username} via ${url} — session captured (${cookies} cookie(s), ${stored} localStorage entr${stored === 1 ? 'y' : 'ies'})`
        return {
          ok: true,
          detail: note,
          storageStatePath: statePath,
          landedUrl: landed,
          screenshot: shotPath
        }
      }

      return {
        ok: false,
        detail: `Login rejected at ${url}${errorText ? `: ${errorText.trim().slice(0, 160)}` : ' — password field still present, no navigation'}`,
        screenshot: shotPath
      }
    }

    await ctx.close()
    return {
      ok: false,
      detail: `No login form found. Tried: ${urls.join(', ')}. Set an explicit login URL or CSS selectors.`
    }
  } catch (e) {
    await ctx.close().catch(() => {})
    return { ok: false, detail: `Login failed: ${(e as Error).message.slice(0, 200)}` }
  }
}

async function firstVisible(
  page: import('playwright').Page,
  selectors: string[],
  deadline: Deadline
): Promise<string | null> {
  for (const sel of selectors) {
    if (deadline.expired) return null
    const visible = await soft(
      page.locator(sel).first().isVisible({ timeout: deadline.slice(900) }),
      deadline.slice(1200),
      `probe ${sel}`,
      false
    )
    if (visible) return sel
  }
  return null
}
