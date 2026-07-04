import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_clients",
  title: "List clients",
  description:
    "List clients from the ERP client directory, most recently onboarded first. Respects the signed-in user's permissions (RLS).",
  inputSchema: {
    search: z
      .string()
      .optional()
      .describe("Optional case-insensitive filter on client name or phone."),
    limit: z
      .number()
      .int()
      .optional()
      .describe("Max rows to return (default 25, capped at 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const cap = Math.min(Math.max(limit ?? 25, 1), 100);
    let query = supabaseForUser(ctx)
      .from("clients")
      .select(
        "id, name, phone, client_type, risk_appetite, kyc_status, client_value_score, date_of_onboarding",
      )
      .eq("is_deleted", false)
      .order("date_of_onboarding", { ascending: false })
      .limit(cap);
    if (search && search.trim())
      query = query.or(`name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%`);
    const { data, error } = await query;
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { clients: data },
    };
  },
});
