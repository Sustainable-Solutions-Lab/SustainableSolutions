// Build the NC rain-frequency summary from NOAA GHCN-Daily (NCEI access API,
// no key). Writes src/tools/nc-rain/data/rain.json (small, committed).
// Usage: node scripts/build-nc-rain.mjs
import { writeFileSync } from 'node:fs';

const START = 1976, END = 2025;
const STATIONS = [
  { id: 'USW00003812', name: 'Asheville', region: 'Mountains' },
  { id: 'USW00013881', name: 'Charlotte', region: 'Piedmont' },
  { id: 'USW00013723', name: 'Greensboro', region: 'Piedmont' },
  { id: 'USW00013722', name: 'Raleigh–Durham', region: 'Piedmont' },
  { id: 'USW00013748', name: 'Wilmington', region: 'Coast' },
  { id: 'USW00093729', name: 'Cape Hatteras', region: 'Coast' },
];
const THRESH = [0.01, 0.5, 1.0]; // inches: any rain, moderate, heavy

async function fetchStation(id) {
  const url = `https://www.ncei.noaa.gov/access/services/data/v1?dataset=daily-summaries&stations=${id}&dataTypes=PRCP&startDate=${START}-01-01&endDate=${END}-12-31&format=json&units=standard`;
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url);
    if (r.ok) return r.json();
    await new Promise((s) => setTimeout(s, 5000 * (i + 1)));
  }
  throw new Error(`fetch failed for ${id}`);
}

const out = { source: 'NOAA NCEI GHCN-Daily', start: START, end: END, thresholds: THRESH, stations: [] };
for (const st of STATIONS) {
  const rows = await fetchStation(st.id);
  // years[y] = { n, wet:[..per thresh], total, months: [{n, wet:[..]}x12] }
  const years = {};
  for (const { DATE, PRCP } of rows) {
    if (PRCP === undefined || PRCP === '' || PRCP === null) continue;
    const p = Number(PRCP);
    if (!Number.isFinite(p)) continue;
    const y = +DATE.slice(0, 4), m = +DATE.slice(5, 7) - 1;
    const Y = (years[y] ??= { n: 0, wet: THRESH.map(() => 0), total: 0, months: Array.from({ length: 12 }, () => ({ n: 0, wet: THRESH.map(() => 0) })) });
    Y.n++; Y.total += p; Y.months[m].n++;
    THRESH.forEach((t, k) => { if (p >= t) { Y.wet[k]++; Y.months[m].wet[k]++; } });
  }
  const series = [];
  for (let y = START; y <= END; y++) {
    const Y = years[y];
    const days = (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 366 : 365;
    if (!Y || Y.n < 0.9 * days) { series.push({ year: y, missing: true }); continue; }
    // Scale counts to a full year so a few missing days don't bias low.
    const f = days / Y.n;
    series.push({
      year: y,
      coverage: +(Y.n / days).toFixed(3),
      days: Y.wet.map((w) => +(w * f).toFixed(1)),
      totalIn: +(Y.total * f).toFixed(2),
      // share of days with rain, by month (fraction 0–1) per threshold
      monthly: Y.months.map((M) => M.n ? M.wet.map((w) => +(w / M.n).toFixed(3)) : null),
    });
  }
  const good = series.filter((s) => !s.missing).length;
  console.log(`${st.name}: ${rows.length} rows, ${good}/${END - START + 1} usable years`);
  out.stations.push({ ...st, series });
}
writeFileSync(new URL('../src/tools/nc-rain/data/rain.json', import.meta.url), JSON.stringify(out));
console.log('wrote src/tools/nc-rain/data/rain.json');
