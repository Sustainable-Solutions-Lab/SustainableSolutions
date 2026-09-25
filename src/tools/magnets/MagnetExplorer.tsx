import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AXES, BASE, interpScenario, applyStockpile, applyRoundTop, reshoreSupply, ROUND_TOP_COST, ROUND_TOP_MINING_DI, STOCKPILE_MAX, YEARS, ensurePriceFloorSlices, priceFloorReady, ensureAbatementCeilingSlices,
         abatementCeilingReady, HAS_ABATEMENT_CEILING, ABATEMENT_CEILINGS } from './interp';
import { integratedTRI, integratedRE, classTRI, stageBreakdownClass, RE_CLASS_WEIGHT, riskColor, riskChip } from './tri';
import { axisDiff, AXIS_LABEL, AXIS_FMT, type AxisKey } from './ScenarioBar';
import DemandChips from './DemandChips';
import AbatementReadout from './AbatementReadout';
import CapacityPanel, { type ReClass } from './CapacityPanel';
import RdValuePanel from './RdValuePanel';
import { hurdleRate } from './projectFinance';
import { BusyOverlay } from '../_shell/busy-overlay.jsx';

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
// ~$0.5B; magnet ~$0.9B — the highest-tonnage final step, labor- + precision-
// intensive sintering/machining/coating) — illustrative and tunable, like all the
// security-investment figures.
const US_SEP_RESHORE_COST = 1200;
const US_ALLOY_RESHORE_COST = 500;
const US_MAGNET_RESHORE_COST = 900;

// Friendshoring builds nothing in the US, so it has no US capital cost — but it shifts
// US imports from cheap Chinese material to pricier allied material, a premium US
// CONSUMERS pay. We price it as the ex-China cost premium on the China-displaced share
// of US magnet demand (NPV 2026–35), so friendshoring's expense is gauged, not ignored.
const ALLIED_MAGNET_PREMIUM = 0.25;   // ex-China NdFeB ~25% pricier (no Chinese subsidy/scale); tunable
const MAGNET_PRICE = 75;              // $/kg finished sintered NdFeB == $M/kt; representative, tunable
// Consumer premium ($M NPV): the ex-China premium the US pays for ALLY-sourced supply —
// Nd/Pr-oxide premium on allied light oxide + a manufacturing premium on any finished
// magnets imported from allies (the heavy Dy/Tb premium is separate, in dytb_premium).
// Mirrors core/trade_risk.consumer_premium so the tool + paper agree.
const LIGHT_OXIDE_PREMIUM = 45, MAGNET_MFG_PREMIUM = 15, CONS_DISCOUNT = 0.05;
function consumerPremium(path: { us_mix?: Record<string, number[]>; us_mix_re?: { light?: Record<string, number[]> } }): number {
  const lightAllied = path?.us_mix_re?.light?.allied ?? [];
  const magAllied = path?.us_mix?.allied ?? [];
  const n = Math.max(lightAllied.length, magAllied.length);
  let tot = 0;
  for (let t = 0; t < n; t++)
    tot += (LIGHT_OXIDE_PREMIUM * Math.max(0, lightAllied[t] ?? 0) + MAGNET_MFG_PREMIUM * Math.max(0, magAllied[t] ?? 0)) / (1 + CONS_DISCOUNT) ** t;
  return tot;
}
import FlowDiagram from './FlowDiagram';
import DemandBuilder from './DemandBuilder';
import { allScenario, demandSummary, DEFAULT_LEVERS, type PerSectorScenario, type Levers } from './demand';
import TradeRiskPanel from './TradeRiskPanel';
import ProjectsAside from './ProjectsAside';
import { alliedHHIByStage, activeSet, DEFAULT_FUTURE, FUTURE_PROJECTS, PROJECTS, tier, usProjectsBuildCost, type Tier } from './projects';
import { realWorldFlows, reconcileUsSupply, reconcileUsMix, reconcileUsMixRe, reconcileUsSupplyRe } from './realworld';

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

// Polka-dot overlay marking the cleanly heavy-REE (Dy/Tb) cost on the cost bar —
// stippling, distinct from the hatching that denotes unmet demand on the pathway charts.
const STIPPLE: CSSProperties = {
  backgroundImage: 'radial-gradient(rgba(248,248,232,0.85) 0.9px, transparent 1.2px)',
  backgroundSize: '5px 5px',
};

const COST_KEYS: [string, string, string][] = [
  ['mining', 'Mining', '#F46D43'],
  ['separation', 'Separation', '#D53E4F'],
  ['alloy', 'Alloy', '#FDAE61'],
  ['magnet', 'Magnet', '#3288BD'],
  ['recycling', 'Recycling', '#66C2A5'],
  ['round_top', 'Round Top (assumed)', '#3288BD'],
  ['us_projects', 'US strategic projects (selected)', '#3288BD'],
  ['stockpile', 'Strategic stockpile', '#5E4FA2'],
  ['dytb_premium', 'Heavy-REE price premium', '#762A83'],
  ['price_floor', 'Price floor (tariff on China imports)', '#5E4FA2'],
  ['consumer_premium', 'Consumer premium (ally imports)', '#9970AB'],
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
  us_projects: 'Build cost of the US projects you’ve selected that are still under construction or planned (Round Top, Lynas Seadrift, e-VAC, Cyclic, Energy Fuels, …) — capacity × an illustrative per-stage build rate ($/kt, calibrated so Round Top ≈ $400M). These exogenous strategic builds lower the trade-risk index, so their cost belongs in the NPV; the model meets the residual demand at modeled cost. Operating plants (e.g. MP Fort Worth) are sunk and already in the modeled baseline, so they’re excluded to avoid double-counting.',
  stockpile: 'Cost of the strategic magnet stockpile: size × an all-in acquire + hold rate (~$110/kg, grounded in Benchmark Feb-2026 prices for Dy/Tb-rich grades). A real, paid cost that buys down the unmet-demand penalty by covering the earliest shortfall.',
  dytb_premium: 'Price-taker premium the US pays on the Dy/Tb it imports (as oxide, alloy, or embodied in magnets) as China’s export controls inflate the heavy-REE benchmarks Western buyers are bound to. Scales with the China-restriction slider; the US escapes by separating or recycling Dy/Tb domestically — limited in the near term, since the one active US mine (Mountain Pass) is light-REE and domestic heavy-REE prospects (e.g. Round Top, TX) are pre-commercial.',
  price_floor: 'Cost of the US price-floor policy: the tariff paid on whatever Chinese oxide / alloy / magnet the US still imports after the floor is set (rate scaled by the slider, sized to the ex-China premium). Borne by consumers as a higher import price, not US capital — no factory needed. As the floor rises it pushes China out of US sourcing, so this line often falls toward zero while the avoided-China cost reappears as domestic build + the ally consumer premium.',
  consumer_premium: 'The ex-China premium US buyers pay for ALLY-sourced supply rather than cheaper Chinese material — the Nd/Pr-oxide premium on allied light oxide (~$45/kg) plus a manufacturing premium on any finished magnets imported from allies (~$15/kg). Borne as a higher import price, not US capital, so it rises with friendshoring. The heavy Dy/Tb premium is shown separately above.',
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
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 1 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink)', opacity: 0.45, marginTop: -1 }}>
        <span>{fmt(min)}</span><span>{fmt((min + max) / 2)}</span><span>{fmt(max)}</span>
      </div>
      {desc && open && (
        <p style={{ fontSize: 11, opacity: 0.6, margin: '6px 0 0', lineHeight: 1.45 }}>{desc}</p>
      )}
    </div>
  );
}

