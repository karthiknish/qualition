/**
 * Human error messages for API failures.
 *
 * Providers answer failures with a JSON envelope. Pasting that into the UI
 * gives the user things like
 *   `400 {"error":{"message":"...","type":"invalid_request_error","param":null}}`
 * which is noise wrapped around one useful sentence. This pulls out the
 * sentence and says what to actually do about it.
 */

/** Dig the message out of whatever shape the provider used. */
function extractMessage(body: string): string | null {
  const trimmed = body.trim()
  if (!trimmed) return null
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    // Plain text or HTML (a proxy/gateway page) — keep it short and stripped.
    const text = trimmed.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    return text ? text.slice(0, 200) : null
  }
  try {
    const json = JSON.parse(trimmed)
    const candidates = [
      json?.error?.message,
      json?.error?.msg,
      typeof json?.error === 'string' ? json.error : null,
      json?.message,
      json?.detail,
      json?.error_description,
      Array.isArray(json?.errors) ? json.errors[0]?.message : null
    ]
    const found = candidates.find((c) => typeof c === 'string' && c.trim())
    return found ? String(found).replace(/\s+/g, ' ').trim().slice(0, 240) : null
  } catch {
    return null
  }
}

/** What the user can do about this status, in plain language. */
function advice(status: number, provider: string): string | null {
  switch (status) {
    case 400:
      return 'Often an unsupported option for this model — try a different one.'
    case 401:
      return 'Check the API key in Settings → Models.'
    case 403:
      return 'Check the key permissions, or pick another model.'
    case 402:
      return `Top up the ${provider} account to continue.`
    case 404:
      return 'Pick another model from the list.'
    case 408:
      return 'Try again, or choose a faster model.'
    case 413:
      return 'Screenshots exceeded the input limit — choose a larger-context model.'
    case 429:
      return 'Wait a moment, or switch model/provider.'
    case 500:
    case 502:
    case 503:
    case 504:
      return `${provider} is having trouble on their end — this is retried automatically.`
    default:
      return null
  }
}

/**
 * One readable line for a failed HTTP call: what happened, and what to do.
 * Never returns a raw JSON envelope.
 */
/**
 * Status codes are not reliable across providers — Gemini answers 400 for an
 * invalid API key, where OpenAI answers 401. What the message *says* is the
 * better signal, so classify on that first.
 */
function adviceFromMessage(message: string | null, provider: string): string | null {
  if (!message) return null
  const m = message.toLowerCase()
  if (/api[_ -]?key not valid|invalid api key|incorrect api key|unauthenticated|api key expired/.test(m))
    return 'Check the API key in Settings → Models.'
  if (/quota|rate limit|resource[_ ]exhausted|too many requests/.test(m))
    return 'Wait a moment, or switch model/provider.'
  if (/credit|billing|payment|insufficient funds/.test(m)) return `Top up the ${provider} account to continue.`
  // "user not found" is an account problem, not a model problem — do not match
  // a bare "not found".
  if (/model not found|does not exist|unknown model|no endpoints found|no allowed providers/.test(m))
    return 'Pick another model from the list.'
  if (/user not found|account not found|no such account/.test(m))
    return 'Check the API key in Settings → Models.'
  if (/permission|not allowed|forbidden|access denied/.test(m))
    return 'Use a key with access to that model, or pick another.'
  if (/context length|too large|maximum.*tokens|payload/.test(m))
    return 'Choose a model with a larger context window.'
  return null
}

export function describeApiError(provider: string, status: number, body: string): string {
  const message = extractMessage(body)
  const hint = adviceFromMessage(message, provider) ?? advice(status, provider)
  // Hints are pure actions, so the provider's sentence and ours never repeat
  // each other and both can always be shown.
  if (message && hint) return `${message} — ${hint}`
  return message ?? hint ?? `${provider} request failed (HTTP ${status}).`
}

/** Same idea for a JSON-RPC error object from an MCP server. */
export function describeRpcError(server: string, method: string, error: unknown): string {
  const e = error as { message?: string; code?: number; data?: { message?: string } }
  const message = e?.data?.message ?? e?.message
  if (typeof message === 'string' && message.trim()) {
    return `${server} ${method}: ${message.replace(/\s+/g, ' ').trim().slice(0, 240)}`
  }
  return `${server} ${method} failed${typeof e?.code === 'number' ? ` (code ${e.code})` : ''}.`
}

/**
 * SDKs (notably @google/genai) throw Errors whose `message` is the raw JSON
 * response body. Pull the envelope out of the middle of the string and treat
 * it like any other API failure.
 */
export function describeThrownError(provider: string, err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? 'unknown error')
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start !== -1 && end > start) {
    const envelope = raw.slice(start, end + 1)
    try {
      const json = JSON.parse(envelope)
      const status = Number(json?.error?.code ?? json?.code ?? 0) || 0
      return describeApiError(provider, status, envelope)
    } catch {
      /* not valid JSON after all */
    }
  }
  return raw.replace(/\s+/g, ' ').trim().slice(0, 240)
}
