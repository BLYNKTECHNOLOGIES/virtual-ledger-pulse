# Binance C2C SAPI v7.4 — document review vs. our Terminal

I read all three PDFs (the 419-page C2C SAPI v7.4 spec — first 50 pages parsed, which covers the full release note and the entire endpoint index; the "How to handle C2C messages" chat/websocket guide; and the Postman/API-key setup guide).

## Verdict

Nothing in the update breaks us, and most of the new surface is already wired. Two genuinely new endpoints are unused, one field rename needs a sanity check, and the chat-image guide confirms our screenshot flow is correct.

## What the release note changes

Six new APIs, one modified, seven removed.

New APIs and our status (verified against `supabase/functions/binance-ads/index.ts`):

| New API | Path | Our status |
|---|---|---|
| Get chat image pre-signed url | `POST /sapi/v1/c2c/chat/image/pre-signed-url` | Already used (auto-screenshot upload) |
| Query CounterParty Order Statistic | `POST /sapi/v1/c2c/orderMatch/queryCounterPartyOrderStatistic` | Already used |
| Get Payment Method by UserId | `GET /sapi/v1/c2c/paymentMethod/getPayMethodByUserId` | Used, but as a guessed fallback chain |
| Verify additional KYC | (order-match controller, #30) | Not used — we only read the `additionalKycVerify` flag |
| Get commission overview | `POST /sapi/v1/c2c/commission-rate/overview` | Not used |
| Get taker commission rate | `c2c_commission_rate_controller` (#42) | Not used |

Removed APIs (transfer initiation/eligibility/detail, contact list/delete, paginated transaction history, user lookup by mobile/email): confirmed **none of these appear anywhere in our codebase**, so the removals cost us nothing.

Modified API: *Get Ad Details By Merchant Number* — `TicketSize` replaced by `Scale`. A search for `ticketSize` across `src/` and `supabase/` returns nothing, so we are not exposed.

## The three things worth acting on

1. **Payment Method by UserId — replace guesswork with the documented path.**
   `binance-ads/index.ts` currently tries four candidate URLs in sequence (`getPayMethodByUserId`, `paymentMethod/list`, `listByUserId`, a `bapi` path). The doc now confirms exactly one: `GET /sapi/v1/c2c/paymentMethod/getPayMethodByUserId`, headers only (`clientType` required), no query params. Collapsing the chain to the documented call removes three wasted round-trips and three sources of silent failure per lookup.

2. **Commission rate endpoints — a first-class source for fee data.**
   Today `binance_commission_rate_snapshots` is populated opportunistically by scraping `commissionRate` / `takerCommissionRate` / `tradeMethodCommissionRateVoList` off ad-detail and order payloads. The dedicated `commission-rate/overview` endpoint returns a list of taker commission rates directly, which would give the Platform Fee calculation an authoritative source instead of an inferred one. Note: the taker-rate endpoint's exact path and request body fall on doc pages beyond the 50-page parse limit — I would confirm both against the raw spec before wiring anything.

3. **Verify additional KYC — currently a dead end in the operator flow.**
   `TerminalOrders.tsx` shows a "needs KYC" badge when `tradeType === 'SELL' && additionalKycVerify === 1`, but there is no action behind it; the operator has to leave the Terminal. API #30 exists to complete that step. Worth confirming what the endpoint actually does (verifies our own additional KYC vs. the counterparty's) before designing UI — its parameters are also past the parse cut-off.

## The other two documents

- **C2C message handling guide** — no new endpoints. It documents the websocket credential flow (`/sapi/v1/c2c/chat/retrieveChatCredential` → `chatWssUrl/listenKey?token=...`), the image upload sequence, and the exact chat payload shape for images (`type:"image"`, `thumbnailUrl`, `imageUrl`, `imageType`, `width`, `height`). Two operational details worth recording: the pre-signed-url endpoint is **rate-limited to 36 calls per minute per user id**, and image download is done by filtering `chatMessageType` on `retrieveChatMessagesWithPagination`. Our auto-screenshot flow already matches this shape.
- **Postman/API-key setup guide** — onboarding material only (key creation, IP restrictions, signature-must-be-last-query-param). No impact on our proxy, which already signs correctly.

## Proposed scope

Nothing here is urgent. If you want me to proceed, I would do it in this order:

1. Collapse the payment-method fallback chain to the documented endpoint (small, safe, immediate benefit).
2. Read the full spec pages for the commission-rate and verify-KYC endpoints, then come back with a concrete wiring proposal for each rather than guessing at parameters.
3. Record the 36/min pre-signed-url limit in the auto-screenshot function as a guard comment or an actual throttle.

Tell me which of these you want, or if you would prefer I leave the current behaviour alone and simply log the findings.
