import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_sales_orders",
  title: "List sales orders",
  description:
    "List recent sales orders from the ERP, newest first. Respects the signed-in user's permissions (RLS).",
  inputSchema: {
    status: z
      .string()
      .optional()
      .describe("Optional exact status filter (e.g. completed, pending)."),
    limit: z
      .number()
      .int()
      .optional()
      .describe("Max rows to return (default 25, capped at 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const cap = Math.min(Math.max(limit ?? 25, 1), 100);
    let query = supabaseForUser(ctx)
      .from("sales_orders")
      .select(
        "id, order_number, client_name, product_id, quantity, price_per_unit, total_amount, status, payment_status, order_date",
      )
      .order("order_date", { ascending: false })
      .limit(cap);
    if (status && status.trim()) query = query.eq("status", status.trim());
    const { data, error } = await query;
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { sales_orders: data },
    };
  },
});
