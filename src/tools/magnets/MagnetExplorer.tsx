import { useCallback, useMemo, useState } from 'react';
import { AXES, BASE, interpScenario, YEARS, DEMAND_KT_REF, US_DEMAND_SHARE } from './interp';
import FlowDiagram from './FlowDiagram';
import ChokepointPanel from './ChokepointPanel';
import PathwayCharts from './PathwayCharts';
import DemandBuilder from './DemandBuilder';

/**
 * Rare-earth magnet supply-chain explorer.
 * Reads a precomputed grid of capacity-expansion model results and bilinearly
 * interpolates between solved points (see interp.ts) so the sliders move
 * continuously. Three views: headline KPIs + cost, supply-chain flows, choke points.
 */

const pct = (x: number) => `${x.toFixed(0)}%`;
const musd = (x: number) => `$${(x / 1000).toFixed(1)}B`;

const COST_KEYS: [string, string, string][] = [
  ['mining', 'Mining', '#F46D43'],
  ['separation', 'Separation', '#D53E4F'],
  ['alloy', 'Alloy', '#FDAE61'],
  ['magnet', 'Magnet', '#3288BD'],
  ['recycling', 'Recycling', '#66C2A5'],
  ['trade', 'Trade', '#5E4FA2'],
  ['coproduct', 'Co-product', '#FEE08B'],
  ['shortage', 'Unmet penalty', '#9E0142'],
];
// diagonal hatch so the unmet-demand penalty reads as "not a real production cost"
const hatch = (c: string) =>
  `repeating-linear-gradient(45deg, ${c}, ${c} 5px, rgba(248,248,232,0.6) 5px, rgba(248,248,232,0.6) 10px)`;
const WORSE = '#D53E4F';

const KPIS: { k: string; label: string; fmt: (x: number) => string; lowerBetter: boolean; help: string }[] = [
  { k: 'us_import_pct', label: 'US magnet imports', fmt: pct, lowerBetter: true, help: 'Final-year share of US magnet demand met by imports' },
  { k: 'npv_musd', label: 'Total system cost', fmt: musd, lowerBetter: true, help: '2026–2035 discounted (NPV) build-out + operating cost, all regions' },
  { k: 'us_unmet_kt', label: 'US unmet demand', fmt: (x) => `${x.toFixed(0)} kt`, lowerBetter: true, help: 'Cumulative US magnet shortfall over 2026–2035 (kt of finished magnet) — supply the chain cannot deliver in time, e.g. under a China export ban' },
  { k: 'primary_dytb_kt', label: 'Primary Dy/Tb mined', fmt: (x) => `${x.toFixed(1)} kt`, lowerBetter: true, help: 'Final-year heavy rare earth (Dy+Tb oxide) mined from ore — a few kt; the scarce chokepoint element, not comparable to total magnet tonnage' },
  { k: 'hhi_separation', label: 'Separation concentration', fmt: (x) => x.toFixed(2), lowerBetter: true, help: 'HHI of separation supply (1.0 = single-region monopoly), final year' },
  { k: 'recycled_pct', label: 'Recycled supply', fmt: pct, lowerBetter: false, help: 'Final-year share of oxide supplied by recycling' },
];

function Slider({ label, value, max, min = 0, onChange, fmt, desc }: {
  label: string; value: number; max: number; min?: number;
  onChange: (v: number) => void; fmt: (v: number) => string; desc?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 13 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <span style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
          {label}
          {desc && (
            <button onClick={() => setOpen((o) => !o)} aria-label="What is this?" title="What is this?"
              style={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--rule-strong)',
                background: open ? 'var(--accent)' : 'transparent', color: open ? 'var(--paper)' : 'var(--ink-3)',
                font: '600 9px var(--font-mono)', lineHeight: 1, cursor: 'pointer', padding: 0, opacity: 0.85 }}>
              i
            </button>
          )}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent)' }}>{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={0.01} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink)', opacity: 0.45, marginTop: 2 }}>
        <span>{fmt(min)}</span><span>{fmt((min + max) / 2)}</span><span>{fmt(max)}</span>
      </div>
      {desc && open && (
        <p style={{ fontSize: 11, opacity: 0.6, margin: '6px 0 0', lineHeight: 1.45 }}>{desc}</p>
      )}
    </div>
  );
}

