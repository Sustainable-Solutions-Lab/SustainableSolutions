/**
 * What the hurdle rate is made of, and what takes it down.
 *
 * The frontier asks "at what premium and cost does this clear", and the answer
 * depends on the rate the cash flows are discounted at. That rate has parts:
 *
 *   the planner's rate     what the least-cost plan itself discounts at
 * + a risk premium         what a private developer demands on top
 * - what an instrument removes   an offtake, a price floor or a guarantee
 *                                takes away part of the PREMIUM, never the base
 *
 * Collapsed, which is how it starts, this is the rate and nothing else. Open,
 * the bar shows the parts and the controls sit in three groups, by what they
 * do: raise the rate, lower it, or raise the COST of the plant and leave the
 * rate alone. The last group is first-of-a-kind capital, which readers took
 * for a part of the rate because it sat among them: it moves the frontier and
 * not the number, and the grouping is there to say why.
 *
 * Reliefs do not stack: a project whose volume is already contracted does not
 * become twice as safe because a floor also covers it, so the largest single
 * relief is the one that counts. An instrument that is switched on and changes
 * nothing, because another removes more or because the scenario has no floor
 * for it to act through, says so under its slider, in words. It is not greyed
 * out: every slider on the page looks the same, whatever it can do just now.
 */
import { useState, type ReactNode } from 'react';
import Slider from './Slider';
import { PLANNER_RATE, hurdleRate, instrumentRelief, floorCovers,
         RELIEF_DEFAULTS } from './projectFinance';

const FLOOR_INTERFACE = 'magnet';
const INSTRUMENTS = [
  { key: 'offtake', label: 'Offtake agreement',
    hint: 'A committed buyer removes volume risk, the largest part of the premium a first US plant pays. Costs the public nothing unless the buyer walks. The share it removes is a judgement, not a measurement.' },
  { key: 'floor', label: 'Price floor',
    hint: 'How much of the premium a full price floor removes. What reaches a project is this times how far the floor is set in the scenario, and only for the stages the floor covers: a floor on magnets does nothing for a separation plant.' },
  { key: 'guarantee', label: 'Loan guarantee',
    hint: 'Public credit support. At 100% the project is financed at the planner’s rate outright. A cost subsidy is absent on purpose: it makes a project cheaper in every state of the world, including the ones where it fails, so it removes no risk.' },
] as const;
type Key = typeof INSTRUMENTS[number]['key'];

const LABEL: Record<string, string> = {
  mining: 'mining', separation: 'separation', alloy: 'alloying',
  magnet: 'magnets', recycling: 'recycling',
};
const PLANTS: Record<string, string> = {
  mining: 'mines', separation: 'separation plants', alloy: 'alloy plants',
  magnet: 'magnet plants', recycling: 'recycling plants',
};
const NAME: Record<Key, string> = {
  offtake: 'the offtake agreement', floor: 'the price floor', guarantee: 'the loan guarantee',
};
const RATE_MAX = 0.35;
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const list = (xs: string[]) =>
  (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? '');

