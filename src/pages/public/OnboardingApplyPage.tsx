import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CheckCircle2, Upload, FileCheck2, AlertCircle } from "lucide-react";
import logo from "@/assets/brand/blynk-logo-dark.svg";
import { toast } from "sonner";

type Doc = { key: string; label: string; required: boolean; multiple?: boolean };

const DOCS: Doc[] = [
  { key: "pan_card", label: "PAN card", required: true },
  { key: "aadhaar", label: "Aadhaar (front & back)", required: true, multiple: true },
  { key: "photo", label: "Passport-size photograph", required: true },
  { key: "cancelled_cheque", label: "Cancelled cheque / passbook page", required: true },
  { key: "education", label: "Educational certificate(s)", required: false, multiple: true },
  { key: "experience", label: "Relieving / experience letter", required: false, multiple: true },
];

type FileRef = { path: string; name: string };

const emptyForm: Record<string, any> = {
  first_name: "", last_name: "", date_of_birth: "", gender: "", marital_status: "",
  phone: "", email: "", address: "", city: "", state: "", zip: "", country: "India",
  previous_employer: "",
  pan_number: "", aadhaar_number: "", uan_number: "", esic_number: "", pf_number: "",
  bank_account_name: "", bank_name: "", bank_account_number: "", bank_account_number_confirm: "",
  bank_ifsc: "", bank_branch: "",
  declaration_accepted: false, declaration_name: "",
  documents: {} as Record<string, FileRef[]>,
};

