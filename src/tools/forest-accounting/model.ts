/**
 * Forest carbon accounting rules, applied to a stylised company.
 *
 * One company, four rules, the same physical forest. The forest in a
 * company's boundary changes carbon stock for four reasons, each a rate in
 * t CO₂ per hectare per year:
 *
 *   ambient   growth that rising CO₂, nitrogen deposition and a warmer, longer
 *             season cause on every forest (the "passive sink");
 *   legacy    regrowth of stands cut or cleared before the base year (the age
 *             structure the company inherited);
 *   mgmt      extra growth the company's own management causes (young stands
 *             regrowing faster than the old ones they replaced, planting,
 *             fertilising);
 *   harvest   carbon leaving the forest at harvest, roundwood plus slash and
 *             collateral damage.
 *
 * Every rule sees the same four numbers and differs only in which of them it
 * puts in the inventory, which it nets against what, and what it reports
 * as information outside the scopes. The rules are written from the two
 * proposals before the GHG Protocol's forest carbon accounting group (the
 * Managed Land Proxy "Plus" submission of May 2025 and the activity-based
 * accounting memo), the 2022 draft the pilots used, and the LSRS v1 rule
 * that land removals and fossil emissions are never netted. The fourth
 * rule is our proposal: attributable removals only, two ledgers, like
 * for like, one claimant per tonne (ProposedOptions, all on by default).
 *
 * Units: Mha × t/ha = Mt. All flows are Mt CO₂e per year, emissions
 * positive, removals negative.
 */

export type RuleId = 'mlp' | 'mlpPlus' | 'aba' | 'proposed';
export type Traceability = 'none' | 'jurisdiction' | 'region' | 'lmu';
export type Scope = 'scope1' | 'scope3';

export interface Company {
  id: string;
  name: string;
  blurb: string;
  scope: Scope;
  /** Mha of forest in the boundary: owned or controlled (scope 1) or the attributable productive sourcing area (scope 3). */
  area: number;
  ambient: number;
  legacy: number;
  mgmt: number;
  harvest: number;
  /** Share of harvested carbon still held in products after 100 years. */
  hwp: number;
  traceability: Traceability;
  /** Mt CO₂e/yr outside the forest. */
  fossil: number;
  ag: number;
  luc: number;
  /** Mha of already growing, unharvested forest added to the boundary by purchase or lease. */
  leased: number;
  /** Mt/yr of durable removals bought, and their price in $/t. */
  cdr: number;
  cdrPrice: number;
  /** Entities in the value chain that would report the same scope 3 removal. */
  claimants: number;
}

export interface ProposedOptions {
  /** Removals count only where the company's own activity caused them (mgmt); ambient and legacy growth are reported as background. */
  attributableOnly: boolean;
  /** Emissions and removals are two ledgers; the inventory reports both and nets neither. */
  separateLedgers: boolean;
  /** Fossil CO₂ can be balanced only by durable storage; land removals balance only land emissions. */
  likeForLike: boolean;
  /** A scope 3 removal is claimed once along the chain, so each claimant reports its share. */
  oneClaimant: boolean;
}

export const DEFAULT_PROPOSED: ProposedOptions = {
  attributableOnly: true,
  separateLedgers: true,
  likeForLike: true,
  oneClaimant: true,
};

export const RULES: Record<RuleId, { short: string; name: string; source: string }> = {
  mlp: {
    short: 'MLP',
    name: 'Managed land proxy, as piloted',
    source: '2022 draft guidance; the 2024 pilot results',
  },
  mlpPlus: {
    short: 'MLP+',
    name: 'Managed land proxy "plus"',
    source: 'MLP+ submission to the GHG Protocol, May 2025',
  },
  aba: {
    short: 'ABA',
    name: 'Activity-based accounting',
    source: 'ABA proposal and explanatory memo, 2025',
  },
  proposed: {
    short: 'Proposal',
    name: 'Our proposal: attributable removals, two ledgers, like for like',
    source: 'our proposal, in review',
  },
};

export const RULE_ORDER: RuleId[] = ['mlp', 'mlpPlus', 'aba', 'proposed'];

