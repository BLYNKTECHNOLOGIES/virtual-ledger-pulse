import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Download, Gavel, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewOnlyWrapper } from "@/components/ui/view-only-wrapper";
import { useComplianceOptions, labelFor } from "@/hooks/useComplianceOptions";
import { exportRowsToCsv } from "@/lib/complianceCsv";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

const STATUSES = ["OPEN", "IN_PROGRESS", "RESPONDED", "CLOSED"];

const fmt = (d: string | null) => {
  if (!d) return "—";
  try { return format(parseISO(d), "dd MMM yyyy"); } catch { return d; }
};

interface RegCase {
  id: string;
  reference_no: string | null;
  acknowledgment_number: string | null;
  portal: string;
  complaint_date: string | null;
  lea_name: string | null;
  jurisdiction: string | null;
  officer_name: string | null;
  officer_contact: string | null;
  subject: string;
  details: string | null;
  amount_involved: number | null;
  bank_account_id: string | null;
  subsidiary_id: string | null;
  deadline_date: string | null;
  response_filed_date: string | null;
  status: string;
  created_at: string;
}

const emptyForm = {
  reference_no: "", acknowledgment_number: "", portal: "NCRP", complaint_date: "",
  lea_name: "", jurisdiction: "", officer_name: "", officer_contact: "",
  subject: "", details: "", amount_involved: "", bank_account_id: "", subsidiary_id: "",
  deadline_date: "", response_filed_date: "", status: "OPEN",
};

