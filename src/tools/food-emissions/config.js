/**
 * projects/food-emissions/config.js
 *
 * Configuration for: Food Emissions — greenhouse-gas emissions from managing
 * the world's croplands, by source, crop, and over time.
 *
 * Companion paper (in preparation): "Mapped drivers of global land-use
 * emissions 2000–2024" (in preparation) — an annual, corrected extension of
 * Cao et al. (2026, Nature Climate Change), merged with Cornerstone's
 * jurisdictional land-use-change framework.
 *
 * One canonical dataset (no variants): our updated Cao-lineage model
 * (IPCC 2019 reference rice parameters; updates coordinated with the
 * original authors) with drained-peatland occupation emissions at IPCC
 * Tier 1 rates by land use and climate zone (Gridded LM D17; the Cornerstone
 * 37.3 floor is kept as the peatv comparison view).
 *
 * Feature model (Gridded LM/pipeline/export_explorer_cells.py): 0.25-degree
 * cell centroids with per-source 2020 emissions (kt CO2e: fer man res rice
 * peat urea burn), the all-source total (tot), per-crop props for the top
 * twelve emitting crops (`tot_<crop>`, `<source>_<crop>`), plus cropland ha
 * and the m49 country code.
 *
 * UI model: ONE map. Source and Crop dropdowns pick what is shown; the
 * always-visible year bar at the bottom of the map picks when. Stored props
 * are the 2020 reference; other years multiply each source term by its
 * country's national trajectory (config.yearControl + national-trends.json,
 * computed in the paint expression — see _map/lib/year-factors.js). Compare
 * mode (checkbox in the year bar) shows the difference between two years on
 * a diverging palette.
 *
 * @type {import('../_map/contracts/project-config').ProjectConfig}
 */

// Rangeland colour cap, t CO2e/yr per 0.25° cell (set from the p95 of |rsoc|).
const RSOC_COLOR_MAX = 15000
// Global 2020 rangeland soil-carbon losses (Mt CO₂e/yr) under each LSRS
// scope reading, filled from the exporter's meta.json at each export.
const RANGELAND_SCOPE_TOTALS = {
  all: 196.5,
  cult: 38.1,
  gi: { 0: 194.8, 10: 191.0, 20: 190.4, 30: 188.6, 40: 184.1, 50: 175.4, 60: 163.4, 70: 152.2, 80: 137.1, 90: 117.1 },
}

// Forest soil colour cap, t CO2e/yr per 0.25° cell (p95 of fsoil).
const FSOIL_COLOR_MAX = 12000

// Forest soil split by who would own it under the GHG Protocol LSRS
// (Gridded LM D15). v1 of the standard covers CH4 and N2O on forest land
// (production emissions) but leaves forest-land CO2 to a forest decision
// the Independent Standards Board has not made (LSRS Box 1.1, Box 9.1).
// Colour caps are each layer's p95 per 0.25° cell, except the no-product
// layer (543 cells, all Southeast Asian), capped at its p90.
const FSOIL_OWNERS = {
  fsw1: {
    label: 'Forest soil → wood products · LSRS v1 (CH₄ + N₂O)',
    menu: 'Forest soil → wood products, v1 rule (CH₄ + N₂O · map only)',
    cat: 'cat3',
    colorMax: 3000,
    note: 'Methane and nitrous oxide from drained peat under forest that produces wood: drained managed forest in 22 Annex I countries (8 Mt CO₂e/yr, as they report it) and acacia pulpwood on peat in Sumatra, Borneo and Peninsular Malaysia (3 Mt, IPCC Tier 1). About 11 Mt CO₂e/yr. Version 1 of the GHG Protocol Land Sector and Removals Standard does cover these: CH₄ and N₂O from activities on forest land are land management production emissions, so a company sourcing the timber, pulp or paper reports them. Annex I drained forest is taken to be managed for wood, as national inventories treat it. Not counted in any food total.',
    description: 'Drained forest peat CH₄ + N₂O that LSRS v1 allocates to the wood products sourced from that forest.',
  },
  fswp: {
    label: 'Forest soil → wood products · pending LSRS forest decision (CO₂)',
    menu: 'Forest soil → wood products, pending forest decision (CO₂ · map only)',
    cat: 'cat2',
    colorMax: FSOIL_COLOR_MAX,
    note: 'Carbon dioxide from the same drained wood-producing forest: Annex I drained managed forest (30 Mt CO₂/yr, as reported) and acacia pulpwood on peat in Southeast Asia (86 Mt, IPCC Tier 1, including dissolved organic carbon). About 116 Mt CO₂/yr. ALLOCATION PENDING: these would go to the timber, pulp and paper sourced from the forest, but version 1 of the GHG Protocol Land Sector and Removals Standard does not apply to forestry. Its Independent Standards Board has not decided how companies account for CO₂ on forest land, and a request for information on forest carbon accounting is due in 2026 (LSRS Box 1.1, Box 9.1). The clearing of natural peat-swamp forest for acacia within the last 20 years is a separate land-use change charge, covered in v1, and is not part of this layer. Not counted in any food total.',
    description: 'Drained forest peat CO₂ that would go to wood products once the LSRS forest decision is made.',
  },
  fsnp: {
    label: 'Forest soil → no product (not allocated)',
    menu: 'Forest soil → no product, not allocated (map only)',
    cat: 'cat2',
    colorMax: 400000,
    note: 'Drained peat under degraded peat-swamp forest and secondary forest or shrub in Sumatra, Borneo and Peninsular Malaysia (2015 areas, Miettinen et al. 2017; IPCC Tier 1, all gases). About 83 Mt CO₂e/yr. This land produces nothing a company sources, so no rule in the GHG Protocol Land Sector and Removals Standard assigns it to a product; it appears only in national inventories. Much of it is drained by canals dug for neighbouring oil palm and acacia, but the standard has no rule that makes a plantation responsible for peat its drainage dries out next door. Its one route, Requirement 7 (non-productive land inside a plantation boundary), is optional, aimed at buffer strips and set-asides, and cannot be implemented until the forest decision is made (LSRS Box 5.1). Some degraded peat-swamp forest may still be logged for timber, which would move that share to wood products. Colour scale tops out at 400,000 t per cell. Not counted in any total.',
    description: 'Drained forest peat with no product to allocate it to under the LSRS.',
  },
}

const YEARS = Array.from({ length: 25 }, (_, i) => 2000 + i)

