# Shared ad message: show a clean card, not raw data

## What's wrong

When an ad is shared in a Binance chat, the message content Binance stores is a long machine payload (price scales, colour codes, badge flags, voucher fields). The chat is printing that whole thing as one wide grey strip at the bottom of the conversation.

A card renderer already exists in the app, but this message is still falling through to the plain "system message" strip, so it is not being used for these messages.

## What will change

1. Route the shared-ad message to the card renderer reliably
   - Detect a shared ad by the payload marker Binance sends (`origin: ADV_SHARE_ONLINEADCARD`, or the presence of ad number + price + asset), for both live and stored messages, before any system/plain-text fallback runs.
   - Treat it as a normal chat message from whoever shared it (right side when we shared it), not as a centred system notice.
   - If the payload cannot be read for any reason, show a short line "Shared ad" instead of dumping the raw data.

2. Show only meaningful fields on the card
   - Advertiser name and side (Buy/Sell)
   - Price with currency symbol
   - Asset and available quantity
   - Order limits (min - max)
   - Payment methods
   - Ad number, small and muted
   - A "View on Binance" link when the account's advertiser number is known
   - Everything else in the payload (scales, colour codes, badges, VIP level, voucher/template/system-label fields) is dropped.

3. Tidy the visual
   - Compact bordered card sized like a chat bubble, aligned with the sender, price emphasised, payment methods as small badges, timestamp below in the usual style.

## Verification

- Query one of the real stored shared-ad messages and run it through the parser to confirm the card fields resolve.
- Open a terminal order chat that contains a shared ad in a browser and confirm the raw payload strip is gone and the card renders, in both dark and light terminal themes.
- Full typecheck/build, then append a dated IST line to the state log.

## Technical notes

- Files: `src/components/terminal/orders/chat/ChatAdCard.tsx` (field whitelist + layout), `ChatBubble.tsx` (detection order and alignment), `src/components/terminal/orders/ChatPanel.tsx` (stop classifying `card` type as system-like when the payload is a shared ad).
- Source rows: `binance_order_chat_messages.message_text`, `message_type = 'card'`.
- No new data is invented; all card values come from the Binance payload already stored.
