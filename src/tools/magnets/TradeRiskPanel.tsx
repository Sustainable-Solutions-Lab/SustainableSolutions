/**
 * Trade-risk block (integrated Trade Risk Index and its two class parts; the
 * cost-of-security ledger now lives in InterventionLedger). Rendered BARE (no section wrapper) so the explorer can fold
 * it into the combined "Cost and security of US magnet supply" section. Long method
 * notes sit behind ⓘ toggles to keep it compact. Method after Cheng et al. (2025, Nature
 * Climate Change, https://www.nature.com/articles/s41558-025-02305-1).
 */
import { useState } from 'react';
import type { Scenario } from './interp';
import { integratedRE, classTRI, riskColor, riskChip } from './tri';

function InfoBtn({ on, set }: { on: boolean; set: (f: (o: boolean) => boolean) => void }) {
  return (
    <button onClick={() => set((o) => !o)} aria-label="Details" title="Details"
      style={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--rule-strong)',
        background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--paper)' : 'var(--ink-3)',
        font: '600 9px var(--font-mono)', lineHeight: 1, cursor: 'pointer', padding: 0, marginLeft: 6 }}>i</button>
  );
}

export default function TradeRiskPanel({ sc, alliedHHI }: {
  sc: Scenario;
  alliedHHI?: Record<string, number>;
}) {
  const [infoTRI, setInfoTRI] = useState(false);
  const tri = integratedRE(sc, alliedHHI);
  const triH = classTRI(sc, 'heavy', alliedHHI), triL = classTRI(sc, 'light', alliedHHI);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, display: 'flex', alignItems: 'center' }}>
          Trade risk index <InfoBtn on={infoTRI} set={setInfoTRI} />
        </span>
        <span style={{ font: '600 14px var(--font-mono)' }}>
          <span style={riskChip(riskColor(tri))}>{tri.toFixed(2)}</span> <span style={{ opacity: 0.5, fontWeight: 400, color: 'var(--ink)' }}>integrated · lower = secure</span>
        </span>
      </div>
      {infoTRI && (
        <p style={{ fontSize: 11.5, opacity: 0.55, margin: '0 0 12px', lineHeight: 1.45 }}>
          Per stage: import-source concentration (HHI) × import reliance, plus a domestic-reserve risk
          for the US-made share and a full weight on any unmet demand — after <a
          href="https://www.nature.com/articles/s41558-025-02305-1" target="_blank" rel="noopener"
          style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Cheng et al. (2025, <i>Nature Climate Change</i>)</a>,
          demand-weighted across 2026–2035 (period self-sufficiency, so a stockpile or the recycling
          ramp registers). A content mandate cuts magnet-stage risk but pushes it upstream to oxide and
          ore, where the US has little heavy-REE production. Recycling’s benefit is threat-conditional:
          negligible at low restriction, a primary domestic feedstock under a severe China shock.
        </p>
      )}

      {/* The per-stage bars used to live here. They now sit in the capacity panel,
          one risk chip per stage row, so exposure is read against the build-out it
          belongs to instead of in a second stage-resolved chart. What stays is the
          pair of class indices, as a READOUT rather than a toggle — the toggle
          moved with the bars. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        {(['heavy', 'light'] as const).map((cls) => {
          const v = cls === 'heavy' ? triH : triL;
          return (
            <span key={cls} style={{ font: '400 11px var(--font-mono)', opacity: 0.75 }}>
              {cls === 'heavy' ? 'Dy/Tb (heavy)' : 'Nd/Pr (light)'}{' '}
              <b style={riskChip(riskColor(v))}>{v.toFixed(2)}</b>
            </span>
          );
        })}
        <span style={{ fontSize: 10.5, opacity: 0.45 }}>
          per-stage risk is on the build-out bars above
        </span>
      </div>

    </div>
  );
}
