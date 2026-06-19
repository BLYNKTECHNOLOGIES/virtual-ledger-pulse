import { Check, ChevronsUpDown, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ALL_ACCOUNTS, useExchangeAccount } from "@/contexts/ExchangeAccountContext";

/**
 * Global Binance-account switcher shown in the top header.
 * - Admins / super admins can switch between accounts and pick "All accounts".
 * - Operators bound to a single account see a read-only badge of their account.
 */
export function ExchangeAccountSwitcher() {
  const {
    accounts,
    activeAccountId,
    activeAccount,
    canSwitch,
    boundAccountId,
    setActiveAccountId,
  } = useExchangeAccount();

  const activeColor = activeAccount?.color || "#64748B";
  const activeLabel =
    activeAccountId === ALL_ACCOUNTS ? "All accounts" : activeAccount?.account_name || "Account";

  // Operator bound to one account → static badge, no dropdown.
  if (!canSwitch && boundAccountId) {
    return (
      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 border-gray-200 bg-gray-50">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: activeColor }} />
        <span className="text-sm font-medium text-gray-700">{activeLabel}</span>
      </div>
    );
  }

  if (accounts.length <= 1) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2 border-2 border-gray-200 rounded-lg text-gray-700 hover:bg-blue-50 hover:text-blue-700"
        >
          {activeAccountId === ALL_ACCOUNTS ? (
            <Layers className="h-4 w-4 text-slate-500" />
          ) : (
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: activeColor }} />
          )}
          <span className="hidden sm:inline text-sm font-medium max-w-[140px] truncate">{activeLabel}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Binance Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {accounts.map((acc) => (
          <DropdownMenuItem
            key={acc.id}
            onClick={() => setActiveAccountId(acc.id)}
            className="cursor-pointer flex items-center gap-2"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: acc.color || "#64748B" }} />
            <span className="flex-1 truncate">{acc.account_name}</span>
            {!acc.is_active && <span className="text-xs text-muted-foreground">inactive</span>}
            {activeAccountId === acc.id && <Check className="h-4 w-4 text-blue-600" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setActiveAccountId(ALL_ACCOUNTS)}
          className="cursor-pointer flex items-center gap-2"
        >
          <Layers className="h-4 w-4 text-slate-500" />
          <span className="flex-1">All accounts</span>
          {activeAccountId === ALL_ACCOUNTS && <Check className="h-4 w-4 text-blue-600" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Small colored chip used in lists to label which Binance account a row belongs to. */
export function ExchangeAccountBadge({ accountId }: { accountId: string | null | undefined }) {
  const { colorFor, nameFor, accounts } = useExchangeAccount();
  if (!accountId || accounts.length <= 1) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{ backgroundColor: `${colorFor(accountId)}1A`, color: colorFor(accountId) }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colorFor(accountId) }} />
      {nameFor(accountId)}
    </span>
  );
}
