import type { Series } from '../data/derive';

// Shared chart legend. Compact — a single row of swatches + labels that
// wraps. Mirrors NYT-style legend conventions: discreet, low chrome.

type Props = {
  series: Series[];
};

export default function Legend({ series }: Props) {
  if (series.length === 0) return null;
  return (
    <ul className="chart-legend" role="list">
      {series.map((s) => (
        <li key={s.key} className="chart-legend-item">
          <span className="chart-legend-swatch" style={{ background: s.color }} aria-hidden />
          <span className="chart-legend-label">{s.label}</span>
        </li>
      ))}
      <style>{styles}</style>
    </ul>
  );
}

const styles = `
  .chart-legend {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
  }
  .chart-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--ink-2);
    line-height: 1.2;
  }
  .chart-legend-swatch {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    flex: 0 0 10px;
  }
  .chart-legend-label {
    font-family: var(--font-sans, Inter, system-ui, sans-serif);
  }
`;
