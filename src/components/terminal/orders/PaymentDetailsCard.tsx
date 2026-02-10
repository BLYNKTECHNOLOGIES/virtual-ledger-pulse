import { Copy, CreditCard } from 'lucide-react';
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
        <div key={idx}>
          <div className="flex items-center gap-1.5 mb-2">
            <CreditCard className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
              {method.tradeMethodName}
            </span>
          </div>

          {/* You Pay amount */}
          <div className="bg-primary/5 border border-primary/20 rounded-md px-3 py-2 mb-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">You Pay</span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-primary tabular-nums">
                  {fiatSymbol}{Number(totalPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <button
                  onClick={() => copyToClipboard(totalPrice, 'Amount')}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Payment fields */}
          {method.fields?.filter(f => f.fieldValue).map((field, fIdx) => (
            <div key={fIdx} className="flex items-start justify-between py-1.5 border-b border-border/50 last:border-0">
              <span className="text-[10px] text-muted-foreground shrink-0 mr-2">{field.fieldName}</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[11px] text-foreground font-medium text-right break-all">
                  {field.fieldValue}
                </span>
                {field.isCopyable && (
                  <button
                    onClick={() => copyToClipboard(field.fieldValue, field.fieldName)}
                    className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
