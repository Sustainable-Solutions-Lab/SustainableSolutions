/**
 * The thrifting ceiling, priced as a research program.
 *
 * Replaces a free switch. The switch answered "would a higher ceiling help",
 * which is not in doubt; this answers "how much may we spend reaching it". The
 * uncertain parameter is therefore the R&D cost, and the model supplies the
 * value — see rdValue.ts for what is and is not counted.
 */
import type { RdCase } from './rdValue';

const musd = (v: number) => `${v >= 0 ? '' : '−'}$${(Math.abs(v) / 1000).toFixed(2)}B`;
const GOOD = 'var(--brand-green)';
const BAD = '#D53E4F';

export default function RdValuePanel({ rd, funded, evaluated, costPerKg }: {
  /** The valuation the planner's decision rests on (deploy.chooseRd). */
  rd: RdCase;
  /** Whether the planner funds the program at the stated cost. */
  funded: boolean;
  /** False until the higher-ceiling cells are resident. */
  evaluated: boolean;
  costPerKg: number;
}) {
  const r = rd;
  const pays = r.net > 0;

  return (
    <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20,
                      background: 'var(--paper)', marginTop: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em',
                     textTransform: 'uppercase', opacity: 0.6, margin: 0 }}>
          What is the research worth
        </h2>
        <span style={{ font: '600 14px var(--font-mono)', color: pays ? GOOD : BAD }}>
          {musd(r.net)} <span style={{ opacity: 0.55, fontWeight: 400, color: 'var(--ink)' }}>net</span>
        </span>
      </div>
      <p style={{ fontSize: 11.5, opacity: 0.7, margin: '0 0 14px', maxWidth: 660, lineHeight: 1.45 }}>
        Thrifting harder is not free: someone has to fund the engineering that lets a
        sector take a weaker magnet. The cost of that research per kg of Dy/Tb it
        makes designable-out is set with the other intervention costs; this is the
        valuation behind the planner's decision to fund it or not.
      </p>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center',
                    padding: '10px 12px', marginBottom: 14, borderRadius: 8,
                    background: 'var(--paper-2)', border: '1px solid var(--rule)', fontSize: 11.5 }}>
        <span>
          <span style={{ opacity: 0.6 }}>Planner's decision at ${costPerKg}/kg: </span>
          <b style={{ color: !evaluated ? 'var(--ink-3)' : funded ? GOOD : BAD }}>
            {!evaluated ? 'evaluating' : funded ? 'fund it' : 'do not fund'}
          </b>
        </span>
        <span style={{ font: '600 11px var(--font-mono)', opacity: 0.8 }}>
          ceiling {(r.ceilingFrom * 100).toFixed(0)}→{(r.ceilingTo * 100).toFixed(0)}%
        </span>
        <span style={{ fontSize: 10.5, opacity: 0.55 }}>
          {evaluated ? 'set the R&D cost in the intervention costs above' : 'loading the higher-ceiling grid…'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: 12, marginBottom: 12 }}>
        {[
          { l: 'Capability unlocked', v: `${r.ktUnlocked.toFixed(1)} kt`, s: 'Dy/Tb newly designable-out' },
          { l: 'Actually designed out', v: `${r.ktAbated.toFixed(1)} kt`, s: 'what the optimizer takes up' },
          { l: 'US bill', v: musd(r.saving), s: 'saving at this ceiling', c: r.saving > 0 ? GOOD : BAD },
          { l: 'R&D bill', v: musd(-r.rdCost), s: `${r.ktUnlocked.toFixed(1)} kt × $${costPerKg}/kg` },
        ].map((k) => (
          <div key={k.l} style={{ border: '1px solid var(--rule)', borderRadius: 8, padding: '9px 11px' }}>
            <div style={{ font: '600 9.5px var(--font-mono)', letterSpacing: '0.06em',
                          textTransform: 'uppercase', opacity: 0.5, marginBottom: 3 }}>{k.l}</div>
            <div style={{ font: '600 15px var(--font-mono)', color: k.c ?? 'var(--ink)' }}>{k.v}</div>
            <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>{k.s}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11.5, lineHeight: 1.5, maxWidth: 680, paddingTop: 12,
                    borderTop: '1px solid var(--rule)' }}>
        {r.breakeven == null ? (
          <span>The research unlocks no capability in this scenario, so no price makes it pay.</span>
        ) : r.breakeven <= 0 ? (
          <>
            <strong>No price makes this pay here.</strong> At this restriction the extra
            thrifting the US takes up costs it more than the premium it avoids, so the
            US bill rises even before any research is paid for.
            {Math.abs(r.systemSaving) > 100 && (
              <> The rest of the world still gains {musd(r.systemSaving)}, which is the
                case for funding it — just not one the US supply bill will make.</>
            )}
          </>
        ) : (
          <>
            <strong>Breakeven ${r.breakeven.toFixed(0)}/kg</strong> of capability unlocked —
            research cheaper than that pays for itself out of the US supply bill alone.
            {' '}
            {r.breakeven < 50 && (
              <>That is a low bar to clear, and the reason is worth stating: the tranches
                a higher ceiling unlocks are the <em>expensive</em> ones — grade downshift
                and RE-free substitution, not grain-boundary diffusion — so the optimizer
                only buys them when the premium has already risen to meet their cost, and
                little surplus is left over.{' '}</>
            )}
            {Math.abs(r.systemSaving) > Math.abs(r.saving) * 1.5 && (
              <>The global saving is {musd(r.systemSaving)}, far above the US figure:
                most of the benefit of designing Dy/Tb out accrues outside the US, so this
                looks much better as world policy than as a US budget line.{' '}</>
            )}
            {r.unmetTo >= r.unmetFrom - 0.05 && r.unmetFrom > 0.05 && (
              <>It also does not touch the shortfall — unmet demand stays at{' '}
                {r.unmetTo.toFixed(1)} kt. Thrifting harder saves money; it does not
                close a ban-driven gap.</>
            )}
          </>
        )}
      </div>
    </section>
  );
}
