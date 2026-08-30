import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const EVENT = "blynk:help-assistant-pref";
/** Default is OFF for everyone; users opt in from their profile settings. */
const DEFAULT_ENABLED = false;

const keyFor = (userId?: string | null) =>
  `blynk.helpAssistantFab.enabled.${userId || "anon"}`;

function readLocal(userId?: string | null): boolean | null {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    return raw === null ? null : raw === "true";
  } catch {
    return null;
  }
}

/**
 * Per-user preference controlling the floating AI assistant mascot.
 * Source of truth is `user_preferences.widget_settings.helpAssistant.enabled`
 * (so it survives logout / new devices); localStorage is only a fast seed.
 * Defaults to disabled.
 */
export function useHelpAssistantEnabled() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [enabled, setEnabled] = useState<boolean>(
    () => readLocal(userId) ?? DEFAULT_ENABLED
  );

  // Re-seed from local cache when the signed-in user changes.
  useEffect(() => {
    setEnabled(readLocal(userId) ?? DEFAULT_ENABLED);
  }, [userId]);

  // Load the authoritative value from the database.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("user_preferences")
          .select("widget_settings")
          .eq("user_id", userId)
          .maybeSingle();
        const settings = (data?.widget_settings as Record<string, any>) || {};
        const remote = settings?.helpAssistant?.enabled;
        const value = typeof remote === "boolean" ? remote : DEFAULT_ENABLED;
        if (cancelled) return;
        try {
          localStorage.setItem(keyFor(userId), String(value));
        } catch {
          /* ignore */
        }
        setEnabled(value);
      } catch {
        /* offline / RLS — keep local value */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Keep every mounted consumer in sync.
  useEffect(() => {
    const sync = () => setEnabled(readLocal(userId) ?? DEFAULT_ENABLED);
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [userId]);

  const setHelpAssistantEnabled = useCallback(
    (next: boolean) => {
      try {
        localStorage.setItem(keyFor(userId), String(next));
      } catch {
        /* ignore */
      }
      setEnabled(next);
      window.dispatchEvent(new Event(EVENT));

      if (!userId) return;
      void (async () => {
        try {
          const { data: existing } = await supabase
            .from("user_preferences")
            .select("id, widget_settings")
            .eq("user_id", userId)
            .maybeSingle();
          const current = (existing?.widget_settings as Record<string, any>) || {};
          const merged = { ...current, helpAssistant: { enabled: next } };
          if (existing) {
            await supabase
              .from("user_preferences")
              .update({ widget_settings: merged, updated_at: new Date().toISOString() })
              .eq("user_id", userId);
          } else {
            await supabase
              .from("user_preferences")
              .insert({ user_id: userId, widget_settings: merged });
          }
        } catch (err) {
          console.warn("Failed to persist AI assistant preference:", err);
        }
      })();
    },
    [userId]
  );

  return { enabled, setHelpAssistantEnabled };
}
