# Handoff — ThinkHealth Training Dashboard

_Last updated: 6 Oct 2026, end of session 3. Written for the next Claude Code session (and the owner, sshah@thinkhealth.in)._

Read this end to end before touching code. It records what the owner asked for (every prompt, all three sessions), the
business rules that came out of it, how the code works **now**, what was verified, and what is still open.

---

## 1. Where things stand

- **The app is LIVE: https://training-dashboard-xfwl.vercel.app** (Vercel, since 5 Oct 2026). Vercel redeploys
  **every push to `master`** — so a push is a production release for the whole team. Only push when the owner asks.
- **GitHub:** `thinkhealthcareandsafety/trainingDashboard`, branch `master`, last pushed commit `42c1046` (6 Oct).
  This final HANDOFF.md update may still be uncommitted — check `git status`.
- **After every release** the team must press **Ctrl + Shift + R** once: the app is a single-page app, so an open tab keeps the
  old code until a full reload (this is why "confetti works for me but not for others" happened).
- **Zoho sync** was broken from Mon 5 Oct 3 pm to Tue 9:19 am (automatic syncs depended on page visits + one daily cron, and
  failures were silent). Fixed in session 3 (§3 "Zoho copy + sync"); verified the live site synced on its own at 10:00:17.
- **Database:** MongoDB Atlas cluster **Cluster0** (the cluster in `MONGODB_URI`), database `thinkhealth_dashboard`
  (free tier, ~1% used). It is **not** the "Directory" cluster the owner sees in their own Atlas project — Cluster0 sits
  in another project/account; a colleague added `0.0.0.0/0` to its IP access list for Vercel.
- **Stack:** Next.js **16.3** (Turbopack) + React 19 + Tailwind v4 + MongoDB + Zoho Books (India DC).
  `AGENTS.md`: this Next.js differs from training data — read `node_modules/next/dist/docs/` before Next-specific code.
- **People using it (real, live data):** Shikha Dixit, Ashish Dalal, Sumit A Shah (training board), **Priyanka**
  (AedSmartx trainer), **Arti Sirohi** (AED deliveries), **Shreya** (certificates — Fulfillment board), and **Admin** (the
  owner). Their changes live in MongoDB `cardEvents` — **never write test data to the shared database** (see §9).
