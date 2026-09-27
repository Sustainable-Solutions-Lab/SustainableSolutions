/**
 * The explorer's one slider.
 *
 * Every range control on the page is this component, so that a control in the
 * capacity panel or under the hurdle rate does not read as a different kind of
 * thing from one in the scenario box: same label weight, same value colour,
 * same rail and thumb (pages/tools/magnets.astro), same ticks.
 *
 * A CONTROL THAT CANNOT CHANGE ANYTHING SAYS SO, IN WORDS. It is never greyed
 * out: a dimmed slider reads as broken or forbidden, and gives no reason. `note`
 * is printed under the slider, and is where "no effect in this scenario,
 * because ..." goes.
 */
import { useState, type ReactNode } from 'react';

/** Where a value sits under a slider, as a CSS length. A range input's thumb
 *  does not travel the whole track: its centre runs from half a thumb inside the
 *  left end to half a thumb inside the right. A tick placed at a plain percentage
 *  of the track is therefore off by up to half a thumb, to the left at the low
 *  end and to the right at the high end. --mag-thumb is set with the slider's
 *  own styles (pages/tools/magnets.astro), so the two cannot drift apart. */
export const onThumbTravel = (frac: number): string => {
  const f = Math.max(0, Math.min(1, frac));
  return `calc(var(--mag-thumb, 19px) / 2 + (100% - var(--mag-thumb, 19px)) * ${f.toFixed(4)})`;
};

/**
 * On a touch screen, the sliders are moved by this and not by the browser.
 *
 * A range input on a phone answers only to a touch that lands on its thumb
 * (Safari), or jumps to wherever it is touched, including by a finger that
 * was only scrolling past (Chrome). Neither is what a reader expects. So where
 * the pointer is coarse the inputs take no touches themselves
 * (pages/tools/magnets.astro) and this decides what a touch on one means:
 *
 *   sideways drag, from anywhere along it   moves the slider
 *   tap                                      moves it there
 *   drag that starts up or down              scrolls the page; the slider stays
 *
 * One listener for every slider under `root`. A release is announced to the
 * input as a `pointerup`, which is what a slider's own release handler
 * (`onCommit`) listens for.
 */
export function followTouches(root: HTMLElement): () => void {
  let el: HTMLInputElement | null = null;
  let x0 = 0, y0 = 0;
  let mode: 'undecided' | 'slide' | 'scroll' = 'undecided';
  const under = (x: number, y: number): HTMLInputElement | null => {
    for (const input of root.querySelectorAll<HTMLInputElement>('input[type="range"]')) {
      if (input.disabled) continue;
      const r = input.getBoundingClientRect();
      if (r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        // not one hidden behind something else, a closed sheet for instance
        const top = document.elementFromPoint(x, y);
        return top && (top === input.parentElement || input.parentElement?.contains(top)
                       || top.contains(input)) ? input : null;
      }
    }
    return null;
  };
  const put = (input: HTMLInputElement, clientX: number) => {
    const r = input.getBoundingClientRect();
    const thumb = parseFloat(getComputedStyle(input).getPropertyValue('--mag-thumb')) || 19;
    const f = Math.max(0, Math.min(1, (clientX - r.left - thumb / 2) / Math.max(1, r.width - thumb)));
    const min = Number(input.min || 0), max = Number(input.max || 100);
    const step = Number(input.step) || 1;
    const v = Math.max(min, Math.min(max, min + Math.round((f * (max - min)) / step) * step));
    const next = String(Number(v.toFixed(6)));
    if (next === input.value) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const release = (input: HTMLInputElement) =>
    input.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }));
  const start = (e: TouchEvent) => {
    el = e.touches.length === 1 ? under(e.touches[0].clientX, e.touches[0].clientY) : null;
    if (!el) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; mode = 'undecided';
  };
  const move = (e: TouchEvent) => {
    if (!el) return;
    const { clientX, clientY } = e.touches[0];
    if (mode === 'undecided') {
      const dx = Math.abs(clientX - x0), dy = Math.abs(clientY - y0);
      if (dx < 6 && dy < 6) return;
      mode = dx >= dy ? 'slide' : 'scroll';
    }
    if (mode !== 'slide') return;
    if (e.cancelable) e.preventDefault();
    put(el, clientX);
  };
  const end = (e: TouchEvent) => {
    if (el && mode !== 'scroll') {
      if (mode === 'undecided' && e.changedTouches.length) put(el, e.changedTouches[0].clientX);
      release(el);
    }
    el = null;
  };
  const cancel = () => { el = null; };
  root.addEventListener('touchstart', start, { capture: true, passive: true });
  root.addEventListener('touchmove', move, { capture: true, passive: false });
  root.addEventListener('touchend', end, { capture: true, passive: true });
  root.addEventListener('touchcancel', cancel, { capture: true, passive: true });
  return () => {
    root.removeEventListener('touchstart', start, { capture: true });
    root.removeEventListener('touchmove', move, { capture: true });
    root.removeEventListener('touchend', end, { capture: true });
    root.removeEventListener('touchcancel', cancel, { capture: true });
  };
}

