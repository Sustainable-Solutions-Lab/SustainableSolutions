/**
 * Every constant the interactive refinery uses, in one place.
 *
 * THESE ARE STYLIZED TEXTBOOK VALUES, not data for any real refinery. Yields,
 * energy use and costs are typical orders of magnitude (from standard refining
 * texts and the stylized values in the lab's refinery-fleet prototype), chosen
 * so the model behaves sensibly and the levers move things in the right
 * direction by roughly the right amount. Prices are round numbers in the
 * neighbourhood of 2023 US Gulf Coast spot prices, and a made-up net-zero
 * world for contrast.
 *
 * Units: mass in tonnes (t); flows in t/day inside the model; capacities in
 * thousand barrels per day of FEED (kb/d), the industry's convention, turned
 * into t/day with each unit's feed density; energy in GJ (lower heating
 * value); CO2 in t.
 */

// ── Crude grades ────────────────────────────────────────────────────────────
export type Grade = 'ls' | 'ms' | 'hs';
export const GRADES: Grade[] = ['ls', 'ms', 'hs'];
export const GRADE_LABEL: Record<Grade, string> = {
  ls: 'Light sweet', ms: 'Medium sour', hs: 'Heavy sour',
};
/** Barrels per tonne (6.29 / specific gravity): ~38°, ~31° and ~20° API. */
export const GRADE_BBL_PER_T: Record<Grade, number> = { ls: 7.53, ms: 7.23, hs: 6.73 };

// ── Crude cuts (CDU + VDU) ──────────────────────────────────────────────────
export type Cut = 'lpg' | 'ln' | 'hn' | 'ker' | 'go' | 'vgo' | 'vr';
export const CUTS: Cut[] = ['lpg', 'ln', 'hn', 'ker', 'go', 'vgo', 'vr'];
export const CUT_LABEL: Record<Cut, string> = {
  lpg: 'Gases, LPG', ln: 'Light naphtha', hn: 'Heavy naphtha', ker: 'Kerosene',
  go: 'Gasoil', vgo: 'Vacuum gas oil', vr: 'Vacuum residue',
};
/** Mass yield of each cut at base cut points (sums to 1). Medium sour is the
 *  average of the other two. */
export const CUT_YIELD: Record<Grade, Record<Cut, number>> = {
  ls: { lpg: 0.02, ln: 0.08, hn: 0.14, ker: 0.13, go: 0.20, vgo: 0.28, vr: 0.15 },
  ms: { lpg: 0.015, ln: 0.065, hn: 0.115, ker: 0.115, go: 0.18, vgo: 0.275, vr: 0.235 },
  hs: { lpg: 0.01, ln: 0.05, hn: 0.09, ker: 0.10, go: 0.16, vgo: 0.27, vr: 0.32 },
};
/** Moving a cut point by its full ±20 °C range shifts this share of the crude
 *  between the two neighbouring cuts (the swing cut). */
export const SWING_SHARE = 0.03;
export const SWING_MAX_C = 20;

// ── Process units ───────────────────────────────────────────────────────────
export type UnitId = 'cdu' | 'coker' | 'hck' | 'fcc' | 'ref' | 'isom' | 'alky' | 'kht' | 'dht' | 'scr' | 'arom';
export const UNIT_IDS: UnitId[] = ['cdu', 'coker', 'hck', 'fcc', 'ref', 'isom', 'alky', 'kht', 'dht', 'scr', 'arom'];
export type UnitInfo = {
  label: string; short: string;
  /** Barrels per tonne of the unit's feed, to turn kb/d capacity into t/day. */
  feedBblPerT: number;
  /** Fuel burned in the unit's furnaces, GJ per t of feed. */
  energy: number;
  /** Electricity, kWh per t of feed. */
  kwh: number;
  /** Variable cost other than energy (catalyst, chemicals), $ per t of feed. */
  vom: number;
  /** Fixed operating cost (labour, maintenance, insurance), $ per t-yr of capacity. */
  fom: number;
  /** Largest capacity the slider allows, kb/d. */
  maxCap: number;
};
export const UNITS: Record<UnitId, UnitInfo> = {
  cdu:   { label: 'Crude unit (CDU/VDU)', short: 'CDU/VDU', feedBblPerT: 7.2, energy: 1.0, kwh: 15, vom: 2, fom: 12, maxCap: 450 },
  coker: { label: 'Coker', short: 'Coker', feedBblPerT: 6.4, energy: 1.5, kwh: 35, vom: 8, fom: 18, maxCap: 120 },
  hck:   { label: 'Hydrocracker', short: 'Hydrocracker', feedBblPerT: 6.85, energy: 1.4, kwh: 70, vom: 10, fom: 22, maxCap: 150 },
  fcc:   { label: 'Fluid catalytic cracker (FCC)', short: 'FCC', feedBblPerT: 6.85, energy: 0.6, kwh: 50, vom: 8, fom: 18, maxCap: 150 },
  ref:   { label: 'Catalytic reformer', short: 'Reformer', feedBblPerT: 8.6, energy: 0.9, kwh: 40, vom: 6, fom: 14, maxCap: 100 },
  isom:  { label: 'Isomerization', short: 'Isom', feedBblPerT: 9.4, energy: 0.5, kwh: 25, vom: 3, fom: 8, maxCap: 60 },
  alky:  { label: 'Alkylation', short: 'Alky', feedBblPerT: 10.9, energy: 1.0, kwh: 60, vom: 10, fom: 16, maxCap: 40 },
  kht:   { label: 'Kerosene hydrotreater', short: 'Jet hydrotreater', feedBblPerT: 7.9, energy: 0.3, kwh: 20, vom: 2, fom: 6, maxCap: 100 },
  dht:   { label: 'Diesel hydrotreater', short: 'Diesel hydrotreater', feedBblPerT: 7.45, energy: 0.4, kwh: 25, vom: 3, fom: 7, maxCap: 150 },
  scr:   { label: 'Steam cracker (naphtha)', short: 'Steam cracker', feedBblPerT: 9.0, energy: 9.0, kwh: 90, vom: 10, fom: 30, maxCap: 120 },
  arom:  { label: 'Aromatics complex', short: 'Aromatics', feedBblPerT: 7.6, energy: 2.0, kwh: 60, vom: 10, fom: 18, maxCap: 60 },
};
/** Steam, tankage, flares and other offsite utilities: GJ per t of crude run. */
export const OFFSITES_GJ_PER_T = 0.85;

