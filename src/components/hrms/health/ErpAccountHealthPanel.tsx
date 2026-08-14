import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, UserX, Link2, ArrowRight, EyeOff } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deactivateErpAccount } from "@/lib/erpAccountDeactivation";

type Row = {
  issue_type:
    | "missing_badge"
    | "no_employee"
    | "orphan_badge"
    | "mismatch"
    | "active_login_inactive_employee"
    | "employee_without_erp";
  user_id: string | null;
  username: string | null;
  erp_badge_id: string | null;
  erp_status: string | null;
  hr_employee_id: string | null;
  emp_badge_id: string | null;
  emp_full_name: string | null;
  emp_active: boolean | null;
  field: string | null;
  erp_value: string | null;
  hrms_value: string | null;
  erp_full_name: string | null;
  erp_email: string | null;
  erp_phone: string | null;
  severity: "low" | "medium" | "high" | "critical";
};

const GROUPS: Array<{ key: Row["issue_type"]; title: string; hint: string; tone: string }> = [
  {
    key: "no_employee",
    title: "ERP login with no HRMS employee",
    hint: "No badge ID and no employee record — this account should not have ERP access",
    tone: "destructive",
  },
  {
    key: "missing_badge",
    title: "ERP login without badge ID",
    hint: "Matches an HRMS employee by email — badge ID missing on the ERP account",
    tone: "warning",
  },
  {
    key: "orphan_badge",
    title: "Badge ID points to no HRMS employee",
    hint: "The badge on the ERP login does not exist in HRMS",
    tone: "destructive",
  },
  {
    key: "active_login_inactive_employee",
    title: "Active ERP login for an inactive employee",
    hint: "Login still usable after separation",
    tone: "destructive",
  },
  {
    key: "mismatch",
    title: "ERP data mismatched with HRMS",
    hint: "Email, phone or name differs from the HRMS record",
    tone: "warning",
  },
  {
    key: "employee_without_erp",
    title: "Active employee with no ERP account",
    hint: "No ERP login found by badge ID or email",
    tone: "muted",
  },
];

const FIELD_LABEL: Record<string, string> = {
  email: "Email",
  phone: "Phone",
  full_name: "Full name",
  active_state: "Account status",
};

const toneClass = (tone: string) =>
  tone === "destructive"
    ? "border-destructive/40 bg-destructive/5"
    : tone === "warning"
      ? "border-warning/40 bg-warning/5"
      : "border-border bg-card";

