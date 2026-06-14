/**
 * Trade-risk panel: per-stage + integrated Trade Risk Index (TRI) for the US
 * magnet chain (see tri.ts; method adapted from Cheng et al. 2025). Pairs the risk
 * picture with a first cost-effectiveness readout — how much trade risk the current
 * policy + resilience choices buy down, and at what cost, vs doing nothing at the
 * same threat level. That ROI framing is what lets an investor (e.g. AMMTO) compare
 * spending on reshoring / recycling / stockpiling against the security it yields.
 */
import type { Scenario } from './interp';
import { integratedTRI, stageBreakdown, riskColor } from './tri';

const musd = (x: number) => `$${(x / 1000).toFixed(1)}B`;

export default function TradeRiskPanel({ sc, refScenario, scCost, refCost }: {
  sc: Scenario; refScenario: Scenario; scCost: number; refCost: number;
}) {
  const stages = stageBreakdown(sc);
  const tri = integratedTRI(sc);
  const triRef = integratedTRI(refScenario);
  const dTRI = triRef - tri;        // risk reduced by the policy/resilience choices
  const dCost = scCost - refCost;   // extra real spend to get it ($M)
  const showROI = dTRI > 0.005 && dCost > 50;

  return (
    <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20, background: 'var(--paper)', marginTop: 26 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: 0 }}>Trade-risk index</h2>
        <span style={{ font: '600 15px var(--font-mono)', color: riskColor(tri) }}>
          {tri.toFixed(2)} <span style={{ opacity: 0.5, fontWeight: 400, color: 'var(--ink)' }}>integrated · lower = more secure</span>
        </span>
      </div>
      <p style={{ fontSize: 11.5, opacity: 0.5, margin: '0 0 14px', lineHeight: 1.45 }}>
        Per stage: import-source concentration (HHI) × import reliance, plus a domestic-reserve risk
        for the US-made share and a full weight on any unmet demand — after Cheng et al. (2025). The
        integrated index is a value-weighted average. Note how a content mandate cuts risk at the
        <i> magnet</i> stage but pushes it upstream to oxide and ore, where the US has no active
        heavy-REE production today (domestic prospects like Round Top, TX are pre-commercial).
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {stages.map((st) => (
          <div key={st.key} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 42px', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, textAlign: 'right', opacity: 0.85 }}>{st.label}</span>
            <div title={`import reliance ${(st.reliance * 100).toFixed(0)}% · unmet ${(st.unmet * 100).toFixed(0)}%`}
              style={{ height: 18, borderRadius: 4, background: 'var(--paper-2)', border: '1px solid var(--rule)', overflow: 'hidden' }}>
              <div style={{ width: `${st.tri * 100}%`, height: '100%', background: riskColor(st.tri), transition: 'width 0.15s' }} />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, textAlign: 'right' }}>{st.tri.toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--rule)', fontSize: 12, lineHeight: 1.5 }}>
        {showROI ? (
          <span>
            <b>Cost-effectiveness:</b> at this threat level, the current policy + resilience choices cut
            integrated trade risk by <b style={{ color: 'var(--brand-green)' }}>−{dTRI.toFixed(2)}</b>
            {' '}(from {triRef.toFixed(2)} to {tri.toFixed(2)}) for <b>+{musd(dCost)}</b> of real spend —
            about <b>{musd(dCost / (dTRI / 0.1))}</b> per 0.1 of risk bought down.
          </span>
        ) : (
          <span style={{ opacity: 0.6 }}>
            <b>Cost-effectiveness:</b> set the policy + resilience sliders to see how much trade risk
            they buy down, and at what real cost, vs doing nothing at the same China-restriction level.
          </span>
        )}
      </div>
    </section>
  );
}