/** FCC modes: mass yields per t of VGO. Whatever does not appear is coke
 *  burned off the catalyst in the regenerator. `ron` is the FCC gasoline's. */
export type FccMode = 'gasoline' | 'distillate' | 'propylene';
export const FCC_MODES: Record<FccMode, { label: string; fccg: number; lco: number; c3: number; lpg: number; slurry: number; fg: number; ron: number }> = {
  gasoline:   { label: 'Max gasoline',   fccg: 0.50, lco: 0.18, c3: 0.05,  lpg: 0.11,  slurry: 0.08, fg: 0.03,  ron: 92 },
  distillate: { label: 'Max distillate', fccg: 0.41, lco: 0.27, c3: 0.035, lpg: 0.085, slurry: 0.11, fg: 0.035, ron: 90 },
  propylene:  { label: 'Max propylene',  fccg: 0.38, lco: 0.14, c3: 0.15,  lpg: 0.14,  slurry: 0.07, fg: 0.06,  ron: 94 },
};
/** Coke is about 93% carbon: t CO2 per t of coke burned. */
export const COKE_CO2 = 3.41;

/** Hydrocracker modes, per t of VGO. Products sum to 1 + hydrogen used. */
export type HckMode = 'jet' | 'diesel' | 'naphtha';
export const HCK_MODES: Record<HckMode, { label: string; h2: number; lpg: number; ln: number; hn: number; jet: number; diesel: number }> = {
  jet:     { label: 'Max jet',     h2: 0.03, lpg: 0.04, ln: 0.06, hn: 0.15, jet: 0.45, diesel: 0.33 },
  diesel:  { label: 'Max diesel',  h2: 0.03, lpg: 0.04, ln: 0.05, hn: 0.12, jet: 0.25, diesel: 0.57 },
  naphtha: { label: 'Max naphtha', h2: 0.03, lpg: 0.07, ln: 0.15, hn: 0.40, jet: 0.23, diesel: 0.18 },
};

/** Delayed coker, per t of vacuum residue. */
export const COKER = { fg: 0.08, lpg: 0.04, ln: 0.10, go: 0.20, vgo: 0.28, coke: 0.30 };

/** Reformer yields as a function of severity s (0 to 1): harder running gives
 *  higher-octane reformate, more hydrogen and gas, less liquid. */
export const reformer = (s: number) => {
  const refm = 0.89 - 0.08 * s, h2 = 0.025 + 0.01 * s, lpg = 0.06 + 0.04 * s;
  return { refm, h2, lpg, fg: 1 - refm - h2 - lpg, ron: 94 + 8 * s, energy: 0.9 + 0.9 * s };
};
export const ISOM = { isomate: 0.97, lpg: 0.03 };
/** Alkylation: FCC C3/C4 into alkylate. */
export const ALKY = { alkylate: 0.95, fg: 0.05 };
/** Hydrogen used by hydrotreating, t per t of feed. Hydrotreating barely
 *  changes the product mass; the hydrogen leaves as H2S and light ends, which
 *  are counted with fuel gas. */
