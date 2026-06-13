/**
 * Annual pathway views for the magnet explorer. The capacity-expansion model
 * solves every year 2026–2035; these charts expose that trajectory instead of
 * only the final-year snapshot:
 *   1. "How US magnet demand is met" — stacked area of supply by source vs the
 *      rising demand curve (the build-out / scramble story over time).
 *   2. "US build-out" — US online capacity by stage, year by year.
 */
import type { Scenario } from './interp';

const W = 460, H = 230, PADL = 44, PADR = 12, PADT = 16, PADB = 26;
const innerW = W - PADL - PADR, innerH = H - PADT - PADB;

const MIX = [
  { key: 'domestic', label: 'US-made', color: '#3288BD' },
  { key: 'allied', label: 'Allies', color: '#FDAE61' },
  { key: 'china', label: 'China', color: '#D53E4F' },
  { key: 'unmet', label: 'Unmet', color: '#9E0142' },
];
const STAGE = [
  { key: 'mining', label: 'Mining', color: '#F46D43' },
  { key: 'separation', label: 'Separation', color: '#D53E4F' },
  { key: 'alloy', label: 'Alloy', color: '#FDAE61' },
  { key: 'magnet', label: 'Magnet', color: '#3288BD' },
];
const hatch = (c: string) =>
  `repeating-linear-gradient(45deg, ${c}, ${c} 4px, rgba(248,248,232,0.55) 4px, rgba(248,248,232,0.55) 8px)`;

function Axes({ years, ymax, ylabel }: { years: number[]; ymax: number; ylabel: string }) {
  const xi = (i: number) => PADL + (years.length === 1 ? 0 : (i / (years.length - 1)) * innerW);
  const ticks = 4;
  return (
    <g>
      {Array.from({ length: ticks + 1 }, (_, t) => {
        const v = (ymax * t) / ticks, y = PADT + innerH - (v / ymax) * innerH;
        return (
          <g key={t}>
            <line x1={PADL} y1={y} x2={W - PADR} y2={y} stroke="var(--rule)" strokeWidth={t === 0 ? 1 : 0.5} />
            <text x={PADL - 6} y={y} textAnchor="end" dominantBaseline="central" style={{ font: '400 9px var(--font-mono)', fill: 'var(--ink)', opacity: 0.5 }}>{Math.round(v)}</text>
          </g>
        );
      })}
      {years.map((yr, i) => (i % 2 === 0 || i === years.length - 1) && (
        <text key={yr} x={xi(i)} y={H - PADB + 13} textAnchor="middle" style={{ font: '400 9px var(--font-mono)', fill: 'var(--ink)', opacity: 0.5 }}>{`'${String(yr).slice(2)}`}</text>
      ))}
      <text x={10} y={PADT + innerH / 2} textAnchor="middle" transform={`rotate(-90 10 ${PADT + innerH / 2})`} style={{ font: '400 9px var(--font-mono)', fill: 'var(--ink)', opacity: 0.55 }}>{ylabel}</text>
    </g>
  );
}

function StackedArea({ series, years, ymax }: {
  series: { key: string; color: string }[]; years: number[]; ymax: number;
}) {
  const n = years.length;
  const xi = (i: number) => PADL + (n === 1 ? 0 : (i / (n - 1)) * innerW);
  const yv = (v: number) => PADT + innerH - (v / ymax) * innerH;
  const lower = Array(n).fill(0);
  return (
    <>
      {series.map((s) => {
        const top = (s as any).values.map((v: number, i: number) => lower[i] + Math.max(0, v));
        const d = [
          ...(s as any).values.map((_: number, i: number) => `${i === 0 ? 'M' : 'L'}${xi(i)},${yv(top[i])}`),
          ...lower.map((lo, i) => `L${xi(n - 1 - i)},${yv(lower[n - 1 - i])}`), 'Z',
        ].join(' ');
        for (let i = 0; i < n; i++) lower[i] = top[i];
        const fill = s.key === 'unmet' ? hatch(s.color) : s.color;
        return s.key === 'unmet'
          ? <path key={s.key} d={d} style={{ fill }} fillOpacity={0.9} />
          : <path key={s.key} d={d} fill={s.color} fillOpacity={0.82} />;
      })}
    </>
  );
}

