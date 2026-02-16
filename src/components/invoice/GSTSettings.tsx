import type { GSTConfig } from "@/types/invoice";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ReceiptText } from "lucide-react";

interface GSTSettingsProps {
  gst: GSTConfig;
  onChange: (gst: GSTConfig) => void;
}

export default function GSTSettings({ gst, onChange }: GSTSettingsProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <ReceiptText className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">GST Settings</h3>
          <p className="text-xs text-muted-foreground">Tax configuration for invoices</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Checkbox
          id="gst-enabled"
          checked={gst.enabled}
          onCheckedChange={(checked) => onChange({ ...gst, enabled: !!checked })}
        />
        <Label htmlFor="gst-enabled" className="cursor-pointer">Enable GST Invoice</Label>
      </div>

      {gst.enabled && (
        <div className="space-y-4 pl-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>GST Rate (%)</Label>
              <Input
                type="number"
                min={0}
                max={28}
                step={0.5}
                value={gst.rate}
                onChange={(e) => onChange({ ...gst, rate: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Tax Type</Label>
              <Select
                value={gst.type}
                onValueChange={(val) => onChange({ ...gst, type: val as GSTConfig["type"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IGST">IGST (Inter-State)</SelectItem>
                  <SelectItem value="CGST_SGST">CGST + SGST (Intra-State)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Reverse Taxation (GST Inclusive)</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {gst.inclusive
                  ? "GST is included in the rate — tax will be extracted from the amount"
                  : "GST is charged above the sales rate — tax will be added on top"}
              </p>
            </div>
            <Switch
              checked={gst.inclusive}
              onCheckedChange={(checked) => onChange({ ...gst, inclusive: checked })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
