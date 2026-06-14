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
  ['trade', 'Shipping', '#5E4FA2'],
  ['coproduct', 'Co-product La/Ce', '#FEE08B'],
  ['shortage', 'Unmet-demand penalty', '#9E0142'],
];
const COST_DESC: Record<string, string> = {
  mining: 'Build + operating cost of US-located mining / beneficiation capacity (NPV).',
  separation: 'Build + operating cost of US-located solvent-extraction separation.',
  alloy: 'Build + operating cost of US-located oxide→metal→strip-cast alloy.',
  magnet: 'Build + operating cost of US-located sintered-magnet manufacturing.',
  recycling: 'Build + operating cost of US-located end-of-life recycling capacity.',
  shortage: 'Penalty on US unmet magnet demand: unmet tonnes × a high penalty rate. Not a market cost — it flags US demand the chain can’t deliver in time (e.g. under a ban).',
};
// diagonal hatch so the unmet-demand penalty reads as "not a real production cost"
const hatch = (c: string) =>
  `repeating-linear-gradient(45deg, ${c}, ${c} 5px, rgba(248,248,232,0.6) 5px, rgba(248,248,232,0.6) 10px)`;
const WORSE = '#D53E4F';

const KPIS: { k: string; label: string; sub: string; fmt: (x: number) => string; lowerBetter: boolean; help: string }[] = [
  { k: 'us_import_pct', label: 'Share of US magnets imported', sub: '2035', fmt: pct, lowerBetter: true, help: 'Final-year (2035) share of US magnet demand met by imports rather than made in the US.' },
  { k: 'npv_musd', label: 'Total system cost', sub: '2026–35 NPV', fmt: musd, lowerBetter: true, help: 'Total 2026–2035 system cost: discounted (NPV) build-out + operating cost, summed across all regions.' },
  { k: 'us_unmet_kt', label: 'US unmet demand', sub: '2026–35 cumulative', fmt: (x) => `${x.toFixed(0)} kt`, lowerBetter: true, help: 'Cumulative 2026–2035 US magnet shortfall (kt of finished magnet) the chain cannot deliver in time — e.g. under a China export ban.' },
  { k: 'primary_dytb_kt', label: 'Primary Dy/Tb mined', sub: '2035 annual', fmt: (x) => `${x.toFixed(1)} kt`, lowerBetter: true, help: 'Final-year (2035) Dy+Tb oxide mined from ore that year (kt) — a few kt; the scarce chokepoint element, not comparable to total magnet tonnage.' },
  { k: 'hhi_separation', label: 'Separation concentration', sub: '2035', fmt: (x) => x.toFixed(2), lowerBetter: true, help: 'Herfindahl index of separation supply by region (1.0 = single region), final year (2035).' },
  { k: 'recycled_pct', label: 'Recycled supply', sub: '2035', fmt: pct, lowerBetter: false, help: 'Final-year (2035) share of oxide supplied by recycling.' },
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
  // The cost breakdown is US-specific (the cost the US bears to supply itself) —
  // this analysis is about US supply security. Global trade/co-product don't apply.
  const US_COST_KEYS = COST_KEYS.filter(([k]) => k !== 'trade' && k !== 'coproduct');
  const usCostTotal = US_COST_KEYS.reduce((a, [k]) => a + Math.max(0, sc.us_cost[k] ?? 0), 0);

  return (
    <div style={{ maxWidth: 'var(--content-max)', margin: '0 auto', padding: '28px 20px 0', color: 'var(--ink)' }}>
      <header style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: 8 }}>
          INTERACTIVE MODEL · WORK IN PROGRESS
        </div>
        <h1 style={{ font: '600 30px/1.15 var(--font-serif)', margin: '0 0 10px' }}>
          U.S. rare-earth magnet supply chain explorer
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.55, opacity: 0.8, margin: 0 }}>
          A capacity-expansion model of the NdFeB magnet supply chain
          (mining → separation → alloy → magnet). Compose demand by sector, then adjust
          policy, recycling, and geopolitical assumptions to identify choke points and see
          how cost and US import dependence respond.
        </p>
      </header>

      <DemandBuilder onSummary={onSummary} />

      <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: '0 0 12px' }}>Supply explorer</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) 1fr', gap: 28, alignItems: 'start' }}
        className="magnet-grid">
        <aside style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20, background: 'var(--paper)', position: 'sticky', top: 72 }}>
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
            {KPIS.map(({ k, label, sub, fmt, lowerBetter, help }) => {
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
                  <div style={{ font: '400 9.5px var(--font-mono)', opacity: 0.4, marginTop: 3, letterSpacing: '0.03em' }}>{sub}</div>
                </div>
              );
            })}
          </div>
          <div style={{ marginBottom: 24 }} />

          <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20, background: 'var(--paper)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: 0 }}>Cost to the US, by stage</h2>
              <span style={{ font: '600 15px var(--font-mono)' }}>{musd(usCostTotal)} <span style={{ opacity: 0.5, fontWeight: 400 }}>US NPV</span></span>
            </div>
            <p style={{ fontSize: 11.5, opacity: 0.5, margin: '0 0 12px', lineHeight: 1.45 }}>
              Build + operating cost of US-located capacity at each stage (2026–35 NPV), plus the US
              shortage penalty. The delta vs the no-policy baseline is the cost of US supply security.
            </p>
            <div style={{ display: 'flex', height: 30, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--rule)' }}>
              {US_COST_KEYS.map(([k, lbl, color]) => {
                const v = Math.max(0, sc.us_cost[k] ?? 0);
                if (v <= 0) return null;
                return <div key={k} title={`${lbl}: ${musd(v)}`} style={{ width: `${(v / usCostTotal) * 100}%`, background: k === 'shortage' ? hatch(color) : color }} />;
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', marginTop: 14 }}>
              {US_COST_KEYS.map(([k, lbl, color]) => {
                const v = sc.us_cost[k] ?? 0;
                if (Math.abs(v) < 1) return null;
                const dv = v - (BASE.us_cost[k] ?? 0);
                return (
                  <div key={k} title={COST_DESC[k]} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'help' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: k === 'shortage' ? hatch(color) : color, display: 'inline-block' }} />
                    <span style={{ opacity: 0.7 }}>{lbl}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{musd(v)}</span>
                    {Math.abs(dv) >= 100 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: dv > 0 ? WORSE : 'var(--brand-green)' }}>{dv > 0 ? '+' : ''}{musd(dv)}</span>}
                  </div>
                );
              })}
            </div>
          </section>

          <PathwayCharts sc={sc} years={YEARS} demand={demand.totalSeries} usShare={1}
            usDemandMax={US_DEMAND_SHARE * Math.max(...DEMAND_KT_REF) * 1.45} />

          <FlowDiagram sc={sc} />

          <ChokepointPanel sc={sc} />
        </main>
      </div>

      <footer style={{ marginTop: 44, paddingTop: 20, borderTop: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, maxWidth: 560 }}>
        <a href="https://github.com/Sustainable-Solutions-Lab/rare-magnets-cem" target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-2)', textDecoration: 'none' }}>
          <svg viewBox="0 0 16 16" width={15} height={15} fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          <span>Model code on GitHub <span style={{ opacity: 0.6, fontFamily: 'var(--font-mono)' }}>rare-magnets-cem ↗</span></span>
        </a>
        <p style={{ fontSize: 11, opacity: 0.5, lineHeight: 1.5, margin: 0 }}>
          Results precomputed across a scenario grid and interpolated between solved points. Numbers
          are illustrative and will change as the model and data improve.
        </p>
        <a href="https://steer-stanford.webflow.io/" target="_blank" rel="noopener noreferrer"
          title="STEER — Stanford" aria-label="STEER at Stanford (opens in new tab)"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none', color: 'var(--accent)' }}>
          <img className="steer-light-bg" src="/STEER-logo-for-light-background.png" alt="STEER — Stanford" height={18} />
          <img className="steer-dark-bg" src="/STEER-logo-for-dark-background.svg" alt="STEER — Stanford" height={18} />
          <span aria-hidden="true" style={{ fontSize: 11 }}>↗</span>
        </a>
        <p style={{ fontSize: 11, opacity: 0.6, lineHeight: 1.5, margin: 0 }}>
          Developed by <a href="https://steer-stanford.webflow.io/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>STEER</a> at
          Stanford, with support from the U.S. Department of Energy's Advanced Materials &amp;
          Manufacturing Technologies Office (AMMTO).
        </p>
      </footer>

      <style>{`
        @media (max-width: 720px){ .magnet-grid{ grid-template-columns:1fr !important; } }
        .steer-light-bg, .steer-dark-bg{ height:18px !important; width:auto !important; max-width:none !important; }
        .steer-light-bg{ display:block; }
        .steer-dark-bg{ display:none; }
        [data-theme="dark"] .steer-light-bg{ display:none !important; }
        [data-theme="dark"] .steer-dark-bg{ display:block !important; }
      `}</style>
    </div>
  );
}
