/**
 * ERP → eSSL Biometric Pushback Helpers.
 *
 * Mirrors razorpayPushback.ts. Every helper:
 *   - resolves the employee's badge_id (eSSL PIN),
 *   - queues DATA UPDATE/DELETE USERINFO commands on every registered device,
 *   - never throws (local save must never be blocked),
 *   - logs to `hr_essl_pushback_log` for the Data Health audit trail.
 *
 * The device applies the command on its next poll (typically 30–60s) and the
 * webhook mirrors the change into `hr_biometric_device_users` on ACK.
 */
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type EsslAction = "upsert" | "delete";

async function invokeEsslPush(
  hrEmployeeId: string,
  action: EsslAction,
  opts?: { triggeredFrom?: string; deviceSerial?: string; silent?: boolean },
): Promise<{ ok: boolean; skipped?: boolean; queued_count?: number; error?: string; reason?: string }> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase.functions.invoke("hr-essl-push", {
      body: {
        hr_employee_id: hrEmployeeId,
        action,
        device_serial: opts?.deviceSerial ?? null,
        triggered_by: userData?.user?.id ?? null,
        triggered_from: opts?.triggeredFrom ?? null,
      },
    });
    if (error) throw error;
    const payload = (data ?? {}) as any;

    if (payload.skipped) {
      if (!opts?.silent) {
        if (payload.reason === "no_badge_id") {
          toast.info("Skipped eSSL push — employee has no badge/PIN assigned.");
        } else if (payload.reason === "no_devices") {
          toast.info("Skipped eSSL push — no biometric devices registered.");
        }
      }
      return { ok: false, skipped: true, reason: payload.reason };
    }
    if (payload.ok) {
      if (!opts?.silent) {
        toast.success(
          action === "delete"
            ? `Delete queued on ${payload.queued_count} device(s) — applies on next poll`
            : `Identity queued on ${payload.queued_count} device(s) — applies on next poll`,
        );
      }
      return { ok: true, queued_count: payload.queued_count };
    }
    throw new Error(payload.error || "eSSL push failed");
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (!opts?.silent) toast.warning(`eSSL push failed: ${msg}`);
    return { ok: false, error: msg };
  }
}

export const pushIdentityToEssl = (
  id: string,
  opts?: { triggeredFrom?: string; deviceSerial?: string; silent?: boolean },
) => invokeEsslPush(id, "upsert", opts);

export const deleteFromEssl = (
  id: string,
  opts?: { triggeredFrom?: string; deviceSerial?: string; silent?: boolean },
) => invokeEsslPush(id, "delete", opts);
