import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface JobPosting {
  id: string;
  title: string;
}

export function CareersApplyPage() {
  // Basic SEO setup without extra deps
  useEffect(() => {
    const title = "Apply Now | Careers - Job Application";
    const description = "Apply now for open job postings. Submit your application with name, email, phone, and preferred role.";
    document.title = title;

    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", description);
    else {
      const m = document.createElement("meta");
      m.name = "description";
      m.content = description;
      document.head.appendChild(m);
    }

    const canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    const href = `${window.location.origin}/website/careers/apply`;
    if (canonical) canonical.href = href;
    else {
      const link = document.createElement("link");
      link.rel = "canonical";
      link.href = href;
      document.head.appendChild(link);
    }
  }, []);

  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
    job_posting_id: "",
    resume_url: "",
    educational_qualification: "",
    industry: "",
    current_salary: "",
    is_employed: false,
    company_name: "",
    employment_start_date: "",
  });

  const [resumeFile, setResumeFile] = useState<File | null>(null);

  useEffect(() => {
    const loadJobs = async () => {
      setLoadingJobs(true);
      const { data, error } = await supabase
        .from("job_postings")
        .select("id, title")
        .eq("status", "OPEN")
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Failed to load job postings", error);
      } else {
        setJobs(data || []);
      }
      setLoadingJobs(false);
    };
    loadJobs();
  }, []);

  const isValid = useMemo(() => {
    return (
      form.name.trim().length > 1 &&
      /.+@.+\..+/.test(form.email) &&
      form.job_posting_id !== "" &&
      form.phone.trim().length > 5 &&
      !!resumeFile
    );
  }, [form, resumeFile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage("");
    setErrorMessage("");
    if (!isValid) return;

    try {
      setSubmitting(true);

      // Upload resume if provided
      let uploadedResumeUrl: string | null = null;
      if (resumeFile) {
        const safeName = `${Date.now()}_${resumeFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const filePath = `resumes/${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("kyc-documents")
          .upload(filePath, resumeFile, {
            cacheControl: "3600",
            upsert: false,
            contentType: resumeFile.type,
          });

        if (uploadError) {
          console.error("Resume upload failed", uploadError);
          setErrorMessage("Failed to upload resume. Please try again.");
          setSubmitting(false);
          return;
        }

        const { data: publicData } = supabase.storage
          .from("kyc-documents")
          .getPublicUrl(filePath);
        uploadedResumeUrl = publicData.publicUrl;
      }

      // Combine additional fields into notes to avoid DB schema change for now
      const details = [
        form.educational_qualification && `Educational Qualification: ${form.educational_qualification}`,
        form.industry && `Industry: ${form.industry}`,
        `Employment Status: ${form.is_employed ? "Employed" : "Unemployed"}`,
        form.is_employed && form.company_name && `Company: ${form.company_name}`,
        form.is_employed && form.employment_start_date && `Employed Since: ${form.employment_start_date}`,
        form.is_employed && form.current_salary && `Current Salary: ${form.current_salary}`,
        form.notes && `Notes: ${form.notes}`,
      ]
        .filter(Boolean)
        .join("\n");

      const { error } = await supabase.from("job_applicants").insert({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        address: form.address.trim() || null,
        notes: details || null,
        job_posting_id: form.job_posting_id,
        resume_url: uploadedResumeUrl,
        stage: "APPLIED",
        status: "APPLIED",
        is_interested: true,
      });

      if (error) {
        console.error("Application submission failed", error);
        setErrorMessage("Something went wrong. Please try again.");
      } else {
        setSuccessMessage("Your application has been submitted successfully. We'll get back to you soon!");
        setForm({
          name: "",
          email: "",
          phone: "",
          address: "",
          notes: "",
          job_posting_id: "",
          resume_url: "",
          educational_qualification: "",
          industry: "",
          current_salary: "",
          is_employed: false,
          company_name: "",
          employment_start_date: "",
        });
        setResumeFile(null);
      }
    } catch (err) {
      console.error(err);
      setErrorMessage("Unexpected error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <section className="relative pt-20 pb-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.1),transparent_50%)]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground">Apply Now for Open Roles</h1>
          <p className="mt-4 text-muted-foreground max-w-2xl">Join our team. Submit your application for any open position listed below.</p>
        </div>
      </section>

      <main className="w-full">
        <section className="py-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <Card className="p-6 md:p-8">
              <form onSubmit={handleSubmit} className="space-y-6" aria-label="Job application form">
                {/* Job selection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="job">Select Job Posting</Label>
                    <Select
                      value={form.job_posting_id}
                      onValueChange={(val) => setForm((f) => ({ ...f, job_posting_id: val }))}
                    >
                      <SelectTrigger id="job" aria-label="Job posting">
                        <SelectValue placeholder={loadingJobs ? "Loading jobs..." : "Choose a role"} />
                      </SelectTrigger>
                      <SelectContent>
                        {jobs.map((job) => (
                          <SelectItem key={job.id} value={job.id}>
                            {job.title}
                          </SelectItem>
                        ))}
                        {!loadingJobs && jobs.length === 0 && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">No open roles right now</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Contact info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      placeholder="Your full name"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="Your phone number"
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="resumeFile">Upload Resume</Label>
                    <Input
                      id="resumeFile"
                      type="file"
                      accept="application/pdf,.doc,.docx,image/*"
                      onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                      required
                    />
                    {resumeFile && (
                      <p className="text-xs text-muted-foreground">Selected: {resumeFile.name}</p>
                    )}
                  </div>
                </div>

                {/* Education and industry */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="educational_qualification">Educational Qualification</Label>
                    <Input
                      id="educational_qualification"
                      placeholder="e.g., B.Tech in Computer Science"
                      value={form.educational_qualification}
                      onChange={(e) => setForm((f) => ({ ...f, educational_qualification: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Input
                      id="industry"
                      placeholder="e.g., Fintech, IT Services"
                      value={form.industry}
                      onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Employment status */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is_employed"
                      checked={form.is_employed}
                      onCheckedChange={(val) => setForm((f) => ({ ...f, is_employed: Boolean(val) }))}
                    />
                    <Label htmlFor="is_employed">Currently Employed</Label>
                  </div>

                  {form.is_employed && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="company_name">Company Name</Label>
                        <Input
                          id="company_name"
                          placeholder="Your current company"
                          value={form.company_name}
                          onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="employment_start_date">Employment Start Date</Label>
                        <Input
                          id="employment_start_date"
                          type="date"
                          value={form.employment_start_date}
                          onChange={(e) => setForm((f) => ({ ...f, employment_start_date: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="current_salary">Current Salary</Label>
                        <Input
                          id="current_salary"
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          placeholder="e.g., 800000"
                          value={form.current_salary}
                          onChange={(e) => setForm((f) => ({ ...f, current_salary: e.target.value }))}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Textarea
                    id="address"
                    placeholder="Optional current address"
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Anything else you'd like us to know"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={4}
                  />
                </div>

                {errorMessage && (
                  <div className="text-sm text-destructive" role="alert">{errorMessage}</div>
                )}
                {successMessage && (
                  <div className="text-sm text-success" role="status">{successMessage}</div>
                )}

                <div className="pt-2">
                  <Button type="submit" disabled={!isValid || submitting} className="min-w-[160px]">
                    {submitting ? "Submitting..." : "Submit Application"}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        </section>
      </main>
    </>
  );
}

export default CareersApplyPage;
