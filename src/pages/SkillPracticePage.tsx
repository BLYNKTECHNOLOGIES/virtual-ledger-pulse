import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Brain, Calculator, Keyboard, ListChecks, RotateCcw, Table2, Timer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';

// Public skills-only practice run. Nothing is stored: no candidate, no attempt,
// no score in the database. Marking here is local and for self-practice only.

type Level = 'beginner' | 'intermediate' | 'advanced';
type Drill = 'typing' | 'mental_maths' | 'memory_recall' | 'data_entry' | 'match_pairs';

const LEVELS: { id: Level; label: string; blurb: string }[] = [
  { id: 'beginner', label: 'Beginner', blurb: 'Gentle pace, shorter drills, simpler content.' },
  { id: 'intermediate', label: 'Intermediate', blurb: 'The standard hiring level used in most roles.' },
  { id: 'advanced', label: 'Advanced', blurb: 'Faster targets, longer sequences, trickier records.' },
];

const DRILLS: { id: Drill; title: string; icon: typeof Keyboard; blurb: string }[] = [
  { id: 'typing', title: 'Typing test', icon: Keyboard, blurb: 'Live net/gross speed, accuracy and errors.' },
  { id: 'mental_maths', title: 'Mental maths', icon: Calculator, blurb: 'Fresh timed sums, generated every run.' },
  { id: 'memory_recall', title: 'Memory recall', icon: Brain, blurb: 'A sequence flashes, then you type it back.' },
  { id: 'data_entry', title: 'Data entry accuracy', icon: Table2, blurb: 'Copy banking records field by field.' },
  { id: 'match_pairs', title: 'Match pairs', icon: ListChecks, blurb: 'Decide whether two records match.' },
];

const CONFIG: Record<Level, {
  typing: { seconds: number; targetWpm: number; passWpm: number; passAccuracy: number };
  maths: { items: number; seconds: number; max: number; ops: string[] };
  memory: { items: number; seconds: number; minLen: number; maxLen: number; show: number };
  dataEntry: { items: number; seconds: number };
  pairs: { items: number; seconds: number };
}> = {
  beginner: {
    typing: { seconds: 120, targetWpm: 30, passWpm: 20, passAccuracy: 90 },
    maths: { items: 8, seconds: 240, max: 99, ops: ['+', '−', '×'] },
    memory: { items: 5, seconds: 210, minLen: 4, maxLen: 5, show: 6 },
    dataEntry: { items: 3, seconds: 300 },
    pairs: { items: 6, seconds: 180 },
  },
  intermediate: {
    typing: { seconds: 180, targetWpm: 40, passWpm: 25, passAccuracy: 90 },
    maths: { items: 10, seconds: 240, max: 499, ops: ['+', '−', '×', '%'] },
    memory: { items: 6, seconds: 240, minLen: 5, maxLen: 7, show: 4 },
    dataEntry: { items: 4, seconds: 260 },
    pairs: { items: 8, seconds: 140 },
  },
  advanced: {
    typing: { seconds: 240, targetWpm: 55, passWpm: 40, passAccuracy: 95 },
    maths: { items: 12, seconds: 240, max: 989, ops: ['+', '−', '×', '%', '÷'] },
    memory: { items: 7, seconds: 240, minLen: 7, maxLen: 9, show: 3 },
    dataEntry: { items: 6, seconds: 220 },
    pairs: { items: 12, seconds: 110 },
  },
};

const PASSAGES: Record<Level, string> = {
  beginner:
    'A good operator checks every detail before sending money. Read the name, the account number and the amount out loud. If anything looks odd, stop and ask. Speed matters, but a careful habit matters more, because one wrong digit can cost a full day of work.',
  intermediate:
    'Every payment we release passes through the same discipline: verify the beneficiary name, confirm the account number digit by digit, match the reference against the order, and only then approve. Our clients trust us because we are predictable. A quiet, steady desk with clean records beats a fast desk that has to reverse its own mistakes.',
  advanced:
    'Reconciliation is not paperwork; it is the daily proof that our books describe reality. When a settlement lands, the operator compares the bank credit, the order value and the ledger entry, then records the difference — however small — with a short explanation. Exceptions are escalated the same shift, never carried forward, because an unexplained rupee today becomes an unexplained lakh next quarter.',
};

const rnd = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

