/**
 * Figure 1: the supply chain across the top, the rules down the side.
 *
 * Each column is a stage where carbon moves, in chain order under the scope
 * it falls in for the reporting company (the land's owner or a downstream
 * buyer). Each row is an accounting rule. The bar in a cell is what that
 * rule puts in the inventory for that stage: emissions to the right of the
 * stage's zero line, removals to the left, a dashed outline for what is
 * disclosed outside the scopes. The forest-growing bar is stacked:
 * management uptake solid, passive uptake lighter. Bars are coloured by the
 * pool they net in under that rule, so a row of one colour nets to one
 * number and a row of two colours keeps two. The wide gap at the scope
 * border says, line by line, whether emissions and removals pass across it.
 * The row ends in the number the rule leaves the company to balance.
 *
 * Values come from the rule's ledger (model.ts); nothing here decides what
 * counts.
 */
import { useState } from 'react';
import { Axe, Factory, Mountain, MoveRight, Package, Tractor, Trees, Wheat, X, type LucideIcon } from 'lucide-react';
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

/* Grid columns: 1 = rule label; then the land stages, the wide scope
   border between the land and the company's operations, the operations
   stage, the narrow border to downstream, the downstream stages, and the
   total. The land-use change and land management stages appear only when
   the scenario has those emissions, so the layout is built per render. */
function layout(stages: Stage[]) {
  const land = stages.filter((s) => s.group === 'land').length;
  const down = stages.filter((s) => s.group === 'down').length;
  const col: Record<string, number> = {};
  let k = 2;
  for (const s of stages.filter((s) => s.group === 'land')) col[s.id] = k++;
  const border1 = k++;
  for (const s of stages.filter((s) => s.group === 'ops')) col[s.id] = k++;
  const border2 = k++;
  for (const s of stages.filter((s) => s.group === 'down')) col[s.id] = k++;
  const total = k;
  const span: Record<Group, string> = { land: `2 / ${border1}`, ops: `${border1 + 1} / ${border2}`, down: `${border2 + 1} / ${total}` };
  const template = `84px repeat(${land}, minmax(0, 1fr)) 118px minmax(0, 1fr) 20px repeat(${down}, minmax(0, 1fr)) 92px`;
  return { col, border1, border2, total, span, template, minWidth: 420 + 70 * (land + 1 + down) };
}
const GROUP_LABEL = (scope: Company['scope']): Record<Group, string> =>
  scope === 'scope1'
    ? { land: 'Own land · scope 1', ops: 'Own operations · scopes 1 and 2', down: 'Downstream · scope 3' }
    : { land: 'Supplier’s land · scope 3 upstream', ops: 'Own operations · scopes 1 and 2', down: 'Downstream · scope 3' };

interface Cell {
  /** In the scopes, signed Mt. */
  value: number;
  /** Outside the scopes, signed Mt. */
  info: number;
  pool: Pool;
  detail: string;
  infoDetail: string;
  /** Forest growing only: the removal split into management and passive uptake (both ≤ 0). */
  parts?: { ifm: number; passive: number };
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
  const ifm = L.removals.find((s) => s.key === 'mgmt')?.value ?? 0;
  return [
    { value: em('luc')?.value ?? 0, info: 0, pool: p.emission, detail: one(em('luc')), infoDetail: '' },
    { value: em('ag')?.value ?? 0, info: 0, pool: p.emission, detail: one(em('ag')), infoDetail: '' },
    { value: L.removalsTotal, info: growInfo.reduce((a, s) => a + s.value, 0), pool: p.removal, detail: list(L.removals), infoDetail: list(growInfo), parts: { ifm, passive: L.removalsTotal - ifm } },
    { value: atHarvest ? forest?.value ?? 0 : 0, info: 0, pool: p.emission, detail: atHarvest ? one(forest) : '', infoDetail: '' },
    { value: L.fossil, info: 0, pool: p.fossil, detail: `Fossil and industrial ${fmt(L.fossil)}`, infoDetail: '' },
    { value: atHarvest ? 0 : forest?.value ?? 0, info: infos('hwp').reduce((a, s) => a + s.value, 0), pool: p.emission, detail: atHarvest ? '' : one(forest), infoDetail: list(infos('hwp')) },
    { value: -c.cdr, info: 0, pool: p.removal, detail: c.cdr ? `Durable removals bought ${fmt(-c.cdr)}` : '', infoDetail: '' },
  ];
}

