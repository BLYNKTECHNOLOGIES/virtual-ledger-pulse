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

  return (
    <div className="pt-3 border-t border-border space-y-3">
      {payMethods.map((method, idx) => (
        <div key={idx} className="t-panel p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <CreditCard className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
              {method.tradeMethodName}
            </span>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-md px-3 py-2 mb-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">You Pay</span>
              <div className="flex items-center gap-1.5">
                <span
                  className="text-sm font-semibold text-primary t-mono cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => copyToClipboard(Math.floor(Number(totalPrice)).toString(), 'Amount')}
                  title="Click to copy amount"
                >
                  {fiatSymbol}{Number(totalPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <button
                  onClick={() => copyToClipboard(Math.floor(Number(totalPrice)).toString(), 'Amount')}
                  className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                  title="Copy amount"
                  aria-label="Copy amount"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>


          {/* Payment fields — every identifier gets a one-tap copy button */}
          {method.fields?.filter(f => f.fieldValue).map((field, fIdx) => (
            <div key={fIdx} className="flex items-start justify-between py-1.5 border-b border-border/50 last:border-0">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0 mr-2">{field.fieldName}</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="text-xs text-foreground t-mono bg-secondary px-1.5 py-0.5 rounded text-right break-all cursor-pointer hover:text-primary transition-colors"
                  onClick={() => copyToClipboard(field.fieldValue, field.fieldName)}
                  title={`Click to copy ${field.fieldName}`}
                >
                  {field.fieldValue}
                </span>
                <button
                  onClick={() => copyToClipboard(field.fieldValue, field.fieldName)}
                  className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                  title={`Copy ${field.fieldName}`}
                  aria-label={`Copy ${field.fieldName}`}
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
