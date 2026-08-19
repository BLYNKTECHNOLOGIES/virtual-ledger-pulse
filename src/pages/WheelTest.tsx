import { useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EmployeeCombobox } from "@/components/hrms/EmployeePicker";

export default function WheelTest() {
  const [v, setV] = useState("");
  const options = Array.from({ length: 60 }, (_, i) => ({ value: String(i), label: `Employee ${i}` }));
  return (
    <Dialog defaultOpen>
      <DialogTrigger asChild><Button>open</Button></DialogTrigger>
      <DialogContent>
        <EmployeeCombobox options={options} value={v} onChange={setV} />
      </DialogContent>
    </Dialog>
  );
}
