import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getCurrentUserIdAsync } from "@/lib/system-action-logger";
import { Scale, AlertTriangle } from "lucide-react";

export const LEGAL_ACTION_TYPES = [
  "Litigation",
  "Arbitration",
  "Compliance Issue",
  "Contract Dispute",
  "Employment Issue",
  "Regulatory Action",
  "Other",
];

export interface EscalationSource {
  kind: "bank_case";
  id: string;
  /** Reference shown to the user, e.g. case number */
  reference: string;
  title: string;
  description?: string | null;
  status?: string | null;
  /** e.g. bank name / LEA name — used to prefill opposing party context */
  counterparty?: string | null;
  amount?: number | null;
  typeLabel?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: EscalationSource | null;
}

const inr = (n: number) => "\u20B9" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function EscalateToLegalDialog({ open, onOpenChange, source }: Props) {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    action_type: "Litigation",
    priority: "HIGH",
    title: "",
    description: "",
    case_number: "",
    court_name: "",
    opposing_party: "",
    our_lawyer: "",
    opposing_lawyer: "",
    date_filed: "",
    next_hearing_date: "",
    estimated_cost: "",
    reason: "",
  });

  useEffect(() => {
    if (!open || !source) return;
    setForm({
      action_type: "Litigation",
      priority: "HIGH",
      title: source.title ? `Legal action — ${source.title}` : `Legal action — ${source.reference}`,
      description: source.description || "",
      case_number: "",
      court_name: "",
      opposing_party: source.counterparty || "",
      our_lawyer: "",
      opposing_lawyer: "",
      date_filed: "",
      next_hearing_date: "",
      estimated_cost: "",
      reason: "",
    });
  }, [open, source?.id]);

  // Existing legal actions already linked to this case
  const { data: existing } = useQuery({
    queryKey: ["legal_actions_for_case", source?.kind, source?.id],
    enabled: open && !!source,
    queryFn: async () => {
      const column = "bank_case_id";
      const { data, error } = await supabase
        .from("legal_actions")
        .select("id, title, status, action_type, created_at")
        .eq(column, source!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const hasExisting = (existing?.length || 0) > 0;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!source) throw new Error("No source case");
      const userId = await getCurrentUserIdAsync();

      const payload: Record<string, any> = {
        action_type: form.action_type,
        title: form.title.trim(),
        description: form.description.trim() || null,
        case_number: form.case_number.trim() || null,
        court_name: form.court_name.trim() || null,
        opposing_party: form.opposing_party.trim() || null,
        our_lawyer: form.our_lawyer.trim() || null,
        opposing_lawyer: form.opposing_lawyer.trim() || null,
        priority: form.priority,
        status: "ACTIVE",
        date_filed: form.date_filed || null,
        next_hearing_date: form.next_hearing_date || null,
        estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : 0,
        actual_cost: 0,
        escalation_reason: form.reason.trim(),
        notes: `Escalated from bank case ${source.reference}`,
      };
      if (source.kind === "bank_case") payload.bank_case_id = source.id;
      else payload.regulatory_case_id = source.id;

      const { data: created, error } = await supabase
        .from("legal_actions")
        .insert(payload as any)
        .select("id")
        .single();
      if (error) throw error;

      // Timeline entry (bank cases only — that is where the case timeline lives)
      if (source.kind === "bank_case") {
        const lines = [
          `Escalated to legal action (${form.action_type})`,
          `Title: ${payload.title}`,
          form.court_name ? `Court: ${form.court_name}` : null,
          form.next_hearing_date ? `Next hearing: ${form.next_hearing_date}` : null,
          `Reason: ${form.reason.trim()}`,
          `Legal action id: ${created?.id}`,
        ].filter(Boolean);

        const { error: logError } = await supabase.from("compliance_case_updates").insert({
          bank_case_id: source.id,
          update_type: "ESCALATED_TO_LEGAL",
          update_text: lines.join("\n"),
          created_by: userId || null,
        });
        if (logError) {
          console.error("Timeline write failed:", logError);
          toast.warning("Legal action created, but the case timeline entry could not be saved");
        }
      }

      return created;
    },
    onSuccess: () => {
      toast.success("Legal action created and linked to the case");
      queryClient.invalidateQueries({ queryKey: ["legal_actions"] });
      queryClient.invalidateQueries({ queryKey: ["legal_actions_for_case"] });
      queryClient.invalidateQueries({ queryKey: ["legal_actions_by_case"] });
      queryClient.invalidateQueries({ queryKey: ["case_timeline"] });
      queryClient.invalidateQueries({ queryKey: ["compliance_command_centre"] });
      onOpenChange(false);
    },
    onError: (e: any) => {
      console.error("Escalation failed:", e);
      toast.error(e?.message || "Failed to create legal action");
    },
  });

  const summary = useMemo(() => {
    if (!source) return [];
    return [
      { label: "Reference", value: source.reference },
      source.typeLabel ? { label: "Type", value: source.typeLabel } : null,
      source.counterparty ? { label: "Counterparty", value: source.counterparty } : null,
      source.status ? { label: "Status", value: source.status.replace(/_/g, " ") } : null,
      source.amount ? { label: "Amount", value: inr(source.amount) } : null,
    ].filter(Boolean) as { label: string; value: string }[];
  }, [source]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Please enter a title");
    if (!form.action_type) return toast.error("Please choose an action type");
    if (!form.reason.trim()) return toast.error("Please provide the escalation reason");
    mutation.mutate();
  };

  if (!source) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-4 w-4" /> Escalate to legal action
          </DialogTitle>
          <DialogDescription>
            Creates a legal action linked to this case and records the escalation on the case timeline.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border/70 bg-muted/40 p-3 text-sm space-y-1">
          <p className="font-medium text-foreground">{source.title}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
            {summary.map((s) => (
              <span key={s.label}>
                <span className="font-medium">{s.label}:</span> {s.value}
              </span>
            ))}
          </div>
        </div>

        {hasExisting && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <AlertTriangle className="h-4 w-4" /> This case already has {existing!.length} linked legal action(s)
            </p>
            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
              {existing!.map((a: any) => (
                <li key={a.id} className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{a.status}</Badge>
                  {a.title} · {a.action_type}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted-foreground">Continue only if a separate matter is genuinely required.</p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Action type *</Label>
              <Select value={form.action_type} onValueChange={(v) => setForm((p) => ({ ...p, action_type: v }))}>
                <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {LEGAL_ACTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm((p) => ({ ...p, priority: v }))}>
                <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Title *</Label>
            <Input className="text-foreground" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea className="text-foreground" rows={3} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Court / forum case number</Label>
              <Input className="text-foreground" value={form.case_number} onChange={(e) => setForm((p) => ({ ...p, case_number: e.target.value }))} placeholder="If already filed" />
            </div>
            <div className="space-y-2">
              <Label>Court / forum name</Label>
              <Input className="text-foreground" value={form.court_name} onChange={(e) => setForm((p) => ({ ...p, court_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Opposing party</Label>
              <Input className="text-foreground" value={form.opposing_party} onChange={(e) => setForm((p) => ({ ...p, opposing_party: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Our lawyer</Label>
              <Input className="text-foreground" value={form.our_lawyer} onChange={(e) => setForm((p) => ({ ...p, our_lawyer: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Opposing lawyer</Label>
              <Input className="text-foreground" value={form.opposing_lawyer} onChange={(e) => setForm((p) => ({ ...p, opposing_lawyer: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Estimated cost (₹)</Label>
              <Input className="text-foreground" type="number" min="0" value={form.estimated_cost} onChange={(e) => setForm((p) => ({ ...p, estimated_cost: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Date filed</Label>
              <Input className="text-foreground" type="date" value={form.date_filed} onChange={(e) => setForm((p) => ({ ...p, date_filed: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Next hearing date</Label>
              <Input className="text-foreground" type="date" value={form.next_hearing_date} onChange={(e) => setForm((p) => ({ ...p, next_hearing_date: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Reason for escalation *</Label>
            <Textarea className="text-foreground" rows={3} value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} placeholder="Why is this case being taken to legal at this stage?" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create legal action"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
