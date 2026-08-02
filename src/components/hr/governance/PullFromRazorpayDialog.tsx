import { useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";

export type PullTarget = {
  driftId: string;
  hrEmployeeId: string;
  employeeName: string;
  field: string;
  fieldLabel: string;
  hrmsValue: string | null;
  razorpayValue: string | null;
};

const SENSITIVE = new Set(["bank_account", "bank_ifsc", "annual_ctc", "active_state"]);
const BLOCKED = new Set(["employee_code"]);

const SENSITIVE_NOTE: Record<string, string> = {
  bank_account: "This rewrites the salary bank account held in HRMS. Confirm the RazorpayX value against the employee's cancelled cheque before adopting.",
  bank_ifsc: "This rewrites the salary bank IFSC held in HRMS.",
  annual_ctc: "This rescales the employee's entire HRMS salary structure to match RazorpayX. Every component is re-carved from the new monthly total.",
  active_state: "This flips the employee's active/inactive state in HRMS, which affects payroll inclusion and device roster sync.",
};

export function PullFromRazorpayDialog({
  target,
  busy,
  onCancel,
  onConfirm,
}: {
  target: PullTarget | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (opts: { confirmSensitive: boolean }) => void;
}) {
  const [ack, setAck] = useState(false);
  if (!target) return null;

  const blocked = BLOCKED.has(target.field);
  const sensitive = SENSITIVE.has(target.field);
  const noValue = target.razorpayValue == null || target.razorpayValue === "";
  const canConfirm = !blocked && !noValue && (!sensitive || ack) && !busy;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4 text-[#E8604C]" />
            <h2 className="text-sm font-semibold text-foreground">
              Adopt RazorpayX value into HRMS
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {target.employeeName} · {target.fieldLabel}
          </p>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-border bg-background px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                HRMS (will be overwritten)
              </div>
              <div className="mt-0.5 font-medium text-muted-foreground line-through break-all">
                {target.hrmsValue ?? "—"}
              </div>
            </div>
            <div className="rounded-md border border-[#E8604C]/30 bg-[#E8604C]/5 px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                RazorpayX (new HRMS value)
              </div>
              <div className="mt-0.5 font-medium text-foreground break-all">
                {target.razorpayValue ?? "—"}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            The value is re-read live from RazorpayX at the moment you confirm — not from
            the cached scan snapshot — so a stale drift row cannot write an outdated value.
          </p>

          {blocked && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              Badge ID is the HRMS identity anchor for biometric devices and payroll. It
              cannot be pulled from RazorpayX — push the HRMS value instead.
            </div>
          )}

          {!blocked && noValue && (
            <div className="rounded-md border border-warning/30 bg-warning/5 p-2 text-xs text-warning">
              RazorpayX holds no value for this field, so there is nothing to adopt.
            </div>
          )}

          {!blocked && !noValue && sensitive && (
            <label className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-2 cursor-pointer">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                className="mt-0.5 rounded border-border"
              />
              <span className="text-xs text-foreground">
                <span className="inline-flex items-center gap-1 font-medium">
                  <AlertTriangle className="h-3 w-3 text-warning" />
                  Sensitive field
                </span>
                <span className="block mt-0.5 text-muted-foreground">
                  {SENSITIVE_NOTE[target.field]}
                </span>
              </span>
            </label>
          )}
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ confirmSensitive: sensitive && ack })}
            disabled={!canConfirm}
            className="inline-flex items-center gap-1 rounded-md bg-[#E8604C] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#d04e3c] disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Adopt into HRMS
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
