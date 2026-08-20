# BlynkEx ERP

Internal enterprise resource platform for BlynkEx — trading operations (P2P terminal), finance
and accounting, banking & compliance, client management, and a full HRMS/payroll suite.

Authored and maintained by **Devesh Kumar**.

## Tech stack

- Vite + React 18 + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (Postgres, Auth, Storage, Edge Functions)
- TanStack Query for data fetching

## Modules

| Area | What it covers |
| --- | --- |
| Terminal | P2P order desk, ad manager, auto-pricing, auto-pay, chat |
| Financials | Ledgers, wallets, multi-asset inventory, reports & analytics |
| BAMS | Bank accounts, journal entries, beneficiaries, settlements |
| Compliance | Bank cases, investigations, documents, audit activity feed |
| Clients | KYC, onboarding approvals, risk grading, identity resolution |
| HRMS | Attendance, leave, payroll, onboarding/offboarding, documents |

## Local development

Requires Node.js 18+ (install via [nvm](https://github.com/nvm-sh/nvm)).

```sh
git clone <YOUR_GIT_URL>
cd blynkex-erp
npm i
npm run dev
```

The dev server runs on port `8080`.

## Environment

Copy the required keys into `.env` (never commit real secrets):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=
```

Server-side secrets (payment, exchange and mail credentials) are stored as Edge Function
secrets and are never exposed to the browser.

## Build & deploy

```sh
npm run build      # production bundle in dist/
npm run preview    # serve the production build locally
```

Deployments are served from the configured custom domain; database changes ship as SQL
migrations under `supabase/migrations`.

## Conventions

- All colours, gradients and shadows come from semantic tokens in `src/index.css` — never
  hardcode colour utilities in components.
- Row Level Security is enforced for every table; roles live in a dedicated `user_roles` table.
- Significant state changes are appended to `docs/STATE_LOG.md`.

---

© BlynkEx. Internal use only.
