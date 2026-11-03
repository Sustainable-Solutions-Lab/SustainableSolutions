/**
 * engine/schema.js
 *
 * The intervention definition: everything a user builds from the menus,
 * and everything an exported JSON file carries. Plain data, no functions,
 * so a definition can be saved, shared and loaded back.
 *
 * {
 *   id, name, description, notes,
 *   horizon:   { years, startYear },
 *   finance:   { discountRate, carbonPrice, discountCarbon },
 *   area: {
 *     layer,            hectares available per cell (e.g. cropland_ha)
 *     share,            fraction of that area treated (adoption), 0..1
 *     eligibility: [ { layer, min, max } ... ]   all must hold, else the cell is out
 *   },
 *   costs: [ CostComponent ],
 *   mitigation: [ MitigationComponent ],
 * }
 *
 * CostComponent {
 *   id, label, category,                 category: capital | operating | opportunity | mrv | transport | revenue | other
 *   basis,                               per_ha | per_t_material | per_tco2 | per_cell | per_project
 *   value,                               USD per unit of the basis (negative = a saving or revenue)
 *   quantity,                            rate spec for per_t_material: tonnes of material per ha
 *   modifiers: [ rate spec ],            dimensionless multipliers (country tables, layer scalings)
 *   timing,                              profile: when the cost occurs (constant | once | every | window | ...)
 *   escalation,                          real annual change in the unit cost (fraction/yr), default 0
 * }
 *
 * MitigationComponent {
 *   id, label, gas,                      gas: CO2 | N2O | CH4 (label only; rates are in t CO2e)
 *   sign,                                +1 mitigation, -1 an emission caused by the practice
 *   rate,                                rate spec: t CO2e per ha per year in the first year (or per pulse)
 *   profile,                             time profile of the rate
 *   leakage,                             fraction of the gross effect displaced elsewhere, default 0
 *   reversal,                            fraction of the accumulated stock lost per year, default 0
 * }
 */

export const COST_BASES = [
  { id: 'per_ha', label: 'per hectare', unit: '$/ha', hint: 'Scales with treated area each time it occurs' },
  { id: 'per_t_material', label: 'per tonne of material', unit: '$/t', hint: 'Treated area × application rate (t/ha)' },
  { id: 'per_tco2', label: 'per t CO₂e mitigated', unit: '$/t CO₂e', hint: 'Scales with the mitigation of that year (monitoring, verification, fees)' },
  { id: 'per_cell', label: 'fixed per grid cell', unit: '$', hint: 'Does not scale with area; each time it occurs' },
  { id: 'per_project', label: 'fixed for the whole deployment', unit: '$', hint: 'One total, shared across cells in proportion to treated area' },
]

export const COST_CATEGORIES = ['capital', 'operating', 'opportunity', 'mrv', 'transport', 'revenue', 'other']

export const GASES = ['CO2', 'N2O', 'CH4']

let seq = 0
export const newId = (prefix = 'c') => `${prefix}_${Date.now().toString(36)}_${(seq++).toString(36)}`

export function blankDefinition() {
  return {
    id: 'blank',
    name: 'New intervention',
    description: '',
    notes: '',
    horizon: { years: 30, startYear: 2026 },
    finance: { discountRate: 0.05, carbonPrice: 100, discountCarbon: false },
    area: { layer: 'cropland_ha', share: 1, eligibility: [{ layer: 'cropland_frac', min: 0.01 }] },
    costs: [],
    mitigation: [],
  }
}

export function blankCost(overrides = {}) {
  return {
    id: newId('cost'),
    label: 'New cost',
    category: 'operating',
    basis: 'per_ha',
    value: 0,
    quantity: null,
    modifiers: [],
    timing: { type: 'constant' },
    escalation: 0,
    ...overrides,
  }
}

export function blankMitigation(overrides = {}) {
  return {
    id: newId('mit'),
    label: 'New carbon effect',
    gas: 'CO2',
    sign: 1,
    rate: { type: 'constant', value: 1 },
    profile: { type: 'constant' },
    leakage: 0,
    reversal: 0,
    ...overrides,
  }
}

/** Fill a loaded definition's gaps with defaults so older files still run. */
export function normalizeDefinition(d) {
  const b = blankDefinition()
  const out = {
    ...b,
    ...d,
    horizon: { ...b.horizon, ...(d.horizon ?? {}) },
    finance: { ...b.finance, ...(d.finance ?? {}) },
    area: { ...b.area, ...(d.area ?? {}), eligibility: d.area?.eligibility ?? b.area.eligibility },
    costs: (d.costs ?? []).map((c) => ({ ...blankCost(), ...c, id: c.id ?? newId('cost') })),
    mitigation: (d.mitigation ?? []).map((m) => ({ ...blankMitigation(), ...m, id: m.id ?? newId('mit') })),
  }
  out.horizon.years = Math.max(1, Math.min(200, Math.round(Number(out.horizon.years) || 30)))
  return out
}

/** Problems a definition has against a set of available layers. */
export function validateDefinition(d, layerIds) {
  const has = (id) => layerIds.includes(id)
  const problems = []
  if (!has(d.area.layer)) problems.push(`Area layer "${d.area.layer}" is not loaded`)
  for (const e of d.area.eligibility ?? []) if (!has(e.layer)) problems.push(`Eligibility layer "${e.layer}" is not loaded`)
  const check = (spec, where) => {
    if (!spec || typeof spec === 'number') return
    if (spec.layer && !has(spec.layer)) problems.push(`${where} uses layer "${spec.layer}", which is not loaded`)
    for (const f of spec.factors ?? []) check(f, where)
    for (const f of spec.terms ?? []) check(f, where)
  }
  for (const c of d.costs) {
    check(c.quantity, `Cost "${c.label}"`)
    for (const m of c.modifiers ?? []) check(m, `Cost "${c.label}"`)
    if (c.basis === 'per_t_material' && !c.quantity) problems.push(`Cost "${c.label}" is per tonne of material but has no application rate`)
  }
  for (const m of d.mitigation) check(m.rate, `Carbon effect "${m.label}"`)
  if (d.mitigation.length === 0) problems.push('No carbon effect is defined, so cost per tonne is undefined')
  return problems
}
