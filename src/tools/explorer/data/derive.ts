import type { DataBundle, Spec } from '../types';

// Spec + loaded data layers → normalized chart data. Pure function; no
// React, no DOM. The chart components take the result and render.
//
// Output shape: a list of named series, each with year/value points
// aligned to the spec's yearRange. Charts decide how to draw them
// (line / area-stack / bar / etc.).

export type Series = {
  key: string;          // stable identifier (e.g. 'East Asia' or 'Coal')
  label: string;        // user-facing label
  color: string;        // hex color from the dimension palette
  points: Point[];      // chronologically sorted, possibly with null y
  // The dimension the key belongs to. Useful for legends and tooltips.
  dimension: 'geo' | 'material' | 'group' | 'flow';
};

export type Point = {
  year: number;
  value: number | null;
};

export type DerivedData = {
  series: Series[];
  /** Units label for the y axis, derived from the active measure. */
  units: string;
  /** Total range of years rendered. */
  years: number[];
};

// ── Palettes (design-system Spectral + brand neutrals for geo) ──────────────

// 11-step Spectral, used for materials/groups. Picked from CLAUDE.md.
const SPECTRAL_11 = [
  '#9E0142', '#D53E4F', '#F46D43', '#FDAE61', '#FEE08B', '#FFFFBF',
  '#E6F598', '#ABDDA4', '#66C2A5', '#3288BD', '#5E4FA2',
];

// 8 distinct colors for the 8 regions, drawn from brand + Spectral so the
// region palette doesn't visually collide with the material palette when
// both encodings appear on the same chart.
const REGION_PALETTE = [
  '#181838', // brand navy
  '#48A848', // brand green
  '#E87828', // brand orange
  '#78C8D8', // brand teal
  '#8C1515', // cardinal accent
  '#5E4FA2', // spectral purple
  '#D53E4F', // spectral red
  '#FDAE61', // spectral amber
];

// Material groups are 6, mapped to a hand-picked 6-color Spectral subset.
const GROUP_PALETTE_BY_ID: Record<string, string> = {
  biomass: '#66C2A5',     // green
  fossil: '#3A3A5A',      // dark navy (fossils stand out as "heavy")
  metal: '#D53E4F',       // red
  nonmetallic: '#FDAE61', // amber
  products: '#3288BD',    // blue
  waste: '#9A9AB0',       // ink-4 neutral
};

function colorFor(dim: Series['dimension'], key: string, index: number): string {
  if (dim === 'geo') return REGION_PALETTE[index % REGION_PALETTE.length];
  if (dim === 'group') return GROUP_PALETTE_BY_ID[key] ?? SPECTRAL_11[index % SPECTRAL_11.length];
  return SPECTRAL_11[index % SPECTRAL_11.length];
}

// ── Layer types (loose; we extract what we need at the boundary) ────────────

type Meta = {
  years: number[];
  regions: string[];
  materials: { id: string; label: string; group: string | null }[];
  groups: { id: string; label: string; members: string[] }[];
};
type FlowsWorld = { years: number[]; materials: Record<string, number[]> };
type FlowsRegions = { years: number[]; regions: Record<string, Record<string, number[]>> };
type GdpPop = { years: number[]; gdp: Record<string, number[]>; population: Record<string, number[]> };

// ── Derivation ──────────────────────────────────────────────────────────────