const makeSum = (level: Level) => {
  const cfg = CONFIG[level].maths;
  const op = cfg.ops[rnd(0, cfg.ops.length - 1)];
  if (op === '+') { const a = rnd(11, cfg.max); const b = rnd(11, cfg.max); return { prompt: `${a} + ${b}`, answer: a + b }; }
  if (op === '−') { const a = rnd(30, cfg.max); const b = rnd(10, a - 1); return { prompt: `${a} − ${b}`, answer: a - b }; }
  if (op === '×') { const a = rnd(3, level === 'beginner' ? 12 : 29); const b = rnd(3, level === 'beginner' ? 12 : 19); return { prompt: `${a} × ${b}`, answer: a * b }; }
  if (op === '%') { const pct = [5, 10, 12, 15, 20, 25][rnd(0, 5)]; const base = rnd(4, 40) * 100; return { prompt: `${pct}% of ${base}`, answer: (base * pct) / 100 }; }
  const b = rnd(3, 19); const q = rnd(4, 40); return { prompt: `${b * q} ÷ ${b}`, answer: q };
};

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const makeSequence = (level: Level, idx: number) => {
  const cfg = CONFIG[level].memory;
  const len = Math.min(cfg.maxLen, cfg.minLen + Math.floor(idx / 2));
  return Array.from({ length: len }, () => ALPHABET[rnd(0, ALPHABET.length - 1)]).join('');
};

type Record5 = { name: string; pan: string; account_number: string; ifsc: string; amount: string };

// Level-specific records: beginner = short and clean, advanced = long names,
// awkward spacing and look-alike characters.
const RECORDS: Record<Level, Record5[]> = {
  beginner: [
    { name: 'Ramesh Patel', pan: 'AFZPK7190K', account_number: '50100238417', ifsc: 'HDFC0000123', amount: '2450.00' },
    { name: 'Sunita Sharma', pan: 'BKLPS4432M', account_number: '91820045637', ifsc: 'ICIC0004561', amount: '7890.50' },
    { name: 'Anil Verma', pan: 'CDQPV1178H', account_number: '32100987456', ifsc: 'SBIN0011276', amount: '1200.00' },
    { name: 'Neha Gupta', pan: 'DLMPG6621R', account_number: '44120056789', ifsc: 'UBIN0553301', amount: '5600.25' },
  ],
  intermediate: [
    { name: 'Mohd. Faizan Khan', pan: 'EQWPK1123J', account_number: '000401558976231', ifsc: 'UTIB0000401', amount: '104325.75' },
    { name: 'Lakshmi Narasimhan Iyer', pan: 'FRTPL5566N', account_number: '20049988776655', ifsc: 'KKBK0008812', amount: '63410.20' },
    { name: 'Priyanka Deshpande Rao', pan: 'GHZPD9043Q', account_number: '918020034567812', ifsc: 'PUNB0234500', amount: '28907.60' },
    { name: 'Shrishti R. Chaturvedi', pan: 'HJKPC2287L', account_number: '50200761234508', ifsc: 'RATN0000088', amount: '9450.05' },
    { name: 'Vikram Singh Rathore', pan: 'IKLPR7734B', account_number: '30987612345670', ifsc: 'BARB0DBGHAZ', amount: '215600.00' },
  ],
  advanced: [
    { name: 'Jagadeeshwaran Balasubramaniam', pan: 'JMNPJ3311T', account_number: '918020056473829', ifsc: 'IDIB000M104', amount: '1287654.05' },
    { name: 'Mohd. Abdul Rehman Sheikh Jr.', pan: 'KOQPS0O19I', account_number: '550100778899001', ifsc: 'YESB0CMSNOC', amount: '9080706.50' },
    { name: "D'Souza Maria Fernandes-Pinto", pan: 'LPRPD1I05O', account_number: '000011002233445', ifsc: 'SCBL0036078', amount: '4500000.99' },
    { name: 'Venkata Subrahmanyam Dhanekula', pan: 'MQSPD8B0O5', account_number: '107701001234567', ifsc: 'IOBA0001077', amount: '78912.03' },
    { name: 'Shyam Sundar Agarwal (HUF)', pan: 'AABHS1102C', account_number: '628505500123456', ifsc: 'ICIC0006285', amount: '10500000.00' },
    { name: 'Kaustubh Vaidyanathan Krishnamoorthy', pan: 'NRTPK5O0I1', account_number: '201000456789012', ifsc: 'INDB0000201', amount: '655432.10' },
  ],
};
const RECORD_FIELDS: { key: keyof Record5; label: string }[] = [
  { key: 'name', label: 'Name' }, { key: 'pan', label: 'PAN' },
  { key: 'account_number', label: 'Account number' }, { key: 'ifsc', label: 'IFSC' }, { key: 'amount', label: 'Amount' },
];

