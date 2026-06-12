import { useMemo, useState } from 'react';
import data from './scenarios.json';
import FlowDiagram from './FlowDiagram';

/**
 * Rare-earth magnet supply-chain explorer.
 * Reads a precomputed grid of capacity-expansion model results (no solver in the
 * browser) and lets the visitor turn policy / recycling / geopolitics knobs to see
 * how cost, US import dependence, and the Dy/Tb chokepoint respond.
 * v1: headline KPIs + cost breakdown. Sankey flow + chokepoint views to follow.
 */

type Scenario = {
  dc: number; rec: number; shock: boolean;
  kpis: Record<string, number>;
  cost: Record<string, number>;
  production: Record<string, Record<string, number>>;
  flows: Record<string, { from: string; to: string; value: number }[]>;
};

const SC = (data as any).scenarios as Scenario[];
const AXES = (data as any).meta.axes as {
  domestic_content: number[]; recycling: number[]; china_shock: boolean[];
};

const keyOf = (dc: number, rec: number, shock: boolean) => `${dc}|${rec}|${shock}`;
const LOOKUP = new Map(SC.map((s) => [keyOf(s.dc, s.rec, s.shock), s]));
const BASE = LOOKUP.get(keyOf(0, 0, false))!;

const pct = (x: number) => `${x.toFixed(0)}%`;
const musd = (x: number) => `$${(x / 1000).toFixed(1)}B`;

// Cost components -> label + ColorBrewer Spectral colour (the lab's signature
// data palette; Cardinal is reserved for accents only, never as a fill).
const COST_KEYS: [string, string, string][] = [
  ['mining', 'Mining', '#F46D43'],
  ['separation', 'Separation', '#D53E4F'],
  ['alloy', 'Alloy', '#FDAE61'],
  ['magnet', 'Magnet', '#3288BD'],
  ['recycling', 'Recycling', '#66C2A5'],
  ['trade', 'Trade', '#5E4FA2'],
  ['coproduct', 'Co-product', '#FEE08B'],
  ['shortage', 'Shortage', '#9E0142'],
];
const WORSE = '#D53E4F';

// KPI cards: key, label, formatter, and whether LOWER is better (for delta colour).
const KPIS: { k: string; label: string; fmt: (x: number) => string; lowerBetter: boolean; help: string }[] = [
  { k: 'us_import_pct', label: 'US magnet imports', fmt: pct, lowerBetter: true, help: 'Share of US magnet demand met by imports' },
  { k: 'npv_musd', label: 'Total system cost (NPV)', fmt: musd, lowerBetter: true, help: '2026–2037 discounted build-out + operating cost' },
  { k: 'primary_dytb_kt', label: 'Primary Dy/Tb mined', fmt: (x) => `${x.toFixed(1)} kt`, lowerBetter: true, help: 'Heavy rare earth mined from primary ore (the chokepoint)' },
  { k: 'hhi_separation', label: 'Separation concentration', fmt: (x) => x.toFixed(2), lowerBetter: true, help: 'HHI of separation supply (1.0 = single-region monopoly)' },
  { k: 'recycled_pct', label: 'Recycled supply', fmt: pct, lowerBetter: false, help: 'Share of oxide supplied by recycling' },
  { k: 'unmet_kt', label: 'Unmet demand', fmt: (x) => `${x.toFixed(0)} kt`, lowerBetter: true, help: 'Magnet demand the chain cannot meet' },
];

function Slider({ label, values, idx, setIdx, fmt }: {
  label: string; values: number[]; idx: number; setIdx: (i: number) => void; fmt: (v: number) => string;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent)' }}>{fmt(values[idx])}</span>
      </div>
      <input type="range" min={0} max={values.length - 1} step={1} value={idx}
        onChange={(e) => setIdx(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink)', opacity: 0.45, marginTop: 2 }}>
        {values.map((v, i) => <span key={i}>{fmt(v)}</span>)}
      </div>
    </div>
  );
}

