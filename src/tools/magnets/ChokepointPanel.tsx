/**
 * Chokepoint panel: capacity utilization (throughput / installed capacity) by
 * stage x region. Hot cells (near 100%) are the binding bottlenecks — where the
 * chain is capacity-constrained. Null = no capacity in that region/stage.
 */

type Scenario = { utilization: Record<string, Record<string, number | null>> };

const REGIONS = ['China', 'RoW', 'USA'];
const STAGES = [
  { key: 'mining', label: 'Mining' },
  { key: 'separation', label: 'Separation' },
  { key: 'alloy', label: 'Alloy' },
  { key: 'magnet', label: 'Magnet' },
];

// Warm Spectral ramp for utilization 0 -> 1 (cool/pale -> deep red chokepoint).
const STOPS: [number, [number, number, number]][] = [
  [0.0, [241, 241, 223]], [0.5, [254, 224, 139]], [0.75, [253, 174, 97]],
  [0.9, [244, 109, 67]], [1.0, [158, 1, 66]],
];
function utilColor(u: number): string {
  for (let i = 1; i < STOPS.length; i++) {
    if (u <= STOPS[i][0]) {
      const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i];
      const t = (u - a) / (b - a || 1);
      const c = ca.map((v, k) => Math.round(v + (cb[k] - v) * t));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return `rgb(${STOPS[STOPS.length - 1][1].join(',')})`;
}

export default function ChokepointPanel({ sc }: { sc: Scenario }) {
  // Find the binding chokepoint (highest utilization across stage x region).
  let top: { stage: string; region: string; u: number } | null = null;
  for (const r of REGIONS) for (const s of STAGES) {
    const u = sc.utilization[r]?.[s.key];
    if (u != null && (!top || u > top.u)) top = { stage: s.label, region: r, u };
  }

  return (
    <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20, background: 'var(--paper)', marginTop: 26 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: 0 }}>Choke points · capacity utilization</h2>
        {top && (
          <span style={{ fontSize: 12.5 }}>
            <span style={{ opacity: 0.6 }}>Most binding: </span>
            <span style={{ fontWeight: 600 }}>{top.region} {top.stage}</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: utilColor(top.u), fontWeight: 700 }}> {(top.u * 100).toFixed(0)}%</span>
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `92px repeat(${REGIONS.length}, 1fr)`, gap: 4 }}>
        <div />
        {REGIONS.map((r) => (
          <div key={r} style={{ textAlign: 'center', font: '600 11px var(--font-mono)', opacity: 0.6, paddingBottom: 4 }}>{r}</div>
        ))}
        {STAGES.map((s) => (
          <Row key={s.key} label={s.label} stageKey={s.key} sc={sc} />
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <span style={{ fontSize: 11, opacity: 0.55 }}>0%</span>
        <div style={{ flex: 1, height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((u) => utilColor(u)).join(',')})` }} />
        <span style={{ fontSize: 11, opacity: 0.55 }}>100% (binding)</span>
      </div>
      <p style={{ fontSize: 12, opacity: 0.55, marginTop: 10, lineHeight: 1.5 }}>
        Each cell is a region's capacity utilization at a stage. Cells near 100% are
        the binding choke points; blank cells mean no capacity is built there. The
        heavy-rare-earth squeeze shows up as hot separation and mining cells.
      </p>
    </section>
  );
}

function Row({ label, stageKey, sc }: { label: string; stageKey: string; sc: Scenario }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 10, font: '600 12px var(--font-mono)', opacity: 0.7 }}>{label}</div>
      {REGIONS.map((r) => {
        const u = sc.utilization[r]?.[stageKey];
        if (u == null) {
          return <div key={r} title={`${r} ${label}: no capacity`} style={{ height: 44, borderRadius: 6, border: '1px dashed var(--rule)', display: 'grid', placeItems: 'center', color: 'var(--ink)', opacity: 0.3, fontFamily: 'var(--font-mono)', fontSize: 13 }}>—</div>;
        }
        return (
          <div key={r} title={`${r} ${label}: ${(u * 100).toFixed(0)}% utilized`}
            style={{ height: 44, borderRadius: 6, background: utilColor(u), display: 'grid', placeItems: 'center', font: '600 14px var(--font-mono)', color: u > 0.62 ? '#fff' : '#181838' }}>
            {(u * 100).toFixed(0)}%
          </div>
        );
      })}
    </>
  );
}
