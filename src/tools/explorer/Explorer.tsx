import { useEffect, useMemo, useState } from 'react';
import type { DataBundle, ExplorerConfig } from './types';
import { loadEagerLayers } from './data/loader';
import { createSpecStore } from './store/spec-store';
import { SpecStoreProvider } from './store/context';
import Sidebar from './ui/Sidebar';
import ChartArea from './ui/ChartArea';

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
        {load.status === 'loading' && <LoadingState config={config} />}
        {load.status === 'error' && <ErrorState message={load.message} />}
        {load.status === 'ready' && <ReadyView config={config} data={load.data} />}
        <style>{styles}</style>
      </div>
    </SpecStoreProvider>
  );
}

function LoadingState({ config }: { config: ExplorerConfig }) {
  return (
    <div className="explorer-fullscreen-state">
      Loading {Object.keys(config.data.eagerLayers).length} data layers…
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="explorer-fullscreen-state explorer-fullscreen-state-error">
      <p>Failed to load explorer data.</p>
      <pre>{message}</pre>
    </div>
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
      <div className="explorer-fullscreen-state explorer-fullscreen-state-error">
        <p>meta.json layer was not loaded; cannot render explorer.</p>
      </div>
    );
  }

  return (
    <>
      <aside className="explorer-sidebar" aria-label="Explorer controls">
        <header className="explorer-sidebar-header">
          <p className="explorer-sidebar-eyebrow">INTERACTIVE EXPLORER</p>
          <h1 className="explorer-sidebar-title" title={config.description}>
            {config.title}
          </h1>
        </header>
        <div className="explorer-sidebar-scroll">
          <Sidebar config={config} meta={meta} />
        </div>
      </aside>
      <main className="explorer-chart-area" aria-label="Chart">
        <ChartArea config={config} data={data} />
      </main>
    </>
  );
}

const styles = `
  .explorer {
    display: flex;
    width: 100%;
    height: 100%;
    background: var(--paper);
    color: var(--ink);
    font-family: var(--font-sans, Inter, system-ui, sans-serif);
    overflow: hidden;
  }

  /* Fixed-width, full-height sidebar — same shape as the map tools */
  .explorer-sidebar {
    flex: 0 0 280px;
    display: flex;
    flex-direction: column;
    background: var(--paper-2);
    border-right: 1px solid var(--rule);
    overflow: hidden;
  }
  .explorer-sidebar-header {
    padding: 14px 16px 12px;
    border-bottom: 1px solid var(--rule);
    flex: 0 0 auto;
  }
  .explorer-sidebar-eyebrow {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 10px;
    letter-spacing: 0.08em;
    color: var(--ink-3);
    margin: 0 0 4px;
  }
  .explorer-sidebar-title {
    font-family: var(--font-serif, 'Source Serif 4', Georgia, serif);
    font-size: 19px;
    font-weight: 600;
    line-height: 1.2;
    color: var(--ink);
    margin: 0;
  }
  .explorer-sidebar-scroll {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 14px 16px 24px;
  }

  /* Chart fills the remaining width edge-to-edge — no inner border */
  .explorer-chart-area {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 16px 24px;
  }

  /* Fallback states fill the whole frame */
  .explorer-fullscreen-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 13px;
    color: var(--ink-3);
  }
  .explorer-fullscreen-state-error { color: #b00020; flex-direction: column; gap: 8px; }
  .explorer-fullscreen-state-error pre {
    margin: 0;
    color: var(--ink-3);
    font-size: 11px;
    white-space: pre-wrap;
  }

  /* Sidebar sections */
  .explorer-sidebar-inner {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .explorer-preset-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .explorer-preset-card {
    text-align: left;
    padding: 8px 10px;
    background: var(--paper);
    border: 1px solid var(--rule);
    color: var(--ink);
    font-family: inherit;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 2px;
    transition: border-color 0.1s, background 0.1s;
  }
  .explorer-preset-card:hover { border-color: var(--rule-strong); background: var(--paper-3); }
  .explorer-preset-card.is-active {
    border-color: var(--ink);
    background: var(--paper-3);
  }
  .explorer-preset-title { font-weight: 600; font-size: 12px; }
  .explorer-preset-blurb {
    font-size: 11px;
    color: var(--ink-3);
    line-height: 1.4;
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
`;
