import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { formatIstDateTime } from "@/lib/hrms/workforce";

const PAGE = 50;
const TYPE_LABEL: Record<string, string> = {
  headcount_plan: "Staffing line",
  seat_capacity: "Desk group",
  hiring_requirement: "Hiring request",
  position: "Designation",
  employee: "Employee",
  onboarding: "Onboarding",
  user: "ERP user",
};
/** "payment_operations_shared_plan" → "Payment operations shared plan". */
const readable = (s?: string | null) => {
  if (!s) return "";
  if (TYPE_LABEL[s]) return TYPE_LABEL[s];
  const t = s.replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Workforce plan audit trail (hr_workforce_plan_audit), newest first. */
export function PlanHistoryDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const audit = useQuery({
    queryKey: ["workforce_audit", "drawer", type, limit],
    enabled: open,
    queryFn: async () => {
      let q = supabase.from("hr_workforce_plan_audit").select("*").order("changed_at", { ascending: false }).limit(limit + 1);
      if (type !== "all") q = q.eq("entity", type);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  // Labels for every entity, including removed lines and desk groups.
  const labels = useQuery({
    queryKey: ["workforce_audit", "labels"],
    enabled: open,
    queryFn: async () => {
      const [plans, seats, reqs, positions, shiftRows] = await Promise.all([
        supabase.from("hr_headcount_plans").select("id, position_id, shift_id, eligible_shift_ids, shift_label, eligible_position_ids"),
        supabase.from("hr_seat_capacity").select("id, position_id, eligible_position_ids, physical_seats, is_training_only"),
        supabase.from("hr_hiring_requirements").select("id, requirement_no"),
        supabase.from("positions").select("id, title"),
        supabase.from("hr_shifts").select("id, name, start_time, planning_shift_id"),
      ]);
      // Label from the line's shift(s) as the matrix does (counts-as group), never only the stored text.
      const shiftById = new Map((shiftRows.data || []).map((x: any) => [x.id, x]));
      const groupName = (id: string) => { const sh: any = shiftById.get(id); const g: any = sh?.planning_shift_id ? shiftById.get(sh.planning_shift_id) : sh; return g?.name as string | undefined; };
      const shiftText = (p: any) => {
        const ids: string[] = p.eligible_shift_ids?.length ? p.eligible_shift_ids : p.shift_id ? [p.shift_id] : [];
        const names = Array.from(new Set(ids.map(groupName).filter(Boolean)));
        return names.length ? names.join(" + ") : p.shift_label || "Any shift";
      };
      const title = new Map((positions.data || []).map((p) => [p.id, p.title]));
      const roles = (r: any) =>
        ((r.eligible_position_ids?.length ? r.eligible_position_ids : [r.position_id]) as string[])
          .map((id) => title.get(id))
          .filter(Boolean)
          .join(" / ");
      const m = new Map<string, string>();
      (plans.data || []).forEach((p: any) => m.set(p.id, `${roles(p) || "Designation"} · ${shiftText(p)}`));
      (seats.data || []).forEach((s: any) => m.set(s.id, s.is_training_only ? "Training desks" : `${roles(s) || "Department"} desks`));
      (reqs.data || []).forEach((r: any) => m.set(r.id, r.requirement_no));
      (positions.data || []).forEach((p: any) => { if (!m.has(p.id)) m.set(p.id, p.title); });
      return m;
    },
  });

  const rows = useMemo(() => {
    const all = (audit.data || []).slice(0, limit);
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r: any) =>
      [labels.data?.get(r.entity_id), r.field_changed, r.old_value, r.new_value, r.reason, r.changed_by_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [audit.data, labels.data, search, limit]);
  const hasMore = (audit.data?.length || 0) > limit;
  // Desk-group (and other id) values show the group's name, never a raw id.
  const valueText = (v?: string | null) =>
    v == null ? null : UUID_RE.test(v) ? labels.data?.get(v) ?? "Removed desk group" : v;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><History className="h-4 w-4" /> Plan history</SheetTitle>
          <SheetDescription>Every change to staffing lines, desk groups and hiring requests. Times in IST.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[180px_1fr]">
          <Select value={type} onValueChange={(v) => { setType(v); setLimit(PAGE); }}>
            <SelectTrigger className="h-9 text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All changes</SelectItem>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input className="h-9 text-foreground" placeholder="Search loaded changes" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="mt-3 space-y-2">
          {audit.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : audit.isError ? (
            <p className="text-sm text-destructive">Couldn't load the history. Close and try again.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{search ? "No loaded change matches your search." : "No changes recorded yet."}</p>
          ) : (
            rows.map((r: any) => (
              <div key={r.id} className="rounded-md border border-border p-2.5 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-foreground">{labels.data?.get(r.entity_id) ?? readable(r.entity)}</span>
                  <span className="text-xs text-muted-foreground">{formatIstDateTime(r.changed_at)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {readable(r.entity)} · {readable(r.field_changed)} · by {r.changed_by_name || "System"}
                </p>
                {(r.old_value || r.new_value) && (
                  <p className="mt-1 break-words text-foreground">
                    <span className="text-muted-foreground line-through">{valueText(r.old_value) ?? "—"}</span>
                    <span className="mx-1.5 text-muted-foreground">to</span>
                    {valueText(r.new_value) ?? "—"}
                  </p>
                )}
                {r.reason && <p className="mt-1 break-words text-xs text-muted-foreground">Reason: {r.reason}</p>}
              </div>
            ))
          )}
          {hasMore && !search && (
            <Button variant="outline" className="w-full" onClick={() => setLimit((l) => l + PAGE)}>Load more</Button>
          )}
          {hasMore && search && (
            <Button variant="outline" className="w-full" onClick={() => setLimit((l) => l + PAGE)}>Load more to search further</Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