interface Crossing { label: string; state: 'passes' | 'blocked' | 'none'; text: string }

/** What passes the border between the land and the company's operations under this rule. */
function crossings(c: Company, L: Ledger): Crossing[] {
  const grossRemovals = c.area * (c.ambient + c.legacy + c.mgmt) + c.leased * (c.ambient + c.legacy);
  const r = -L.removalsTotal;
  const short = RULES[L.rule].short;
  if (c.scope === 'scope3') {
    const em: Crossing = L.landEmissions > 0.05
      ? { label: 'emissions', state: 'passes', text: `${short}: ${fmt(L.landEmissions)} Mt of the land's emissions enter the buyer's scope 3.` }
      : { label: 'emissions', state: 'none', text: `${short}: the land has no emissions to pass on.` };
    const rm: Crossing = r > 0.05
      ? { label: 'removals', state: 'passes', text: `${short}: ${fmt(r)} Mt of removals enter the buyer's scope 3${L.netsFossil ? ' and can offset its fossil emissions' : ''}.` }
      : grossRemovals > 0.05
        ? { label: 'removals', state: 'blocked', text: `${short}: the land's ${fmt(grossRemovals)} Mt of uptake stays with the land; none enters the buyer's inventory.` }
        : { label: 'removals', state: 'none', text: `${short}: no uptake to pass on.` };
    return [em, rm];
  }
  if (grossRemovals <= 0.05) return [{ label: 'removals', state: 'none', text: `${short}: no uptake to carry.` }];
  if (L.netsFossil) return [{ label: 'removals offset fossil', state: 'passes', text: `${short}: ${fmt(r)} Mt of removals offset the company's fossil emissions.` }];
  return [{ label: 'removals offset fossil', state: 'blocked', text: `${short}: removals ${r > 0.05 ? 'net land emissions only' : 'are not counted'}; none reach fossil emissions.` }];
}

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)' };
const ROW = 36;
const HALF = 46; // % of the cell a bar may fill on either side of zero

type Focus = { text: string } | null;

