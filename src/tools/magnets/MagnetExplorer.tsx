import { useCallback, useEffect, useMemo, useState } from 'react';
import { AXES, BASE, interpScenario, applyStockpile, applyRoundTop, reshoreSupply, ROUND_TOP_COST, STOCKPILE_MAX, YEARS, DEMAND_KT_REF, US_DEMAND_SHARE } from './interp';
import { integratedTRI, riskColor } from './tri';

// Phones get a leaner layout (essentials only) + the scenario controls in a slide-up
// sheet rather than a sticky sidebar that would overlay the plots.
function useIsMobile(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

// Exogenous US-self-sufficiency reshoring costs ($M NPV), grounded in the model's
// per-stage US costs (separation ~$0.5B partial → ~$1.2B for ~90%; alloy ~$0.3B →
// ~$0.5B) — illustrative and tunable, like all the security-investment figures.
const US_SEP_RESHORE_COST = 1200;
const US_ALLOY_RESHORE_COST = 500;
import FlowDiagram from './FlowDiagram';
import PathwayCharts from './PathwayCharts';
import DemandBuilder from './DemandBuilder';
import TradeRiskPanel from './TradeRiskPanel';
import ProjectsPanel from './ProjectsPanel';
import { alliedHHIByStage, ALL_IDS, DEFAULT_ACTIVE, isRealistic, PROJECTS } from './projects';

/**
 * Rare-earth magnet supply-chain explorer.
 * Reads a precomputed grid of capacity-expansion model results and bilinearly
 * interpolates between solved points (see interp.ts) so the sliders move
 * continuously. Three views: headline KPIs + cost, supply-chain flows, choke points.
 */

const pct = (x: number) => `${x.toFixed(0)}%`;
const musd = (x: number) => `$${(x / 1000).toFixed(1)}B`;
// Fixed x-axis for the absolute cost bar so it visibly grows/shrinks with sliders
// (real US cost-of-security spans ~$2.5B baseline to ~$10B under heavy reshoring).
const COST_AXIS_MAX = 12000;  // $M

const COST_KEYS: [string, string, string][] = [
  ['mining', 'Mining', '#F46D43'],
  ['separation', 'Separation', '#D53E4F'],
  ['alloy', 'Alloy', '#FDAE61'],
  ['magnet', 'Magnet', '#3288BD'],
  ['recycling', 'Recycling', '#66C2A5'],
  ['round_top', 'Round Top (assumed)', '#3288BD'],
  ['stockpile', 'Strategic stockpile', '#5E4FA2'],
  ['dytb_premium', 'Heavy-REE price premium', '#762A83'],
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
  round_top: 'Assumed cost (~$400M, ≈ Round Top’s 2019 PEA capex incl. on-site separation) of bringing the Round Top, TX heavy-REE deposit online — but it yields only ~0.22 kt/yr Dy+Tb, ≈12% of US Dy/Tb need, so one mine is far from a fix. Exogenous (not a cost-optimal build); a strategic move whose security benefit per dollar reveals a shadow price of security.',
  stockpile: 'Cost of the strategic magnet stockpile: size × an all-in acquire + hold rate (~$110/kg, grounded in Benchmark Feb-2026 prices for Dy/Tb-rich grades). A real, paid cost that buys down the unmet-demand penalty by covering the earliest shortfall.',
  dytb_premium: 'Price-taker premium the US pays on the Dy/Tb it imports (as oxide, alloy, or embodied in magnets) as China’s export controls inflate the heavy-REE benchmarks Western buyers are bound to. Scales with the China-restriction slider; the US escapes by separating or recycling Dy/Tb domestically — limited in the near term, since the one active US mine (Mountain Pass) is light-REE and domestic heavy-REE prospects (e.g. Round Top, TX) are pre-commercial.',
  shortage: 'Penalty on US unmet magnet demand: unmet tonnes × a high penalty rate. Not a market cost — it flags US demand the chain can’t deliver in time (e.g. under a ban).',
};
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
  const [make, setMake] = useState(0);       // component prong: US-made magnets
  const [source, setSource] = useState(0);   // mineral prong: non-China sourcing
  const [rec, setRec] = useState(0);         // recycling collection rate
  const [china, setChina] = useState(0);     // China export-restriction severity
  const [rcost, setRcost] = useState(AXES.rcostMin); // US recycling cost factor
  const [stockpile, setStockpile] = useState(0);     // strategic stockpile size (kt)
  // Real-world projects overlay (default = operating + under-construction). The
  // active allied set drives the country-level allied HHI in the trade-risk index.
  const [activeProjects, setActiveProjects] = useState<Set<string>>(() => new Set(DEFAULT_ACTIVE));
  const [projectScale, setProjectScale] = useState<Record<string, number>>({});
  const alliedHHIMap = useMemo(
    () => alliedHHIByStage(activeProjects, projectScale), [activeProjects, projectScale]);
  const toggleProject = useCallback((id: string) => setActiveProjects((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  }), []);
  const scaleProject = useCallback((id: string, v: number) =>
    setProjectScale((s) => ({ ...s, [id]: v })), []);
  const presetProjects = useCallback((which: 'all' | 'none' | 'realistic') => setActiveProjects(
    which === 'all' ? new Set(ALL_IDS)
    : which === 'none' ? new Set()
    : new Set(PROJECTS.filter(isRealistic).map((p) => p.id))), []);
  // Demand summary from the demand builder: maps any sector composition + levers to
  // the two demand axes (total-demand scale + Dy/Tb intensity) the grid is solved over.
  const [demand, setDemand] = useState(
    () => ({ demand_scale: 1, dytb_intensity: 1, totalSeries: DEMAND_KT_REF, hiCoercShare: 0.5 }));
  const onSummary = useCallback(
    (s: { demand_scale: number; dytb_intensity: number; totalSeries: number[]; hiCoercShare: number }) => setDemand(s), []);

  const sc = useMemo(() => applyStockpile(interpScenario({
    make, source, rec, china, rcost, dytb: demand.dytb_intensity, dscale: demand.demand_scale,
  }), stockpile), [make, source, rec, china, rcost, demand, stockpile]);
  // The cost breakdown is US-specific (the cost the US bears to supply itself) —
  // this analysis is about US supply security. Global trade/co-product don't apply.
  const US_COST_KEYS = COST_KEYS.filter(([k]) => k !== 'trade' && k !== 'coproduct');
  // The bar shows REAL economic cost: the unmet-demand penalty is excluded (it's a
  // solver flag at $10k/kg, not money) and surfaced physically as unmet demand (kt).
  const REAL_COST_KEYS = US_COST_KEYS.filter(([k]) => k !== 'shortage');
  const realCost = (s: typeof sc) => REAL_COST_KEYS.reduce((a, [k]) => a + Math.max(0, s.us_cost[k] ?? 0), 0);
  const usCostReal = realCost(sc);
  const usUnmet = sc.kpis.us_unmet_kt ?? 0;
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const tri = integratedTRI(sc, alliedHHIMap);   // live readout for the mobile chip

  // Security cost-effectiveness: from no-policy at the CURRENT threat, what each
  // lever buys in integrated trade-risk reduction per real dollar (TRI per $).
  // Round Top is the exogenous strategic move whose $/TRI reads as the US
  // government's revealed shadow price of security.
  const securityLevers = useMemo(() => {
    const base = { china, rcost, dytb: demand.dytb_intensity, dscale: demand.demand_scale };
    const ref = interpScenario({ ...base, make: 0, source: 0, rec: 0 });
    const refTRI = integratedTRI(ref, alliedHHIMap), refCost = realCost(ref);
    const makeMandate = interpScenario({ ...base, make: AXES.makeMax, source: 0, rec: 0 });
    const friendshore = interpScenario({ ...base, make: 0, source: AXES.sourceMax, rec: 0 });
    const recyc = interpScenario({ ...base, make: 0, source: 0, rec: AXES.recMax });
    const stock = applyStockpile(ref, STOCKPILE_MAX);
    const row = (name: string, scn: typeof ref, dCost: number, strategic = false) =>
      ({ name, strategic, dTRI: refTRI - integratedTRI(scn, alliedHHIMap), dCost });
    return [
      // policy levers — the model's own cost; reshoring overlays — an exogenous cost
      row('US-make mandate', makeMandate, realCost(makeMandate) - refCost),
      row('Friendshore sourcing', friendshore, realCost(friendshore) - refCost),
      row('Recycling build-out', recyc, realCost(recyc) - refCost),
      row('Strategic stockpile', stock, realCost(stock) - refCost),
      row('Develop Round Top', applyRoundTop(ref, true), ROUND_TOP_COST, true),
      row('Build US separation', reshoreSupply(ref, ['separation'], 0.9), US_SEP_RESHORE_COST),
      row('Build US alloy', reshoreSupply(ref, ['alloy'], 0.9), US_ALLOY_RESHORE_COST),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [china, rcost, demand, alliedHHIMap]);

  return (
    <div style={{ maxWidth: 'var(--content-max)', margin: '0 auto', padding: isMobile ? '20px 16px 92px' : '28px 20px 0', color: 'var(--ink)' }}>
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
        <aside style={isMobile
          ? { position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60, maxHeight: '85vh', overflowY: 'auto', background: 'var(--paper)', borderRadius: '16px 16px 0 0', borderTop: '1px solid var(--rule-strong)', padding: '0 18px 40px', transform: sheetOpen ? 'translateY(0)' : 'translateY(110%)', transition: 'transform 0.28s ease', boxShadow: '0 -8px 30px rgba(0,0,0,0.28)' }
          : { border: '1px solid var(--rule)', borderRadius: 10, padding: 20, background: 'var(--paper)', position: 'sticky', top: 72 }}>
          {isMobile && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 1, background: 'var(--paper)', padding: '12px 0 10px', borderBottom: '1px solid var(--rule)' }}>
              <span style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6 }}>Scenario</span>
              <button onClick={() => setSheetOpen(false)} style={{ font: '600 12px var(--font-mono)', color: 'var(--accent)', background: 'transparent', border: '1px solid var(--rule-strong)', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>Done</button>
            </div>
          )}
          <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: '0 0 16px', display: isMobile ? 'none' : 'block' }}>Scenario</h2>

          <div style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.7, margin: '0 0 10px' }}>Policy — IRA two prongs</div>
          <Slider label="US-made magnets (reshore)" value={make} max={AXES.makeMax} onChange={setMake} fmt={(v) => pct(v * 100)}
            desc="Component prong, like the IRA EV credit: the share of US magnets that must be manufactured in the US — reshoring the final step. On its own it can still be met with imported (incl. Chinese) alloy or oxide; pair it with non-China sourcing to close that loophole." />
          <Slider label="Non-China sourcing (friendshore)" value={source} max={AXES.sourceMax} onChange={setSource} fmt={(v) => pct(v * 100)}
            desc="Mineral prong: the minimum share of US rare-earth need — counting oxide, alloy, AND the REE embodied in imported finished magnets — that must come from the US, allies, or recycling rather than China. This is the friendshoring lever: it shifts sourcing from China toward allies across the chain." />

          <div style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.7, margin: '10px 0 10px' }}>Recycling</div>
          <Slider label="End-of-life collection rate" value={rec} max={AXES.recMax} onChange={setRec} fmt={(v) => pct(v * 100)}
            desc="Share of end-of-life magnets collected and reprocessed into oxide. Recovered scrap is concentrated Nd/Pr/Dy/Tb with no co-product tax — but recycling plants must be built and paid for." />
          <Slider label="US recycling cost" value={rcost} min={AXES.rcostMin} max={AXES.rcostMax} onChange={setRcost} fmt={(v) => `${v.toFixed(1)}× China`}
            desc={`Cost to build US recycling capacity, relative to China. ${AXES.rcostMin.toFixed(1)}× is the baseline US premium; drag higher for a pessimistic cold start. Recycling is a built, paid-for capacity stage — this stress-tests how much its economics rest on that uncertain US cost. (Only bites when collection rate > 0.)`} />

          <div style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.7, margin: '10px 0 10px' }}>Geopolitics</div>
          <Slider label="China export restriction" value={china} max={AXES.chinaMax} onChange={setChina} fmt={(v) => pct(v * 100)}
            desc="Severity of Chinese export controls on oxide, alloy & magnets: 0% = open market, 100% = full ban. In between, China may still export to a shrinking share of the rest of the world's demand — allies absorb a partial cut, a full ban forces shortage or reshoring. Tightening also inflates the heavy-REE (Dy/Tb) benchmarks the US is a price-taker to, so the Dy/Tb it imports carries a rising price premium (see the cost bar)." />

          <div style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.7, margin: '10px 0 10px' }}>Resilience</div>
          <Slider label="Strategic stockpile" value={stockpile} max={STOCKPILE_MAX} onChange={setStockpile} fmt={(v) => `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)} kt`}
            desc="A pre-positioned US inventory of finished magnets (bought on the open market before a shock) drawn down to cover the earliest unmet demand, up to its size. It buys down the shortage at a real acquire + hold cost (~$110/kg) — cheap insurance against a near-term shock, but finite. Only helps where there is unmet demand to cover." />
          <p style={{ fontSize: 10.5, opacity: 0.5, margin: '8px 0 0', lineHeight: 1.4 }}>
            Strategic projects like <b>Round Top</b> are selectable in the real-world projects panel
            below; their cost-effectiveness sets the shadow price of security in the trade-risk panel.
          </p>

          <button onClick={() => { setMake(0); setSource(0); setRec(0); setChina(0); setRcost(AXES.rcostMin); setStockpile(0); setActiveProjects(new Set(DEFAULT_ACTIVE)); setProjectScale({}); }}
            style={{ marginTop: 22, width: '100%', padding: '8px 0', font: '600 12px var(--font-mono)', letterSpacing: '0.05em', color: 'var(--ink)', background: 'transparent', border: '1px solid var(--rule)', borderRadius: 6, cursor: 'pointer' }}>
            RESET TO BASELINE
          </button>
        </aside>

        <main>
          {/* 1 — the whole chain first, so users learn the stages + connections */}
          <FlowDiagram sc={sc} />

          {/* 2 — how that chain meets US magnet demand over time + the US ramp
              (desktop only — trimmed on mobile for a leaner essentials view) */}
          {!isMobile && <PathwayCharts sc={sc} years={YEARS} hiCoercShare={demand.hiCoercShare}
            usDemandMax={US_DEMAND_SHARE * Math.max(...DEMAND_KT_REF) * 1.45} />}

          {/* 3 — what it costs (absolute, growing/shrinking). Real economic cost
              only; unmet demand is shown physically (red), not as a $ penalty. */}
          {!isMobile && <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20, background: 'var(--paper)', marginTop: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: 0 }}>Cost to the US of supply security</h2>
              <span style={{ font: '600 15px var(--font-mono)' }}>
                {musd(usCostReal)} <span style={{ opacity: 0.5, fontWeight: 400 }}>real NPV</span>
                {usUnmet > 0.05 && <span style={{ color: WORSE, fontWeight: 600 }}> · +{usUnmet.toFixed(1)} kt unmet</span>}
              </span>
            </div>
            <p style={{ fontSize: 11.5, opacity: 0.5, margin: '0 0 12px', lineHeight: 1.45 }}>
              Absolute build + operating cost of US-located capacity by stage, plus the heavy-REE
              price premium and any strategic stockpile (2026–35 NPV). The bar length is the real
              cost — it grows as you force more security, shrinks as imports do the work. When the
              chain physically can’t deliver, that surfaces as <span style={{ color: WORSE }}>unmet
              demand</span> (above), not as a dollar cost.
            </p>
            <div style={{ height: 30, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--rule)', background: 'var(--paper-2)' }}>
              <div style={{ display: 'flex', height: '100%', width: `${Math.min(100, (usCostReal / COST_AXIS_MAX) * 100)}%`, transition: 'width 0.15s' }}>
                {REAL_COST_KEYS.map(([k, lbl, color]) => {
                  const v = Math.max(0, sc.us_cost[k] ?? 0);
                  if (v <= 0) return null;
                  return <div key={k} title={`${lbl}: ${musd(v)}`} style={{ width: `${(v / usCostReal) * 100}%`, background: color }} />;
                })}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink)', opacity: 0.45, marginTop: 2 }}>
              <span>$0B</span><span>{musd(COST_AXIS_MAX / 2)}</span><span>{musd(COST_AXIS_MAX)}+</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 20px', marginTop: 14 }}>
              {REAL_COST_KEYS.map(([k, lbl, color]) => {
                const v = sc.us_cost[k] ?? 0;
                const dv = v - (BASE.us_cost[k] ?? 0);
                const showDelta = Math.abs(dv) >= 100;
                return (
                  // fixed column per item (label / value / delta) so values can change
                  // without the row reflowing or the plots below jumping
                  <div key={k} title={COST_DESC[k]} style={{ display: 'flex', flexDirection: 'column', gap: 1, fontSize: 11.5, cursor: 'help', minWidth: 96 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ opacity: 0.7 }}>{lbl}</span>
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, paddingLeft: 15 }}>{musd(v)}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, paddingLeft: 15, minHeight: 13, color: showDelta ? (dv > 0 ? WORSE : 'var(--brand-green)') : 'transparent' }}>
                      {showDelta ? `${dv > 0 ? '+' : ''}${musd(dv)} vs base` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>}

          {/* 5 — trade-risk index (per stage + integrated) + cost-effectiveness */}
          <TradeRiskPanel sc={sc} levers={securityLevers} alliedHHI={alliedHHIMap} />

          {/* 5b — the real-world project build-out driving the allied country HHI
              (desktop only — long list, trimmed on mobile) */}
          {!isMobile && <ProjectsPanel active={activeProjects} scale={projectScale}
            onToggle={toggleProject} onScale={scaleProject} onPreset={presetProjects} />}

          {/* 6 — headline KPIs last, as a summary scorecard */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 26 }}>
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
        </main>
      </div>

      {/* Mobile: a live result chip + a button that opens the scenario controls as a
          slide-up sheet (so the controls never overlay the plots). */}
      {isMobile && (
        <>
          {sheetOpen && (
            <div onClick={() => setSheetOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,0.35)' }} />
          )}
          {!sheetOpen && (
            <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 16px', background: 'var(--paper)', borderTop: '1px solid var(--rule-strong)', boxShadow: '0 -4px 16px rgba(0,0,0,0.12)' }}>
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
                <span style={{ fontSize: 12.5 }}><b style={{ color: riskColor(tri), fontFamily: 'var(--font-mono)' }}>TRI {tri.toFixed(2)}</b> <span style={{ opacity: 0.5 }}>trade-risk</span></span>
                <span style={{ opacity: 0.6, fontSize: 11 }}>{pct(sc.kpis.us_import_pct)} of US magnets imported</span>
              </span>
              <button onClick={() => setSheetOpen(true)}
                style={{ font: '600 13px var(--font-mono)', color: 'var(--paper)', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '11px 16px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Adjust scenario ▲
              </button>
            </div>
          )}
        </>
      )}

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
