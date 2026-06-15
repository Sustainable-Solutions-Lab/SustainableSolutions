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

export default function TradeRiskPanel({ sc, levers, alliedHHI }: {
  sc: Scenario;
  levers: { name: string; strategic: boolean; dTRI: number; dCost: number }[];
  alliedHHI?: Record<string, number>;
}) {
  const stages = stageBreakdown(sc, alliedHHI);
  const tri = integratedTRI(sc, alliedHHI);
  // cost-effectiveness of each lever: real $ per 0.1 of integrated TRI bought down
  // Only show levers that actually buy a measurable security gain at a real cost —
  // a lever that doesn't move the trade-risk index here is omitted rather than shown
  // as a dash (e.g. a US-make mandate when demand is already largely met onshore).
  const rows = levers
    .map((l) => ({ ...l, perTRI: l.dTRI > 0.005 && l.dCost > 0 ? l.dCost / (l.dTRI / 0.1) : null }))
    .filter((r) => r.perTRI != null)
    .sort((a, b) => (a.perTRI! - b.perTRI!));
  const shadow = rows.find((r) => r.strategic)?.perTRI ?? null;
  // Anchor the bar scale to the shadow price (Round Top), not the largest lever, so
  // that changing one lever — e.g. recycling under a high US-recycling-cost multiplier
  // — no longer rescales every other bar and makes them look cheaper/dearer.
  const barRef = shadow ?? Math.max(1, ...rows.map((r) => r.perTRI ?? 0));

  return (
    <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20, background: 'var(--paper)', marginTop: 26 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: 0 }}>US trade-risk index</h2>
        <span style={{ font: '600 15px var(--font-mono)', color: riskColor(tri) }}>
          {tri.toFixed(2)} <span style={{ opacity: 0.5, fontWeight: 400, color: 'var(--ink)' }}>integrated · lower = more secure</span>
        </span>
      </div>
      <p style={{ fontSize: 11.5, opacity: 0.5, margin: '0 0 14px', lineHeight: 1.45 }}>
        Per stage: import-source concentration (HHI) × import reliance, plus a domestic-reserve risk
        for the US-made share and a full weight on any unmet demand — after Cheng et al. (2025) —
        <b> demand-weighted across the 2026–2035 horizon</b> (period self-sufficiency, not a single-
        year snapshot, so early-period relief from a stockpile or the recycling ramp counts). The
        integrated index is a value-weighted average. Note how a content mandate cuts risk at the
        <i> magnet</i> stage but pushes it upstream to oxide and ore, where the US has no active
        heavy-REE production today (domestic prospects like Round Top, TX are pre-commercial).
        <b> Recycling’s benefit is threat-conditional:</b> at low restriction US-recovered oxide
        flows to the cheaper global pool (little domestic gain), but under a severe China shock it
        becomes a primary domestic feedstock — a resilience option that pays off mainly in the bad
        states it insures against.
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

      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--rule)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>Cost of security — what each lever buys</div>
        <p style={{ fontSize: 11, opacity: 0.55, margin: '0 0 10px', lineHeight: 1.45 }}>
          From no policy at this China-restriction level: real $ per 0.1 of integrated trade-risk
          bought down (shorter bar = cheaper security). <b>Developing Round Top</b> (★) is an
          exogenous strategic move — its $/TRI is a revealed read on the US government’s
          <i> shadow price of security</i>. Costs of comparable security gains by other levers are
          shown below; levers that don’t move the index here are omitted.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {rows.length === 0 && (
            <p style={{ fontSize: 11.5, opacity: 0.5, margin: 0, lineHeight: 1.45 }}>
              At this threat level no lever yet buys a measurable trade-risk reduction — the US chain
              already meets demand without one. Raise the China-restriction slider to see security
              become worth paying for.
            </p>
          )}
          {rows.map((r) => (
            <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '128px 1fr 96px', gap: 10, alignItems: 'center', fontSize: 12 }}>
              <span style={{ fontWeight: 600, opacity: 0.85 }}>
                {r.name}{r.strategic && <span title="revealed shadow price of security" style={{ color: 'var(--accent)' }}> ★</span>}
              </span>
              <div style={{ height: 16, borderRadius: 4, background: 'var(--paper-2)', border: '1px solid var(--rule)', overflow: 'hidden' }}>
                {r.perTRI != null && <div style={{ width: `${Math.min(100, (r.perTRI / barRef) * 100)}%`, height: '100%', background: r.strategic ? 'var(--accent)' : '#66C2A5', transition: 'width 0.15s' }} />}
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textAlign: 'right' }}
                title={r.perTRI != null ? `−${r.dTRI.toFixed(2)} TRI for +${musd(r.dCost)}` : 'no risk reduction here'}>
                {r.perTRI != null ? `${musd(r.perTRI)}/0.1` : '—'}
              </span>
            </div>
          ))}
        </div>
        {shadow != null && (
          <p style={{ fontSize: 10.5, opacity: 0.45, margin: '8px 0 0', lineHeight: 1.4 }}>
            ★ Round Top ≈ {musd(shadow)} per 0.1 TRI — a revealed-preference estimate of the US
            government’s current shadow price of security.
          </p>
        )}
      </div>
    </section>
  );
}
