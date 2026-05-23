// ExplorerConfig for the materials tool.
//
// Reads from public/tools/materials/*.json (produced by
// scripts/build-materials.js). Dimensions and presets will fill out as
// charts come online in milestones 4+. For now this declares just enough
// for the Explorer skeleton to mount and load data.

import type { ExplorerConfig } from '../explorer/types';

const eagerLayers = {
  meta: '/tools/materials/meta.json',
  flowsWorld: '/tools/materials/flows-world.json',
  flowsRegions: '/tools/materials/flows-regions.json',
  gdpPop: '/tools/materials/gdp-pop.json',
  stocks2024: '/tools/materials/stocks-2024.json',
};

export const materialsConfig: ExplorerConfig = {
  slug: 'materials',
  title: 'Material flows explorer',
  description:
    'Historical (1970–2024) global use of 22 material categories across 8 world regions, with flexible chart types and shareable views. Country-level data and projection scenarios arrive in later versions.',
  citation: {
    authors: 'Busch et al.',
    title: 'Global material consumption persists despite optimal efficiency and circularity',
    journal: 'In preparation',
    year: 2026,
    url: 'https://github.com/pmbusch/material-intensity',
  },

  yearRange: [1970, 2024],

  // Dimensions are seeded from meta.json at runtime; this declares only the
  // dimension names and picker hints. The loader will populate `.values` from
  // the loaded meta layer in milestone 4.
  dimensions: [
    { name: 'geo', label: 'Geography', values: [], pickerType: 'chips' },
    { name: 'material', label: 'Material', values: [], pickerType: 'chips' },
    { name: 'flow', label: 'Flow type', values: [], pickerType: 'chips' },
  ],

  measures: [
    { name: 'absolute', label: 'Absolute', units: 'Mt' },
    { name: 'per_capita', label: 'Per capita', units: 't/person' },
    { name: 'per_gdp', label: 'Per GDP', units: 'kg/$1000' },
    { name: 'cumulative', label: 'Cumulative', units: 'Gt' },
  ],

  chartTypes: ['line', 'area', 'bar', 'treemap', 'choropleth', 'scatter', 'contour'],

  // A few placeholder presets to exercise the URL-load path. The full
  // preset library (8+ entries from EXPLORER_TOOLS_PLAN.md §5) fills in
  // as charts arrive in milestones 5+.
  presets: [
    {
      id: 'global-flow',
      title: 'Global material flow over time',
      blurb: 'Stacked area, world, all 22 materials → 6 groups, 1970–2024.',
      spec: {
        chart: 'area',
        measure: 'absolute',
        yearRange: [1970, 2024],
        filters: { geo: [], material: [], flow: [] },
        groupings: { material: 'group' },
      },
    },
    {
      id: 'per-capita-regions',
      title: 'Per-capita comparison across regions',
      blurb: 'Multi-line, 8 regions, all materials summed, per capita, 1970–2024.',
      spec: {
        chart: 'line',
        measure: 'per_capita',
        yearRange: [1970, 2024],
        filters: {
          geo: [
            'East Asia',
            'Europe & Russia',
            'Latin America',
            'Middle East & North Africa',
            'North America',
            'Oceania',
            'South Asia',
            'Sub-Saharan Africa',
          ],
          material: [],
          flow: [],
        },
        groupings: { material: 'group' },
      },
    },
    {
      id: 'decoupling',
      title: 'Decoupling — material intensity over time',
      blurb: 'Per-GDP material intensity for 8 regions, 1970–2024.',
      spec: {
        chart: 'line',
        measure: 'per_gdp',
        yearRange: [1970, 2024],
        filters: {
          geo: [
            'East Asia',
            'Europe & Russia',
            'Latin America',
            'Middle East & North Africa',
            'North America',
            'Oceania',
            'South Asia',
            'Sub-Saharan Africa',
          ],
          material: [],
          flow: [],
        },
        groupings: { material: 'group' },
      },
    },
    {
      id: 'composition-2024',
      title: '2024 composition treemap',
      blurb: 'World material consumption in 2024, broken into the 6 material groups.',
      spec: {
        chart: 'treemap',
        measure: 'absolute',
        yearRange: [1970, 2024],
        singleYear: 2024,
        filters: { geo: [], material: [], flow: [] },
        groupings: { material: 'group' },
      },
    },
    {
      id: 'phase-plot',
      title: 'Phase plot — material intensity vs prosperity',
      blurb: 'Mat/GDP on x, GDP/cap on y, 1970–2024 trajectories for each region.',
      spec: {
        chart: 'scatter',
        measure: 'per_capita',
        scatterX: 'per_gdp',
        yearRange: [1970, 2024],
        filters: {
          geo: [
            'East Asia',
            'Europe & Russia',
            'Latin America',
            'Middle East & North Africa',
            'North America',
            'Oceania',
            'South Asia',
            'Sub-Saharan Africa',
          ],
          material: [],
          flow: [],
        },
        groupings: { material: 'group' },
      },
    },
  ],

  data: {
    eagerLayers,
    // lazyLayers added in milestone 7 (country detail from R2).
  },
};