export const TRACEABILITY_LABEL: Record<Traceability, string> = {
  none: 'Global or national factors only',
  jurisdiction: 'Jurisdiction (country or state)',
  region: 'Sourcing region, with safeguards',
  lmu: 'Land management unit or harvest area',
};

/** Roundwood leaving the forest as a share of the carbon removed, and dry wood at 50% carbon. */
const ROUNDWOOD_SHARE = 0.6;
const C_PER_DRY_T = 0.5;
const CO2_PER_C = 44 / 12;

export interface Segment {
  key: string;
  label: string;
  value: number; // Mt, signed
}

export interface Ledger {
  rule: RuleId;
  fossil: number;
  /** Positive segments in the scopes, bottom to top. */
  emissions: Segment[];
  /** Negative segments in the scopes. */
  removals: Segment[];
  /** Reported outside the scopes, signed. */
  info: Segment[];
  landEmissions: number;
  removalsTotal: number; // negative or zero
  /** Emissions plus removals where the rule lets them net; otherwise the two are reported side by side and this is their sum for reference. */
  landNet: number;
  netsLand: boolean;
  netsFossil: boolean;
  /** The company's distance from a net-zero claim before any durable removals it has bought: positive is a shortfall, negative a reported surplus. */
  position: number;
  /** Durable removals still needed to claim net zero, after purchases. */
  cdrNeeded: number;
  /** $M/yr for the durable removals still needed. */
  cdrCost: number;
  /** Mt of forest removals that stand in for durable removals under this rule. */
  substitutes: number;
  /** t CO₂e per dry tonne of wood harvested, or null when there is no harvest. */
  woodFootprint: number | null;
  notes: string[];
}

function grossFlows(c: Company) {
  const ambient = c.area * c.ambient;
  const legacy = c.area * c.legacy;
  const mgmt = c.area * c.mgmt;
  const leased = c.leased * (c.ambient + c.legacy);
  const harvest = c.area * c.harvest;
  const stored = harvest * c.hwp;
  const wood = (harvest / CO2_PER_C) * ROUNDWOOD_SHARE / C_PER_DRY_T; // Mt dry wood
  return { ambient, legacy, mgmt, leased, harvest, stored, wood };
}

function sum(segs: Segment[]) {
  return segs.reduce((a, s) => a + s.value, 0);
}

function finish(
  c: Company,
  rule: RuleId,
  emissions: Segment[],
  removals: Segment[],
  info: Segment[],
  netsLand: boolean,
  netsFossil: boolean,
  substitutesWith: 'all' | 'land' | 'none',
  wood: number,
  notes: string[],
): Ledger {
  const landEmissions = sum(emissions);
  const removalsTotal = sum(removals);
  const landNet = landEmissions + removalsTotal;
  // What the company must still balance to claim net zero. Where the rule
  // lets forest removals offset fossil emissions the whole inventory nets;
  // otherwise fossil stands alone and only a land surplus adds to it.
  const position = netsFossil ? c.fossil + landNet : c.fossil + Math.max(landNet, 0);
  const cdrNeeded = Math.max(position - c.cdr, 0);
  const cdrCost = cdrNeeded * c.cdrPrice; // Mt × $/t = $M
  const substitutes =
    substitutesWith === 'all'
      ? Math.min(-removalsTotal, c.fossil + landEmissions)
      : substitutesWith === 'land'
        ? Math.min(-removalsTotal, landEmissions)
        : 0;
  const forestEm = emissions.filter((s) => s.key === 'forest').reduce((a, s) => a + s.value, 0);
  const forestRem = removals.filter((s) => s.key !== 'leased').reduce((a, s) => a + s.value, 0);
  const woodFootprint = wood > 0 ? (forestEm + forestRem) / wood : null;
  return {
    rule,
    fossil: c.fossil,
    emissions,
    removals,
    info,
    landEmissions,
    removalsTotal,
    landNet,
    netsLand,
    netsFossil,
    position,
    cdrNeeded,
    cdrCost,
    substitutes,
    woodFootprint,
    notes,
  };
}

const otherLand = (c: Company): Segment[] => [
  ...(c.ag > 0 ? [{ key: 'ag', label: 'Agricultural CH₄ and N₂O', value: c.ag }] : []),
  ...(c.luc > 0 ? [{ key: 'luc', label: 'Land-use change', value: c.luc }] : []),
];

