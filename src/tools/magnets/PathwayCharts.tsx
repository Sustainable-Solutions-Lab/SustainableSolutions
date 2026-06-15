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
  { key: 'domestic', label: 'US-made', color: '#66C2A5' },
  { key: 'allied', label: 'Allies', color: '#FDAE61' },
  { key: 'china', label: 'China', color: '#D53E4F' },
];
const STAGE = [
  { key: 'mining', label: 'Mining', color: '#F46D43' },
  { key: 'separation', label: 'Separation', color: '#D53E4F' },
  { key: 'alloy', label: 'Alloy', color: '#FDAE61' },
  { key: 'magnet', label: 'Magnet', color: '#3288BD' },
];
const UNMET = '#9E0142';      // high-coercivity (Dy/Tb) unmet — the critical shortfall
const UNMET_STD = '#F46D43';  // standard-grade unmet (appears only under a broad shortage)
const STOCK = '#5E4FA2';   // strategic stockpile draw-down
const hatchId = 'unmet-hatch', hatchStdId = 'unmet-hatch-std';
// red stripes on a transparent background (so it reads the same in light + dark)
const hatchBg = (c: string) => `repeating-linear-gradient(45deg, ${c}, ${c} 3px, transparent 3px, transparent 6px)`;

function Legend({ items }: { items: { label: string; color: string; dash?: boolean; hatch?: boolean }[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 12px', marginTop: 6 }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
          {it.dash
            ? <span style={{ width: 12, height: 0, borderTop: `2px dashed ${it.color}`, display: 'inline-block' }} />
            : <span style={{ width: 10, height: 10, borderRadius: 2, display: 'inline-block',
                background: it.hatch ? hatchBg(it.color) : it.color }} />}
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
        <pattern id={hatchId} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={UNMET} strokeWidth="3" />
        </pattern>
        <pattern id={hatchStdId} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={UNMET_STD} strokeWidth="3" />
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

export default function PathwayCharts({ sc, years, usDemandMax, hiCoercShare }: {
  sc: Scenario; years: number[]; usDemandMax: number; hiCoercShare: number;
}) {
  const n = years.length;
  const xi = (i: number) => PADL + (i / (n - 1)) * innerW;
  const ymax = usDemandMax;
  const yv = (v: number) => PADT + innerH - (v / ymax) * innerH;
  const get = (k: string) => sc.path.us_mix[k] ?? Array(n).fill(0);

  // US demand = the model's US supply mix total (US-made + allies + China +
  // stockpile draw-down + unmet). The stockpile band is carved out of unmet, so
  // the total — and thus the demand line — is unchanged whether or not it's on.
  const stockVals = get('stockpile');
  const unmetTot = get('unmet');
  const usDemand = years.map((_, i) => (get('domestic')[i] || 0) + (get('allied')[i] || 0)
    + (get('china')[i] || 0) + (stockVals[i] || 0) + (unmetTot[i] || 0));
  const demandLine = usDemand.map((v, i) => `${i === 0 ? 'M' : 'L'}${xi(i)},${yv(v)}`).join(' ');

  // A Dy/Tb shortage falls on HIGH-COERCIVITY grades first — low grades need little
  // Dy/Tb and can still be made — so attribute unmet to high-coercivity up to that
  // share of demand; the remainder (only under a broad ban) is standard-grade.
  const unmetHi = unmetTot.map((u: number, i: number) => Math.min(u, hiCoercShare * usDemand[i]));
  const unmetStd = unmetTot.map((u: number, i: number) => Math.max(0, u - unmetHi[i]));
  const hasStock = stockVals.some((v: number) => v > 0.01);
  const hasStd = unmetStd.some((v: number) => v > 0.01);

  // chart 1: stacked supply + stockpile draw + unmet (split by coercivity) on top
  const stackItems = [
    { label: 'US-made', color: '#66C2A5', vals: get('domestic') },
    { label: 'Allies', color: '#FDAE61', vals: get('allied') },
    { label: 'China', color: '#D53E4F', vals: get('china') },
    ...(hasStock ? [{ label: 'From stockpile', color: STOCK, vals: stockVals }] : []),
    ...(hasStd ? [{ label: 'Unmet — standard grade', color: UNMET_STD, hatchId: hatchStdId, vals: unmetStd }] : []),
    { label: 'Unmet — high-coercivity', color: UNMET, hatchId, vals: unmetHi },
  ];
  const lower = Array(n).fill(0);
  const areas = stackItems.map((s: any) => {
    const vals: number[] = s.vals;
    const top = vals.map((v, i) => lower[i] + Math.max(0, v));
    const d = [
      ...top.map((t, i) => `${i === 0 ? 'M' : 'L'}${xi(i)},${yv(t)}`),
      ...lower.map((_, i) => `L${xi(n - 1 - i)},${yv(lower[n - 1 - i])}`), 'Z',
    ].join(' ');
    for (let i = 0; i < n; i++) lower[i] = top[i];
    return <path key={s.label} d={d} fill={s.hatchId ? `url(#${s.hatchId})` : s.color} fillOpacity={s.hatchId ? 1 : 0.85} />;
  });

  return (
    <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 16, background: 'var(--paper)', marginTop: 22 }}>
      <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: '0 0 10px' }}>How US demand for magnets is met, 2026–2035</h2>
      <Frame years={years} ymax={ymax} ylabel="kt magnet / yr">
        {areas}
        <path d={demandLine} fill="none" stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="4 3" />
      </Frame>
      <Legend items={[...MIX,
        ...(hasStock ? [{ label: 'From stockpile', color: STOCK }] : []),
        ...(hasStd ? [{ label: 'Unmet — standard', color: UNMET_STD, hatch: true }] : []),
        { label: 'Unmet — high-coercivity', color: UNMET, hatch: true },
        { label: 'US demand', color: 'var(--ink)', dash: true }]} />
      <p style={{ fontSize: 11, opacity: 0.55, marginTop: 8, lineHeight: 1.5 }}>
        Each year, how US demand for <i>finished magnets</i> (the dashed line = the stack total) is met
        — by <span style={{ color: '#66C2A5' }}>US-made</span>, <span style={{ color: '#FDAE61' }}>allied</span>,
        and <span style={{ color: '#D53E4F' }}>Chinese</span> supply — with any shortfall hatched on top.
        Unmet is split by coercivity: a Dy/Tb shortage hits the <span style={{ color: UNMET }}>high-
        coercivity</span> grades (EV traction, wind, defense) first. Perfect-foresight, lead-time-gated
        build-out.
      </p>
    </section>
  );
}
