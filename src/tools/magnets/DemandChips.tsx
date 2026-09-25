/**
 * Demand, collapsed to one line.
 *
 * The demand builder is the most detailed control in the tool and it was the
 * first thing on the page, which put a sector-by-sector modelling exercise in
 * front of every visitor before they reached a single result. Demand is an
 * assumption about the world, not a US policy choice, so it belongs as one
 * choice with the detail available on request.
 *
 * The three chips are the IEA scenarios, ordered by how much magnet demand they
 * imply. Each shows its resulting demand multiplier so the choice is legible
 * rather than a bare label. "See sectoral detail" opens the per-sector breakdown, and any hand-set
 * scenario there is reflected back here as a fourth, custom state.
 */
import { SCENARIO_LABEL, allScenario, demandSummary, DEFAULT_LEVERS,
         type Levers, type PerSectorScenario } from './demand';

/** Ordered low -> high by the magnet demand each implies. */
const ORDER = ['STEPS', 'APS', 'NZE'] as const;
const BLURB: Record<string, string> = {
  STEPS: 'Today’s policies continue',
  APS: 'Governments meet stated targets',
  NZE: 'Net zero by 2050',
};

/** Which chip, if any, the current state corresponds to: a scenario applied to
 *  every sector with no demand levers pulled. Anything else is "custom". */
function activeChip(scenario: PerSectorScenario, lv: Levers): string | null {
  const levered = JSON.stringify(lv) !== JSON.stringify(DEFAULT_LEVERS);
  if (levered) return null;
  const vals = Object.values(scenario);
  return vals.every((v) => v === vals[0]) ? vals[0] : null;
}

export default function DemandChips({ scenario, setScenario, lv, setLv, open, setOpen }: {
  scenario: PerSectorScenario; setScenario: (s: PerSectorScenario) => void;
  lv: Levers; setLv: (l: Levers) => void;
  open: boolean; setOpen: (o: boolean) => void;
}) {
  const active = activeChip(scenario, lv);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.55 }}>
        Demand
      </span>
      {ORDER.map((sc) => {
        const on = active === sc;
        const sum_ = demandSummary(allScenario(sc), DEFAULT_LEVERS);
        const mult = sum_.demand_scale;
        return (
          <button key={sc} title={BLURB[sc]}
            onClick={() => { setScenario(allScenario(sc)); setLv(DEFAULT_LEVERS); }}
            style={{ font: '600 11px var(--font-mono)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                     border: `1px solid ${on ? 'var(--accent)' : 'var(--rule-strong)'}`,
                     background: on ? 'var(--accent)' : 'transparent',
                     color: on ? 'var(--paper)' : 'var(--ink)' }}>
            {SCENARIO_LABEL[sc] ?? sc}
            <span style={{ opacity: on ? 0.75 : 0.5, marginLeft: 6, fontWeight: 400 }}>
              {mult.toFixed(2)}× vol · {sum_.dytb_intensity.toFixed(2)}× Dy/Tb
            </span>
          </button>
        );
      })}
      {active === null && (
        <span title="Per-sector scenarios or demand levers have been hand-tuned below."
          style={{ font: '600 11px var(--font-mono)', padding: '4px 10px', borderRadius: 6,
                   border: '1px solid var(--accent)', background: 'var(--accent)', color: 'var(--paper)' }}>
          Custom
        </span>
      )}
      <button onClick={() => setOpen(!open)}
        title={open ? 'Hide the per-sector detail' : 'Show how the scenario breaks down by end-use sector'}
        style={{ font: '500 10.5px var(--font-mono)', padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
                 border: '1px solid var(--rule)', background: 'transparent', color: 'var(--ink)', opacity: 0.75 }}>
        {open ? '− sectoral detail' : '+ see sectoral detail'}
      </button>
    </div>
  );
}
