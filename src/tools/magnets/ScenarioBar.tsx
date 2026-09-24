/**
 * The scenario coordinate bar — where you are in the eight-dimensional grid.
 *
 * Every result in this tool is one cell of an 8-axis solved grid, but the controls
 * never showed the coordinates. Two axes (dytb, dscale) have no slider at all:
 * they are DERIVED from the Demand Builder, so you could only discover their value
 * by reading one line of small text. That opacity is not cosmetic. A quarter of the
 * grid (every cell at dytb=1.15) was a silent duplicate of dytb=1.0 for months and
 * nobody noticed, because nothing here ever told you which slice you were looking
 * at. See docs/13_explorer_redesign.md in the model repo.
 *
 * Each chip shows the axis, its value, and a track carrying the solved grid points.
 * A hollow dot means the value sits BETWEEN solved cells and is interpolated.
 */
import { AXIS_DOMAIN } from './interp';

export type AxisKey = 'make' | 'source' | 'rec' | 'dytb' | 'china' | 'rcost' | 'dscale' | 'pfloor';

const LABEL: Record<AxisKey, string> = {
  make: 'US-made', source: 'Non-China ore', rec: 'Recycling', dytb: 'Dy/Tb intensity',
  china: 'China restriction', rcost: 'Recycling cost', dscale: 'Demand scale', pfloor: 'Price floor',
};
const pct = (v: number) => `${Math.round(v * 100)}%`;
const FMT: Record<AxisKey, (v: number) => string> = {
  make: pct, source: pct, rec: pct, china: pct, pfloor: pct,
  dytb: (v) => `${v.toFixed(2)}×`, dscale: (v) => `${v.toFixed(2)}×`, rcost: (v) => `${v.toFixed(1)}×`,
};
/** Axes with no control of their own — computed from the Demand Builder. */
const DERIVED: AxisKey[] = ['dytb', 'dscale'];
const ORDER: AxisKey[] = ['china', 'make', 'source', 'rec', 'rcost', 'pfloor', 'dytb', 'dscale'];

const EPS = 1e-9;

function Chip({ axis, value, onJump }: { axis: AxisKey; value: number; onJump?: () => void }) {
  const dom = AXIS_DOMAIN[axis] ?? [0];
  const lo = dom[0], hi = dom[dom.length - 1];
  const span = hi - lo || 1;
  const at = (v: number) => `${((v - lo) / span) * 100}%`;
  const exact = dom.some((d) => Math.abs(d - value) < 1e-6);
  const derived = DERIVED.includes(axis);
  const clamped = Math.max(lo, Math.min(hi, value));
  return (
    <div
      onClick={derived ? onJump : undefined}
      title={derived
        ? `${LABEL[axis]} is computed from the Demand Builder, not set directly. Solved at: ${dom.join(', ')}`
        : `${LABEL[axis]} — solved at: ${dom.join(', ')}`}
      style={{
        flex: '1 1 104px', minWidth: 104, padding: '5px 8px 7px', borderRadius: 7,
        border: '1px solid var(--rule)', background: 'var(--paper)',
        cursor: derived && onJump ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 4 }}>
        <span style={{ font: '600 8.5px var(--font-mono)', letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.55, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {LABEL[axis]}
        </span>
        {derived && (
          <span style={{ font: '600 7.5px var(--font-mono)', padding: '0 3px', borderRadius: 3, border: '1px solid var(--rule-strong)', opacity: 0.6, flexShrink: 0 }}>fx</span>
        )}
      </div>
      <div style={{ font: '600 12px var(--font-mono)', marginTop: 1, color: 'var(--ink)' }}>
        {FMT[axis](value)}
        {!exact && <span style={{ fontSize: 9, opacity: 0.45, marginLeft: 3 }}>interp</span>}
      </div>
      {/* domain track: ticks are solved cells, the dot is you */}
      <div style={{ position: 'relative', height: 9, marginTop: 3 }}>
        <div style={{ position: 'absolute', top: 4, left: 0, right: 0, height: 1, background: 'var(--rule-strong)', opacity: 0.5 }} />
        {dom.map((d) => (
          <span key={d} style={{
            position: 'absolute', top: 2, left: at(d), width: 1, height: 5,
            background: 'var(--ink)', opacity: 0.3, transform: 'translateX(-0.5px)',
          }} />
        ))}
        <span style={{
          position: 'absolute', top: 1.5, left: at(clamped), width: 7, height: 7, borderRadius: '50%',
          transform: 'translateX(-3.5px)', boxSizing: 'border-box',
          border: `1.5px solid ${derived ? 'var(--ink)' : 'var(--accent)'}`,
          background: exact ? (derived ? 'var(--ink)' : 'var(--accent)') : 'var(--paper)',
        }} />
      </div>
    </div>
  );
}

export default function ScenarioBar(
  { values, onJumpToDemand }: { values: Record<AxisKey, number>; onJumpToDemand?: () => void },
) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
      {ORDER.map((a) => (
        <Chip key={a} axis={a} value={values[a] ?? 0} onJump={onJumpToDemand} />
      ))}
    </div>
  );
}

/** True when two coordinate sets differ on an axis — used by the compare readout. */
export function axisDiff(a: Record<AxisKey, number>, b: Record<AxisKey, number>): AxisKey[] {
  return ORDER.filter((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) > EPS);
}

export { LABEL as AXIS_LABEL, FMT as AXIS_FMT, ORDER as AXIS_ORDER };
