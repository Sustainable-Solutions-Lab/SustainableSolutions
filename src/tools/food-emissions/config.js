/**
 * projects/food-emissions/config.js
 *
 * Configuration for: Food Emissions — greenhouse-gas emissions from managing
 * the world's croplands, by source, crop, and over time.
 *
 * Companion paper: DeAngelo et al., "Mapped drivers of global land-use
 * emissions 2000–2024" (in preparation) — an annual, corrected extension of
 * Cao et al. (2026, Nature Climate Change), merged with Cornerstone's
 * jurisdictional land-use-change framework.
 *
 * One canonical dataset (no variants): our updated Cao-lineage model
 * (IPCC 2019 reference rice parameters; updates coordinated with the
 * original authors) with drained-peatland emissions from the Cornerstone
 * steady-state occupation floor.
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
  // Labeled by land use: rangeland and forest soil-carbon layers are in
  // the pipeline and appear as pending entries under LSRS cat. 2 - the
  // Standard treats them inside categories 1/2, not as a category of
  // their own, so the differentiation lives here in Specific sources.
  ['soil', 'Soil carbon CO₂ — cropland', 20],
]
const SOURCE_IDS = SOURCES.map(([id]) => id)

// GHG Protocol LSRS accounting subcategories (terms verified against the
// Land Sector and Removals Standard and Guidance v1.0, June 2026):
//   1 "land use change emissions"                 - not in this dataset
//                                                   (jdLUC partner data)
//   2 "land management net biogenic CO2 emissions" - stock changes on
//     managed land: SOC losses (soil) AND drained organic soils (peat)
//   3 "land management production emissions"       - the non-CO2 gases
//     plus non-biogenic input CO2 (urea, lime)
// Category 4-style removals are out of scope: the LSRS requires
// field-measured evidence. Requirement 32 obliges factor providers to
// keep subcategories separable - which these groupings implement.
const LSRS_CAT2_IDS = ['peat', 'soil']
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
      note: isMlp
        ? 'Pilot (44 US states, France, Spain): net live-aboveground carbon change on forestland from ~334,000 paired national-inventory re-measurements (USDA FIA, French IGN, Spanish IFN) — the managed-land-proxy accounting option. Red = net loss, blue = net removal. Research preview pending the LSRS forestry standard; not counted in any total.'
        : 'Pilot (44 US states, France, Spain): carbon flux attributable to forest management — the activity-based accounting option: observed flux on managed stands minus a matched counterfactual with no management, so ambient regrowth and CO₂ fertilization drop out. Management is identified from each inventory\u2019s own records of felling and stand treatment. Red = attributable emissions, blue = attributable gain. Research preview pending the LSRS forestry standard; not counted in any total.',
      description: 'Inventory-measured forest carbon flux (US FIA, French IGN, Spanish IFN), mean of recent re-measurement periods.',
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
    'Where do food-system greenhouse-gas emissions come from, and how is that changing? This tool works toward a complete, spatially explicit, commodity-specific accounting of emissions from land use and land management — mapped where they happen, traced to what is grown, and followed through time. Today it covers the management of the world’s croplands — synthetic fertilizer and applied manure N₂O, rice paddy CH₄, cultivated drained peatland, crop residues, and residue burning — for 46 crops on a quarter-degree grid, for any year 2000–2024, plus direct livestock emissions (enteric CH₄, manure-management CH₄ and N₂O, manure deposited on pasture) and CO₂ from agricultural liming. Cropland emissions follow our updated implementation of Cao et al. (2026), developed in coordination with the original authors, with drained-peatland emissions from the Cornerstone steady-state model; livestock currently distributes FAO national series across gridded animal densities, to be upgraded with forthcoming spatially explicit livestock data. Land-use-change emissions join next, through the Cornerstone jurisdictional framework.',

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
    maxZoom: 8,
    // Poles truncated ~300 km beyond the highest-latitude plotted cells
    // (data spans -51.9 to 68.4): the land layer is clipped to [-55, 71.5]
    // and the viewport edges are hard-locked to the same band, so dragging
    // can never reveal the cut.
    latBounds: [-55, 71.5],
    useCaliforniaOverlay: false,
    useWorldOverlay: true,
    // Subtle national + admin-1 reference lines (Natural Earth 10m).
    boundariesUrl: 'https://pub-4152429430274d988725593fd52db3ae.r2.dev/food-emissions/boundaries.pmtiles',
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
        ...SOURCES.map(([id, label]) => ({ id, label })),
        // Forest carbon pilot: the two GHG Protocol accounting options as
        // selectable signed views (research preview, not in totals).
        { id: 'fmlp', label: 'Forest carbon — net stock change (opt. 1 · pilot)', cat: 'cat2' },
        { id: 'fab', label: 'Forest carbon — management-attributable (opt. 2 · pilot)', cat: 'cat2' },
        // Pending soil-carbon land uses: listed (disabled) under cat. 2 so
        // the coverage roadmap is visible where it will eventually live.
        { id: 'soil_range', label: 'Soil carbon CO₂ — rangeland (coming)', cat: 'cat2', disabled: true },
        { id: 'soil_forest', label: 'Soil carbon CO₂ — forest (pending standard)', cat: 'cat2', disabled: true },
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
    // Forest pilot views ignore the commodity dropdown: alias every crop
    // selection to the same signed layer so no source x crop combination
    // is left without a variable.
    ...['fmlp', 'fab'].flatMap((source) => [
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
    aggregateVariableIds: ['tot', 'ent', 'rice', 'prp', 'fer', 'peat', 'mms', 'man', 'res', 'urea', 'lime', 'burn'],
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

  // ── Regional map view: admin-1 x biome unit choropleth ──────────────────
  regionalView: {
    // Fixed global colour scale, precomputed over every unit so the ramp
    // never depends on the viewport (pipeline/export_unit_values.py).
    scalesUrl: '/tools/food-emissions/unit-scales.json',
    tilesUrl: 'https://pub-4152429430274d988725593fd52db3ae.r2.dev/food-emissions/unit-values.pmtiles',
    sourceLayer: 'unit-values',
  },

  // ── PALE drivers choropleth (jurisdiction LMDI map) ──────────────────────
  paleMap: {
    tilesUrl: 'https://pub-4152429430274d988725593fd52db3ae.r2.dev/food-emissions/pale-units.pmtiles',
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
  tilesUrl: 'https://pub-4152429430274d988725593fd52db3ae.r2.dev/food-emissions/food-emissions.pmtiles',
  sourceLayer: 'food-emissions',
  // The Cornerstone initiative (cornerstonedata.org) — this project is part
  // of it, and the jurisdictional land-use-change framework the explorer
  // will take its LUC layer from is Cornerstone's.
  initiative: {
    name: 'Cornerstone',
    eyebrow: 'Part of',
    url: 'https://cornerstonedata.org/',
    logo: '/logos/cornerstone/Cornerstone-Wordmark-1c.svg',
    logoDark: '/logos/cornerstone/Cornerstone-Wordmark-1c-white.svg',
  },
  distributionsUrl: '/tools/food-emissions/distributions.json',
  // Per-country value ladders backing the gridded colour scale; see
  // _map/lib/fixed-color-range.js for why the global sample alone is not
  // enough once national year factors are applied.
  colorLaddersUrl: '/tools/food-emissions/distributions-by-country.json',
  // Vertical emissions-by-latitude marginal along the map's right edge.
  latProfileUrl: '/tools/food-emissions/lat-profiles.json',
  // Two cell tiers (crossfading at z 2.75-3.0): 0.5° aggregates carry the
  // low zooms (~4x fewer circles per frame — the 0.25° cells are sub-pixel
  // there anyway), 0.25° cells the rest. Radii grow with zoom to stay
  // contiguous.
  // fill: circle diameter relative to the cell pitch — a zoom ramp. A hair
  // under 1 at overview (heavy overlap there stacks alpha and reads
  // over-saturated), growing past touching when zoomed in so the diagonal
  // gaps stop washing the field out.
  scales: [
    { value: 56, maxZoom: 3.0, radiusMode: 'cell', fill: [[1, 1.1], [3, 1.25]] },
    { value: 28, minZoom: 2.99, radiusMode: 'cell', fill: [[3, 0.9], [5, 1.05], [8, 1.35]] },
  ],
}

export default config
