import { useState } from "react";
import type { CompanyInfo } from "@/types/invoice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, ChevronDown, ChevronUp } from "lucide-react";

interface CompanyFormProps {
  company: CompanyInfo;
  onChange: (company: CompanyInfo) => void;
}

export default function CompanyForm({ company, onChange }: CompanyFormProps) {
  const [expanded, setExpanded] = useState(true);

  const update = (key: keyof CompanyInfo, value: string | string[]) => {
    onChange({ ...company, [key]: value });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-foreground">Company & Payment Details</h3>
            <p className="text-xs text-muted-foreground">Invoice issuer information</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Company Name</Label>
            <Input placeholder="Enter company name" value={company.name} onChange={(e) => update("name", e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Address (comma separated lines)</Label>
            <Input
              placeholder="Line 1, Line 2, City, State"
              value={company.address.join(", ")}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "") {
                  update("address", []);
                } else {
                  update("address", val.split(",").map(s => s.trimStart()));
                }
              }}
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input placeholder="company@email.com" value={company.email} onChange={(e) => update("email", e.target.value)} />
          </div>
          <div>
            <Label>GSTIN/UIN</Label>
            <Input placeholder="Enter GSTIN" value={company.gstin} onChange={(e) => update("gstin", e.target.value)} />
          </div>
          <div>
            <Label>Bank Name</Label>
            <Input placeholder="Enter bank name" value={company.bankName} onChange={(e) => update("bankName", e.target.value)} />
          </div>
          <div>
            <Label>Account Name</Label>
            <Input placeholder="Enter account name" value={company.accountName} onChange={(e) => update("accountName", e.target.value)} />
          </div>
          <div>
            <Label>A/C Number</Label>
            <Input placeholder="Enter account number" value={company.accountNumber} onChange={(e) => update("accountNumber", e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
}
