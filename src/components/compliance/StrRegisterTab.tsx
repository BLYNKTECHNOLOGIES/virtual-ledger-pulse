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

type StrRow = {
  id: string;
  reference_no: string | null;
  trigger_source: string;
  client_id: string | null;
  client_name: string | null;
  counterparty_name: string | null;
  amount: number | null;
  observed_on: string;
  red_flags: string[] | null;
  narrative: string;
  maker_id: string | null;
  maker_name: string | null;
  maker_recommendation: string;
  checker_id: string | null;
  checker_name: string | null;
  decision: string;
  decision_rationale: string | null;
  decision_at: string | null;
  filed_reference: string | null;
  filed_on: string | null;
  subsidiary_id: string | null;
  created_at: string;
};

const DECISIONS = ["PENDING", "FILE", "DO_NOT_FILE", "FILED"];
const RECOMMENDATIONS = ["FILE", "DO_NOT_FILE"];
const TRIGGERS = ["MANUAL", "BANK_CASE", "LIEN", "ORDER_PATTERN", "LEA_REQUEST"];

const RED_FLAGS = [
  "Structuring / smurfing",
  "Rapid pass-through",
  "Third-party funding",
  "Mismatch with declared profile",
  "Multiple accounts, same beneficiary",
  "Adverse media / LEA linkage",
  "Refusal to provide KYC",
];

const fmt = (d: string | null) => {
  if (!d) return "—";
  try { return format(parseISO(d), "dd MMM yyyy"); } catch { return d; }
};

