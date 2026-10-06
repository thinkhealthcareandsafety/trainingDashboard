# Handoff — ThinkHealth Training Dashboard

_Last updated: 5 Oct 2026, end of session 2. Written for the next Claude Code session (and the owner, sshah@thinkhealth.in)._

Read this end to end before touching code. It records what the owner asked for (every prompt, both sessions), the
business rules that came out of it, how the code works **now**, what was verified, and what is still open.

---

## 1. Where things stand

- **The app is LIVE: https://training-dashboard-xfwl.vercel.app** (Vercel, since 5 Oct 2026). Vercel redeploys
  **every push to `master`** — so a push is a production release for the whole team. Only push when the owner asks.
- **GitHub:** `thinkhealthcareandsafety/trainingDashboard`, branch `master`, last pushed commit `025e1aa`.
  This rewrite of HANDOFF.md may still be uncommitted — check `git status`.
- **Database:** MongoDB Atlas cluster **Cluster0** (the cluster in `MONGODB_URI`), database `thinkhealth_dashboard`
  (free tier, ~1% used). It is **not** the "Directory" cluster the owner sees in their own Atlas project — Cluster0 sits
  in another project/account; a colleague added `0.0.0.0/0` to its IP access list for Vercel.
- **Stack:** Next.js **16.3** (Turbopack) + React 19 + Tailwind v4 + MongoDB + Zoho Books (India DC).
  `AGENTS.md`: this Next.js differs from training data — read `node_modules/next/dist/docs/` before Next-specific code.
- **People using it (real, live data):** Shikha Dixit, Ashish Dalal, Sumit A Shah (training board), **Priyanka**
  (AedSmartx trainer), **Arti Sirohi** (AED deliveries), and **Admin** (the owner). Their changes live in MongoDB
  `cardEvents` — **never write test data to the shared database** (see §9).
- **Two boards** on `/follow-up`: the **Training follow-ups** board (9 columns) and the **AedSmartx Training** board
  (4 columns). Plus the Dashboard (`/`, Overview) and Calendar pages from the original app.

---

## 2. Running, deploying, secrets

```bash
npm install
npm run dev                          # http://localhost:3000 (also http://192.168.1.69:3000 on the office LAN)
npx tsc --noEmit -p tsconfig.json    # typecheck — there is no test suite
npx next build                       # production build (passes)
```

- The owner often says "run it" / "run it locally" → start `npm run dev` in the background and give both links.
  Background commands are killed after ~10 min, but the Next server usually keeps running (check with curl before restarting;
  a second `next dev` refuses to start while one is running).
- **Secrets live only in `.env.local`** (gitignored) and in Vercel's Environment Variables:
  `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_ORG_ID`, `ZOHO_API_BASE`, `ZOHO_ACCOUNTS_URL`,
  `MONGODB_URI`, `MONGODB_DB`, `ADMIN_PIN`, `CLEAR_LOGS_PIN`; Vercel also has `ZOHO_DAILY_LIMIT` (2500) and `CRON_SECRET`.
  Optional: `SESSION_SECRET` (changing it signs everyone out). Documented in `.env.example` (no values).
  **Never print, copy or commit secret or PIN values** — a push was once blocked because a PIN had been written into
  this file; scan diffs for PIN digits before every push.
- Git identity is repo-local (`thinkhealthcareandsafety` / `sshah@thinkhealth.in`). Follow the session's commit-attribution reminder.
- **Deploy** = push to `master` (Vercel builds automatically). `vercel.json` adds one cron: `30 3 * * 1-6` (9:00 IST Mon–Sat)
  → `/api/cron/sync` (Vercel Hobby allows daily crons only — and fires anywhere within that hour).
