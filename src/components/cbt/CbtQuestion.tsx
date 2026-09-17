import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import type { CbtItem } from '@/lib/cbt/types';

const DATA_ENTRY_FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'pan', label: 'PAN' },
  { key: 'account_number', label: 'Account number' },
  { key: 'ifsc', label: 'IFSC' },
  { key: 'utr', label: 'UTR / reference' },
  { key: 'amount', label: 'Amount' },
  { key: 'txn_date', label: 'Date', hint: 'DD/MM/YYYY' },
];

const blockPaste = (onBlocked: () => void) => (e: React.ClipboardEvent) => {
  e.preventDefault();
  onBlocked();
};

type Props = {
  item: CbtItem;
  response: Record<string, any> | null;
  onChange: (response: Record<string, any> | null) => void;
  onPasteBlocked: () => void;
  minWords?: number | null;
  maxWords?: number | null;
};

export function CbtQuestion({ item, response, onChange, onPasteBlocked, minWords, maxWords }: Props) {
  const content = item.content ?? {};
  const prompt: string = content.prompt ?? content.text ?? content.question ?? '';

  if (item.type === 'mcq' || item.type === 'sjt') {
    const options: { id: string; text?: string; label?: string }[] = Array.isArray(content.options) ? content.options : [];
    const selected = response?.option_id ?? null;
    return (
      <div className="space-y-4">
        <p className="whitespace-pre-line text-base font-medium leading-relaxed">{prompt}</p>
        <div className="space-y-2" role="radiogroup" aria-label="Answer options">
          {options.map((opt, idx) => {
            const active = selected === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange(active ? null : { option_id: opt.id })}
                className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                  active ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/60'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                    active ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                  }`}
                >
                  {String.fromCharCode(65 + idx)}
                </span>
                <span className="whitespace-pre-line">{opt.text ?? opt.label ?? ''}</span>
              </button>
            );
          })}
        </div>
        {selected && (
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            Clear my answer
          </Button>
        )}
      </div>
    );
  }

  if (item.type === 'numeric') {
    return (
      <div className="space-y-3">
        <p className="whitespace-pre-line text-base font-medium leading-relaxed">{prompt}</p>
        <Input
          inputMode="decimal"
          value={response?.value ?? ''}
          placeholder="Type your answer"
          onPaste={blockPaste(onPasteBlocked)}
          onChange={(e) => {
            const v = e.target.value.replace(/[^\d.\-]/g, '');
            onChange(v === '' ? null : { value: v });
          }}
          className="max-w-xs text-foreground"
        />
        {content.unit && <p className="text-xs text-muted-foreground">Answer in {content.unit}</p>}
      </div>
    );
  }

  if (item.type === 'match_pair') {
    const left = content.left ?? content.left_text ?? content.a ?? '';
    const right = content.right ?? content.right_text ?? content.b ?? '';
    const value = response && typeof response.match === 'boolean' ? (response.match as boolean) : null;
    return (
      <div className="space-y-4">
        {prompt && <p className="text-sm text-muted-foreground">{prompt}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Record A</p>
            <p className="whitespace-pre-line text-sm font-medium">{String(left)}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Record B</p>
            <p className="whitespace-pre-line text-sm font-medium">{String(right)}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            type="button"
            variant={value === true ? 'default' : 'outline'}
            onClick={() => onChange(value === true ? null : { match: true })}
          >
            They match
          </Button>
          <Button
            type="button"
            variant={value === false ? 'default' : 'outline'}
            onClick={() => onChange(value === false ? null : { match: false })}
          >
            They do not match
          </Button>
        </div>
      </div>
    );
  }

  if (item.type === 'data_entry_record') {
    const record = (content.record ?? {}) as Record<string, any>;
    const fields = (response?.fields ?? {}) as Record<string, string>;
    const setField = (key: string, value: string) =>
      onChange({ ...(response ?? {}), fields: { ...fields, [key]: value } });
    return (
      <div className="space-y-4">
        {prompt && <p className="text-sm text-muted-foreground">{prompt}</p>}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Copy from this document
            </p>
            <dl className="space-y-2 text-sm">
              {DATA_ENTRY_FIELDS.filter((f) => record[f.key] !== undefined && record[f.key] !== null).map((f) => (
                <div key={f.key} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd className="select-none text-right font-medium">{String(record[f.key])}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="space-y-3">
            {DATA_ENTRY_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={`${item.id}-${f.key}`} className="text-xs">
                  {f.label}
                  {f.hint ? ` (${f.hint})` : ''}
                </Label>
                <Input
                  id={`${item.id}-${f.key}`}
                  value={fields[f.key] ?? ''}
                  onPaste={blockPaste(onPasteBlocked)}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className="text-foreground"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // written / long answer
  const text: string = response?.text ?? '';
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <div className="space-y-3">
      <p className="whitespace-pre-line text-base font-medium leading-relaxed">{prompt}</p>
      <Textarea
        value={text}
        rows={12}
        maxLength={2000}
        placeholder="Type your answer here"
        onPaste={blockPaste(onPasteBlocked)}
        onChange={(e) => {
          const v = e.target.value.slice(0, 2000);
          onChange(v ? { text: v } : null);
        }}
        className="text-foreground"
      />
      <p className="text-xs text-muted-foreground">
        {words} words
        {minWords ? ` · at least ${minWords}` : ''}
        {maxWords ? ` · at most ${maxWords}` : ''} · {2000 - text.length} characters left
      </p>
    </div>
  );
}
