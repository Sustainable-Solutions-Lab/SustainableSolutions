/**
 * Figure 1: the supply chain across the top, the rules down the side.
 *
 * Each column is a stage where carbon moves, in chain order under the scope
 * it falls in. Each row is an accounting rule. The bar in a cell is what
 * that rule puts in the inventory for that stage: emissions to the right of
 * the stage's zero line, removals to the left, a dashed outline for what is
 * disclosed outside the scopes. Bars are coloured by the pool they net in
 * under that rule, so a row of one colour nets to one number and a row of
 * two colours keeps two. In the gap at the scope border an arrow says
 * whether removals cross it. The row ends in the number the rule leaves
 * the company to balance.
 *
 * Values come from the rule's ledger (model.ts); nothing here decides what
 * counts.
 */
import { useState } from 'react';
import { Axe, Ban, Factory, Mountain, MoveRight, Package, Tractor, Trees, Wheat, type LucideIcon } from 'lucide-react';
import { RULES, fmt, type Company, type Ledger } from './model';

type Group = 'land' | 'ops' | 'down';
type Pool = 'all' | 'land' | 'fossil' | 'emissions' | 'removals';

export const POOL_COLOR: Record<Pool, string> = {
  all: 'var(--spectral-11)',
  land: 'var(--spectral-9)',
  fossil: 'var(--ink-3)',
  emissions: 'var(--spectral-2)',
  removals: 'var(--spectral-10)',
};
export const POOL_LABEL: Record<Pool, string> = {
  all: 'everything nets to one number',
  land: 'land terms net together',
  fossil: 'fossil stands alone',
  emissions: 'emissions ledger',
  removals: 'removals ledger',
};

interface Stage { id: string; label: string; icon: LucideIcon; group: Group }
const STAGES: Stage[] = [
  { id: 'luc', label: 'Land-use change', icon: Tractor, group: 'land' },
  { id: 'ag', label: 'Land management', icon: Wheat, group: 'land' },
  { id: 'grow', label: 'Forest growing', icon: Trees, group: 'land' },
  { id: 'harvest', label: 'Harvest', icon: Axe, group: 'land' },
  { id: 'ops', label: 'Processing and transport', icon: Factory, group: 'ops' },
  { id: 'decay', label: 'Products and slash decaying', icon: Package, group: 'down' },
  { id: 'cdr', label: 'Durable storage', icon: Mountain, group: 'down' },
];

/* Grid columns: 1 = rule label; stages sit in 2–5, 7 and 9–10; 6 and 8 are
   the scope borders; 11 = the total. */
const COL = (i: number) => (i < 4 ? i + 2 : i === 4 ? 7 : i + 4);
const TEMPLATE = '84px repeat(4, minmax(0, 1fr)) 24px minmax(0, 1fr) 24px repeat(2, minmax(0, 1fr)) 92px';
const GROUP_SPAN: Record<Group, string> = { land: '2 / 6', ops: '7 / 8', down: '9 / 11' };
const GROUP_LABEL = (scope: Company['scope']): Record<Group, string> =>
  scope === 'scope1'
    ? { land: 'Own land · scope 1', ops: 'Operations · scopes 1 and 2', down: 'Downstream · scope 3' }
    : { land: 'Suppliers’ land · scope 3 upstream', ops: 'Own operations · scopes 1 and 2', down: 'Downstream · scope 3' };

interface Cell {
  /** In the scopes, signed Mt. */
  value: number;
  /** Outside the scopes, signed Mt. */
  info: number;
  pool: Pool;
  detail: string;
  infoDetail: string;
}

function pools(L: Ledger): { emission: Pool; removal: Pool; fossil: Pool } {
  if (L.netsFossil) return { emission: 'all', removal: 'all', fossil: 'all' };
  if (L.netsLand) return { emission: 'land', removal: 'land', fossil: 'fossil' };
  return { emission: 'emissions', removal: 'removals', fossil: 'emissions' };
}

function cells(c: Company, L: Ledger): Cell[] {
  const em = (k: string) => L.emissions.find((s) => s.key === k);
  const infos = (...ks: string[]) => L.info.filter((s) => ks.includes(s.key));
  const p = pools(L);
  const forest = em('forest');
  const atHarvest = L.rule !== 'aba';
  const list = (xs: { label: string; value: number }[]) => xs.map((s) => `${s.label} ${fmt(s.value)}`).join('; ');
  const one = (s?: { label: string; value: number }) => (s ? `${s.label} ${fmt(s.value)}` : '');
  const growInfo = infos('background', 'stock', 'impact');
  return [
    { value: em('luc')?.value ?? 0, info: 0, pool: p.emission, detail: one(em('luc')), infoDetail: '' },
    { value: em('ag')?.value ?? 0, info: 0, pool: p.emission, detail: one(em('ag')), infoDetail: '' },
    { value: L.removalsTotal, info: growInfo.reduce((a, s) => a + s.value, 0), pool: p.removal, detail: list(L.removals), infoDetail: list(growInfo) },
    { value: atHarvest ? forest?.value ?? 0 : 0, info: 0, pool: p.emission, detail: atHarvest ? one(forest) : '', infoDetail: '' },
    { value: L.fossil, info: 0, pool: p.fossil, detail: `Fossil and industrial ${fmt(L.fossil)}`, infoDetail: '' },
    { value: atHarvest ? 0 : forest?.value ?? 0, info: infos('hwp').reduce((a, s) => a + s.value, 0), pool: p.emission, detail: atHarvest ? '' : one(forest), infoDetail: list(infos('hwp')) },
    { value: -c.cdr, info: 0, pool: p.removal, detail: c.cdr ? `Durable removals bought ${fmt(-c.cdr)}` : '', infoDetail: '' },
  ];
}

