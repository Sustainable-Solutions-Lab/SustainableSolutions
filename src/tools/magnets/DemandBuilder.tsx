/**
 * Demand builder — the client-side demand layer of the explorer. Compose per-sector
 * IEA scenarios (e.g. high EV + low wind) and the four demand levers, see the
 * resulting magnet consumption AND Dy/Tb attribution by sector, and feed the two
 * demand-summary axes (demand_scale, dytb_intensity) into the supply explorer. All
 * arithmetic runs in the browser (demand.ts) — no solver.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  YEARS, SECTOR_KEYS, SECTORS_BY_SIZE, SECTOR_LABEL, SECTOR_COLOR, SCENARIO_NAMES, SCENARIO_LABEL,
  SCENARIO_TIP, DEFAULT_LEVERS, OFFSHORE_PMSG_DEFAULT, allScenario, sectorBreakdown, demandSummary,
  type Levers, type PerSectorScenario,
} from './demand';

// largest at the bottom of the stack; selection list + legend read in the same
// visual order (largest at the bottom of the list too).
const STACK_ORDER = SECTORS_BY_SIZE;            // [largest, …, smallest]
const LIST_ORDER = [...SECTORS_BY_SIZE].reverse(); // [smallest, …, largest]

const W = 440, H = 180, PADL = 40, PADR = 10, PADT = 12, PADB = 24;
const innerW = W - PADL - PADR, innerH = H - PADT - PADB;
const xi = (i: number) => PADL + (i / (YEARS.length - 1)) * innerW;

// Fixed y-axis ceilings (from the most-demanding case) so changing scenario moves
// the CURVES, not the axis — lower scenarios visibly drop.
const MAXLEV: Levers = { thrift: 0, ev_downshift: 0, re_free: 0, offshore_pmsg: 1 };
const MAXBD = sectorBreakdown(allScenario('NZE'), MAXLEV);
const peak = (bd: Record<string, number[]>) =>
  Math.max(1e-6, ...YEARS.map((_, i) => SECTOR_KEYS.reduce((a, k) => a + bd[k][i], 0)));
const MAG_MAX = peak(MAXBD.magnet) * 1.05;
const DYTB_MAX = peak(MAXBD.dytb) * 1.05;

// Per-lever plausibility thresholds in slider-VALUE units (a reduction for thrift /
// re_free / offshore, raw for downshift) — the single source for both the realism
// shading and the preset buttons. offshore is a reduction off OFFSHORE_PMSG_DEFAULT.
const LEV_PLAUSIBLE = { thrift: 0.3, ev_downshift: 0.3, re_free: 0.15, offshore: 0.2 };
const LEV_STRETCH = { thrift: 0.45, ev_downshift: 0.6, re_free: 0.3, offshore: 0.4 };
const presetLevers = (t: typeof LEV_PLAUSIBLE): Levers => ({
  thrift: t.thrift, ev_downshift: t.ev_downshift, re_free: t.re_free,
  offshore_pmsg: OFFSHORE_PMSG_DEFAULT - t.offshore,
});

function StackedArea({ series, ymax, ylabel }: {
  series: { key: string; color: string; values: number[] }[]; ymax: number; ylabel: string;
}) {
  const yv = (v: number) => PADT + innerH - (v / ymax) * innerH;
  // small axes (e.g. US Dy/Tb oxide, ~1–2 kt) need a decimal or integer ticks collide
  const tickDec = ymax < 5 ? 1 : 0;
  const lower = Array(YEARS.length).fill(0);
  const paths = series.map((s) => {
    const top = s.values.map((v, i) => lower[i] + Math.max(0, v));
    const d = [
      ...s.values.map((_, i) => `${i === 0 ? 'M' : 'L'}${xi(i)},${yv(top[i])}`),
      ...lower.map((_, i) => `L${xi(YEARS.length - 1 - i)},${yv(lower[YEARS.length - 1 - i])}`), 'Z',
    ].join(' ');
    for (let i = 0; i < YEARS.length; i++) lower[i] = top[i];
    return <path key={s.key} d={d} fill={s.color} fillOpacity={0.85} />;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = PADT + innerH - f * innerH;
        return <g key={f}>
          <line x1={PADL} y1={y} x2={W - PADR} y2={y} stroke="var(--rule)" strokeWidth={f === 0 ? 1 : 0.5} />
          <text x={PADL - 5} y={y} textAnchor="end" dominantBaseline="central" style={{ font: '400 8px var(--font-mono)', fill: 'var(--ink)', opacity: 0.5 }}>{(ymax * f).toFixed(tickDec)}</text>
        </g>;
      })}
      {YEARS.map((yr, i) => (i % 3 === 0 || i === YEARS.length - 1) && (
        <text key={yr} x={xi(i)} y={H - PADB + 12} textAnchor="middle" style={{ font: '400 8px var(--font-mono)', fill: 'var(--ink)', opacity: 0.5 }}>{`'${String(yr).slice(2)}`}</text>
      ))}
      <text x={9} y={PADT + innerH / 2} textAnchor="middle" transform={`rotate(-90 9 ${PADT + innerH / 2})`} style={{ font: '400 8px var(--font-mono)', fill: 'var(--ink)', opacity: 0.55 }}>{ylabel}</text>
      {paths}
    </svg>
  );
}

function Lever({ label, value, min, max, onChange, fmt, desc, plausible, stretch }: {
  label: string; value: number; min: number; max: number;
  onChange: (v: number) => void; fmt: (v: number) => string; desc: string;
  // value below `plausible` is a credible reduction; plausible→stretch is a stretch;
  // beyond `stretch` is aggressive/optimistic. Drives the shaded realism track.
  plausible?: number; stretch?: number;
}) {
  const [open, setOpen] = useState(false);
  const span = (max - min) || 1;
  const pPct = plausible != null ? Math.max(0, Math.min(100, ((plausible - min) / span) * 100)) : 100;
  const sPct = stretch != null ? Math.max(pPct, Math.min(100, ((stretch - min) / span) * 100)) : 100;
  const inZone = value <= (plausible ?? Infinity) ? 'plausible' : value <= (stretch ?? Infinity) ? 'a stretch' : 'aggressive';
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 11.5, marginBottom: 3 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {label}
          <button onClick={() => setOpen((o) => !o)} aria-label="What is this?" title="What is this?"
            style={{ width: 13, height: 13, borderRadius: '50%', border: '1px solid var(--rule-strong)',
              background: open ? 'var(--accent)' : 'transparent', color: open ? 'var(--paper)' : 'var(--ink-3)',
              font: '600 8.5px var(--font-mono)', lineHeight: 1, cursor: 'pointer', padding: 0, opacity: 0.85 }}>i</button>
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{fmt(value)}</span>
      </div>
      {/* Plausibility (green plausible · amber stretch · red aggressive) is painted
          directly onto the slider rail via --mag-track — no separate bar. */}
      <input type="range" min={min} max={max} step={0.01} value={value}
        title={plausible != null ? `Realism shading — at ${fmt(value)} this reduction looks ${inZone}. Green = plausible, amber = a stretch, red = aggressive.` : undefined}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: '100%',
          ...(plausible != null
            ? { ['--mag-track' as any]: `linear-gradient(90deg, #66C2A5 0 ${pPct}%, #FEE08B ${pPct}% ${sPct}%, #F46D43 ${sPct}% 100%)` }
            : {}),
        }} />
      {open && <p style={{ fontSize: 10.5, opacity: 0.6, margin: '5px 0 0', lineHeight: 1.4 }}>{desc}</p>}
    </div>
  );
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function DemandBuilder({ onSummary }: {
  onSummary: (s: { demand_scale: number; dytb_intensity: number; totalSeries: number[]; hiCoercShare: number }) => void;
}) {
  const [scenario, setScenario] = useState<PerSectorScenario>(() => allScenario('STEPS'));
  const [lv, setLv] = useState<Levers>(DEFAULT_LEVERS);

  const summary = useMemo(() => demandSummary(scenario, lv), [scenario, lv]);
  const breakdown = useMemo(() => sectorBreakdown(scenario, lv), [scenario, lv]);
  useEffect(() => { onSummary(summary); }, [summary, onSummary]);

  const magSeries = STACK_ORDER.map((k) => ({ key: k, color: SECTOR_COLOR[k], values: breakdown.magnet[k] }));
  const dytbSeries = STACK_ORDER.map((k) => ({ key: k, color: SECTOR_COLOR[k], values: breakdown.dytb[k] }));

  return (
    <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: '16px 20px', background: 'var(--paper)', marginBottom: 26 }}>
      <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: '0 0 8px' }}>Projected US magnet demand</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 320px) 1fr', gap: 24, alignItems: 'start' }} className="demand-grid">
        <div>
          <p style={{ fontSize: 12, opacity: 0.55, margin: '0 0 12px', lineHeight: 1.5 }}>
            Compose the <b>US</b> magnet-demand trajectory by sector (IEA scenarios) and shape it with
            the four levers.
          </p>
          <div style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.7, margin: '0 0 8px' }}>Demand scenario by sector</div>
          {LIST_ORDER.map((k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: SECTOR_COLOR[k], display: 'inline-block' }} />
                {SECTOR_LABEL[k] ?? k}
              </span>
              <select value={scenario[k]} onChange={(e) => setScenario({ ...scenario, [k]: e.target.value })}
                title={SCENARIO_TIP[scenario[k]]}
                style={{ font: '500 11px var(--font-mono)', padding: '2px 4px', borderRadius: 5, border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)', cursor: 'pointer' }}>
                {SCENARIO_NAMES.map((sc) => <option key={sc} value={sc}>{SCENARIO_LABEL[sc] ?? sc}</option>)}
              </select>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <span style={{ fontSize: 11, opacity: 0.55 }}>Set all:</span>
            {SCENARIO_NAMES.map((sc) => (
              <button key={sc} onClick={() => setScenario(allScenario(sc))} title={SCENARIO_TIP[sc]}
                style={{ font: '600 10px var(--font-mono)', padding: '3px 8px', borderRadius: 5, cursor: 'pointer', border: '1px solid var(--rule)', background: 'transparent', color: 'var(--ink)' }}>
                {SCENARIO_LABEL[sc] ?? sc}
              </button>
            ))}
          </div>

          <div style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.7, margin: '16px 0 4px' }}>Demand levers</div>
          <p style={{ fontSize: 10, opacity: 0.5, margin: '0 0 8px', lineHeight: 1.4 }}>
            The bar under each lever shades how optimistic the reduction is:
            <span style={{ color: '#66C2A5', fontWeight: 600 }}> plausible</span> ·
            <span style={{ color: '#D4A017', fontWeight: 600 }}> a stretch</span> ·
            <span style={{ color: '#F46D43', fontWeight: 600 }}> aggressive</span>. Thresholds are
            best-estimate (see each lever’s ⓘ) and meant to be refined.
          </p>
          <Lever label="Dy/Tb thrifting (material)" value={lv.thrift} min={0} max={0.6} plausible={LEV_PLAUSIBLE.thrift} stretch={LEV_STRETCH.thrift} onChange={(v) => setLv({ ...lv, thrift: v })} fmt={(v) => `−${pct(v)}`}
            desc="The % reduction in Dy/Tb (heavy rare earth) used per kg of magnet at a GIVEN coercivity grade — via grain-boundary diffusion, finer grains, or Ce/La substitution. Applied across all sectors. 0% = today's loadings. Realism: GBD alone cuts heavy-REE ~20–50% for a grade, so ≲30% is plausible, ~45% a stretch." />
          <Lever label="Hot-motor grade downshift" value={lv.ev_downshift} min={0} max={1} plausible={LEV_PLAUSIBLE.ev_downshift} stretch={LEV_STRETCH.ev_downshift} onChange={(v) => setLv({ ...lv, ev_downshift: v })} fmt={pct}
            desc="Better motor cooling / magnetic-circuit design lets hot-motor magnets (EVs, robotics, e-bikes) meet the same duty at a LOWER coercivity grade — which carries less Dy/Tb. Shifts those sectors' grade mix down a rung. 0% = today's grade mix. Realism: a partial downshift (~30%) is plausible with thermal design; downshifting most of the fleet is aggressive." />
          <Lever label="RE-free motor adoption" value={lv.re_free} min={0} max={0.5} plausible={LEV_PLAUSIBLE.re_free} stretch={LEV_STRETCH.re_free} onChange={(v) => setLv({ ...lv, re_free: v })} fmt={pct}
            desc="Share of motor demand (EVs, robotics, e-bikes) that switches to rare-earth-FREE designs (externally-excited or induction motors), removing their magnet demand entirely. 0% = all motors use permanent magnets today. Realism: RE-free motors are heavier/less efficient, so ~15% by 2035 is plausible (some OEMs are moving), >30% is aggressive." />
          <Lever label="Offshore PMSG share reduction" value={OFFSHORE_PMSG_DEFAULT - lv.offshore_pmsg} min={0} max={OFFSHORE_PMSG_DEFAULT} plausible={LEV_PLAUSIBLE.offshore} stretch={LEV_STRETCH.offshore} onChange={(v) => setLv({ ...lv, offshore_pmsg: OFFSHORE_PMSG_DEFAULT - v })} fmt={(v) => `−${pct(v)}`}
            desc={`Offshore wind is ~${pct(OFFSHORE_PMSG_DEFAULT)} NdFeB direct-drive PMSG by default. Drag right to reduce that share (a shift toward other generator types), which cuts offshore-wind magnet demand. 0 = today's ~${pct(OFFSHORE_PMSG_DEFAULT)}. Realism: PMSG is favored offshore for low O&M, so a ~20% shift to geared/alternatives is plausible, ~40% a stretch.`} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <span style={{ fontSize: 11, opacity: 0.55 }}>Set all:</span>
            {([['None', DEFAULT_LEVERS], ['Plausible limit', presetLevers(LEV_PLAUSIBLE)], ['Stretch', presetLevers(LEV_STRETCH)]] as [string, Levers][]).map(([lbl, target]) => (
              <button key={lbl} onClick={() => setLv(target)} title={`Set every demand lever to its ${lbl.toLowerCase()} value`}
                style={{ font: '600 10px var(--font-mono)', padding: '3px 8px', borderRadius: 5, cursor: 'pointer', border: '1px solid var(--rule)', background: 'transparent', color: 'var(--ink)' }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <div className="demand-charts">
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 2 }}>US magnet consumption by sector</div>
          <StackedArea series={magSeries} ymax={MAG_MAX} ylabel="kt / yr" />
          <div style={{ fontSize: 12.5, fontWeight: 600, margin: '10px 0 2px' }}>US Dy/Tb demand by sector <span style={{ fontWeight: 400, opacity: 0.55 }}>— where the heavy chokepoint comes from</span></div>
          <StackedArea series={dytbSeries} ymax={DYTB_MAX} ylabel="kt Dy/Tb" />
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 12px', marginTop: 8 }}>
            {LIST_ORDER.map((k) => (
              <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: SECTOR_COLOR[k], display: 'inline-block' }} />
                <span style={{ opacity: 0.7 }}>{SECTOR_LABEL[k] ?? k}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--rule)', fontSize: 12 }}>
        <span style={{ opacity: 0.6 }}>Feeding the supply explorer →</span>
        <span>US magnet demand <b style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{summary.demand_scale.toFixed(2)}×</b> pledges-case</span>
        <span>Dy/Tb intensity <b style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{summary.dytb_intensity.toFixed(2)}×</b> pledges-case</span>
      </div>
      <details style={{ marginTop: 10, fontSize: 10.5, opacity: 0.6 }}>
        <summary style={{ cursor: 'pointer' }}>Sources &amp; caveats</summary>
        <div style={{ marginTop: 6, lineHeight: 1.55 }}>
          Global NdFeB demand ~240&nbsp;kt (2023), China ~94% of production [SMM]. Magnet intensity:
          ~1.5&nbsp;kg/EV [Thunder Said Energy] and ~600&nbsp;kg/MW for offshore direct-drive PMSG
          [Pavel et&nbsp;al. 2017]. Activity (EV sales, wind capacity) by scenario: IEA
          <i>Global EV Outlook</i> and <i>WEO / Renewables</i>. Magnet demand by application: IEA
          <i>Global Critical Minerals Outlook 2024</i>, Adamas Intelligence, Benchmark Mineral
          Intelligence. Reserves / production / end-use: USGS <i>Mineral Commodity Summaries</i>.
          US shares grounded in ~10% of global EV sales and ~5.5% of wind additions [IEA; GWEC 2023];
          the catch-all sector split and within-sector US shares are best-estimate, since the precise
          breakdown is proprietary.
        </div>
      </details>
      <style>{`@media (max-width: 720px){ .demand-grid{ grid-template-columns:1fr !important; } .demand-charts{ display:none !important; } }`}</style>
    </section>
  );
}
