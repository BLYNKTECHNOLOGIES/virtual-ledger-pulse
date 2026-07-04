import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_wallet_balances",
  title: "Get wallet balances",
  description:
    "Get current multi-asset wallet balances (USDT, TRX, BTC, etc.) from the ERP ledger. Respects the signed-in user's permissions (RLS).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await supabaseForUser(ctx)
      .from("wallet_asset_balances")
      .select("wallet_id, asset_code, balance, total_received, total_sent, updated_at")
      .order("asset_code", { ascending: true });
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { balances: data },
    };
  },
});
