import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Mail, Plus, Send, Trash2, Clock, ShieldAlert, X } from "lucide-react";

interface ReportConfig {
  id: string;
  name: string;
  variant: "profit" | "operations" | "kyc_rm";
  recipients: string[];
  send_time: string;
  enabled: boolean;
  is_monthly: boolean;
  last_sent_on: string | null;
}

type Draft = {
  id?: string;
  name: string;
  variant: "profit" | "operations" | "kyc_rm";
  recipients: string[];
  send_time: string;
  enabled: boolean;
  is_monthly: boolean;
};

const emptyDraft: Draft = {
  name: "",
  variant: "operations",
  recipients: [],
  send_time: "11:00",
  enabled: true,
  is_monthly: false,
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ReportSettings() {
  const { hasRole } = useAuth();
  const isSuperAdmin = hasRole("super admin");
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [emailInput, setEmailInput] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ["report_email_configs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_email_configs")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return (data || []) as ReportConfig[];
    },
    enabled: isSuperAdmin,
  });

  const upsertMutation = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = {
        name: d.name.trim(),
        variant: d.variant,
        recipients: d.recipients,
        send_time: d.send_time,
        enabled: d.enabled,
        is_monthly: d.is_monthly,
      };
      if (d.id) {
        const { error } = await supabase.from("report_email_configs").update(payload).eq("id", d.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("report_email_configs").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report_email_configs"] });
      setDialogOpen(false);
      toast({ title: "Saved", description: "Report format saved." });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("report_email_configs").update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["report_email_configs"] }),
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("report_email_configs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report_email_configs"] });
      toast({ title: "Deleted", description: "Report format removed." });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const sendNow = async (cfg: ReportConfig) => {
    if (cfg.recipients.length === 0) {
      toast({ title: "No recipients", description: "Add at least one recipient first.", variant: "destructive" });
      return;
    }
    setSendingId(cfg.id);
    try {
      const { error } = await supabase.functions.invoke("dispatch-report-emails", {
        body: { configId: cfg.id },
      });
      if (error) throw error;
      toast({ title: "Sent", description: `${cfg.name} dispatched to ${cfg.recipients.length} recipient(s).` });
    } catch (e: any) {
      toast({ title: "Send failed", description: e.message, variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  const openCreate = () => { setDraft(emptyDraft); setEmailInput(""); setDialogOpen(true); };
  const openEdit = (cfg: ReportConfig) => {
    setDraft({
      id: cfg.id, name: cfg.name, variant: cfg.variant, recipients: [...cfg.recipients],
      send_time: cfg.send_time, enabled: cfg.enabled, is_monthly: cfg.is_monthly,
    });
    setEmailInput("");
    setDialogOpen(true);
  };

  const addEmail = () => {
    const e = emailInput.trim();
    if (!e) return;
    if (!emailRegex.test(e)) {
      toast({ title: "Invalid email", description: e, variant: "destructive" });
      return;
    }
    if (draft.recipients.some((r) => r.toLowerCase() === e.toLowerCase())) { setEmailInput(""); return; }
    setDraft({ ...draft, recipients: [...draft.recipients, e] });
    setEmailInput("");
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ShieldAlert className="h-10 w-10 text-destructive" />
            <p className="text-lg font-semibold text-foreground">Access Denied</p>
            <p className="text-sm text-muted-foreground">Only Super Admins can manage report formats.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Report Formats"
        description="Configure business-report emails, recipients, and send times"
        actions={
          <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4 mr-1" /> New Format</Button>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : configs.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No report formats yet.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {configs.map((cfg) => (
            <Card key={cfg.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Mail className="h-4 w-4 text-primary shrink-0" />
                    <CardTitle className="text-sm font-semibold truncate">{cfg.name}</CardTitle>
                  </div>
                  <Badge variant={cfg.variant === "profit" ? "default" : "secondary"}>
                    {cfg.variant === "profit" ? "Profit" : cfg.variant === "kyc_rm" ? "KYC / RM" : "Operations"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{cfg.send_time} IST{cfg.is_monthly ? " · monthly" : " · daily"}</span>
                  <Switch
                    className="ml-auto"
                    checked={cfg.enabled}
                    onCheckedChange={(v) => toggleMutation.mutate({ id: cfg.id, enabled: v })}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cfg.recipients.length === 0 ? (
                    <span className="text-xs text-destructive">No recipients set</span>
                  ) : (
                    cfg.recipients.map((r) => (
                      <span key={r} className="text-[11px] bg-muted text-foreground rounded px-2 py-0.5">{r}</span>
                    ))
                  )}
                </div>
                {cfg.last_sent_on && (
                  <p className="text-[11px] text-muted-foreground">Last auto-sent: {cfg.last_sent_on}</p>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => openEdit(cfg)}>Edit</Button>
                  <Button variant="outline" size="sm" disabled={sendingId === cfg.id} onClick={() => sendNow(cfg)}>
                    <Send className="h-3.5 w-3.5 mr-1" />{sendingId === cfg.id ? "Sending…" : "Send now"}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-destructive ml-auto">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete “{cfg.name}”?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This report format will stop being sent. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate(cfg.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit Format" : "New Report Format"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Operations Business Report" className="text-foreground" />
            </div>
            <div className="space-y-1.5">
              <Label>Report Variant</Label>
              <Select value={draft.variant} onValueChange={(v) => setDraft({ ...draft, variant: v as Draft["variant"] })}>
                <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="profit">Profit (full report incl. P&amp;L and asset value)</SelectItem>
                  <SelectItem value="operations">Operations (no P&amp;L / asset totals)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Send Time (IST)</Label>
                <Input type="time" value={draft.send_time} onChange={(e) => setDraft({ ...draft, send_time: e.target.value })} className="text-foreground" />
              </div>
              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <Select value={draft.is_monthly ? "monthly" : "daily"} onValueChange={(v) => setDraft({ ...draft, is_monthly: v === "monthly" })}>
                  <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Recipients</Label>
              <div className="flex gap-2">
                <Input
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
                  placeholder="name@blynkex.com"
                  className="text-foreground"
                />
                <Button type="button" variant="outline" onClick={addEmail}>Add</Button>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {draft.recipients.map((r) => (
                  <span key={r} className="text-[11px] bg-muted text-foreground rounded px-2 py-0.5 flex items-center gap-1">
                    {r}
                    <button onClick={() => setDraft({ ...draft, recipients: draft.recipients.filter((x) => x !== r) })}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} />
              <Label>Enabled (auto-send on schedule)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!draft.name.trim() || upsertMutation.isPending}
              onClick={() => upsertMutation.mutate(draft)}
            >
              {upsertMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
