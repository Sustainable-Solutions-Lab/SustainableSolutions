/**
 * Real-world-anchored supply-chain flows for the Sankey. Built in two steps so mass is
 * conserved END-TO-END (a region's stage-N output is exactly what feeds its stage-N
 * production), which a per-interface approach can't guarantee.
 *
 * STEP 1 — PRODUCTION per stage (the column bars). For each stage, each ex-China
 * region produces max(its model production, its selected-project capacity); China is
 * the residual that brings the stage up to the model's total throughput (or 0 if
 * ex-China capacity already exceeds it). The model, left to itself, mines/processes
 * almost entirely in China (Chinese ore isn't export-restricted and is cheapest), so
 * ex-China bars appear only as the real projects are selected.
 *
 * STEP 2 — ROUTE each stage's output to the next stage's production (= its consumption
 * of the previous stage's product). Own region first; then the US fills its import
 * deficit using the MODEL's own allied-vs-China sourcing mix (`sc.us_supply`), so
 * allies→US (RoW→USA) shows up faithfully under friendshoring; China is the residual
 * sink, and ore may flow to China for separation (the export ban is on China's
 * processed OUTPUTS, not on ore imports). Because each interface's destinations equal
 * the next stage's production, a region's oxide-in equals its alloy-out etc. — the
 * ribbons add up across stages, and a region with more separation than alloy capacity
 * correctly shows its surplus oxide flowing onward to be alloyed elsewhere.
 *
 * The demand endpoint (magnet consumption by region) stays the model's. With no
 * projects selected the bars collapse to the model's own production.
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
    const m: any = sc.us_supply?.[stage] ?? { domestic: 0, allied: 0, china: 0 };
    const req = usMag * (STAGE_REQ_FACTOR[stage] ?? 1);
    const usCap = rampedCapacity(stage as Stage, active, scale).USA;
    const floor = req > 1e-9 ? Math.min(1, usCap / req) : 0;
    const recyc = m.recycled ?? 0;                 // recycled (secondary) supply passes through
    const dom = Math.max(m.domestic ?? 0, floor);  // a US project floors PRIMARY domestic
    const rest = Math.max(0, 1 - dom - recyc);
    const imp = (m.allied ?? 0) + (m.china ?? 0);
    out[stage] = {
      domestic: dom,
      recycled: recyc,
      allied: imp > 1e-9 ? (rest * (m.allied ?? 0)) / imp : 0,
      china: imp > 1e-9 ? (rest * (m.china ?? 0)) / imp : 0,
    } as any;
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
    const recyc = m?.recycled ?? 0;                // recycled (secondary) supply passes through
    const dom = Math.max(m?.domestic ?? 0, floor);
    const rest = Math.max(0, 1 - dom - recyc);
    const imp = (m?.allied ?? 0) + (m?.china ?? 0);
    return { domestic: dom, recycled: recyc, allied: imp > 1e-9 ? (rest * (m?.allied ?? 0)) / imp : 0, china: imp > 1e-9 ? (rest * (m?.china ?? 0)) / imp : 0 };
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

/** The model's regional production at an interface (sum of outgoing flow by region),
 * scaled to a class fraction (1 for total or when `flows` is already class-specific). */
function modelProduction(flows: Record<string, Flow[]>, iface: string, frac: number): Reg {
  const out = zero();
  for (const f of flows[iface] ?? []) out[f.from as Region] += f.value * frac;
  return out;
}
/** The model's regional CONSUMPTION at an interface (sum of incoming flow by region). */
function modelConsumption(flows: Record<string, Flow[]>, iface: string, frac: number): Reg {
  const out = zero();
  for (const f of flows[iface] ?? []) out[f.to as Region] += f.value * frac;
  return out;
}
const sumReg = (r: Reg) => r.China + r.RoW + r.USA;
/** Scale a region vector so it sums to `total` (no-op if empty). */
function scaleTo(r: Reg, total: number): Reg {
  const s = sumReg(r);
  if (s <= 1e-9) return zero();
  return { China: (r.China * total) / s, RoW: (r.RoW * total) / s, USA: (r.USA * total) / s };
}

/** STEP 1: each stage's per-region PRODUCTION = max(model, selected-project capacity)
 * for ex-China, with China the residual that fills the model's total throughput (0 if
 * ex-China capacity already exceeds it). */
function stageProduction(flows: Record<string, Flow[]>, stage: Stage, iface: string, active: Set<string>, scale: Record<string, number>, frac: number, capFrac: number, cls?: 'heavy' | 'light'): Reg {
  const model = modelProduction(flows, iface, frac);
  const T = sumReg(model);
  let usP: number, rowP: number;
  if (cls && (stage === 'mining' || stage === 'separation')) {
    // Element-specific stage in a CLASS view: ex-China heavy/light supply comes ONLY
    // from class-tagged projects. The aggregate model production × frac would mis-
    // attribute (e.g. the US's light Mountain Pass ore would show up as ~2% of HEAVY
    // mining); there are no listed US heavy-mining facilities, so US heavy = 0 here
    // until a heavy project (Round Top, …) is selected. China is the residual.
    const cap = rampedCapacityRe(stage, active, cls, scale);
    usP = cap.USA; rowP = cap.RoW;
  } else {
    // Element-AGNOSTIC alloy/magnet stage. The project capacity is in TOTAL magnet-mass
    // units, so it must be scaled to this class before flooring the (class-unit) model
    // flow — else in the heavy view a region's total-mass capacity (tens of kt) dwarfs
    // the heavy-embodied flow (single-digit kt Dy/Tb) and forces China to the 0 residual.
    // capFrac = this interface's class share of aggregate mass (≈0.03–0.09 for heavy);
    // it equals frac in the legacy no-flows_re path (both = the flat class mass fraction).
    const cap = rampedCapacity(stage, active, scale);
    usP = Math.max(model.USA, cap.USA * capFrac); rowP = Math.max(model.RoW, cap.RoW * capFrac);
  }
  const exc = usP + rowP;
  return exc >= T
    ? { USA: (usP * T) / (exc || 1), RoW: (rowP * T) / (exc || 1), China: 0 }
    : { USA: usP, RoW: rowP, China: T - exc };
}

