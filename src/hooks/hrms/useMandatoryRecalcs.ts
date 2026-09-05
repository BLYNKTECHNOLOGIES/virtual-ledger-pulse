import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Mandatory recalculation gate for the payroll cockpit.
 *
 * The LOP engine and the comp-off encashment engine are NOT optional tools —
 * a payroll month cannot be signed off until each has been re-run and its
 * result staged. Both engines expose an idempotent dry-run preview whose row
 * statuses tell us exactly what is out of date:
 *
 *   new / changed  → a row the engine would stage that is not staged yet
 *   remove         → a stale staged row the engine would delete
 *   unchanged / pushed / skipped / no_lop / none / not_applicable → settled
 *
 * If the preview reports any of the first three, the calculation has not been
 * run (or has been invalidated by later attendance / salary changes), so the
 * cockpit step must not be confirmable.
 */

const PENDING = new Set(["new", "changed", "remove"]);

type Preview = { rows: any[]; summary?: Record<string, any> };

async function runPreview(fn: string, period: string): Promise<Preview> {
  const { data, error } = await supabase.functions.invoke(fn, {
    body: { period, dry_run: true },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error(String((data as any).error));
  return { rows: (data as any)?.rows ?? [], summary: (data as any)?.summary };
}

function pendingOf(p?: Preview) {
  const rows = (p?.rows ?? []).filter((r: any) => PENDING.has(String(r?.status)));
  return {
    count: rows.length,
    names: [...new Set(rows.map((r: any) => String(r?.employee_name || r?.name || "").trim()).filter(Boolean))],
  };
}

function describe(kind: string, count: number, names: string[]) {
  const who = names.length
    ? ` — ${names.slice(0, 4).join(", ")}${names.length > 4 ? ` +${names.length - 4} more` : ""}`
    : "";
  return `${kind}: ${count} ${count === 1 ? "employee is" : "employees are"} out of date${who}`;
}

export function useMandatoryRecalcs(month: string) {
  const period = month.slice(0, 7); // YYYY-MM

  const lop = useQuery({
    queryKey: ["recalc_gate_lop", period],
    queryFn: () => runPreview("generate-lop-deductions", period),
    staleTime: 30_000,
    retry: 1,
  });

  const compoff = useQuery({
    queryKey: ["recalc_gate_compoff", period],
    queryFn: () => runPreview("generate-compoff-encashment", period),
    staleTime: 30_000,
    retry: 1,
  });

  const lopPending = pendingOf(lop.data);
  const coPending = pendingOf(compoff.data);

  const lopReasons: string[] = [];
  if (lop.error) lopReasons.push("The LOP calculation could not be checked — open the LOP tool and run it");
  else if (lopPending.count > 0)
    lopReasons.push(describe("Auto-LOP calculation not run / not staged", lopPending.count, lopPending.names));

  const compoffReasons: string[] = [];
  if (compoff.error)
    compoffReasons.push("The comp-off encashment calculation could not be checked — open the additions tool and run it");
  else if (coPending.count > 0)
    compoffReasons.push(
      describe("Comp-off encashment not run / not staged", coPending.count, coPending.names),
    );

  return {
    loading: lop.isLoading || compoff.isLoading,
    lopBlocked: lopReasons.length > 0,
    lopReasons,
    compoffBlocked: compoffReasons.length > 0,
    compoffReasons,
    queryKeys: {
      lop: ["recalc_gate_lop", period] as const,
      compoff: ["recalc_gate_compoff", period] as const,
    },
  };
}