- **Hourly scheduler** = GitHub Actions `.github/workflows/zoho-sync.yml` (`32,50 3-13 * * 1-6` UTC) → `/api/cron/sync`. Needs the
  repo secret **`CRON_SECRET`** (same value as Vercel's); without it the workflow just logs a warning. A failed sync answers 502,
  so the run fails and GitHub emails the repo owner.

---

## 3. How the code works now

### Data flow
```
Zoho Books ──(src/lib/zoho.ts: client, fetchers, mappers)──► src/lib/zohoSync.ts ──► MongoDB copy
                                                                 │  zohoDocs, zohoCustomers, zohoPayments, kv
browser ──(cookie)──► /api/pipeline · /api/aed · /api/trainings · /api/zoho/meta ──(read the copy, no Zoho calls)
browser ◄──► /api/store (team data: cardEvents, members, …; 60 s pull, diff push; server stamps who did what)
```

### Zoho copy + sync (`src/lib/zohoSync.ts`)
- Zoho data is **stored in MongoDB**, not server memory: `zohoDocs` (tracked quotations / sales orders / invoices with full
  detail; flags `training` / `aed`), `zohoCustomers` (all active customers), `zohoPayments` (per paid invoice), and `kv` docs
  `zoho_state` (version, `syncedAt`, `attemptAt`, cursors), `zoho_items`, `zoho_users`, `zoho_sync_lock`, `zoho_calls:<IST date>`,
  `zoho_last_forced`. Each server instance keeps an in-memory copy and reloads it only when `zoho_state.version` changes
  → page loads cost one tiny read, **0 Zoho calls**, ~90 ms.
- **Schedule:** automatic syncs **on the hour, 9 am–7 pm IST, Monday–Saturday** (`SYNC_HOURS`; none on Sunday). A sync is due
  when a slot has passed since the last successful one (`lastSlot()` / `scheduledSyncDue()`). Three triggers, one lock:
  (1) **heartbeat** — the sidebar's `SyncPanel` calls `GET /api/zoho/sync` every 2 min (and on tab focus); when due, the sync runs
  **inside that request** (`syncIfDue()`), so it can't be cut short after the response; (2) **GitHub Actions** hourly →
  `/api/cron/sync`, for hours when nobody has the site open; (3) data routes still start one via `after()` (best effort).
  **9 am and 2 pm are full checks** (`FULL_HOURS`: every tracked document by item → catches deletions, full customer list,
  items, team; ~60 calls, ~1 min); other hours are incremental. Sync failures are logged (`[zoho sync] failed: …`).
- **Sidebar (every page):** *Sync now* (`POST /api/zoho/sync`), **Last sync** / **Next sync**, red line if the last try failed;
  the rail and the phone header have compact versions. After a sync, pages reload their Zoho data (`ZOHO_SYNCED` window event).
  The board header no longer has its own Sync now.
- **Incremental** = each kind listed **newest change first** (`sort_column=last_modified_time`), stopping at the stored cursor →
  ~1 call per kind; one detail call per changed document; recent customers (1 call); payments only for changed paid invoices.
  Typical hourly sync ≈ 4 calls; a day ≈ 50–100 calls.
- One sync at a time across instances (Mongo lease lock, 5 min). Failed sync → retry no sooner than 5 min.
  **Sync now** (`forceSync()`) any time, at most **once a minute for everyone**. Zoho token: always re-read from Mongo before
  refreshing (every refresh mints a new token; Zoho caps live tokens), and a 401 drops the token and retries once. Daily call counter; automatic syncing pauses at
  95% of `ZOHO_DAILY_LIMIT`. First-ever sync into an empty DB ≈ 290 calls (already done).
- Verified when built: all route outputs identical, record by record, to the old in-memory implementation.

### Sign-in and API protection
- **One sign-in page for the whole site** (`AppShell` → `SignInPage` + `MembersScreen`): pick your name (or **Admin**), type the
  4-digit PIN (auto-submits), land on the **Dashboard**. Signed in stays signed in (all tabs, restarts) until **Sign out** —
  in the name pill at the top right of every page, in the sidebar, and on the Follow-ups board.
- `POST /api/members/sign-in` checks the PIN server-side (member PINs **scrypt-hashed** in Mongo `memberPins`, a collection the
  browser never receives; Admin = `ADMIN_PIN` env) and sets an **HttpOnly cookie `th_session`** (HMAC token, `src/lib/auth.ts`,
  `src/lib/pins.ts`). 5 wrong PINs pause that name for 60 s. `src/lib/session.tsx` = app-wide `SessionProvider`.
- Every data route returns **401** without the cookie. Public routes: `GET /api/members` (names only), sign-in, session (also
  upgrades old localStorage sign-ins to the cookie), sign-out, `POST /api/members/pin` (needs the admin PIN; with a `name` it
  creates the member — this is how members are added), `/api/cron/sync` (needs `CRON_SECRET`).
- **The server stamps the change log**: new `cardEvents` get the signed-in member's name (from the `members` collection; Admin =
  "Admin"; `zoho_change` notices keep "Zoho Books"); existing entries can only be reverted (server sets `revertedAt`/`revertedBy`);
  only Admin can delete entries or write `members`. Clear logs needs the Admin session **and** the PIN.

