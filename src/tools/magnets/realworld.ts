/**
 * Real-world-anchored supply-chain flows for the Sankey. The optimization, left to
 * itself, mines almost entirely in China (Chinese ORE isn't export-restricted and is
 * cheapest), so the cost-optimal Sankey shows no ex-China mining. But the world IS
 * building ex-China capacity for strategic reasons (the shadow price of security).
 *
 * So we re-derive the diagram from the REAL projects the user has selected: at each
 * stage the selected projects are locked in as production by region (USA / China /
 * RoW), with China the residual backstop. The model still sets the magnitudes (each
 * stage's total throughput and the regional demand endpoint); only the ORIGIN split
 * is replaced. Toggling projects on/off (Round Top, Mt Weld, Lynas, …) moves the bars.
 */
import type { Flow, Scenario } from './interp';
import { regionalCapacity, type Stage } from './projects';

const REGIONS = ['China', 'RoW', 'USA'] as const;
type Region = (typeof REGIONS)[number];
type Reg = Record<Region, number>;

// Sankey interface ↔ project stage.
const IFACE_STAGE: [string, Stage][] = [
  ['concentrate', 'mining'], ['oxide', 'separation'], ['alloy', 'alloy'], ['magnet', 'magnet'],
];

const zero = (): Reg => ({ China: 0, RoW: 0, USA: 0 });
const sumReg = (r: Reg) => r.China + r.RoW + r.USA;

/** Each region's outgoing total at an interface, from the model flows. */
function modelOrigin(sc: Scenario, iface: string): Reg {
  const out = zero();
  for (const f of sc.flows[iface] ?? []) out[f.from as Region] += f.value;
  return out;
}
/** Each region's incoming total at an interface (e.g. magnet consumption). */
function modelDest(sc: Scenario, iface: string): Reg {
  const out = zero();
  for (const f of sc.flows[iface] ?? []) out[f.to as Region] += f.value;
  return out;
}

/** Scale a region vector so it sums to `total` (no-op if it's already empty). */
function scaleTo(r: Reg, total: number): Reg {
  const s = sumReg(r);
  if (s <= 1e-9) return zero();
  const k = total / s;
  return { China: r.China * k, RoW: r.RoW * k, USA: r.USA * k };
}

/** Route a stage's production to the next stage's production (= its consumption of
 * this stage's output): own-region first, then the residual proportionally. Supply
 * and demand are pre-scaled to the same total, so every unit is placed. */
function route(supply: Reg, demand: Reg): Flow[] {
  const sup = { ...supply }, dem = { ...demand };
  const flows: Flow[] = [];
  for (const r of REGIONS) {            // own-region (no shipment) first
    const f = Math.min(sup[r], dem[r]);
    if (f > 0.01) flows.push({ from: r, to: r, value: f });
    sup[r] -= f; dem[r] -= f;
  }
  const totDem = sumReg(dem);
  if (totDem > 1e-9) {                   // residual: ship surplus to deficit, proportional
    for (const s of REGIONS) {
      if (sup[s] <= 1e-9) continue;
      for (const d of REGIONS) {
        if (dem[d] <= 1e-9) continue;
        const f = (sup[s] * dem[d]) / totDem;
        if (f > 0.01) flows.push({ from: s, to: d, value: f });
      }
    }
  }
  return flows;
}

// Model constants (steer_magnet_cem): oxide-equivalent per kt magnet, and average
// separation recovery — used to turn a stage's project capacity into a share of US
// demand. Per-stage requirement = US magnet demand × this factor.
const OXIDE_INTENSITY = 0.3596;
const AVG_RECOVERY = 0.86;
const STAGE_REQ_FACTOR: Record<string, number> = {
  mining: OXIDE_INTENSITY / AVG_RECOVERY, separation: OXIDE_INTENSITY, alloy: OXIDE_INTENSITY, magnet: 1,
};

/** Horizon-average annual US magnet demand from the pathway stack. */
function usMagnetDemand(sc: Scenario): number {
  const mix = sc.path.us_mix;
  const n = (mix.domestic ?? []).length || 1;
  let tot = 0;
  for (let t = 0; t < n; t++)
    tot += (mix.domestic?.[t] ?? 0) + (mix.allied?.[t] ?? 0) + (mix.china?.[t] ?? 0)
      + (mix.unmet?.[t] ?? 0) + (mix.stockpile?.[t] ?? 0);
  return tot / n;
}

