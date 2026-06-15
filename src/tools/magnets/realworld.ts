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
