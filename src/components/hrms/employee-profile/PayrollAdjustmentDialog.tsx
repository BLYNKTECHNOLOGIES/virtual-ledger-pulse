import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Plus, Minus, PauseCircle, RotateCcw } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  razorpayEmployeeId: string;
  /** ISO date of the run month (YYYY-MM or YYYY-MM-01). Sent to RazorpayX as month=YYYY-MM. */
  periodMonth: string;
  /** Optional current do-not-pay state so the switch starts in the right position. */
  currentDoNotPay?: boolean;
  onDone?: () => void;
}

const monthKey = (iso: string) => (iso || "").slice(0, 7);

async function invokeProxy(action: string, data: Record<string, unknown>) {
  const { data: res, error } = await supabase.functions.invoke("razorpay-payroll-proxy", {
    body: { action, data },
  });
  if (error) throw new Error(error.message || "Proxy call failed");
  if (res && typeof res === "object" && "ok" in res && !(res as any).ok) {
    throw new Error((res as any).error || "Razorpay rejected the request");
  }
  return res;
}

export function PayrollAdjustmentDialog({
  open, onClose, razorpayEmployeeId, periodMonth, currentDoNotPay = false, onDone,
}: Props) {
  const [tab, setTab] = useState("addition");
  const [busy, setBusy] = useState<string | null>(null);

  // Addition
  const [addName, setAddName] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addTaxable, setAddTaxable] = useState(true);

  // Deduction
  const [dedName, setDedName] = useState("");
  const [dedAmount, setDedAmount] = useState("");

  // Do-not-pay
  const [doNotPay, setDoNotPay] = useState(currentDoNotPay);

  const commonData = {
    "employee-id": Number(razorpayEmployeeId),
    month: monthKey(periodMonth),
  };

  const runAction = async (action: string, extra: Record<string, unknown>, successMsg: string) => {
    setBusy(action);
    try {
      await invokeProxy(action, { ...commonData, ...extra });
      toast.success(successMsg);
      onDone?.();
    } catch (e: any) {
      toast.error(e.message || "Request failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Adjust {new Date(periodMonth).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</DialogTitle>
          <DialogDescription>Changes are pushed to RazorpayX for employee #{razorpayEmployeeId}. Only unpaid months can be edited.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="addition"><Plus className="w-3 h-3 mr-1" /> Addition</TabsTrigger>
            <TabsTrigger value="deduction"><Minus className="w-3 h-3 mr-1" /> Deduction</TabsTrigger>
            <TabsTrigger value="pause"><PauseCircle className="w-3 h-3 mr-1" /> Pause</TabsTrigger>
          </TabsList>

          <TabsContent value="addition" className="space-y-3 pt-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input placeholder="e.g. Performance Bonus" value={addName} onChange={(e) => setAddName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Amount (₹)</Label>
              <Input type="number" inputMode="decimal" value={addAmount} onChange={(e) => setAddAmount(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={addTaxable} onCheckedChange={setAddTaxable} id="taxable" />
              <Label htmlFor="taxable" className="text-xs">Taxable</Label>
            </div>
            <Button
              className="w-full"
              disabled={busy !== null || !addName || !Number(addAmount)}
              onClick={() => runAction("payroll_add_additions", {
                additions: [{ name: addName, amount: Number(addAmount), taxable: addTaxable }],
              }, "Addition sent to RazorpayX")}
            >
              {busy === "payroll_add_additions" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Push addition
            </Button>
          </TabsContent>

          <TabsContent value="deduction" className="space-y-3 pt-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input placeholder="e.g. Uniform Recovery" value={dedName} onChange={(e) => setDedName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Amount (₹)</Label>
              <Input type="number" inputMode="decimal" value={dedAmount} onChange={(e) => setDedAmount(e.target.value)} />
            </div>
            <Button
              className="w-full"
              disabled={busy !== null || !dedName || !Number(dedAmount)}
              onClick={() => runAction("payroll_add_deduction", {
                deductions: [{ name: dedName, amount: Number(dedAmount) }],
              }, "Deduction sent to RazorpayX")}
            >
              {busy === "payroll_add_deduction" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Minus className="w-4 h-4 mr-2" />}
              Push deduction
            </Button>
          </TabsContent>

          <TabsContent value="pause" className="space-y-3 pt-3">
            <div className="flex items-center justify-between border border-border rounded-lg px-3 py-2">
              <div>
                <p className="text-sm font-medium">Skip this month's payroll</p>
                <p className="text-xs text-muted-foreground">RazorpayX marks the run "do-not-pay" and skips disbursal.</p>
              </div>
              <Switch checked={doNotPay} onCheckedChange={setDoNotPay} />
            </div>
            <Button
              className="w-full"
              variant={doNotPay ? "destructive" : "default"}
              disabled={busy !== null}
              onClick={() => runAction("payroll_do_not_pay", {
                "do-not-pay": doNotPay,
              }, doNotPay ? "Month paused in RazorpayX" : "Month resumed in RazorpayX")}
            >
              {busy === "payroll_do_not_pay" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PauseCircle className="w-4 h-4 mr-2" />}
              {doNotPay ? "Pause this month" : "Resume this month"}
            </Button>
          </TabsContent>
        </Tabs>

        <DialogFooter className="pt-2 border-t border-border">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                <RotateCcw className="w-3 h-3 mr-1" /> Reset all modifications for this month
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset all modifications?</AlertDialogTitle>
                <AlertDialogDescription>
                  Every addition, deduction and pause set for {new Date(periodMonth).toLocaleDateString("en-IN", { month: "long", year: "numeric" })} on employee #{razorpayEmployeeId} will be discarded in RazorpayX.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => runAction("payroll_reset_modifications", {}, "Month reset in RazorpayX")}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Reset month
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