// Sources: [id, label, 2020 domain max kt/cell]. The id is the tile prop.
// Ordered roughly largest-first in the dropdown. The last three are
// livestock (interim FAOSTAT-GLE model; no per-crop attribution — a
// specific crop plus a livestock source renders an empty map).
const SOURCES = [
  ['ent', 'Enteric CH₄', 60],
  ['rice', 'Rice CH₄', 120],
  ['prp', 'Pasture manure N₂O', 30],
  ['fer', 'Fertilizer N₂O', 40],
  ['peat', 'Peatland', 150],
  ['mms', 'Manure management CH₄+N₂O', 12],
  ['man', 'Manure applied N₂O', 10],
  ['res', 'Residues N₂O', 6],
  ['urea', 'Urea CO₂', 10],
  ['lime', 'Liming CO₂', 6],
  ['burn', 'Residue burning', 2],
  // Tier 2 SOC losses on stable cropland (gains are view-only, never
  // netted). No annual trend series: year scaling holds it constant.
  // Labeled by land use: the forest soil-carbon layer sits under LSRS
  // cat. 2 as a map-only view (not a SOURCES entry, so no total) - the
  // Standard treats them inside categories 1/2, not as a category of
  // their own, so the differentiation lives here in Specific sources.
  ['soil', 'Soil carbon CO₂ — cropland', 20],
  // Rangeland SOC (Ren et al. 2024 response refit on 78 of his 84
  // covariates, Gridded LM v6). 2020 LOSSES count, gains display only, as
  // for cropland soil. Varies by year through national gross-loss series.
  // Not attributed to livestock commodities yet.
  ['rsoil', 'Soil carbon CO₂ — rangeland', 60],
]
const SOURCE_IDS = SOURCES.map(([id]) => id)

// GHG Protocol LSRS accounting subcategories (terms verified against the
// Land Sector and Removals Standard and Guidance v1.0, June 2026):
//   1 "land use change emissions"                 - not in this dataset
//                                                   (jdLUC, in development)
//   2 "land management net biogenic CO2 emissions" - stock changes on
//     managed land: SOC losses (soil) AND drained organic soils (peat)
//   3 "land management production emissions"       - the non-CO2 gases
//     plus non-biogenic input CO2 (urea, lime)
// Category 4-style removals are out of scope: the LSRS requires
// field-measured evidence. Requirement 32 obliges factor providers to
// keep subcategories separable - which these groupings implement.
const LSRS_CAT2_IDS = ['peat', 'soil', 'rsoil']
const LSRS_CAT3_IDS = ['fer', 'man', 'res', 'rice', 'urea', 'lime', 'burn', 'ent', 'mms', 'prp']
// Cropland sources only — these carry per-crop props (`<src>_<crop>`).
const CROPLAND_SOURCE_IDS = ['fer', 'man', 'res', 'rice', 'peat', 'urea', 'burn', 'soil']

// Per-crop props exported for the top-emitting crops (exporter TOP_CROPS,
// 81% of the global total). Prop naming: `tot_<crop>`, `<source>_<crop>`.
// Livestock commodity groups (pipeline COMMODITY_GROUPS): emissions from
// the group's enteric / manure-management / pasture pathways; production =
// the group's primary products (milk, carcass meat, eggs).
const LIVESTOCK_COMMODITIES = [
  ['dcat', 'Milk (dairy cattle)'],
  ['bcat', 'Beef cattle'],
  ['buff', 'Buffalo'],
  ['shee', 'Sheep'],
  ['goat', 'Goats'],
  ['pigs', 'Pigs'],
  ['poul', 'Poultry & eggs'],
  ['olvs', 'Other livestock'],
]
const LIVESTOCK_SOURCE_IDS = ['ent', 'mms', 'prp']

const CROPS = [
  ['rice', 'Rice'],
  ['whea', 'Wheat'],
  ['maiz', 'Maize (corn)'],
  ['soyb', 'Soybean'],
  ['oilp', 'Oil palm'],
  ['sugc', 'Sugarcane'],
  ['cott', 'Cotton'],
  ['grou', 'Groundnut'],
  ['barl', 'Barley'],
  ['rape', 'Rapeseed'],
  ['pota', 'Potato'],
  ['sorg', 'Sorghum'],
  // EUDR-sensitive commodities + food-security staples: smaller emitters,
  // exposed because supply-chain users need them selectable.
  ['coco', 'Cocoa'],
  ['coff', 'Coffee (arabica)'],
  ['rcof', 'Coffee (robusta)'],
  ['rubb', 'Rubber'],
  ['cass', 'Cassava'],
  ['bean', 'Beans'],
]