export const HT_H2 = { ker: 0.005, go: 0.008, kerInDht: 0.006, lco: 0.025, plantOil: 0.035 };
/** Co-processing plant oil in the diesel hydrotreater: renewable diesel and
 *  propane, the rest leaves as water and CO2 (biogenic, not counted). */
export const COPROC = { diesel: 0.85, lpg: 0.05 };

/** Naphtha steam cracker, per t of feed. */
export const SCR_YIELD = {
  ln: { ethylene: 0.32, propylene: 0.16, butadiene: 0.05, pygas: 0.19, h2: 0.01, fg: 0.17, fuelOil: 0.04, lpg: 0.06 },
  hn: { ethylene: 0.28, propylene: 0.15, butadiene: 0.05, pygas: 0.21, h2: 0.01, fg: 0.16, fuelOil: 0.07, lpg: 0.07 },
};
/** Aromatics complex: BTX extracted from reformate or pyrolysis gasoline; the
 *  raffinate is sold as naphtha. */
export const AROM = { reformate: { btx: 0.60, raff: 0.40 }, pygas: { btx: 0.65, raff: 0.35 } };

// ── Hydrogen ────────────────────────────────────────────────────────────────
export type H2Source = 'smr' | 'ccs' | 'ely';
export const H2_SOURCES: Record<H2Source, { label: string; ngGJ: number; co2: number; capture: number; mwh: number; other: number }> = {
  // Steam methane reforming: ~165 GJ of gas (feed + fuel) and ~9.2 t CO2 per t H2.
  smr: { label: 'Steam methane reforming', ngGJ: 165, co2: 9.2, capture: 0, mwh: 0.6, other: 250 },
  // Capture on the shifted syngas and part of the flue gas: ~60% of the CO2,
  // a little more gas for the capture plant.
  ccs: { label: 'SMR with carbon capture', ngGJ: 178, co2: 9.9, capture: 0.6, mwh: 1.2, other: 330 },
  // Electrolysis on contracted clean power: ~55 MWh per t H2. `other` is
  // annualized capital and upkeep of a new electrolyzer.
  ely: { label: 'Electrolysis (clean power)', ngGJ: 0, co2: 0, capture: 0, mwh: 55, other: 1200 },
};
/** Capture, compression, transport and storage, $ per t CO2 captured. */
export const CCS_COST = 55;

// ── Fuels and emissions ─────────────────────────────────────────────────────
export const FG_LHV = 47;          // GJ per t of refinery fuel gas
export const H2_LHV = 120;         // GJ per t of hydrogen burned as fuel
export const FG_EF = 0.0596;       // t CO2 per GJ of fuel gas (~2.8 t/t)
export const NG_EF = 0.0561;       // t CO2 per GJ of natural gas
export const GJ_PER_MMBTU = 1.055;

// ── Products ────────────────────────────────────────────────────────────────
export type ProductId = 'lpg' | 'gasoline' | 'naphtha' | 'jet' | 'diesel' | 'fuelOil' | 'coke'
  | 'ethylene' | 'propylene' | 'butadiene' | 'btx' | 'fuelGas';
export const PRODUCTS: ProductId[] = ['lpg', 'gasoline', 'naphtha', 'jet', 'diesel', 'fuelOil', 'coke',
  'ethylene', 'propylene', 'butadiene', 'btx', 'fuelGas'];
export const PRODUCT_LABEL: Record<ProductId, string> = {
  lpg: 'LPG', gasoline: 'Gasoline', naphtha: 'Naphtha', jet: 'Jet fuel', diesel: 'Diesel',
  fuelOil: 'Fuel oil', coke: 'Petroleum coke', ethylene: 'Ethylene', propylene: 'Propylene',
  butadiene: 'Butadiene', btx: 'Aromatics (BTX)', fuelGas: 'Fuel gas and losses',
};
/** Barrels per tonne for liquid products; null where barrels are not used. */
export const PRODUCT_BBL_PER_T: Record<ProductId, number | null> = {
  lpg: 11.6, gasoline: 8.45, naphtha: 8.9, jet: 7.9, diesel: 7.45, fuelOil: 6.4, coke: null,
  ethylene: null, propylene: null, butadiene: null, btx: 7.2, fuelGas: null,
};
/** Spectral, by product: fuels warm to cool by weight, chemicals at the red end. */
export const PRODUCT_COLOR: Record<ProductId, string> = {
  lpg: 'var(--spectral-5)', gasoline: 'var(--spectral-3)', naphtha: 'var(--spectral-4)',
  jet: 'var(--spectral-10)', diesel: 'var(--spectral-9)', fuelOil: 'var(--spectral-11)',
  coke: 'var(--ink-3)', ethylene: 'var(--spectral-1)', propylene: 'var(--spectral-2)',
  butadiene: 'var(--spectral-8)', btx: 'var(--spectral-7)', fuelGas: 'var(--ink-4)',
};
export const CHEMICALS: ProductId[] = ['ethylene', 'propylene', 'butadiene', 'btx'];

