import { CreditCard, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface PayMethodField {
  fieldName: string;
  fieldValue: string;
  isCopyable?: boolean;
}

interface PayMethod {
  identifier: string;
  tradeMethodName: string;
  fields?: PayMethodField[];
}

interface Props {
  payMethods: PayMethod[];
  totalPrice: string;
  fiatSymbol?: string;
}

export function PaymentDetailsCard({ payMethods, totalPrice, fiatSymbol = '₹' }: Props) {
  if (!payMethods?.length) return null;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const copyAmount = Math.floor(Number(totalPrice)).toString();

  return (
    <div className="space-y-3">
      {payMethods.map((method, idx) => (
        <div key={idx} className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-secondary/40">
            <CreditCard className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">
              {method.tradeMethodName}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-primary/5 border-b border-border">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">You Pay</span>
            <div className="flex items-center gap-1.5">
              <span
                className="text-base font-semibold text-primary t-mono tabular-nums cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => copyToClipboard(copyAmount, 'Amount')}
                title={`Click to copy amount (${copyAmount})`}
              >
                {fiatSymbol}{Number(totalPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <button
                onClick={() => copyToClipboard(copyAmount, 'Amount')}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
                title={`Copy amount (${copyAmount})`}
                aria-label="Copy amount"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Payment fields — every identifier gets a one-tap copy button */}
          <div className="divide-y divide-border/60">
            {method.fields?.filter(f => f.fieldValue).map((field, fIdx) => (
              <div key={fIdx} className="px-3 py-2">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{field.fieldName}</span>
                <div className="mt-0.5 flex items-start justify-between gap-1.5">
                  <span
                    className="text-xs text-foreground t-mono break-words min-w-0 flex-1 cursor-pointer hover:text-primary transition-colors"
                    onClick={() => copyToClipboard(field.fieldValue, field.fieldName)}
                    title={`Click to copy ${field.fieldName}`}
                  >
                    {field.fieldValue}
                  </span>
                  <button
                    onClick={() => copyToClipboard(field.fieldValue, field.fieldName)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0 -mt-0.5"
                    title={`Copy ${field.fieldName}`}
                    aria-label={`Copy ${field.fieldName}`}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
