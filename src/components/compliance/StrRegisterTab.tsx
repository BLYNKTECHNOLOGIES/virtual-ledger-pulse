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
import { Plus, Download, ShieldAlert, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewOnlyWrapper } from "@/components/ui/view-only-wrapper";
import { exportRowsToCsv } from "@/lib/complianceCsv";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

const STATUSES = ["DRAFT", "UNDER_REVIEW", "REPORTED", "NOT_REPORTABLE"];

const fmt = (d: string | null) => {
  if (!d) return "—";
  try { return format(parseISO(d), "dd MMM yyyy"); } catch { return d; }
};

interface StrRow {
  id: string;
  reference_no: string | null;
  client_id: string | null;
  client_name: string | null;
  detection_date: string;
  transaction_reference: string | null;
  amount: number | null;
  red_flags: string[] | null;
  narrative: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reported_at: string | null;
  fiu_reference: string | null;
  created_at: string;
}

const RED_FLAGS = [
  "Structuring / smurfing",
  "Rapid pass-through",
  "Third-party funding",
  "Mismatch with declared profile",
  "Multiple accounts, same beneficiary",
  "Adverse media / LEA linkage",
  "Refusal to provide KYC",
];

const emptyForm = {
  reference_no: "", client_id: "", client_name: "", detection_date: new Date().toISOString().slice(0, 10),
  transaction_reference: "", amount: "", red_flags: [] as string[], narrative: "",
  status: "DRAFT", fiu_reference: "",
};

