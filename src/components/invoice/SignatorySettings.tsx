import { useCallback } from "react";
import type { SignatoryConfig } from "@/types/invoice";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { PenTool, Upload, X } from "lucide-react";

interface SignatorySettingsProps {
  signatory: SignatoryConfig;
  onChange: (signatory: SignatoryConfig) => void;
}

export default function SignatorySettings({ signatory, onChange }: SignatorySettingsProps) {
  const handleSignatureUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      onChange({ ...signatory, signatureDataUrl: ev.target?.result as string });
    };
    reader.readAsDataURL(file);
  }, [signatory, onChange]);

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <PenTool className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Authorised Signatory</h3>
          <p className="text-xs text-muted-foreground">Signature on invoices</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Checkbox
          id="signatory-enabled"
          checked={signatory.enabled}
          onCheckedChange={(checked) => onChange({ ...signatory, enabled: !!checked })}
        />
        <Label htmlFor="signatory-enabled" className="cursor-pointer">Include Authorised Signatory</Label>
      </div>

      {signatory.enabled && (
        <div className="space-y-4 pl-1">
          <div>
            <Label>Signatory Name</Label>
            <Input
              placeholder="e.g. Rajesh Kumar"
              value={signatory.name}
              onChange={(e) => onChange({ ...signatory, name: e.target.value })}
            />
          </div>

          <div>
            <Label>Digital Signature (PNG/JPG)</Label>
            <div className="mt-2">
              {signatory.signatureDataUrl ? (
                <div className="relative inline-block border border-border rounded-lg p-3 bg-background">
                  <img
                    src={signatory.signatureDataUrl}
                    alt="Signature"
                    className="h-16 object-contain"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground"
                    onClick={() => onChange({ ...signatory, signatureDataUrl: null })}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => document.getElementById("sig-upload")?.click()}
                >
                  <Upload className="w-4 h-4" />
                  Upload Signature
                </Button>
              )}
              <input
                id="sig-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleSignatureUpload}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
