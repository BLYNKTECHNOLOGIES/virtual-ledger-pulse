# Phase 3b — Recover cleanly and finish the listener

## Confirmed current state
- The `.env`, npm packages, Blynk/ASEC mapping, proxy and relay are intact.
- `main.js` is corrupted because the SSH terminal merged several copied command blocks into the file. The proof is literal `cat > ...` text at line 102 and an invalid 354-line count.
- pm2 was restarted against that invalid file and is crash-looping; its “online” flash is not a healthy process.

## 1. Stop the broken process now
**This is the only command to run before approving this plan. Do not run any placeholder or later command yet.**

```bash
pm2 stop chat-listener && pm2 save
```

Wait here. I must build and publish the downloadable file before Step 3 exists.

Do not paste any more JavaScript into SSH.

## 2. Provide the listener as a downloadable file
- Add the reviewed, secret-free listener script to the app's static downloads.
- Validate it locally with Node before exposing it.
- Include a fixed checksum so Lightsail can confirm the exact complete file arrived.
- The file contains no API keys, relay tokens, Supabase keys, or other credentials; those remain only in the existing mode-600 `.env` files.

## 3. Replace the corrupted file with one command
After this plan is approved, I will build the listener file, validate it, and replace this section with the **real HTTPS URL and exact checksum**. Never type angle-bracket placeholders into the terminal.

Then verify before starting anything:

```bash
wc -l /home/ubuntu/chat-listener/main.js
sha256sum /home/ubuntu/chat-listener/main.js
node --check /home/ubuntu/chat-listener/main.js
```

The line count and checksum must match the values supplied with the download, and `node --check` must return silently. If any check fails, the listener stays stopped.

## 4. Start only after validation passes

```bash
pm2 restart chat-listener
pm2 save
pm2 logs chat-listener --lines 40
```

Expected: `chat-listener started`, `accounts: 2`, and one socket-open line for Blynk plus one for ASEC. The restart counter must stop increasing.

## 5. Verify end-to-end before app changes
- Query `terminal_collector_state` for a fresh `chat_listener` heartbeat with `connected: 2`.
- Confirm a real incoming Binance message is stored once in `binance_order_chat_messages` under the correct exchange account.
- Confirm deduplication by checking no duplicate account/order/message keys.
- Leave the existing browser chat path unchanged until these checks pass.

## 6. Switch Terminal chat to the healthy listener
- Enable Realtime for `binance_order_chat_messages` with existing access controls preserved.
- Load stored chat history immediately, then apply incoming database events live.
- Keep the browser socket/send path as an automatic fallback whenever the listener heartbeat is stale.
- Show listener freshness beside the existing Terminal collector status.
- Verify Blynk and ASEC chats separately, reconnect behavior, reload persistence, and the fallback path.

## 7. Record completion
After all checks pass, append one IST-dated line to `docs/STATE_LOG.md` describing the verified Phase 3b listener and fallback behavior.
