/**
 * Chokepoint panel — where the material embodied in US demand comes from, by
 * stage: US-made, from allies (RoW), or from China (+ a remainder embodied in
 * imported finished magnets the US never processes). Sums to 100% of US demand.
 * IRA's two prongs target the China slice: domestic/allied minerals + US magnets.
 */

type Seg = { domestic: number; allied: number; china: number };
type Scenario = { us_supply: Record<string, Seg> };

const STAGES = [
  { key: 'mining', label: 'Mining (Dy/Tb + Nd/Pr ore)' },
  { key: 'separation', label: 'Separation (oxide)' },
  { key: 'alloy', label: 'Alloy' },
  { key: 'magnet', label: 'Magnet' },
];
const PARTS: [keyof Seg | 'imported_magnet', string, string][] = [
  ['domestic', 'US-made', 'var(--brand-green)'],
  ['allied', 'Allies (RoW)', '#FDAE61'],
  ['china', 'China', '#D53E4F'],
  ['imported_magnet', 'Via imported magnets', 'var(--rule)'],
];

export default function ChokepointPanel({ sc }: { sc: Scenario }) {
  let top: { label: string; china: number } | null = null;
  for (const s of STAGES) {
    const c = sc.us_supply?.[s.key]?.china ?? 0;
    if (!top || c > top.china) top = { label: s.label, china: c };
  }

  return (
    <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20, background: 'var(--paper)', marginTop: 26 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: 0 }}>US supply security by stage</h2>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, flexWrap: 'wrap' }}>
          {PARTS.map(([k, lbl, c]) => (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: c, border: k === 'imported_magnet' ? '1px solid var(--rule-strong)' : 'none' }} />
              <span style={{ opacity: 0.75 }}>{lbl}</span>
            </span>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 12.5, opacity: 0.7, margin: '0 0 16px' }}>
        Origin of the material embodied in US demand, at each stage.
        {top && top.china > 0.1 && (
          <> Biggest China exposure: <strong>{top.label}</strong> ({(top.china * 100).toFixed(0)}% from China).</>
        )}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {STAGES.map((s) => {
          const seg = sc.us_supply?.[s.key] ?? { domestic: 0, allied: 0, china: 0 };
          const rem = Math.max(0, 1 - seg.domestic - seg.allied - seg.china);
          const vals: Record<string, number> = { ...seg, imported_magnet: rem };
          return (
            <div key={s.key} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, textAlign: 'right', opacity: 0.85 }}>{s.label}</span>
              <div style={{ display: 'flex', height: 26, borderRadius: 5, overflow: 'hidden', border: '1px solid var(--rule)' }}>
                {PARTS.map(([k, lbl, c]) => {
                  const v = vals[k as string] ?? 0;
                  if (v < 0.005) return null;
                  const dark = k === 'imported_magnet';
                  return (
                    <div key={k} title={`${lbl}: ${(v * 100).toFixed(0)}%`}
                      style={{ width: `${v * 100}%`, background: c, display: 'flex', alignItems: 'center', justifyContent: 'center', color: dark ? 'var(--ink)' : '#fff', opacity: dark ? 0.5 : 1, font: '600 10px var(--font-mono)' }}>
                      {v > 0.13 ? `${(v * 100).toFixed(0)}%` : ''}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 12, opacity: 0.55, marginTop: 14, lineHeight: 1.5 }}>
        100% = all the material the US needs at that stage. The red slice is China dependence — what
        the IRA-style policy and recycling shrink. "Via imported magnets" means the US imports the
        finished magnet and never handles that stage at home. The persistent red at Mining is the
        heavy-rare-earth ore the US barely has.
      </p>
    </section>
  );
}
