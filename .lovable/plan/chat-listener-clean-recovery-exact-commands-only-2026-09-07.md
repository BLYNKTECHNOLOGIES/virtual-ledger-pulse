# Chat listener — clean recovery, exact commands only

## What is wrong right now
The file on the server got scrambled by the terminal: bits of the copy-paste commands ended up *inside* the program. That is why it keeps crashing. Nothing else is broken — the settings file, the installed packages and the two Binance accounts are all fine.

We will stop the crashing, then put the correct file on the server with a single download command. No more pasting program text into the terminal.

## Command 1 — run this now

Copy this one line into the server window and press Enter:

```bash
pm2 stop chat-listener && pm2 save
```

That is the only command to run today. It stops the crash loop. The other two services (`binance-proxy`, `chat-relay`) keep running untouched — trading is not affected.

Then stop and wait for me. There is nothing else you can run yet, because the download link does not exist until I create it.

## What I do next (after you approve this plan)
1. Put the finished listener program into this project as a downloadable file, with no passwords or keys inside it.
2. Check it on my side first: it must load without a single error.
3. Publish it so the server can fetch it over a normal web link.
4. Come back to you with **Command 2**: one real `curl` line containing the actual web address — nothing to fill in, nothing to edit.

## Command 2 and 3 — I will send these to you filled in
- **Command 2** downloads the correct file and overwrites the broken one.
- **Command 3** checks the file is complete and starts the service.

Both will be ready to copy exactly as written. If Command 3 shows any error, the service stays stopped and I fix it before we try again — nothing goes live half-working.

## After it is running, I verify from my side
- Messages from Binance are being saved, once each, against the right account (Blynk and ASEC).
- The service reports itself alive every 15 seconds.
- It is not restarting in the background.

## Then the Terminal gets faster
Once the above is proven:
- Chats open instantly from our own stored history instead of waiting on Binance.
- New messages arrive by live push.
- Your browser no longer holds its own Binance connection — it only sends.
- If the server ever goes down, browsers quietly go back to today's behaviour, so chat never stops working.
- A small "live chat: connected / stale" indicator sits next to the existing orders status.

Finally I record the change in the state log with the IST date.
