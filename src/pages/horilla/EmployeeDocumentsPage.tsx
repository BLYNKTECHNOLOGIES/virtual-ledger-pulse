import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Plus, Search, CheckCircle, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";

const DOC_TYPES = [
  { value: "aadhaar", label: "Aadhaar Card" },
  { value: "pan_card", label: "PAN Card" },
  { value: "offer_letter", label: "Offer Letter" },
  { value: "experience_letter", label: "Experience Letter" },
  { value: "education", label: "Educational Certificate" },
  { value: "address_proof", label: "Address Proof" },
  { value: "nda", label: "NDA" },
  { value: "other", label: "Other" },
];

export default function EmployeeDocumentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ employee_id: "", document_type: "", document_name: "", file_url: "", notes: "" });

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["hr_employee_documents"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_employee_documents")
        .select("*, hr_employees!hr_employee_documents_employee_id_fkey(first_name, last_name, badge_id)")
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_active"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_employees").select("id, first_name, last_name, badge_id").eq("is_active", true).order("first_name");
      return data || [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("hr_employee_documents").insert(form);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_employee_documents"] });
      setShowAdd(false);
      setForm({ employee_id: "", document_type: "", document_name: "", file_url: "", notes: "" });
      toast.success("Document added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const verifyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("hr_employee_documents").update({
        is_verified: true,
        verified_at: new Date().toISOString(),
        verified_by: "HR Admin",
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_employee_documents"] });
      toast.success("Document verified");
    },
  });

  const filtered = documents.filter((d: any) => {
    const name = `${d.hr_employees?.first_name} ${d.hr_employees?.last_name} ${d.document_name}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Employee Documents"
        description="Manage employee document records"
        actions={
          <Button onClick={() => setShowAdd(true)} className="h-9 bg-[#E8604C] hover:bg-[#d4553f]">
            <Plus className="h-4 w-4 mr-2" /> Add Document
          </Button>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search documents..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} columns={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents found"
          description="Add employee documents to get started"
          action={
            <Button onClick={() => setShowAdd(true)} className="h-9 bg-[#E8604C] hover:bg-[#d4553f]">
              <Plus className="h-4 w-4 mr-2" /> Add Document
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {filtered.map((doc: any) => (
            <Card key={doc.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm">{doc.document_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {doc.hr_employees?.first_name} {doc.hr_employees?.last_name}
                      <span className="mx-1">·</span>
                      <span className="bg-muted/80 text-muted-foreground border border-border rounded-full px-2 py-0.5 text-[10px] font-medium">
                        {DOC_TYPES.find(t => t.value === doc.document_type)?.label || doc.document_type}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {doc.is_verified ? (
                    <span className="bg-success/10 text-success border border-success/20 rounded-full px-2 py-0.5 text-[10px] font-medium flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" /> Verified
                    </span>
                  ) : (
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => verifyMutation.mutate(doc.id)}>
                      Verify
                    </Button>
                  )}
                  {doc.file_url && (
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" asChild>
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4" /> Add Employee Document
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Employee</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>{employees.map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.badge_id})</SelectItem>
                ))}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Document Type</Label>
              <Select value={form.document_type} onValueChange={(v) => setForm({ ...form, document_type: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>{DOC_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}</SelectContent>
              </Select>
            </div>
            <div><Label>Document Name</Label><Input className="h-9 mt-1" value={form.document_name} onChange={(e) => setForm({ ...form, document_name: e.target.value })} placeholder="e.g. Aadhaar Card - Front" /></div>
            <div><Label>File URL</Label><Input className="h-9 mt-1" value={form.file_url} onChange={(e) => setForm({ ...form, file_url: e.target.value })} placeholder="https://..." /></div>
            <div><Label>Notes</Label><Input className="h-9 mt-1" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-9" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button className="h-9 bg-[#E8604C] hover:bg-[#d4553f]" onClick={() => addMutation.mutate()} disabled={!form.employee_id || !form.document_type || !form.document_name || !form.file_url || addMutation.isPending}>
              {addMutation.isPending ? "Adding..." : "Add Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
