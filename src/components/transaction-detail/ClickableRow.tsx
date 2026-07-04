import { TableRow } from '@/components/ui/table';
import { ComponentProps, MouseEvent, useCallback } from 'react';
import { openTransaction } from './store';
import type { TransactionType } from './types';
import { cn } from '@/lib/utils';

interface ClickableRowProps extends ComponentProps<typeof TableRow> {
  txType: TransactionType;
  txId: string | null | undefined;
}

/**
 * Drop-in replacement for <TableRow> that opens the global transaction-detail
 * dialog when the row is clicked. No hover styling, no animation — only a
 * pointer cursor. Clicks on interactive children (buttons, links, inputs)
 * are NOT intercepted so existing row actions keep working.
 */
export function ClickableRow({ txType, txId, onClick, onKeyDown, className, children, ...rest }: ClickableRowProps) {
  const handleClick = useCallback(
    (e: MouseEvent<HTMLTableRowElement>) => {
      onClick?.(e);
      if (e.defaultPrevented) return;
      if (!txId) return;
      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, textarea, select, [role="button"], [data-no-row-click]')) {
        return;
      }
      openTransaction({ type: txType, id: txId });
    },
    [txType, txId, onClick],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTableRowElement>) => {
      onKeyDown?.(e);
      if (e.defaultPrevented || !txId) return;
      if (e.key === 'Enter' || e.key === ' ') {
        const target = e.target as HTMLElement;
        if (target.closest('button, a, input, textarea, select, [role="button"], [data-no-row-click]')) {
          return;
        }
        e.preventDefault();
        openTransaction({ type: txType, id: txId });
      }
    },
    [txType, txId, onKeyDown],
  );

  return (
    <TableRow
      {...rest}
      id={txId ? `tx-row-${txId}` : undefined}
      data-tx-id={txId || undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={txId ? 'button' : undefined}
      tabIndex={txId ? 0 : undefined}
      className={cn(
        txId
          ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
          : undefined,
        className,
      )}
    >
      {children}
    </TableRow>
  );
}