export function ledger(c: Company, rule: RuleId, opt: ProposedOptions = DEFAULT_PROPOSED): Ledger {
  const g = grossFlows(c);
  const notes: string[] = [];

  if (rule === 'mlp') {
    // Every flux on managed land is anthropogenic and in the scopes; the
    // pilots netted the lot, fossil included, and every pilot company came
    // out carbon negative. Scope 3 without traceability falls back to a
    // national or global factor, which carries the same growth.
    const emissions: Segment[] = [...otherLand(c), ...(g.harvest > 0 ? [{ key: 'forest', label: 'Harvest, at the time of harvest', value: g.harvest }] : [])];
    const removals: Segment[] = [
      ...(g.mgmt > 0 ? [{ key: 'mgmt', label: 'Growth caused by management', value: -g.mgmt }] : []),
      ...(g.legacy > 0 ? [{ key: 'legacy', label: 'Regrowth from past harvest', value: -g.legacy }] : []),
      ...(g.ambient > 0 ? [{ key: 'ambient', label: 'Ambient growth (CO₂, N, climate)', value: -g.ambient }] : []),
      ...(g.leased > 0 ? [{ key: 'leased', label: 'Growth on leased forest', value: -g.leased }] : []),
    ];
    const info: Segment[] = g.stored > 0 ? [{ key: 'hwp', label: 'Product carbon storage', value: -g.stored }] : [];
    if (c.scope === 'scope3' && (c.traceability === 'none' || c.traceability === 'jurisdiction'))
      notes.push('Untraced wood takes a national or global land-carbon factor, which is a net sink almost everywhere.');
    return finish(c, rule, emissions, removals, info, true, true, 'all', g.wood, notes);
  }

  if (rule === 'mlpPlus') {
    // Same physical inventory, three safeguards: removals in scope 3 need
    // sourcing-region traceability and the safeguards, and cover only
    // attributable productive land; forest removals may not compensate
    // fossil emissions (the claims disclaimer); a forest impact statement
    // reports the effect of management against historical practice,
    // outside the inventory. Nothing stops forest removals netting against
    // agricultural and land-use-change emissions.
    const emissions: Segment[] = [...otherLand(c), ...(g.harvest > 0 ? [{ key: 'forest', label: 'Harvest, at the time of harvest', value: g.harvest }] : [])];
    const traced = c.scope === 'scope1' || c.traceability === 'region' || c.traceability === 'lmu';
    const removals: Segment[] = traced
      ? [
          ...(g.mgmt > 0 ? [{ key: 'mgmt', label: 'Growth caused by management', value: -g.mgmt }] : []),
          ...(g.legacy > 0 ? [{ key: 'legacy', label: 'Regrowth from past harvest', value: -g.legacy }] : []),
          ...(g.ambient > 0 ? [{ key: 'ambient', label: 'Ambient growth (CO₂, N, climate)', value: -g.ambient }] : []),
          ...(c.scope === 'scope1' && g.leased > 0 ? [{ key: 'leased', label: 'Growth on leased forest (owned or controlled, managed)', value: -g.leased }] : []),
        ]
      : [];
    if (!traced) notes.push('No sourcing-region traceability: emissions are reported, removals are not.');
    if (c.scope === 'scope3' && g.leased > 0) notes.push('Leased forest is not attributable productive land in scope 3, so it is excluded.');
    const info: Segment[] = [
      ...(g.mgmt > 0 ? [{ key: 'impact', label: 'Forest impact statement (management vs historical practice)', value: -g.mgmt }] : []),
      ...(g.stored > 0 ? [{ key: 'hwp', label: 'Product carbon storage', value: -g.stored }] : []),
    ];
    return finish(c, rule, emissions, removals, info, true, false, 'land', g.wood, notes);
  }

  if (rule === 'aba') {
    // Emissions are what harvest and wood use release, pool by pool; the
    // share still in products after a century is not emitted. Removals are
    // the growth the company's activity caused above a no-activity
    // counterfactual. Ambient and legacy growth are the baseline. Stock
    // change on owned land is reported outside the scopes. Traceability
    // changes the data, not the rule: untraced wood takes an activity
    // factor per tonne.
    const emissions: Segment[] = [...otherLand(c), ...(g.harvest > 0 ? [{ key: 'forest', label: 'Harvest and wood use, net of long-lived products', value: g.harvest - g.stored }] : [])];
    const removals: Segment[] = g.mgmt > 0 ? [{ key: 'mgmt', label: 'Growth caused by management', value: -g.mgmt }] : [];
    const stock = g.harvest - g.ambient - g.legacy - g.mgmt - g.leased;
    const info: Segment[] = c.scope === 'scope1' && (c.area > 0 || c.leased > 0) ? [{ key: 'stock', label: 'Carbon stock change on owned land (outside scopes)', value: stock }] : [];
    if (g.leased > 0) notes.push('Leased forest adds nothing: no activity, no anthropogenic removal.');
    return finish(c, rule, emissions, removals, info, true, false, 'land', g.wood, notes);
  }

  // Our proposal. Each option is one rule; with all four on (the default), the
  // inventory carries two ledgers (emissions; attributable removals), the
  // background sink is disclosed but not claimed, fossil CO₂ is balanced
  // only by durable storage, and a shared scope 3 removal is claimed once.
  const emissions: Segment[] = [...otherLand(c), ...(g.harvest > 0 ? [{ key: 'forest', label: 'Harvest, at the time of harvest', value: g.harvest }] : [])];
  let removals: Segment[] = opt.attributableOnly
    ? g.mgmt > 0
      ? [{ key: 'mgmt', label: 'Growth caused by management', value: -g.mgmt }]
      : []
    : [
        ...(g.mgmt > 0 ? [{ key: 'mgmt', label: 'Growth caused by management', value: -g.mgmt }] : []),
        ...(g.legacy > 0 ? [{ key: 'legacy', label: 'Regrowth from past harvest', value: -g.legacy }] : []),
        ...(g.ambient > 0 ? [{ key: 'ambient', label: 'Ambient growth (CO₂, N, climate)', value: -g.ambient }] : []),
        ...(g.leased > 0 ? [{ key: 'leased', label: 'Growth on leased forest', value: -g.leased }] : []),
      ];
  if (opt.oneClaimant && c.scope === 'scope3' && c.claimants > 1) {
    removals = removals.map((s) => ({ ...s, label: `${s.label}, 1/${c.claimants} share`, value: s.value / c.claimants }));
    notes.push(`Scope 3 removals are shared among ${c.claimants} claimants; this company reports its 1/${c.claimants}.`);
  }
  const background = g.ambient + g.legacy + g.leased;
  const info: Segment[] = [
    ...(opt.attributableOnly && background > 0 ? [{ key: 'background', label: 'Background stock change, disclosed not claimed', value: -background }] : []),
    ...(g.stored > 0 ? [{ key: 'hwp', label: 'Product carbon storage', value: -g.stored }] : []),
  ];
  if (opt.separateLedgers) notes.push('Emissions and removals are reported as two totals; the inventory has no net line.');
  return finish(c, rule, emissions, removals, info, !opt.separateLedgers, !opt.likeForLike, opt.likeForLike ? 'land' : 'all', g.wood, notes);
}

