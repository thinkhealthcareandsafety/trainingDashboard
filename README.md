# ThinkHealth Training Dashboard

Training KPIs (10/month, 120/fiscal year), priority calendar, urgent-items ticker and a Follow-Up
page, built on Zoho Books data filtered to items where **Item Identifier = "Training Services"**.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Without Zoho credentials the app runs on sample data (header badge shows "Sample data").

## Connect Zoho Books

1. In https://api-console.zoho.in create a **Server-based Application**.
2. Generate a refresh token with scopes
   `ZohoBooks.invoices.READ,ZohoBooks.salesorders.READ,ZohoBooks.estimates.READ,ZohoBooks.contacts.READ,ZohoBooks.settings.READ`.
3. Copy `.env.example` to `.env.local` and fill in `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`.
4. Restart `npm run dev`. The badge turns green ("Zoho live").

## Where things are

| Path | What |
| --- | --- |
| `src/lib/zoho.ts` | Zoho Books client: token refresh, Training Services item filter, invoice → training mapping |
| `src/app/api/trainings/route.ts` | API the UI calls; 5-minute cache, falls back to sample data |
| `src/lib/kpi.ts` | Targets, pace, forecast, monthly series, breakdowns |
| `src/lib/followups.ts` | Follow-up statuses and auto-triggers (overdue invoice, delivered training, certificate expiry) |
| `src/lib/ticker.ts` | Ticker items and priority ordering |
| `src/lib/store.tsx` | Client state; calendar entries and follow-ups are saved in the browser for now |
| `src/components/*` | Ticker, KPI cards/chart, calendar, follow-up page |

Calendar entries and follow-ups are cached in the browser and, when `MONGODB_URI` is set (see
`.env.example`), shared with the whole team through `/api/store` — everyone sees the same data.
Without it, they stay in that one browser only.

This dashboard is Zoho Books only — no Zoho CRM connection.
