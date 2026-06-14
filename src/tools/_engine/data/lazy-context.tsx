import { createContext, useContext, type ReactNode } from 'react';

// Context that exposes the lazy-layer trigger to descendants (e.g. the
// country picker). Lazy layers themselves are merged into the bundle the
// chart receives; this context is just the "load me now" trigger.

type LazyLayerState = {
  /** True while a fetch is in flight for this layer name. */
  loading: Record<string, boolean>;
  /** Most recent error message per layer, if any. */
  errors: Record<string, string | null>;
  /** Request a layer be loaded (idempotent; cached by the loader). */
  request: (name: string) => void;
};

const LazyLayerContext = createContext<LazyLayerState | null>(null);

export function LazyLayerProvider({
  value,
  children,
}: {
  value: LazyLayerState;
  children: ReactNode;
}) {
  return <LazyLayerContext.Provider value={value}>{children}</LazyLayerContext.Provider>;
}

export function useLazyLayer(name: string) {
  const ctx = useContext(LazyLayerContext);
  if (!ctx) throw new Error('useLazyLayer must be used inside LazyLayerProvider');
  return {
    loading: ctx.loading[name] === true,
    error: ctx.errors[name] ?? null,
    request: () => ctx.request(name),
  };
}
