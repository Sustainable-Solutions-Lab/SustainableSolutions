import { useState, type RefObject } from 'react';
import type { DataBundle, Spec } from '../types';
import {
  derive,
  deriveChoropleth,
  deriveContour,
  deriveScatter,
  deriveTreemap,
} from '../data/derive';
import {
  choroplethCsv,
  contourCsv,
  scatterCsv,
  timeSeriesCsv,
  treemapCsv,
} from '../lib/export-csv';
import { downloadString, downloadSvgAsPng } from '../lib/export-png';

type Props = {
  spec: Spec;
  data: DataBundle;
  /** Ref to the chart-area DOM node so we can find the active <svg>. */
  containerRef: RefObject<HTMLElement | null>;
};

export default function ChartToolbar({ spec, data, containerRef }: Props) {
  const [copied, setCopied] = useState(false);

  const onShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('clipboard write failed', err);
    }
  };

  const onPng = async () => {
    const svg = containerRef.current?.querySelector('svg') ?? null;
    await downloadSvgAsPng(svg, filenameFor(spec, 'png'));
  };

  const onCsv = () => {
    const csv = buildCsv(spec, data);
    if (!csv) return;
    downloadString(csv, filenameFor(spec, 'csv'), 'text/csv');
  };

  return (
    <div className="explorer-chart-toolbar">
      <button type="button" className="explorer-tool-btn" onClick={onShare} title="Copy a shareable URL to clipboard">
        {copied ? 'Copied' : 'Share'}
      </button>
      <button type="button" className="explorer-tool-btn" onClick={onPng} title="Download chart as PNG">
        PNG
      </button>
      <button type="button" className="explorer-tool-btn" onClick={onCsv} title="Download the data behind the chart">
        CSV
      </button>
      <style>{styles}</style>
    </div>
  );
}

function buildCsv(spec: Spec, data: DataBundle): string | null {
  switch (spec.chart) {
    case 'line':
    case 'area':
    case 'bar':
      return timeSeriesCsv(derive(data, spec), spec);
    case 'treemap':
      return treemapCsv(deriveTreemap(data, spec), spec);
    case 'choropleth':
      return choroplethCsv(deriveChoropleth(data, spec), spec);
    case 'scatter':
      return scatterCsv(deriveScatter(data, spec), spec);
    case 'contour':
      return contourCsv(deriveContour(data, spec), spec);
    default:
      return null;
  }
}

function filenameFor(spec: Spec, ext: string): string {
  const slug = (spec.preset ?? spec.chart).replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);
  return `materials-explorer-${slug}-${stamp}.${ext}`;
}

const styles = `
  .explorer-chart-toolbar {
    display: flex;
    gap: 4px;
  }
  .explorer-tool-btn {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 11px;
    letter-spacing: 0.04em;
    padding: 4px 10px;
    color: var(--ink-2);
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 2px;
    cursor: pointer;
  }
  .explorer-tool-btn:hover { border-color: var(--rule-strong); color: var(--ink); }
`;
