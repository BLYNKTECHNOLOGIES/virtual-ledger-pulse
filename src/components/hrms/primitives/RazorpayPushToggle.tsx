import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Link2Off, Loader2 } from "lucide-react";
import { getRazorpayLinkStatus } from "@/lib/razorpayPushback";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  employeeId: string | null | undefined;
  /** Controlled toggle value (whether the parent should also push to Razorpay). */
  value: boolean;
  onChange: (v: boolean) => void;
  /** Label for the surface (e.g. "personal info"). */
  scopeLabel?: string;
  /** Hide the whole toggle when the employee isn't linked to Razorpay. */
  hideWhenUnlinked?: boolean;
}

/**
 * Reusable "Also update in Razorpay" toggle. Drop next to any Save button.
 * Shows the current link/drift status and remembers the user's global default
 * from `user_preferences.razorpay_push_default`.
 */
export function RazorpayPushToggle({ employeeId, value, onChange, scopeLabel, hideWhenUnlinked }: Props) {
  const [initialized, setInitialized] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ["rzp_link_status", employeeId],
    queryFn: () => (employeeId ? getRazorpayLinkStatus(employeeId) : Promise.resolve({ linked: false, razorpay_employee_id: null, open_drifts: 0 })),
    enabled: !!employeeId,
    staleTime: 30_000,
  });

  // Seed value from user's global default (once).
  useEffect(() => {
    if (initialized) return;
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user) { setInitialized(true); return; }
        const { data } = await (supabase as any)
          .from("user_preferences")
          .select("razorpay_push_default")
          .eq("user_id", userData.user.id)
          .maybeSingle();
        if (typeof data?.razorpay_push_default === "boolean") onChange(data.razorpay_push_default);
      } catch { /* ignore */ }
      setInitialized(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!employeeId) return null;
  if (hideWhenUnlinked && status && !status.linked) return null;

  const linked = !!status?.linked;
  const drifts = status?.open_drifts ?? 0;
  const disabled = !linked;

  return (
    <div className="flex items-center gap-2 flex-wrap rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-[11px]">
      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-border accent-[#E8604C]"
          checked={value && !disabled}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="font-medium text-foreground">
          Also update in Razorpay
          {scopeLabel ? <span className="text-muted-foreground"> ({scopeLabel})</span> : null}
        </span>
      </label>

      {isLoading ? (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> checking…
        </span>
      ) : !linked ? (
        <span className="inline-flex items-center gap-1 text-warning">
          <Link2Off className="h-3 w-3" /> Not linked
        </span>
      ) : drifts > 0 ? (
        <span className="inline-flex items-center gap-1 text-destructive">
          <AlertTriangle className="h-3 w-3" /> {drifts} drift{drifts === 1 ? "" : "s"}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-success">
          <CheckCircle2 className="h-3 w-3" /> Synced
        </span>
      )}
    </div>
  );
}
