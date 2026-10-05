/**
 * Kording & Marinescu (2025) one-sector CES model — the aggregate baseline.
 * Mirrors src/ailabor/km_model.py in the ai-labor research repo, where the
 * Python original replicates the paper's Table 2 / Figure 2 and this JS port
 * is verified against it. Wage = marginal product of labor (their eq. 17);
 * beta* equalizes wages across the physical and intelligence sectors.
 */

export const BASE = { sig: 0.6, sigP: 0.6, sigI: 2.2, thI: 0.94, tau: 0.2, aP: 0.7, KI: 9.0, KP: 1.38 };

const nz = (r) => (Math.abs(r) < 1e-4 ? (r < 0 ? -1e-4 : 1e-4) : r);
const toRho = (s) => nz(1 - 1 / s);

export function params(v) {
  return { r: toRho(v.sig), rP: toRho(v.sigP), rI: toRho(v.sigI), thI: v.thI, tau: v.tau, aP: v.aP, KI: v.KI, KP: v.KP };
}

function prodP(KP, LP, p) {
  return Math.pow(p.aP * Math.pow(KP, p.rP) + (1 - p.aP) * Math.pow(LP, p.rP), 1 / p.rP);
}
function prodI(aI, KI, LI, p) {
  if (aI >= 1) return Math.pow(KI, p.thI);
  const r = p.rI;
  const inner = aI <= 0
    ? Math.pow(LI, r)
    : Math.pow(aI, 1 - r) * Math.pow(KI, r) + Math.pow(1 - aI, 1 - r) * Math.pow(LI, r);
  return Math.pow(inner, p.thI / r);
}
function prodY(P, I, p) {
  return Math.pow(p.tau * Math.pow(P, p.r) + (1 - p.tau) * Math.pow(I, p.r), 1 / p.r);
}
function wages(beta, aI, p) {
  const LP = beta, LI = 1 - beta;
  const P = prodP(p.KP, LP, p), I = prodI(aI, p.KI, LI, p), Y = prodY(P, I, p);
  const dYdP = p.tau * Math.pow(P, p.r - 1) * Math.pow(Y, 1 - p.r);
  const dYdI = (1 - p.tau) * Math.pow(I, p.r - 1) * Math.pow(Y, 1 - p.r);
  const dPdLP = (1 - p.aP) * Math.pow(LP, p.rP - 1) * Math.pow(P, 1 - p.rP);
  const dIdLI = p.thI * Math.pow(1 - aI, 1 - p.rI) * Math.pow(LI, p.rI - 1) * Math.pow(I, 1 - p.rI / p.thI);
  return [dYdP * dPdLP, dYdI * dIdLI];
}
function solveBeta(aI, p) {
  if (aI >= 1) return 1;
  let lo = 1e-9, hi = 1 - 1e-9;
  const g = (b) => { const w = wages(b, aI, p); return w[0] - w[1]; };
  let glo = g(lo);
  for (let i = 0; i < 70; i++) {
    const mid = (lo + hi) / 2, gm = g(mid);
    if (glo * gm <= 0) hi = mid;
    else { lo = mid; glo = gm; }
  }
  return (lo + hi) / 2;
}
export function equilibrium(aI, p) {
  const beta = solveBeta(aI, p);
  const LP = beta;
  const P = prodP(p.KP, LP, p), I = prodI(aI, p.KI, 1 - beta, p), Y = prodY(P, I, p);
  const w = p.tau * Math.pow(Y, 1 - p.r) * (1 - p.aP) * Math.pow(P, p.r - p.rP) * Math.pow(LP, p.rP - 1);
  const abundant = aI >= 1 || p.KI / (1 - beta) > aI / (1 - aI);
  return { aI, beta, Y, w, abundant };
}
export function sweep(p) {
  const out = [];
  for (let i = 0; i <= 199; i++) out.push(equilibrium(0.005 + (i * (0.99 - 0.005)) / 199, p));
  out.push(equilibrium(1, p));
  return out;
}
