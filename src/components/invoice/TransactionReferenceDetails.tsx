import type { MarginType, GSTDirection } from "@/types/invoice";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRightLeft, Calculator } from "lucide-react";

interface TransactionReferenceDetailsProps {
  transactionValue: number;
  utrReference: string;
  marginType: MarginType;
  marginPercentage: number;
  marginAmount: number;
  gstDirection: GSTDirection;
  taxableValue: number;
  gstAmount: number;
  totalInvoice: number;
  onTransactionValueChange: (v: number) => void;
  onUtrChange: (v: string) => void;
  onMarginTypeChange: (v: MarginType) => void;
  onMarginPercentageChange: (v: number) => void;
  onMarginAmountChange: (v: number) => void;
  onGstDirectionChange: (v: GSTDirection) => void;
}

export default function TransactionReferenceDetails({
  transactionValue,
  utrReference,
  marginType,
  marginPercentage,
  marginAmount,
  gstDirection,
  taxableValue,
  gstAmount,
  totalInvoice,
  onTransactionValueChange,
  onUtrChange,
  onMarginTypeChange,
  onMarginPercentageChange,
  onMarginAmountChange,
  onGstDirectionChange,
}: TransactionReferenceDetailsProps) {
  const showCalc = marginAmount > 0 || (marginPercentage > 0 && transactionValue > 0);

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <ArrowRightLeft className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Transaction Reference Details</h3>
          <p className="text-xs text-muted-foreground">
            Capture transaction value, UTR, and margin for Financial Intermediation invoices
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Transaction Value (₹)</Label>
          <Input
            type="number"
            min={0}
            step={0.01}
            value={transactionValue || ""}
            onChange={(e) => onTransactionValueChange(parseFloat(e.target.value) || 0)}
            placeholder="e.g. 80000"
            className="mt-1"
          />
        </div>
        <div>
          <Label>UTR / Payment Reference Number</Label>
          <Input
            type="text"
            value={utrReference}
            onChange={(e) => onUtrChange(e.target.value)}
            placeholder="e.g. UTIB12345678"
            className="mt-1"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>Margin Type</Label>
          <Select value={marginType} onValueChange={(v) => onMarginTypeChange(v as MarginType)}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">Percentage</SelectItem>
              <SelectItem value="absolute">Absolute</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          {marginType === "percentage" ? (
            <>
              <Label>Margin Percentage (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={marginPercentage || ""}
                onChange={(e) => onMarginPercentageChange(parseFloat(e.target.value) || 0)}
                placeholder="e.g. 3"
                className="mt-1"
              />
            </>
          ) : (
            <>
              <Label>Margin Amount (₹)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={marginAmount || ""}
                onChange={(e) => onMarginAmountChange(parseFloat(e.target.value) || 0)}
                placeholder="e.g. 2400"
                className="mt-1"
              />
            </>
          )}
        </div>
        <div>
          <Label>GST Calculation</Label>
          <Select value={gstDirection} onValueChange={(v) => onGstDirectionChange(v as GSTDirection)}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="forward">Forward (GST on top)</SelectItem>
              <SelectItem value="reverse">Reverse (GST inclusive)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            {gstDirection === "forward"
              ? "GST will be added on top of the margin"
              : "Margin entered includes GST — tax will be extracted"}
          </p>
        </div>
      </div>

      {/* Live calculation preview */}
      {showCalc && (
        <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              Auto-Calculated Values
              <span className="text-xs font-normal text-muted-foreground ml-2">
                ({gstDirection === "forward" ? "Forward — GST added on top" : "Reverse — GST extracted from margin"})
              </span>
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Txn Value</p>
              <p className="font-mono font-semibold">₹{transactionValue.toLocaleString("en-IN")}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">
                {gstDirection === "forward" ? "Service Margin" : "Margin (Incl. GST)"}
              </p>
              <p className="font-mono font-semibold">₹{marginAmount.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Taxable Value</p>
              <p className="font-mono font-semibold">₹{taxableValue.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">GST (18%)</p>
              <p className="font-mono font-semibold">₹{gstAmount.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Total Invoice</p>
              <p className="font-mono font-semibold text-primary">₹{totalInvoice.toFixed(2)}</p>
            </div>
          </div>
          {marginType === "percentage" && marginPercentage > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Margin: {transactionValue.toLocaleString("en-IN")} × {marginPercentage}% = ₹{marginAmount.toFixed(2)}
            </p>
          )}
          {gstDirection === "reverse" && (
            <p className="text-xs text-muted-foreground mt-1">
              Taxable = ₹{marginAmount.toFixed(2)} ÷ 1.18 = ₹{taxableValue.toFixed(2)} | GST = ₹{marginAmount.toFixed(2)} − ₹{taxableValue.toFixed(2)} = ₹{gstAmount.toFixed(2)}
            </p>
          )}
          {marginAmount > transactionValue && transactionValue > 0 && (
            <p className="text-xs text-destructive font-medium mt-1">
              ⚠ Margin cannot exceed Transaction Value
            </p>
          )}
        </div>
      )}
    </div>
  );
}
