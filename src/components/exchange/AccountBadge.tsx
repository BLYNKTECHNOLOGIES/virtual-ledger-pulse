import { useExchangeAccount } from "@/contexts/ExchangeAccountContext";
import { cn } from "@/lib/utils";

interface AccountBadgeProps {
  accountId: string | null | undefined;
  /** Only render when the combined "All accounts" view is active (default true). */
  onlyWhenCombined?: boolean;
  className?: string;
  /** Show the account name next to the dot (default true). */
  showName?: boolean;
}

/**
 * Small colored chip identifying which exchange account a row/stat belongs to.
 * By default it only renders in the combined ("All accounts") view to avoid
 * clutter when a single account is already selected.
 */
export function AccountBadge({
  accountId,
  onlyWhenCombined = true,
  className,
  showName = true,
}: AccountBadgeProps) {
  const { isAllAccounts, colorFor, nameFor } = useExchangeAccount();

  if (onlyWhenCombined && !isAllAccounts) return null;
  if (!accountId) return null;

  const color = colorFor(accountId);
  const name = nameFor(accountId);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none",
        className,
      )}
      style={{ borderColor: color, color }}
      title={name}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {showName && <span className="whitespace-nowrap">{name}</span>}
    </span>
  );
}
