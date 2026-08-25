import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "blynk.helpAssistantFab.enabled";
const EVENT = "blynk:help-assistant-pref";

function read(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

/**
 * Per-browser preference controlling the floating AI assistant mascot.
 * Defaults to enabled; changes broadcast so the FAB reacts instantly.
 */
export function useHelpAssistantEnabled() {
  const [enabled, setEnabled] = useState<boolean>(read);

  useEffect(() => {
    const sync = () => setEnabled(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setHelpAssistantEnabled = useCallback((next: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
    setEnabled(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { enabled, setHelpAssistantEnabled };
}