export type Tick = {
  at: number; label: string;
  /** Drop the label to a second row, for anchors too close to share one. */
  low?: boolean;
};

export default function Slider({ label, value, max, min = 0, onChange, onCommit, fmt, aside,
                                 desc, note, ticks, step = 0.01 }: {
  label: string; value: number; max: number; min?: number; step?: number;
  onChange: (v: number) => void; fmt: (v: number) => string;
  /** Called with the value the slider is let go at (pointer up, key up). */
  onCommit?: (v: number) => void;
  /** A muted word or two after the value: what this value is ("US default"). */
  aside?: string;
  /** Behind the (i) button. */
  desc?: string;
  /** Always visible under the slider. */
  note?: ReactNode;
  ticks?: Tick[];
}) {
  const [open, setOpen] = useState(false);
  const commit = onCommit
    ? (e: { currentTarget: HTMLInputElement }) => onCommit(Number(e.currentTarget.value))
    : undefined;
  const twoRows = !!ticks?.some((t) => t.low);
  return (
    <div style={{ marginBottom: 4, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    gap: 8, marginBottom: 1 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
          {label}
          {desc && (
            <button onClick={() => setOpen((o) => !o)} aria-label="What is this?" title="What is this?"
              aria-expanded={open}
              style={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--rule-strong)',
                background: open ? 'var(--accent)' : 'transparent', color: open ? 'var(--paper)' : 'var(--ink-3)',
                font: '600 9px var(--font-mono)', lineHeight: 1, cursor: 'pointer', padding: 0, opacity: 0.85 }}>
              i
            </button>
          )}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent)',
                       textAlign: 'right' }}>
          {fmt(value)}
          {aside && <span style={{ fontSize: 10.5, color: 'var(--ink)', opacity: 0.55 }}> {aside}</span>}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={commit} onKeyUp={commit}
        style={{ width: '100%' }} />
      {ticks?.length ? (
        // pulled up under the thumb: the input is as tall as its touch target
        <div style={{ position: 'relative', height: twoRows ? 30 : 20,
                      marginTop: 'calc((var(--mag-thumb, 19px) - var(--mag-hit, 22px)) / 2 + 1px)' }}>
          {ticks.map((t) => {
            const frac = (t.at - min) / (max - min);
            return (
              <span key={t.label} title={`${t.label}: ${fmt(t.at)}`}
                style={{ position: 'absolute', left: onThumbTravel(frac),
                         transform: frac < 0.12 ? 'none' : frac > 0.88 ? 'translateX(-100%)' : 'translateX(-50%)',
                         textAlign: 'center', lineHeight: 1.1 }}>
                <span style={{ display: 'block', width: 1, height: t.low ? 13 : 3, background: 'var(--ink)',
                               opacity: 0.35, margin: frac < 0.12 ? '0' : frac > 0.88 ? '0 0 0 auto' : '0 auto' }} />
                <span style={{ font: '400 8.5px var(--font-mono)', opacity: 0.45, whiteSpace: 'nowrap' }}>
                  {t.label}
                </span>
              </span>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)',
                      fontSize: 9.5, color: 'var(--ink)', opacity: 0.45,
                      marginTop: 'calc((var(--mag-thumb, 19px) - var(--mag-hit, 22px)) / 2 + 1px)',
                      padding: '0 calc(var(--mag-thumb, 19px) / 2 - 1ch)' }}>
          <span>{fmt(min)}</span><span>{fmt((min + max) / 2)}</span><span>{fmt(max)}</span>
        </div>
      )}
      {desc && open && (
        <p style={{ fontSize: 11, opacity: 0.6, margin: '6px 0 0', lineHeight: 1.45 }}>{desc}</p>
      )}
      {note && (
        <div style={{ fontSize: 10.5, opacity: 0.7, lineHeight: 1.45, margin: '4px 0 0' }}>{note}</div>
      )}
    </div>
  );
}
