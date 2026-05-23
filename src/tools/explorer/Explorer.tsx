import { useEffect, useMemo, useState } from 'react';
import type { DataBundle, ExplorerConfig } from './types';
import { loadEagerLayers } from './data/loader';
import { createSpecStore } from './store/spec-store';
import { SpecStoreProvider } from './store/context';
import Sidebar from './ui/Sidebar';
import ChartArea from './ui/ChartArea';
import PresetStrip from './ui/PresetStrip';

type Props = {
  config: ExplorerConfig;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: DataBundle };

export default function Explorer({ config }: Props) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  // Store is created once per Explorer mount; survives re-renders.
  const useStore = useMemo(() => createSpecStore(config), [config]);

  useEffect(() => {
    let cancelled = false;
    loadEagerLayers(config)
      .then((data) => {
        if (!cancelled) setLoad({ status: 'ready', data });
      })
      .catch((err: Error) => {
        if (!cancelled) setLoad({ status: 'error', message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [config]);

  return (
    <SpecStoreProvider store={useStore}>
      <div className="explorer">
        <header className="explorer-header">
          <p className="explorer-eyebrow">INTERACTIVE EXPLORER</p>
          <h1 className="explorer-title">{config.title}</h1>
          <p className="explorer-summary">{config.description}</p>
        </header>

        {load.status === 'loading' && (
          <div className="explorer-state">Loading {Object.keys(config.data.eagerLayers).length} data layers…</div>
        )}
        {load.status === 'error' && (
          <div className="explorer-state explorer-state-error">
            <p>Failed to load explorer data.</p>
            <pre>{load.message}</pre>
          </div>
        )}
        {load.status === 'ready' && <ReadyView config={config} data={load.data} />}

        <style>{styles}</style>
      </div>
    </SpecStoreProvider>
  );
}

function ReadyView({ config, data }: { config: ExplorerConfig; data: DataBundle }) {
  const meta = (data.meta ?? null) as {
    yearRange: [number, number];
    years: number[];
    regions: string[];
    materials: { id: string; label: string; group: string | null }[];
    groups: { id: string; label: string; members: string[] }[];
  } | null;

  if (!meta) {
    return (
      <div className="explorer-state explorer-state-error">
        <p>meta.json layer was not loaded; cannot render explorer.</p>
      </div>
    );
  }

  return (
    <>
      <PresetStrip presets={config.presets} />
      <div className="explorer-layout">
        <aside className="explorer-sidebar" aria-label="Explorer controls">
          <Sidebar config={config} meta={meta} />
        </aside>
        <main className="explorer-chart-area" aria-label="Chart">
          <ChartArea config={config} />
        </main>
      </div>
    </>
  );
}

const styles = `
  .explorer {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    padding: clamp(16px, 4vw, 48px);
    color: var(--ink);
    background: var(--paper);
    font-family: var(--font-sans, Inter, system-ui, sans-serif);
  }
  .explorer-header { max-width: 720px; margin-bottom: 24px; }
  .explorer-eyebrow {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 11px;
    letter-spacing: 0.08em;
    color: var(--ink-3);
    margin: 0 0 8px;
  }
  .explorer-title {
    font-family: var(--font-serif, 'Source Serif 4', Georgia, serif);
    font-size: clamp(28px, 4vw, 41px);
    line-height: 1.12;
    margin: 0 0 12px;
  }
  .explorer-summary {
    color: var(--ink-2);
    font-size: 16px;
    line-height: 1.5;
    margin: 0;
  }
  .explorer-state {
    padding: 24px;
    border: 1px solid var(--rule);
    background: var(--paper-2);
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 13px;
    color: var(--ink-2);
  }
  .explorer-state-error { color: #b00020; }
  .explorer-state-error pre {
    margin: 8px 0 0;
    white-space: pre-wrap;
    color: var(--ink-3);
  }

  /* Preset strip */
  .explorer-preset-strip {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    margin-bottom: 24px;
    padding-bottom: 4px;
  }
  .explorer-preset-card {
    flex: 0 0 280px;
    text-align: left;
    padding: 12px 14px;
    background: var(--paper-2);
    border: 1px solid var(--rule);
    color: var(--ink);
    font-family: inherit;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 4px;
    transition: border-color 0.1s, background 0.1s;
  }
  .explorer-preset-card:hover { border-color: var(--rule-strong); background: var(--paper-3); }
  .explorer-preset-card.is-active {
    border-color: var(--ink);
    background: var(--paper);
  }
  .explorer-preset-title {
    font-weight: 600;
    font-size: 14px;
  }
  .explorer-preset-blurb {
    font-size: 12px;
    color: var(--ink-3);
    line-height: 1.4;
  }

  /* Two-column layout */
  .explorer-layout {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 24px;
    align-items: start;
  }
  @media (max-width: 800px) {
    .explorer-layout { grid-template-columns: 1fr; }
  }
  .explorer-sidebar {
    border: 1px solid var(--rule);
    background: var(--paper-2);
    padding: 16px;
    position: sticky;
    top: 76px;
    max-height: calc(100vh - 96px);
    overflow-y: auto;
  }
  @media (max-width: 800px) {
    .explorer-sidebar { position: static; max-height: none; }
  }
  .explorer-chart-area {
    border: 1px solid var(--rule);
    background: var(--paper-2);
    min-height: 480px;
    padding: 24px;
  }

  /* Sidebar sections */
  .explorer-sidebar-inner {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .explorer-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .explorer-section-title {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin: 0;
  }
  .explorer-hint {
    font-size: 11px;
    color: var(--ink-3);
    margin: 0;
  }

  /* Chips */
  .explorer-chip-group {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .explorer-chip {
    font-family: inherit;
    font-size: 12px;
    padding: 4px 10px;
    border: 1px solid var(--rule);
    background: var(--paper);
    color: var(--ink-2);
    cursor: pointer;
    border-radius: 2px;
    line-height: 1.4;
  }
  .explorer-chip:hover { border-color: var(--rule-strong); color: var(--ink); }
  .explorer-chip.is-active {
    background: var(--ink);
    color: var(--paper);
    border-color: var(--ink);
  }
  .explorer-chip-small { font-size: 11px; padding: 3px 7px; }

  /* Grouping toggle */
  .explorer-toggle-row {
    display: flex;
    gap: 0;
    border: 1px solid var(--rule);
    width: fit-content;
  }
  .explorer-toggle {
    font-family: inherit;
    font-size: 11px;
    padding: 4px 10px;
    border: none;
    border-right: 1px solid var(--rule);
    background: var(--paper);
    color: var(--ink-3);
    cursor: pointer;
  }
  .explorer-toggle:last-child { border-right: none; }
  .explorer-toggle.is-active { background: var(--ink); color: var(--paper); }

  /* Year range slider */
  .explorer-year-range { display: flex; flex-direction: column; gap: 4px; }
  .explorer-year-readout {
    display: flex;
    gap: 8px;
    align-items: center;
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 13px;
  }
  .explorer-year-dash { color: var(--ink-3); }
  .explorer-range-track {
    position: relative;
    height: 24px;
  }
  .explorer-range-track input[type='range'] {
    position: absolute;
    inset: 0;
    width: 100%;
    pointer-events: none;
    background: transparent;
    -webkit-appearance: none;
    appearance: none;
  }
  .explorer-range-track input[type='range']::-webkit-slider-thumb {
    pointer-events: auto;
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--ink);
    border: 2px solid var(--paper);
    cursor: pointer;
  }
  .explorer-range-track input[type='range']::-moz-range-thumb {
    pointer-events: auto;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--ink);
    border: 2px solid var(--paper);
    cursor: pointer;
  }
  .explorer-year-bounds {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 10px;
    color: var(--ink-4);
  }

  /* Chart area placeholder */
  .explorer-chart-placeholder {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .explorer-chart-status {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 11px;
    letter-spacing: 0.08em;
    color: var(--ink-3);
    margin: 0;
  }
  .explorer-spec-readout {
    margin: 0;
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 4px 16px;
    font-size: 14px;
  }
  .explorer-spec-row {
    display: contents;
  }
  .explorer-spec-row dt {
    color: var(--ink-3);
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 12px;
    align-self: center;
  }
  .explorer-spec-row dd {
    margin: 0;
    color: var(--ink);
  }
  .explorer-spec-raw {
    margin-top: 24px;
    font-size: 12px;
    color: var(--ink-3);
  }
  .explorer-spec-raw pre {
    background: var(--paper-3);
    padding: 12px;
    overflow-x: auto;
    font-size: 11px;
    color: var(--ink-2);
  }
`;
