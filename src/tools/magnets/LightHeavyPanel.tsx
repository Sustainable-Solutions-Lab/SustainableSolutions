/**
 * Light vs heavy: who actually decouples — the live counterpart of the paper's
 * `fig_light_vs_heavy` (model repo `analysis/light_vs_heavy.py`). Same form, same
 * encoding, same argument; the reference end just moves with the tool.
 *
 * The finding it exists to state: heavy genuinely decouples under a China
 * restriction, falling at every stage, while light's magnet step collapses and
 * its mining/separation/alloy stay Chinese. The US swaps Chinese magnets for
 * third-country magnets still built on Chinese light oxide, so the exposure is
 * laundered rather than removed.
 *
 * Read the baseline ordering carefully: heavy is the MORE exposed class before
 * any restriction. Light only looks worse afterwards, because every lever in the
 * strategy set targets heavy. Neglect, not scarcity.
 *
 * FORM: dumbbell, not stacked bars — the data is a before/after movement per
 * category. Shape encodes state (hollow = reference, filled = current); colour
 * encodes direction, which is genuinely polar, so it diverges around a neutral
 * grey for "no movement".
 */
import { TRI_STAGES, classTRI } from './tri';

const GREEN = '#66C2A5', RED = '#D53E4F', NEUTRAL = 'var(--ink-3)';
const CLASSES: { cls: 'light' | 'heavy'; title: string }[] = [
  { cls: 'light', title: 'Light REE (Nd/Pr)' },
  { cls: 'heavy', title: 'Heavy REE (Dy/Tb)' },
];

const W = 300, H = 150, PADL = 74, PADR = 34, PADT = 10, PADB = 26;
const innerW = W - PADL - PADR, innerH = H - PADT - PADB;

/** China share by stage for one class, 0..1. Read straight off the class supply
 *  map: `stageBreakdownClass` returns tri/reliance/unmet/domestic and carries no
 *  china field, so going through it would silently plot zeros. */
function chinaByStage(sc: any, cls: 'light' | 'heavy') {
  const mix = sc?.us_supply_re?.[cls];
  return TRI_STAGES.map((s) => Math.max(0, Math.min(1, mix?.[s.key]?.china ?? 0)));
}

/** Grids before the 2026-09 regrid mis-measured LIGHT provenance: light used a
 *  flow-count that produced a ~91% phantom "unmet", so its shares summed to ~0.11
 *  instead of 1 and light mining read 0.00 China against a true 0.87. Heavy was
 *  always right. Plotting the old light numbers would produce a confident, wrong
 *  picture — the precise error this panel exists to correct — so detect the
 *  vintage by the one invariant that separates them and say so instead. */
function lightProvenanceUsable(sc: any): boolean {
  const m = sc?.us_supply_re?.light?.mining;
  if (!m) return false;
  const total = Object.values(m).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
  return Math.abs(total - 1) < 0.15;
}

