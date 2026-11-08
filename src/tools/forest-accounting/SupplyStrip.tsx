/**
 * The supply chain as a strip: where each emission or removal arises, in
 * chain order, under scope bands; which of them net against one another
 * under the chosen rule (the coloured bar under each node); and, at each
 * scope border, whether removals cross it. The node values come from the
 * rule's ledger, so the strip and Figure 1 always agree.
 */
import { Axe, Ban, Factory, Mountain, MoveRight, Package, Tractor, Trees, Wheat, type LucideIcon } from 'lucide-react';
import { RULES, fmt, type Company, type Ledger, type RuleId } from './model';

type Group = 'land' | 'ops' | 'down';
type Pool = 'all' | 'land' | 'fossil' | 'emissions' | 'removals' | 'none';

const POOL_COLOR: Record<Pool, string> = {
  all: 'var(--spectral-11)',
  land: 'var(--spectral-9)',
  fossil: 'var(--ink-3)',
  emissions: 'var(--spectral-2)',
  removals: 'var(--spectral-10)',
  none: 'transparent',
};
const POOL_LABEL: Record<Pool, string> = {
  all: 'everything nets to one number',
  land: 'land terms net together',
  fossil: 'fossil stands alone',
  emissions: 'emissions ledger',
  removals: 'removals ledger',
  none: '',
};

interface Node {
  id: string;
  label: string;
  icon: LucideIcon;
  group: Group;
  /** In the scopes, signed Mt. */
  value: number;
  /** Outside the scopes, signed Mt. */
  info: number;
  pool: Pool;
}

function pools(L: Ledger): { emission: Pool; removal: Pool; fossil: Pool } {
  if (L.netsFossil) return { emission: 'all', removal: 'all', fossil: 'all' };
  if (L.netsLand) return { emission: 'land', removal: 'land', fossil: 'fossil' };
  return { emission: 'emissions', removal: 'removals', fossil: 'emissions' };
}

function nodes(c: Company, L: Ledger): Node[] {
  const seg = (k: string) => L.emissions.find((s) => s.key === k)?.value ?? 0;
  const infoOf = (k: string) => L.info.find((s) => s.key === k)?.value ?? 0;
  const p = pools(L);
  const forestEm = seg('forest');
  const atHarvest = L.rule !== 'aba';
  return [
    { id: 'luc', label: 'Land-use change', icon: Tractor, group: 'land', value: seg('luc'), info: 0, pool: seg('luc') ? p.emission : 'none' },
    { id: 'ag', label: 'Land management', icon: Wheat, group: 'land', value: seg('ag'), info: 0, pool: seg('ag') ? p.emission : 'none' },
    { id: 'grow', label: 'Forest growing', icon: Trees, group: 'land', value: L.removalsTotal, info: infoOf('background') + infoOf('stock') + infoOf('impact'), pool: L.removalsTotal ? p.removal : 'none' },
    { id: 'harvest', label: 'Harvest', icon: Axe, group: 'land', value: atHarvest ? forestEm : 0, info: 0, pool: atHarvest && forestEm ? p.emission : 'none' },
    { id: 'ops', label: 'Processing and transport', icon: Factory, group: 'ops', value: L.fossil, info: 0, pool: L.fossil ? p.fossil : 'none' },
    { id: 'decay', label: 'Products and slash decaying', icon: Package, group: 'down', value: atHarvest ? 0 : forestEm, info: infoOf('hwp'), pool: !atHarvest && forestEm ? p.emission : 'none' },
    { id: 'cdr', label: 'Durable storage', icon: Mountain, group: 'down', value: -c.cdr, info: 0, pool: c.cdr ? p.removal : 'none' },
  ];
}

const GROUP_LABEL = (scope: Company['scope']): Record<Group, string> =>
  scope === 'scope1'
    ? { land: 'Own land · scope 1', ops: 'Operations · scopes 1 and 2', down: 'Downstream · scope 3' }
    : { land: 'Suppliers’ land · scope 3 upstream', ops: 'Own operations · scopes 1 and 2', down: 'Downstream · scope 3' };

