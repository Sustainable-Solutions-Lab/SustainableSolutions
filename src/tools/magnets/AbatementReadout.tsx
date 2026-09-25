/**
 * How much heavy demand designs itself away at the current restriction.
 *
 * Not a new assumption — it reads the marginal-abatement-cost curve the solver
 * already trades against. As a China restriction pushes the ex-China Dy/Tb
 * premium up, every thrifting option cheaper than that premium becomes worth
 * installing, so demand is elastic to the price without anyone choosing a
 * demand scenario.
 *
 * The COST of thrifting is not yet a live control: it is a real model parameter
 * (`cost_factor` on the curve) but is pinned at 1.0 in every grid cell, so
 * moving it would change this readout without moving the chain behind it. It
 * becomes a slider when it becomes a grid axis.
 */
import { abatedShare, bindingTranches, premiumAt, MAX_ABATABLE, TRANCHE_LABEL } from './abatement';

export default function AbatementReadout({ china, unlock = 0 }:
                                         { china: number; unlock?: number }) {
  const premium = premiumAt(china);
  const share = abatedShare(premium, 1, unlock);
  const binding = bindingTranches(premium, 1, unlock);
  return (
    <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: '14px 18px',
                      background: 'var(--paper)', marginTop: 22 }}>
      <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em',
                   textTransform: 'uppercase', opacity: 0.6, margin: '0 0 3px' }}>
        Demand that designs itself away
      </h2>
      <p style={{ fontSize: 11.5, opacity: 0.7, margin: '0 0 12px', maxWidth: 620, lineHeight: 1.45 }}>
        A restriction raises the price of the Dy/Tb the US imports, and every thrifting
        option cheaper than that price becomes worth installing. This is the model's own
        abatement curve, not a separate elasticity.
      </p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ font: '600 21px var(--font-mono)' }}>{(share * 100).toFixed(0)}%</span>
        <span style={{ fontSize: 11.5, opacity: 0.7 }}>
          of Dy/Tb thrifted out at a ${premium.toFixed(0)}/kg premium
        </span>
      </div>
      {/* The bar is the full abatable pool; the fill is what this premium buys.
          The unfilled remainder past MAX_ABATABLE is the inelastic core — offshore
          direct-drive and defence have no substitute at any price. */}
      <div style={{ position: 'relative', height: 10, borderRadius: 3, marginTop: 10,
                    background: 'var(--paper-2)', border: '1px solid var(--rule)' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${MAX_ABATABLE * 100}%`,
                      background: 'var(--rule)', borderRadius: '3px 0 0 3px' }} />
        <div style={{ position: 'absolute', inset: 0, width: `${share * 100}%`,
                      background: '#66C2A5', borderRadius: '3px 0 0 3px' }} />
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8,
                    font: '400 10.5px var(--font-mono)', opacity: 0.7 }}>
        <span>installed: {binding.length ? binding.map((t) => TRANCHE_LABEL[t.label] ?? t.label).join(', ') : 'none yet'}</span>
        <span style={{ opacity: 0.7 }}>ceiling {(MAX_ABATABLE * 100).toFixed(0)}% — the rest has no substitute</span>
      </div>
    </section>
  );
}
