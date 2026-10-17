import { useState } from 'react';
import { jsPDF } from 'jspdf';
import { BrandLogo } from '@/components/BrandLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Download, FileCheck2, RotateCcw, CheckCircle2 } from 'lucide-react';
import { DEMO_DOCUMENTS, demoJoiningChoices, demoReady, demoSubmissionProblems, type DemoReview } from '@/lib/hrms/prejoiningDemo';
import { joiningSendDateIST } from '@/lib/hrms/joiningBatch';

type Evidence = { name: string; url: string };
const initial: Record<string, string> = {
  'First name': 'Aarav', 'Last name': 'Sample', 'Date of birth': '1998-04-12', Gender: 'Male', 'Marital status': 'Single',
  Mobile: '0000000000', 'Personal email': 'aarav@example.invalid', Address: 'Fictional sample address', City: 'Sample City', State: 'Sample State', PIN: '000000', Country: 'India',
  PAN: 'SAMPLE ONLY', Aadhaar: 'SAMPLE ONLY', 'UAN (optional)': '', 'ESIC (optional)': '', 'PF number (optional)': '', 'Previous employer (optional)': '',
  'Account holder': 'Aarav Sample', Bank: 'Fictional Demo Bank', 'Account number': '0000000000', 'Re-enter account number': '0000000000', IFSC: 'DEMO0000000', Branch: 'Sample branch',
};
function sampleDocument(title: string, date: string): Evidence {
  const pdf = new jsPDF();
  pdf.setFontSize(19); pdf.text('SAMPLE ONLY - NOT VALID', 18, 24);
  pdf.setFontSize(14); pdf.text(title, 18, 42);
  pdf.setFontSize(11); pdf.text([
    'Fictional candidate: Aarav Sample', 'Fictional designation: Sample Associate', `Proposed joining: ${date}`,
    'Prepared only for reviewing the optional onboarding flow.',
    'Not an approved offer, identity proof, PCC receipt or legal declaration.',
    'No salary, bank or government identifier is represented as real.',
    'Sample signature: Aarav Sample (not an actual signature).',
    'Replace with HR-approved documents before issuing a real invitation.',
  ], 18, 60, { maxWidth: 174 });
  return { name: `SAMPLE-${title.replace(/[^a-z0-9]+/gi, '-')}.pdf`, url: URL.createObjectURL(pdf.output('blob')) };
}
function download(file: Evidence) { const a = document.createElement('a'); a.href = file.url; a.download = file.name; a.click(); }
function displayJoiningDate(date: string): string {
  return new Date(`${date}T00:00:00+05:30`).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}