/* ---------------- what the rule rewards ---------------- */

export interface Action {
  id: string;
  label: string;
  apply: (c: Company) => Company;
}

/**
 * The moves a company could make, by scope. Harvest and the regrowth it
 * triggers move together: cutting more makes more young, fast-growing
 * stands. A buyer moves its share of the sourcing region, not the rate.
 */
export function actionsFor(c: Company): Action[] {
  const a: Action[] = [];
  if (c.scope === 'scope1') {
    a.push({ id: 'harvestMore', label: 'Harvest 10% more wood', apply: (x) => ({ ...x, harvest: x.harvest * 1.1, mgmt: x.mgmt * 1.1 }) });
    if (c.area > 0) a.push({ id: 'setAside', label: 'Set aside 10% of the forest from harvest', apply: (x) => ({ ...x, harvest: x.harvest * 0.9, mgmt: x.mgmt * 0.9 }) });
  } else {
    a.push({ id: 'harvestMore', label: 'Buy 10% more wood', apply: (x) => ({ ...x, area: x.area * 1.1 }) });
    a.push({ id: 'lessWood', label: 'Use 20% less wood (recycled fibre, lighter products)', apply: (x) => ({ ...x, area: x.area * 0.8 }) });
    a.push({ id: 'legacyRegion', label: 'Source instead from a region cut hard 30 years ago (twice the regrowth)', apply: (x) => ({ ...x, legacy: x.legacy * 2 }) });
    if (c.traceability === 'none' || c.traceability === 'jurisdiction')
      a.push({ id: 'trace', label: 'Trace the wood to its sourcing region', apply: (x) => ({ ...x, traceability: 'region' }) });
  }
  a.push({ id: 'lease', label: 'Lease 1 Mha of already growing forest', apply: (x) => ({ ...x, leased: x.leased + 1 }) });
  if (c.ag > 0) a.push({ id: 'cutAg', label: 'Cut agricultural CH₄ and N₂O by 10%', apply: (x) => ({ ...x, ag: x.ag * 0.9 }) });
  if (c.fossil > 0) a.push({ id: 'cutFossil', label: 'Cut fossil emissions by 10%', apply: (x) => ({ ...x, fossil: x.fossil * 0.9 }) });
  return a;
}