// ── Gasoline octane ─────────────────────────────────────────────────────────
/** Research octane of blend components (linear by mass, a simplification). */
export const RON = { ln: 68, hn: 55, isomate: 87, alkylate: 95, pygas: 95 };
export const GASOLINE_MIN_RON = 91;
/** Off-spec gasoline is sold as blendstock at this discount per RON point short. */
export const OCTANE_DISCOUNT = 1.5;   // $ per bbl per RON

// ── Prices ──────────────────────────────────────────────────────────────────
export type Prices = {
  crude: Record<Grade, number>;          // $/bbl
  lpg: number; gasoline: number; naphtha: number; jet: number; diesel: number; fuelOil: number; // $/bbl
  coke: number; ethylene: number; propylene: number; butadiene: number; btx: number;          // $/t
  plantOil: number;   // $/t
  gas: number;        // $/MMBtu
  power: number;      // $/MWh
  carbon: number;     // $/t CO2
  grid: number;       // t CO2/MWh of purchased power
};
export const PRICES_2023: Prices = {
  crude: { ls: 78, ms: 74, hs: 65 },
  lpg: 33, gasoline: 100, naphtha: 64, jet: 105, diesel: 110, fuelOil: 64,
  coke: 80, ethylene: 850, propylene: 900, butadiene: 1000, btx: 950,
  plantOil: 1200, gas: 2.7, power: 70, carbon: 0, grid: 0.4,
};
/** A made-up net-zero world: road fuels in steep decline, so crack spreads
 *  collapse, crude is cheaper, chemicals hold up, carbon is priced. */
export const PRICES_NZ: Prices = {
  crude: { ls: 52, ms: 49, hs: 42 },
  lpg: 26, gasoline: 56, naphtha: 52, jet: 76, diesel: 62, fuelOil: 40,
  coke: 30, ethylene: 950, propylene: 1000, butadiene: 1050, btx: 1000,
  plantOil: 1100, gas: 4, power: 50, carbon: 150, grid: 0.1,
};

// ── Configurations ──────────────────────────────────────────────────────────
export type PresetId = 'hydroskimming' | 'cracking' | 'coking' | 'hydrocracking' | 'deep' | 'petchem';
/** Capacity in kb/d of feed; 0 = no such unit. */
export const PRESETS: Record<PresetId, { label: string; desc: string; caps: Record<UnitId, number> }> = {
  hydroskimming: {
    label: 'Hydroskimming', desc: 'Distillation, reforming and hydrotreating only. Everything heavier than diesel leaves as fuel oil.',
    caps: { cdu: 260, coker: 0, hck: 0, fcc: 0, ref: 45, isom: 25, alky: 0, kht: 35, dht: 60, scr: 0, arom: 0 },
  },
  cracking: {
    label: 'Cracking (FCC)', desc: 'Adds an FCC to crack vacuum gas oil into gasoline, and alkylation for octane.',
    caps: { cdu: 260, coker: 0, hck: 0, fcc: 75, ref: 45, isom: 33, alky: 12, kht: 35, dht: 80, scr: 0, arom: 0 },
  },
  coking: {
    label: 'Coking (FCC + coker)', desc: 'Adds a coker so the residue becomes lighter products and coke, which lets the refinery buy cheaper heavy crude.',
    caps: { cdu: 260, coker: 55, hck: 0, fcc: 85, ref: 45, isom: 33, alky: 12, kht: 35, dht: 90, scr: 0, arom: 0 },
  },
  hydrocracking: {
    label: 'Hydrocracking', desc: 'A hydrocracker instead of an FCC: cracks gas oil with hydrogen into jet and diesel.',
    caps: { cdu: 260, coker: 0, hck: 75, fcc: 0, ref: 50, isom: 33, alky: 0, kht: 35, dht: 65, scr: 0, arom: 0 },
  },
  deep: {
    label: 'Deep conversion', desc: 'FCC, hydrocracker and coker together: almost no fuel oil, and the most flexibility.',
    caps: { cdu: 260, coker: 55, hck: 35, fcc: 55, ref: 45, isom: 33, alky: 12, kht: 35, dht: 85, scr: 0, arom: 0 },
  },
  petchem: {
    label: 'Integrated petrochemicals', desc: 'Deep conversion plus a naphtha steam cracker and an aromatics complex.',
    caps: { cdu: 260, coker: 55, hck: 35, fcc: 55, ref: 45, isom: 33, alky: 12, kht: 35, dht: 85, scr: 70, arom: 30 },
  },
};
