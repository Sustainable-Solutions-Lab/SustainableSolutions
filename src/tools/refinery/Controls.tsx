/**
 * Small controls for the interactive refinery: slider, segmented chips,
 * collapsible rail section and the (i) pop-up. Modelled on the magnet
 * explorer's controls, kept local so the two tools can change independently.
 *
 * A control that cannot change anything says so in words (`note`); it is never
 * greyed out.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';

// ── (i) pop-up ──────────────────────────────────────────────────────────────
const POP_W = 340, GAP = 8, EDGE = 12;

/** An (i) button that opens a short explanation. Opens on click or tap,
 *  closes on Escape, a click outside, or the button again. Positioned against
 *  the viewport so the rail's scroll box cannot clip it. */
export function Info({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxH: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const width = Math.min(POP_W, vw - 2 * EDGE);
    const left = Math.max(EDGE, Math.min(r.left - 12, vw - width - EDGE));
    const below = vh - r.bottom - GAP - EDGE, above = r.top - GAP - EDGE;
    setPos(below >= 180 || below >= above
      ? { left, width, top: r.bottom + GAP, maxH: Math.max(120, below) }
      : { left, width, bottom: vh - r.top + GAP, maxH: Math.max(120, above) });
  }, []);
  useLayoutEffect(() => { if (open) place(); else setPos(null); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', place, { capture: true });
    };
  }, [open, place]);
  return (
    <>
      <button ref={btn} type="button" aria-label={`About: ${label}`} aria-haspopup="dialog" aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        style={{ width: 15, height: 15, borderRadius: '50%', border: '1px solid var(--rule-strong)',
                 background: open ? 'var(--accent)' : 'transparent', color: open ? 'var(--paper)' : 'var(--ink-3)',
                 font: '600 9px var(--font-mono)', lineHeight: 1, cursor: 'pointer', padding: 0,
                 flexShrink: 0, verticalAlign: 'middle', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        i
      </button>
      {open && createPortal(
        <div ref={box} role="dialog" aria-label={label} tabIndex={-1}
          style={{ position: 'fixed', zIndex: 80, left: pos?.left ?? EDGE, top: pos?.top, bottom: pos?.bottom,
                   width: pos?.width ?? POP_W, maxHeight: pos?.maxH, overflowY: 'auto',
                   visibility: pos ? 'visible' : 'hidden', boxSizing: 'border-box',
                   background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--rule-strong)',
                   borderRadius: 8, padding: '10px 12px',
                   boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08)',
                   fontSize: 12, lineHeight: 1.5, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
          <div style={{ font: '600 11px var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-3)', marginBottom: 4 }}>{label}</div>
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Touch handling for sliders (same behaviour as the magnet explorer) ─────
/**
 * On a touch screen the range inputs take no touches themselves (see the
 * page's CSS) and this decides what a touch means: a sideways drag anywhere
 * along a slider moves it, a tap moves it there, a drag that starts up or down
 * scrolls the page.
 */
export function followTouches(root: HTMLElement): () => void {
  let el: HTMLInputElement | null = null;
  let x0 = 0, y0 = 0;
  let mode: 'undecided' | 'slide' | 'scroll' = 'undecided';
  const under = (x: number, y: number): HTMLInputElement | null => {
    for (const input of root.querySelectorAll<HTMLInputElement>('input[type="range"]')) {
      const r = input.getBoundingClientRect();
      if (r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        const top = document.elementFromPoint(x, y);
        return top && (top === input.parentElement || input.parentElement?.contains(top) || top.contains(input)) ? input : null;
      }
    }
    return null;
  };
  const put = (input: HTMLInputElement, clientX: number) => {
    const r = input.getBoundingClientRect();
    const thumb = parseFloat(getComputedStyle(input).getPropertyValue('--rf-thumb')) || 19;
    const f = Math.max(0, Math.min(1, (clientX - r.left - thumb / 2) / Math.max(1, r.width - thumb)));
    const min = Number(input.min || 0), max = Number(input.max || 100);
    const step = Number(input.step) || 1;
    const v = Math.max(min, Math.min(max, min + Math.round((f * (max - min)) / step) * step));
    const next = String(Number(v.toFixed(6)));
    if (next === input.value) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
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
    if (el && mode === 'undecided' && e.changedTouches.length) put(el, e.changedTouches[0].clientX);
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

// ── Slider ──────────────────────────────────────────────────────────────────
export function Slider({ label, value, min, max, step, onChange, fmt, info, note, ends, swatch }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt: (v: number) => string;
  info?: ReactNode;
  /** Always visible under the slider: where an inert control says why. */
  note?: ReactNode;
  /** Words under the two ends of the rail, in place of numbers. */
  ends?: [string, string];
  swatch?: string;
}) {
  const steps = (max - min) / step;
  if (Math.abs(steps - Math.round(steps)) < 1e-6) max = Number((min + Math.round(steps) * step).toFixed(10));
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          {swatch && <span aria-hidden style={{ width: 9, height: 9, borderRadius: 2, background: swatch, flexShrink: 0 }} />}
          {label}
          {info && <Info label={label}>{info}</Info>}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)', whiteSpace: 'nowrap' }}>{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={Math.min(Math.max(value, min), max)} aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 9.5,
                    color: 'var(--ink-3)', marginTop: 'calc((var(--rf-thumb, 19px) - var(--rf-hit, 22px)) / 2 + 1px)' }}>
        <span>{ends ? ends[0] : fmt(min)}</span><span>{ends ? ends[1] : fmt(max)}</span>
      </div>
      {note && <div style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.4, marginTop: 2 }}>{note}</div>}
    </div>
  );
}

