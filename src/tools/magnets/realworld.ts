/**
 * Real-world-anchored supply-chain flows for the Sankey.
 *
 * BASE = the model's OWN flows (`sc.flows`, interpolated from the grid by every
 * slider). These are faithful: they already carry the cross-region routing the
 * optimization produces — including allies→US (RoW→USA) supply under friendshoring —
 * and they already encode the China export-restriction / price-floor effects (the
 * grid was solved at the chosen china / source / pfloor). We render them as-is.
 *
 * DELTA = the projects the user has selected. The optimization, left to itself, mines
 * almost entirely in China (Chinese ORE isn't export-restricted and is cheapest), so
 * the cost-optimal grid shows little ex-China mining. But the world IS building
 * ex-China capacity for strategic reasons. So at each stage, where selected ex-China
 * project capacity exceeds the model's own ex-China production, we DISPLACE
 * Chinese-origin arcs to USA / RoW while PRESERVING their destinations. This adds
 * ex-China supply (ex-China mining appears; US/ally processing grows) without ever
 * deleting the model's existing allies→US arcs, and it leaves every interface's total
 * throughput and the regional demand endpoint untouched (so the consumption split
 * stays the model's). Toggling Round Top / Mt Weld / Lynas / … moves the bars; with
 * no projects selected the diagram is exactly the model flows.
 *
 * Faithfulness rule on re-origin destinations: domestic/allied capacity substitutes
 * for IMPORTS into ex-China regions. At MINING we also allow re-origining into a China
 * destination (an ex-China mine shipping concentrate to Chinese separation is real —
 * the export ban is on China's processed OUTPUTS, not on ore imports). Downstream
 * (oxide/alloy/magnet) we never fabricate an ex-China→China export; project capacity
 * beyond the importable deficit simply stays latent (China keeps producing it).
 */
import type { Flow, Scenario } from './interp';
import { regionalCapacity, regionalCapacityRe, type Stage } from './projects';

const REGIONS = ['China', 'RoW', 'USA'] as const;
type Region = (typeof REGIONS)[number];
type Reg = Record<Region, number>;

// Sankey interface ↔ project stage.
const IFACE_STAGE: [string, Stage][] = [
  ['concentrate', 'mining'], ['oxide', 'separation'], ['alloy', 'alloy'], ['magnet', 'magnet'],
];

const zero = (): Reg => ({ China: 0, RoW: 0, USA: 0 });