export default function PrejoiningDemo() {
  const [view, setView] = useState('email');
  const [choices] = useState(() => demoJoiningChoices(joiningSendDateIST(new Date())));
  const [date, setDate] = useState(choices[0] ?? '');
  const [details, setDetails] = useState(initial);
  const [files, setFiles] = useState<Record<string, Evidence>>({});
  const [reviews, setReviews] = useState<Record<string, DemoReview>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [declared, setDeclared] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const ready = demoReady(files, reviews, submitted, confirmed) && !correctionOpen;
  const event = (text: string) => setEvents(e => [...e, `${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST · ${text}`]);
  const attach = (key: string, file: Evidence) => {
    setFiles(f => ({ ...f, [key]: file })); setReviews(r => ({ ...r, [key]: 'pending' }));
  };
  const chooseDate = (value: string) => {
    if (!choices.includes(value) || value === date || (submitted && !correctionOpen)) return;
    if (files.offer) URL.revokeObjectURL(files.offer.url);
    setFiles(({ offer: _offer, ...remaining }) => remaining);
    setReviews(r => ({ ...r, offer: 'pending', details: 'pending' }));
    setConfirmed(false); setDate(value); setErrors([]);
    event(`Candidate selected joining ${value}; signed offer and joining confirmation reset`);
  };
  const submit = () => {
    const issues = demoSubmissionProblems(files, confirmed, declared);
    if (!choices.includes(date)) issues.push('Select an available joining date');
    for (const key of ['First name', 'Date of birth', 'Mobile', 'Personal email', 'Address', 'Account holder']) if (!details[key]?.trim()) issues.push(`${key} is required`);
    if (details['Account number'] !== details['Re-enter account number']) issues.push('Bank account numbers must match');
    setErrors(issues);
    if (issues.length) return;
    setSubmitted(true); setCorrectionOpen(false); setVersion(v => v + 1); event(`Submission received for sample HR review; joining ${date}; no employee created`);
  };
  const reset = () => {
    Object.values(files).forEach(f => URL.revokeObjectURL(f.url)); setDate(choices[0] ?? ''); setDetails(initial); setFiles({}); setReviews({}); setNotes({}); setConfirmed(false); setDeclared(false); setSubmitted(false); setCorrectionOpen(false); setVersion(0); setErrors([]); setEvents([]); setView('email');
  };
  const groups = [
    ['Personal details', ['First name', 'Last name', 'Date of birth', 'Gender', 'Marital status', 'Mobile', 'Personal email']],
    ['Address', ['Address', 'City', 'State', 'PIN', 'Country']],
    ['Statutory & background', ['PAN', 'Aadhaar', 'UAN (optional)', 'ESIC (optional)', 'PF number (optional)', 'Previous employer (optional)']],
    ['Bank details', ['Account holder', 'Bank', 'Account number', 'Re-enter account number', 'IFSC', 'Branch']],
  ] as const;
  return <div className="min-h-screen bg-background text-foreground">
    <header className="border-b border-border"><div className="max-w-4xl mx-auto px-4 py-5 flex justify-between items-center gap-3"><BrandLogo className="h-8 w-auto max-w-[45%]"/><Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="h-4 w-4 mr-2"/>Reset sample</Button></div></header>
    <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="border-l-4 border-primary bg-muted p-4 text-sm"><strong>Sample preview only.</strong> Fictional documents; no emails, employee records or payroll changes. Use sample files only. Changes stay in this open page and reset on reload.</div>
      <Tabs value={view} onValueChange={setView}><TabsList className="w-full grid grid-cols-3 h-auto"><TabsTrigger value="email" className="whitespace-normal">Welcome email</TabsTrigger><TabsTrigger value="candidate" className="whitespace-normal">Candidate form</TabsTrigger><TabsTrigger value="hr">HR review</TabsTrigger></TabsList></Tabs>
      {view === 'email' && <section className="space-y-5 py-3"><p className="text-sm text-muted-foreground">To: aarav@example.invalid · Sample, not sent</p><h1 className="text-2xl font-semibold">Welcome to BlynkEx, Aarav</h1><p>We’re delighted to offer you the position of <strong>Sample Associate</strong>.</p><div className="border-y border-border py-4"><strong>Proposed joining · {date}</strong><p className="text-sm text-muted-foreground">Reporting time and office address to be confirmed by HR.</p></div><p>Your offer, Annexure C and declaration E2 are available together through your personal link.</p><ol className="list-decimal pl-5 space-y-3"><li>Download and sign your offer, then upload the signed copy.</li><li>Complete your details and attach your joining documents, signed E2 and PCC application proof.</li><li>Confirm your joining and submit for HR review.</li><li>HR checks your submission and requests only the corrections needed.</li></ol><Button className="h-auto whitespace-normal py-3" onClick={() => setView('candidate')}>View my offer & complete onboarding</Button><p className="text-sm text-muted-foreground">Submission does not activate employment. HR confirms actual arrival before completing joining. Keep your personal link private.</p><p>Warm regards,<br/><strong>Human Resources · BlynkEx</strong><br/>hr@blynkex.com</p></section>}
      {view === 'candidate' && <div className="space-y-7"><div><h1 className="text-2xl font-semibold">Your joining package</h1><p className="text-muted-foreground mt-2">Aarav Sample · Sample Associate · Joining {date}</p></div><div className="grid sm:grid-cols-3 gap-3">{['Offer letter', 'Annexure C', 'Declaration E2'].map(t => <Button key={t} variant="outline" onClick={() => { const f = sampleDocument(t, date); download(f); setTimeout(() => URL.revokeObjectURL(f.url), 60000); }}><Download className="h-4 w-4 mr-2"/>{t}</Button>)}</div>
        {submitted && <div role="status" className="bg-muted border border-border p-4"><strong>{ready ? 'Ready to join — sample HR review complete' : correctionOpen ? 'Changes requested by HR' : `Submission ${version} received — awaiting HR review`}</strong><p className="text-sm mt-2">{correctionOpen ? 'Replace flagged items only. Other files and approvals remain attached.' : 'No employment activated or email sent in this preview.'}</p></div>}
        {errors.length > 0 && <ul role="alert" className="text-destructive list-disc pl-5">{errors.map(e => <li key={e}>{e}</li>)}</ul>}
        {groups.map(([title, fields]) => <section key={title} className="border-t border-border pt-5"><h2 className="font-semibold mb-4">{title}</h2><div className="grid sm:grid-cols-2 gap-4">{fields.map(field => <div key={field}><Label htmlFor={`demo-${field}`}>{field}</Label><Input id={`demo-${field}`} className="mt-1 text-foreground" type={field === 'Date of birth' ? 'date' : 'text'} value={details[field]} disabled={submitted && (!correctionOpen || reviews.details === 'approved')} onChange={e => { setDetails(d => ({ ...d, [field]: e.target.value })); setReviews(r => ({ ...r, details: 'pending' })); }}/></div>)}</div>{notes.details && <p className="text-sm text-destructive mt-3">HR: {notes.details}</p>}</section>)}
        <section className="border-t border-border pt-5 space-y-4"><h2 className="font-semibold">Joining documents</h2>{DEMO_DOCUMENTS.map(d => {
          const locked = submitted && (!correctionOpen || reviews[d.key] === 'approved');
          return <div key={d.key} className="border-b border-border pb-4 space-y-2"><div className="flex flex-wrap justify-between gap-2 items-center"><Label htmlFor={`file-${d.key}`}>{d.label}{d.required ? ' *' : ' (optional)'}</Label><Button size="sm" variant="outline" disabled={locked} onClick={() => attach(d.key, sampleDocument(d.label, date))}><FileCheck2 className="h-4 w-4 mr-2"/>Use sample</Button></div><Input id={`file-${d.key}`} type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={locked} onChange={e => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 10 * 1024 * 1024) { setErrors(['Sample files must be 10 MB or smaller']); return; } attach(d.key, { name: f.name, url: URL.createObjectURL(f) }); }}/>{files[d.key] && <div className="flex flex-wrap gap-2 items-center text-sm"><span className="break-all">{files[d.key].name}</span><Button variant="ghost" size="sm" onClick={() => download(files[d.key])}><Download className="h-4 w-4 mr-1"/>View file</Button><span className="text-muted-foreground">{reviews[d.key] ?? 'pending'}</span></div>}{notes[d.key] && <p className="text-sm text-destructive">HR: {notes[d.key]}</p>}</div>;
        })}</section>
        <label className="flex gap-3 items-start"><Checkbox checked={confirmed} disabled={submitted && !correctionOpen} onCheckedChange={v => setConfirmed(v === true)}/><span>I confirm I intend to join on {date}.</span></label><label className="flex gap-3 items-start"><Checkbox checked={declared} disabled={submitted && !correctionOpen} onCheckedChange={v => setDeclared(v === true)}/><span>I confirm the details and documents provided are correct.</span></label><Button className="w-full" disabled={submitted && !correctionOpen} onClick={submit}>{correctionOpen ? 'Resubmit corrections' : 'Submit for HR review'}</Button>
      </div>}
      {view === 'hr' && <section className="space-y-5"><h1 className="text-2xl font-semibold">Sample HR review</h1><p className="text-muted-foreground">Aarav Sample · Joining {date} · {ready ? 'Ready to join' : submitted ? 'Needs review' : 'Awaiting submission'}</p>{!submitted ? <p>Complete and submit the candidate form first.</p> : <>
        {[{ key: 'details', label: 'Personal and bank details' }, ...DEMO_DOCUMENTS.filter(d => files[d.key])].map(d => <div key={d.key} className="border-b border-border pb-4 space-y-3"><div className="flex flex-wrap justify-between gap-2"><strong>{d.label}</strong><span className="text-sm text-muted-foreground">{reviews[d.key] ?? 'pending'}</span></div>{d.key === 'details' ? <dl className="grid sm:grid-cols-2 gap-2 text-sm">{Object.entries(details).filter(([,v]) => v).map(([k,v]) => <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="break-words">{v}</dd></div>)}</dl> : <Button variant="outline" size="sm" onClick={() => download(files[d.key])}><Download className="h-4 w-4 mr-2"/>Open submitted file</Button>}<Textarea aria-label={`Correction note for ${d.label}`} placeholder="Reason for correction" value={notes[d.key] ?? ''} onChange={e => setNotes(n => ({ ...n, [d.key]: e.target.value }))}/><div className="flex flex-wrap gap-2"><Button size="sm" disabled={correctionOpen} onClick={() => { setReviews(r => ({ ...r, [d.key]: 'approved' })); setNotes(n => ({ ...n, [d.key]: '' })); event(`HR approved ${d.label}`); }}><CheckCircle2 className="h-4 w-4 mr-2"/>Approve</Button><Button size="sm" variant="outline" disabled={correctionOpen || !notes[d.key]?.trim()} onClick={() => setReviews(r => ({ ...r, [d.key]: 'correction' }))}>Needs correction</Button></div></div>)}
        <Button className="h-auto py-3 whitespace-normal" variant="outline" disabled={correctionOpen || !Object.values(reviews).includes('correction')} onClick={() => { setCorrectionOpen(true); event('Correction request prepared, not emailed'); setView('candidate'); }}>Return flagged items to candidate</Button>{ready && <div role="status" className="bg-muted border border-border p-4"><strong>Ready to join on {date}</strong><p className="text-sm mt-2">HR must confirm actual arrival before finalization. This sample cannot activate an employee or account.</p></div>}
      </>}{events.length > 0 && <div className="border-t border-border pt-4"><h2 className="font-semibold">Sample activity</h2><ul className="mt-3 space-y-2 text-sm text-muted-foreground">{events.map((e,i) => <li key={i}>{e}</li>)}</ul></div>}</section>}
      <footer className="border-t border-border py-5 text-sm text-muted-foreground">Human Resources · Blynk Virtual Technologies Pvt. Ltd. · Sample only</footer>
    </main>
  </div>;
}
