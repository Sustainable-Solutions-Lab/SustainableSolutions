/**
 * The interactive refinery's model: a forward mass-and-money balance for one
 * refinery, computed in t/day.
 *
 * There is no optimizer. Crude is split into cuts, and each cut is sent down a
 * fixed order of outlets. Every unit takes what it is sent up to its capacity;
 * the excess spills to the next-best outlet (vacuum gas oil to fuel oil, heavy
 * naphtha to naphtha sales, and so on) and the spill is reported, because the
 * gap between what the levers ask for and what the hardware can take is the
 * point of the tool.
 *
 * Every stream that more than one unit produces (light naphtha from the crude
 * unit, the coker and the hydrocracker, say) is a pool. Whatever a pool hands
 * on is drawn from its sources in proportion, which is what the Sankey shows.
 */
import {
  ALKY, AROM, CCS_COST, COKER, COKE_CO2, COPROC, CUTS, CUT_YIELD, FCC_MODES, FG_EF, FG_LHV,
  GASOLINE_MIN_RON, GJ_PER_MMBTU, GRADES, GRADE_BBL_PER_T, H2_LHV, H2_SOURCES, HCK_MODES, HT_H2,
  ISOM, NG_EF, OCTANE_DISCOUNT, OFFSITES_GJ_PER_T, PRESETS, PRICES_2023, PRODUCTS, PRODUCT_BBL_PER_T,
  RON, SCR_YIELD, SWING_MAX_C, SWING_SHARE, UNITS, UNIT_IDS, reformer,
  type Cut, type FccMode, type Grade, type H2Source, type HckMode, type PresetId, type Prices,
  type ProductId, type UnitId,
} from './data.ts';

export type State = {
  /** Crude run asked for, kb/d. */
  throughput: number;
  /** Crude slate as shares of barrels (sums to 1). */
  slate: Record<Grade, number>;
  /** Capacity in kb/d of feed; `on` false means the unit is switched off. */
  units: Record<UnitId, { on: boolean; cap: number }>;
  /** Shift of the naphtha/kerosene cut point, °C (+ = more naphtha). */
  nkShift: number;
  /** Shift of the kerosene/diesel cut point, °C (+ = more kerosene). */
  kdShift: number;
  fccMode: FccMode;
  hckMode: HckMode;
  /** Reformer severity, 0 to 1. */
  refSeverity: number;
  /** Share of reformate offered to the aromatics complex. */
  refToArom: number;
  /** Share of naphtha offered to the steam cracker. */
  naphToCracker: number;
  h2Source: H2Source;
  /** Plant-oil share of the diesel hydrotreater's feed, 0 to 0.10. */
  coproc: number;
  prices: Prices;
};

export const unitsFromPreset = (id: PresetId): State['units'] =>
  Object.fromEntries(UNIT_IDS.map((u) => [u, { on: PRESETS[id].caps[u] > 0, cap: PRESETS[id].caps[u] || defaultCap(u) }])) as State['units'];

/** Capacity a unit gets when it is switched on from nothing. */
const defaultCap = (u: UnitId) => ({ cdu: 260, coker: 40, hck: 40, fcc: 60, ref: 45, isom: 20, alky: 12, kht: 35, dht: 80, scr: 60, arom: 25 })[u];

export const DEFAULT_STATE: State = {
  throughput: 250,
  slate: { ls: 0.25, ms: 0.45, hs: 0.30 },
  units: unitsFromPreset('deep'),
  nkShift: 0, kdShift: 0,
  fccMode: 'gasoline', hckMode: 'diesel',
  refSeverity: 0.5, refToArom: 0, naphToCracker: 0,
  h2Source: 'smr', coproc: 0,
  prices: PRICES_2023,
};

// ── Streams and Sankey bookkeeping ──────────────────────────────────────────
/** The product family a stream belongs to: sets its ribbon colour. */
export type Family = ProductId;
export type Link = { from: string; to: string; t: number; family: Family };
export type Spill = { unit: UnitId; text: string };

