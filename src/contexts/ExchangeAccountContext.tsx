import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { setActiveExchangeAccountId, setVisibleExchangeAccountIds } from "@/lib/activeExchangeAccount";

export interface ExchangeAccount {
  id: string;
  account_name: string;
  account_identifier: string | null;
  exchange_platform: string | null;
  credential_key: string | null;
  is_active: boolean;
  is_default: boolean;
  color: string | null;
  display_order: number | null;
}

export const ALL_ACCOUNTS = "ALL";
const STORAGE_KEY = "active_exchange_account_id";
const PRIMARY_ID = "00000000-0000-0000-0000-000000000001";

interface ExchangeAccountContextValue {
  /** Full account list (all configured accounts) — used by admin settings. */
  accounts: ExchangeAccount[];
  /** Accounts the current user is allowed to see/use. */
  visibleAccounts: ExchangeAccount[];
  loading: boolean;
  /** The active account id, or ALL_ACCOUNTS for the combined admin view. */
  activeAccountId: string;
  /** Resolved account object for the active id (null when ALL). */
  activeAccount: ExchangeAccount | null;
  /** True when the combined "All accounts" view is active. */
  isAllAccounts: boolean;
  /**
   * Account ids the current view should query:
   * a single id normally, or every visible id in combined ("All") mode.
   */
  accountsToQuery: string[];
  /** Whether the user is allowed to switch accounts (>1 account assigned). */
  canSwitch: boolean;
  /** Whether the current user is locked to a single account. */
  boundAccountId: string | null;
  setActiveAccountId: (id: string) => void;
  /** Inject the active account into an edge-function body (skips when ALL). */
  withAccount: <T extends Record<string, unknown>>(body?: T) => T & { exchange_account_id?: string };
  refresh: () => Promise<void>;
  colorFor: (id: string | null | undefined) => string;
  nameFor: (id: string | null | undefined) => string;
}

const ExchangeAccountContext = createContext<ExchangeAccountContextValue | undefined>(undefined);

export function ExchangeAccountProvider({ children }: { children: React.ReactNode }) {
  const { user, hasRole } = useAuth();
  const roleCanSwitch = hasRole("admin") || hasRole("super admin");

  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  // Account ids explicitly assigned to this user (empty = no explicit mapping).
  const [mappedAccountIds, setMappedAccountIds] = useState<string[]>([]);
  const [activeAccountId, setActiveAccountIdState] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) || PRIMARY_ID,
  );

  const fetchAccounts = useCallback(async () => {
    const { data } = await supabase
      .from("terminal_exchange_accounts")
      .select("*")
      .order("display_order", { ascending: true });
    setAccounts((data as ExchangeAccount[]) || []);
  }, []);

  const fetchMappings = useCallback(async () => {
    if (!user?.id) {
      setMappedAccountIds([]);
      return;
    }
    const { data } = await supabase
      .from("terminal_user_exchange_mappings")
      .select("exchange_account_id")
      .eq("user_id", user.id);
    setMappedAccountIds(((data as { exchange_account_id: string }[]) || []).map((m) => m.exchange_account_id));
  }, [user?.id]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchAccounts(), fetchMappings()]);
    setLoading(false);
  }, [fetchAccounts, fetchMappings]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const hasMappings = mappedAccountIds.length > 0;

  // The accounts this user may see. When explicit mappings exist, they govern
  // visibility for everyone (including admins). With no mappings, admins see
  // all accounts and regular users fall back to the primary/default account.
  const visibleAccounts = useMemo(() => {
    if (hasMappings) {
      return accounts.filter((a) => mappedAccountIds.includes(a.id));
    }
    if (roleCanSwitch) return accounts;
    // Non-admin with no mapping → default account only.
    const def = accounts.find((a) => a.is_default) || accounts[0];
    return def ? [def] : [];
  }, [accounts, mappedAccountIds, hasMappings, roleCanSwitch]);

  // Switching is allowed only when the user has access to more than one account.
  const canSwitch = visibleAccounts.length > 1;

  // When locked to a single account, that account id is enforced.
  const boundAccountId = useMemo(
    () => (!canSwitch ? visibleAccounts[0]?.id ?? null : null),
    [canSwitch, visibleAccounts],
  );

  // Force the active id onto the bound account for single-account users.
  useEffect(() => {
    if (!canSwitch && boundAccountId && activeAccountId !== boundAccountId) {
      setActiveAccountIdState(boundAccountId);
    }
  }, [canSwitch, boundAccountId, activeAccountId]);

  // If the active id is no longer visible to a switcher, snap to a valid one.
  useEffect(() => {
    if (
      canSwitch &&
      activeAccountId !== ALL_ACCOUNTS &&
      visibleAccounts.length > 0 &&
      !visibleAccounts.some((a) => a.id === activeAccountId)
    ) {
      setActiveAccountIdState(visibleAccounts[0].id);
    }
  }, [canSwitch, visibleAccounts, activeAccountId]);

  // Keep the module-level mirror in sync for non-hook edge-function callers.
  useEffect(() => {
    setActiveExchangeAccountId(activeAccountId);
  }, [activeAccountId]);

  useEffect(() => {
    setVisibleExchangeAccountIds(visibleAccounts.map((a) => a.id));
  }, [visibleAccounts]);

  const isAllAccounts = activeAccountId === ALL_ACCOUNTS;

  // Accounts the current view should query: a single id, or all visible ids in ALL mode.
  const accountsToQuery = useMemo(() => {
    if (isAllAccounts) {
      const ids = visibleAccounts.map((a) => a.id);
      return ids.length > 0 ? ids : [PRIMARY_ID];
    }
    return [activeAccountId];
  }, [isAllAccounts, visibleAccounts, activeAccountId]);

  const setActiveAccountId = useCallback(
    (id: string) => {
      if (!canSwitch) return; // single-account users can't switch
      if (id !== ALL_ACCOUNTS && !visibleAccounts.some((a) => a.id === id)) return;
      setActiveAccountIdState(id);
      localStorage.setItem(STORAGE_KEY, id);
    },
    [canSwitch, visibleAccounts],
  );

  const activeAccount = useMemo(
    () => (activeAccountId === ALL_ACCOUNTS ? null : accounts.find((a) => a.id === activeAccountId) || null),
    [accounts, activeAccountId],
  );

  const colorFor = useCallback(
    (id: string | null | undefined) => accounts.find((a) => a.id === id)?.color || "#64748B",
    [accounts],
  );
  const nameFor = useCallback(
    (id: string | null | undefined) => accounts.find((a) => a.id === id)?.account_name || "—",
    [accounts],
  );

  const withAccount = useCallback(
    <T extends Record<string, unknown>>(body?: T) => {
      const base = (body || {}) as T & { exchange_account_id?: string };
      if (activeAccountId && activeAccountId !== ALL_ACCOUNTS) {
        return { ...base, exchange_account_id: activeAccountId };
      }
      return base;
    },
    [activeAccountId],
  );

  const value: ExchangeAccountContextValue = {
    accounts,
    visibleAccounts,
    loading,
    activeAccountId,
    activeAccount,
    isAllAccounts,
    accountsToQuery,
    canSwitch,
    boundAccountId,
    setActiveAccountId,
    withAccount,
    refresh,
    colorFor,
    nameFor,
  };

  return <ExchangeAccountContext.Provider value={value}>{children}</ExchangeAccountContext.Provider>;
}

export function useExchangeAccount() {
  const ctx = useContext(ExchangeAccountContext);
  if (!ctx) throw new Error("useExchangeAccount must be used within ExchangeAccountProvider");
  return ctx;
}
