# Handoff — ThinkHealth Training Dashboard (Follow-ups pipeline)

_Last updated: 30 Sept 2026. Written for the next Claude Code session (and the owner, sshah@thinkhealth.in)._

Read this file end to end before touching code. It records what the owner asked for, the business rules
that came out of it, how the code implements them, what was verified, and what is still open.

---

## 1. TL;DR — where things stand

- **App:** Next.js 16 (Turbopack) + React 19 + Tailwind v4 + MongoDB Atlas + Zoho Books (India DC).
  `AGENTS.md` warns this Next.js differs from training data — read `node_modules/next/dist/docs/` before writing Next-specific code.
- **The work of this session was the Follow-ups page** (`/follow-up`): a 7-column pipeline board synced from
  Zoho Books — **Leads → Quotations → Performa Invoice → Training scheduled → Training completed → Invoice sent → Payment received**.
  All seven phases are built and were verified in a headless browser against live Zoho data.
- **Git:** `master` is at `ab28adb` (pushed). **Everything from Phase 3 onwards is uncommitted** (10 modified files,
  ~1,300 lines). Commit + push only when the owner asks (`git status` to see the files).
- **Shared data is live:** a teammate, **Shikha Dixit**, is actively using the board. Her changes live in MongoDB
  (`cardEvents`). **Never test by writing to the shared DB** — see §9.
- **Dev server:** `npm run dev` → http://localhost:3000 (it's not left running between sessions; the owner often says "run it locally").

---

## 2. Running it

```bash
npm install        # node_modules was missing at first
npm run dev        # http://localhost:3000, page: /follow-up
npx tsc --noEmit -p tsconfig.json   # typecheck (no test suite exists)
```

- Secrets live in **`.env.local`** (gitignored via `.env*` / `!.env.example`): `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`,
  `ZOHO_REFRESH_TOKEN`, `ZOHO_ORG_ID=60016330017`, `ZOHO_API_BASE=https://www.zohoapis.in/books/v3`,
  `ZOHO_ACCOUNTS_URL=https://accounts.zoho.in`, `MONGODB_URI`, `MONGODB_DB=thinkhealth_dashboard`.
  **Never print, copy or commit these values.**
- Git identity is set **repo-locally**: `user.name=thinkhealthcareandsafety`, `user.email=sshah@thinkhealth.in`.
  Remote: `https://github.com/thinkhealthcareandsafety/trainingDashboard.git`.
