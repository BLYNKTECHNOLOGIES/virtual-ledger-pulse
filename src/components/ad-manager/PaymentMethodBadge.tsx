import { resolvePaymentMethod, type PaymentMethodConfig } from '@/data/paymentMethods';
import { cn } from '@/lib/utils';

interface PaymentMethodBadgeProps {
  identifier: string;
  payType?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function PaymentMethodBadge({ identifier, payType, size = 'sm', className }: PaymentMethodBadgeProps) {
  const config = resolvePaymentMethod(identifier) || resolvePaymentMethod(payType || '');

  const label = config?.label || payType || identifier;
  const accentColor = config ? `hsl(${config.colorAccent})` : 'hsl(var(--muted-foreground))';
  const iconLabel = config?.iconLabel || label.slice(0, 3).toUpperCase();

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5',
        size === 'sm' ? 'text-[10px]' : 'text-xs',
        className
      )}
      style={{ borderLeftWidth: 3, borderLeftColor: accentColor }}
    >
      <span className="font-bold" style={{ color: accentColor }}>{iconLabel}</span>
      {size === 'md' && <span className="text-foreground">{label}</span>}
    </div>
  );
}