export function derive(data: DataBundle, spec: Spec): DerivedData {
  const meta = data.meta as Meta;
  const flowsWorld = data.flowsWorld as FlowsWorld;
  const flowsRegions = data.flowsRegions as FlowsRegions;
  const gdpPop = data.gdpPop as GdpPop;

  const [yStart, yEnd] = spec.yearRange;
  const years = meta.years.filter((y) => y >= yStart && y <= yEnd);
  const yearIndexes = years.map((y) => meta.years.indexOf(y));

  const geoFilter = spec.filters.geo ?? [];
  const matFilter = spec.filters.material ?? [];
  const matGrouping = spec.groupings?.material ?? 'category';

  // Decide what each series represents.
  //   - empty geo OR single geo → series are materials (color by material/group)
  //   - multiple geos           → series are regions (summed over selected materials)
  const compareGeos = geoFilter.length >= 2;

  // Resolve which "material keys" to include and which leaf materials each
  // key sums over. When grouping='group', each group key sums its members.
  const matSelections = resolveMaterialSelections(meta, matGrouping, matFilter);

  const series: Series[] = [];

  if (compareGeos) {
    // One series per selected region; each is the sum of selected materials.
    geoFilter.forEach((region, i) => {
      const matByYear = flowsRegions.regions[region] ?? {};
      const summed = sumMaterials(matByYear, matSelections, meta.years);
      const transformed = applyMeasure(summed, region, spec.measure, gdpPop, meta.years);
      series.push({
        key: region,
        label: region,
        color: colorFor('geo', region, i),
        dimension: 'geo',
        points: years.map((y, idx) => ({ year: y, value: transformed[yearIndexes[idx]] })),
      });
    });
  } else {
    // One series per material/group; values are the world total (or single
    // selected region's total).
    const sourceByMaterial = singleGeoMaterialSeries(geoFilter[0], flowsWorld, flowsRegions);
    const seriesKey = geoFilter[0] ?? 'World';

    matSelections.forEach((sel, i) => {
      const summed = sumLeafMaterials(sourceByMaterial, sel.leaves, meta.years);
      const transformed = applyMeasure(summed, seriesKey, spec.measure, gdpPop, meta.years);
      series.push({
        key: sel.key,
        label: sel.label,
        color: colorFor(matGrouping === 'group' ? 'group' : 'material', sel.key, i),
        dimension: matGrouping === 'group' ? 'group' : 'material',
        points: years.map((y, idx) => ({ year: y, value: transformed[yearIndexes[idx]] })),
      });
    });
  }

  return { series, units: unitsFor(spec.measure), years };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

type MatSelection = { key: string; label: string; leaves: string[] };

function resolveMaterialSelections(
  meta: Meta,
  grouping: string,
  filter: string[],
): MatSelection[] {
  if (grouping === 'group') {
    const allGroups: MatSelection[] = meta.groups.map((g) => ({
      key: g.id,
      label: g.label,
      leaves: g.members,
    }));
    if (filter.length === 0) return allGroups;
    return allGroups.filter((g) => filter.includes(g.key));
  }
  // category grouping
  const allCats: MatSelection[] = meta.materials.map((m) => ({
    key: m.id,
    label: m.label,
    leaves: [m.id],
  }));
  if (filter.length === 0) return allCats;
  return allCats.filter((c) => filter.includes(c.key));
}

function singleGeoMaterialSeries(
  geo: string | undefined,
  flowsWorld: FlowsWorld,
  flowsRegions: FlowsRegions,
): Record<string, number[]> {
  if (!geo || geo === 'World') return flowsWorld.materials;
  return flowsRegions.regions[geo] ?? {};
}

// Sum a multi-material breakdown into a single year-aligned array, with
// only the selected `leaves` contributing. Missing materials are treated
// as zero.
function sumLeafMaterials(
  matByYear: Record<string, number[]>,
  leaves: string[],
  yearsAxis: number[],
): number[] {
  const out = new Array(yearsAxis.length).fill(0);
  for (const m of leaves) {
    const arr = matByYear[m];
    if (!arr) continue;
    for (let i = 0; i < out.length; i++) {
      const v = arr[i];
      if (typeof v === 'number') out[i] += v;
    }
  }
  return out;
}

// Sum over all selected MatSelections, e.g. "all materials for this region".
function sumMaterials(
  matByYear: Record<string, number[]>,
  selections: MatSelection[],
  yearsAxis: number[],
): number[] {
  const out = new Array(yearsAxis.length).fill(0);
  for (const sel of selections) {
    const partial = sumLeafMaterials(matByYear, sel.leaves, yearsAxis);
    for (let i = 0; i < out.length; i++) out[i] += partial[i];
  }
  return out;
}

// Transform Mt values into per-capita / per-GDP / cumulative space.
function applyMeasure(
  values: number[],
  geoKey: string,
  measure: string,
  gdpPop: GdpPop,
  yearsAxis: number[],
): Array<number | null> {
  switch (measure) {
    case 'absolute':
      return values.slice();
    case 'per_capita': {
      // value (Mt) × 1e6 t/Mt / population (persons) = t/person
      const pop = gdpPop.population[geoKey];
      if (!pop) return values.map(() => null);
      return values.map((v, i) => {
        const p = pop[i];
        return p && p > 0 ? (v * 1e6) / p : null;
      });
    }
    case 'per_gdp': {
      // value (Mt) × 1e9 kg/Mt × 1000 ($ → $1000) / gdp ($) = kg per $1000
      const gdp = gdpPop.gdp[geoKey];
      if (!gdp) return values.map(() => null);
      return values.map((v, i) => {
        const g = gdp[i];
        return g && g > 0 ? (v * 1e9 * 1000) / g : null;
      });
    }
    case 'cumulative': {
      // Running sum across the visible window. Reported in Gt for legibility.
      const out: number[] = [];
      let acc = 0;
      for (const v of values) {
        acc += v;
        out.push(acc / 1000); // Mt → Gt
      }
      return out;
    }
    default:
      return values.slice();
  }
}

function unitsFor(measure: string): string {
  switch (measure) {
    case 'absolute': return 'Mt';
    case 'per_capita': return 't / person';
    case 'per_gdp': return 'kg / $1000';
    case 'cumulative': return 'Gt (cumulative)';
    default: return '';
  }
}
