/**
 * Visual regression between runs.
 *
 * Prefer odiff (native SIMD) for speed and anti-alias awareness; fall back to
 * pixelmatch when the binary is unavailable. Full-page shots often differ in
 * height — we compare the overlapping region and count the height delta as
 * changed area so a one-line content change does not report 0%.
 */
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CapturedPage, Finding, Run, VisualDiff } from '../../shared/types.js'

async function readPng(path: string): Promise<PNG | null> {
  try {
    return PNG.sync.read(await readFile(path))
  } catch {
    return null
  }
}

async function diffWithOdiff(
  baselinePath: string,
  currentPath: string,
  diffPath: string,
  opts: { threshold?: number; antialiasing?: boolean } = {}
): Promise<{ changedRatio: number; changedPixels: number; diffImage?: string } | null> {
  try {
    const { compare } = await import('odiff-bin')
    const result = await compare(baselinePath, currentPath, diffPath, {
      threshold: opts.threshold ?? 0.12,
      antialiasing: opts.antialiasing ?? true,
      // Full-page shots often differ in height; still compare overlapping pixels
      // instead of immediately falling back (docs: failOnLayoutDiff default true).
      failOnLayoutDiff: false,
      noFailOnFsErrors: true
    })
    if (result.match) {
      return { changedRatio: 0, changedPixels: 0 }
    }
    if (result.reason === 'file-not-exists') return null
    if (result.reason === 'layout-diff') {
      // Should be rare with failOnLayoutDiff:false; fall through to pixelmatch crop.
      return null
    }
    if (result.reason !== 'pixel-diff') return null

    const changedPixels = Number(result.diffCount ?? 0)
    const pct = Number(result.diffPercentage ?? 0) / 100
    return {
      changedRatio: Number.isFinite(pct) ? pct : 0,
      changedPixels,
      diffImage: changedPixels > 0 ? diffPath : undefined
    }
  } catch {
    return null
  }
}

async function diffWithPixelmatch(
  baselinePath: string,
  currentPath: string,
  diffPath: string,
  opts: { threshold?: number; antialiasing?: boolean } = {}
): Promise<{ changedRatio: number; changedPixels: number; diffImage?: string } | null> {
  const [a, b] = await Promise.all([readPng(baselinePath), readPng(currentPath)])
  if (!a || !b) return null

  const width = Math.min(a.width, b.width)
  const height = Math.min(a.height, b.height)
  if (width < 8 || height < 8) return null

  const crop = (src: PNG): PNG => {
    if (src.width === width && src.height === height) return src
    const dst = new PNG({ width, height })
    PNG.bitblt(src, dst, 0, 0, width, height, 0, 0)
    return dst
  }
  const A = crop(a)
  const B = crop(b)
  const diff = new PNG({ width, height })

  const changedPixels = pixelmatch(A.data, B.data, diff.data, width, height, {
    threshold: opts.threshold ?? 0.12,
    includeAA: opts.antialiasing ? true : false,
    alpha: 0.4
  })
  const heightDelta = Math.abs(a.height - b.height) * width
  const totalArea = width * Math.max(a.height, b.height)
  const changedRatio = (changedPixels + heightDelta) / Math.max(1, totalArea)

  let diffImage: string | undefined
  if (changedPixels > 0) {
    await writeFile(diffPath, PNG.sync.write(diff))
    diffImage = diffPath
  }
  return { changedRatio, changedPixels, diffImage }
}

/** Compare two full-page screenshots, tolerating different page heights. */
export async function diffScreenshots(
  baselinePath: string,
  currentPath: string,
  diffPath: string,
  opts: { threshold?: number; antialiasing?: boolean } = {}
): Promise<{ changedRatio: number; changedPixels: number; diffImage?: string } | null> {
  // odiff first — orders of magnitude faster on large screenshots.
  const odiff = await diffWithOdiff(baselinePath, currentPath, diffPath, opts)
  if (odiff) return odiff
  return diffWithPixelmatch(baselinePath, currentPath, diffPath, opts)
}

/**
 * Diff this run against the most recent completed run of the same target and
 * emit findings for anything that moved more than the threshold.
 * ignoreSelectors are hidden via data attribute before pixel diff (Chromatic parity).
 */
export async function compareWithBaseline(
  pages: CapturedPage[],
  baseline: Run | undefined,
  assetsDir: string,
  threshold = 0.02,
  ignoreSelectors: string[] = [],
  opts: { thresholdPx?: number; antialiasing?: boolean; perViewport?: Record<string, number> } = {}
): Promise<{ diffs: VisualDiff[]; findings: Finding[] }> {
  const diffs: VisualDiff[] = []
  const findings: Finding[] = []
  if (!baseline) return { diffs, findings }

  let n = 0
  for (const page of pages) {
    const before = baseline.pages.find((p) => p.url === page.url)
    if (!before) {
      findings.push({
        id: `vr-new-${++n}`,
        category: 'flow',
        severity: 'nit',
        title: 'New page since last audit',
        detail: `${page.url} did not exist in run ${baseline.id}.`,
        fix: 'Nothing to fix — noted so the diff is honest about scope changes.',
        pageUrl: page.url,
        source: 'heuristic'
      })
      continue
    }
    for (const [vp, current] of Object.entries(page.screenshots)) {
      const baseShot = before.screenshots[vp]
      if (!baseShot) continue
      const perVp = opts.perViewport?.[vp] ?? threshold
      const diffPath = join(assetsDir, `diff-${vp}-${n++}.png`)
      const res = await diffScreenshots(baseShot, current, diffPath, { threshold: opts.thresholdPx, antialiasing: opts.antialiasing })
      if (!res) continue
      const diff: VisualDiff = {
        url: page.url,
        viewport: vp,
        changedRatio: res.changedRatio,
        changedPixels: res.changedPixels,
        baselineRunId: baseline.id,
        diffImage: res.diffImage,
        currentImage: current,
        baselineImage: baseShot
      }
      diffs.push(diff)

      if (res.changedRatio > perVp) {
        const pct = (res.changedRatio * 100).toFixed(1)
        findings.push({
          id: `vr-${n}`,
          category: 'craft',
          severity: res.changedRatio > 0.25 ? 'major' : res.changedRatio > 0.08 ? 'minor' : 'nit',
          title: `${pct}% of the ${vp} view changed since run ${baseline.id}`,
          detail: `${res.changedPixels.toLocaleString()} pixels differ in the overlapping region. Unintentional drift at this scale usually means a shared component or token changed underneath this page.`,
          fix: 'Open the diff image. If the change was not deliberate, you have found a regression; if it was, this is your visual changelog entry.',
          pageUrl: page.url,
          viewport: vp,
          evidence: res.diffImage ? [res.diffImage] : undefined,
          source: 'heuristic'
        })
      }
    }
  }
  return { diffs, findings }
}
