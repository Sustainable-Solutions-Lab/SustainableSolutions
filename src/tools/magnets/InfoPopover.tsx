/**
 * An ⓘ button that opens a short explanation in a pop-up.
 *
 * For notes that belong to one number on a card and are too long to print
 * beside it. The pop-up is positioned against the VIEWPORT, not its parent:
 * the cards it serves sit in a pinned band on a desktop and above a fixed bar
 * on a phone, and a pop-up placed inside either is clipped or covered. It opens
 * below the button when there is room and above it when there is not, never
 * wider than the screen, and follows the button if the page scrolls. It is
 * rendered at the end of the document, so it takes nothing from the card it
 * belongs to: the card's label is set at 60% opacity, and a pop-up inside it
 * was 60% see-through.
 *
 * Opens on click or tap; closes on Escape, on a click outside, or on the
 * button again. Focus moves into it on opening and back to the button on
 * closing, so it can be read and left from the keyboard.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const WIDTH = 360, GAP = 8, EDGE = 12;

export default function InfoPopover({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxH: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    // Against the card the button sits on, where there is one, so the pop-up
    // opens clear of the number it explains.
    const r = (btn.current?.closest('[data-popover-anchor]') ?? btn.current)?.getBoundingClientRect();
    if (!r) return;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const width = Math.min(WIDTH, vw - 2 * EDGE);
    const left = Math.max(EDGE, Math.min(r.left, vw - width - EDGE));
    const below = vh - r.bottom - GAP - EDGE, above = r.top - GAP - EDGE;
    const need = box.current?.scrollHeight ?? 240;
    setPos(below >= Math.min(need, 200) || below >= above
      ? { left, width, top: r.bottom + GAP, maxH: Math.max(120, below) }
      : { left, width, bottom: vh - r.top + GAP, maxH: Math.max(120, above) });
  }, []);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  // Focus once it is placed: a box that is still hidden cannot take it.
  const placed = open && pos != null;
  useEffect(() => { if (placed) box.current?.focus({ preventScroll: true }); }, [placed]);
  useEffect(() => { if (!open) setPos(null); }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); }
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  return (
    <>
      <button ref={btn} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ width: 15, height: 15, borderRadius: '50%', border: '1px solid var(--rule-strong)',
                 background: open ? 'var(--accent)' : 'transparent',
                 color: open ? 'var(--paper)' : 'var(--ink-3)',
                 font: '600 9px var(--font-mono)', lineHeight: 1, cursor: 'pointer', padding: 0,
                 marginLeft: 6, flexShrink: 0, verticalAlign: 'middle' }}>
        i
      </button>
      {open && createPortal(
        <div ref={box} role="dialog" aria-label={label} tabIndex={-1}
          style={{ position: 'fixed', zIndex: 80, left: pos?.left ?? EDGE, top: pos?.top,
                   bottom: pos?.bottom, width: pos?.width ?? WIDTH, maxHeight: pos?.maxH,
                   overflowY: 'auto', visibility: pos ? 'visible' : 'hidden', boxSizing: 'border-box',
                   background: 'var(--paper)', color: 'var(--ink)',
                   border: '1px solid var(--rule-strong)', borderRadius: 8, padding: '10px 12px',
                   boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08)',
                   fontSize: 11.5, lineHeight: 1.5, fontWeight: 400, textTransform: 'none',
                   letterSpacing: 0, outline: 'none' }}>
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
