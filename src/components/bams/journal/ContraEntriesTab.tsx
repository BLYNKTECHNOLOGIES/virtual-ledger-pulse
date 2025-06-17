
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, ArrowRightLeft, Check } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface ContraEntry {
  id: string;
  fromAccount: string;
  toAccount: string;
  amount: number;
  date: Date;
  description: string;
}

export function ContraEntriesTab() {
  const { toast } = useToast();
  const [transfers, setTransfers] = useState<ContraEntry[]>([]);
  const [formData, setFormData] = useState({
    fromAccount: "",
    toAccount: "",
    amount: "",
    date: undefined as Date | undefined,
    description: ""
  });

  const handleTransfer = () => {
    if (!formData.fromAccount || !formData.toAccount || !formData.amount || !formData.date) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    if (formData.fromAccount === formData.toAccount) {
      toast({
        title: "Error",
        description: "From and To accounts must be different",
        variant: "destructive"
      });
      return;
    }

    const newTransfer: ContraEntry = {
      id: Date.now().toString(),
      fromAccount: formData.fromAccount,
      toAccount: formData.toAccount,
      amount: parseFloat(formData.amount),
      date: formData.date,
      description: formData.description
    };

    setTransfers([...transfers, newTransfer]);
    setFormData({
      fromAccount: "",
      toAccount: "",
      amount: "",
      date: undefined,
      description: ""
    });

    toast({
      title: "Success",
      description: "Fund transfer completed successfully",
    });
  };

  return (
    <div className="space-y-6">
      {/* Transfer Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Bank to Bank Transfer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="fromAccount">From Bank Account *</Label>
              <Input
                id="fromAccount"
                placeholder="Select source account"
                value={formData.fromAccount}
                onChange={(e) => setFormData({...formData, fromAccount: e.target.value})}
              />
            </div>

            <div>
              <Label htmlFor="toAccount">To Bank Account *</Label>
              <Input
                id="toAccount"
                placeholder="Select destination account"
                value={formData.toAccount}
                onChange={(e) => setFormData({...formData, toAccount: e.target.value})}
              />
            </div>

            <div>
              <Label htmlFor="amount">Transfer Amount (₹) *</Label>
              <Input
                id="amount"
                type="number"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => setFormData({...formData, amount: e.target.value})}
              />
            </div>

            <div>
              <Label>Transfer Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.date ? format(formData.date, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.date}
                    onSelect={(date) => setFormData({...formData, date})}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Input
                id="description"
                placeholder="Transfer purpose or notes"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
              />
            </div>

            <div className="md:col-span-2">
              <Button onClick={handleTransfer} className="w-full">
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                Transfer Funds
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transfer History */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Transfers</CardTitle>
        </CardHeader>
        <CardContent>
          {transfers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No transfers recorded yet
            </div>
          ) : (
            <div className="space-y-4">
              {transfers.map((transfer) => (
                <div
                  key={transfer.id}
                  className="flex items-center justify-between p-4 border rounded-lg bg-gray-50"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-blue-100 rounded-full">
                      <ArrowRightLeft className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-medium">
                        {transfer.fromAccount} → {transfer.toAccount}
                      </div>
                      <div className="text-sm text-gray-600">
                        {format(transfer.date, "MMM dd, yyyy")}
                      </div>
                      {transfer.description && (
                        <div className="text-sm text-gray-500">{transfer.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-lg">₹{transfer.amount.toLocaleString()}</div>
                    <div className="flex items-center gap-1 text-green-600 text-sm">
                      <Check className="h-3 w-3" />
                      Completed
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
