/**
 * The refinery as a Sankey: crude grades, the crude unit, its cuts,
 * conversion and upgrading units, product pools. Link widths are t/day.
 *
 * Columns are fixed by role rather than computed, so the cuts always stand
 * together and every unit sits in the same place from one configuration to the
 * next; an empty column (no coker, no aromatics) closes up. A link may skip
 * columns (vacuum residue straight to fuel oil, say); it is drawn behind.
 *
 * Tapping or clicking a node selects it: its links stay bright, the rest fade,
 * and the card under the diagram gives its throughput, capacity and
 * utilization. Hover adds a native tooltip on desktop; nothing depends on it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CUT_LABEL, END_USE, GRADE_BBL_PER_T, GRADE_LABEL, PRODUCT_BBL_PER_T, PRODUCT_COLOR, PRODUCT_LABEL, UNITS,
  type Cut, type Grade, type ProductId, type UnitId,
} from './data.ts';
import type { Family, Result } from './model.ts';
import { UNIT_INFO } from './info.ts';

type Meta = { label: string; col: number; order: number; color: string; kind: 'crude' | 'cut' | 'unit' | 'product' };

const CUT_ORDER: Cut[] = ['lpg', 'ln', 'hn', 'ker', 'go', 'vgo', 'vr'];
const CUT_COLOR: Record<Cut, string> = {
  lpg: PRODUCT_COLOR.lpg, ln: PRODUCT_COLOR.gasoline, hn: PRODUCT_COLOR.gasoline, ker: PRODUCT_COLOR.jet,
  go: PRODUCT_COLOR.diesel, vgo: PRODUCT_COLOR.fuelOil, vr: PRODUCT_COLOR.fuelOil,
};
const UNIT_COL: Record<UnitId, [number, number]> = {
  cdu: [1, 0], coker: [3, 0], sda: [3, 1], fcc: [4, 0], hck: [4, 1], lube: [4, 2],
  scr: [5, 0], isom: [5, 1], ref: [5, 2], alky: [5, 3], kht: [5, 4], dht: [5, 5], arom: [6, 0],
};
const CUT_COL = 2, PRODUCT_COL = 7;
/** Chemicals stand together at the top, then fuels light to heavy. */
const PRODUCT_ORDER: ProductId[] = ['fuelGas', 'ethylene', 'propylene', 'butadiene', 'btx', 'lpg', 'gasoline', 'naphtha', 'jet', 'diesel', 'baseOil', 'fuelOil', 'asphalt', 'coke'];
const COL_HEAD: Record<number, string> = { 0: 'Crude', 1: 'Distillation', 2: 'Cuts', 3: 'Residue', 4: 'Cracking', 5: 'Upgrading', 6: 'Aromatics', 7: 'Products' };
const linkColor = (f: Family) => (f === 'crude' ? 'var(--ink-3)' : PRODUCT_COLOR[f]);

export function nodeMeta(id: string): Meta {
  if (id.startsWith('crude_')) {
    const g = id.slice(6) as Grade;
    return { label: GRADE_LABEL[g], col: 0, order: ['ls', 'ms', 'hs'].indexOf(g), color: 'var(--ink-2)', kind: 'crude' };
  }
  if (id === 'poil') return { label: 'Plant oil', col: 0, order: 9, color: 'var(--spectral-8)', kind: 'crude' };
  if (id.startsWith('cut_')) {
    const c = id.slice(4) as Cut;
    return { label: CUT_LABEL[c], col: CUT_COL, order: CUT_ORDER.indexOf(c), color: CUT_COLOR[c], kind: 'cut' };
  }
  if (id.startsWith('p_')) {
    const p = id.slice(2) as ProductId;
    return { label: PRODUCT_LABEL[p], col: PRODUCT_COL, order: PRODUCT_ORDER.indexOf(p), color: PRODUCT_COLOR[p], kind: 'product' };
  }
  const u = id as UnitId;
  return { label: UNITS[u].short, col: UNIT_COL[u][0], order: UNIT_COL[u][1], color: 'var(--ink)', kind: 'unit' };
}

const NW = 11, PAD_T = 24, PAD_B = 6, GAP = 7, MIN_SLOT = 12;

type LNode = { id: string; meta: Meta; vin: number; vout: number; v: number; x: number; y: number; h: number };