export default function OnboardingApplyPage() {
  const { token = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [form, setForm] = useState<Record<string, any>>(emptyForm);
  const saveTimer = useRef<number | null>(null);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.functions.invoke("onboarding-invite", {
        body: { action: "get", token },
      });
      if (error || (data as any)?.error) {
        setFatal((data as any)?.error || "This link is not valid or has expired.");
      } else {
        setForm({ ...emptyForm, ...(data as any).payload });
        setSubmitted(Boolean((data as any).submitted));
      }
      setLoading(false);
    })();
  }, [token]);

  // autosave draft
  useEffect(() => {
    if (loading || submitted || fatal) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      supabase.functions.invoke("onboarding-invite", {
        body: { action: "save", token, payload: form },
      });
    }, 1200);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [form, loading, submitted, fatal, token]);

  const uploadFile = useCallback(async (docKey: string, file: File) => {
    const { data, error } = await supabase.functions.invoke("onboarding-invite", {
      body: { action: "upload-url", token, field: docKey, filename: file.name },
    });
    if (error || (data as any)?.error) { toast.error("Upload failed. Please try again."); return; }
    const { path, token: uploadToken } = data as any;
    const { error: upErr } = await supabase.storage
      .from("employee-documents")
      .uploadToSignedUrl(path, uploadToken, file);
    if (upErr) { toast.error("Upload failed. Please try again."); return; }
    setForm((f) => {
      const docs = { ...(f.documents || {}) };
      const list: FileRef[] = [...(docs[docKey] || [])];
      list.push({ path, name: file.name });
      docs[docKey] = list;
      return { ...f, documents: docs };
    });
    toast.success(`${file.name} uploaded`);
  }, [token]);

  const submit = async () => {
    setSubmitting(true);
    setErrors([]);
    const missingDocs = DOCS.filter((d) => d.required && !(form.documents?.[d.key]?.length));
    if (missingDocs.length) {
      setErrors(missingDocs.map((d) => `${d.label} is required`));
      setSubmitting(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const { data, error } = await supabase.functions.invoke("onboarding-invite", {
      body: { action: "submit", token, payload: form },
    });
    setSubmitting(false);
    const res = data as any;
    if (error || res?.error) {
      setErrors(res?.details || [res?.error || "Something went wrong. Please try again."]);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSubmitted(true);
    window.scrollTo({ top: 0 });
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <img src={logo} alt="Blynk Virtual Technologies" className="h-9 w-auto" />
          <span className="text-xs text-muted-foreground text-right">Employee Onboarding Form</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 pb-24">
        {fatal ? (
          <Card>
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <h1 className="text-base font-semibold text-foreground">Link unavailable</h1>
                <p className="text-sm text-muted-foreground mt-1">{fatal}</p>
              </div>
            </div>
          </Card>
        ) : submitted ? (
          <Card>
            <div className="text-center py-6">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
              <h1 className="text-lg font-semibold text-foreground mt-3">Thank you — details received</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Your onboarding details have been submitted to the HR team. We will reach out if anything
                further is needed.
              </p>
            </div>
            <Signature />
          </Card>
        ) : (
          <div className="space-y-4">
            <Card>
              <h1 className="text-lg font-semibold text-foreground">Welcome to Blynk</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Please fill in your details and upload the required documents. Your progress is saved
                automatically, so you can return to this link any time before submitting.
              </p>
            </Card>

            {errors.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
                <p className="text-sm font-medium text-destructive">Please fix the following:</p>
                <ul className="mt-2 space-y-1 text-sm text-destructive list-disc pl-5">
                  {errors.map((e) => <li key={e}>{e}</li>)}
                </ul>
              </div>
            )}

            <Section title="Personal details">
              <Grid>
                <Field label="First name" required><Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} /></Field>
                <Field label="Last name" required><Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} /></Field>
                <Field label="Date of birth" required><Input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></Field>
                <Field label="Gender" required>
                  <SelectBox value={form.gender} onChange={(v) => set("gender", v)} options={[["male", "Male"], ["female", "Female"], ["other", "Other"]]} />
                </Field>
                <Field label="Marital status" required>
                  <SelectBox value={form.marital_status} onChange={(v) => set("marital_status", v)} options={[["single", "Single"], ["married", "Married"], ["other", "Other"]]} />
                </Field>
                <Field label="Mobile number" required><Input inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
                <Field label="Personal email" required className="sm:col-span-2"><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
              </Grid>
            </Section>

            <Section title="Address">
              <Grid>
                <Field label="Full address" required className="sm:col-span-2">
                  <Textarea rows={3} value={form.address} onChange={(e) => set("address", e.target.value)} />
                </Field>
                <Field label="City" required><Input value={form.city} onChange={(e) => set("city", e.target.value)} /></Field>
                <Field label="State" required><Input value={form.state} onChange={(e) => set("state", e.target.value)} /></Field>
                <Field label="PIN code" required><Input inputMode="numeric" value={form.zip} onChange={(e) => set("zip", e.target.value)} /></Field>
                <Field label="Country"><Input value={form.country} onChange={(e) => set("country", e.target.value)} /></Field>
              </Grid>
            </Section>

            <Section title="Background">
              <Grid>
                <Field label="Previous employer (optional)" className="sm:col-span-2">
                  <Input value={form.previous_employer} onChange={(e) => set("previous_employer", e.target.value)} />
                </Field>
              </Grid>
            </Section>

            <Section title="Statutory details">
              <Grid>
                <Field label="PAN number" required><Input value={form.pan_number} onChange={(e) => set("pan_number", e.target.value.toUpperCase())} placeholder="ABCDE1234F" /></Field>
                <Field label="Aadhaar number" required><Input inputMode="numeric" value={form.aadhaar_number} onChange={(e) => set("aadhaar_number", e.target.value)} /></Field>
                <Field label="UAN (optional)"><Input value={form.uan_number} onChange={(e) => set("uan_number", e.target.value)} /></Field>
                <Field label="ESIC number (optional)"><Input value={form.esic_number} onChange={(e) => set("esic_number", e.target.value)} /></Field>
                <Field label="PF account number (optional)" className="sm:col-span-2"><Input value={form.pf_number} onChange={(e) => set("pf_number", e.target.value)} /></Field>
              </Grid>
            </Section>

            <Section title="Bank details">
              <Grid>
                <Field label="Account holder name" required className="sm:col-span-2"><Input value={form.bank_account_name} onChange={(e) => set("bank_account_name", e.target.value)} /></Field>
                <Field label="Bank name" required><Input value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} /></Field>
                <Field label="Branch"><Input value={form.bank_branch} onChange={(e) => set("bank_branch", e.target.value)} /></Field>
                <Field label="Account number" required><Input value={form.bank_account_number} onChange={(e) => set("bank_account_number", e.target.value)} /></Field>
                <Field label="Re-enter account number" required><Input value={form.bank_account_number_confirm} onChange={(e) => set("bank_account_number_confirm", e.target.value)} /></Field>
                <Field label="IFSC code" required><Input value={form.bank_ifsc} onChange={(e) => set("bank_ifsc", e.target.value.toUpperCase())} /></Field>
              </Grid>
            </Section>

            <Section title="Documents">
              <div className="space-y-3">
                {DOCS.map((d) => (
                  <DocRow key={d.key} doc={d} files={form.documents?.[d.key] || []} onUpload={(f) => uploadFile(d.key, f)} />
                ))}
              </div>
            </Section>

            <Section title="Declaration">
              <label className="flex items-start gap-3 text-sm text-foreground">
                <Checkbox checked={!!form.declaration_accepted} onCheckedChange={(v) => set("declaration_accepted", !!v)} className="mt-0.5" />
                <span>I confirm that the details and documents provided above are true and correct.</span>
              </label>
            </Section>

            <Button className="w-full h-11" onClick={submit} disabled={submitting}>
              {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</> : "Submit details"}
            </Button>

            <Signature />
          </div>
        )}
      </main>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-background p-5 shadow-sm">{children}</div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-background shadow-sm">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
        {label}{required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}

function SelectBox({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
    >
      <option value="">Select</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

function DocRow({ doc, files, onUpload }: { doc: Doc; files: FileRef[]; onUpload: (f: File) => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handle = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    for (const f of Array.from(list)) await onUpload(f);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="text-sm text-foreground min-w-0">
          {doc.label}{doc.required && <span className="text-destructive"> *</span>}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="h-9 w-full sm:w-32 sm:shrink-0 justify-center"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
          Upload
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple={doc.multiple}
          accept="image/*,application/pdf"
          onChange={(e) => handle(e.target.files)}
        />
      </div>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f) => (
            <li key={f.path} className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileCheck2 className="h-3.5 w-3.5 text-emerald-600" /> {f.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Signature() {
  return (
    <div className="text-center text-xs text-muted-foreground pt-2">
      <p className="font-medium text-foreground">Human Resources</p>
      <p>Blynk Virtual Technologies Pvt. Ltd.</p>
      <p>hr@blynkex.com</p>
    </div>
  );
}
