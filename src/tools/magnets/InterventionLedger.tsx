/**
 * What interventions buy, as two ranked ledgers.
 *
 * PLANNER: every lever rated in $ per 0.1 of integrated trade risk, split into
 * what the current settings DEPLOY (valued by what each bought against the same
 * world without it) and what is NEXT UP (valued by what its next step would buy
 * from here), cheapest first. The thrifting research, the stockpile and
 * collection are line items here like everything else, not sections.
 *
 * ACTOR: the gap between what the plan calls for and what firms fund, and what
 * each instrument closes of it. When there is no gap, it says so in one line
 * and stops, because an empty chart reads as a broken tool.
 */
import { perTenth, rankPlanner, type PlannerRow, type ActorRow, type ActorGap } from './ledger';

const musd = (x: number) => (Math.abs(x) >= 1000 ? `$${(x / 1000).toFixed(1)}B` : `$${x.toFixed(0)}M`);
const BAR_FULL = 5000;   // $M per 0.1 index that fills the bar, fixed so scenarios compare
const barLen = (per: number) => Math.min(100, (per / BAR_FULL) * 100);
const dealColor = (per: number) => {
  if (per <= 2000) return '#66C2A5';
  if (per <= 4000) return '#FEE08B';
  if (per <= 7000) return '#FDAE61';
  return '#D53E4F';
};

const H2 = { font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase',
             opacity: 0.6, margin: 0 } as const;
const SUBHEAD = { font: '600 10px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: 'var(--cardinal)', opacity: 0.85, margin: '14px 0 6px' } as const;
const MUTED = { fontSize: 11, opacity: 0.55, lineHeight: 1.45 } as const;

function Row({ r, effect, tag, best, mobile }: {
  r: PlannerRow; effect?: { dTRI: number; cost: number }; tag: string; best?: boolean; mobile: boolean;
}) {
  const per = perTenth(effect);
  const free = per === 0;
  return (
    <div style={{ display: 'grid', gap: '2px 10px', alignItems: 'center', fontSize: 12,
                  gridTemplateColumns: mobile ? '1fr 84px' : '150px 1fr 96px 150px' }}>
      <span style={{ fontWeight: 600, opacity: 0.85, lineHeight: 1.25 }}>
        {r.name}
        {best && <span title="most cost-effective next move" style={{ color: 'var(--accent)' }}> ▲</span>}
        <span style={{ display: 'block', fontWeight: 400, fontSize: 9.5, opacity: 0.55, fontFamily: 'var(--font-mono)' }}>
          {tag}{r.level ? ` · ${r.level}` : ''}{r.note ? ` · ${r.note}` : ''}
        </span>
      </span>
      {!mobile && (
        <div style={{ height: 14, borderRadius: 4, background: 'var(--paper-2)', border: '1px solid var(--rule)', overflow: 'hidden' }}>
          {per != null && per > 0 && <div style={{ width: `${barLen(per)}%`, height: '100%', background: dealColor(per), transition: 'width 0.15s' }} />}
          {free && <div style={{ width: '100%', height: '100%', background: 'repeating-linear-gradient(90deg, #66C2A5 0 6px, transparent 6px 12px)', opacity: 0.6 }} />}
        </div>
      )}
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textAlign: 'right', fontWeight: 600 }}
            title={effect ? `−${effect.dTRI.toFixed(3)} index for ${effect.cost >= 0 ? '+' : '−'}${musd(Math.abs(effect.cost))}` : ''}>
        {per == null ? '—' : free ? 'pays for itself' : `${musd(per)}/0.1`}
      </span>
      {!mobile && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, opacity: 0.6, textAlign: 'right' }}>
          {effect && effect.dTRI > 0.005 ? `−${effect.dTRI.toFixed(2)} · ${effect.cost >= 0 ? '+' : '−'}${musd(Math.abs(effect.cost))}` : ''}
        </span>
      )}
    </div>
  );
}

