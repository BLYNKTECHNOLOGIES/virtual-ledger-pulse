// AM-SEC-5 — "which Binance accounts may this user use", enforced on the server.
//
// The rule itself lives in SQL (public.binance_accounts_for_user), which the
// Terminal screen (ExchangeAccountContext) reads too, so screen and server
// cannot drift. This module only applies it to a request, before any Binance call.

import { restAccountsFromPayload } from "./adRest.ts";
import { accountIdFromPayload } from "./binance-account.ts";

export interface AccessAccountRow {
  id: string;
  account_name: string;
  is_active: boolean;
  is_default: boolean;
}

export interface AccessDeps {
  /** Every configured exchange account (active or not). */
  loadAccounts(): Promise<AccessAccountRow[]>;
  /** Account ids this user may use (public.binance_accounts_for_user). */
  allowedFor(userId: string): Promise<string[]>;
}

export type AccessResult =
  | { ok: true; accountIds: string[] }
  | { ok: false; status: number; body: { success: false; error: string; code: string } };

const deny = (status: number, error: string, code: string): AccessResult => ({
  ok: false,
  status,
  body: { success: false, error, code },
});

/**
 * Check that `userId` may use every requested account.
 * A null/empty id means "the default account" (it must be allowed too).
 * Unknown or inactive ids are refused — never a silent fallback.
 * Any lookup error refuses with 503 (fail closed).
 */
export async function checkAccountAccess(
  deps: AccessDeps,
  userId: string,
  requested: (string | null | undefined)[],
): Promise<AccessResult> {
  let accounts: AccessAccountRow[];
  let allowed: string[];
  try {
    [accounts, allowed] = await Promise.all([deps.loadAccounts(), deps.allowedFor(userId)]);
  } catch (e) {
    console.error("binance account access lookup failed:", (e as Error).message);
    return deny(503, "Account access check failed — please try again. Nothing was sent to Binance.", "ACCOUNT_CHECK_FAILED");
  }
  const allowedSet = new Set(allowed);
  const wanted = requested.length > 0 ? requested : [null];
  const ids: string[] = [];
  for (const raw of wanted) {
    const want = raw ? String(raw) : null;
    const row = want
      ? accounts.find((a) => a.id === want)
      : accounts.find((a) => a.is_default && a.is_active);
    if (!row || !row.is_active) {
      return deny(403, "That Binance account does not exist or is switched off.", "ACCOUNT_DENIED");
    }
    if (!allowedSet.has(row.id)) {
      const label = /binance\s*$/i.test(row.account_name) ? row.account_name : `${row.account_name} Binance`;
      return deny(403, `You don't have access to the ${label} account.`, "ACCOUNT_DENIED");
    }
    if (!ids.includes(row.id)) ids.push(row.id);
  }
  return { ok: true, accountIds: ids };
}

/** Production deps backed by the service-role client. */
// deno-lint-ignore no-explicit-any
export function supabaseAccessDeps(admin: any): AccessDeps {
  return {
    async loadAccounts() {
      const { data, error } = await admin
        .from("terminal_exchange_accounts")
        .select("id, account_name, is_active, is_default");
      if (error) throw new Error(error.message);
      return (data ?? []) as AccessAccountRow[];
    },
    async allowedFor(userId: string) {
      const { data, error } = await admin.rpc("binance_accounts_for_user", { p_user_id: userId });
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown[]).map(String);
    },
  };
}

/** Normalise get_terminal_permissions() output to a Set of keys. */
// deno-lint-ignore no-explicit-any
export function permissionSet(data: any): Set<string> {
  return new Set(
    (Array.isArray(data) ? data : []).map((p: any) =>
      typeof p === "string" ? p : p?.get_terminal_permissions ?? p?.permission
    ),
  );
}

/** Spot trading on Terminal Assets: same rule as the screen (terminal admins get it implicitly). */
export const ASSET_TRADE_PERMISSIONS = ["terminal_assets_manage"];

/**
 * binance-ads: accounts a mutating action targets. startAdRest covers its
 * accountIds (or legacy ads[].accountId); everything else one account.
 * endAdRest is not account-limited (blocking it would leave ads off) → null.
 */
// deno-lint-ignore no-explicit-any
export function adsRequestedAccounts(action: string, payload: Record<string, any>): (string | null)[] | null {
  if (action === "endAdRest") return null;
  if (action === "startAdRest") return restAccountsFromPayload(payload);
  return [accountIdFromPayload(payload)];
}

/**
 * AM-SEC-1 / AM-SEC-2 — Terminal rights each Ads write needs (user callers only;
 * service role / scheduler are trusted, so the automatic rest end is unaffected).
 * The Ads screen (src/components/ad-manager/adsRights.tsx) uses the same rights.
 */
