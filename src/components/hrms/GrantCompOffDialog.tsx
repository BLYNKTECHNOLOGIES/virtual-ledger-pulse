import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Gift, Search } from "lucide-react";

export interface CompOffEmployee {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  badge_id?: string | number | null;
}

interface Props {
  employees: CompOffEmployee[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function GrantCompOffDialog({ employees, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [creditDate, setCreditDate] = useState(today());
  const [creditDays, setCreditDays] = useState("1");
  const [creditType, setCreditType] = useState("manual");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...employees].sort((a, b) =>
      `${a.first_name ?? ""} ${a.last_name ?? ""}`.localeCompare(`${b.first_name ?? ""} ${b.last_name ?? ""}`),
    );
    if (!q) return list;
    return list.filter((e) =>
      `${e.first_name ?? ""} ${e.last_name ?? ""} ${e.badge_id ?? ""}`.toLowerCase().includes(q),
    );
  }, [employees, search]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const reset = () => {
    setSelected([]);
    setSearch("");
    setNotes("");
    setCreditDays("1");
    setCreditType("manual");
    setCreditDate(today());
  };

  const submit = async () => {
    const days = Number(creditDays);
    if (!selected.length) return toast.error("Select at least one employee");
    if (!creditDate) return toast.error("Pick the date the comp-off is for");
    if (!Number.isFinite(days) || days <= 0) return toast.error("Credit days must be greater than 0");

    setSaving(true);
    try {
      const rows = selected.map((employee_id) => ({
        employee_id,
        credit_date: creditDate,
        credit_type: creditType,
        credit_days: days,
        notes: notes.trim() || "Manually credited by HR",
      }));

      const { error } = await (supabase as any).from("hr_compoff_credits").insert(rows);
      if (error) throw error;

      toast.success(
        `Credited ${days} day${days > 1 ? "s" : ""} comp-off to ${selected.length} employee${selected.length > 1 ? "s" : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["hr_compoff_credits"] });
      qc.invalidateQueries({ queryKey: ["hr_leave_allocations"] });
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Could not credit comp-off");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-success" /> Credit comp-off
          </DialogTitle>
          <DialogDescription>
            Manually credit comp-off to selected employees for a specific date. The credit joins the same monthly
            ledger — it is taken as leave, offset against that month's LOP, or encashed in that month's payroll.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="co-date">Date worked</Label>
              <Input id="co-date" type="date" value={creditDate} onChange={(e) => setCreditDate(e.target.value)} className="text-foreground" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="co-days">Credit days</Label>
              <Input
                id="co-days"
                type="number"
                step="0.5"
                min="0.5"
                value={creditDays}
                onChange={(e) => setCreditDays(e.target.value)}
                className="text-foreground"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Reason type</Label>
            <Select value={creditType} onValueChange={setCreditType}>
              <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value="manual">Manual (HR granted)</SelectItem>
                <SelectItem value="sunday_work">Weekly-off work</SelectItem>
                <SelectItem value="holiday">Holiday work</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="co-notes">Note</Label>
            <Textarea
              id="co-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why this comp-off is being granted"
              className="text-foreground"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Employees ({selected.length} selected)</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  setSelected(selected.length === filtered.length ? [] : filtered.map((e) => e.id))
                }
              >
                {selected.length === filtered.length && filtered.length > 0 ? "Clear all" : "Select all shown"}
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or badge ID"
                className="pl-8 text-foreground"
              />
            </div>
            <ScrollArea className="h-52 rounded-md border">
              <div className="p-2 space-y-1">
                {filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-2">No employees match that search.</p>
                ) : (
                  filtered.map((e) => (
                    <label
                      key={e.id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60 cursor-pointer"
                    >
                      <Checkbox checked={selected.includes(e.id)} onCheckedChange={() => toggle(e.id)} />
                      <span className="flex-1">
                        {e.first_name} {e.last_name}
                        <span className="text-xs text-muted-foreground ml-1">({e.badge_id})</span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !selected.length}>
            {saving ? "Crediting…" : `Credit ${selected.length || ""} employee${selected.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
