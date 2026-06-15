/**
 * Selectable real-world projects overlay. The user turns actual + announced NdFeB
 * supply-chain projects on/off (and scales them); the active ALLIED set drives the
 * country-level allied-import concentration (HHI) in the US trade-risk index,
 * retiring the flat N_ALLY fudge. (A fuller supply-mix / Sankey overlay — letting
 * these projects redraw the projected global chain, reconciled with the least-cost
 * model via the shadow price of security — is the next iteration.)
 */
import { useState } from 'react';
import { PROJECTS, STAGE_ORDER, STAGE_LABEL, BLOC_LABEL, isRealistic, alliedHHI,
  ALL_IDS, DEFAULT_ACTIVE, type Project, type Bloc, type Status } from './projects';

const BLOC_COLOR: Record<Bloc, string> = {
  us: '#8C1515', allied: '#3288BD', china: '#D53E4F', nonaligned: '#9A9AB0',
};
const STATUS_COLOR: Record<Status, string> = {
  operating: '#66C2A5', construction: '#FDAE61', planned: '#9A9AB0', announced: '#C8C8D8',
};
const STATUS_LABEL: Record<Status, string> = {
  operating: 'operating', construction: 'construction', planned: 'planned', announced: 'announced',
};

function PresetButton({ label, onClick, active }: { label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick}
      style={{ padding: '5px 10px', font: '600 11px var(--font-mono)', letterSpacing: '0.03em',
        color: active ? 'var(--paper)' : 'var(--ink)', background: active ? 'var(--accent)' : 'transparent',
        border: '1px solid var(--rule-strong)', borderRadius: 6, cursor: 'pointer' }}>
      {label}
    </button>
  );
}

export default function ProjectsPanel({ active, scale, onToggle, onScale, onPreset }: {
  active: Set<string>;
  scale: Record<string, number>;
  onToggle: (id: string) => void;
  onScale: (id: string, v: number) => void;
  onPreset: (which: 'all' | 'none' | 'realistic') => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const nActive = active.size;
  const isAll = nActive === ALL_IDS.size;
  const isRealisticPreset = nActive === DEFAULT_ACTIVE.size &&
    [...active].every((id) => DEFAULT_ACTIVE.has(id));

  return (
    <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20, background: 'var(--paper)', marginTop: 26 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: 0 }}>Real-world projects</h2>
        <span style={{ font: '400 11px var(--font-mono)', opacity: 0.5 }}>{nActive} of {ALL_IDS.size} active</span>
      </div>
      <p style={{ fontSize: 11.5, opacity: 0.5, margin: '0 0 12px', lineHeight: 1.45 }}>
        The actual + announced global build-out. The active <b>allied</b> projects set the real
        country-level concentration of allied supply at each stage — so the trade-risk index reflects
        that allied alloy and magnets are heavily <i>Japan</i>-dependent, not a diversified bloc.
        Capacities are representative annual nameplate (kt/yr) and meant for review.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <PresetButton label="ALL" onClick={() => onPreset('all')} active={isAll} />
        <PresetButton label="REALISTIC 2026" onClick={() => onPreset('realistic')} active={isRealisticPreset} />
        <PresetButton label="NONE" onClick={() => onPreset('none')} active={nActive === 0} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {STAGE_ORDER.map((stage) => {
          const rows = PROJECTS.filter((p) => p.stage === stage);
          if (!rows.length) return null;
          const aH = alliedHHI(stage as any, active, scale);
          return (
            <div key={stage}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ font: '600 11px var(--font-mono)', letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.7 }}>{STAGE_LABEL[stage]}</span>
                {stage !== 'recycling' && (
                  <span title="allied-country concentration (Herfindahl) of active allied capacity at this stage; 1 = single allied country"
                    style={{ font: '400 10px var(--font-mono)', opacity: 0.5 }}>allied HHI {aH.toFixed(2)}</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {rows.map((p) => {
                  const on = active.has(p.id);
                  const sc = scale[p.id] ?? 1;
                  const isOpen = expanded === p.id;
                  return (
                    <div key={p.id} style={{ borderRadius: 6, background: on ? 'var(--paper-2)' : 'transparent', padding: '5px 8px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '18px 1fr auto', gap: 8, alignItems: 'center' }}>
                        <input type="checkbox" checked={on} onChange={() => onToggle(p.id)} style={{ accentColor: 'var(--accent)' }} />
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', opacity: on ? 1 : 0.55 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{p.name}</span>
                          <span title={BLOC_LABEL[p.bloc]} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, opacity: 0.7 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: BLOC_COLOR[p.bloc], display: 'inline-block' }} />
                            {p.country}{p.heavy && <span title="heavy-REE (Dy/Tb) source" style={{ color: '#762A83', fontWeight: 700 }}> · heavy</span>}
                          </span>
                          <span style={{ font: '600 9px var(--font-mono)', letterSpacing: '0.04em', textTransform: 'uppercase', color: STATUS_COLOR[p.status] }}>{STATUS_LABEL[p.status]}</span>
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ font: '600 11px var(--font-mono)', opacity: on ? 0.85 : 0.4 }}>{(p.capacityKt * (on ? sc : 1)).toFixed(0)} kt</span>
                          <button onClick={() => setExpanded(isOpen ? null : p.id)} title="scale / details"
                            style={{ width: 16, height: 16, borderRadius: 4, border: '1px solid var(--rule-strong)', background: 'transparent', color: 'var(--ink-3)', font: '600 11px var(--font-mono)', lineHeight: 1, cursor: 'pointer', padding: 0 }}>
                            {isOpen ? '−' : '+'}
                          </button>
                        </span>
                      </div>
                      {isOpen && (
                        <div style={{ padding: '8px 0 4px 26px' }}>
                          {p.note && <p style={{ fontSize: 11, opacity: 0.6, margin: '0 0 8px', lineHeight: 1.4 }}>{p.note}</p>}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 11, opacity: 0.6 }}>Scale</span>
                            <input type="range" min={0} max={2} step={0.1} value={sc} disabled={!on}
                              onChange={(e) => onScale(p.id, Number(e.target.value))}
                              style={{ flex: 1, accentColor: 'var(--accent)', opacity: on ? 1 : 0.4 }} />
                            <span style={{ font: '600 11px var(--font-mono)', color: 'var(--accent)', minWidth: 34, textAlign: 'right' }}>{sc.toFixed(1)}×</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
