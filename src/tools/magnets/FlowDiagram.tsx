/**
 * Supply-chain Sankey for the magnet explorer.
 * Columns (Concentrate → Separation → Alloy → Magnet → Demand) are normalized to
 * the same height; each is split by region's share of production at that stage.
 * Ribbons are proportional flows (incl. same-region / domestic), stacked so each
 * region's outgoing ribbons fill its bar. Honest caveat: recovery losses and unit
 * changes between stages mean it conserves per-interface, not strictly end-to-end.
 */

type Flow = { from: string; to: string; value: number };
type Scenario = {
  production: Record<string, Record<string, number>>;
  flows: Record<string, Flow[]>;
};

const REGIONS = ['China', 'RoW', 'USA'];
const REGION_COLOR: Record<string, string> = { China: '#D53E4F', RoW: '#FDAE61', USA: '#3288BD' };
// column key in production (+ computed demand) and the interface feeding the NEXT column
const COLS = [
  { key: 'mining', label: 'Concentrate', iface: 'concentrate' },
  { key: 'separation', label: 'Separation', iface: 'oxide' },
  { key: 'alloy', label: 'Alloy', iface: 'alloy' },
  { key: 'magnet', label: 'Magnet', iface: 'magnet' },
  { key: 'demand', label: 'Demand', iface: null as string | null },
];

const W = 900, H = 400, PADX = 64, PADY = 30, NODE_W = 14;
const innerH = H - 2 * PADY;
const colX = COLS.map((_, i) => PADX + i * ((W - 2 * PADX - NODE_W) / (COLS.length - 1)));

function colValues(sc: Scenario, key: string): Record<string, number> {
  if (key !== 'demand') return Object.fromEntries(REGIONS.map((r) => [r, sc.production[r]?.[key] ?? 0]));
  const mag = sc.flows.magnet ?? [];
  return Object.fromEntries(REGIONS.map((r) => {
    const prod = sc.production[r]?.magnet ?? 0;
    const imp = mag.filter((f) => f.to === r && f.from !== r).reduce((a, f) => a + f.value, 0);
    const exp = mag.filter((f) => f.from === r && f.to !== r).reduce((a, f) => a + f.value, 0);
    return [r, Math.max(0, prod + imp - exp)];
  }));
}

export default function FlowDiagram({ sc }: { sc: Scenario }) {
  // Column layout: contiguous region segments, normalized to innerH.
  const segY = COLS.map((c) => {
    const vals = colValues(sc, c.key);
    const total = REGIONS.reduce((a, r) => a + vals[r], 0) || 1;
    let y = PADY;
    const out: Record<string, { y0: number; y1: number }> = {};
    for (const r of REGIONS) { const h = (vals[r] / total) * innerH; out[r] = { y0: y, y1: y + h }; y += h; }
    return out;
  });

  // Ribbons: per interface, proportional + stacked on both ends (domestic first).
  const ribbons: JSX.Element[] = [];
  COLS.forEach((c, i) => {
    if (!c.iface) return;
    const flows = (sc.flows[c.iface] ?? []).slice();
    const total = flows.reduce((a, f) => a + f.value, 0);
    if (total <= 0) return;
    const scale = innerH / total;
    const srcCum: Record<string, number> = Object.fromEntries(REGIONS.map((r) => [r, segY[i][r].y0]));
    const tgtCum: Record<string, number> = Object.fromEntries(REGIONS.map((r) => [r, segY[i + 1][r].y0]));
    for (const src of REGIONS) {
      const outs = flows.filter((f) => f.from === src)
        .sort((a, b) => (a.to === src ? -1 : b.to === src ? 1 : REGIONS.indexOf(a.to) - REGIONS.indexOf(b.to)));
      for (const f of outs) {
        const w = f.value * scale;
        const x1 = colX[i] + NODE_W, x2 = colX[i + 1];
        const sy = srcCum[src], ty = tgtCum[f.to];
        srcCum[src] += w; tgtCum[f.to] += w;
        const mx = (x1 + x2) / 2;
        const domestic = f.from === f.to;
        ribbons.push(
          <path key={`${c.iface}-${f.from}-${f.to}`}
            d={`M${x1},${sy} C${mx},${sy} ${mx},${ty} ${x2},${ty} L${x2},${ty + w} C${mx},${ty + w} ${mx},${sy + w} ${x1},${sy + w} Z`}
            fill={REGION_COLOR[src]} fillOpacity={domestic ? 0.22 : 0.5}>
            <title>{`${f.from}${domestic ? ' (domestic)' : ` → ${f.to}`}: ${f.value.toFixed(1)} kt`}</title>
          </path>,
        );
      }
    }
  });

  return (
    <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20, background: 'var(--paper)', marginTop: 26 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: 0 }}>Supply-chain flows</h2>
        <div style={{ display: 'flex', gap: 14 }}>
          {REGIONS.map((r) => (
            <span key={r} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: REGION_COLOR[r] }} />
              <span style={{ opacity: 0.75 }}>{r}</span>
            </span>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }} role="img" aria-label="Supply-chain Sankey">
        {ribbons}
        {COLS.map((c, i) => (
          <g key={c.key}>
            {REGIONS.map((r) => {
              const s = segY[i][r];
              if (s.y1 - s.y0 < 0.6) return null;
              return <rect key={r} x={colX[i]} y={s.y0} width={NODE_W} height={s.y1 - s.y0} fill={REGION_COLOR[r]} stroke="var(--paper)" strokeWidth={1} />;
            })}
            <text x={colX[i] + NODE_W / 2} y={PADY - 10} textAnchor="middle" style={{ font: '600 11px var(--font-mono)', fill: 'var(--ink)', opacity: 0.7 }}>{c.label}</text>
          </g>
        ))}
      </svg>
      <p style={{ fontSize: 12, opacity: 0.55, marginTop: 10, lineHeight: 1.5 }}>
        Bars: each region's share of production at a stage (watch one region own the columns — the
        chokepoint). Ribbons: shipments coloured by origin; faded ribbons stay in-region (domestic),
        solid ones cross borders. Raise US domestic content or the China export ban and watch borders
        close. Widths are proportional within each interface; recovery losses between stages mean it
        isn't strictly mass-conserving end to end.
      </p>
    </section>
  );
}
