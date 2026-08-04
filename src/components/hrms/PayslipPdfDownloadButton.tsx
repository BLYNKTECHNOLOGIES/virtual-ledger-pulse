import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";

/**
 * Downloads the payslip PDF that was uploaded in the Payroll Cockpit
 * (Step 7 · Payslip email dispatch) and stored in the private `payslips`
 * bucket as `<period_month>/<hr_employee_id>.pdf`.
 *
 * Access is enforced by storage RLS: payroll staff can read everything,
 * an employee can read only their own file.
 */
export function PayslipPdfDownloadButton({
  storagePath,
  periodMonth,
  size = "sm",
  label = "Download payslip",
}: {
  storagePath?: string | null;
  periodMonth?: string | null;
  size?: "sm" | "default" | "icon";
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  if (!storagePath) return null;

  const fileName = `Payslip-${(periodMonth || "").slice(0, 7) || "current"}.pdf`;

  async function download() {
    setBusy(true);
    try {
      const { data, error } = await supabase.storage
        .from("payslips")
        .createSignedUrl(storagePath!, 60, { download: fileName });
      if (error || !data?.signedUrl) throw error || new Error("Could not create download link");
      window.open(data.signedUrl, "_blank", "noopener");
    } catch (e: any) {
      toast.error(e?.message || "Payslip PDF could not be opened");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size={size} onClick={download} disabled={busy} className="gap-1.5">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      {size !== "icon" && label}
    </Button>
  );
}