const emptyForm = {
  reference_no: "",
  trigger_source: "MANUAL",
  client_name: "",
  counterparty_name: "",
  amount: "",
  observed_on: new Date().toISOString().slice(0, 10),
  red_flags: [] as string[],
  narrative: "",
  maker_recommendation: "FILE",
  decision: "PENDING",
  decision_rationale: "",
  filed_reference: "",
  filed_on: "",
  subsidiary_id: "",
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
  const [decisionFilter, setDecisionFilter] = useState("all");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["compliance_str_register"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compliance_str_register")
        .select("*")
        .order("observed_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StrRow[];
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (decisionFilter !== "all" && r.decision !== decisionFilter) return false;
      if (!q) return true;
      return [r.client_name, r.counterparty_name, r.reference_no, r.narrative]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [rows, search, decisionFilter]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setOpen(true); };
  const openEdit = (r: StrRow) => {
    setEditing(r);
    setForm({
      reference_no: r.reference_no || "",
      trigger_source: r.trigger_source,
      client_name: r.client_name || "",
      counterparty_name: r.counterparty_name || "",
      amount: r.amount != null ? String(r.amount) : "",
      observed_on: r.observed_on,
      red_flags: r.red_flags || [],
      narrative: r.narrative,
      maker_recommendation: r.maker_recommendation,
      decision: r.decision,
      decision_rationale: r.decision_rationale || "",
      filed_reference: r.filed_reference || "",
      filed_on: r.filed_on || "",
      subsidiary_id: r.subsidiary_id || "",
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
    const decisionChanged = (editing?.decision ?? "PENDING") !== form.decision;
    if (decisionChanged && form.decision !== "PENDING" && !canApprove) {
      toast.error("Only a compliance approver can record the checker decision");
      return;
    }
    if (decisionChanged && form.decision !== "PENDING" && !form.decision_rationale.trim()) {
      toast.error("A decision rationale is required");
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      let myName: string | null = null;
      if (uid) {
        const { data: me } = await supabase
          .from("users")
          .select("first_name, last_name, username")
          .eq("id", uid)
          .maybeSingle();
        if (me) {
          myName = [me.first_name, me.last_name].filter(Boolean).join(" ").trim() || me.username;
        }
      }

      const base = {
        reference_no: form.reference_no || null,
        trigger_source: form.trigger_source,
        client_name: form.client_name || null,
        counterparty_name: form.counterparty_name || null,
        amount: form.amount ? Number(form.amount) : null,
        observed_on: form.observed_on,
        red_flags: form.red_flags,
        narrative: form.narrative.trim(),
        maker_recommendation: form.maker_recommendation,
        subsidiary_id: form.subsidiary_id || null,
        filed_reference: form.filed_reference || null,
        filed_on: form.filed_on || null,
      };

      if (editing) {
        const decisionPatch = decisionChanged && form.decision !== "PENDING"
          ? {
              decision: form.decision,
              decision_rationale: form.decision_rationale.trim(),
              decision_at: new Date().toISOString(),
              checker_id: uid,
              checker_name: myName,
            }
          : { decision: form.decision, decision_rationale: form.decision_rationale || null };
        const { error } = await supabase
          .from("compliance_str_register")
          .update({ ...base, ...decisionPatch })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("STR entry updated");
      } else {
        const { error } = await supabase.from("compliance_str_register").insert({
          ...base,
          maker_id: uid,
          maker_name: myName,
          decision: "PENDING",
        });
        if (error) throw error;
        toast.success("STR entry recorded and sent for checker decision");
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

  const decisionVariant = (d: string) =>
    d === "FILED" ? "destructive" : d === "FILE" ? "default" : d === "DO_NOT_FILE" ? "secondary" : "outline";

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
                  Maker records the observation and a recommendation; a checker records the filing decision
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={!filtered.length}
                onClick={() => exportRowsToCsv("str-register", filtered, [
                  { key: "reference_no", label: "Reference" },
                  { key: "observed_on", label: "Observed on" },
                  { key: "trigger_source", label: "Trigger" },
                  { key: "client_name", label: "Client" },
                  { key: "counterparty_name", label: "Counterparty" },
                  { key: "amount", label: "Amount" },
                  { key: "red_flags", label: "Red flags" },
                  { key: "maker_name", label: "Maker" },
                  { key: "maker_recommendation", label: "Recommendation" },
                  { key: "checker_name", label: "Checker" },
                  { key: "decision", label: "Decision" },
                  { key: "filed_reference", label: "Filed reference" },
                  { key: "filed_on", label: "Filed on" },
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
              <Input className="pl-9 text-foreground" placeholder="Search client, counterparty, narrative…"
                     value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={decisionFilter} onValueChange={setDecisionFilter}>
              <SelectTrigger className="w-[190px] text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All decisions</SelectItem>
                {DECISIONS.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Observed</TableHead>
                  <TableHead>Client / counterparty</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Red flags</TableHead>
                  <TableHead>Maker</TableHead>
                  <TableHead>Decision</TableHead>
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
                    <TableCell>{fmt(r.observed_on)}</TableCell>
                    <TableCell className="font-medium">
                      {r.client_name || "—"}
                      {r.counterparty_name && <span className="block text-xs text-muted-foreground">{r.counterparty_name}</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.amount != null ? `\u20B9${Number(r.amount).toLocaleString("en-IN")}` : "—"}
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <div className="flex flex-wrap gap-1">
                        {(r.red_flags || []).slice(0, 2).map((f) => <Badge key={f} variant="outline" className="text-[10px]">{f}</Badge>)}
                        {(r.red_flags || []).length > 2 && <Badge variant="outline" className="text-[10px]">+{(r.red_flags || []).length - 2}</Badge>}
                        {!r.red_flags?.length && <span className="text-muted-foreground text-sm">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.maker_name || "—"}
                      <span className="block text-[11px]">rec. {r.maker_recommendation.replace(/_/g, " ")}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={decisionVariant(r.decision) as "default"}>{r.decision.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                        {r.decision === "PENDING" && canApprove ? "Decide" : canManage ? "Open" : "View"}
                      </Button>
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
              <Label>Observed on</Label>
              <Input type="date" className="text-foreground" value={form.observed_on}
                     onChange={(e) => setForm({ ...form, observed_on: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Reference no.</Label>
              <Input className="text-foreground" value={form.reference_no}
                     onChange={(e) => setForm({ ...form, reference_no: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Trigger source</Label>
              <Select value={form.trigger_source} onValueChange={(v) => setForm({ ...form, trigger_source: v })} disabled={!canManage}>
                <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>{TRIGGERS.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
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
              <Label>Client name</Label>
              <Input className="text-foreground" value={form.client_name}
                     onChange={(e) => setForm({ ...form, client_name: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Counterparty</Label>
              <Input className="text-foreground" value={form.counterparty_name}
                     onChange={(e) => setForm({ ...form, counterparty_name: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Amount</Label>
              <Input inputMode="decimal" className="text-foreground" value={form.amount}
                     onChange={(e) => setForm({ ...form, amount: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              <Label>Maker recommendation</Label>
              <Select value={form.maker_recommendation} onValueChange={(v) => setForm({ ...form, maker_recommendation: v })} disabled={!canManage}>
                <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>{RECOMMENDATIONS.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
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

            {editing && (
              <>
                <div className="sm:col-span-2 border-t border-border pt-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Checker decision</p>
                  {editing.checker_name && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Last decided by {editing.checker_name} on {fmt(editing.decision_at?.slice(0, 10) ?? null)}
                    </p>
                  )}
                </div>
                <div>
                  <Label>Decision</Label>
                  <Select value={form.decision} onValueChange={(v) => setForm({ ...form, decision: v })} disabled={!canApprove}>
                    <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                    <SelectContent>{DECISIONS.map((d) => <SelectItem key={d} value={d}>{d.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Decision rationale</Label>
                  <Input className="text-foreground" value={form.decision_rationale}
                         onChange={(e) => setForm({ ...form, decision_rationale: e.target.value })} disabled={!canApprove} />
                </div>
                {(form.decision === "FILED" || form.decision === "FILE") && (
                  <>
                    <div>
                      <Label>FIU-IND filed reference</Label>
                      <Input className="text-foreground" value={form.filed_reference}
                             onChange={(e) => setForm({ ...form, filed_reference: e.target.value })} disabled={!canApprove} />
                    </div>
                    <div>
                      <Label>Filed on</Label>
                      <Input type="date" className="text-foreground" value={form.filed_on}
                             onChange={(e) => setForm({ ...form, filed_on: e.target.value })} disabled={!canApprove} />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
            {(canManage || canApprove) && <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
