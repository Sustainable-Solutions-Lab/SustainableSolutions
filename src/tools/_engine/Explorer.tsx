import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DataBundle, ExplorerConfig } from './types';
import { loadEagerLayers, loadLazyLayer } from './data/loader';
import { createSpecStore } from './store/spec-store';
import { SpecStoreProvider } from './store/context';
import { LazyLayerProvider } from './data/lazy-context';
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
  const [lazy, setLazy] = useState<DataBundle>({});
  const [lazyState, setLazyState] = useState<{
    loading: Record<string, boolean>;
    errors: Record<string, string | null>;
  }>({ loading: {}, errors: {} });
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

  const requestLazy = useCallback(
    (name: string) => {
      if (lazy[name] !== undefined) return;
      if (lazyState.loading[name]) return;
      setLazyState((s) => ({ ...s, loading: { ...s.loading, [name]: true }, errors: { ...s.errors, [name]: null } }));
      loadLazyLayer(config, name)
        .then((data) => {
          setLazy((prev) => ({ ...prev, [name]: data }));
          setLazyState((s) => ({ ...s, loading: { ...s.loading, [name]: false } }));
        })
        .catch((err: Error) => {
          setLazyState((s) => ({
            ...s,
            loading: { ...s.loading, [name]: false },
            errors: { ...s.errors, [name]: err.message },
          }));
        });
    },
    [config, lazy, lazyState.loading],
  );

  const combined = load.status === 'ready' ? { ...load.data, ...lazy } : null;

  return (
    <SpecStoreProvider store={useStore}>
      <LazyLayerProvider value={{ loading: lazyState.loading, errors: lazyState.errors, request: requestLazy }}>
        <div className="explorer">
          {load.status === 'loading' && <LoadingState config={config} />}
          {load.status === 'error' && <ErrorState message={load.message} />}
          {load.status === 'ready' && combined && <ReadyView config={config} data={combined} />}
          <style>{styles}</style>
        </div>
      </LazyLayerProvider>
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

  const flowsCountries = data.flowsCountries as { countries?: string[] } | undefined;
  const countries = flowsCountries?.countries;

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
          <Sidebar config={config} meta={meta} countries={countries} />
        </div>
      </aside>
      <main className="explorer-chart-area" aria-label="Chart">
        <ChartArea config={config} data={data} meta={meta} />
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

  /* Fixed-width, full-height sidebar — same shape as the map tools.
     Shrinks slightly on narrow desktops so the chart pane keeps room. */
  .explorer-sidebar {
    flex: 0 0 280px;
    display: flex;
    flex-direction: column;
    background: var(--paper-2);
    border-right: 1px solid var(--rule);
    overflow: hidden;
  }
  @media (max-width: 1100px) {
    .explorer-sidebar { flex-basis: 240px; }
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
    flex: 1 1 0;
    min-height: 0;
    overflow-y: auto;
    padding: 14px 16px 24px;
  }

  /* Chart fills the remaining width with comfortable breathing room.
     clamp() shrinks padding on narrow screens so the chart still has
     working space, but never below a usable minimum.
     flex: 1 (= 1 1 0) + min-height: 0 lets the chart shrink to fit the
     viewport instead of pushing the page taller than the frame. */
  .explorer-chart-area {
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: clamp(20px, 3vw, 40px) clamp(24px, 4vw, 56px) clamp(24px, 3vw, 40px);
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
  .explorer-preset-select {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 8px;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink);
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 2px;
    cursor: pointer;
  }
  .explorer-preset-select:focus { outline: none; border-color: var(--ink); }
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

  /* Collapsible (Geography, Material) — same visual rhythm as Section
     when closed, expands inline to reveal the chip pickers. */
  .explorer-collapsible {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .explorer-collapsible-summary {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    cursor: pointer;
    list-style: none;
    padding: 2px 0;
  }
  .explorer-collapsible-summary::-webkit-details-marker { display: none; }
  .explorer-collapsible-summary::marker { content: ''; }
  .explorer-collapsible-summary::after {
    content: '▸';
    font-size: 10px;
    color: var(--ink-3);
    margin-left: 4px;
  }
  .explorer-collapsible[open] > .explorer-collapsible-summary::after {
    content: '▾';
  }
  .explorer-collapsible-state {
    font-size: 11px;
    color: var(--ink-2);
    text-align: right;
    flex: 1;
  }
  .explorer-collapsible-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
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
  .explorer-chip[disabled] { opacity: 0.4; cursor: not-allowed; }

  .explorer-search-input {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 8px;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink);
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 2px;
  }
  .explorer-search-input:focus {
    outline: none;
    border-color: var(--ink);
  }
  .explorer-search-input:disabled { color: var(--ink-4); }

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
  /* Baseline rail running the full width of the track */
  .explorer-range-rail {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 2px;
    transform: translateY(-50%);
    background: var(--rule);
    border-radius: 1px;
    pointer-events: none;
  }
  /* Highlighted segment between the two thumbs */
  .explorer-range-selection {
    position: absolute;
    top: 50%;
    height: 4px;
    transform: translateY(-50%);
    background: var(--ink);
    border-radius: 2px;
    pointer-events: none;
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
