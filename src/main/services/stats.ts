/** Tiny stats for median / p90 / Mann-Whitney — Sitespeed/LHCI parity, no deps. */
export function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
export function p90(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const i = Math.ceil(0.9 * s.length) - 1
  return s[Math.max(0, Math.min(i, s.length - 1))]
}
export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length
  return Math.sqrt(v)
}
/** Mann-Whitney U p approx; returns p-value 0..1 (normal approx). */
export function mannWhitneyU(a: number[], b: number[]): number {
  if (a.length < 3 || b.length < 3) return 1
  const all = [...a.map((v) => ({ v, g: 0 })), ...b.map((v) => ({ v, g: 1 }))].sort((x, y) => x.v - y.v)
  let rank = 1
  let i = 0
  let r1 = 0
  while (i < all.length) {
    let j = i
    while (j < all.length && all[j].v === all[i].v) j++
    const avg = (rank + (rank + j - i - 1)) / 2
    for (let k = i; k < j; k++) if (all[k].g === 0) r1 += avg
    rank += j - i
    i = j
  }
  const n1 = a.length, n2 = b.length
  const u1 = r1 - (n1 * (n1 + 1)) / 2
  const mu = (n1 * n2) / 2
  const sigma = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12)
  if (sigma === 0) return 1
  const z = (u1 - mu) / sigma
  // two-sided p via normal cdf approx
  const erf = (x: number) => {
    const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911
    const s = x < 0 ? -1 : 1
    const abs = Math.abs(x)
    const t = 1/(1+p*abs)
    return s*(1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-abs*abs))
  }
  const cdf = (x:number)=> 0.5*(1+erf(x/Math.SQRT2))
  const p = 2*(1-cdf(Math.abs(z)))
  return Math.max(0, Math.min(1, p))
}