// Level-specific pairs: beginner differences are obvious, advanced are single
// look-alike characters (O/0, I/1, S/5) and transposed digits.
const PAIRS: Record<Level, { left: string; right: string; match: boolean }[]> = {
  beginner: [
    { left: 'Ramesh Patel · Rs 2,450.00', right: 'Ramesh Patel · Rs 2,450.00', match: true },
    { left: 'Sunita Sharma · Rs 7,890.50', right: 'Sunita Verma · Rs 7,890.50', match: false },
    { left: 'A/c 50100238417', right: 'A/c 50100238417', match: true },
    { left: 'A/c 44120056789', right: 'A/c 44120056798', match: false },
    { left: 'IFSC SBIN0011276', right: 'IFSC SBIN0011276', match: true },
    { left: 'Rs 1,200.00', right: 'Rs 12,000.00', match: false },
    { left: 'Neha Gupta · IFSC UBIN0553301', right: 'Neha Gupta · IFSC UBIN0553301', match: true },
    { left: 'PAN CDQPV1178H', right: 'PAN CDQPV1179H', match: false },
  ],
  intermediate: [
    { left: 'Lakshmi Narasimhan Iyer · A/c 20049988776655', right: 'Lakshmi Narasimhan Iyer · A/c 20049988776655', match: true },
    { left: 'Priyanka Deshpande Rao · IFSC PUNB0234500', right: 'Priyanka Deshpande Rao · IFSC PUNB0234S00', match: false },
    { left: 'UTR SBIN524098766 · 15/08/2026', right: 'UTR SBIN524098766 · 15/08/2026', match: true },
    { left: 'Shrishti R. Chaturvedi · Rs 9,450.05', right: 'Shrishti R. Chaturvedi · Rs 9,450.50', match: false },
    { left: 'Mohd. Faizan Khan · A/c 000401558976231', right: 'Mohd Faizan Khan · A/c 000401558976231', match: true },
    { left: 'A/c 30987612345670 · Rs 2,15,600.00', right: 'A/c 30987612345760 · Rs 2,15,600.00', match: false },
    { left: 'PAN EQWPK1123J · Faizan Khan', right: 'PAN EQWPK1123J · Faizan Khan', match: true },
    { left: 'IFSC RATN0000088 · Rs 9,450.05', right: 'IFSC RATN0000O88 · Rs 9,450.05', match: false },
    { left: 'Vikram Singh Rathore · UTR BARBR52200998', right: 'Vikram Singh Rathore · UTR BARBR52200998', match: true },
    { left: 'A/c 918020034567812', right: 'A/c 918020034567812', match: true },
  ],
  advanced: [
    { left: 'Jagadeeshwaran Balasubramaniam · A/c 918020056473829', right: 'Jagadeeshwaran Balasubramaniam · A/c 918020056473829', match: true },
    { left: 'PAN KOQPS0O19I · Abdul Rehman Sheikh', right: 'PAN KOQPSOO19I · Abdul Rehman Sheikh', match: false },
    { left: "D'Souza Maria Fernandes-Pinto · Rs 45,00,000.99", right: "D'Souza Maria Fernandes-Pinto · Rs 45,00,000.99", match: true },
    { left: 'A/c 550100778899001 · YESB0CMSNOC', right: 'A/c 550100778899O01 · YESB0CMSNOC', match: false },
    { left: 'UTR IDIBH2290O4411 · 18/09/2026', right: 'UTR IDIBH22904411 · 18/09/2026', match: false },
    { left: 'Venkata Subrahmanyam Dhanekula · IFSC IOBA0001077', right: 'Venkata Subrahmanyam Dhanekula · IFSC IOBA0001O77', match: false },
    { left: 'Shyam Sundar Agarwal (HUF) · PAN AABHS1102C', right: 'Shyam Sundar Agarwal (HUF) · PAN AABHS1102C', match: true },
    { left: 'A/c 201000456789012 · Rs 6,55,432.10', right: 'A/c 201000456789012 · Rs 6,55,432.10', match: true },
    { left: 'Kaustubh Vaidyanathan Krishnamoorthy', right: 'Kaustubh Vaidynathan Krishnamoorthy', match: false },
    { left: 'IFSC SCBL0036078 · Rs 45,00,000.99', right: 'IFSC SCBL0036O78 · Rs 45,00,000.99', match: false },
    { left: 'PAN MQSPD8B0O5 · V. S. Dhanekula', right: 'PAN MQSPD8BO05 · V. S. Dhanekula', match: false },
    { left: 'A/c 107701001234567 · Rs 78,912.03', right: 'A/c 107701001234567 · Rs 78,912.03', match: true },
  ],
};


