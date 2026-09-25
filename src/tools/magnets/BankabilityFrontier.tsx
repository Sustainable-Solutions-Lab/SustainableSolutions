/**
 * Where does US capacity stop being bankable?
 *
 * A single verdict at one calibration invites the reader to believe the
 * calibration. The honest object is the FRONTIER: sweep the two assumptions the
 * US conclusion actually turns on and show the line they cross.
 *
 *   x  provenance premium — what a buyer pays extra for non-China supply. The
 *      hedging demand that motivates the whole program, and the one thing the
 *      model charges the US as a cost while never crediting it as revenue.
 *   y  US cost disadvantage — the regional cost factor and FOAK premium
 *      together, as a multiple of the calibrated value.
 *
 * Cheap because the screen is arithmetic: every cell is a closed-form NPV, so a
 * 13x11 sweep is 143 multiplications, not 143 solves. Nothing is precomputed and
 * no grid is loaded. That is worth saying explicitly, because the instinct is
 * that a two-dimensional sweep must be expensive — for the PLANNER it would be.
 */
import { screen, priceAtSpread, type Buildout } from './projectFinance';

const NX = 13, NY = 11;
const PREM_MAX = 60;    // $/kg of finished magnet
const COST_MAX = 3.5;   // multiple of the calibrated US disadvantage

export default function BankabilityFrontier({ rows, priceSpread, conversion, rate, instruments,
                                              costMult, foakMult, provenancePremium }: {
  rows: Buildout[];
  priceSpread: number;
  conversion: number;
  rate: number;
  instruments: Record<string, boolean>;
  costMult: number;
  foakMult: number;
  provenancePremium: number;
}) {
  const prices = priceAtSpread(priceSpread, conversion);
  const asked = rows.reduce((a, b) => a + b.kt, 0) || 1;

  /** Share of requested capacity that clears, at one (premium, cost) pair. */
  const fundedShare = (prem: number, cm: number): number => {
    const v = screen(rows, prices, {
      rate,
      offtake: instruments.offtake,
      floorInterface: instruments.floor ? 'magnet' : null,
      creditSupport: instruments.guarantee ? 1 : 0,
      costMult: cm, foakMult, provenancePremium: prem,
    });
    return v.filter((x) => x.funded).reduce((a, x) => a + x.newKt, 0) / asked;
  };

  const xs = Array.from({ length: NX }, (_, i) => (i / (NX - 1)) * PREM_MAX);
  const ys = Array.from({ length: NY }, (_, j) => 0.5 + (j / (NY - 1)) * (COST_MAX - 0.5));
  const empty = rows.length === 0;
  const cell = (s: number) =>
    s < 0 ? 'var(--paper-2)' : s >= 0.999 ? 'var(--brand-green)' : s <= 0.001 ? '#D53E4F' : '#FDAE61';

  // Where the operating point sits, so the reader can see how far it is from the line.
  const px = Math.max(0, Math.min(1, provenancePremium / PREM_MAX)) * 100;
  const py = (1 - Math.max(0, Math.min(1, (costMult - 0.5) / (COST_MAX - 0.5)))) * 100;

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--rule)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
        <span style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.06em',
                       textTransform: 'uppercase', opacity: 0.55 }}>
          Bankability frontier
        </span>
        {empty && (
          <span style={{ fontSize: 10.5, opacity: 0.55 }}>
            the plan asks for no US capacity here — nothing to screen
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        <div style={{ font: '400 9px var(--font-mono)', opacity: 0.55, writingMode: 'vertical-rl',
                      transform: 'rotate(180deg)', textAlign: 'center', paddingBottom: 14 }}>
          US cost disadvantage →
        </div>
        {/* value ticks, so the vertical axis is as readable as the horizontal */}
        <div style={{ display: 'grid', gridTemplateRows: `repeat(${NY}, 14px)`, gap: 1,
                      font: '400 8.5px var(--font-mono)', opacity: 0.45, textAlign: 'right' }}>
          {ys.slice().reverse().map((cm, j) => (
            <span key={cm} style={{ lineHeight: '14px' }}>
              {j % 2 === 0 ? `${cm.toFixed(1)}×` : ''}
            </span>
          ))}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ position: 'relative', display: 'grid', gap: 1,
                        gridTemplateColumns: `repeat(${NX}, 1fr)`,
                        gridTemplateRows: `repeat(${NY}, 14px)` }}>
            {ys.slice().reverse().map((cm) => xs.map((prem) => {
              const s = empty ? -1 : fundedShare(prem, cm);
              return (
                <div key={`${cm}-${prem}`}
                  title={`provenance premium $${prem.toFixed(0)}/kg · US cost ${cm.toFixed(2)}× → `
                    + `${(s * 100).toFixed(0)}% of requested capacity funded`}
                  style={{ background: cell(s), opacity: s < 0 ? 1 : 0.55 + 0.45 * s, borderRadius: 1 }} />
              );
            }))}
            {/* the reader's current assumptions */}
            <div style={{ position: 'absolute', left: `${px}%`, top: `${py}%`,
                          width: 9, height: 9, marginLeft: -4.5, marginTop: -4.5,
                          border: '2px solid var(--ink)', borderRadius: '50%',
                          background: 'var(--paper)', pointerEvents: 'none' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between',
                        font: '400 9px var(--font-mono)', opacity: 0.5, marginTop: 3 }}>
            <span>$0</span>
            <span>provenance premium, $/kg of magnet →</span>
            <span>${PREM_MAX}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8,
                    font: '400 10px var(--font-mono)', opacity: 0.65 }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 8,
                             background: 'var(--brand-green)' }} /> funded</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 8,
                             background: '#FDAE61' }} /> partly</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 8,
                             background: '#D53E4F' }} /> none</span>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                             border: '2px solid var(--ink)' }} /> your assumptions</span>
      </div>
    </div>
  );
}
