import type { InvoiceCategory } from "@/types/invoice";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layers } from "lucide-react";

interface InvoiceCategorySelectorProps {
  category: InvoiceCategory;
  onChange: (category: InvoiceCategory) => void;
}

export default function InvoiceCategorySelector({ category, onChange }: InvoiceCategorySelectorProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Layers className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Invoice Category</h3>
          <p className="text-xs text-muted-foreground">Select the type of service for this invoice batch</p>
        </div>
      </div>

      <div className="max-w-sm">
        <Label>Invoice Category</Label>
        <Select value={category} onValueChange={(val) => onChange(val as InvoiceCategory)}>
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="it_services">IT / Software Services</SelectItem>
            <SelectItem value="financial_intermediation">Financial Intermediation Services</SelectItem>
            <SelectItem value="usdt_sales">USDT Sales (Non-GST)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
