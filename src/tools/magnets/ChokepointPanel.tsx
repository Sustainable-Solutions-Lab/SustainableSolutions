/**
 * Chokepoint panel — US-demand self-sufficiency by stage.
 * For each supply-chain stage, the split between US-made and imported as a share
 * of what the US needs (sums to 100%). The stage with the most "imported" is the
 * binding chokepoint for US supply security; raise domestic content / recycling
 * and watch the green grow.
 */

type Scenario = { us_supply: Record<string, { domestic: number; imported: number }> };

const STAGES = [
  { key: 'mining', label: 'Mining (Dy/Tb + Nd/Pr ore)' },
  { key: 'separation', label: 'Separation' },
  { key: 'alloy', label: 'Alloy' },
  { key: 'magnet', label: 'Magnet' },
];
const DOMESTIC = 'var(--brand-green)';
const IMPORT = '#D53E4F';

export default function ChokepointPanel({ sc }: { sc: Scenario }) {
  // Binding chokepoint = stage with the most imported share.
  let top: { label: string; imp: number } | null = null;
  for (const s of STAGES) {
    const imp = sc.us_supply?.[s.key]?.imported ?? 0;
    if (!top || imp > top.imp) top = { label: s.label, imp };
  }

  return (
    <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20, background: 'var(--paper)', marginTop: 26 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: 0 }}>US supply security by stage</h2>
        <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: DOMESTIC }} /><span style={{ opacity: 0.75 }}>US-made</span></span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: IMPORT }} /><span style={{ opacity: 0.75 }}>Imported</span></span>
        </div>
      </div>
      <p style={{ fontSize: 12.5, opacity: 0.7, margin: '0 0 16px' }}>
        Share of US demand met domestically vs by imports, at each stage of the chain.
        {top && top.imp > 0.5 && (
          <> Most import-dependent: <strong>{top.label}</strong> ({(top.imp * 100).toFixed(0)}% imported).</>
        )}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {STAGES.map((s) => {
          const d = sc.us_supply?.[s.key]?.domestic ?? 0;
          const im = sc.us_supply?.[s.key]?.imported ?? 1;
          return (
            <div key={s.key} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, textAlign: 'right', opacity: 0.85 }}>{s.label}</span>
              <div style={{ display: 'flex', height: 26, borderRadius: 5, overflow: 'hidden', border: '1px solid var(--rule)' }}>
                <div title={`US-made: ${(d * 100).toFixed(0)}%`} style={{ width: `${d * 100}%`, background: DOMESTIC, display: 'flex', alignItems: 'center', paddingLeft: 7, color: '#fff', font: '600 11px var(--font-mono)' }}>
                  {d > 0.12 ? `${(d * 100).toFixed(0)}%` : ''}
                </div>
                <div title={`Imported: ${(im * 100).toFixed(0)}%`} style={{ width: `${im * 100}%`, background: IMPORT, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 7, color: '#fff', font: '600 11px var(--font-mono)' }}>
                  {im > 0.12 ? `${(im * 100).toFixed(0)}%` : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 12, opacity: 0.55, marginTop: 14, lineHeight: 1.5 }}>
        100% = the US making everything it needs at that stage. The reddest bar is the binding
        chokepoint — typically separation and the heavy-rare-earth (Dy/Tb) ore the US barely has.
        Recycling and domestic-content policy move bars toward green.
      </p>
    </section>
  );
}