export default function Sankey({ r, selected, onSelect, mobile }: {
  r: Result; selected: string | null; onSelect: (id: string | null) => void; mobile: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(900);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBoxW(Math.round(el.clientWidth)));
    ro.observe(el);
    setBoxW(Math.round(el.clientWidth));
    return () => ro.disconnect();
  }, []);
  const W = Math.max(mobile ? 780 : 700, boxW);
  const H = mobile ? 540 : Math.round(Math.min(560, Math.max(430, W * 0.5)));
  // Room for product labels, and for end uses when chemicals or base oil are made.
  const showUse = r.links.some((l) => l.to.startsWith('p_') && END_USE[l.to.slice(2) as ProductId] && l.t > 1e-6);
  const padR = showUse && !mobile ? 300 : showUse ? 290 : 150;

  const layout = useMemo(() => {
    const links = r.links.filter((l) => l.t > 1e-6);
    const nodes = new Map<string, LNode>();
    const node = (id: string) => {
      let n = nodes.get(id);
      if (!n) { n = { id, meta: nodeMeta(id), vin: 0, vout: 0, v: 0, x: 0, y: 0, h: 0 }; nodes.set(id, n); }
      return n;
    };
    for (const l of links) { node(l.from).vout += l.t; node(l.to).vin += l.t; }
    for (const n of nodes.values()) n.v = Math.max(n.vin, n.vout);
    const cols = [...new Set([...nodes.values()].map((n) => n.meta.col))].sort((a, b) => a - b);
    const byCol = cols.map((c) => [...nodes.values()].filter((n) => n.meta.col === c).sort((a, b) => a.meta.order - b.meta.order));
    const innerH = H - PAD_T - PAD_B;
    // Scale: the tightest column fills the height, small nodes keep a slot
    // tall enough for their label.
    let k = Math.min(...byCol.map((ns) => (innerH - GAP * (ns.length - 1)) / ns.reduce((a, n) => a + n.v, 0)));
    for (let i = 0; i < 6; i++) {
      let worst = 1;
      for (const ns of byCol) {
        const small = ns.filter((n) => n.v * k < MIN_SLOT);
        const big = ns.filter((n) => n.v * k >= MIN_SLOT).reduce((a, n) => a + n.v * k, 0);
        const room = innerH - GAP * (ns.length - 1) - small.length * MIN_SLOT;
        if (big > room && big > 0) worst = Math.min(worst, room / big);
      }
      if (worst >= 0.999) break;
      k *= worst;
    }
    const usable = W - NW - padR - 2;
    cols.forEach((c, ci) => {
      const ns = byCol[ci];
      const x = 2 + (cols.length > 1 ? (ci * usable) / (cols.length - 1) : 0);
      const slots = ns.map((n) => Math.max(n.v * k, MIN_SLOT));
      const colH = slots.reduce((a, s) => a + s, 0) + GAP * (ns.length - 1);
      let y = PAD_T + Math.max(0, (innerH - colH) / 2);
      ns.forEach((n, i) => {
        n.h = Math.max(1, n.v * k);
        n.x = x;
        n.y = y + (slots[i] - n.h) / 2;
        y += slots[i] + GAP;
      });
    });
    // Stack links on each node: outgoing by target height, incoming by source.
    const outOff = new Map<string, number>(), inOff = new Map<string, number>();
    const paths = links
      .map((l) => ({ l, s: nodes.get(l.from)!, t: nodes.get(l.to)! }))
      .sort((a, b) => a.s.y - b.s.y || a.t.y - b.t.y);
    const bySrc = [...paths].sort((a, b) => a.t.y - b.t.y);
    const sy = new Map<typeof paths[number], number>();
    for (const p of bySrc) {
      const o = outOff.get(p.s.id) ?? 0;
      sy.set(p, p.s.y + o);
      outOff.set(p.s.id, o + p.l.t * k);
    }
    const drawn = paths.map((p) => {
      const o = inOff.get(p.t.id) ?? 0;
      const ty = p.t.y + o;
      inOff.set(p.t.id, o + p.l.t * k);
      const w = p.l.t * k, y0 = sy.get(p)!, x0 = p.s.x + NW, x1 = p.t.x, mx = (x0 + x1) / 2;
      const d = `M${x0},${y0} C${mx},${y0} ${mx},${ty} ${x1},${ty} L${x1},${ty + w} C${mx},${ty + w} ${mx},${y0 + w} ${x0},${y0 + w} Z`;
      return { ...p, d, span: p.t.meta.col - p.s.meta.col };
    }).sort((a, b) => b.span - a.span);
    return { nodes: [...nodes.values()], links: drawn, cols, colX: cols.map((_, ci) => 2 + (cols.length > 1 ? (ci * usable) / (cols.length - 1) : 0)) };
  }, [r, W, H, padR]);

  const crudeT = r.crudeT || 1;
  const pct = (t: number) => {
    const v = (100 * t) / crudeT;
    return v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(1);
  };
  const lit = (from: string, to: string) => !selected || from === selected || to === selected;

  return (
    <div>
      <div ref={boxRef} style={{ overflowX: mobile ? 'auto' : 'hidden', overflowY: 'hidden', WebkitOverflowScrolling: 'touch' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img"
          aria-label="Sankey diagram of the refinery's mass flows" style={{ display: 'block', maxWidth: 'none' }}
          onClick={() => onSelect(null)}>
          {layout.cols.map((c, ci) => (
            <text key={c} x={layout.colX[ci] + (c === PRODUCT_COL ? 0 : NW / 2)} y={11} textAnchor={c === PRODUCT_COL || c === 0 ? 'start' : 'middle'}
              style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', fill: 'var(--ink-3)' }}>
              {COL_HEAD[c]}
            </text>
          ))}
          <g>
            {layout.links.map(({ l, d }) => (
              <path key={`${l.from}>${l.to}>${l.family}`} d={d} fill={linkColor(l.family)} stroke="var(--paper)" strokeWidth={0.6} strokeOpacity={0.6}
                fillOpacity={selected ? (lit(l.from, l.to) ? 0.75 : 0.1) : 0.42}
                style={{ transition: 'fill-opacity 0.15s' }}>
                <title>{`${nodeMeta(l.from).label} → ${nodeMeta(l.to).label}: ${Math.round(l.t).toLocaleString()} t/d`}</title>
              </path>
            ))}
          </g>
          {layout.nodes.map((n) => {
            const isSel = selected === n.id;
            const u = n.meta.kind === 'unit' ? r.units[n.id as UnitId] : null;
            const full = u && u.util >= 0.995;
            const last = n.meta.col === PRODUCT_COL;
            const use = last ? END_USE[n.id.slice(2) as ProductId] : undefined;
            const labelX = n.x + NW + 4;
            const cy = n.y + n.h / 2;
            return (
              <g key={n.id} style={{ cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); onSelect(isSel ? null : n.id); }}>
                <rect x={n.x - 3} y={n.y - 2} width={NW + 6} height={n.h + 4} fill="transparent" />
                <rect x={n.x} y={n.y} width={NW} height={n.h} fill={n.meta.color}
                  stroke={isSel || full ? 'var(--accent)' : 'none'} strokeWidth={isSel ? 2 : 1.5} />
                <text x={labelX} y={cy} dominantBaseline="central"
                  style={{ font: `${n.meta.kind === 'unit' || last ? 600 : 500} 10.5px var(--font-sans)`, fill: 'var(--ink)',
                           paintOrder: 'stroke', stroke: 'var(--paper)', strokeWidth: 3, strokeLinejoin: 'round' }}>
                  {n.meta.label}
                  {u && <tspan style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fill: full ? 'var(--accent)' : 'var(--ink-3)' }}>{` ${full ? 'full' : `${Math.round(u.util * 100)}%`}`}</tspan>}
                  {(last || n.meta.kind === 'crude') && <tspan style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fill: 'var(--ink-3)' }}>{` ${pct(n.v)}%`}</tspan>}
                  {use && <tspan style={{ fontWeight: 400, fontStyle: 'italic', fill: 'var(--ink-2)' }}>{` → ${use}`}</tspan>}
                </text>
                <title>{`${n.meta.label}: ${Math.round(n.v).toLocaleString()} t/d${u ? `, ${Math.round(u.util * 100)}% of capacity` : ''}. Tap for details.`}</title>
              </g>
            );
          })}
        </svg>
      </div>
      {mobile && (
        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--ink-3)' }}>Scroll sideways to see the whole refinery. Tap any bar for details.</p>
      )}
      <p style={{ margin: '4px 0 0', fontSize: 11, lineHeight: 1.4, color: 'var(--ink-3)' }}>
        Fuel gas and losses collects small streams from almost every unit; tap its bar to see them. Fertilizer (ammonia) and
        methanol do not appear because they are made mostly from natural gas, or coal in China, not from crude. Their link to a
        refinery is hydrogen, made the same way as in its hydrogen plant.
      </p>
    </div>
  );
}

