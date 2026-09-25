/**
 * The thrifting ceiling, priced as a research program.
 *
 * Replaces a free switch. The switch answered "would a higher ceiling help",
 * which is not in doubt; this answers "how much may we spend reaching it". The
 * uncertain parameter is therefore the R&D cost, and the model supplies the
 * value — see rdValue.ts for what is and is not counted.
 */
import { valueRd, type RdCase, type CostFn } from './rdValue';
import { ABATEMENT_CEILINGS, type Scenario } from './interp';

const musd = (v: number) => `${v >= 0 ? '' : '−'}$${(Math.abs(v) / 1000).toFixed(2)}B`;
const GOOD = 'var(--brand-green)';
const BAD = '#D53E4F';

export default function RdValuePanel({ base, unlocked, unlock, onUnlock,
                                       costPerKg, onCostPerKg, realCost, loading }: {
  base: Scenario;
  unlocked: Scenario;
  unlock: number;
  onUnlock: (u: number) => void;
  costPerKg: number;
  onCostPerKg: (c: number) => void;
  realCost: CostFn;
  loading?: boolean;
}) {
  const r: RdCase = valueRd(base, unlocked, {
    costPerKg, unlock,
    ceilingFrom: ABATEMENT_CEILINGS.baseline,
    ceilingTo: ABATEMENT_CEILINGS.aspirational,
    realCost,
  });
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
        sector take a weaker magnet. Set what that research costs per kg of Dy/Tb it
        makes designable-out, and the model returns whether it pays for itself.
      </p>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center',
                    padding: '10px 12px', marginBottom: 14, borderRadius: 8,
                    background: 'var(--paper-2)', border: '1px solid var(--rule)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
          <span style={{ whiteSpace: 'nowrap' }}>Barrier removed</span>
          <input type="range" min={0} max={1} step={0.05} value={unlock}
            onChange={(e) => onUnlock(parseFloat(e.target.value))}
            style={{ width: 130, accentColor: 'var(--accent)' }} />
          <span style={{ font: '600 11px var(--font-mono)', minWidth: 70 }}>
            {(r.ceilingFrom * 100).toFixed(0)}→{(r.ceilingTo * 100).toFixed(0)}%
          </span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
          <span style={{ whiteSpace: 'nowrap' }}>R&amp;D cost</span>
          <input type="range" min={0} max={400} step={5} value={costPerKg}
            onChange={(e) => onCostPerKg(parseFloat(e.target.value))}
            style={{ width: 130, accentColor: 'var(--accent)' }} />
          <span style={{ font: '600 11px var(--font-mono)', minWidth: 62 }}>
            ${costPerKg.toFixed(0)}/kg
          </span>
        </label>
        {loading && <span style={{ fontSize: 10.5, opacity: 0.55 }}>loading grid…</span>}
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
          <span>Move the barrier slider to price a program.</span>
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