/** Whether removals cross the border between the land and the company's operations under this rule. */
function crossing(c: Company, L: Ledger): { crosses: boolean; text: string } {
  const r = -L.removalsTotal;
  if (c.scope === 'scope3') {
    if (r <= 0.05) return { crosses: false, text: 'No removals reach the buyer.' };
    return { crosses: true, text: `${fmt(r)} Mt of removals enter the buyer’s inventory${L.netsFossil ? ' and offset fossil emissions' : ''}.` };
  }
  if (r <= 0.05) return { crosses: false, text: 'No removals to carry.' };
  if (L.netsFossil) return { crosses: true, text: `${fmt(r)} Mt of removals offset fossil emissions.` };
  if (L.netsLand) return { crosses: false, text: 'Removals net land emissions only; none reach fossil.' };
  return { crosses: false, text: 'Removals stay on their own ledger.' };
}

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)' };
const ROW = 34;
const HALF = 46; // % of the cell a bar may fill on either side of zero

type Focus = { text: string } | null;

export default function ChainChart({ company: c, ledgers }: { company: Company; ledgers: Ledger[] }) {
  const [focus, setFocus] = useState<Focus>(null);
  const rows = ledgers.map((L) => ({ L, cells: cells(c, L), x: crossing(c, L) }));
  const labels = GROUP_LABEL(c.scope);
  let maxAbs = 0.1;
  for (const r of rows) for (const k of r.cells) maxAbs = Math.max(maxAbs, Math.abs(k.value), Math.abs(k.info));
  const w = (v: number) => (Math.abs(v) / maxAbs) * HALF;
  const usedStage = STAGES.map((_, i) => rows.some((r) => r.cells[i].value !== 0 || r.cells[i].info !== 0));
  const usedPools = Array.from(new Set(rows.flatMap((r) => r.cells.filter((k) => k.value !== 0).map((k) => k.pool)))) as Pool[];
  const anyCross = rows.some((r) => r.x.crosses);
  const firstRow = 3;
  const lastRow = firstRow + rows.length;

  const bar = (v: number, pool: Pool, top: number, h: number, info: boolean, text: string, key: string) => {
    if (v === 0) return null;
    const width = w(v);
    const inside = width > HALF * 0.55;
    const label = (v > 0 ? '+' : '') + fmt(v);
    const side: React.CSSProperties = v > 0 ? { left: '50%' } : { right: '50%' };
    return (
      <div key={key} title={text} onMouseEnter={() => setFocus({ text })} onMouseLeave={() => setFocus(null)} onClick={() => setFocus({ text })}
        style={{ position: 'absolute', top, height: h, width: `${width}%`, ...side, boxSizing: 'border-box',
          background: info ? 'transparent' : POOL_COLOR[pool], border: info ? '1px dashed var(--ink-3)' : 'none', borderRadius: 1, cursor: 'default' }}>
        <span style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1, whiteSpace: 'nowrap',
          color: inside && !info ? 'var(--paper)' : 'var(--ink-2)',
          ...(v > 0 ? (inside ? { right: 3 } : { left: '100%', paddingLeft: 3 }) : inside ? { left: 3 } : { right: '100%', paddingRight: 3 }) }}>
          {label}
        </span>
      </div>
    );
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 640, display: 'grid', gridTemplateColumns: TEMPLATE, columnGap: 4, alignItems: 'stretch' }}>
        {/* row 1: scope bands */}
        {(['land', 'ops', 'down'] as Group[]).map((g) => (
          <div key={g} style={{ gridRow: 1, gridColumn: GROUP_SPAN[g], borderBottom: '1px solid var(--rule-strong)', paddingBottom: 3, ...mono, color: 'var(--ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {labels[g]}
          </div>
        ))}
        {/* row 2: stages */}
        {STAGES.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.id} style={{ gridRow: 2, gridColumn: COL(i), display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 3, padding: '8px 0 6px', opacity: usedStage[i] ? 1 : 0.35 }}>
              <span style={{ color: 'var(--ink-2)', display: 'inline-flex' }}><Icon size={22} strokeWidth={1.5} /></span>
              <span style={{ fontSize: 11, lineHeight: 1.25, color: 'var(--ink-2)' }}>{s.label}</span>
            </div>
          );
        })}
        <div style={{ gridRow: 2, gridColumn: 11, alignSelf: 'end', textAlign: 'right', paddingBottom: 6 }}>
          <span style={{ ...mono, color: 'var(--cardinal)' }}>Left to balance</span>
          <span style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>Mt CO₂e/yr</span>
        </div>
        {/* zero lines, one per stage, and the scope borders */}
        {STAGES.map((s, i) => (
          <div key={`z-${s.id}`} aria-hidden="true" style={{ gridRow: `${firstRow} / ${lastRow}`, gridColumn: COL(i), position: 'relative', pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--rule-strong)' }} />
          </div>
        ))}
        {[6, 8].map((col) => (
          <div key={`b-${col}`} aria-hidden="true" style={{ gridRow: `1 / ${lastRow}`, gridColumn: col, position: 'relative', pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, borderLeft: '1px dashed var(--ink-4)' }} />
          </div>
        ))}
        {/* rule rows */}
        {rows.map((r, ri) => {
          const row = firstRow + ri;
          const { L } = r;
          const E = L.fossil + L.landEmissions;
          return [
            <div key={`${L.rule}-l`} style={{ gridRow: row, gridColumn: 1, height: ROW, display: 'flex', flexDirection: 'column', justifyContent: 'center', borderTop: '1px solid var(--rule)' }}>
              <span style={{ font: '600 12.5px var(--font-sans, Inter, system-ui)', color: 'var(--ink)' }}>{RULES[L.rule].short}</span>
              <span style={{ fontSize: 10.5, color: 'var(--ink-4)', lineHeight: 1.2 }}>{L.netsFossil ? 'nets everything' : L.netsLand ? 'nets within land' : 'two ledgers'}</span>
            </div>,
            ...r.cells.map((k, i) => (
              <div key={`${L.rule}-${i}`} style={{ gridRow: row, gridColumn: COL(i), position: 'relative', height: ROW, borderTop: '1px solid var(--rule)' }}>
                {bar(k.value, k.pool, k.info ? 6 : 11, 11, false, `${RULES[L.rule].short} · ${STAGES[i].label}: ${k.detail} Mt CO₂e/yr`, 'v')}
                {bar(k.info, k.pool, k.value ? 20 : 13, 8, true, `${RULES[L.rule].short} · ${STAGES[i].label}, outside the scopes: ${k.infoDetail} Mt CO₂e/yr`, 'i')}
              </div>
            )),
            <div key={`${L.rule}-x`} title={r.x.text} onMouseEnter={() => setFocus({ text: `${RULES[L.rule].short} · ${r.x.text}` })} onMouseLeave={() => setFocus(null)}
              style={{ gridRow: row, gridColumn: 6, height: ROW, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid var(--rule)', color: r.x.crosses ? 'var(--ink)' : 'var(--ink-4)', background: 'var(--paper-2)', zIndex: 1 }}>
              {r.x.crosses ? <MoveRight size={15} strokeWidth={2.25} /> : -L.removalsTotal > 0.05 ? <Ban size={12} strokeWidth={1.5} /> : null}
            </div>,
            <div key={`${L.rule}-t`} style={{ gridRow: row, gridColumn: 11, height: ROW, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', borderTop: '1px solid var(--rule)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--cardinal)' }}>{(L.position > 0.05 ? '+' : '') + fmt(L.position)}</span>
              <span style={{ fontSize: 10, color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>+{fmt(E)} / {fmt(L.removalsTotal)}</span>
            </div>,
          ];
        })}
      </div>

      <div style={{ minHeight: 20, margin: '8px 0 6px' }}>
        <p style={{ margin: 0, fontSize: 12.5, color: focus ? 'var(--ink)' : 'var(--ink-4)' }}>{focus ? focus.text : 'Hover or tap a bar for its terms.'}</p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', alignItems: 'center', fontSize: 12, color: 'var(--ink-2)' }}>
        {usedPools.map((p) => (
          <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 9, borderRadius: 1, background: POOL_COLOR[p], display: 'inline-block' }} />{POOL_LABEL[p]}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink-3)' }}>
          <span style={{ width: 14, height: 9, border: '1px dashed var(--ink-3)', borderRadius: 1, display: 'inline-block' }} />disclosed outside the scopes
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: anyCross ? 'var(--ink-2)' : 'var(--ink-3)' }}>
          <MoveRight size={14} strokeWidth={2.25} />removals cross the scope border
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--cardinal)' }}>+n</span>left to balance for a net-zero claim; a negative number is a reported surplus
        </span>
      </div>
    </div>
  );
}
