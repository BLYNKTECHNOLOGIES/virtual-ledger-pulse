import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listClients from "./tools/list-clients";
import listSalesOrders from "./tools/list-sales-orders";
import listPurchaseOrders from "./tools/list-purchase-orders";
import getWalletBalances from "./tools/get-wallet-balances";

// The OAuth issuer MUST be the direct Supabase host, built from the project ref
// (never SUPABASE_URL, which is the Lovable Cloud proxy). VITE_SUPABASE_PROJECT_ID
// is inlined as a literal at build time, keeping this entry import-safe.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "blynkex-erp-mcp",
  title: "Blynkex ERP MCP",
  version: "0.1.0",
  instructions:
    "Read-only access to the Blynkex ERP. Use list_clients, list_sales_orders, and list_purchase_orders to browse records, and get_wallet_balances for current multi-asset holdings. All access is scoped to the signed-in user's permissions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listClients, listSalesOrders, listPurchaseOrders, getWalletBalances],
});
