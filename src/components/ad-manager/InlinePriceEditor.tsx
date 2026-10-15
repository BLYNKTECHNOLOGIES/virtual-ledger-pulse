import { useAdsRights, NO_RIGHT } from './adsRights';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pencil, Check, X, Loader2, ChevronUp, ChevronDown } from 'lucide-react';
import { BinanceAd, useUpdateAd } from '@/hooks/useBinanceAds';
import { cn } from '@/lib/utils';
import { priceText } from './adUi';

const STEP = 0.01;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

interface InlinePriceEditorProps {
  ad: BinanceAd;
  isEditing: boolean;
  onRequestEdit: () => void;
  onClose: () => void;
  /** Show a floating ad's ratio on its own line (tables) instead of inline (cards). */
  stacked?: boolean;
}

/**
 * Inline price quick-edit for the Ad Manager price cell.
 * Commit payload mirrors CreateEditAdDialog's edit path exactly:
 *   fixed    → { advNo, exchange_account_id, price }
 *   floating → { advNo, exchange_account_id, priceFloatingRatio }
 * via the existing useUpdateAd mutation (no new API contract).
 */
export function InlinePriceEditor({ ad, isEditing: isEditingProp, onRequestEdit, onClose, stacked = false }: InlinePriceEditorProps) {
  const { canManage } = useAdsRights();
  const isEditing = isEditingProp && canManage;
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
      // Richer log payload so an inline edit audits like a dialog edit.
      asset: ad.asset,
      tradeType: ad.tradeType,
      priceType: ad.priceType,
      ...(isFloating
        ? { priceFloatingRatio: num, oldRatio: round2(original) }
        : { price: num, oldPrice: round2(original) }),
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
    const ratio = isFloating && ad.priceFloatingRatio ? (
      <span className={cn('text-[11px] font-normal tabular-nums text-muted-foreground', stacked ? 'block leading-tight' : 'ml-1.5 align-middle')} title="Floating ratio">
        {Number(ad.priceFloatingRatio).toFixed(2)}%
      </span>
    ) : null;
    return (
      <div className="group inline-flex items-center justify-end gap-1.5">
        <span className={cn('whitespace-nowrap tabular-nums', stacked && 'text-right')}>
          {priceText(ad.price)}
          {ratio}
        </span>
        <button
          type="button"
          aria-label="Edit price"
          title={!canManage ? NO_RIGHT.manage : isFloating ? 'Edit floating ratio' : 'Edit price'}
          onClick={onRequestEdit}
          disabled={!canManage}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-50 transition-opacity hover:bg-accent hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center justify-end gap-1 rounded-md bg-card" onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex flex-col overflow-hidden rounded border border-border">
        <button type="button" aria-label="Increase" title="Up 0.01 (↑)" onMouseDown={(e) => e.preventDefault()} onClick={() => bump(1)} className="flex h-3.5 w-5 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground leading-none">
          <ChevronUp className="h-3 w-3" />
        </button>
        <button type="button" aria-label="Decrease" title="Down 0.01 (↓)" onMouseDown={(e) => e.preventDefault()} onClick={() => bump(-1)} className="flex h-3.5 w-5 items-center justify-center border-t border-border text-muted-foreground hover:bg-accent hover:text-foreground leading-none">
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
        aria-label={isFloating ? 'Floating ratio (%)' : 'Price (₹)'}
        className="h-7 w-24 px-1.5 text-right text-sm font-semibold tabular-nums"
      />
      {isFloating && <span className="text-xs text-muted-foreground">%</span>}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Confirm price"
        title="Save (Enter)"
        className="h-7 w-7"
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
        title="Cancel (Esc)"
        className="h-7 w-7"
        disabled={committing}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { committedRef.current = true; onClose(); }}
      >
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
    </div>
  );
}
