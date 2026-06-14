/**
 * Bottleneck panel — where each supply-chain stage actually happens WORLDWIDE.
 * The previous "embodied in imports" framing masked the chokepoints (mining looked
 * fine because imported magnets just "appear"); this shows the global production
 * concentration by region, so China's dominance at each stage — the real
 * vulnerability the US depends on — is visible, and the US's own sliver shows how
 * little it makes domestically. Uses sc.production (final-year, by region × stage).
 */
type Scenario = { production: Record<string, Record<string, number>> };

const STAGES = [
  { key: 'mining', label: 'Mining (concentrate)' },
  { key: 'separation', label: 'Separation (oxide)' },
  { key: 'alloy', label: 'Alloy' },
  { key: 'magnet', label: 'Magnet manufacturing' },
];
// US first (green) so its small domestic sliver is visible at the left edge.
const REGIONS: [string, string, string][] = [
  ['USA', 'US-made', 'var(--brand-green)'],
  ['RoW', 'Allies (RoW)', '#FDAE61'],
  ['China', 'China', '#D53E4F'],
];

export default function ChokepointPanel({ sc }: { sc: Scenario }) {
  const stageShares = STAGES.map((s) => {
    const by = sc.production ?? {};
    const vals = REGIONS.map(([r]) => Math.max(0, by[r]?.[s.key] ?? 0));
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    return { ...s, shares: REGIONS.map(([r, lbl, c], i) => ({ r, lbl, c, v: vals[i] / total })) };
  });
  // stage the US is most exposed on = highest China share
  let worst: { label: string; china: number } | null = null;
  for (const st of stageShares) {
    const china = st.shares.find((x) => x.r === 'China')?.v ?? 0;
    if (!worst || china > worst.china) worst = { label: st.label, china };
  }

  return (
    <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20, background: 'var(--paper)', marginTop: 26 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: 0 }}>Where global supply is concentrated</h2>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, flexWrap: 'wrap' }}>
          {REGIONS.map(([r, lbl, c]) => (
            <span key={r} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
              <span style={{ opacity: 0.75 }}>{lbl}</span>
            </span>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 12.5, opacity: 0.7, margin: '0 0 16px' }}>
        Share of <em>world</em> production at each stage, by region. The more a stage is one color
        (China red), the bigger the chokepoint; the green sliver is how much the US makes itself.
        {worst && worst.china > 0.4 && (
          <> Sharpest chokepoint: <strong>{worst.label}</strong> ({(worst.china * 100).toFixed(0)}% China).</>
        )}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {stageShares.map((st) => (
          <div key={st.key} style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, textAlign: 'right', opacity: 0.85 }}>{st.label}</span>
            <div style={{ display: 'flex', height: 26, borderRadius: 5, overflow: 'hidden', border: '1px solid var(--rule)' }}>
              {st.shares.map(({ r, lbl, c, v }) => {
                if (v < 0.005) return null;
                return (
                  <div key={r} title={`${lbl}: ${(v * 100).toFixed(0)}%`}
                    style={{ width: `${v * 100}%`, background: c, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', font: '600 10px var(--font-mono)' }}>
                    {v > 0.12 ? `${(v * 100).toFixed(0)}%` : ''}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, opacity: 0.55, marginTop: 14, lineHeight: 1.5 }}>
        These are the structural bottlenecks the US is exposed to when it imports magnets or
        intermediates. The heavy rare earths (Dy/Tb) are the sharpest of all: China controls ~99% of
        global dysprosium and terbium oxide (Benchmark Mineral Intelligence, 2025), so the mining
        bar — which tracks the magnet elements Nd/Pr+Dy/Tb — is far more China-concentrated than
        total rare-earth mining (USGS 2025: China ~69%, US ~13%, Australia ~7%). The model is a
        cost-minimization that routes mining to the cheapest source (China), so the baseline
        over-concentrates there relative to real-world mining, where US/Australian mines (Mountain
        Pass, Mt Weld) produce and export regardless — a known simplification. Reshoring shows up as
        the green (US) share growing — which here needs a strong content mandate, and upstream is
        gated by the US having no <i>active</i> heavy-REE production (Round Top, TX is pre-commercial).
      </p>
    </section>
  );
}
