import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Loader2, ExternalLink } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTransactionDetailState, closeTransaction } from './store';
import { getAdapter } from './registry';
import { usePermissions } from '@/hooks/usePermissions';

export function TransactionDetailDialog() {
  const state = useTransactionDetailState();
  const open = state !== null;
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();

  const adapter = state ? getAdapter(state.type) : null;

  const { data, isLoading, error } = useQuery({
    queryKey: ['tx-detail', state?.type, state?.id],
    enabled: open && !!state,
    queryFn: () => adapter!.fetch(state!.id),
    staleTime: 30_000,
  });

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
