import { useEffect, useRef, useState } from "react";

const STORAGE_PREFIX = "global-radar:";

export function readStored(key, fallback) {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// useState that mirrors its value into localStorage. Storage can be unavailable
// (private windows, blocked site data), so every access is guarded.
// `override` (from a shared link) applies to this visit only: it is not written back
// until the user changes the value. `isValid` rejects stale or corrupt stored values.
export function usePersistentState(key, fallback, override, isValid = () => true) {
  const [value, setValue] = useState(() => {
    if (override !== undefined) return override;
    const stored = readStored(key, fallback);
    return isValid(stored) ? stored : fallback;
  });
  const skipWrite = useRef(override !== undefined);
  useEffect(() => {
    if (skipWrite.current) {
      skipWrite.current = false;
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    } catch {
      // Preferences simply will not persist.
    }
  }, [key, value]);
  return [value, setValue];
}