### Event model (both boards)
A card = Zoho data + every **non-reverted** `CardEvent` replayed in order; nothing from Zoho is overwritten, so **Revert** = mark the
event reverted. Card ids: `lead:`, `quote:`, `pi:`, `invoice:`, `payment:` + Zoho id, `potential:<id>`, `aed:<invoice id>`,
`aedcustomer:<contact id>` (customer-wide AED log). Event kinds: `set_name/type/sector`, `add/remove_alias/email/phone`, `delete`,
`merge` (`[from,to]`), `set_training_date` (`YYYY-MM-DD`, several days comma-separated `2026-10-05,2026-10-06`,
`YYYY-MM-DDTHH:mm` on AED, or `TBD`; carries `trainers`, which may include external names),
`complete_training`, `zoho_change`, `add_potential` / `set_potential_date`, `set_not_required`, `set_reseller`, `set_resale`,
`set_delivered`, `add_note`. **Clear logs** archives to `cardEventsArchive` first and keeps `add_potential` events.

### Key files
| File | Role |
|---|---|
| `src/lib/zohoSync.ts` | Mongo copy, schedule, lock, budget, incremental/full sync; `pipelineData` / `aedData` / `trainingsData` / `metaData` builders. |
| `src/lib/zoho.ts` | Zoho client (token cached in Mongo `kv`, call counter, retries), list/detail building blocks, pure mappers, `QUOTE_TRAINING_ITEMS`, `AED_EXCLUDED`. |
| `src/lib/pipeline.ts` | Board logic: `buildBoard` (training), `buildAedBoard`, flags, merges, schedules, `dueStatus`, `describeEvent`, `mergeCandidates`, trainers, potential cards, role helpers (`isAedTrainer`, `isAedDelivery`). |
| `src/lib/aedParse.ts` | Reads the AED line description: model, year, serials, battery/pads expiry; the five extras. |
| `src/components/FollowUps.tsx` | Board page: column window (◀ ▶ / keys / swipe, fit to screen), columns + customer boxes, F / R toggles, Clear logs, AED/training switch. |
| `src/components/followups/CardModal.tsx` | Training card modal, merge view, schedule/trainers, Potential add modal, shared modal pieces (exported). |
| `src/components/followups/AedModal.tsx` | AedSmartx card modal (delivery, schedule date+time, notes, item description, resale). |
| `src/components/followups/MembersScreen.tsx` | Sign-in card (names, PIN, Admin, + Add new member). |
| `src/components/AppShell.tsx` | Shell, sidebar (hide to rail), global sign-in gate, `MemberPill`, `PageHeader`. |
| `src/lib/store.tsx` / `src/app/api/store/route.ts` | Shared team data (pull 60 s, diff push) / server stamping. |
| `src/lib/auth.ts`, `src/lib/pins.ts`, `src/lib/session.tsx`, `src/app/api/members/*` | Sign-in, PINs, cookie, session. |
| `src/app/api/{pipeline,aed,trainings,zoho/meta,cron/sync,store/clear-logs}/route.ts` | API routes. |

---

## 4. Business rules (authoritative)

### Training follow-ups board (columns)
**Leads → Quotations → Performa invoice → Training scheduled → Training completed → Invoice sent → Payment received → Deal lost → Potential training**
- Leads = every active Zoho customer (not vendors). Documents from the start of the **previous** fiscal year (now 1 Apr 2025).
  Tracked training items: `Fire Safety Evacuation Training and Drill`, `THCAS BLS Training 2025 (I)`, `THCAS CPR Training 2026 (I)`,
  `THCAS First Aid Training (I)`. Sales orders are this org's **Performa Invoices** (`Performa-25-…`).
- **One modal for every phase**: customer name (mandatory) + aliases, emails, contact numbers (mandatory; tagged by phase), type
  (`cf_type`), sector (`cf_sector`), created in Zoho, phase-aware sales person, locked IDs & dates with Zoho links, training block,
  Notes, Merged, Payment line (invoice/payment cards), and the **Changes** panel with Revert on every entry. Edit and Delete.
