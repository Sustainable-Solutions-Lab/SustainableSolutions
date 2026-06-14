import { createContext, useContext, type ReactNode } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';

// Lightweight React-context wrapper around the per-Explorer Zustand store.
// Explorer.tsx creates the store once and passes its hook down via this
// context; child components call useSpecStore(selector) without needing to
// know how the store was constructed.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStore = UseBoundStore<StoreApi<any>>;

const SpecStoreContext = createContext<AnyStore | null>(null);

export function SpecStoreProvider({
  store,
  children,
}: {
  store: AnyStore;
  children: ReactNode;
}) {
  return <SpecStoreContext.Provider value={store}>{children}</SpecStoreContext.Provider>;
}

export function useSpecStoreHook(): AnyStore {
  const store = useContext(SpecStoreContext);
  if (!store) throw new Error('useSpecStoreHook must be used inside a SpecStoreProvider');
  return store;
}
