/**
 * ToolShell — the standard chrome for full-viewport interactive tools.
 *
 * Every tool page is the same shape: a desktop left rail of controls beside
 * a main visualization, which on mobile (<768px) collapses into a compact
 * header (eyebrow · title · controls toggle) with the controls in a
 * slide-down drawer over a tap-to-dismiss scrim. This component owns that
 * chrome so tools don't copy it from each other; pair it with the
 * `ToolFrame` Astro layout, which owns the page-level frame (body no-scroll,
 * 100dvh minus nav, island sizing).
 *
 * Headings use inline font sizes deliberately: the design-system stylesheet
 * styles bare `h1` outside any cascade layer, which beats Tailwind's layered
 * utilities, so utility classes cannot size a heading here.
 *
 * The mobile drawer's top edge is measured from the header's actual bottom
 * (recomputed on resize) rather than hardcoded, so header copy can change
 * without re-tuning offsets.
 *
 * z-stack (matches firemap): header 30 > drawer 21 > scrim 20 > in-map
 * overlays 10.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

// Single-line + ellipsis, inline so it wins over the design system's
// unlayered `text-wrap` rules (which reset wrap mode and defeat `truncate`).
const oneLine: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textWrap: 'nowrap',
};

export type ToolShellProps = {
  eyebrow?: string;
  title: string;
  summary?: string;
  /** Desktop rail (sidebar) content. */
  rail: ReactNode;
  /** Mobile drawer content; defaults to `rail`. */
  drawer?: ReactNode;
  /** Main visualization / results area. */
  children: ReactNode;
  /**
   * true (default): the shell styles the rail as a padded, bordered column of
   * `railWidth` px with the eyebrow/title/summary block at the top.
   * false: `rail` is rendered bare (for tools whose sidebar is its own
   * fully-styled component, e.g. firemap's Sidebar).
   */
  railChrome?: boolean;
  railWidth?: number;
  /** Surface color for header, rail and drawer. */
  surface?: 'paper' | 'paper-2';
  /** true: the main area scrolls vertically; false (default): it clips. */
  mainScroll?: boolean;
  /** Show the summary line in the mobile header (default true). */
  headerSummary?: boolean;
  /** Controlled drawer state (optional). */
  drawerOpen?: boolean;
  onDrawerOpenChange?: (open: boolean) => void;
  /** Uncontrolled initial drawer state (default closed). */
  defaultDrawerOpen?: boolean;
};

export default function ToolShell({
  eyebrow,
  title,
  summary,
  rail,
  drawer,
  children,
  railChrome = true,
  railWidth = 300,
  surface = 'paper-2',
  mainScroll = false,
  headerSummary = true,
  drawerOpen,
  onDrawerOpenChange,
  defaultDrawerOpen = false,
}: ToolShellProps) {
  const [openU, setOpenU] = useState(defaultDrawerOpen);
  const open = drawerOpen ?? openU;
  const setOpen = (v: boolean) => {
    onDrawerOpenChange?.(v);
    if (drawerOpen === undefined) setOpenU(v);
  };

  // Drawer/scrim anchor: the mobile header's bottom edge in viewport coords.
  const hdrRef = useRef<HTMLElement | null>(null);
  const [drawerTop, setDrawerTop] = useState(130);
  useEffect(() => {
    const measure = () => {
      const r = hdrRef.current?.getBoundingClientRect();
      if (r && r.bottom > 0) setDrawerTop(Math.round(r.bottom));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const bg = surface === 'paper' ? 'bg-paper' : 'bg-paper-2';

  // Two sizes on purpose: the desktop rail uses the lab's page-title
  // pattern (matches firemap's sidebar); the mobile header stays compact.
  const titleBlock = (compact: boolean) => (
    <>
      {eyebrow && (
        <p
          className="m-0 font-mono uppercase text-ink-3"
          style={{
            fontSize: compact ? 10 : 11,
            letterSpacing: '0.12em',
            // inline because the design system's unlayered text-wrap rules
            // beat utility classes; the compact header must stay one line
            ...(compact ? oneLine : null),
          }}
        >
          {eyebrow}
        </p>
      )}
      <h1
        className="font-serif text-ink"
        style={
          compact
            ? { fontSize: 19, fontWeight: 600, lineHeight: 1.15, margin: 0, ...oneLine }
            : { fontSize: 32, fontWeight: 600, lineHeight: 1.1, letterSpacing: '-0.01em', margin: '4px 0 0' }
        }
      >
        {title}
      </h1>
    </>
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-paper">
      {/* ── Mobile header — normal flow below the site nav ── */}
      <header
        ref={hdrRef}
        className={`relative z-30 flex shrink-0 items-center gap-3 border-b border-rule px-3.5 py-2 md:hidden ${bg}`}
      >
        <div className="min-w-0 flex-1">
          {titleBlock(true)}
          {summary && headerSummary && (
            <p
              className="m-0 text-ink-2"
              style={{
                fontSize: 12,
                lineHeight: 1.3,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {summary}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? 'Hide controls' : 'Show controls'}
          className={`flex shrink-0 cursor-pointer items-center gap-1 border-0 bg-transparent px-2 py-1 font-mono text-xs uppercase tracking-wider hover:text-ink ${open ? 'text-ink' : 'text-ink-3'}`}
        >
          <span>{open ? 'Hide Controls' : 'Show Controls'}</span>
          {open ? <ChevronUp size={14} strokeWidth={1.75} /> : <ChevronDown size={14} strokeWidth={1.75} />}
        </button>
      </header>

      {/* ── Content row: rail | main ── */}
      <div className="relative flex flex-1 overflow-hidden">
        {railChrome ? (
          <div
            className={`hidden shrink-0 flex-col gap-2 overflow-y-auto border-r border-rule p-3.5 md:flex ${bg}`}
            style={{ width: railWidth }}
          >
            <div>
              {titleBlock(false)}
              {summary && (
                <p className="m-0 mt-1 text-ink-2" style={{ fontSize: 13, lineHeight: 1.45 }}>
                  {summary}
                </p>
              )}
            </div>
            {rail}
          </div>
        ) : (
          <div className="hidden shrink-0 md:flex">{rail}</div>
        )}
        <div className={`relative min-w-0 flex-1 ${mainScroll ? 'overflow-y-auto' : 'overflow-hidden'}`}>
          {children}
        </div>
      </div>

      {/* ── Mobile drawer — slides down from under the header ── */}
      <div
        className={`fixed left-0 right-0 z-[21] flex flex-col gap-2 overflow-y-auto border-b border-rule p-3.5 md:hidden ${open ? 'shadow-lg' : ''} ${bg}`}
        style={{
          top: drawerTop,
          maxHeight: `calc(100dvh - ${drawerTop}px)`,
          // closed: bottom edge exactly at viewport top — a fixed -110% can
          // leave a tall drawer's tail visible through the translucent nav
          transform: open ? 'translateY(0)' : `translateY(calc(-100% - ${drawerTop}px))`,
          transition: 'transform 0.18s ease',
        }}
      >
        {drawer ?? rail}
      </div>

      {/* ── Scrim — dims the main area while the drawer is open ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20 md:hidden"
        style={{
          top: drawerTop,
          background: 'rgba(0,0,0,0.52)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.22s ease',
        }}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
    </div>
  );
}
