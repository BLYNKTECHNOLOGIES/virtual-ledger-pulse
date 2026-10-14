import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ERP_HEARTBEAT_MS } from "@/lib/umPresence";

/** Mounted in the ERP shell only; presence expires naturally without unload races across tabs. */
export function useErpPresence() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user?.id) return;
    let inFlight = false;
    const heartbeat = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const { error } = await (supabase as any).rpc("erp_heartbeat");
        if (error) console.warn("[ERP presence]", error.message);
      } finally { inFlight = false; }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void heartbeat(); };
    void heartbeat();
    const timer = setInterval(heartbeat, ERP_HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [user?.id]);
}