/** Change in the company's net-zero position, Mt CO₂e/yr. Negative means the rule rewards the action. */
export function effect(c: Company, rule: RuleId, a: Action, opt: ProposedOptions): number {
  return ledger(a.apply(c), rule, opt).position - ledger(c, rule, opt).position;
}

/* ---------------- scenarios ----------------
 * Each preset is a piece of land. The reporting company is either its owner
 * (scope 1) or a downstream buyer of what it produces (scope 3); the tool
 * sets scope, traceability and claimants when the role changes. Fossil is
 * the reporting company's own processing and transport. */

export const COMPANIES: Company[] = [
  {
    id: 'pine',
    name: 'Southeast US pine plantation',
    blurb: '2 Mha of young, heavily worked loblolly pine on short rotations: fast regrowth from past cutting, management that adds growth, and a high harvest.',
    scope: 'scope1',
    area: 2.0, ambient: 2.0, legacy: 2.5, mgmt: 1.5, harvest: 5.5, hwp: 0.25,
    traceability: 'lmu',
    fossil: 1.0, ag: 0, luc: 0, leased: 0, cdr: 0, cdrPrice: 300, claimants: 1,
  },
  {
    id: 'dougfir',
    name: 'Pacific Northwest Douglas-fir',
    blurb: '1 Mha of Douglas-fir on 40 to 60 year rotations: strong ambient growth, slower legacy regrowth, and a third of the harvest held in lumber for a century.',
    scope: 'scope1',
    area: 1.0, ambient: 2.5, legacy: 1.5, mgmt: 1.0, harvest: 4.5, hwp: 0.35,
    traceability: 'lmu',
    fossil: 0.5, ag: 0, luc: 0, leased: 0, cdr: 0, cdrPrice: 300, claimants: 1,
  },
  {
    id: 'amazon',
    name: 'Amazon pasture, recently cleared',
    blurb: '1 Mha of cattle pasture on former forest: 8 Mt a year from the clearing still under way, 3 Mt of methane and nitrous oxide from the herd, and secondary regrowth on abandoned paddocks. No harvest.',
    scope: 'scope1',
    area: 1.0, ambient: 0.3, legacy: 0.6, mgmt: 0, harvest: 0, hwp: 0,
    traceability: 'lmu',
    fossil: 0.2, ag: 3, luc: 8, leased: 0, cdr: 0, cdrPrice: 300, claimants: 1,
  },
  {
    id: 'okoume',
    name: 'Gabon selective-logging concession',
    blurb: '1 Mha of old, largely intact forest logged at one or two trees a hectare: little legacy regrowth, slow ambient growth, a light harvest.',
    scope: 'scope1',
    area: 1.0, ambient: 1.2, legacy: 0.2, mgmt: 0.2, harvest: 1.5, hwp: 0.30,
    traceability: 'lmu',
    fossil: 0.1, ag: 0, luc: 0, leased: 0, cdr: 0, cdrPrice: 300, claimants: 1,
  },
  {
    id: 'boreal',
    name: 'Boreal forest under conservation lease',
    blurb: '2 Mha of unharvested Canadian boreal forest held by a data-centre operator with 10 Mt of fossil emissions and a durable-removals contract at $500/t. Nothing is produced; the forest only grows.',
    scope: 'scope1',
    area: 2.0, ambient: 1.5, legacy: 1.0, mgmt: 0, harvest: 0, hwp: 0,
    traceability: 'lmu',
    fossil: 10, ag: 0, luc: 0, leased: 0, cdr: 0.5, cdrPrice: 500, claimants: 1,
  },
];

