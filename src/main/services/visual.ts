/**
 * Visual regression between runs.
 *
 * The audit tells you how good the UI is today; this tells you what changed
 * since the last audit of the same URL. pixelmatch (mapbox) over pngjs, with
 * anti-alias tolerance, writing a diff PNG per changed viewport.
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

/** Compare two full-page screenshots, tolerating different page heights. */
export async function diffScreenshots(
  baselinePath: string,
  currentPath: string,
  diffPath: string
): Promise<{ changedRatio: number; changedPixels: number; diffImage?: string } | null> {
  const [a, b] = await Promise.all([readPng(baselinePath), readPng(currentPath)])
  if (!a || !b) return null

  // Full-page shots differ in height whenever content changes; compare the
  // overlapping region and count the height delta as changed area.
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
    threshold: 0.12,
    includeAA: false,
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

/**
 * Diff this run against the most recent completed run of the same target and
 * emit findings for anything that moved more than the threshold.
 */
export async function compareWithBaseline(
  pages: CapturedPage[],
  baseline: Run | undefined,
  assetsDir: string,
  threshold = 0.02
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
      const diffPath = join(assetsDir, `diff-${vp}-${n++}.png`)
      const res = await diffScreenshots(baseShot, current, diffPath)
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

      if (res.changedRatio > threshold) {
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
