/**
 * Bounded concurrency for slow I/O phases (AI, probes, registry).
 * Preserves input order in the returned array.
 */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  opts?: { shouldStop?: () => boolean }
): Promise<R[]> {
  if (items.length === 0) return []
  const limit = Math.max(1, Math.min(concurrency, items.length))
  const out = new Array<R>(items.length)
  let next = 0

  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      if (opts?.shouldStop?.()) throw new Error('cancelled')
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
    }
  })

  await Promise.all(workers)
  return out
}
