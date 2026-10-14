/**
 * The result panels: headline numbers, the "what changed" line, warnings,
 * product slate, margin waterfall and emissions by source.
 */
import { useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import {
  GASOLINE_MIN_RON, H2_SOURCES, PRODUCTS, PRODUCT_BBL_PER_T, PRODUCT_COLOR, PRODUCT_LABEL,
  type ProductId,
} from './data.ts';
import type { Result, State } from './model.ts';
import { Info } from './Controls.tsx';
import { LEVER_INFO } from './info.ts';

const DAYS = 365;
export const perBbl = (r: Result, usdPerDay: number) => (r.crudeBbl > 0 ? usdPerDay / r.crudeBbl : 0);
const money = (v: number, d = 1) => `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(d)}`;
const signed = (v: number, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`;

export function PanelBox({ title, info, children, aside }: { title: string; info?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section style={{ border: '1px solid var(--rule)', borderRadius: 8, padding: '10px 12px', background: 'var(--paper)', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <h2 style={{ font: '600 11px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-2)', margin: 0 }}>{title}</h2>
        {info && <Info label={title}>{info}</Info>}
        {aside && <div style={{ marginLeft: 'auto' }}>{aside}</div>}
      </div>
      {children}
    </section>
  );
}

// ── Headline numbers ────────────────────────────────────────────────────────
/** Change against the baseline. `good` is the sign that counts as better
 *  (+1 higher is better, −1 lower is better, 0 neutral). */
type Delta = { d: number; base: number; unit: string; digits: number; good: 1 | -1 | 0; prefix?: string };
function DeltaLine({ x }: { x: Delta }) {
  const tiny = Math.abs(x.d) < 0.5 * 10 ** -x.digits;
  if (tiny) return <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>no change vs start</div>;
  const better = x.good === 0 ? null : Math.sign(x.d) === x.good;
  const pct = Math.abs(x.base) > 1e-9 ? (100 * x.d) / Math.abs(x.base) : null;
  const color = better === null ? 'var(--ink-2)' : better ? 'var(--positive)' : 'var(--negative)';
  return (
    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color }}>
      {x.d > 0 ? '▲' : '▼'} {x.d > 0 ? '+' : '−'}{x.prefix ?? ''}{Math.abs(x.d).toFixed(x.digits)}{x.unit}
      {pct !== null && Math.abs(pct) < 1000 && ` (${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(0)}%)`}
      <span style={{ color: 'var(--ink-3)' }}> vs start</span>
    </div>
  );
}

function Kpi({ label, value, sub, warn, info, delta }: { label: string; value: string; sub: string; warn?: boolean; info?: ReactNode; delta?: Delta | null }) {
  return (
    <div style={{ border: '1px solid var(--rule)', borderRadius: 6, padding: '6px 10px', background: 'var(--paper)', minWidth: 0,
                  borderLeft: warn ? '2px solid var(--accent)' : '1px solid var(--rule)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, font: '600 10px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
        {label}{info && <Info label={label}>{info}</Info>}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 19, fontWeight: 600, color: warn ? 'var(--accent)' : 'var(--ink)', lineHeight: 1.25 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{sub}</div>
      {delta && <DeltaLine x={delta} />}
    </div>
  );
}

const kpiValues = (r: Result) => ({
  cash: perBbl(r, r.econ.cash), net: perBbl(r, r.econ.net),
  co2: (1000 * r.scope1) / (r.crudeBbl || 1), ron: r.gasolineT > 0 ? r.ron : 0, h2: r.h2.imported,
});

/** Headline numbers. With `base` (the start of the last story picked), each
 *  card also shows its change since then, green when better, red when worse. */
export function Kpis({ r, s, base, baseName }: { r: Result; s: State; base?: Result | null; baseName?: string | null }) {
  const v = kpiValues(r), b = base ? kpiValues(base) : null;
  const dl = (k: keyof typeof v, unit: string, digits: number, good: 1 | -1 | 0, prefix?: string): Delta | null =>
    b ? { d: v[k] - b[k], base: b[k], unit, digits, good, prefix } : null;
  const moved = b && (Object.keys(v) as (keyof typeof v)[]).some((k) => Math.abs(v[k] - b[k]) > 1e-6);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        <Kpi label="Cash margin" value={`${money(v.cash, 2)}/bbl`} sub={`${money((r.econ.cash * DAYS) / 1e6, 0)}M a year`} warn={v.cash < 0}
          delta={moved ? dl('cash', '/bbl', 2, 1, '$') : null} />
        <Kpi label="Net margin" value={`${money(v.net, 2)}/bbl`} sub={`after ${money(perBbl(r, r.econ.fixed), 2)}/bbl fixed costs`} warn={v.net < 0}
          delta={moved ? dl('net', '/bbl', 2, 1, '$') : null} />
        <Kpi label="Direct CO₂" value={`${v.co2.toFixed(1)} kg/bbl`} sub={`${((r.scope1 * DAYS) / 1e6).toFixed(2)} Mt a year`}
          delta={moved ? dl('co2', ' kg/bbl', 1, -1) : null} />
        <Kpi label="Gasoline octane" value={r.gasolineT > 0 ? `RON ${r.ron.toFixed(1)}` : 'None made'}
          sub={r.ronShort > 0 ? `${r.ronShort.toFixed(1)} below the ${GASOLINE_MIN_RON} spec` : `spec ${GASOLINE_MIN_RON}`}
          warn={r.ronShort > 0} info={LEVER_INFO.octane} delta={moved && r.gasolineT > 0 && base!.gasolineT > 0 ? dl('ron', '', 1, 1) : null} />
        <Kpi label="Hydrogen bought" value={`${Math.round(r.h2.imported)} t/d`}
          sub={r.h2.imported > 0 ? H2_SOURCES[s.h2Source].label : `${Math.round(r.h2.surplus)} t/d spare, burned as fuel`}
          delta={moved ? dl('h2', ' t/d', 0, 0) : null} />
      </div>
      {moved && baseName && (
        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--ink-3)' }}>
          Coloured figures compare with the start of the “{baseName}” story: green is better, red is worse.
        </p>
      )}
    </div>
  );
}

// ── What changed ────────────────────────────────────────────────────────────
export function Changed({ label, base, r }: { label: string | null; base: Result | null; r: Result }) {
  if (!label || !base) return null;
  const dm = perBbl(r, r.econ.cash) - perBbl(base, base.econ.cash);
  const dmYr = ((r.econ.cash - base.econ.cash) * DAYS) / 1e6;
  const de = (1000 * r.scope1) / (r.crudeBbl || 1) - (1000 * base.scope1) / (base.crudeBbl || 1);
  // The product whose share of crude moved most.
  let top: { p: ProductId; d: number } | null = null;
  for (const p of PRODUCTS) {
    if (p === 'fuelGas') continue;
    const d = 100 * (r.products[p] / (r.crudeT || 1) - base.products[p] / (base.crudeT || 1));
    if (!top || Math.abs(d) > Math.abs(top.d)) top = { p, d };
  }
  const quiet = Math.abs(dm) < 0.005 && Math.abs(de) < 0.05 && (!top || Math.abs(top.d) < 0.05);
  return (
    <div aria-live="polite" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 12px', fontSize: 12, color: 'var(--ink-2)', margin: '6px 0 0' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <ArrowRight size={13} strokeWidth={1.5} /><span>Since you changed <b style={{ color: 'var(--ink)' }}>{label}</b>:</span>
      </span>
      {quiet ? <span>no change</span> : (
        <>
          <span>cash margin <b style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>{signed(dm, 2)} $/bbl</b> ({signed(dmYr, 0)} $M/yr)</span>
          <span>CO₂ <b style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>{signed(de, 1)} kg/bbl</b></span>
          {top && Math.abs(top.d) >= 0.05 && <span>{PRODUCT_LABEL[top.p].toLowerCase()} <b style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>{signed(top.d, 1)} points</b> of crude</span>}
        </>
      )}
    </div>
  );
}

// ── Warnings ────────────────────────────────────────────────────────────────
export function Warnings({ r }: { r: Result }) {
  const items: { key: string; text: string; strong: boolean }[] = [
    ...r.spills.map((s, i) => ({ key: `s${i}`, text: s.text, strong: true })),
    ...(r.ronShort > 0 ? [{ key: 'ron', strong: true, text: `Gasoline is ${r.ronShort.toFixed(1)} RON below spec, sold at a discount. Raise reformer severity, or add isomerization or alkylation.` }] : []),
    ...r.notes.map((n, i) => ({ key: `n${i}`, text: n, strong: false })),
  ];
  if (!items.length) return null;
  return (
    <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map((w) => (
        <li key={w.key} style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 5, fontSize: 11.5, lineHeight: 1.35,
                                 padding: '3px 8px', borderRadius: 4, background: w.strong ? 'var(--accent-bg)' : 'var(--paper-3)',
                                 border: `1px solid ${w.strong ? 'var(--accent)' : 'var(--rule)'}`, color: 'var(--ink)' }}>
          {w.strong && <AlertTriangle size={13} strokeWidth={1.5} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />}
          {w.text}
        </li>
      ))}
    </ul>
  );
}

// ── Product slate ───────────────────────────────────────────────────────────
export function Slate({ r }: { r: Result }) {
  const rows = PRODUCTS.filter((p) => r.products[p] > 0.5);
  const max = Math.max(...rows.map((p) => r.products[p]));
  return (
    <PanelBox title="Product slate">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ font: '600 10px var(--font-mono)', color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <th style={{ textAlign: 'left', fontWeight: 600, padding: '0 0 4px' }}>Product</th>
            <th style={{ textAlign: 'right', fontWeight: 600 }}>t/d</th>
            <th style={{ textAlign: 'right', fontWeight: 600, paddingLeft: 10 }}>kb/d</th>
            <th style={{ textAlign: 'right', fontWeight: 600, width: '34%' }}>% of crude</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const t = r.products[p], bpt = PRODUCT_BBL_PER_T[p];
            const share = (100 * t) / (r.crudeT || 1);
            return (
              <tr key={p} style={{ borderTop: '1px solid var(--rule)' }}>
                <td style={{ padding: '3px 0', whiteSpace: 'nowrap' }}>
                  <span aria-hidden style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: PRODUCT_COLOR[p], marginRight: 6, verticalAlign: 'middle' }} />
                  {PRODUCT_LABEL[p]}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Math.round(t).toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', paddingLeft: 10, color: bpt ? 'var(--ink)' : 'var(--ink-3)' }}>{bpt ? ((t * bpt) / 1000).toFixed(1) : '–'}</td>
                <td style={{ paddingLeft: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                    <div style={{ flex: 1, height: 8, minWidth: 30 }}>
                      <div style={{ width: `${(100 * t) / max}%`, height: '100%', background: PRODUCT_COLOR[p] }} />
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', minWidth: 34, textAlign: 'right' }}>{share.toFixed(1)}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.4 }}>
        Shares are by mass. Barrels are shown for liquid fuels only. Fuel gas is burned on site; any it cannot use is sold as fuel.
      </p>
    </PanelBox>
  );
}

// ── Margin waterfall ────────────────────────────────────────────────────────
export function Waterfall({ r }: { r: Result }) {
  const [unit, setUnit] = useState<'bbl' | 'yr'>('bbl');
  const e = r.econ;
  const f = (usdPerDay: number) => (unit === 'bbl' ? perBbl(r, usdPerDay) : (usdPerDay * DAYS) / 1e6);
  type Row = { label: string; v: number; kind: 'gain' | 'cost' | 'total' };
  const rows: Row[] = [
    { label: 'Product revenue', v: f(e.revenue), kind: 'gain' },
    { label: 'Crude', v: -f(e.crude), kind: 'cost' },
    ...(e.plantOil > 0 ? [{ label: 'Plant oil', v: -f(e.plantOil), kind: 'cost' as const }] : []),
    { label: 'Natural gas', v: -f(e.gas), kind: 'cost' },
    { label: 'Electricity', v: -f(e.power), kind: 'cost' },
    { label: 'Variable opex', v: -f(e.vom), kind: 'cost' },
    { label: 'Carbon cost', v: -f(e.carbon), kind: 'cost' },
    { label: 'Cash margin', v: f(e.cash), kind: 'total' },
    { label: 'Fixed costs', v: -f(e.fixed), kind: 'cost' },
    { label: 'Net margin', v: f(e.net), kind: 'total' },
  ];
  // Running position for the floating bars.
  let run = 0;
  const bars = rows.map((row) => {
    if (row.kind === 'total') { run = row.v; return { ...row, a: 0, b: row.v }; }
    const a = run; run += row.v; return { ...row, a, b: run };
  });
  const lo = Math.min(0, ...bars.map((b) => Math.min(b.a, b.b)));
  const hi = Math.max(...bars.map((b) => Math.max(b.a, b.b)), 1e-9);
  const X = (v: number) => (100 * (v - lo)) / (hi - lo);
  const fmt = (v: number) => (unit === 'bbl' ? `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}` : `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(0)}`);
  const toggle = (
    <div style={{ display: 'flex', gap: 3 }}>
      {(['bbl', 'yr'] as const).map((u) => (
        <button key={u} type="button" onClick={() => setUnit(u)} aria-pressed={unit === u}
          style={{ font: '500 10.5px var(--font-mono)', padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                   border: `1px solid ${unit === u ? 'var(--accent)' : 'var(--rule-strong)'}`,
                   background: unit === u ? 'var(--accent)' : 'transparent', color: unit === u ? 'var(--paper)' : 'var(--ink)' }}>
          {u === 'bbl' ? '$/bbl' : '$M/yr'}
        </button>
      ))}
    </div>
  );
  return (
    <PanelBox title="Margin" aside={toggle}
      info="Revenue from every product sold, less crude and other feeds, energy, variable operating cost (catalysts, chemicals, the hydrogen plant) and the carbon price, gives the cash margin. Fixed costs (staff, maintenance, insurance) give the net margin. Capital is treated as sunk.">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(96px, auto) 1fr auto', alignItems: 'center', gap: '3px 8px', fontSize: 12 }}>
        {bars.map((b) => {
          const x0 = X(Math.min(b.a, b.b)), x1 = X(Math.max(b.a, b.b));
          const color = b.kind === 'total' ? (b.v < 0 ? 'var(--negative)' : 'var(--ink-2)') : b.kind === 'gain' ? 'var(--positive)' : 'var(--negative)';
          return (
            <div key={b.label} style={{ display: 'contents' }}>
              <span style={{ fontWeight: b.kind === 'total' ? 600 : 400, whiteSpace: 'nowrap' }}>{b.label}</span>
              <div style={{ position: 'relative', height: 12 }}>
                <div style={{ position: 'absolute', left: `${X(0)}%`, top: -2, bottom: -2, width: 1, background: 'var(--rule-strong)' }} />
                <div style={{ position: 'absolute', left: `${x0}%`, width: `${Math.max(0.4, x1 - x0)}%`, top: 1, bottom: 1, background: color, opacity: b.kind === 'total' ? 1 : 0.85 }} />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', fontWeight: b.kind === 'total' ? 600 : 400 }}>{fmt(b.v)}</span>
            </div>
          );
        })}
      </div>
    </PanelBox>
  );
}

// ── Emissions by source ─────────────────────────────────────────────────────
export function Emissions({ r, s }: { r: Result; s: State }) {
  const kg = (t: number) => (1000 * t) / (r.crudeBbl || 1);
  const mt = (t: number) => (t * DAYS) / 1e6;
  const rows = [
    { label: 'Process heaters', t: r.co2.heaters, color: 'var(--spectral-3)' },
    { label: 'FCC regenerator', t: r.co2.fccRegen, color: 'var(--spectral-2)' },
    { label: 'Hydrogen plant', t: r.co2.h2Plant, color: 'var(--spectral-10)' },
    { label: 'Steam cracker furnaces', t: r.co2.cracker, color: 'var(--spectral-1)' },
  ].filter((x) => x.t > 0 || x.label !== 'Steam cracker furnaces');
  const max = Math.max(...rows.map((x) => x.t), r.co2.power, 1e-9);
  const bar = (t: number, color: string, dashed = false) => (
    <div style={{ height: 10, flex: 1, minWidth: 30 }}>
      <div style={{ width: `${(100 * t) / max}%`, height: '100%', background: dashed ? 'transparent' : color,
                    border: dashed ? `1px dashed ${color}` : 'none', boxSizing: 'border-box' }} />
    </div>
  );
  return (
    <PanelBox title="Emissions"
      info="Direct (scope 1) CO₂ from burning fuel gas and natural gas in unit furnaces and boilers, burning coke off the FCC catalyst, and making hydrogen from natural gas. Indirect CO₂ from purchased power is shown separately and not charged. Downstream combustion of the products is not counted.">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, auto) 1fr auto auto', alignItems: 'center', gap: '4px 8px', fontSize: 12 }}>
        <span /><span />
        <span style={{ font: '600 10px var(--font-mono)', color: 'var(--ink-3)', textAlign: 'right' }}>KG/BBL</span>
        <span style={{ font: '600 10px var(--font-mono)', color: 'var(--ink-3)', textAlign: 'right' }}>MT/YR</span>
        {rows.map((x) => (
          <div key={x.label} style={{ display: 'contents' }}>
            <span style={{ whiteSpace: 'nowrap' }}>{x.label}</span>
            {bar(x.t, x.color)}
            <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{kg(x.t).toFixed(1)}</span>
            <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--ink-2)' }}>{mt(x.t).toFixed(2)}</span>
          </div>
        ))}
        <span style={{ fontWeight: 600, borderTop: '1px solid var(--rule)', paddingTop: 3 }}>Direct total</span>
        <span style={{ borderTop: '1px solid var(--rule)', alignSelf: 'stretch' }} />
        <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', fontWeight: 600, borderTop: '1px solid var(--rule)', paddingTop: 3 }}>{kg(r.scope1).toFixed(1)}</span>
        <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', fontWeight: 600, borderTop: '1px solid var(--rule)', paddingTop: 3 }}>{mt(r.scope1).toFixed(2)}</span>
        <span style={{ whiteSpace: 'nowrap', color: 'var(--ink-2)' }}>Purchased power</span>
        {bar(r.co2.power, 'var(--ink-3)', true)}
        <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--ink-2)' }}>{kg(r.co2.power).toFixed(1)}</span>
        <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--ink-2)' }}>{mt(r.co2.power).toFixed(2)}</span>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.45 }}>
        {r.co2.captured > 0
          ? <>Carbon capture on the hydrogen plant stores {kg(r.co2.captured).toFixed(1)} kg/bbl ({mt(r.co2.captured).toFixed(2)} Mt a year) that would otherwise be emitted.</>
          : s.h2Source === 'ely' && r.h2.imported > 0
            ? <>Electrolysis avoids about {kg(r.h2.imported * H2_SOURCES.smr.co2).toFixed(1)} kg/bbl that steam methane reforming would emit, using {Math.round((r.h2.imported * H2_SOURCES.ely.mwh) / 24)} MW of clean power.</>
            : <>Typical refineries emit about 30 to 40 kg CO₂ per barrel. Burning the products emits roughly ten times more.</>}
        {r.plantOil > 0 && <> Plant oil co-processing replaces {((r.plantOil * 0.85 * 7.45) / 1000).toFixed(1)} kb/d of fossil diesel.</>}
      </p>
    </PanelBox>
  );
}
