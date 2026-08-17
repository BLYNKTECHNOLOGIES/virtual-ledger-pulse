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
import { CalendarClock, Plus, Download, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewOnlyWrapper } from "@/components/ui/view-only-wrapper";
import { useComplianceOptions, labelFor } from "@/hooks/useComplianceOptions";
import { exportRowsToCsv } from "@/lib/complianceCsv";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

type Obligation = {
  id: string;
  subsidiary_id: string | null;
  obligation_type: string;
  period_label: string | null;
  due_date: string;
  owner_user_id: string | null;
  owner_name: string | null;
  status: string;
  filed_on: string | null;
  filed_reference: string | null;
  notes: string | null;
};

const STATUSES = ["PENDING", "IN_PROGRESS", "FILED", "NOT_APPLICABLE"];

const fmt = (d: string | null) => {
  if (!d) return "—";
  try { return format(parseISO(d), "dd MMM yyyy"); } catch { return d; }
};

const emptyForm = {
  subsidiary_id: "",
  obligation_type: "GST_GSTR3B",
  period_label: "",
  due_date: new Date().toISOString().slice(0, 10),
  owner_name: "",
  status: "PENDING",
  filed_on: "",
  filed_reference: "",
  notes: "",
};

export function StatutoryCalendarTab() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("compliance_manage");
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Obligation | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("open");

  const { options: types } = useComplianceOptions("obligation_type", [
    { value: "GST_GSTR3B", label: "GST — GSTR-3B", sort_order: 10 },
  ]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["compliance_statutory_obligations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compliance_statutory_obligations")
        .select("*")
        .order("due_date");
      if (error) throw error;
      return (data ?? []) as Obligation[];
    },
  });

  const { data: firms = [] } = useQuery({
    queryKey: ["subsidiaries_min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subsidiaries").select("id, firm_name").order("firm_name");
      if (error) throw error;
      return (data ?? []) as { id: string; firm_name: string }[];
    },
  });

  const firmName = (id: string | null) => firms.find((f) => f.id === id)?.firm_name ?? "—";

  const filtered = useMemo(() => {
    if (statusFilter === "all") return rows;
    if (statusFilter === "open") return rows.filter((r) => ["PENDING", "IN_PROGRESS"].includes(r.status));
    return rows.filter((r) => r.status === statusFilter);
  }, [rows, statusFilter]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setOpen(true); };
  const openEdit = (o: Obligation) => {
    setEditing(o);
    setForm({
      subsidiary_id: o.subsidiary_id || "",
      obligation_type: o.obligation_type,
      period_label: o.period_label || "",
      due_date: o.due_date,
      owner_name: o.owner_name || "",
      status: o.status,
      filed_on: o.filed_on || "",
      filed_reference: o.filed_reference || "",
      notes: o.notes || "",
    });
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        subsidiary_id: form.subsidiary_id || null,
        obligation_type: form.obligation_type,
        period_label: form.period_label || null,
        due_date: form.due_date,
        owner_name: form.owner_name || null,
        status: form.status,
        filed_on: form.status === "FILED" ? (form.filed_on || new Date().toISOString().slice(0, 10)) : (form.filed_on || null),
        filed_reference: form.filed_reference || null,
        notes: form.notes || null,
      };
      if (editing) {
        const { error } = await supabase.from("compliance_statutory_obligations").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Obligation updated");
      } else {
        const { error } = await supabase.from("compliance_statutory_obligations").insert(payload);
        if (error) throw error;
        toast.success("Obligation added");
      }
      qc.invalidateQueries({ queryKey: ["compliance_statutory_obligations"] });
      qc.invalidateQueries({ queryKey: ["compliance_command_centre"] });
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const markFiled = async (o: Obligation) => {
    try {
      const { error } = await supabase
        .from("compliance_statutory_obligations")
        .update({ status: "FILED", filed_on: new Date().toISOString().slice(0, 10) })
        .eq("id", o.id);
      if (error) throw error;
      toast.success("Marked as filed");
      qc.invalidateQueries({ queryKey: ["compliance_statutory_obligations"] });
      qc.invalidateQueries({ queryKey: ["compliance_command_centre"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const dueBadge = (o: Obligation) => {
    if (["FILED", "NOT_APPLICABLE"].includes(o.status)) return null;
    const days = Math.round((new Date(`${o.due_date}T00:00:00`).getTime() - Date.now()) / 86400000);
    if (days < 0) return <Badge variant="destructive">Overdue {Math.abs(days)}d</Badge>;
    if (days <= 7) return <Badge variant="destructive">Due in {days}d</Badge>;
    if (days <= 30) return <Badge variant="secondary">Due in {days}d</Badge>;
    return null;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg"><CalendarClock className="h-5 w-5 text-primary" /></div>
              <div>
                <CardTitle>Statutory Calendar</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">GST, TDS, ROC, ITR and PF/ESIC obligations per entity</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[170px] text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open only</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" disabled={!filtered.length}
                onClick={() => exportRowsToCsv("statutory-calendar", filtered, [
                  { key: "obligation_type", label: "Obligation" },
                  { key: "period_label", label: "Period" },
                  { key: "due_date", label: "Due date" },
                  { key: "status", label: "Status" },
                  { key: "owner_name", label: "Owner" },
                  { key: "filed_on", label: "Filed on" },
                  { key: "filed_reference", label: "Filed reference" },
                  { key: "firm", label: "Entity", value: (r) => firmName(r.subsidiary_id) },
                ])}>
                <Download className="h-4 w-4 mr-2" /> Export
              </Button>
              <ViewOnlyWrapper isViewOnly={!canManage}>
                <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Add Obligation</Button>
              </ViewOnlyWrapper>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Obligation</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>}
                {!isLoading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No obligations tracked.</TableCell></TableRow>
                )}
                {filtered.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{labelFor(types, o.obligation_type)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{firmName(o.subsidiary_id)}</TableCell>
                    <TableCell>{o.period_label || "—"}</TableCell>
                    <TableCell className="space-x-2"><span>{fmt(o.due_date)}</span>{dueBadge(o)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{o.owner_name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={o.status === "FILED" ? "secondary" : o.status === "NOT_APPLICABLE" ? "outline" : "default"}>
                        {o.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {canManage && !["FILED", "NOT_APPLICABLE"].includes(o.status) && (
                        <Button variant="ghost" size="sm" onClick={() => markFiled(o)}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Filed
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openEdit(o)}>{canManage ? "Edit" : "View"}</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editing ? "Obligation" : "Add obligation"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Obligation type</Label>
              <Select value={form.obligation_type} onValueChange={(v) => setForm({ ...form, obligation_type: v })} disabled={!canManage}>
                <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>{types.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Entity / firm</Label>
              <Select value={form.subsidiary_id || "none"} onValueChange={(v) => setForm({ ...form, subsidiary_id: v === "none" ? "" : v })} disabled={!canManage}>
                <SelectTrigger className="text-foreground"><SelectValue placeholder="Group level" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Group level</SelectItem>
                  {firms.map((f) => <SelectItem key={f.id} value={f.id}>{f.firm_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Period label</Label>
              <Input className="text-foreground" placeholder="e.g. Jul 2026" value={form.period_label}
                     onChange={(e) => setForm({ ...form, period_label: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Due date</Label>
              <Input type="date" className="text-foreground" value={form.due_date}
                     onChange={(e) => setForm({ ...form, due_date: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Owner</Label>
              <Input className="text-foreground" value={form.owner_name}
                     onChange={(e) => setForm({ ...form, owner_name: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })} disabled={!canManage}>
                <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Filed on</Label>
              <Input type="date" className="text-foreground" value={form.filed_on}
                     onChange={(e) => setForm({ ...form, filed_on: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Filed reference</Label>
              <Input className="text-foreground" value={form.filed_reference}
                     onChange={(e) => setForm({ ...form, filed_reference: e.target.value })} disabled={!canManage} />
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Textarea className="text-foreground" rows={3} value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })} disabled={!canManage} />
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
