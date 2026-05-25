import type { DataBundle, ExplorerConfig } from '../types';

// Fetches all eagerLayers declared in a tool's ExplorerConfig in parallel
// and returns the parsed JSON keyed by layer name. Lazy layers are loaded
// later by chart-specific code (e.g. country layer on geographyLevel switch).

const cache = new Map<string, Promise<unknown>>();

function fetchJson<T = unknown>(url: string): Promise<T> {
  const existing = cache.get(url);
  if (existing) return existing as Promise<T>;
  // 30s timeout so a stuck request (DNS, network hang, CORS preflight
  // that never returns) doesn't leave the UI in an endless "loading"
  // state. AbortController + Promise.race.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const p = fetch(url, { signal: controller.signal })
    .then((r) => {
      clearTimeout(timeout);
      if (!r.ok) throw new Error(`Layer fetch failed: ${url} → HTTP ${r.status}`);
      return r.json();
    })
    .catch((err: Error) => {
      clearTimeout(timeout);
      cache.delete(url); // allow retry after failure
      if (err.name === 'AbortError') {
        throw new Error(`Layer fetch timed out after 30s: ${url}`);
      }
      throw err;
    });
  cache.set(url, p);
  return p as Promise<T>;
}

export async function loadEagerLayers(config: ExplorerConfig): Promise<DataBundle> {
  const entries = Object.entries(config.data.eagerLayers);
  const fetched = await Promise.all(entries.map(([, url]) => fetchJson(url)));
  return Object.fromEntries(entries.map(([name], i) => [name, fetched[i]]));
}

export async function loadLazyLayer<T = unknown>(
  config: ExplorerConfig,
  name: string,
): Promise<T> {
  const url = config.data.lazyLayers?.[name];
  if (!url) throw new Error(`Unknown lazy layer "${name}" for ${config.slug}`);
  return fetchJson<T>(url);
}