/** STEP 2: route a stage's output (supply) to the next stage's production (demand,
 * pre-scaled to the supply total). Own region first; then the US fills its deficit
 * using the model's allied:china import mix (so allies→US shows), China is the residual
 * sink, and ore may flow to China (mining). Destinations therefore equal the next
 * stage's production, so mass is conserved region-by-region across the chain. */
function route(supplyIn: Reg, demandIn: Reg, usMix: { allied?: number; china?: number } | undefined): Flow[] {
  const S = { ...supplyIn }, D = { ...demandIn };
  const agg = new Map<string, number>();   // from|to → value (so each arc is emitted once)
  const add = (from: Region, to: Region, v: number) => {
    if (v > 0.01) { agg.set(`${from}|${to}`, (agg.get(`${from}|${to}`) ?? 0) + v); S[from] -= v; D[to] -= v; }
  };
  for (const r of REGIONS) add(r, r, Math.min(S[r], D[r]));   // own region first
  // US import deficit split by the model's allied-vs-China sourcing mix.
  if (D.USA > 1e-9) {
    const aw = usMix?.allied ?? 0, cw = usMix?.china ?? 0, tw = aw + cw;
    if (tw > 1e-9) {
      add('RoW', 'USA', Math.min(S.RoW, (D.USA * aw) / tw));
      add('China', 'USA', Math.min(S.China, D.USA));   // remaining US demand after the allied portion
    }
    add('RoW', 'USA', Math.min(S.RoW, D.USA));          // any residual: allies then China
    add('China', 'USA', Math.min(S.China, D.USA));
  }
  add('China', 'RoW', Math.min(S.China, D.RoW));        // RoW imports: China then US surplus
  add('USA', 'RoW', Math.min(S.USA, D.RoW));
  add('RoW', 'China', Math.min(S.RoW, D.China));        // China imports: RoW then US surplus (ore→China)
  add('USA', 'China', Math.min(S.USA, D.China));
  for (const to of REGIONS) for (const from of REGIONS) add(from, to, Math.min(S[from], D[to]));  // sweep any rounding residual
  const flows: Flow[] = [];
  for (const [k, v] of agg) { const [from, to] = k.split('|'); flows.push({ from, to, value: v }); }
  return flows;
}

/** Real-world-anchored flows: project-floored production per stage (STEP 1), routed
 * stage-to-stage with the model's US sourcing mix (STEP 2) so mass is conserved
 * end-to-end and allies→US shows. See the header. */
export function realWorldFlows(sc: Scenario, active: Set<string>, scale: Record<string, number> = {}, cls?: 'heavy' | 'light'): Record<string, Flow[]> {
  // Prefer the model's REAL per-class flows (emitted as flows_re) so the heavy/light
  // Sankey shows the model's actual Dy/Tb (or Nd/Pr) shipments. Fall back to scaling the
  // aggregate flows by the RE class's mass fraction only for older JSON without flows_re.
  const reFlows = cls ? sc.flows_re?.[cls] : undefined;
  const flows = reFlows ?? sc.flows;
  const frac = reFlows ? 1 : cls === 'heavy' ? 0.094 : cls === 'light' ? 0.906 : 1;
  // Class share of aggregate mass at each interface, used to scale the (total-mass)
  // project-capacity floor into class units for the element-agnostic alloy/magnet stages.
  // With real per-class flows this varies by interface (heavy ≈ 0.03 magnet → 0.98 ore);
  // without flows_re it collapses to the flat `frac`, preserving the legacy behavior.
  const capFracFor = (iface: string): number => {
    if (!reFlows) return frac;
    const agg = sumReg(modelProduction(sc.flows, iface, 1));
    return agg > 1e-9 ? sumReg(modelProduction(reFlows, iface, 1)) / agg : frac;
  };
  // STEP 1: production bars per stage.
  const prod: Record<string, Reg> = {};
  for (const [iface, stage] of IFACE_STAGE) prod[iface] = stageProduction(flows, stage, iface, active, scale, frac, capFracFor(iface), cls);
  // STEP 2: route each interface's supply to the next stage's production (demand). The
  // magnet interface's demand is the model's consumption endpoint (who uses magnets).
  const out: Record<string, Flow[]> = {};
  for (let i = 0; i < IFACE_STAGE.length; i++) {
    const [iface, stage] = IFACE_STAGE[i];
    const supply = prod[iface];
    const nextIface = IFACE_STAGE[i + 1]?.[0];
    const demandRaw = nextIface ? prod[nextIface] : modelConsumption(flows, 'magnet', frac);
    const demand = scaleTo(demandRaw, sumReg(supply));   // conserve this interface's total
    out[iface] = route(supply, demand, sc.us_supply?.[stage]);
  }
  return out;
}
