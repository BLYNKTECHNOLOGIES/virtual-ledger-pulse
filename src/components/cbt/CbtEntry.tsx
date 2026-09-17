import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CbtError, cbtCall, noteServerNow, saveSession } from '@/lib/cbt/api';
import type { CbtState } from '@/lib/cbt/types';

type Drive = {
  id: string;
  name: string;
  mode: string;
  access_code: string;
  starts_at: string;
  ends_at: string;
  is_sandbox: boolean;
};
type Role = { id: string; code: string; name: string };

const QUALIFICATIONS = ['Class 12', 'Diploma', 'Graduate', 'Post-graduate', 'Other'] as const;
const SOURCES = ['Indeed', 'Walk-in', 'Referral', 'LinkedIn', 'Company website', 'Other'] as const;
const SHIFTS = ['Morning (9 AM - 5 PM)', 'Evening (5 PM - 1 AM)', 'Night (1 AM - 9 AM)', 'Any shift'];

export function CbtEntry({ onReady }: { onReady: (state: CbtState) => void }) {
  const [step, setStep] = useState<'code' | 'form' | 'resume'>('code');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [drive, setDrive] = useState<Drive | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [brand, setBrand] = useState<{ brand_name?: string; company_name?: string; privacy_url?: string | null; terms_url?: string | null; hr_email?: string | null; retention_days?: number | null }>({});

  const [form, setForm] = useState({
    full_name: '',
    mobile: '',
    email: '',
    city: '',
    job_role_id: '',
    qualification: '' as string,
    experience_years: '',
    source: '' as string,
    shift_availability: [] as string[],
    consent: false,
  });
  const [resumeForm, setResumeForm] = useState({ mobile: '', resume_code: '' });

  const validateCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await cbtCall<any>('cbt-validate-code', { code: code.trim().toUpperCase() }, { authed: false });
      noteServerNow(res.server_now);
      setDrive(res.drive);
      setRoles(res.roles ?? []);
      setBrand(res.settings ?? {});
      setForm((f) => ({ ...f, job_role_id: (res.roles ?? []).length === 1 ? res.roles[0].id : '' }));
      setStep('form');
    } catch (e) {
      setError(e instanceof CbtError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const register = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await cbtCall<CbtState & { token: string; session_nonce: string }>(
        'cbt-register',
        {
          code: code.trim().toUpperCase(),
          full_name: form.full_name.trim(),
          mobile: form.mobile.trim(),
          email: form.email.trim(),
          city: form.city.trim(),
          job_role_id: form.job_role_id,
          qualification: form.qualification,
          experience_years: Number(form.experience_years || 0),
          source: form.source,
          shift_availability: form.shift_availability,
          consent: true,
        },
        { authed: false },
      );
      noteServerNow(res.server_now);
      saveSession(res.token, res.session_nonce);
      onReady(res);
    } catch (e) {
      if (e instanceof CbtError && e.code === 'retake_blocked') {
        const nextAt = e.extra.next_allowed_at ? new Date(String(e.extra.next_allowed_at)) : null;
        setError(
          `You have already taken this test. You can try again after ${
            nextAt ? nextAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'the cooling period'
          }. For help write to ${e.extra.hr_email ?? brand.hr_email ?? 'HR'}.`,
        );
      } else {
        setError(e instanceof CbtError ? e.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await cbtCall<CbtState & { token: string; session_nonce: string }>(
        'cbt-resume',
        {
          code: code.trim().toUpperCase(),
          mobile: resumeForm.mobile.trim(),
          resume_code: resumeForm.resume_code.trim(),
        },
        { authed: false },
      );
      noteServerNow(res.server_now);
      saveSession(res.token, res.session_nonce);
      onReady(res);
    } catch (e) {
      setError(e instanceof CbtError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const formValid =
    form.full_name.trim().length >= 2 &&
    /^[6-9]\d{9}$/.test(form.mobile.trim()) &&
    /^\S+@\S+\.\S+$/.test(form.email.trim()) &&
    form.city.trim().length > 0 &&
    !!form.job_role_id &&
    !!form.qualification &&
    form.experience_years !== '' &&
    Number(form.experience_years) >= 0 &&
    !!form.source &&
    form.shift_availability.length > 0 &&
    form.consent;

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            {step === 'code' ? 'Start your assessment' : step === 'resume' ? 'Continue your test' : drive?.name}
          </CardTitle>
          <CardDescription>
            {step === 'code'
              ? 'Enter the 6-character code given to you.'
              : step === 'resume'
                ? 'Enter the resume code HR shared with you.'
                : 'Fill in your details exactly as per your documents.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {step === 'code' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="cbt-code">Test code</Label>
                <Input
                  id="cbt-code"
                  autoFocus
                  inputMode="text"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && code.length === 6 && !busy) validateCode();
                  }}
                  placeholder="e.g. K7M2QP"
                  className="text-center font-mono text-2xl tracking-[0.4em] text-foreground"
                />
              </div>
              <Button className="w-full" disabled={code.length !== 6 || busy} onClick={validateCode}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Continue
              </Button>
              <button
                type="button"
                className="w-full text-sm text-muted-foreground underline"
                onClick={() => {
                  setError(null);
                  setStep('resume');
                }}
              >
                I was already taking a test and got disconnected
              </button>
            </>
          )}

          {step === 'resume' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="r-code">Test code</Label>
                <Input
                  id="r-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  className="font-mono tracking-widest text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-mobile">Mobile number</Label>
                <Input
                  id="r-mobile"
                  inputMode="numeric"
                  maxLength={10}
                  value={resumeForm.mobile}
                  onChange={(e) => setResumeForm((f) => ({ ...f, mobile: e.target.value.replace(/\D/g, '') }))}
                  className="text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-resume">Resume code</Label>
                <Input
                  id="r-resume"
                  maxLength={6}
                  value={resumeForm.resume_code}
                  onChange={(e) => setResumeForm((f) => ({ ...f, resume_code: e.target.value.replace(/\D/g, '') }))}
                  className="font-mono tracking-widest text-foreground"
                />
              </div>
              <Button
                className="w-full"
                disabled={busy || code.length !== 6 || resumeForm.mobile.length !== 10 || resumeForm.resume_code.length !== 6}
                onClick={resume}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Continue my test
              </Button>
              <button
                type="button"
                className="w-full text-sm text-muted-foreground underline"
                onClick={() => {
                  setError(null);
                  setStep('code');
                }}
              >
                Back
              </button>
            </>
          )}

          {step === 'form' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="f-name">Full name</Label>
                  <Input
                    id="f-name"
                    value={form.full_name}
                    maxLength={100}
                    onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                    className="text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="f-mobile">Mobile number</Label>
                  <Input
                    id="f-mobile"
                    inputMode="numeric"
                    maxLength={10}
                    value={form.mobile}
                    onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value.replace(/\D/g, '') }))}
                    className="text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="f-email">Email</Label>
                  <Input
                    id="f-email"
                    type="email"
                    maxLength={255}
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="f-city">City</Label>
                  <Input
                    id="f-city"
                    maxLength={60}
                    value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    className="text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="f-exp">Experience (years)</Label>
                  <Input
                    id="f-exp"
                    inputMode="decimal"
                    value={form.experience_years}
                    onChange={(e) => setForm((f) => ({ ...f, experience_years: e.target.value.replace(/[^\d.]/g, '') }))}
                    className="text-foreground"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Applying for</Label>
                  <Select value={form.job_role_id} onValueChange={(v) => setForm((f) => ({ ...f, job_role_id: v }))}>
                    <SelectTrigger className="text-foreground">
                      <SelectValue placeholder="Select the role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Highest qualification</Label>
                  <Select value={form.qualification} onValueChange={(v) => setForm((f) => ({ ...f, qualification: v }))}>
                    <SelectTrigger className="text-foreground">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {QUALIFICATIONS.map((q) => (
                        <SelectItem key={q} value={q}>
                          {q}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>How did you hear about us</Label>
                  <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}>
                    <SelectTrigger className="text-foreground">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Shifts you can work</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {SHIFTS.map((s) => (
                      <label key={s} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={form.shift_availability.includes(s)}
                          onCheckedChange={(checked) =>
                            setForm((f) => ({
                              ...f,
                              shift_availability: checked
                                ? [...f.shift_availability, s]
                                : f.shift_availability.filter((x) => x !== s),
                            }))
                          }
                        />
                        {s}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={form.consent}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, consent: c === true }))}
                />
                <span className="text-muted-foreground">
                  I confirm the details above are mine and correct, I will take this test on my own, and I agree that{' '}
                  {brand.company_name ?? 'the company'} may store my answers and activity for{' '}
                  {brand.retention_days ?? 180} days for hiring purposes.
                  {brand.privacy_url && (
                    <>
                      {' '}
                      <a href={brand.privacy_url} target="_blank" rel="noreferrer" className="underline">
                        Privacy notice
                      </a>
                    </>
                  )}
                </span>
              </label>

              <Button className="w-full" disabled={!formValid || busy} onClick={register}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save and see instructions
              </Button>
              <button
                type="button"
                className="w-full text-sm text-muted-foreground underline"
                onClick={() => {
                  setError(null);
                  setStep('code');
                }}
              >
                Back
              </button>
            </>
          )}
        </CardContent>
      </Card>
      {brand.hr_email && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Need help? Write to{' '}
          <a className="underline" href={`mailto:${brand.hr_email}`}>
            {brand.hr_email}
          </a>
        </p>
      )}
    </div>
  );
}
