import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type CaptureSource =
  | "unknown"
  | "listener_ws"
  | "ui_ws"
  | "history_sync"
  | "sweep_backstop";

export interface NormalizedChatMessage {
  order_number: string;
  dedupe_key: string;
  binance_message_id: string | null;
  binance_uuid: string | null;
  message_type: string;
  chat_message_type: string | null;
  content_type: string | null;
  sender_is_self: boolean | null;
  sender_nickname: string | null;
  message_status: string | null;
  binance_create_time: number | null;
  binance_created_at: string | null;
  message_text: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  raw_payload: any;
  is_system_message: boolean;
  is_recall: boolean;
  is_compliance_relevant: boolean;
  exchange_account_id?: string | null;
  capture_source: CaptureSource;
  updated_at: string;
}

export function normalizeChatMessage(
  orderNo: string,
  msg: any,
  accountId?: string | null,
  captureSource: CaptureSource = "unknown",
): NormalizedChatMessage {
  const contentType = msg?.contentType == null ? null : String(msg.contentType).toLowerCase();
  const rawType = String(
    msg?.type || msg?.chatMessageType || msg?.messageType || contentType || "unknown",
  ).toLowerCase();
  const knownTypes = new Set([
    "text",
    "image",
    "system",
    "recall",
    "mark",
    "card",
    "video",
    "translate",
    "error",
  ]);
  const messageType = knownTypes.has(rawType) ? rawType : rawType || "unknown";
  const content = msg?.content ?? msg?.message ?? msg?.text ?? null;
  const createTime = Number(msg?.createTime || msg?.time || 0);
  const isSystem =
    messageType === "system" ||
    (msg?.self === undefined &&
      /system|notice|risk|warning|kyc|appeal|complaint/i.test(String(content || "")));
  const isRecall = messageType === "recall" || /recall|retract|withdraw/i.test(messageType);
  const isComplianceRelevant =
    isSystem || isRecall || ["card", "video", "error", "mark"].includes(messageType);
  const binanceMessageId = msg?.id == null ? null : String(msg.id);
  const binanceUuid = msg?.uuid == null ? null : String(msg.uuid);
  const fallbackKey = `${orderNo}-${createTime || "no-time"}-${messageType}-${String(
    content || JSON.stringify(msg || {}),
  ).slice(0, 160)}`;

  const row: NormalizedChatMessage = {
    order_number: orderNo,
    dedupe_key: binanceMessageId || binanceUuid || fallbackKey,
    binance_message_id: binanceMessageId,
    binance_uuid: binanceUuid,
    message_type: messageType,
    chat_message_type: msg?.chatMessageType == null ? null : String(msg.chatMessageType),
    content_type: contentType,
    sender_is_self:
      typeof msg?.self === "boolean"
        ? msg.self
        : typeof msg?.isSelf === "boolean"
        ? msg.isSelf
        : null,
    sender_nickname: msg?.fromNickName || msg?.senderNickName || msg?.nickName || null,
    message_status:
      msg?.status == null
        ? msg?.sendStatus == null
          ? null
          : String(msg.sendStatus)
        : String(msg.status),
    binance_create_time: Number.isFinite(createTime) && createTime > 0 ? createTime : null,
    binance_created_at:
      Number.isFinite(createTime) && createTime > 0 ? new Date(createTime).toISOString() : null,
    message_text: typeof content === "string" ? content : content == null ? null : JSON.stringify(content),
    image_url: msg?.imageUrl || null,
    thumbnail_url: msg?.thumbnailUrl || null,
    raw_payload: msg,
    is_system_message: isSystem,
    is_recall: isRecall,
    is_compliance_relevant: isComplianceRelevant,
    capture_source: captureSource,
    updated_at: new Date().toISOString(),
  };

  if (accountId) row.exchange_account_id = accountId;
  return row;
}

export async function persistChatMessages(
  supabase: ReturnType<typeof createClient>,
  orderNo: string,
  messages: any[],
  accountId?: string | null,
  captureSource: CaptureSource = "unknown",
) {
  let inserted = 0;
  let updated = 0;
  let systemMessages = 0;
  let recalls = 0;
  let errors = 0;

  for (const msg of messages) {
    const row = normalizeChatMessage(orderNo, msg, accountId, captureSource);
    if (row.is_system_message) systemMessages++;
    if (row.is_recall) recalls++;
    if (row.message_type === "error") errors++;

    const { data: existing, error: readErr } = await supabase
      .from("binance_order_chat_messages")
      .select("id")
      .eq("order_number", orderNo)
      .eq("dedupe_key", row.dedupe_key)
      .eq("exchange_account_id", accountId || "00000000-0000-0000-0000-000000000001")
      .maybeSingle();
    if (readErr) throw readErr;

    if (existing?.id) {
      const { error } = await supabase
        .from("binance_order_chat_messages")
        .update(row)
        .eq("id", existing.id);
      if (error) throw error;
      updated++;
    } else {
      const { error } = await supabase
        .from("binance_order_chat_messages")
        .insert({ ...row, captured_at: new Date().toISOString() });
      if (error?.code === "23505") {
        // harmless race with another writer
      } else if (error) {
        throw error;
      } else {
        inserted++;
      }
    }
  }

  return { fetched: messages.length, inserted, updated, systemMessages, recalls, errors };
}
