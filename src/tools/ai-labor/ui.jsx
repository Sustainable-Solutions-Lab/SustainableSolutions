/**
 * Shared bits for the ai-labor tool: a small tooltip that stays inside its
 * chart (phones included), segmented chips, and the colour helpers used by
 * every all-sector chart.
 */
import { useRef, useState } from 'react';

export const mono11 = { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--ink-3)' };
export const svgText = { fontFamily: 'var(--font-mono)', fontSize: 11, fill: 'var(--ink-3)' };
export const svgLabel = { fontFamily: 'var(--font-sans)', fontSize: 12, fill: 'var(--ink-2)' };
export const caption = { fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.45, margin: 0, maxWidth: '68ch' };
export const figTitle = { fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 600, lineHeight: 1.28, color: 'var(--ink)', margin: 0 };

export const pctChange = (j) => `${j >= 1 ? '+' : ''}${Math.round(100 * (j - 1))}%`;

export const VERDICT = {
  loses: { lab: 'Loses jobs in ≥90% of scenarios', color: 'var(--negative)' },
  contested: { lab: 'Contested', color: 'var(--ink-3)' },
  gains: { lab: 'Gains jobs in ≥90% of scenarios', color: 'var(--positive)' },
};

const SHORT = {
  'Monetary authorities and depository credit intermediation': 'Banking',
  'Securities and commodity contracts intermediation and brokerage': 'Securities brokerage',
  'Other financial investment activities': 'Investment services',
  'Insurance carriers, except direct life': 'Insurance carriers',
  'Nursing and community care facilities': 'Nursing and care facilities',
  'Individual and family services': 'Family and social services',
};
export const shortName = (n) => SHORT[n] ?? (n.length > 34 ? `${n.slice(0, 32)}…` : n);

/** Diverging fill for a change index j (1 = no change), clamped at ±span. */
export function changeColor(j, span) {
  const t = Math.max(-1, Math.min(1, (j - 1) / span));
  // ColorBrewer Spectral ends (lab palette): red for losses, blue for gains.
  const neg = [213, 62, 79], mid = [250, 248, 220], pos = [50, 136, 189];
  const to = t < 0 ? neg : pos, a = Math.abs(t);
  const c = mid.map((m, i) => Math.round(m + (to[i] - m) * a));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Hover / tap tooltip clamped to its container. Wrap a chart's container
 *  and call show(ev, text) / hide(). */
export function useTip() {
  const ref = useRef(null);
  const [tip, setTip] = useState(null);
  const show = (ev, text) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const w = Math.min(220, box.width - 8);
    let x = ev.clientX - box.left + 10;
    if (x + w > box.width) x = Math.max(0, ev.clientX - box.left - w - 10);
    const y = Math.max(0, ev.clientY - box.top - 36);
    setTip({ x, y, w, text });
  };
  const node = tip && (
    <div style={{ position: 'absolute', left: tip.x, top: tip.y, maxWidth: tip.w, pointerEvents: 'none', background: 'var(--ink)', color: 'var(--paper)', fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.4, padding: '4px 7px', borderRadius: 2, zIndex: 4, whiteSpace: 'normal' }}>
      {tip.text}
    </div>
  );
  return { ref, show, hide: () => setTip(null), node };
}

export function Chips({ label, value, options, onChange }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ ...mono11, fontSize: 10.5 }}>{label}</span>
      {options.map(([v, lab]) => {
        const on = v === value;
        return (
          <button key={v} type="button" role="radio" aria-checked={on} onClick={() => onChange(v)}
            style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, padding: '3px 10px', cursor: 'pointer', borderRadius: 999, border: '1px solid var(--rule-strong)', background: on ? 'var(--ink)' : 'var(--paper)', color: on ? 'var(--paper)' : 'var(--ink-2)' }}>
            {lab}
          </button>
        );
      })}
    </div>
  );
}

/** Legend swatch for the diverging change scale. */
export function ChangeLegend({ span, label }) {
  const stops = [-1, -0.5, 0, 0.5, 1];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--ink-3)', flexWrap: 'wrap' }}>
      <span>{label}</span>
      <span style={{ display: 'inline-flex' }}>
        {stops.map((t) => (
          <span key={t} style={{ width: 22, height: 10, background: changeColor(1 + t * span, span) }} />
        ))}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
        {pctChange(1 - span)} to {pctChange(1 + span)}
      </span>
    </div>
  );
}