export function RegulatoryCasesTab() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("compliance_manage");
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RegCase | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { options: portals } = useComplianceOptions("regulatory_portal", [
    { value: "NCRP", label: "NCRP (cybercrime.gov.in)", sort_order: 10 },
    { value: "CYBER_CELL", label: "State Cyber Cell", sort_order: 20 },
  ]);

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ["compliance_regulatory_cases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compliance_regulatory_cases")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as RegCase[];
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["bank_accounts_min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bank_accounts").select("id, account_name, bank_name").order("account_name");
      if (error) throw error;
      return data as { id: string; account_name: string; bank_name: string }[];
    },
  });

  const { data: firms = [] } = useQuery({
    queryKey: ["subsidiaries_min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subsidiaries").select("id, firm_name").order("firm_name");
      if (error) throw error;
      return data as { id: string; firm_name: string }[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q) return true;
      return [c.subject, c.acknowledgment_number, c.reference_no, c.lea_name, c.jurisdiction]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [cases, search, statusFilter]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setOpen(true); };
  const openEdit = (c: RegCase) => {
    setEditing(c);
    setForm({
      reference_no: c.reference_no || "", acknowledgment_number: c.acknowledgment_number || "",
      portal: c.portal, complaint_date: c.complaint_date || "", lea_name: c.lea_name || "",
      jurisdiction: c.jurisdiction || "", officer_name: c.officer_name || "", officer_contact: c.officer_contact || "",
      subject: c.subject, details: c.details || "",
      amount_involved: c.amount_involved != null ? String(c.amount_involved) : "",
      bank_account_id: c.bank_account_id || "", subsidiary_id: c.subsidiary_id || "",
      deadline_date: c.deadline_date || "", response_filed_date: c.response_filed_date || "", status: c.status,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.subject.trim()) { toast.error("A subject is required"); return; }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const payload = {
        reference_no: form.reference_no || null,
        acknowledgment_number: form.acknowledgment_number || null,
        portal: form.portal,
        complaint_date: form.complaint_date || null,
        lea_name: form.lea_name || null,
        jurisdiction: form.jurisdiction || null,
        officer_name: form.officer_name || null,
        officer_contact: form.officer_contact || null,
        subject: form.subject.trim(),
        details: form.details || null,
        amount_involved: form.amount_involved ? Number(form.amount_involved) : null,
        bank_account_id: form.bank_account_id || null,
        subsidiary_id: form.subsidiary_id || null,
        deadline_date: form.deadline_date || null,
        response_filed_date: form.response_filed_date || null,
        status: form.status,
      };
      if (editing) {
        const { error } = await supabase.from("compliance_regulatory_cases").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Regulatory case updated");
      } else {
        const { error } = await supabase.from("compliance_regulatory_cases")
          .insert({ ...payload, created_by: auth?.user?.id ?? null });
        if (error) throw error;
        toast.success("Regulatory case recorded");
      }
      qc.invalidateQueries({ queryKey: ["compliance_regulatory_cases"] });
      qc.invalidateQueries({ queryKey: ["compliance_command_centre"] });
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const deadlineBadge = (c: RegCase) => {
    if (!c.deadline_date || ["CLOSED", "RESPONDED"].includes(c.status)) return null;
    const days = Math.round((new Date(`${c.deadline_date}T00:00:00`).getTime() - Date.now()) / 86400000);
    if (days < 0) return <Badge variant="destructive">Overdue {Math.abs(days)}d</Badge>;
    if (days <= 7) return <Badge variant="destructive">Due in {days}d</Badge>;
    return <Badge variant="outline">Due in {days}d</Badge>;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg"><Gavel className="h-5 w-5 text-primary" /></div>
              <div>
                <CardTitle>Cyber-cell / NCRP Register</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Law-enforcement complaints, acknowledgment numbers and response deadlines
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={!filtered.length}
                onClick={() => exportRowsToCsv("regulatory-cases", filtered, [
                  { key: "reference_no", label: "Reference" },
                  { key: "portal", label: "Portal" },
                  { key: "acknowledgment_number", label: "Acknowledgment" },
                  { key: "subject", label: "Subject" },
                  { key: "lea_name", label: "LEA" },
                  { key: "jurisdiction", label: "Jurisdiction" },
                  { key: "amount_involved", label: "Amount" },
                  { key: "complaint_date", label: "Complaint date" },
                  { key: "deadline_date", label: "Deadline" },
                  { key: "response_filed_date", label: "Response filed" },
                  { key: "status", label: "Status" },
                ])}>
                <Download className="h-4 w-4 mr-2" /> Export
              </Button>
              <ViewOnlyWrapper isViewOnly={!canManage}>
                <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Record Case</Button>
              </ViewOnlyWrapper>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9 text-foreground" placeholder="Search subject, ack no., LEA…"
                     value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Portal</TableHead>
                  <TableHead>Ack no.</TableHead>
                  <TableHead>LEA / Jurisdiction</TableHead>
                  <TableHead>Complaint</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>}
                {!isLoading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No regulatory cases recorded.</TableCell></TableRow>
                )}
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium max-w-[280px] truncate">{c.subject}</TableCell>
                    <TableCell>{labelFor(portals, c.portal)}</TableCell>
                    <TableCell className="font-mono text-xs">{c.acknowledgment_number || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.lea_name || "—"}{c.jurisdiction ? ` · ${c.jurisdiction}` : ""}
                    </TableCell>
                    <TableCell>{fmt(c.complaint_date)}</TableCell>
                    <TableCell className="space-x-2">
                      <span>{fmt(c.deadline_date)}</span>
                      {deadlineBadge(c)}
                    </TableCell>
                    <TableCell><Badge variant={c.status === "CLOSED" ? "secondary" : c.status === "RESPONDED" ? "outline" : "default"}>{c.status.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>{canManage ? "Edit" : "View"}</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Regulatory case" : "Record regulatory case"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Subject *</Label>
              <Input className="text-foreground" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Portal</Label>
              <Select value={form.portal} onValueChange={(v) => setForm({ ...form, portal: v })} disabled={!canManage}>
                <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>{portals.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Acknowledgment number</Label>
              <Input className="text-foreground" value={form.acknowledgment_number} onChange={(e) => setForm({ ...form, acknowledgment_number: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Reference no.</Label>
              <Input className="text-foreground" value={form.reference_no} onChange={(e) => setForm({ ...form, reference_no: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Complaint date</Label>
              <Input type="date" className="text-foreground" value={form.complaint_date} onChange={(e) => setForm({ ...form, complaint_date: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>LEA name</Label>
              <Input className="text-foreground" value={form.lea_name} onChange={(e) => setForm({ ...form, lea_name: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Jurisdiction</Label>
              <Input className="text-foreground" value={form.jurisdiction} onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Officer name</Label>
              <Input className="text-foreground" value={form.officer_name} onChange={(e) => setForm({ ...form, officer_name: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Officer contact</Label>
              <Input className="text-foreground" value={form.officer_contact} onChange={(e) => setForm({ ...form, officer_contact: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Amount involved</Label>
              <Input inputMode="decimal" className="text-foreground" value={form.amount_involved} onChange={(e) => setForm({ ...form, amount_involved: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Bank account</Label>
              <Select value={form.bank_account_id || "none"} onValueChange={(v) => setForm({ ...form, bank_account_id: v === "none" ? "" : v })} disabled={!canManage}>
                <SelectTrigger className="text-foreground"><SelectValue placeholder="Not linked" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked</SelectItem>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.account_name} · {a.bank_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Entity / firm</Label>
              <Select value={form.subsidiary_id || "none"} onValueChange={(v) => setForm({ ...form, subsidiary_id: v === "none" ? "" : v })} disabled={!canManage}>
                <SelectTrigger className="text-foreground"><SelectValue placeholder="Not linked" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked</SelectItem>
                  {firms.map((f) => <SelectItem key={f.id} value={f.id}>{f.firm_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Deadline to respond</Label>
              <Input type="date" className="text-foreground" value={form.deadline_date} onChange={(e) => setForm({ ...form, deadline_date: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Response filed on</Label>
              <Input type="date" className="text-foreground" value={form.response_filed_date} onChange={(e) => setForm({ ...form, response_filed_date: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })} disabled={!canManage}>
                <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Details</Label>
              <Textarea className="text-foreground" rows={4} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} disabled={!canManage} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
            {canManage && <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
