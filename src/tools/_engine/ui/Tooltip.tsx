import type { ReactNode } from 'react';

// Shared chart tooltip. Positions itself relative to its parent (which
// must be position: relative). Each chart manages its own visibility +
// content via local state; this component just renders.

type Props = {
  visible: boolean;
  /** Mouse x within the chart container (px). */
  x: number;
  /** Mouse y within the chart container (px). */
  y: number;
  /** Tooltip content, free-form JSX. */
  children: ReactNode;
};

export default function Tooltip({ visible, x, y, children }: Props) {
  if (!visible) return null;
  return (
    <div
      className="explorer-tooltip"
      style={{ transform: `translate(${x + 12}px, ${y + 12}px)` }}
      role="tooltip"
    >
      {children}
      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .explorer-tooltip {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    background: var(--paper);
    color: var(--ink);
    border: 1px solid var(--rule-strong);
    box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08);
    padding: 8px 10px;
    font-family: var(--font-sans, Inter, system-ui, sans-serif);
    font-size: 12px;
    line-height: 1.4;
    max-width: 280px;
    z-index: 10;
    white-space: nowrap;
  }
  .explorer-tooltip dl {
    margin: 0;
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 2px 8px;
  }
  .explorer-tooltip dt {
    color: var(--ink-3);
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 11px;
  }
  .explorer-tooltip dd { margin: 0; color: var(--ink); }
  .explorer-tooltip .tt-title {
    font-weight: 600;
    margin-bottom: 4px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--rule);
  }
  .explorer-tooltip .tt-swatch {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 2px;
    margin-right: 6px;
    vertical-align: middle;
  }
  .explorer-tooltip .tt-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
`;
