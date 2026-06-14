/**
 * Demand builder — the client-side demand layer of the explorer. Compose per-sector
 * IEA scenarios (e.g. high EV + low wind) and the four demand levers, see the
 * resulting magnet consumption AND Dy/Tb attribution by sector, and feed the two
 * demand-summary axes (demand_scale, dytb_intensity) into the supply explorer. All
 * arithmetic runs in the browser (demand.ts) — no solver.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  YEARS, SECTOR_KEYS, SECTOR_LABEL, SECTOR_COLOR, SCENARIO_NAMES, SCENARIO_LABEL, SCENARIO_TIP,
  DEFAULT_LEVERS, allScenario, sectorBreakdown, demandSummary, type Levers, type PerSectorScenario,
} from './demand';

const W = 440, H = 200, PADL = 40, PADR = 10, PADT = 12, PADB = 24;
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

function StackedArea({ series, ymax, ylabel }: {
  series: { key: string; color: string; values: number[] }[]; ymax: number; ylabel: string;
}) {
  const yv = (v: number) => PADT + innerH - (v / ymax) * innerH;
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
          <text x={PADL - 5} y={y} textAnchor="end" dominantBaseline="central" style={{ font: '400 8px var(--font-mono)', fill: 'var(--ink)', opacity: 0.5 }}>{Math.round(ymax * f)}</text>
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

function Lever({ label, value, min, max, onChange, fmt }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void; fmt: (v: number) => string;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 3 }}>
        <span>{label}</span><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={0.01} value={value}
        onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
    </div>
  );
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function DemandBuilder({ onSummary }: {
  onSummary: (s: { demand_scale: number; dytb_intensity: number; totalSeries: number[] }) => void;
}) {
  const [scenario, setScenario] = useState<PerSectorScenario>(() => allScenario('APS'));
  const [lv, setLv] = useState<Levers>(DEFAULT_LEVERS);

  const summary = useMemo(() => demandSummary(scenario, lv), [scenario, lv]);
  const breakdown = useMemo(() => sectorBreakdown(scenario, lv), [scenario, lv]);
  useEffect(() => { onSummary(summary); }, [summary, onSummary]);

  const magSeries = SECTOR_KEYS.map((k) => ({ key: k, color: SECTOR_COLOR[k], values: breakdown.magnet[k] }));
  const dytbSeries = SECTOR_KEYS.map((k) => ({ key: k, color: SECTOR_COLOR[k], values: breakdown.dytb[k] }));

  return (
    <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20, background: 'var(--paper)', marginBottom: 26 }}>
      <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: '0 0 4px' }}>Demand builder</h2>
      <p style={{ fontSize: 12, opacity: 0.55, margin: '0 0 14px', lineHeight: 1.5 }}>
        Select future demand trajectory by sector and shape it with the four levers. The supply
        explorer below responds via two summary dials at bottom.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 320px) 1fr', gap: 24, alignItems: 'start' }} className="demand-grid">
        <div>
          <div style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.7, margin: '0 0 8px' }}>Demand scenario by sector</div>
          {SECTOR_KEYS.map((k) => (
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

          <div style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.7, margin: '16px 0 8px' }}>Demand levers</div>
          <Lever label="Dy/Tb thrifting (material)" value={lv.thrift} min={0} max={0.6} onChange={(v) => setLv({ ...lv, thrift: v })} fmt={(v) => `−${pct(v)}`} />
          <Lever label="EV grade-downshift (design)" value={lv.ev_downshift} min={0} max={1} onChange={(v) => setLv({ ...lv, ev_downshift: v })} fmt={pct} />
          <Lever label="RE-free motor adoption" value={lv.re_free} min={0} max={0.5} onChange={(v) => setLv({ ...lv, re_free: v })} fmt={pct} />
          <Lever label="Offshore PMSG share" value={lv.offshore_pmsg} min={0} max={1} onChange={(v) => setLv({ ...lv, offshore_pmsg: v })} fmt={pct} />
        </div>

        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 2 }}>Magnet consumption by sector</div>
          <StackedArea series={magSeries} ymax={MAG_MAX} ylabel="kt / yr" />
          <div style={{ fontSize: 12.5, fontWeight: 600, margin: '10px 0 2px' }}>Dy/Tb demand by sector <span style={{ fontWeight: 400, opacity: 0.55 }}>— where the heavy chokepoint comes from</span></div>
          <StackedArea series={dytbSeries} ymax={DYTB_MAX} ylabel="kt Dy/Tb" />
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 12px', marginTop: 8 }}>
            {SECTOR_KEYS.map((k) => (
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
        <span>Total demand <b style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{summary.demand_scale.toFixed(2)}×</b> pledges-case</span>
        <span>Dy/Tb intensity <b style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{summary.dytb_intensity.toFixed(2)}×</b> pledges-case</span>
      </div>
      <style>{`@media (max-width: 720px){ .demand-grid{ grid-template-columns:1fr !important; } }`}</style>
    </section>
  );
}