// One variable per source × crop cell of the selection grid. `yearTerms`
// lists the reference-year props (with their source for factor lookup) that
// sum to the variable — the year bar scales each term by its national
// trajectory, so every combination animates and compares without per-year
// tile props.
function makeVariable({ source, crop }) {
  const cropSuffix = crop === 'all' ? '' : `_${crop}`
  const lv = LIVESTOCK_COMMODITIES.find(([c]) => c === crop)
  const cropLabel = crop === 'all' ? null : (lv ? lv[1] : CROPS.find(([c]) => c === crop)[1])
  const isLivestock = Boolean(lv)
  const shared = {
    unit: 'kt CO₂e',
    colormap: 'SpectralHotDeep',
    diverging: false,
    alphaFloor: 0.02,
    alphaPower: 0.35,
    // Colour tops out at the 96th percentile rather than the 99th, so the
    // high end saturates a little and the middle of the ramp reads stronger.
    colorPercentile: 0.96,
    layer: 'map',
    dimensionValues: { source, crop },
  }
  // Forest carbon pilot (research preview; 44 US states, France, Spain; live AG; not in
  // any total): the two GHG Protocol accounting options as separate signed
  // views. fmlp = managed-land-proxy net stock change; fab = activity-based
  // (harvest-attributed only). Commodity dropdown does not apply.
  if (source === 'fmlp' || source === 'fab') {
    const isMlp = source === 'fmlp'
    return {
      ...shared,
      id: source,
      label: isMlp ? 'Forest carbon — net stock change (opt. 1)' : 'Forest carbon — activity-based (opt. 2)',
      unit: 't CO₂e/yr',
      colormap: 'RdBu',
      diverging: true,
      domain: { min: -300000, max: 300000, zero: 0 },
      colorMax: isMlp ? 120000 : 60000,
      colorMin: isMlp ? -120000 : -60000,
      alphaFloor: 0.05,
      alphaPower: 0.3,
      yearTerms: [{ prop: source, src: source }],
      constantInTime: true,
      // The region panel decomposes land-management emissions (by source,
      // by commodity, emission factors). Forest vegetation carbon is a
      // different quantity, so it declares what its own panel says and
      // gets none of theirs (_map/components/map/region-stats.jsx).
      detail: {
        label: 'Forest carbon pilot',
        rows: [
          { prop: 'fmlp', label: 'Net stock change (opt. 1)' },
          { prop: 'fab', label: 'Management-attributable (opt. 2)' },
        ],
        // Which national inventory the region's plots came from, keyed by
        // the unit tiles' country name.
        sources: {
          'United States of America': 'USDA Forest Inventory & Analysis',
          France: 'IGN Inventaire forestier national',
          Spain: 'Inventario Forestal Nacional',
        },
      },
      note: isMlp
        ? 'Pilot (44 US states, France, Spain): net live-aboveground carbon change on forestland from ~334,000 paired national-inventory re-measurements (USDA FIA, French IGN, Spanish IFN) — the managed-land-proxy accounting option. Red = net loss, blue = net removal. Research preview pending the LSRS forestry standard; not counted in any total.'
        : 'Pilot (44 US states, France, Spain): carbon flux attributable to forest management — the activity-based accounting option: observed flux on managed stands minus a matched counterfactual with no management, so ambient regrowth and CO₂ fertilization drop out. Management is identified from each inventory\u2019s own records of felling and stand treatment. Red = attributable emissions, blue = attributable gain. Research preview pending the LSRS forestry standard; not counted in any total.',
      description: 'Inventory-measured forest carbon flux (US FIA, French IGN, Spanish IFN), mean of recent re-measurement periods.',
    }
  }
  // Forest soil (Gridded LM cat2 plan steps 1-2): forest remaining forest.
  // Mineral soil follows the IPCC default (steady state, zero absent a
  // management change), so the layer is drained forest organic soil only,
  // as Annex I parties report it (CRF 4.A.1 + table 4(II)), plus IPCC Tier 1
  // for insular Southeast Asia (Gridded LM build_forest_soil_tropical.py). Map only, not
  // in any total: forest land is not a food commodity's land.
  // Cropland peat at the Cornerstone 37.3 floor: the same hectares as the
  // peat source, which since Gridded LM D17 uses IPCC rates by land use.
  // Map-only comparison, not in any total (D4: one canonical dataset).
  if (source === 'peatv') {
    return {
      ...shared,
      id: 'peatv',
      label: 'Peatland — single 37.3 rate (comparison)',
      domain: { min: 0, max: 150 },
      yearTerms: [{ prop: 'peatv', src: 'peatv' }],
      constantInTime: true,
      note: 'The same drained cropland hectares as the Peatland source, at the single rate of 37.3 t CO₂e/ha/yr the dataset used before October 2026 (the Cornerstone occupation floor). That rate is IPCC’s temperate cropland value, so outside the tropics this view matches the Peatland source; in the tropics it is about a quarter lower, because the Peatland source now uses IPCC’s tropical rates by land use (oil palm 45, tree crops 60, other cropland 58, paddy rice 39). Global cropland peat: 802 Mt CO₂e/yr here against 951 in the Peatland source. 2020; does not vary with the year slider. A comparison only, not counted in any total.',
      description: 'Drained cropland peat at the single 37.3 t CO₂e/ha/yr rate, kt CO₂e per quarter-degree cell (comparison, not in totals).',
    }
  }
  if (FSOIL_OWNERS[source]) {
    const o = FSOIL_OWNERS[source]
    return {
      ...shared,
      id: source,
      label: o.label,
      unit: 't CO₂e/yr',
      domain: { min: 0, max: o.colorMax },
      yearTerms: [{ prop: source, src: source }],
      constantInTime: true,
      note: `${o.note} Does not vary with the year slider.`,
      description: o.description,
    }
  }
  if (source === 'fsoil') {
    return {
      ...shared,
      id: 'fsoil',
      label: 'Soil carbon — forest (drained organic soil, all owners)',
      unit: 't CO₂e/yr',
      domain: { min: 0, max: FSOIL_COLOR_MAX },
      yearTerms: [{ prop: 'fsoil', src: 'fsoil' }],
      constantInTime: true,
      note: 'Forest remaining forest. Mineral forest soil is held at the IPCC default of steady state (no flux absent a management change), which national inventories support: Annex I parties report a net mineral-soil gain of +0.03 t C/ha/yr across 1,665 Mha. What remains is drained organic (peat) soil under forest: CO₂, CH₄ and N₂O as 22 Annex I parties report it, 2020 (38 Mt CO₂e/yr), placed on forest over PEATMAP peat. Non-Annex I countries report no drained forest area, so Sumatra, Borneo and Peninsular Malaysia add an IPCC Tier 1 estimate: 2015 areas of degraded peat-swamp forest, secondary forest and acacia pulpwood on peat (Miettinen et al. 2017), about 170 Mt CO₂e/yr. Three views under Specific sources split this layer by who would own it under the GHG Protocol LSRS: wood products under the v1 rule (CH₄ + N₂O, about 11 Mt), wood products pending the standard\u2019s forest decision (CO₂, about 116 Mt), and no product (about 83 Mt). The colour scale tops out at 12,000 t per cell so the Annex I pattern stays readable; most Southeast Asian cells exceed it, many by 10 to 100 times. Does not vary with the year slider; not counted in any total.',
      description: 'Drained forest organic-soil emissions: national inventories (Annex I, 2020) and IPCC Tier 1 for insular Southeast Asia (2015 areas).',
    }
  }
  if (source === 'all' || source === 'cat2' || source === 'cat3') {
    const base = crop === 'all' ? SOURCE_IDS
      : isLivestock ? LIVESTOCK_SOURCE_IDS : CROPLAND_SOURCE_IDS
    const termSources = source === 'cat2' ? base.filter((x) => LSRS_CAT2_IDS.includes(x))
      : source === 'cat3' ? base.filter((x) => LSRS_CAT3_IDS.includes(x))
      : base
    const catLabel = source === 'cat2' ? 'Land management net biogenic CO₂ (LSRS cat. 2)'
      : source === 'cat3' ? 'Land management production (LSRS cat. 3)' : null
    return {
      ...shared,
      id: source === 'all' ? `tot${cropSuffix}` : `${source}${cropSuffix}`,
      label: catLabel
        ? (cropLabel ? `${catLabel} — ${cropLabel}` : catLabel)
        : (cropLabel ? `Total emissions — ${cropLabel}` : 'Total emissions'),
      domain: { min: 0, max: (source === 'cat2' ? 160 : crop === 'all' ? 250 : isLivestock ? 60 : 120) },
      yearTerms: termSources
        .map((s) => ({ prop: `${s}${cropSuffix}`, src: s })),
      ...(source !== 'all'
        ? { hasAny: termSources.map((s) => `${s}${cropSuffix}`) }
        : {}),
      description: cropLabel
        ? `All-source emissions attributed to ${cropLabel.toLowerCase()} per quarter-degree cell.`
        : 'All-source cropland-management emissions per quarter-degree cell.',
    }
  }
  const [, srcLabel, srcMax] = SOURCES.find(([s]) => s === source)
  const timeConstant = source === 'soil' ? { constantInTime: true,
    note: 'Mean annual rate, 2000–2023 (attributed losses only); does not vary with the year slider.' } : {}
  // Soil carbon, all commodities: the signed net view. Losses (red) are
  // counted in totals and factors; gains (blue) are displayed only - the
  // LSRS requires field evidence before removals count, so increases
  // never reduce the total. Per-commodity soil views keep the counted
  // losses only (gains are not attributable to crops).
  if (source === 'soil' && crop === 'all') {
    return {
      ...shared,
      id: 'soc',
      label: 'Soil carbon Δ',
      unit: 't CO₂e/yr',
      colormap: 'RdBu',
      diverging: true,
      domain: { min: -2000, max: 2000, zero: 0 },
      // Cap the ramp well below the long gain tail (p99 ~7 kt/cell) so
      // typical cells are visible; alpha rises fast from zero.
      colorMax: 1500,
      colorMin: -1500,
      alphaFloor: 0.05,
      alphaPower: 0.3,
      yearTerms: [{ prop: 'soc', src: 'soil' }],
      // Piecewise year machinery: the tiles carry three period rates
      // (soc1/soc2/soc3); a year shows its period's annual rate, compare
      // integrates them into the cumulative change over the span.
      segments: { knots: [2000, 2008, 2016, 2023], props: ['soc1', 'soc2', 'soc3'] },
      note: 'Annual rate for the selected year (three model periods: 2000–08, 2008–16, 2016–23). Red cells (soil carbon loss) count in the emissions total; blue cells (gain) are shown for context but are not credited against it. Compare shows the cumulative change between the selected years.',
      description: 'Net annual change in mineral-soil carbon on stable cropland, 2000–2023 mean.',
    }
  }
  // Rangeland soil carbon, all commodities: the signed net view, mirroring
  // cropland soil. Tiles carry the 2001-22 mean (rsoc) and four period
  // rates (rsoc1..4), positive = gain.
  if (source === 'rsoil' && crop === 'all') {
    return {
      ...shared,
      id: 'rsoc',
      label: 'Rangeland soil carbon Δ',
      unit: 't CO₂e/yr',
      colormap: 'RdBu',
      diverging: true,
      domain: { min: -60000, max: 60000, zero: 0 },
      colorMax: RSOC_COLOR_MAX,
      colorMin: -RSOC_COLOR_MAX,
      alphaFloor: 0.05,
      alphaPower: 0.3,
      yearTerms: [{ prop: 'rsoc', src: 'rsoil' }],
      segments: { knots: [2000, 2005, 2010, 2015, 2022], props: ['rsoc1', 'rsoc2', 'rsoc3', 'rsoc4'] },
      note: 'Preliminary. Annual rate for the selected year (period means 2001–05, 2006–10, 2011–15, 2016–22), from the Ren et al. (2024) grazing–soil-carbon response driven by a 2000–2022 grazing-intensity history. Red cells (soil carbon loss) count in the emissions total; blue cells (gain) are shown for context but are not credited against it. Compare shows the cumulative change between the selected years.',
      description: 'Net annual change in rangeland soil carbon (0–30 cm) from changing grazing intensity, 2001–2022.',
    }
  }
  return {
    ...shared,
    id: `${source}${cropSuffix}`,
    label: cropLabel ? `${srcLabel} — ${cropLabel}` : srcLabel,
    domain: { min: 0, max: crop === 'all' ? srcMax : Math.max(1, srcMax / 2) },
    yearTerms: [{ prop: `${source}${cropSuffix}`, src: source }],
    ...timeConstant,
    description: cropLabel
      ? `${srcLabel} emissions attributed to ${cropLabel.toLowerCase()} per quarter-degree cell.`
      : `${srcLabel} emissions per quarter-degree cell.`,
  }
}