// ── Segmented chips ─────────────────────────────────────────────────────────
export function Chips<T extends string>({ label, value, options, onChange, info, note }: {
  label?: string; value: T | null; options: { id: T; label: string }[];
  onChange: (v: T) => void; info?: ReactNode; note?: ReactNode;
}) {
  return (
    <div>
      {label && (
        <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          {label}{info && <Info label={label}>{info}</Info>}
        </div>
      )}
      <div role="radiogroup" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {options.map((o) => {
          const on = o.id === value;
          return (
            <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.id)}
              style={{ font: '500 11.5px var(--font-sans)', padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
                       border: `1px solid ${on ? 'var(--accent)' : 'var(--rule-strong)'}`,
                       background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--paper)' : 'var(--ink)' }}>
              {o.label}
            </button>
          );
        })}
      </div>
      {note && <div style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.4, marginTop: 4 }}>{note}</div>}
    </div>
  );
}

// ── Collapsible rail section ────────────────────────────────────────────────
export function Section({ title, children, defaultOpen = true, aside }: {
  title: string; children: ReactNode; defaultOpen?: boolean; aside?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={{ borderTop: '1px solid var(--rule)', paddingTop: 8 }}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 6, background: 'none', border: 'none',
                 padding: '2px 0', cursor: 'pointer', color: 'var(--ink)' }}>
        <ChevronRight size={14} strokeWidth={1.75} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
        <span style={{ font: '600 11px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{title}</span>
        {aside && <span style={{ marginLeft: 'auto', font: '400 11px var(--font-mono)', color: 'var(--ink-3)' }}>{aside}</span>}
      </button>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0 6px' }}>{children}</div>}
    </section>
  );
}

/** A smaller collapsible inside a section ("Edit units", "Product prices"). */
export function Sub({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0,
                 cursor: 'pointer', color: 'var(--accent)', fontSize: 12, fontWeight: 500 }}>
        <ChevronRight size={13} strokeWidth={1.75} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
        {title}
      </button>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8, paddingLeft: 8, borderLeft: '1px solid var(--rule)' }}>{children}</div>}
    </div>
  );
}
