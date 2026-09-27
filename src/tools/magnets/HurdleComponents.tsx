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
 * the bar shows the parts and each has its own control. Reliefs do not stack: a project whose volume is already
 * contracted does not become twice as safe because a floor also covers it, so
 * the largest single relief is the one that counts.
 */
import { useState } from 'react';
import { PLANNER_RATE, hurdleRate, instrumentRelief, RELIEF_DEFAULTS } from './projectFinance';

const INSTRUMENTS = [
  { key: 'offtake', label: 'Offtake agreement',
    hint: 'A committed buyer removes volume risk, the largest part of the premium a first US plant pays. Costs the public nothing unless the buyer walks. The share it removes is a judgement, not a measurement.' },
  { key: 'floor', label: 'Price floor',
    hint: 'How much of the premium a full price floor removes. What reaches a project is this times how far the floor is set in the scenario above, and only for the stages the floor covers: a floor on magnets does nothing for a separation plant.' },
  { key: 'guarantee', label: 'Loan guarantee',
    hint: 'Public credit support. At 100% the project is financed at the planner’s rate outright. A cost subsidy is absent on purpose: it makes a project cheaper in every state of the world, including the ones where it fails, so it removes no risk.' },
] as const;

const LABEL: Record<string, string> = {
  mining: 'mining', separation: 'separation', alloy: 'alloying',
  magnet: 'magnets', recycling: 'recycling',
};
const RATE_MAX = 0.35;
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;

export default function HurdleComponents({ rate, onRate, instruments, onInstruments, floorLevel,
                                           foakMult, onFoakMult, stages }: {
  rate: number;
  onRate: (r: number) => void;
  instruments: Record<string, number>;
  onInstruments: (i: Record<string, number>) => void;
  floorLevel: number;
  foakMult: number;
  onFoakMult: (v: number) => void;
  /** Stages the plan asks the US to build: each can end at a different rate. */
  stages: string[];
}) {
  const [open, setOpen] = useState(false);
  const premium = Math.max(0, rate - PLANNER_RATE);
  const reliefFor = (stage: string) => instrumentRelief(stage, {
    offtake: instruments.offtake, floorInterface: 'magnet',
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

  const slider = (label: string, hint: string, value: number, min: number, max: number,
                  step: number, set: (v: number) => void, read: string, note?: string) => (
    <label title={hint} style={{ display: 'block', fontSize: 11.5, minWidth: 0 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span>{label}</span>
        <span style={{ font: '600 11px var(--font-mono)' }}>
          {read}
          {note && <span style={{ opacity: 0.55, fontWeight: 400 }}> {note}</span>}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => set(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)', margin: '4px 0 0' }} />
    </label>
  );

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
      <style>{`
        .hurdle-grid { display: grid; gap: 14px 24px; grid-template-columns: 1fr; }
        @media (min-width: 720px) { .hurdle-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        .hurdle-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      `}</style>
      <button type="button" className="hurdle-toggle" aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', width: '100%',
                 background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--ink)',
                 textAlign: 'left' }}>
        <span style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.06em',
                       textTransform: 'uppercase', opacity: 0.55 }}>
          <span aria-hidden="true" style={{ display: 'inline-block', width: 12 }}>{open ? '▾' : '▸'}</span>
          Hurdle rate
        </span>
        <span style={{ font: '600 13px var(--font-mono)' }}>{pct(effective(worst))}</span>
        <span style={{ fontSize: 11, opacity: 0.65 }}>
          {open
            ? `planner ${pct(PLANNER_RATE, 0)} + risk premium ${(premium * 100).toFixed(1)} points`
              + (removed > 1e-9
                ? ` − ${(removed * 100).toFixed(1)} removed by an instrument`
                : ' · no instrument applied')
            : 'show what it is made of'}
        </span>
      </button>

      {open && (<>

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
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 5,
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

        <div style={{ marginTop: 14 }}>
          <div className="hurdle-grid">
            {slider('Risk premium',
              'What a private developer demands on top of the planner’s rate before committing: its cost of capital including the risk of the project. This is the only thing that separates a firm from the planner, which discounts the same cash flows at the planner’s rate.',
              premium, 0, RATE_MAX - PLANNER_RATE, 0.005,
              (v) => onRate(PLANNER_RATE + v), `${(premium * 100).toFixed(1)} points`,
              Math.abs(rate - hurdleRate('USA')) < 1e-9 ? 'US default' : undefined)}
            {INSTRUMENTS.map((i) => {
              const v = instruments[i.key] ?? 0;
              const reaches = i.key === 'floor' ? v * floorLevel : v;
              return (
                <div key={i.key}>
                  {slider(i.label, i.hint, v, 0, 1, 0.05,
                    (x) => onInstruments({ ...instruments, [i.key]: x }),
                    `removes ${(v * 100).toFixed(0)}%`,
                    i.key === 'floor' && Math.abs(reaches - v) > 1e-9
                      ? `(${(reaches * 100).toFixed(0)}% at this floor)` : undefined)}
                </div>
              );
            })}
            {slider('First-of-a-kind capital',
              'The extra capital cost of being first, on top of the steady cost disadvantage on the frontier: unproven process, no local supply chain, learning still ahead. Capital only. 0 builds like an established plant, 1 is as calibrated, 2 is twice that penalty.',
              foakMult, 0, 2.5, 0.05, onFoakMult, `${foakMult.toFixed(2)}×`,
              Math.abs(foakMult - 1) < 1e-9 ? 'as calibrated' : undefined)}
          </div>
          <p style={{ fontSize: 10.5, opacity: 0.55, margin: '12px 0 0', lineHeight: 1.45, maxWidth: 700 }}>
            An instrument removes part of the risk premium, never the planner&rsquo;s rate
            beneath it, and the largest one is the one that counts: they do not add up.
            The defaults ({(RELIEF_DEFAULTS.offtake * 100).toFixed(0)}% for an offtake,{' '}
            {(RELIEF_DEFAULTS.floor * 100).toFixed(0)}% for a floor) are judgements about
            ordering, not measurements. A hurdle rate is a discount rate and a provenance
            premium is a price, so they act on opposite sides of the same sum.
          </p>
        </div>
      </>)}
    </div>
  );
}
