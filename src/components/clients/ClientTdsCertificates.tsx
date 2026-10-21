import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { normalizePan } from "@/lib/tdsCertificates";
import { downloadCertificate } from "@/lib/tdsCertificateImport";

const inr = (n: number | null) => n == null ? "—" : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const QUARTER_LABEL: Record<string, string> = { Q1: "Apr–Jun", Q2: "Jul–Sep", Q3: "Oct–Dec", Q4: "Jan–Mar" };

/** Quarterly TDS certificates for the PAN(s) this client sold to us under. */
export function ClientTdsCertificates({ clientId, clientName }: { clientId?: string; clientName?: string }) {
  const { data: pans = [] } = useQuery({
    queryKey: ["client-tds-pans", clientId, clientName],
    enabled: !!clientId,
    queryFn: async () => {
      const set = new Set<string>();
      const { data: c } = await supabase.from("clients").select("pan_card_number").eq("id", clientId!).maybeSingle();
      if (c?.pan_card_number) set.add(normalizePan(c.pan_card_number));
      if (clientName) {
        const { data: po } = await supabase.from("purchase_orders").select("pan_number")
          .eq("supplier_name", clientName).not("pan_number", "is", null).limit(1000);
        (po || []).forEach((r: any) => r.pan_number && set.add(normalizePan(r.pan_number)));
      }
      return [...set].filter((p) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(p));
    },
  });

  const { data: certs = [], isLoading } = useQuery({
    queryKey: ["client-tds-certificates", pans],
    enabled: pans.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("client_tds_certificates" as any).select("*")
        .in("deductee_pan", pans).order("tax_year", { ascending: false }).order("quarter", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><FileText className="h-5 w-5" />TDS Certificates</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {pans.length === 0 && <p className="text-sm text-muted-foreground">No PAN on record for this client, so certificates can't be matched.</p>}
        {pans.length > 0 && isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {pans.length > 0 && !isLoading && certs.length === 0 && (
          <p className="text-sm text-muted-foreground">No certificates uploaded yet for PAN {pans.join(", ")}.</p>
        )}
        {certs.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                {c.quarter} {c.tax_year}
                <span className="text-xs font-normal text-muted-foreground">({QUARTER_LABEL[c.quarter]})</span>
                <Badge variant="secondary">Form {c.form_code}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                PAN {c.deductee_pan} · Paid {inr(c.amount_paid)} · TDS {inr(c.tds_amount)}{c.certificate_no ? ` · Cert ${c.certificate_no}` : ""}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() =>
              downloadCertificate(c.storage_path, c.file_name).catch((e) => toast.error(e?.message || "Download failed"))}>
              <Download className="h-4 w-4 mr-1" />Download
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