/** What happens to removals at the border between the land and the company's operations. */
function crossing(c: Company, L: Ledger): { crosses: boolean; text: string } {
  const r = -L.removalsTotal;
  if (c.scope === 'scope3') {
    if (r <= 0.05) return { crosses: false, text: 'no removals reach the buyer' };
    return { crosses: true, text: `${fmt(r)} Mt of removals enter the buyer’s inventory${L.netsFossil ? ' and offset fossil' : ''}` };
  }
  if (r <= 0.05) return { crosses: false, text: 'no removals to carry' };
  if (L.netsFossil) return { crosses: true, text: `${fmt(r)} Mt of removals offset fossil emissions` };
  if (L.netsLand) return { crosses: false, text: 'removals net land emissions only; none reach fossil' };
  return { crosses: false, text: 'removals stay on their own ledger' };
}

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)' };

export default function SupplyStrip({ company: c, ledger: L }: { company: Company; ledger: Ledger }) {
  const ns = nodes(c, L);
  const labels = GROUP_LABEL(c.scope);
  const groups: Group[] = ['land', 'ops', 'down'];
  const x = crossing(c, L);
  const used = Array.from(new Set(ns.map((n) => n.pool).filter((p) => p !== 'none'))) as Pool[];

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 600, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', columnGap: 6, rowGap: 4 }}>
        {/* scope bands */}
        {groups.map((g) => {
          const idx = ns.map((n, i) => (n.group === g ? i : -1)).filter((i) => i >= 0);
          return (
            <div key={g} style={{ gridColumn: `${idx[0] + 1} / ${idx[idx.length - 1] + 2}`, borderBottom: '1px solid var(--rule-strong)', paddingBottom: 3, ...mono, color: 'var(--ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {labels[g]}
            </div>
          );
        })}
        {/* nodes */}
        {ns.map((n) => {
          const Icon = n.icon;
          const muted = n.value === 0 && n.info === 0;
          return (
            <div key={n.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 3, paddingTop: 6, opacity: muted ? 0.4 : 1 }}>
              <span style={{ color: n.value < 0 ? 'var(--spectral-9)' : n.value > 0 ? 'var(--ink)' : 'var(--ink-4)', display: 'inline-flex' }}>
                <Icon size={22} strokeWidth={1.5} />
              </span>
              <span style={{ fontSize: 11, lineHeight: 1.25, color: 'var(--ink-2)', minHeight: 28 }}>{n.label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: n.value < 0 ? 'var(--spectral-9)' : n.value > 0 ? 'var(--ink)' : 'var(--ink-4)' }}>
                {n.value === 0 ? '–' : (n.value > 0 ? '+' : '') + fmt(n.value)}
              </span>
              {n.info !== 0 && (
                <span title="Reported outside the scopes" style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)', border: '1px dashed var(--ink-4)', borderRadius: 2, padding: '0 4px' }}>
                  {(n.info > 0 ? '+' : '') + fmt(n.info)}
                </span>
              )}
              <span style={{ width: '100%', height: 4, borderRadius: 2, background: POOL_COLOR[n.pool], marginTop: 2 }} aria-hidden="true" />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', alignItems: 'center', marginTop: 8, minWidth: 600 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: x.crosses ? 'var(--ink)' : 'var(--ink-3)' }}>
          {x.crosses ? <MoveRight size={14} strokeWidth={2} /> : <Ban size={13} strokeWidth={1.75} />}
          At the scope border: {x.text}.
        </span>
        {used.map((p) => (
          <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-2)' }}>
            <span style={{ width: 14, height: 4, borderRadius: 2, background: POOL_COLOR[p], display: 'inline-block' }} />{POOL_LABEL[p]}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-3)' }}>
          <span style={{ width: 14, height: 10, border: '1px dashed var(--ink-4)', borderRadius: 2, display: 'inline-block' }} />outside the scopes
        </span>
      </div>
    </div>
  );
}

export function ruleTabs(shown: RuleId[], active: RuleId, set: (r: RuleId) => void) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {shown.map((r) => {
        const on = r === active;
        return (
          <button key={r} role="tab" aria-selected={on} type="button" onClick={() => set(r)}
            style={{ font: `${on ? 600 : 400} 11px var(--font-mono)`, letterSpacing: '0.08em', textTransform: 'uppercase', color: on ? 'var(--ink)' : 'var(--ink-3)', background: on ? 'var(--paper-3)' : 'transparent', border: `1px solid ${on ? 'var(--rule-strong)' : 'var(--rule)'}`, borderRadius: 4, padding: '4px 9px', cursor: 'pointer' }}>
            {RULES[r].short}
          </button>
        );
      })}
    </div>
  );
}
