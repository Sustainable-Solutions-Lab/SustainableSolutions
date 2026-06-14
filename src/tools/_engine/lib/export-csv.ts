import type { ChoroplethData, ContourData, DerivedData, ScatterData, TreemapData } from '../data/derive';
import type { Spec } from '../types';

// Format the current derived data as CSV. Shape depends on the chart
// type — time series get a wide layout (year + one column per series),
// snapshots get a tall layout.

export function timeSeriesCsv(data: DerivedData, spec: Spec): string {
  const rows: string[][] = [];
  const seriesKeys = data.series.map((s) => s.label);
  rows.push(['year', ...seriesKeys, `units=${data.units}`].slice(0, seriesKeys.length + 1));
  // Re-emit a clean header without the trailing units note:
  rows[0] = ['year', ...seriesKeys];
  for (let i = 0; i < data.years.length; i++) {
    const year = data.years[i];
    const cells = [String(year), ...data.series.map((s) => formatCell(s.points[i]?.value))];
    rows.push(cells);
  }
  return prepend(toCsv(rows), commentLines(spec, data.units));
}

export function treemapCsv(data: TreemapData, spec: Spec): string {
  const rows: string[][] = [
    ['material', 'value', 'units'],
    ...data.slices.map((s) => [s.label, formatCell(s.value), data.units]),
  ];
  return prepend(toCsv(rows), commentLines(spec, data.units, `Snapshot year: ${data.year}`));
}

export function choroplethCsv(data: ChoroplethData, spec: Spec): string {
  const rows: string[][] = [
    ['country', 'value', 'units'],
    ...Object.entries(data.byCountry)
      .sort((a, b) => b[1] - a[1])
      .map(([country, value]) => [country, formatCell(value), data.units]),
  ];
  return prepend(toCsv(rows), commentLines(spec, data.units, `Snapshot year: ${data.year}`));
}

export function scatterCsv(data: ScatterData, spec: Spec): string {
  const rows: string[][] = [
    ['region', 'year', `x_${data.xUnits}`, `y_${data.yUnits}`],
  ];
  for (const s of data.series) {
    for (const p of s.points) {
      rows.push([
        s.label,
        String(p.year),
        formatCell(p.x ?? null),
        formatCell(p.y ?? null),
      ]);
    }
  }
  return prepend(toCsv(rows), commentLines(spec, `${data.xUnits} | ${data.yUnits}`));
}

export function contourCsv(data: ContourData, spec: Spec): string {
  const rows: string[][] = [
    ['region', 'year', `x_${data.xUnits}`, `y_${data.yUnits}`, `z_${data.combineOp}`],
  ];
  for (const s of data.series) {
    for (const p of s.points) {
      const z = data.combineOp === 'product' ? p.x * p.y : p.x + p.y;
      rows.push([
        s.label,
        String(p.year),
        formatCell(p.x),
        formatCell(p.y),
        formatCell(z),
      ]);
    }
  }
  return prepend(toCsv(rows), commentLines(spec, `${data.xUnits} × ${data.yUnits}`));
}

// ── helpers ────────────────────────────────────────────────────────────────

function formatCell(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '';
  // Six significant figures is enough for visualization-quality data.
  return String(Number(v.toPrecision(6)));
}

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(quoteIfNeeded).join(',')).join('\n');
}

function quoteIfNeeded(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function commentLines(spec: Spec, units: string, ...extras: string[]): string {
  const lines = [
    `# Sustainable Solutions Lab — Materials explorer`,
    `# Chart: ${spec.chart}`,
    `# Measure: ${spec.measure} (${units})`,
    `# Year range: ${spec.yearRange[0]}–${spec.yearRange[1]}`,
    ...extras.map((e) => `# ${e}`),
    `# Generated: ${new Date().toISOString().slice(0, 10)}`,
  ];
  return lines.join('\n') + '\n';
}

function prepend(csv: string, header: string): string {
  return header + csv;
}
