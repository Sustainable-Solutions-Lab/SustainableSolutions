/**
 * Compact real-world-projects control for the supply-explorer scenario aside.
 * Operating plants are always included; the two uncertain tiers — under construction
 * and planned — toggle on/off as groups (like the demand-scenario buttons), with a
 * '＋ Customize project expansion' expander for picking individual projects. The
 * active set drives the real-world-anchored Sankey + the trade-risk index.
 */
import { useState } from 'react';
import { FUTURE_PROJECTS, type Project, type Stage } from './projects';

const STAGE_SHORT: Record<Stage, string> = {
  mining: 'mine', separation: 'sep', alloy: 'alloy', magnet: 'magnet', recycling: 'recyc',
};
const BLOC_DOT: Record<string, string> = { us: '#8C1515', allied: '#3288BD', china: '#D53E4F', nonaligned: '#9A9AB0' };

function Row({ p, on, onToggle }: { p: Project; on: boolean; onToggle: () => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 4, fontSize: 12, cursor: 'pointer', lineHeight: 1.25 }} title={p.note}>
      <input type="checkbox" checked={on} onChange={onToggle} style={{ marginTop: 2, accentColor: 'var(--accent)' }} />
      <span style={{ opacity: on ? 1 : 0.6 }}>
        {p.name}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 5, fontSize: 10, opacity: 0.7 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: BLOC_DOT[p.bloc] }} />
          {STAGE_SHORT[p.stage]} · {p.country}{p.heavy && <span style={{ color: '#762A83', fontWeight: 700 }}> · heavy</span>}
        </span>
      </span>
    </label>
  );
}

function GroupButton({ label, count, total, allOn, onClick }: {
  label: string; count: number; total: number; allOn: boolean; onClick: () => void;
}) {
  const some = count > 0 && !allOn;
  return (
    <button onClick={onClick} title={`${count} of ${total} on — click to ${allOn ? 'exclude' : 'include'} all`}
      style={{ flex: 1, font: '600 11px var(--font-mono)', padding: '7px 4px', borderRadius: 6, cursor: 'pointer', lineHeight: 1.25,
        border: `1px solid ${allOn || some ? 'var(--accent)' : 'var(--rule-strong)'}`,
        background: allOn ? 'var(--accent)' : 'transparent', color: allOn ? 'var(--paper)' : 'var(--ink)' }}>
      {label}
      <span style={{ display: 'block', fontWeight: 400, fontSize: 9.5, opacity: 0.75 }}>{count}/{total}{some ? ' · some' : ''}</span>
    </button>
  );
}

export default function ProjectsAside({ future, onToggle, onSetGroup }: {
  future: Set<string>;
  onToggle: (id: string) => void;
  onSetGroup: (status: 'construction' | 'planned', on: boolean) => void;
}) {
  const construction = FUTURE_PROJECTS.filter((p) => p.status === 'construction');
  const planned = FUTURE_PROJECTS.filter((p) => p.status === 'planned');
  const nOn = (list: Project[]) => list.filter((p) => future.has(p.id)).length;
  const subhead = (t: string) => (
    <div style={{ font: '600 9.5px var(--font-mono)', letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.55, margin: '8px 0 4px' }}>{t}</div>
  );
  const cOn = nOn(construction), pOn = nOn(planned);
  return (
    <div>
      <div style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.7, margin: '12px 0 6px' }}>New supplies</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <GroupButton label="Under construction" count={cOn} total={construction.length} allOn={cOn === construction.length}
          onClick={() => onSetGroup('construction', cOn !== construction.length)} />
        <GroupButton label="Planned" count={pOn} total={planned.length} allOn={pOn === planned.length}
          onClick={() => onSetGroup('planned', pOn !== planned.length)} />
      </div>
      <details style={{ marginTop: 8 }}>
        <summary style={{ fontSize: 11, opacity: 0.6, cursor: 'pointer', listStyle: 'none' }}>＋ Customize project expansion</summary>
        <div style={{ marginTop: 4 }}>
          {subhead('Under construction')}
          {construction.map((p) => <Row key={p.id} p={p} on={future.has(p.id)} onToggle={() => onToggle(p.id)} />)}
          {subhead('Planned')}
          {planned.map((p) => <Row key={p.id} p={p} on={future.has(p.id)} onToggle={() => onToggle(p.id)} />)}
        </div>
      </details>
      <p style={{ fontSize: 10, opacity: 0.5, margin: '6px 0 0', lineHeight: 1.4 }}>
        Operating plants are always included; toggling future supply moves the Sankey + trade-risk.
      </p>
    </div>
  );
}
