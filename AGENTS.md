# Project architecture decisions

- Terminal Copilot suggestions use the opened order's client-side status, fields, draft and bounded current-order transcript; no nickname-based history or extra Binance lookups, because masked identities can collide and live suggestions must not wait on unrelated records.
- Copilot AI generation uses the server-side Lovable Gateway Responses stream and request-local run ID; streaming removes the former eight-second abort while keeping credentials out of the browser.
- Keep Copilot style exemplars and blacklist reads parallel and nonblocking audit logging outside the suggestion display path, because style and analytics must not delay an operator's reply.
- F&F approval stages payroll inputs only; RazorpayX writes and read-back verification belong to the cockpit Inputs Push step, so separation review and payroll execution remain distinct.
- The daily IST last-working-day sweep disables ERP login and queues biometric removal regardless of F&F; RazorpayX dismissal requires paid/verified F&F and employee-level final salary payout proof at the proxy, because settlement or a month-wide processed flag cannot prove salary payment.