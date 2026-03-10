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

          <div className="bg-primary/5 border border-primary/20 rounded-md px-3 py-2 mb-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">You Pay</span>
              <span
                className="text-sm font-bold text-primary tabular-nums cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => {
                  const intAmount = Math.floor(Number(totalPrice)).toString();
                  copyToClipboard(intAmount, 'Amount');
                }}
                title="Click to copy amount"
              >
                {fiatSymbol}{Number(totalPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Payment fields */}
          {method.fields?.filter(f => f.fieldValue).map((field, fIdx) => {
            const fieldNameLower = (field.fieldName || '').toLowerCase();
            const isNameField = fieldNameLower.includes('name') || fieldNameLower.includes('holder');
            const shouldShowCopy = field.isCopyable || isNameField;
            return (
              <div key={fIdx} className="flex items-start justify-between py-1.5 border-b border-border/50 last:border-0">
                <span className="text-[10px] text-muted-foreground shrink-0 mr-2">{field.fieldName}</span>
                <span
                  className={`text-[11px] text-foreground font-medium text-right break-all ${shouldShowCopy ? 'cursor-pointer hover:text-primary transition-colors' : ''}`}
                  onClick={shouldShowCopy ? () => copyToClipboard(field.fieldValue, field.fieldName) : undefined}
                  title={shouldShowCopy ? `Click to copy ${field.fieldName}` : undefined}
                >
                  {field.fieldValue}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
