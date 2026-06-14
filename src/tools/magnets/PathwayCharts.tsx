/**
 * Annual pathway views for the magnet explorer. The capacity-expansion model
 * solves every year 2026–2035; these charts expose that trajectory:
 *   1. "How US magnet demand is met" — US supply by source (US-made / allies /
 *      China) stacked, with unmet on top; the stack total IS US demand.
 *   2. "US build-out" — US online capacity by stage vs US magnet demand.
 * Both demand and unmet come from the model's us_mix, so they are internally
 * consistent (the dashed line = the stack total). Y-axes are fixed so changing
 * scenario moves the CURVES.
 */
import type { Scenario } from './interp';

const W = 420, H = 150, PADL = 38, PADR = 10, PADT = 10, PADB = 22;
const innerW = W - PADL - PADR, innerH = H - PADT - PADB;

const MIX = [
  { key: 'domestic', label: 'US-made', color: '#3288BD' },
  { key: 'allied', label: 'Allies', color: '#FDAE61' },
  { key: 'china', label: 'China', color: '#D53E4F' },
];
const STAGE = [
  { key: 'mining', label: 'Mining', color: '#F46D43' },
  { key: 'separation', label: 'Separation', color: '#D53E4F' },
  { key: 'alloy', label: 'Alloy', color: '#FDAE61' },
  { key: 'magnet', label: 'Magnet', color: '#3288BD' },
];
const UNMET = '#9E0142';
const hatchId = 'unmet-hatch';
// red stripes on a transparent background (so it reads the same in light + dark)
const legendHatch = `repeating-linear-gradient(45deg, ${UNMET}, ${UNMET} 3px, transparent 3px, transparent 6px)`;

function Legend({ items }: { items: { label: string; color: string; dash?: boolean; hatch?: boolean }[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 12px', marginTop: 6 }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
          {it.dash
            ? <span style={{ width: 12, height: 0, borderTop: `2px dashed ${it.color}`, display: 'inline-block' }} />
            : <span style={{ width: 10, height: 10, borderRadius: 2, display: 'inline-block',
                background: it.hatch ? legendHatch : it.color }} />}
          <span style={{ opacity: 0.7 }}>{it.label}</span>
        </span>
      ))}
    </div>
  );
}

function Frame({ years, ymax, ylabel, children }: {
  years: number[]; ymax: number; ylabel: string; children: any;
}) {
  const xi = (i: number) => PADL + (i / (years.length - 1)) * innerW;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <pattern id={hatchId} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={UNMET} strokeWidth="3" />
        </pattern>
      </defs>
      {[0, 0.5, 1].map((f) => {
        const y = PADT + innerH - f * innerH;
        return <g key={f}>
          <line x1={PADL} y1={y} x2={W - PADR} y2={y} stroke="var(--rule)" strokeWidth={f === 0 ? 1 : 0.5} />
          <text x={PADL - 5} y={y} textAnchor="end" dominantBaseline="central" style={{ font: '400 8px var(--font-mono)', fill: 'var(--ink)', opacity: 0.5 }}>{Math.round(ymax * f)}</text>
        </g>;
      })}
      {years.map((yr, i) => (i % 3 === 0 || i === years.length - 1) && (
        <text key={yr} x={xi(i)} y={H - PADB + 11} textAnchor="middle" style={{ font: '400 8px var(--font-mono)', fill: 'var(--ink)', opacity: 0.5 }}>{`'${String(yr).slice(2)}`}</text>
      ))}
      <text x={8} y={PADT + innerH / 2} textAnchor="middle" transform={`rotate(-90 8 ${PADT + innerH / 2})`} style={{ font: '400 8px var(--font-mono)', fill: 'var(--ink)', opacity: 0.55 }}>{ylabel}</text>
      {children}
    </svg>
  );
}

export default function PathwayCharts({ sc, years, usDemandMax }: {
  sc: Scenario; years: number[]; usDemandMax: number;
}) {
  const n = years.length;
  const xi = (i: number) => PADL + (i / (n - 1)) * innerW;
  const ymax = usDemandMax;
  const yv = (v: number) => PADT + innerH - (v / ymax) * innerH;
  const get = (k: string) => sc.path.us_mix[k] ?? Array(n).fill(0);

  // US demand = the model's US supply mix total (US-made + allies + China + unmet)
  const usDemand = years.map((_, i) => ['domestic', 'allied', 'china', 'unmet'].reduce((a, k) => a + (get(k)[i] || 0), 0));
  const demandLine = usDemand.map((v, i) => `${i === 0 ? 'M' : 'L'}${xi(i)},${yv(v)}`).join(' ');

  // chart 1: stacked supply (colored) + unmet (hatched) on top
  const stackItems = [...MIX, { key: 'unmet', label: 'Unmet demand', color: UNMET, hatch: true }];
  const lower = Array(n).fill(0);
  const areas = stackItems.map((s: any) => {
    const vals = get(s.key);
    const top = vals.map((v: number, i: number) => lower[i] + Math.max(0, v));
    const d = [
      ...top.map((t: number, i: number) => `${i === 0 ? 'M' : 'L'}${xi(i)},${yv(t)}`),
      ...lower.map((_: number, i: number) => `L${xi(n - 1 - i)},${yv(lower[n - 1 - i])}`), 'Z',
    ].join(' ');
    for (let i = 0; i < n; i++) lower[i] = top[i];
    return <path key={s.key} d={d} fill={s.hatch ? `url(#${hatchId})` : s.color} fillOpacity={s.hatch ? 1 : 0.85} />;
  });

  // chart 2: US capacity by stage, vs US magnet demand reference
  const cap = STAGE.map((s) => ({ ...s, values: sc.path.us_cap[s.key] ?? [] }));

  return (
    <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 16, background: 'var(--paper)', marginTop: 22 }}>
      <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: '0 0 10px' }}>Pathways to 2035</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>How US magnet demand is met</div>
          <Frame years={years} ymax={ymax} ylabel="kt magnet / yr">
            {areas}
            <path d={demandLine} fill="none" stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="4 3" />
          </Frame>
          <Legend items={[...MIX, { label: 'Unmet demand', color: UNMET, hatch: true }, { label: 'US demand', color: 'var(--ink)', dash: true }]} />
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>US capacity build-out by stage</div>
          <Frame years={years} ymax={ymax} ylabel="kt / yr">
            {cap.map((s) => (
              <path key={s.key} fill="none" stroke={s.color} strokeWidth={2}
                d={s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xi(i)},${yv(v)}`).join(' ')} />
            ))}
            <path d={demandLine} fill="none" stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="4 3" />
          </Frame>
          <Legend items={[...STAGE, { label: 'US demand', color: 'var(--ink)', dash: true }]} />
        </div>
      </div>
      <p style={{ fontSize: 11, opacity: 0.55, marginTop: 8, lineHeight: 1.5 }}>
        Perfect-foresight build-out, 2026–2035 (capacity is lead-time-gated but plans against known
        future demand). <b>Left:</b> the colored stack is the US supply mix; the hatched band on top is
        unmet demand, and the dashed line (the stack total) is US magnet demand. <b>Right:</b> US
        capacity rises mainly at the magnet stage — under the IRA-style content mandate only finished
        magnets must be US-made, so oxide/alloy can come from allies and upstream US stays near existing.
      </p>
    </section>
  );
}
