import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FeedKind =
  | "system"
  | "note"
  | "comm"
  | "doc"
  | "sales"
  | "purchase"
  | "bank";

export interface ClientFeedItem {
  id: string;
  kind: FeedKind;
  at: string;
  actorId?: string | null;
  actorName: string;
  title: string;
  body?: string | null;
  badge?: string;
  attachment?: {
    url: string;
    mime?: string | null;
    filename: string;
  };
  deepLink?: {
    type: "sales_order" | "purchase_order" | "bank_transaction";
    id: string;
  };
  isReversalNoise?: boolean;
}

interface Args {
  clientId?: string | null;
  clientName?: string | null;
  includeReversed?: boolean;
}

const ACTION_LABELS: Record<string, string> = {
  CLIENT_CREATED: "Client created",
  CLIENT_UPDATED: "Client updated",
  KYC_APPROVED: "KYC approved",
  KYC_REJECTED: "KYC rejected",
  BUYER_APPROVED: "Buyer approved",
  SELLER_APPROVED: "Seller approved",
  LIMIT_CHANGED: "Limit changed",
  CLIENT_DELETED: "Client deleted",
};

export function useClientActivityFeed({ clientId, clientName, includeReversed }: Args) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["client_activity_feed", clientId, clientName, includeReversed],
    enabled: !!clientId,
    queryFn: async (): Promise<ClientFeedItem[]> => {
      if (!clientId) return [];

      const [logs, notes, comms, docs, salesRes, purchasesRes, bankRes] = await Promise.all([
        supabase
          .from("system_action_logs")
          .select("id, action_type, user_id, user_name, recorded_at, metadata, entity_id, entity_type")
          .eq("entity_id", clientId)
          .order("recorded_at", { ascending: true })
          .limit(500),
        supabase
          .from("client_operator_notes")
          .select("id, note, created_by, created_by_name, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: true })
          .limit(500),
        supabase
          .from("client_communication_logs")
          .select("id, communication_type, subject, content, logged_by, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: true })
          .limit(500),
        supabase
          .from("client_kyc_documents")
          .select("id, document_type, file_url, file_name, file_size, mime_type, created_at, deleted_at")
          .eq("client_id", clientId)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
          .limit(500),
        supabase
          .from("sales_orders")
          .select("id, order_number, quantity, price_per_unit, total_amount, status, order_date, created_at, created_by")
          .eq("client_id", clientId)
          .order("created_at", { ascending: true })
          .limit(500),
        clientName
          ? supabase
              .from("purchase_orders")
              .select("id, order_number, product_name, quantity, price_per_unit, total_amount, status, order_date, created_at, created_by, supplier_name")
              .eq("supplier_name", clientName)
              .order("created_at", { ascending: true })
              .limit(500)
          : Promise.resolve({ data: [], error: null } as any),
        supabase
          .from("bank_transactions")
          .select("id, transaction_type, amount, category, description, reference_number, transaction_date, created_at, created_by, is_reversed, reverses_transaction_id")
          .eq("client_id", clientId)
          .order("created_at", { ascending: true })
          .limit(500),
      ]);

      const items: ClientFeedItem[] = [];

      // System actions
      (logs.data || []).forEach((r: any) => {
        items.push({
          id: `sys:${r.id}`,
          kind: "system",
          at: r.recorded_at || r.created_at,
          actorId: r.user_id,
          actorName: r.user_name || "System",
          title: ACTION_LABELS[r.action_type] || r.action_type,
          body: r.metadata ? tryStringify(r.metadata) : null,
          badge: "System",
        });
      });

      // Operator notes
      (notes.data || []).forEach((r: any) => {
        items.push({
          id: `note:${r.id}`,
          kind: "note",
          at: r.created_at,
          actorId: r.created_by,
          actorName: r.created_by_name || "Operator",
          title: "Note",
          body: r.note,
          badge: "Note",
        });
      });

      // Communication logs
      (comms.data || []).forEach((r: any) => {
        items.push({
          id: `comm:${r.id}`,
          kind: "comm",
          at: r.created_at,
          actorName: r.logged_by || "Operator",
          title: r.subject || labelCommType(r.communication_type),
          body: r.content,
          badge: labelCommType(r.communication_type),
        });
      });

      // KYC documents
      (docs.data || []).forEach((r: any) => {
        items.push({
          id: `doc:${r.id}`,
          kind: "doc",
          at: r.created_at,
          actorName: "KYC",
          title: prettifyDocType(r.document_type),
          body: r.file_name,
          badge: "KYC",
          attachment: {
            url: r.file_url,
            mime: r.mime_type,
            filename: r.file_name || "document",
          },
        });
      });

      // Sales orders
      const salesRows = ((salesRes as any).data || []) as any[];
      salesRows.forEach((r) => {
        items.push({
          id: `sales:${r.id}`,
          kind: "sales",
          at: r.created_at || r.order_date,
          actorId: r.created_by,
          actorName: "Sales",
          title: `Sale ${r.order_number || ""}`.trim(),
          body: `${fmtQty(r.quantity)} × ₹${fmtNum(r.price_per_unit)} = ₹${fmtNum(r.total_amount)}`,
          badge: (r.status || "SALE").toUpperCase(),
          deepLink: { type: "sales_order", id: r.id },
        });
      });

      // Purchase orders (by supplier_name matching client name — best effort)
      const purchaseRows = ((purchasesRes as any).data || []) as any[];
      purchaseRows.forEach((r) => {
        items.push({
          id: `purchase:${r.id}`,
          kind: "purchase",
          at: r.created_at || r.order_date,
          actorId: r.created_by,
          actorName: "Purchase",
          title: `Purchase ${r.order_number || ""}`.trim(),
          body: `${fmtQty(r.quantity)} × ₹${fmtNum(r.price_per_unit)} = ₹${fmtNum(r.total_amount)}`,
          badge: (r.status || "PURCHASE").toUpperCase(),
          deepLink: { type: "purchase_order", id: r.id },
        });
      });

      // Bank transactions
      (bankRes.data || []).forEach((r: any) => {
        const noise = !!r.is_reversed || !!r.reverses_transaction_id;
        items.push({
          id: `bank:${r.id}`,
          kind: "bank",
          at: r.created_at || r.transaction_date,
          actorId: r.created_by,
          actorName: "Bank",
          title: `${(r.transaction_type || "TXN").toString().toUpperCase()} · ₹${fmtNum(r.amount)}`,
          body: [r.category, r.description, r.reference_number].filter(Boolean).join(" · ") || null,
          badge: "Bank",
          deepLink: { type: "bank_transaction", id: r.id },
          isReversalNoise: noise,
        });
      });

      const filtered = includeReversed ? items : items.filter((i) => !i.isReversalNoise);
      filtered.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
      return filtered;
    },
  });

  // Realtime: refresh when writes land against this client
  useEffect(() => {
    if (!clientId) return;
    const channel = supabase
      .channel(`client_feed_${clientId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_operator_notes", filter: `client_id=eq.${clientId}` },
        () => qc.invalidateQueries({ queryKey: ["client_activity_feed", clientId] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_kyc_documents", filter: `client_id=eq.${clientId}` },
        () => qc.invalidateQueries({ queryKey: ["client_activity_feed", clientId] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_communication_logs", filter: `client_id=eq.${clientId}` },
        () => qc.invalidateQueries({ queryKey: ["client_activity_feed", clientId] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, qc]);

  return query;
}

function tryStringify(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  try {
    const s = JSON.stringify(v);
    if (s === "{}" || s === "null") return null;
    return s.length > 240 ? s.slice(0, 240) + "…" : s;
  } catch {
    return null;
  }
}

function labelCommType(t?: string | null): string {
  if (!t) return "Comm";
  const k = t.toLowerCase();
  if (k.includes("call")) return "Call";
  if (k.includes("mail")) return "Email";
  if (k.includes("meet")) return "Meeting";
  if (k.includes("whats")) return "WhatsApp";
  if (k.includes("sms")) return "SMS";
  return t;
}

function prettifyDocType(t?: string | null): string {
  if (!t) return "Document";
  return t
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function fmtNum(n: any): string {
  const v = Number(n);
  if (!isFinite(v)) return "-";
  return v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function fmtQty(n: any): string {
  const v = Number(n);
  if (!isFinite(v)) return "-";
  return v.toLocaleString("en-IN", { maximumFractionDigits: 4 });
}
