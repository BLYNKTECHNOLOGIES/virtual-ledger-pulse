import { useState, useEffect, useRef } from "react";
import type { CompanyInfo } from "@/types/invoice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, ChevronDown, ChevronUp, Save, Trash2, Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const LEGACY_STORAGE_KEY = "invoice_company_profiles";
const SELECTED_KEY = "invoice_selected_company_profile";

export interface SavedProfile {
  id: string;
  label: string;
  company: CompanyInfo;
}

interface CompanyFormProps {
  company: CompanyInfo;
  onChange: (company: CompanyInfo) => void;
}

async function fetchProfiles(): Promise<SavedProfile[]> {
  const { data, error } = await supabase
    .from("invoice_company_profiles")
    .select("id, label, company")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    label: r.label as string,
    company: r.company as unknown as CompanyInfo,
  }));
}

/** One-time migration of legacy localStorage profiles into the database. */
async function migrateLegacyProfiles(existing: SavedProfile[]) {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;
  let legacy: SavedProfile[] = [];
  try {
    legacy = JSON.parse(raw) ?? [];
  } catch {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return false;
  }
  const labels = new Set(existing.map((p) => p.label.toLowerCase()));
  const toInsert = legacy.filter((p) => p?.label && !labels.has(p.label.toLowerCase()));
  if (toInsert.length === 0) {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return false;
  }
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("invoice_company_profiles").insert(
    toInsert.map((p) => ({
      label: p.label,
      company: p.company as unknown as Record<string, unknown>,
      created_by: auth?.user?.id ?? null,
    })),
  );
  if (error) return false;
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  return true;
}

export default function CompanyForm({ company, onChange }: CompanyFormProps) {
  const [expanded, setExpanded] = useState(true);
  const [selectedProfileId, setSelectedProfileId] = useState<string>(() => {
    try {
      return localStorage.getItem(SELECTED_KEY) || "__custom__";
    } catch {
      return "__custom__";
    }
  });
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const migratedRef = useRef(false);
  const autoAppliedRef = useRef(false);
  const qc = useQueryClient();

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["invoice-company-profiles"],
    queryFn: fetchProfiles,
    staleTime: 60_000,
  });

  // Migrate any legacy browser-stored profiles into the database once.
  useEffect(() => {
    if (isLoading || migratedRef.current) return;
    migratedRef.current = true;
    migrateLegacyProfiles(profiles).then((migrated) => {
      if (migrated) qc.invalidateQueries({ queryKey: ["invoice-company-profiles"] });
    });
  }, [isLoading, profiles, qc]);

  // Apply the remembered (or first) profile once profiles load.
  useEffect(() => {
    if (isLoading || autoAppliedRef.current || profiles.length === 0) return;
    autoAppliedRef.current = true;
    const remembered = profiles.find((p) => p.id === selectedProfileId);
    if (remembered) {
      onChange(remembered.company);
      return;
    }
    if (!company.name) {
      onChange(profiles[0].company);
      persistSelected(profiles[0].id);
      setSelectedProfileId(profiles[0].id);
    }
  }, [isLoading, profiles]); // eslint-disable-line react-hooks/exhaustive-deps

  function persistSelected(id: string) {
    try {
      localStorage.setItem(SELECTED_KEY, id);
    } catch {
      /* ignore */
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("invoice_company_profiles")
        .insert({
          label: saveName.trim(),
          company: company as unknown as Record<string, unknown>,
          created_by: auth?.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["invoice-company-profiles"] });
      setSelectedProfileId(id);
      persistSelected(id);
      setSaveName("");
      setShowSave(false);
      toast.success("Company profile saved permanently");
    },
    onError: (e: Error) => toast.error(e.message || "Could not save profile"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoice_company_profiles").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["invoice-company-profiles"] });
      if (selectedProfileId === id) {
        setSelectedProfileId("__custom__");
        persistSelected("__custom__");
      }
      toast.success("Profile deleted");
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete profile"),
  });

  const handleProfileSelect = (profileId: string) => {
    setSelectedProfileId(profileId);
    persistSelected(profileId);
    if (profileId === "__custom__") return;
    const profile = profiles.find((p) => p.id === profileId);
    if (profile) onChange(profile.company);
  };

  const update = (key: keyof CompanyInfo, value: string | string[]) => {
    onChange({ ...company, [key]: value });
    setSelectedProfileId("__custom__");
    persistSelected("__custom__");
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
                  <SelectValue placeholder={isLoading ? "Loading profiles…" : "Select a saved profile or enter manually"} />
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
                    onKeyDown={(e) => e.key === "Enter" && saveName.trim() && company.name && saveMutation.mutate()}
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => saveMutation.mutate()}
                  disabled={!saveName.trim() || !company.name || saveMutation.isPending}
                  className="gap-1"
                >
                  {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
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
                    onClick={(e) => { e.stopPropagation(); setDeleteId(p.id); }}
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
              <Label>Phone</Label>
              <Input placeholder="+91 9999999999" value={company.phone ?? ""} onChange={(e) => update("phone", e.target.value)} />
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

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this company profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the saved company & payment details permanently. Invoices already generated are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId) deleteMutation.mutate(deleteId); setDeleteId(null); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