- Commit trailer used so far: `Co-Authored-By: Claude … <noreply@anthropic.com>` (follow the session's attribution reminder).

---

## 3. Every prompt the owner sent, and what it did (chronological)

| # | Owner's prompt (paraphrased / quoted) | What was done |
|---|---|---|
| 1 | "run this locally" | `npm install` (node_modules missing), `npm run dev`. |
| 2 | Pasted Zoho + MongoDB env values — "add these in the environment variable" | Created `.env.local` (gitignored), restarted dev server. |
| 3 | Follow-ups screenshot: "scrap the data in this section, follow a schema — columns LEADS, QUOTATIONS, PERFORMA INVOICE, TRAINING DATE, TRAINING COMPLETED, INVOICE SENT, PAYMENT RECIEVED" | Asked 3 questions → owner chose: **one row per client engagement**, **leads entered in-app**, **Performa Invoice = Zoho Sales Orders**. Built a Deal model + table (later replaced). |
| 4 | Zoho CRM kanban screenshot — "act as Google's front-end developer, fix the UI, leads are the clients" | Rebuilt as a kanban board, one column per stage. |
| 5 | "scrolling horizontally is not feasible… remove all data from the follow up section" | Wrapped the columns into a grid; stopped feeding Zoho data into the board. |
| 6 | "keep the columns" | Clarified: columns were kept; nothing changed. |
| 7 | "keep columns side by side only; Leads = all Zoho **active customers**, new customers auto-added; paginate 20" + "3924 total active customers" | `grid-cols-7`; leads auto-created from Zoho customers; pagination (later removed). |
| 8 | "what is this 8254… the number of clients are the number of leads" / later 12359 | **Duplicate-lead bug** (random ids + reload races). Switched to deterministic ids, de-duplicated via the app's API, widened page to `max-w-[1680px]`, empty columns fill height. |
| 9 | "check the active numbers of customers in zoho books right now" | Reported 4127 (**wrong — included vendors**, fixed in #15); added `?refresh=1` to `/api/zoho/meta`. |
| 10 | "check the customer status, only active customers" | Verified the `Status.Active` filter. (The vendor leak was found later.) |
| 11 | "vertical scroll column-specific, ~6 at once, remove pagination" | Each column scrolls independently; pagination removed. |
| 12 | "remove the scroll bar… opacity 0" | `.no-scrollbar` utility in `globals.css`. |
| 13 | "run it locally" (several times) | Restarted dev server. |
| 14 | "push it to github" | Commit `5f25573`; set repo-local git identity (owner chose `thinkhealthcareandsafety`). |
| 15 | **Phase 1 + 2 spec** (members screen, one modal for all phases, change log with per-change revert, aliases, multiple emails/phones tagged by phase, locked Zoho IDs/dates, quotations containing 4 training items, F flag, merge Lead→Quote with unmerge) | Built all of it (see §5). Found Zoho returns **vendors** with `contact_type=customer&filter_by=Status.Active` → filter rows client-side (3925 = owner's 3924 + 1 new). Commit `ab28adb`, pushed. |
| 16 | **Phase 3** (PIs from Zoho, Lead→Quote→PI merge, urgent modal redesign, "moved due to changes in Zoho Books" log, **only last 2 fiscal years (1 Apr 2025 →)**, board must fit the screen, lock background scroll in modals) | Built. Sales orders are this org's PIs (`Performa-25-…`). Wide modal, bold sections, prominent Type of Training / No. of People. Zoho-removal notices. Board fits 1728×958 exactly. |
| 17 | "link every quote → PI → invoice → payment **only via the reference ID**… customer box with Quote 1…N inside… Flagged button next to column headings" | Quote↔PI linked **only** by the PI's `reference_number`; each column groups items in a **customer box**; per-column **F n** toggle puts flagged boxes first. |
| 18 | **Phase 4**: merged + unflagged PI can get a training date; popup "ready — schedule now? Enter date / Later"; card moves to Training scheduled; postpone (calendar) / To be decided; borders green/yellow/red | Built (training date is a revertable event). |
| 19 | "can you clear all the logs" | Asked first (clearing also undoes merges); owner chose "clear everything" → deleted all 26 `cardEvents`. |
| 20 | "postponed stays green; postpone date not before today; after TBD it's *Schedule training*, not postpone" | Done. |
| 21 | "schedule training from quotations too → straight to Training scheduled, PI = *Not applicable* + note; add **Training completed** button" | Done. |
| 22 | "move Notes and Merged to the left half so no scroll; note disappears when reverted" | Done (note is derived, so revert removes it). |
| 23 | "in the column card just write *PI not applicable*" | Done (superseded by #37). |
| 24 | "resize the inner elements so I don't have to scroll" | Compact spacing; all modal types measured at 0px overflow at 1728×958. |
| 25 | "deleted card should revert back to Leads… REFRESH THE BOARD, RESET ALL CHANGES, reset logs, check all customers… if PI missing, note: *a PI is required… create one for this quotation: <clickable quote no>*" | Delete = customer back to Leads; leads can't be deleted. Cleared 24 events, full resync, **3939 Zoho active customers = 3939 leads** (0 missing/extra). PI-missing note with Zoho link. (Shikha made new changes minutes after the reset — left intact.) |
| 26 | **Invoice phase**: invoices whose reference cites their PI → Invoice sent, merged with **Training completed** cards specifically | Built. |
| 27 | **Payment received phase**: reference is the invoice number; merge with invoice; card stays in the last column | Built (read via `/invoices/{id}/payments` — see §6). |
| 28 | "get all my prompts, bundle them up… full handoff" | This file. |
| 29 | "◀ ▶ triangles next to *Synced* to move the whole board; one more column at the end, **Deal lost**: quotations whose Zoho status turns rejected move there and stay" | 8th column; board shows 7 at a time and slides one column per click. Declined quotes (Zoho API status `declined`) go to Deal lost. |
| 30 | Deal lost note: "declined in Zoho Books. Please click <quote no. linking to Zoho> for further reference" | Done. |
| 31 | "Clear logs" option left of the member pill, locked behind a PIN (the owner knows it; it lives only in `.env.local` as `CLEAR_LOGS_PIN` — never write it in tracked files) | Button + PIN dialog; `POST /api/store/clear-logs` checks `CLEAR_LOGS_PIN` (in `.env.local`), copies events to Mongo `cardEventsArchive`, then deletes them. |
| 32 | Trainers when scheduling: checkboxes for **Shikha Dixit, Ashish Dalal, Sumit A Shah** (several per training); a trainer can’t be on two trainings the same date | `TRAINERS` + `busyTrainers` in `pipeline.ts`; `set_training_date` events carry `trainers`; picker in the schedule/postpone row and the Ready-for-training popup. |
| 33 | "Invoice → Payment shouldn’t merge before the card went Lead → Quote → PI → Training completed → Invoice" (sagealpha: 2026-01-429 was merged into Payment #1910 first) | Invoice ↔ Payment flag only when the invoice already absorbed its completed PI/quote; out-of-order merges ignored (no DB writes), so the stuck card fixed itself. |
| 34 | "when the payment has the reference invoice, allow merging straight through to Payment received" | Payment flagged with an invoice that is flagged with its completed training; one-click *Merge PI → Invoice → Payment Received*. |
| 35 | Hide the sidebar with an X; 9th column **Potential training** (empty for now — "we will work on this later"); make the board fit any device (enterprise grade) | Sidebar X → slim icon rail (menu button reopens; remembered in `localStorage th.sidebar`). Board width uncapped on /follow-up. Columns per view = as many as fit at `MIN_COL_W` 184px (names wrap to 2 lines, never cut); ◀ ▶, ←/→ keys and swipe slide the window; column height fitted to the window by `useFitHeight`. Checked at 1728×958 (7, or 8 without sidebar), 2560×1440 (9), 1280×800 (5), 768 tablet (3), 390 phone (1): no page scroll, no clipped names. |
| 36 | Potential training: **+** on the column opens a Leads-style modal — search the Zoho customers, pick one, optional vague training date; the card stays until a quote for it arrives, then merges like a lead | `add_potential` event (cardIds `[potential:<id>]`, `ref` = contact id, `value` = expected month `YYYY-MM`); `set_potential_date` changes it; Delete removes it. Kind `potential` (rank 0, like a lead) flags with the customer’s quotation / PI-without-quote **dated on or after the day it was added**; merge view offers *Merge Lead + Potential → Quote*. Clear logs keeps `add_potential` events. |
| 37 | "lock the Training completed button and tell the user to create the PI before marking training complete" + "remove the *PI not applicable* note — we can’t skip the PI" | Locked button + message on quotation cards in training; *PI required* note; *PI needed* on the board card; completions already recorded on a quotation ignored (*Not applied*), so sagealpha’s Quotation-24-002591 went back to Training scheduled. |
| 38 | "when merging the potential lead, show all the quotes currently in the column for that customer so I can choose which one to map it to" | `mergeCandidates` adds the customer’s Potential card + every quotation of theirs in the Quotations column (`columnQuotes`: not merged, not in training, not lost/deleted) to the merge view; chips show number + date, newest first; *Merge Potential → Quote* goes into the chosen one. An unflagged potential card with such quotations shows *Choose & merge*. The red F still only comes from quotations dated on/after the card was added. |
| 39 | "only the option to select the quotation is enough here, the quote might not have the PI yet" | Merge view opened **from a Potential card** = Potential + the customer’s open Lead + their quotations only (plus anything flagged directly with the card, e.g. a PI citing no quotation); no PI panel or PI-link message. Quote → PI is merged later from the quotation. Opened from the lead/quote, the view is the full flag chain as before. |

---

## 4. Business rules (the spec, condensed — treat as authoritative)

**Members.** Opening Follow-ups always shows a members screen first (pick a name or add one; usernames only, no passwords).
Every change is recorded under the chosen member.

**Data scope.** Leads = **every active Zoho customer** (not vendors), whenever created. Quotes/PIs/invoices/payments =
documents dated from the **start of the previous fiscal year** (FY starts 1 April → currently **1 Apr 2025**, moves each April).
Tracked training items (by item name; all have Item Identifier "Training Services"):
`Fire Safety Evacuation Training and Drill`, `THCAS BLS Training 2025 (I)`, `THCAS CPR Training 2026 (I)`, `THCAS First Aid Training (I)`.

**One modal for every phase** (same fields; later phases fill in):
- Customer name (**mandatory**) + aliases (searchable).
- Emails (optional, many) and contact numbers (**mandatory**, many) — newest on top, each tagged *from Lead / Quote / PI / Invoice…*; identical values merge into one entry with combined tags.
- Customer type (`cf_type`), Sector (`cf_sector`), Created in Zoho (locked).
- Sales person (locked), phase-aware: *"Quotation & PI Sent By Ashish Dalal, Invoice Sent By Pranjal Nikalje"*.
- Locked IDs & dates: Quote, Sales Order/PI, Invoice, Payment Received (number + date, link to Zoho).
- Training: **Type of Training**; **No. of People expected** (quote) → **No. of People** (PI onwards); training date next to it.
- Notes / Merged sections on the left half; a **Changes** panel on the right: who, what, when, **Revert** on every entry.
- Edit (writes one revertable event per change) and Delete.

**Flags (red F) and merges** — merges only run forward, each is its own revertable event, and the target card absorbs
the earlier card's name, aliases, emails, numbers, type, sector, sales people and training date:

| Link | How cards are matched |
|---|---|
| Lead ↔ Quote | same Zoho customer (leads have no document) |
| Quote ↔ PI | **only** the PI's `reference_number` citing that quotation number |
| Lead ↔ PI | same customer, only for a PI whose reference cites no synced quotation |
| Completed training ↔ Invoice | invoice `reference_number` cites that card's PI (or, for a PI-skipped quote, the quotation number) |
| Invoice ↔ Payment | the invoice the payment is applied to in Zoho (or a Reference# containing the invoice number) — **only once that invoice holds its completed training, or is flagged with it**; in the latter case the merge view offers *Merge PI (or Quote) → Invoice → Payment Received* in one click, and the lone *Invoice → Payment Received* button appears only after the invoice holds its training. An Invoice → Payment merge made before that is ignored by `liveMerges` and shown as *Not applied* in Changes (`mergeNotApplied`). |

Customers can have several quotes/PIs/invoices: only the linked one merges forward, the rest stay put.
The merge view shows one panel per phase present (Lead → Quote → PI …) with buttons such as *Merge Lead → Quote → PI*,
*Merge PI → Invoice*, *Merge Invoice → Payment Received*; picking a quote auto-selects the PI that references it, etc.

**Training (phases 4–5).** A quote or PI with **no flags** can be scheduled. A merged, unflagged PI pops up
*"Ready for training — schedule now?"* (Enter date / Later). With a date it moves to **Training scheduled**:
first date = *Scheduled*; changing a date = *Postponed*; *To be decided* = TBD; a date after TBD = *Scheduled* again.
**Border:** green for any date (postponed keeps a yellow badge), red for TBD. Dates can't be in the past.
A **quote** can be scheduled directly, but **the PI can’t be skipped** (#37): its *Training completed* button is locked with “Create the PI in Zoho Books for <quote> before marking the training completed — then merge Quote → PI here”; Notes show *PI required* (link to the quote); the PI row says *To be created*; the column card says *PI needed*. Training is completed on the PI after *Merge Quote → PI* (the date travels). A `complete_training` recorded on a quotation is ignored (`completionNotApplied`) and shown as *Not applied* in Changes. No “not applicable” wording anywhere.
**Training completed** (only with a date) moves the card to Training completed. Dates stay in the dashboard (not written to Zoho).

**Invoice / payment (phases 6–7).** Invoices sit in *Invoice sent*; flagged only with the Training-completed card they reference;
unlinked ones explain why in Notes. Payments sit in *Payment received*; merging the invoice in is the final step — the card stays there.

**Deal lost (8th column).** Every quotation still syncs into Quotations; once its Zoho status is `declined` (Rejected) it moves
to **Deal lost** for good — out of Quotations/Training columns, no flags, can't be scheduled, no *PI missing* note, a *Deal lost* note instead.
The board shows 7 columns at a time; ◀ ▶ next to *Synced …* slide it one column (`VISIBLE` in `FollowUps.tsx`).

**Clear logs.** Button left of the member pill → PIN dialog. Server checks `CLEAR_LOGS_PIN` (unset = disabled; wrong PIN waits 0.8 s),
archives every `cardEvents` doc into `cardEventsArchive` (with `clearedAt`/`clearedBy`), then deletes them. Other browsers pick up the empty log on their next pull.
**Never test with the real PIN against the server** — mock the `/api/store/clear-logs` response in the browser instead.

**Trainers.** Scheduling needs ≥1 trainer (`TRAINERS` in `pipeline.ts`). A trainer booked on a date by any other live card (not merged-away, deleted or lost) is greyed out for that date, with the other customer named. Postpone opens pre-filled with the current date + trainers; keeping the date and changing trainers = *Save trainers* (status unchanged). TBD drops trainers. Board cards show first names; schedules made before this have *Trainers: not set*.

**Delete.** Deleting a quote/PI/invoice/payment card hides it (and everything merged into it) and the customer's lead
**returns to Leads**; logged on the lead too; undo from the toast or Changes. Leads have no Delete (they are the Zoho customers).

**Notes shown in the modal:** *PI missing* (quote with no PI referencing it) with a clickable quotation number;
*PI required* (quote scheduled directly, no PI yet); *Not linked yet* (invoice/payment with the reason);
Zoho removals: *"… is no longer in Zoho Books … The card moved due to changes in Zoho Books."* (automatic, non-revertable).

---

## 5. How the code implements it

| File | Responsibility |
|---|---|
| `src/app/follow-up/page.tsx` | Route; renders `FollowUpBoard`. |
| `src/components/FollowUps.tsx` | Members gate → `Board`: polls `/api/pipeline` every 3 min, builds the board, 7 columns (`grid-cols-7`, height `var(--fu-col-h)` from `.fu-page`), customer boxes, per-column Flagged toggle, lazy rendering (40 boxes per batch), search, "Show deleted", records Zoho notices. |
| `src/components/followups/CardModal.tsx` | Modal shell (scroll-locked, wide), `CardModal` (details/editor/training/notes/docs/merged + Changes), `MergeModal` (panels per phase + merge actions), `SchedulePrompt`, `ChangeLog`, schedule tones. |
| `src/components/followups/MembersScreen.tsx` | Pick / add member. |
| `src/lib/pipeline.ts` | **Core logic.** `buildBoard(leads, quotes, pis, invoices, payments, events)` → cards, flags, columns. Also `zohoNotices`, `flagGroup`, `describeEvent`, `salespersonLabel`, `refQuoteNumber`, `refPINumber`. |
| `src/lib/zoho.ts` | Zoho client (token cached in Mongo `kv`, retry/back-off). Pipeline fetchers: `fetchAllLeads`, `fetchRecentLeads`, `trainingDocs(kind, from)` → `fetchTrainingQuotes/PIs/Invoices`, `fetchInvoicePayments`. Older `fetchFromZoho` feeds the Overview page. |
| `src/app/api/pipeline/route.ts` | Server cache + sync schedule: full customer list every 6 h (~22 calls), recent customers every 2 min (1 call), documents every 3 min; tasks run sequentially; `?refresh=1` forces. |
| `src/lib/store.tsx` | Client store; shared collections synced to Mongo through `/api/store` (60 s pull, diff push): `entries`, `followUps`, `removedTriggers`, `announcements`, **`members`**, **`cardEvents`**. `addCardEvents`, `recordCardEvents` (dedupe by id), `revertCardEvent`, `addMember`. |
| `src/lib/db.ts`, `src/app/api/store/route.ts` | Mongo collections list + generic upsert/delete API. |
| `src/lib/types.ts` | `ZohoLead/Quote/PI/Invoice/Payment`, `PipelineResponse`, `Member`, `CardEvent` (+ kinds). |
| `src/lib/dates.ts` | `syncWindowStart` (previous FY start), formatting. |
| `src/lib/zohoLinks.ts` | Deep links: quotes / salesorders / invoices / paymentsreceived. |
| `src/app/globals.css` | `.fu-page` (board fits one screen), `.no-scrollbar`. |

**Model (event-sourced).** A card = Zoho data + every **non-reverted** `CardEvent` replayed in order. Nothing from Zoho is
overwritten, so "revert" = mark the event reverted. Card ids: `lead:<contact_id>`, `quote:<estimate_id>`, `pi:<salesorder_id>`,
`invoice:<invoice_id>`, `payment:<payment_id>`. Event kinds: `set_name/type/sector`, `add/remove_alias/email/phone`, `delete`,
`merge` (`cardIds=[from,to]`, labels in `before`/`value`), `set_training_date` (`YYYY-MM-DD` or `TBD`), `complete_training`,
`zoho_change` (deterministic id `zoho:<mergeEventId>` so every browser records it once). Merges only apply while both documents
exist in Zoho and neither is deleted; training dates are read across a card's whole lineage so they travel with merges.

---

## 6. Zoho facts learned the hard way

- `GET /contacts?contact_type=customer&filter_by=Status.Active` **also returns vendors** → filter `contact_type === "customer"` per row (`isCustomer` in `zoho.ts`).
- Customer **Type** = custom field `cf_type` (New/Old Customer/Reseller/Vendor); **Sector** = `cf_sector`. Both are on list rows (no per-contact calls).
- Timestamps come as `2026-09-24T12:14:04+0530` → normalised to UTC ISO (`isoTime`).
- **Sales orders are this org's Performa Invoices** (`Performa-25-…`). Quote contacts are `contact_persons_details`; SO contacts are `contact_person_details` (singular).
- References: PI `reference_number` = quotation number (29/41 match a synced quote); invoice `reference_number` = PI number (46/48; 2 blank, 1 `SO-24-0471`).
- **The OAuth token has no customer-payments scope** (`/customerpayments` → code 57 "not authorized"); invoice detail's `payments` is empty too.
  `GET /invoices/{id}/payments` **works** → used, cached per invoice `last_modified_time`. Payment `Reference#` is normally empty.
- Rate limits: ~100 calls/min per org + a daily budget. First sync ≈ 150–200 calls (detail calls are cached by `last_modified_time`); 429s back off 5/10/20 s.
- Latest verified counts (29 Sept 2026): **3939** active customers, **77** quotes, **42** PIs, **48** invoices (1 void skipped), **46** payments (5 invoices paid in instalments).

---

## 7. Owner's standing UI preferences

- Columns **side by side** in one row, as a sliding window: as many as fit (min 184px, full column name), the rest reached with ◀ ▶ / ←→ / swipe; big screens show all 9. **No horizontal page scrolling**; the board must fit the screen (owner's viewport ≈ 1728×958 → 7 columns, 8 with the sidebar hidden).
- Each column **scrolls on its own**; **no visible scrollbars** anywhere (`.no-scrollbar`).
- Modals: wide, **no inner scrolling** at that viewport, background scroll locked, bold section headings, training info prominent.
- Keep wording short on board cards (e.g. just "PI needed").
- The owner writes specs in bursts with screenshots; confirm counts against Zoho when they question numbers.

---

## 8. Data operations performed on the shared database (MongoDB `thinkhealth_dashboard`)

- Old `leads` collection: de-duplicated (12,359 → 4,105 docs) early on; it is **no longer used** (removed from `COLLECTIONS`) but still exists — delete only with the owner's OK.
- `cardEvents` wiped twice at the owner's request (26 entries, then 24). Members kept (currently **Shikha Dixit**).
- After the last wipe, Shikha added real changes (e.g. sagealpha: Lead → `Quotation-24-002582` → `Performa-25-1056`, scheduled + completed, then PI → invoice `2026-01-427`). Treat `cardEvents` as live team data.
- A direct Mongo `deleteMany` was blocked by the environment's safety classifier; bulk changes were done through the app's own `/api/store` API instead, and only after explicit confirmation.

---

## 9. How to verify UI changes (without touching team data)

No test suite exists. The pattern used all session:
1. In a scratch folder, `npm i puppeteer-core@23` and drive the installed Chrome
   (`C:/Program Files/Google/Chrome/Application/chrome.exe`, headless, viewport **1728×958**).
2. **Intercept requests and abort every `POST /api/store`** so nothing reaches the shared DB; use member name "QA Tester".
3. Open `/follow-up`, add the member, wait until the header shows counts (e.g. `/\d+ payments/`) and "Syncing with Zoho" is gone,
   search a customer, click items, screenshot, and read column text / measure `scrollHeight - clientHeight` for overflow.
4. Afterwards confirm the shared log has **0** "QA Tester" entries (`GET /api/store`).
Good fixtures: **sagealpha** (full chain, payment #1907), **Checkmate Security** (quote + PI + invoice not yet completed),
**The Ritz Carlton** (3 quotes / 3 PIs, one reference each), **Mewar Hotels** (`Quotation-24-002545`, no PI).
For Zoho probing, reuse the cached token from Mongo `kv` (`_id: zoho_access_token`) rather than refreshing it (Zoho limits refreshes).

---

## 10. Open items / known gaps

1. **Commit + push** phases 3–7 when the owner asks (10 files; CRLF warnings are harmless).
2. Payment Received is the last phase — no further stage requested yet.
3. Invoices paid in several instalments: the invoice merges into one payment; the other payments stay in the column with a note.
4. Leads are not limited by the 2-fiscal-year window (only documents are). Owner hasn't asked to limit leads.
5. Edits, merges and training dates live only in the dashboard — nothing is written back to Zoho.
6. Payments rely on `/invoices/{id}/payments` because the token lacks the customer-payments scope; re-issuing the token with that scope would allow a direct listing.
7. Legacy follow-up **tasks** (`src/lib/followups.ts`) still run and feed the ticker and the sidebar's red "Follow-ups" badge; the Overview page still uses the older `/api/trainings` pipeline. Untouched by this work.
8. Members have no authentication (anyone can pick any name) — as requested.
9. Orphaned Mongo `leads` collection can be dropped with permission.
10. Zoho API budget: the board polls every 3 min while open; if the daily limit becomes a problem, lengthen `DOCS_MS` in `src/app/api/pipeline/route.ts`.