export default function InterventionLedger({ planner, actor, mobile = false }: {
  planner: PlannerRow[];
  actor: { now: ActorGap; rows: ActorRow[]; hurdlePct: number };
  mobile?: boolean;
}) {
  const { deployed, next, inert } = rankPlanner(planner);
  const gap = actor.now;
  const actorRows = [...actor.rows].sort((a, b) => b.closedKt - a.closedKt || b.supportRemoved - a.supportRemoved);

  return (
    <section style={{ marginTop: 30 }}>
      <h2 style={{ ...H2, margin: '0 0 4px' }}>What interventions buy</h2>
      <p style={{ fontSize: 11.5, opacity: 0.65, margin: '0 0 6px', maxWidth: 680, lineHeight: 1.45 }}>
        Two ledgers, because a lever can improve the <b>plan</b> and separately improve
        whether <b>firms fund the plan</b>, and conflating them is how a tool starts
        implying security is free.
      </p>

      {/* ── PLANNER ── */}
      <div style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: '14px 18px 16px', background: 'var(--paper)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
          <span style={H2}>Planner: security per dollar</span>
          <span style={{ fontSize: 10.5, opacity: 0.5 }}>$ per 0.1 of integrated trade risk · 2026–35 · green cheap, red dear</span>
        </div>

        <div style={SUBHEAD}>Deployed by these settings</div>
        {deployed.length === 0 ? (
          <p style={{ ...MUTED, margin: 0 }}>Nothing yet: the settings deploy no intervention.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {deployed.map((r) => <Row key={r.name} r={r} effect={r.bought} tag="deployed" mobile={mobile} />)}
          </div>
        )}

        <div style={SUBHEAD}>Next up, cheapest first</div>
        {next.length === 0 ? (
          <p style={{ ...MUTED, margin: 0 }}>
            Nothing left buys measurable security from here. Either the chain already meets
            demand at this restriction, or every lever that moves the index is already deployed.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {next.map((r, i) => <Row key={r.name} r={r} effect={r.next} tag={r.overlay ? 'if built regardless' : 'next step'} best={i === 0} mobile={mobile} />)}
          </div>
        )}
        {inert.length > 0 && (
          <p style={{ ...MUTED, margin: '10px 0 0' }}>
            No effect here: {inert.map((r) => r.name).join(', ')}.
          </p>
        )}
      </div>

      {/* ── ACTOR ── */}
      <div style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: '14px 18px 16px', background: 'var(--paper)', marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
          <span style={H2}>Actor: the gap, and what closes it</span>
          <span style={{ fontSize: 10.5, opacity: 0.5 }}>at a {actor.hurdlePct.toFixed(1)}% hurdle · from the capacity panel above</span>
        </div>

        {gap.total === 0 ? (
          <p style={{ ...MUTED, margin: '10px 0 0' }}>
            <b style={{ opacity: 0.85 }}>No gap, because the plan calls for no new US capacity.</b> The
            least-cost planner meets US demand from imports and existing plants at this
            restriction, so there is nothing for a firm to decline to fund. Add a mandate or
            raise the restriction to see the plan ask for capacity.
          </p>
        ) : gap.unfunded === 0 ? (
          <p style={{ ...MUTED, margin: '10px 0 0' }}>
            <b style={{ opacity: 0.85 }}>No gap: all {gap.total} expansions ({gap.totalKt.toFixed(0)} kt) clear
            at these prices and instruments.</b> Financing conditions are not what stands
            between this plan and its build-out.
          </p>
        ) : (
          <>
            <p style={{ ...MUTED, margin: '10px 0 8px' }}>
              <b style={{ opacity: 0.85, color: 'var(--ink)' }}>{gap.unfunded} of {gap.total} expansions
              ({gap.unfundedKt.toFixed(0)} of {gap.totalKt.toFixed(0)} kt) do not clear</b>, and closing
              every shortfall would take {musd(gap.support)}/yr of support. Each instrument
              below, applied in full on its own:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {actorRows.map((r) => {
                const share = gap.unfundedKt > 0 ? r.closedKt / gap.unfundedKt : 0;
                return (
                  <div key={r.name} style={{ display: 'grid', gap: '2px 10px', alignItems: 'center', fontSize: 12,
                                             gridTemplateColumns: mobile ? '1fr 96px' : '170px 1fr 96px 170px' }}>
                    <span style={{ fontWeight: 600, opacity: 0.85, lineHeight: 1.25 }}>
                      {r.name}
                      <span style={{ display: 'block', fontWeight: 400, fontSize: 9.5, opacity: 0.55, fontFamily: 'var(--font-mono)' }}>
                        {r.deployed ? 'deployed' : 'not deployed'}{r.note ? ` · ${r.note}` : ''}
                      </span>
                    </span>
                    {!mobile && (
                      <div style={{ height: 14, borderRadius: 4, background: 'var(--paper-2)', border: '1px solid var(--rule)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, share * 100)}%`, height: '100%', background: share >= 0.999 ? '#66C2A5' : '#3288BD', transition: 'width 0.15s' }} />
                      </div>
                    )}
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textAlign: 'right', fontWeight: 600 }}>
                      {r.closedKt > 0.05 ? `closes ${r.closedKt.toFixed(0)} kt` : 'closes none'}
                    </span>
                    {!mobile && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, opacity: 0.6, textAlign: 'right' }}>
                        {r.supportRemoved > 0.5 ? `−${musd(r.supportRemoved)}/yr support` : ''}
                        {r.costPerYear != null ? ` · costs ${musd(r.costPerYear)}/yr` : r.closedKt > 0.05 ? ' · contingent, unpriced' : ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <p style={{ ...MUTED, margin: '10px 0 0' }}>
              An offtake or a guarantee costs the public nothing unless it is called, which
              is why they rank by what they close rather than by a price; a provenance
              premium is paid by buyers every year and is priced here.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
