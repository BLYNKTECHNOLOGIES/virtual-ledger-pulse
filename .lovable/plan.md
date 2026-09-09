# Keep Terminal chat continuously synchronized with Binance

## Root cause confirmed

- The always-on Lightsail listener and every open Terminal browser both open Binance chat sockets for the same account. Binance permits one effective chat session per account, so browser sessions can displace the server listener and cause intermittent gaps.
- The backup chat sweep trusts Binance's `chatUnreadCount`, although live evidence and the existing code confirm that field is usually zero even when Binance shows unread chats.
- The backup is scheduled only hourly. If the listener misses a frame, a closed or completed order may not be reconciled promptly.
- Mobile browsers suspend timers and sockets in the background, but the inbox does not force an immediate refresh when the page becomes visible again.

## Changes

1. **One Binance chat session per account**
   - Keep the Lightsail listener as the sole live Binance socket owner.
   - Stop Terminal browsers from opening competing Binance sockets.
   - Continue sending messages through the existing verified server send path.
   - Render incoming messages from the database through Supabase Realtime, with polling only as recovery.

2. **Reliable continuous backstop**
   - Change `terminal-chat-sweep` to rotate through recent active orders regardless of Binance's unreliable unread count.
   - Run the 55-second sweep every minute rather than once per hour.
   - Preserve account scoping, order/topic validation, deduplication, and rate-limit pacing.

3. **Realtime and mobile recovery**
   - Refresh the inbox, badge, and open thread on both inserted and updated stored messages.
   - Immediately reconcile when a mobile tab becomes visible, returns from browser history, or reconnects to the network.
   - Keep system-generated Binance notices excluded from unread counts.

4. **Operational truth**
   - Show server-backed sync status rather than claiming a browser WebSocket is live.
   - Keep the listener heartbeat as the health signal and verify both Blynk and ASEC remain connected.

## Verification

- Deploy and directly invoke the updated sweep.
- Confirm the minute schedule and successful executions.
- Confirm fresh messages are stored with low latency and the listener heartbeat reports both accounts connected.
- Verify Realtime publication, inbox output, unread counts, no synthetic threads, and no duplicate order/message groups.
- Run type checking/build and test mobile resume behavior in the preview where authentication permits.
- Append the completed change to the shared state log in IST.