- **Flags (red F) and merges** — forward only, each a revertable event; the target absorbs the earlier card's identity:
  Lead ↔ Quote (same customer) · Quote ↔ PI (**only** the PI's `reference_number` citing the quote) · Lead ↔ PI (PI citing no synced
  quote) · Completed training ↔ Invoice (invoice reference cites the PI) · Invoice ↔ Payment (payment applied to that invoice) —
  **step by step**: an invoice joins its payment only after (or together with — *Merge PI → Invoice → Payment Received*) its
  completed training; out-of-order merges are ignored and shown *Not applied*.
- **Instalments (Invoice ↔ Payment received):** every payment is pulled, but an invoice is flagged with its payments **only once
  the whole sum matches: payments + TDS withheld = invoice total** (`receivedOn` / `sumMatches`; invoice cards carry `received`
  and `paidInFull`). TDS counts because Zoho counts it — 32 of 43 paid training invoices carry TDS (`tax_amount_withheld` on
  each payment row → `ZohoPayment.tdsWithheld`); on 6 Oct the rule agreed with Zoho's balance on all 43. A write-off or credit
  note (none so far) would keep an invoice waiting.
  Until then each payment card waits in Payment received with *Not linked yet — part paid, ₹x of ₹y received, ₹z still due*,
  and the invoice shows *Part paid · Overdue/Due…*. Then **all its payments flag together**; one merge (invoice → newest
  payment, button *Merge Invoice → Payment Received (n payments)*) folds every other payment of that invoice into the same card
  (computed, not events — reverting the one merge separates them). The card shows the total and *n payments*; the modal's
  Payment section says *Received ₹… + TDS ₹… in n payments · Show all PRs* (small window: each PR with its TDS, received of
  total, *Paid in full* or ₹… still due).
  A merge made while part paid waits (*Not applied yet*) and applies by itself once fully paid.
- **Merge view**: one panel per phase; quotations newest first with a **NEW** tag; a quotation and PI only ever show as a
  referenced pair (the PI panel hides when no PI cites the selected quote; clicking either chip switches its partner).
- **Training**: unflagged quote/PI can be scheduled; once dated: **Change date** (a correction, earlier or later — event `mode: "change"`, label unchanged, log "Training date changed from … to …") / **Postpone** / **To be decided** / **Training completed** (both boards); merged PI pops *Ready for training*. **Several days** per training
  (`DaysPicker.tsx`: click days one by one, drag or Shift-click for a range; shown as "3–6 Oct, 12 Oct 2026").
  Needs ≥1 **trainer** (Shikha Dixit, Ashish Dalal, Sumit A Shah, or **External trainer** — any typed name; names used
  before on any card come back as suggestions, derived from the change log). A trainer can't be on two trainings on one day. Scheduled / Postponed / To be decided; green border,
  red for TBD. A quote can be scheduled directly but **Training completed is locked until its PI exists** (*PI required* note,
  *PI needed* on the card) — completions recorded on a quote are ignored. **Past dates are temporarily allowed**
  (`ALLOW_PAST_TRAINING_DATES = true` in CardModal.tsx — turn off when the owner says the back-fill is done).
- **Invoices / payments** show their payment status: blue *Due in N days*, red *Overdue by N days*, **yellow *Part paid · …***, green *Paid*; border to match.
- **Deal lost**: quotations declined in Zoho move here for good (note links to the quote in Zoho).
- **Potential training**: **+** opens a Leads-style modal (search Zoho customers, optional **month or exact date**). Acts like a lead:
  flagged by a new quotation (dated on/after it was added); *Choose & merge* lists all the customer's quotations in the column; merging
  from a potential card only asks for the quotation (no PI step). Survives Clear logs.
- **Notes** (above Merged): the board's own warnings (PI missing, Deal lost, Not linked yet), then the team's notes — *+ Add a
  note* / *All notes* window, author can remove (`add_note` events). Notes typed on a lead or quote carry over when it's merged.
- **Delete** a document card → hidden, customer back in Leads. Leads can't be deleted.
- **Clear logs** (Admin only, PIN): Everything / One customer / One deal cycle.
- **Filter** (next to *Show deleted*, both boards; `DateFilter.tsx`): one or several months, or a from–to range. Each card is
  matched on the date it shows — training days once scheduled, else quote/PI/invoice/payment date, expected date (Potential),
  created date (Leads). Not saved; header counts follow the filter.

### AedSmartx Training board
**Invoices sent → Training scheduled → Training completed → Training not required**
- Who: **Priyanka** and **Arti** see only this board; **Sumit, Shikha, Ashish and Admin** switch with *Switch to AedSmartx Training Board* /
  *Switch to Training Follow ups* (next to Sync now). Everyone else: training board.