/** Reconcile the US-centric sourcing shares (us_supply, drives the trade-risk index)
 * with the selected projects: each stage's US domestic share gets a FLOOR =
 * US-project capacity ÷ US requirement, with imports scaled to fill the rest. So
 * selecting MP / Energy Fuels / e-VAC / … raises US self-sufficiency (lowers the TRI),
 * while the model still sets the allied-vs-China split of whatever's imported. */
export function reconcileUsSupply(sc: Scenario, active: Set<string>, scale: Record<string, number> = {}): Scenario['us_supply'] {
  const usMag = usMagnetDemand(sc);
  const out: Scenario['us_supply'] = {};
  for (const stage of ['mining', 'separation', 'alloy', 'magnet']) {
    const m = sc.us_supply?.[stage] ?? { domestic: 0, allied: 0, china: 0 };
    const req = usMag * (STAGE_REQ_FACTOR[stage] ?? 1);
    const usCap = (regionalCapacity(stage as Stage, active, scale) as Reg).USA;
    const floor = req > 1e-9 ? Math.min(1, usCap / req) : 0;
    const dom = Math.max(m.domestic ?? 0, floor);
    const rest = Math.max(0, 1 - dom);
    const imp = (m.allied ?? 0) + (m.china ?? 0);
    out[stage] = {
      domestic: dom,
      allied: imp > 1e-9 ? (rest * (m.allied ?? 0)) / imp : 0,
      china: imp > 1e-9 ? (rest * (m.china ?? 0)) / imp : 0,
    };
  }
  return out;
}

/** Reconcile the per-year pathway mix (how US magnet demand is met) with the selected
 * US magnet projects: US-made gets a floor of the US magnet capacity, displacing
 * imports (China first, then allies, then unmet) so the stack total is unchanged. */
export function reconcileUsMix(sc: Scenario, active: Set<string>, scale: Record<string, number> = {}): Record<string, number[]> {
  const mix = sc.path.us_mix;
  const usMagCap = (regionalCapacity('magnet', active, scale) as Reg).USA;
  const keys = ['domestic', 'allied', 'china', 'unmet', 'stockpile'];
  const n = (mix.domestic ?? []).length;
  const out: Record<string, number[]> = {};
  for (const k of keys) out[k] = [...(mix[k] ?? Array(n).fill(0))];
  for (let t = 0; t < n; t++) {
    const demand = keys.reduce((a, k) => a + (out[k][t] || 0), 0);
    const dom0 = out.domestic[t] || 0;
    const dom = Math.min(demand, Math.max(dom0, usMagCap));
    out.domestic[t] = dom;
    let toReduce = dom - dom0;                 // extra US-made displaces imports
    for (const k of ['china', 'allied', 'unmet']) {
      if (toReduce <= 1e-9) break;
      const r = Math.min(out[k][t], toReduce); out[k][t] -= r; toReduce -= r;
    }
  }
  return out;
}

/** Synthesize the real-world-anchored flows for every interface. Each stage's
 * ex-China production is a FLOOR = the selected projects, raised to the model's own
 * value wherever the model reshores beyond them; CHINA is the residual. So the
 * locked-in projects pin ex-China supply (ex-China mining appears), while the
 * unlocked balance still responds to every slider (China restriction, friendshoring,
 * demand…) through the model. */
export function realWorldFlows(sc: Scenario, active: Set<string>, scale: Record<string, number> = {}): Record<string, Flow[]> {
  const prod: Record<string, Reg> = {};
  for (const [iface, stage] of IFACE_STAGE) {
    const model = modelOrigin(sc, iface);     // model's regional production (responds to sliders)
    const T = sumReg(model);
    const cap = regionalCapacity(stage, active, scale) as Reg;   // ex-China project floors
    const usP = Math.max(cap.USA, model.USA);
    const rowP = Math.max(cap.RoW, model.RoW);
    const exc = usP + rowP;
    prod[iface] = exc >= T                     // ex-China floors meet/exceed demand → no China
      ? { USA: (usP * T) / (exc || 1), RoW: (rowP * T) / (exc || 1), China: 0 }
      : { USA: usP, RoW: rowP, China: T - exc };  // China = responsive residual
  }

  // Demand endpoint: magnet consumption by region (from the model).
  const consumer = modelDest(sc, 'magnet');

  const flows: Record<string, Flow[]> = {};
  flows.concentrate = route(prod.concentrate, scaleTo(prod.oxide, sumReg(prod.concentrate)));
  flows.oxide = route(prod.oxide, scaleTo(prod.alloy, sumReg(prod.oxide)));
  flows.alloy = route(prod.alloy, scaleTo(prod.magnet, sumReg(prod.alloy)));
  flows.magnet = route(prod.magnet, scaleTo(consumer, sumReg(prod.magnet)));
  return flows;
}
