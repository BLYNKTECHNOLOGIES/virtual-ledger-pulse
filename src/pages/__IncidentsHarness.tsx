import { useState } from "react";
import EmployeeIncidentsDialog from "@/components/hrms/attendance/EmployeeIncidentsDialog";

// TEMPORARY dev harness — remove after verification
export default function IncidentsHarness() {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-8">
      <table className="w-full text-sm">
        <tbody>
          <tr role="button" onClick={() => setOpen(true)} className="cursor-pointer border-b">
            <td className="px-4 py-3">Lavany Pradhan</td>
            <td className="px-4 py-3">15</td>
          </tr>
        </tbody>
      </table>
      <EmployeeIncidentsDialog
        open={open}
        onOpenChange={setOpen}
        employeeId={null}
        employeeName="Lavany Pradhan"
        badgeId="15"
        monthStart="2026-08-01"
        monthEnd="2026-08-31"
        monthLabel="August 2026"
        records={[
          { id: "1", attendance_date: "2026-08-03", type: "late_come", late_minutes: 45, early_minutes: null },
          { id: "2", attendance_date: "2026-08-05", type: "early_out", late_minutes: null, early_minutes: 30 },
        ]}
      />
    </div>
  );
}