export function ErpAccountHealthPanel() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [exemptTarget, setExemptTarget] = useState<Row | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Row | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["erp_account_health"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_erp_account_health_v")
        .select("*")
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    staleTime: 60_000,
  });

  const grouped = useMemo(() => {
    const map = new Map<Row["issue_type"], Row[]>();
    for (const r of rows ?? []) {
      const arr = map.get(r.issue_type) ?? [];
      arr.push(r);
      map.set(r.issue_type, arr);
    }
    return map;
  }, [rows]);

  const total = rows?.length ?? 0;

  function refresh() {
    qc.invalidateQueries({ queryKey: ["erp_account_health"] });
  }

  async function linkBadge(row: Row) {
    if (!row.user_id || !row.emp_badge_id) return;
    setBusy(`${row.user_id}-badge`);
    try {
      const { error } = await (supabase as any)
        .from("users")
        .update({ badge_id: row.emp_badge_id, updated_at: new Date().toISOString() })
        .eq("id", row.user_id);
      if (error) throw error;
      toast.success(`Badge ${row.emp_badge_id} linked to the ERP account`);
      refresh();
    } catch (e: any) {
      toast.error(`Could not link badge: ${e?.message || e}`);
    } finally {
      setBusy(null);
    }
  }

  async function adoptHrmsValue(row: Row) {
    if (!row.user_id || !row.field) return;
    setBusy(`${row.user_id}-${row.field}`);
    try {
      const patch: Record<string, any> = { updated_at: new Date().toISOString() };
      if (row.field === "email") patch.email = (row.hrms_value || "").toLowerCase();
      else if (row.field === "phone") patch.phone = row.hrms_value;
      else if (row.field === "full_name") {
        const parts = (row.hrms_value || "").trim().split(/\s+/);
        patch.first_name = parts.shift() || null;
        patch.last_name = parts.join(" ") || null;
      }
      const { error } = await (supabase as any).from("users").update(patch).eq("id", row.user_id);
      if (error) throw error;
      toast.success(`${FIELD_LABEL[row.field] ?? row.field} adopted from HRMS`);
      refresh();
    } catch (e: any) {
      toast.error(`Could not update the ERP account: ${e?.message || e}`);
    } finally {
      setBusy(null);
    }
  }

  async function adoptErpValue(row: Row) {
    if (!row.hr_employee_id || !row.field) return;
    setBusy(`${row.user_id}-${row.field}-erp`);
    try {
      const patch: Record<string, any> = { updated_at: new Date().toISOString() };
      if (row.field === "email") patch.email = (row.erp_value || "").toLowerCase();
      else if (row.field === "phone") patch.phone = row.erp_value;
      else if (row.field === "full_name") {
        const parts = (row.erp_value || "").trim().split(/\s+/);
        patch.first_name = parts.shift() || null;
        patch.last_name = parts.join(" ") || null;
      }
      const { error } = await (supabase as any)
        .from("hr_employees")
        .update(patch)
        .eq("id", row.hr_employee_id);
      if (error) throw error;
      toast.success(`${FIELD_LABEL[row.field] ?? row.field} adopted from ERP into HRMS`);
      refresh();
    } catch (e: any) {
      toast.error(`Could not update the HRMS record: ${e?.message || e}`);
    } finally {
      setBusy(null);
    }
  }

  async function doDeactivate(row: Row) {
    if (!row.hr_employee_id) return;
    setBusy(`${row.user_id}-deactivate`);
    try {
      const res = await deactivateErpAccount(row.hr_employee_id);
      if (res.deactivated) toast.success("ERP login deactivated and signed out");
      else toast.error(res.reason || "Could not deactivate");
      setDeactivateTarget(null);
      refresh();
    } catch (e: any) {
      toast.error(`Deactivation failed: ${e?.message || e}`);
    } finally {
      setBusy(null);
    }
  }

  async function doExempt(row: Row) {
    if (!row.user_id) return;
    setBusy(`${row.user_id}-exempt`);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("hr_erp_account_exemptions").insert({
        user_id: row.user_id,
        badge_id: row.erp_badge_id,
        reason: "Marked as a non-employee / system account from Data Health",
        created_by: auth?.user?.id ?? null,
      });
      if (error) throw error;
      toast.success("Account exempted from ERP health checks");
      setExemptTarget(null);
      refresh();
    } catch (e: any) {
      toast.error(`Could not exempt: ${e?.message || e}`);
    } finally {
      setBusy(null);
    }
  }

  const { data: exemptions } = useQuery({
    queryKey: ["erp_account_exemptions"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_erp_account_exemptions")
        .select("id, user_id, badge_id, reason")
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; user_id: string | null; badge_id: string | null; reason: string | null }>;
    },
    staleTime: 60_000,
  });

  async function removeExemption(id: string) {
    setBusy(`ex-${id}`);
    try {
      const { error } = await (supabase as any).from("hr_erp_account_exemptions").delete().eq("id", id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["erp_account_exemptions"] });
      refresh();
    } catch (e: any) {
      toast.error(`Could not remove exemption: ${e?.message || e}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`rounded-xl border p-4 ${total > 0 ? "border-warning/40 bg-warning/5" : "border-success/40 bg-success/5"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {total > 0 ? (
            <AlertTriangle className="h-4 w-4 text-warning" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-success" />
          )}
          <span className="text-sm font-medium text-foreground">ERP accounts</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {isLoading ? "…" : `${total} issue${total === 1 ? "" : "s"}`}
          </span>
        </div>
        <Link to="/user-management" className="text-[11px] underline text-muted-foreground hover:text-foreground">
          User Management
        </Link>
      </div>

      {total > 0 && (
        <div className="mt-3 space-y-3">
          {GROUPS.map((g) => {
            const list = grouped.get(g.key) ?? [];
            if (!list.length) return null;
            return (
              <div key={g.key} className={`rounded-lg border p-3 ${toneClass(g.tone)}`}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs font-semibold text-foreground">{g.title}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{list.length}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">{g.hint}</div>

                <ul className="mt-2 divide-y divide-border/60">
                  {list.map((r, i) => (
                    <li key={`${g.key}-${r.user_id ?? r.hr_employee_id}-${r.field ?? i}`} className="py-2 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="font-medium text-foreground truncate max-w-[240px]">
                        {r.emp_full_name || r.erp_full_name || r.username || r.erp_email || "—"}
                      </span>
                      {(r.emp_badge_id || r.erp_badge_id) && (
                        <span className="font-mono text-muted-foreground">
                          {r.emp_badge_id || r.erp_badge_id}
                        </span>
                      )}
                      {r.field && (
                        <span className="text-muted-foreground">
                          {FIELD_LABEL[r.field] ?? r.field}:{" "}
                          <span className="text-destructive">{r.erp_value || "—"}</span>{" "}
                          <ArrowRight className="inline h-3 w-3" />{" "}
                          <span className="text-foreground">{r.hrms_value || "—"}</span>
                        </span>
                      )}
                      {!r.field && r.erp_email && (
                        <span className="text-muted-foreground truncate max-w-[220px]">{r.erp_email}</span>
                      )}

                      <span className="ml-auto flex items-center gap-1.5">
                        {r.hr_employee_id && (
                          <Link
                            to={`/hrms/employees/${r.hr_employee_id}`}
                            className="underline text-muted-foreground hover:text-foreground"
                          >
                            profile
                          </Link>
                        )}
                        {g.key === "missing_badge" && r.emp_badge_id && (
                          <button
                            onClick={() => linkBadge(r)}
                            disabled={busy === `${r.user_id}-badge`}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-muted disabled:opacity-50"
                          >
                            {busy === `${r.user_id}-badge` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                            Link badge
                          </button>
                        )}
                        {g.key === "mismatch" && (
                          <button
                            onClick={() => adoptHrmsValue(r)}
                            disabled={busy === `${r.user_id}-${r.field}`}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-muted disabled:opacity-50"
                          >
                            {busy === `${r.user_id}-${r.field}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                            Adopt HRMS value
                          </button>
                        )}
                        {g.key === "active_login_inactive_employee" && (
                          <button
                            onClick={() => setDeactivateTarget(r)}
                            className="inline-flex items-center gap-1 rounded-md border border-destructive/40 text-destructive px-2 py-1 hover:bg-destructive/10"
                          >
                            <UserX className="h-3 w-3" />
                            Deactivate login
                          </button>
                        )}
                        {r.user_id && (
                          <button
                            onClick={() => setExemptTarget(r)}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-muted-foreground hover:bg-muted"
                          >
                            <EyeOff className="h-3 w-3" />
                            Exempt
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {exemptions && exemptions.length > 0 && (
        <div className="mt-3 rounded-lg border border-border bg-card p-3">
          <div className="text-xs font-semibold text-foreground">Exempted accounts ({exemptions.length})</div>
          <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">
            {exemptions.map((x) => (
              <li key={x.id} className="flex items-center gap-2">
                <span className="font-mono truncate">{x.badge_id || x.user_id}</span>
                <button
                  onClick={() => removeExemption(x.id)}
                  disabled={busy === `ex-${x.id}`}
                  className="ml-auto underline hover:text-foreground disabled:opacity-50"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AlertDialog open={!!exemptTarget} onOpenChange={(o) => !o && setExemptTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Exempt this ERP account?</AlertDialogTitle>
            <AlertDialogDescription>
              {exemptTarget?.username || exemptTarget?.erp_email} will be excluded from ERP account health
              checks. Use this only for genuine system or shared accounts — it stays listed below and can be
              removed anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => exemptTarget && doExempt(exemptTarget)}>Exempt</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deactivateTarget} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate this ERP login?</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateTarget?.emp_full_name || deactivateTarget?.username} is inactive in HRMS but can still
              sign in to the ERP. Deactivating sets the account to INACTIVE and signs out any live session.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deactivateTarget && doDeactivate(deactivateTarget)}>
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