export const AD_WRITE_RULES: Record<string, { anyOf: string[]; message: string }> = {
  postAd: { anyOf: ["terminal_ads_manage"], message: "Permission denied: you need the Ads 'Manage' right to create or edit ads." },
  updateAd: { anyOf: ["terminal_ads_manage"], message: "Permission denied: you need the Ads 'Manage' right to create or edit ads." },
  applyAdRiskGuard: { anyOf: ["terminal_ads_manage"], message: "Permission denied: you need the Ads 'Manage' right to apply risk settings to ads." },
  updateAdStatus: { anyOf: ["terminal_ads_toggle", "terminal_ads_manage"], message: "Permission denied: you need the Ads 'Toggle On/Off' right to switch ads on or off." },
  setUserAdvVisible: { anyOf: ["terminal_ads_toggle", "terminal_ads_manage"], message: "Permission denied: you need the Ads 'Toggle On/Off' right to change ad visibility." },
  startAdRest: { anyOf: ["terminal_ads_rest_timer"], message: "Permission denied: you need the Ads 'Rest Timer' right to start a rest." },
  endAdRest: { anyOf: ["terminal_ads_rest_timer"], message: "Permission denied: you need the Ads 'Rest Timer' right to resume ads." },
  merchantOnline: { anyOf: ["terminal_ads_toggle", "terminal_ads_manage"], message: "Permission denied: you need the Ads 'Toggle On/Off' right to take the merchant online or offline." },
  merchantOffline: { anyOf: ["terminal_ads_toggle", "terminal_ads_manage"], message: "Permission denied: you need the Ads 'Toggle On/Off' right to take the merchant online or offline." },
};

/**
 * AM-SEC-4 — order chat, buyer verification and chat read markers need a
 * Terminal right (user callers only; service role / scheduler stay trusted).
 * Same rights the screens use: chat panel = terminal_orders_chat, Payer page
 * screenshot = terminal_payer_manage, Verify Order = terminal_orders_actions.
 */
export const ORDER_RIGHT_RULES: Record<string, { anyOf: string[]; message: string }> = {
  sendChatMessage: { anyOf: ["terminal_orders_chat", "terminal_payer_manage"], message: "Permission denied: you need the Orders 'Chat' right (or Payer 'Manage') to send chat messages." },
  getChatImageUploadUrl: { anyOf: ["terminal_orders_chat", "terminal_payer_manage"], message: "Permission denied: you need the Orders 'Chat' right (or Payer 'Manage') to send chat images." },
  confirmOrderVerified: { anyOf: ["terminal_orders_actions", "terminal_orders_manage"], message: "Permission denied: you need the Orders 'Actions' right to confirm a buyer's verification." },
  markOrderMessagesRead: { anyOf: ["terminal_orders_view"], message: "Permission denied: you need the Orders 'View' right to mark chats read." },
  markUserMessagesRead: { anyOf: ["terminal_orders_view"], message: "Permission denied: you need the Orders 'View' right to mark chats read." },
};

/** Rule (Ads write or AM-SEC-4 order right) a user caller needs for this action, if any. */
export function terminalRightRule(action: string): { anyOf: string[]; message: string } | undefined {
  return AD_WRITE_RULES[action] ?? ORDER_RIGHT_RULES[action];
}

/** null = allowed (or no rule); otherwise the refusal message. */
export function adWriteDenial(action: string, perms: Set<string>, trustedCaller: boolean): string | null {
  const rule = terminalRightRule(action);
  if (!rule || trustedCaller) return null;
  return rule.anyOf.some((p) => perms.has(p)) ? null : rule.message;
}

/**
 * AM-SEC-5b: chat read markers (`markOrderMessagesRead` / `markUserMessagesRead`)
 * change state on Binance for a specific account, so a user may only call them
 * on an account they may use. (No view-only device guard — read markers stay
 * allowed on personal devices.)
 */
export const CHAT_READ_ACTIONS = new Set<string>(["markOrderMessagesRead", "markUserMessagesRead"]);

/**
 * AM-SEC-5b: `getChatCredential` returns the Binance chat token AND the shared
 * relay token (BINANCE_PROXY_TOKEN), which together are enough to post into any
 * order chat on that account. Only the service role and scheduler jobs may call
 * it; a signed-in user gets 403.
 */
const SERVICE_ONLY_ACTIONS = new Set<string>(["getChatCredential"]);
export function serviceOnlyDenial(action: string, callerIsServiceRole: boolean):
  | { status: number; body: { success: false; error: string; code: string } } | null {
  if (!SERVICE_ONLY_ACTIONS.has(action) || callerIsServiceRole) return null;
  return {
    status: 403,
    body: { success: false, error: "This action is server-only.", code: "SERVICE_ONLY" },
  };
}
