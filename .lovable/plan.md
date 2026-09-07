# Chat listener: it starts, but the two chat connections are failing

The service is finally alive. It loaded, read both Binance accounts, and is writing its health signal every 15 seconds. But the health record right now says:

```text
accounts: 2   connected: 0   saved messages: 0   reconnects: 10
```

So it is repeatedly trying to open the two chat connections and being turned away. Nothing is being saved yet.

Only three things can cause this, and the log line tells us which one:

1. The chat pass from Binance is refused (wrong or missing key for the second account, or the account has no chat permission).
2. The relay on the server rejects the connection (the password the listener picked up from the existing settings file is not the one the relay expects).
3. Binance accepts the pass but drops the connection straight away.

## Step 1 — read the failure reason

Run this one command and send me everything it prints:

```bash
pm2 logs chat-listener --lines 40 --nostream
```

## Step 2 — fix based on what it says

- If it says "no API secrets" for one account: the second account's key/secret entry needs correcting in the listener settings file, and I will give the exact command to check which names are present (no values shown).
- If it says "chat credential failed": Binance itself refused; I will read the code it returned and confirm against the official Binance chat documentation whether that account can use chat at all.
- If it says "socket error" or an immediate close: the relay password name is different from the one the listener guessed. I will update the file to try all the names the existing relay accepts, republish it, and you re-download with the same two commands as before.

## Step 3 — confirm it is genuinely working

I verify from my side, not by appearance:

- Health record shows connected: 2 and a recent tick.
- New chat messages from a live order appear in the stored messages within a few seconds.
- A restart of the service recovers on its own without duplicating any message.

## Step 4 — switch the app over

Only after the above passes: the Terminal chat reads stored messages first and live-connects as backup, so opening any chat is instant. Then I record the change in the state log in IST.

## Technical notes

- Health row: `terminal_collector_state` id `chat_listener`, last tick 17:58 IST, status `error`.
- Connection shape used by the listener is identical to the browser hook (`relay/?key=…&target=<chatWssUrl>/<listenKey>?token=…&clientType=web`), and the pass is fetched with a signed call to `/sapi/v1/c2c/chat/retrieveChatCredential`, so nothing outside official Binance capability is involved.
- Account mapping: `default` = Blynk (upstream proxy keys), `acct2` = ASEC (`BINANCE_API_KEY_2` / `BINANCE_API_SECRET_2` in the listener settings file).
- Relay password is currently read as `BINANCE_PROXY_TOKEN` falling back to `PROXY_TOKEN` from the proxy settings file; if the relay expects a different name, that is the likely cause and is a one-line change in the published file.
