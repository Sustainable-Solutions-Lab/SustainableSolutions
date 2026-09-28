import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AXES, AXIS_DOMAIN, BASE, HAS_ALLIED_TARIFF, RESTRICTION_SCOPE, RESTRICTS_CONCENTRATE, interpScenario, applyStockpile, STOCKPILE_COST_DEFAULT, applyRoundTop, reshoreSupply, ROUND_TOP_COST, ROUND_TOP_MINING_DI, STOCKPILE_MAX, YEARS,
         HAS_ABATEMENT_CEILING, ABATEMENT_CEILINGS, HAS_LIGHT_RULE, coreReadyFor, ensureCoreFor,
         ensureFlowsFor, flowsReadyFor, type Scenario, type SliceNeed } from './interp';
import { integratedTRI, integratedRE, classTRI, stageBreakdownClass, RE_CLASS_WEIGHT, riskColor, riskChip } from './tri';
import { axisDiff, AXIS_LABEL, AXIS_FMT, type AxisKey } from './ScenarioBar';
import CapacityPanel, { type ReClass } from './CapacityPanel';
import InterventionLedger from './InterventionLedger';
import HurdleComponents from './HurdleComponents';
import { actorGap, actorRow, type PlannerRow, type ScreenOpts } from './ledger';
import { chooseCollection, chooseStockpile, chooseRd, collectedKtNPV, UNMET_VALUE_ANCHORS, UNMET_VALUE_DEFAULT } from './deploy';
import GuidedScenarios, { GUIDED, NO_RESPONSE, type Guided } from './GuidedScenarios';
import { hurdleRate, RELIEF_DEFAULTS, PLANNER_RATE, TODAY_OXIDE_PREMIUM, defaultPremium, sellsOxide, screen, judgedRows, type Buildout } from './projectFinance';
import { BusyOverlay } from '../_shell/busy-overlay.jsx';

// Phones get a leaner layout (essentials only) + the scenario controls in a slide-up
// sheet. From 1000 px up the controls are a rail on the left with the results
// beside it; anything narrower has no room for the two abreast and takes the
// phone's layout.
function useIsMobile(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 999px)');
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
import InfoPopover from './InfoPopover';
import Slider, { followTouches } from './Slider';
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
/** A share small enough that a whole per cent would round it away. */
const pct1 = (x: number) => `${x.toFixed(x < 10 ? 1 : 0)}%`;
const musd = (x: number) => `$${(x / 1000).toFixed(1)}B`;
/** To the nearest $10M, for the headline bill: at one decimal a lever that adds
 *  $80M left the figure where it was, which read as the lever doing nothing. */
const musd2 = (x: number) => `$${(x / 1000).toFixed(2)}B`;
/** Same, but a bill under a billion reads in $M rather than as $0.0B. */
const musdS = (x: number) => Math.abs(x) >= 1000 ? musd(x) : `$${x.toFixed(0)}M`;
// Fixed x-axis for the absolute cost bar so it visibly grows/shrinks with sliders
// (real US cost-of-security spans ~$2.5B baseline to ~$10B under heavy reshoring).
// Kept for the cost breakdown, which is off the page for now (the total is in the
// pinned band); COST_DESC and STIPPLE below belong to it too.
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
  ['demand_abatement', 'Dy/Tb thrifting', '#9970AB'],
  ['rd', 'Thrifting research', '#9970AB'],
  ['collection', 'End-of-life collection', '#66C2A5'],
  ['price_feedback', 'Import price escalation', '#762A83'],
  ['price_floor', 'Price floor (tariff on China imports)', '#5E4FA2'],
  ['allied_tariff', 'Tariff on allied imports', '#9970AB'],
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
  allied_tariff: 'US tariff paid on alloy and magnets imported from allies at the rate set in the scenario box. A transfer to the Treasury, but a real cost to US buyers, so it belongs in the bill exactly as the price-floor tariff does.',
  consumer_premium: 'The ex-China premium US buyers pay for ALLY-sourced supply rather than cheaper Chinese material — the Nd/Pr-oxide premium on allied light oxide (~$45/kg) plus a manufacturing premium on any finished magnets imported from allies (~$15/kg). Borne as a higher import price, not US capital, so it rises with friendshoring. The heavy Dy/Tb premium is shown separately above.',
  demand_abatement: 'What US magnet makers and buyers spend designing Dy/Tb out of magnets (grain-boundary diffusion, lower grades, rare-earth-free motors), wherever that is cheaper than buying it.',
  rd: 'The research that raises how much Dy/Tb can be designed out, at the cost per kilogram set in the scenario. In the bill only when the planner funds it.',
  collection: 'Collecting end-of-life magnets in the US, at the cost per kilogram set in the scenario, for the tonnage the planner chooses to collect.',
  price_feedback: 'The rise in what the US pays for imports as it buys more of a restricted supply. Zero on this grid, which holds import prices fixed.',
  shortage: 'Penalty on US unmet magnet demand: unmet tonnes × a high penalty rate. Not a market cost — it flags US demand the chain can’t deliver in time (e.g. under a ban).',
};
const WORSE = '#D53E4F';
/** Default cost of the thrifting research, $ per kg of Dy/Tb made designable-out. */
const RD_COST_DEFAULT = 65;
/** How near an IEA scenario the demand slider must be let go to snap to it, x APS. */
const DEMAND_SNAP = 0.04;

const KPIS: { k: string; label: string; sub: string; fmt: (x: number) => string; lowerBetter: boolean; help: string }[] = [
  { k: 'us_import_pct', label: 'Share of US magnets imported', sub: 'snapshot year', fmt: pct, lowerBetter: true, help: 'Share of US magnet demand met by imports rather than made in the US, in the snapshot year selected above the Sankey. Read off the same project-reconciled flows the diagram draws.' },
  { k: 'npv_musd', label: 'Total system cost', sub: '2026–35 NPV', fmt: musd, lowerBetter: true, help: 'Total 2026–2035 system cost: discounted (NPV) build-out + operating cost, summed across all regions.' },
  { k: 'us_unmet_kt', label: 'US unmet demand', sub: '2026–35 cumulative', fmt: (x) => `${x.toFixed(0)} kt`, lowerBetter: true, help: 'Cumulative 2026–2035 US magnet shortfall (kt of finished magnet) the chain cannot deliver in time — e.g. under a China export ban.' },
  { k: 'primary_dytb_kt', label: 'Primary Dy/Tb mined', sub: '2035 annual', fmt: (x) => `${x.toFixed(1)} kt`, lowerBetter: true, help: 'Final-year (2035) Dy+Tb oxide mined from ore that year (kt) — a few kt; the scarce chokepoint element, not comparable to total magnet tonnage.' },
  { k: 'hhi_separation', label: 'Separation concentration', sub: '2035', fmt: (x) => x.toFixed(2), lowerBetter: true, help: 'Herfindahl index of separation supply by region (1.0 = single region), final year (2035).' },
  { k: 'recycled_pct', label: 'Recycled supply', sub: '2035', fmt: pct, lowerBetter: false, help: 'Final-year (2035) share of oxide supplied by recycling.' },
];

/** Height of the site's sticky nav (components/Nav.astro), which anything
 *  else sticky must clear or it pins out of sight beneath it. */
const NAV_HEIGHT = 56;
/** Height of the one-line strip of headline figures that pins under the nav
 *  once the cards have scrolled away (desktop). The rail pins beneath it. */
