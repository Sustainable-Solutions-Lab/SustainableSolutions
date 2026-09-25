/**
 * What the planner asks for, and what a firm would actually fund.
 *
 * Deliberately NOT part of the Sankey. Ghosting planner ribbons behind actor
 * ones needs rerouted flows, which only a re-solve produces, and the
 * unachievable case has no flow solution at all — any Sankey drawn for it would
 * be a plausible-looking fabrication. Stage-resolved capacity needs neither.
 *
 *   STIPPLED   incumbent — already built, sunk, never judged
 *   OUTLINE    NEW capacity the planner asked for
 *   FILL       the portion of that new build which clears a firm's hurdle
 *
 * Incumbent is shown even though the screen never evaluates it: a bar of new
 * build alone would not sum to the Sankey's stage totals and someone would
 * rightly ask why. Stipple carries the distinction the screen actually makes —
 * sunk capital faces no investment decision, so it is present but not assessed.
 * A plain fill would imply we had assessed plants we have not.
 */
import { Pickaxe, FlaskConical, Flame, Magnet, Recycle } from 'lucide-react';
import { screen, PRICE_WORLDS, HAS_META, type Buildout, type Verdict } from './projectFinance';

const STAGES = ['mining', 'separation', 'alloy', 'magnet', 'recycling'] as const;
const LABEL: Record<string, string> = {
  mining: 'Mining', separation: 'Separation', alloy: 'Alloying',
  magnet: 'Magnet', recycling: 'Recycling',
};
const ICON: Record<string, JSX.Element> = {
  mining: <Pickaxe size={14} strokeWidth={1.5} />,
  separation: <FlaskConical size={14} strokeWidth={1.5} />,
  alloy: <Flame size={14} strokeWidth={1.5} />,
  magnet: <Magnet size={14} strokeWidth={1.5} />,
  recycling: <Recycle size={14} strokeWidth={1.5} />,
};
// Incumbent texture. Hatching already means unmet demand on the pathway charts,
// so stipple is reused here — a different chart in a different register, which
// reads as "marked out" rather than as a second meaning for one texture.
const STIPPLE = {
  backgroundImage: 'radial-gradient(var(--ink-3) 0.8px, transparent 1.1px)',
  backgroundSize: '4px 4px',
};

export default function CapacityPanel({ buildout, incumbent, priceWorld, onPriceWorld }: {
  buildout: Buildout[] | undefined;
  incumbent: Record<string, number>;
  priceWorld: string;
  onPriceWorld: (w: string) => void;
}) {
  if (!buildout) {
    return (
      <section style={{ border: '1px dashed var(--rule-strong)', borderRadius: 10,
                        padding: '14px 18px', background: 'var(--paper)', marginTop: 22 }}>
        <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em',
                     textTransform: 'uppercase', opacity: 0.6, margin: '0 0 6px' }}>
          Would it actually be built
        </h2>
        <p style={{ fontSize: 11.5, opacity: 0.7, margin: 0, maxWidth: 620, lineHeight: 1.45 }}>
          Waiting on a grid that carries the planner build-out. The model emits it; this
          panel appears when a regrid carrying it is deployed.
        </p>
      </section>
    );
  }

  const us = buildout.filter((b) => b.r === 'USA');
  const verdicts: Verdict[] = screen(us, PRICE_WORLDS[priceWorld] ?? PRICE_WORLDS.neutral);
  const byStage = (s: string) => verdicts.filter((v) => v.stage === s);
  const maxKt = Math.max(1, ...STAGES.map((s) =>
    (incumbent[s] ?? 0) + byStage(s).reduce((a, v) => a + v.newKt, 0)));

  return (
    <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20,
                      background: 'var(--paper)', marginTop: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em',
                     textTransform: 'uppercase', opacity: 0.6, margin: 0 }}>
          Would it actually be built
        </h2>
        <div style={{ display: 'flex', gap: 5 }}>
          {Object.keys(PRICE_WORLDS).map((w) => (
            <button key={w} onClick={() => onPriceWorld(w)}
              title="Prices are a free control here: the screen is arithmetic, not a solve"
              style={{ font: '600 10px var(--font-mono)', padding: '3px 8px', borderRadius: 5,
                       cursor: 'pointer',
                       border: `1px solid ${priceWorld === w ? 'var(--accent)' : 'var(--rule-strong)'}`,
                       background: priceWorld === w ? 'var(--accent)' : 'transparent',
                       color: priceWorld === w ? 'var(--paper)' : 'var(--ink)' }}>
              {w.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 11.5, opacity: 0.7, margin: '0 0 14px', maxWidth: 640, lineHeight: 1.45 }}>
        US capacity the least-cost planner calls for, against what clears a private hurdle
        rate at these prices. An outline with nothing in it is capacity the plan depends on
        that no firm would fund.
      </p>

      {STAGES.map((s) => {
        const vs = byStage(s);
        const inc = incumbent[s] ?? 0;
        const asked = vs.reduce((a, v) => a + v.newKt, 0);
        const funded = vs.filter((v) => v.funded).reduce((a, v) => a + v.newKt, 0);
        if (inc <= 0 && asked <= 0) return null;
        const pc = (v: number) => `${(v / maxKt) * 100}%`;
        return (
          <div key={s} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, marginBottom: 3 }}>
              <span style={{ opacity: 0.7, display: 'flex' }}>{ICON[s]}</span>
              <span>{LABEL[s]}</span>
              {asked > 0 && (
                <span style={{ font: '400 10.5px var(--font-mono)', opacity: 0.6 }}>
                  {funded.toFixed(1)} of {asked.toFixed(1)} kt new funded
                </span>
              )}
            </div>
            <div style={{ position: 'relative', height: 16, background: 'var(--paper-2)',
                          border: '1px solid var(--rule)', borderRadius: 3 }}>
              {/* sunk */}
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pc(inc),
                            ...STIPPLE, borderRight: inc > 0 ? '1px solid var(--rule-strong)' : 'none' }} />
              {/* asked for: outline */}
              <div style={{ position: 'absolute', left: pc(inc), top: 0, bottom: 0, width: pc(asked),
                            border: '1.5px dashed var(--accent)', borderRadius: 2 }} />
              {/* funded: fill */}
              <div style={{ position: 'absolute', left: pc(inc), top: 0, bottom: 0, width: pc(funded),
                            background: 'var(--accent)', opacity: 0.55, borderRadius: 2 }} />
            </div>
            {/* Name the projects, not just the tonnage: "Ucore does not clear" is
                actionable where "separation is short 12 kt" is not. */}
            {vs.length > 0 && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 3,
                            font: '400 9.5px var(--font-mono)', opacity: 0.65 }}>
                {vs.map((v) => (
                  <span key={v.facility} title={`NPV ${v.npv.toFixed(0)} $M · ${v.leadYears} yr build · breakeven ${v.breakeven.toFixed(1)} $/kg`}>
                    <span style={{ color: v.funded ? 'var(--accent)' : 'var(--ink-3)' }}>
                      {v.funded ? '●' : '○'}
                    </span>{' '}{v.facility}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12,
                    font: '400 10px var(--font-mono)', opacity: 0.65 }}>
        <span><span style={{ display: 'inline-block', width: 12, height: 8, ...STIPPLE,
                             border: '1px solid var(--rule)' }} /> already built (sunk)</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 8,
                             border: '1.5px dashed var(--accent)' }} /> planner asks for</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 8,
                             background: 'var(--accent)', opacity: 0.55 }} /> a firm would fund</span>
        {!HAS_META && <span style={{ opacity: 0.5 }}>· constants inline pending regrid</span>}
      </div>
    </section>
  );
}
