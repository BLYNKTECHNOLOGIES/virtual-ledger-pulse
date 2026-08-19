import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { toast } from "sonner";
import { Archive, Search, Printer, Ban, ShieldAlert, FileDown, Trash2 } from "lucide-react";
import { printDocument } from "@/lib/docRender";

export function IssuedTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [reason, setReason] = useState("");

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["hr_documents_issued"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_documents_issued").select("*").order("issued_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data || [];
    },
  });

  /** Open the archived PDF, building it on demand if the letter has none yet. */
  const openPdf = async (doc: any) => {
    const id = toast.loading(doc.pdf_path ? "Opening PDF…" : "Preparing PDF…");
    try {
      const { ensureIssuedPdf } = await import("@/lib/ensureIssuedPdf");
      const { path } = await ensureIssuedPdf(doc);
      const { data, error } = await supabase.storage
        .from("hr-doc-issued").createSignedUrl(path, 300);
      if (error || !data?.signedUrl) throw error || new Error("Could not open the PDF");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      if (!doc.pdf_path) {
        qc.invalidateQueries({ queryKey: ["hr_documents_issued"] });
        qc.invalidateQueries({ queryKey: ["hr_employee_documents", doc.employee_id] });
      }
      toast.success("PDF ready", { id });
    } catch (e: any) {
      toast.error(e?.message || "Could not open the PDF", { id });
    }
  };

  /** Re-open the frozen artefact exactly as issued — never re-resolved. */
  const reprint = async (doc: any) => {
    try {
      const { data, error } = await supabase.storage
        .from("hr-doc-issued").createSignedUrl(doc.file_path, 120);
      if (error || !data?.signedUrl) throw error || new Error("Could not open the stored letter");
      const res = await fetch(data.signedUrl);

      // Word artefacts (locked native templates) are rendered to PDF for printing.
      if (String(doc.file_mime || "").includes("wordprocessingml")) {
        const { wrapDocxHtml } = await import("@/lib/docPdf");
        const { convertDocxToHtml } = await import("@/lib/docxImport");
        printDocument(wrapDocxHtml(convertDocxToHtml(await res.arrayBuffer()), doc.template_name || "Letter"));
        return;
      }
      printDocument(await res.text());
    } catch (e: any) {
      toast.error(e?.message || "Could not open the letter");
    }
  };


  /** Permanent removal — HR staff only (enforced by RLS as well). */
  const remove = async () => {
    if (!deleteTarget) return;
    const d = deleteTarget;
    try {
      const paths = [d.file_path, d.pdf_path].filter(Boolean);
      if (paths.length) await supabase.storage.from("hr-doc-issued").remove(paths);
      if (d.employee_document_id) {
        await (supabase as any).from("hr_employee_documents").delete().eq("id", d.employee_document_id);
      }
      const { error } = await (supabase as any).from("hr_documents_issued").delete().eq("id", d.id);
      if (error) throw error;

      const { data: auth } = await supabase.auth.getUser();
      await (supabase as any).from("hr_doc_audit_log").insert({
        entity_type: "issued_document", entity_id: d.id, action: "deleted",
        actor_id: auth?.user?.id || null, actor_name: auth?.user?.email || null,
        details: { reference_no: d.reference_no, employee_id: d.employee_id },
      });
      qc.invalidateQueries({ queryKey: ["hr_documents_issued"] });
      qc.invalidateQueries({ queryKey: ["hr_employee_documents", d.employee_id] });
      toast.success("Letter deleted");
    } catch (e: any) {
      toast.error(e?.message || "Could not delete the letter");
    } finally {
      setDeleteTarget(null);
    }
  };


  const revoke = async () => {
    if (!revokeTarget) return;
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("hr_documents_issued").update({
      status: "revoked",
      revoked_by: auth?.user?.id || null,
      revoked_at: new Date().toISOString(),
      revoke_reason: reason || null,
    }).eq("id", revokeTarget.id);
    if (error) return toast.error(error.message);
    await (supabase as any).from("hr_doc_audit_log").insert({
      entity_type: "issued_document", entity_id: revokeTarget.id, action: "revoked",
      actor_id: auth?.user?.id || null, actor_name: auth?.user?.email || null,
      details: { reference_no: revokeTarget.reference_no, reason },
    });
    qc.invalidateQueries({ queryKey: ["hr_documents_issued"] });
    toast.success("Letter revoked");
    setRevokeTarget(null); setReason("");
  };


  const filtered = docs.filter((d: any) => {
    const q = search.toLowerCase();
    return !q || d.reference_no?.toLowerCase().includes(q) ||
      d.employee_name?.toLowerCase().includes(q) || d.template_name?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search reference, employee or template..." value={search}
          onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Archive} title="No letters issued yet" description="Generated letters appear here with their reference number and frozen values." />
      ) : (
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {filtered.map((d: any) => (
              <div key={d.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate flex items-center gap-2">
                    <span className="font-mono text-xs">{d.reference_no}</span>
                    <span className="truncate">{d.template_name}</span>
                    {d.contains_sensitive && <ShieldAlert className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {d.employee_name || "—"}
                    {d.issued_at ? ` · ${new Date(d.issued_at).toLocaleDateString()}` : ""}
                    {d.issued_by_name ? ` · by ${d.issued_by_name}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={d.status === "revoked" ? "destructive" : "outline"} className="text-[10px] capitalize">{d.status}</Badge>
                  {d.pdf_path && (
                    <Button size="sm" variant="ghost" title="Open PDF" onClick={() => openPdf(d)}>
                      <FileDown className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" title="Re-print original" onClick={() => reprint(d)}><Printer className="h-4 w-4" /></Button>
                  {d.status !== "revoked" && (
                    <Button size="sm" variant="ghost" title="Revoke" onClick={() => setRevokeTarget(d)}>
                      <Ban className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" title="Delete permanently" onClick={() => setDeleteTarget(d)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => { if (!o) { setRevokeTarget(null); setReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {revokeTarget?.reference_no}?</AlertDialogTitle>
            <AlertDialogDescription>
              The letter stays on record for audit but is marked revoked. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} className="text-foreground" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={revoke}>Revoke</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.reference_no}?</AlertDialogTitle>
            <AlertDialogDescription>
              The stored letter, its PDF and the copy in the employee's documents are removed permanently.
              Only the audit trail is kept. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

export default IssuedTab;
