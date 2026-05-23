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

  // Presets fill in as charts arrive. Empty for milestone 3.
  presets: [],

  data: {
    eagerLayers,
    // lazyLayers added in milestone 7 (country detail from R2).
  },
};