- Cards = invoices from **1 Sept 2026** (`AED_SINCE`) with an item whose Item Identifier is **All AEDs**, excluding the AED trainers
  and *AED Rental* (`AED_EXCLUDED`). "Philips FRX AED 861304 with Child Key" is one AED with the child key included.
- Modal: Customer; Contact (number = invoice **ship-to phone**, else the customer's numbers); Notes (clickable invoice, latest note,
  *+ Add a note* / *All notes* window — any AED-board user, author can remove); IDs & dates incl. sales person (no payment row);
  **Training** (delivery strip, then *Schedule training* with date **and time**, no trainer; *Training not required*; later Postpone /
  To be decided / Training completed); **Item description** (model, year, serials + total with a mismatch warning, battery & pads
  expiry, five extras ticked from the description or separate items: SmartX, Fast Response Kit, wall cabinet, 3D signage,
  infant/child key); **Mark for resale** (this invoice / whole customer is a Reseller → Training not required, now and later).
- **Delivered**: only **Arti** (and **Admin**) can mark/undo. **Admin can do everything** (both boards, delivery, remove any note, Clear logs). Not delivered → yellow border + *Not delivered yet*; delivered → green + *Ready for
  Scheduling* (replaces the paid/due chip on AED cards). Green **R n** next to a column name shows only ready cards.

### Layout preferences (see also §8)
Columns side by side as a sliding window (as many as fit at ≥184 px with full names; ◀ ▶, arrow keys, swipe); board fits the screen
with a 16 px margin; no page or modal scrolling at the owner's 1728×958; hidden scrollbars; sidebar can hide to a rail.

---

## 5. Every prompt the owner sent, and what it did

