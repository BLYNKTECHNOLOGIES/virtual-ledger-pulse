import { supabase } from "@/integrations/supabase/client";

/**
 * Payroll engine invoker.
 *
 * Two problems this solves:
 *  1. supabase-js swallows the function's own error body and reports the
 *     useless "Edge Function returned a non-2xx status code". We read the
 *     response body so the operator sees the real reason.
 *  2. The engines require a live user session. If the cached access token has
 *     expired, the call 401s. We refresh the session first, so an idle tab
 *     does not produce a phantom "engine failed".
 */
export async function invokeEngine<T = any>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data: sessionRes } = await supabase.auth.getSession();
  if (!sessionRes?.session) {
    throw new Error("Your session has expired — sign in again and retry.");
  }

  const { data, error } = await supabase.functions.invoke(fn, { body });

  if (error) {
    let detail = "";
    const ctx: any = (error as any).context;
    if (ctx && typeof ctx.text === "function") {
      try {
        const raw = await ctx.text();
        try {
          const parsed = JSON.parse(raw);
          detail = String(parsed?.message ?? parsed?.error ?? raw ?? "");
        } catch {
          detail = raw;
        }
      } catch {
        /* body already consumed */
      }
    }
    if (/unauthor/i.test(detail) || ctx?.status === 401) {
      throw new Error(`${fn}: your session has expired — sign in again and retry.`);
    }
    throw new Error(`${fn}: ${detail || error.message}`);
  }

  if ((data as any)?.error) {
    throw new Error(String((data as any).message ?? (data as any).error));
  }
  return data as T;
}
