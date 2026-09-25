import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AXES, AXIS_DOMAIN, BASE, interpScenario, applyStockpile, STOCKPILE_COST_DEFAULT, applyRoundTop, reshoreSupply, ROUND_TOP_COST, ROUND_TOP_MINING_DI, STOCKPILE_MAX, YEARS, ensurePriceFloorSlices, priceFloorReady, ensureAbatementCeilingSlices,
         abatementCeilingReady, HAS_ABATEMENT_CEILING, ABATEMENT_CEILINGS, type Scenario } from './interp';
import { integratedTRI, integratedRE, classTRI, stageBreakdownClass, RE_CLASS_WEIGHT, riskColor, riskChip } from './tri';
import { axisDiff, AXIS_LABEL, AXIS_FMT, type AxisKey } from './ScenarioBar';
import DemandChips from './DemandChips';
import CapacityPanel, { type ReClass } from './CapacityPanel';
import InterventionLedger from './InterventionLedger';
import { actorGap, actorRow, type PlannerRow, type ScreenOpts } from './ledger';
import { chooseCollection, chooseStockpile, chooseRd, collectedKtNPV, UNMET_VALUE_ANCHORS, UNMET_VALUE_DEFAULT } from './deploy';
import { hurdleRate, RELIEF_DEFAULTS, MAGNET_CONVERSION_DEFAULT, PLANNER_RATE, priceAtSpread, EXCHINA_SPREAD_PER_MAGNET_KG, type Buildout } from './projectFinance';
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
import { allScenario, demandSummary, DEFAULT_LEVERS, SCENARIO_LABEL, type PerSectorScenario, type Levers } from './demand';
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
/** Same, but a bill under a billion reads in $M rather than as $0.0B. */
const musdS = (x: number) => Math.abs(x) >= 1000 ? musd(x) : `$${x.toFixed(0)}M`;
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
  { k: 'us_import_pct', label: 'Share of US magnets imported', sub: 'snapshot year', fmt: pct, lowerBetter: true, help: 'Share of US magnet demand met by imports rather than made in the US, in the snapshot year selected above the Sankey. Read off the same project-reconciled flows the diagram draws.' },
  { k: 'npv_musd', label: 'Total system cost', sub: '2026–35 NPV', fmt: musd, lowerBetter: true, help: 'Total 2026–2035 system cost: discounted (NPV) build-out + operating cost, summed across all regions.' },
  { k: 'us_unmet_kt', label: 'US unmet demand', sub: '2026–35 cumulative', fmt: (x) => `${x.toFixed(0)} kt`, lowerBetter: true, help: 'Cumulative 2026–2035 US magnet shortfall (kt of finished magnet) the chain cannot deliver in time — e.g. under a China export ban.' },
  { k: 'primary_dytb_kt', label: 'Primary Dy/Tb mined', sub: '2035 annual', fmt: (x) => `${x.toFixed(1)} kt`, lowerBetter: true, help: 'Final-year (2035) Dy+Tb oxide mined from ore that year (kt) — a few kt; the scarce chokepoint element, not comparable to total magnet tonnage.' },
  { k: 'hhi_separation', label: 'Separation concentration', sub: '2035', fmt: (x) => x.toFixed(2), lowerBetter: true, help: 'Herfindahl index of separation supply by region (1.0 = single region), final year (2035).' },
  { k: 'recycled_pct', label: 'Recycled supply', sub: '2035', fmt: pct, lowerBetter: false, help: 'Final-year (2035) share of oxide supplied by recycling.' },
];

/** `ticks` replaces the min/mid/max strip with NAMED anchors at real values —
 *  "China parity", "today's ex-China spread", "2x that". A reader sliding a bare
 *  0-1 axis is guessing what they are postulating; a labelled anchor tells them,
 *  and tells them how far from it they have moved. */
/** Height of the site's sticky nav (components/Nav.astro), which anything
 *  else sticky must clear or it pins out of sight beneath it. */
const NAV_HEIGHT = 56;