/** The same land seen by its owner (scope 1) or by a downstream buyer of its output (scope 3). */
export function withRole(c: Company, scope: Scope): Company {
  return scope === 'scope1'
    ? { ...c, scope, traceability: 'lmu', claimants: 1 }
    : { ...c, scope, traceability: c.scope === 'scope3' ? c.traceability : 'region', claimants: c.scope === 'scope3' ? c.claimants : 2 };
}

export interface SliderSpec {
  key: keyof Company;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  group: 'forest' | 'other' | 'levers';
  note?: string;
}

export const SLIDERS: SliderSpec[] = [
  { key: 'area', label: 'Forest in the boundary', unit: 'Mha', min: 0, max: 5, step: 0.1, group: 'forest' },
  { key: 'ambient', label: 'Ambient growth', unit: 't CO₂/ha/yr', min: 0, max: 4, step: 0.1, group: 'forest', note: 'CO₂ fertilisation, nitrogen, a longer season. About 10 Gt/yr over the world’s forests, 2 to 3 t/ha.' },
  { key: 'legacy', label: 'Regrowth from past harvest', unit: 't CO₂/ha/yr', min: 0, max: 4, step: 0.1, group: 'forest', note: 'Stands cut or cleared before the base year, still filling in. High in the eastern US and Europe, near zero in conserved forest.' },
  { key: 'mgmt', label: 'Growth caused by management', unit: 't CO₂/ha/yr', min: 0, max: 3, step: 0.1, group: 'forest', note: 'What the company’s own management adds above a no-activity counterfactual.' },
  { key: 'harvest', label: 'Harvest', unit: 't CO₂/ha/yr', min: 0, max: 12, step: 0.1, group: 'forest', note: 'Carbon leaving the forest at harvest, roundwood plus slash and damage.' },
  { key: 'hwp', label: 'Stored in products after 100 years', unit: 'share', min: 0, max: 0.5, step: 0.05, group: 'forest' },
  { key: 'fossil', label: 'Fossil and industrial emissions', unit: 'Mt CO₂/yr', min: 0, max: 20, step: 0.1, group: 'other' },
  { key: 'ag', label: 'Agricultural CH₄ and N₂O', unit: 'Mt CO₂e/yr', min: 0, max: 30, step: 0.5, group: 'other' },
  { key: 'luc', label: 'Land-use change in the supply chain', unit: 'Mt CO₂/yr', min: 0, max: 20, step: 0.5, group: 'other' },
  { key: 'leased', label: 'Leased or acquired growing forest', unit: 'Mha', min: 0, max: 5, step: 0.1, group: 'levers', note: 'Unharvested forest already growing at the ambient and legacy rates above. No management.' },
  { key: 'cdr', label: 'Durable removals bought', unit: 'Mt/yr', min: 0, max: 10, step: 0.1, group: 'levers' },
  { key: 'cdrPrice', label: 'Durable removal price', unit: '$/t', min: 50, max: 1000, step: 50, group: 'levers' },
  { key: 'claimants', label: 'Claimants of the same scope 3 removal', unit: '', min: 1, max: 4, step: 1, group: 'levers', note: 'Supplier, mill, brand: each may report the same sourcing-region removal.' },
];

export const fmt = (v: number, d = 1) => {
  const s = Math.abs(v) < 0.05 ? '0' : v.toFixed(d);
  return s === '-0.0' ? '0.0' : s;
};
