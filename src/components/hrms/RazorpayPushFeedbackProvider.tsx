import { useCallback, useEffect, useState } from "react";
import { RazorpayPushResultDialog } from "./RazorpayPushResultDialog";
import { RAZORPAY_PUSH_RESULT_EVENT, type PushResultEventDetail } from "@/lib/razorpayVerify";

/**
 * Mount once at the top of the HRMS tree. Any code path that calls
 * `pushToRazorpay` (or its wrappers) will dispatch a window event when the
 * push resolves to `partial` or `failed`; this provider listens and opens
 * the field-by-field diff dialog.
 */
export function RazorpayPushFeedbackProvider() {
  const [detail, setDetail] = useState<PushResultEventDetail | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<PushResultEventDetail>).detail;
      if (!d) return;
      if (d.overall === "verified" || d.overall === "skipped") return;
      setDetail(d);
      setOpen(true);
    };
    window.addEventListener(RAZORPAY_PUSH_RESULT_EVENT, handler as EventListener);
    return () => window.removeEventListener(RAZORPAY_PUSH_RESULT_EVENT, handler as EventListener);
  }, []);

  const handleRetry = useCallback(async () => {
    if (!detail?.retry) return;
    const next = await detail.retry();
    if (next.overall === "verified") {
      setOpen(false);
      setDetail(null);
    } else {
      setDetail({ ...detail, ...next });
    }
  }, [detail]);

  return (
    <RazorpayPushResultDialog
      open={open}
      onOpenChange={(v) => { setOpen(v); if (!v) setDetail(null); }}
      detail={detail}
      onRetry={detail?.retry ? handleRetry : undefined}
    />
  );
}
