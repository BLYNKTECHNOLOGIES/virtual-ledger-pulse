import { useState, useEffect } from "react";
import type { CompanyInfo } from "@/types/invoice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, ChevronDown, ChevronUp, Save, Trash2, Plus } from "lucide-react";

const STORAGE_KEY = "invoice_company_profiles";

export interface SavedProfile {
  id: string;
  label: string;
  company: CompanyInfo;
}

function loadProfiles(): SavedProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveProfiles(profiles: SavedProfile[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

interface CompanyFormProps {
  company: CompanyInfo;
  onChange: (company: CompanyInfo) => void;
}

export default function CompanyForm({ company, onChange }: CompanyFormProps) {
  const [expanded, setExpanded] = useState(true);
  const [profiles, setProfiles] = useState<SavedProfile[]>(loadProfiles);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("__custom__");
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);

  // Auto-select first profile on mount if profiles exist and company is empty
  useEffect(() => {
    if (profiles.length > 0 && !company.name) {
      const first = profiles[0];
      onChange(first.company);
      setSelectedProfileId(first.id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleProfileSelect = (profileId: string) => {
    setSelectedProfileId(profileId);
    if (profileId === "__custom__") return;
    const profile = profiles.find(p => p.id === profileId);
    if (profile) onChange(profile.company);
  };

  const handleSaveProfile = () => {
    if (!saveName.trim() || !company.name) return;
    const newProfile: SavedProfile = {
      id: Date.now().toString(),
      label: saveName.trim(),
      company: { ...company },
    };
    const updated = [...profiles, newProfile];
    setProfiles(updated);
    saveProfiles(updated);
    setSelectedProfileId(newProfile.id);
    setSaveName("");
    setShowSave(false);
  };

  const handleDeleteProfile = (id: string) => {
    const updated = profiles.filter(p => p.id !== id);
    setProfiles(updated);
    saveProfiles(updated);
    if (selectedProfileId === id) setSelectedProfileId("__custom__");
  };

  const update = (key: keyof CompanyInfo, value: string | string[]) => {
    onChange({ ...company, [key]: value });
    // If editing, mark as custom
    setSelectedProfileId("__custom__");
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
            <p className="text-xs text-muted-foreground">
              {company.name || "Invoice issuer information"}
              {company.name && <span className="ml-1 text-primary">• {company.name}</span>}
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="mt-6 space-y-5">
          {/* Profile selector */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label>Saved Company Profiles</Label>
              <Select value={selectedProfileId} onValueChange={handleProfileSelect}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a saved profile or enter manually" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__custom__">— Enter Manually —</SelectItem>
                  {profiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!showSave ? (
              <Button variant="outline" size="sm" onClick={() => setShowSave(true)} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Save Current
              </Button>
            ) : (
              <div className="flex items-end gap-2">
                <div>
                  <Label className="text-xs">Profile Name</Label>
                  <Input
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="e.g. Blynk VT"
                    className="w-40 h-9"
                    onKeyDown={(e) => e.key === "Enter" && handleSaveProfile()}
                  />
                </div>
                <Button size="sm" onClick={handleSaveProfile} disabled={!saveName.trim() || !company.name} className="gap-1">
                  <Save className="w-3.5 h-3.5" />
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setShowSave(false); setSaveName(""); }}>
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {/* Saved profiles chips for quick delete */}
          {profiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {profiles.map(p => (
                <div
                  key={p.id}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border cursor-pointer transition-colors ${
                    selectedProfileId === p.id
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-muted/50 border-border text-muted-foreground hover:border-primary/50"
                  }`}
                  onClick={() => handleProfileSelect(p.id)}
                >
                  <Building2 className="w-3 h-3" />
                  {p.label}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteProfile(p.id); }}
                    className="ml-1 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Form fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </div>
      )}
    </div>
  );
}
