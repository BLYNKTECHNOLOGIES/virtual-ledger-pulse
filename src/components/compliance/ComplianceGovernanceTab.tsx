import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { History, Plus, Settings2, KeyRound, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { exportRowsToCsv } from "@/lib/complianceCsv";
import { complianceTabsListCls, complianceTabTriggerCls, complianceTabsWrapperCls } from "./complianceTabStyles";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

const ts = (d: string | null) => {
  if (!d) return "—";
  try { return format(parseISO(d), "dd MMM yyyy, HH:mm"); } catch { return d; }
};

type AuditRow = {
  id: string;
  table_name: string;
  record_id: string | null;
  action: string;
  changed_by: string | null;
  changed_fields: string[] | null;
  changed_at: string;
};

type ConfigRow = {
  id: string;
  option_group: string;
  value: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};

type CredRow = {
  id: string;
  bank_account_id: string | null;
  accessed_by: string | null;
  accessed_at: string;
  field_accessed: string | null;
  purpose: string | null;
};

function AuditPanel() {
  const [tableFilter, setTableFilter] = useState("all");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["compliance_audit_log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compliance_audit_log")
        .select("id, table_name, record_id, action, changed_by, changed_fields, changed_at")
        .order("changed_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const tables = useMemo(() => Array.from(new Set(rows.map((r) => r.table_name))).sort(), [rows]);
  const filtered = useMemo(
    () => (tableFilter === "all" ? rows : rows.filter((r) => r.table_name === tableFilter)),
    [rows, tableFilter],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg"><History className="h-5 w-5 text-primary" /></div>
            <div>
              <CardTitle>Change Audit Trail</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Last 500 changes across every compliance table</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={tableFilter} onValueChange={setTableFilter}>
              <SelectTrigger className="w-[220px] text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tables</SelectItem>
                {tables.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={!filtered.length}
              onClick={() => exportRowsToCsv("compliance-audit-log", filtered, [
                { key: "changed_at", label: "When" },
                { key: "table_name", label: "Table" },
                { key: "action", label: "Action" },
                { key: "record_id", label: "Record" },
                { key: "changed_by", label: "By (user id)" },
                { key: "changed_fields", label: "Fields" },
              ])}>
              <Download className="h-4 w-4 mr-2" /> Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Table</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Fields changed</TableHead>
                <TableHead>Record</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No changes recorded yet.</TableCell></TableRow>
              )}
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{ts(r.changed_at)}</TableCell>
                  <TableCell className="font-mono text-xs">{r.table_name}</TableCell>
                  <TableCell>
                    <Badge variant={r.action === "DELETE" ? "destructive" : r.action === "INSERT" ? "default" : "secondary"}>
                      {r.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[320px]">
                    <div className="flex flex-wrap gap-1">
                      {(r.changed_fields || []).slice(0, 5).map((f) => (
                        <Badge key={f} variant="outline" className="text-[10px]">{f}</Badge>
                      ))}
                      {(r.changed_fields || []).length > 5 && (
                        <Badge variant="outline" className="text-[10px]">+{(r.changed_fields || []).length - 5}</Badge>
                      )}
                      {!r.changed_fields?.length && <span className="text-muted-foreground text-sm">—</span>}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground">{r.record_id?.slice(0, 8) ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function CredentialAccessPanel() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["banking_credential_access_log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("banking_credential_access_log")
        .select("id, bank_account_id, accessed_by, accessed_at, field_accessed, purpose")
        .order("accessed_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as CredRow[];
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg"><KeyRound className="h-5 w-5 text-primary" /></div>
          <div>
            <CardTitle>Banking Credential Access Log</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Every reveal of a stored banking credential is recorded</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Field</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Account</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No credential access recorded.</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{ts(r.accessed_at)}</TableCell>
                  <TableCell>{r.field_accessed || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.purpose || "—"}</TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground">{r.bank_account_id?.slice(0, 8) ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfigPanel({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ option_group: "", value: "", label: "", sort_order: "100" });
  const [saving, setSaving] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["compliance_config_options", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compliance_config_options")
        .select("id, option_group, value, label, sort_order, is_active")
        .order("option_group")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as ConfigRow[];
    },
  });

  const groups = useMemo(() => Array.from(new Set(rows.map((r) => r.option_group))).sort(), [rows]);

  const toggle = async (row: ConfigRow, next: boolean) => {
    const { error } = await supabase.from("compliance_config_options").update({ is_active: next }).eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["compliance_config_options"] });
  };

  const add = async () => {
    if (!form.option_group || !form.value || !form.label) { toast.error("Group, value and label are required"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("compliance_config_options").insert({
        option_group: form.option_group.trim(),
        value: form.value.trim().toUpperCase().replace(/\s+/g, "_"),
        label: form.label.trim(),
        sort_order: Number(form.sort_order) || 100,
      });
      if (error) throw error;
      toast.success("Option added");
      qc.invalidateQueries({ queryKey: ["compliance_config_options"] });
      setOpen(false);
      setForm({ option_group: "", value: "", label: "", sort_order: "100" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg"><Settings2 className="h-5 w-5 text-primary" /></div>
            <div>
              <CardTitle>Configuration</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Dropdown vocabularies used across the compliance module</p>
            </div>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" /> Add Option</Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {groups.map((g) => (
          <div key={g} className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{g.replace(/_/g, " ")}</p>
            <div className="rounded-md border border-border divide-y divide-border">
              {rows.filter((r) => r.option_group === g).map((r) => (
                <div key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="text-foreground">{r.label}</span>
                    <span className="ml-2 font-mono text-[11px] text-muted-foreground">{r.value}</span>
                  </div>
                  <Switch checked={r.is_active} disabled={!canManage} onCheckedChange={(v) => toggle(r, v)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add configuration option</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Group</Label>
              <Select value={form.option_group} onValueChange={(v) => setForm({ ...form, option_group: v })}>
                <SelectTrigger className="text-foreground"><SelectValue placeholder="Select a group" /></SelectTrigger>
                <SelectContent>{groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Value</Label><Input className="text-foreground" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
            <div><Label>Label</Label><Input className="text-foreground" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
            <div><Label>Sort order</Label><Input inputMode="numeric" className="text-foreground" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={add} disabled={saving}>{saving ? "Saving…" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function ComplianceGovernanceTab() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("compliance_manage");

  return (
    <Tabs defaultValue="audit" className="space-y-6">
      <div className={complianceTabsWrapperCls}>
        <TabsList className={complianceTabsListCls}>
          <TabsTrigger value="audit" className={complianceTabTriggerCls}>
            <History className="h-4 w-4" /> <span>Audit Trail</span>
          </TabsTrigger>
          <TabsTrigger value="credentials" className={complianceTabTriggerCls}>
            <KeyRound className="h-4 w-4" /> <span>Credential Access</span>
          </TabsTrigger>
          <TabsTrigger value="config" className={complianceTabTriggerCls}>
            <Settings2 className="h-4 w-4" /> <span>Configuration</span>
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="audit"><AuditPanel /></TabsContent>
      <TabsContent value="credentials"><CredentialAccessPanel /></TabsContent>
      <TabsContent value="config"><ConfigPanel canManage={canManage} /></TabsContent>
    </Tabs>
  );
}