const STRIP_HEIGHT = 30;
/** Height of a section heading in the controls rail. */
const RAIL_HEAD = 28;
/** Widest the explorer is drawn on a desktop. */
const PAGE_MAX = 1480;

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
  // Every slider on the page, wherever it is rendered, answers to a finger
  // anywhere along it (Slider.tsx).
  useEffect(() => followTouches(document.querySelector<HTMLElement>('.magnet-tool') ?? document.body), []);
  // OPENS WITH A GAP. With no intervention the planner asks for no US capacity
  // at any restriction below 85%, so the actor panel opened empty and the
  // tool's own argument, that what is optimal and what gets funded differ, had
  // nothing to show. A half US-made mandate at the reference restriction is
  // the smallest honest change: the planner then asks for one magnet plant (MP
  // Fort Worth's expansion) which does not clear at the competitive spread, so
  // the first screen shows the gap and what closes it. The do-nothing deltas
  // still read against make=0, so nothing is hidden by starting here.
  // No mandate by default: the base case's extraterritorial reach (below) is
  // what puts US capacity in the plan, on either grid vintage.
  const [make, setMake] = useState(0);   // component prong: US-made magnets
  // CLEAN SOURCING is one grid axis with two owners. China's extraterritorial
  // licensing (the October 2025 rules: any product with >=0.1% Chinese heavy REE
  // by value) makes allied magnets on Chinese oxide restricted too, which forces
  // the US onto chain-of-custody-clean supply exactly as a friendshoring mandate
  // would. So the axis is the MAX of a world assumption (reach) and a US lever
  // (the mandate), and the ledger credits the mandate only for what it adds.
  const [sourceMandate, setSource] = useState(0);   // mineral prong: US friendshore mandate
  // BASE CASE: the October 2025 rules in force. Their 0.1% threshold licenses
  // essentially every product carrying Chinese heavy REE, i.e. total reach; they
  // are suspended for a year after Busan, not withdrawn. With the 60% direct
  // restriction alone the plan adds one 10 kt expansion; with the reach it asks
  // for a 34 kt new plant that does not clear at the competitive spread, which
  // is the planner/actor question the tool exists to show.
  const [reach, setReach] = useState(AXES.sourceMax);   // China's extraterritorial reach
  const source = Math.max(sourceMandate, reach);
  // US tariff on allied alloy + magnets, a world assumption already in force
  // (~15% on Japan/EU/Korea since 2025). Opens at that level where the grid
  // carries the axis; a pre-axis grid solved it as 0 and the control says so.
  const [atariff, setAtariff] = useState(HAS_ALLIED_TARIFF ? 0.15 : 0);
  // A US friendshoring rule covers BOTH classes; China's reach is about the
  // heavy rare earths. So the heavy requirement is the larger of the two
  // (`source`, above) and the light requirement is the US rule alone. A grid
  // written before the light chain of custody existed has no such axis and the
  // rule is then heavy-only, as it was.
  const light = HAS_LIGHT_RULE ? sourceMandate : 0;
  // BASE CASE is a partially restricted world, not an open market. The study
  // exists because buyers are already paying to hedge Chinese supply, and an
  // undisrupted default answers a question nobody is asking: of course the
  // least-cost plan builds no US capacity when China exports freely. 0.6 is the
  // paper's canonical reference cell (the 83%-heavy-FEOC exposure figure), so the
  // tool opens on the same world the written results describe.
  //
  // On its own it does not make the planner ask for US capacity (nothing below
  // 0.85 does); the half mandate above is what puts something on the screen.
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
  // SLICES LOAD FOR THE SETTINGS IN FORCE, in two steps. The base slice is
  // bundled. First the pair of ceilings at these settings, which is what the
  // research decision needs. Then, at the ceiling that decision chose, the
  // slices the ledger probes: the price floor off and full, the friendshoring
  // rule off and full. Anything else is fetched when a control moves onto it.
  const [ceilingReady, setCeilingReady] = useState(false);
  const [probesReady, setProbesReady] = useState(false);
  // The slices could not be fetched. The research then stays unevaluated and the
  // page shows the baseline ceiling, which is a settled state, not a pending one.
  const [ceilingFailed, setCeilingFailed] = useState(false);
  const pfReady = probesReady, atReady = probesReady;
  const firstLoad = useRef(true);
  const whenIdle = (go: () => void, timeout: number) => {
    const w = window as any;
    if (!firstLoad.current) { go(); return () => undefined; }
    const id = typeof w.requestIdleCallback === 'function'
      ? w.requestIdleCallback(go, { timeout }) : window.setTimeout(go, timeout / 2);
    return () => { if (typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(id); else window.clearTimeout(id); };
  };
  useEffect(() => {
    const here = { pfloor, atariff, light };
    const pair: SliceNeed[] = HAS_ABATEMENT_CEILING
      ? [{ ...here, abunlock: 0 }, { ...here, abunlock: 1 }] : [{ ...here, abunlock: 0 }];
    if (coreReadyFor(pair)) { setCeilingReady(true); firstLoad.current = false; return; }
    setCeilingReady(false);
    let live = true;
    const cancel = whenIdle(() => {
      void ensureCoreFor(pair)
        .then(() => { if (live) { setCeilingReady(true); firstLoad.current = false; } })
        .catch(() => { if (live) setCeilingFailed(true); });
    }, 3000);
    return () => { live = false; cancel(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pfloor, atariff, light]);
  // Abatement ceiling: 0 = today's sectoral availability, 1 = the barrier broken.
  // Whether it is broken is the planner's call, made below against this R&D cost.
  // Its three slices (one per price-floor level) load in idle time after first
  // paint, because the decision needs both ceilings; until they arrive the
  // research counts as not yet evaluated, and interpScenario answers at the
  // baseline ceiling.
  // No source prices this. The $50 it replaces was a round placeholder, and
  // $65 is a choice too: see RD_COST_DEFAULT.
  const [rdCostPerKg, setRdCostPerKg] = useState(RD_COST_DEFAULT);   // $ per kg of capability unlocked
  // The actor-side calibration. Exposed rather than fixed because these are the
  // numbers the US conclusion turns on and the ones we are least sure of.
  // Per STAGE: the reader drags one marker for each stage the plan asks the US to
  // build. A stage with no entry sits at the calibration (1x cost, no premium).
  const [costMult, setCostMult] = useState<Record<string, number>>({});          // x the US cost disadvantage
  const [foakMult, setFoakMult] = useState(1);            // x the FOAK premium above one
  // ONE PREMIUM: what a buyer pays extra per kg of a stage's product for supply
  // that never touched China, net of any premium the plant pays on its inputs.
  // A stage with no entry sits at its default: today's observed premium for the
  // stages that sell oxide, nothing for the rest (projectFinance.defaultPremium).
  const [premium, setPremium] = useState<Record<string, number>>({});
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
    ({ key: k, at: demandSummary(allScenario(k), DEFAULT_LEVERS).demand_scale, label: SCENARIO_LABEL[k] ?? k })), []);
  // THE SLIDER SNAPS to an IEA scenario when it is let go near one, and then
  // takes everything the scenario's chip sets: every sector on that scenario, no
  // levers, and with them the scenario's Dy/Tb intensity. Let go anywhere else it
  // scales the total and leaves the sector mix alone, as it always did. Snapping
  // on release rather than while dragging means a drag THROUGH a scenario on the
  // way elsewhere does not wipe a sector mix set by hand.
  const snapDemand = useCallback((v: number) => {
    const hit = demandTicks.find((t) => Math.abs(t.at - v) <= DEMAND_SNAP);
    if (hit) { setScenario(allScenario(hit.key)); setLv(DEFAULT_LEVERS); }
  }, [demandTicks, setScenario, setLv]);
  /** The IEA scenario in force, when every sector is on one and the total has
   *  not been dragged off it. */
  const demandPreset = useMemo(() => {
    if (dscaleOverride !== null) return null;
    if (JSON.stringify(lv) !== JSON.stringify(DEFAULT_LEVERS)) return null;
    const vals = Object.values(scenario);
    return vals.every((x) => x === vals[0]) ? vals[0] : null;
  }, [scenario, lv, dscaleOverride]);

  // The cost breakdown is US-specific (the cost the US bears to supply itself) —
  // this analysis is about US supply security. Global trade/co-product don't apply.
  const US_COST_KEYS = COST_KEYS.filter(([k]) => k !== 'trade' && k !== 'coproduct');
  // The bar shows REAL economic cost: the unmet-demand penalty is excluded (it's a
  // solver flag at $10k/kg, not money) and surfaced physically as unmet demand (kt).
  const REAL_COST_KEYS = US_COST_KEYS.filter(([k]) => k !== 'shortage');
  const realCost = (s: Scenario) => REAL_COST_KEYS.reduce((a, [k]) => a + Math.max(0, s.us_cost[k] ?? 0), 0);

  // FLOWS ARRIVE SEPARATELY. A cell's flow fields (what the Sankey draws) are
  // fetched for the slices the settings touch, after the numbers are already
  // on the page; `flowsTick` re-reads the grid when a batch lands. Everything
  // that is not a diagram is complete without them.
  const [flowsTick, setFlowsTick] = useState(0);

  // ── THE PLANNER'S DEPLOYMENTS ────────────────────────────────────────────
  // Three decisions, in the order they depend on each other. Collection is a
  // world parameter, chosen on the world objective at the baseline ceiling; the
  // research decision is then made at that collection rate; the stockpile last,
  // against whatever shortfall is left. Every step is a grid read.
  const cellAt = useCallback((o: Record<string, number>) => interpScenario({
    make, source, light, rec: 0, china, rcost, dytb: demand.dytb_intensity, dscale, pfloor, atariff, abunlock: 0, ...o,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [make, source, light, china, rcost, demand, dscale, pfloor, atariff, atReady, pfReady, ceilingReady, flowsTick]);
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
  const flowsReady = sc.flows_ready !== false;
  useEffect(() => {
    const at = { pfloor, abunlock, atariff, light };
    if (flowsReadyFor(at)) { if (!flowsReady) setFlowsTick((t) => t + 1); return; }
    let live = true;
    ensureFlowsFor(at).then(() => { if (live) setFlowsTick((t) => t + 1); }).catch(() => undefined);
    return () => { live = false; };
  }, [pfloor, abunlock, atariff, light, pfReady, ceilingReady, atReady, flowsReady]);
  // Step two of the loading: what the ledger probes, at the ceiling now chosen.
  useEffect(() => {
    if (!ceilingReady && !ceilingFailed) return;
    const here = { pfloor, atariff, light, abunlock };
    const probes: SliceNeed[] = [
      { ...here, pfloor: 0 }, { ...here, pfloor: AXES.pfloorMax },
      { ...here, light: 0 }, ...(HAS_LIGHT_RULE ? [{ ...here, light: AXES.sourceMax }] : []),
    ];
    if (coreReadyFor(probes)) { setProbesReady(true); return; }
    setProbesReady(false);
    let live = true;
    void ensureCoreFor(probes).then(() => { if (live) setProbesReady(true); });
    return () => { live = false; };
  }, [pfloor, atariff, light, abunlock, ceilingReady, ceilingFailed]);
  // THE HEADLINE NUMBERS WAIT for the research decision. Whether the thrifting
  // research is funded changes the scenario every figure is read from, and it
  // cannot be decided until the higher-ceiling slices have arrived, a second or
  // more after first paint. Before this the page opened at $10.5B and dropped
  // to $10.2B by itself. A figure that is about to change is not shown.
  const settled = !HAS_ABATEMENT_CEILING || ceilingReady || ceilingFailed;
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sectorsOpen, setSectorsOpen] = useState(false);   // demand by sector
  // Which year the Sankey shows. The horizon end alone hides the ramp: 2030 is
  // mid-build, before long-lead US capacity arrives, which is where a reshoring
  // story either is or is not already underway. Grids written before 2026-09-25
  // carry no snapshots, so the selector hides itself rather than offering years
  // it cannot serve.
  const [flowYear, setFlowYear] = useState<string>('2035');
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
  // Opens on ALL classes: the whole chain first, the Dy/Tb chokepoint one click away.
  const [reClass, setReClass] = useState<ReClass>('all');
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
  const [resetFlash, setResetFlash] = useState(false); // brief confirm-flash on "reset to baseline"
  // Real-world-anchored Sankey: selected projects locked in by region, China residual.
  const snapshotYears: string[] = Object.keys((sc as any).flows_by_year ?? {}).sort();
  const rwFlows = useMemo(() => {
    // Swap the flow set for the chosen year on a shallow clone, so realWorldFlows
    // keeps reading sc.flows and needs no change.
    const byYear = (sc as any).flows_by_year?.[flowYear];
    const scY = byYear ? { ...sc, flows: byYear } : sc;
    // The class flows are the final year's, so they can stand behind the total
    // only when the total is the final year's too.
    const years = Object.keys((sc as any).flows_by_year ?? {}).sort();
    const finalYear = !byYear || flowYear === years[years.length - 1];
    // The class views are of the chosen year where the grid carries the class
    // flows of that year, and of the final year where it does not.
    const reY = finalYear ? undefined : sc.flows_re_by_year?.[flowYear];
    const scC = reY ? { ...scY, flows_re: reY } : { ...sc, flows_re: sc.flows_re };
    return {
      total: realWorldFlows(reY ? scC : scY, activeProjects, {}, undefined, finalYear || !!reY),
      heavy: realWorldFlows(scC, activeProjects, {}, 'heavy'),
      light: realWorldFlows(scC, activeProjects, {}, 'light'),
    };
  }, [sc, activeProjects, flowYear]);
  /** The year the Dy/Tb and Nd/Pr views describe. */
  const classYear = useMemo(() => {
    const years = Object.keys((sc as any).flows_by_year ?? {}).sort();
    const last = years[years.length - 1] ?? String(YEARS[YEARS.length - 1]);
    return flowYear === last || sc.flows_re_by_year?.[flowYear] ? flowYear : last;
  }, [sc, flowYear]);
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
      // The research and the collection are decisions the planner made above,
      // paid for by the US, so they are in the bill the headline shows. They
      // used to be in the ledger's bill only, which made a lever's cost in the
      // ledger the difference between two figures the page never showed.
      us_cost: { ...sc.us_cost, consumer_premium: consumerPremium(rpath), us_projects: usProjectsBuildCost(activeProjects),
                 rd: abunlock > 0 ? rdChoice.rd.rdCost : 0,
                 collection: collectCost * collectedKtNPV(sc, 'USA') },
      path: rpath,
      _di: hasUSHeavyMine ? { ...sc._di, mining: ROUND_TOP_MINING_DI } : sc._di,
    };
  }, [sc, activeProjects, hasUSHeavyMine, abunlock, rdChoice, collectCost]);
  const usCostReal = realCost(scR);   // includes the consumer premium on ally-sourced supply
  // baseline = do-nothing (no US policy/projects) at the SAME demand scenario + threat, so
  // the delta is the cost of the security choices made (can be negative if reshoring avoids
  // more China premium than it costs to build).
  const baseNPV = realCost(interpScenario({ make: 0, source: reach, light: 0, rec: 0, china, rcost, dytb: demand.dytb_intensity, dscale, atariff, abunlock }));
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
  const exposedIn = (cls: 'heavy' | 'light'): number | null => {
    const i = YEARS.indexOf(Number(flowYear));
    const v = sc.exposed_by_year?.[cls]?.[i];
    return v == null || i < 0 ? null : v;
  };
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
    make, source, rec, china, rcost, pfloor, atariff,
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
    setChina(c.china); setRcost(c.rcost); setPfloor(c.pfloor); setAtariff(c.atariff ?? 0);
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
    let scn = interpScenario({ make, source, light, rec, china, rcost, dytb: demand.dytb_intensity, dscale, pfloor, atariff, abunlock: abu, ...o });
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
  }, [make, source, light, rec, china, rcost, demand, dscale, pfloor, atariff, atReady, abunlock, stockCost, unmetValue, collectCost, rdChoice, activeProjects, alliedHHIMap, finishScn, pfReady, ceilingReady]);

  const plannerLedger = useMemo<PlannerRow[]>(() => {
    const cur = evalAt({});
    const bought = (off: ReturnType<typeof evalAt>) => ({ dTRI: off.tri - cur.tri, cost: cur.bill - off.bill });
    const next = (on: ReturnType<typeof evalAt>, extraCost = 0) => ({ dTRI: cur.tri - on.tri, cost: on.bill - cur.bill + extraCost });
    const stepUp = (dom: number[], v: number) => dom.find((x) => x > v + 1e-9);
    const rows: PlannerRow[] = [];

    rows.push({ name: 'US-make mandate', deployed: make > 0, level: make > 0 ? pct(make * 100) : undefined,
      bought: make > 0 ? bought(evalAt({ make: 0 })) : undefined,
      next: make < AXES.makeMax ? next(evalAt({ make: AXES.makeMax })) : undefined });
    // Deployed when it adds anything: on the heavy side that is beyond China's
    // reach, on the light side from the first point, since no Chinese rule
    // asks for clean Nd/Pr.
    const friendOn = HAS_LIGHT_RULE ? sourceMandate > 1e-9 : sourceMandate > reach;
    const friendMax = HAS_LIGHT_RULE ? sourceMandate >= AXES.sourceMax - 1e-9 : source >= AXES.sourceMax - 1e-9;
    rows.push({ name: 'Friendshore mandate', deployed: friendOn,
      level: friendOn ? pct(sourceMandate * 100) : undefined,
      bought: friendOn ? bought(evalAt({ source: reach, light: 0 })) : undefined,
      next: friendMax ? undefined : next(evalAt({ source: AXES.sourceMax, light: HAS_LIGHT_RULE ? AXES.sourceMax : 0 })),
      note: HAS_LIGHT_RULE ? 'Nd/Pr and Dy/Tb · consumer premium'
        : reach > 0 ? `beyond China's ${pct(reach * 100)} reach · consumer premium` : 'consumer premium' });
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
    rows.push({ name: 'Build US separation', deployed: false, overlay: true, next: next(evalAt({}, { reshore: ['separation'] }), US_SEP_RESHORE_COST),
      note: `90% US-made, at an assumed ${musd(US_SEP_RESHORE_COST)}` });
    rows.push({ name: 'Build US alloy', deployed: false, overlay: true, next: next(evalAt({}, { reshore: ['alloy'] }), US_ALLOY_RESHORE_COST),
      note: `90% US-made, at an assumed ${musd(US_ALLOY_RESHORE_COST)}` });
    rows.push({ name: 'Build US magnet', deployed: false, overlay: true, next: next(evalAt({}, { reshore: ['magnet'] }), US_MAGNET_RESHORE_COST),
      note: `90% US-made, at an assumed ${musd(US_MAGNET_RESHORE_COST)}` });
    return rows;
  }, [evalAt, make, source, light, sourceMandate, reach, pfloor, rec, stockpile, abunlock, rdChoice, activeProjects, collectCost, stockCost, rdCostPerKg]);

  // ── THE ACTOR LEDGER ────────────────────────────────────────────────────
  // The same screen the capacity panel runs, once at the current instruments
  // and once per instrument applied in full, so each row says what it closes
  // of the gap the panel shows. Costs only where one is defined: a provenance
  // premium is paid by buyers every year; an offtake or guarantee is a
  // contingent liability the model does not price.
  const actorLedger = useMemo(() => {
    const us: Buildout[] = judgedRows((sc as any).buildout as Buildout[] | undefined);
    const base: ScreenOpts = {
      rate: hurdle, offtake: instruments.offtake, floorInterface: 'magnet',
      floorRelief: instruments.floor, floorLevel: pfloor, creditSupport: instruments.guarantee,
      costMult, foakMult, premium,
    };
    const now = actorGap(us, base);
    // TODAY'S OBSERVED PREMIUM, WHERE ONE IS OBSERVED. Oxide that never touched
    // China sells for more than China's benchmark, so the stages that sell oxide
    // (separation, recycling) are given that. Nothing comparable is observed for
    // alloy or magnets once the premium on their inputs is taken off, so they
    // are given none. What it costs buyers is the revenue it adds.
    const stagesAsked = [...new Set(us.map((b) => b.s))];
    const oxideStages = stagesAsked.filter(sellsOxide);
    const atToday = (o: ScreenOpts): ScreenOpts => ({ ...o,
      premium: { ...(o.premium as Record<string, number>), ...Object.fromEntries(oxideStages.map((k) => [k, TODAY_OXIDE_PREMIUM])) } });
    const without = (o: ScreenOpts): ScreenOpts => ({ ...o,
      premium: { ...(o.premium as Record<string, number>), ...Object.fromEntries(oxideStages.map((k) => [k, 0])) } });
    const revenue = (o: ScreenOpts) => screen(us, o).reduce((a, v) => a + v.revenue, 0);
    const premiumBill = oxideStages.length ? revenue(atToday(base)) - revenue(without(base)) : null;
    const rows = now.total === 0 ? [] : [
      actorRow('Offtake agreement', us, now, base, (o) => ({ ...o, offtake: 1 }),
        instruments.offtake > 0, null, 'removes most revenue risk'),
      actorRow('Loan guarantee', us, now, base, (o) => ({ ...o, creditSupport: 1 }),
        instruments.guarantee > 0, null, 'removes the financing wedge'),
      actorRow('Price floor, as de-risking', us, now, base, (o) => ({ ...o, floorLevel: 1, floorRelief: RELIEF_DEFAULTS.floor }),
        pfloor > 0, null, 'covered stages only'),
      actorRow(`Today’s oxide premium, $${TODAY_OXIDE_PREMIUM.toFixed(0)}/kg`, us, now, base, atToday,
        oxideStages.length > 0 && oxideStages.every((k) => (premium[k] ?? defaultPremium(k)) >= TODAY_OXIDE_PREMIUM - 1e-9),
        premiumBill,
        oxideStages.length
          ? 'observed for oxide only, so applied to separation and recycling; paid by buyers'
          : 'observed for oxide only; the plan asks for no US separation or recycling here, and none is observed for alloy or magnets'),
      actorRow('Public finance at the planner\'s rate', us, now, base, (o) => ({ ...o, rate: PLANNER_RATE }),
        hurdle <= PLANNER_RATE + 1e-9, null, `${(PLANNER_RATE * 100).toFixed(0)}% instead of ${(hurdle * 100).toFixed(1)}%`),
    ];
    return { now, rows, hurdlePct: hurdle * 100 };
  }, [sc, hurdle, instruments, pfloor, costMult, foakMult, premium]);

  // ── LEVERS THAT CANNOT ACT HERE ─────────────────────────────────────────
  // A lever that changes nothing is told apart from a broken one by saying why.
  // The reasons are read from the state, not assumed.
  //
  // US-made magnets: compared at its two ends, everything else held. If the
  // index, the bill and the unmet tonnage are the same at none and at all, the
  // mandate does not bind, and the share of its magnets the US already makes
  // (from the solved flows, before project overlays) is the reason.
  const leverNotes = useMemo(() => {
    const same = (a: ReturnType<typeof evalAt>, b: ReturnType<typeof evalAt>) =>
      Math.abs(a.tri - b.tri) < 0.005 && Math.abs(a.bill - b.bill) < 25 && Math.abs(a.unmet - b.unmet) < 0.1;
    const usMade = (yr: string) => {
      const to = ((sc as any).flows_by_year?.[yr]?.magnet ?? sc.flows?.magnet ?? [])
        .filter((f: { to: string }) => f.to === 'USA');
      const tot = to.reduce((a: number, f: { value: number }) => a + f.value, 0);
      const home = to.filter((f: { from: string }) => f.from === 'USA')
        .reduce((a: number, f: { value: number }) => a + f.value, 0);
      return tot > 1e-9 ? home / tot : 0;
    };
    const makeInert = AXES.makeMax > 0 && same(evalAt({ make: 0 }), evalAt({ make: AXES.makeMax }));
    return {
      make: makeInert
        ? `No effect in this scenario: the plan already makes ${pct(usMade('2030') * 100)} of the magnets the US uses in 2030 and ${pct(usMade('2035') * 100)} in 2035 here, so a requirement to make them here changes nothing. It governs where magnets are made, not where their alloy comes from.`
        : null,
      source: HAS_LIGHT_RULE
        ? (reach > 1e-9 && sourceMandate <= reach + 1e-9
          ? `Acts on Nd/Pr only until it passes ${pct(reach * 100)}: China’s reach, set above, already forces that much of the US Dy/Tb onto clean supply.`
          : null)
        : reach >= AXES.sourceMax - 1e-9
          ? `No effect in this scenario: China’s extraterritorial reach, set at ${pct(reach * 100)} above, already forces all of the US Dy/Tb onto clean supply. The two take the larger value, so lower the reach to see this act.`
          : sourceMandate <= reach + 1e-9
            ? `No effect until it passes ${pct(reach * 100)}: China’s reach already forces that much clean sourcing, and the two take the larger value.`
            : null,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evalAt, sc, reach, sourceMandate]);

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

  // WHERE THE CONTROLS LIVE. On a desktop they are a rail on the left, in two
  // sections, with every result to its right, so a setting and what it changes
  // are on the screen together. On a phone they are the slide-up sheet. Either
  // way they are one column.
  //
  // PLANNER controls: every one of these is a grid axis, so every one re-solves
  // the least-cost chain and moves the Sankey. Whether a lever is a US choice or
  // a fact about the world is a second-order annotation, carried by the
  // sub-heading.
  //
  // ACTOR controls: the hurdle rate and what acts on it. They are closed-form
  // arithmetic over a solved cell and cannot move a ribbon. The premium and the
  // cost disadvantage are set by dragging the markers on the frontier itself.
  const GROUP = { font: '600 10px var(--font-mono)', letterSpacing: '0.08em',
                  textTransform: 'uppercase' as const, color: 'var(--cardinal)',
                  opacity: 0.85, margin: '0 0 6px' };
  const ROW = { display: 'grid', gap: '2px 20px', gridTemplateColumns: 'minmax(0, 1fr)' } as const;
  const RULE = { borderTop: '1px solid var(--rule)', margin: '10px 0 8px' };
  const plannerControls = (
    <>
      <div style={GROUP}>US demand</div>
      <div id="demand-builder">
        {/* The slider alone, on a phone and a desktop alike: it snaps to the three
            IEA scenarios, and the sector detail opens beneath it. */}
        <div style={ROW}>
          <Slider label={isMobile ? 'Total magnet demand' : 'Demand'} value={dscale} min={AXES.dscaleMin} max={AXES.dscaleMax}
            onChange={setDscaleOverride} onCommit={snapDemand}
            fmt={(v) => (demandPreset ? `${SCENARIO_LABEL[demandPreset] ?? demandPreset} · ${v.toFixed(2)}×`
                                      : `${v.toFixed(2)}× pledges`)}
            ticks={demandTicks}
            desc="US magnet demand, 2026–35, as a multiple of the IEA Announced Pledges trajectory. Let go near one of the three IEA scenarios and the slider snaps to it, taking that scenario’s sector mix and its Dy/Tb intensity with it. Let go anywhere else and it scales the total and leaves the sector mix as it was. The grid is solved at 0.6, 1.0 and 1.4× and every level between is interpolated over solved cells." />
        </div>
        <div style={{ marginTop: 6 }}>
          <button type="button" onClick={() => setSectorsOpen((o) => !o)} aria-expanded={sectorsOpen}
            style={{ font: `500 ${isMobile ? 11 : 10.5}px var(--font-mono)`,
                     padding: isMobile ? '5px 10px' : '3px 8px', borderRadius: 6,
                     cursor: 'pointer', border: '1px solid var(--rule)', background: 'transparent',
                     color: 'var(--ink)' }}>
            <span aria-hidden="true">{sectorsOpen ? '▾' : '▸'}</span> Demand by sector
          </button>
          {sectorsOpen && (
            <div style={{ marginTop: 10 }}>
              <DemandBuilder mode="controls" scenario={scenario} setScenario={setScenario} lv={lv} setLv={setLv} />
            </div>
          )}
        </div>
      </div>

      <div style={RULE} />
      <div style={GROUP}>Geopolitical context</div>
      <div style={ROW}>
        <Slider label="China export restriction" value={china} max={AXES.chinaMax} onChange={setChina} fmt={(v) => pct(v * 100)}
          ticks={[{ at: 0, label: 'open' }, { at: 0.6, label: 'reference' }, { at: 1, label: 'full ban' }]}
          desc={`Severity of Chinese export controls on ${RESTRICTS_CONCENTRATE ? 'concentrate, oxide, alloy and magnets' : 'oxide, alloy and magnets'}: 0% is an open market, 100% a full ban. In between, China exports to a shrinking share of the rest of the world's demand. Tightening also raises the Dy/Tb benchmarks the US is a price-taker to. The 60% reference is a modelling choice, not a calibrated value; China's 2025 licensing regime is the closest real analogue.${RESTRICTS_CONCENTRATE ? ' That the October 2025 rules cover ore and concentrate is our assumption and has yet to be confirmed.' : ''}`} />
        <Slider label="China’s extraterritorial reach" value={reach} max={AXES.sourceMax} onChange={setReach} fmt={(v) => pct(v * 100)}
          ticks={[{ at: 0, label: 'none' }, { at: 0.5, label: 'partial' }, { at: AXES.sourceMax, label: 'Oct-2025 rules' }]}
          desc="How far China's controls follow its material abroad, distinct from the direct export restriction above. The October 2025 rules (suspended for a year after Busan, not withdrawn) require a Chinese licence for ANY product containing 0.1% or more Chinese-origin heavy rare earths by value, so allied magnets made on Chinese oxide become restricted too; that threshold is effectively total reach, and it is the base case. Half stands for partial enforcement or licences granted to some buyers. Modelled as the share of US Dy/Tb that must come from chain-of-custody-clean supply, the same constraint a US friendshoring mandate imposes; the two take the larger value, and the mandate below is credited only for what it adds beyond this." />
        <Slider label="US tariff on allied imports" value={atariff} max={Math.max(AXES.atariffMax, 0.3)} step={0.01} onChange={setAtariff} fmt={(v) => pct(v * 100)}
          ticks={[{ at: 0, label: 'none' }, { at: 0.15, label: '2025 rates' }, { at: 0.3, label: 'Sec. 232' }]}
          desc={HAS_ALLIED_TARIFF
            ? "Ad-valorem tariff on alloy and finished magnets from allies (Japan, Europe, Korea, Malaysia), a state of the world rather than a security lever: the 2025 reciprocal rates are about 15% on Japan, the EU and Korea and 19-20% on Malaysia and Vietnam, and a Section 232 action on critical minerals is pending. Oxide is exempt as a critical mineral. At about 19% allied delivered cost meets the US cost factor, so the planner is indifferent between building in Japan and at home. It bites wherever the plan imports allied magnets, above all under clean sourcing, where it shifts supply from Japanese plants to US ones. The tariff paid appears in the US cost of supply."
            : "This grid was solved before the allied-tariff axis existed, so every cell assumes free allied trade; the control arrives with the next regrid."} />
      </div>

      <div style={RULE} />
      <div style={GROUP}>US policy levers</div>
      <div style={ROW}>
        <Slider label="US-made magnets (reshore)" value={make} max={AXES.makeMax} onChange={setMake} fmt={(v) => pct(v * 100)}
          ticks={[{ at: 0, label: 'none' }, { at: 0.5, label: 'half' }, { at: AXES.makeMax, label: 'all US-made' }]}
          note={leverNotes.make}
          desc="The share of the magnets the US uses that must be made in the US: the last step of the chain only, like the component rule of the IRA vehicle credit. It says nothing about what they are made from, so a US magnet plant may still run on imported alloy, Chinese alloy included, as far as the export restriction allows." />
        <Slider label={HAS_LIGHT_RULE ? 'Clean sourcing (friendshore)' : 'Clean heavy sourcing (friendshore)'} value={sourceMandate} max={AXES.sourceMax} onChange={setSource} fmt={(v) => pct(v * 100)}
          ticks={[{ at: 0, label: 'none' }, { at: 0.5, label: 'half' }, { at: AXES.sourceMax, label: 'all China-free' }]}
          note={leverNotes.source}
          desc={HAS_LIGHT_RULE
            ? 'The share of the rare earths the US uses, light (Nd/Pr) and heavy (Dy/Tb) alike, that must come from a supply that never touched China at any stage: ore, oxide, alloy or magnet. A plant exports only what it makes, so the rule cannot be met by exporting clean magnets and using Chinese ones. It takes force in 2032, the soonest the capacity could exist, and does nothing before. The US pays a premium for the clean supply.'
            : 'The share of the dysprosium and terbium the US uses that must come from a supply that never touched China at any stage: ore, oxide or alloy. It covers the heavy rare earths only. The neodymium and praseodymium that make up most of a magnet’s rare-earth content are not covered, so Chinese alloy can still reach US magnet plants, as far as the export restriction allows, carrying clean Dy/Tb or none. The US pays a premium for the clean supply.'} />
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
          ticks={[{ at: Math.log10(UNMET_VALUE_ANCHORS.revealed2025), label: '2025 floor' }, { at: Math.log10(UNMET_VALUE_ANCHORS.adaptation), label: 'redesign', low: true }, { at: Math.log10(UNMET_VALUE_ANCHORS.lostLoad), label: 'stoppage' }]}
          desc="What a kilogram of magnet demand that goes unmet costs the US, per kg of finished magnet. Three anchors, three orders of magnitude apart, and the gap between them is the point. FLOOR, revealed by the 2025 export controls: buyers paid an ex-China premium worth about $55/kg of magnet rather than go without, so the marginal ton was still obtainable at that. CEILING, a short unforeseen stoppage: the vehicle output riding on each kg of magnet, or an electricity value-of-lost-load ratio of 150-1,000x price, lands at $10,000-100,000/kg. The grid's unmet demand is neither: a foreseen, multi-year gap, which nobody pays that for; they redesign the magnet out at a few hundred $/kg. That is the default. Log scale." />
        <Slider label="Thrifting R&D cost" value={rdCostPerKg} max={400} step={5} onChange={setRdCostPerKg} fmt={(v) => `$${v.toFixed(0)}/kg`}
          ticks={[{ at: 0, label: 'free' }, { at: RD_COST_DEFAULT, label: 'default', low: true }, { at: 400, label: 'dear' }]}
          desc="What the research costs per kg of Dy/Tb it makes designable-out: the engineering that lets a sector take a weaker magnet, so the thrifting ceiling rises from today's sectoral availability to the best any sector demonstrates. The planner funds it when the saving on the US supply bill exceeds the bill; the detail is in the research panel below." />
      </div>
      {/* WHAT THE SETTINGS DEPLOY, set off from the sliders that decide it by a
          hairline. Deployed reads green and not deployed red, on a tint behind
          the word and a mark beside it, so the verdict is never colour alone
          and the text stays the ink colour in both themes. */}
      <div style={{ display: 'grid', gap: '6px 20px', gridTemplateColumns: 'minmax(0, 1fr)',
                    font: '500 10.5px var(--font-mono)', lineHeight: 1.4,
                    marginTop: 8, paddingTop: 9, borderTop: '1px solid var(--rule)' }}>
        {([
          { l: 'Collection', on: rec > 0,
            v: rec > 0 ? `${pct(rec * 100)} of retirements` : 'none',
            s: (rec > 0 ? `${collection.collectedKt.toFixed(0)} kt collected · bill ${musdS(collection.bill)} · saves ${musdS(collection.systemSaving)} world`
                        : 'collection dearer than the primary it displaces')
               + (collection.breakeven != null && collection.breakeven > 0
                  ? ` · breakeven $${collection.breakeven.toFixed(collection.breakeven < 20 ? 1 : 0)}/kg` : ' · no price makes it pay here') },
          { l: 'Stockpile', on: stockpile > 0,
            v: stockpile > 0 ? `${stockpile.toFixed(stockpile % 1 === 0 ? 0 : 1)} kt` : 'none',
            s: stockpile > 0 ? `covers the ${stockChoice.unmetKt.toFixed(1)} kt shortfall · ${musdS(stockChoice.bill)}`
               : stockChoice.unmetKt > 1e-6 ? `$${stockCost}/kg to hold exceeds what unmet demand costs`
               : 'no unmet demand to cover' },
          { l: 'Thrifting R&D', on: !rdChoice.evaluated ? null : abunlock > 0,
            v: !rdChoice.evaluated ? 'evaluating' : abunlock > 0 ? 'funded' : 'not funded',
            s: !rdChoice.evaluated ? 'loading the higher-ceiling grid'
               : `net ${musdS(rdChoice.rd.net)} on the US bill${rdChoice.rd.breakeven != null && rdChoice.rd.breakeven > 0 ? ` · breakeven $${rdChoice.rd.breakeven.toFixed(0)}/kg` : ''}` },
        ] as { l: string; on: boolean | null; v: string; s: string }[]).map((k) => {
          const tone = k.on == null ? 'var(--ink-3)' : k.on ? 'var(--brand-green)' : WORSE;
          return (
            <div key={k.l} style={{ minWidth: 0 }}>
              <span style={{ opacity: 0.55 }}>{k.l}: </span>
              <b style={{ display: 'inline-block', color: 'var(--ink)', padding: '0 6px', borderRadius: 5,
                          background: `color-mix(in srgb, ${tone} 22%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${tone} 55%, transparent)` }}>
                <span aria-hidden="true" style={{ color: tone }}>
                  {k.on == null ? '…' : k.on ? '✓' : '✕'}
                </span>{' '}{k.v}
              </b>
              <div style={{ opacity: 0.55, fontWeight: 400, fontSize: 10 }}>{k.s}</div>
            </div>
          );
        })}
      </div>
      {stockpile > 0 && (
        <p style={{ fontSize: 10.5, opacity: 0.55, margin: '4px 0 0', lineHeight: 1.4 }}>
          Embodies ≈ <b>{Math.round(stockpile * 0.326)} kt Nd/Pr</b> + <b>{(stockpile * 0.034).toFixed(1)} kt Dy/Tb</b> oxide — the heavy slice is the strategically scarce one.
        </p>
      )}

      <div style={RULE} />
      <ProjectsAside future={futureSel} onToggle={toggleFuture} onSetGroup={setProjectGroup} rail={!isMobile} />
    </>
  );
  // The stages the plan asks the US to build, in chain order: each can end at a
  // different rate once the instruments have acted.
  const actorStages = ['mining', 'separation', 'alloy', 'magnet', 'recycling']
    .filter((st) => judgedRows((sc as any).buildout as Buildout[] | undefined).some((b) => b.s === st));
  const actorControls = (rail: boolean) => (
    <HurdleComponents rail={rail} rate={hurdle} onRate={setHurdle}
      instruments={instruments} onInstruments={setInstruments} floorLevel={pfloor}
      foakMult={foakMult} onFoakMult={setFoakMult} stages={actorStages} />
  );

  // UNMET DEMAND, BY CLASS. A magnet that is not delivered is short of both
  // classes, but not in the proportion the average magnet holds them: the plan
  // chooses which grades go unserved. The classes are in kt of oxide and the
  // headline in kt of magnet, so they are shown as the share of each class's
  // need that goes unmet, which is what can be compared between them. They
  // describe the shortfall the chain leaves, before a stockpile covers any of
  // it, and the card says so when one does.
  const classUnmet = (() => {
    const re = (scBase.path as any).us_mix_re as Record<'light' | 'heavy', Record<string, number[]>> | undefined;
    if (!re?.light?.unmet || !re?.heavy?.unmet) return null;
    const sum = (a?: number[]) => (a ?? []).reduce((x, y) => x + Math.max(0, y), 0);
    const of = (c: 'light' | 'heavy') => {
      const need = sum(re[c].domestic) + sum(re[c].allied) + sum(re[c].china) + sum(re[c].unmet);
      const kt = sum(re[c].unmet);
      return { kt, share: need > 1e-9 ? kt / need : 0 };
    };
    return { light: of('light'), heavy: of('heavy'), magnetKt: sum(scBase.path.us_mix.unmet) };
  })();
  // WHAT OF THE BILL IS ONE CLASS'S. Only the lines that exist because of Dy/Tb:
  // the premium on the Dy/Tb the US buys, and thrifting where it is in the bill.
  // Mines, separation, alloy and magnet plants carry both classes in the same
  // tonnes, so their cost is joint and is not split.
  const heavyOnlyCost = REAL_COST_KEYS
    .filter(([k]) => k === 'dytb_premium' || k === 'demand_abatement' || k === 'rd')
    .reduce((a, [k]) => a + Math.max(0, (scR.us_cost as Record<string, number>)[k] ?? 0), 0);

  /** The six headline readouts, as a grid with `cols` columns. Shared by the
   *  desktop band and the mobile tail so the two never drift.
   *
   *  The three security readouts are split by rare-earth class. Heavy and light
   *  move very differently under a restriction (heavy decouples, light is largely
   *  laundered through third-country magnets), and a single blended figure hides
   *  exactly that. The index keeps its total, because the total is what every
   *  lever is rated against, with the two class indices beside it. */
  type Half = { v: string; c: string; s: string; cls: string; extra?: string };
  type Kpi = { l: string;
               /** The name it goes by in the one-line strip. */
               k: string;
               v?: string; c?: string; chip?: boolean; s?: string;
               halves?: [Half, Half];
               /** Beside the figure. `c` is a risk colour; without one the part is plain. */
               parts?: { t: string; v: string; c?: string }[];
               info?: JSX.Element;
               /** Hover text for the figure: the unrounded value and what it is made of. */
               tip?: string };
  const cards: Kpi[] = [
      { l: 'US trade-risk index', k: 'Trade risk', v: tri.toFixed(2), c: riskColor(tri), chip: true,
        parts: [{ t: 'Dy/Tb', v: triHeavy.toFixed(2), c: riskColor(triHeavy) },
                { t: 'Nd/Pr', v: triLight.toFixed(2), c: riskColor(triLight) }],
        s: `weighted ${RE_CLASS_WEIGHT.heavy} / ${RE_CLASS_WEIGHT.light} · 2026–35`,
        info: (
          <>
            <p style={{ margin: '0 0 6px', fontWeight: 600 }}>Trade risk index, 0 to 1. Lower is more secure.</p>
            <p style={{ margin: '0 0 6px' }}>
              Per stage: import-source concentration (HHI) × import reliance, plus a
              domestic-reserve risk for the US-made share and a full weight on any unmet
              demand, after <a href="https://www.nature.com/articles/s41558-025-02305-1"
              target="_blank" rel="noopener"
              style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Cheng et al.
              (2025, <i>Nature Climate Change</i>)</a>, demand-weighted across 2026–2035
              (period self-sufficiency, so a stockpile or the recycling ramp registers).
            </p>
            <p style={{ margin: '0 0 6px' }}>
              The headline is {RE_CLASS_WEIGHT.heavy} × the Dy/Tb index plus {RE_CLASS_WEIGHT.light} ×
              the Nd/Pr index: heavy rare earths weigh more because they are the binding
              constraint, though a small share of the mass. Risk by stage is under each
              column of the capacity chart.
            </p>
            <p style={{ margin: 0 }}>
              A content mandate cuts magnet-stage risk but pushes it upstream to oxide and
              ore, where the US has little heavy rare-earth production. Recycling’s benefit
              depends on the threat: negligible at low restriction, a primary domestic
              feedstock under a severe one.
            </p>
          </>
        ) },
      { l: 'Tightest chokepoint', k: 'Chokepoint',
        halves: [
          { v: cpHeavy.label.split(' ')[0], c: riskColor(cpHeavy.tri), s: `Dy/Tb · ${cpHeavy.tri.toFixed(2)}`,
            cls: 'Dy/Tb', extra: cpHeavy.tri.toFixed(2) },
          { v: cpLight.label.split(' ')[0], c: riskColor(cpLight.tri), s: `Nd/Pr · ${cpLight.tri.toFixed(2)}`,
            cls: 'Nd/Pr', extra: cpLight.tri.toFixed(2) },
        ] },
      // Light has a flow-traced twin only in grids from 2026-09-25 on; without
      // one the card stays a single figure rather than inventing a split.
      // Demand-weighted over the decade, not the year the Sankey shows: Dy/Tb is
      // wholly exposed until the clean supply arrives and barely after.
      lightFeoc == null
        ? { l: 'China-exposed demand', k: 'China-exposed', v: pct(chinaTouch * 100), c: riskColor(chinaTouch),
            chip: true, s: `${feocIsHeavy ? 'Dy/Tb · ' : ''}flow-traced · 2026–35` }
        : { l: 'China-exposed demand · 2026–35', k: 'China-exposed',
            // The decade's figure hides the path: a clean rule does nothing until
            // it takes force and everything after. Where the grid carries the
            // yearly series the sub-line gives the snapshot year beside it.
            halves: [
              { v: pct(chinaTouch * 100), c: riskColor(chinaTouch), cls: 'Dy/Tb',
                s: exposedIn('heavy') == null ? 'Dy/Tb · flow-traced' : `Dy/Tb · ${pct(exposedIn('heavy')!)} in ${flowYear}` },
              { v: pct(lightFeoc), c: riskColor(lightFeoc / 100), cls: 'Nd/Pr',
                s: exposedIn('light') == null ? 'Nd/Pr · flow-traced' : `Nd/Pr · ${pct(exposedIn('light')!)} in ${flowYear}` },
            ] },
      { l: 'US magnets imported', k: 'Imported', v: flowsReady ? pct(usImportPct) : '…', c: 'var(--ink)',
        s: flowsReady ? `${flowYear} · same flows as the Sankey` : 'loading flows' },
      { l: 'Unmet US demand', k: 'Unmet', v: `${usUnmet.toFixed(1)} kt`,
        c: usUnmet > 0.05 ? WORSE : 'var(--ink)',
        parts: classUnmet && classUnmet.magnetKt > 0.05
          ? [{ t: stockpile > 0.05 ? 'short: Dy/Tb' : 'Dy/Tb', v: pct1(classUnmet.heavy.share * 100) },
             { t: 'Nd/Pr', v: pct1(classUnmet.light.share * 100) }]
          : undefined,
        // A shortfall a stockpile covers is still a shortfall the chain left.
        s: stockpile > 0.05 ? `${stockChoice.unmetKt.toFixed(1)} kt short, met from the stockpile`
          : classUnmet && classUnmet.magnetKt > 0.05 ? '2026–35 · by class, share of its need' : '2026–35 cumulative',
        tip: classUnmet
          ? `${usUnmet.toFixed(1)} kt of finished magnet goes unmet over 2026–35`
            + (stockpile > 0.05 ? `, after a stockpile covers the ${classUnmet.magnetKt.toFixed(1)} kt the chain leaves short. ` : '. ')
            + `By class, ${stockpile > 0.05 ? 'before the stockpile, ' : ''}in the oxide those magnets would have held: `
            + `${classUnmet.heavy.kt.toFixed(2)} kt of Dy/Tb, ${(classUnmet.heavy.share * 100).toFixed(1)}% of what the US needs of it, and `
            + `${classUnmet.light.kt.toFixed(1)} kt of Nd/Pr, ${(classUnmet.light.share * 100).toFixed(1)}%. `
            + 'The classes are in oxide and the headline in magnet, so they do not add up to it.'
          : undefined },
      { l: 'US cost of supply', k: 'US cost', v: musd2(usCostReal), c: 'var(--ink)',
        parts: [{ t: 'Dy/Tb only', v: musd2(heavyOnlyCost) }],
        s: '2026–35 NPV · the rest is joint',
        tip: `$${Math.round(usCostReal).toLocaleString('en-US')}M: ` + REAL_COST_KEYS
          .filter(([k]) => ((scR.us_cost as Record<string, number>)[k] ?? 0) > 0.5)
          .map(([k, lbl]) => `${lbl} ${Math.round((scR.us_cost as Record<string, number>)[k])}`).join(' · ')
          + `. Of this, $${Math.round(heavyOnlyCost).toLocaleString('en-US')}M is there only because of Dy/Tb: the premium on the Dy/Tb the US buys, and what is spent designing it out and on the research that allows more of that. `
          + 'Mines, separation, alloy and magnet plants carry both classes in the same tonnes, so their cost is joint and is not split by class.' },
    ];
  const kpiCards = (cols: number, tight = false) => {
    const stacked = cols < 3;   // a phone's cards are too narrow for two halves abreast
    const big = tight ? 15 : 16;
    const sub: CSSProperties = { ...CARD_SUB, fontSize: 8.5, paddingTop: 3, whiteSpace: 'nowrap',
                                 overflow: 'hidden', textOverflow: 'ellipsis' };
    // One box for every risk-coloured value, pill or not, so that a figure that
    // needs the pill and one beside it that does not sit on the same line.
    const chipOf = (c: string) => (settled
      ? { padding: '1px 7px', borderRadius: 6, ...riskChip(c), display: 'inline-block' }
      : { padding: '1px 7px', borderRadius: 6, color: 'var(--ink-3)', display: 'inline-block' });
    // Not settled: every figure is a placeholder, in the same box, so nothing
    // moves when the numbers arrive.
    const shown = (v: string | undefined) => (settled ? v : '…');
    const subOf = (t: string | undefined) => (settled ? t : 'loading scenarios');
    return (
      <div aria-busy={!settled}
        style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                 gap: tight ? '6px 8px' : '8px 10px' }}>
        {cards.map((k) => (
          // The old ScoreCard, scaled down: label above, the number as the
          // one big thing, context beneath. The single-line variant was
          // shallower but read as a table row, not a readout.
          <div key={k.l} data-popover-anchor style={{ ...CARD, borderRadius: 8, minWidth: 0,
                                                      padding: tight ? '5px 9px 5px' : '7px 10px 6px' }}>
            <div style={{ ...CARD_LABEL, fontSize: 10, marginBottom: 2, display: 'flex', alignItems: 'center' }}>
              {k.l}
              {k.info && <InfoPopover label={`About the ${k.l.toLowerCase()}`}>{k.info}</InfoPopover>}
            </div>
            {k.halves ? (
              <div style={{ display: 'flex', flexDirection: stacked ? 'column' : 'row',
                            gap: stacked ? 3 : 10, alignItems: stacked ? 'stretch' : 'flex-start' }}>
                {k.halves.map((h, i) => (
                  <Fragment key={h.s}>
                    {i > 0 && !stacked && (
                      <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--rule)' }} />
                    )}
                    {stacked ? (
                      // class, value, and the stage index if there is one, on a line
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
                        <span style={{ ...sub, marginTop: 0, paddingTop: 0, flex: '0 0 30px' }}>{h.cls}</span>
                        <span style={{ ...chipOf(h.c), font: '600 12.5px var(--font-mono)',
                                       padding: '1px 6px', lineHeight: 1.2 }}>{shown(h.v)}</span>
                        {h.extra && settled && <span style={{ ...sub, marginTop: 0, paddingTop: 0 }}>{h.extra}</span>}
                      </div>
                    ) : (
                      <div style={{ flex: '1 1 0', minWidth: 0 }}>
                        {/* A word ("Separation") is set smaller than a figure, so that
                            two of them fit side by side in one card. */}
                        <div style={{ font: `600 ${(h.v ?? '').length > 6 ? Math.round(big * 0.7) : big}px var(--font-mono)`,
                                      lineHeight: 1.15, minHeight: big * 1.15, display: 'flex', alignItems: 'center' }}>
                          <span style={{ ...chipOf(h.c), maxWidth: '100%', boxSizing: 'border-box',
                                         overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                         ...((h.v ?? '').length > 6 ? { padding: '1px 5px' } : {}) }}>{shown(h.v)}</span>
                        </div>
                        <div style={sub}>{subOf(h.s)}</div>
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>
            ) : (<>
              <div style={{ ...CARD_VALUE(), font: `600 ${big}px var(--font-mono)`, gap: '2px 8px' }}>
                <span title={settled ? k.tip : undefined}
                  style={k.chip ? chipOf(k.c!) : { color: settled ? k.c : 'var(--ink-3)' }}>{shown(k.v)}</span>
                {k.parts && settled && (
                  <span style={{ font: '400 10px var(--font-mono)', whiteSpace: 'nowrap' }}>
                    {k.parts.map((x, i) => (
                      <span key={x.t}>
                        {i > 0 && <span style={{ opacity: 0.4 }}> · </span>}
                        <span style={{ opacity: 0.6 }}>{x.t} </span>
                        {x.c ? <b style={{ ...chipOf(x.c), fontWeight: 600, padding: '0 5px' }}>{x.v}</b>
                             : <b title={k.tip} style={{ fontWeight: 600, color: 'var(--ink)' }}>{x.v}</b>}
                      </span>
                    ))}
                  </span>
                )}
              </div>
              <div style={sub}>{subOf(k.s)}</div>
            </>)}
          </div>
        ))}
      </div>
    );
  };

  /** The same six figures on one line, for the strip that pins under the nav
   *  once the cards have scrolled away. */
  const kpiStrip = () => {
    const val = (v: string | undefined, c?: string, chip = true) => (
      <b style={{ fontWeight: 600, padding: '0 5px', borderRadius: 5, display: 'inline-block',
                  ...(settled && c && chip ? riskChip(c) : { color: settled ? (c ?? 'var(--ink)') : 'var(--ink-3)' }) }}>
        {settled ? v : '…'}
      </b>
    );
    return cards.map((k) => (
      <span key={k.l} title={settled ? k.tip : undefined} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        <span style={{ opacity: 0.55 }}>{k.k} </span>
        {k.halves
          ? k.halves.map((h) => (
            <span key={h.cls}><span style={{ opacity: 0.55 }}> {h.cls} </span>{val(h.v, h.c)}</span>
          ))
          : val(k.v, k.c, !!k.chip)}
      </span>
    ));
  };
  // The strip shows once the cards in the header are out of view.
  const headRef = useRef<HTMLElement>(null);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    const el = headRef.current;
    if (!el || isMobile || typeof IntersectionObserver === 'undefined') { setPinned(false); return; }
    const io = new IntersectionObserver(([e]) => setPinned(e.intersectionRatio < 0.3),
      { rootMargin: `-${NAV_HEIGHT}px 0px 0px 0px`, threshold: [0, 0.3] });
    io.observe(el);
    return () => io.disconnect();
  }, [isMobile]);
  // The rail's two headings stay in view wherever the rail is scrolled to, the
  // first at its top and the second under it or at the rail's foot, and take
  // the rail to their section.
  const railRef = useRef<HTMLElement>(null);
  const railTo = (id: string, nth: number) => {
    const rail = railRef.current;
    const body = rail?.querySelector<HTMLElement>(`[data-rail="${id}"]`);
    if (!rail || !body) return;
    rail.scrollTo({ top: Math.max(0, body.offsetTop - (nth + 1) * RAIL_HEAD), behavior: 'smooth' });
  };
  const railHead = (id: string, nth: number, name: string, what: string) => (
    <button type="button" onClick={() => railTo(id, nth)}
      style={{ position: 'sticky', top: nth * RAIL_HEAD, bottom: 0, zIndex: 2, display: 'flex', alignItems: 'baseline',
               gap: 8, width: '100%', height: RAIL_HEAD, boxSizing: 'border-box', padding: '0 12px',
               textAlign: 'left', cursor: 'pointer', color: 'var(--ink)', background: 'var(--paper-2)',
               border: 'none', borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)',
               lineHeight: `${RAIL_HEAD - 2}px`, whiteSpace: 'nowrap', overflow: 'hidden' }}>
      <span style={{ font: '600 11.5px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{name}</span>
      <span style={{ fontSize: 10.5, opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis' }}>{what}</span>
    </button>
  );
  const yearPicker: ReactNode = snapshotYears.length > 0 && (
    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 4, marginBottom: isMobile ? 6 : 0 }}>
      <span style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.06em',
                     textTransform: 'uppercase', opacity: 0.55 }}>Chain in</span>
      {snapshotYears.map((y) => (
        <button key={y} onClick={() => setFlowYear(y)}
          title={y === '2030' ? 'Mid-build: long-lead capacity has not arrived yet'
                              : 'End of horizon: the full build-out'}
          style={{ font: `600 ${isMobile ? 11 : 10}px var(--font-mono)`,
                   padding: isMobile ? '3px 9px' : '2px 8px', borderRadius: 6,
                   cursor: 'pointer',
                   border: `1px solid ${flowYear === y ? 'var(--accent)' : 'var(--rule-strong)'}`,
                   background: flowYear === y ? 'var(--accent)' : 'transparent',
                   color: flowYear === y ? 'var(--paper)' : 'var(--ink)' }}>{y}</button>
      ))}
    </div>
  );
  // GUIDED SCENARIOS set the sliders to a move by China and, if asked, the
  // likely US response. The highlight follows the sliders: move one and the
  // page is no longer showing the scenario it was.
  const guided = useMemo(() => GUIDED(AXES.sourceMax), []);
  const [guidedPick, setGuidedPick] = useState<{ id: Guided['id']; respond: boolean } | null>(null);
  const pickGuided = (id: Guided['id'], respond: boolean) => {
    const g = guided.find((x) => x.id === id)!;
    const r = respond && g.response ? g.response : NO_RESPONSE;
    setChina(g.move.china); setReach(g.move.reach);
    setSource(r.source); setMake(r.make); setPfloor(r.pfloor); setCollectCost(r.collectCost);
    setGuidedPick({ id, respond: respond && !!g.response });
  };
  const guidedActive = (() => {
    if (!guidedPick) return null;
    const g = guided.find((x) => x.id === guidedPick.id)!;
    const r = guidedPick.respond && g.response ? g.response : NO_RESPONSE;
    const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
    return same(china, g.move.china) && same(reach, g.move.reach) && same(sourceMandate, r.source)
      && same(make, r.make) && same(pfloor, r.pfloor) && same(collectCost, r.collectCost) ? guidedPick : null;
  })();
  const guidedPanel = (
    <GuidedScenarios items={guided} active={guidedActive?.id ?? null} responding={!!guidedActive?.respond}
      onPick={pickGuided} mobile={isMobile}
      metrics={{ tri, costB: usCostReal / 1000, exposedPct: chinaTouch * 100,
               unmetKt: stockpile > 0.05 ? stockChoice.unmetKt : usUnmet, stockKt: stockpile }} />
  );

  const results = (
    <main style={{ minWidth: 0 }}>
      {guidedPanel}
      {/* 1 — the whole chain first, so users learn the stages + connections.
          Flows are real-world-anchored (selected projects locked in, China residual). */}
      {isMobile && yearPicker}
      <FlowDiagram flows={rwFlows} active={activeProjects} year={flowYear} classYear={classYear} pending={!flowsReady}
        compact={!isMobile} controls={isMobile ? undefined : yearPicker} />

      {/* 2 — the ACTOR view. Sits directly under the planner's chain because the
          page reads planner -> actor -> interventions: what the least-cost plan
          calls for, then whether anyone would fund it, and only then what
          closing the difference costs.

          `incumbent` is US operating capacity from the project list — already
          built, and therefore never screened. */}
      <CapacityPanel
        buildout={(sc as any).buildout}
        incumbent={PROJECTS.filter((pj) => pj.bloc === 'us' && pj.status === 'operating')
          .reduce((acc, pj) => {
            (acc[pj.stage] ??= []).push({ stage: pj.stage, name: pj.name,
                                          kt: pj.capacityKt, note: pj.note, heavy: pj.heavy });
            return acc;
          }, {} as Record<string, { stage: string; name: string; kt: number; note?: string; heavy?: boolean }[]>)}
        rate={hurdle} instruments={instruments}
        sc={scR} alliedHHI={alliedHHIMap}
        reClass={reClass} onReClass={setReClass}
        costMult={costMult} onCostMult={setCostMult}
        foakMult={foakMult}
        premium={premium} onPremium={setPremium}
        floorLevel={pfloor}
        compact={!isMobile}
        controls={isMobile ? actorControls(false) : undefined} />

      <InterventionLedger planner={plannerLedger} actor={actorLedger} mobile={isMobile} compact={!isMobile} />

      {/* The trade-risk index has no section of its own any more. Its total and
          the two class indices are on the headline card, with the method
          behind the card's ⓘ; risk by stage is under the capacity columns. */}
      {isMobile && (
        <div style={{ marginTop: 22, paddingTop: 14, borderTop: '1px solid var(--rule)' }}>
          <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: '0 0 8px' }}>
            Where this scenario lands
          </h2>
          {kpiCards(2)}
        </div>
      )}
    </main>
  );

  return (
    <div style={{ position: 'relative', maxWidth: isMobile ? 'var(--content-max)' : PAGE_MAX, margin: '0 auto',
                  padding: isMobile ? '20px 16px 112px' : '14px 20px 0', color: 'var(--ink)' }}>
      <BusyOverlay busy={pfloor > 0 && !pfReady} label="Loading price-floor scenarios" />
      {/* THE HEADER: what this is on the left, where the scenario lands on the
          right. On a phone the six cards are at the end of the page instead, and
          the bottom bar carries the headline figures. */}
      <header ref={headRef} style={isMobile ? { marginBottom: 24 } : {
        display: 'grid', gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 9fr)', gap: 24,
        alignItems: 'end', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: isMobile ? 12 : 10.5, letterSpacing: '0.08em',
                        color: 'var(--accent)', marginBottom: isMobile ? 8 : 4 }}>
            INTERACTIVE MODEL · WORK IN PROGRESS
          </div>
          <h1 style={{ font: `600 ${isMobile ? 30 : 23}px/1.15 var(--font-serif)`, margin: isMobile ? '0 0 10px' : '0 0 6px' }}>
            U.S. rare-earth magnet supply chain explorer
          </h1>
          <p style={{ fontSize: isMobile ? 15 : 12.5, lineHeight: isMobile ? 1.55 : 1.45, opacity: 0.8, margin: 0 }}>
            A capacity-expansion model of the NdFeB magnet supply chain. Assess least-cost
            options for meeting US magnet demand under a range of global assumptions, and
            then evaluate what it would take for private actors to actually build.
          </p>
        </div>
        {!isMobile && kpiCards(3, true)}
      </header>

      {/* The same six figures, on one line under the nav, once the cards have
          scrolled away: a setting changed far down the page is still scored in
          view. `top` is the site nav's height (Nav.astro is sticky, 56px). */}
      {!isMobile && (
        <div aria-hidden={!pinned}
          style={{ position: 'fixed', top: NAV_HEIGHT, left: 0, right: 0, zIndex: 30, height: STRIP_HEIGHT,
                   boxSizing: 'border-box', background: 'var(--paper)', borderBottom: '1px solid var(--rule)',
                   visibility: pinned ? 'visible' : 'hidden', opacity: pinned ? 1 : 0,
                   transition: 'opacity 0.15s ease, visibility 0.15s' }}>
          <div className="mag-strip" style={{ maxWidth: PAGE_MAX, margin: '0 auto', padding: '0 20px', height: '100%',
                        boxSizing: 'border-box', display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between', gap: 12, whiteSpace: 'nowrap',
                        fontFamily: 'var(--font-mono)', overflow: 'hidden' }}>
            {kpiStrip()}
          </div>
        </div>
      )}

      {/* MOBILE keeps the slide-up sheet: a phone has no room for a rail, and
          one column already is a reading order. */}
      {isMobile && (
        <aside style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60, height: '52vh', overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', background: 'var(--paper)', borderRadius: '16px 16px 0 0', borderTop: '2px solid var(--accent)', padding: '0 18px 24px', transform: sheetOpen ? 'translateY(0)' : 'translateY(110%)', transition: 'transform 0.28s ease', boxShadow: '0 -8px 30px rgba(0,0,0,0.22)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 1, background: 'var(--paper)', padding: '12px 0 10px', borderBottom: '1px solid var(--rule)' }}>
            <span style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6 }}>Scenario</span>
            <button onClick={() => setSheetOpen(false)} style={{ font: '600 12px var(--font-mono)', color: 'var(--accent)', background: 'transparent', border: '1px solid var(--rule-strong)', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>Done</button>
          </div>
          <div style={{ paddingTop: 14 }}>{plannerControls}</div>
        </aside>
      )}

      {/* DESKTOP: every setting in a rail on the left, in two sections, and
          every result to its right. The rail pins under the nav and the strip
          and scrolls by itself when it is taller than the window. */}
      {isMobile ? results : (
        <div style={{ display: 'grid', gridTemplateColumns: 'clamp(272px, 23vw, 330px) minmax(0, 1fr)',
                      gap: 16, alignItems: 'start' }}>
          <aside ref={railRef} aria-label="Scenario settings"
            style={{ position: 'sticky', top: NAV_HEIGHT + STRIP_HEIGHT + 8,
                     maxHeight: `calc(100vh - ${NAV_HEIGHT + STRIP_HEIGHT + 20}px)`,
                     overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain',
                     border: '1px solid var(--rule)', borderRadius: 8, background: 'var(--paper)' }}>
            {railHead('planner', 0, 'Planner', 'what the least-cost plan is solved for')}
            <div data-rail="planner" style={{ padding: '10px 12px 12px' }}>{plannerControls}</div>
            {railHead('actor', 1, 'Actor', 'what a firm deciding to build faces')}
            <div data-rail="actor" style={{ padding: '10px 12px 12px' }}>
              {actorControls(true)}
              <p style={{ fontSize: 10.5, opacity: 0.6, lineHeight: 1.4, margin: '8px 0 0' }}>
                The premium a plant keeps and the US cost disadvantage are set stage by
                stage, by dragging the markers on the bankability frontier.
              </p>
            </div>
          </aside>
          {results}
        </div>
      )}

      {/* Mobile: a live result chip + a button that opens the scenario controls as a
          slide-up sheet (so the controls never overlay the plots). */}
      {isMobile && (
        <>
          {/* No dark backdrop: the half-height sheet leaves the upper screen showing a
              live chart that reacts as you drag, which is the point on mobile. */}
          {!sheetOpen && (
            <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 16px', background: 'var(--paper)', borderTop: '1px solid var(--rule-strong)', boxShadow: '0 -4px 16px rgba(0,0,0,0.12)' }}>
              {/* Label, then the number as a chip, the same way on both rows, so
                  the two figures line up and read as a pair. */}
              <span style={{ display: 'grid', gridTemplateColumns: 'auto auto', alignItems: 'center',
                             gap: '3px 8px', fontSize: 11, lineHeight: 1.2, minWidth: 0 }}>
                {([
                  ['Trade Risk Index:', tri.toFixed(2), riskColor(tri), 'var(--risk-chip-bg)'],
                  ['US cost, 2026–2035:', musd2(usCostReal), 'var(--ink)', 'var(--paper-2)'],
                  // Unmet demand is the first thing a restriction costs, and a bill that
                  // does not move when a lever is pulled often means demand went unserved.
                  ['Unmet US demand:', `${usUnmet.toFixed(1)} kt`, usUnmet > 0.05 ? WORSE : 'var(--ink)', 'var(--paper-2)'],
                ] as const).map(([label, value, color, background]) => (
                  <Fragment key={label}>
                    <span style={{ opacity: 0.6, whiteSpace: 'nowrap' }}>{label}</span>
                    <b style={{ justifySelf: 'start', font: '600 11px var(--font-mono)',
                                color: settled ? color : 'var(--ink-3)',
                                background: settled ? background : 'var(--paper-2)',
                                padding: '1px 7px', borderRadius: 6, border: '1px solid var(--rule)',
                                whiteSpace: 'nowrap' }}>{settled ? value : '…'}</b>
                  </Fragment>
                ))}
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
        .mag-strip{ font-size:10.5px; }
        @media (max-width: 1180px){ .mag-strip{ font-size:9.5px; } }
        .steer-light-bg, .steer-dark-bg{ height:18px !important; width:auto !important; max-width:none !important; }
        .steer-light-bg{ display:block; }
        .steer-dark-bg{ display:none; }
        [data-theme="dark"] .steer-light-bg{ display:none !important; }
        [data-theme="dark"] .steer-dark-bg{ display:block !important; }
      `}</style>
    </div>
  );
}