export function StrRegisterTab() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("compliance_manage");
  const canApprove = hasPermission("compliance_approve");
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StrRow | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["compliance_str_register"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compliance_str_register")
        .select("*")
        .order("detection_date", { ascending: false });
      if (error) throw error;
      return data as StrRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return [r.client_name, r.reference_no, r.transaction_reference, r.narrative]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [rows, search, statusFilter]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setOpen(true); };
  const openEdit = (r: StrRow) => {
    setEditing(r);
    setForm({
      reference_no: r.reference_no || "", client_id: r.client_id || "", client_name: r.client_name || "",
      detection_date: r.detection_date, transaction_reference: r.transaction_reference || "",
      amount: r.amount != null ? String(r.amount) : "", red_flags: r.red_flags || [],
      narrative: r.narrative, status: r.status, fiu_reference: r.fiu_reference || "",
    });
    setOpen(true);
  };

  const toggleFlag = (flag: string) =>
    setForm((f) => ({
      ...f,
      red_flags: f.red_flags.includes(flag) ? f.red_flags.filter((x) => x !== flag) : [...f.red_flags, flag],
    }));

  const save = async () => {
    if (!form.narrative.trim()) { toast.error("A narrative is required"); return; }
    if (form.status !== "DRAFT" && !canApprove) {
      toast.error("Only a compliance approver can move an STR out of draft");
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      const decided = ["REPORTED", "NOT_REPORTABLE"].includes(form.status);
      const payload = {
        reference_no: form.reference_no || null,
        client_id: form.client_id || null,
        client_name: form.client_name || null,
        detection_date: form.detection_date,
        transaction_reference: form.transaction_reference || null,
        amount: form.amount ? Number(form.amount) : null,
        red_flags: form.red_flags.length ? form.red_flags : null,
        narrative: form.narrative.trim(),
        status: form.status,
        fiu_reference: form.fiu_reference || null,
        reviewed_by: decided ? uid : editing?.reviewed_by ?? null,
        reviewed_at: decided ? new Date().toISOString() : editing?.reviewed_at ?? null,
        reported_at: form.status === "REPORTED" ? (editing?.reported_at ?? new Date().toISOString()) : null,
      };
      if (editing) {
        const { error } = await supabase.from("compliance_str_register").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("STR entry updated");
      } else {
        const { error } = await supabase.from("compliance_str_register").insert({ ...payload, created_by: uid });
        if (error) throw error;
        toast.success("STR entry recorded");
      }
      qc.invalidateQueries({ queryKey: ["compliance_str_register"] });
      qc.invalidateQueries({ queryKey: ["compliance_command_centre"] });
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const statusVariant = (s: string) =>
    s === "REPORTED" ? "destructive" : s === "NOT_REPORTABLE" ? "secondary" : s === "UNDER_REVIEW" ? "default" : "outline";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg"><ShieldAlert className="h-5 w-5 text-primary" /></div>
              <div>
                <CardTitle>Suspicious Transaction Register</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Maker records the observation; an approver decides whether it is reportable
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={!filtered.length}
                onClick={() => exportRowsToCsv("str-register", filtered, [
                  { key: "reference_no", label: "Reference" },
                  { key: "detection_date", label: "Detected on" },
                  { key: "client_name", label: "Client" },
                  { key: "transaction_reference", label: "Transaction" },
                  { key: "amount", label: "Amount" },
                  { key: "red_flags", label: "Red flags" },
                  { key: "status", label: "Status" },
                  { key: "fiu_reference", label: "FIU reference" },
                  { key: "reported_at", label: "Reported at" },
                ])}>
                <Download className="h-4 w-4 mr-2" /> Export
              </Button>
              <ViewOnlyWrapper isViewOnly={!canManage}>
                <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-2" /> New Entry</Button>
              </ViewOnlyWrapper>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9 text-foreground" placeholder="Search client, reference, narrative…"
                     value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[190px] text-foreground"><SelectValue /></SelectTrigger>
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
                  <TableHead>Detected</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Transaction</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Red flags</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>}
                {!isLoading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No entries recorded.</TableCell></TableRow>
                )}
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{fmt(r.detection_date)}</TableCell>
                    <TableCell className="font-medium">{r.client_name || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.transaction_reference || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.amount != null ? `\u20B9${Number(r.amount).toLocaleString("en-IN")}` : "—"}
                    </TableCell>
                    <TableCell className="max-w-[240px]">
                      <div className="flex flex-wrap gap-1">
                        {(r.red_flags || []).slice(0, 2).map((f) => <Badge key={f} variant="outline" className="text-[10px]">{f}</Badge>)}
                        {(r.red_flags || []).length > 2 && <Badge variant="outline" className="text-[10px]">+{(r.red_flags || []).length - 2}</Badge>}
                        {!r.red_flags?.length && <span className="text-muted-foreground text-sm">—</span>}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant={statusVariant(r.status) as "default"}>{r.status.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>{canManage ? "Open" : "View"}</Button>
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
          <DialogHeader><DialogTitle>{editing ? "STR entry" : "New STR entry"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Detection date</Label>
              <Input type="date" className="text-foreground" value={form.detection_date} onChange={(e) => setForm({ ...form, detection_date: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Reference no.</Label>
              <Input className="text-foreground" value={form.reference_no} onChange={(e) => setForm({ ...form, reference_no: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Client name</Label>
              <Input className="text-foreground" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Transaction reference</Label>
              <Input className="text-foreground" value={form.transaction_reference} onChange={(e) => setForm({ ...form, transaction_reference: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Amount</Label>
              <Input inputMode="decimal" className="text-foreground" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })} disabled={!canManage}>
                <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} disabled={s !== "DRAFT" && !canApprove}>{s.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.status === "REPORTED" && (
              <div className="sm:col-span-2">
                <Label>FIU-IND reference</Label>
                <Input className="text-foreground" value={form.fiu_reference} onChange={(e) => setForm({ ...form, fiu_reference: e.target.value })} disabled={!canApprove} />
              </div>
            )}
            <div className="sm:col-span-2">
              <Label className="mb-2 block">Red flags</Label>
              <div className="flex flex-wrap gap-2">
                {RED_FLAGS.map((f) => (
                  <button key={f} type="button" disabled={!canManage} onClick={() => toggleFlag(f)}
                    className={`text-xs rounded-full border px-3 py-1 transition-colors ${
                      form.red_flags.includes(f)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                    }`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label>Narrative *</Label>
              <Textarea className="text-foreground" rows={5} value={form.narrative}
                        onChange={(e) => setForm({ ...form, narrative: e.target.value })} disabled={!canManage}
                        placeholder="What was observed, why it is suspicious, what was checked and concluded." />
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
