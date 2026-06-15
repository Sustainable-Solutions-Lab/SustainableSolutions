/**
 * Compact real-world-projects control for the supply-explorer scenario aside.
 * Operating plants are always included (they won't stop operating), so only the
 * UNCERTAIN future supply — under construction / planned — is selectable, tucked
 * behind an expander to save space. The active set drives the real-world-anchored
 * Sankey + the country-level trade-risk HHI.
 */
import { useState } from 'react';
import { FUTURE_PROJECTS, type Project, type Stage } from './projects';

const STAGE_SHORT: Record<Stage, string> = {
  mining: 'mine', separation: 'sep', alloy: 'alloy', magnet: 'magnet', recycling: 'recyc',
};
const BLOC_DOT: Record<string, string> = { us: '#8C1515', allied: '#3288BD', china: '#D53E4F', nonaligned: '#9A9AB0' };

function Row({ p, on, onToggle }: { p: Project; on: boolean; onToggle: () => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 4, fontSize: 12, cursor: 'pointer', lineHeight: 1.25 }}
      title={p.note}>
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

export default function ProjectsAside({ future, onToggle }: {
  future: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const construction = FUTURE_PROJECTS.filter((p) => p.status === 'construction');
  const planned = FUTURE_PROJECTS.filter((p) => p.status === 'planned');
  const subhead = (t: string) => (
    <div style={{ font: '600 9.5px var(--font-mono)', letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.55, margin: '8px 0 4px' }}>{t}</div>
  );
  return (
    <div>
      <div style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.7, margin: '12px 0 6px' }}>New supplies</div>
      <details onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary style={{ fontSize: 11.5, opacity: 0.7, cursor: 'pointer', listStyle: 'none' }}>
          {open ? '－' : '＋'} Under construction / planned <span style={{ opacity: 0.6 }}>({future.size} on)</span>
        </summary>
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