type Src = { node: string; t: number };
class Book {
  links = new Map<string, Link>();
  add(from: string, to: string, t: number, family: Family) {
    if (!(t > 1e-9)) return;
    const k = `${from}>${to}>${family}`;
    const l = this.links.get(k);
    if (l) l.t += t; else this.links.set(k, { from, to, t, family });
  }
}
class Pool {
  srcs: Src[] = [];
  left = 0;
  book: Book;
  family: Family;
  constructor(book: Book, family: Family) { this.book = book; this.family = family; }
  add(node: string, t: number) { if (t > 1e-9) { this.srcs.push({ node, t }); this.left += t; } }
  get total() { return this.srcs.reduce((a, s) => a + s.t, 0); }
  /** Send `t` (capped at what is left) to `to`, drawn from every source in
   *  proportion. Returns what was sent. */
  take(to: string, t: number, family: Family = this.family): number {
    const amt = Math.max(0, Math.min(t, this.left));
    const tot = this.total;
    if (amt <= 1e-9 || tot <= 0) return 0;
    for (const s of this.srcs) this.book.add(s.node, to, (amt * s.t) / tot, family);
    this.left -= amt;
    return amt;
  }
  rest(to: string, family?: Family) { return this.take(to, this.left, family); }
}

export type UnitResult = { present: boolean; feed: number; capT: number; util: number };
export type Result = {
  crudeKbd: number;
  crudeT: number;
  crudeBbl: number;
  gradeT: Record<Grade, number>;
  cutT: Record<Cut, number>;
  links: Link[];
  units: Record<UnitId, UnitResult>;
  products: Record<ProductId, number>;
  plantOil: number;
  spills: Spill[];
  notes: string[];
  ron: number;
  ronShort: number;
  gasolineT: number;
  h2: { produced: number; consumed: number; imported: number; surplus: number };
  /** t CO2/day by source. Scope 1 except `power`. */
  co2: { heaters: number; fccRegen: number; h2Plant: number; cracker: number; power: number; captured: number };
  scope1: number;
  econ: { revenue: number; crude: number; plantOil: number; gas: number; power: number; vom: number; carbon: number; cash: number; fixed: number; net: number };
  mass: { inT: number; outT: number; err: number };
};

const kbdToT = (kbd: number, bblPerT: number) => (kbd * 1000) / bblPerT;
const tToKbd = (t: number, bblPerT: number) => (t * bblPerT) / 1000;
const fmtKbd = (t: number, bblPerT: number) => {
  const k = tToKbd(t, bblPerT);
  return k >= 10 ? k.toFixed(0) : k.toFixed(1);
};
/** Spills smaller than this share of the crude are not worth a warning. */
const SPILL_MIN = 0.002;

