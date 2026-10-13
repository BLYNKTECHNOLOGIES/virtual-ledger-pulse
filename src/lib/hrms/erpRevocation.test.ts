// @ts-nocheck — run with bun test src/lib/hrms/erpRevocation.test.ts
import { expect, test } from "bun:test";
import { completeErpRevocation } from "../../../supabase/functions/_shared/hr-erp-revocation";

function fixture(authFailure = false) {
  const calls: string[] = [];
  const writes: any[] = [];
  const svc = {
    rpc: async (name: string) => { calls.push(name); return { data: { success: true } }; },
    auth: { admin: {
      deleteUser: async () => { calls.push("delete_auth"); return { error: authFailure ? new Error("provider unavailable") : null }; },
      getUserById: async () => ({ data: { user: null }, error: { status: 404 } }),
    } },
    from: (table: string) => {
      const chain: any = {
        select: () => chain, eq: () => chain,
        update: (value: any) => { writes.push(value); return chain; },
        maybeSingle: async () => ({ data: table === "hr_erp_access_revocations" ? { attempts: 2 } : null }),
        then: (resolve: any) => resolve({ data: table === "user_roles" ? [] : null }),
      };
      return chain;
    },
  };
  return { svc, calls, writes };
}

test("HRMS revocation deletes Auth identity, not just setting INACTIVE", async () => {
  const f = fixture();
  const result = await completeErpRevocation(f.svc, "77f34a5a-c477-428e-8202-382e0714a478");
  expect(result.deleted).toBe(true);
  expect(f.calls).toEqual(["hr_cleanup_revoked_erp", "delete_auth"]);
  expect(f.writes[0].completed_at).toBeDefined();
});
test("Auth failure cannot report permanent deletion and retains a retry", async () => {
  const f = fixture(true);
  const result = await completeErpRevocation(f.svc, "77f34a5a-c477-428e-8202-382e0714a478");
  expect(result.deleted).toBe(false);
  expect(f.writes[0].attempts).toBe(3);
  expect(f.writes[0].completed_at).toBeUndefined();
});