// Every scorecard is a full-height flex column so the grid's equal rows are
// filled rather than just matched: caption at the top, footnote pinned to the
// bottom by `marginTop: auto`. Without this the cards are the same height but
// their text floats at different offsets, which reads as misalignment.
const CARD: CSSProperties = {
  border: '1px solid var(--rule)', borderRadius: 10, padding: '11px 13px',
  background: 'var(--paper)', height: '100%', display: 'flex', flexDirection: 'column',
};
const CARD_LABEL: CSSProperties = { fontSize: 11, opacity: 0.6, marginBottom: 3, lineHeight: 1.25 };
const CARD_SUB: CSSProperties = {
  font: '400 9px var(--font-mono)', opacity: 0.5, marginTop: 'auto',
  paddingTop: 4, letterSpacing: '0.03em',
};
const CARD_VALUE = (small?: boolean) =>
  ({ font: `600 ${small ? 14 : 21}px var(--font-mono)`, lineHeight: 1.15,
     display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }) as CSSProperties;

function ScoreCard({ label, value, sub, valueColor, small, chip, delta, deltaColor }: {
  label: string; value: string; sub?: string; valueColor: string; small?: boolean; chip?: boolean;
  delta?: string; deltaColor?: string;
}) {
  return (
    <div style={CARD}>
      <div style={CARD_LABEL}>{label}</div>
      <div style={CARD_VALUE(small)}>
        <span style={chip ? { ...riskChip(valueColor), display: 'inline-block' } : { color: valueColor }}>{value}</span>
        {delta && <span style={{ fontSize: 12, fontWeight: 600, color: deltaColor ?? 'var(--ink-3)' }}>{delta}</span>}
      </div>
      {sub && <div style={CARD_SUB}>{sub}</div>}
    </div>
  );
}

/** A headline number with its two additive parts underneath, same hairline
 *  motif as ScoreCard2. Used for the trade-risk index, where the total really
 *  is 0.6*heavy + 0.4*light, so the two parts SUM to the number above them —
 *  worth showing, since which class drives the index is the whole argument. */
function ScoreCardTotal({ label, value, valueColor, sub, delta, deltaColor, parts }: {
  label: string; value: string; valueColor: string; sub?: string;
  delta?: string; deltaColor?: string;
  parts: { label: string; short: string; value: string }[];
}) {
  return (
    <div style={CARD}>
      <div style={CARD_LABEL}>{label}</div>
      {/* Parts sit INLINE with the headline, not stacked beneath it. Stacked they
          added ~35px, and since gridAutoRows matches every row to the tallest
          card, this one card was inflating the whole strip. The full arithmetic
          (class index x weight) moves to the title attribute. */}
      <div style={CARD_VALUE()}>
        <span style={{ ...riskChip(valueColor), display: 'inline-block' }}>{value}</span>
        {delta && <span style={{ fontSize: 12, fontWeight: 600, color: deltaColor ?? 'var(--ink-3)' }}>{delta}</span>}
        <span title={parts.map((x) => `${x.label} = ${x.value}`).join('    ')}
          style={{ font: '400 10px var(--font-mono)', opacity: 0.62, whiteSpace: 'nowrap', cursor: 'help' }}>
          {parts.map((x, i) => (
            <span key={x.short}>
              {i > 0 && <span style={{ opacity: 0.5 }}> · </span>}
              <b style={{ fontWeight: 600, opacity: 0.9 }}>{x.value}</b> {x.short}
            </span>
          ))}
        </span>
      </div>
      {sub && <div style={CARD_SUB}>{sub}</div>}
    </div>
  );
}

/** Two related readouts in one card. Keeps the scorecard grid on an even count
 *  (seven cards left an orphan on the last row) and pairs the two numbers that
 *  answer the same question: how much of US demand is met, and from where. */
function ScoreCard2({ label, a, b, small, chip }: {
  label: string; small?: boolean; chip?: boolean;
  a: { label: string; value: string; color: string; delta?: string; deltaColor?: string };
  b: { label: string; value: string; color: string; delta?: string; deltaColor?: string };
}) {
  const half = (h: typeof a) => (
    <div style={{ flex: '1 1 0', minWidth: 0 }}>
      {/* chip = risk-tinted background behind the value. The amber and yellow
          risk steps are ~1.2:1 against the cream surface as plain text, i.e.
          unreadable; the chip background is what makes them legible, so any
          value carrying a risk colour needs it. */}
      <div style={{ ...CARD_VALUE(small), color: chip ? undefined : h.color, gap: 5 }}>
        <span style={chip ? { ...riskChip(h.color), display: 'inline-block' } : undefined}>{h.value}</span>
        {h.delta && <span style={{ fontSize: 11.5, fontWeight: 600, color: h.deltaColor ?? 'var(--ink-3)' }}>{h.delta}</span>}
      </div>
      <div style={{ font: '400 9px var(--font-mono)', opacity: 0.5, marginTop: 4, letterSpacing: '0.03em' }}>{h.label}</div>
    </div>
  );
  return (
    <div style={CARD}>
      <div style={CARD_LABEL}>{label}</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginTop: 'auto' }}>
        {half(a)}
        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--rule)' }} />
        {half(b)}
      </div>
    </div>
  );
}