function Lines({ series, years, ymax }: {
  series: { key: string; color: string; values: number[] }[]; years: number[]; ymax: number;
}) {
  const n = years.length;
  const xi = (i: number) => PADL + (n === 1 ? 0 : (i / (n - 1)) * innerW);
  const yv = (v: number) => PADT + innerH - (v / ymax) * innerH;
  return (
    <>
      {series.map((s) => (
        <path key={s.key} fill="none" stroke={s.color} strokeWidth={2}
          d={s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xi(i)},${yv(v)}`).join(' ')} />
      ))}
    </>
  );
}

function Legend({ items }: { items: { label: string; color: string; key?: string }[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 8 }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: it.key === 'unmet' ? hatch(it.color) : it.color, display: 'inline-block' }} />
          <span style={{ opacity: 0.7 }}>{it.label}</span>
        </span>
      ))}
    </div>
  );
}

export default function PathwayCharts({ sc, years, demand, usShare }: {
  sc: Scenario; years: number[]; demand: number[]; usShare: number;
}) {
  const usDemand = demand.map((d) => d * usShare);
  const mixSeries = MIX.map((m) => ({ ...m, values: sc.path.us_mix[m.key] ?? [] }));
  const capSeries = STAGE.map((s) => ({ ...s, values: sc.path.us_cap[s.key] ?? [] }));
  const mixMax = Math.max(...usDemand, ...years.map((_, i) => mixSeries.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0))) * 1.05 || 1;
  const capMax = Math.max(1, ...capSeries.flatMap((s) => s.values)) * 1.1;
  const n = years.length;
  const xi = (i: number) => PADL + (n === 1 ? 0 : (i / (n - 1)) * innerW);
  const yMix = (v: number) => PADT + innerH - (v / mixMax) * innerH;
  const i2030 = years.indexOf(2030);

  return (
    <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20, background: 'var(--paper)', marginTop: 26 }}>
      <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: '0 0 4px' }}>Pathways to 2035</h2>
      <p style={{ fontSize: 12, opacity: 0.55, margin: '0 0 14px', lineHeight: 1.5 }}>
        Annual trajectories from the model (not just the endpoint). Perfect-foresight build-out —
        capacity is timed against lead times but with full knowledge of future demand.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>How US magnet demand is met</div>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }} role="img" aria-label="US supply mix over time">
            <Axes years={years} ymax={mixMax} ylabel="kt magnet / yr" />
            <StackedArea series={mixSeries} years={years} ymax={mixMax} />
            <path fill="none" stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="4 3"
              d={usDemand.map((v, i) => `${i === 0 ? 'M' : 'L'}${xi(i)},${yMix(v)}`).join(' ')} />
            {i2030 >= 0 && <line x1={xi(i2030)} y1={PADT} x2={xi(i2030)} y2={PADT + innerH} stroke="var(--accent)" strokeWidth={0.75} strokeDasharray="2 2" opacity={0.6} />}
          </svg>
          <Legend items={[...MIX, { label: 'US demand', color: 'var(--ink)' }]} />
        </div>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>US capacity build-out by stage</div>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }} role="img" aria-label="US capacity over time">
            <Axes years={years} ymax={capMax} ylabel="kt / yr capacity" />
            <Lines series={capSeries} years={years} ymax={capMax} />
            {i2030 >= 0 && <line x1={xi(i2030)} y1={PADT} x2={xi(i2030)} y2={PADT + innerH} stroke="var(--accent)" strokeWidth={0.75} strokeDasharray="2 2" opacity={0.6} />}
          </svg>
          <Legend items={STAGE} />
        </div>
      </div>
      <p style={{ fontSize: 11.5, opacity: 0.5, marginTop: 10, fontStyle: 'italic' }}>
        Dashed vertical = 2030 milestone. Left: stacked supply sources fill the dashed US-demand
        curve; any gap to it is unmet. Right: when US capacity at each stage actually comes online
        (gated by build lead times).
      </p>
    </section>
  );
}