- **Four boards** on `/follow-up`, picked with the **Board** switch (Training · AedSmartx · Fulfillment · Logistics): the
  **Training follow-ups** board (9 columns), the **AedSmartx Training** board (4), the **Fulfillment** board (5) and the
  **Logistics** board (6, session 4). Access (`boardsFor` in FollowUps.tsx): Priyanka → AedSmartx only; Arti → Logistics
  only; Shreya → Fulfillment only; Ashish → Training + AedSmartx; Sumit, Shikha, Admin → all four; anyone else → Training.
  (The owner will send fuller per-person permissions later.) Plus the Dashboard (`/`) and Calendar pages.

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
  so the run fails and GitHub emails the repo owner. **The owner was asked to add this secret — not confirmed done** (no `gh` CLI
  here; check the repo's Actions tab). Until then, syncing still happens whenever anyone has the site open (heartbeat).
- Dependencies added in session 3: `canvas-confetti` (+ `@types/canvas-confetti`). `npm audit` flags **Next.js 16.3 (critical)**
  and `source-map-js` (high) — pre-existing, not fixed (upgrading Next is a separate, careful job).

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
- **Sync log** (session 4): every sync writes one entry to Mongo `zohoSyncLog` (TTL 90 days): start, duration, trigger
  (`heartbeat` + whose page / `scheduler` + source / `page` / `manual` + who / `first`), full or quick, Zoho calls, result
  (ok / failed / paused), error, and what changed (document numbers + customer + new/updated/removed, payment invoice numbers,
  customer names). `/api/cron/sync` also logs calls that found nothing due (`not due` / `busy`), so you can see whether a
  scheduler is calling at all. Source = `?source=github` (the workflow sends it) or Vercel's `vercel-cron` user agent.
  UI: sidebar **Sync log** (also rail + phone header icons) → `src/components/SyncLog.tsx`: one row per hour 9 am–7 pm per day
  (◀ ▶), *On time* (≤10 min) / *Late · n min* / *Missed* / *Failed*, click a sync for its changes. API `GET /api/zoho/sync-log?day=`.

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
`aedcustomer:<contact id>` (customer-wide AED log), `fulfil:<pi or quote card id>` (Fulfillment board). Event kinds:
`set_name/type/sector`, `add/remove_alias/email/phone`, `delete`, `merge` (`[from,to]`), `set_training_date` (`YYYY-MM-DD`,
several days comma-separated `2026-10-05,2026-10-06`, `YYYY-MM-DDTHH:mm` on AED, or `TBD`; carries `trainers` (may include
external names), optional `mode: "change"` (Change date — not a postponement) and `underName` (alias the training is under)),
`complete_training`, `zoho_change`, `add_potential` / `set_potential_date`, `set_not_required`, `set_reseller`, `set_resale`,
`set_delivered`, `add_note`, `set_fulfillment` (stage), `set_wip` (on/off). **Clear logs** archives to `cardEventsArchive` first
and keeps `add_potential` events. Instalment folding (an invoice's other payments joining its merged payment) is computed, not an event.

### Key files
| File | Role |
|---|---|
| `src/lib/zohoSync.ts` | Mongo copy, schedule, lock, budget, incremental/full sync; `pipelineData` / `aedData` / `trainingsData` / `metaData` builders. |
| `src/lib/zoho.ts` | Zoho client (token cached in Mongo `kv`, call counter, retries), list/detail building blocks, pure mappers, `QUOTE_TRAINING_ITEMS`, `AED_EXCLUDED`. |
| `src/lib/pipeline.ts` | Board logic: `buildBoard` (training), `buildAedBoard`, `buildFulfillmentBoard`, flags, merges (incl. instalment folding, `receivedOn` / `sumMatches`), schedules (`trainingDays`, `fmtDays`), `dueStatus`, `describeEvent`, `mergeCandidates`, trainers (`externalTrainers`, `busyTrainers`), potential cards, role helpers (`isAedTrainer`, `isAedDelivery`, `isFulfilmentUser`). |
| `src/lib/aedParse.ts` | Reads the AED line description: model, year, serials, battery/pads expiry; the five extras. |
| `src/lib/confetti.ts` | `celebrate()` (Custom Shapes, Training completed) and `fireworks()` (Certificates Generated); loads `canvas-confetti` on demand. |
| `src/components/FollowUps.tsx` | Board page: column window (◀ ▶ / keys / swipe, fit to screen), columns + customer boxes, F / R toggles, Clear logs, **Board** switch (`boardsFor`), card borders per board. |
| `src/components/followups/CardModal.tsx` | Training card modal, merge view, schedule (dates, trainers, Name), Potential add modal, shared modal pieces (exported: sections, `NotesPanel`, `PaymentsLink`, `Shell`, `Header`, `ChangeLog`…). |
| `src/components/followups/DaysPicker.tsx` / `DateFilter.tsx` | Multi-day calendar picker / the board's date Filter. |
| `src/components/followups/FulfillmentModal.tsx` | Fulfillment card modal (step choices under Notes, "Also send to Logistics?" popup, the training card's sections). |
| `src/components/followups/AedModal.tsx` | AedSmartx card modal (delivery, schedule date+time, notes, item description, resale; `canMarkDelivered`, `isDeliveryOnly`). |
| `src/components/followups/MembersScreen.tsx` | Sign-in card (names, PIN, Admin, + Add new member). |
| `src/components/AppShell.tsx` | Shell, sidebar (hide to rail), global sign-in gate, `MemberPill`, `PageHeader`, **SyncPanel** (`useZohoSync`: heartbeat, Sync now, Last / Next sync). |
| `src/lib/store.tsx` / `src/app/api/store/route.ts` | Shared team data (pull 60 s, diff push; `ZOHO_SYNCED` event) / server stamping. |
| `src/lib/auth.ts`, `src/lib/pins.ts`, `src/lib/session.tsx`, `src/app/api/members/*` | Sign-in, PINs, cookie, session. |
| `src/app/api/{pipeline,aed,trainings,zoho/meta,zoho/sync,cron/sync,store/clear-logs}/route.ts` | API routes (`zoho/sync`: GET heartbeat, POST Sync now). |
| `.github/workflows/zoho-sync.yml` | Hourly GitHub Actions call to `/api/cron/sync` (needs the `CRON_SECRET` repo secret). |

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
- **Training**: unflagged quote/PI can be scheduled — with dates, trainers and the **Name** it is under (*Same as original*, an alias, or *+ Add alias…*, which also adds the alias to the card; event `underName`; shown as *Under name: …* below No. of People only for an alias); once dated: **Change date** (a correction, earlier or later — event `mode: "change"`, label unchanged, log "Training date changed from … to …") / **Postpone** / **To be decided** / **Training completed** (both boards); merged PI pops *Ready for training*. **Several days** per training
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
  note* / *All notes* window, author (or Admin) can remove (`add_note` events). Notes typed on a lead or quote carry over when
  it's merged. An empty Notes section says *No notes yet* on its title line (one row, all boards).
- **Celebrations**: *Training completed* (training + AedSmartx boards) fires Magic UI's **Custom Shapes** confetti from the button;
  *Certificates Generated* (Fulfillment) fires **Fireworks** (~4 s). Both show even when Windows animation effects are off
  (the owner asked to override reduced motion).
- **Delete** a document card → hidden, customer back in Leads. Leads can't be deleted.
- **Clear logs** (Admin only, PIN): Everything / One customer / One deal cycle.
- **Filter** (next to *Show deleted*, both boards; `DateFilter.tsx`): one or several months, or a from–to range. Each card is
  matched on the date it shows — training days once scheduled, else quote/PI/invoice/payment date, expected date (Potential),
  created date (Leads). Not saved; header counts follow the filter.

### Fulfillment board (Shreya — certificates)
**Training Completed → Process on hold → List Received → Certificates Generated → Sent to Logistics**
- Built from the training board (`buildFulfillmentBoard`): **every training marked completed** — still in Training completed,
  or since merged on into an invoice / payment (payment status doesn't matter) — as a one-to-one copy of that card, incl. the
  *Under name* alias (shown on the card and in the Training box). Card id `fulfil:<pi card id>` (or the quote's, if the PI was
  skipped), so it stays put as the deal moves on. On 6 Oct: 4 cards (Mementos, Paccar, Classic Citi, Heartstream).
- Moved from the card (`FulfillmentModal.tsx`), **under Notes, only the current step's choices**:
  Training Completed → ☐ *Awaiting List of Participants* (→ Process on hold) or ☐ *List of Names Received* (shortcut → List
  Received); Process on hold → *Waiting for List* + ☐ *List of Names Received*; List Received → ☐ *Work in Progress* (toggle,
  event `set_wip` on/off) + *Certificates Generated* → popup **"Also send to Logistics?"** (*Yes* → Sent to Logistics, *Let me
  decide* → Certificates Generated); Certificates Generated → *Send to Logistics*. Event `set_fulfillment` (value completed /
  hold / received / generated / logistics, before = previous); every move has Undo and can be reverted in Changes. No Back button.
- Borders: Training Completed plain; Process on hold green + "Waiting for List"; List Received yellow, green once Work in
  progress; Certificates Generated / Sent to Logistics green. The Payment section sits in whichever column is shorter.
- Order: every column by **training date, latest first** (multi-day = last day), then customer name.
- History: the first version (6 Oct, from Payment received, 4 other columns) had one move by Admin (`fulfil:<invoice id>`,
  "thanked") — those ids no longer exist, so it no longer applies.

### Logistics board (Arti) — `src/lib/logistics.ts`, `src/components/followups/LogisticsModal.tsx`
**AED Delivered Status → Sent to Logistics → Payment Received → Packages → Shipments → Received by Client**
- **AED Delivered Status**: every AED invoice since 1 Sept (the AedSmartx cards, same `set_delivered` mark — Priyanka sees it).
  Only *Mark as delivered* / *Undo delivered*; after marking, a popup offers **Hide card** (`logi_hide` on `aed:<id>`).
  **Unhide cards (n)** (board toolbar) shows hidden cards dimmed; open one → *Unhide* (= revert the hide). Yellow = not
  delivered, green = delivered, **blue = Priyanka moved it on** (scheduled / completed / not required) — the modal says
  *Moved by <name>* · where to. Its Changes panel shows only delivery, hide and notes. AED cards stop here.
- **Sent to Logistics**: Fulfillment cards at *Sent to Logistics*, labelled by PI; card id `logi:<pi or quote card id>`.
  **Flagged** with its payment card once that exists → *Merge & move to Payment Received* (event `logi_merge`, cardIds
  `[logi:<doc>, logipay:<payment card id>]`). Otherwise *Waiting for payment — …* (part paid / not paid / no invoice).
- **Payment Received**: only training-board payment cards **merged with their invoice** (so paid in full; instalments are one
  card — checked again with payments + TDS = total). Matched to certificates by the PI in the payment's merge chain. Not merged
  yet: flagged with its STL card, or *Waiting for Certificates* (with the Fulfillment stage). Merged card modal: training,
  alias, people, **Ship to** (invoice `shipping_address`, new `ZohoInvoice.shipTo` / `shipPhone`), payment(s), documents; above
  Merged: ☐ *Ready for Packaging?* + *Confirm* (greyed until ticked) → Packages.
- **Packages**: *Packaging in Process* (green) / *On hold* (yellow) / *Ready to Dispatch* (→ Shipments).
- **Shipments**: *Dispatched* (green) / *On hold* (yellow) + *Confirm* (greyed until a choice). Opening a Dispatched card asks
  **"Has the shipment reached the client?"** — *Yes* → Received by Client, green, **confetti** (`confettiPop`); or an
  *expected date* → Received by Client, yellow, *Expected <date>*; opening it asks again; *Reached* button → green + confetti.
- Steps are `set_logistics` events on `logi:<doc>` (values packages, pack_process, pack_hold, shipments, ship_dispatched,
  ship_hold, `expected:YYYY-MM-DD`, received). **Undo runs forward**: reverting a step (or the merge) also reverts every later
  step of that card; reverting *delivered* also unhides (`CASCADE` in `store.tsx`). If Shreya moves certificates back or a
  payment is unmerged on the training board, the merge simply stops applying (nothing is reverted across boards).
- Columns ordered by training date, latest first. Notes on logistics cards are their own plus the training card's.

### AedSmartx Training board
**Invoices sent → Training scheduled → Training completed → Training not required**
- Who: **Priyanka** sees only this board; **Sumit, Shikha, Ashish and Admin** open it with the **Board** switch. Arti now
  marks deliveries from the Logistics board. Everyone else: training board.
- Cards = invoices from **1 Sept 2026** (`AED_SINCE`) with an item whose Item Identifier is **All AEDs**, excluding the AED trainers
  and *AED Rental* (`AED_EXCLUDED`). "Philips FRX AED 861304 with Child Key" is one AED with the child key included.
- Modal: Customer; Contact (number = invoice **ship-to phone**, else the customer's numbers); Notes (clickable invoice, latest note,
  *+ Add a note* / *All notes* window — any AED-board user, author can remove); IDs & dates incl. sales person (no payment row);
  **Training** (delivery strip, then *Schedule training* with date **and time**, no trainer; *Training not required*; later Postpone /
  To be decided / Training completed); **Item description** (model, year, serials + total with a mismatch warning, battery & pads
  expiry, five extras ticked from the description or separate items: SmartX, Fast Response Kit, wall cabinet, 3D signage,
  infant/child key); **Mark for resale** (this invoice / whole customer is a Reseller → Training not required, now and later).
- **Delivered**: **Arti, Shikha, Sumit, Ashish and Admin** can mark/undo (`canMarkDelivered`). **Schedule training is locked until the AED is delivered** (first schedule and from To be decided); *Training not required* stays available. **Arti only marks deliveries** (`isDeliveryOnly`): no scheduling, not-required or resale ticks — notes are fine. **Admin can do everything** (both boards, delivery, remove any note, Clear logs). Not delivered → yellow border + *Not delivered yet*; delivered → green + *Ready for
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

### Session 3, day 1 (5 Oct 2026)
| # | Prompt (paraphrased) | Result / commit |
|---|---|---|
| 76 | "Read HANDOFF.md first … don't write test data … don't push unless I ask; tell me where things stand" | Summary of the live state. |
| 77 | Training dates: pick **several days** in one picker (same day, a range or scattered days); **External trainer** option with any typed name, suggested next time; a **Filter** button next to *Show deleted* — date filter by range, one month or several months | `DaysPicker` (click / drag / Shift-click), external trainers from the change log, `DateFilter`; tested headless with saves blocked. |
| 78 | "push to github" | `d68e636`. |
| 79 | **Notes** on training-board cards, just above Merged, like the AedSmartx ones | Shared `NotesPanel`; notes follow merges; latest note on one line and Unmerge moved into the Merged header so the modal fits. |
| 80 | "push it to github" | `9b091e2`. |
| 81 | Give **Shikha** access to the AedSmartx board | Board switch for Shikha (pushed with #83). |

### Session 3, day 2 (6 Oct 2026)
| # | Prompt (paraphrased) | Result / commit |
|---|---|---|
| 82 | "Zoho sync stopped since yesterday 3 pm — find the underlying issue; auto sync every hour; manual sync button in the left panel above Appearance with **last sync / next sync**; let Admin do everything; give Shikha and Ashish the AedSmartx board" | Cause: automatic syncs relied on `after()` from page visits + one daily Vercel cron; failures were silent (last success Mon 3 pm → Tue 9:19 am; Monday 518 Zoho calls). Fix: heartbeat (`GET /api/zoho/sync`, sync runs inside the request), GitHub Actions hourly (needs `CRON_SECRET` secret), cron route 502 + logged failures, token reuse/401 retry; sidebar SyncPanel; Admin = mark delivered + remove any note; Ashish/Shikha board switch. Verified next day: live auto-sync at 10:00:17. |
| 83 | "just push all to github, I'll have the manual sync button anyway" | `737a021`. |
| 84 | "I just synced, check if anything got pulled" | Sync OK (9:48, 4 calls) — nothing changed in Zoho since 9:19. |
| 85 | "What about payment received no. 1923, why isn't it pulled?" (screenshot; "the invoice is 2026-01-428") | Heartstream paid ₹1,68,757 of ₹1,74,951; a part-paid invoice past due is `overdue` in Zoho, and payments were only read for paid / partially_paid → skipped. Fixed (`payment_made > 0`); #1923 pulled; *Part paid* chip. |
| 86 | "Doesn't that mean another payment received?" → instalments: show part payments, let the invoice pass only when fully paid, merge it with **all** its PRs (n of them), "click to show all PRs" | First built with Zoho's balance; then the owner said "pulled but not merged until the whole payment sum matches" → found 32 of 43 paid invoices carry **TDS** (`tax_amount_withheld`) → rule **payments + TDS = total** (matches Zoho on all 43). Instalment folding, *Show all PRs* window. |
| 87 | "push it to github" | `db7050c`. |
| 88 | Colours: due blue, overdue red, **part paid yellow**, paid green (screenshot) | `DueTone` "part". |
| 89 | **Change date** option (training can happen earlier), next to Postpone / To be decided / Training completed — "make it for both dashboards" | `mode: "change"` keeps the label; both boards. |
| 90 | "push it to github" | `9ea1eab` (with #88). |
| 91 | New user **Shreya**: a **Fulfillment board** (certificates) continuing from Payment received excluding part paid — Payments Done → Certificates Generated → Certificates Sent → Gratitude Email sent, moved by hand; Admin, Sumit, Shikha can open it; push | Built (42 cards then), Board switch for three boards; `2c82854`. Shreya already existed as a member. |
| 92 | "push to github" | Nothing new — already pushed. |
| 93 | When scheduling a merged PI: choose the **name** — alias (add alias) or same as original; show *Under name:* under No. of People when an alias | Name picker (popup + schedule row), new alias saved to the card, `underName`. |
| 94 | "push it to github" | `bfa490d`. |
| 95 | Fulfillment board reworked: **Training Completed** (every completed training, with alias) → **Process on hold** (☐ Awaiting List of Participants; green, "Waiting for List") → **List Received** (☐ List of Names Received; ☐ Work in Progress green, else yellow) → **Certificates Generated** (popup "Also send to Logistics?" Yes / Let me decide) → **Sent to Logistics** (Send to Logistics); choices under Notes, only the current step's; shortcut from step 1 straight to List Received. "Tell me what you understand first" → restated with 4 questions → "go ahead" | Built with the offered defaults: old columns removed; borders as above; *Under name* on cards; no Back button (Undo / revert). Full flow tested with saves blocked. |
| 96 | Pasted Magic UI's **Confetti** docs: "what is this about?" | Explained (shadcn/Magic UI component on `canvas-confetti`; not installed; needs shadcn Button). |
| 97 | Basic confetti when **Training completed** is clicked — training board and AedSmartx, same button | `canvas-confetti` + `src/lib/confetti.ts`; fixed bursting from the corner (button gone by the time the library loads → read its position at click time). |
| 98 | "run it locally so I can see" | Dev server already up: localhost:3000 and 192.168.1.69:3000 (warned it saves to the live DB). |
| 99 | "push it to github" | `cb60030` (Fulfillment rework + confetti). |
| 100 | "Confetti works for me but not on others' PCs — what refresh?"; AedSmartx: only **Arti, Shikha, Sumit, Ashish, Admin** mark delivered; schedule only **after** delivered; *Training not required* still allowed; **Arti can only mark** | Live build checked — had the code: others need Ctrl + Shift + R, or their Windows animations are off. Delivery/schedule rules built; tested per role (stand-in sessions). |
| 101 | "2. override it" (show confetti even with animations off) | Reduced-motion check removed; tested with it emulated. |
| 102 | "push to github" | `2106db5`. |
| 103 | Fulfillment board: default order by **training date** (screenshot) | Every column by training date, latest first. |
| 104 | "push it to github right away" | `53556c5`. |
| 105 | Confetti **fireworks** when *Certificates Generated* is clicked (screenshot) | `fireworks()` (Magic UI Fireworks, ~4 s, both sides). |
| 106 | "Custom Shapes — replace the confetti with this one" | *Training completed* uses Custom Shapes; fireworks unchanged. |
| 107 | "push to github" | `42c1046`. |
| 108 | "Write down all the things we did today in simple words for a message" | Team message (in chat, not a file). |
| 109 | "Write a handoff, include my prompts and outputs for next session" | This update of HANDOFF.md. |

### Session 4 (7 Oct 2026)
| # | Prompt (paraphrased) | Result / commit |
|---|---|---|
| 110 | "Read HANDOFF.md first … tell me where things stand" | Summary. |
| 111 | "Check if syncs are working properly, logs of syncs, data fetched at the correct sync time" | No sync history existed (only latest state + daily call count). Today's 9 am full check ran 9:00:01–9:00:50; Mongo copy compared record by record with live Zoho (82 quotes, 44 PIs, 70 invoices, 43 payment sets, newest 200 customers): **0 differences**. GitHub Actions: only 2 of ~20 scheduled runs fired on 6 Oct (one at 10:52 pm) and both skipped — **`CRON_SECRET` not set**. Repo is **public**. |
| 112 | "Sync logs are necessary; where is Secrets and variables?" | Sync log built (§3), tested on a throwaway DB (`thinkhealth_qa`, dropped). Secrets: repo → Settings tab → Security → Secrets and variables → Actions. |
| 113 | "push it to github" | `abd8b1b` (sync log live). |
| 114 | "How are partially paid payments handled in Payment received?" | Explained (§4 Instalments); live: only Heartstream 2026-01-428 part paid; 5 invoices paid in >1 payment. |
| 115 | New **Logistics** board for Arti (6 phases, merge STL ↔ fully paid payment by PI, Ready for Packaging → Packages → Shipments → Received by Client, confetti on reached, undo cascades forward). Restated with 5 questions; answers: Arti marks AED deliveries only on Logistics; permissions later; column "AED Delivered Status", blue + "Moved by Priyanka" when moved on, hideable; "Waiting for Certificates" cards shown; Reached → green + simple confetti | Built (§4 Logistics board); full flow, cascade, hide/unhide and role views tested on a throwaway copy of live data (dropped). Not pushed yet. |

---

## 6. Zoho facts learned the hard way
- `contact_type=customer&filter_by=Status.Active` **also returns vendors** → filter rows (`isCustomer`).
- Customer Type = `cf_type`, Sector = `cf_sector`; item category = `cf_item_identifier` (*Training Services*, *All AEDs*, …).
- Sales orders = the org's PIs. Quote contacts: `contact_persons_details`; SO contacts: `contact_person_details`.
- PI `reference_number` = quotation number; invoice `reference_number` = PI number.
- The OAuth token has **no customer-payments scope**; `GET /invoices/{id}/payments` works.
- Lists accept `sort_column=last_modified_time&sort_order=D` (estimates, salesorders, invoices, contacts) — the incremental sync relies on it.
- A **part-paid invoice past its due date has status `overdue`**, not `partially_paid` — use `payment_made` / `balance`, not status.
- **TDS**: each row of `/invoices/{id}/payments` has `tax_amount_withheld`; Zoho counts it toward the invoice, so
  payments + TDS = total for a fully paid invoice (32 of 43 paid training invoices had TDS on 6 Oct).
- `GET /customerpayments` → 401 code 57 "not authorized" (no scope); find a payment by its invoice instead.
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
- Push / run only when asked; the owner often asks "push it" and "run it locally" as separate steps. After a push, tell them the
  team needs **Ctrl + Shift + R** once to load it.
- For structural changes (e.g. the Fulfillment rework) they ask "tell me what you understand before making changes": restate as
  numbered steps, ask only the few real questions with a suggested default each, then build on "go ahead".
- They test with real cards and screenshots; when something "didn't come through", find the concrete cause in the data
  (e.g. #1923's `overdue` status, TDS) before changing rules — and check the real numbers before agreeing to a rule.
- They like small celebrations (confetti / fireworks) and plain-language summaries they can send to the team.
- Admin can do everything; members' roles go by name (Priyanka, Arti → AED; Shreya → Fulfillment; Sumit, Shikha → all boards).

---

## 9. How to verify without touching team data
No test suite. Pattern used throughout:
1. Headless Chrome via `puppeteer-core@23` (scratch folder) at **1728×958**; intercept and **abort `POST /api/store`** so nothing is saved.
2. Signing in: real PIN sign-in as Admin via `/api/members/sign-in` (read `ADMIN_PIN` from `.env.local` inside the script —
   never print it). To see **another member's view** (role checks use `member.id === "admin"` and the member *name*): put
   `{member:{id:"arti",name:"Arti Sirohi"},token:<admin token>}` in `localStorage th.session` **and intercept
   `POST /api/members/session`** to answer `{ok:true,memberId:"arti"}` — data still loads with the admin cookie, saves stay blocked.
   Remember `localStorage th.board` (training / aed / fulfil) picks the board.
3. For anything that must write (e.g. server stamping), run a second server against a **throwaway database**:
   `npx next build` then `MONGODB_DB=thinkhealth_qa npx next start -p 3001`, seed, test, **drop the DB**, stop the server.
4. Data-route changes: save the route outputs first and compare record by record afterwards.
5. Afterwards confirm the shared `cardEvents` has no test entries. For Zoho probing reuse the cached token in Mongo `kv`
   (`zoho_access_token`) — read-only calls only. Fixtures: sagealpha, Checkmate Security, The Ritz Carlton, Mewar Hotels,
   Synopsys `2026-01-385` (AED), Usha Fire Safety (reseller), Medybiz Pharma (3 AED invoices).
6. Live site checks: read-only (`/api/members`, 401s, signed-in GETs, cron "not due"). To confirm a release is live, fetch
   `/follow-up`, list its `_next/static/immutable/chunks/*.js` and grep them for a new string.
7. **Board logic on real data without a browser**: bundle `src/lib/pipeline.ts` with esbuild into the scratch folder
   (`npx esbuild src/lib/pipeline.ts --bundle --platform=node --format=cjs --outfile=<scratch>/pipeline.cjs`), then feed it
   the local server's `/api/pipeline` + `/api/store` GET output (read-only) or synthetic events — used for instalments,
   change date and the Fulfillment board.
8. Modal fit: measure `[role=dialog] .no-scrollbar.min-h-0.flex-1.overflow-y-auto` → `scrollHeight - clientHeight`
   (0, or 16 = only the bottom padding, is fine) on several real cards, including long merge chains and multi-day trainings.
9. Animations (confetti): screenshot frames ~100–300 ms after the click; a `body > canvas` with z-index 9999 means it fired.

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
11. **`CRON_SECRET` GitHub Actions secret** — confirmed missing on 7 Oct (runs skip with a warning). Repo page → **Settings**
    tab → Security → Secrets and variables → Actions. Even then GitHub's schedule is unreliable (2 of ~20 runs fired on 6 Oct);
    consider an external hourly caller (e.g. cron-job.org → `/api/cron/sync?source=cron-job.org` with the Bearer header).
    The Sync log shows which schedulers actually call.
12. **`npm audit`**: Next.js 16.3 flagged **critical**, `source-map-js` high — pre-existing; plan a careful Next upgrade
    (read `node_modules/next/dist/docs/` first, rebuild, re-test every board).
13. Fulfillment board shows only trainings someone marked **Training completed** on the dashboard (4–5 cards on 6 Oct); older
    paid trainings never marked completed don't appear. If the owner wants them, mark them completed on the training board
    (past dates are allowed) or add a start-date rule.
14. Role rules are client-side only (board access, who marks delivered, Arti delivery-only) — the server stamps who did what
    but doesn't refuse an event by role. Fine for this team; tighten in `/api/store` if needed.
15. The GitHub repo is **public** (anyone can read the code; Actions minutes are free). Decide whether it should be private.
16. The Overview page (`/`) is 131 px wider than a 390 px phone screen (pre-existing; Follow-ups and Calendar fit).
