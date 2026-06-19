import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { setActiveExchangeAccountId } from "@/lib/activeExchangeAccount";

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
  accounts: ExchangeAccount[];
  loading: boolean;
  /** The active account id, or ALL_ACCOUNTS for the combined admin view. */
  activeAccountId: string;
  /** Resolved account object for the active id (null when ALL). */
  activeAccount: ExchangeAccount | null;
  /** Whether the user is allowed to switch accounts (admins/super admins). */
  canSwitch: boolean;
  /** Whether the current user is bound to a single account (operator). */
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
  const canSwitch = hasRole("admin") || hasRole("super admin");

  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [boundAccountId, setBoundAccountId] = useState<string | null>(null);
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

  const fetchBinding = useCallback(async () => {
    if (!user?.id) {
      setBoundAccountId(null);
      return;
    }
    const { data } = await supabase
      .from("terminal_user_exchange_mappings")
      .select("exchange_account_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    setBoundAccountId((data?.exchange_account_id as string) || null);
  }, [user?.id]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchAccounts(), fetchBinding()]);
    setLoading(false);
  }, [fetchAccounts, fetchBinding]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Operators (non-switchers) bound to an account are forced onto it.
  useEffect(() => {
    if (!canSwitch && boundAccountId) {
      setActiveAccountIdState(boundAccountId);
    }
  }, [canSwitch, boundAccountId]);

  const setActiveAccountId = useCallback(
    (id: string) => {
      if (!canSwitch && boundAccountId) return; // operators can't switch
      setActiveAccountIdState(id);
      localStorage.setItem(STORAGE_KEY, id);
    },
    [canSwitch, boundAccountId],
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
    loading,
    activeAccountId,
    activeAccount,
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
