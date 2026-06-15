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
import { useState } from 'react';
import type { Scenario } from './interp';
import { CLASS_INTENSITY } from './realworld';

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
// fine red stripes over an OPAQUE tinted base (mix the colour into the paper) so the
// supply bands underneath don't bleed through; theme-aware via var(--paper).
const hatchBg = (c: string) => `repeating-linear-gradient(45deg, ${c} 0 1.5px, transparent 1.5px 5px), color-mix(in srgb, ${c} 18%, var(--paper))`;

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
        <pattern id={hatchId} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(-45)">
          <rect width="5" height="5" style={{ fill: `color-mix(in srgb, ${UNMET} 20%, var(--paper))` }} />
          <line x1="0" y1="0" x2="0" y2="5" stroke={UNMET} strokeWidth="1.5" />
        </pattern>
        <pattern id={hatchStdId} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(-45)">
          <rect width="5" height="5" style={{ fill: `color-mix(in srgb, ${UNMET_STD} 20%, var(--paper))` }} />
          <line x1="0" y1="0" x2="0" y2="5" stroke={UNMET_STD} strokeWidth="1.5" />
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
  const [cls, setCls] = useState<'total' | 'heavy' | 'light'>('total');
  const n = years.length;
  const xi = (i: number) => PADL + (i / (n - 1)) * innerW;
  const hasRe = !!sc.path.us_mix_re;
  const isClass = cls !== 'total' && hasRe;

  // stack a list of {vals, color, hatchId?} bottom-up into <path> areas
  const stackAreas = (items: { label: string; color: string; hatchId?: string; vals: number[] }[],
                      yv: (v: number) => number) => {
    const lower = Array(n).fill(0);
    return items.map((s) => {
      const top = s.vals.map((v, i) => lower[i] + Math.max(0, v));
      const d = [
        ...top.map((t, i) => `${i === 0 ? 'M' : 'L'}${xi(i)},${yv(t)}`),
        ...lower.map((_, i) => `L${xi(n - 1 - i)},${yv(lower[n - 1 - i])}`), 'Z',
      ].join(' ');
      for (let i = 0; i < n; i++) lower[i] = top[i];
      return <path key={s.label} d={d} fill={s.hatchId ? `url(#${s.hatchId})` : s.color} fillOpacity={s.hatchId ? 1 : 0.85} />;
    });
  };

  // assemble the view (title / ymax / ylabel / areas / demand line / legend / caption)
  // for whichever mode is active
  let title: string, ymax: number, ylabel: string, areas: JSX.Element[];
  let demandLine: string, legendItems: { label: string; color: string; dash?: boolean; hatch?: boolean }[];
  let caption: JSX.Element;

  if (isClass) {
    // ---- per-class OXIDE sourcing: how the US's Nd/Pr or Dy/Tb oxide need is met ----
    const clsKey = cls as 'heavy' | 'light';
    const re = sc.path.us_mix_re![clsKey];
    const g = (k: string) => re[k] ?? Array(n).fill(0);
    ymax = usDemandMax * CLASS_INTENSITY[clsKey];   // fixed oxide axis ∝ the fixed magnet axis
    const yv = (v: number) => PADT + innerH - (v / ymax) * innerH;
    const dom = g('domestic'), al = g('allied'), cn = g('china'), un = g('unmet');
    const demand = years.map((_, i) => (dom[i] || 0) + (al[i] || 0) + (cn[i] || 0) + (un[i] || 0));
    demandLine = demand.map((v, i) => `${i === 0 ? 'M' : 'L'}${xi(i)},${yv(v)}`).join(' ');
    const unmetColor = clsKey === 'heavy' ? UNMET : UNMET_STD;
    const unmetHatch = clsKey === 'heavy' ? hatchId : hatchStdId;
    areas = stackAreas([
      { label: 'US-made', color: '#66C2A5', vals: dom },
      { label: 'Allies', color: '#FDAE61', vals: al },
      { label: 'China', color: '#D53E4F', vals: cn },
      { label: 'Unmet', color: unmetColor, hatchId: unmetHatch, vals: un },
    ], yv);
    const ox = clsKey === 'heavy' ? 'Dy/Tb' : 'Nd/Pr';
    title = `How US demand for ${ox} oxide is met, 2026–2035`;
    ylabel = `kt ${ox} oxide / yr`;
    legendItems = [...MIX, { label: 'Unmet', color: unmetColor, hatch: true },
      { label: `${ox} demand`, color: 'var(--ink)', dash: true }];
    caption = (
      <p style={{ fontSize: 11, opacity: 0.55, marginTop: 8, lineHeight: 1.5 }}>
        The same picture at the <i>oxide</i> level for {clsKey === 'heavy'
          ? <><span style={{ color: UNMET }}>heavy</span> rare earths (Dy/Tb — the separation chokepoint)</>
          : <><span style={{ color: '#3288BD' }}>light</span> rare earths (Nd/Pr — the magnet bulk)</>}:
        each year, how the US’s {ox} oxide need (dashed line = the stack total) is met by
        <span style={{ color: '#66C2A5' }}> US-made</span>, <span style={{ color: '#FDAE61' }}>allied</span>,
        and <span style={{ color: '#D53E4F' }}>Chinese</span> oxide, with any shortfall hatched on top.
        {clsKey === 'heavy' && ' Heavy oxide is ~10× smaller in tonnage than light, but it is the binding constraint.'}
      </p>
    );
  } else {
    // ---- finished-MAGNET sourcing (total), with stockpile + coercivity-split unmet ----
    ymax = usDemandMax;
    const yv = (v: number) => PADT + innerH - (v / ymax) * innerH;
    const get = (k: string) => sc.path.us_mix[k] ?? Array(n).fill(0);
    // US demand = US-made + allies + China + stockpile draw-down + unmet. The
    // stockpile band is carved out of unmet, so the total (demand line) is unchanged.
    const stockVals = get('stockpile');
    const unmetTot = get('unmet');
    const usDemand = years.map((_, i) => (get('domestic')[i] || 0) + (get('allied')[i] || 0)
      + (get('china')[i] || 0) + (stockVals[i] || 0) + (unmetTot[i] || 0));
    demandLine = usDemand.map((v, i) => `${i === 0 ? 'M' : 'L'}${xi(i)},${yv(v)}`).join(' ');
    // A Dy/Tb shortage falls on HIGH-COERCIVITY grades first; the remainder (only
    // under a broad ban) is standard-grade.
    const unmetHi = unmetTot.map((u: number, i: number) => Math.min(u, hiCoercShare * usDemand[i]));
    const unmetStd = unmetTot.map((u: number, i: number) => Math.max(0, u - unmetHi[i]));
    const hasStock = stockVals.some((v: number) => v > 0.01);
    const hasStd = unmetStd.some((v: number) => v > 0.01);
    areas = stackAreas([
      { label: 'US-made', color: '#66C2A5', vals: get('domestic') },
      { label: 'Allies', color: '#FDAE61', vals: get('allied') },
      { label: 'China', color: '#D53E4F', vals: get('china') },
      ...(hasStock ? [{ label: 'From stockpile', color: STOCK, vals: stockVals }] : []),
      ...(hasStd ? [{ label: 'Unmet — standard grade', color: UNMET_STD, hatchId: hatchStdId, vals: unmetStd }] : []),
      { label: 'Unmet — high-coercivity', color: UNMET, hatchId, vals: unmetHi },
    ], yv);
    title = 'How US demand for magnets is met, 2026–2035';
    ylabel = 'kt magnet / yr';
    legendItems = [...MIX,
      ...(hasStock ? [{ label: 'From stockpile', color: STOCK }] : []),
      ...(hasStd ? [{ label: 'Unmet — standard', color: UNMET_STD, hatch: true }] : []),
      { label: 'Unmet — high-coercivity', color: UNMET, hatch: true },
      { label: 'US demand', color: 'var(--ink)', dash: true }];
    caption = (
      <p style={{ fontSize: 11, opacity: 0.55, marginTop: 8, lineHeight: 1.5 }}>
        Each year, how US demand for <i>finished magnets</i> (the dashed line = the stack total) is met
        — by <span style={{ color: '#66C2A5' }}>US-made</span>, <span style={{ color: '#FDAE61' }}>allied</span>,
        and <span style={{ color: '#D53E4F' }}>Chinese</span> supply — with any shortfall hatched on top.
        Unmet is split by coercivity: a Dy/Tb shortage hits the <span style={{ color: UNMET }}>high-
        coercivity</span> grades (EV traction, wind, defense) first. Switch to <b>Dy/Tb</b> or <b>Nd/Pr</b>
        above to see the same flows at the oxide level. Perfect-foresight, lead-time-gated build-out.
      </p>
    );
  }

  return (
    <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 16, background: 'var(--paper)', marginTop: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: 0 }}>{title}</h2>
        {hasRe && (
          <div style={{ display: 'flex', gap: 4 }}>
            {(['total', 'heavy', 'light'] as const).map((c) => (
              <button key={c} onClick={() => setCls(c)}
                title={c === 'heavy' ? 'Dy/Tb (heavy) oxide sourcing' : c === 'light' ? 'Nd/Pr (light) oxide sourcing' : 'finished-magnet sourcing'}
                style={{ font: '600 10px var(--font-mono)', padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                  border: `1px solid ${cls === c ? 'var(--accent)' : 'var(--rule-strong)'}`, background: cls === c ? 'var(--paper-2)' : 'transparent', color: 'var(--ink)' }}>
                {c === 'total' ? 'Total' : c === 'heavy' ? 'Dy/Tb' : 'Nd/Pr'}
              </button>
            ))}
          </div>
        )}
      </div>
      <Frame years={years} ymax={ymax} ylabel={ylabel}>
        {areas}
        <path d={demandLine} fill="none" stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="4 3" />
      </Frame>
      <Legend items={legendItems} />
      {caption}
    </section>
  );
}
