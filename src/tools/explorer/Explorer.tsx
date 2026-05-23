import { useEffect, useState } from 'react';
import type { DataBundle, ExplorerConfig } from './types';
import { loadEagerLayers } from './data/loader';

type Props = {
  config: ExplorerConfig;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: DataBundle };

export default function Explorer({ config }: Props) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });

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
    <div className="explorer">
      <header className="explorer-header">
        <p className="explorer-eyebrow">INTERACTIVE EXPLORER</p>
        <h1 className="explorer-title">{config.title}</h1>
        <p className="explorer-summary">{config.description}</p>
      </header>

      <section className="explorer-body">
        {load.status === 'loading' && <LoadingPanel config={config} />}
        {load.status === 'error' && <ErrorPanel message={load.message} />}
        {load.status === 'ready' && <DebugPanel config={config} data={load.data} />}
      </section>

      <style>{styles}</style>
    </div>
  );
}

function LoadingPanel({ config }: { config: ExplorerConfig }) {
  return (
    <div className="explorer-state">
      <p>Loading {Object.keys(config.data.eagerLayers).length} data layers…</p>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="explorer-state explorer-state-error">
      <p>Failed to load explorer data.</p>
      <pre>{message}</pre>
    </div>
  );
}

// Skeleton placeholder. Real charts and sidebar arrive in milestone 4+.
// For now this just proves end-to-end wiring: page renders, layers fetch,
// data shape inspectable in the browser.
function DebugPanel({ config, data }: { config: ExplorerConfig; data: DataBundle }) {
  return (
    <div className="explorer-debug">
      <p className="explorer-debug-status">
        <strong>{Object.keys(data).length} data layers loaded</strong> · ready for milestone 4
        (sidebar + charts).
      </p>
      <details open>
        <summary>Loaded layers</summary>
        <ul className="explorer-debug-list">
          {Object.entries(data).map(([name, value]) => (
            <li key={name}>
              <code>{name}</code>
              <span className="explorer-debug-shape">{shapeOf(value)}</span>
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary>Config</summary>
        <ul className="explorer-debug-list">
          <li>
            <code>dimensions</code>
            <span className="explorer-debug-shape">{config.dimensions.length}</span>
          </li>
          <li>
            <code>measures</code>
            <span className="explorer-debug-shape">
              {config.measures.map((m) => m.name).join(', ')}
            </span>
          </li>
          <li>
            <code>chartTypes</code>
            <span className="explorer-debug-shape">{config.chartTypes.join(', ')}</span>
          </li>
          <li>
            <code>presets</code>
            <span className="explorer-debug-shape">{config.presets.length}</span>
          </li>
        </ul>
      </details>
    </div>
  );
}

function shapeOf(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (Array.isArray(v)) return `array[${v.length}]`;
  if (typeof v === 'object') {
    const keys = Object.keys(v as object);
    return `object{${keys.length} keys: ${keys.slice(0, 4).join(', ')}${keys.length > 4 ? ', …' : ''}}`;
  }
  return typeof v;
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
  .explorer-header { max-width: 720px; margin-bottom: 32px; }
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
  .explorer-body { flex: 1; }
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
  .explorer-debug {
    padding: 24px;
    border: 1px solid var(--rule);
    background: var(--paper-2);
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 13px;
  }
  .explorer-debug-status {
    margin: 0 0 16px;
    color: var(--ink);
  }
  .explorer-debug details { margin-bottom: 12px; }
  .explorer-debug summary {
    cursor: pointer;
    color: var(--ink-2);
    margin-bottom: 8px;
  }
  .explorer-debug-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .explorer-debug-list li {
    display: flex;
    gap: 16px;
    padding: 4px 0;
    border-bottom: 1px solid var(--rule);
  }
  .explorer-debug-list code {
    flex: 0 0 200px;
    color: var(--ink);
  }
  .explorer-debug-shape {
    color: var(--ink-3);
    word-break: break-all;
  }
`;