export default function MagnetExplorer() {
  const [dc, setDc] = useState(0);
  const [rec, setRec] = useState(0);         // recycling collection rate
  const [china, setChina] = useState(0);     // China export-restriction severity
  const [rcost, setRcost] = useState(AXES.rcostMin); // US recycling cost factor
  // Demand summary from the demand builder: maps any sector composition + levers to
  // the two demand axes (total-demand scale + Dy/Tb intensity) the grid is solved over.
  const [demand, setDemand] = useState(
    () => ({ demand_scale: 1, dytb_intensity: 1, totalSeries: DEMAND_KT_REF }));
  const onSummary = useCallback(
    (s: { demand_scale: number; dytb_intensity: number; totalSeries: number[] }) => setDemand(s), []);

  const sc = useMemo(() => interpScenario({
    dc, rec, china, rcost, dytb: demand.dytb_intensity, dscale: demand.demand_scale,
  }), [dc, rec, china, rcost, demand]);
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
          (mining → separation → alloy → magnet). Compose demand by sector, then turn
          the policy, recycling, and geopolitical knobs to see where the choke points
          are and how cost and US import dependence respond. Illustrative results — not
          yet peer-reviewed.
        </p>
      </header>

      <DemandBuilder onSummary={onSummary} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) 1fr', gap: 28, alignItems: 'start' }}
        className="magnet-grid">
        <aside style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20, background: 'var(--paper)', position: 'sticky', top: 16 }}>
          <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: '0 0 16px' }}>Scenario</h2>

          <div style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.7, margin: '0 0 10px' }}>Policy</div>
          <Slider label="US content requirement (IRA-style)" value={dc} max={AXES.dcMax} onChange={setDc} fmt={(v) => pct(v * 100)}
            desc="Two prongs, like the IRA EV credit: this share of US magnets must be US-made, and their oxide must come from the US, allies, or recycling (not China)." />

          <div style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.7, margin: '10px 0 10px' }}>Recycling</div>
          <Slider label="EoL collection rate" value={rec} max={AXES.recMax} onChange={setRec} fmt={(v) => pct(v * 100)}
            desc="Share of end-of-life magnets collected and reprocessed into oxide. Recovered scrap is concentrated Nd/Pr/Dy/Tb with no co-product tax — but recycling plants must be built and paid for." />

          <div style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.7, margin: '10px 0 10px' }}>Geopolitics</div>
          <Slider label="China export restriction" value={china} max={AXES.chinaMax} onChange={setChina} fmt={(v) => pct(v * 100)}
            desc="Severity of Chinese export controls on oxide, alloy & magnets: 0% = open market, 100% = full ban. In between, China may still export to a shrinking share of the rest of the world's demand — allies absorb a partial cut, a full ban forces shortage or reshoring." />

          <div style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.7, margin: '10px 0 10px' }}>Cost sensitivity</div>
          <Slider label="US recycling cost" value={rcost} min={AXES.rcostMin} max={AXES.rcostMax} onChange={setRcost} fmt={(v) => `${v.toFixed(1)}× China`}
            desc={`Cost to build US recycling capacity, relative to China. ${AXES.rcostMin.toFixed(1)}× is the baseline US premium; drag higher for a pessimistic cold start. Recycling is a built, paid-for capacity stage — this stress-tests how much its economics rest on that uncertain US cost.`} />

          <button onClick={() => { setDc(0); setRec(0); setChina(0); setRcost(AXES.rcostMin); }}
            style={{ marginTop: 22, width: '100%', padding: '8px 0', font: '600 12px var(--font-mono)', letterSpacing: '0.05em', color: 'var(--ink)', background: 'transparent', border: '1px solid var(--rule)', borderRadius: 6, cursor: 'pointer' }}>
            RESET TO BASELINE
          </button>
        </aside>

        <main>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 26 }}>
            {KPIS.map(({ k, label, fmt, lowerBetter, help }) => {
              const val = sc.kpis[k]; const base = BASE.kpis[k]; const delta = val - base;
              const better = lowerBetter ? delta < 0 : delta > 0;
              const dColor = Math.abs(delta) < 1e-6 ? 'var(--ink)' : better ? 'var(--brand-green)' : WORSE;
              return (
                <div key={k} title={help} style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: '14px 16px', background: 'var(--paper)' }}>
                  <div style={{ fontSize: 11.5, opacity: 0.6, marginBottom: 6, lineHeight: 1.3 }}>{label}</div>
                  <div style={{ font: '600 24px var(--font-mono)' }}>{fmt(val)}</div>
                  <div style={{ font: '500 11px var(--font-mono)', color: dColor, marginTop: 4 }}>
                    {Math.abs(delta) < 1e-6 ? '— baseline' : `${delta > 0 ? '+' : ''}${fmt(delta)} vs baseline`}
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 11.5, opacity: 0.5, margin: '-14px 0 24px', fontStyle: 'italic' }}>
            Tiles show 2035 (final-year) values, except total cost (2026–2035 NPV) and US unmet
            demand (cumulative). Deltas are vs the no-policy baseline; the year-by-year path to
            these endpoints is in “Pathways to 2035” below. Hover any tile for its definition.
          </p>

          <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20, background: 'var(--paper)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: 0 }}>Cost breakdown</h2>
              <span style={{ font: '600 15px var(--font-mono)' }}>{musd(sc.kpis.npv_musd)} <span style={{ opacity: 0.5, fontWeight: 400 }}>total NPV</span></span>
            </div>
            <div style={{ display: 'flex', height: 30, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--rule)' }}>
              {COST_KEYS.map(([k, lbl, color]) => {
                const v = Math.max(0, sc.cost[k] ?? 0);
                if (v <= 0) return null;
                return <div key={k} title={`${lbl}: ${musd(v)}`} style={{ width: `${(v / costTotal) * 100}%`, background: k === 'shortage' ? hatch(color) : color }} />;
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', marginTop: 14 }}>
              {COST_KEYS.map(([k, lbl, color]) => {
                const v = sc.cost[k] ?? 0;
                if (Math.abs(v) < 1) return null;
                return (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: k === 'shortage' ? hatch(color) : color, display: 'inline-block' }} />
                    <span style={{ opacity: 0.7 }}>{lbl}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{musd(v)}{v < 0 ? ' (credit)' : ''}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <PathwayCharts sc={sc} years={YEARS} demand={demand.totalSeries} usShare={US_DEMAND_SHARE} />

          <FlowDiagram sc={sc} />

          <ChokepointPanel sc={sc} />

          <p style={{ fontSize: 12, opacity: 0.5, marginTop: 18, lineHeight: 1.5 }}>
            Model: <code style={{ fontFamily: 'var(--font-mono)' }}>rare-magnets-cem</code>. Results
            precomputed across a scenario grid and interpolated between solved points. Numbers are
            illustrative and will change as the model and data improve.
          </p>
        </main>
      </div>

      <footer style={{ marginTop: 44, paddingTop: 20, borderTop: '1px solid var(--rule)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 18 }}>
        <a href="https://steer-stanford.webflow.io/" target="_blank" rel="noopener noreferrer"
          title="STEER — Stanford" aria-label="STEER at Stanford (opens in new tab)"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none', color: 'var(--accent)' }}>
          <img src="/STEER-logo.svg" alt="STEER — Stanford" height={34} style={{ display: 'block' }} />
          <span aria-hidden="true" style={{ fontSize: 13 }}>↗</span>
        </a>
        <p style={{ fontSize: 11, opacity: 0.6, lineHeight: 1.5, maxWidth: 520, margin: 0 }}>
          Developed within the <a href="https://steer-stanford.webflow.io/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>STEER</a> project
          at Stanford, with support from the U.S. Department of Energy's Advanced Materials &amp;
          Manufacturing Technologies Office (AMMTO).
        </p>
      </footer>

      <style>{`@media (max-width: 720px){ .magnet-grid{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}