export default function MagnetExplorer() {
  const [make, setMake] = useState(0);       // component prong: US-made magnets
  const [source, setSource] = useState(0);   // mineral prong: non-China sourcing
  const [rec, setRec] = useState(0);         // recycling collection rate
  // BASE CASE is a partially restricted world, not an open market. The study
  // exists because buyers are already paying to hedge Chinese supply, and an
  // undisrupted default answers a question nobody is asking: of course the
  // least-cost plan builds no US capacity when China exports freely. 0.6 is the
  // paper's canonical reference cell (the 83%-heavy-FEOC exposure figure), so the
  // tool opens on the same world the written results describe.
  //
  // Note what it does NOT fix: with no intervention the planner asks for no US
  // capacity at ANY restriction below 0.85, so the actor panel opens with nothing
  // to screen. That is the finding, not a defect, and the panel says so.
  const [china, setChina] = useState(0.6);   // China export-restriction severity
  const [rcost, setRcost] = useState(AXES.rcostMin); // US recycling cost factor
  const [stockpile, setStockpile] = useState(0);     // strategic stockpile size (kt)
  const [pfloor, setPfloor] = useState(0);           // US price floor on China imports (0 / .5 / 1)
  // The floor=0 grid is eager; the half/full slices load on first use of the slider.
  const [pfReady, setPfReady] = useState(priceFloorReady());
  useEffect(() => {
    if (pfloor > 0 && !pfReady) ensurePriceFloorSlices().then(() => setPfReady(true));
  }, [pfloor, pfReady]);
  // Abatement ceiling: 0 = today's sectoral availability, 1 = the barrier broken.
  // Its three slices (one per price-floor level) load on first use, exactly like the
  // floor slices; until then interpScenario answers at the baseline ceiling.
  // Continuous now: the barrier is removed by degrees, and the research that
  // removes it is priced. Both endpoints are solved; between them we blend.
  const [abunlock, setAbunlock] = useState(0);
  const [rdCostPerKg, setRdCostPerKg] = useState(50);   // $ per kg of capability unlocked
  // The actor-side calibration. Exposed rather than fixed because these are the
  // numbers the US conclusion turns on and the ones we are least sure of.
  const [costMult, setCostMult] = useState(1);            // x the US cost disadvantage
  const [foakMult, setFoakMult] = useState(1);            // x the FOAK premium above one
  const [provenancePremium, setProvenancePremium] = useState(0);   // $/kg for non-China supply
  const [ceilingReady, setCeilingReady] = useState(abatementCeilingReady());
  const loadCeiling = () => ensureAbatementCeilingSlices().then(() => setCeilingReady(true));
  useEffect(() => {
    if (abunlock > 0 && !ceilingReady) void loadCeiling();
  }, [abunlock, ceilingReady]);
  // Real-world projects overlay (default = operating only; construction + planned off). The
  // active allied set drives the country-level allied HHI in the trade-risk index.
  // Only the uncertain future supply is toggled; operating plants are always in.
  const [futureSel, setFutureSel] = useState<Set<string>>(() => new Set(DEFAULT_FUTURE));
  const activeProjects = useMemo(() => activeSet(futureSel), [futureSel]);
  const alliedHHIMap = useMemo(() => alliedHHIByStage(activeProjects), [activeProjects]);
  const toggleFuture = useCallback((id: string) => setFutureSel((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  }), []);
  const setProjectGroup = useCallback((t: Tier, on: boolean) => setFutureSel((s) => {
    const n = new Set(s);
    FUTURE_PROJECTS.filter((p) => tier(p) === t).forEach((p) => (on ? n.add(p.id) : n.delete(p.id)));
    return n;
  }), []);
  // Demand summary from the demand builder: maps any sector composition + levers to
  // the two demand axes (total-demand scale + Dy/Tb intensity) the grid is solved over.
  // Demand state lives here (lifted from DemandBuilder) so the demand controls can
  // share the mobile bottom sheet with the supply controls while the chart stays on
  // the page. The summary feeds the supply grid's two demand axes.
  const [scenario, setScenario] = useState<PerSectorScenario>(() => allScenario('STEPS'));
  const [lv, setLv] = useState<Levers>(DEFAULT_LEVERS);
  const demand = useMemo(() => demandSummary(scenario, lv), [scenario, lv]);
  // The same scenario with NO demand levers — the reference for "what the levers buy"
  // (so the value reflects the chosen scenario, e.g. NZE, not an absolute 1.0).
  const demandNoLever = useMemo(() => demandSummary(scenario, DEFAULT_LEVERS), [scenario]);

  const sc = useMemo(() => applyStockpile(interpScenario({
    make, source, rec, china, rcost, dytb: demand.dytb_intensity, dscale: demand.demand_scale, pfloor, abunlock,
  }), stockpile), [make, source, rec, china, rcost, demand, stockpile, pfloor, pfReady, abunlock, ceilingReady]);
  // The cost breakdown is US-specific (the cost the US bears to supply itself) —
  // this analysis is about US supply security. Global trade/co-product don't apply.
  const US_COST_KEYS = COST_KEYS.filter(([k]) => k !== 'trade' && k !== 'coproduct');
  // The bar shows REAL economic cost: the unmet-demand penalty is excluded (it's a
  // solver flag at $10k/kg, not money) and surfaced physically as unmet demand (kt).
  const REAL_COST_KEYS = US_COST_KEYS.filter(([k]) => k !== 'shortage');
  const realCost = (s: typeof sc) => REAL_COST_KEYS.reduce((a, [k]) => a + Math.max(0, s.us_cost[k] ?? 0), 0);
  // The SAME world at both ceilings, so the R&D panel can difference them. Both
  // are grid reads, not solves, so this costs nothing beyond a lookup.
  const rdPair = useMemo(() => {
    const at = (u: number) => interpScenario({
      make, source, rec, china, rcost,
      dytb: demand.dytb_intensity, dscale: demand.demand_scale, pfloor, abunlock: u,
    });
    return { base: at(0), unlocked: at(1) };
  }, [make, source, rec, china, rcost, demand, pfloor, pfReady, ceilingReady]);
  const usUnmet = sc.kpis.us_unmet_kt ?? 0;
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [demandOpen, setDemandOpen] = useState(false);
  // Which year the Sankey shows. The horizon end alone hides the ramp: 2030 is
  // mid-build, before long-lead US capacity arrives, which is where a reshoring
  // story either is or is not already underway. Grids written before 2026-09-25
  // carry no snapshots, so the selector hides itself rather than offering years
  // it cannot serve.
  const [flowYear, setFlowYear] = useState<string>('2035');
  // Price world drives the actor screen only. It is a free control because the
  // screen is arithmetic rather than a solve — see projectFinance.ts. It cannot
  // move the Sankey, and should not: the planner has no prices.
  const [priceWorld, setPriceWorld] = useState<string>('ex_china');   // sector detail + demand levers
  // Actor-mode controls. The hurdle rate IS the actor/planner distinction — there
  // is no separate mode switch — so it defaults to the US firm rate and can be
  // dragged down to the planner's, which reproduces planner mode exactly.
  const [hurdle, setHurdle] = useState<number>(hurdleRate('USA'));
  const [instruments, setInstruments] = useState<Record<string, boolean>>(
    { offtake: false, floor: false, guarantee: false });
  // Governs BOTH the capacity bars and the per-stage risk chips beside them, since
  // "which stage is exposed" has a different answer for Dy/Tb than for Nd/Pr.
  const [reClass, setReClass] = useState<ReClass>('heavy');   // the chokepoint by default
  // The two derived axes have no slider here; their chips send you to the control
  // that actually moves them (the sheet on mobile, the builder on desktop).
  const jumpToDemand = useCallback(() => {
    if (isMobile) setSheetOpen(true);
    document.getElementById('demand-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [isMobile]);

  // ── pin & compare ────────────────────────────────────────────────────────
  // Every claim this tool supports is comparative ("the lever buys you X"), but
  // there was no way to hold one scenario and read another against it. That is
  // also how a duplicated quarter of the grid went unnoticed. Pin snapshots the
  // coordinates and the headline metrics; the scorecards then read as deltas.
  type Pin = { coords: Record<AxisKey, number>; tri: number; cost: number;
               imp: number; touch: number; unmet: number };
  const [pin, setPin] = useState<Pin | null>(null);
  const [infoCost, setInfoCost] = useState(false);   // ⓘ toggle for the cost-bar method note
  const [resetFlash, setResetFlash] = useState(false); // brief confirm-flash on "reset to baseline"
  // Real-world-anchored Sankey: selected projects locked in by region, China residual.
  const snapshotYears: string[] = Object.keys((sc as any).flows_by_year ?? {}).sort();
  const rwFlows = useMemo(() => {
    // Swap the flow set for the chosen year on a shallow clone, so realWorldFlows
    // keeps reading sc.flows and needs no change.
    const byYear = (sc as any).flows_by_year?.[flowYear];
    const scY = byYear ? { ...sc, flows: byYear } : sc;
    return {
      total: realWorldFlows(scY, activeProjects),
      heavy: realWorldFlows(scY, activeProjects, {}, 'heavy'),
      light: realWorldFlows(scY, activeProjects, {}, 'light'),
    };
  }, [sc, activeProjects, flowYear]);
  // Reconcile the US-centric views (trade-risk index + pathway) with the selected
  // projects: US-project capacity is a floor on US self-sufficiency; the model fills
  // the residual. So toggling projects moves the TRI and the demand-met chart, the
  // same way it now moves the Sankey.
  // A US heavy-REE mine (e.g. Round Top) means the US now HAS a domestic heavy reserve,
  // so the mining stage's domestic-reserve risk falls — even though Mountain Pass (light)
  // already covers the mining VOLUME. (Interim until the light/heavy TRI split.)
  const hasUSHeavyMine = useMemo(
    () => PROJECTS.some((p) => activeProjects.has(p.id) && p.bloc === 'us' && p.stage === 'mining' && p.heavy),
    [activeProjects]);
  const scR = useMemo(() => {
    const rpath = { ...sc.path, us_mix: reconcileUsMix(sc, activeProjects), us_mix_re: reconcileUsMixRe(sc, activeProjects) ?? sc.path.us_mix_re };
    return {
      ...sc,
      us_supply: reconcileUsSupply(sc, activeProjects),
      us_supply_re: reconcileUsSupplyRe(sc, activeProjects),
      // Selected US projects (construction + planned — Round Top, Lynas Seadrift, e-VAC,
      // Cyclic, …) cost money to build AND lower the TRI; both must move together, or the
      // tool shows security for free. Their build cost flows into REAL_COST_KEYS so the NPV
      // + cost bar rise; the model meets the residual demand at modeled cost.
      us_cost: { ...sc.us_cost, consumer_premium: consumerPremium(rpath), us_projects: usProjectsBuildCost(activeProjects) },
      path: rpath,
      _di: hasUSHeavyMine ? { ...sc._di, mining: ROUND_TOP_MINING_DI } : sc._di,
    };
  }, [sc, activeProjects, hasUSHeavyMine]);
  const usCostReal = realCost(scR);   // includes the consumer premium on ally-sourced supply
  // baseline = do-nothing (no US policy/projects) at the SAME demand scenario + threat, so
  // the delta is the cost of the security choices made (can be negative if reshoring avoids
  // more China premium than it costs to build).
  const baseNPV = realCost(interpScenario({ make: 0, source: 0, rec: 0, china, rcost, dytb: demand.dytb_intensity, dscale: demand.demand_scale, abunlock }));
  const npvDelta = usCostReal - baseNPV;
  const tri = integratedRE(scR, alliedHHIMap);   // live readout (light+heavy weighted)
  // China-exposed demand — FAITHFUL flow-traced provenance from the model export
  // (kpis.china_exposed_pct): the share of DELIVERED US magnet demand whose material
  // touched China at ANY chain stage. A unit is China-free only if its ore AND oxide AND
  // alloy AND magnet are all non-Chinese; the model traces this by proportional (Leontief)
  // mixing through the regional flow vars. This replaces the old 1−Π(1−china_share) proxy:
  // it catches the trans-shipment loophole (Chinese ore separated in an ally then shipped
  // to the US still counts as exposed) and the heavy Dy/Tb chokepoint (the alloy still
  // traces to Chinese separation), so maxing US-MAKE alone barely moves it.
  // The model KPI reflects the model's own (committed/operating) project set. To keep this
  // card responsive to the INTERACTIVE project toggles — the same way the TRI, Sankey, and
  // pathway move — we nudge the faithful base by the project-floor delta the old per-stage
  // proxy still captures (reconciled minus raw US per-stage China share).
  const proxyTouch = (u: typeof scR.us_supply) => 1 - ['mining', 'separation', 'alloy', 'magnet']
    .reduce((p, st) => p * (1 - Math.min(1, Math.max(0, u?.[st]?.china ?? 0))), 1);
  // Headline the HEAVY (Dy/Tb) China-exposure — the binding chokepoint and the paper's
  // central metric (~82% at baseline: nearly all heavy ore is Chinese, so ex-China
  // separation only launders it). Nudge with the heavy per-stage proxy so the card tracks
  // the project toggles. Falls back to the aggregate KPI for older JSON without the split.
  const heavyFeoc = sc.kpis.china_exposed_heavy_pct;
  // Light's flow-traced twin, emitted from the 2026-09-25 grid on. Until a grid
  // carries it the card stays single-valued rather than inventing a split from
  // supply-mix shares, which is a different quantity.
  const lightFeoc = (sc.kpis as any).china_exposed_light_pct as number | undefined;
  const feocIsHeavy = heavyFeoc != null;
  const feocSupplyBase = (feocIsHeavy ? sc.us_supply_re?.heavy : undefined) ?? sc.us_supply;
  const feocSupplyR = (feocIsHeavy ? scR.us_supply_re?.heavy : undefined) ?? scR.us_supply;
  const projDelta = proxyTouch(feocSupplyR) - proxyTouch(feocSupplyBase);
  const feocBase = (feocIsHeavy ? heavyFeoc : sc.kpis.china_exposed_pct ?? 0) / 100;
  const chinaTouch = Math.min(1, Math.max(0, feocBase + projDelta));

  // Current grid coordinates, and the snapshot/compare helpers that read against
  // a pinned set. Deltas are signed so that NEGATIVE always means "better" for
  // the metrics where lower is better (all of these except none, today).
  const coords: Record<AxisKey, number> = {
    make, source, rec, china, rcost, pfloor,
    dytb: demand.dytb_intensity, dscale: demand.demand_scale,
  };
  const changed = pin ? axisDiff(coords, pin.coords) : [];
  const doPin = () => setPin({
    coords, tri, cost: usCostReal, imp: sc.kpis.us_import_pct ?? 0,
    touch: chinaTouch, unmet: usUnmet,
  });
  const restorePin = () => {
    if (!pin) return;
    const c = pin.coords;
    setMake(c.make); setSource(c.source); setRec(c.rec);
    setChina(c.china); setRcost(c.rcost); setPfloor(c.pfloor);
    // dytb/dscale are derived; they follow once the demand controls are reset,
    // which the user does in the builder. Flag it rather than silently diverge.
  };

  /** Signed delta string + colour, given "is lower better". */
  const deltaOf = (cur: number, was: number, fmt: (v: number) => string, lowerBetter = true, eps = 0) => {
    const d = cur - was;
    if (Math.abs(d) <= eps) return { delta: 'no change', deltaColor: 'var(--ink-3)' };
    const good = lowerBetter ? d < 0 : d > 0;
    return {
      delta: `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))} vs pin`,
      deltaColor: good ? 'var(--brand-green)' : WORSE,
    };
  };

  // Security cost-effectiveness: from no-policy at the CURRENT threat, what each
  // lever buys in integrated trade-risk reduction per real dollar (TRI per $).
  // Round Top is the exogenous strategic move whose $/TRI reads as the US
  // government's revealed shadow price of security.
  const securityLevers = useMemo(() => {
    const base = { china, rcost, dytb: demand.dytb_intensity, dscale: demand.demand_scale, abunlock };
    // TRI with the project floors applied (so lever ROI is consistent with the panel).
    // Use integratedRE — the SAME heavy-weighted metric the panel displays — not the
    // aggregate integratedTRI; otherwise a lever that only helps the (low-weight, non-
    // chokepoint) magnet stage, like "Build US magnet", spuriously topped the ranking.
    const triR = (scn: Parameters<typeof reconcileUsSupply>[0]) =>
      integratedRE({ ...scn, us_supply: reconcileUsSupply(scn, activeProjects),
        us_supply_re: reconcileUsSupplyRe(scn, activeProjects) ?? (scn as any).us_supply_re }, alliedHHIMap);
    const ref = interpScenario({ ...base, make: 0, source: 0, rec: 0 });
    const refTRI = triR(ref), refCost = realCost(ref);
    const makeMandate = interpScenario({ ...base, make: AXES.makeMax, source: 0, rec: 0 });
    const friendshore = interpScenario({ ...base, make: 0, source: AXES.sourceMax, rec: 0 });
    const recyc = interpScenario({ ...base, make: 0, source: 0, rec: AXES.recMax });
    const stock = applyStockpile(ref, STOCKPILE_MAX);
    const row = (name: string, scn: typeof ref, dCost: number, strategic = false, consumer = false) =>
      ({ name, strategic, consumer, demand: false, dTRI: refTRI - triR(scn), dCost });
    // Friendshoring consumer-price premium: the ex-China premium × the China-displaced
    // share of US demand × discounted US magnet demand (2026–35). It moves China-sourced
    // embodied RE to allies (averaged across stages), which costs consumers more.
    const reconChina = (s: typeof ref) => {
      const u = reconcileUsSupply(s, activeProjects);
      const st = ['mining', 'separation', 'alloy', 'magnet'];
      return st.reduce((a, k) => a + (u[k]?.china ?? 0), 0) / st.length;
    };
    const fsDChina = Math.max(0, reconChina(ref) - reconChina(friendshore));
    const fsMix = friendshore.path.us_mix;
    const fsN = (fsMix.domestic ?? []).length || 1;
    let fsDemNPV = 0;
    for (let t = 0; t < fsN; t++)
      fsDemNPV += ((fsMix.domestic?.[t] || 0) + (fsMix.allied?.[t] || 0) + (fsMix.china?.[t] || 0) + (fsMix.unmet?.[t] || 0)) / (1.05 ** t);
    const friendshoreCost = ALLIED_MAGNET_PREMIUM * MAGNET_PRICE * fsDemNPV * fsDChina;
    // Demand-side levers have no modeled supply cost; we show the TRI reduction the
    // CURRENT demand settings already achieve vs no improvement (the lever back at its
    // reference 1.0) — the value of what you've chosen, not the distance to an
    // arbitrary axis max. They map to the two demand axes: Dy/Tb intensity (thrift +
    // grade-downshift) and total demand (RE-free / efficiency).
    // "Without lever" = this scenario at its NO-LEVER demand (not absolute 1.0), so the
    // value holds up under NZE etc. (where the no-lever baseline is already high).
    const noThrift = interpScenario({ ...base, dytb: demandNoLever.dytb_intensity, make: 0, source: 0, rec: 0 });
    const noDemandCut = interpScenario({ ...base, dscale: demandNoLever.demand_scale, make: 0, source: 0, rec: 0 });
    const dRow = (name: string, withoutScn: typeof ref) =>
      ({ name, strategic: false, demand: true, dTRI: triR(withoutScn) - refTRI, dCost: 0 });
    return [
      // policy levers — the model's own cost; reshoring overlays — an exogenous cost
      row('US-make mandate', makeMandate, realCost(makeMandate) - refCost),
      row('Friendshore sourcing', friendshore, friendshoreCost, false, true),
      row('Recycling build-out', recyc, realCost(recyc) - refCost),
      row('Strategic stockpile', stock, realCost(stock) - refCost),
      row('Develop Round Top', applyRoundTop(ref, true), ROUND_TOP_COST, true),
      row('Build US separation', reshoreSupply(ref, ['separation'], 0.9), US_SEP_RESHORE_COST),
      row('Build US alloy', reshoreSupply(ref, ['alloy'], 0.9), US_ALLOY_RESHORE_COST),
      row('Build US magnet', reshoreSupply(ref, ['magnet'], 0.9), US_MAGNET_RESHORE_COST),
      dRow('Dy/Tb thrifting', noThrift),
      dRow('Lower total demand', noDemandCut),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [china, rcost, demand, demandNoLever, alliedHHIMap, activeProjects, abunlock, ceilingReady]);

  // Story scorecard inputs: the single most concerning bottleneck (highest-TRI stage
  // across BOTH RE classes) and the most cost-effective lever (lowest $/0.1-TRI).
  const cpStages = [
    ...stageBreakdownClass(scR, 'heavy', alliedHHIMap).map((s) => ({ ...s, elem: 'Dy/Tb' })),
    ...stageBreakdownClass(scR, 'light', alliedHHIMap).map((s) => ({ ...s, elem: 'Nd/Pr' })),
  ];
  const chokepoint = cpStages.reduce((a, b) => (b.tri > a.tri ? b : a), cpStages[0]);
  // Per-class views of the same two statistics, for the split cards. The TRI
  // parts are the WEIGHTED contributions (0.6*heavy, 0.4*light), so they sum to
  // the headline index rather than being two unrelated numbers beside it.
  const worstIn = (cls: 'light' | 'heavy') =>
    stageBreakdownClass(scR, cls, alliedHHIMap).reduce((a, b) => (b.tri > a.tri ? b : a));
  const cpHeavy = worstIn('heavy'), cpLight = worstIn('light');
  const triHeavy = classTRI(scR, 'heavy', alliedHHIMap);
  const triLight = classTRI(scR, 'light', alliedHHIMap);
  // MARGINAL TRI benefit of each lever FROM THE CURRENT state (vs securityLevers' from-
  // no-policy benefit). This makes the KPI truly dynamic: a lever that's exhausted —
  // slider maxed, project built, or already satisfied by ANOTHER lever (e.g. maxing
  // "US-made magnets" also satisfies "Build US magnet") — drops to ~0 marginal benefit
  // and the recommendation advances to the next-cheapest move on its own.
  const marginalDTRI = useMemo(() => {
    const cp = { china, rcost, dytb: demand.dytb_intensity, dscale: demand.demand_scale };
    const triR = (scn: Parameters<typeof reconcileUsSupply>[0]) =>
      integratedTRI({ ...scn, us_supply: reconcileUsSupply(scn, activeProjects) }, alliedHHIMap);
    const withDi = (s: typeof sc) => (hasUSHeavyMine ? { ...s, _di: { ...s._di, mining: ROUND_TOP_MINING_DI } } : s);
    const at = (o: Record<string, number>) => withDi(applyStockpile(interpScenario({ ...cp, make, source, rec, pfloor, ...o }), stockpile));
    const cur = at({});
    const curTRI = triR(cur);
    const noBuf = withDi(interpScenario({ ...cp, make, source, rec, pfloor }));
    return {
      'US-make mandate': curTRI - triR(at({ make: AXES.makeMax })),
      'Friendshore sourcing': curTRI - triR(at({ source: AXES.sourceMax })),
      'Recycling build-out': curTRI - triR(at({ rec: AXES.recMax })),
      'Strategic stockpile': curTRI - triR(applyStockpile(noBuf, STOCKPILE_MAX)),
      'Develop Round Top': activeProjects.has('round_top') ? 0 : curTRI - triR(applyRoundTop(cur, true)),
      'Build US separation': curTRI - triR(reshoreSupply(cur, ['separation'], 0.9)),
      'Build US alloy': curTRI - triR(reshoreSupply(cur, ['alloy'], 0.9)),
      'Build US magnet': curTRI - triR(reshoreSupply(cur, ['magnet'], 0.9)),
    } as Record<string, number>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [china, rcost, demand, make, source, rec, pfloor, stockpile, hasUSHeavyMine, activeProjects, alliedHHIMap, abunlock, ceilingReady]);
  // Rank only levers that still buy meaningful security FROM HERE, by $ per 0.1 marginal TRI.
  const bestLever = securityLevers
    .filter((l) => !l.demand && l.dCost > 0 && (marginalDTRI[l.name] ?? 0) > 0.005)
    .map((l) => ({ ...l, perTRI: l.dCost / (marginalDTRI[l.name] / 0.1) }))
    .sort((a, b) => a.perTRI - b.perTRI)[0];
  // When nothing left buys security cost-effectively, that's itself a finding (the US is
  // at its security floor for this threat — only demand-side or deeper structural moves remain).
  const leversExhausted = !bestLever && securityLevers.some((l) => !l.demand && l.dCost > 0);

  // Controls live INLINE in reading order, not in a left rail: set the world,
  // see what the planner does with it, then set interventions and see how actors
  // respond. A sticky sidebar put every knob permanently beside every result,
  // which is the opposite of a sequence. On mobile they stay in the slide-up
  // sheet, where a single column already IS the reading order.
  const worldControls = (
    <>
          <div style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.7, margin: '18px 0 2px' }}>The world as it is</div>
          <p style={{ fontSize: 10, opacity: 0.5, margin: '0 0 8px', lineHeight: 1.4 }}>
            Assumptions the US does not control: they define the problem the
            interventions are trying to solve.
          </p>
      <div style={{ display: 'grid', gap: '2px 20px',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <Slider label="China export restriction" value={china} max={AXES.chinaMax} onChange={setChina} fmt={(v) => pct(v * 100)}
            desc="Severity of Chinese export controls on oxide, alloy & magnets: 0% = open market, 100% = full ban. In between, China may still export to a shrinking share of the rest of the world's demand — allies absorb a partial cut, a full ban forces shortage or reshoring. Tightening also inflates the heavy-REE (Dy/Tb) benchmarks the US is a price-taker to, so the Dy/Tb it imports carries a rising price premium (see the cost bar)." />
          <Slider label="US recycling cost" value={rcost} min={AXES.rcostMin} max={AXES.rcostMax} onChange={setRcost} fmt={(v) => `${v.toFixed(1)}× China`}
            desc={`Cost to build US recycling capacity, relative to China. ${AXES.rcostMin.toFixed(1)}× is the baseline US premium; drag higher for a pessimistic cold start. Recycling is a built, paid-for capacity stage — this stress-tests how much its economics rest on that uncertain US cost. (Only bites when collection rate > 0.)`} />

      </div>
          {/* The reference scenario: a baseline every later reading is measured
              against. It lives with the WORLD settings because that is what you
              hold fixed — you set a world, mark it as the reference, then vary
              the interventions and see what moved. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '10px 0 4px' }}>
            <button onClick={pin ? () => setPin(null) : doPin}
              title={pin ? 'Clear the reference' : 'Mark this world as the reference; every headline then reads as a change against it'}
              style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.05em', textTransform: 'uppercase',
                       padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                       border: `1px solid ${pin ? 'var(--accent)' : 'var(--rule-strong)'}`,
                       background: pin ? 'var(--accent)' : 'transparent',
                       color: pin ? 'var(--paper)' : 'var(--ink)' }}>
              {pin ? 'Reference set — clear' : 'Set as reference'}
            </button>
            {pin && (
              <span style={{ fontSize: 11, opacity: 0.7, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {changed.length === 0
                  ? 'identical to the reference'
                  : <>changed: {changed.map((k) => (
                      <b key={k} style={{ fontWeight: 600 }}>
                        {AXIS_LABEL[k]} {AXIS_FMT[k](pin.coords[k])}&rarr;{AXIS_FMT[k](coords[k])}
                      </b>
                    )).reduce((a, b) => <>{a}, {b}</>)}</>}
                <button onClick={restorePin}
                  title="Put the six supply sliders back to their pinned values. Dy/Tb intensity and demand scale are derived from the Demand Builder, so they stay put and will still be listed as changed."
                  style={{ font: '500 10px var(--font-mono)', padding: '2px 7px', borderRadius: 5,
                           border: '1px solid var(--rule-strong)', background: 'transparent',
                           color: 'var(--ink)', cursor: 'pointer' }}>restore</button>
              </span>
            )}
          </div>


    </>
  );
  const interventionControls = (
    <>
          <div style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.7, margin: '0 0 2px' }}>What the US can do</div>
          <p style={{ fontSize: 10, opacity: 0.5, margin: '0 0 8px', lineHeight: 1.4 }}>
            Interventions: things the US can choose. None of them changes the world
            settings above.
          </p>
      <div style={{ display: 'grid', gap: '2px 20px',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <Slider label="US-made magnets (reshore)" value={make} max={AXES.makeMax} onChange={setMake} fmt={(v) => pct(v * 100)}
            desc="Component prong, like the IRA EV credit: the share of US magnets that must be manufactured in the US — reshoring the final step. On its own it can still be met with imported (incl. Chinese) alloy or oxide; pair it with non-China sourcing to close that loophole." />
          <Slider label="Clean heavy sourcing (friendshore)" value={source} max={AXES.sourceMax} onChange={setSource} fmt={(v) => pct(v * 100)}
            desc="Friendshoring the heavy rare earths, FEOC-traced: the minimum share of US Dy/Tb need met by a chain-of-custody-CLEAN supply that never touched Chinese ore, oxide, or alloy at any stage — pulling ex-China-mined or recycled heavy material to US demand. Unlike a provenance-blind sourcing quota (which ex-China separation of Chinese ore defeats), this can only be met by genuinely China-free material, so it moves the flow-traced exposure. The US pays an ex-China premium for it (shown in the cost bar)." />
          <Slider label="End-of-life collection rate" value={rec} max={AXES.recMax} onChange={setRec} fmt={(v) => pct(v * 100)}
            desc="Share of end-of-life magnets collected and reprocessed into oxide. Recovered scrap is concentrated Nd/Pr/Dy/Tb with no co-product tax — but recycling plants must be built and paid for." />
          <Slider label="US price floor on China imports" value={pfloor} max={AXES.pfloorMax} onChange={setPfloor} fmt={(v) => pct(v * 100)}
            desc="A US guaranteed price floor (DoD / MP-Materials-style) modeled as a tariff that lifts the price of Chinese oxide, alloy & magnet imports toward the ex-China premium — 0% = off, 50% = half, 100% = the full premium. It makes domestic + allied supply cost-competitive WITHOUT a mandate, so the market reshores on price rather than by rule. Its cost is borne by consumers as a higher import price (no factory needed), shown as 'Price floor' in the cost bar. A distinct instrument from friendshoring (a quantity mandate) — try them separately." />
          <Slider label="Strategic stockpile" value={stockpile} max={STOCKPILE_MAX} onChange={setStockpile} fmt={(v) => `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)} kt`}
            desc="A pre-positioned US inventory of finished magnets (bought on the open market before a shock) drawn down to cover the earliest unmet demand, up to its size. It buys down the shortage at a real acquire + hold cost (~$110/kg) — cheap insurance against a near-term shock, but finite. Only helps where there is unmet demand to cover." />
          {stockpile > 0 && (
            <p style={{ fontSize: 10.5, opacity: 0.55, margin: '-2px 0 6px', lineHeight: 1.4 }}>
              Embodies ≈ <b>{Math.round(stockpile * 0.326)} kt Nd/Pr</b> + <b>{(stockpile * 0.034).toFixed(1)} kt Dy/Tb</b> oxide — the heavy slice is the strategically scarce one.
            </p>
          )}
      </div>
          <ProjectsAside future={futureSel} onToggle={toggleFuture} onSetGroup={setProjectGroup} />

          <button onClick={() => {
              setMake(0); setSource(0); setRec(0); setChina(0.6); setRcost(AXES.rcostMin); setStockpile(0); setPfloor(0); setFutureSel(new Set(DEFAULT_FUTURE));
              setResetFlash(true); window.setTimeout(() => setResetFlash(false), 650);
            }}
            style={{ marginTop: 14, width: '100%', padding: '8px 0', font: '600 12px var(--font-mono)', letterSpacing: '0.05em',
              color: resetFlash ? 'var(--paper)' : 'var(--ink)',
              background: resetFlash ? 'var(--accent)' : 'transparent',
              border: `1px solid ${resetFlash ? 'var(--accent)' : 'var(--rule)'}`,
              borderRadius: 6, cursor: 'pointer', transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease' }}>
            {resetFlash ? '✓ RESET TO BASELINE' : 'RESET TO BASELINE'}
          </button>
    </>
  );

  return (
    <div style={{ position: 'relative', maxWidth: 'var(--content-max)', margin: '0 auto', padding: isMobile ? '20px 16px 92px' : '28px 20px 0', color: 'var(--ink)' }}>
      <BusyOverlay busy={pfloor > 0 && !pfReady} label="Loading price-floor scenarios" />
      <header style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: 8 }}>
          INTERACTIVE MODEL · WORK IN PROGRESS
        </div>
        <h1 style={{ font: '600 30px/1.15 var(--font-serif)', margin: '0 0 10px' }}>
          U.S. rare-earth magnet supply chain explorer
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.55, opacity: 0.8, margin: 0 }}>
          A capacity-expansion model of the NdFeB magnet supply chain
          (mining → separation → alloy → magnet). Set demand and geopolitical scenario to
          identify the least-cost supply chain of US magnets, then evaluate the extent to
          which private actors would actually build the needed capacity, the magnitude of
          residual trade risks, and efficacy of hypothetical technological and policy
          interventions.
        </p>
      </header>

      {/* Demand is an assumption about the world, not a US policy choice, so it
          is one line of chips. The full builder — which this page used to lead
          with — is one click away for anyone who wants sector detail or the
          demand levers. */}
      <div id="demand-builder" style={{ marginBottom: 18 }}>
        <DemandChips scenario={scenario} setScenario={setScenario} lv={lv} setLv={setLv}
          open={demandOpen} setOpen={setDemandOpen} />
        {demandOpen && (
          <div style={{ marginTop: 12 }}>
            <DemandBuilder mode={isMobile ? 'chart' : 'full'} scenario={scenario} setScenario={setScenario} lv={lv} setLv={setLv} />
          </div>
        )}
      </div>

      <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: '0 0 12px' }}>Supply explorer</h2>

      {/* MOBILE keeps the slide-up sheet: a phone has no room for inline control
          bands, and one column already is a reading order. */}
      {isMobile && (
        <aside style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60, height: '52vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: 'var(--paper)', borderRadius: '16px 16px 0 0', borderTop: '2px solid var(--accent)', padding: '0 18px 24px', transform: sheetOpen ? 'translateY(0)' : 'translateY(110%)', transition: 'transform 0.28s ease', boxShadow: '0 -8px 30px rgba(0,0,0,0.22)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 1, background: 'var(--paper)', padding: '12px 0 10px', borderBottom: '1px solid var(--rule)' }}>
            <span style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6 }}>Scenario</span>
            <button onClick={() => setSheetOpen(false)} style={{ font: '600 12px var(--font-mono)', color: 'var(--accent)', background: 'transparent', border: '1px solid var(--rule-strong)', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>Done</button>
          </div>
          <div style={{ font: '600 11px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: '14px 0 8px', borderBottom: '1px solid var(--rule)', paddingBottom: 6 }}>Demand</div>
          <DemandBuilder mode="controls" scenario={scenario} setScenario={setScenario} lv={lv} setLv={setLv} />
          {worldControls}
          {interventionControls}
        </aside>
      )}

      {/* STEP 1 — the world you are assuming, directly above the chain it produces. */}
      {!isMobile && (
        <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: '16px 20px 12px', background: 'var(--paper)', marginBottom: 18 }}>
          {worldControls}
        </section>
      )}

        <main>

          {/* 1 — the whole chain first, so users learn the stages + connections.
              Flows are real-world-anchored (selected projects locked in, China residual). */}
          {snapshotYears.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.06em',
                             textTransform: 'uppercase', opacity: 0.55 }}>Chain in</span>
              {snapshotYears.map((y) => (
                <button key={y} onClick={() => setFlowYear(y)}
                  title={y === '2030' ? 'Mid-build: long-lead capacity has not arrived yet'
                                      : 'End of horizon: the full build-out'}
                  style={{ font: '600 11px var(--font-mono)', padding: '3px 9px', borderRadius: 6,
                           cursor: 'pointer',
                           border: `1px solid ${flowYear === y ? 'var(--accent)' : 'var(--rule-strong)'}`,
                           background: flowYear === y ? 'var(--accent)' : 'transparent',
                           color: flowYear === y ? 'var(--paper)' : 'var(--ink)' }}>{y}</button>
              ))}
            </div>
          )}
          <FlowDiagram flows={rwFlows} active={activeProjects} />

          {/* The four KPIs that summarise the Sankey sit directly under it: this is
              the picture of what happens with NO US intervention. The time-trend
              (PathwayCharts), the light/heavy dumbbells and the cost breakdown all
              moved out of the default view; cost belongs with the interventions in
              part 2, and the other two are detail rather than headline. */}
          {/* 2x2 on desktop: four cards in one row are too narrow to read, and these
              four are the summary of the Sankey directly above them. */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
                        gridAutoRows: '1fr', gap: 12, marginTop: 16 }}>
            <ScoreCardTotal label="US trade-risk index" value={tri.toFixed(2)} valueColor={riskColor(tri)}
              {...(pin ? deltaOf(tri, pin.tri, (v) => v.toFixed(2), true, 0.004) : {})}
              parts={[
                { short: 'heavy', label: `heavy ${triHeavy.toFixed(2)} × ${RE_CLASS_WEIGHT.heavy}`,
                  value: (RE_CLASS_WEIGHT.heavy * triHeavy).toFixed(2) },
                { short: 'light', label: `light ${triLight.toFixed(2)} × ${RE_CLASS_WEIGHT.light}`,
                  value: (RE_CLASS_WEIGHT.light * triLight).toFixed(2) },
              ]}
              sub={pin ? 'vs reference scenario' : undefined} />
            <ScoreCard2 label="Tightest chokepoint" small chip
              a={{ label: `Dy/Tb · stage TRI ${cpHeavy.tri.toFixed(2)}`,
                   value: cpHeavy.label.split(' ')[0], color: riskColor(cpHeavy.tri) }}
              b={{ label: `Nd/Pr · stage TRI ${cpLight.tri.toFixed(2)}`,
                   value: cpLight.label.split(' ')[0], color: riskColor(cpLight.tri) }} />
            {/* Light has no flow-traced twin in the deployed grid yet (the model now
                emits china_exposed_light_pct; it lands at the next regrid), so this
                stays a single figure rather than an invented split. */}
            {lightFeoc == null ? (
              <ScoreCard label="China-exposed demand" value={pct(chinaTouch * 100)} valueColor={riskColor(chinaTouch)} chip
                {...(pin ? deltaOf(chinaTouch * 100, pin.touch * 100, (v) => `${v.toFixed(1)} pp`, true, 0.05) : {})}
                sub={pin ? 'vs reference' : feocIsHeavy ? 'flow-traced · heavy Dy/Tb' : 'flow-traced · any chain stage'} />
            ) : (
              /* Split by class, like the index and the chokepoint. The two move
                 very differently under restriction — heavy decouples, light is
                 largely laundered through third-country magnets — and a single
                 blended figure hides exactly that. */
              /* NOT `small`: this sits beside "US demand met", and two results cards
                 at different type sizes read as a hierarchy that isn't there. */
              <ScoreCard2 label="China-exposed demand" chip
                a={{ label: `Dy/Tb · flow-traced`, value: pct(chinaTouch * 100),
                     color: riskColor(chinaTouch) }}
                b={{ label: `Nd/Pr · flow-traced`, value: pct(lightFeoc),
                     color: riskColor(lightFeoc / 100) }} />
            )}
            <ScoreCard2 label="US demand met"
              a={{ label: pin ? 'imported 2035 · vs reference' : 'imported · 2035',
                   value: pct(sc.kpis.us_import_pct), color: 'var(--ink)',
                   ...(pin ? deltaOf(sc.kpis.us_import_pct ?? 0, pin.imp, (v) => `${v.toFixed(0)} pp`, true, 0.4) : {}) }}
              b={{ label: pin ? 'unmet 26–35 · vs reference' : 'unmet · 2026–35 cum.',
                   value: `${usUnmet.toFixed(0)} kt`, color: usUnmet > 0.05 ? WORSE : 'var(--ink)',
                   ...(pin ? deltaOf(usUnmet, pin.unmet, (v) => `${v.toFixed(1)} kt`, true, 0.05) : {}) }} />
          </div>

          {/* STEP 2 — the levers, bundled. Five separately-headed chunks with
              their own sub-titles read as five topics rather than one choice set.
              Now one band, sliders in a grid, each explanation behind its own ⓘ.
              Placed here because this is where the reading order needs them: the
              chain above is what happens without you, everything below is what
              changes if you act. */}
          {!isMobile && (
            <section style={{ border: '1px solid var(--rule)', borderRadius: 10,
                              padding: '16px 20px 12px', background: 'var(--paper)', marginTop: 22 }}>
              {interventionControls}
            </section>
          )}

          {/* 3 — the ACTOR view. Sits directly under the planner's chain and KPIs
              because the page reads planner -> actor -> interventions: what the
              least-cost plan calls for, then whether anyone would fund it, and
              only then what closing the difference costs. Putting cost and TRI
              in between made the screen look like a footnote to the price tag
              rather than the question the price tag is answering.

              `incumbent` is US operating capacity from the project list — already
              built, and therefore never screened. */}
          <CapacityPanel
            buildout={(sc as any).buildout}
            incumbent={PROJECTS.filter((pj) => pj.bloc === 'us' && pj.status === 'operating')
              .reduce((acc, pj) => {
                (acc[pj.stage] ??= []).push({ stage: pj.stage, name: pj.name,
                                              kt: pj.capacityKt, note: pj.note });
                return acc;
              }, {} as Record<string, { stage: string; name: string; kt: number; note?: string }[]>)}
            priceWorld={priceWorld} onPriceWorld={setPriceWorld}
            rate={hurdle} onRate={setHurdle}
            instruments={instruments} onInstruments={setInstruments}
            sc={scR} alliedHHI={alliedHHIMap}
            reClass={reClass} onReClass={setReClass}
            costMult={costMult} onCostMult={setCostMult}
            foakMult={foakMult} onFoakMult={setFoakMult}
            provenancePremium={provenancePremium} onProvenancePremium={setProvenancePremium} />

          {/* 4 — what the interventions bought. Sits between the actor verdict and
              the price tag: the levers are pulled in the sidebar, their effect on
              build-out is the panel above, and their effect on demand is here. */}
          <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: '30px 0 4px' }}>
            What interventions buy
          </h2>
          <p style={{ fontSize: 11.5, opacity: 0.65, margin: '0 0 12px', maxWidth: 620, lineHeight: 1.45 }}>
            Cost of the security choices made above, and the cheapest remaining move.
          </p>
          <AbatementReadout china={china} unlock={abunlock} />

          {HAS_ABATEMENT_CEILING && (
            <RdValuePanel base={rdPair.base} unlocked={rdPair.unlocked}
              unlock={abunlock}
              onUnlock={(u) => { setAbunlock(u); if (u > 0) void loadCeiling(); }}
              costPerKg={rdCostPerKg} onCostPerKg={setRdCostPerKg}
              realCost={realCost} loading={abunlock > 0 && !ceilingReady} />
          )}

          {/* 4 — combined "Cost and security" section: cost bar (real NPV) + the
              trade-risk index + cost-of-security ROI, in one block; notes behind ⓘ. */}
          <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20, background: 'var(--paper)', marginTop: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: 0, display: 'flex', alignItems: 'center' }}>
                Cost of US magnet supply
                <button onClick={() => setInfoCost((o) => !o)} aria-label="Details" title="Details"
                  style={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--rule-strong)', background: infoCost ? 'var(--accent)' : 'transparent', color: infoCost ? 'var(--paper)' : 'var(--ink-3)', font: '600 9px var(--font-mono)', lineHeight: 1, cursor: 'pointer', padding: 0, marginLeft: 6 }}>i</button>
              </h2>
              <span style={{ font: '600 14px var(--font-mono)' }}>
                {musd(usCostReal)} <span style={{ opacity: 0.5, fontWeight: 400 }}>real NPV</span>
                {usUnmet > 0.05 && <span style={{ color: WORSE, fontWeight: 600 }}> · +{usUnmet.toFixed(1)} kt unmet</span>}
              </span>
            </div>
            {infoCost && (
              <p style={{ fontSize: 11.5, opacity: 0.5, margin: '0 0 12px', lineHeight: 1.45 }}>
                Absolute build + operating cost of US-located capacity by stage, plus the heavy-REE price
                premium and any stockpile (2026–35 NPV); the bar grows as you force more security and
                shrinks as imports do the work. The <span style={{
                  padding: '0 4px', borderRadius: 2, color: '#fff', backgroundColor: '#762A83', ...STIPPLE,
                }}>stippled</span> segment is the heavy-REE (Dy/Tb) cost. When the chain can’t deliver, that
                surfaces as <span style={{ color: WORSE }}> unmet demand</span>, not a dollar cost.
              </p>
            )}
            <div style={{ height: 30, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--rule)', background: 'var(--paper-2)' }}>
              <div style={{ display: 'flex', height: '100%', width: `${Math.min(100, (usCostReal / COST_AXIS_MAX) * 100)}%`, transition: 'width 0.15s' }}>
                {REAL_COST_KEYS.map(([k, lbl, color]) => {
                  const v = Math.max(0, scR.us_cost[k] ?? 0);
                  if (v <= 0) return null;
                  const heavy = k === 'dytb_premium';   // stipple the cleanly-heavy (Dy/Tb) cost
                  return <div key={k} title={`${lbl}: ${musd(v)}${heavy ? ' · heavy-REE (Dy/Tb)' : ''}`}
                    style={{ width: `${(v / usCostReal) * 100}%`, background: color, ...(heavy ? STIPPLE : {}) }} />;
                })}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink)', opacity: 0.45, marginTop: 2 }}>
              <span>$0B</span><span>{musd(COST_AXIS_MAX / 2)}</span><span>{musd(COST_AXIS_MAX)}+</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 10 }}>
              {REAL_COST_KEYS.map(([k, lbl, color]) => {
                const v = scR.us_cost[k] ?? 0;
                if (v <= 0 && (BASE.us_cost[k] ?? 0) <= 0) return null;   // hide irrelevant components
                const dv = v - (BASE.us_cost[k] ?? 0);
                const showDelta = Math.abs(dv) >= 100;
                return (
                  // compact one-line legend item to squeeze vertical space
                  <span key={k} title={COST_DESC[k]} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'help' }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: color, flexShrink: 0, ...(k === 'dytb_premium' ? STIPPLE : {}) }} />
                    <span style={{ opacity: 0.7 }}>{lbl}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{musd(v)}</span>
                    {showDelta && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: dv > 0 ? WORSE : 'var(--brand-green)' }}>{dv > 0 ? '+' : ''}{musd(dv)}</span>}
                  </span>
                );
              })}
            </div>
            {/* trade-risk index + cost-of-security, folded into the same section */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--rule)' }}>
              <TradeRiskPanel sc={scR} levers={securityLevers} alliedHHI={alliedHHIMap} />
            </div>
          {/* The two closing headline numbers, folded into the cost block rather
              than standing as their own section: what it cost, and what to pull
              next. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gridAutoRows: '1fr', gap: 12, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--rule)' }}>
            <ScoreCard label="US cost of supply" value={musd(usCostReal)} valueColor="var(--ink)"
              {...(pin
                ? deltaOf(usCostReal, pin.cost, (v) => musd(v), true, 50)
                : { delta: `${npvDelta >= 0 ? '+' : '−'}${musd(Math.abs(npvDelta))}`,
                    deltaColor: npvDelta > 50 ? WORSE : npvDelta < -50 ? 'var(--brand-green)' : 'var(--ink-3)' })}
              sub={pin ? '2026–35 NPV · vs reference' : '2026–35 NPV · Δ vs do-nothing'} />
            <ScoreCard label="Most cost-effective lever" value={bestLever ? bestLever.name : leversExhausted ? 'all spent' : 'none yet'} valueColor="var(--ink)" small
              sub={bestLever ? `${musd(bestLever.perTRI)} / 0.1 TRI` : leversExhausted ? 'at the security floor — only demand-side moves left' : 'raise the China restriction'} />
            </div>
          </section>
        </main>

      {/* Mobile: a live result chip + a button that opens the scenario controls as a
          slide-up sheet (so the controls never overlay the plots). */}
      {isMobile && (
        <>
          {/* No dark backdrop: the half-height sheet leaves the upper screen showing a
              live chart that reacts as you drag, which is the point on mobile. */}
          {!sheetOpen && (
            <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 16px', background: 'var(--paper)', borderTop: '1px solid var(--rule-strong)', boxShadow: '0 -4px 16px rgba(0,0,0,0.12)' }}>
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
                <span style={{ fontSize: 12.5 }}><b style={{ ...riskChip(riskColor(tri)), fontFamily: 'var(--font-mono)' }}>TRI {tri.toFixed(2)}</b> <span style={{ opacity: 0.5 }}>trade-risk</span></span>
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
          <img className="steer-light-bg" src="/logos/steer/STEER-forweb-light.png" alt="STEER — Stanford" height={18} />
          <img className="steer-dark-bg" src="/logos/steer/STEER-forweb-dark.png" alt="STEER — Stanford" height={18} />
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