function Panel({ cls, title, cur, ref_, curTRI, refTRI, refLabel }: {
  cls: 'light' | 'heavy'; title: string; cur: number[]; ref_: number[];
  curTRI: number; refTRI: number; refLabel: string;
}) {
  const x = (v: number) => PADL + v * innerW;
  const y = (i: number) => PADT + (i + 0.5) * (innerH / TRI_STAGES.length);
  return (
    <div style={{ flex: '1 1 300px', minWidth: 280 }}>
      <div style={{ font: '600 11px var(--font-mono)', color: 'var(--ink)' }}>{title}</div>
      <div style={{ fontSize: 10.5, opacity: 0.65, marginBottom: 2 }}>
        class trade-risk {refTRI.toFixed(2)} → <b style={{ fontWeight: 600 }}>{curTRI.toFixed(2)}</b>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={x(t)} y1={PADT} x2={x(t)} y2={PADT + innerH} stroke="var(--rule)" strokeWidth={0.5} />
            <text x={x(t)} y={H - PADB + 12} textAnchor="middle"
              style={{ font: '400 8px var(--font-mono)', fill: 'var(--ink)', opacity: 0.5 }}>{t}</text>
          </g>
        ))}
        {TRI_STAGES.map((s, i) => {
          const a = ref_[i], b = cur[i], moved = b - a;
          const col = moved < -0.02 ? GREEN : moved > 0.02 ? RED : NEUTRAL;
          return (
            <g key={s.key}>
              <text x={PADL - 8} y={y(i)} textAnchor="end" dominantBaseline="central"
                style={{ font: '400 9px var(--font-sans, inherit)', fill: 'var(--ink)', opacity: 0.75 }}>
                {s.label.split(' ')[0]}
              </text>
              <line x1={x(a)} y1={y(i)} x2={x(b)} y2={y(i)} stroke={col} strokeWidth={2} strokeLinecap="round" />
              <circle cx={x(a)} cy={y(i)} r={3.6} fill="var(--paper)" stroke="var(--ink-2)" strokeWidth={1.3} />
              <circle cx={x(b)} cy={y(i)} r={4} fill={col} stroke="var(--paper)" strokeWidth={1} />
              <text x={x(b) + (b >= a ? 8 : -8)} y={y(i)} textAnchor={b >= a ? 'start' : 'end'}
                dominantBaseline="central"
                style={{ font: `600 8.5px var(--font-mono)`, fill: col }}>{b.toFixed(2)}</text>
            </g>
          );
        })}
        <text x={PADL} y={H - PADB + 24} style={{ font: '400 8.5px var(--font-mono)', fill: 'var(--ink)', opacity: 0.5 }}>
          share traced to China · hollow = {refLabel}
        </text>
      </svg>
    </div>
  );
}

export default function LightHeavyPanel(
  { sc, reference, refLabel, alliedHHI }:
  { sc: any; reference: any; refLabel: string; alliedHHI?: Record<string, number> },
) {
  if (!sc?.us_supply_re || !reference?.us_supply_re) return null;   // no class split at all
  if (!lightProvenanceUsable(sc) || !lightProvenanceUsable(reference)) {
    return (
      <section style={{ border: '1px dashed var(--rule-strong)', borderRadius: 10, padding: '14px 18px', background: 'var(--paper)', marginTop: 22 }}>
        <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: '0 0 6px' }}>
          Which class actually decouples
        </h2>
        <p style={{ fontSize: 11.5, opacity: 0.7, margin: 0, maxWidth: 620, lineHeight: 1.45 }}>
          Hidden: this scenario grid predates the 2026-09 light-class fix, so its light-REE
          provenance is not trustworthy (shares sum to ~0.1 rather than 1). Heavy is unaffected
          and still shown elsewhere. The panel returns once the regridded
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}> scenarios.json </code>
          is deployed.
        </p>
      </section>
    );
  }
  return (
    <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20, background: 'var(--paper)', marginTop: 22 }}>
      <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: '0 0 3px' }}>
        Which class actually decouples
      </h2>
      <p style={{ fontSize: 11.5, opacity: 0.7, margin: '0 0 14px', maxWidth: 620, lineHeight: 1.45 }}>
        Each line runs from the {refLabel} to your scenario. Heavy tends to move off China at
        every stage; light often moves only at magnet making, because the US can switch to
        third-country magnets that are still built on Chinese light oxide. Note that heavy
        starts as the more exposed class.
      </p>
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        {CLASSES.map(({ cls, title }) => (
          <Panel key={cls} cls={cls} title={title}
            cur={chinaByStage(sc, cls)}
            ref_={chinaByStage(reference, cls)}
            curTRI={classTRI(sc, cls, alliedHHI)}
            refTRI={classTRI(reference, cls, alliedHHI)}
            refLabel={refLabel} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: 10.5, opacity: 0.7 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 14, height: 2, background: GREEN, borderRadius: 1 }} /> moves off China
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 14, height: 2, background: RED, borderRadius: 1 }} /> moves toward China
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 14, height: 2, background: 'var(--ink-3)', borderRadius: 1 }} /> unchanged
        </span>
      </div>
    </section>
  );
}
