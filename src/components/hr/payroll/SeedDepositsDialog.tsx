import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmployeeCombobox, type EmployeeOption } from "@/components/hr/payroll/EmployeeCombobox";
import { useFormDraftPersistence } from "@/hooks/useFormDraftPersistence";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export type SeedDepositType = "security" | "error_recovery";

interface Row {
  key: string;
  employee_id: string;
  amount: string;
  collected_on: string;
  note: string;
}

const newRow = (): Row => ({
  key: Math.random().toString(36).slice(2),
  employee_id: "",
  amount: "",
  collected_on: new Date().toISOString().slice(0, 10),
  note: "",
});

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  depositType: SeedDepositType;
  typeLabel: string;
  employees: any[];
}

export function SeedDepositsDialog({ open, onOpenChange, depositType, typeLabel, employees }: Props) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([newRow()]);

  const { clearDraft } = useFormDraftPersistence<Row[]>(
    open ? `seed-deposits:${depositType}` : null,
    rows,
    (saved) => { if (Array.isArray(saved) && saved.length) setRows(saved); },
    { isEmpty: (v) => !(v as Row[])?.some((r) => r.employee_id || r.amount) },
  );


  const options: EmployeeOption[] = useMemo(
    () =>
      employees.map((e: any) => ({
        value: e.id,
        label: `${e.first_name} ${e.last_name || ""}`.trim(),
        keywords: e.badge_id || "",
      })),
    [employees],
  );

  const valid = rows.filter((r) => r.employee_id && Number(r.amount) > 0);
  const total = valid.reduce((s, r) => s + Number(r.amount), 0);

  const patch = (key: string, p: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const seedMutation = useMutation({
    mutationFn: async () => {
      if (!valid.length) throw new Error("Add at least one employee with an amount");
      for (const r of valid) {
        const amt = Number(r.amount);
        const { data: inserted, error } = await (supabase as any)
          .from("hr_employee_deposits")
          .insert({
            employee_id: r.employee_id,
            deposit_type: depositType,
            total_deposit_amount: amt,
            deduction_mode: "already_deducted",
            deduction_value: amt,
            deduction_start_month: null,
            collected_amount: amt,
            current_balance: amt,
            is_fully_collected: true,
            recovery_reason: depositType === "error_recovery" ? r.note || null : null,
            incident_reference: depositType === "error_recovery" ? r.note || null : null,
            settlement_notes: r.note || "Seeded — collected before HRMS migration",
          })
          .select("id")
          .single();
        if (error) throw error;

        await (supabase as any).from("hr_deposit_transactions").insert({
          employee_id: r.employee_id,
          deposit_id: inserted.id,
          deposit_type: depositType,
          transaction_type: "collection",
          amount: amt,
          balance_after: amt,
          description: `${typeLabel} seeded (already collected pre-HRMS)${r.note ? ` — ${r.note}` : ""}`,
          transaction_date: r.collected_on || new Date().toISOString().slice(0, 10),
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_employee_deposits"] });
      toast.success(`${valid.length} ${typeLabel.toLowerCase()} record(s) seeded — no payroll deduction scheduled`);
      clearDraft();
      setRows([newRow()]);
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[min(98vw,80rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Seed existing {typeLabel.toLowerCase()}s</DialogTitle>
          <DialogDescription>
            Record amounts already collected before the HRMS migration. These are marked fully collected and are never
            deducted from upcoming payrolls — they only appear on the employee profile and in the ledger.
          </DialogDescription>
        </DialogHeader>

        <Table className="min-w-[44rem]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[38%] min-w-[16rem]">Employee</TableHead>
              <TableHead className="w-[18%] min-w-[9rem]">Amount (₹)</TableHead>
              <TableHead className="w-[18%] min-w-[9rem]">Collected on</TableHead>
              <TableHead className="min-w-[12rem]">Note</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell>
                  <EmployeeCombobox options={options} value={r.employee_id} onChange={(v) => patch(r.key, { employee_id: v })} />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min="0"
                    step="100"
                    className="h-9 text-foreground min-w-[9rem]"
                    value={r.amount}
                    onChange={(e) => patch(r.key, { amount: e.target.value })}
                    placeholder="e.g. 25000"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="date"
                    className="h-9 text-foreground min-w-[9rem]"
                    value={r.collected_on}
                    onChange={(e) => patch(r.key, { collected_on: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-9 text-foreground"
                    value={r.note}
                    onChange={(e) => patch(r.key, { note: e.target.value })}
                    placeholder={depositType === "error_recovery" ? "Incident / reference" : "Optional remark"}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [newRow()]))}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, newRow()])}>
            <Plus className="h-4 w-4 mr-1" /> Add row
          </Button>
          <div className="text-sm text-muted-foreground">
            {valid.length} record(s) · Total <span className="font-medium text-foreground">₹{total.toLocaleString("en-IN")}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending || !valid.length}
            className="bg-[#E8604C] hover:bg-[#d4553f]"
          >
            {seedMutation.isPending ? "Seeding…" : `Seed ${valid.length || ""} record(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
