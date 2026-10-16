import type {
  ChoroplethData,
  ContourData,
  DerivedData,
  ImportanceData,
  LeversData,
  RunsData,
  ScatterData,
  TreemapData,
} from '../data/derive';
import type { Spec } from '../types';
import { isEnsembleChart } from '../types';

// Format the current derived data as CSV. Shape depends on the chart
// type — time series get a wide layout (year + one column per series),
// snapshots get a tall layout.

export function timeSeriesCsv(data: DerivedData, spec: Spec): string {
  const rows: string[][] = [];
  // A projected series carries its uncertainty band alongside the median, so
  // the export widens to four extra columns for those series only.
  const banded = data.series.map((s) => s.points.some((p) => p.lo != null || p.loOuter != null));
  const header = ['year'];
  data.series.forEach((s, i) => {
    header.push(s.label);
    if (banded[i]) header.push(`${s.label} (lo)`, `${s.label} (hi)`, `${s.label} (min)`, `${s.label} (max)`);
  });
  rows.push(header);
  for (let i = 0; i < data.years.length; i++) {
    const cells = [String(data.years[i])];
    data.series.forEach((s, si) => {
      const p = s.points[i];
      cells.push(formatCell(p?.value));
      if (banded[si]) {
        cells.push(
          formatCell(p?.lo ?? null),
          formatCell(p?.hi ?? null),
          formatCell(p?.loOuter ?? null),
          formatCell(p?.hiOuter ?? null),
        );
      }
    });
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

// The ensemble exports are one row per run / per lever / per bin-and-lever,
// and they carry the window in the comment header rather than a year column.

export function runsCsv(data: RunsData, spec: Spec): string {
  // Groups are a colour encoding, not an ordering — flatten back to run order
  // so the export matches the source table.
  const body = data.groups
    .flatMap((g) => g.runs)
    .sort((a, b) => a.id - b.id)
    .map((p) => [
      String(p.id),
      p.ssp,
      formatCell(p.x),
      formatCell(p.y),
      p.bin,
      p.decouple ? 'TRUE' : 'FALSE',
      p.selected ? 'TRUE' : 'FALSE',
      formatCell(p.t2060),
      formatCell(p.fossilIndex),
    ]);
  const rows: string[][] = [
    [
      'run_id',
      'ssp',
      'gdp_cagr_pct_yr',
      'material_cagr_pct_yr',
      'growth_bin',
      'absolute_decoupling',
      'below_trend_1sigma',
      'warming_2060_C',
      'fossil_index_vs_2024',
    ],
    ...body,
  ];
  const extras = [`Window: ${data.window[0]}-${data.window[1]}`];
  if (data.fit) {
    extras.push(
      `Fit: material_cagr = ${data.fit.slope} x gdp_cagr ${data.fit.intercept < 0 ? '-' : '+'} ${Math.abs(data.fit.intercept)} (%/yr), residual sigma ${data.fit.residSigma}`,
    );
  }
  extras.push(data.note);
  return prepend(toCsv(rows), commentLines(spec, data.units, ...extras));
}

export function leversCsv(data: LeversData, spec: Spec): string {
  const rows: string[][] = [
    ['lever', 'group', 'family', 'change_applied', 'effect_pp_yr', 'ci_lo', 'ci_hi', 'significant'],
    ...data.bars.map((b) => [
      b.label,
      b.group,
      b.family,
      b.delta,
      formatCell(b.effect),
      formatCell(b.lo),
      formatCell(b.hi),
      b.significant ? 'TRUE' : 'FALSE',
    ]),
  ];
  return prepend(
    toCsv(rows),
    commentLines(spec, data.units, `Window: ${data.window[0]}-${data.window[1]}`, data.note),
  );
}

export function importanceCsv(data: ImportanceData, spec: Spec): string {
  const rows: string[][] = [['growth_bin', 'runs_in_bin', 'lever', 'share_pct']];
  for (const bin of data.bins) {
    for (const c of bin.cells) {
      rows.push([bin.bin, String(bin.n), c.label, formatCell(c.pct)]);
    }
  }
  return prepend(toCsv(rows), commentLines(spec, '% of attributed importance', data.note));
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
    // Ensemble exports are not a measure over a year range; they state their
    // own window in the extras instead.
    ...(isEnsembleChart(spec.chart)
      ? [`# Units: ${units}`]
      : [
          `# Measure: ${spec.measure} (${units})`,
          `# Year range: ${spec.yearRange[0]}–${spec.yearRange[1]}`,
        ]),
    ...extras.filter(Boolean).map((e) => `# ${e}`),
    `# Generated: ${new Date().toISOString().slice(0, 10)}`,
  ];
  return lines.join('\n') + '\n';
}

function prepend(csv: string, header: string): string {
  return header + csv;
}
