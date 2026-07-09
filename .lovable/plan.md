
# KYC & Client Management (RM) Daily Report

A third report **variant** (`kyc_rm`) that plugs into the existing Report Formats tab. You create it, assign recipient mail IDs, pick the IST send time (daily), toggle auto-send, and use "Send now" — exactly like the Profit and Operations reports. Content is built **only** from tables I verified are actually populated (numbers below are live from today's data, so you can see it works).

## Proposed email format (please review before I build)

**Title:** `KYC & Client Management — Daily Report · <DD Mon YYYY> (IST)`

### 1. Onboarding & KYC — today's KPIs (cards)
| Metric | Source | Live sample (today) |
|---|---|---|
| New clients onboarded | `clients.date_of_onboarding = today` | 30 |
| KYC / QC approvals done today | `client_onboarding_approvals` APPROVED, reviewed today | 49 |
| Distinct clients approved today | same, distinct resolved client | 20 |
| KYC documents uploaded today | `client_kyc_documents` created today | 104 |
| Rejections today | approvals REJECTED, reviewed today | (live) |
| Pending approval backlog | approvals still PENDING | 199 |

### 2. New clients who traded for the first time today
Clients whose **very first order ever** is dated today (a new QC turned into a real first trade).
- Count + total first-trade value — live sample: **19 clients, ₹8,63,062**.
- Table (≤ topline, capped ~15 rows): Client name · phone (masked) · first order value · assigned operator. *(No email column — per project rule, client emails are never collected/shown.)*

### 3. Client trading activity today (segregated purchase vs sales)
| Flow | Meaning | Amount | Orders | Distinct parties |
|---|---|---|---|---|
| Sales | clients **buying** USDT from us | ₹30,11,438 | 51 | 45 |
| Purchases | clients/counterparties **selling** USDT to us | ₹23,19,506 | 32 | 30 |
| **Total client turnover** | sales + purchases | **₹53,30,945** | 83 | — |

### 4. Top clients by turnover today
One table, top 10 by total amount: Client name · sales amount · purchase amount · total. (Sales keyed by client, purchases keyed by counterparty/supplier name; matched by name where possible, otherwise listed on their respective side.)

### 5. RM / KYC team productivity today
Approvals completed per reviewer (KYC/QC officer). Live sample today: **KHUSHBU PARMAR — 51**. Table: reviewer · approvals · rejections.

### 6. Compliance watch (only if non-zero, else hidden)
- Pending client limit-increase requests (`client_limit_requests` pending).
- Re-KYC requests raised today (`rekyc_requests`) — *currently 0 records ever; row auto-hides when empty.*
- High-risk clients onboarded / traded today.

**Deliberately excluded** (no reliable/used data or duplicative): dedicated re-KYC table (empty), any profit/asset-value figures (not RM's concern), and any table that would be empty for typical days auto-hides rather than showing a blank grid.

## How it's built (technical)

**No schema change needed for config** — the existing `report_email_configs.variant` already stores a free-text variant. I'll add `kyc_rm` as a selectable option.

1. **Frontend** — `src/pages/ReportSettings.tsx`: add a third variant option ("KYC & Client Management") to the variant `Select` and its badge/label rendering. No other UI change; CRUD, recipients, time, enable, Send-now already generic.

2. **Dispatcher** — `supabase/functions/dispatch-report-emails/index.ts`: route by variant. `profit`/`operations` → `daily-report-email` (unchanged); `kyc_rm` → new `kyc-rm-report-email` function. Keeps the same 5-minute cron, `last_sent_on` idempotency, and `configId` manual send.

3. **New edge function** — `supabase/functions/kyc-rm-report-email/index.ts`: computes the IST-day aggregates above with `fetchAllPaginated` where needed, renders a new template, sends via the existing transactional-email sender with a `kyc-rm-report-<date>-<recipient>` idempotency key. No writes, no snapshot cleanup.

4. **New template** — `supabase/functions/_shared/transactional-email-templates/kyc-rm-report.tsx`: sections 1–6, reusing the existing email card/row/table styles for visual consistency; empty sections auto-hide.

5. **Validation** — `bunx tsgo --noEmit`; deploy both functions; dry-run the new function to confirm the payload matches this format; manually invoke the dispatcher with the new config's `configId` to confirm routing + send.

Once you approve this format (add/remove any section), I'll implement it.