const norm = (v: string) => v.replace(/[^0-9A-Za-z]+/g, '').toUpperCase();
const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function SkillPracticePage() {
  const navigate = useNavigate();
  const [level, setLevel] = useState<Level>('intermediate');
  const [drill, setDrill] = useState<Drill | null>(null);
  const [runKey, setRunKey] = useState(0);

  return (
    <div className="min-h-screen bg-background px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Skill test — practice run</h1>
            <p className="text-sm text-muted-foreground">
              Try any drill at any level. This is practice only — nothing is recorded and no result is sent to HR.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (window.history.length > 1) navigate(-1);
              else navigate('/hrms/quiz', { state: { view: 'skills' } });
            }}
          >
            <ArrowLeft className="h-4 w-4" />Back
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Choose a level</CardTitle>
            <CardDescription>The level sets the pace, the length and how hard the content is.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => { setLevel(l.id); setRunKey((k) => k + 1); }}
                className={`rounded-lg border p-3 text-left transition-colors ${level === l.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/60'}`}
              >
                <p className="text-sm font-semibold">{l.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{l.blurb}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        {!drill ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {DRILLS.map((d) => (
              <Card key={d.id}>
                <CardContent className="flex items-start gap-3 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><d.icon className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{d.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{d.blurb}</p>
                    <Button size="sm" className="mt-3" onClick={() => { setDrill(d.id); setRunKey((k) => k + 1); }}>Start</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge variant="muted">{LEVELS.find((l) => l.id === level)?.label} level</Badge>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setRunKey((k) => k + 1)}><RotateCcw className="h-4 w-4" />Restart</Button>
                <Button variant="ghost" size="sm" onClick={() => setDrill(null)}>All drills</Button>
              </div>
            </div>
            {drill === 'typing' && <TypingDrill key={runKey} level={level} />}
            {drill === 'mental_maths' && <MathsDrill key={runKey} level={level} />}
            {drill === 'memory_recall' && <MemoryDrill key={runKey} level={level} />}
            {drill === 'data_entry' && <DataEntryDrill key={runKey} level={level} />}
            {drill === 'match_pairs' && <PairsDrill key={runKey} level={level} />}
          </div>
        )}
      </div>
    </div>
  );
}

function useCountdown(seconds: number, running: boolean, onEnd: () => void) {
  const [left, setLeft] = useState(seconds);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, seconds - Math.round((Date.now() - started) / 1000));
      setLeft(remaining);
      if (remaining <= 0) { window.clearInterval(timer); endRef.current(); }
    }, 250);
    return () => window.clearInterval(timer);
  }, [running, seconds]);
  return left;
}

