import { useCallback, useEffect, useRef, useState } from "react";

export type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

// Pending saves are flushed before the window closes (see App.tsx).
const flushers = new Set<() => Promise<void>>();
export async function flushAllAutosaves() {
  await Promise.allSettled([...flushers].map((f) => f()));
}

/**
 * Debounced autosave. Call `update(value)` on every edit; the latest value is
 * saved `delay` ms after typing stops, on `flush()`, on unmount, and before
 * the app window closes. Saves never overlap.
 */
export function useAutosave<T>(save: (value: T) => Promise<void>, delay: number) {
  const [state, setState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<{ value: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const mounted = useRef(true);

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (running.current) await running.current;
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    if (mounted.current) setState("saving");
    const p = (async () => {
      try {
        await saveRef.current(next.value);
        if (mounted.current) {
          setSavedAt(new Date());
          setError(null);
          setState(pending.current ? "pending" : "saved");
        }
      } catch (e) {
        // Keep the unsaved value so the next edit or flush retries it.
        if (!pending.current) pending.current = next;
        if (mounted.current) {
          setError(e instanceof Error ? e.message : String(e));
          setState("error");
        }
      }
    })();
    running.current = p;
    await p;
    running.current = null;
  }, []);

  const update = useCallback(
    (value: T) => {
      pending.current = { value };
      setState("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  useEffect(() => {
    mounted.current = true;
    flushers.add(flush);
    return () => {
      flushers.delete(flush);
      mounted.current = false;
      void flush();
    };
  }, [flush]);

  return { update, flush, state, savedAt, error };
}
