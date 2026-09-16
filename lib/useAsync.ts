"use client";

/*
  Small hook for screens that load data from lib/local or Supabase on mount.
  State is set inside promise callbacks, never synchronously in the effect
  body, which keeps the react-hooks/set-state-in-effect rule happy and avoids
  cascading renders. reload() runs the loader again.
*/

import { useCallback, useEffect, useState } from "react";

export type AsyncState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

export function useAsync<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[],
): AsyncState<T> & { reload: () => void; setData: (updater: (prev: T | null) => T | null) => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loader()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState((prev) => ({
            data: prev.data,
            error: err instanceof Error ? err.message : "Something went wrong",
            loading: false,
          }));
        }
      });
    return () => {
      cancelled = true;
    };
    // the caller lists what the loader depends on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true }));
    setTick((t) => t + 1);
  }, []);

  const setData = useCallback((updater: (prev: T | null) => T | null) => {
    setState((prev) => ({ ...prev, data: updater(prev.data) }));
  }, []);

  return { ...state, reload, setData };
}