// Horizon-average utilization of project NAMEPLATE capacity over 2026–2035. Mines run
// near capacity once open (~0.85); ex-China processing is nearly all new + ramping
// (MP/Energy-Fuels separation, MP/e-VAC/Neo magnets all 2023–26 starts), so a plant
// going ~20%→100% over the horizon averages ~0.6. Tunable; lowering these makes the
// real-world supply (and the trade-risk index) less optimistic.
const RAMP: Record<string, number> = {
  mining: 0.85, separation: 0.6, alloy: 0.6, magnet: 0.6, recycling: 0.6,
};
/** Project capacity by region, scaled to its horizon-average utilization. */
function rampedCapacity(stage: Stage, active: Set<string>, scale: Record<string, number>): Reg {
  const c = regionalCapacity(stage, active, scale) as Reg;
  const r = RAMP[stage] ?? 0.6;
  return { USA: c.USA * r, China: c.China * r, RoW: c.RoW * r };
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
    const usCap = rampedCapacity(stage as Stage, active, scale).USA;
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
  const usMagCap = rampedCapacity('magnet', active, scale).USA;
  const keys = ['domestic', 'allied', 'china', 'unmet', 'stockpile'];
  const n = (mix.domestic ?? []).length;
  const out: Record<string, number[]> = {};
  for (const k of keys) out[k] = [...(mix[k] ?? Array(n).fill(0))];
  for (let t = 0; t < n; t++) {
    const dom0 = out.domestic[t] || 0;
    const demand = keys.reduce((a, k) => a + (out[k][t] || 0), 0);
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

/** Reconcile the per-year, per-class OXIDE pathway (how US Nd/Pr or Dy/Tb oxide need is
 * met) with the selected projects: US-made oxide gets a floor of the US class-specific
 * SEPARATION capacity (separation is the stage that makes separated oxide — e.g. Lynas
 * Seadrift for heavy), displacing imports (China first, then allies, then unmet) so the
 * stack total (= US oxide requirement) is unchanged. This is what makes toggling US
 * separation projects move the Dy/Tb / Nd/Pr "how demand is met" view. */
export function reconcileUsMixRe(sc: Scenario, active: Set<string>, scale: Record<string, number> = {}) {
  const base = sc.path.us_mix_re;
  if (!base) return undefined;
  const out: { light: Record<string, number[]>; heavy: Record<string, number[]> } = { light: {}, heavy: {} };
  for (const cls of ['light', 'heavy'] as const) {
    const m = base[cls];
    const n = (m.domestic ?? []).length;
    const usSepCap = rampedCapacityRe('separation', active, cls, scale).USA;   // kt separated oxide / yr
    const o: Record<string, number[]> = { domestic: [], allied: [], china: [], unmet: [] };
    for (let t = 0; t < n; t++) {
      const dom0 = m.domestic?.[t] || 0, al = m.allied?.[t] || 0, cn = m.china?.[t] || 0, un = m.unmet?.[t] || 0;
      const total = dom0 + al + cn + un;                       // US oxide requirement this year
      const dom = Math.min(total, Math.max(dom0, usSepCap));   // floor US-made by US separation capacity
      let red = dom - dom0;                                    // extra US-made displaces imports
      const take = (v: number) => { const r = Math.min(v, Math.max(0, red)); red -= r; return v - r; };
      const cn2 = take(cn), al2 = take(al), un2 = take(un);    // China first, then allies, then unmet
      o.domestic.push(+dom.toFixed(3)); o.china.push(+cn2.toFixed(3));
      o.allied.push(+al2.toFixed(3)); o.unmet.push(+un2.toFixed(3));
    }
    out[cls] = o;
  }
  return out;
}

// Nd/Pr (light) vs Dy/Tb (heavy) oxide per kt magnet — for class-specific US demand.
export const CLASS_INTENSITY: Record<'light' | 'heavy', number> = { light: 0.326, heavy: 0.034 };
function rampedCapacityRe(stage: Stage, active: Set<string>, cls: 'light' | 'heavy', scale: Record<string, number>): Reg {
  const c = regionalCapacityRe(stage, active, cls, scale) as Reg;
  const r = (stage === 'mining' ? 0.85 : 0.6);
  return { USA: c.USA * r, China: c.China * r, RoW: c.RoW * r };
}

/** Reconcile the light/heavy us_supply with class-appropriate project floors. MINING
 * and SEPARATION are element-specific (a light-ore mine / light SX plant doesn't make
 * heavy oxide), so heavy-REE US projects (Round Top, Lynas Seadrift) floor the heavy
 * class and light projects (MP, Energy Fuels) the light class. ALLOY and MAGNET are
 * element-AGNOSTIC — a strip-cast alloy / sintered magnet contains both Nd/Pr and Dy/Tb,
 * so a US alloy/magnet plant covers both classes (this is what stops a spurious
 * heavy-alloy chokepoint). They use the aggregate, project-floored reconciliation. */
export function reconcileUsSupplyRe(sc: Scenario, active: Set<string>, scale: Record<string, number> = {}) {
  const base = sc.us_supply_re;
  if (!base) return undefined;
  const usMag = usMagnetDemand(sc);
  const aggR = reconcileUsSupply(sc, active, scale);   // for the element-agnostic alloy + magnet stages
  const recon = (m: any, req: number, usCap: number) => {
    const floor = req > 1e-9 ? Math.min(1, usCap / req) : 0;
    const dom = Math.max(m?.domestic ?? 0, floor);
    const rest = Math.max(0, 1 - dom);
    const imp = (m?.allied ?? 0) + (m?.china ?? 0);
    return { domestic: dom, allied: imp > 1e-9 ? (rest * (m?.allied ?? 0)) / imp : 0, china: imp > 1e-9 ? (rest * (m?.china ?? 0)) / imp : 0 };
  };
  const out: any = { light: {}, heavy: {} };
  for (const cls of ['light', 'heavy'] as const) {
    const intensity = CLASS_INTENSITY[cls];
    for (const stage of ['mining', 'separation', 'alloy', 'magnet']) {
      if (stage === 'alloy' || stage === 'magnet') {   // element-agnostic — one plant makes both
        out[cls][stage] = aggR[stage];
        continue;
      }
      const fac = stage === 'mining' ? intensity / AVG_RECOVERY : intensity;
      out[cls][stage] = recon(base[cls]?.[stage], usMag * fac, rampedCapacityRe(stage as Stage, active, cls, scale).USA);
    }
  }
  return out;
}

/** The model's own arcs for an interface, scaled to a class fraction (1 for total). */
function classedArcs(sc: Scenario, iface: string, frac: number): Flow[] {
  return (sc.flows[iface] ?? []).map((f) => ({ from: f.from, to: f.to, value: f.value * frac }));
}

/** Merge arcs sharing the same from→to, dropping negligible ones. */
function mergeArcs(arcs: Flow[]): Flow[] {
  const m = new Map<string, number>();
  for (const f of arcs) m.set(`${f.from}|${f.to}`, (m.get(`${f.from}|${f.to}`) || 0) + f.value);
  const out: Flow[] = [];
  for (const [k, v] of m) {
    if (v <= 0.01) continue;
    const [from, to] = k.split('|');
    out.push({ from, to, value: v });
  }
  return out;
}

/** Apply the project DELTA to one interface's model arcs: raise ex-China (USA / RoW)
 * production to the selected-project FLOOR by re-origining Chinese-origin arcs to
 * USA / RoW while KEEPING their destinations — so domestic / allied capacity
 * substitutes for Chinese supply without deleting any of the model's existing arcs
 * (allies→US stays). `chinaDestOK` allows re-origining into a China destination (true
 * only at MINING, where ore ships freely to Chinese separation). The per-interface
 * total throughput and every destination total are preserved (we only relabel some
 * origins), so the column magnitudes and the demand endpoint stay the model's. */
function applyProjectDelta(arcs: Flow[], origin: Reg, floorUSA: number, floorRoW: number, chinaDestOK: boolean): Flow[] {
  const result: Flow[] = arcs.filter((f) => f.from !== 'China').map((f) => ({ ...f }));
  const china = arcs.filter((f) => f.from === 'China').map((f) => ({ ...f }));
  const pull = (region: Region, need: number, destOrder: Region[]) => {
    for (const dest of destOrder) {
      if (need <= 1e-9) break;
      for (const a of china) {
        if (need <= 1e-9) break;
        if (a.to !== dest || a.value <= 1e-9) continue;
        const take = Math.min(a.value, need);
        a.value -= take; need -= take;
        result.push({ from: region, to: dest, value: take });
      }
    }
  };
  // Serve own region first, then the other ally region; China destination last and
  // only where allowed (mining). USA capacity displaces US imports of Chinese supply
  // before it "exports" to an ally; RoW symmetrically.
  const usDest: Region[] = chinaDestOK ? ['USA', 'RoW', 'China'] : ['USA', 'RoW'];
  const rowDest: Region[] = chinaDestOK ? ['RoW', 'USA', 'China'] : ['RoW', 'USA'];
  pull('USA', Math.max(0, floorUSA - origin.USA), usDest);
  pull('RoW', Math.max(0, floorRoW - origin.RoW), rowDest);
  for (const a of china) if (a.value > 1e-9) result.push(a);  // China keeps the un-displaced remainder
  return mergeArcs(result);
}

/** Real-world-anchored flows = the model's own flows (faithful base, carries allies→US
 * and the slider-driven restriction effects) with the selected projects applied as an
 * origin-substitution DELTA (China→ex-China up to the project floor; see header). */
export function realWorldFlows(sc: Scenario, active: Set<string>, scale: Record<string, number> = {}, cls?: 'heavy' | 'light'): Record<string, Flow[]> {
  // Class view scales throughput to that RE class's mass fraction and floors the
  // element-specific upstream (mining/separation) with class-specific project capacity.
  const frac = cls === 'heavy' ? 0.094 : cls === 'light' ? 0.906 : 1;
  const out: Record<string, Flow[]> = {};
  for (const [iface, stage] of IFACE_STAGE) {
    const arcs = classedArcs(sc, iface, frac);
    const origin = zero();
    for (const f of arcs) origin[f.from as Region] += f.value;
    let floorUSA: number, floorRoW: number;
    if (cls && (stage === 'mining' || stage === 'separation')) {
      const cap = rampedCapacityRe(stage as Stage, active, cls, scale);  // class-specific ex-China floor
      floorUSA = cap.USA; floorRoW = cap.RoW;            // model heavy ex-China ≈ 0, so projects only
    } else {
      const cap = rampedCapacity(stage, active, scale);
      floorUSA = cap.USA * frac; floorRoW = cap.RoW * frac;
    }
    out[iface] = applyProjectDelta(arcs, origin, floorUSA, floorRoW, stage === 'mining');
  }
  return out;
}