export default function ChainChart({ company: c, ledgers }: { company: Company; ledgers: Ledger[] }) {
  const [focus, setFocus] = useState<Focus>(null);
  const stages = STAGES.filter((s) => (s.id === 'luc' ? c.luc > 0 : s.id === 'ag' ? c.ag > 0 : true));
  const keep = STAGES.map((s) => stages.includes(s));
  const rows = ledgers.map((L) => ({ L, cells: cells(c, L).filter((_, i) => keep[i]), x: crossings(c, L) }));
  const lay = layout(stages);
  const labels = GROUP_LABEL(c.scope);
  let maxAbs = 0.1;
  for (const r of rows) for (const k of r.cells) maxAbs = Math.max(maxAbs, Math.abs(k.value), Math.abs(k.info));
  const w = (v: number) => (Math.abs(v) / maxAbs) * HALF;
  const usedStage = stages.map((_, i) => rows.some((r) => r.cells[i].value !== 0 || r.cells[i].info !== 0));
  const usedPools = Array.from(new Set(rows.flatMap((r) => r.cells.filter((k) => k.value !== 0).map((k) => k.pool)))) as Pool[];
  const growIdx = stages.findIndex((s) => s.id === 'grow');
  const anyStacked = rows.some((r) => { const g = r.cells[growIdx]; return g.parts && g.parts.ifm < 0 && g.parts.passive < 0; });
  const firstRow = 3;
  const lastRow = firstRow + rows.length;

  const valueLabel = (v: number, width: number, top: number, h: number, info: boolean) => {
    const inside = width > HALF * 0.55;
    // Outside the bar at its far end, or just inside the end when the bar is long.
    const atEnd = v > 0 ? `calc(50% + ${width}% ${inside ? '- 3px' : '+ 3px'})` : `calc(50% - ${width}% ${inside ? '+ 3px' : '- 3px'})`;
    const flip = (v > 0) === inside; // anchor the label's right edge at the point
    return (
      <span style={{ position: 'absolute', top: top + h / 2, left: atEnd, transform: `translate(${flip ? '-100%' : '0'}, -50%)`, fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1, whiteSpace: 'nowrap', pointerEvents: 'none',
        color: inside && !info ? 'var(--paper)' : 'var(--ink-2)' }}>
        {(v > 0 ? '+' : '') + fmt(v)}
      </span>
    );
  };

  const seg = (v: number, offset: number, pool: Pool, top: number, h: number, info: boolean, light: boolean, text: string, key: string) => {
    if (v === 0) return null;
    const width = w(v);
    const side: React.CSSProperties = v > 0 ? { left: `calc(50% + ${offset}%)` } : { right: `calc(50% + ${offset}%)` };
    return (
      <div key={key} title={text} onMouseEnter={() => setFocus({ text })} onMouseLeave={() => setFocus(null)} onClick={() => setFocus({ text })}
        style={{ position: 'absolute', top, height: h, width: `${width}%`, ...side, boxSizing: 'border-box', cursor: 'default',
          background: info ? 'transparent' : POOL_COLOR[pool], opacity: light ? 0.45 : 1, border: info ? '1px dashed var(--ink-3)' : 'none', borderRadius: 1 }} />
    );
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: lay.minWidth, display: 'grid', gridTemplateColumns: lay.template, columnGap: 4, alignItems: 'stretch' }}>
        {/* row 1: scope bands */}
        {(['land', 'ops', 'down'] as Group[]).map((g) => (
          <div key={g} style={{ gridRow: 1, gridColumn: lay.span[g], borderBottom: '1px solid var(--rule-strong)', paddingBottom: 3, ...mono, color: 'var(--ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {labels[g]}
          </div>
        ))}
        {/* row 2: stages */}
        {stages.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.id} style={{ gridRow: 2, gridColumn: lay.col[s.id], display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 3, padding: '8px 0 6px', opacity: usedStage[i] ? 1 : 0.35 }}>
              <span style={{ color: 'var(--ink-2)', display: 'inline-flex' }}><Icon size={22} strokeWidth={1.5} /></span>
              <span style={{ fontSize: 11, lineHeight: 1.25, color: 'var(--ink-2)' }}>{s.label}</span>
            </div>
          );
        })}
        <div style={{ gridRow: 2, gridColumn: lay.border1, alignSelf: 'end', textAlign: 'center', paddingBottom: 6, ...mono, color: 'var(--cardinal)' }}>
          {c.scope === 'scope3' ? 'What passes to the buyer' : 'What reaches fossil'}
        </div>
        <div style={{ gridRow: 2, gridColumn: lay.total, alignSelf: 'end', textAlign: 'right', paddingBottom: 6 }}>
          <span style={{ ...mono, color: 'var(--cardinal)' }}>Left to balance</span>
          <span style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>Mt CO₂e/yr</span>
        </div>
        {/* zero lines, one per stage, and the scope borders */}
        {stages.map((s) => (
          <div key={`z-${s.id}`} aria-hidden="true" style={{ gridRow: `${firstRow} / ${lastRow}`, gridColumn: lay.col[s.id], position: 'relative', pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--rule-strong)' }} />
          </div>
        ))}
        <div aria-hidden="true" style={{ gridRow: `1 / ${lastRow}`, gridColumn: lay.border1, position: 'relative', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderLeft: '1px dashed var(--ink-4)' }} />
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, borderLeft: '1px dashed var(--ink-4)' }} />
        </div>
        <div aria-hidden="true" style={{ gridRow: `1 / ${lastRow}`, gridColumn: lay.border2, position: 'relative', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, borderLeft: '1px dashed var(--ink-4)' }} />
        </div>
        {/* rule rows */}
        {rows.map((r, ri) => {
          const row = firstRow + ri;
          const { L } = r;
          const E = L.fossil + L.landEmissions;
          const short = RULES[L.rule].short;
          return [
            <div key={`${L.rule}-l`} title={RULES[L.rule].name} style={{ gridRow: row, gridColumn: 1, height: ROW, display: 'flex', flexDirection: 'column', justifyContent: 'center', borderTop: '1px solid var(--rule)' }}>
              <span style={{ font: '600 12.5px var(--font-sans, Inter, system-ui)', color: 'var(--ink)' }}>{short}</span>
              <span style={{ fontSize: 10.5, color: 'var(--ink-4)', lineHeight: 1.2 }}>{L.netsFossil ? 'nets everything' : L.netsLand ? 'nets within land' : 'two ledgers'}</span>
            </div>,
            ...r.cells.map((k, i) => {
              const top = k.info ? 6 : 12;
              const h = 12;
              const infoTop = k.value ? 22 : 14;
              const text = `${short} · ${stages[i].label}: ${k.detail} Mt CO₂e/yr`;
              const parts = k.parts && k.parts.ifm < 0 && k.parts.passive < 0 ? k.parts : null;
              return (
                <div key={`${L.rule}-${i}`} style={{ gridRow: row, gridColumn: lay.col[stages[i].id], position: 'relative', height: ROW, borderTop: '1px solid var(--rule)' }}>
                  {parts
                    ? [
                        seg(parts.ifm, 0, k.pool, top, h, false, false, `${short} · management uptake ${fmt(parts.ifm)} Mt CO₂e/yr`, 'ifm'),
                        seg(parts.passive, w(parts.ifm), k.pool, top, h, false, true, `${short} · passive uptake ${fmt(parts.passive)} Mt CO₂e/yr (${k.detail})`, 'pas'),
                      ]
                    : seg(k.value, 0, k.pool, top, h, false, k.parts ? k.parts.passive < 0 : false, text, 'v')}
                  {k.value !== 0 && valueLabel(k.value, w(k.value), top, h, false)}
                  {seg(k.info, 0, k.pool, infoTop, 8, true, false, `${short} · ${stages[i].label}, outside the scopes: ${k.infoDetail} Mt CO₂e/yr`, 'i')}
                  {k.info !== 0 && valueLabel(k.info, w(k.info), infoTop, 8, true)}
                </div>
              );
            }),
            <div key={`${L.rule}-x`} style={{ gridRow: row, gridColumn: lay.border1, height: ROW, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, padding: '0 6px', borderTop: '1px solid var(--rule)', background: 'var(--paper-2)', zIndex: 1 }}>
              {r.x.map((x) => (
                <span key={x.label} title={x.text} onMouseEnter={() => setFocus({ text: x.text })} onMouseLeave={() => setFocus(null)} onClick={() => setFocus({ text: x.text })}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1.1, whiteSpace: 'nowrap', cursor: 'default',
                    color: x.state === 'passes' ? 'var(--ink)' : x.state === 'blocked' ? 'var(--cardinal)' : 'var(--ink-4)', textDecoration: x.state === 'blocked' ? 'line-through' : 'none' }}>
                  {x.state === 'passes' ? <MoveRight size={13} strokeWidth={2.5} /> : x.state === 'blocked' ? <X size={12} strokeWidth={2.5} /> : <span style={{ width: 12 }} />}
                  {x.label}
                </span>
              ))}
            </div>,
            <div key={`${L.rule}-t`} style={{ gridRow: row, gridColumn: lay.total, height: ROW, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', borderTop: '1px solid var(--rule)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--cardinal)' }}>{(L.position > 0.05 ? '+' : '') + fmt(L.position)}</span>
              <span style={{ fontSize: 10, color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>+{fmt(E)} / {fmt(L.removalsTotal)}</span>
            </div>,
          ];
        })}
      </div>

      <div style={{ minHeight: 20, margin: '8px 0 6px' }}>
        <p style={{ margin: 0, fontSize: 12.5, color: focus ? 'var(--ink)' : 'var(--ink-4)' }}>{focus ? focus.text : 'Hover or tap a bar or a border line for its terms.'}</p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', alignItems: 'center', fontSize: 12, color: 'var(--ink-2)' }}>
        {usedPools.map((p) => (
          <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 9, borderRadius: 1, background: POOL_COLOR[p], display: 'inline-block' }} />{POOL_LABEL[p]}
          </span>
        ))}
        {anyStacked && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-flex' }}>
              <span style={{ width: 8, height: 9, background: 'var(--ink-2)', display: 'inline-block', opacity: 0.45 }} />
              <span style={{ width: 8, height: 9, background: 'var(--ink-2)', display: 'inline-block' }} />
            </span>
            forest growing: passive uptake (light) stacked on management uptake (solid)
          </span>
        )}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink-3)' }}>
          <span style={{ width: 14, height: 9, border: '1px dashed var(--ink-3)', borderRadius: 1, display: 'inline-block' }} />disclosed outside the scopes
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <MoveRight size={13} strokeWidth={2.5} />passes the scope border
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--cardinal)' }}>
          <X size={12} strokeWidth={2.5} />does not pass
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--cardinal)' }}>+n</span>left to balance for a net-zero claim; negative is a reported surplus
        </span>
      </div>
    </div>
  );
}