export default function MagnetExplorer() {
  const [dcIdx, setDcIdx] = useState(0);
  const [recIdx, setRecIdx] = useState(0);
  const [shock, setShock] = useState(false);

  const dc = AXES.domestic_content[dcIdx];
  const rec = AXES.recycling[recIdx];
  const sc = useMemo(() => LOOKUP.get(keyOf(dc, rec, shock)) ?? BASE, [dc, rec, shock]);

  const costTotal = COST_KEYS.reduce((a, [k]) => a + Math.max(0, sc.cost[k] ?? 0), 0);

  return (
    <div style={{ maxWidth: 'var(--content-max)', margin: '0 auto', padding: '28px 20px 64px', color: 'var(--ink)' }}>
      <header style={{ marginBottom: 24, maxWidth: 760 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: 8 }}>
          INTERACTIVE MODEL · WORK IN PROGRESS
        </div>
        <h1 style={{ font: '600 30px/1.15 var(--font-serif)', margin: '0 0 10px' }}>
          Rare-earth magnet supply chain explorer
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.55, opacity: 0.8, margin: 0 }}>
          A capacity-expansion model of the NdFeB magnet supply chain
          (mining → separation → alloy → magnet). Turn the policy, recycling, and
          geopolitical knobs to see where the choke points are and how cost and US
          import dependence respond. Illustrative results — not yet peer-reviewed.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) 1fr', gap: 28, alignItems: 'start' }}
        className="magnet-grid">
        {/* Controls */}
        <aside style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20, background: 'var(--paper)' }}>
          <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: '0 0 16px' }}>Scenario</h2>
          <Slider label="US domestic-content minimum" values={AXES.domestic_content} idx={dcIdx} setIdx={setDcIdx} fmt={(v) => pct(v * 100)} />
          <Slider label="Recycling collection rate" values={AXES.recycling} idx={recIdx} setIdx={setRecIdx} fmt={(v) => pct(v * 100)} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            <input type="checkbox" checked={shock} onChange={(e) => setShock(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 16, height: 16 }} />
            China export ban (oxide / alloy / magnet)
          </label>
          <button onClick={() => { setDcIdx(0); setRecIdx(0); setShock(false); }}
            style={{ marginTop: 22, width: '100%', padding: '8px 0', font: '600 12px var(--font-mono)', letterSpacing: '0.05em', color: 'var(--ink)', background: 'transparent', border: '1px solid var(--rule)', borderRadius: 6, cursor: 'pointer' }}>
            RESET TO BASELINE
          </button>
        </aside>

        {/* Results */}
        <main>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 26 }}>
            {KPIS.map(({ k, label, fmt, lowerBetter, help }) => {
              const val = sc.kpis[k]; const base = BASE.kpis[k]; const delta = val - base;
              const better = lowerBetter ? delta < 0 : delta > 0;
              const dColor = Math.abs(delta) < 1e-9 ? 'var(--ink)' : better ? 'var(--brand-green)' : WORSE;
              return (
                <div key={k} title={help} style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: '14px 16px', background: 'var(--paper)' }}>
                  <div style={{ fontSize: 11.5, opacity: 0.6, marginBottom: 6, lineHeight: 1.3 }}>{label}</div>
                  <div style={{ font: '600 24px var(--font-mono)' }}>{fmt(val)}</div>
                  <div style={{ font: '500 11px var(--font-mono)', color: dColor, marginTop: 4 }}>
                    {Math.abs(delta) < 1e-9 ? '— baseline' : `${delta > 0 ? '+' : ''}${fmt(delta)} vs baseline`}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cost breakdown */}
          <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20, background: 'var(--paper)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: 0 }}>Cost breakdown</h2>
              <span style={{ font: '600 15px var(--font-mono)' }}>{musd(sc.kpis.npv_musd)} <span style={{ opacity: 0.5, fontWeight: 400 }}>total NPV</span></span>
            </div>
            <div style={{ display: 'flex', height: 30, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--rule)' }}>
              {COST_KEYS.map(([k, lbl, color]) => {
                const v = Math.max(0, sc.cost[k] ?? 0);
                if (v <= 0) return null;
                return <div key={k} title={`${lbl}: ${musd(v)}`} style={{ width: `${(v / costTotal) * 100}%`, background: color }} />;
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', marginTop: 14 }}>
              {COST_KEYS.map(([k, lbl, color]) => {
                const v = sc.cost[k] ?? 0;
                if (Math.abs(v) < 1) return null;
                return (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />
                    <span style={{ opacity: 0.7 }}>{lbl}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{musd(v)}{v < 0 ? ' (credit)' : ''}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <FlowDiagram sc={sc} />

          <p style={{ fontSize: 12, opacity: 0.5, marginTop: 18, lineHeight: 1.5 }}>
            Model: <code style={{ fontFamily: 'var(--font-mono)' }}>rare-magnets-cem</code>. Results precomputed across a scenario grid;
            sliders snap to solved points. Numbers are illustrative and will change as the
            model and data improve. A supply-chain flow map and chokepoint view are coming next.
          </p>
        </main>
      </div>

      <style>{`
        @media (max-width: 720px) {
          .magnet-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