function DrillShell({ title, left, total, children }: { title: string; left: number; total: number; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">{title}</CardTitle>
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 font-mono text-sm"><Timer className="h-3.5 w-3.5" />{fmtClock(left)}</span>
        </div>
        <Progress value={total ? ((total - left) / total) * 100 : 0} className="mt-2 h-1.5" />
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function TypingDrill({ level }: { level: Level }) {
  const cfg = CONFIG[level].typing;
  const passage = PASSAGES[level];
  const [typed, setTyped] = useState('');
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const left = useCountdown(cfg.seconds, started && !done, () => setDone(true));
  const elapsed = Math.max(1, cfg.seconds - left);

  const stats = useMemo(() => {
    const chars = typed.length;
    let correct = 0;
    for (let i = 0; i < typed.length; i += 1) if (typed[i] === passage[i]) correct += 1;
    const errors = chars - correct;
    const minutes = elapsed / 60;
    const gross = Math.round(chars / 5 / minutes) || 0;
    const net = Math.max(0, Math.round((correct / 5) / minutes)) || 0;
    const accuracy = chars ? Math.round((correct / chars) * 1000) / 10 : 100;
    return { chars, correct, errors, gross, net, accuracy };
  }, [typed, passage, elapsed]);

  return (
    <DrillShell title="Typing test" left={left} total={cfg.seconds}>
      <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm leading-relaxed">
        {passage.split('').map((ch, i) => {
          const state = i < typed.length ? (typed[i] === ch ? 'ok' : 'bad') : 'todo';
          return (
            <span key={i} className={state === 'ok' ? 'text-foreground' : state === 'bad' ? 'bg-destructive/20 text-destructive' : 'text-muted-foreground'}>
              {ch}
            </span>
          );
        })}
      </p>
      <Textarea
        autoFocus
        rows={5}
        value={typed}
        disabled={done}
        onPaste={(e) => e.preventDefault()}
        onChange={(e) => { if (!started) setStarted(true); setTyped(e.target.value); }}
        placeholder="Start typing the passage above — the timer starts with your first keystroke"
        className="text-foreground"
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Net WPM', stats.net], ['Gross WPM', stats.gross], ['Accuracy', `${stats.accuracy}%`], ['Errors', stats.errors]].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-mono text-lg font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Target {cfg.targetWpm} WPM · pass {cfg.passWpm} WPM with {cfg.passAccuracy}% accuracy.</p>
      {done && (
        <p className={`text-sm font-semibold ${stats.net >= cfg.passWpm && stats.accuracy >= cfg.passAccuracy ? 'text-success' : 'text-destructive'}`}>
          {stats.net >= cfg.passWpm && stats.accuracy >= cfg.passAccuracy ? 'Passed this practice run.' : 'Below the pass line for this level.'}
        </p>
      )}
    </DrillShell>
  );
}

function MathsDrill({ level }: { level: Level }) {
  const cfg = CONFIG[level].maths;
  const items = useMemo(() => Array.from({ length: cfg.items }, () => makeSum(level)), [cfg.items, level]);
  const [answers, setAnswers] = useState<string[]>(() => items.map(() => ''));
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const left = useCountdown(cfg.seconds, !done, () => setDone(true));
  const correct = items.filter((it, i) => answers[i].trim() !== '' && Number(answers[i]) === it.answer).length;

  return (
    <DrillShell title="Mental maths" left={left} total={cfg.seconds}>
      {!done ? (
        <>
          <p className="text-xs text-muted-foreground">Question {index + 1} of {items.length}</p>
          <p className="font-mono text-3xl font-semibold">{items[index].prompt}</p>
          <Input
            autoFocus
            inputMode="decimal"
            value={answers[index]}
            onPaste={(e) => e.preventDefault()}
            onChange={(e) => setAnswers((a) => a.map((v, i) => (i === index ? e.target.value.replace(/[^\d.\-]/g, '') : v)))}
            onKeyDown={(e) => { if (e.key === 'Enter') { if (index + 1 < items.length) setIndex(index + 1); else setDone(true); } }}
            className="max-w-xs text-foreground"
            placeholder="Answer"
          />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</Button>
            {index + 1 < items.length
              ? <Button size="sm" onClick={() => setIndex(index + 1)}>Next</Button>
              : <Button size="sm" onClick={() => setDone(true)}>Finish</Button>}
          </div>
        </>
      ) : (
        <Result correct={correct} total={items.length} />
      )}
    </DrillShell>
  );
}

function MemoryDrill({ level }: { level: Level }) {
  const cfg = CONFIG[level].memory;
  const items = useMemo(() => Array.from({ length: cfg.items }, (_, i) => makeSequence(level, i)), [cfg.items, level]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>(() => items.map(() => ''));
  const [phase, setPhase] = useState<'idle' | 'show' | 'recall'>('idle');
  const [showLeft, setShowLeft] = useState(cfg.show);
  const [done, setDone] = useState(false);
  const left = useCountdown(cfg.seconds, !done, () => setDone(true));

  const reveal = useCallback(() => {
    setPhase('show');
    setShowLeft(cfg.show);
    const started = Date.now();
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, cfg.show - Math.round((Date.now() - started) / 1000));
      setShowLeft(remaining);
      if (remaining <= 0) { window.clearInterval(timer); setPhase('recall'); }
    }, 200);
  }, [cfg.show]);

  const correct = items.filter((seq, i) => norm(answers[i]) === norm(seq)).length;

  return (
    <DrillShell title="Memory recall" left={left} total={cfg.seconds}>
      {!done ? (
        <>
          <p className="text-xs text-muted-foreground">Sequence {index + 1} of {items.length} · spaces and case ignored</p>
          {phase === 'idle' && <Button onClick={reveal}>Show the sequence</Button>}
          {phase === 'show' && (
            <div className="rounded-lg border border-border bg-muted/40 p-6 text-center">
              <p className="font-mono text-3xl font-bold tracking-[0.35em]">{items[index]}</p>
              <p className="mt-2 text-xs text-muted-foreground">Hiding in {showLeft}s</p>
            </div>
          )}
          {phase === 'recall' && (
            <>
              <Input
                autoFocus
                value={answers[index]}
                onPaste={(e) => e.preventDefault()}
                onChange={(e) => setAnswers((a) => a.map((v, i) => (i === index ? e.target.value : v)))}
                placeholder="Type what you remember"
                className="max-w-xs font-mono uppercase text-foreground"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (index + 1 < items.length) { setIndex(index + 1); setPhase('idle'); }
                  else setDone(true);
                }}
              >
                {index + 1 < items.length ? 'Next sequence' : 'Finish'}
              </Button>
            </>
          )}
        </>
      ) : (
        <Result correct={correct} total={items.length} />
      )}
    </DrillShell>
  );
}

