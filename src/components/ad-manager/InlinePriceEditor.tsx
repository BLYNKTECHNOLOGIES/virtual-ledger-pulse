import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pencil, Check, X, Loader2, ChevronUp, ChevronDown } from 'lucide-react';
import { BinanceAd, useUpdateAd } from '@/hooks/useBinanceAds';

const STEP = 0.01;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

interface InlinePriceEditorProps {
  ad: BinanceAd;
  isEditing: boolean;
  onRequestEdit: () => void;
  onClose: () => void;
}

/**
 * Inline price quick-edit for the Ad Manager price cell.
 * Commit payload mirrors CreateEditAdDialog's edit path exactly:
 *   fixed    → { advNo, exchange_account_id, price }
 *   floating → { advNo, exchange_account_id, priceFloatingRatio }
 * via the existing useUpdateAd mutation (no new API contract).
 */
export function InlinePriceEditor({ ad, isEditing, onRequestEdit, onClose }: InlinePriceEditorProps) {
  const updateAd = useUpdateAd();
  const isFloating = ad.priceType === 2;
  const original = isFloating ? Number(ad.priceFloatingRatio || 0) : Number(ad.price || 0);
  const [value, setValue] = useState<string>(String(original));
  const [committing, setCommitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    if (isEditing) {
      setValue(String(original));
      committedRef.current = false;
      // Focus + select next tick so the value is highlighted.
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [isEditing, original]);

  const bump = (dir: 1 | -1) => {
    const next = round2((Number(value) || 0) + dir * STEP);
    setValue(String(Math.max(0, next)));
  };

  const commit = () => {
    if (committing) return;
    const num = round2(Number(value));
    // Sanity: > 0, ≤ 2 decimals; block if unchanged.
    if (!isFinite(num) || num <= 0) { onClose(); return; }
    if (round2(original) === num) { onClose(); return; }

    committedRef.current = true;
    setCommitting(true);
    const payload: Record<string, any> = {
      advNo: ad.advNo,
      exchange_account_id: ad._exchangeAccountId,
      ...(isFloating ? { priceFloatingRatio: num } : { price: num }),
    };
    updateAd.mutate(payload, {
      onSuccess: () => { setCommitting(false); onClose(); },
      onError: () => { setCommitting(false); onClose(); }, // toast handled by mutation; revert to display
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); committedRef.current = true; onClose(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); bump(1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); bump(-1); }
  };

  // Blur = cancel (never commit). Ignore blur if we're committing/closing via keyboard/button.
  const handleBlur = () => {
    if (committedRef.current || committing) return;
    // Defer so a click on a stepper/✓ button registers first.
    setTimeout(() => { if (!committedRef.current && !committing) onClose(); }, 120);
  };

  if (!isEditing) {
    return (
      <div className="group inline-flex items-center justify-end gap-1">
        <span>
          ₹{Number(ad.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          {isFloating && ad.priceFloatingRatio ? (
            <span className="text-xs text-muted-foreground ml-1">({Number(ad.priceFloatingRatio).toFixed(2)}%)</span>
          ) : null}
        </span>
        <button
          type="button"
          aria-label="Edit price"
          onClick={onRequestEdit}
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center justify-end gap-1" onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex flex-col">
        <button type="button" aria-label="Increase" onMouseDown={(e) => e.preventDefault()} onClick={() => bump(1)} className="text-muted-foreground hover:text-foreground leading-none">
          <ChevronUp className="h-3 w-3" />
        </button>
        <button type="button" aria-label="Decrease" onMouseDown={(e) => e.preventDefault()} onClick={() => bump(-1)} className="text-muted-foreground hover:text-foreground leading-none">
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
      <Input
        ref={inputRef}
        type="number"
        step="0.01"
        min="0"
        value={value}
        disabled={committing}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="h-7 w-24 text-right tabular-nums px-1.5"
      />
      {isFloating && <span className="text-xs text-muted-foreground">%</span>}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Confirm price"
        className="h-6 w-6"
        disabled={committing}
        onMouseDown={(e) => e.preventDefault()}
        onClick={commit}
      >
        {committing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-success" />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Cancel"
        className="h-6 w-6"
        disabled={committing}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { committedRef.current = true; onClose(); }}
      >
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
    </div>
  );
}
