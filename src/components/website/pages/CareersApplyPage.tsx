import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  });

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
      form.job_posting_id !== ""
    );
  }, [form]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage("");
    setErrorMessage("");
    if (!isValid) return;

    setSubmitting(true);
    const { error } = await supabase.from("job_applicants").insert({
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
      job_posting_id: form.job_posting_id,
      resume_url: form.resume_url.trim() || null,
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
      });
    }
    setSubmitting(false);
  };

  return (
    <>
      <header className="bg-muted/40 border-b border-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Apply Now for Open Roles
          </h1>
          <p className="mt-3 text-muted-foreground max-w-2xl">
            Join our team. Submit your application for any open position listed below.
          </p>
        </div>
      </header>

      <main className="w-full">
        <section className="py-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <article className="bg-background border border-border rounded-xl shadow-sm p-6 md:p-8">
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
                      placeholder="Optional"
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="resume">Resume URL</Label>
                    <Input
                      id="resume"
                      placeholder="Link to your resume (Google Drive, etc.)"
                      value={form.resume_url}
                      onChange={(e) => setForm((f) => ({ ...f, resume_url: e.target.value }))}
                    />
                  </div>
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
            </article>
          </div>
        </section>
      </main>
    </>
  );
}

export default CareersApplyPage;
