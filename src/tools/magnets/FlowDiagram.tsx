/**
 * Supply-chain flow diagram for the magnet explorer.
 * Columns = regional share of production at each stage (Mining → Separation →
 * Alloy → Magnet → Demand). Ribbons = inter-regional shipments at each interface.
 * Honest about units: columns are normalized to share (production masses differ
 * by stage), ribbons show actual cross-border trade routes.
 */

type Flow = { from: string; to: string; value: number };
type Scenario = {
  production: Record<string, Record<string, number>>;
  flows: Record<string, Flow[]>;
};

const REGIONS = ['China', 'RoW', 'USA']; // top -> bottom
const REGION_COLOR: Record<string, string> = {
  China: '#D53E4F', RoW: '#FDAE61', USA: '#3288BD',
};
const STAGES = [
  { key: 'mining', label: 'Mining' },
  { key: 'separation', label: 'Separation' },
  { key: 'alloy', label: 'Alloy' },
  { key: 'magnet', label: 'Magnet' },
  { key: 'demand', label: 'Demand' },
];
const INTERFACE = ['concentrate', 'oxide', 'alloy', 'magnet']; // between stage i and i+1

const W = 880, H = 380, PADX = 70, PADY = 34, NODE_W = 15, GAP = 5;
const innerH = H - 2 * PADY;
const colX = STAGES.map((_, i) => PADX + i * ((W - 2 * PADX - NODE_W) / (STAGES.length - 1)));

export default function FlowDiagram({ sc }: { sc: Scenario }) {
  // Column values by region.
  const colVals: Record<string, number>[] = STAGES.map((stage) => {
    if (stage.key !== 'demand') {
      return Object.fromEntries(REGIONS.map((r) => [r, sc.production[r]?.[stage.key] ?? 0]));
    }
    // Demand = magnet consumption = produced + imports - exports (from magnet flows).
    const mag = sc.flows.magnet ?? [];
    return Object.fromEntries(REGIONS.map((r) => {
      const prod = sc.production[r]?.magnet ?? 0;
      const imp = mag.filter((f) => f.to === r).reduce((a, f) => a + f.value, 0);
      const exp = mag.filter((f) => f.from === r).reduce((a, f) => a + f.value, 0);
      return [r, Math.max(0, prod + imp - exp)];
    }));
  });

  // Layout: normalize each column to share; stack China/RoW/USA top->bottom.
  // segY[col][region] = { y0, y1, mid }.
  const segY = colVals.map((vals) => {
    const total = REGIONS.reduce((a, r) => a + vals[r], 0) || 1;
    const usable = innerH - GAP * (REGIONS.length - 1);
    let y = PADY;
    const out: Record<string, { y0: number; y1: number; mid: number; share: number }> = {};
    for (const r of REGIONS) {
      const h = (vals[r] / total) * usable;
      out[r] = { y0: y, y1: y + h, mid: y + h / 2, share: vals[r] / total };
      y += h + GAP;
    }
    return out;
  });

  // Ribbon thickness scale (max flow across all interfaces -> ~30px).
  const allFlows = INTERFACE.flatMap((k) => sc.flows[k] ?? []);
  const maxFlow = Math.max(1, ...allFlows.map((f) => f.value));
  const thick = (v: number) => Math.max(1.5, (v / maxFlow) * 30);

  const ribbons = INTERFACE.flatMap((iface, i) =>
    (sc.flows[iface] ?? []).map((f, j) => {
      const x1 = colX[i] + NODE_W, x2 = colX[i + 1];
      const y1 = segY[i][f.from]?.mid, y2 = segY[i + 1][f.to]?.mid;
      if (y1 == null || y2 == null) return null;
      const mx = (x1 + x2) / 2;
      return (
        <path key={`${iface}-${j}`} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
          fill="none" stroke={REGION_COLOR[f.from]} strokeWidth={thick(f.value)}
          strokeOpacity={0.4} strokeLinecap="round">
          <title>{`${f.from} → ${f.to} (${STAGES[i].label} → ${STAGES[i + 1].label}): ${f.value.toFixed(1)} kt`}</title>
        </path>
      );
    }),
  );

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
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}
        role="img" aria-label="Supply-chain flow diagram">
        {ribbons}
        {STAGES.map((stage, i) => (
          <g key={stage.key}>
            {REGIONS.map((r) => {
              const s = segY[i][r];
              if (s.y1 - s.y0 < 0.5) return null;
              return (
                <rect key={r} x={colX[i]} y={s.y0} width={NODE_W} height={s.y1 - s.y0}
                  fill={REGION_COLOR[r]} rx={2}>
                  <title>{`${r} ${stage.label}: ${(s.share * 100).toFixed(0)}% of stage`}</title>
                </rect>
              );
            })}
            <text x={colX[i] + NODE_W / 2} y={PADY - 12} textAnchor="middle"
              style={{ font: '600 11px var(--font-mono)', fill: 'var(--ink)', opacity: 0.7 }}>
              {stage.label}
            </text>
          </g>
        ))}
      </svg>
      <p style={{ fontSize: 12, opacity: 0.55, marginTop: 10, lineHeight: 1.5 }}>
        Bars show each region's <strong>share</strong> of production at a stage (the chokepoint:
        watch one region own the columns). Ribbons show <strong>inter-regional shipments</strong>,
        coloured by origin. Turn up US domestic content or the China export ban and watch the
        ribbons re-route and US gain its own columns.
      </p>
    </section>
  );
}