export default function HurdleComponents({ rate, onRate, instruments, onInstruments, floorLevel,
                                           foakMult, onFoakMult, stages, rail = false }: {
  rate: number;
  onRate: (r: number) => void;
  instruments: Record<string, number>;
  onInstruments: (i: Record<string, number>) => void;
  floorLevel: number;
  foakMult: number;
  onFoakMult: (v: number) => void;
  /** Stages the plan asks the US to build: each can end at a different rate. */
  stages: string[];
  /** In the controls rail or the phone's sheet: one column, no rule above. */
  rail?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const premium = Math.max(0, rate - PLANNER_RATE);
  const reliefFor = (stage: string) => instrumentRelief(stage, {
    offtake: instruments.offtake, floorInterface: FLOOR_INTERFACE,
    floorRelief: instruments.floor, floorLevel, creditSupport: instruments.guarantee,
  });
  const effective = (stage: string) => PLANNER_RATE + (1 - reliefFor(stage)) * premium;
  const shown = stages.length ? stages : ['magnet'];
  // The stage the bar describes: the one the instruments help least, because
  // that is the rate the plan as a whole still has to clear.
  const worst = shown.reduce((a, s) => (effective(s) > effective(a) ? s : a), shown[0]);
  const relief = reliefFor(worst);
  const removed = relief * premium;
  const w = (v: number) => `${(v / RATE_MAX) * 100}%`;

  // What each instrument removes at a stage, on its own, and whether it is the
  // one that counts there.
  const covered = floorCovers(FLOOR_INTERFACE);
  const alone = (k: Key, stage: string): number =>
    k === 'offtake' ? (instruments.offtake ?? 0)
      : k === 'guarantee' ? (instruments.guarantee ?? 0)
        : covered.includes(stage) ? (instruments.floor ?? 0) * floorLevel : 0;
  const reach = (k: Key) => (k === 'floor' ? shown.filter((s) => covered.includes(s)) : shown);
  /** The instrument that outdoes this one at every stage it reaches, if any. */
  const outdoneBy = (k: Key): Key | null => {
    const at = reach(k);
    if (!at.length || at.every((s) => alone(k, s) <= 1e-9)) return null;
    const others = INSTRUMENTS.map((i) => i.key).filter((o) => o !== k);
    const beaten = at.every((s) => others.some((o) => alone(o, s) > alone(k, s) + 1e-9));
    if (!beaten) return null;
    return others.reduce((a, o) => (alone(o, at[0]) > alone(a, at[0]) ? o : a), others[0]);
  };
  const stateOf = (k: Key): { inert: boolean; text: string } | null => {
    if (k === 'floor') {
      const where = `Covers ${list(covered.map((s) => PLANTS[s] ?? s))} only.`;
      if (floorLevel <= 1e-9) {
        return { inert: true, text: `The price floor is off in this scenario. It is set by `
          + `“US price floor on China imports” in the scenario controls; this is the share of `
          + `the premium a full floor would remove. ${where}` };
      }
      if (!reach('floor').length) {
        return { inert: true, text: `${where} The plan asks for none here.` };
      }
      const by = outdoneBy('floor');
      return { inert: !!by, text: `The scenario’s floor is set at ${pct(floorLevel, 0)}, so `
        + `${pct((instruments.floor ?? 0) * floorLevel, 0)} of the premium is removed. ${where}`
        + (by ? ` ${NAME[by][0].toUpperCase()}${NAME[by].slice(1)} already removes more, and only the largest counts.` : '') };
    }
    const by = outdoneBy(k);
    return by ? { inert: true, text: `${NAME[by][0].toUpperCase()}${NAME[by].slice(1)} already removes more, and only the largest counts.` } : null;
  };

  const slider = (label: string, hint: string, value: number, min: number, max: number,
                  step: number, set: (v: number) => void, read: (v: number) => string,
                  aside?: string, state?: { inert: boolean; text: string } | null) => (
    <Slider label={label} desc={hint} value={value} min={min} max={max} step={step}
      onChange={set} fmt={read} aside={aside}
      note={state ? (state.inert ? <><b>No effect now.</b> {state.text}</> : state.text) : undefined} />
  );
  const group = (title: string, children: ReactNode) => (
    <div style={{ marginTop: 12 }}>
      <div style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: 'var(--cardinal)', opacity: 0.85,
                    margin: '0 0 5px' }}>
        {title}
      </div>
      <div className="hurdle-grid">{children}</div>
    </div>
  );

  return (
    <div style={rail ? undefined
      : { marginTop: 14, borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
      <style>{`
        .hurdle-grid { display: grid; gap: 10px 24px; grid-template-columns: 1fr; align-items: start; }
        .hurdle-wide { grid-column: auto; }
        ${rail ? '' : `@media (min-width: 720px) {
          .hurdle-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .hurdle-wide { grid-column: span 2; }
        }`}
        .hurdle-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      `}</style>
      <button type="button" className="hurdle-toggle" aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', width: '100%',
                 background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--ink)',
                 textAlign: 'left' }}>
        <span style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.06em',
                       textTransform: 'uppercase', opacity: 0.55 }}>
          Hurdle rate
        </span>
        <span style={{ font: '600 13px var(--font-mono)' }}>{pct(effective(worst))}</span>
        <span style={{ fontSize: 11, color: 'var(--accent)' }}>
          <span aria-hidden="true" style={{ display: 'inline-block', width: 12 }}>{open ? '▾' : '▸'}</span>
          {open ? 'hide breakdown' : 'see breakdown'}
        </span>
      </button>

      {open && (<>
      <p style={{ fontSize: 11, opacity: 0.7, margin: '8px 0 0', lineHeight: 1.45 }}>
        The planner’s {pct(PLANNER_RATE, 0)}, plus a risk premium of {(premium * 100).toFixed(1)} points
        {removed > 1e-9
          ? <>, less {(removed * 100).toFixed(1)} removed by an instrument</>
          : <>; no instrument is removing any of it</>}.
      </p>

      {/* The rate as a bar: what the planner charges, what risk still adds, and
          what an instrument has taken away. */}
      <div aria-hidden="true" style={{ position: 'relative', height: 14, marginTop: 8, display: 'flex', gap: 2,
                    background: 'var(--paper-2)', borderRadius: 2 }}>
        <div title={`The planner's rate, ${pct(PLANNER_RATE, 0)}`}
          style={{ width: w(PLANNER_RATE), background: 'var(--ink-3)', opacity: 0.45,
                   borderRadius: '2px 0 0 2px' }} />
        <div title={`Risk premium still charged, ${((premium - removed) * 100).toFixed(1)} points`}
          style={{ width: w(premium - removed), background: '#F46D43' }} />
        {removed > 1e-9 && (
          <div title={`Removed by an instrument, ${(removed * 100).toFixed(1)} points`}
            style={{ width: w(removed), boxSizing: 'border-box',
                     border: '1px solid #F46D43', borderRadius: '0 2px 2px 0',
                     background: 'repeating-linear-gradient(45deg, transparent 0 3px, rgba(244,109,67,0.35) 3px 5px)' }} />
        )}
      </div>
      {/* the bar's scale: where the planner's rate ends, where the firm's does */}
      <div aria-hidden="true" style={{ position: 'relative', height: 12,
                    font: '400 8.5px var(--font-mono)', opacity: 0.55 }}>
        {[[0, '0%'], [PLANNER_RATE, pct(PLANNER_RATE, 0)], [rate, pct(rate)], [RATE_MAX, pct(RATE_MAX, 0)]]
          .filter(([v], i, all) => all.findIndex(([u]) => Math.abs((u as number) - (v as number)) < 0.012) === i)
          .map(([v, t]) => (
            <span key={t as string} style={{ position: 'absolute', top: 2, left: w(v as number),
                          transform: v === 0 ? 'none' : v === RATE_MAX ? 'translateX(-100%)' : 'translateX(-50%)' }}>
              {t}
            </span>
          ))}
      </div>
      <div style={{ display: 'flex', gap: '4px 14px', flexWrap: 'wrap', marginTop: 5,
                    font: '400 10px var(--font-mono)', opacity: 0.65 }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 8,
                             background: 'var(--ink-3)', opacity: 0.45 }} /> planner&rsquo;s rate</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 8,
                             background: '#F46D43' }} /> risk premium charged</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 8, boxSizing: 'border-box',
                             border: '1px solid #F46D43' }} /> removed by an instrument</span>
        {shown.length > 1 && (
          <span style={{ marginLeft: 'auto' }}>
            {shown.map((s) => `${LABEL[s]} ${pct(effective(s))}`).join(' · ')}
          </span>
        )}
      </div>

      {group('Raises the rate', <>
        {slider('Risk premium',
          'What a private developer demands on top of the planner’s rate before committing: its cost of capital including the risk of the project. This is the only thing that separates a firm from the planner, which discounts the same cash flows at the planner’s rate.',
          premium, 0, RATE_MAX - PLANNER_RATE, 0.005,
          (v) => onRate(PLANNER_RATE + v), (v) => `${(v * 100).toFixed(1)} points`,
          Math.abs(rate - hurdleRate('USA')) < 1e-9 ? 'US default' : undefined)}
        <p className="hurdle-wide" style={{ fontSize: 10.5, opacity: 0.65, lineHeight: 1.45, margin: 0 }}>
          What a private developer demands on top of the planner&rsquo;s rate before it
          commits. It is the one thing that separates a firm from the planner, which
          discounts the same cash flows at {pct(PLANNER_RATE, 0)}.
        </p>
      </>)}

      {group('Lowers the rate', INSTRUMENTS.map((i) => {
        const v = instruments[i.key] ?? 0;
        return (
          <div key={i.key} style={{ minWidth: 0 }}>
            {slider(i.label, i.hint, v, 0, 1, 0.05,
              (x) => onInstruments({ ...instruments, [i.key]: x }),
              (x) => `removes ${(x * 100).toFixed(0)}%`, undefined, stateOf(i.key))}
          </div>
        );
      }))}
      <p style={{ fontSize: 10.5, opacity: 0.55, margin: '8px 0 0', lineHeight: 1.45, maxWidth: 700 }}>
        An instrument removes part of the risk premium, never the planner&rsquo;s rate
        beneath it, and the largest one is the one that counts: they do not add up.
        The defaults ({(RELIEF_DEFAULTS.offtake * 100).toFixed(0)}% for an offtake,{' '}
        {(RELIEF_DEFAULTS.floor * 100).toFixed(0)}% for a floor) are judgements about
        ordering, not measurements.
      </p>

      {group('Raises the cost, not the rate', <>
        {slider('First-of-a-kind capital',
          'The extra capital cost of being first, on top of the steady cost disadvantage on the frontier: unproven process, no local supply chain, learning still ahead. Capital only. 0 builds like an established plant, 1 is as calibrated, 2 is twice that penalty.',
          foakMult, 0, 2.5, 0.05, onFoakMult, (v) => `${v.toFixed(2)}×`,
          Math.abs(foakMult - 1) < 1e-9 ? 'as calibrated' : undefined)}
        <p className="hurdle-wide" style={{ fontSize: 10.5, opacity: 0.65, lineHeight: 1.45, margin: 0 }}>
          The extra capital a first plant costs to build. It is a cost, not a part of
          the rate: it makes the plant dearer, which moves the bankability frontier and
          the verdicts above, and leaves the rate its cash flows are discounted at where
          it is. 0 builds like an established plant, 1 is as calibrated.
        </p>
      </>)}
      </>)}
    </div>
  );
}