const config = {
  id: 'food-emissions',
  mapControls: false,
  eyebrow: 'INTERACTIVE MAP',
  title: 'Gridded land sector emissions',
  summary:
    'Commodity- and source-specific maps of greenhouse-gas emissions from land, compliant with the GHG Protocol Land Sector and Removals Standard (LSRS).',
  description:
    'Where do food-system greenhouse-gas emissions come from, and how is that changing? This tool works toward a complete, spatially explicit, commodity-specific accounting of emissions from land use and land management — mapped where they happen, traced to what is grown, and followed through time. Today it covers the management of the world’s croplands — synthetic fertilizer and applied manure N₂O, rice paddy CH₄, cultivated drained peatland, crop residues, and residue burning — for 46 crops on a quarter-degree grid, for any year 2000–2024, plus direct livestock emissions (enteric CH₄, manure-management CH₄ and N₂O, manure deposited on pasture), CO₂ from agricultural liming, and a preliminary estimate of soil-carbon loss on grazed rangeland. Cropland emissions follow our updated implementation of Cao et al. (2026), developed in coordination with the original authors, with drained-peatland emissions from the Cornerstone steady-state model; livestock currently distributes FAO national series across gridded animal densities, to be upgraded with forthcoming spatially explicit livestock data. Land-use-change emissions join next, through the Cornerstone jurisdictional framework.',

  region: {
    // Default load centered on the mid-Atlantic: Americas on the left,
    // Europe/Africa on the right, both fully in frame on wide screens.
    center: [-30, 21.5],
    zoom: 1.6,
    // Phones start closer, still Cuba-centered: southern US above,
    // Caribbean and northern South America below.
    mobileCenter: [-79.5, 24],
    mobileZoom: 2.35,
    minZoom: 1.2,
    maxZoom: 6,
    // Share of the viewport that may sit below the southern cut, so Tierra
    // del Fuego and the Falklands clear the year bar (map/index.jsx).
    southSlack: 0.13,
    // Camera band, in real latitudes (data span -51.9 to 68.4). North is
    // hard-locked at 79°N, enough to show the Arctic islands; the land layer
    // drops Antarctica, so the southern slack shows only ocean.
    latBounds: [-56, 79],
    // Equal Earth: every layer is stored pre-projected
    // (scripts/equal-earth-geojson.mjs) and the camera, clicks and area tool
    // convert through _map/lib/equal-earth.js.
    projection: 'equalEarth',
    useCaliforniaOverlay: false,
    useWorldOverlay: true,
    // Subtle national + admin-1 reference lines (Natural Earth 10m).
    boundariesUrl: 'https://pub-4152429430274d988725593fd52db3ae.r2.dev/food-emissions/boundaries-ee.pmtiles',
    // Natural Earth 1:10m land (public domain), tippecanoe z0-8, layer 'land'.
    // Both are reprojected to Equal Earth before tiling (the -ee files).
    landUrl: 'https://pub-4152429430274d988725593fd52db3ae.r2.dev/food-emissions/land10m-ee.pmtiles',
  },

  // ── Layers ───────────────────────────────────────────────────────────────
  // A single map: what is shown = Source × Crop dropdowns; when = year bar.
  layers: [
    {
      id: 'map',
      label: 'Emissions',
      description: 'Cropland-management emissions per quarter-degree cell.',
      dimensionIds: ['source', 'crop', 'year', 'yearB', 'compare'],
    },
  ],

  // ── Dimensions ───────────────────────────────────────────────────────────
  // `location: 'map'` keeps a dimension out of the sidebar — the year bar
  // at the bottom of the map renders it instead.
  dimensions: [
    {
      // Rendered as two selects in the sidebar (Source category + Specific
      // sources) — both write this one dimension. 'all'/'cat2'/'cat3' are
      // category values; the rest are specific sources.
      id: 'source',
      label: 'Specific sources',
      type: 'dropdown',
      defaultValue: 'all',
      options: [
        { id: 'all', label: 'All sources' },
        { id: 'cat2', label: 'Land management net biogenic CO₂ (LSRS cat. 2)' },
        { id: 'cat3', label: 'Land management production (LSRS cat. 3)' },
        // Forest soil (drained organic soil from national inventories;
        // mineral = 0, IPCC default; map only, not in totals) sits with the
        // other soil carbon sources, right after rangeland.
        ...SOURCES.flatMap(([id, label]) => id === 'peat'
          ? [{ id, label }, { id: 'peatv', label: 'Peatland — single 37.3 rate (comparison · map only)', cat: 'cat2' }]
          : id === 'rsoil'
          ? [{ id, label }, { id: 'fsoil', label: 'Soil carbon — forest (drained organic, all owners · map only)', cat: 'cat2' },
            ...Object.entries(FSOIL_OWNERS).map(([oid, o]) => ({ id: oid, label: o.menu, cat: o.cat }))]
          : [{ id, label }]),
        // Forest carbon pilot: the two GHG Protocol accounting options as
        // selectable signed views (research preview, not in totals).
        { id: 'fmlp', label: 'Forest carbon — net stock change (opt. 1 · pilot)', cat: 'cat2' },
        { id: 'fab', label: 'Forest carbon — management-attributable (opt. 2 · pilot)', cat: 'cat2' },
      ],
    },
    {
      id: 'crop',
      label: 'Commodity',
      type: 'dropdown',
      defaultValue: 'all',
      options: [
        { id: 'all', label: 'All commodities' },
        ...CROPS.map(([id, label]) => ({ id, label })),
        ...LIVESTOCK_COMMODITIES.map(([id, label]) => ({ id, label })),
        { id: 'feed', label: 'Crops grown for feed' },
      ],
    },
    {
      id: 'year',
      label: 'Year',
      type: 'slider',
      animate: true,
      location: 'map',
      defaultValue: '2024',
      options: YEARS.map((y) => ({ id: String(y), label: String(y) })),
    },
    {
      id: 'yearB',
      label: 'From year',
      type: 'slider',
      location: 'map',
      defaultValue: '2000',
      options: YEARS.map((y) => ({ id: String(y), label: String(y) })),
    },
    {
      id: 'compare',
      label: 'Compare years',
      type: 'toggle',
      location: 'map',
      defaultValue: 'off',
      options: [
        { id: 'off', label: 'Off' },
        { id: 'on', label: 'On' },
      ],
    },
  ],

  // ── Year scaling (the year bar + national trajectory factors) ────────────
  yearControl: {
    dimensionId: 'year',
    yearBDimensionId: 'yearB',
    compareDimensionId: 'compare',
    referenceYear: 2020,
    trendsUrl: '/tools/food-emissions/national-trends.json',
    compareColormap: 'SpectralR',
  },

  // ── Variables ────────────────────────────────────────────────────────────
  // ── Enhanced masks ──────────────────────────────────────────────────────
  // SPAM 2020 is always the default allocation. Each entry here is a
  // finer, core-track (open + redistributable) dataset the user can
  // toggle on; the tiles carry sparse `<prop><suffix>` overrides where
  // the reallocation differs, and every read falls back to SPAM.
  // LSRS grassland scope for rangeland soil carbon (Gridded LM cat2 plan,
  // 2026-10-17): the reader decides which grazing land counts. Cells carry
  // gc / gn / gi (export_explorer_cells.py); lib/rangeland-scope.js applies
  // the share to the rangeland term wherever it appears. Totals are the
  // exporter's global 2020 losses under each reading, from the same 0.25°
  // props the map uses (meta.json rangeland_scope_MtCO2e_2020).
  rangelandScope: {
    modeDimensionId: 'rscope',
    thresholdDimensionId: 'rgi',
    defaultThreshold: 50,
    thresholdMin: 0,
    thresholdMax: 90,
    thresholdStep: 10,
    sources: ['rsoil'],
    variableIds: ['rsoc'],
    showForSources: ['rsoil', 'all', 'cat2'],
    totals: RANGELAND_SCOPE_TOTALS,
  },
  enhancedMasks: [
    {
      id: 'descals-palm',
      label: 'Oil palm \u2014 satellite-mapped at 10 m (Descals et al. 2024)',
      suffix: '__dsc',
      note: 'Reallocates each country\u2019s palm-attributed emissions and production to the mapped 10 m extent (industrial + smallholder). National totals unchanged.',
    },
    {
      id: 'usda-cdl',
      label: 'United States \u2014 USDA Cropland Data Layer (30 m)',
      suffix: '__cdl',
      note: 'Places US maize, soybean, wheat, cotton, rice, sorghum, barley, canola, potatoes, beans, peanuts, and sugarcane where the 2023 CDL maps them. US totals unchanged.',
    },
    {
      id: 'mapbiomas',
      label: 'Brazil \u2014 MapBiomas collection 9 (30 m)',
      suffix: '__mb',
      note: 'Places Brazilian soybean, sugarcane, rice, coffee, and cotton where MapBiomas 2023 maps them. Brazilian totals unchanged.',
    },
    {
      id: 'aafc-aci',
      label: 'Canada \u2014 AAFC Annual Crop Inventory (30 m)',
      suffix: '__aci',
      note: 'Places Canadian wheat, canola, barley, maize, soybean, beans, potatoes, and sorghum where the 2023 ACI maps them. Canadian totals unchanged.',
    },
    {
      id: 'eucropmap',
      label: 'European Union \u2014 JRC EUCROPMAP (10 m)',
      suffix: '__eu',
      note: 'Places EU wheat, barley, maize, rice, potatoes, rapeseed, and soybean where EUCROPMAP 2022 maps them. National totals unchanged.',
    },
    {
      id: 'wang-rubber',
      label: 'Rubber — satellite-mapped at 10 m (Wang et al. 2023)',
      suffix: '__wng',
      note: 'Places Southeast Asian rubber, about nine tenths of world production, where 10 m imagery maps it. The mapped extent reproduces the published 14.2 Mha. National totals unchanged.',
    },
    {
      id: 'trase-cocoa',
      label: 'Cocoa \u2014 Ghana & C\u00f4te d\u2019Ivoire district totals (Kalischek et al. 2023 via Trase)',
      suffix: '__trs',
      note: 'Constrains cocoa to the district totals Trase derives from the Kalischek 10 m map, with the FDaP layer as the within-district weight. Ghana\u2019s national cocoa area follows Kalischek (2.71 Mha) rather than FAOSTAT (1.49 Mha); production is unchanged, so per-tonne intensities rise. C\u00f4te d\u2019Ivoire totals unchanged.',
    },
    {
      id: 'fdap',
      label: 'Cocoa & coffee — AI-mapped at 10 m (Forest Data Partnership 2026)',
      suffix: '__fdp',
      note: 'Places cocoa and coffee (arabica + robusta) where the Forest Data Partnership 2026a models map them, produced by Google for the Forest Data Partnership. Model probabilities are read as fractional cover with FAOSTAT-calibrated floors. National totals unchanged.',
    },
  ],

  // Labels follow the LSRS terms verbatim (minus the trailing "emissions"
  // for dropdown width): the Standard's subcategory names both start with
  // "land management", which the UI must preserve.
  lsrsCategories: {
    cat2: { ids: LSRS_CAT2_IDS, label: 'Land management net biogenic CO₂', term: 'land management net biogenic CO2 emissions' },
    cat3: { ids: LSRS_CAT3_IDS, label: 'Land management production', term: 'land management production emissions' },
  },

  variables: [
    // Feed attribution: the share of cropland emissions grown to feed
    // animals, on the land where the crop grows. A subset of the cropland
    // sources rather than an addend, so it is a commodity-style filter and
    // is only offered with All sources. Year scaling rides the fertilizer
    // trajectory as a proxy for the cropland mix behind it.
    {
      id: 'feed',
      label: 'Crops grown for feed',
      unit: 'kt CO₂e',
      colormap: 'SpectralHotDeep',
      diverging: false,
      domain: { min: 0, max: 60 },
      alphaFloor: 0.02,
      alphaPower: 0.35,
      colorPercentile: 0.96,
      layer: 'map',
      dimensionValues: { source: 'all', crop: 'feed' },
      yearTerms: [{ prop: 'feed', src: 'fer' }],
      description:
        'Cropland emissions attributable to animal feed, located where the feed is grown.',
    },
    makeVariable({ source: 'all', crop: 'all' }),
    makeVariable({ source: 'cat2', crop: 'all' }),
    ...CROPS.map(([crop]) => makeVariable({ source: 'cat2', crop })),
    makeVariable({ source: 'cat3', crop: 'all' }),
    ...CROPS.map(([crop]) => makeVariable({ source: 'cat3', crop })),
    ...LIVESTOCK_COMMODITIES.map(([crop]) => makeVariable({ source: 'cat3', crop })),
    ...CROPS.map(([crop]) => makeVariable({ source: 'all', crop })),
    ...LIVESTOCK_COMMODITIES.map(([crop]) => makeVariable({ source: 'all', crop })),
    ...SOURCES.flatMap(([source]) => [
      makeVariable({ source, crop: 'all' }),
      ...CROPS.map(([crop]) => makeVariable({ source, crop })),
      ...LIVESTOCK_COMMODITIES.map(([crop]) => makeVariable({ source, crop })),
    ]),
    // Forest pilot and forest soil views ignore the commodity dropdown: alias every crop
    // selection to the same signed layer so no source x crop combination
    // is left without a variable.
    ...['fmlp', 'fab', 'fsoil', 'peatv', ...Object.keys(FSOIL_OWNERS)].flatMap((source) => [
      makeVariable({ source, crop: 'all' }),
      ...[...CROPS, ...LIVESTOCK_COMMODITIES, ['feed']].map(([crop]) => ({
        ...makeVariable({ source, crop: 'all' }),
        dimensionValues: { source, crop },
      })),
    ]),
  ],

  percentileFilter: {
    enabled: true,
    defaultLow: 0,
    defaultHigh: 100,
  },

  // ── Area tool ────────────────────────────────────────────────────────────
  areaTool: {
    enabled: true,
    // PALE drivers panel (Hong et al. 2021 identity): LMDI decomposition
    // of the drawn region's 2000-2023 emissions change into population,
    // production per capita, land per kcal, and emissions per land.
    pale: true,
    defaultRadiusKm: 250,
    maxRadiusKm: 1500,
    aggregateVariableIds: ['tot', 'ent', 'rice', 'prp', 'fer', 'peat', 'rsoil', 'mms', 'man', 'res', 'urea', 'lime', 'burn'],
    // Region emission factors: per-crop production props (p_<crop>) and
    // cropland-source props summed inside the circle -> kg CO2e per kg.
    ef: {
      entries: [
        ...CROPS.map(([id]) => ({ id, sources: CROPLAND_SOURCE_IDS })),
        ...LIVESTOCK_COMMODITIES.map(([id]) => ({ id, sources: LIVESTOCK_SOURCE_IDS })),
      ],
    },
    // Trend chart (stats-panel.jsx): the drawn area's 2000-2024 trajectory,
    // composed from national per-source series weighted by emissions inside
    // the circle. Fixed categorical order; adjacent-pair CVD-validated.
    trend: {
      url: '/tools/food-emissions/national-trends.json',
      // Spectral picks (the lab's signature palette), ordered so adjacent
      // bands in the stack stay distinguishable.
      sources: [
        { id: 'ent',  prop: 'ent',  label: 'Enteric CH₄',  color: '#F46D43' },
        { id: 'rice', prop: 'rice', label: 'Rice CH₄',     color: '#D53E4F' },
        { id: 'prp',  prop: 'prp',  label: 'Pasture N₂O',  color: '#FEE08B' },
        { id: 'fer',  prop: 'fer',  label: 'Fertilizer',   color: '#3288BD' },
        { id: 'peat', prop: 'peat', label: 'Peat',         color: '#5E4FA2' },
        { id: 'rsoil', prop: 'rsoil', label: 'Rangeland soil C', color: '#C4A57B' },
        { id: 'mms',  prop: 'mms',  label: 'Manure mgmt',  color: '#E6F598' },
        { id: 'man',  prop: 'man',  label: 'Manure appl.', color: '#FDAE61' },
        { id: 'res',  prop: 'res',  label: 'Residues',     color: '#66C2A5' },
        { id: 'urea', prop: 'urea', label: 'Urea CO₂',     color: '#ABDDA4' },
        { id: 'lime', prop: 'lime', label: 'Liming CO₂',   color: '#FFFFBF' },
        { id: 'burn', prop: 'burn', label: 'Burning',      color: '#9E0142' },
      ],
      countryProp: 'm49',
      referenceYear: 2020,
    },
  },

  // ── Common intensity basis ──────────────────────────────────────────────
  // Both map views colour by t CO₂e per km² of GROUND (not of cropland),
  // off one range, so a cell and a region reading the same number read the
  // same colour — the region simply averages over far more ground, which is
  // why its distribution is the tighter of the two. See _map/lib/intensity.js.
  intensity: {
    unit: 't CO₂e/km²',
    // The cell tiles carry no latitude and MapLibre cannot read a feature's
    // coordinates, so the gridded denominator is the exact spherical area
    // of a 0.25° cell at 29.7° — the emissions-weighted mean latitude of
    // the 202,970 exported cells, giving 671 km² against a true spread of
    // 96–773 km². The coarse tier is handled from `_scale`.
    cellDeg: 0.25,
    cellScaleKm: 28,
    refLat: 29.7,
    // The unit tiles carry their own ground area, so that side is exact.
    areaProp: 'area_km2',
  },

  // ── Regional map view: admin-1 x biome unit choropleth ──────────────────
  regionalView: {
    tilesUrl: 'https://pub-4152429430274d988725593fd52db3ae.r2.dev/food-emissions/unit-values-ee.pmtiles',
    sourceLayer: 'unit-values',
  },

  // ── PALE drivers choropleth (jurisdiction LMDI map) ──────────────────────
  paleMap: {
    tilesUrl: 'https://pub-4152429430274d988725593fd52db3ae.r2.dev/food-emissions/pale-units-ee.pmtiles',
    sourceLayer: 'pale-units',
    // Analysis is a single view: the net change in emissions, 2000-2023.
    // Gridded, that is each cell's own change; regional, each unit's — and
    // selecting a region breaks it into contributions. The per-term LMDI
    // props (r_pop, r_prodpc, ...) still ride the unit tiles for those
    // breakdowns; they are simply no longer separate map choices.
    drivers: [
      { id: 'r_net', label: 'Net change in emissions', cellTerm: 'net' },
    ],

    // Analysis overlays render from the 0.25-degree tier at EVERY zoom, so
    // a cell keeps its colour as you zoom. (Falling back to the 0.5-degree
    // tier at low zoom changes the statistic: the winner of an aggregated
    // cell is not the winner of its parts, and 7% of emissions sit where
    // the two disagree — which reads as the map flickering.) Density is
    // thinned by magnitude at low zoom instead; the cells dropped are the
    // faint ones the alpha ramp was already hiding.
    cellBandProp: 'tot',
    cellBands: [
      { maxZoom: 2.6, minValue: 10 },
      { minZoom: 2.6, maxZoom: 3.6, minValue: 2 },
      { minZoom: 3.6 },
    ],

    // Dominance maps: which source / commodity leads in each cell or unit.
    // Candidate sets follow the sidebar selection (see lib/analysis-categorical).
    categorical: [
      { id: 'dom_source', kind: 'source', label: 'Dominant source', shortLabel: 'Top sources' },
      { id: 'dom_commodity', kind: 'commodity', label: 'Dominant commodity', shortLabel: 'Top commodities' },
    ],
    // Labels + categorical colors for the dominance maps. Sources reuse the
    // area-trend palette; commodities name the thirteen largest and grey the
    // long tail (the popup still names the exact winner).
    taxonomy: {
      sources: [
        { id: 'soil', label: 'Soil carbon loss', color: '#8C6D4F' },
        { id: 'rsoil', label: 'Rangeland soil carbon loss', color: '#C4A57B' },
        { id: 'ent',  label: 'Enteric CH₄',    color: '#F46D43' },
        { id: 'rice', label: 'Rice CH₄',       color: '#D53E4F' },
        { id: 'prp',  label: 'Pasture N₂O',    color: '#FEE08B' },
        { id: 'fer',  label: 'Fertilizer N₂O', color: '#3288BD' },
        { id: 'peat', label: 'Peatland',       color: '#5E4FA2' },
        { id: 'mms',  label: 'Manure mgmt',    color: '#E6F598' },
        { id: 'man',  label: 'Manure applied', color: '#FDAE61' },
        { id: 'res',  label: 'Residues N₂O',   color: '#66C2A5' },
        { id: 'urea', label: 'Urea CO₂',       color: '#ABDDA4' },
        { id: 'lime', label: 'Liming CO₂',     color: '#78C8D8' },
        { id: 'burn', label: 'Residue burning', color: '#9E0142' },
      ],
      commodities: [
        { id: 'bcat', label: 'Beef cattle',   color: '#9E0142', sources: LIVESTOCK_SOURCE_IDS },
        { id: 'dcat', label: 'Milk',          color: '#D53E4F', sources: LIVESTOCK_SOURCE_IDS },
        { id: 'buff', label: 'Buffalo',       color: '#F46D43', sources: LIVESTOCK_SOURCE_IDS },
        { id: 'shee', label: 'Sheep',         color: '#FDAE61', sources: LIVESTOCK_SOURCE_IDS },
        { id: 'goat', label: 'Goats',         color: '#FEE08B', sources: LIVESTOCK_SOURCE_IDS },
        { id: 'pigs', label: 'Pigs',          color: '#E87828', sources: LIVESTOCK_SOURCE_IDS },
        { id: 'poul', label: 'Poultry & eggs', color: '#FFFFBF', sources: LIVESTOCK_SOURCE_IDS },
        // Camels, horses, asses, mules — dominant across pastoral drylands
        // (2.7% of cells, more than every grey-tail crop combined), so it
        // gets its own warm row rather than being pooled with the crops.
        { id: 'olvs', label: 'Other livestock', color: '#8A6F3C', legendLabel: 'Other livestock', sources: LIVESTOCK_SOURCE_IDS },
        { id: 'rice', label: 'Rice',          color: '#3288BD', sources: CROPLAND_SOURCE_IDS },
        { id: 'whea', label: 'Wheat',         color: '#66C2A5', sources: CROPLAND_SOURCE_IDS },
        { id: 'maiz', label: 'Maize',         color: '#ABDDA4', sources: CROPLAND_SOURCE_IDS },
        { id: 'soyb', label: 'Soybean',       color: '#48A848', sources: CROPLAND_SOURCE_IDS },
        { id: 'oilp', label: 'Oil palm',      color: '#5E4FA2', sources: CROPLAND_SOURCE_IDS },
        { id: 'sugc', label: 'Sugarcane',     color: '#78C8D8', sources: CROPLAND_SOURCE_IDS },
        { id: 'cott', label: 'Cotton',        color: '#9A9AAE', legendLabel: 'Other crops', sources: CROPLAND_SOURCE_IDS },
        { id: 'grou', label: 'Groundnut',     color: '#9A9AAE', legendLabel: 'Other crops', sources: CROPLAND_SOURCE_IDS },
        { id: 'barl', label: 'Barley',        color: '#9A9AAE', legendLabel: 'Other crops', sources: CROPLAND_SOURCE_IDS },
        { id: 'rape', label: 'Rapeseed',      color: '#9A9AAE', legendLabel: 'Other crops', sources: CROPLAND_SOURCE_IDS },
        { id: 'pota', label: 'Potato',        color: '#9A9AAE', legendLabel: 'Other crops', sources: CROPLAND_SOURCE_IDS },
        { id: 'sorg', label: 'Sorghum',       color: '#9A9AAE', legendLabel: 'Other crops', sources: CROPLAND_SOURCE_IDS },
        { id: 'coco', label: 'Cocoa',         color: '#9A9AAE', legendLabel: 'Other crops', sources: CROPLAND_SOURCE_IDS },
        { id: 'coff', label: 'Coffee (arabica)', color: '#9A9AAE', legendLabel: 'Other crops', sources: CROPLAND_SOURCE_IDS },
        { id: 'rcof', label: 'Coffee (robusta)', color: '#9A9AAE', legendLabel: 'Other crops', sources: CROPLAND_SOURCE_IDS },
        { id: 'rubb', label: 'Rubber',        color: '#9A9AAE', legendLabel: 'Other crops', sources: CROPLAND_SOURCE_IDS },
        { id: 'cass', label: 'Cassava',       color: '#9A9AAE', legendLabel: 'Other crops', sources: CROPLAND_SOURCE_IDS },
        { id: 'bean', label: 'Beans',         color: '#9A9AAE', legendLabel: 'Other crops', sources: CROPLAND_SOURCE_IDS },
      ],
    },
  },

  // Bulk emission-factor download, surfaced in the sidebar as well as in
  // the methods panel: admin-1 x commodity x source, kg CO2e per kg.
  efDownload: {
    href: '/tools/food-emissions/emission_factors_2024.xlsx',
    label: 'Download factors ↓',
    title: 'Admin-1 by commodity by source Emission factors workbook: admin-1 and country tables with schema and code definitions, kg CO\u2082e per kg, 2024 (XLSX)',
  },

  // Tiles on R2 like the other map tools; rebuild via
  // scripts/build-food-emissions-tiles.mjs, upload with
  // `rclone copy build/tiles/food-emissions/food-emissions.pmtiles r2:ssl-data/food-emissions/`.
  // A tiling change that the deployed client cannot read goes up under a
  // new name and the URL switches with the site deploy (2026-10-20: the
  // 5' tier; 2026-10-21 it starts at z5, food-emissions-5min-z5.pmtiles).
  tilesUrl: 'https://pub-4152429430274d988725593fd52db3ae.r2.dev/food-emissions/food-emissions-ee.pmtiles',
  sourceLayer: 'food-emissions',
  // The Cornerstone initiative (cornerstonedata.org) — this project is part
  // of it, and the jurisdictional land-use-change framework the explorer
  // will take its LUC layer from is Cornerstone's.
  initiative: {
    name: 'Cornerstone',
    url: 'https://cornerstonedata.org/',
    logo: '/logos/cornerstone/Cornerstone-Mark-1c.svg',
    logoDark: '/logos/cornerstone/Cornerstone-Mark-1c-white.svg',
  },
  distributionsUrl: '/tools/food-emissions/distributions.json',
  // Per-country value ladders backing the gridded colour scale; see
  // _map/lib/fixed-color-range.js for why the global sample alone is not
  // enough once national year factors are applied.
  colorLaddersUrl: '/tools/food-emissions/distributions-by-country.json',
  // Vertical emissions-by-latitude marginal along the map's right edge.
  latProfileUrl: '/tools/food-emissions/lat-profiles.json',
  // Three cell tiers: 0.5° aggregates carry the low zooms (~4x fewer
  // circles per frame — the 0.25° cells are sub-pixel there anyway), 0.25°
  // cells the middle, and the native 5' grid (~9 km, _scale 9) from z5.
  // Crossfades at z 2.75-3.0 and 5.0-5.25. Radii grow with zoom to stay contiguous. Every tier carries
  // the same props, and the area tool sums the finest tier on screen.
  // fill: circle diameter relative to the cell pitch — a zoom ramp. A hair
  // under 1 at overview (heavy overlap there stacks alpha and reads
  // over-saturated), growing past touching when zoomed in so the diagonal
  // gaps stop washing the field out.
  scales: [
    { value: 56, maxZoom: 3.0, radiusMode: 'cell', areaRadius: true, fill: [[1, 1.1], [3, 1.25]] },
    { value: 28, minZoom: 2.99, maxZoom: 5.25, radiusMode: 'cell', areaRadius: true, fill: [[3, 0.9], [5, 1.05]] },
    { value: 9, minZoom: 5.24, radiusMode: 'cell', areaRadius: true, fill: [[5, 1.0], [8, 1.3]] },
  ],
}

export default config
