/**
 * Wall-clock budgets for anything that drives a live page.
 *
 * Every browser-driving step in Qualition is bounded twice: a per-operation
 * timeout, and a budget for the whole phase. Pages we do not control get to be
 * slow or hostile; they do not get to hang a run.
 */
export class Deadline {
  readonly end: number
  constructor(budgetMs: number) {
    this.end = Date.now() + budgetMs
  }
  get expired(): boolean {
    return Date.now() >= this.end
  }
  get remaining(): number {
    return Math.max(0, this.end - Date.now())
  }
  /** Time allowed for one step: never more than what is left in the budget. */
  slice(ms: number): number {
    return Math.max(250, Math.min(ms, this.remaining))
  }
}

/** Bound any promise; rejects rather than hanging forever. */
export async function limit<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms)
        timer.unref?.()
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Same, but never throws — returns a fallback instead. */
export async function soft<T>(p: Promise<T>, ms: number, label: string, fallback: T): Promise<T> {
  try {
    return await limit(p, ms, label)
  } catch {
    return fallback
  }
}
