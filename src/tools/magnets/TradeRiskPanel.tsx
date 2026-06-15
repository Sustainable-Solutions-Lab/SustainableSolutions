/**
 * Trade-risk block (per-stage + integrated Trade Risk Index, plus the cost-of-
 * security ROI readout). Rendered BARE (no section wrapper) so the explorer can fold
 * it into the combined "Cost and security of US magnet supply" section. Long method
 * notes sit behind ⓘ toggles to keep it compact. Method after Cheng et al. (2025).
 */
import { useState } from 'react';
import type { Scenario } from './interp';
import { integratedRE, classTRI, stageBreakdownClass, riskColor, RISK_CHIP } from './tri';

const musd = (x: number) => `$${(x / 1000).toFixed(1)}B`;

function InfoBtn({ on, set }: { on: boolean; set: (f: (o: boolean) => boolean) => void }) {
  return (
    <button onClick={() => set((o) => !o)} aria-label="Details" title="Details"
      style={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--rule-strong)',
        background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--paper)' : 'var(--ink-3)',
        font: '600 9px var(--font-mono)', lineHeight: 1, cursor: 'pointer', padding: 0, marginLeft: 6 }}>i</button>
  );
}

export default function TradeRiskPanel({ sc, levers, alliedHHI }: {
  sc: Scenario;
  levers: { name: string; strategic: boolean; demand?: boolean; consumer?: boolean; dTRI: number; dCost: number }[];
  alliedHHI?: Record<string, number>;
}) {
  const [infoTRI, setInfoTRI] = useState(false);
  const [infoCost, setInfoCost] = useState(false);
  const [reClass, setReClass] = useState<'heavy' | 'light'>('heavy');   // Dy/Tb chokepoint by default
  const stages = stageBreakdownClass(sc, reClass, alliedHHI);
  const tri = integratedRE(sc, alliedHHI);
  const triH = classTRI(sc, 'heavy', alliedHHI), triL = classTRI(sc, 'light', alliedHHI);
  const rows = levers
    .filter((l) => !l.demand)
    .map((l) => ({ ...l, perTRI: l.dTRI > 0.005 && l.dCost > 0 ? l.dCost / (l.dTRI / 0.1) : null }))
    .filter((r) => r.perTRI != null && r.perTRI! <= 10000)   // drop deals worse than $10B / 0.1 TRI
    .sort((a, b) => (a.perTRI! - b.perTRI!));
  const shadow = rows.find((r) => r.strategic)?.perTRI ?? null;
  // No-US-cost levers: risk reduction the model doesn't charge US CAPITAL for — demand-side
  // levers AND policy sourcing shifts (friendshoring moves the import mix China→allies, which
  // carries no US-located build cost, so the $/TRI ranking above can't price it). Shown with
  // their TRI reduction valued at the shadow price.
  const noCostRows = levers.filter((l) => l.dTRI > 0.005 && (l.demand || l.dCost <= 0))
    .sort((a, b) => b.dTRI - a.dTRI);
  // FIXED scale: a $5B/0.1-TRI lever fills the bar; colour by absolute $ (green cheap →
  // red spendy), so bars are comparable across scenarios. Deals worse than $10B are hidden
  // (so e.g. a very pricey stockpile may not appear).
  const BAR_FULL = 5000;   // $M per 0.1 TRI that fills the bar
  const barLen = (per: number) => Math.min(100, (per / BAR_FULL) * 100);
  const dealColor = (per: number) => {
    if (per <= 2000) return '#66C2A5';   // < $2B — green, a good deal
    if (per <= 4000) return '#FEE08B';   // < $4B — yellow
    if (per <= 7000) return '#FDAE61';   // < $7B — orange
    return '#D53E4F';                     // ≥ $7B — red, spendy
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, display: 'flex', alignItems: 'center' }}>
          Trade risk index <InfoBtn on={infoTRI} set={setInfoTRI} />
        </span>
        <span style={{ font: '600 14px var(--font-mono)' }}>
          <span style={{ ...RISK_CHIP, color: riskColor(tri) }}>{tri.toFixed(2)}</span> <span style={{ opacity: 0.5, fontWeight: 400, color: 'var(--ink)' }}>integrated · lower = secure</span>
        </span>
      </div>
      {infoTRI && (
        <p style={{ fontSize: 11.5, opacity: 0.55, margin: '0 0 12px', lineHeight: 1.45 }}>
          Per stage: import-source concentration (HHI) × import reliance, plus a domestic-reserve risk
          for the US-made share and a full weight on any unmet demand — after Cheng et al. (2025),
          demand-weighted across 2026–2035 (period self-sufficiency, so a stockpile or the recycling
          ramp registers). A content mandate cuts magnet-stage risk but pushes it upstream to oxide and
          ore, where the US has little heavy-REE production. Recycling’s benefit is threat-conditional:
          negligible at low restriction, a primary domestic feedstock under a severe China shock.
        </p>
      )}

      {/* Dy/Tb (heavy) is the real chokepoint; Nd/Pr (light) is far more diversified
          (US/ally reserves). Toggle which class the per-stage bars show. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, opacity: 0.6 }}>By RE class:</span>
        {(['heavy', 'light'] as const).map((cls) => {
          const v = cls === 'heavy' ? triH : triL;
          const on = reClass === cls;
          return (
            <button key={cls} onClick={() => setReClass(cls)}
              style={{ font: '600 11px var(--font-mono)', padding: '4px 9px', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--rule-strong)'}`, background: on ? 'var(--paper-2)' : 'transparent', color: 'var(--ink)' }}>
              {cls === 'heavy' ? 'Dy/Tb (heavy)' : 'Nd/Pr (light)'} <b style={{ ...RISK_CHIP, padding: '1px 5px', color: riskColor(v) }}>{v.toFixed(2)}</b>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 10.5, opacity: 0.5, margin: '0 0 6px' }}>
        Per stage — {reClass === 'heavy' ? 'Dy/Tb (heavy)' : 'Nd/Pr (light)'}:
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {stages.map((st) => (
          <div key={st.key} style={{ display: 'grid', gridTemplateColumns: '128px 1fr 38px', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'right', opacity: 0.85 }}>{st.label}</span>
            <div title={`import reliance ${(st.reliance * 100).toFixed(0)}% · unmet ${(st.unmet * 100).toFixed(0)}%`}
              style={{ height: 16, borderRadius: 4, background: 'var(--paper-2)', border: '1px solid var(--rule)', overflow: 'hidden' }}>
              <div style={{ width: `${st.tri * 100}%`, height: '100%', background: riskColor(st.tri), transition: 'width 0.15s' }} />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, textAlign: 'right' }}>{st.tri.toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--rule)' }}>
        <div style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, marginBottom: 8, display: 'flex', alignItems: 'center' }}>
          Cost of security — what each lever buys <InfoBtn on={infoCost} set={setInfoCost} />
        </div>
        {infoCost && (
          <p style={{ fontSize: 11, opacity: 0.55, margin: '0 0 10px', lineHeight: 1.45 }}>
            From no policy at this China-restriction level: real $ per 0.1 of integrated trade-risk
            reduced, on a <b>fixed scale</b> ($5B/0.1 fills the bar; <b>green</b> cheap · yellow ·
            orange · <b>red</b> spendy; deals worse than $10B/0.1 are hidden). <b>Developing Round Top</b> (★) is an exogenous strategic move
            whose $/TRI is a revealed read on the US government’s <i>shadow price of security</i>;
            bars are scaled to it. Levers that don’t move the index here are omitted.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {rows.length === 0 && (
            <p style={{ fontSize: 11.5, opacity: 0.5, margin: 0, lineHeight: 1.45 }}>
              At this threat level no lever yet buys a measurable trade-risk reduction — the US chain
              already meets demand. Raise the China-restriction slider to see security become worth paying for.
            </p>
          )}
          {rows.map((r) => (
            <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '128px 1fr 96px', gap: 10, alignItems: 'center', fontSize: 12 }}>
              <span style={{ fontWeight: 600, opacity: 0.85 }}>
                {r.name}{r.strategic && <span title="revealed shadow price of security" style={{ color: 'var(--accent)' }}> ★</span>}
                {r.consumer && <span title="a consumer price premium on pricier allied imports — not US build capital" style={{ display: 'block', fontWeight: 400, fontSize: 9.5, opacity: 0.55, fontFamily: 'var(--font-mono)' }}>consumer premium</span>}
              </span>
              <div style={{ height: 16, borderRadius: 4, background: 'var(--paper-2)', border: '1px solid var(--rule)', overflow: 'hidden' }}>
                {r.perTRI != null && <div style={{ width: `${barLen(r.perTRI)}%`, height: '100%', background: dealColor(r.perTRI), transition: 'width 0.15s' }} />}
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textAlign: 'right' }}
                title={r.perTRI != null ? `−${r.dTRI.toFixed(2)} TRI for +${musd(r.dCost)}` : 'no risk reduction here'}>
                {r.perTRI != null ? `${musd(r.perTRI)}/0.1` : '—'}
              </span>
            </div>
          ))}
        </div>
        {noCostRows.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--rule)' }}>
            <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 7, lineHeight: 1.4 }}>
              No US-capital levers — risk reduction the model doesn’t charge US build cost for (demand-side
              levers + allied sourcing shifts like friendshoring){shadow != null ? ', valued at the shadow price (what you’d otherwise pay to buy the same security)' : ''}:
            </div>
            {noCostRows.map((r) => (
              <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '128px 1fr 96px', gap: 10, alignItems: 'center', fontSize: 12, marginBottom: 5 }}>
                <span style={{ fontWeight: 600, opacity: 0.85 }}>{r.name}</span>
                <div style={{ height: 16, borderRadius: 4, background: 'var(--paper-2)', border: '1px solid var(--rule)', overflow: 'hidden' }}>
                  {/* valued at the shadow price → same length + colour as Round Top */}
                  {shadow != null && <div style={{ width: `${barLen(shadow)}%`, height: '100%', background: dealColor(shadow) }} />}
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textAlign: 'right' }} title={`−${r.dTRI.toFixed(2)} integrated TRI`}>
                  −{r.dTRI.toFixed(2)}{shadow != null ? ` · ${musd(shadow * r.dTRI / 0.1)}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