function DataEntryDrill({ level }: { level: Level }) {
  const cfg = CONFIG[level].dataEntry;
  const records = useMemo(() => RECORDS[level].slice(0, cfg.items), [cfg.items, level]);
  const [index, setIndex] = useState(0);
  const [entries, setEntries] = useState<Record<string, string>[]>(() => records.map(() => ({})));
  const [done, setDone] = useState(false);
  const left = useCountdown(cfg.seconds, !done, () => setDone(true));

  const fieldTotal = records.length * RECORD_FIELDS.length;
  const fieldCorrect = records.reduce((sum, record, i) => sum + RECORD_FIELDS.filter((f) => norm(entries[i]?.[f.key] ?? '') === norm(String(record[f.key]))).length, 0);

  return (
    <DrillShell title="Data entry accuracy" left={left} total={cfg.seconds}>
      {!done ? (
        <>
          <p className="text-xs text-muted-foreground">Record {index + 1} of {records.length} · copy every field exactly</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Copy from this document</p>
              <dl className="space-y-1.5 text-sm">
                {RECORD_FIELDS.map((f) => (
                  <div key={f.key} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{f.label}</dt>
                    <dd className="select-none text-right font-medium">{String(records[index][f.key])}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="space-y-2">
              {RECORD_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs">{f.label}</Label>
                  <Input
                    value={entries[index]?.[f.key] ?? ''}
                    onPaste={(e) => e.preventDefault()}
                    onChange={(e) => setEntries((rows) => rows.map((row, i) => (i === index ? { ...row, [f.key]: e.target.value } : row)))}
                    className="text-foreground"
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</Button>
            {index + 1 < records.length
              ? <Button size="sm" onClick={() => setIndex(index + 1)}>Next record</Button>
              : <Button size="sm" onClick={() => setDone(true)}>Finish</Button>}
          </div>
        </>
      ) : (
        <Result correct={fieldCorrect} total={fieldTotal} unit="fields" />
      )}
    </DrillShell>
  );
}

function PairsDrill({ level }: { level: Level }) {
  const cfg = CONFIG[level].pairs;
  const pairs = useMemo(() => PAIRS[level].slice(0, cfg.items), [cfg.items, level]);
  const [answers, setAnswers] = useState<(boolean | null)[]>(() => pairs.map(() => null));
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const left = useCountdown(cfg.seconds, !done, () => setDone(true));
  const correct = pairs.filter((p, i) => answers[i] === p.match).length;

  const answer = (value: boolean) => {
    setAnswers((a) => a.map((v, i) => (i === index ? value : v)));
    if (index + 1 < pairs.length) setIndex(index + 1); else setDone(true);
  };

  return (
    <DrillShell title="Match pairs" left={left} total={cfg.seconds}>
      {!done ? (
        <>
          <p className="text-xs text-muted-foreground">Pair {index + 1} of {pairs.length}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Record A</p>
              <p className="text-sm font-medium">{pairs[index].left}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Record B</p>
              <p className="text-sm font-medium">{pairs[index].right}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => answer(true)}>They match</Button>
            <Button variant="outline" onClick={() => answer(false)}>They do not match</Button>
          </div>
        </>
      ) : (
        <Result correct={correct} total={pairs.length} />
      )}
    </DrillShell>
  );
}

function Result({ correct, total, unit = 'answers' }: { correct: number; total: number; unit?: string }) {
  const pct = total ? Math.round((correct / total) * 1000) / 10 : 0;
  return (
    <div className="space-y-2">
      <p className="text-3xl font-bold">{pct}%</p>
      <p className="text-sm text-muted-foreground">{correct} of {total} {unit} correct.</p>
      <p className="text-xs text-muted-foreground">Practice only — this result is not saved anywhere.</p>
    </div>
  );
}