export function compute(s: State): Result {
  const book = new Book();
  const spills: Spill[] = [];
  const notes: string[] = [];
  const P = s.prices;
  const U = (u: UnitId) => s.units[u];
  const present = (u: UnitId) => U(u).on && U(u).cap > 0;
  const capT = (u: UnitId) => (present(u) ? kbdToT(U(u).cap, UNITS[u].feedBblPerT) : 0);
  const feed: Record<UnitId, number> = Object.fromEntries(UNIT_IDS.map((u) => [u, 0])) as Record<UnitId, number>;

  // ── Crude and cuts ─────────────────────────────────────────────────────────
  const slateSum = GRADES.reduce((a, g) => a + s.slate[g], 0) || 1;
  const crudeKbd = Math.min(s.throughput, U('cdu').cap);
  if (s.throughput > U('cdu').cap + 0.5) {
    spills.push({ unit: 'cdu', text: `Crude unit full: crude run held at ${U('cdu').cap.toFixed(0)} kb/d, not ${s.throughput.toFixed(0)}.` });
  }
  const gradeT = Object.fromEntries(GRADES.map((g) => [g, kbdToT(crudeKbd * s.slate[g] / slateSum, GRADE_BBL_PER_T[g])])) as Record<Grade, number>;
  const crudeT = GRADES.reduce((a, g) => a + gradeT[g], 0);
  const crudeBbl = crudeKbd * 1000;
  feed.cdu = crudeT;
  const minCut = SPILL_MIN;

  const cutT = Object.fromEntries(CUTS.map((c) => [c, 0])) as Record<Cut, number>;
  const cutFamily: Record<Cut, Family> = { lpg: 'lpg', ln: 'gasoline', hn: 'gasoline', ker: 'jet', go: 'diesel', vgo: 'fuelOil', vr: 'fuelOil' };
  for (const g of GRADES) {
    const y = { ...CUT_YIELD[g] };
    // The swing cuts: a shift moves crude between neighbouring cuts, never
    // more than either holds.
    const d1 = Math.max(-y.hn + 0.01, Math.min(y.ker - 0.01, SWING_SHARE * s.nkShift / SWING_MAX_C));
    y.hn += d1; y.ker -= d1;
    const d2 = Math.max(-y.ker + 0.01, Math.min(y.go - 0.01, SWING_SHARE * s.kdShift / SWING_MAX_C));
    y.ker += d2; y.go -= d2;
    for (const c of CUTS) {
      const t = gradeT[g] * y[c];
      cutT[c] += t;
      book.add(`crude_${g}`, `cut_${c}`, t, cutFamily[c]);
    }
  }
  const pool = (fam: Family) => new Pool(book, fam);
  const LPG = pool('lpg'), LN = pool('gasoline'), HN = pool('gasoline'), KER = pool('jet');
  const GO = pool('diesel'), VGO = pool('fuelOil'), VR = pool('fuelOil');
  LPG.add('cut_lpg', cutT.lpg); LN.add('cut_ln', cutT.ln); HN.add('cut_hn', cutT.hn);
  KER.add('cut_ker', cutT.ker); GO.add('cut_go', cutT.go); VGO.add('cut_vgo', cutT.vgo); VR.add('cut_vr', cutT.vr);

  let fgMass = 0;        // combustible fuel gas made, t/d
  let lossMass = 0;      // coke burned in the FCC, water and CO2 from plant oil
  let h2Made = 0, h2Used = 0;
  const gasComps: { t: number; ron: number }[] = [];
  const toFG = (from: string, t: number, combustible = true) => {
    book.add(from, 'p_fuelGas', t, 'fuelGas');
    if (combustible) fgMass += t; else lossMass += t;
  };
  const spill = (u: UnitId, t: number, what: string, where: string) => {
    if (t > minCut * crudeT) spills.push({ unit: u, text: `${UNITS[u].short} full: ${fmtKbd(t, UNITS[u].feedBblPerT)} kb/d of ${what} goes to ${where}.` });
  };

  // ── Coker ─────────────────────────────────────────────────────────────────
  {
    const f = VR.take('coker', capT('coker'));
    feed.coker = f;
    toFG('coker', f * COKER.fg);
    book.add('coker', 'p_coke', f * COKER.coke, 'coke');
    LPG.add('coker', f * COKER.lpg); LN.add('coker', f * COKER.ln);
    GO.add('coker', f * COKER.go); VGO.add('coker', f * COKER.vgo);
    if (present('coker')) spill('coker', VR.left, 'vacuum residue', 'fuel oil');
    VR.rest('p_fuelOil');
  }

  // ── Hydrocracker, then FCC, on vacuum gas oil ─────────────────────────────
  const fccLPG = pool('lpg'), LCO = pool('diesel');
  {
    const m = HCK_MODES[s.hckMode];
    const f = VGO.take('hck', capT('hck'));
    feed.hck = f;
    h2Used += f * m.h2;
    LPG.add('hck', f * m.lpg); LN.add('hck', f * m.ln); HN.add('hck', f * m.hn);
    book.add('hck', 'p_jet', f * m.jet, 'jet');
    book.add('hck', 'p_diesel', f * m.diesel, 'diesel');
  }
  let fccCoke = 0;
  {
    const m = FCC_MODES[s.fccMode];
    const f = VGO.take('fcc', capT('fcc'));
    feed.fcc = f;
    book.add('fcc', 'p_gasoline', f * m.fccg, 'gasoline');
    gasComps.push({ t: f * m.fccg, ron: m.ron });
    LCO.add('fcc', f * m.lco);
    book.add('fcc', 'p_propylene', f * m.c3, 'propylene');
    fccLPG.add('fcc', f * m.lpg);
    book.add('fcc', 'p_fuelOil', f * m.slurry, 'fuelOil');
    toFG('fcc', f * m.fg);
    fccCoke = f * (1 - m.fccg - m.lco - m.c3 - m.lpg - m.slurry - m.fg);
    toFG('fcc', fccCoke, false);
    const where = present('hck') && !present('fcc') ? 'hck' : 'fcc';
    if (present('fcc') || present('hck')) spill(where, VGO.left, 'vacuum gas oil', 'fuel oil');
    VGO.rest('p_fuelOil');
  }

  // ── Naphtha: steam cracker, isomerization, reformer ───────────────────────
  const PYGAS = pool('gasoline'), REFM = pool('gasoline');
  {
    const want = s.naphToCracker * (LN.left + HN.left);
    const f = Math.min(want, capT('scr'));
    if (present('scr') && want > 0) {
      const k = f / want;
      const ln = LN.take('scr', LN.left * s.naphToCracker * k);
      const hn = HN.take('scr', HN.left * s.naphToCracker * k);
      feed.scr = ln + hn;
      for (const [t, y] of [[ln, SCR_YIELD.ln], [hn, SCR_YIELD.hn]] as const) {
        book.add('scr', 'p_ethylene', t * y.ethylene, 'ethylene');
        book.add('scr', 'p_propylene', t * y.propylene, 'propylene');
        book.add('scr', 'p_butadiene', t * y.butadiene, 'butadiene');
        PYGAS.add('scr', t * y.pygas);
        h2Made += t * y.h2;
        toFG('scr', t * y.fg);
        book.add('scr', 'p_fuelOil', t * y.fuelOil, 'fuelOil');
        book.add('scr', 'p_lpg', t * y.lpg, 'lpg');
      }
      if (want - f > SPILL_MIN * crudeT) {
        spills.push({ unit: 'scr', text: `Steam cracker full: ${fmtKbd(want - f, UNITS.scr.feedBblPerT)} kb/d of the naphtha sent to it stays in fuels.` });
      }
    }
  }
  {
    const f = LN.take('isom', capT('isom'));
    feed.isom = f;
    book.add('isom', 'p_gasoline', f * ISOM.isomate, 'gasoline');
    gasComps.push({ t: f * ISOM.isomate, ron: RON.isomate });
    book.add('isom', 'p_lpg', f * ISOM.lpg, 'lpg');
    if (present('isom')) spill('isom', LN.left, 'light naphtha', 'gasoline untreated, at low octane');
    gasComps.push({ t: LN.left, ron: RON.ln });
    LN.rest('p_gasoline');
  }
  const R = reformer(s.refSeverity);
  {
    const f = HN.take('ref', capT('ref'));
    feed.ref = f;
    REFM.add('ref', f * R.refm);
    h2Made += f * R.h2;
    book.add('ref', 'p_lpg', f * R.lpg, 'lpg');
    toFG('ref', f * R.fg);
    if (present('ref')) spill('ref', HN.left, 'heavy naphtha', 'naphtha sales');
    HN.rest('p_naphtha', 'naphtha');
  }

  // ── Aromatics complex: reformate first, then pyrolysis gasoline ───────────
  {
    const cap = capT('arom');
    const wantR = s.refToArom * REFM.left;
    const fr = REFM.take('arom', Math.min(wantR, cap));
    const fp = PYGAS.take('arom', Math.min(PYGAS.left, cap - fr));
    feed.arom = fr + fp;
    book.add('arom', 'p_btx', fr * AROM.reformate.btx + fp * AROM.pygas.btx, 'btx');
    book.add('arom', 'p_naphtha', fr * AROM.reformate.raff + fp * AROM.pygas.raff, 'naphtha');
    if (present('arom') && wantR - fr > SPILL_MIN * crudeT) {
      spills.push({ unit: 'arom', text: `Aromatics full: ${fmtKbd(wantR - fr, UNITS.arom.feedBblPerT)} kb/d of reformate stays in gasoline.` });
    }
    gasComps.push({ t: REFM.left, ron: R.ron }, { t: PYGAS.left, ron: RON.pygas });
    REFM.rest('p_gasoline');
    PYGAS.rest('p_gasoline');
  }

  // ── Alkylation on FCC C3/C4 ────────────────────────────────────────────────
  {
    const f = fccLPG.take('alky', capT('alky'));
    feed.alky = f;
    book.add('alky', 'p_gasoline', f * ALKY.alkylate, 'gasoline');
    gasComps.push({ t: f * ALKY.alkylate, ron: RON.alkylate });
    toFG('alky', f * ALKY.fg);
    fccLPG.rest('p_lpg');
    LPG.rest('p_lpg');
  }

  // ── Hydrotreaters ──────────────────────────────────────────────────────────
  {
    const f = KER.take('kht', capT('kht'));
    feed.kht = f;
    const h = f * HT_H2.ker;
    h2Used += h;
    book.add('kht', 'p_jet', f, 'jet');
    toFG('kht', h);
    if (present('kht')) spill('kht', KER.left, 'kerosene', 'the diesel pool');
  }
  let plantOil = 0;
  {
    const cap = capT('dht');
    const p = present('dht') ? s.coproc : 0;
    let room = cap * (1 - p);
    const go = GO.take('dht', room); room -= go;
    const ker = KER.take('dht', room, 'diesel'); room -= ker;
    const lco = LCO.take('dht', room); room -= lco;
    const fossil = go + ker + lco;
    plantOil = p > 0 ? (fossil * p) / (1 - p) : 0;
    book.add('poil', 'dht', plantOil, 'diesel');
    feed.dht = fossil + plantOil;
    const hFossil = go * HT_H2.go + ker * HT_H2.kerInDht + lco * HT_H2.lco;
    const hOil = plantOil * HT_H2.plantOil;
    h2Used += hFossil + hOil;
    book.add('dht', 'p_diesel', fossil + plantOil * COPROC.diesel, 'diesel');
    book.add('dht', 'p_lpg', plantOil * COPROC.lpg, 'lpg');
    toFG('dht', hFossil);
    toFG('dht', plantOil * (1 + HT_H2.plantOil - COPROC.diesel - COPROC.lpg), false);
    const leftover = GO.left + KER.left + LCO.left;
    if (present('dht')) spill('dht', leftover, 'untreated distillate', 'fuel oil');
    GO.rest('p_fuelOil', 'fuelOil'); KER.rest('p_fuelOil', 'fuelOil'); LCO.rest('p_fuelOil', 'fuelOil');
  }

  // ── Hydrogen balance ───────────────────────────────────────────────────────
  const h2Imported = Math.max(0, h2Used - h2Made);
  const h2Surplus = Math.max(0, h2Made - h2Used);
  const H = H2_SOURCES[s.h2Source];

  // ── Products ──────────────────────────────────────────────────────────────
  const links = [...book.links.values()];
  const products = Object.fromEntries(PRODUCTS.map((p) => [p, 0])) as Record<ProductId, number>;
  for (const l of links) if (l.to.startsWith('p_')) products[l.to.slice(2) as ProductId] += l.t;
  products.fuelGas += h2Surplus;

  // ── Octane ────────────────────────────────────────────────────────────────
  const gT = gasComps.reduce((a, c) => a + c.t, 0);
  const ron = gT > 0 ? gasComps.reduce((a, c) => a + c.t * c.ron, 0) / gT : 0;
  const ronShort = gT > 0 ? Math.max(0, GASOLINE_MIN_RON - ron) : 0;

  // ── Energy and emissions ──────────────────────────────────────────────────
  let heaterGJ = OFFSITES_GJ_PER_T * crudeT;
  let mwh = 0;
  for (const u of UNIT_IDS) {
    const e = u === 'ref' ? R.energy : UNITS[u].energy;
    if (u !== 'scr') heaterGJ += e * feed[u];
    mwh += (UNITS[u].kwh * feed[u]) / 1000;
  }
  const crackerGJ = UNITS.scr.energy * feed.scr;
  const demandGJ = heaterGJ + crackerGJ;
  const fgGJ = fgMass * FG_LHV + h2Surplus * H2_LHV;
  const fgUsed = Math.min(fgGJ, demandGJ);
  const fgExport = fgGJ - fgUsed;
  const ngFuelGJ = demandGJ - fgUsed;
  const fgCO2perGJ = fgGJ > 0 ? (fgMass * FG_LHV * FG_EF) / fgGJ : 0;
  const fuelCO2 = fgUsed * fgCO2perGJ + ngFuelGJ * NG_EF;
  const share = demandGJ > 0 ? heaterGJ / demandGJ : 1;
  const h2Gross = h2Imported * H.co2;
  const captured = h2Gross * H.capture;
  const powerMwh = mwh + h2Imported * (s.h2Source === 'ely' ? 0 : H.mwh);
  const co2 = {
    heaters: fuelCO2 * share,
    cracker: fuelCO2 * (1 - share),
    fccRegen: fccCoke * COKE_CO2,
    h2Plant: h2Gross - captured,
    power: powerMwh * P.grid,
    captured,
  };
  const scope1 = co2.heaters + co2.cracker + co2.fccRegen + co2.h2Plant;

  // ── Money ($/day) ─────────────────────────────────────────────────────────
  const priceT = (p: ProductId): number => {
    const bbl = PRODUCT_BBL_PER_T[p];
    switch (p) {
      case 'fuelGas': return 0;
      case 'coke': case 'ethylene': case 'propylene': case 'butadiene': return P[p];
      case 'btx': return P.btx;
      default: {
        const perBbl = p === 'gasoline' ? P.gasoline - OCTANE_DISCOUNT * ronShort : P[p];
        return perBbl * (bbl ?? 0);
      }
    }
  };
  const gasPerGJ = P.gas / GJ_PER_MMBTU;
  const revenue = PRODUCTS.reduce((a, p) => a + products[p] * priceT(p), 0) + fgExport * gasPerGJ;
  const crudeCost = GRADES.reduce((a, g) => a + gradeT[g] * GRADE_BBL_PER_T[g] * P.crude[g], 0);
  const oilCost = plantOil * P.plantOil;
  const gasCost = (ngFuelGJ + h2Imported * H.ngGJ) * gasPerGJ;
  const powerCost = (mwh + h2Imported * H.mwh) * P.power;
  const vom = UNIT_IDS.reduce((a, u) => a + UNITS[u].vom * feed[u], 0) + h2Imported * H.other + captured * CCS_COST;
  const carbon = scope1 * P.carbon;
  const cash = revenue - crudeCost - oilCost - gasCost - powerCost - vom - carbon;
  // $/t-yr of capacity times t/day of capacity is $/day.
  const fixed = UNIT_IDS.reduce((a, u) => a + UNITS[u].fom * capT(u), 0);
  const net = cash - fixed;

  // ── Mass balance ──────────────────────────────────────────────────────────
  const inT = crudeT + plantOil + h2Imported;
  const outT = PRODUCTS.reduce((a, p) => a + products[p], 0);
  const err = inT > 0 ? Math.abs(outT - inT) / inT : 0;

  const units = Object.fromEntries(UNIT_IDS.map((u) => {
    const c = u === 'cdu' ? kbdToT(U('cdu').cap, crudeBbl > 0 ? crudeBbl / crudeT : 7.2) : capT(u);
    return [u, { present: u === 'cdu' || present(u), feed: feed[u], capT: c, util: c > 0 ? feed[u] / c : 0 }];
  })) as Record<UnitId, UnitResult>;

  if (!present('fcc') && !present('hck') && cutT.vgo > 0) notes.push('No cracking unit: all vacuum gas oil is sold as fuel oil.');
  if (!present('coker') && cutT.vr > 0) notes.push('No coker: vacuum residue is sold as fuel oil.');
  if (s.naphToCracker > 0 && !present('scr')) notes.push('No steam cracker in this configuration, so naphtha routing has no effect.');
  if (s.refToArom > 0 && !present('arom')) notes.push('No aromatics complex, so reformate routing has no effect.');

  return {
    crudeKbd, crudeT, crudeBbl, gradeT, cutT, links, units, products, plantOil, spills, notes,
    ron, ronShort, gasolineT: products.gasoline,
    h2: { produced: h2Made, consumed: h2Used, imported: h2Imported, surplus: h2Surplus },
    co2, scope1,
    econ: { revenue, crude: crudeCost, plantOil: oilCost, gas: gasCost, power: powerCost, vom, carbon, cash, fixed, net },
    mass: { inT, outT, err },
  };
}
