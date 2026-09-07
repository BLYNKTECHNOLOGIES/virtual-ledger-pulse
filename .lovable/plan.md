# Chat listener: cause found — one extra parameter in the Binance request

The service is running correctly now (it loaded, found both Binance accounts, and writes its health signal). Both chat connections fail for a single reason, and the log states it plainly:

```text
connect failed Blynk Binance: chat credential failed: 400 {"code":-31002,"msg":"illegal parameter"}
connect failed ASEC Binance:  chat credential failed: 400 {"code":-31002,"msg":"illegal parameter"}
```

Both accounts fail identically, so this is not a key or permission problem. Our own working chat code asks Binance for the chat pass with a timestamp only. The listener file adds one extra field ("recvWindow") that Binance refuses on this particular chat endpoint — hence "illegal parameter" for both accounts.

The stray Node/WebSocket errors above that line are old entries from before the last fix; the newest start-up shows a clean load.

## What will change

Remove the extra field from the listener's chat-pass request so it matches, character for character, the request our live chat already uses successfully. Nothing else in the file changes.

## Steps

1. Correct the listener file and check it locally, then publish it so the server can download it.
2. You run the same two commands as before (download, then check and restart). I will give them with the new expected line count and checksum filled in.
3. I verify from the database, not from appearances:
   - health record shows both connections open,
   - messages from a live order are stored within a few seconds,
   - a restart recovers on its own and stores no duplicates.
4. Only after that passes: switch the Terminal chat to read stored messages first with the live connection as backup, so opening a chat is instant.
5. Record the change in the state log in IST.

## Technical notes

- Failing call: `GET /sapi/v1/c2c/chat/retrieveChatCredential?timestamp=…&recvWindow=5000&signature=…` returns `-31002`. The proven call in `supabase/functions/binance-ads/index.ts` (line 1885) signs `timestamp` only; the listener will be aligned to that exact query string.
- Everything stays within official Binance capability: same documented endpoint, same signing, same relay target URL shape as the browser hook.
- Health row today: `terminal_collector_state` id `chat_listener`, `accounts: 2`, `connected: 0`, `savedMessages: 0` — expected to become `connected: 2` after the fix.