// ── The card for a selected node ────────────────────────────────────────────
const fmtT = (t: number) => Math.round(t).toLocaleString();
const kbd = (t: number, bblPerT: number) => {
  const v = (t * bblPerT) / 1000;
  return v >= 10 ? v.toFixed(0) : v.toFixed(1);
};

export function NodeCard({ id, r, onClose }: { id: string; r: Result; onClose: () => void }) {
  const meta = nodeMeta(id);
  const into = r.links.filter((l) => l.to === id).reduce((m, l) => m.set(l.from, (m.get(l.from) ?? 0) + l.t), new Map<string, number>());
  const out = r.links.filter((l) => l.from === id).reduce((m, l) => m.set(l.to, (m.get(l.to) ?? 0) + l.t), new Map<string, number>());
  const tin = [...into.values()].reduce((a, b) => a + b, 0), tout = [...out.values()].reduce((a, b) => a + b, 0);
  const pctCrude = (t: number) => `${((100 * t) / (r.crudeT || 1)).toFixed(1)}% of crude`;
  let stats: string[] = [];
  let util: number | null = null;
  let desc: string | null = null;
  if (meta.kind === 'unit') {
    const u = r.units[id as UnitId];
    const bpt = UNITS[id as UnitId].feedBblPerT;
    stats = [`Feed ${fmtT(u.feed)} t/d (${kbd(u.feed, bpt)} kb/d)`, `Capacity ${kbd(u.capT, bpt)} kb/d`];
    util = u.util;
    desc = UNIT_INFO[id as UnitId];
  } else if (meta.kind === 'product') {
    const p = id.slice(2) as ProductId;
    const bpt = PRODUCT_BBL_PER_T[p];
    stats = [`${fmtT(tin)} t/d`, ...(bpt ? [`${kbd(tin, bpt)} kb/d`] : []), pctCrude(tin)];
  } else if (meta.kind === 'crude') {
    const g = id.slice(6) as Grade;
    stats = [`${fmtT(tout)} t/d`, ...(id === 'poil' ? [] : [`${kbd(tout, GRADE_BBL_PER_T[g])} kb/d`])];
  } else {
    stats = [`${fmtT(tout)} t/d`, pctCrude(tout)];
  }
  const list = (m: Map<string, number>, total: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([k, v]) => (
      <li key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <span>{nodeMeta(k).label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>{fmtT(v)} t/d · {Math.round((100 * v) / (total || 1))}%</span>
      </li>
    ));
  return (
    <div style={{ border: '1px solid var(--rule)', borderLeft: '2px solid var(--accent)', borderRadius: 4, padding: '8px 12px', marginTop: 8, background: 'var(--paper)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>
          {meta.kind === 'unit' ? UNITS[id as UnitId].label : meta.label}
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 400, fontSize: 12, color: 'var(--ink-2)', marginLeft: 8 }}>{stats.join(' · ')}</span>
        </div>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, padding: 0 }}>Close</button>
      </div>
      {util !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <div style={{ flex: 1, maxWidth: 260, height: 6, background: 'var(--paper-3)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, util * 100)}%`, height: '100%', background: util >= 0.995 ? 'var(--accent)' : 'var(--ink-2)' }} />
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{Math.round(util * 100)}% used{util >= 0.995 ? ', full' : ''}</span>
        </div>
      )}
      {desc && <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.45, color: 'var(--ink-2)' }}>{desc}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '4px 24px', marginTop: 6, fontSize: 12 }}>
        {into.size > 0 && meta.kind !== 'cut' && (
          <div><div style={{ font: '600 10px var(--font-mono)', textTransform: 'uppercase', color: 'var(--ink-3)', letterSpacing: '0.06em' }}>From</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{list(into, tin)}</ul></div>
        )}
        {out.size > 0 && (
          <div><div style={{ font: '600 10px var(--font-mono)', textTransform: 'uppercase', color: 'var(--ink-3)', letterSpacing: '0.06em' }}>To</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{list(out, tout)}</ul></div>
        )}
      </div>
    </div>
  );
}
