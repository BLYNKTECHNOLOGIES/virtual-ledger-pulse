import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Loader2, ExternalLink } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useTransactionDetailState, closeTransaction } from './store';
import { getAdapter } from './registry';
import { usePermissions } from '@/hooks/usePermissions';
import { PurchaseOrderDetailsDialog } from '@/components/purchase/PurchaseOrderDetailsDialog';
import { SalesOrderDetailsDialog } from '@/components/sales/SalesOrderDetailsDialog';

const PURCHASE_ORDER_DETAIL_SELECT = `
  *,
  purchase_order_items (
    id,
    product_id,
    quantity,
    unit_price,
    total_price,
    warehouse_id,
    products (name, code)
  )
`;

const SALES_ORDER_DETAIL_SELECT = `
  *,
  product:products!product_id(code, name)
`;

export function TransactionDetailDialog() {
  const state = useTransactionDetailState();
  const open = state !== null;
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();

  const isPurchaseOrder = state?.type === 'purchase_order';
  const isSalesOrder = state?.type === 'sales_order';
  const isRichOrder = isPurchaseOrder || isSalesOrder;

  // Full order fetch for purchase/sales — renders the same rich dialog as the
  // Purchase/Sales tab "View" action so deep links show identical, complete data.
  const { data: orderRow } = useQuery({
    queryKey: ['tx-detail-order', state?.type, state?.id],
    enabled: open && isRichOrder && !!state,
    staleTime: 30_000,
    queryFn: async () => {
      if (isPurchaseOrder) {
        const { data, error } = await supabase
          .from('purchase_orders')
          .select(PURCHASE_ORDER_DETAIL_SELECT)
          .eq('id', state!.id)
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from('sales_orders')
        .select(SALES_ORDER_DETAIL_SELECT)
        .eq('id', state!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Generic adapter-based fetch for all non-order transaction types.
  const adapter = state ? getAdapter(state.type) : null;
  const { data, isLoading, error } = useQuery({
    queryKey: ['tx-detail', state?.type, state?.id],
    enabled: open && !!state && !isRichOrder,
    queryFn: () => adapter!.fetch(state!.id),
    staleTime: 30_000,
  });

  // Delegate purchase/sales orders to the full-featured dialogs.
  if (isPurchaseOrder) {
    return (
      <PurchaseOrderDetailsDialog
        open={open}
        onOpenChange={(o) => { if (!o) closeTransaction(); }}
        order={orderRow ?? null}
      />
    );
  }
  if (isSalesOrder) {
    return (
      <SalesOrderDetailsDialog
        open={open}
        onOpenChange={(o) => { if (!o) closeTransaction(); }}
        order={orderRow ?? null}
      />
    );
  }

  const canOpenModule = data?.deepLink ? hasPermission(data.deepLink.permission) : false;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeTransaction(); }}>
      <DialogContent className="md:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{data?.title || 'Transaction details'}</span>
            {data?.badge && (
              <Badge variant={data.badge.tone === 'danger' ? 'destructive' : data.badge.tone === 'success' ? 'default' : 'outline'}>
                {data.badge.label}
              </Badge>
            )}
          </DialogTitle>
          {data?.subtitle && <DialogDescription>{data.subtitle}</DialogDescription>}
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading details…
          </div>
        )}

        {error && (
          <div className="py-6 text-sm text-destructive">
            {(error as Error)?.message || 'Failed to load transaction.'}
          </div>
        )}

        {data && !isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 py-2">
            {data.fields.map((f, i) => (
              <div key={i} className={f.span === 2 ? 'md:col-span-2' : undefined}>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{f.label}</div>
                <div className="text-sm text-foreground break-words">{f.value ?? '—'}</div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => closeTransaction()}>Close</Button>
          {data?.deepLink && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      disabled={!canOpenModule}
                      onClick={() => {
                        if (!canOpenModule || !data.deepLink) return;
                        closeTransaction();
                        navigate(data.deepLink.route);
                      }}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      {data.deepLink.label}
                    </Button>
                  </span>
                </TooltipTrigger>
                {!canOpenModule && (
                  <TooltipContent>You don't have access to this module</TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