### Session 1 (24–30 Sept 2026) — building the Follow-ups pipeline
| # | Prompt (paraphrased) | Result |
|---|---|---|
| 1 | "run this locally" | `npm install`, `npm run dev`. |
| 2 | Pasted Zoho + MongoDB values | `.env.local` created. |
| 3 | Follow-ups schema: LEADS … PAYMENT RECEIVED | Asked 3 questions (one row per engagement, leads in-app, PI = sales orders); first table version. |
| 4 | "act as Google's front-end developer, leads are the clients" | Kanban board. |
| 5–7 | No horizontal scroll; keep columns; leads = all active Zoho customers, paginate | 7-column grid, leads from Zoho. |
| 8 | "what is this 8254 / 12359" | Duplicate-lead bug fixed (deterministic ids, dedupe). |
| 9–10 | Check active customer count / status | Vendor leak found later (#15). |
| 11–12 | Column-specific scrolling, no scrollbars | Independent column scroll; `.no-scrollbar`. |
| 13–14 | "run it locally", "push it to github" | Commit `5f25573`. |
| 15 | Phase 1+2 spec (members, one modal, change log + revert, aliases, tagged contacts, F flag, merge/unmerge) | Built; vendor filter fix. Commit `ab28adb`. |
| 16 | Phase 3: PIs, Lead→Quote→PI merge, modal redesign, Zoho-removal notices, last 2 fiscal years, fit screen | Built. |
| 17 | Link only via reference IDs; customer boxes; Flagged toggle | Built. |
| 18 | Phase 4: schedule training, ready popup, postpone/TBD, colours | Built. |
| 19 | "clear all the logs" | 26 events deleted after confirmation. |
| 20–24 | Postpone rules; schedule from quotations; Notes/Merged on left; "PI not applicable" wording; no inner scroll | Built. |
| 25 | Delete → back to Leads; full reset + resync; PI-missing note | Done (3939 customers = 3939 leads). |
| 26–27 | Invoice phase; Payment received phase | Built (`/invoices/{id}/payments`). |
| 28 | "bundle my prompts… full handoff" | First HANDOFF.md. Phases 3–7 committed as `a45b991`. |

### Session 2 (30 Sept – 5 Oct 2026) — new columns, sign-in, AedSmartx board, sync redesign, going live
| # | Prompt (paraphrased) | Result / commit |
|---|---|---|
| 29 | "Read HANDOFF.md first", "run it" | Summary; dev server. |
| 30 | ◀ ▶ triangles to move the board; **Deal lost** column for declined quotations | 8th column; sliding window. |
| 31 | Deal lost note: "declined in Zoho Books. Please click <quote no.>…" | Done. |
| 32 | **Clear logs** button left of the name pill, locked by a PIN | Server-checked PIN, archive to `cardEventsArchive`. |
| 33 | LAN sharing link | `http://192.168.1.69:3000` (already allowed in `next.config.ts`). |
| 34 | Select **trainers** (Shikha, Ashish, Sumit) when scheduling; no double-booking a date | Trainer picker + busy check. |
| 35 | Invoice → Payment shouldn't merge before training completed (sagealpha) | Step-by-step rule; out-of-order merges ignored. |
| 36 | Allow merging straight through to Payment received | *Merge PI → Invoice → Payment Received*. |
| 37 | Hide sidebar with X; **Potential training** column; fit any device ("enterprise grade") | Rail sidebar; 9 columns; responsive window, keys, swipe. |
| 38 | "bottom is not visible, fit to screen" | 16 px bottom margin everywhere. |
| 39 | "push it to github" | `59512cc` (first attempt blocked: a PIN had been written into HANDOFF.md — removed). |
| 40 | Potential training: **+** to add a customer (search Zoho customers, vague date), merges like a lead | Built. |
| 41 | Lock *Training completed* until a PI exists; remove "PI not applicable" | Built. |
| 42 | When merging a potential lead, show all the customer's quotes to choose from | *Choose & merge*. |
| 43 | "only the option to select quotation is enough" (no PI step) + "then push" | Built; `21208ce`. |
| 44 | "run the server" | Dev server. |
| 45 | **PINs** for Shikha, Ashish, Sumit and Admin (values given in chat — never stored in files) | Hashed PINs, Admin sign-in, admin-gated new members. |
| 46 | Stay signed in until sign out; only Admin clears logs — all / one customer / one cycle | Session token; scoped Clear logs. |
| 47 | **NEW** tag on the newest quote in the merge view | Done. |
| 48 | Quote and PI must only show as a pair (owner asked me to restate my understanding twice, then "go ahead") | Pairing by reference. |
| 49 | Show invoice due status like Zoho (overdue red / due blue / paid green), border to match, payment date in modal | Built. |
| 50 | "push it to github" | `69fffdb`. |
| 51 | "local sharing link" | LAN link. |
| 52 | Temporarily allow **old training dates** to back-fill data; push | `ALLOW_PAST_TRAINING_DATES`; `ef54af8`. |
| 53 | "run this, my colleague wants to see on LAN", "run it locally" | Dev server + LAN link. |
| 54 | **AedSmartx Training board** for Priyanka (AED invoices by Item Identifier *All AEDs*, ship-to phone, item description parsing, extras, schedule date+time, Training not required, Sumit's switch) — correction mid-way: "only this fiscal year (from 1 Apr 2026)" | Built; parser tested on 45 real descriptions. |
| 55 | Child-key composite = one AED; exclude trainers + AED Rental; fix squeezed "Add" button; *Customer is a Reseller* | Built. |
| 56 | Mark the whole customer **or** a single invoice for resale | Two tick-boxes. |
| 57 | Remove the slide buttons on the AED board → "revert it" | Removed, then restored. |
| 58 | "whenever I refresh, I can't scroll or click" (AED board) | Bug: column offset went negative after refresh → columns `inert`; clamped at 0. |
| 59 | AED invoices from **this September** | `AED_SINCE` = 1 Sept 2026. |
| 60 | **Delivered** option (only **Arti Sirohi**, who gets the AED board); green *Ready for Scheduling* / yellow *Not delivered yet*; green **R** toggle | Built. |
| 61 | "push it to github", "run the server" | `d73b5c4`. |
| 62 | "in what format is the data saved?" (thinking of going live) | Explained: Zoho data fetched live (then), team actions as small change events in Mongo; showed real records. |
| 63 | Potential training: allow an **exact date**, not just a month; push | Month / Exact date toggle; `a7e86f2`. |
| 64 | "best approach for serverless / Zoho budget — act as a senior engineer" | Recommended: lock APIs, Zoho copy in Mongo + one shared sync + budget, sync only changes. |
| 65 | "go with the recommended plan" | Built all three; outputs identical to before; incremental sync = 4 calls. |
| 66 | One **global sign-in** when opening the site; Dashboard is the landing page; requires PIN | Full-page sign-in. |
| 67 | Sign-out / switch available on all pages | Name pill on every page. |
| 68 | Sync Zoho **every hour, 9 am–7 pm**, Mongo updated right after, only changes (asked my understanding; answered: **no Sunday**, last sync **7 pm**) | Hourly slots Mon–Sat; full checks 9 am & 2 pm. |
| 69 | "push it to github" | `89daa16`. |
| 70 | Priyanka can **add notes** on AED cards | Notes window; latest note on the card. |
| 71 | "make it live" — chose **Vercel**, and **fix the who-made-the-change gap first** | Server-stamped change log (tested on a throwaway DB); `vercel.json` cron; `025e1aa`. |
| 72 | "is it up to date on github?" | Yes (`025e1aa`). |
| 73 | Asked for a `CRON_SECRET` string; MongoDB Atlas "what do I do here?"; "we haven't set up a database" | Gave a random secret; walked through IP access; found the app uses **Cluster0**, not the owner's "Directory" cluster; a colleague added `0.0.0.0/0`. |
| 74 | Shared the live URL | Verified read-only: pages, DB, 401s, signed-in counts, cron secret. |
| 75 | "write a handoff for next session, include my prompts and what changes they made" | This file. |

### Session 3 (5 Oct 2026)
| # | Prompt (paraphrased) | Result |
|---|---|---|
| 76 | Read HANDOFF.md, summarise | Summary. |
| 77 | Training dates: pick several days (range or scattered) in one picker; **External trainer** with typed names + suggestions next time; **Filter** button by Show deleted with a date filter (range, a month, or several months) | Built; verified headless with saves blocked. |
| 78 | "push to github" | `d68e636`. |
| 79 | Notes on training-board cards, above Merged, like the AedSmartx ones | Shared `NotesPanel` (both boards); notes follow merges; latest note on one line, Unmerge moved into the Merged header so the modal still fits. |
| 80 | "push it to github" | `9b091e2`. |
| 81 | Give Shikha Dixit access to the AedSmartx board | Shikha gets the board switch, like Sumit and Admin (`canSwitchBoards`). |

### Session 3, day 2 (6 Oct 2026)
| # | Prompt (paraphrased) | Result |
|---|---|---|
| 82 | "Zoho sync stopped since yesterday 3 pm — find the underlying issue; auto sync every hour; manual Sync now in the left panel above Appearance with Last sync / Next sync; Admin can do everything; Shikha and Ashish get the AedSmartx board too" | Found: last success Mon 3 pm → next only Tue 9:19 am; automatic syncs relied on `after()` from page visits plus one daily Vercel cron, and failures were silent. Fixed: heartbeat runs due syncs inside the request, GitHub Actions hourly (needs `CRON_SECRET` repo secret), failures logged + 502 from the cron route, token reuse/401 handling; sidebar SyncPanel; Admin = delivery + remove any note; Ashish/Shikha switch boards. |
| 83 | "just push all to github" | `737a021`. |
| 84 | "Payment received #1923 came yesterday but wasn't pulled" (invoice 2026-01-428, Heartstream) | Cause: payments were read only for invoices with status paid / partially_paid, but Zoho calls a part-paid invoice **overdue** once past due (₹6,194 of ₹1,74,951 still open). Now: any training invoice with `payment_made > 0`; due chip says *Part paid* from the amounts. #1923 pulled into the copy. |
| 85 | Instalments: an invoice passes only when fully paid ("only when the whole payment sum matches"); then it merges with all its payment receiveds (n of them); modal "click to show all PRs" | Built (see Instalments in §4); tested on synthetic data (part paid / fully paid / merged / reverted / early merge) and on real Heartstream + Diana Builwell cards with saves blocked. |
| 86 | Colours: due blue, overdue red, part paid yellow, paid green | `DueTone` "part" → yellow border + chip. |
| 87 | "Change date" option next to Postpone / To be decided / Training completed (training can happen earlier) — "make it for both dashboards" | Both boards; a changed date keeps its Scheduled/Postponed label. |

---

## 6. Zoho facts learned the hard way
- `contact_type=customer&filter_by=Status.Active` **also returns vendors** → filter rows (`isCustomer`).
- Customer Type = `cf_type`, Sector = `cf_sector`; item category = `cf_item_identifier` (*Training Services*, *All AEDs*, …).
- Sales orders = the org's PIs. Quote contacts: `contact_persons_details`; SO contacts: `contact_person_details`.
- PI `reference_number` = quotation number; invoice `reference_number` = PI number.
- The OAuth token has **no customer-payments scope**; `GET /invoices/{id}/payments` works.
- Lists accept `sort_column=last_modified_time&sort_order=D` (estimates, salesorders, invoices, contacts) — the incremental sync relies on it.
- A **part-paid invoice past its due date has status `overdue`**, not `partially_paid` — use `payment_made` / `balance`, not status.
- Invoice detail has `due_date`, `total`, `balance`, `shipping_address.phone` (ship-to; blank on ~1 in 9 AED invoices).
- AED details are free text in the line description, written many ways (see `aedParse.ts` comments).
- Limits: ~100 calls/min per org + a plan-dependent daily allowance (set `ZOHO_DAILY_LIMIT` to the real figure).
- Counts on 5 Oct 2026: 3,958 customers, 81 quotations (+1 declined), 44 PIs, 49 invoices, 47 payments, 16 AED invoices since 1 Sept.

---

## 7. MongoDB `thinkhealth_dashboard` (Cluster0)
Team data: `cardEvents` (live change log), `cardEventsArchive` (cleared logs), `members`, `memberPins` (hashed), `entries`,
`followUps`, `announcements`, `removedTriggers`. Zoho copy: `zohoDocs`, `zohoCustomers`, `zohoPayments`, `kv`.
Legacy: `leads` (4,105 docs, unused since session 1) — drop only with the owner's OK. History: `cardEvents` was cleared by
request in session 1 (twice) and by Shikha once in session 2; Admin/Shikha may clear again (archive keeps copies).

---

## 8. Owner's standing preferences
- Board: columns side by side as a sliding window; no horizontal page scroll; fits the screen; hidden scrollbars.
- Modals: wide, **no inner scrolling** at 1728×958 (measure `scrollHeight - clientHeight` after any modal change), background locked.
- Short wording on cards. The owner writes specs in bursts with screenshots; for ambiguous or structural asks they sometimes
  say "tell me what you understood first" — restate, then build after their go-ahead.
- Push / run only when asked; the owner often asks "push it" and "run it locally" as separate steps.

---

## 9. How to verify without touching team data
No test suite. Pattern used throughout:
1. Headless Chrome via `puppeteer-core@23` (scratch folder) at **1728×958**; intercept and **abort `POST /api/store`** so nothing is saved.
2. Signing in: real PIN sign-in via `/api/members/sign-in`, or a **stand-in session** — put `{member:{id:"admin",name:"Priyanka"},token}`
   (admin token) in `localStorage th.session`; the session route turns it into the cookie. Role checks use the member *name*.
3. For anything that must write (e.g. server stamping), run a second server against a **throwaway database**:
   `npx next build` then `MONGODB_DB=thinkhealth_qa npx next start -p 3001`, seed, test, **drop the DB**, stop the server.
4. Data-route changes: save the route outputs first and compare record by record afterwards.
5. Afterwards confirm the shared `cardEvents` has no test entries. For Zoho probing reuse the cached token in Mongo `kv`
   (`zoho_access_token`) — read-only calls only. Fixtures: sagealpha, Checkmate Security, The Ritz Carlton, Mewar Hotels,
   Synopsys `2026-01-385` (AED), Usha Fire Safety (reseller), Medybiz Pharma (3 AED invoices).
6. Live site checks: read-only (`/api/members`, 401s, signed-in GETs, cron "not due").

---

## 10. Open items / known gaps
1. **Temporary**: `ALLOW_PAST_TRAINING_DATES = true` — set to `false` when the owner confirms the back-fill is done.
2. `ZOHO_DAILY_LIMIT` is 2500 (cautious default) — replace with the Zoho plan's real allowance in Vercel and `.env.local`.
3. Potential training's date is stored "for notifications/alerts later" — reminders are not built yet.
4. No "change my PIN" screen; Admin resets PINs via `POST /api/members/pin`. Session tokens don't expire (sign out, or change
   `SESSION_SECRET` to sign everyone out).
5. Nothing is written back to Zoho (dates, merges, notes live only in the dashboard).
6. ~~Invoices paid in instalments~~ — done (see Instalments in §4).
7. Legacy follow-up tasks (`src/lib/followups.ts`) still feed the ticker and the sidebar badge; untouched.
8. Unused Mongo `leads` collection can be dropped with permission.
9. Optional: custom domain (Vercel → Settings → Domains); the office LAN dev server is no longer needed once the team uses the live site.
10. The `/api/store` GET returns the whole team dataset to any signed-in member (fine for this team; revisit if outside users are added).