function Slider({ label, value, max, min = 0, onChange, fmt, desc, ticks, step = 0.01 }: {
  label: string; value: number; max: number; min?: number; step?: number;
  onChange: (v: number) => void; fmt: (v: number) => string; desc?: string;
  ticks?: { at: number; label: string }[];
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
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)' }} />
      {ticks?.length ? (
        <div style={{ position: 'relative', height: 20, marginTop: -2 }}>
          {ticks.map((t) => {
            const pctPos = ((t.at - min) / (max - min)) * 100;
            return (
              <span key={t.label} title={`${t.label} — ${fmt(t.at)}`}
                style={{ position: 'absolute', left: `${Math.max(0, Math.min(100, pctPos))}%`,
                         transform: pctPos < 12 ? 'none' : pctPos > 88 ? 'translateX(-100%)' : 'translateX(-50%)',
                         textAlign: 'center', lineHeight: 1.1 }}>
                <span style={{ display: 'block', width: 1, height: 3, background: 'var(--ink)',
                               opacity: 0.35, margin: pctPos < 12 ? '0' : pctPos > 88 ? '0 0 0 auto' : '0 auto' }} />
                <span style={{ font: '400 8.5px var(--font-mono)', opacity: 0.45, whiteSpace: 'nowrap' }}>
                  {t.label}
                </span>
              </span>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink)', opacity: 0.45, marginTop: -1 }}>
          <span>{fmt(min)}</span><span>{fmt((min + max) / 2)}</span><span>{fmt(max)}</span>
        </div>
      )}
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
  // INTERVENTION COSTS. Collection, stockpiling and thrifting research are not
  // set by the reader; the reader states what each costs and the planner deploys
  // each to the degree it pays (deploy.ts). The deployed rate, size and unlock
  // are derived below, not state.
  const [collectCost, setCollectCost] = useState(25);                   // $/kg of magnet collected
  const [stockCost, setStockCost] = useState(STOCKPILE_COST_DEFAULT);   // $/kg acquire + hold
  // Value of a kg of unmet magnet demand, held as log10 so the slider spans the
  // three orders of magnitude between the revealed 2025 premium and a
  // value-of-lost-load figure without the low end collapsing into one pixel.
  const [unmetValueLog, setUnmetValueLog] = useState(Math.log10(UNMET_VALUE_DEFAULT));
  const unmetValue = 10 ** unmetValueLog;
  const [pfloor, setPfloor] = useState(0);           // US price floor on China imports (0 / .5 / 1)
  // The floor=0 grid is eager; the half/full slices load on first use of the slider.
  const [pfReady, setPfReady] = useState(priceFloorReady());
  useEffect(() => {
    if (pfloor > 0 && !pfReady) ensurePriceFloorSlices().then(() => setPfReady(true));
  }, [pfloor, pfReady]);
  // The ledger rates the price floor as a next move even while it is off, so its
  // slices load in idle time after first paint rather than on first drag.
  useEffect(() => {
    if (pfReady) return;
    const go = () => { void ensurePriceFloorSlices().then(() => setPfReady(true)); };
    const w = window as any;
    const id = typeof w.requestIdleCallback === 'function'
      ? w.requestIdleCallback(go, { timeout: 6000 }) : window.setTimeout(go, 2500);
    return () => { if (typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(id); else window.clearTimeout(id); };
  }, [pfReady]);
  // Abatement ceiling: 0 = today's sectoral availability, 1 = the barrier broken.
  // Whether it is broken is the planner's call, made below against this R&D cost.
  // Its three slices (one per price-floor level) load in idle time after first
  // paint, because the decision needs both ceilings; until they arrive the
  // research counts as not yet evaluated, and interpScenario answers at the
  // baseline ceiling.
  const [rdCostPerKg, setRdCostPerKg] = useState(50);   // $ per kg of capability unlocked
  // The actor-side calibration. Exposed rather than fixed because these are the
  // numbers the US conclusion turns on and the ones we are least sure of.
  const [costMult, setCostMult] = useState(1);            // x the US cost disadvantage
  const [foakMult, setFoakMult] = useState(1);            // x the FOAK premium above one
  const [provenancePremium, setProvenancePremium] = useState(0);   // $/kg for non-China supply
  const [ceilingReady, setCeilingReady] = useState(abatementCeilingReady());
  useEffect(() => {
    if (ceilingReady || !HAS_ABATEMENT_CEILING) return;
    const go = () => { void ensureAbatementCeilingSlices().then(() => setCeilingReady(true)); };
    const w = window as any;
    const id = typeof w.requestIdleCallback === 'function'
      ? w.requestIdleCallback(go, { timeout: 4000 }) : window.setTimeout(go, 1500);
    return () => { if (typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(id); else window.clearTimeout(id); };
  }, [ceilingReady]);
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
  const [scenario, setScenarioRaw] = useState<PerSectorScenario>(() => allScenario('STEPS'));
  const [lv, setLvRaw] = useState<Levers>(DEFAULT_LEVERS);
  const demand = useMemo(() => demandSummary(scenario, lv), [scenario, lv]);
  // Total demand is ALSO a continuous slider. The three IEA scenarios sit inside
  // the grid's solved demand_scale axis (0.6-1.4x APS), so any level between or
  // beyond them is an interpolation over solved cells, not a new solve. The
  // sector composition (and with it the Dy/Tb intensity) still comes from the
  // chips/builder; the slider scales the total. A hand-set scale is an override
  // that any composition change clears, so the two cannot silently disagree.
  const [dscaleOverride, setDscaleOverride] = useState<number | null>(null);
  const dscale = dscaleOverride ?? demand.demand_scale;
  const setScenario = useCallback((s: PerSectorScenario) => { setScenarioRaw(s); setDscaleOverride(null); }, []);
  const setLv = useCallback((l: Levers) => { setLvRaw(l); setDscaleOverride(null); }, []);
  // Slider anchors: where each IEA scenario lands on the axis, so a reader dragging
  // between them knows what they are postulating.
  const demandTicks = useMemo(() => (['STEPS', 'APS', 'NZE'] as const).map((k) =>
    ({ at: demandSummary(allScenario(k), DEFAULT_LEVERS).demand_scale, label: SCENARIO_LABEL[k] ?? k })), []);

  // The cost breakdown is US-specific (the cost the US bears to supply itself) —
  // this analysis is about US supply security. Global trade/co-product don't apply.
  const US_COST_KEYS = COST_KEYS.filter(([k]) => k !== 'trade' && k !== 'coproduct');
  // The bar shows REAL economic cost: the unmet-demand penalty is excluded (it's a
  // solver flag at $10k/kg, not money) and surfaced physically as unmet demand (kt).
  const REAL_COST_KEYS = US_COST_KEYS.filter(([k]) => k !== 'shortage');
  const realCost = (s: Scenario) => REAL_COST_KEYS.reduce((a, [k]) => a + Math.max(0, s.us_cost[k] ?? 0), 0);

  // ── THE PLANNER'S DEPLOYMENTS ────────────────────────────────────────────
  // Three decisions, in the order they depend on each other. Collection is a
  // world parameter, chosen on the world objective at the baseline ceiling; the
  // research decision is then made at that collection rate; the stockpile last,
  // against whatever shortfall is left. Every step is a grid read.
  const cellAt = useCallback((o: Record<string, number>) => interpScenario({
    make, source, rec: 0, china, rcost, dytb: demand.dytb_intensity, dscale, pfloor, abunlock: 0, ...o,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [make, source, china, rcost, demand, dscale, pfloor, pfReady, ceilingReady]);
  const collection = useMemo(
    () => chooseCollection(AXIS_DOMAIN.rec, (r) => cellAt({ rec: r }), collectCost),
    [cellAt, collectCost]);
  const rec = collection.rate;
  // The SAME world at both ceilings, so the research can be valued by
  // differencing them. Both are grid reads, not solves.
  const rdPair = useMemo(
    () => ({ base: cellAt({ rec }), unlocked: cellAt({ rec, abunlock: 1 }) }),
    [cellAt, rec]);
  const rdChoice = useMemo(() => chooseRd(rdPair.base, rdPair.unlocked, {
    costPerKg: rdCostPerKg, ceilingFrom: ABATEMENT_CEILINGS.baseline,
    ceilingTo: ABATEMENT_CEILINGS.aspirational, realCost,
    evaluated: ceilingReady && HAS_ABATEMENT_CEILING,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rdPair, rdCostPerKg, ceilingReady]);
  const abunlock = rdChoice.unlock;
  const scBase = abunlock ? rdPair.unlocked : rdPair.base;
  const stockChoice = useMemo(
    () => chooseStockpile(scBase, stockCost, unmetValue, STOCKPILE_MAX),
    [scBase, stockCost, unmetValue]);
  const stockpile = stockChoice.kt;
  const sc = useMemo(() => applyStockpile(scBase, stockpile, stockCost), [scBase, stockpile, stockCost]);
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
  // Oxide prices as a multiple of TODAY'S ex-China spread: 1 = the market as it
  // actually is, which is the right default for a study about hedging that market.
  const [priceSpread, setPriceSpread] = useState(1);
  const [conversion, setConversion] = useState(MAGNET_CONVERSION_DEFAULT);
  // Actor-mode controls. The hurdle rate IS the actor/planner distinction — there
  // is no separate mode switch — so it defaults to the US firm rate and can be
  // dragged down to the planner's, which reproduces planner mode exactly.
  const [hurdle, setHurdle] = useState<number>(hurdleRate('USA'));
  // Seeded from RELIEF_DEFAULTS but OFF, so nothing is applied until asked for.
  // The defaults become the value a slider snaps to when you turn it on.
  const [instruments, setInstruments] = useState<Record<string, number>>(
    { offtake: 0, floor: RELIEF_DEFAULTS.floor, guarantee: 0 });
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
  const [infoCost, setInfoCost] = useState(false);
  const [showCostBar, setShowCostBar] = useState(false);   // ⓘ toggle for the cost-bar method note
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
  // Imported share read off the SAME object the Sankey draws, not off the raw grid
  // KPI. They disagreed — 70% on the diagram against 88% on the chip — because the
  // Sankey floors each stage with real project capacity and the KPI does not, so a
  // reader comparing the two was comparing a reconciled number with an
  // unreconciled one. Deriving it from rwFlows makes the chip and the picture the
  // same measurement by construction, and follows the Sankey's YEAR selector too.
  const usImportPct = useMemo(() => {
    const mag = (rwFlows.total.magnet ?? []).filter((f) => f.to === 'USA');
    const tot = mag.reduce((a, f) => a + f.value, 0);
    if (tot <= 1e-9) return sc.kpis.us_import_pct ?? 0;
    const home = mag.find((f) => f.from === 'USA')?.value ?? 0;
    return 100 * (1 - home / tot);
  }, [rwFlows, sc]);

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
  const baseNPV = realCost(interpScenario({ make: 0, source: 0, rec: 0, china, rcost, dytb: demand.dytb_intensity, dscale, abunlock }));
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
    dytb: demand.dytb_intensity, dscale,
  };
  const changed = pin ? axisDiff(coords, pin.coords) : [];
  const doPin = () => setPin({
    coords, tri, cost: usCostReal, imp: usImportPct,
    touch: chinaTouch, unmet: usUnmet,
  });
  const restorePin = () => {
    if (!pin) return;
    const c = pin.coords;
    setMake(c.make); setSource(c.source);
    setChina(c.china); setRcost(c.rcost); setPfloor(c.pfloor);
    setDscaleOverride(c.dscale);
    // dytb is derived from the sector composition; it follows once the demand
    // controls are reset, which the user does in the builder. Flag it rather
    // than silently diverge.
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

  // ── THE PLANNER LEDGER ──────────────────────────────────────────────────
  // Every lever valued from the CURRENT settings: what a deployed lever bought
  // (this state against the same state with it off) and what an undeployed one
  // would buy next (its next step against this state). One evaluator, so every
  // row is the same measurement: the reconciled, heavy-weighted index the panel
  // shows, and the real US bill including the priced interventions.
  const finishScn = useCallback((scn: Scenario, projects: Set<string>) => {
    const heavyMine = PROJECTS.some((p) => projects.has(p.id) && p.bloc === 'us' && p.stage === 'mining' && p.heavy);
    const rpath = { ...scn.path, us_mix: reconcileUsMix(scn, projects), us_mix_re: reconcileUsMixRe(scn, projects) ?? scn.path.us_mix_re };
    return {
      ...scn,
      us_supply: reconcileUsSupply(scn, projects),
      us_supply_re: reconcileUsSupplyRe(scn, projects),
      us_cost: { ...scn.us_cost, consumer_premium: consumerPremium(rpath), us_projects: usProjectsBuildCost(projects) },
      path: rpath,
      _di: heavyMine ? { ...scn._di, mining: ROUND_TOP_MINING_DI } : scn._di,
    } as Scenario;
  }, []);
  const evalAt = useCallback((o: Record<string, number>, opt: {
    projects?: Set<string>; stockpileKt?: number; roundTop?: boolean; reshore?: string[];
  } = {}) => {
    const abu = o.abunlock ?? abunlock;
    let scn = interpScenario({ make, source, rec, china, rcost, dytb: demand.dytb_intensity, dscale, pfloor, abunlock: abu, ...o });
    if (opt.reshore) scn = reshoreSupply(scn, opt.reshore, 0.9);
    if (opt.roundTop) scn = applyRoundTop(scn, true);
    const kt = opt.stockpileKt ?? chooseStockpile(scn, stockCost, unmetValue, STOCKPILE_MAX).kt;
    scn = applyStockpile(scn, kt, stockCost);
    const fin = finishScn(scn, opt.projects ?? activeProjects);
    const bill = realCost(fin)
      + collectCost * collectedKtNPV(scn, 'USA')
      + (abu > 0 ? rdChoice.rd.rdCost : 0);
    return { tri: integratedRE(fin, alliedHHIMap), bill, unmet: (scn.path.us_mix.unmet ?? []).reduce((a, u) => a + u, 0) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [make, source, rec, china, rcost, demand, dscale, pfloor, abunlock, stockCost, unmetValue, collectCost, rdChoice, activeProjects, alliedHHIMap, finishScn, pfReady, ceilingReady]);

  const plannerLedger = useMemo<PlannerRow[]>(() => {
    const cur = evalAt({});
    const bought = (off: ReturnType<typeof evalAt>) => ({ dTRI: off.tri - cur.tri, cost: cur.bill - off.bill });
    const next = (on: ReturnType<typeof evalAt>, extraCost = 0) => ({ dTRI: cur.tri - on.tri, cost: on.bill - cur.bill + extraCost });
    const stepUp = (dom: number[], v: number) => dom.find((x) => x > v + 1e-9);
    const rows: PlannerRow[] = [];

    rows.push({ name: 'US-make mandate', deployed: make > 0, level: make > 0 ? pct(make * 100) : undefined,
      bought: make > 0 ? bought(evalAt({ make: 0 })) : undefined,
      next: make < AXES.makeMax ? next(evalAt({ make: AXES.makeMax })) : undefined });
    rows.push({ name: 'Friendshore sourcing', deployed: source > 0, level: source > 0 ? pct(source * 100) : undefined,
      bought: source > 0 ? bought(evalAt({ source: 0 })) : undefined,
      next: source < AXES.sourceMax ? next(evalAt({ source: AXES.sourceMax })) : undefined,
      note: 'consumer premium' });
    rows.push({ name: 'Price floor on China imports', deployed: pfloor > 0, level: pfloor > 0 ? pct(pfloor * 100) : undefined,
      bought: pfloor > 0 ? bought(evalAt({ pfloor: 0 })) : undefined,
      next: pfloor < AXES.pfloorMax ? next(evalAt({ pfloor: AXES.pfloorMax })) : undefined,
      note: 'tariff, paid by buyers' });
    const recUp = stepUp(AXIS_DOMAIN.rec, rec);
    rows.push({ name: 'Recycling collection', deployed: rec > 0, level: rec > 0 ? `${pct(rec * 100)} of retirements` : undefined,
      bought: rec > 0 ? bought(evalAt({ rec: 0 })) : undefined,
      next: recUp != null ? next(evalAt({ rec: recUp })) : undefined,
      note: `at $${collectCost}/kg collected` });
    rows.push({ name: 'Strategic stockpile', deployed: stockpile > 0, level: stockpile > 0 ? `${stockpile.toFixed(0)} kt` : undefined,
      bought: stockpile > 0 ? bought(evalAt({}, { stockpileKt: 0 })) : undefined,
      next: stockpile <= 0 && cur.unmet > 1e-6 ? next(evalAt({}, { stockpileKt: Math.min(cur.unmet, STOCKPILE_MAX) })) : undefined,
      note: `at $${stockCost}/kg` });
    if (HAS_ABATEMENT_CEILING) rows.push({ name: 'Thrifting R&D', deployed: abunlock > 0,
      level: abunlock > 0 ? 'barrier broken' : undefined,
      bought: abunlock > 0 ? bought(evalAt({ abunlock: 0 })) : undefined,
      next: abunlock <= 0 && rdChoice.evaluated ? next(evalAt({ abunlock: 1 })) : undefined,
      note: rdChoice.evaluated ? `at $${rdCostPerKg}/kg unlocked` : 'evaluating' });
    const rt = activeProjects.has('round_top');
    rows.push({ name: 'Develop Round Top', deployed: rt,
      bought: rt ? bought(evalAt({}, { projects: new Set([...activeProjects].filter((id) => id !== 'round_top')) })) : undefined,
      next: rt ? undefined : next(evalAt({}, { roundTop: true })),
      note: 'US heavy mine, project cost' });
    rows.push({ name: 'Build US separation', deployed: false, overlay: true, next: next(evalAt({}, { reshore: ['separation'] }), US_SEP_RESHORE_COST) });
    rows.push({ name: 'Build US alloy', deployed: false, overlay: true, next: next(evalAt({}, { reshore: ['alloy'] }), US_ALLOY_RESHORE_COST) });
    rows.push({ name: 'Build US magnet', deployed: false, overlay: true, next: next(evalAt({}, { reshore: ['magnet'] }), US_MAGNET_RESHORE_COST) });
    return rows;
  }, [evalAt, make, source, pfloor, rec, stockpile, abunlock, rdChoice, activeProjects, collectCost, stockCost, rdCostPerKg]);

  // ── THE ACTOR LEDGER ────────────────────────────────────────────────────
  // The same screen the capacity panel runs, once at the current instruments
  // and once per instrument applied in full, so each row says what it closes
  // of the gap the panel shows. Costs only where one is defined: a provenance
  // premium is paid by buyers every year; an offtake or guarantee is a
  // contingent liability the model does not price.
  const actorLedger = useMemo(() => {
    const us: Buildout[] = (((sc as any).buildout ?? []) as Buildout[]).filter((b) => b.r === 'USA');
    const prices = priceAtSpread(priceSpread, conversion);
    const base: ScreenOpts = {
      rate: hurdle, offtake: instruments.offtake, floorInterface: 'magnet',
      floorRelief: instruments.floor, floorLevel: pfloor, creditSupport: instruments.guarantee,
      costMult, foakMult, provenancePremium,
    };
    const now = actorGap(us, prices, base);
    const ktYr = us.reduce((a, b) => a + b.kt * b.u, 0);   // output the premium would be paid on
    const rows = now.total === 0 ? [] : [
      actorRow('Offtake agreement', us, prices, now, base, (o) => ({ ...o, offtake: 1 }),
        instruments.offtake > 0, null, 'removes most revenue risk'),
      actorRow('Loan guarantee', us, prices, now, base, (o) => ({ ...o, creditSupport: 1 }),
        instruments.guarantee > 0, null, 'removes the financing wedge'),
      actorRow('Price floor, as de-risking', us, prices, now, base, (o) => ({ ...o, floorLevel: 1, floorRelief: RELIEF_DEFAULTS.floor }),
        pfloor > 0, null, 'covered stages only'),
      actorRow('Provenance premium at today\'s spread', us, prices, now, base, (o) => ({ ...o, provenancePremium: EXCHINA_SPREAD_PER_MAGNET_KG }),
        provenancePremium > 0, EXCHINA_SPREAD_PER_MAGNET_KG * ktYr, `$${EXCHINA_SPREAD_PER_MAGNET_KG.toFixed(0)}/kg, paid by buyers`),
      actorRow('Public finance at the planner\'s rate', us, prices, now, base, (o) => ({ ...o, rate: PLANNER_RATE }),
        hurdle <= PLANNER_RATE + 1e-9, null, `${(PLANNER_RATE * 100).toFixed(0)}% instead of ${(hurdle * 100).toFixed(1)}%`),
    ];
    return { now, rows, hurdlePct: hurdle * 100 };
  }, [sc, priceSpread, conversion, hurdle, instruments, pfloor, costMult, foakMult, provenancePremium]);

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

  // Controls live INLINE in reading order, not in a left rail: set the world,
  // see what the planner does with it, then set interventions and see how actors
  // respond. A sticky sidebar put every knob permanently beside every result,
  // which is the opposite of a sequence. On mobile they stay in the slide-up
  // sheet, where a single column already IS the reading order.
  // PLANNER controls: every one of these is a grid axis, so every one re-solves
  // the least-cost chain and moves the Sankey. That — not who controls them — is
  // the division that matters to a reader, so they sit together in one box above
  // the diagram they determine. Whether a lever is a US choice or a fact about
  // the world is a second-order annotation, carried by the sub-heading.
  //
  // The ACTOR controls (hurdle rate, US cost, FOAK, provenance premium, the
  // instrument reliefs) live in the capacity panel instead. They are closed-form
  // arithmetic over a solved cell and cannot move a ribbon.
  // Grouped by the DECISION each pair represents, not by instrument type: a
  // stockpile size means nothing without its price, and a collection rate means
  // nothing without what recycling costs. Headings carry the cardinal accent, so
  // "geopolitical context" and "US policy levers" read as peers.
  const GROUP = { font: '600 10px var(--font-mono)', letterSpacing: '0.08em',
                  textTransform: 'uppercase' as const, color: 'var(--cardinal)',
                  opacity: 0.85, margin: '0 0 6px' };
  const ROW = { display: 'grid', gap: '2px 20px',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)' } as const;
  const RULE = { borderTop: '1px solid var(--rule)', margin: '10px 0 8px' };
  const plannerControls = (
    <>
      <div style={GROUP}>US demand</div>
      <div id="demand-builder">
        <DemandChips scenario={scenario} setScenario={setScenario} lv={lv} setLv={setLv}
          open={demandOpen} setOpen={setDemandOpen} custom={dscaleOverride !== null} />
        {demandOpen && (
          <div style={{ marginTop: 10 }}>
            <DemandBuilder mode="full" scenario={scenario} setScenario={setScenario} lv={lv} setLv={setLv} />
          </div>
        )}
        <div style={{ ...ROW, marginTop: 8 }}>
          <Slider label="Total magnet demand" value={dscale} min={AXES.dscaleMin} max={AXES.dscaleMax}
            onChange={setDscaleOverride} fmt={(v) => `${v.toFixed(2)}× APS`} ticks={demandTicks}
            desc="US magnet demand as a multiple of the IEA Announced Pledges (APS) trajectory, 2026–35. The three IEA scenarios are anchors on this axis, not the only options: the grid is solved at 0.6, 1.0 and 1.4× and every level between is interpolated over solved cells. Dragging scales the total; the sector mix (and so the Dy/Tb intensity) stays as set by the chips above, and choosing a chip snaps this back to that scenario's level." />
        </div>
      </div>

      <div style={RULE} />
      <div style={GROUP}>Geopolitical context</div>
      <div style={ROW}>
        <Slider label="China export restriction" value={china} max={AXES.chinaMax} onChange={setChina} fmt={(v) => pct(v * 100)}
          ticks={[{ at: 0, label: 'open' }, { at: 0.6, label: 'reference' }, { at: 1, label: 'full ban' }]}
          desc="Severity of Chinese export controls on oxide, alloy & magnets: 0% = open market, 100% = full ban. In between, China may still export to a shrinking share of the rest of the world's demand — allies absorb a partial cut, a full ban forces shortage or reshoring. Tightening also inflates the heavy-REE (Dy/Tb) benchmarks the US is a price-taker to, so the Dy/Tb it imports carries a rising price premium. The 60% reference is a MODELLING CHOICE, not a calibrated value: it is the cell the written results describe. China's 2025 licensing regime on seven medium/heavy REEs is the closest real analogue, and mapping it to a single severity number is a judgement." />
      </div>

      <div style={RULE} />
      <div style={GROUP}>US policy levers</div>
      <div style={ROW}>
        <Slider label="US-made magnets (reshore)" value={make} max={AXES.makeMax} onChange={setMake} fmt={(v) => pct(v * 100)}
          ticks={[{ at: 0, label: 'none' }, { at: 0.5, label: 'half' }, { at: AXES.makeMax, label: 'all US-made' }]}
          desc="Component prong, like the IRA EV credit: the share of US magnets that must be manufactured in the US — reshoring the final step. On its own it can still be met with imported (incl. Chinese) alloy or oxide; pair it with non-China sourcing to close that loophole." />
        <Slider label="Clean heavy sourcing (friendshore)" value={source} max={AXES.sourceMax} onChange={setSource} fmt={(v) => pct(v * 100)}
          ticks={[{ at: 0, label: 'none' }, { at: 0.5, label: 'half' }, { at: AXES.sourceMax, label: 'all China-free' }]}
          desc="Friendshoring the heavy rare earths, FEOC-traced: the minimum share of US Dy/Tb need met by a chain-of-custody-CLEAN supply that never touched Chinese ore, oxide, or alloy at any stage. Unlike a provenance-blind sourcing quota (which ex-China separation of Chinese ore defeats), this can only be met by genuinely China-free material, so it moves the flow-traced exposure. The US pays an ex-China premium for it." />
        <Slider label="US price floor on China imports" value={pfloor} max={AXES.pfloorMax} onChange={setPfloor} fmt={(v) => pct(v * 100)}
          ticks={[{ at: 0, label: 'off' }, { at: 0.5, label: 'half premium' }, { at: 1, label: 'full premium' }]}
          desc="A US guaranteed price floor (DoD / MP-Materials-style), modeled as a tariff lifting the price of Chinese oxide, alloy and magnet imports toward the ex-China premium. It makes domestic and allied supply cost-competitive WITHOUT a mandate, so the market reshores on price rather than by rule; its cost falls on consumers as a higher import price. The SAME instrument also de-risks covered projects in actor mode below, and that relief scales with this setting." />
      </div>

      <div style={RULE} />
      <div style={GROUP}>Intervention costs</div>
      <p style={{ fontSize: 10.5, opacity: 0.6, margin: '-2px 0 8px', lineHeight: 1.4 }}>
        Not set, but priced: state what each costs and the planner deploys it to the
        degree it pays. What it chose is reported beneath.
      </p>
      <div style={ROW}>
        <Slider label="End-of-life collection cost" value={collectCost} max={100} onChange={setCollectCost} fmt={(v) => `$${v.toFixed(0)}/kg`}
          ticks={[{ at: 0, label: 'free' }, { at: 25, label: 'default' }, { at: 100, label: 'dear' }]}
          desc="What it costs to get a kilogram of end-of-life magnet to a recycler: take-back, dismantling, sorting, logistics. The model already pays to build and run the recyclers; this is the part it never priced. The planner picks the collection rate (none, 20, 40 or 60% of retirements, the solved points) that minimizes world cost plus this bill, so cheap collection means more recycling and dear collection means none." />
        <Slider label="Stockpile cost" value={stockCost} min={40} max={250} onChange={setStockCost} fmt={(v) => `$${v.toFixed(0)}/kg`}
          ticks={[{ at: 40, label: 'commodity' }, { at: STOCKPILE_COST_DEFAULT, label: 'default' }, { at: 250, label: 'high-coercivity' }]}
          desc={`Acquire and hold cost of stockpiled finished magnets. The $${STOCKPILE_COST_DEFAULT}/kg default assumes a buffer skewed to Dy/Tb-rich high-coercivity grades, the strategically scarce ones. The planner holds enough to cover the shortfall when this is below the value of unmet demand, and nothing otherwise.`} />
        <Slider label="Value of unmet demand" value={unmetValueLog} min={Math.log10(30)} max={Math.log10(50000)} step={0.01} onChange={setUnmetValueLog}
          fmt={(v) => { const x = 10 ** v; return x >= 1000 ? `$${(x / 1000).toFixed(x >= 10000 ? 0 : 1)}k/kg` : `$${x.toFixed(0)}/kg`; }}
          ticks={[{ at: Math.log10(UNMET_VALUE_ANCHORS.revealed2025), label: '2025 premium' }, { at: Math.log10(UNMET_VALUE_ANCHORS.adaptation), label: 'adapt' }, { at: Math.log10(UNMET_VALUE_ANCHORS.lostLoad), label: 'lost load' }]}
          desc="What a kilogram of magnet demand that goes unmet costs the US, per kg of finished magnet. Three anchors, three orders of magnitude apart, and the gap between them is the point. FLOOR, revealed by the 2025 export controls: buyers paid an ex-China premium worth about $55/kg of magnet rather than go without, so the marginal ton was still obtainable at that. CEILING, a short unforeseen stoppage: the vehicle output riding on each kg of magnet, or an electricity value-of-lost-load ratio of 150-1,000x price, lands at $10,000-100,000/kg. The grid's unmet demand is neither: a foreseen, multi-year gap, which nobody pays that for; they redesign the magnet out at a few hundred $/kg. That is the default. Log scale." />
        <Slider label="Thrifting R&D cost" value={rdCostPerKg} max={400} step={5} onChange={setRdCostPerKg} fmt={(v) => `$${v.toFixed(0)}/kg`}
          ticks={[{ at: 0, label: 'free' }, { at: 50, label: 'default' }, { at: 400, label: 'dear' }]}
          desc="What the research costs per kg of Dy/Tb it makes designable-out: the engineering that lets a sector take a weaker magnet, so the thrifting ceiling rises from today's sectoral availability to the best any sector demonstrates. The planner funds it when the saving on the US supply bill exceeds the bill; the detail is in the research panel below." />
      </div>
      <div style={{ display: 'grid', gap: '4px 20px', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
                    font: '500 10.5px var(--font-mono)', lineHeight: 1.4, marginTop: 2 }}>
        {[
          { l: 'Collection', on: rec > 0,
            v: rec > 0 ? `${pct(rec * 100)} of retirements` : 'none',
            s: rec > 0 ? `${collection.collectedKt.toFixed(0)} kt collected · bill ${musdS(collection.bill)} · saves ${musdS(collection.systemSaving)} world`
                       : 'collection dearer than the primary it displaces' },
          { l: 'Stockpile', on: stockpile > 0,
            v: stockpile > 0 ? `${stockpile.toFixed(stockpile % 1 === 0 ? 0 : 1)} kt` : 'none',
            s: stockpile > 0 ? `covers the ${stockChoice.unmetKt.toFixed(1)} kt shortfall · ${musdS(stockChoice.bill)}`
               : stockChoice.unmetKt > 1e-6 ? `$${stockCost}/kg to hold exceeds what unmet demand costs`
               : 'no unmet demand to cover' },
          { l: 'Thrifting R&D', on: abunlock > 0,
            v: !rdChoice.evaluated ? 'evaluating…' : abunlock > 0 ? 'funded' : 'not funded',
            s: !rdChoice.evaluated ? 'loading the higher-ceiling grid'
               : `net ${musdS(rdChoice.rd.net)} on the US bill${rdChoice.rd.breakeven != null && rdChoice.rd.breakeven > 0 ? ` · breakeven $${rdChoice.rd.breakeven.toFixed(0)}/kg` : ''}` },
        ].map((k) => (
          <div key={k.l} style={{ minWidth: 0 }}>
            <span style={{ opacity: 0.55 }}>{k.l}: </span>
            <b style={{ color: k.on ? 'var(--accent)' : 'var(--ink)' }}>{k.v}</b>
            <div style={{ opacity: 0.55, fontWeight: 400, fontSize: 10 }}>{k.s}</div>
          </div>
        ))}
      </div>
      {stockpile > 0 && (
        <p style={{ fontSize: 10.5, opacity: 0.55, margin: '4px 0 0', lineHeight: 1.4 }}>
          Embodies ≈ <b>{Math.round(stockpile * 0.326)} kt Nd/Pr</b> + <b>{(stockpile * 0.034).toFixed(1)} kt Dy/Tb</b> oxide — the heavy slice is the strategically scarce one.
        </p>
      )}

      <div style={RULE} />
      <ProjectsAside future={futureSel} onToggle={toggleFuture} onSetGroup={setProjectGroup} />
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
          {plannerControls}
        </aside>
      )}

      {/* THE SIX HEADLINE NUMBERS, pinned. They were under the Sankey, which meant
          that by the time you had scrolled to the actor bars or the cost block the
          thing you were trying to move was off-screen and you were changing a
          slider blind. Sticky keeps the score visible while you work anywhere on
          the page; 3x2 and smaller type is what makes six of them fit in a band
          shallow enough to give up that much of the viewport.
          `top` is the site nav's height: the nav is itself sticky (Nav.astro,
          56px), so a band pinned at 0 slides UNDER it and reads as not sticking.
          Each chip is boxed so the band reads as six readouts, not a text row. */}
      {!isMobile && (
        <div style={{ position: 'sticky', top: NAV_HEIGHT, zIndex: 30, background: 'var(--paper)',
                      borderBottom: '1px solid var(--rule)', padding: '8px 0 9px',
                      marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                        gridTemplateRows: 'repeat(2, auto)', gap: '8px 10px' }}>
            {[
              { l: 'US trade-risk index', v: tri.toFixed(2), c: riskColor(tri), chip: true,
                s: 'demand-weighted 2026–35' },
              { l: 'Tightest chokepoint', v: cpHeavy.label.split(' ')[0], c: riskColor(cpHeavy.tri),
                chip: true, s: `Dy/Tb · stage TRI ${cpHeavy.tri.toFixed(2)}` },
              { l: 'China-exposed demand', v: pct(chinaTouch * 100), c: riskColor(chinaTouch),
                chip: true, s: `flow-traced · ${flowYear}` },
              { l: 'US magnets imported', v: pct(usImportPct), c: 'var(--ink)',
                s: `${flowYear} · same flows as the Sankey` },
              { l: 'Unmet demand', v: `${usUnmet.toFixed(1)} kt`,
                c: usUnmet > 0.05 ? WORSE : 'var(--ink)', s: '2026–35 cumulative' },
              { l: 'US cost of supply', v: musd(usCostReal), c: 'var(--ink)',
                s: '2026–35 NPV' },
            ].map((k) => (
              // The old ScoreCard, scaled down: label above, the number as the
              // one big thing, context beneath. The single-line variant was
              // shallower but read as a table row, not a readout.
              <div key={k.l} style={{ ...CARD, borderRadius: 8, padding: '7px 10px 6px', minWidth: 0 }}>
                <div style={{ ...CARD_LABEL, fontSize: 10, marginBottom: 2 }}>{k.l}</div>
                <div style={{ ...CARD_VALUE(), font: '600 16px var(--font-mono)' }}>
                  <span style={k.chip ? { ...riskChip(k.c), display: 'inline-block' } : { color: k.c }}>{k.v}</span>
                </div>
                <div style={{ ...CARD_SUB, fontSize: 8.5, paddingTop: 3, whiteSpace: 'nowrap',
                              overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.s}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP 1 — everything that feeds the PLANNER's solve, in one box directly
          above the chain it produces: demand, the geopolitical axis, and the
          recycling assumptions. Title and rationale sit OUTSIDE the box so the box
          itself is all controls and no prose. */}
      {!isMobile && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '0 0 7px' }}>
          <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em',
                       textTransform: 'uppercase', opacity: 0.6, margin: 0 }}>
            Scenario assumptions
          </h2>
        </div>
      )}
      {!isMobile && (
        <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: '12px 16px 10px', background: 'var(--paper)', marginBottom: 16 }}>
          {plannerControls}
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
          <FlowDiagram flows={rwFlows} active={activeProjects} year={flowYear} />


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
            priceSpread={priceSpread} onPriceSpread={setPriceSpread}
            conversion={conversion} onConversion={setConversion}
            rate={hurdle} onRate={setHurdle}
            instruments={instruments} onInstruments={setInstruments}
            sc={scR} alliedHHI={alliedHHIMap}
            reClass={reClass} onReClass={setReClass}
            costMult={costMult} onCostMult={setCostMult}
            foakMult={foakMult} onFoakMult={setFoakMult}
            provenancePremium={provenancePremium} onProvenancePremium={setProvenancePremium}
            floorLevel={pfloor} />

          <InterventionLedger planner={plannerLedger} actor={actorLedger} mobile={isMobile} />

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
            {/* The stacked bar is detail, not headline: the total is in the sticky
                band and the ledger above says what the money bought. It stays
                behind a toggle for anyone who wants the composition. */}
            <button onClick={() => setShowCostBar((o) => !o)}
              style={{ font: '500 10.5px var(--font-mono)', padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
                       border: '1px solid var(--rule)', background: 'transparent', color: 'var(--ink)', opacity: 0.75, marginBottom: 8 }}>
              {showCostBar ? '− hide breakdown' : '+ breakdown by component'}
            </button>
            {showCostBar && infoCost && (
              <p style={{ fontSize: 11.5, opacity: 0.5, margin: '0 0 12px', lineHeight: 1.45 }}>
                Absolute build + operating cost of US-located capacity by stage, plus the heavy-REE price
                premium and any stockpile (2026–35 NPV); the bar grows as you force more security and
                shrinks as imports do the work. The <span style={{
                  padding: '0 4px', borderRadius: 2, color: '#fff', backgroundColor: '#762A83', ...STIPPLE,
                }}>stippled</span> segment is the heavy-REE (Dy/Tb) cost. When the chain can’t deliver, that
                surfaces as <span style={{ color: WORSE }}> unmet demand</span>, not a dollar cost.
              </p>
            )}
            {showCostBar && (<>
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
            </>)}
            {/* trade-risk index, folded into the same section */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--rule)' }}>
              <TradeRiskPanel sc={scR} alliedHHI={alliedHHIMap} />
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
                <span style={{ opacity: 0.6, fontSize: 11 }}>{pct(usImportPct)} of US magnets imported</span>
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
