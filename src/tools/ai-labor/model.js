/**
 * Sector-lens model — jobs in one industry as the AI frontier advances.
 *
 * Mirrors the reference implementation in the ai-labor research repo
 * (web/build_sector_data.py), where it is verified against Python-generated
 * test vectors to machine precision (web/test_sector_model.mjs). Keep the
 * two in sync; the formulas are documented there and in the tool's prose.
 *
 *   A(a)  = a · (θP gP + θA gA + θC gC)        automated share of tasks
 *   h(a)  = φ + (1−φ)(1−A)                     human task share of output
 *   p(a)  = 1 − ℓ(1−φ)A(1−AICOST)              unit cost → price index
 *   y_w, y_k from the two-group GE (χ-interpolated real-income indexes)
 *   D(a)  = s_w0 y_w^ε + (1−s_w0) y_k^ε        demand at base prices
 *   J(a)  = D · p^−η · h                        jobs index (today = 1)
 */

export const ETA = 0.8;     // price elasticity of sector demand (fixed)
export const AICOST = 0.1;  // AI cost per task relative to the human it replaces

function lerpArr(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let i = 1;
  while (xs[i] < x) i++;
  const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
  return ys[i - 1] + t * (ys[i] - ys[i - 1]);
}

/** Worker / capitalist real-income indexes and the workers' base spending
 *  share, bilinearly interpolated from the GE table at (chi, a). */
export function geAt(GE, chi, a) {
  const cs = GE.chi;
  let j = 0;
  while (j < cs.length - 2 && cs[j + 1] <= chi) j++;
  const t = Math.min(Math.max((chi - cs[j]) / (cs[j + 1] - cs[j]), 0), 1);
  const along = (series) => {
    const lo = lerpArr(GE.a, series[j], a);
    const hi = lerpArr(GE.a, series[j + 1], a);
    return (1 - t) * lo + t * hi;
  };
  return [along(GE.yw), along(GE.yk), (1 - t) * GE.sw0[j] + t * GE.sw0[j + 1]];
}

export function sectorJobs(GE, a, d) {
  const A = a * (d.thP * d.gP + d.thA * d.gA + d.thC * d.gC);
  const h = d.phi + (1 - d.phi) * (1 - A);
  const price = 1 - d.lint * (1 - d.phi) * A * (1 - AICOST);
  const [yw, yk, sw0] = geAt(GE, d.chi, a);
  const D = sw0 * Math.pow(yw, d.eps) + (1 - sw0) * Math.pow(yk, d.eps);
  return { a, A, h, price, yw, yk, sw0, D, J: D * Math.pow(price, -ETA) * h };
}

/** Log contributions to ln J at a — they sum exactly to ln J. */
export function decompose(GE, a, d) {
  const s = sectorJobs(GE, a, d);
  const broad = sectorJobs(GE, a, { ...d, chi: 1 });
  const nophi = sectorJobs(GE, a, { ...d, phi: 0 });
  // Displacement split by task type, in proportion to each type's share of
  // the automated tasks (exact; zero when nothing is automated).
  const aP = a * d.thP * d.gP, aA = a * d.thA * d.gA, aC = a * d.thC * d.gC;
  const At = aP + aA + aC;
  const disp = Math.log(nophi.h);
  return {
    income: Math.log(broad.D),
    dist: Math.log(s.D) - Math.log(broad.D),
    cheaper: -ETA * Math.log(nophi.price),
    displace: Math.log(nophi.h),
    prov:
      Math.log(s.h) - Math.log(nophi.h) -
      ETA * (Math.log(s.price) - Math.log(nophi.price)),
    total: Math.log(s.J),
    displace_P: At > 0 ? (disp * aP) / At : 0,
    displace_A: At > 0 ? (disp * aA) / At : 0,
    displace_C: At > 0 ? (disp * aC) / At : 0,
  };
}

export function sectorSweep(GE, d, n = 120) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(sectorJobs(GE, i / n, d));
  return out;
}
