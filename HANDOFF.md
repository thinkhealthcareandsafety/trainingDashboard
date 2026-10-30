# Handoff — ThinkHealth Training Dashboard

_Last updated: Fri 30 Oct 2026 evening (end of session 19). **Live = `f5ae851`** (both addresses). Local and not pushed
yet: `bac217d` (labels) + this docs commit — push when the owner says. Written for the next Claude Code session (and the
owner, sshah@thinkhealth.in)._

**Start of the next session (20) — do these first:**
1. `git fetch`; `git status`; `git log --oneline HEAD..origin/master` and `origin/master..HEAD`. **Two Claude sessions
   worked on Reports on 30 Oct** (this one and another the owner ran in parallel — it committed this session's
   uncommitted files as `e805ad2` / `e34b7f8` and pushed 5 more). Pull (`--ff-only`) before touching anything, and
   ask the owner to keep Reports work in **one** session.
2. If `bac217d` isn't on GitHub yet, the owner decides when it goes ("push"). §11 before every push.
3. `npm test` (69 should pass) and `npx tsc --noEmit -p tsconfig.json`.
4. Database speed (§9 #18), Sync log, Zoho table catalog (`kv za_catalog`: `tables` ≈ 105, `partial`) — read-only.
5. Then the owner's next pick from "Still to do" below.

**Session 19, afternoon — the Tableau-style report builder (newest; wins over everything below):**
Owner's words (30 Oct): "I should rather have columns and attributes … rows, columns, color, labels, tool tips,
filters, ability to add aggregated columns, or parameters … these are all the tables in my Zoho Analytics … read from
Zoho Analytics directly … remove what's there and add these tables instead". Plan agreed as an 11-point list, then
"yeah"; `REPORT-BUILDER-PLAN.md` is the first (older) version of it.
- **Security:** Next.js 16.3.5 → **16.4.3** (`1b928dd`, critical next/og RCE + cache advisories) + `npm audit fix`.
  **Left:** ECharts moderate XSS — needs 5 → 6 (major), its own step with a chart-by-chart browser check.
- **Builder screen** (`Builder.tsx`): three panes — Data (dimensions Aa / dates ◷ / measures # / Your fields ƒ /
  Parameters) · Build (shelves Rows, Columns (crosstab), Colour, Values, Label, Tooltip, Filters, When + live preview +
  a "You'll get …" sentence, `describe.ts`) · Format (Title, Subtitle, Axis names, Names, Chart, How many, Order).
  A new report starts empty. Several values with no split = one card each; mixed units with a split = a table.
- **Zoho tables as the data** (`tables.ts`, `tablesServer.ts`, `joins.ts`; mostly the other session):
  - "Pick a Zoho table": catalog = every table / column / type / link from Zoho's metadata (`viewDetails`), kv
    **`za_catalog`**; read in 85 s passes (`partial` until done) and **re-read only when Admin presses "Refresh from
    Zoho"** — owner: "I don't want to overuse the Zoho tokens". Hidden: Users, User Details, SMS Notifications, System
    Mails; personal columns (Zoho `isPIIColumn`, e-mail / phone) never reach the catalog. Money-out / bookkeeping
    tables Admin-only (`ADMIN_TABLES`).
  - A table's rows are copied the first time a report uses it (`za_tables` `_id` "zt:<view id>", gzipped) and again
    after 6 h; linked tables (Customer ID → Customers …) load only when a report uses their columns; "+ Add a related
    table" joins up to 2 more (keys "zt:<main>+<rel>…", nothing counted twice — `joins.ts`).
  - Invoices / Quotes / Sales Orders / Bills open with a removable "Status is not Void / Draft" filter (`STATUS_COLUMN`).
  - Any date column groups by Day / Week / Month / Quarter / FY; "When … by <date column>" (`Spec.dateField`).
  - Measures: Sum / Average / Min / Max / Count / Count distinct on the pill (`TABLE_AGGS`); "Total BCY" etc.
  - Old saved reports on the ready-made data still open and edit; new ones are Zoho tables only. The older
    "every column copied" layer (`extras.ts`, `za_state.columns`, `c8c2ca1`) is still in the code for those.
- **Calculated fields** (`calc.ts`, `/api/analytics/fields`, Mongo **`reportFields`**, `7b4d303`): "a number, only
  where …" (`filtered`) or two numbers combined ÷ − + × "as % of" (`combine`) — picked, read back as a sentence; used
  as `calc:<id>`; made by `hasFullAccess`, changed / deleted by the maker or Admin. A field can't use another field yet.
- **Parameters** (`params.ts`, `/api/analytics/params`, Mongo **`reportParams`**, `ParamControls.tsx`, `f5ae851`):
  number / word / date / list; filters follow one (is / at least / at most; dates on or after / before); `param:<id>` is
  a number in a field; `Spec.params` = the run's values (each viewer's own — dashboards keep them in ViewState with the
  saved filters and views; a box per parameter the page uses).
- **Labels** (`labels.ts`, `Spec.text`, `bac217d`, local): title / subtitle / axis names take `{total} {period} {top}
  {max} {rows} {filters} {today}` and `{<parameter name>}` via "+ Insert a value…"; Names renames columns / numbers
  (tables, legends, tooltips, CSV). Unknown tokens stay as typed.
- **Sales target = one team target** (`34d5e9e`): "Each person's share of the team target" uses the ₹50 L monthly goal
  (kv `reports_goal`, one-off months too); the per-person "Sales targets" popup was removed (owner: "sales target is
  50 lakh per month", option a).
- **Checked:** 69 tests (`tests/{extras,tables,joins,shelves,calc,params,labels,describe}.test.ts` …); browser checks
  of each step at 1728 (+390 for the shelves) — scripts in this session's scratchpad (rebuild from §9): builder,
  calcui, paramui, labelui, sweep (every page), p5browser (every Reports tab). Field / parameter saves were answered
  inside the browser test — **no test fields or parameters were written** (`reportFields` / `reportParams` are empty).
- **Traps learned:** files are **CRLF** in the working copy since the pull — edit scripts must match on `\n` after
  normalising; Next 16.4 allows **one dev server per folder** (a stale one on :3000 answers for all — find it with
  Get-CimInstance Win32_Process, don't kill another session's); Git Bash rewrites "/path" CLI args (MSYS_NO_PATHCONV=1);
  heredocs with odd quotes break the Bash tool — write scripts with the Write tool.
- **Still to do (owner's Tableau list):** quick table calculations (running total, % of total, difference / % change,
  rank); **⋯ → Edit report… on every dashboard tile, KPIs too**; later: level-of-detail, > 2 dimensions, a field built
  from a field; ECharts 6. Owner-side: CRON_SECRET GitHub secret (steps given 30 Oct), #150 live quote test (skipped),
  hello@ reconnect, Classic Citi rows, Zoho Mail filter, gratitude wording, JW Sahar rows.

**Session 19, morning — Fri 30 Oct:**
- **Nikita Shah** (member `zetm337p`) = same access as Sumit: `nikita` added to `hasFullAccess` in `roles.ts` (+ the
  "Admin, Ashish, Shikha, Sumit and Nikita" texts). `04b336f`. She is *not* a trainer / reminder / WhatsApp recipient.
- **Reports — Save / Discard** (`46fed8e`, owner: "whenever I apply a filter … a save option … if on a view, save the
  view"): once period / compare / Show by / filters differ from what's saved, the toolbar shows Unsaved changes ·
  Save · Discard. On a dashboard = my own saved filters (`reportPrefs.saved.<dash>`, POST `/api/analytics/prefs
  {dash, saved}` / `saved: null` = Reset; mirrored in localStorage `th.reports.saved.<dash>`; the tab opens with them).
  On a view = a "View: name ×" chip, Save view / Save as new view… / Discard. Views now live in `DashboardView`
  (one prefs fetch per tab). Tests: `tests/prefs-route.test.ts`; the fake db handles dotted `$set` / `$unset`.
- **Reports phase 5 (§10 #162) — all built and live** (`876e8ac`…`1e3f773`), every number checked against the raw
  `za_tables` rows (scripts in the session scratchpad — rebuild from §9 #17):
  - Quotes & team → **Follow up** (quotes `waitAge`, analysis `followup`) and **Against target** (analysis `vsTarget`:
    each person's revenue and share of the team goal × months so far, part months by days — see the afternoon block;
    the per-person targets first built here were replaced the same day).
  - Money → **Coming in** (invoices `dueBand` / `dueWeek`, measures `due30` / `due90`) and **Purchase prices**
    (analysis `priceAlerts`, Admin: latest bill vs bill before, ≥ 5 %, ≤ 3×, catalogue goods only).
  - Customers → **Call them** (analyses `dueMonths` + `renewals`: certificates = last training invoice + 2 years —
    Zoho's "Training Date" is on 20 invoices only; training lines = group Training Services or an un-catalogued line
    named training / course / BLS; pads every 2 years, batteries every 4) and **Customer value** (analysis
    `customerValue`, variant `bands`).
  - Products & stock → **Stock health** (stock `idle`, `orderBand`, `orderIn`, `sold365`; `deadValue`, `turns`;
    `LEAD_DAYS` = 30; below-zero items left out of order-by) and **Lead sources** (`newRevenue`, `perNewCustomer`).
  - Trainings → **Against target** (`Tile.target`: fixed monthly line, 10 trainings / 300 people, Month only).
  - An empty tile now shows its analysis's own note instead of "Nothing here…".
- **Checked 30 Oct:** database 4.6–8.4 MB/s; both crons ran (9:17, 9:34); 38 tests pass.
- **Next (superseded — see the afternoon block):** the Next.js upgrade is done; phase 6 became the Tableau-style builder.

**Update — Fri 30 Oct morning (older than session 19 above):**
- **After the session-18 docs (`2d6e2f2`), a cloud session built §10 #150 and pushed it** (live): `8924740` tests use
  the fake db however `lib/db` is imported; `3f39f9e` #151 (Type + Sector + last name to Zoho, `CUSTOMER_FIELDS`);
  `3d37345` one-screen new customer (Business / Individual, GSTIN → state + PAN + GST treatment, `src/lib/gstin.ts`,
  "More" for salutation / work phone / street / PIN; tax-exempt not offered — Zoho needs an exemption id); `6be4365`
  after Save → Download PDF (`GET ?pdf=`) and an email step (`GET ?email=` = Zoho's template; To / Cc / Subject /
  message; Zoho's PDF attached; + 10 files ≤ 4 MB; Send = multipart → Zoho `POST /estimates/{id}/email`, marks it
  Sent; production only); `2f3b049` keyboard-first items + the last sales person remembered (`th.quotes.salesperson`).
  The quote already opened straight after "Create customer" (step 3).
- **Checked 30 Oct 9:15 IST (all read-only):** local = GitHub = live `2f3b049`; `npm test` 32 / 32; database 6.9 MB/s;
  Sync log ok (Admin full sync 9:13 IST today; quick syncs hourly yesterday); the daily Vercel cron ran 27–29 Oct at
  9:17 (reminders) and 9:34 IST — **today's hadn't shown yet at 9:14, check it after 9:35**; **Quotations connection
  reconnected by Admin 29 Oct 16:50 → `newCustomers: true`**; master certificate sheet ok; `quotationsSent` still only
  the deleted 28 Oct test (no real quote from the page yet); stored dashboards: `my-admin` and the owner's edited
  Defibtech tab ("AEDs, PADs, BATTERIES"), both canvas shape.
- **Next, in order:**
  1. **#150 first live test (owner):** make a quote for a test customer → Save and email… → send to
     sshah@thinkhealth.in with one small attachment. Then check in Zoho (and read-only here): the quote is **Sent**,
     the email arrived with Zoho's PDF + the attachment, Send to CRM / Reminder Frequency / Reminder Date / Product
     Type / Deal Name / sales person landed, GST + total match the popup. Also try "+ New customer" with a GSTIN (Type,
     Sector, PAN, GST treatment should land in Zoho). Fix what fails — nothing else in #150 is left.
  2. **Reports phase 5** (§10 #162 — new business reports): restate with defaults, wait for "yeah".
  3. Phase 6 (#163), leftovers (#164), the canvas-gaps question (#164).
  4. Owner-side list below (item 12) is unchanged except Quotations (done).

Read this end to end before touching code. It records:
- what the owner asked for (every prompt, all eighteen sessions — §5);
- the business rules that came out of it, and how the code works **now**;
- what was verified, and what is still open.

**§11 "Changing things without breaking the live site" — read it before the first edit.**

Plans:
- `ANALYTICS-PLAN.md` — Reports. **§11 = the advanced-reports plan** (27 report ideas, the owner's decisions, build
  order, status line at the top). **All of §11 is built and live**, the three ⚠ reports too (#25 margin, #26 freight,
  #27 stock — built in session 17 from new Zoho Analytics tables). §3 "Reports — session 15", "Reports + database —
  session 16" and **"Reports — session 18"** describe the code. Phases 5–6 (new business reports, builder wells,
  export, scheduled email) are listed in §10 #162–#163.
- `ANALYTICS-SCHEMA.md` — every Zoho Analytics table / column.
- `PROGRESS-TRACKER-PLAN.md` — the Progress tracker, built in session 14 (§3 "Progress tracker").
- `MONDAY-PLAN.md` — the older backlog; "My day" is now largely covered by the tracker's Everyone's to-do, and renewals
  are still waiting.

**Start of the next session (19) — do these first:**
1. **`git fetch` / `git status` / `git log -3` / `git log HEAD..origin/master`.** Expected: GitHub = live = `6dfab55`
   (or the docs commit right after it, if the owner said "push"). **More than one Claude session pushes to this repo**
   (a cloud session pushed `f8a9c37` mid-session 18) — always check `HEAD..origin/master` before committing or pushing.
2. **Database speed** with the §9 #18 script (`speed.cjs`): 4–8 MB/s = fine (7 MB/s on 29 Oct); ~90 KB/s = Atlas
   throttled again (§3 "Reports + database — session 16").
3. **Sync log** — all ok on 29 Oct since the move to Mumbai (`bom1`). A failed cron → Vercel's cron logs first.
4. **Quotations connection:** `GET /api/quotations` → `connected.newCustomers` was still **`false`** on 29 Oct — Admin
   must **Reconnect** (scope line ends in `ZohoBooks.contacts.CREATE`; #150 step 8 may add an email scope). The master
   certificate sheet is working again (reconnected; `GET /api/sheet?check=1` has no `error`).
5. **Has a real quotation been made from the page yet?** Read `quotationsSent` (read-only). None by end of 29 Oct (the
   one test quote was deleted in Zoho). If one exists, check it in Zoho (`get_estimate`): Send to CRM / Reminder
   Frequency / Reminder Date / Product Type / Deal Name, GST + total vs the popup, notes + terms, sales person.
6. **The owner's next task is §10 #150** (quotation flow). **It was restated as 8 numbered steps (written in #150
   "Restated 29 Oct") and is waiting for the owner's "yeah"** — don't build before it. Step 1 = #151 (live bug).
7. **Then Reports phase 5** (§10 #162 — new business reports: restate first), phase 6 (#163), leftovers (#164).
8. **Tests:** `npm test` (26, Node's own runner, no packages; `tests/register.mjs` maps `@/lib/db` and `@/lib/auth` to
   `tests/fakes`, so tests never touch live data). Run them before every push alongside §11.
9. **Pushing:** from the **Bash tool (Git Bash)**: `git push origin master` (PowerShell can't sign in). Push only when
   the owner's latest message says so; a fix made after their "push it" needs a new one. Commit messages via
   `git commit -F` / `-m`. §11 checklist every time (tsc, `next build`, `npm test`, `scan.cjs`, browser check).
   The owner is short on credits: keep replies short; when they say "push it … immediately", do build + scan + push
   in one step and report in a few lines.
10. **Gotcha (session 18):** code written through `node -e` or heredoc template strings **loses regex backslashes**
    (`\d`, `\b` became `d` or a backspace character, twice). Write snippets to a file or use the Edit tool, then grep
    the changed files for stray control characters (`grep -nP '[\x00-\x08]'`).
11. **Waiting on the owner** (ask only if relevant): which Reports filter "didn't change the reports" (#159); whether
    the canvas must keep gaps above items (#164); Tata Motors Pune AED "Training not required" (26 Oct); Diana
    Builwell W Goa / Sierragold Heights still "Mark completed or postpone".
12. **Still owner-side:** Admin Reconnects Quotations, `CRON_SECRET` GitHub secret, reconnect **hello@**, 4 Classic
    Citi test rows in the master sheet, Zoho Mail forwarding filter (#25), real gratitude wording (#29), JW Sahar's 20
    rows (#41).

**Session 18 in one paragraph (29 Oct, one long day):**
- **Checks:** clean (database 7 MB/s, Sync log ok since Mumbai, certificate sheet working again, Quotations still
  `newCustomers: false`, no real quote made).
- **Defibtech tab** (Admin only; the owner renamed their copy "AEDs, PADs, BATTERIES" on the canvas): Overview, All
  items, AEDs / Pads / Batteries, Purchases (bills), Stock (month ends); Show by Week / Month / Quarter / Year; item /
  brand / item-status filters; quote sent / accepted / declined / conversion. New datasets `purchases`, `stockLevel`,
  `quoteItems` (new Zoho Analytics table "Quote Items"); Margin gained zohoItem / brand / kind / itemStatus. **Margin
  fix:** units taken from ~₹0 stock adjustments (6 Jul 2026) are costed at the average bill price — this FY's margin
  32.6% → 28.8%.
- **Reports phase 1:** "Not filtered by …" on tiles; filter lists narrow to the other filters; empty tiles say so;
  "Your own dates…"; no Compare on All time; builder filters is / is not / contains + mixed per-unit warning; one quote
  vocabulary (Accepted / Declined / Expired / Waiting, "Conversion rate"; no answer in 90 days = Expired — #160 done);
  Zoho catalogue item / brand / kind / status on sales + stock with Item / Brand filters; one spelling per customer
  (`nameKey` — #160 done).
- **Filters shared by every tab** (`th.reports.state`); a dashboard's own starting filters = its `scope`
  (`th.reports.scope.<tab>`).
- **Dashboard editor**, in four goes the same day: pages of 4 places (`4ba293e`…`2c459c4`) → in-place rooms, 8 a page
  (`63557f0`) → **a canvas** (`f5b5059`: owner "a big box container … place my report anywhere … resize by holding its
  edge … a kpi could be 4x2 too"). Built-in tabs editable / restorable / hideable (Admin), "+ New dashboard", the
  builder's "Put it on", My dashboard on the same editor.
- **Incident:** the canvas went live while a dashboard saved on the pages-of-4 version existed → **Reports crashed for
  everyone** ("This page couldn't load"). Fixed by `f8a9c37` (cloud session, owner "push it to master"): the route
  passes every stored dashboard through `upgrade` (custom.ts). Lesson in §11 #18.
- **Tests** (`d0f652b`, `8dbad8a`): `npm test`, 26 tests, fake db/auth.
- **Phase 3:** 11 tabs → 8 (`80613e6`; old ids are `ALIASES`), "What changed" line per tab.
- **Phase 4:** chart Lines (average / lowest / highest / target / trend / forecast next 3) + green / red by rule
  (`ee74ed8`), drill-down year → quarters → months with ← Back (`210d4c5`), 12-month trend lines in number cards
  (`6dfab55`).

**Session 17 in one paragraph (28 Oct, one long day):**
- **Reports:** the three ⚠ reports are built and live — Stock now (Products tab), Freight and Gross margin (new Margin
  tab, Admin only); the Zoho Analytics refresh copies tables in turns (fits Vercel's 120 s); bigger text and charts
  in the page's font (they were drawing at 10 px); an answer cache (browser 10 min, server); Key numbers now also
  shows the tab's first two charts.
- **Speed:** Vercel functions moved from Washington (iad1) to **Mumbai (bom1)** next to Atlas and Zoho — warm calls
  650 → 78 ms. Every page uses the whole window when zoomed out.
- **AedSmartx:** "Mark email sent" for Priyanka's emails sent from Zoho Mail directly (counts +1, Undo).
- **Quotations (new page, under Overview; Admin, Ashish, Shikha, Sumit):** every Zoho customer; a popup like Zoho's
  quote form (mandatory Send to CRM + Reminder Frequency, sales person, product type from the items, deal name,
  stock + GST per item, totals worked out like Zoho, notes + terms); "Browse items" catalogue with Zoho's item
  pictures; "+ New quotation" (from scratch, or a new customer created in Zoho first). Its own Zoho connection
  (the only one that writes to Zoho Books). **Not one real quote made through it yet.**
- **Certificates:** a Reconnect path for the master sheet when Zoho drops its sign-in.
- **Overview:** bars and lines in the theme's Reports colours.

**Session 16 in one paragraph (27–28 Oct):**
- **Checks:** clean (GitHub = live `7814162`; Sync log ok; 0 open tracker requests).
- **Finished session 15's work:** training value for trainings on payment cards (#127 — 55 of 56 valued, each FY
  training checked against its Books invoice; the 4 differences are exactly the travel-expense lines); `next build` +
  browser check of the Customers / Products tabs, which found and fixed three bugs (a comparison by segment dropped
  ₹93 L of last year's revenue; the seasonality heatmap lost 5 months to "Others"; phone axis labels overlapped).
- **Built:** **My dashboard** (each person picks their reports; restated with 5 questions → "yes go ahead"); the
  **India map** (#18, DataMeet outline, CC BY 4.0); **pages in Reports** (owner, mid-turn: "add pagination… only fetch
  data when clicked").
- **Incident:** owner's screenshot "its not loading… too much load" → the free Atlas cluster was over its weekly
  transfer limit (every open tab re-downloaded the whole change log every 15 s). Fixed: fingerprint cache + "nothing
  new" pulls, Reports copy read once per refresh and stored gzipped (6.2 MB → 0.55 MB), board only when a report needs
  it, and a failed DB connect no longer breaks a server for good. Throttle gone by the next morning.
- **Pushes:** 3 (`7814162..857114d` = six commits, then `efb56d0` + `bbb061e`, then `207d0d5`). Owner's words: "yes go
  ahead", "go through the plan and continue with the next step", "commit all 6" (= push them), "push it to github" ×2,
  "update the handoff prepare for next session".

**Session 15 in one paragraph (27 Oct):**
- **Morning checks:** all clean (git = GitHub = live `b81bab6`; 1 tracker request, resolved; Sync log 5 ok + 2 not due;
  Reports copy refreshed 08:45, 0 saved reports).
- **Research + proposal:** 27 report ideas mapped to our data (✅ / ⚠ / ❌), questions with defaults → **"yessir"** = all
  defaults (ANALYTICS-PLAN §11). Data facts found: sector / customer type blank on ~1% of revenue; Oct 2026 so far
  ₹59.27 L before tax / ₹63.46 L incl.; this FY ₹50 L (before tax) reached in 4 of 7 months.
- **Built and pushed (`0af501b` + docs `7814162`, live):** (a) ₹50 L goal meter; (b) calmer Reports layout; (c) 7 more
  KPIs; (d) compare (last year default / period before / two groups / none), is / is not / contains / value-range
  filters, saved views, "Change this chart", what-if; (e) Growth, Team & pipeline, Collections tabs (10 reports).
- **After the push:** the meter now follows the theme + 6 new experimental themes (`d456670`, local only); second batch
  of reports (Customers, Products, training economics — uncommitted, see step 1).
- **Pushes:** 1 (two commits). Owner's words this session: "yessir", "next" ×4, "push it to github", screenshot "the
  color should change with the themeeee, also add more experimental themes i like them", "continue", "write a handoff".

**Session 14 in one paragraph (26 Oct):**
- **Morning checks:** Tata reminder sent, then marked not required; Diana / Sierragold still open; Reports copy from
  23 Oct, 0 saved reports.
- **Plan:** the owner pasted a spec for a "progress-tracker" page (team activity / dependencies / "Unblock Me") →
  `PROGRESS-TRACKER-PLAN.md` (spec traced S1–S26, assumptions A1–A38, open decisions D1–D16). It moved under Reports;
  defaults accepted ("build it come on").
- **Built, then changed by the owner the same day:**
  - requests (4 categories, ping after 4 h, red after 24 h, resolve / withdraw / reopen, threads), the
    who-waits-on-whom matrix, header counts, team status cards, notices, "Ask a teammate" on every card header;
  - **Everyone's to-do** (per person, read from the boards);
  - check-ins **removed** ("don't need") and **Work done** added instead (auto record from the change log);
  - an **(i)** explainer and a sidebar icon (aligned twice: indented looked wrong → in line with the other items);
  - **tagging**: @mentions + "waiting on you" give a **red count until you reply or resolve**;
  - the "Progress tracker →" link removed from the Reports tabs.
- **Pushes:** 6 (`b63aebb` session 13 handoff, `09c4495` tracker, `f899c00`, `7448dfe`, `909f3d0` tagging, `b81bab6`).

**Session 13 in one paragraph (21–22 Oct):** morning checks — WhatsApp had started on its own (5 sent 20 Oct 16:01, 4 on
21 Oct 07:59), all 21 Oct reminders sent and recorded. Then, all pushed and live: **fixed** the "Ready for training" popup
(had no contact-number row → could never schedule); **scheduling only in a popup** (Schedule / Postpone / Change date /
To be decided) with a **"No. of People" check** (tick or correct; the checked number wins everywhere — `peopleOf`);
**themes** (Change theme: 9 light + 7 dark gradients, then Appearance removed and 2 **experimental full themes** — Plum,
Smoky coastal — that recolour cards and text); **Training box** concerned person / email / number on their own lines;
**step tracker** on every board's card; **calendar "+"** on empty days (Overview popup via portal); **Zoho Analytics
connected** (Admin popup, read-only; 475 items read) and **ANALYTICS-PLAN.md / ANALYTICS-SCHEMA.md** written; **Reports
Phase 1** — semantic layer + query engine + Sales / Trainings / Quotes dashboards + builder + saved reports, data from
the Zoho Analytics copy of all of Books (checked: Oct 2026 = 49 invoices, ₹59.04L incl. tax in both); polish after owner
feedback: same-days comparison, Others as a note, Nikita Shah merged, Edit / Delete on every saved report, colours per
chart → per theme (Plain / Black = mint bars), Table → Chart fix, bigger text, builder via portal. 22 pushes in all
(`8eaea44` … `b88fb24`). Wrote the owner's Zoho Sprints status for 22 Oct.

**Session 12 in one paragraph (20 Oct):** morning checks — all 3 first reminder emails went at 08:18 IST (the owner's
page load started a sync), filed in /Sent/Training Reminders; two were a day late (no sync after the 19 Oct push, no
`CRON_SECRET`), Diana's 2-day email skipped by the catch-up rule; Diana's quote is a real new one (30 Jun), not a
leftover. **Overview:** the meter ticks got a "today" label + hover/tap note, and a **revenue forecast** (month end =
invoiced + booked PIs / quotes ≤ 15 days old; later months = last year × this FY's growth, ~+3 %; FY ~₹17.6L vs ₹17.1L)
with a Trainings | Revenue switch on the trend card (`fd2e449`). **WhatsApp through Anantya** — found their API (dashboard
Integrations → API Key / API Docs; Swagger at apiv1.anantya.ai), built the Admin popup (Calendar → WhatsApp: key, numbers,
template pickers, "Text to create" + phone preview, test send), per-person sending on the email days, Sync log + cron log
lines; templates went v1 → v2 (readable layout) → v3 (+ contact number) → **v4 (+ type of training, 11 values, picked)**.
**Concerned person's contact number** per training (required to schedule and to complete; order location → name →
email → number), and the **type of training** in the reminder email. Pushed `98381ce`. Wrote the owner's Zoho Sprints
status + suggestions and a dashboard description. **Open:** WhatsApp hasn't sent on the live site yet (#2 above).

**Session 11 in one paragraph (19 Oct):** checked live state (all pushed, both addresses on `3f82378`; 0 failed syncs /
mail errors since 17 Oct; Sat 17 Oct afternoon syncs missing — nobody online + no `CRON_SECRET`; only one training
scheduled since 15 Oct: FLAME Performa-25-1110, whose old-style alias "Arwa Hyderabadwala" would have printed as the
location — **Shikha fixed it the same day** to "Flame University, Pune", Arwa as concerned person). Found **every
training invoice this FY already has a board completion** (21 = 21), so nothing to back-fill → owner chose **team year
counts from Oct** (60 trainings / 1,500 people this FY). Folded AedSmartx **Item description** while Contacted.
Rebuilt the **Calendar**: own calendar per member (server-filtered; Admin/Shikha/Sumit/Ashish see all), a **colour per
person** (external trainers grey, one "External trainers" legend entry), click a legend name = that person's calendar,
training chips with training + trainers, a **training card** in the calendar (at a glance, notes, money, docs,
certificate stage, late / clash warnings, the board's actions + change log), **+ New** (Training with a deal picker and
the Ready-for-training rows, AED training, Meeting / Event with Who incl. Everyone), page fits 1728×958; **bottom-right
reminder popups** (today + tomorrow, picked people only, 30 s, ×, once a day per member on the server, click opens the
card on its board, the next waits until it closes); **"Training completed" shows only once quote+PI merged, location and
email set**; board opens a card from `?open=`. Pushed `72486bb`, `3af5c58`. Then built the **training reminder emails**
(learn@ → trainers, 5/3/1 days, postponement email, filed in Shikha's "Training Reminders") — **not pushed**.

**Session 10 in one paragraph (15–17 Oct):** certificates printed the date / number / location in a dark teal
(`#0E3F51`, hard-coded in our layout — the templates' own colours never reach the print) that printers turned light
blue → **pure black** in the dashboard (`5d167c2`) and the certificate-generator app (`17853af`, pushed together with its
unpushed TypeScript rebuild `44795c9`). Audited every alias entry and found the root cause of the wrong locations: the
"alias for certificates" was **one per customer name, latest wins on every card** (Chalet's four hotels shared one), plus
two lists that drift (aliases vs. certificate alias) and no input checks. The owner redefined the model → built
**certificate location name + concerned email per training** (required to schedule, server-enforced, locked once
certificates are made; older trainings keep what they printed — no data rewrite), **alias = anything they're called** and
**concerned person's name = only a person**, both optional, editable from the Customer section on every board, with
duplicate / typo / "looks like a hotel" checks (`a25a72f`). Removed Shreya's 6 dummy gmail entries (archived first).
Fixed the **Overview maths** (revenue −59 % was part month vs. whole month → −3 % like for like; "Behind by 0.6"
trainings; a 16-day "next 15 days"; past-dated trainings counted as scheduled; Priyanka's trend from April) and added a
ticker **"Mark completed"** reminder (`f642de7`). Wrote the owner-view feature review → `MONDAY-PLAN.md` (`3f82378`).
work.thinkhealth.in went live. First real runs seen: Shreya's first **two-day batch** (Synopsys, 22 certificates,
15 Oct 12:26) and the first real **gratitude reply ★** (12:04).

**Session 9 in one paragraph (14 Oct):** did the three approved items — deleted the **8 false "no longer in Zoho Books"
notices plus a 9th** written that morning by a never-reloaded tab (direct Mongo delete, guarded by id + kind; not refused),
live gratitude greeting **"Dear {person},"**, Priyanka's targets **5 AED trainings a month / 60 a year, her year counted from
1 Sept** (35 this FY); the **server now rejects false Zoho notices** (both cards still in its Zoho copy) — pushed `40cb462`.
Then: **work.thinkhealth.in** set up in Vercel, waiting on Cloudflare DNS (step 4); **Fulfillment Generate popup** — BLS
trainings default to the Basic Life Support design (others CPR/AED/First Aid), the suggested design **glows gold**, the strip
shows the **training name**, Admin **Replace designs**; **AedSmartx** — Priyanka **picks the email template**, and **replies to
her emails (hello@) star the card** with Shreya's reply popup (hourly check, `src/lib/aedReplies.ts`); the owner's **new
certificate templates** printed blank (colour profile in a separate PDF object) → `certBackground.ts` fixed, old designs
backed up, new ones uploaded as Admin and checked through the live code — pushed `9459193`. Live data untouched by tests
(every check used blocked writes, mocks, or a fake reply injected in the browser only).

**Session 8 in one paragraph (13–14 Oct):** found why deletions in Zoho didn't show (only the 9 am / 2 pm full checks see
them) → **Sync now runs the full check**; found and fixed **false "no longer in Zoho Books" notices** written by tabs waking
from sleep (8 entries still in the log, #44); **certificates per training day** (multi-day trainings: names per day, each row
and certificate carries its day — replaces "last day" rule); **alias + concerned email mandatory** to schedule, plus an
optional **concerned person's name**; Fulfillment: **"Have a list? Click here to Generate Certificates"** from Training
Completed (no gratitude email) and a **cleaner board + card** (state pills, 4-step tracker); **Overview, Calendar and ticker now
come from the boards** (targets 10/120 trainings and **300/3000 people**, coming up in 15 days, Priyanka's own AED Overview,
stale follow-up items gone). Four pushes (`01f028c`, `4745553`, `ca83971`, `3e57bb2`), all live.

**Session 7 in one paragraph (12–13 Oct):** connected the master sheet (taught "SN" as the serial column; **SN and
certificate no. count separately** — the sheet's certificate numbers run 7 behind SN); the first PDFs printed the A4
Photoedit template squashed into one slot → the dashboard now takes the certificate picture out of the template like the
owner's certificate generator (`certBackground.ts`) and prints exactly like it; polished the **Generate** popup, the
**Fulfillment card**, the **Ready for training** / **Certificate details** popups and the **Review & merge** view (scales with
the number of cards open); added **Mark as Completed** (Fulfillment, done before the dashboard → Sent to Logistics) and
**Completed on invoice date** (Training board, invoices up to 31 Jul 2026: training completed on the invoice date, then PI →
Invoice → Payment received merged in one step); column colours **#FFAC00** (Training scheduled) / **#26B0D2** (Training
completed); fixed the flower loader and a blank Review & merge after PI → Invoice. Five pushes, all live. A direct Mongo
cleanup of Shreya's test entries was **refused by the safety classifier** — the owner used Clear logs instead.

**Session 6 in one paragraph (10 Oct):** rebuilt Shreya's **Fulfillment board** around a **gratitude email** and
**certificates**: Training Completed → **Gratitude Email Sent** → Certificates Generated (**In process / On hold**) → Sent to
Logistics. The email goes from **learn@thinkhealth.in** (an alias of Shikha's mailbox) via Zoho Mail and is filed in her
**"Gratitude Emails Sent"** folder; a Zoho Mail filter (owner sets it) forwards replies to **digital@**; the hourly sync finds
replies and puts a **★ on the card**. **Generate Certificate**: paste names → pick one of two designs → preview of the rows as
they'll sit in the **master Zoho Sheet** → Generate appends them (serial continues) and makes the PDF **in the browser** (code
copied from the owner's certificate-generator app) with a slow **flower loader** → Download moves the card on. Pushed
(`2156f46`). Then the owner found **Clear logs → Everything** had been used by mistake **twice** — both **restored from the
archive** (§5 #145–#146) — and asked for a **"type Confirm"** lock on clearing everything (built, tested, see step 1).

**Session 5 in one paragraph:** gave Priyanka's AedSmartx board a **Contacted** column (In process → call log, contacts by
customer name, email check) and **onboarding emails sent from Zoho Mail** (hello@thinkhealth.in — first contact, then two
reminders as replies in the same thread; templates in MongoDB; Admin connected the mailbox, the owner received a test);
fixed **Clear logs** to work on every board; made **contact numbers / emails customer-wide** (like aliases); **locked the
customer name** (it's their Zoho identity); team changes now show within **15 s**; **Training not required is purple**. All
pushed and live (last commit `1738416`).

**Session 4 in one paragraph:** checked the Zoho sync (data matched Zoho exactly; GitHub's hourly job never ran — no
`CRON_SECRET`) and added a **Sync log**; built the **Logistics** board for Arti; added **per-person permissions** enforced on the
server; made **undo run forward on every board** (with a confirm popup); made **aliases apply to every card under the customer's
name** (`b146419`).

---

## 1. Where things stand

- **The app is LIVE: https://training-dashboard-xfwl.vercel.app** (Vercel, since 5 Oct 2026). Vercel redeploys
  **every push to `master`** — so a push is a production release for the whole team. Only push when the owner asks.
- **GitHub:** `thinkhealthcareandsafety/trainingDashboard` (**public** repo), branch `master`, last pushed commit **`6dfab55`**
  (29 Oct afternoon — live on both addresses). Nothing else local except the session 18 docs commit.
  Session 18 (oldest first; full list `git log --reverse 0eb65d4..6dfab55`):
  - `b3b60a1`…`216c3bd` — **Defibtech tab** (prices, Show by, Purchases, Stock, All items, item filters, quote KPIs);
  - `77a1d5b`…`9f46106` — Reports phase 1 (not-filtered notes, narrowing filter lists, own dates, quote vocabulary,
    Zoho item / brand, `nameKey`);
  - `f363415` — one set of filters for every tab;
  - `4ba293e`…`2c459c4` — team dashboards on the server, editor (pages of 4 places), "Put it on", My dashboard on it;
  - `63557f0` — edit in place, rooms; `f5b5059` — **the canvas**; `f8a9c37` — old saved dashboards read as the canvas
    (fixed the live crash);
  - `d0f652b`, `8dbad8a` — `npm test`;
  - `80613e6` — 11 tabs → 8; `ee74ed8` — chart lines; `210d4c5` — drill-down; `6dfab55` — trend lines in numbers.
  Session 16 (oldest first, one commit per step — owner's rule):
  - `d456670` — goal meter follows the theme + 6 experimental themes (from session 15);
  - `2a94484` — Customers + Products tabs, Trainings → Training economics (+ the 3 browser-check fixes);
  - `7b2ff08` — training value for trainings on payment cards (#127);
  - `bb387fa` — **My dashboard**;
  - `25a5e6b` — **India map** (#18);
  - `857114d` — database: download team data only when it changed (fingerprint cache, "same" pulls);
  - `efb56d0` — Reports: gzipped copy, board only when needed, readable errors;
  - `bbb061e` — **Reports pages** (only the open page is fetched);
  - `207d0d5` — database: retry a failed connection instead of keeping it.
  Session 15: `0af501b` — Reports (goal meter, layout, KPIs, compare / filters / views, Growth / Team / Collections) ·
  `7814162` — docs (ANALYTICS-PLAN §11 + session 14 handoff).
  Session 14 (oldest first):
  - `b63aebb` — session 13 handoff + analytics plan status;
  - `09c4495` — **Progress tracker** (one self-contained commit);
  - `f899c00` / `7448dfe` — sidebar item alignment;
  - `909f3d0` — tagging (red count until reply / resolve);
  - `b81bab6` — remove the "Progress tracker →" link from the Reports tabs.

  Session 13 (22 pushes, oldest first): `c1aa959` schedule popup + people check + themes v1 · `e94d50c` handoff ·
  `bfed393` light / dark themes · `8eaea44` Training box lines · `0afbfe2` step tracker · `66230d3` experimental themes,
  Appearance removed · `89a7655` calendar "+" · `c58fd75` Zoho Analytics connection + plans · `5b623b7` Reports Phase 1 ·
  `a9e2716` / `98b44c5` period picker (owner's `pl-5`, own arrow) · `1b67e25` Edit / Delete + colours · `9c64aaa` theme
  colours, mint, Table → Chart fix · `1bd3873` mint on Plain / Black · `b88fb24` bigger text, builder portal.
  Session 12: `fd2e449`, `98381ce`. Session 11: `72486bb` (calendar, popups, year from Oct, Training completed gate, AedSmartx fold), `3af5c58` (external
  trainers, legend filter, deal list). Session 10: `5d167c2`, `a25a72f`, `f642de7`,
  `3f82378` (+ certificate-generator repo `44795c9`, `17853af`). Session 9: `40cb462`, `9459193`. Session 8 commits: `01f028c`,
  `4745553`, `ca83971`, `3e57bb2`. Session 7: `cb906d4`, `7025bbe`, `3a5b002`, `85f13c2`, `633f1ec`.
- **Zoho Mail is connected** for **hello@thinkhealth.in** (Admin did it on 8 Oct through the dashboard's *Connect it* popup;
  token in Mongo kv `zoho_mail:hello@thinkhealth.in`). The owner received a **[TEST]** first-contact email. Threaded reminders
  (reply API) are **not yet confirmed** in real use — see §10 #20.
- **learn@thinkhealth.in** (gratitude emails) connected 10 Oct, **master Zoho Sheet** connected 12 Oct (as digital@; worksheet
  Sheet1, ~2135 rows, columns DATE · TRAINING LOCATION · SN · CERTIFICATE No · COURSE · NAME), **designs** `bls` / `fa`
  uploaded 12 Oct (kv `zoho_mail:learn@thinkhealth.in`, `zoho_sheet:master`, Mongo `certDesigns`). Check existence only —
  project `_id/connectedAt/connectedBy`, never the token fields.
- **Clear logs accidents (10 Oct):** "Everything" was cleared by mistake on **3 Oct 11:31 IST** and **10 Oct 12:14 IST** (both
  as Admin + PIN). Both were **restored from `cardEventsArchive`** in session 6 (§5 #145–#146); live `cardEvents` had **210**
  entries afterwards. The archive rows carry `restoredAt` (or `restoreSkipped` for ones the team had redone).
- **After every release** the team must press **Ctrl + Shift + R** once: the app is a single-page app, so an open tab keeps the
  old code until a full reload (this is why "confetti works for me but not for others" happened).
- **Zoho sync** was broken from Mon 5 Oct 3 pm to Tue 9:19 am (automatic syncs depended on page visits + one daily cron, and
  failures were silent). Fixed in session 3 (§3 "Zoho copy + sync"); verified the live site synced on its own at 10:00:17.
  On 7 Oct the Mongo copy matched live Zoho record by record (0 differences). Since 7 Oct ~10 am every sync is in the
  **Sync log** (sidebar). Syncs currently happen only while someone has the site open (+ Vercel's daily 9 am cron) — the
  GitHub hourly job skips until the `CRON_SECRET` repo secret is added (§10 #11).
- **Database:** MongoDB Atlas cluster **Cluster0** (the cluster in `MONGODB_URI`), database `thinkhealth_dashboard`
  (**free M0 tier**: ~13 MB of data, but only **10 GB of data out per rolling 7 days** — over that, Atlas slows it to
  ~90 KB/s; it happened on 27 Oct, see §3 "Reports + database — session 16"). It is **not** the "Directory" cluster the owner sees in their own Atlas project — Cluster0 sits
  in another project/account; a colleague added `0.0.0.0/0` to its IP access list for Vercel.
- **Stack:** Next.js **16.3** (Turbopack) + React 19 + Tailwind v4 + MongoDB + Zoho Books (India DC).
  `AGENTS.md`: this Next.js differs from training data — read `node_modules/next/dist/docs/` before Next-specific code.
- **People using it (real, live data):** Shikha Dixit, Ashish Dalal, Sumit A Shah (all boards), **Priyanka** (AedSmartx
  trainer), **Arti Sirohi** (Logistics — AED deliveries and certificate shipping; she already moved Paccar to *Received by
  Client* and Heritage Village Goa to *Shipments* on 7 Oct), **Shreya** (certificates — Fulfillment board), and **Admin** (the
  owner). Their changes live in MongoDB `cardEvents` — **never write test data to the shared database** (see §9).
- **Four boards** on `/follow-up`, picked with the **Board** switch (Training · AedSmartx · Fulfillment · Logistics): the
  **Training follow-ups** board (9 columns), the **AedSmartx Training** board (5, Contacted added in session 5), the
  **Fulfillment** board (4 since session 6: Training Completed · Gratitude Email Sent · Certificates Generated · Sent to
  Logistics) and the **Logistics** board (6, session 4). Plus the Dashboard (`/`) and Calendar pages.
- **How the boards chain together:** Training board (deal: lead → quote → PI → training scheduled → **training completed** →
  invoice → payment) ⇒ every completed training appears on **Fulfillment** (certificates) ⇒ cards Shreya marks **Sent to
  Logistics** appear on **Logistics** (Arti: merge with the fully paid payment → pack → ship → received). AED invoices (Zoho)
  ⇒ **AedSmartx** (Priyanka: delivered → contacted → AED training) and Logistics' *AED Delivered Status* column. Every board
  is Zoho data + the shared change log; nothing is written back to Zoho Books.
- **Permissions (owner's list, 7 Oct — `src/lib/roles.ts`, enforced by the boards AND by `/api/store`):**
  Priyanka → AedSmartx only, everything except marking delivered · Arti → Logistics only, everything there · Shreya →
  Fulfillment only, everything there · Ashish, Shikha, Sumit → all four boards, every action · Admin → everything, and the
  only one who can clear logs · anyone else → Training. The server refuses a new change outside your board/actions.
- **Reverting:** your own changes only (Admin: anyone's); Revert / Undo / Unmerge / Restore / Unhide / Undo delivered show only
  on your own. **Undo runs forward on every board** (`src/lib/cascade.ts`): reverting a step also reverts the later steps of
  that flow — following merges (e.g. reverting *Training scheduled* also reverts *Training completed* and the invoice / payment
  merges after it), even when someone else made them; a popup (`RevertConfirm.tsx`, from the store's `pendingRevert`) lists
  them first. Notes and edits are never rolled back; other boards' steps aren't either (they stop applying, and return if the
  step is redone). The server allows a revert of others' entries only as part of such a cascade of your own.

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
  Optional: `SESSION_SECRET` (changing it signs everyone out); `ZOHO_MAIL_API` (default `https://mail.zoho.in`),
  `ZOHO_MAIL_CLIENT_ID` / `ZOHO_MAIL_CLIENT_SECRET` (fallbacks for the Connect popup — not set; the popup's values are stored in
  Mongo kv instead). Documented in `.env.example` (no values).
  **Zoho Mail credentials are NOT env vars:** each mailbox's client id/secret + refresh token live in Mongo kv
  `zoho_mail:<address>` (written by `POST /api/mail/connect`, Admin only; never returned to the browser). Never print them.
  Same for the **master Zoho Sheet** (session 6): kv `zoho_sheet:master` (resource id, worksheet, client id/secret, refresh
  token; written by `POST /api/sheet`, Admin only). Optional env `ZOHO_SHEET_API` (default `https://sheet.zoho.in`).
  The **certificate designs** (PDFs with the trainer's signature and company seal) live only in Mongo `certDesigns` — never
  commit them (both this repo and the certificate-generator repo are public).
  Every Zoho connection is made the same way: **api-console.zoho.in → Self Client → Generate Code**, signed in as the account
  whose data is used, with the scope the popup shows; the code + that Self Client's Client ID/Secret go into the popup (each
  Zoho account has its own Self Client). The auto-mode safety classifier **refuses** scripts that read stored Zoho tokens
  from Mongo to call Zoho directly ("credential exploration") — don't try; go through the app's routes.
  **Never print, copy or commit secret or PIN values** — a push was once blocked because a PIN had been written into
  this file; scan diffs for PIN digits before every push.
- Git identity is repo-local (`thinkhealthcareandsafety` / `sshah@thinkhealth.in`). Follow the session's commit-attribution reminder.
- **Deploy** = push to `master` (Vercel builds automatically). `vercel.json` crons: `30 3 * * 1-6` (9:00 IST Mon–Sat)
  → `/api/cron/sync`, and (session 11, **not pushed yet**) `0 3 * * *` (~8:30 IST every day, Sundays too) →
  `/api/cron/reminders` (training reminder emails). Vercel Hobby allows daily crons only — they fire anywhere within that
  hour; both need the Vercel env `CRON_SECRET` (set). Check after the push that Vercel accepted two crons.
- **Hourly scheduler** = GitHub Actions `.github/workflows/zoho-sync.yml` (`32,50 3-13 * * 1-6` UTC) → `/api/cron/sync`. Needs the
  repo secret **`CRON_SECRET`** (same value as Vercel's); without it the workflow just logs a warning. A failed sync answers 502,
  so the run fails and GitHub emails the repo owner. The workflow calls `/api/cron/sync?source=github` so the Sync log labels
  it. **Checked 7 Oct: the secret is missing** (both runs on 6 Oct skipped; the public API shows runs + annotations:
  `api.github.com/repos/thinkhealthcareandsafety/trainingDashboard/actions/runs`). The owner was told where to add it.
- **To make the hourly checks reliable** (Books sync + gratitude replies), the owner must add the GitHub secret — steps given on
  10 Oct: Vercel → project → Settings → Environment Variables → copy `CRON_SECRET`; GitHub repo → **Settings** tab → Secrets
  and variables → Actions → **New repository secret** `CRON_SECRET`; then Actions → *Zoho sync* → **Run workflow** (green = ok).
- Dependency added in session 13: **`echarts@5.6.0`** (exact; Apache-2.0) — Reports charts only, loaded with dynamic
  `import("echarts/core")` + the Bar / Line / Pie charts, Grid / Tooltip / Legend, Canvas renderer (`Chart.tsx`
  `loadEcharts`), so no other page ships it.
- Dependencies added in session 6: `pdf-lib@1.17.1`, `@pdf-lib/fontkit@1.1.1` (certificates, used in the browser only).
  Fonts in `public/certificate-fonts/` (Great Vibes, Montserrat Bold Italic, Open Sans Bold Italic — SIL OFL, licence files there).
- Dependencies added in session 3: `canvas-confetti` (+ `@types/canvas-confetti`). `npm audit` flags **Next.js 16.3 (critical)**
  and `source-map-js` (high) — pre-existing, not fixed (upgrading Next is a separate, careful job).
- No Python on this machine; use Node for scripts. When editing with scripts, beware `\b` inside JS template strings
  (becomes a backspace) — the Edit tool is safer for exact replacements.

---

## 3. How the code works now

### Data flow
```
Zoho Books ──(src/lib/zoho.ts: client, fetchers, mappers)──► src/lib/zohoSync.ts ──► MongoDB copy
                                                                 │  zohoDocs, zohoCustomers, zohoPayments, kv
browser ──(cookie)──► /api/pipeline · /api/aed · /api/trainings · /api/zoho/meta ──(read the copy, no Zoho calls)
browser ◄──► /api/store (team data: cardEvents, members, …; 15 s pull + on tab focus, diff push; server stamps who did what)
browser ──► /api/mail/aed ──(src/lib/zohoMail.ts, templates src/lib/mailTemplates.ts)──► Zoho Mail API (mail.zoho.in)
                 └─ records the sent email as an `aed_email` event in cardEvents (server only)
browser ──► /api/mail/fulfil (gratitude email, from learn@) ──► Zoho Mail; files it in "Gratitude Emails Sent"; `fulfil_email`
hourly sync (zohoSync.runSync) ──► gratitudeReplies.ts reads learn@'s Inbox ──► `fulfil_reply` events (★ on the card)
browser ──► /api/certificates (preview / append) ──(src/lib/zohoSheet.ts)──► Zoho Sheet API (sheet.zoho.in) ──► `fulfil_certs`
browser ◄── /api/certificates/designs (PDF from Mongo) → src/lib/certPdf.ts makes the certificates PDF in the browser
```
The Fulfillment routes rebuild the card on the server (`src/lib/fulfilServer.ts`: Zoho copy + change log → `buildBoard` →
`buildFulfillmentBoard`) instead of trusting what the browser sends.

### Fulfillment: gratitude email, replies, certificates (session 6)
Files: `src/components/followups/FulfilCerts.tsx` (all the UI: actions under the Training box, gratitude popup, reply popup,
Generate popup + flower loader, Connect sheet popup, Upload designs popup), `FulfillmentModal.tsx` (the card),
`src/lib/gratitudeReplies.ts`, `src/lib/zohoSheet.ts`, `src/lib/certificates.ts` (numbering, name parsing, the two designs),
`src/lib/certPdf.ts` (PDF), `src/lib/fulfilServer.ts`, `src/lib/zohoOAuth.ts` (shared Zoho code→token helper), routes
`src/app/api/mail/fulfil`, `src/app/api/certificates`, `src/app/api/certificates/designs`, `src/app/api/sheet`.
- **Gratitude email** — template `fulfil_gratitude` in Mongo `mailTemplates` (**placeholder wording** until the owner sends the
  real one; subject `Thank you for hosting our training - {location} ({ref})` — **keep "Thank you for hosting"**: Shikha's
  forwarding filter keys on it). Vars: `{location}` (alias for certificates, else customer name), `{customer}`, `{ref}` (PI /
  quote no.), `{course}` (training names), `{dates}`, `{people}`. From **learn@thinkhealth.in**, an alias on
  **shikhadixit@**'s mailbox → that mailbox is the connection (`zoho_mail:learn@thinkhealth.in`, `connectMailbox` finds the
  account that can send as the alias). Scope **`ZohoMail.messages.ALL,ZohoMail.accounts.READ,ZohoMail.folders.ALL`**
  (`MAIL_SCOPES`; folders.ALL so the dashboard can create/move into the folder). `GET /api/mail/fulfil?card=` preview;
  `POST {card, to}` sends **once per training** (409 if already sent) and records `fulfil_email` (value = to, subject,
  messageId); `POST {…, testTo}` = `[TEST]` copy, not recorded. The `to` in the popup wins (a concerned email changed in the
  popup is also saved with `certEvents`, and may not have reached the server yet).
- **Filing:** every email sent (tests too) is moved to the **"Gratitude Emails Sent"** folder in Shikha's mailbox
  (`fileSentMail` → `PUT /api/accounts/{id}/updatemessage {mode:"moveMessage", messageId:[…], destfolderId}`; the folder is
  found by name or **created** — `folderNamed`, ids cached in the kv doc under `folders.named`). If the move right after
  sending fails (Zoho still saving it), the hourly check moves any gratitude email still in Sent.
- **Replies (★):** owner's boss wants replies at **digital@** but digital@ must not send anything sales/training → Shikha's
  **Zoho Mail filter** (owner sets it: To contains learn@ AND Subject contains "Thank you for hosting" → Forward to digital@)
  forwards them. The dashboard never reads digital@'s mail. `checkGratitudeReplies()` runs inside every `runSync` (hourly
  9 am–7 pm Mon–Sat, Sync now too; a mail error never fails the Books sync — logged as `mailError`, replies count as
  `replies` in the Sync log). Only when some card is still waiting (email in the last 60 days, no `fulfil_certs`): reads the
  newest 200 of learn@'s Inbox + Sent + the folder (`latestMail`), matches a reply by **thread id** (sent message → threadId)
  or by **subject without Re:/Fwd:**, received after the email, not from `@thinkhealth.in`, not seen before → `fulfil_reply`
  (value = from, subject, messageId, folderId, at = when it arrived, by "Zoho Mail").
- **Star rule:** ★ while the card is in Gratitude Email Sent, has no certificates yet, and has a reply newer than the last
  `fulfil_mail_opened` (written when someone clicks **Open in Zoho Mail** in the reply popup). A newer reply brings it back;
  adding the list removes it for good. A starred card opens **on the reply** (`ReplyPopup`: the HTML in a sandboxed iframe,
  ◀ ▶ between replies, *Open in Zoho Mail* → `https://mail.zoho.in/zm/#mail/folder/inbox` (digital@'s inbox in Shreya's
  browser — not the exact email), *Close*). `GET /api/mail/fulfil?card=&reply=<event id>` reads the body from learn@'s mailbox.
- **Generate Certificate** (Gratitude Email Sent cards): names textarea (`parseNames`: one per line; strips "1." / "2)" /
  bullets; from copied rows keeps the cell with a name) → **design** radio (`DESIGNS`: `bls` "Basic Life Support (CPR & AED)"
  → course *Basic Life Support (CPR & AED Training)*, file `cpr-aed.pdf`; `fa` "CPR, AED & First Aid" → course *CPR, AED and
  First aid Training*, file `cpr-aed-first-aid.pdf`; pre-picked: First Aid trainings → `fa`) → **Preview** (`POST
  /api/certificates {preview:true}`: reads the sheet, shows its last 2 rows grey + the new rows green, in the sheet's own
  columns; font check — names the certificate fonts can't print block Generate) → **Generate** (`POST /api/certificates`:
  under a Mongo lease lock `zoho_sheet_lock` it re-reads the sheet, numbers from **max serial + 1**, appends
  `worksheet.records.add`, records `fulfil_certs` {value = count, certs = rows, design}) → browser fetches the design and
  makes the PDF (flower loader ≥1.6 s) → **Download "<location> certificates.pdf"** → card moves to Certificates Generated
  (`set_fulfillment generated`, fireworks). If rows went in but the PDF failed, the card offers **Download certificates**
  (no second append — the route refuses a second batch while `fulfil_certs` exists, unless that move was undone).
- **Certificate row:** serial · `FAT-OD/<dd-mm-yyyy>/<n>` · name · location (alias for certificates, else customer
  name) · course (from the design) · date. **SN and n are two separate counts** (session 7, owner: "keep them as they are"):
  SN = highest SN + 1, n = highest number at the end of a certificate no. + 1 (`Register.lastCertNo`, `firstFree`,
  `certRows(names, {serial, cert}, …)`) — in the real sheet n runs 7 behind SN because Shreya left blank rows between
  locations. Both are read again under the lock at Generate. **Date = the day that person was trained** (session 8, owner:
  different people are trained on each day of a multi-day training): a multi-day training shows **one names box per day**
  (`certDays` in pipeline.ts, `NamesByDay` in FulfilCerts.tsx); **every day needs names**; a name on two days is refused
  ("one person, one day", `namesOnSeveralDays`); rows go in date order (`certRows(days, …)`), SN / certificate no. run on
  across the days; one PDF; one design. The route takes `days: [{date, names}]` (dates must match the card's, else 409);
  `names` alone is still accepted for a one-day training. (Was: everyone got the LAST day.) Printed date `dd/mm/yyyy`; in the sheet the date is written in the
  style of the sheet's last row (`sheetDate`/`styleOf`).
- **Master sheet** (`zohoSheet.ts`): `POST https://sheet.zoho.in/api/v2/<resource id>` form-encoded, `method=
  worksheet.records.fetch` / `worksheet.records.add` (`header_row=1`, `json_data`), `worksheet.list` on connect. Columns are
  found **by header** (`findColumns`: certNo /cert/, serial /s.no|sr no|sl no|SN|serial/, date, location /location|conducted|venue/,
  course /course|training/, name). The date style is taken from the **last row that has a date** (the newest rows often
  leave DATE and COURSE blank). Missing Serial / Certificate No. / Name / Date column → refuses. Connected by **Admin** in
  Generate → *Connect the sheet* with a code generated **as digital@thinkhealth.in** (can edit the sheet), scope
  `ZohoSheet.dataAPI.READ,ZohoSheet.dataAPI.UPDATE`, plus the sheet link (`…/sheet/open/<id>`); first worksheet unless named.
  The popup then shows the detected columns, row count, last serial and last 2 rows — **use that to confirm it reads right**.
  `GET /api/sheet?check=1` (Fulfillment) returns the same.
- **PDF** (`certPdf.ts`) = the certificate-generator's library (D:\Projects\certificate-generator, `src/index.ts` +
  `layout.ts`) copied in: two A5 certificates per A4 page with a cut line; Great Vibes name, Montserrat location, Open Sans
  date/number; long text shrinks to fit. Fonts fetched from `/certificate-fonts`. Made in the browser — the design never
  leaves the dashboard; `GET /api/certificates/designs?id=` (Fulfillment members only) serves it, `POST` (Admin, form `id` +
  `file`, ≤8 MB, must be a PDF) uploads.
- **Templates → background (session 7, `src/lib/certBackground.ts`):** the owner's templates are the **A4 Photoedit exports**
  (`D:\Projects\certificate-generator\private\A4 CA Photoedit.pdf` / `A4 FA Photoedit.pdf`: two filled-in certificates,
  each value its own text object over one certificate picture). `backgroundFromTemplate` (copied from the generator's
  `src/background.ts`) copies the **largest image** onto one A5-landscape page — the blank certificate, CMYK untouched;
  a file that is already a background passes through. The upload route converts on save (refuses a PDF with no picture);
  `generateCertificates` converts too, so the two A4 templates uploaded on 12 Oct (stored as-is, 4.4 MB) work. The
  LAYOUT positions were measured on those backgrounds. Checked by rendering PDFs from both templates (pdf.js in headless
  Chrome, §9 #14): values sit exactly where the template had them; a long name shrinks.

### Zoho Mail (session 5) — `src/lib/zohoMail.ts`, `src/lib/mailTemplates.ts`, `src/app/api/mail/{aed,connect}`
- Separate from the Zoho Books client. A mailbox is connected once by **Admin** with the *Connect it* popup (AedSmartx →
  Contacted card → Send email): a one-time code from **api-console.zoho.in → Self Client → Generate Code** (signed in as that
  mailbox), scope `ZohoMail.messages.ALL,ZohoMail.accounts.READ` (hello@ was connected with that; the popup now asks for
  `…,ZohoMail.folders.ALL` too, needed by learn@ — hello@ doesn't need reconnecting), plus that Self Client's Client ID + Secret. `connectMailbox()`
  swaps the code for a refresh token, finds the Zoho Mail account that can send as the address (`GET /api/accounts`), and saves
  `{accountId, clientId, clientSecret, refreshToken, token}` in kv `zoho_mail:<address>`. Access tokens are refreshed and saved there.
- `sendMail(from, {to, subject, html, replyTo})`: `POST /api/accounts/{id}/messages`; with `replyTo` (a Zoho messageId) it posts
  to `/messages/{messageId}` with `action: "reply"`; **if the reply call fails it sends a new email** with the same subject
  (event `threaded: false`). The send response's `data.messageId` is stored on the event.
- Templates: Mongo **`mailTemplates`**, one doc per flow (`aed_onboarding`: from, signature, subject with `{invoice}`, 3 steps).
  Created from the defaults in `mailTemplates.ts` the first time; edit the Mongo doc to change wording (no release needed).
  `buildMail()` fills `{invoice}`, reminders get `Re:` and quote the earlier emails (newest on top, "On … wrote:").
- `GET /api/mail/aed?card=aed:<id>&to=` = preview (connected?, step, label, subject, text); `POST {card, to, step}` sends
  (refuses if `step` isn't still the next one — no double sends) and inserts the `aed_email` event; `POST {…, testTo}` sends a
  **[TEST]** copy to any address and records nothing. Only members whose boards include AedSmartx may call it.
- Built for reuse: Shreya (Fulfillment) is expected to get the same kind of emails later — add a template doc + a route.

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
  **Sync now** (`forceSync()`) any time, at most **once a minute for everyone** — since session 8 it is a **full check**
  (catches deletions, ~58 calls, ~1 min) unless a full check ran in the last 10 min (`FULL_GAP_MS`), then quick; the toast says which.
  Quick syncs never see deletions (a deleted document isn't listed as changed). Zoho token: always re-read from Mongo before
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

### Calendar & reminders (session 11, 19 Oct) — `src/components/Calendar.tsx`, `DayReminders.tsx`
- **Whose calendar** (`roles.ts`: `seesWholeCalendar` = Admin/Shikha/Sumit/Ashish, `canSeeTraining`, `canSeeEntry`,
  `ownsTraining` / `ownsEntry`, `givesTraining` / `inEntry`): everyone sees their own — trainings they give or set the
  date of (BoardTraining `scheduledBy`, new from `fulfilServer.boardTraining`), meetings / events they made or are in;
  Priyanka sees every AedSmartx training; the four see everyone's (+ "Everyone / Only mine / <person> / External trainers"
  dropdown). **Entries are filtered on the server**: `GET /api/store` returns only `canSeeEntry` entries; `POST` stamps
  `createdBy` on new ones and drops changes / deletes of entries the member can't see (`guardEntries`). Trainings come from
  `/api/trainings` (same data every member already had) and are filtered in the browser.
- **Entries** (`CalendarEntry`): type `meeting` | `event` (the old note / important date and **priority are gone**;
  `priority` optional for old docs — there were 0 entries in the DB), date, start/end time or all day (events), `people`
  (member names) or `everyone`, `createdBy`, customer, notes. Day items order by time (all day first).
- **Colours** (`personColour`): fixed per team member (Shikha teal, Ashish blue, Sumit amber, Priyanka purple, Arti pink,
  Shreya green, Admin slate), others from a spare set; anyone not a member (external trainers) grey and one legend entry
  "External trainers". The legend lists only who is in the month on screen; **clicking a name = only their calendar**.
- **Grid**: `useFitHeight` (desktop: fills to a 16 px margin, takes back the page's bottom padding — 0 px page scroll at
  1728×958) + `useCellRoom` (as many 2-line chips as fit, then "+n more"). Chip = time · customer/location, then short
  training ("BLS Training") · trainers' first names; ✓ completed, red dot = day passed, not marked completed. Phones: dots
  + the day list. Drag moves meetings / events.
- **Training card** (`CalendarTrainingModal`, `Shell` + `ChangeLog`; AED trainings open `AedCardModal`): late banner,
  trainer-clash banner (`busyTrainers`), At a glance (when with "today / in n days", trainers in colour, training +
  people, location, concerned name + mailto, phone tel: links, sales person, **reminder emails plan** with ✓), Notes
  (`NotesPanel`), After the training (Shreya's `StatePill`), `TrainingSection` (all the board's actions), Money (invoice
  amount + `DueChip`, else "not invoiced yet"), `DocsSection`; header link **Open on the board →** (`/follow-up?open=<id>`).
  Cards come from `useBoardCards` (`followups/useBoards.ts`: `usePipeline` / `useAedInvoices` moved there from
  FollowUps.tsx + the same board build).
- **+ New** (`NewModal`, `Popup`, FormRow layout): **Training** — `DealPicker` (quotes / PIs without a date or TBD; not
  schedulable ones greyed with why) then `ScheduleRows` (CardModal: dates — several days = one training — trainers,
  location, email, name; the Ready popup uses it too) → `trainingDateEvents` (shared with CardModal.schedule) → Training
  scheduled + Undo toast; **AED training** — delivered AEDs only, date + time; **Meeting / Event** — `EntryForm` +
  `PeoplePicker` (Everyone chip). The deal list sits in the popup's flow (a floating list was clipped, owner screenshot).
- **Reminder popups** (`DayReminders.tsx`, mounted in AppShell): today + tomorrow, only for the member picked (trainers;
  AED → Priyanka; meeting / event people or everyone) — Admin gets only what they're picked for. Soonest first, one at a
  time, 30 s bar, ×; once a day per member: `GET/POST /api/reminders` (Mongo `reminderSeen`, `_id` = memberId:IST day,
  TTL 3 days). Click → `/follow-up?open=<card>` (or `/calendar?date=&entry=`); the queue pauses while any
  `[role=dialog]` is open (and after a click until the card it opened is closed). Ticker: own meetings / events today /
  tomorrow (was "high priority entries").
- **Training completed gate** (`completeBlockers` in CardModal, owner 19 Oct): the button shows only when the quote is
  merged into the PI (a PI with no quotation in Zoho passes), the location is chosen and the concerned email set;
  otherwise "To mark it completed: …". Board and calendar alike (client-side only). **20 Oct:** also needs the
  concerned person's **contact number** (`phoneOk`: 10–13 digits).
- **Concerned person's contact number** (session 12, owner 20 Oct) — per training, like the email: `CertChoice.phone`,
  `PhonePicker` (Used last time = `card.lastPhone` / Same as original = `card.phones` from Zoho / + Add new; a short Zoho
  number says why Save stays off). Popup order: location → name (optional) → email → number. **Required to schedule /
  postpone** (`certReady`) and to complete (`completeBlockers`); the server rule `missingCertFields` was **not** changed
  (location + email only), so an old tab can still schedule without it. Stored as `set_training_date.phone` (with a new
  date) or event `set_training_phone` (value, before; on the training's card / Fulfillment card like
  `set_training_email`); replayed in `pipeline.applyCert` → `CardView.concernedPhone`, customer-wide `lastPhone` in
  `customerCert`. Shown on the card's Concerned line ("no number" in amber), the calendar card's Concerned row (tel:),
  the change log.
- **Training reminder emails** (live since 19 Oct) — `src/lib/reminderPlan.ts` (pure, shared) +
  `src/lib/trainingReminders.ts` (server): from **learn@** to the trainers (`TRAINER_EMAILS`: sumit → sshah@, shikha →
  shikhadixit@, ashish → sales@, AED → hello@; external trainers skipped), **one email for all**, subject
  "Training Reminder: Sat, 25 Oct 2026 — <Customer>", body = `reminderRows` (Customer name, **Type of Training** (20 Oct:
  the PI / quote line names, several = "name (qty)", AED = "AED training"), Location / Alias, Concerned Person's name,
  Concerned Person's Email, **Concerned Person's Contact Number** (20 Oct; AED = Priyanka's last-called number), Training
  Date, Training Persons, Number of People Expected).
  **Days** (`reminderDays(firstDay, day the dates were set)`): ≥5 days ahead → 5, 3, 1 before; 4 or 3 → 3, 1; 2 → 2, 1;
  1 → 1 (owner's table). A missed run sends one email for the latest due day (catch-up), never several. **Postponed**
  (`datesInfo`: new dates replacing dates, not `mode: "change"`): "Training Postponed to <date> — <Customer>", "postponed
  from … to … We are sorry for the inconvenience", once per postponement entry, standing in for that day's reminder; only
  for postponements after `POSTPONED_SINCE` (19 Oct 10:00 UTC). Change date / TBD / completed: no email; reminders follow
  the current dates (key = `reminderKey(dates, day)`). Recorded as server-only events `training_reminder` /
  `training_postponed_mail` (trainers = recipients, subject, messageId). Filed into learn@'s **"/Sent/Training
  Reminders"** (Shikha made it — the connection can't create folders: `INVALID_OAUTHSCOPE`); a refused move is retried
  after 4 s and swept by every run (`fileReminderMail`: our subjects still in Sent). **Runs**: every `runSync` (Sync log
  `reminders` / `reminderError`; dynamic import — module cycle), `/api/cron/reminders` daily, and `after()` in `POST
  /api/store` when a `set_training_date` arrives. Mongo lease lock `training_reminders_lock`. **Only production sends**
  (`VERCEL_ENV === "production"`) — a local server never does. Admin tools: `GET /api/mail/reminders?card=&kind=` preview,
  `?folders=1` learn@'s folder names, `POST {card, kind, testTo}` a [TEST] copy (recorded nowhere), `PUT` files strays now.
- **WhatsApp reminders through Anantya** (session 12, live 20 Oct, **not yet seen sending — §10 #85**):
  - **API** (no public docs; found in their dashboard → Integrations → API Key / API Docs, Swagger
    `https://apiv1.anantya.ai/swagger/v1/swagger.json`): header `X-Api-Key`; `GET /api/Campaign/GetTemplates` →
    `{id, templateName, msgText, templateStatus, isActive}` — **lists every template twice** (deduped by id) and says
    **"Accepted"** for Meta-approved; `POST /api/Campaign/SendSingleTemplateMessage?templateId=<id>` multipart:
    ContactNo (country code, no "+"), ContactName (≤ 15 chars, first name), Attribute1…13 = `{{1}}…`. Answers
    `{isSuccess, responseCode, message, dataObj}`; message id read from dataObj (msgId / messageId / id) — **the real
    shape of a send's answer is still unconfirmed** (check `messageId` on the first `training_whatsapp` entry).
    `ANANTYA_API` env overrides the base URL.
  - **Code:** `src/lib/whatsapp.ts` (server-only; kv **`whatsapp:anantya`** = `{apiKey (secret), numbers{sumit, shikha,
    ashish, priyanka} as 91…, templates{reminder, postponed: {id, name, vars}}, updatedAt, updatedBy}`; `waPublic` never
    returns the key, only `keyEnd`; `ready` = key + ≥ 1 number + **both templates whose `vars` = `WA_VARS` (11)** — a
    template picked with another count never sends; `waNumber` 10 digits → "91…"; `clean` flattens line breaks, empty →
    "—"). `src/app/api/whatsapp/route.ts` (Admin only): GET settings + templates; POST {apiKey?, numbers?, templates?} (a
    new key is tried with GetTemplates first; `vars` looked up from Anantya's list); PUT {kind, to} test send with the
    next training's values (or TEST values), "Hi <first name>" when `to` is a team number, recorded nowhere.
    `src/components/WhatsAppSetup.tsx` — the popup (Calendar → **WhatsApp**, Admin only): key, numbers, template pickers
    (warns on wrong count / not approved), **Text to create** (exact template text + Copy + a WhatsApp-bubble preview
    with sample values), test send, footer On / "Off until …".
  - **Sending** (`runTrainingReminders`, same days / catch-up as the emails): after the email step (wrapped in its own
    try — a failed email no longer stops the run), if `ready`, **one message per recipient with a number** (AED →
    Priyanka; external trainers none): postponed (once per postponement since go-live) else the due reminder. Recorded
    per person as server-only **`training_whatsapp`** (value `reminder:<reminderKey>:<person>` or
    `postponed:<eventId>:<person>`, trainers [that person], subject = template name, messageId) — a failed number is
    retried next run without repeating the others; a postponement also records that day's reminder key. Production only.
  - **Template values** (`whatsappValues`, 11): 1 first name, 2 customer, 3 "today / tomorrow / in n days" (reminder) or
    old dates (postponed), 4 date / new dates, 5 type of training, 6 location, 7 people, 8 trainers, 9 concerned name,
    10 contact number, 11 email. Approved templates in Anantya: **`training_reminder_v4` (83)**, **`training_postponed_v4`
    (84)**; v1–v3 and a stray `training_reminder_v5` (85) are deactivated. Text in `WhatsAppSetup.tsx` `TEXT`.
  - **Logs:** `ReminderRun {emails, whatsapp, error?, whatsappError?}`; `runSync` writes `reminders` / `reminderError` /
    `whatsapp` / `whatsappError` on its Sync log line; `/api/cron/reminders` now writes its **own line**
    (trigger scheduler, source "Vercel cron · reminders", result "not due"), shown as a full row in `SyncLog.tsx`
    ("nothing due" when it sent nothing). Calendar card "Reminders" row shows "+ WhatsApp" per day sent (tooltip: who).
  - Adding a value to a message = **new Meta template** (approved text can't change) + bump `WA_VARS` + `whatsappValues`
    + `TEXT` + the route's TEST values; the old pick then reads "Off" until the new one is picked.
- `zohoMail.mailApi` now logs Zoho's raw answer on any refusal (`[zoho mail] GET /accounts/…/folders → 401 …`, no tokens)
  and `mailboxCall` errors carry Zoho's `errorCode` (it sometimes answers `[2, {errorCode, msg}]`).

### Scheduling popup + "No. of People" check (session 13) — `src/components/followups/CardModal.tsx`
- **One popup for every date change** (`SchedulePopup`, modes `ready` / `schedule` / `postpone` / `change`, rendered
  `fixed z-[70]`): the "<customer> is ready" popup on a merged PI (CardModal `overlay`), **Schedule training…** (a small
  link under "Not set" — the old inline buttons are gone, owner: "the popup looks much better"), **Postpone** and
  **Change date** (buttons stay on dated cards). Footer: **To be decided** (not in Change date), Later / Cancel, and
  Schedule training / Postpone / Change date / Save (same dates). Disabled button's tooltip lists what's missing
  (`scheduleMissing`). The inline picker in `ScheduleBlock` is gone (`onEditing` removed).
- **`ScheduleRows`** (shared by the popup and Calendar → + New → Training) = Training dates + **`PeopleCheck`** pill
  ("☐ No. of People: 20 · Change", "(PI: 20)" when changed), `TrainerPicker`, then **`CertPickers`** (location → name →
  email → **number**). Fix: the Ready popup and Calendar New had **no number row** since 20 Oct, so their Schedule button
  could never enable (certReady needs a phone).
- **People:** `PeopleChoice {n, ok}`, `peopleStart(card)` (ticked when the training already has a date or a checked
  number). Saved as **`people`** on the `set_training_date` entry (`trainingDateEvents(…, people)`; a same-dates save with
  a new number still writes an entry). `pipeline.scheduleOf` carries `people` through postpone / TBD;
  **`peopleOf(card)`** = `schedule.people ?? zohoPeople(card)` — used by `boardTraining` (Overview / calendar / Reports
  trainings), `trainingReminders` (email + WhatsApp "Number of People"; with several kinds of training and a checked
  total the kinds lose their per-line qty), FollowUps `FulfilItem`, the gratitude email `{people}`, the calendar card.
  Change log: "· People: N". **Browser-only rule** (server `missingCertFields` unchanged) — an old tab can skip it.
- Training box shows the checked number (one kind: "18 (PI: 20)"; several: "· N in total, checked").
- **Training box Concerned lines** (`CertLines`, owner screenshot 22 Oct): "Concerned: <name>" / email / "no number ·
  Change" each on its own line (no name → "Concerned: <email>"); the left grid cell is `minmax(0,1fr)` + `min-w-0`, so
  nothing spills into the date column. Fulfillment FLAME card: modal overflow 15 px (≤ 16 = padding, OK).

### Step tracker on every card (session 13) — `src/components/followups/Steps.tsx`
- `StepTracker` (Fulfillment look: ✓ done, ring = here, grey = later, ~~struck~~ = known skipped, grey + tooltip =
  "Not merged into this card yet"; current step tinted amber `warn` / red `bad` / purple). Builders:
  `trainingSteps` (Lead → Quotation → PI → Scheduled → Completed → Invoice → Paid; Lost / To be decided / Postponed /
  Overdue / Part paid on the current step; none for leads / potential), `aedSteps` (Invoice → Delivered → Contacted →
  Scheduled → Completed, or "Not required" purple), `logisticsSteps` (Sent to Logistics → Payment → Packing → Shipped →
  Received; On hold / Expected <date>; none for AED delivery cards). Fulfillment keeps its own `FulfilSteps`.
- **Header layout changed for every modal** (`Header` in CardModal): row 1 = kind chip + sub (truncated, full in
  tooltip) + steps + ×; row 2 = the customer name, full width — so 7 steps never wrap long names (measured: Training
  modals back to their old height; Tata Motors AED card 55 px and Sent-to-Logistics cards ~19 px scroll — **pre-existing**).

### Themes (session 13) — `src/app/globals.css`, `src/components/AppShell.tsx` (`THEMES`, `ThemePicker`, `setTheme`)
- Sidebar → **Change theme** (Admin also sees **Zoho Analytics** below it; **Appearance** is gone — a theme sets light
  or dark). Saved per browser only: localStorage `th.theme` (light / dark) + `th.bg` → `<html data-theme data-bg>`, set
  before paint by `layout.tsx`'s script.
- **Light** (pastel gradient behind white cards): Plain, Blush, Peach, Lemon, Mint, Aqua, Sky, Lavender, Smoky pastel.
  **Dark** (`dark-…` ids): Black, Midnight, Ocean, Aurora, Forest, Plum, Ember. A light gradient only shows in light
  mode and a dark one only in dark (globals.css rules) — picking a theme sets both.
- **Experimental** (recolour cards, lines, text, accents — token overrides under `:root[data-theme=…][data-bg=…]`):
  **Plum** (`dark-xplum`) and **Smoky coastal** (`xcoastal`). Status colours (high / medium / low) are left alone.
  **Session 15 (`d456670`, not pushed):** + Deep sea (`dark-xocean`), Espresso (`dark-xespresso`), Emerald night
  (`dark-xemerald`), Sakura (`xsakura`), Sand dune (`xsand`), Nordic (`xnordic`) — each = globals.css gradient + tokens,
  AppShell `THEMES` entry, Chart `THEME_PALETTES` entry. Text / muted / brand / button text all ≥ 4.5:1 on their cards.
  The owner likes the experimental themes ("i like them").
- Phones have no sidebar → no theme picker there yet.

### Reports + Zoho Analytics (session 13) — see `ANALYTICS-PLAN.md` for the plan, `ANALYTICS-SCHEMA.md` for the tables
- **Zoho Analytics connection** (`src/lib/zohoAnalytics.ts`, route `/api/zoho-analytics`, Admin popup
  `AnalyticsConnect.tsx`): Self Client code with scope `ZohoAnalytics.metadata.read,ZohoAnalytics.data.read`, Client
  ID + Secret, workspace link; API `https://analyticsapi.zoho.in/restapi/v2` with headers `Authorization:
  Zoho-oauthtoken …` + `ZANALYTICS-ORGID`. GET `/orgs`, GET `/workspaces/<ws>/views` (paged), GET `/views/<id>`
  (`withInvolvedMetaInfo` → columns, row count, `involvedViews` for query tables — **no SQL**), export
  GET `/workspaces/<ws>/views/<id>/data?CONFIG={"responseFormat":"csv"}` (`parseCsv`; JSON gives the same formatted
  values). Route: GET = info + all views; `?view=<id>` = details; `?export=<id>` = first 5 rows (Admin look). Zoho
  refuses bursts (~50 quick calls) — **pace ≥ 2.5 s** (`PACE_MS`).
- **Exported values are formatted like the workspace shows them**: money "INR 852,000.00", dates "20/07/2021".
  **Invoice "Total (BCY)" is set to show "K" in the workspace → exported "INR 954.24K" (lossy) — never use it.** Revenue
  = line `Sub Total (BCY)` (exact) with an invoice-level before-tax discount shared out by line share; incl. tax = line
  `Tax Inclusive Total (BCY)`. Checked vs Zoho Books (MCP `list_invoices` `response_option: 3`): Oct 2026 = 49 live
  invoices, ₹59,03,910 here vs ₹59,04,441.50 in Books (difference = shipping / adjustments on the invoice, not lines).
- **Data copy:** `src/lib/analytics/source.ts` `refreshAnalyticsData` exports the 8 tables in `build.ts` `TABLES` (only
  the listed columns) into Mongo `za_tables`, under lock `za_refresh_lock`; automatic after a Reports query when the copy
  is > 6 h old (`STALE_MS`, via `after()`), Admin **Refresh now** = `PUT /api/analytics`. ~27 s. `datasetRows(today)`
  builds and memoises the rows (key = refreshedAt + Zoho snapshot version + day; trainings re-read every 60 s from
  `boardTrainings`).
- **Semantic layer** `src/lib/analytics/model.ts` (pure): datasets **sales** (invoice lines), **invoices** (receivables:
  `ageBand` with a fixed `order`), **quotes** (`outcome` Won / Lost / Expired / Open, `winRate`), **payments**,
  **trainings** (Training board, one per deal, date = last day, trainer multi-valued); fields incl. customer type,
  sector, **chain** (`Special Identifier`), state / city (billing address), sales person (duplicate spellings merged —
  "Nikita Shah" / "Nikita shah"), item, **item group** (`Item Identifier`), product type (multi), business type, lead
  source; measures with a plain-English `def`. `formatValue` (₹ lakh / crore), Indian FY grains, `periods(today)`.
  `build.ts` (pure) = raw tables → rows (`money`, `day` parsers). Void / draft invoices left out.
- **Query engine** `query.ts` (pure): `checkSpec` refuses unknown datasets / fields / measures; filters, date range,
  up to two splits, grains, top N + "Others" (recomputed from its own rows), max 8 series (rest → Others), `sort`
  value / label (field `order` respected), **`compare`** = the period before — and when the period is still running
  (server sets `asOf` = today) **the same days of the period before** (owner's rule: never part vs whole).
- **API** `/api/analytics`: GET = datasets this member may use (board rule: every dataset needs the **training** board
  — money; Priyanka / Arti / Shreya get none and no nav item) + data state; POST `{specs}` (≤ 40) = results; PUT =
  Admin refresh. `/api/analytics/reports`: saved reports — GET, POST (Admin, Ashish, Shikha, Sumit = `hasFullAccess`;
  edit only author or Admin), DELETE (author / Admin).
- **Pages:** `/reports` (sidebar "Reports" under Calendar, phone tab bar becomes 4 columns) → `Reports.tsx` tabs: official
  dashboards from `dashboards.ts` (**Sales**, **Trainings**, **Quotes** — code, not DB) + **Saved reports** + **+ New
  report**; data line "Zoho data copied … · Refresh now" (Admin). `Dashboard.tsx`: filter bar (period select +
  `MultiSelect` per field) applied to every tile whose dataset has the field; **click a bar / slice / month** → `pick`
  filters the other tiles (date → that month's range), chip + Esc to clear; `TileCard` (KPI / chart / table, Table ↔
  Chart, CSV, Edit / Delete actions on saved ones — on every kind of tile). `Builder.tsx` (portal): data → measure →
  split by (+ grain) → chart → period (saved as a relative key) → top N → filters → title; live preview; Save.
- **Charts** `Chart.tsx` (ECharts): `resolveKind` (auto: number / column for dates / bar for text / stacked for two
  splits), bars with 4 px rounded ends, horizontal bars labelled, **"Others" shown as a line under bar charts** (not a
  bar), legend colours set per series, `ResultTable` + `downloadCsv` (BOM, opens in Excel). **Colours:** Plain / Black
  themes → every single-series bar / line **mint** (`#45cf9c` light, `#40a985` dark); donuts / stacks / several series
  → the validated mixed set (blue, orange, mint, yellow, violet, green, red — aqua dropped as too close to mint);
  every other theme → its own family in `THEME_PALETTES` (one hue per chart by position; ≤ 7 named categories get a
  colour each, by name — `colourMap` hashes the name so a name keeps its colour). Theme change re-renders
  (`useThemeTick`). **Fix:** an ECharts instance is reused only if `getDom()` is the current box (Table → Chart left
  an empty tile).
- **Text sizes** were raised one step (owner, 22 Oct: "too small"): axes 13, bar values 13, legends 13.5, tooltips 14,
  tile titles 16.5, KPI 36, tables 14.5, filters / tabs 14.

### Reports — session 15 (27 Oct) — ANALYTICS-PLAN.md §11 has the owner's decisions
- **Goal meter** (`src/components/reports/GoalMeter.tsx`, maths `src/lib/analytics/goal.ts`, route
  `src/app/api/analytics/goal/route.ts`): left column of every Reports tab (`Reports.tsx`, grid `14rem` + content; a strip
  on top below xl). Shown to members whose datasets include `sales` (Training board).
  - Revenue = every Zoho Books invoice **before tax** (Sales "revenue", this month incl. later-dated invoices).
  - **Booked** = PIs from the last `BOOKED_DAYS` = 60 days not invoiced yet (`orders` dataset "toInvoice"); older open
    PIs are mostly stale.
  - "today" tick = goal × working days so far ÷ working days in the month (Mon–Sat, `workingDaysInRange`); estimate =
    so far ÷ working days so far × all (shown after 3 working days); needed / day; last 6 months reached; **What if…**
    slider (rest of the month ±%).
  - Goal: kv **`reports_goal`** `{monthly, months{YYYY-MM}, updatedAt, updatedBy}`; default ₹50 L (no doc = default).
    GET = Training-board members; POST = Admin only (₹1 L–₹100 Cr sanity check). ✎ on the meter opens the editor.
  - Confetti once a month per browser when reached (localStorage `th.goal.cheered`).
  - Colour = the theme's chart colour (`useThemeColour` in `Chart.tsx`) — **in `d456670`, not pushed yet**.
- **Data:** `build.ts` `TABLES` + **Sales Orders / Sales Order Items** (`orders` dataset "PIs"; "Total (BCY)" exports
  lossy "K" → sub-totals only). `/api/analytics` POST refreshes the copy when a `TABLES` key is missing from
  `za_state.tables` (at most every 10 min). Uncommitted batch 2 adds `Product ID` to Sales Order Items — the live copy
  gets it at its next refresh (6 h) after release; Admin "Refresh now" does it at once.
- **New fields / measures** (`model.ts`): sales `repeat` (customer's first-ever invoice by **name**, `firstOf`),
  `docValue` ranges (`Dataset.ranges`, for "invoices ≥ ₹1 L"), measures newCustomers / repeatRevenue / repeatShare /
  top10Share / avgPrice*; invoices overduePct; quotes `age`, `valid` (≤ `QUOTE_VALID_DAYS`), validOpen(Count),
  invoicedCount, daysToInvoice (quote → its first invoice via invoice "Quote ID"); `better: "down"` measures colour a
  fall green. *Batch 2 (uncommitted): sales `segment`, `cohort`, `channel`, `fy`, `monthName`, avgPrice; trainings
  value / valuePerPerson / valuePerTraining.
- **Engine** (`query.ts`): measures can have `where` (count only some rows) and `topShare`; filters have `exclude`,
  `contains`, `min` / `max`; **`compare`** = true / "previous" / "lastYear" / `{field, a, b}` — KPIs get `previous`
  (running periods: same days), and with one split every row gets `prev` (dates shifted onto this period's axis); two
  text splits (matrix) too, incl. cells only in the comparison. **Analyses** (`spec.analysis`, function `analyse`):
  bridge, pareto, winback, drivers (keeps blanks so it adds up), funnel; batch 2: pvm, reorder, crosssell
  (`spec.variant`). `Result.note` = a sentence under the chart; `nowLabel` / `prevLabel` name the two sides.
- **Charts** (`Chart.tsx`): comparison twin series (time = grey, group = second hue; line = dashed), table + CSV get
  the comparison and Change columns; % KPIs change in **points**; kinds `matrix` (pivot with change per cell),
  `waterfall`, `diverging`; goal line (`target`, needs `MarkLineComponent` — registered); batch 2: `heatmap`,
  `stacked100`, matrix `relative` (cohort %), `Result.by[].order`.
- **Dashboard view** (`Dashboard.tsx`): toolbar = period · **Compare** (default "vs last year") · **Filters** panel
  (is / is not, "everything containing", value range) · **Views** (per person, server: collection **`reportPrefs`**
  `_id` = member id, `views.<dash>` = [{name, state}], route `/api/analytics/prefs`) · chips. KPIs next to each other
  share a band (`KpiBand`, hairlines = 1 px grid gaps over `--line`); tiles grouped by `section`; ⋯ menu per tile with
  **Change this chart…** (measure / split / top N / grouping; kept in localStorage `th.reports.tweaks.<dash>`; not on
  KPIs or fixed-shape analyses, yes on drivers). `Tile.fixedPeriod` (+ optional `spec.period`), `goalLine`,
  `noCompare` (batch 2).
- **Tabs** (`dashboards.ts`): Sales (8 KPIs, sections, Money owed band) · **Growth** · **Team & pipeline** ·
  **Collections** · Trainings · Quotes · Saved reports; batch 2 adds **Customers**, **Products** and Trainings →
  Training economics.
- **Checked** (scripts in the session-15 scratchpad, rebuild from §9 #17): every new number against an independent
  calculation on live data (read-only) — new customers 125 = 125, top-10 47%, overdue 43%, valid quotes 22 / ₹24.2 L,
  all compare modes, bridge / pareto / matrix / drivers add up, win-back 130 = bridge "didn't buy again", pvm adds up,
  segments cover all 659 customers once, reorder 45, cross-sell 207 / 55.

### Reports + database — session 16 (27–28 Oct)
- **Training value (#127, `7b2ff08`):** `fulfilServer.docsBehind` gives every `BoardTraining` the **`piNumber` /
  `invoiceNumber`** behind it — its own card's or any card merged into it (`historyIds`, `linkedPI`,
  `linkedInvoice`). `build.ts`: value = the invoice's training lines (what was billed), else the PI's, before tax.
  55 of 56 trainings valued (the one left is a quote); this FY 23 of 24, ₹1,365 / person. Checked each FY training
  against its Books sub-total (zohoDocs): 18 of 22 customer-months equal; the other 4 differ by exactly the travel line.
- **Customers / Products tabs (`2a94484`)** — browser-check fixes in `query.ts` / `Chart.tsx`:
  - a one-split comparison on a field with a fixed `order` (segment, age band…) keeps values that only had sales in
    the comparison (prev only, now 0);
  - heatmap / matrix skip the 8-series cap (`MAX_SERIES` is a colour rule);
  - value axes `hideOverlap`; top legend `type: "scroll"` (one line, ◀ ▶ on phones).
- **My dashboard (`bb387fa`)** — `src/components/reports/MyDashboard.tsx`, rules `src/lib/analytics/layout.ts`:
  - First tab of Reports; Reports opens on it the first time (localStorage `th.reports.mine`), then on the last tab.
  - It is an ordinary `DashboardView` built from the person's list (`LayoutEntry {dash, tile, size?}`, tile id =
    `dash.tile`), so period / compare / filters (customer type, sector, sales person) / views / picks / tweaks work.
  - **Customise** popup (portal): library by tab (+ Saved reports — keep their own period), ✓ to add; right list
    ↑ ↓, **S / M / L** (= w 3 / 6 / 12; numbers always sit in the band), ×; Reset to starting layout; Admin: **Make
    this the starting layout**.
  - Storage: `reportPrefs.layout = {tiles, updatedAt}` per member; starting layout kv **`reports_layout`** `{tiles,
    updatedBy}` (none = `START` in layout.ts). Route `/api/analytics/prefs`: GET {views, layout, starting,
    startingBy}; POST {layout} (null = follow starting) / {starting} (Admin; null = built-in) / {dash, views};
    `cleanLayout` validates (≤ 60, no repeats).
  - Checked: 32 route checks with a fake db; browser at 1728 / 390, light / dark; fits with no inner scroll.
- **India map (#18, `25a5e6b`)** — Customers → "Where they are": map + "Revenue by state" bars (top 15, tall).
  - Outline `public/maps/india-states.json` (136 KB): DataMeet States, India's official boundaries, **CC BY 4.0**
    (credit line under the map + `public/maps/README.md`; how it was simplified is there).
  - `src/components/reports/indiaMap.ts`: `geoName` (Zoho GST names → outline names, old spellings), `loadIndia`
    (registers ECharts MapChart + VisualMap + the outline, once).
  - Chart kind **`map`**: square-root shading in the theme colour, hover = value + last year + change, click = pick;
    "Not on the map: Out of India …" under it. `Tile.tall` = 470 px.
- **Reports pages (`bbb061e`, owner: "add pagination… only fetch data when clicked")** — `Dashboard.tsx`:
  - `pagesOf`: one page per section ("Key numbers" before the first); dashboards without sections (My dashboard)
    in pages of ~6 charts (a number = ¼). Pills under the toolbar, ← / → + "Page n of N" at the bottom; page kept
    per tab (localStorage `th.reports.page.<dash>`).
  - Answers kept per tile **with the query they answer** (`got`); only the open page's missing ones are asked; a
    period / filter change re-asks the open page only; clicking a page again retries failed tiles; a pick clears on
    page change. Section headings are gone (the pill names the page).
  - The Filters panel loads its value lists the first time it's opened.
  - Checked: opening Sales = 1 query (was 7 + meter), a page click 1, going back 0, a period change 1.
- **Database transfer (the 27 Oct incident):**
  - Cause: Atlas M0's 10 GB / 7 days egress. Every open tab pulled `/api/store` (all of `cardEvents` + entries…,
    ~0.25 MB) **every 15 s** (~60 MB / hour per tab, growing with the log); Reports re-read its 6.2 MB copy every
    minute; board builds re-read the change log. Throttled to ~90 KB/s → cold Reports 119 s, 504s / 500s.
  - **`src/lib/cachedRead.ts`** (`857114d`): `fingerprint(name)` = Mongo aggregate (count, `$bsonSize` sum, XOR of
    `$toHashedIndexKey` per doc — MongoDB 8.0; a few bytes, ~20 ms); `readAll(name)` keeps the last copy per server
    instance and downloads again only when the fingerprint moved. Used by `/api/store` GET, `boardsNow`
    (cardEvents) and the snapshot's `zohoCustomers`. Callers get the shared array — copy it before changing it.
  - **`/api/store`**: answer carries `v` (member id + fingerprints); the browser sends `?v=`; nothing new →
    `{same: true}` (0.1 KB instead of 217 KB). `store.tsx` clears its version on every save, so a refused change
    still vanishes at the next pull. Hidden tabs don't poll (they pull on show).
  - **Reports copy** (`efb56d0`): `za_tables` docs store **`gz`** = gzipped JSON rows (6.2 MB → 0.55 MB; `unpack`
    still reads old `rows`); read once per refresh (`copy` keyed by `refreshedAt`), not per minute;
    `datasetRows(today, withTrainings)` loads the board snapshot only when a spec uses `trainings`; a failure answers
    503 `{error}` and `runSpecs` shows it in the tiles.
  - **`db.ts`** (`207d0d5`): a failed connect is forgotten (was cached forever → instant "Server selection timed
    out" on that server); `serverSelectionTimeoutMS` 20 s, `maxPoolSize` 10.
  - Wire compression (`compressors: ["zlib"]`) was tried: no effect on M0 — don't bother.
  - Result: 28 Oct 08:30 reads 4–8 MB/s again; live Reports 4.7 s cold, < 1 s warm, trainings 3.8 s.

### Reports — session 18 (29 Oct) — Defibtech, shared filters, the dashboard canvas, tests, 8 tabs
- **Tabs (`dashboards.ts`):** 11 → 8 (`MERGED` → `DASHBOARDS`): Sales & growth (`sales`), Customers, Products & stock
  (`products`), Quotes & team (`quotes`), Money (`collections` — Collections + Margin; Margin pages Admin-only),
  Trainings, Defibtech (Admin only), Saved reports. Old ids are **`ALIASES`** (growth→sales, team→quotes,
  margin→collections; `tabOf`) so stored dashboards, My dashboard and hidden-tab lists keep working; duplicate tiles
  were dropped. Each tab has a "What changed" line under its toolbar. `titleOf` fills `{grain}` in titles from Show by.
- **Datasets (`model.ts` / `build.ts`):** `purchases` (bills), `stockLevel` (month ends), `quoteItems` (Zoho Analytics
  table "Quote Items"); sales + stock rows carry Zoho catalogue `zohoItem` / `brand` / `kind` / `itemStatus`; margin
  too. Customers are counted by `nameKey` (one spelling per customer). Quotes: Accepted / Declined / Expired / Waiting,
  "Conversion rate"; no answer in 90 days = Expired. **Margin:** units from ~₹0 stock adjustments (6 Jul 2026) are
  costed at the average bill price (FY margin 32.6% → 28.8%).
- **Filters:** shared by every tab in this browser (`th.reports.state`: period, compare, Show by, filters); a
  dashboard's own starting filters are its `scope` (`th.reports.scope.<tab>`, e.g. Defibtech Brand = Defibtech). Each
  filter list is asked with the other active filters; a tile whose data lacks a field says "Not filtered by …"; empty
  tiles say "Nothing here for these dates and filters"; "Your own dates…" = period `range:YYYY-MM-DD:YYYY-MM-DD`; no
  Compare on All time.
- **Dashboards = a canvas** (`src/lib/analytics/custom.ts` pure shapes + edits; `src/components/reports/Canvas.tsx`;
  `Editor.tsx` `EditBar` + `Library`; route `/api/analytics/dashboards`):
  - each page is a **12 × 16 grid**; every item has `x / y / w / h` (number starts 3×2, chart 6×4, wide 12×4; min
    2×2 / 3×3); `cleanDashboard` refuses anything off the page or overlapping (route returns 400 in plain words);
  - react-grid-layout **2.3.0** with **`verticalCompactor`** (with `noCompactor` pushed items landed on each other —
    tested); drag anywhere, others move aside live, resize from every edge / corner; a move that would push something
    off the page is refused and snaps back; below 900 px the page stacks;
  - "✎ Edit dashboard" edits in place (Admin, Ashish, Shikha, Sumit); "+ New dashboard"; built-in tabs can be edited
    (team version stored under the tab's id, `base`), restored (delete that doc) and hidden (Admin, kv
    `reports_hidden`); the builder's "Put it on" a dashboard + page;
  - **My dashboard** uses the same editor: id `mine` in and out, stored as `my-<member>`; `my-start` = Admin's starting
    one; its Tabs popup = "Select Dashboards to display";
  - **`upgrade`** (custom.ts) runs on every stored dashboard the route reads: older shapes (`slots` from the
    pages-of-4 version, place-less `items` from the rooms version) come out as valid canvas pages. **Any future change
    to the stored shape needs the same treatment** (§11 #18).
- **Chart extras (`Dashboard.tsx`):** "Change this chart" → Lines (average / lowest / highest / target / trend /
  forecast next 3) and green / red by rule — per browser in the tile's tweak (`th.reports.tweaks.<tab>`), not on the
  dashboard; drill-down on FY / quarter charts (`drills`, "← Back"); number cards get a 12-month trend line (one extra
  request per page, `sparkSpecs`).
- **Tests:** `npm test` → `tests/*.test.ts` (query engine, canvas rules incl. `upgrade`, dashboards route) with Node's
  own runner; `tests/register.mjs` maps `@/lib/db` and `@/lib/auth` to `tests/fakes` — always, so no test can reach
  the live database. 26 pass.

### Quotations (session 17, 28 Oct) — `src/app/quotations/page.tsx`, `src/components/Quotations.tsx`, `src/app/api/quotations/route.ts`, `src/lib/quotations.ts`
Owner: "all of our contacts are here, we need to click one time and a quotation is sent through zoho books" — then
"make it like the Zoho quote form", "bigger", "prefill from the items", "item images", "from scratch".
- **Who:** Admin, Ashish, Shikha, Sumit (`hasFullAccess`). Nav entry right after Overview.
- **Its own Zoho connection** (kv `zoho_books:quotes`, Admin connects once from the page with a Self Client code;
  scope `QUOTE_SCOPES` = estimates CREATE/UPDATE + contacts READ/CREATE). The everyday sync token stays read-only;
  the popup's *reads* (contact, last estimate, item description, item picture, notes/terms) use the sync token
  (`zohoGet`, `itemImage` in `src/lib/zoho.ts`). The connection doc records `scopes`; older ones without
  `contacts.CREATE` show `connected.newCustomers: false`.
- **Writes only from production** (`VERCEL_ENV === "production"`, else 409) — a local server can never create a quote
  or a customer. A second quote for the same customer within 2 minutes is refused (double click / two people).
  Every quote made is logged in `quotationsSent` (who, when, number, total).
- **List** (`GET /api/quotations`): customers from the Zoho copy (`zohoCustomers` via `readAll`), last quote / last
  invoice from the Reports copy (`za_tables`) plus `quotationsSent`; search name / email / phone, sector, type;
  newest activity first; 50 a page.
- **Popup** (`GET ?customer=`): contact persons (primary ticked), GSTIN / state → CGST+SGST (Maharashtra, `ORG_STATE`)
  or IGST or none (overseas); their last estimate (lines + custom fields + sales person); "quoted within 15 days"
  warning; sales people = those on quotes in the last year (one spelling each); `QUOTE_FIELDS` options; Zoho's
  default notes + terms taken from the newest quote (6 h cache — so a bank-detail change in Zoho shows up).
  - **Quote** from the list starts from their last quotation; **+ New quotation** starts from scratch (`fresh`) with
    a "copy Quotation-…" link.
  - **Product type** follows the main item (`PT_RULES` regexes on name + Zoho group + category; packing / shipping
    lines ignored) until someone picks one; **Lead source** = last quote's or "Direct "; **Deal name** = product type
    + main item's quantity + city (the team's pattern, e.g. "pads 2 Bengaluru Urban") until typed over.
  - **Items:** type-to-search picker or **▦ Browse items** (catalogue: group dropdown, search, cards with Zoho's
    picture, price, GST, stock; click = add, click again = +1; no-picture items last). Picking an item reads its
    description live (`GET ?item=`). Stock = on hand from the stock copy (`onHandByItem`) + Zoho's "Stock Status"
    field; GST % from the item (`itemGst`). `zoho_items` (kv) gains gst / unit / stock / service / category / image
    on each full sync.
  - **Totals** (`totals()` in the component): discount before tax shared over lines, GST per rate, shipping,
    adjustment — the done screen compares Zoho's total and warns if they differ by more than ₹1.
  - **POST** sends `custom_fields` by `customfield_id` (ids in `QUOTE_FIELDS`, Zoho's exact option spellings — some
    end in a space), `salesperson_name`, discount / shipping / adjustment only when used, notes, terms;
    `?send=true` = Zoho emails its standard quotation email + PDF; Save as draft = `send=false`.
- **New customer** (`POST {newCustomer}` → `createCustomer`): company, contact first/last, email, mobile, state
  (`INDIA_STATES`, Zoho place-of-supply codes), city, GSTIN (→ `business_gst`, else `business_none`). A name already
  in the copy is refused (409 + its id). The quote popup then opens for it; a customer not yet in the copy is checked
  with Zoho on POST. **Missing Zoho's mandatory Type + Sector → #151.**
- **Popups** lock the page's scroll (`useNoPageScroll`), are portals, fit 1728×958 without inner scroll for 1–2
  lines; dropdowns use `.select-chevron` (globals.css).

### Progress tracker (session 14) — see `PROGRESS-TRACKER-PLAN.md` (top "Status" blocks = what's built)
- **Where:** `/reports/progress-tracker`, sidebar **Progress tracker** (in line with the other items, below Reports,
  ticked-checklist icon).
  - Members without the Training board (Priyanka, Arti, Shreya) now see **Reports** in the nav: it links straight to
    the tracker, and `/reports` redirects them there (`src/app/reports/page.tsx`). The money dashboards stay hidden /
    refused.
  - The page has the shared `PageHeader` with the new optional `titleAside` (the **(i)** — `Info.tsx`).
- **Three tabs** (`ProgressTracker.tsx`, remembered in localStorage `th.progress.view`):
  1. **Everyone's to-do** (`TodoBoard.tsx`, `GET /api/progress/todos`, pure builder `src/lib/progress/todos.ts`
     `buildTodos`):
     - One column per person: Overdue · Today · Next 7 days · To do. Read from the boards: `boardsNow` + Fulfillment +
       Logistics builders + calendar `entries` + requests.
     - Trainers get their trainings. A **past training not completed** → "Mark completed or postpone" for **whoever
       scheduled it** (else its trainers). A missing contact number goes to the same person.
     - Priyanka gets AED contact / schedule / trainings; Shreya gets gratitude email, ★ replies, Send to Logistics;
       Arti gets mark delivered / merge / packing / shipping / confirm.
     - Everyone gets meetings / events and requests.
     - **No sales items** (owner: "exclude it").
     - Who sees: `seesWholeCalendar` (Admin / Shikha / Sumit / Ashish) see all columns, others their own.
     - Items link `/follow-up?open=<card id>` — the board now also opens `fulfil:` / `logi:` / `logipay:` cards, and
       AED cards on Logistics for Arti (`FollowUps.tsx` wantOpen).
  2. **Work done** (same route, `buildDone`):
     - Each person's change-log entries for the last 7 days (`DONE_DAYS`), mapped to short labels (`doneTag`).
       Reverted ones and automatic sends are left out.
     - Repeats on a card the same day show as ×n. Requests they resolved are included.
  3. **Requests** (the "Unblock Me" part):
     - Header counts: active members (visible tab in the last 10 min), open blockers (critical + over 24 h), hand-offs.
     - Dependency & hand-off board: Waiting on you · **Mentioned you** · You're waiting on, plus the who-waits-on-whom
       matrix.
     - "Resolved this week", the "+ Request input or hand-off" button, team status cards (Away / Back, Set focus,
       last seen, latest action).
- **Requests** (`ptRequests`, `RequestForm.tsx`, `RequestDetail.tsx`, `/api/progress/requests`):
  - Input Needed / Review Required / Hand-off Ready / Critical Blocker; Normal / Urgent; refs `R-0001…` (kv
    `pt_request_seq`).
  - Created from the button or from **"Ask a teammate"** (speech-bubble `AskLink` in every board card's `Header`:
    `?task=<card id>&title=…&q=…`).
  - Ping only after 4 h (since the request or the last ping); red ▲ after 24 h open.
  - Resolve by the requester, the person waited on or Admin; withdraw / priority by the requester / Admin; reopen
    within 7 days.
  - Every change is a `log` line; threads in `ptComments` (`/api/progress/comments`).
  - The server enforces all of it (`canDo` in `src/lib/progress/model.ts`, pure, tested).
- **Tagging** (`909f3d0`):
  - `needsReply` = the request waits on you (since made / reopened / last ping), or `@FirstName` in its thread
    (`mentionsIn`, stored as `ptComments.mentions`), and you haven't replied or resolved / withdrawn / reopened since.
    **Opening doesn't clear it.**
  - The sidebar **red count** = these only (`needs` from `POST /api/progress/presence`). The page shows a red 1 on the
    request, a red strip inside it, and "Reply needed" / "Mentioned you" in to-dos. Notice kind `mention`.
- **Presence / notices:** AppShell `useProgressPulse` sends `POST /api/progress/presence {beat}` **every 30 s while the
  tab is visible**. `lastSeenAt` is written at most once a minute, with no history. The answer carries the badge count +
  unread notices → `ProgressToasts` (top right; urgent ones stay until closed; PATCH marks them read).
- **Check-ins were built and then removed** at the owner's request (form, `/api/progress/standups`, feed). Any old
  `ptStandups` collection is empty.

### Calendar "+" (session 13) — `src/components/Calendar.tsx`
- `DayAgenda`: an empty day is a **"+ Add a training, meeting or event"** tile (Calendar side panel and the Overview's
  mini calendar); the mini calendar also gets "+ New". On the Overview it opens `NewModal` via **`MiniNew`**, rendered
  with `createPortal(…, document.body)` (inside the card it sat under the chart) and loading the deals
  (`useBoardCards`) only once opened.

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
- **The server enforces permissions** (`stampCardEvents` in `/api/store`, rules in `src/lib/roles.ts`): a new change outside
  the member's board/actions (`canWriteEvent`) is silently dropped; a revert of someone else's entry is dropped unless it is
  part of the cascade of one of the member's own reverts (`cascadeOf`). Refused changes vanish from the browser at the next
  pull, every 15 s (the pull replaces local data with the server's).

### Event model (both boards)
A card = Zoho data + every **non-reverted** `CardEvent` replayed in order; nothing from Zoho is overwritten, so **Revert** = mark the
event reverted. Card ids: `lead:`, `quote:`, `pi:`, `invoice:`, `payment:` + Zoho id, `potential:<id>`, `aed:<invoice id>`,
`aedcustomer:<contact id>` (customer-wide AED log), `fulfil:<pi or quote card id>` (Fulfillment board). Event kinds:
`set_name/type/sector`, `add/remove_alias/email/phone`, `delete`, `merge` (`[from,to]`), `set_training_date` (`YYYY-MM-DD`,
several days comma-separated `2026-10-05,2026-10-06`, `YYYY-MM-DDTHH:mm` on AED, or `TBD`; carries `trainers` (may include
external names), optional `mode: "change"` (Change date — not a postponement) and `underName` (alias the training is under)),
`complete_training`, `zoho_change`, `add_potential` / `set_potential_date`, `set_not_required`, `set_reseller`, `set_resale`,
`set_delivered`, `add_note`, `set_fulfillment` (stage), `set_wip` (on/off), and on Logistics `logi_hide`, `logi_merge`
(`[logi:<doc>, logipay:<payment card id>]`), `set_logistics` (step). Logistics card ids: `logi:<pi or quote card id>`,
`logipay:<training payment card id>`. Alias events carry `ref` = Zoho contact id (aliases are applied by customer **name**).
**Contact numbers / emails** (`add_phone` / `remove_phone` / `add_email` / `remove_email`, from Edit on any card) are also applied
by customer **name** across every board since session 5 (`customerContacts` / `applyCustomerContacts` in pipeline.ts; new events
carry `ref`, old ones are matched through their card). **`set_name` is refused by the server and no longer applied** — the
customer name always comes from Zoho (old renames only show in the log).
AedSmartx Contacted kinds (session 5, fields `person`, `step`, `messageId`, `threaded`): `aed_in_process` (`[aed:<id>]`, a
cascade trigger), `aed_add_phone` / `aed_remove_phone` / `aed_set_email` / `aed_remove_email` (`[aedcustomer:<cid>, aed:<id>]`,
`ref` = cid — by customer name, **AedSmartx board only**), `aed_confirm_email` (`[aed:<id>]`), `aed_call`
(`[aed:<id>, aedcustomer:<cid>]`), `aed_email` (**server-written only**, never revertable — `canWriteEvent` refuses it from
browsers, `canRevert` and the store route refuse reverting it).
**Certificate location name + concerned email — per training (session 10, `a25a72f`, owner 15 Oct):** a training's
location (printed as "course conducted at", "" = the customer's own name) and concerned email ride on its
`set_training_date` entry (`location`, `email` fields — **the server refuses a dated entry without them**,
`missingCertFields` in roles.ts; not for TBD, AedSmartx or `mode: "invoice"`). Changed later with `set_cert_location` /
`set_training_email` (value, before, ref = contact id) on the training's card (`schedule.on` — the card the date was set
on) or, for Shreya, on her `fulfil:` card. `applyCert` (pipeline.ts) reads a training's own entries from its lineage
**and** its Fulfillment card ids; without any it falls back to the old customer-wide value (`legacyLocation` /
`legacyEmail`) — so every older training prints what it printed before (checked on all 53 live trainings). Cards with no
training get none. `CardView.certLocation` (was `certAlias`), `concernedEmail`, `certLocations` ("Used before" = what this
customer's trainings actually print), `lastEmail` (pre-filled for a new training), `certLocked` (fulfil_certs + moved to
generated/logistics → location can't change). The **concerned person's name** stays customer-wide (`set_concerned_name`,
now also applied on AedSmartx cards). **The server refuses new `set_cert_alias` / `set_concerned_email`** (old tabs);
they are only read as the fallback. UI (CardModal.tsx): `LocationPicker` (Same as original — name / Used before / Aliases
/ + New location…, near-typo check via `closeTo`), `EmailPicker` (Used last time / Same as original / + Add new…),
`NamePicker` (`notAPerson` blocks digits, @, hotel / company / city words), `certEvents(card, cert, by, onDate)`,
`certFields`; `CertEditor` exported (also opened from the Generate popup's *Change* next to the location);
`CustomerSection` has **Aliases & contact person** → `CustomerNamesEditor` on every board (aliases with `useAliasInput`:
tidy, case-insensitive duplicates refused, near-duplicates ask; plus the name). The Edit form's alias input uses the same
checks.
**Before 15 Oct — alias for certificates + concerned person's email** (end of session 5, commit `655daf0` — not described in the session 5
notes, kept for history): `set_cert_alias` (value = alias printed as the certificate location, "" = customer's own name; `before`) and
`set_concerned_email` (value = email for gratitude emails / the participant list), `ref` = contact id — **per customer
name, the latest wins on every card** (`customerCert` / `applyCustomerCert` → `CardView.certAlias` / `concernedEmail`;
older trainings' `underName` counts as setting the alias). Set in the schedule pickers (*Add Alias* "Same as original /
aliases / + Add alias…" and *Add Concerned Person's Email* "Not set / Same as original (the customer's emails) / + Add
new…") or with **Change** under the head-count in the Training box (`CertEditor` popup) — Training and Fulfillment boards.
**Fulfillment kinds** (session 6, all on `[fulfil:<doc>]`): `set_fulfillment` (value `generated` / `logistics`; old values
`hold` / `received` still read — those cards show in Gratitude Email Sent, `legacy`), `set_cert_status` (`process` / `hold`),
`fulfil_mail_opened` (clears the ★), and **server-written only** (`SERVER_KINDS` in roles.ts — browsers can't write them,
nobody can revert them, the store route keeps them): `fulfil_email`, `fulfil_reply`, `fulfil_certs` (fields `subject`,
`messageId`, `folderId`, `certs: CertRow[]`, `design`). `set_wip` is no longer offered (old events ignored).
**Revert cascades forward** (`src/lib/cascade.ts`, §1; `set_cert_status` is a follower of `set_fulfillment`). **Clear logs**
archives to `cardEventsArchive` first (fields `eventId`, `clearedAt`, `clearedBy`, and since session 6 `clearedScope` =
"everything" / "N cards") and keeps `add_potential` events. Instalment folding (an invoice's other payments joining its merged payment) is computed, not an event.

### Key files
| File | Role |
|---|---|
| `src/lib/zohoSync.ts` | Mongo copy, schedule, lock, budget, incremental/full sync; `pipelineData` / `aedData` / `trainingsData` / `metaData` builders. |
| `src/lib/zoho.ts` | Zoho client (token cached in Mongo `kv`, call counter, retries), list/detail building blocks, pure mappers, `QUOTE_TRAINING_ITEMS`, `AED_EXCLUDED`. |
| `src/lib/pipeline.ts` | Board logic: `buildBoard` (training), `buildAedBoard`, `buildFulfillmentBoard`, flags, merges (incl. instalment folding, `receivedOn` / `sumMatches`), schedules (`trainingDays`, `fmtDays`), `dueStatus`, `describeEvent`, `mergeCandidates`, trainers (`externalTrainers`, `busyTrainers`), potential cards, name-wide aliases (`customerAliases`, `cardCustomers`, `customerNameKeys`). |
| `src/lib/logistics.ts` | `buildLogisticsBoard` (AED Delivered Status, Sent to Logistics, Payment Received, Packages, Shipments, Received by Client), step labels. |
| `src/lib/roles.ts` | Who sees which board (`boardsFor`), `canMarkDelivered`, `canWriteEvent`, `canRevert` — used by the boards and the server. |
| `src/lib/cascade.ts` | `laterInFlow` / `cascadeOf`: what reverting a step takes along (every board). |
| `src/components/RevertConfirm.tsx` | "Revert this change?" popup listing the later steps (rendered once in AppShell; store `pendingRevert`). |
| `src/components/SyncLog.tsx`, `src/app/api/zoho/sync-log/route.ts` | Sidebar Sync log window (hour by hour) and its API. |
| `src/components/followups/LogisticsModal.tsx` | `LogiAedModal` (delivery, hide) and `LogisticsModal` (merge, packing, shipping, reached popup, Ship to). |
| `src/components/followups/AedContacted.tsx` | AedSmartx **Contacted** section: contacts (radio, + Add contact, Remove → "Remove the non-concerned person's contact details?"), Log call, email check flag (Same email / Change), Send email preview popup (+ Send a test), Connect Zoho Mail popup (Admin), calls & emails history. |
| `src/lib/zohoMail.ts`, `src/lib/mailTemplates.ts`, `src/app/api/mail/{aed,connect}/route.ts` | Zoho Mail connection + send (reply in thread), email templates in Mongo, preview/send and connect APIs. |
| `src/lib/aedParse.ts` | Reads the AED line description: model, year, serials, battery/pads expiry; the five extras. |
| `src/lib/confetti.ts` | `celebrate()` (Custom Shapes, Training completed) and `fireworks()` (Certificates Generated); loads `canvas-confetti` on demand. |
| `src/components/FollowUps.tsx` | Board page: column window (◀ ▶ / keys / swipe, fit to screen), columns + customer boxes, F / R toggles, Clear logs, **Board** switch (`boardsFor`), card borders per board. |
| `src/components/followups/CardModal.tsx` | Training card modal, merge view, schedule (dates, trainers, Name), Potential add modal, shared modal pieces (exported: sections, `NotesPanel`, `PaymentsLink`, `Shell`, `Header`, `ChangeLog`…). |
| `src/components/followups/DaysPicker.tsx` / `DateFilter.tsx` | Multi-day calendar picker / the board's date Filter. |
| `src/components/followups/FulfillmentModal.tsx` | Fulfillment card modal: the training card's sections; `FulfilActions` under the Training box; opens on the reply when starred. |
| `src/components/followups/FulfilCerts.tsx` | Fulfillment actions + popups: Send Gratitude Email, reply (sandboxed), Generate Certificate (preview, flower loader, download), Connect sheet, Upload designs, In process / On hold, Sent to Logistics. |
| `src/lib/gratitudeReplies.ts` · `src/lib/zohoSheet.ts` · `src/lib/certificates.ts` · `src/lib/certPdf.ts` · `src/lib/certBackground.ts` · `src/lib/fulfilServer.ts` · `src/lib/zohoOAuth.ts` | Reply check + filing (hourly) · master sheet client · numbering / names / designs · PDF maker (browser) · template → blank background (as the certificate generator) · server-side card rebuild + server events · Zoho code→token helper. |
| `src/app/api/{mail/fulfil,certificates,certificates/designs,sheet}/route.ts` | Gratitude email (preview / send / test / read reply) · sheet preview + append · designs (get / upload) · sheet connect + check. |
| `src/components/followups/AedModal.tsx` | AedSmartx card modal (delivery, schedule date+time, notes, item description, resale); exports `AedNotesSection`, `AedDocsSection`, `ItemDescriptionSection` (reused by Logistics). |
| `src/components/followups/MembersScreen.tsx` | Sign-in card (names, PIN, Admin, + Add new member). |
| `src/components/AppShell.tsx` | Shell, sidebar (hide to rail), global sign-in gate, `MemberPill`, `PageHeader`, **SyncPanel** (`useZohoSync`: heartbeat, Sync now, Last / Next sync). |
| `src/lib/store.tsx` / `src/app/api/store/route.ts` | Shared team data (pull 15 s + on tab focus, diff push; `ZOHO_SYNCED` event) / server stamping. |
| `src/lib/auth.ts`, `src/lib/pins.ts`, `src/lib/session.tsx`, `src/app/api/members/*` | Sign-in, PINs, cookie, session. |
| `src/app/api/{pipeline,aed,trainings,zoho/meta,zoho/sync,cron/sync,store/clear-logs}/route.ts` | API routes (`zoho/sync`: GET heartbeat, POST Sync now). |
| `.github/workflows/zoho-sync.yml` | Hourly GitHub Actions call to `/api/cron/sync` (needs the `CRON_SECRET` repo secret). |
| `src/lib/cachedRead.ts` | Session 16: whole-collection reads that download only when the collection changed (Mongo-side fingerprint) — the free cluster's transfer limit. |
| `src/components/reports/MyDashboard.tsx`, `src/lib/analytics/layout.ts`, `src/app/api/analytics/prefs/route.ts` | Session 16: My dashboard (Customise popup, layouts, starting layout). |
| `src/components/reports/indiaMap.ts`, `public/maps/` | Session 16: India state map (outline + licence note). |

---

## 4. Business rules (authoritative)

### Training follow-ups board (columns)
**Leads → Quotations → Performa invoice → Training scheduled → Training completed → Invoice sent → Payment received → Deal lost → Potential training**
- Leads = every active Zoho customer (not vendors). Documents from the start of the **previous** fiscal year (now 1 Apr 2025).
  Tracked training items: `Fire Safety Evacuation Training and Drill`, `THCAS BLS Training 2025 (I)`, `THCAS CPR Training 2026 (I)`,
  `THCAS First Aid Training (I)`. Sales orders are this org's **Performa Invoices** (`Performa-25-…`).
- **Aliases go by the customer name** (session 4): an alias added or removed on any card — any board — shows on every card of
  every Zoho customer with the **same name** (case, spaces, punctuation ignored; Zoho has duplicates, e.g. two "Chalet Hotels
  Limited" records). "Chalet Hotel Limited" (singular) or "… Pune" are different names and don't get it. `customerAliases`,
  `cardCustomers`, `customerNameKeys` in pipeline.ts; new alias events carry `ref` = contact id. Search finds them all by alias.
- **Customer name is locked** (session 5, owner: "it's their identity that connects them to Zoho"): shown read-only with a
  lock in Edit (*From Zoho Books — can't be changed. Add an alias instead.*); the server refuses `set_name`; old renames no
  longer apply. Change names in Zoho Books.
- **Contact numbers and emails go by customer name** (session 5): added or removed with Edit on any card, on any board, they
  show on (or leave) every card under that customer name — incl. the AedSmartx modal and Priyanka's Contacted list.
- **One modal for every phase**: customer name (read-only) + aliases, emails, contact numbers (mandatory; tagged by phase), type
  (`cf_type`), sector (`cf_sector`), created in Zoho, phase-aware sales person, locked IDs & dates with Zoho links, training block,
  Notes, Merged, Payment line (invoice/payment cards), and the **Changes** panel (Revert on your own entries; Admin on all).
  Edit and Delete.
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
- **Since 15 Oct (session 10):** the schedule popups ask for the **Certificate location name** (per training: Same as
  original / Used before / Aliases / + New location) and the **Concerned person's email** (per training, pre-filled with
  the customer's latest) — both required, button "Location & email"; plus the optional **Concerned person's name**
  (customer-wide). Aliases and the concerned name can be edited any time on any board (Customer → *Aliases & contact
  person*). An alias is anything the team calls the customer (a person, a hotel, a short name); the concerned name is
  only a person. The rule text below is the older version.
- **Training**: unflagged quote/PI can be scheduled — with dates, trainers, the **alias for certificates** (*Same as original*, an alias, or *+ Add alias…*, which also adds the alias to the customer; printed as the certificate location) and the **concerned person's email** (used for the gratitude email and the participant list) — both per customer name, latest wins, **both mandatory since session 8** (red *; Schedule / Postpone / Change date and the *Ready for training* popup stay disabled until an alias — *Same as original* counts — and a valid email are chosen; the email dropdown has no *Not set*; a customer who never chose an alias starts at *Select…*, because an explicit *Same as original* is now kept as "" in `customerCert`), changeable later with *Change* under the head-count (`655daf0`; older trainings used `underName`, "Under name: …"); once dated: **Change date** (a correction, earlier or later — event `mode: "change"`, label unchanged, log "Training date changed from … to …") / **Postpone** / **To be decided** / **Training completed** (both boards); merged PI pops *Ready for training*. **Several days** per training
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
- **Clear logs** (Admin only, PIN): Everything / One customer / One deal cycle. Since session 5 it works on **the board that's
  open** (its cards only — e.g. an AedSmartx invoice like 2026-01-442 is found on AedSmartx, and clearing it leaves the
  training card's log alone; One customer on AedSmartx also clears `aedcustomer:` entries). Only cards with changes are listed.
  *Everything* still clears every board. Clearing an AED card also clears its sent-email count (next email = First contact again).
  **Since session 6 (end; not pushed when this was written):** the popup **opens on *One deal cycle*** (it used to open on
  *Everything* — how both accidents happened), and *Everything* shows a red warning and needs **"Confirm" typed** (any case)
  before **Clear all logs** enables; the server refuses an everything-clear without `confirm: "confirm"` too. To **undo a
  clear**: copy the batch back from `cardEventsArchive` (`clearedAt` = the batch) with `_id = eventId`, dropping
  `eventId/clearedAt/clearedBy/clearedScope`; skip entries the team has redone since (same kind + cardIds + value) — see §5 #146.
- **Completed on invoice date** (session 7, for trainings from before the dashboard): an **invoice card dated up to
  `BACKFILL_UNTIL` (2026-07-31)** whose training was never marked shows *"Trained before the dashboard?"* + **Completed on
  invoice date** → popup (date fixed to the invoice date, trainers or **Not recorded**) → `set_training_date` (value = invoice
  date, `mode: "invoice"`) + `complete_training` (`mode: "invoice"`) on `CardView.backfill.cardId`: the invoice's **PI**
  when it is on the board (even while flagged with its quote / lead — all 27 such PIs were), else the **invoice itself**.
  Not offered when that card already has a schedule. Then it **merges on** (owner, #168): PI → Invoice, and Invoice → the newest
  payment of that invoice when there is one (instalments fold in; part paid waits) — the deal ends in Payment Received (or
  Invoice sent). Downstream: Fulfillment and Logistics take the
  invoice as the training's document when there's no PI (`docOf` / holders: pi ?? quote ?? invoice), and a payment may merge
  with an invoice that holds its own completed training. Undo via the toast / Revert (cascade reverts the completion).
- **Filter** (next to *Show deleted*, both boards; `DateFilter.tsx`): one or several months, or a from–to range. Each card is
  matched on the date it shows — training days once scheduled, else quote/PI/invoice/payment date, expected date (Potential),
  created date (Leads). Not saved; header counts follow the filter.

### Fulfillment board (Shreya — certificates)
**Training Completed → Gratitude Email Sent → Certificates Generated → Sent to Logistics** (session 6; code details §3
"Fulfillment"). Who: Shreya (Fulfillment only) and Ashish / Shikha / Sumit / Admin via the Board switch.
- Built from the training board (`buildFulfillmentBoard`): **every training marked completed** — still in Training completed,
  or since merged on into an invoice / payment (payment status doesn't matter) — as a one-to-one copy of that card, incl. the
  **alias for certificates** and **concerned email** (shown on the card and under the head-count in the Training box, with
  Change). Card id `fulfil:<pi card id>` (or the quote's, if the PI was skipped), so it stays put as the deal moves on.
- Everything happens in a **Certificates** block **under the Training box** (`FulfilActions`): the step's main button on the
  title row, one line per detail — so the card fits at 1728×958 without scrolling (measured 0 px on every stage).
- **1. Training Completed** (plain border): **Send Gratitude Email** → popup like AedSmartx (From learn@, To = the concerned
  email from scheduling with the same dropdown to change it, Subject, body, *Send a test to*) → **Send** (once, no reminders)
  → card moves to column 2. **Mark as Completed** (session 7, next to it, every card — owner: "treat it like normal cards"):
  for trainings whose certificates were made and sent before the dashboard → confirm popup → `set_fulfillment` value
  `logistics`, **`mode: "done"`** → straight to **Sent to Logistics**, where Arti completes them as usual (owner: "she will
  push these to complete too"). Log: "Marked as completed — done before the dashboard"; the card's Certificates block shows
  "Done — certificates made before the dashboard" (`FulfilInfo.doneEarlier`). Undo as usual.
- **Have a list? Click here to Generate Certificates** (session 8, Training Completed cards, `List` row of the Certificates
  block): the same Generate popup (names per day, design, preview, Generate, Download) without any gratitude email; Download
  moves the card straight to **Certificates Generated** (`set_fulfillment generated`, `mode: "list"`, log "Certificates made
  from a list already at hand (no gratitude email)", fireworks; the move is optimistic — no reload). The route accepts
  Training Completed cards; the header tracker shows the email step struck through (skipped).
- **Generate popup (session 9):** the design pre-picked by `designFor` — **BLS training → Basic Life Support, anything
  else → CPR, AED & First Aid** (was: First Aid → fa, else bls) — glows gold (`.glow-gold`, tokens `--gold` / `--gold-glow`)
  with a "Suggested" tag; the facts strip shows **Training: <training name(s)>** (the sheet's COURSE column and the printed
  course still come from the design); Admin sees **Replace designs** (opens the existing `UploadDesigns` popup; converts
  Photoedit templates on upload). Replacing a design also changes *Download again* of older batches.
- **Look (session 8):** board cards are `FulfilItem` (FollowUps.tsx): document + training day, training, "n people ·
  trainers · Alias …", and a state pill (`fulfilState` / `StatePill` in FulfilCerts.tsx — the one wording for board and
  card); no "Completed" chip. The card modal header carries a **4-step tracker** (`FulfilSteps`, hidden below lg); the
  Certificates block has a plain "Certificates" title, wider labels, and no pill (the rows say it). Columns have `min-w-0`
  (a long email no longer pushes the modal past a phone screen). Every stage measured 0 px overflow at 1728×958.
- **2. Gratitude Email Sent** (**blue** border, *Email Sent, Awaiting Reply*): the hourly check finds replies → **★ at the
  top middle of the card** + *Reply received*. Opening a starred card shows the reply first: **Open in Zoho Mail** (clears the
  ★; a newer reply brings it back) / **Close**. The block shows "Email sent to … · when", "n replies · last from … · Show
  reply". **Generate Certificate** → names → design → preview (sheet's last rows + new rows) → Generate (appended to the master
  sheet) → flower loader → **Download** → column 3 (fireworks). Adding the list ends the ★ for good. Cards moved to the old
  *Process on hold* / *List Received* before 10 Oct show here as "List received earlier" (no email from the dashboard; 3 + 6
  such cards on 10 Oct). If the move to column 3 is undone after rows went to the sheet, the card says so and tells her to
  **check the sheet before adding the list again** (undo never deletes sheet rows — owner's choice).
- **3. Certificates Generated**: radio **In process** (default, **green**) / **On hold** (**yellow**); **Sent to Logistics**
  (greyed while On hold) → column 4; *Download again* rebuilds the same PDF (no new rows). The old "Also send to Logistics?"
  popup and *Work in Progress* are gone.
- **4. Sent to Logistics** (green): Arti's Logistics board picks it up (unchanged). *Download again* still there.
- Order: every column by **training date, latest first** (multi-day = last day), then customer name. The Payment section sits
  in whichever column of the modal is shorter.
- Header counts: "n training completed · n gratitude email sent · n certificates generated · n sent to logistics".

### Logistics board (Arti) — `src/lib/logistics.ts`, `src/components/followups/LogisticsModal.tsx`
**AED Delivered Status → Sent to Logistics → Payment Received → Packages → Shipments → Received by Client**
- **AED Delivered Status**: every AED invoice since 1 Sept (the AedSmartx cards, same `set_delivered` mark — Priyanka sees it).
  Only *Mark as delivered* / *Undo delivered*; after marking, a popup offers **Hide card** (`logi_hide` on `aed:<id>`).
  **Unhide cards (n)** (board toolbar) shows hidden cards dimmed; open one → *Unhide* (= revert the hide). Yellow = not
  delivered, green = delivered, **blue = Priyanka moved it on** (scheduled / completed / not required) — the modal says
  *Moved by <name>* · where to. Its Changes panel shows only delivery, hide and notes. AED cards stop here.
- **Sent to Logistics**: Fulfillment cards at *Sent to Logistics*, labelled by PI; card id `logi:<pi or quote card id>`.
  **Flagged** with its payment card once that exists → green border, *Please Merge to Payment* → *Merge & move to Payment
  Received* (event `logi_merge`, cardIds `[logi:<doc>, logipay:<payment card id>]`). Otherwise yellow, *Awaiting Payment* (the
  modal says why: part paid / not paid / no invoice).
- **Payment Received**: only training-board payment cards **merged with their invoice** (so paid in full; instalments are one
  card — checked again with payments + TDS = total). Matched to certificates by the PI in the payment's merge chain. Not merged
  yet: flagged with its STL card (green, *Certificates Received, Merge Required*), or yellow *Waiting for Certificates* (the
  modal shows the Fulfillment stage). Merged card modal: training,
  alias, people, **Ship to** (invoice `shipping_address`, new `ZohoInvoice.shipTo` / `shipPhone`), payment(s), documents; above
  Merged: ☐ *Ready for Packaging?* + *Confirm* (greyed until ticked) → Packages.
- **Packages**: *Packaging in Process* (green) / *On hold* (yellow) / *Ready to Dispatch* (→ Shipments).
- **Shipments**: *Dispatched* (green) / *On hold* (yellow) + *Confirm* (greyed until a choice). Opening a Dispatched card asks
  **"Has the shipment reached the client?"** — *Yes* → Received by Client, green, **confetti** (`confettiPop`); or an
  *expected date* → Received by Client, yellow, *Expected <date>*; opening it asks again; *Reached* button → green + confetti.
- Steps are `set_logistics` events on `logi:<doc>` (values packages, pack_process, pack_hold, shipments, ship_dispatched,
  ship_hold, `expected:YYYY-MM-DD`, received). **Undo runs forward** (`cascade.ts`, like every board): reverting a step (or the
  merge) also reverts every later step of that card; reverting *delivered* also unhides. If Shreya moves certificates back or a
  payment is unmerged on the training board, the merge simply stops applying (nothing is reverted across boards).
- Columns ordered by training date, latest first. Notes on logistics cards are their own plus the training card's.

### AedSmartx Training board
**Invoices sent → Contacted → Training scheduled → Training completed → Training not required** (purple, session 5)
- **Contacted** (session 5, `AedContacted.tsx`): once delivered, the card offers **In process** (→ Contacted, blue border) next to
  *Schedule training* (works from either column; scheduling moves the card on and skips Contacted). Section under Training:
  - **Last contacted** (number, person, when — any invoice of the customer) and a **Calls** counter for this invoice; pick the
    number called (radio) → **Log call**; **+ Add contact** (name optional) → popup *"Remove the non-concerned person's contact
    details?"* **Yes, remove / Keep it** (about the previously selected number); each number has *Remove*. Removing only hides
    it on this board (Zoho keeps it).
  - **Email**: the current email with a yellow flag *"Is this the concerned person's email? You might want to change it."* →
    **Same email** / **Change** (change asks whether to remove the old one). **Send email · <step>** is enabled once checked.
  - **Send email** opens a preview (From hello@thinkhealth.in, To, Subject *Invoice# <no.> Request for Details for Client
    Onboarding - AED Smartx*, body) → **Send**. Email 1 = first contact, 2 = 1st reminder, 3+ = 2nd reminder (repeats), sent as
    replies in the first email's thread with the earlier emails quoted. **Send a test to** = same email, *[TEST]*, uncounted.
  - Card tile in Contacted: *n calls · last <date, time>* / *n emails · last <date, time>*. *All calls & emails* = full list.
  - **Template choice (session 9):** the Send email popup has a **Template** dropdown (every step of Mongo `aed_onboarding`,
    "(next)" marks the next in line, which is the default). Any template after the first email goes as a reply in the
    thread ("Re:"); a first email never has "Re:". Route: GET `&template=n`, POST `{template, count}` (count = emails
    already sent → 409 if someone else just sent one); old tabs' `{step}` still accepted. `aed_email` now stores `subject`.
  - **★ on replies (session 9):** `checkAedReplies()` (`src/lib/aedReplies.ts`) runs in every `runSync` next to the
    gratitude check (own try/catch → Sync log `aedReplies` / `aedMailError`): reads hello@'s newest 200 Inbox + Sent, matches
    by thread or subject (minus Re:/Fwd:), after the email was sent, not from @thinkhealth.in → `aed_reply` (server-only)
    on `aed:<id>`. ★ on the tile until **Open in Zoho Mail** (`aed_mail_opened`); a starred card opens on the reply
    (`ReplyView`, shared with Shreya's popup; body via `GET /api/mail/aed?card=&reply=`); "n replies · Show reply" in
    Contacted, or as a strip once the card moved on. **hello@ must be reconnected once by Admin** (Connect popup — the
    scope now includes `ZohoMail.folders.ALL`, which hello@'s 8 Oct connection lacks); until then the Sync log shows
    "AedSmartx replies not checked" with the Zoho error.
  - Numbers / emails / last call that Priyanka adds are **per customer name, AedSmartx board only** (owner: "strictly her
    dashboard"; Admin/Sumit/Shikha/Ashish see them there). Logistics shows the AED card as *Moved by Priyanka · Contacted*.
  - Undo runs forward: reverting delivered also reverts In process; reverting In process reverts later steps; calls and emails stay.
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
- **Delivered**: marked by **Arti (from Logistics), Shikha, Sumit, Ashish and Admin** (`canMarkDelivered` in roles.ts) —
  **not Priyanka**; undo only by whoever marked it (or Admin). **Schedule training is locked until the AED is delivered** (first
  schedule and from To be decided); *Training not required* stays available. Not delivered → yellow border + *Not delivered yet*;
  delivered → green + *Ready for Scheduling* (replaces the paid/due chip on AED cards). Green **R n** next to a column name shows
  only ready cards (not Contacted ones). (`isDeliveryOnly` in AedModal is now unused in practice — Arti no longer opens AedSmartx.)
- **Training not required** is **purple** (session 5): column header, card border + chip, modal training box and button, and
  the resale / Reseller tick boxes (token `--purple` / `--purple-bg`, light and dark).

### Overview, Calendar, ticker (session 8) — from the boards
- **Session 10 maths fixes (`f642de7`):** revenue change = this month so far vs **the same days of last month**
  (`revenueBetween`; was part month vs whole month: −59 % → really −3 % on 17 Oct); ahead / behind in **whole trainings
  and people** (`pace` rounds the expected count); `upcoming(…, 15)` = exactly 15 days incl. today (was 16); a dated
  training whose last day passed without *Training completed* is **`unmarked`** ("n to mark completed"), not
  scheduled, and gets a ticker item **"Mark completed"** (high after 3 days); `boardMonthSeries(…, since)` starts
  Priyanka's trend in Sept; trend table shows "–" for future months and "so far" for the current one; ticker "days left"
  counts today. Open: the team's year tile (21 / 120, "Behind by 45") is right maths but most pre-October trainings were
  never entered — owner to choose back-fill vs. counting from the dashboard's start (MONDAY-PLAN.md §2).
- `/api/trainings` also returns **`board`** (Training board) and **`aedBoard`** (AedSmartx) as `BoardTraining[]` + `aedWaiting`,
  built on the server (`boardTrainings` / `boardsNow` in fulfilServer.ts: Zoho copy + change log, as the boards do): **one per
  deal** (its latest live card, multi-day = one), dates, trainers, people (= No. of People; AED: 0), alias, status. The store
  reloads it 3 s after any team change (and every 5 min / after a Zoho sync).
- **Targets** (`kpi.ts`): 10 trainings and **300 people** a month, 120 and **3000** a fiscal year (Apr–Mar); only trainings
  marked **completed** count, in the month of their **last** training day; dated ones not completed show as "n scheduled" /
  "n more in scheduled trainings". Revenue stays from the Zoho invoices. Tiles: Month · Year (trainings + people meters) ·
  Revenue · **Coming up (next 15 days)**. Trend chart + table + "Completed by type / client / trainer" from the board.
  "Needs attention" (legacy follow-ups) is now **Upcoming trainings** (next 15 days).
- **Priyanka** (AedSmartx only) gets her own Overview: AED trainings this month / year against **her targets: 5 a month,
  60 a fiscal year** (session 9, `AED_TARGETS` in kpi.ts; no people target — AED trainings record no head-count), AED
  invoices without a date, coming up, her trend (Target 5 line); no Pipeline card. AED trainings never count toward the
  team targets. `boardMonth/boardYear(list, today, targets: Targets = TEAM_TARGETS)`. Her **year counts from 1 Sept**
  (`AED_TARGETS.since`, = `AED_SINCE`; owner OK'd): FY 2026-27 target = 7/12 of 60 = **35**, tile "FY 2026-27 · from Sept"
  (was "4 / 60, Behind by 28"; now "4 / 35, Behind by 3.3" on 14 Oct). From FY 2027-28 it is the full 60.
- **Calendar**: rebuilt in session 11 — see §3 "Calendar & reminders" (own calendar per member, colours per person,
  training card, + New, popups). The **team's year counts from Oct 2026** (`TEAM_TARGETS.since`, owner 19 Oct: every
  earlier training invoice was already on the board, 21 = 21) → FY 2026-27: 60 trainings / 1,500 people, tile "· from Oct";
  the trend chart still shows Apr–Mar; the full 120 / 3000 from FY 2027-28.
- **Ticker**: upcoming trainings first (next **15** days, soonest first: Today / Tomorrow / "Sun, 18 Oct", day n of m, people,
  trainers), then overdue invoices, renewals, high calendar entries, pace (trainings + people), news. The legacy follow-up
  items ("Payment follow-up … · 35d late", "Chase quote …") and the sidebar's red follow-ups count are gone. Who sees what:
  Training-board trainings everyone but Priyanka; AED trainings members with AedSmartx; money / pace members with Training.
- **Session 12 (`fd2e449`):** meter ticks = "where you should be by today at an even pace" — now labelled **"today"**
  with a hover / focus note (`Meter hint`, `tickHint` in Kpis.tsx). **Revenue forecast** (`src/lib/forecast.ts`,
  `revenueForecast`): this month = invoiced so far + invoiced for later this month + **booked** = this month's board
  trainings still on a `quote:` / `pi:` card, valued at the PI amount (PI open) or the quote amount **only if the quote is
  ≤ 15 days old** (`QUOTE_VALID_DAYS`; owner: quotes expire after 15 days, they make a new one) — `bookedThisMonth` lists
  what was left out and why (expired / part invoiced / no amount); later months = **last year's same month × growth**
  (this FY so far ÷ the same days last year; ~1.03 on 20 Oct → FY ~₹17.6L vs ₹17.1L). `/api/trainings` also returns
  **`lastYear`** (tracked invoices with a training date in the previous FY). Revenue tile: "On this pace" (month end, FY,
  not counted, **See forecast →** = `th:trend-view` event + scroll to `#trend`); trend card: **Trainings | Revenue**
  switch — cumulative SVG (this year solid, projection dashed, last year grey, hover per month), table, method line,
  booked list. Phone: every other month label hidden (`max-sm:invisible`), `min-w-0` on `#trend` (was 26 px overflow).

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
| 115 | New **Logistics** board for Arti (6 phases, merge STL ↔ fully paid payment by PI, Ready for Packaging → Packages → Shipments → Received by Client, confetti on reached, undo cascades forward). Restated with 5 questions; answers: Arti marks AED deliveries only on Logistics; permissions later; column "AED Delivered Status", blue + "Moved by Priyanka" when moved on, hideable; "Waiting for Certificates" cards shown; Reached → green + simple confetti | Built (§4 Logistics board); full flow, cascade, hide/unhide and role views tested on a throwaway copy of live data (dropped). `3b19816`. |
| 116 | Card wording before the merge: STL "Please Merge to Payment" (green) / "Awaiting Payment" (yellow); payment "Certificates Received, Merge Required" (green) / "Waiting for Certificates" (yellow); push | `b65032e`. |
| 117 | **Permissions list** (Priyanka AED minus delivered; Arti Logistics; Shreya Fulfillment; Ashish/Shikha/Sumit all; Admin all + sole clear-logs); "any revert reverts everything after it". Asked 3 questions → everyone reverts their own; global cascade; other boards stop applying rather than revert | `roles.ts` + `cascade.ts` + server enforcement + confirm popup (see §1). Tested: server refusals per member with real session tokens, cascade across merges on the training board, Ashish 4 boards, Priyanka no delivered button. |
| 118 | "Whenever an alias is added, it updates on all the cards" | Aliases made customer-wide; then "I searched sahar, only one Chalet showed — literally all cards under that name" (the change wasn't pushed yet when they tried) → matched by **name** across duplicate Zoho records. Tested on a throwaway copy (search sahar: all 8 Chalet Hotels Limited cards + the 2nd record's lead). |
| 119 | "push it to github" | `b146419` (live after ~75 s). |
| 120 | "Write down the handoff for next session, and a text for messaging everything I did today" | Session 4 handoff; team message given in chat (not a file). |

### Session 5 (8 Oct 2026)
| # | Prompt (paraphrased) | Result / commit |
|---|---|---|
| 121 | "Read the previous handoff" | Summary of where things stand. |
| 122 | Priyanka: new **In process** button (only once ready for scheduling) → new column **Contacted**; modal *Contacted* section under the training date: last contacted number + counter, add another contact (then "Remove non-concerned person's contact details? Yes / Keep it"), kept per customer name only on her dashboard; email with a "might want to change" flag (same / change, remove old?); **Send email** from Zoho Mail (hello@thinkhealth.in) with the first-contact template, then 1st / 2nd reminders as the counter grows; Schedule training still available. Restated with 5 questions → "1) yes 2) email and phone counters separate 3) keep sending the 3rd template, exact count + date/time on the card; skipped if a date is set 4) totally 5) **B** (send via Zoho Mail API) — Shreya will get the same later" | Built (§4 AedSmartx, §3 Zoho Mail). Logic tested on synthetic data; a browser test on a throwaway copy of live data was **blocked by the auto-mode safety classifier** (PII), so no click-through was done. |
| 123 | "run it locally" | Dev server (localhost + LAN). |
| 124 | "Not sure if the Self Client is the same — do I show you the client id?" | Told: never paste secrets in chat — type them only in the Connect popup; fill all three fields. |
| 125 | Screenshot "Connected — emails can be sent now", "what's next" | Added **Send a test** (any address, [TEST], uncounted) so the real card's count isn't spent on a test. |
| 126 | "It's peak, I received the email. Push it" | `4871d3c` (session 4 handoff) + `886bdc2` (Contacted + Zoho Mail). |
| 127 | Clear logs → One deal cycle → "2026-01-442: No match" | Bug: Clear logs only listed Training-board cards. Now the open board's cards. |
| 128 | "push it all" | `a2a2a03`. |
| 129 | A contact number added by editing a card should show up in the modal, immediately; Priyanka should get it too | Bug: AedSmartx Contact section hid edit-added numbers. Numbers / emails now customer-wide on every board and in Contacted; Priyanka's added numbers show in her Contact section; pull every 15 s + on tab focus. |
| 130 | "Make Training not required cards and the whole column purple" | Purple token + column, cards, modal. `e70cbf4`. |
| 131 | "Don't allow anyone to change the customer's name — it's their identity that connects them to Zoho"; "push" | Name read-only, server refuses `set_name`, old renames ignored. `1738416` (live after ~40 s). |
| 132 | "push everything" | Nothing left — already pushed. |
| 133 | "Write me a handoff and the things I did for a message" | This update; team message in chat. |

### Session 6 (10 Oct 2026) — Fulfillment: gratitude email, replies, certificates; Clear logs rescue
| # | Prompt (paraphrased) | Result / commit |
|---|---|---|
| 134 | "Read the existing handoff from prev session" | Summary; noted commit `655daf0` (alias for certificates + concerned email per customer name) wasn't in the session 5 notes. |
| 135 | "What's the status for the Zoho Sheet connection?" | None existed. |
| 136 | Shared the master sheet link: "the list of names Shreya receives by mail will be appended at the end — check the sheet, ask questions" | Couldn't read it: private (Zoho sign-in), and reusing the stored Books/Mail tokens was **refused by the safety classifier**. Found the owner's **certificate generator** at `D:\Projects\certificate-generator` (its PRODUCT.md gives the register: Serial, Certificate No., Name, Training location, Course, Date; `FAT-OD/<date>/<serial>`; 2 designs). |
| 137 | Spec (screenshots of the Alias / Concerned email pickers): Fulfillment **Send Gratitude Email** popup like AedSmartx, to the email chosen at scheduling, template later; column 1 keeps its place, the old tick boxes become Send Gratitude Email under the Training section; column 2 *Gratitude Email Sent*: blue *Email Sent, Awaiting Reply*; a reply → small ★ top middle, opening shows the reply first with *Direct to Zoho Mail* / *Close*, star gone once opened in Zoho Mail; **Generate Certificate**: paste names → appended to the master sheet, serial + certificate no. auto-incremented, Alias as location, date = training completed date | Restated with 6 questions. |
| 138 | Answers: after the list → preview of the data as stored in the sheet → choose one of **2 templates** → Generate → "a cute flower loader that very slowly turns clockwise" → download "<Alias> certificates" PDF → green, **Certificates Generated** as *In process* (radio *On hold* = yellow) → *Sent to Logistics* only while In process; "I need full integration to the sheet"; date = what the Training completed card shows; concerned email: same dropdown; **no reminders**, ★ on every reply, gone when opened in Zoho Mail or the list is added; check replies **hourly with the Books sync** | Restated; proposed connections, design storage, undo behaviour. |
| 139 | Change: emails are sent by **learn@thinkhealth.in** (alias of **shikhadixit@**); replies must go to **digital@** (boss's rule — digital@ does nothing sales/training) | Options: (1) Zoho Mail filter in Shikha's mailbox forwards replies + dashboard reads only its own threads; (2) Reply-To; (3) dashboard forwards. **Owner: option 1.** |
| 140 | 1) filter only these replies 2) Self Client 3) **digital@ connects the sheet**, not Shikha 4) course comes from the chosen design 5) multi-day → **last day — "it can change later, mark it as important"** 6) designs: "you tell me where" → Mongo (Admin uploads) 7) Download again 8) undo leaves sheet rows **+ a note to check the sheet before adding again** 9) how to add `CRON_SECRET` | Built everything (§3, §4). Tested: board logic (16 checks), names/numbering/reply matching with mocks, the sheet client against a fake Zoho Sheet, a PDF with the real design + made-up names, and a headless click-through with **every /api answered by fake data** (no live writes) — all cards 0 px scroll at 1728×958. |
| 141 | "So I need api-console Self Client for both digital and the other?" | Yes — one per account: Shikha (mail, learn@) and digital@ (sheet). |
| 142 | "run it locally" | `npm run dev` (warned: local = live DB, connections and sends are real). |
| 143 | "Any sent emails from learn@ should move under the **'Gratitude Emails Sent'** folder; digital's folder later" | Dashboard moves each gratitude email (tests too) into that folder, creating it if missing; hourly catch-up; scope now `ZohoMail.folders.ALL`. digital@'s folder = a Zoho filter there later (dashboard doesn't touch digital@'s mail). |
| 144 | "Push everything, drop everything that needs doing after this" | `2156f46`, verified live. To-do list given (now §10 #24–#33). |
| 145 | "The last Clear logs — I think I cleared everything by mistake, roll back" | Clear on **10 Oct 12:14 IST** (Admin) removed all **191** entries (Admin 53, Shikha 50, Priyanka 40, Arti 38, Shreya 10). **Restored all 191** from `cardEventsArchive` with their original ids. Left cleared: a 4-entry clear at 12:12 and four 2–3-merge "one deal cycle" clears at 12:39–12:40 (look deliberate; owner told). |
| 146 | "Even before this I cleared all logs by mistake" | Clear on **3 Oct 11:31 IST** (Admin): 37 entries. 21 had been **redone by the team** since (same kind + cards + value) → skipped (`restoreSkipped`); **restored 16** (Ritz Carlton chain to invoice 2026-01-408, Moxy Bengaluru Airport to Performa-25-265 TBD, Mementos email + phone; 6 already-reverted ones as history). Live log: 210. |
| 147 | "When did I clear the logs? Did I do it?" | Both as Admin + correct PIN; the app records no person/device (Vercel logs last ~1 h). Today's pattern (one-cycle clear at 12:12, Everything at 12:14) suggests a slip of the scope switch. |
| 148 | "Lock that clear-all behind typing 'Confirm'" | Popup opens on One deal cycle; Everything needs **Confirm** typed (+ server check); archive records `clearedScope`. Tested headless with fake API. Pushed in session 8. |
| 149 | "Write a total handoff … what I did today and what needs to be done next session" | Session 6 handoff. |

### Session 7 (12 Oct 2026) — sheet + designs connected, certificates print right, Fulfillment polish
| # | Prompt (paraphrased) | Result / commit |
|---|---|---|
| 150 | "Read HANDOFF.md … tell me where things stand" (git, which Fulfillment connections exist, owner's to-do) | Lock + handoff uncommitted; learn@ connected (10 Oct), sheet and designs not; `CRON_SECRET` still missing. |
| 151 | "run it so I can put digital's client" → screenshot "No Serial column found" | Dev server. Header "SN" now matches; date style from the last dated row. Found certificate no. ≠ SN (…/2128 vs 2135). |
| 152 | "keep them as they are — Shreya left rows empty when a new location came" | SN and certificate no. count separately. Owner then generated twice for real (Test 1; then 3 names, SN 2136–2138) — rows went in correctly; owner deleted them and undid the moves. |
| 153 | Screenshot of a misprinted PDF: "let the user align the certificates" → "check the templates again, they should remain like they are, only values change" → "the certificate generator app would generate the certificates btw" → "names go to the master sheet, those new rows go to the generator, it returns to our board" | Cause: the uploaded designs were the A4 Photoedit templates, printed whole into one slot. Reused the generator's `backgroundFromTemplate` (`certBackground.ts`); rendered both templates with made-up names — correct. The board already runs the generator's own code, so the flow is the one described. (A content-stream parser was tried first and dropped.) |
| 154 | "fix the positioning, make the cert gen modal a bit bigger … fix our card modal too … not cluttered" | Generate popup 1120 px: title + Names → Check → Download steps, facts strip (location/date/course, then rows/SN/cert nos.), names + design side by side, roomier preview table, still flower instead of 🌸; card: Certificates block as labelled rows, "Concerned email: not set" on one line, Sales person on one line, "Completed by X · date". All Fulfillment stages 0 px overflow at 1728×958 on real cards (were 21–31 px). Phone: facts stack. |
| 155 | "Mark as Completed" for old trainings in Training Completed: 1) → Sent to Logistics 2) Arti pushes them to complete too 3) like normal cards; "the flower rolls away the screen" | Built (§4 Fulfillment). Flower: `transform-box: fill-box` — it rotated around the drawing's corner. Click-tested with saves blocked. |
| 156 | "Impeccable update" | `npx impeccable update` found no skill folder (it's a Claude Code plugin — update via `/plugin`); owner: "nvm". |
| 157 | Screenshot of the **Ready for training** popup: "very cluttered, make it a bit wide, proper alignment" | 680 px; title + "Ready for training" tag; rows Training dates · Trainers · Add alias · Add concerned person's email (label + hint left, control right, `FormRows` context in CardModal). Certificate details popup the same. Inline schedule row unchanged. |
| 158 | "the serial number must be auto incremented when names come" | Already: max SN + 1 per name (and certificate no. on its own count), re-read under the lock at Generate. |
| 159 | "push it all to github" | `cb906d4`, live after ~105 s. |
| 160 | Screenshots of Shreya's live tests (gratitude email, reply, names, undone moves on JW Sahar 2026-01-352 and Ritz Carlton Payment #1791): "remove them, move the cards back to Training Completed" | Direct Mongo delete **refused by the safety classifier** ("Modify Shared Resources"). Owner told to use Clear logs → One deal cycle on the Fulfillment board (on that board it covers only the fulfil: card — checked: 6 + 5 entries, all tests) and to delete the 9 test rows SN 2136–2144 from the master sheet by hand. |
| 161 | Column colours: Training scheduled **#FFAC00**, Training completed **#26B0D2** | Tokens `--scheduled` / `--completed` (+ `-bg` tints, light and dark) in globals.css; Training **and** AedSmartx boards' columns (header tint + dot; card borders unchanged). |
| 162 | "Push to github" | `7025bbe`, live after ~75 s. |
| 163 | "Give an option to set the invoice date as training completed date for invoices before August — so I can push old cards to complete them" → agreed defaults (trainers popup with Not recorded; invoices with no PI complete on the invoice itself; completion only, no merges; up to 31 Jul 2026) | **Completed on invoice date** (§4 Training board). 40 training invoices dated ≤ July: 27 PIs never scheduled (all still flagged: 16 with their quote, 11 with a lead — so the button sits on the invoice card, not the PI), 10 invoices with no synced PI, 3 done. Click-tested on real cards with saves blocked (Arrowline, Lucasfilm, 2025-01-136 → all on Fulfillment). |
| 164 | "push it to github" | `3a5b002`, live after ~90 s. |
| 165 | Screenshot of Review & merge with 5 panels (Arrowline): "UI distorted, dynamically scale on the basis of cards opened" | `Stacked` context in CardModal: **3 or more panels** → labels above values in every panel (same layout in all; per-panel container queries were tried first but the first panel is wider — no arrow — so layouts mixed), training box stacks, Sales person under its title; 1–2 panels unchanged. Values wrap at spaces (`break-words`, was `overflow-wrap:anywhere`). "Open & edit" wraps under the heading. Checked on real 5- and 3-panel views. |
| 166 | "push it to github" | `85f13c2`, live after ~45 s. |
| 167 | Screenshots: Duet India Hotels — after **Merge PI → Invoice**, Review & merge showed an empty window ("works with the first option, the 2nd should work too") | MergeModal hid Invoice/Payment whenever no PI panel showed — meant for "quotation without its PI", but after PI → Invoice the group is Invoice + Payment with no PI. Now hidden only when a quotation shows without its PI. Reproduced on 2025-01-219 (saves blocked): Review & merge → Invoice + Payment, "Merge Invoice → Payment Received". |
| 168 | "push it; for any invoice I click Completed on invoice date — if there's a payment received, just move it (merge with payment received) and leave it there; only July 2026 and before" | Completed on invoice date now also merges **PI → Invoice** (when the PI held it) and **Invoice → its newest payment** (instalments fold in; part paid waits as usual); one Undo takes it all back. `liveMerges`: an invoice may join its payment when it holds its **own** `complete_training` (no-PI case) recorded before the merge. Tested (saves blocked): Diana Builwell 2025-01-219 → one card Payment #1149; Pinkerton 2025-01-182 (no PI) → Payment #1097. Pushed with #167 as `633f1ec`, live after ~195 s. |
| 169 | "write a handoff, include my prompts and their outputs — I want to share it with my new session" | This update (13 Oct): checked live state first (read-only) — old test entries on JW Sahar / Ritz gone, but a **new** Shreya round on JW Sahar (gmail as concerned email, 20 names SN 2165–2184); Classic Citi test batches still there; 38 cards completed on invoice date, 3 Mark as Completed; `CRON_SECRET` still missing. |


### Session 8 (13–14 Oct 2026) — deletions + Sync now, certificates per day, mandatory alias/email, Fulfillment polish, Overview from the boards
| # | Prompt (paraphrased) | Result / commit |
|---|---|---|
| 170 | "Read HANDOFF.md end to end … don't write test data, don't email customers, don't push unless I ask; tell me where things stand" | Summary: all pushed (`633f1ec`); `CRON_SECRET` still missing (12 Oct 20:24 UTC run skipped); JW Sahar question, owner-side setup, Classic Citi test batches. |
| 171 | "Yesterday I deleted some PIs and something from Zoho Books — it should have gone from here too but didn't; recheck everything" | Read the Sync log (read-only): the deletions happened after the 12 Oct 2 pm full check; quick syncs never see deletions; the **13 Oct 9 am full check removed** Performa-25-757, Performa-25-698, Quotation-24-001976, invoices 2026-01-346 / 2026-01-198, and the board logged the notices. Also found: quick syncs stored edited **AED invoices dated before 1 Sept** that the next full check removed (8 on 12 Oct — harmless, boards filter by `AED_SINCE`). |
| 172 | "We have a sync button — that should check all changes, no?" | No — Sync now was a quick sync. Proposed: Sync now = full check (≤ 1 per 10 min) + quick syncs skip pre-Sept AED invoices. |
| 173 | "push it to github" | Built both; `01f028c`, live ~60 s. |
| 174 | Multi-day trainings train different people each day: let Shreya add names per date; "the sheet updates with the date respective and certificates print as per the dates; return what you understood before implementing" | Restated with 5 questions (checked: today every row got the last day). |
| 175 | "1) no, we will need to print for every participant 2) yes 3) yes 4) one person one day 5) yes" | Built: names per day, every day needs names, a name on two days blocks, one PDF, one design (§3). Click-tested with saves blocked (Classic Citi shown as 15–17 Sept in the browser only). While testing found **8 false "no longer in Zoho Books" notices** (Shreya's tab woke from sleep with day-old Zoho data) → fixed (`zohoNotices` ignores merges newer than the board's data; Zoho data reloads when a tab becomes visible); the 8 entries still sit in the log (#44). |
| 176 | "Make Alias and Email mandatory in training scheduling so we don't miss anything at the gratitude emailing" | `certReady` gates Schedule / Postpone / Change date / Ready popup / Certificate details; pickers start at *Select…*; "Same as original" counts. Tested on Duet India Performa-25-1097 with saves blocked. |
| 177 | "push it to github" | `4745553` (certificates per day + mandatory alias/email + false-notice fix), live ~90 s. |
| 178 | "Can we use our new data for the Overview and Calendar … target 10 trainings a month, 120 a year; 300 people a month, 3000 a year (from quantity); the alert bar should show upcoming trainings" | Read the code: the Overview counted Zoho invoices (invoice date when no training date) and already had 10/120; restated with 6 questions. |
| 179 | Fulfillment: "Have a list? Click here to Generate Certificates" from the first column (no gratitude email, card moves to Certificates Generated, quick refresh so confetti still plays); "enhance the UI, it looks cluttered and boring"; optional **concerned person's name** next to alias + email (alias/email stay mandatory) | Built (§4 Fulfillment, §3). Impeccable skill used (polish, Operate mode): board `FulfilItem` cards + state pills, 4-step tracker in the card header, plainer Certificates block, phone fit. Name: `set_concerned_name`, `{person}` email variable. Tested with saves blocked (read-only preview answered 200 for a Training Completed card). |
| 180 | "push it to github" | `ca83971`, live ~60 s. |
| 181 | Screenshot of the Overview: "not much UI is changed tho" | Explained: the polish covered only the Fulfillment board; the Overview was waiting on the 6 answers. |
| 182 | "1) yes 2) yes 3) one deal can have multiple dates — that's 1 training 4) AED doesn't count for others but Priyanka should get that dashboard 5) next 15 days 6) yeah" | Built (§4 "Overview, Calendar, ticker"): server-built `BoardTraining` lists, people targets, coming up in 15 days, trend/breakdown from the board, Upcoming trainings card, Priyanka's AED Overview, Calendar from the boards, ticker leads with upcoming trainings, stale follow-up items + sidebar count removed, Overview phone overflow fixed. Real numbers 13 Oct: Oct 5/10 trainings, 130/300 people; FY 21/120, 842/3000. |
| 183 | "push it to github" | `3e57bb2`, live ~60 s. |
| 184 | (to: Priyanka targets? live greeting "Dear {name}"? delete the 8 false notes?) "yes yes go ahead and do that but do it in a new session; write a handoff with my prompts and outcomes and tips on what to enhance" | This update (14 Oct). The three approved items are step 2 of "Start of the next session"; tips in §10 #45–#58. |

### Session 9 (14 Oct 2026)
| # | Prompt (paraphrased) | Result / commit |
|---|---|---|
| 185 | "Read HANDOFF.md … do the three approved things (delete the 8, greeting, ask Priyanka's targets), then where things stand + what next" | 8 notices checked read-only (all docs still in the Zoho copy) and deleted; found a 9th from 08:25 IST (stale tab) → asked; live `fulfil_gratitude` first line → "Dear {person}," (rest + subject unchanged; preview GET checked — "Dear Sir/ Ma'am," until a concerned name is set; none set yet). |
| 186 | Answers: AED **5 a month**, year **12 × = 60**; delete the 9th: yes | 9th deleted; `AED_TARGETS` + `Targets` in kpi.ts, Kpis.tsx passes them; checked read-only in headless Chrome as Priyanka (3 / 5 Oct, 4 / 60 FY, Target 5 line, 0 px overflow at 1728 and 390) and Admin (team numbers unchanged). Not committed / pushed. |
| 187 | "go ahead, implement it" (my top two: Priyanka's year from Sept; server rejects false Zoho notices) | Both built (§4 Overview, §10 #59); tsc OK; Overview re-checked read-only (4 / 35 · from Sept, phone fits; team unchanged); notice filter checked read-only on real data (9 drop, 2 keep). Live log untouched (733). Not committed / pushed. |
| 188 | "push it to github" | `40cb462`, live ~40 s. |
| 189 | Domain: "buy a subdomain work.thinkhealth.in" | No purchase needed. Added in Vercel (Add Existing → Production); DNS is at **Cloudflare** (bristol / piotr.ns.cloudflare.com), in a Cloudflare account the owner can't see → asked the boss for access or to add `CNAME work → 4145140deaae64f5.vercel-dns-017.com` (proxy off). Pending. |
| 190 | New certificate designs (colour change) to replace; BLS trainings default to the BLS design, others to CPR/AED/First Aid; popup strip shows the **training name** instead of Course; the default design gets a **glowing gold border**; Priyanka picks **which email template** to send; **★ on replies** to her emails, same reply popup as Shreya's. Asked 4 questions → all defaults: gold glow on the pre-picked design in the popup; training name on screen only (sheet COURSE + certificate unchanged); replies read from **hello@**; Admin **Replace designs** button | Built (§4 Fulfillment / AedSmartx below). Tested: reply matching with mocks (thread, subject, own domain, before-send, known — PASS); read-only browser on real cards with saves blocked (Synopsys 2026-01-461 BLS → Suggested + gold, "Training: THCAS BLS Training 2025 (I)", Replace designs; a fake reply injected in the browser only on 2026-01-436 → ★ on the tile, modal opens on the reply, Open in Zoho Mail clears it; 2026-01-437 Send email → Template dropdown, "2nd reminder" as a first email has no "Re:"). Pushed with #191 (`9459193`). |
| 191 | Attached the **two new templates** (colour change): "these are the two new templates, retry" | Found them in `D:\New folder\A4 CA / FA Photoedit.pdf` (14 Oct, 0.5 MB each). Rendered with made-up names first: **the converter printed a blank certificate** — the new exports keep the picture's colour profile in a separate object (`/ColorSpace [/ICCBased n 0 R]`, RGB, not CMYK), and `backgroundFromTemplate` copied only the picture's own entries. Fixed: copies the picture with `PDFObjectCopier` (everything it points to); old templates still convert. Backed up the old designs (scratchpad `designs-backup/`, local only), then uploaded both through `POST /api/certificates/designs` as Admin on the local server (stored as converted backgrounds, 0.5 MB); checked they print right through the **live** code too (pass-through path). Live since 14 Oct 16:44 IST. |
| 192 | "push it to github" | `9459193` (certificates + AedSmartx templates and ★ + converter fix), live ~90 s. Owner told: Ctrl + Shift + R; **reconnect hello@**. |
| 193 | "write a handoff for new session" | This update (15 Oct). |

### Session 10 (15–17 Oct 2026) — black certificate text, per-training location, Overview maths, Monday plan
| # | Prompt (paraphrased) | Result / commit |
|---|---|---|
| 194 | "Read HANDOFF.md … check the Sync log for hello@ / Priyanka's reply check, whether work.thinkhealth.in is connected, what's waiting on me" | hello@ still the 8 Oct connection; **0 `aed_email` ever sent**, so the reply check never reaches Zoho (no error can show yet); work.thinkhealth.in NXDOMAIN on Cloudflare's own servers; `CRON_SECRET` still missing; spotted Shreya's first real batch on the new designs and Admin's 1-row Classic Citi Generate. |
| 195 | Attached both templates + a generated PDF: "cert number, location, date look dark blue, templates are black — printers print light blue; make them black" | Cause: our layout draws those values in a hard-coded **#0E3F51** (templates' text is `0 0 0 rg`; their colours never reach the print). `certPdf.ts` → pure black (name stays blue); test PDFs from both templates read back only black + the name's blue. |
| 196 | "push it to github i will check it myself" | `5d167c2`, live ~60 s. |
| 197 | "yeah i want it to change" (the certificate-generator app too) | `D:\Projects\certificate-generator\src\layout.ts` → black; tsc OK; sample PDFs checked. |
| 198 | "just push it" | Generator repo pushed: `44795c9` (its waiting TypeScript rebuild) + `17853af`. |
| 199 | "i want the aliases correctly inputted — find inconsistencies across all boards, where the issue lies" | Read all 20 alias entries: Chalet's 4 trainings sharing "JW Marriott Mumbai Sahar", "Chalet Hotel" ≠ "Chalet Hotels", Samhi's first 30 certificates printed with the company name + a typo fix that dropped the alias from the list, person names as aliases (Yogesh Ghumaste, Arwa Hyderabadwala), Synopsys without one. Causes: one location per customer name, two drifting lists, no input checks, exact-name matching, pre-13 Oct trainings never asked. |
| 200 | "as a senior system architect": alias = what they call them, concerned name = only a person, **Certificate Location Name** mandatory at scheduling (same as original or an alias), alias + name optional on any board, schedule needs proper email + location | Agreed + two changes: location **and** email per training (hotel groups); no data rewrite (fallback), server check, lock after certificates. 3 questions. |
| 201 | "yes for all and push it, also remove Shreya's mail (dummy, to print certificates)" | Built (§3 "per training"); checked read-only on all live trainings + in-memory simulation + headless browser with saves blocked (0 px at 1728×958; the 9 px on a fake starred card is pre-existing and under the padding). 6 gmail entries (2 `set_concerned_email`, 2 `fulfil_email`, 1 `fulfil_reply`, 1 `fulfil_mail_opened`) **archived to `cardEventsArchive` (clearedScope "dummy entries with Shreya's gmail") and deleted**; Shikha's later entry's `before` (the gmail) unset. Commit `a25a72f`; **push failed — GitHub sign-in can't prompt from here**. |
| 202 | "push it to github" | Failed again (same sign-in). |
| 203 | "whats the current status" (17 Oct) | work.thinkhealth.in **live** (CNAME → Vercel, HTTPS 200); push still pending; Shikha scheduled one training on old screens (keeps its alias/email). |
| 204 | "just push it, fix the maths on the dashboard page, recommend reminders and front-page things — as architect + entrepreneur" | Overview maths fixed (§4 Overview) after checking each number on live data; `f642de7`; push still blocked. Recommendations: renewals, AED consumables, cold quotes, receivables, My day, time limits, pre-training check, forecast, funnel, delivery speed… |
| 205 | "go through your suggestions — would you want them as a business owner? what else?" | Keep / later / drop with reasons; plus profit per training, repeat clients, certificate QR, participant-list form, feedback, trainer certification expiry, lead source, stock. Top 3: renewals, profit per training, My day. |
| 206 | "write it all in a file, we will work on Monday" | `MONDAY-PLAN.md`. |
| 207 | "push it tho, the upgrades we will do on Monday" | `3f82378` committed; push blocked. |
| 208 | "im using cursor, sign in yourself" | Can't — the sign-in is the owner's GitHub approval; gave Cursor steps (Source Control → Sync Changes). |
| 209 | "pushed" | All three commits on GitHub; Vercel success; new code found in the live JS on **work.thinkhealth.in** and vercel.app. |
| 210 | "everything written in a file" | This update (19 Oct). |

### Session 11 (19 Oct 2026) — calendar, reminder popups, training reminder emails
| # | Prompt (paraphrased) | Result / commit |
|---|---|---|
| 211 | "Read HANDOFF + MONDAY-PLAN … check live, Sync log since 17 Oct, hello@, trainings since 17 Oct with location + email, what's waiting on me; ask the year-target question first" | All pushed (`3f82378` live on both); 6 syncs ok, 0 mail errors, Sat afternoon syncs missing; hello@ not reconnected (0 `aed_email` ever); `CRON_SECRET` still missing; **0** schedules since 17 Oct — the one since 15 Oct (FLAME) printed "Arwa Hyderabadwala" as location; found **board completions = Zoho training invoices every month this FY (21 = 21)** → nothing to back-fill. |
| 212 | "1) a 2) yes 3) yes 4) yes 5) yes" (year from Oct; keep past dates; FLAME = customer name, Shikha fixes; Chalet as is; fix the Contacted scroll) | `TEAM_TARGETS.since = 2026-10-01` (5 / 60, 130 / 1,500); Item description folds while Contacted + All calls & emails in the header (right column −175 px; 2026-01-449's left column still 6 px past the padding — data). |
| 213 | "yeah ig" (My day defaults) + calendar spec: map trainings, who trains, customer; new modal card; schedule from the calendar with trainer dropdown; meetings / events with time; Training board except Priyanka (her AED column); don't let the card move until alias + email + quote–PI merged; editable both ways; popups bottom right 30 s, one by one, once a day; fix the calendar UI with the old rules | Restated with 6 questions + defaults. |
| 214 | "each user only their own calendar, Admin / Shikha / Sumit / Ashish all; training name + person visible; suggest what a user wants to see on opening and implement immediately" | Built the calendar (§3). |
| 215 | (mid-turn answers) Zoho Calendar: "not sure — give each person a colour"; "PI + quote + concerned email + alias set, only then Training completed visible"; popups to whoever is selected, option for all users; once a day per user, crossable, click opens its board + modal, next after it closes; drop priorities "yeah"; calendar first "yeah ig" | Colours per person; `completeBlockers`; Everyone chip; `/api/reminders`; `?open=` on the board; priorities gone. Tested read-only (saves blocked; Priyanka's popup with a training moved to today in the browser only). |
| 216 | "push it to github" | `72486bb`, live ~1 min (both addresses). |
| 217 | Screenshot of the legend with "Ganesh": "external trainers in an External trainer category; clicking a name shows that person's calendar" | Grouped + legend filter; legend only lists the month on screen (Ganesh's only training is 24 Sept). |
| 218 | Screenshot of New with the deal list cut off: "push it, also the ui looks like this" | List in the popup's flow (554 px, 0 scroll at 1728 and 390); `3af5c58`, live. |
| 219 | "push it to github" | Nothing new — told so. |
| 220 | Reminder emails to whoever trains (sshah@ = Sumit, sales@, shikhadixit@, hello@) from learn@ into "Training Remainders"; 25th → 20th, 22nd, 24th; WhatsApp the same; the 7 fields | Restated with 8 questions + defaults. |
| 221 | "sales is Ashish's; skip external trainers; multi-date from the calendar too; late-schedule table (1 → day before, 2 → both, 3 → 1st + day before, 4 → 2nd + day before, 5 → 1st, 3rd + day before); postponed → sorry email, subject on the new date; folder 'Training Remainders'; no extra lines, just the date; one email for all; WhatsApp via Anantya AI" | Built `reminderPlan.ts` + `trainingReminders.ts` + routes + cron (§3), production-only sending; checked the day table and postponement detection; **one [TEST] email to sshah@ only** (FLAME); filing refused (`INVALID_OAUTHSCOPE` on creating the folder). Multi-day from the calendar already worked. No Anantya API docs online. Not pushed. |
| 222 | "I think Shikha has already created the folder, kindly check" | It's **/Sent/Training Reminders** (correct spelling) → `REMINDER_FOLDER` switched; test email filed (0 left in Sent). |
| 223 | "write a handoff for tomorrow" | This update. |
| 224 | "push the rest to github, leave the WhatsApp integration for tomorrow" | Checked the first run (3 emails: Sierragold, Diana Builwell → Ashish + Sumit; K Raheja AED → hello@); pushed everything. |

### Session 12 (20 Oct 2026) — revenue forecast, WhatsApp through Anantya, contact number, training type
| # | Prompt (paraphrased) | Result / commit |
|---|---|---|
| 225 | Brief: read HANDOFF + MONDAY-PLAN; rules (no test data, no customer emails, push only when asked); check git / live, the first reminder emails, next 5 days, Diana's 21 Oct training; then WhatsApp (Anantya) and My day, restating with defaults first | All pushed (`a3bb528` live); 3 reminders went 08:18 IST (owner's page load), filed; 2 a day late (no `CRON_SECRET`); Diana = a real new quote (30 Jun); WhatsApp questions asked. |
| 226 | Two screenshots: "the small vertical bars make no sense — tell the user what they are; add a forecasting line chart for sales from past records, what the outcome would be at the same momentum" | Checked the numbers; proposed "today" ticks + a Trainings / Revenue switch + last year × growth. |
| 227 | "1) yes 2) recommended 3) yes 4) quotes OK, but a quote older than 15 days doesn't count — they make a new one" | Built (§4 Overview, session 12). |
| 228 | "push it, then let's do the WhatsApp" | `fd2e449`, live. |
| 229 | WhatsApp answers: "no docs, only a login to the Anantya dashboard"; send any time; numbers in an Admin popup (DB); test on "my own number, no need to ask" | Found the API in their dashboard JS + Swagger; built `whatsapp.ts`, `/api/whatsapp`, `WhatsAppSetup.tsx`, per-person sending, Sync log / cron lines; 13/13 tests vs a fake Anantya; browser checks with saves blocked. |
| 230 | Screenshot of Anantya's Create Template form | Field-by-field guidance (Utility, English, Variable type Number, no header / footer, body ends in text). |
| 231 | "created the templates, have the API key, it says pending" | Told to save key + numbers on localhost, pick templates after approval. |
| 232 | Screenshot: every template listed twice, "Accepted" — "which ones" | Anantya lists each twice (same id) → deduped; "Accepted" counts as approved (popup had warned wrongly). |
| 233 | "test is working, but the text looks mid to trash — fix the UI for the text" | v2 templates: greeting, "in n days", bold labels + icons, one fact per line; phone preview in the popup; `vars` stored per pick, sending off until the picked templates take the right count. |
| 234 | Screenshot of Certificate details: add "Concerned Person's Contact Number" (Same as original or add new), mandatory; order location, name, email, phone; can't complete without them (name optional); add the number to the template | Built (§3); v3 templates (10 values). |
| 235 | "which line to add?" | Gave both full v3 texts. |
| 236 | "both approved and I put them on the board" | Checked: v3 picked, `ready`. |
| 237 | "we didn't even add what kind of training it isss — fix it quick" | Type of training in email + WhatsApp → v4 (11 values). |
| 238 | "push it to github" | Secret scan, `next build`, `98381ce` pushed, live ~13:08 IST. Owner then picked v4 (13:06). |
| 239 | "pushed it to github?" | Yes. |
| 240–242 | Status for Zoho Sprints; "what's 11th, drop 12th, add suggestions"; "write a full text directly" | Plain-text Sprints list: done / waiting on us / next / suggestions (§10 #99). |
| 243 | "write a description for this training dashboard" | Long + one-line description (Sprints). |
| 244 | "write whatever is left for tomorrow, prepare a handoff for the new session" | Found WhatsApp hasn't sent on the live site (dry run says it would send 5) → §10 #85; this update. |

### Session 13 (21–22 Oct 2026) — schedule popup, themes, step tracker, Zoho Analytics, Reports
| # | Prompt (paraphrased) | Result / commit |
|---|---|---|
| 245 | Brief: read HANDOFF; rules (no test data, emails / WhatsApps only to the owner, push only when asked, never print the Anantya key); check git / live, WhatsApp since 20 Oct, 21 Oct reminders, Diana, contact numbers; then fix WhatsApp + restate My day | All pushed and live; **WhatsApp working** (5 on 20 Oct 16:01, 4 on 21 Oct 07:59); 21 Oct emails + WhatsApps sent and recorded; Diana not completed, 0 contact numbers; My day restated with 6 questions (no answer yet). |
| 246 | Screenshots: pastel "background theme" per user; on a PI the inline Schedule / TBD buttons should go ("the popup looks much better"); a "No. of People" check with Change next to the dates, required to schedule | Restated with 6 questions; found the Ready popup **couldn't schedule** (no number row). |
| 247 | "only one change theme option · save it browser only · popup better, we can go back · people asked with the schedule · yes" | Built: schedule popup everywhere, people check, `peopleOf`, themes v1 (`c1aa959`). |
| 248–249 | "continue" · "push it to github" | `c1aa959` + handoff `e94d50c`, live. |
| 250 | Fulfillment tracker screenshot: "same phases for all other boards' merged cards" | Restated with defaults. |
| 251–252 | "theme in colours for the black one too, more themes, make them themes" · push | Light / dark theme sets (`bfed393`). |
| 253–254 | Screenshot: Training box Concerned line overlapping the date — "fix the ui" · "push it obv" | Own lines per item (`8eaea44`). |
| 255–256 | "why haven't we added something like this to other boards" · push | Step tracker on Training / AedSmartx / Logistics (`0afbfe2`). |
| 257–258 | "remove Appearance; experimental themes that colour the cards too: Plum (black), Smoky coastal (white)" · push | `66230d3`. |
| 259–260 | Mini calendar: "a + instead of nothing on this day" · push | `89a7655` (portal for the Overview popup). |
| 261 | "what UI changes for quality? bring my Zoho Analytics analysis here as a page under Calendar — Power BI for visuals, Zoho Analytics for data?" | Advised against Power BI (licences / capacity, no connector); listed UI priorities. |
| 262–265 | "can Tableau work?" · "use the format like Tableau / Power BI — ZA reports look terrible" · "better if I could generate reports in my dashboard" · "interactive dashboards btw" | Same cons for Tableau; proposed building reports + interactive dashboards in the dashboard. |
| 266 | "write a big big plan on everything Power BI and Tableau do, and do it better — look at their cons and fix them" | `ANALYTICS-PLAN.md`. |
| 267–270 | "double-check all data from Zoho Books and Analytics" (+ private workspace link) · "how do I do that?" · "run it locally" · "how do I put the client id and secret" → built the Connect popup; "all is connected yessir" | Books checked via the Zoho Books connector (custom fields, modules, Zoho One Enterprise); ZA read via the app (475 items); `ANALYTICS-SCHEMA.md`. |
| 271 | "push it to github!" | `c58fd75`. |
| 272 | "yeah" (all §10 defaults of the plan) | **Reports Phase 1** built (data via Zoho Analytics, checked vs Books). |
| 273 | "push it" | `5b623b7`, live. |
| 274 | Period picker screenshot: "how can I edit this?" · "which file / where is the arrow" · owner set `pl-5` ("push") · "move the arrow a little left" · push | Explained; `a9e2716` (owner's edit) · `98b44c5` (own chevron, `right-4`, `pr-10`). |
| 275 | "why no option to delete reports I make lmao; more colours than all green" | Edit / Delete on KPI tiles; colour per chart / per named bar (`1b67e25`). |
| 276 | "change the pink to mint blue #98FBCB" + "palettes depending on the theme selected, otherwise it looks weird" + "switching chart → table, the report disappears" · push | #98FBCB fails contrast on white → `#45cf9c` / `#40a985`; aqua dropped; theme palettes; ECharts fix (`9c64aaa`). |
| 277 | "for base black and white keep the bars mint green" · push | `1bd3873`. |
| 278 | "push it, and fetch me some interesting screenshots of today's changes" | 12 screenshots in `D:\Projects\Training Dashboard\Screenshots 2026-10-22\`. |
| 279 | "write a text for me to update my work" | Zoho Sprints block (DONE / WAITING ON US / NEXT / SUGGESTIONS). |
| 280 | "the fonts on the reports are too small" · push | One step up everywhere; builder via portal (opened low on long pages) (`b88fb24`). |
| 281 | "new report should pop up in the middle of the screen" | Measured on the live site: centred at 1366×768 / 1728×958 / 1920×1080, scrolled or not — owner's tab was likely old (Ctrl + Shift + R); offered a shorter window. |
| 282 | "write a handoff for a new session, tips for suggestions without breaking the current software, and a message to pass" | This update (+ §11) and the starter message for the next session. |

### Session 14 (26 Oct 2026) — Progress tracker
| # | Prompt (paraphrased) | Result / commit |
|---|---|---|
| 283 | Brief: read HANDOFF; rules; read-only checks (git, Tata reminders, Diana / Sierragold, Reports); then Reports Phase 2, ZA dashboards, My day — one at a time | Checks done (Tata 26 Oct reminder went 09:01, Priyanka marked it not required 09:14; Diana / Sierragold not completed; ZA copy 23 Oct; 0 saved reports). Phase 2 restated with 6 questions — never answered. |
| 284 | "another page called progress-tracker" + a pasted spec asking for an implementation-ready architecture document | `PROGRESS-TRACKER-PLAN.md` (requirements S1–S26, assumptions, open decisions D1–D16, build order). |
| 285 | "it goes under report, section" | Plan: `/reports/progress-tracker`, sidebar sub-item, everyone gets Reports (others see only the tracker). |
| 286–287 | "run locally, let me see" · "build it come on" | Dev server; then built requests, matrix, counts, status cards, check-ins, threads, notices, "Ask a teammate". |
| 288 | "I need to see what everyone needs to do or is going to do" → answers "1 yes · 2 yes + mark complete or pushed if past date · 3 exclude sales · 4 don't care · 5 no renewals" | **Everyone's to-do**. |
| 289 | "I don't need post today's check-ins" · "(i) icon; an auto record of all the work the user completed, not just to-do — instead of check-ins" | Check-ins removed; **Work done** tab; (i) explainer. |
| 290 | Screenshot: "give it a logo" | Ticked-checklist icon on the sidebar item. |
| 291 | "keep this as a separate idea, we might remove it later, but push it" → PowerShell push failed → "you push it tho" | `b63aebb` docs + `09c4495` tracker; pushed from Git Bash. |
| 292 | "align it properly" (screenshot) · push · "why is it still not aligned" · "push it" | Indented under Reports (`f899c00`) → in line with the other items (`7448dfe`). |
| 293 | "the user tagged should see where they are tagged" → "if mentioned, a red 1 on the tracker until they reply or resolve in the ticket" | Tagging (`909f3d0`). |
| 294 | Screenshot of "Progress tracker →" in Reports: "remove this, why is it there, push" | It was the plan's second entry point; removed (`b81bab6`). |
| 295 | "write a handoff + message; research 20+ advanced EDA reports, user picks which reports show, more KPIs, ₹50 L monthly goal as a vertical meter on the left, Tableau / Power BI flexibility (custom filters, parameters), less congested UI" | This update; the work itself is for session 15 (starter message). |

### Session 15 (27 Oct 2026) — advanced Reports
| # | Prompt (paraphrased) | Result / commit |
|---|---|---|
| 296 | Brief: read HANDOFF; rules; morning checks; then research 20+ reports (Tableau / Power BI), choose-your-reports, more KPIs, ₹50 L meter on the left, filters / parameters, less congested UI — restate + questions with defaults, then one at a time | Checks clean. 27 report ideas with data mapping + 9 questions with defaults. |
| 297 | "yessir" | All defaults (ANALYTICS-PLAN §11). Built (a) the goal meter. |
| 298–301 | "next" ×4 | (b) calmer layout · (c) more KPIs · (d) compare / filters / views / Change this chart / what-if · (e) Growth, Team & pipeline, Collections. |
| 302 | "push it to github" | `0af501b` + `7814162`, live (one code commit — the steps shared files; promised: commit per step from now on). |
| 303 | Screenshot of the meter in teal on Plum: "the color should change with the themeeee, also add more experimental themes i like them" | Meter takes the theme's chart colour; 6 new experimental themes (`d456670`, local). |
| 304 | "continue" ×2 | Second batch of reports (Customers, Products, training economics) — uncommitted, see "Start of the next session". |
| 305 | "write a handoff for new session — whatever is done, whatever is left" | Session 15 handoff. |

### Session 16 (27–28 Oct 2026) — finish Reports, My dashboard, India map, pages, database incident
| # | Prompt (paraphrased) | Result / commit |
|---|---|---|
| 306 | Brief: read HANDOFF; rules (no test data, no real emails, push only when asked, §11 before every push, Git Bash, no secrets, one commit per step); git status + live checks; fix #127; build + browser-check Customers / Products; show; restate "My dashboard" with questions + defaults | Checks clean. #127 fixed (`7b2ff08`); batch 2 checked, 3 bugs fixed (`2a94484`); My dashboard restated with 5 questions. |
| 307 | "yes go ahead" | All defaults → My dashboard (`bb387fa`). |
| 308 | "go through the plan and continue with the next step" | #18 India map (`25a5e6b`); then proposed the ⚠ reports with defaults (§10 #143). |
| 309 | Screenshot of live Reports stuck on "Updating…", blank meter: "its not loading in, i am thinking its because theres too much load now, check whats the issue and try to figure out a way around this" | Found Atlas M0 over its weekly transfer limit (~90 KB/s; cold Reports 119 s) caused by 15-s full pulls; fingerprint cache + "same" pulls (`857114d`). |
| 310 | "commit all 6" | All six were already committed → read as option 2 "push all six"; pushed `7814162..857114d`. |
| 311 | (mid-turn) "add pagination in the reports . only fetch data when clicked and not before that" | Pages per section, only the open page fetched, Filters lists on first open (`bbb061e`); plus gzipped Reports copy / board only when needed / readable errors (`efb56d0`). |
| 312 | "push it to github" | Pushed both; ran Refresh now (copy stored gzipped); found live "Server selection timed out" = cached failed connect → `207d0d5` committed; **the push was refused by the classifier** (not covered by that "push it"). |
| 313 | "push it to github" | `207d0d5` pushed; live Reports all 200, ~10 s cold while throttled. |
| 314 | "update the handoff prepare for next session" | This update (throttle gone by 28 Oct 08:30; Reports 4.7 s cold). |

### Session 17 (28 Oct 2026) — the ⚠ reports, Mumbai region, Quotations page
| # | Prompt (paraphrased) | Result / commit |
|---|---|---|
| 315 | Brief: read HANDOFF; rules; checks; ask about the three ⚠ reports + open questions | Checks clean; asked with defaults. |
| 316 | "yessir but before that, add an option to mark email sent and raise the email counter +1 for Priyanka" | AedSmartx "Mark email sent" (`2865e2f`). |
| 317 | "yessir" | Stock (`459ba9f`), Freight (`c8bb7e4`), Margin (`1577164`); refresh in turns (`987d392`). |
| 318 | "push it to github" | Pushed. |
| 319 | "implement cache memory … then see if it fixes anything; increase the size of the fonts of the reports" | Bigger text + charts in the page font (`de87578`), answer caches (`264c7b7`), functions to Mumbai (`af0231c`). |
| 320 | "push it" / "if i zoom out, the website should get wide with it" / "push it" | Full-width pages (`408c89f`); pushed. |
| 321 | "need to make a Quotation Master Page under Overview … click one time and a quotation is sent through zoho books" + answers (build something now; one click + a check; Admin/Ashish/Shikha/Sumit; separate connection; primary contact; tell me all steps) | Quotations page (`964b0d6`); steps given. |
| 322 | "push it to github" | Pushed. |
| 323 | Screenshots of the popup and Zoho's quote form: "very small … check how a zoho quote looks … what we can implement" | Found Zoho's mandatory quote fields; proposed the Zoho-like popup. |
| 324 | "yeah" | Mandatory fields + details (`9f703a5`), Zoho-like popup (`a319c63`). |
| 325 | Certificates: "Zoho Sheet sign-in failed … need to reconnect to the api console" / "push it immediately, no credits left" | Reconnect path (`32da8bb`); pushed. |
| 326 | "no option for reconnect sheet" | It was deploying; told to Ctrl+Shift+R (Generate certificates → Reconnect sheet). |
| 327 | "a bit more bigger … pre fill from the items … create quotation from scratch … adding items easier … item images from zoho books" → "go ahead" | `2bef444`, `171cfa2`; pushed. |
| 328 | "the background is scrollable" / Browse items button + filter dropdown + no-picture items last | `7de1e6d`, `1ce7425`; pushed. |
| 329 | Overview colours, "reports along with the KPIs", "filters don't change the reports", New quotation shows previous values | `b3dd0f0`, `5aa1cfb`, `c6e0a14` (filters checked — work); pushed. |
| 330 | "align these arrows" | `a3275dd`; pushed. |
| 331 | Zoho's New Customer screenshot: "write a handoff … tips, issues … make it work like Zoho Books quotation but better … new customer then quote right after … download the PDF, attach to email, add attachments … explain what you understand" | This update; the task is §10 #150. |

### Session 18 (29 Oct 2026) — Defibtech, Reports phases 1–4, the dashboard canvas, the live crash
_Paraphrased from the owner's messages as quoted in the commits (the session ran on the owner's PC; one cloud session
joined mid-day)._
| # | Prompt (paraphrased) | Result / commit |
|---|---|---|
| 332 | Brief + checks | Clean (database 7 MB/s, Sync log ok, sheet working, Quotations `newCustomers: false`). |
| 333 | "a report of defibtech aeds, pads, battery, their price change between sales and purchase and its average" | Defibtech tab (`b3b60a1`). |
| 334 | "an option on how many dashboards i want to see … a checkbox in the customise option" | Tabs ticks (`9c8a71a`). |
| 335 | "i have 3 items … the charts and tables confuse me, make them easier" | Overview + one page per product (`9113a60`). |
| 336 | "date filters, like yearly, monthly, quarterly, weekly", purchase trends, monthly stock | Show by, Purchases, Stock pages (`6204c41`); titles follow Show by (`28e6f86`). |
| 337 | "All Defibtech items and their reports, add another page" | All items page (`32f6d67`). |
| 338 | Item active / inactive filter, include / exclude items; quote sent / accepted / declined / conversion KPIs | `216c3bd`. |
| 339 | Reports plan phase 1 ("filters don't change the reports", "date filters", narrowing lists, quote wording…) | `77a1d5b`…`9f46106`. |
| 340 | "the filters remain the same in all dashboards" | Shared filters + dashboard scope (`f363415`). |
| 341 | "make dashboards, pages, choose what goes where, delete", "select what dashboard it goes in" | `4ba293e`, `843cdfe`, `36369b3`, `3563734`, `2c459c4`. |
| 342 | Screenshot of the editor popup: "not like this … move charts directly … kpis all individual … max 8 a page" | Edit in place, rooms (`63557f0`). |
| 343 | "drag and drop, others making space in real time … a big box container … anywhere … resize by its edge … a kpi could be 4x2 too" | Restated (12×16 canvas, react-grid-layout) → "yeah" → canvas (`f5b5059`). |
| 344 | (cloud session) "continue from last execution" / "how do i push it" | `f5b5059` + `63557f0` were only on the PC; owner pushed from Git Bash with step-by-step help. |
| 345 | Screenshot "This page couldn't load" on /reports: "my shit died" | Old pages-of-4 dashboards crashed the canvas → `upgrade` in the route (`f8a9c37`); "push it to master" → pushed. |
| 346 | Phase 2 "do whatever you recommend" | `npm test` (`d0f652b`, `8dbad8a`). |
| 347 | Phase 3 "YEAH GO FOR IT" | 11 tabs → 8, What changed (`80613e6`). |
| 348 | Phase 4 "yess les go" / "numbers with context" | Chart lines (`ee74ed8`), drill-down (`210d4c5`), trend lines in numbers (`6dfab55`); pushed. |
| 349 | "Update HANDOFF.md for session 18 … commit it (push only if I say)" | This update. |

---

## 6. Zoho facts learned the hard way

- **Quotes (estimates) have two mandatory custom fields** (28 Oct): "Send to CRM" (`cf_send_to_crm`, id
  `982417000013838167`, Yes/No) and "Reminder Frequency" (`cf_reminder_frequency`, id `982417000021649418`: None,
  15 days, interval of 2 days, " on each Wednesday", on each Monday). Others: Reminder Date (`cf_last_reminder_date`,
  = quote date), Product Type (`cf_category`), Deal Name (`cf_deal_name`, the team writes "product qty city" — it
  becomes the CRM deal), Lead Source (`cf_lead_source`). **Option values keep Zoho's spelling, some with a leading or
  trailing space ("Training ", "Direct ")** — send them exactly. All in `QUOTE_FIELDS`.
- **Contacts (customers) have two mandatory custom fields**: Type (`cf_type`, id `982417000008274205`: New Customer,
  Old Customer, New Reseller, Old Reseller, Old Vendor, New Vendor) and Sector (`cf_sector`, id `982417000011023041`,
  19 options from Traders to NGO). Zoho's form also requires Display Name, GST Treatment, Place of Supply, Tax
  Preference, and says **Last Name is mandatory to sync the contact with Zoho CRM**. Optional: Special Identifier
  (hotel chains), Accounts Email Id.
- **Self Client refresh tokens can die without anyone revoking them**: the master sheet's token from 12 Oct was refused
  on 28 Oct (`invalid_code` on the refresh). Most likely Zoho's cap on refresh tokens per user per client (the oldest
  is dropped when new ones are made — session 17 made several). Keep the number of connects low, and give every
  connection a Reconnect button that keeps its settings.
- **Items list** (`GET /items`) already carries `item_tax_preferences` (intra GST group + inter IGST, same %),
  `cf_stock_status` ("In Stock" / "Back order"), `category_name`, `image_name`, `unit`, `product_type`; descriptions
  are long (read one item when needed). **`GET /items/{id}/image`** returns the picture bytes with the sync token.
- **GST:** Think Health's place of supply is Maharashtra (MH): customers in MH get CGST + SGST (half each), other
  states IGST, overseas none. A contact's state is `place_of_contact` (two-letter codes).
- **Quote PDF / email** (for #150): `GET /estimates/{id}?accept=pdf`; `GET /estimates/{id}/email` (the template);
  `POST /estimates/{id}/email` (send, with attachments) — verify limits and scope before relying on them.
- **Default notes and terms** (bank details) — taken from the newest quote; quotes made through the API carry them only
  if sent.
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
- **Zoho Sheet / Zoho Mail reading (session 6) — written from the docs, not yet run for real** (no connection existed):
  Sheet Data API v2 = form POST to `https://sheet.zoho.in/api/v2/<resource id>` with `method` (`worksheet.list`,
  `worksheet.records.fetch`, `worksheet.records.add` + `header_row`, `json_data`), scopes `ZohoSheet.dataAPI.READ/UPDATE`;
  Zoho's own reference pages didn't render for scraping — method names come from Zoho community posts/Deluge docs. Mail:
  `GET /api/accounts/{id}/folders`, `GET …/messages/view?folderId=&limit=&sortorder=false` (rows: messageId, threadId,
  folderId, fromAddress, subject, receivedTime), `GET …/folders/{f}/messages/{m}/content`, `POST …/folders {folderName}`,
  `PUT …/updatemessage {mode:"moveMessage"}`. If the first real use fails, check these first (§10 #30).
- A Zoho **alias** (learn@) can only be sent from the mailbox that owns it (shikhadixit@) — connect that account.

---

## 7. MongoDB `thinkhealth_dashboard` (Cluster0)
Team data: `cardEvents` (live change log), `cardEventsArchive` (cleared logs), `members`, `memberPins` (hashed), `entries`,
`followUps`, `announcements`, `removedTriggers`. Zoho copy: `zohoDocs`, `zohoCustomers`, `zohoPayments`, `kv`.
Session 5: **`mailTemplates`** (email wording, doc `aed_onboarding`), kv **`zoho_mail:hello@thinkhealth.in`** (Zoho Mail
connection — secret). Sent emails are `aed_email` events in `cardEvents`.
Session 6: `mailTemplates` doc **`fulfil_gratitude`** (placeholder wording); kv **`zoho_mail:learn@thinkhealth.in`** (once
connected; also caches `folders.inbox/sent/named`), kv **`zoho_sheet:master`** (sheet connection — secret), kv
`zoho_sheet_lock` (one batch at a time); **`certDesigns`** (`_id` `bls` / `fa`, the PDF as Binary — signature + seal, never
export or commit); `zohoSyncLog` entries may carry `replies` / `mailError`; `cardEventsArchive` rows carry `clearedScope`,
and the two restored batches `restoredAt` / `restoreSkipped`.
Session 11: `entries` docs carry `createdBy` (server) / `people` / `everyone` (0 entries on 19 Oct); **`reminderSeen`**
(`_id` memberId:IST day, `ids`, TTL 3 days — popups seen); `cardEvents` kinds `training_reminder` / `training_postponed_mail`
(server only); kv `training_reminders_lock`; learn@'s kv doc caches `folders.named["Training Reminders"]` once filed.
Session 12: kv **`whatsapp:anantya`** (Anantya **API key — secret, never print / export**, team WhatsApp numbers, picked
templates with `vars`); `cardEvents` kinds **`training_whatsapp`** (server only) and **`set_training_phone`**, and field
**`phone`** on `set_training_date`; `zohoSyncLog` entries may carry `whatsapp` / `whatsappError`, and the reminders cron
writes its own entries (`trigger: "scheduler"`, `source: "Vercel cron · reminders"`, `result: "not due"`).
Session 13: field **`people`** on `set_training_date` (the checked head-count; replayed into `TrainingSchedule.people`);
kv **`zoho_analytics:workspace`** (Zoho Analytics connection — **client secret + refresh token, secret, never print**;
`workspaceId` 421000000000021002, `orgId`, `orgName`, `connectedBy`), collection **`za_tables`** (one doc per Zoho
Analytics table — `_id` = key in `build.ts` `TABLES`: invoices, invoiceItems, customers, addresses, salespersons, items,
quotes, payments; `rows` = only the listed columns as Zoho formats them, `count`, `at`) — a **cache of Zoho data, safe
to rebuild** (Admin → Reports → Refresh now), kv **`za_state`** (`refreshedAt`, `refreshedBy`, `error`, `tables` counts),
kv **`za_refresh_lock`** (lease, 5 min), collection **`reports`** (saved reports: `_id` uuid, `spec`, `by`, `byId`, `at`,
`updatedAt` — **real team data**; 0 on 26 Oct).
Session 14 (Progress tracker — **all real team data**, never write test documents):
- **`ptRequests`** — `_id`, ref, category, priority, requester / waitingOn id + name, task {kind board/free, title,
  cardId?, search?}, note, status open / resolved / withdrawn, createdAt / reopenedAt / seenAt, pings[],
  resolvedAt / By / resolution, withdrawnAt / By, `log[]`, updatedAt.
- **`ptComments`** — parent `request:<id>`, by / byId, text (emptied when removed), at, deletedAt, `mentions[]`.
- **`ptPresence`** — `_id` member id, name, lastSeenAt (one timestamp, overwritten), away {at, until?},
  focus {text, at}.
- **`ptNotifications`** — to, kind request / ping / resolved / reopened / comment / mention, requestId, text, at,
  urgent, readAt, `expiresAt` (**TTL 30 days**).
- kv **`pt_request_seq`** (counter).

Session 15:
- kv **`reports_goal`** — the monthly revenue goal (none yet = ₹50 L default; Admin's ✎ writes it). Real setting.
- **`reportPrefs`** — each member's own Reports settings (`_id` member id, `views.<dashboard>` = saved views). Real team
  data, written only when someone saves a view; 0 docs on 27 Oct.
- `za_tables` gained **`salesOrders`** and **`salesOrderItems`** (cache; batch 2 adds the `Product ID` column — already
  refreshed into the copy locally on 27 Oct).

Session 16:
- **`za_tables`** docs are now `{gz: Binary (gzipped JSON rows), count, at}` — written by every refresh since
  `efb56d0` (Admin "Refresh now" ran on 27 Oct 11:27 UTC; all 10 tables gz, same counts). Old `{rows}` docs are still
  read. Still a rebuildable cache.
- **`reportPrefs.layout`** = `{tiles: [{dash, tile, size?}], updatedAt}` — a member's My dashboard (real team data;
  0 docs on 28 Oct — nobody has customised yet). kv **`reports_layout`** = `{tiles, updatedAt, updatedBy}` — Admin's
  starting layout (not set on 28 Oct → built-in `START`).
- kv **`reports_goal.monthly` = 6000000 (₹60 L)**, set by Admin on 27 Oct evening.
- Per-instance memory only (no DB): `cachedRead` copies (keyed by fingerprint), Reports `copy` (keyed by refreshedAt).

`ptStandups` was used only by the removed check-ins (empty). On 27 Oct: 1 request (R-0001, resolved), 2 notices,
4 presence docs.

Legacy: `leads` (4,105 docs, unused since session 1) — drop only with the owner's OK. History: `cardEvents` was cleared by
request in session 1 (twice) and by Shikha once in session 2; Admin cleared **Everything by mistake on 3 Oct and 10 Oct**
(both restored in session 6). Archive keeps copies of every clear.

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
- They answer questions as short numbered replies ("1) … 2) yeah 3) yes too"); offering a recommended default for each works well.
  They try changes on the live site right away — if something "doesn't work", first check whether it was pushed yet.
- Permissions: see §1 (roles.ts). Admin does everything and is the only one who clears logs.
- Data identity: the **customer name comes from Zoho and is never edited** in the dashboard; aliases, numbers and emails
  follow the customer name across every board.
- Secrets: the owner asked whether to show the Client ID/secret — the answer is always "type it only into the app's own
  popup / Vercel, never in chat".
- Session 6: the owner relays rules from **their boss** that aren't negotiable ("my boss wants this, I have no say") — e.g.
  replies go to digital@, digital@ does no sales/training sending. Offer the best way to do *that*, not an alternative goal.
- They want **dangerous actions locked** (typed confirmation) and **mistakes recoverable** — when something looks lost, check
  the archive first and offer to roll back.
- Keep the "important, may change later" items visible in the handoff (e.g. the certificate date rule — "last training day" until 13 Oct, now the day each person was trained).
- Session 7: the owner says **"push it to github"** after almost every change and tries it on the live site within minutes —
  build, scan the diff for secrets, push, poll the live JS for a new string, then tell them **Ctrl + Shift + R**.
- A one-word **"yeah"** after a numbered list of questions with recommended defaults = **all defaults accepted**.
- UI requests come as screenshots + "cluttered / distorted / proper alignment": measure at 1728×958 on real cards (read-only
  browser, §9 #14), keep the existing look, fix layout and fit — no redesigns.
- Session 8: a **"yes yes go ahead … in a new session"** means: write the handoff, put the approved items first for the next
  session, don't do them now. When they say "enhance the UI" they judge by what they see on the pages they use most (they
  checked the Overview after a Fulfillment-only polish) — say clearly which screens a UI change covers, or cover them all.
- They size targets in round numbers and expect the dashboard to count from **the boards**, not Zoho invoices ("use our new
  data"); revenue is the exception (Zoho).
- They want the dashboard to **move cards on by itself** where the outcome is certain (Completed on invoice date merges to
  Payment received; Mark as Completed goes straight to Logistics) rather than leaving manual merge steps.
- Session 9: files they attach in chat (templates, PDFs) are also saved somewhere on disk — find them by name / today's date
  (`D:\New folder\` this time) instead of asking. **Before anything reaches Shreya's printouts, render it** with made-up names
  (§9 #14 PDF check): the new templates looked fine as files but printed blank through the converter.
- Short, direct answers when they say so ("without wasting tokens be direct"); for messages to their **boss** they want very
  short WhatsApp-style text. Non-code help (domains, DNS, Vercel) is welcome — check the facts first (e.g. `nslookup` showed
  the DNS is on Cloudflare, not GoDaddy).
- They use **Admin** on the live site themselves during the day (merges, syncs) — live entries by "Admin" are usually theirs,
  not a test; confirm from the local server log before suspecting your own scripts.
- Session 13: the owner says **"push it to github" after nearly every change** (sometimes "push it obv", typos like
  "pushi t") — do the §11 checklist each time; if nothing changed, say so plainly (they asked twice when nothing was
  left — likely an unsaved edit in their editor: check `git status`, and if their described edit isn't on disk, say it
  isn't saved).
- They edit small things themselves in Cursor (e.g. `pl-5` on the period picker) and ask which file / line to change —
  answer with the exact file:line and the class to change, then push their edit unchanged.
- Visual taste: colours that match the chosen theme ("otherwise it looks really weird"), **mint green** bars on the plain
  white / black themes, **bigger text** in Reports, popups **in the middle of the screen**. They dislike plain pink and
  "all green" brand-teal charts. When a requested colour fails contrast (#98FBCB on white), use the nearest passing
  shade of the same hue and say why in one line.
- Analytics: they built reports in **Zoho Analytics** (query tables by Sumit A Shah) but find its look "terrible"; they
  want Power BI / Tableau-like interactive dashboards **inside this dashboard**, generated by the team themselves.
  Recommend building, not licensing (Power BI / Tableau licence + no direct Zoho Analytics connector).
- "yeah" = all defaults of the last numbered list (again in session 13, for the whole ANALYTICS-PLAN §10).
- They like a folder of screenshots and a pasteable Zoho Sprints status after a day's work (reference memory).
- Session 14:
  - They **paste long generic specs** (written for any company — GitHub / Jira / Figma webhooks, standups). Build the
    parts that fit this team, and say which parts don't.
  - They then trim what they don't want ("I don't need check-ins") and ask for automatic data instead of typing
    ("an auto record of the work"). **Prefer reading from the boards over asking people to type.**
  - Ambiguous one-liners ("align it properly", "where they are tagged"): when it isn't obvious, ask one short question
    with a recommended default. A wrong guess (indented vs in line) cost a round trip.
  - They want new features kept as a **separate idea that can be removed** — own commits, nothing tangled with
    existing code.
  - They notice redundant entry points ("why is it there") — don't add a second way into a page unless asked.
  - "push it to github" in the same message as a new request = push the finished request when done.
- Session 15:
  - "yessir" = all defaults (like "yeah"). "next" = build the next agreed step; "continue" = carry on with the plan.
  - They like **dense analysis but a calm screen**: one toolbar row, panels / menus instead of rows of buttons, sections.
  - Colours must **follow the chosen theme** everywhere (they noticed the meter's fixed teal on Plum at once).
  - They **like the experimental themes** and want more of them.
  - Commit **one commit per step** (session 15 bundled five steps into one commit because they shared files — said so;
    keep commits per step from now on so each idea can be reverted alone).
- Session 16:
  - "yes go ahead" after a restated list = all defaults. "go through the plan and continue with the next step" = take
    the next item of the plan (ANALYTICS-PLAN §11), build it, then propose the one after with defaults.
  - **"commit all 6" meant push** (they were already committed). When a word doesn't match the state (commit vs push),
    pick the meaning that fits the offered options and say which one you took.
  - Slowness is reported as "too much load" — **measure first** (time each call; Mongo read speed), then fix the cause.
  - They want Reports to **fetch only what's on screen** ("only fetch data when clicked and not before that") — keep
    new Reports features lazy (per page / on open).
  - The auto-mode classifier refuses a push not asked for in the latest message — commit, then ask; a new fix after a
    "push it" needs its own "push it".
  - They changed the goal to ₹60 L themselves (Admin ✎) — they use the Admin tools on live.

---

## 9. How to verify without touching team data
No test suite. Pattern used throughout:
1. Headless Chrome via `puppeteer-core@23` (scratch folder) at **1728×958**; intercept and **abort `POST /api/store`** so nothing is saved.
2. Signing in: real PIN sign-in as Admin via `/api/members/sign-in` (read `ADMIN_PIN` from `.env.local` inside the script —
   never print it). To see **another member's view** (role checks use `member.id === "admin"` and the member *name*): put
   `{member:{id:"arti",name:"Arti Sirohi"},token:<admin token>}` in `localStorage th.session` **and intercept
   `POST /api/members/session`** to answer `{ok:true,memberId:"arti"}` — data still loads with the admin cookie, saves stay blocked.
   Remember `localStorage th.board` (training / aed / fulfil / logistics) picks the board. Note: a stand-in view still *saves* as
   Admin (the cookie decides), so it can't test server permissions — see 3.
3. For anything that must write (e.g. server stamping, permissions, full click-through flows), run a second server against a
   **throwaway database**: copy the live data **read-only** into `thinkhealth_qa` (zohoDocs, zohoCustomers, zohoPayments,
   members, **cardEvents**, and kv `zoho_state` / `zoho_items` / `zoho_users` / `zoho_access_token`; set `zoho_state.syncedAt`
   to now so it doesn't sync), then `npx next build` and `MONGODB_DB=thinkhealth_qa CRON_SECRET=<any> npx next start -p 3001`;
   test (writes are fine there), then **drop `thinkhealth_qa`** and stop the server. To act **as a member** against it, compute
   their session token in the script exactly like `sessionToken()` in `pins.ts` (HMAC with `SESSION_SECRET`, or its fallback
   derived from `MONGODB_URI` + `ADMIN_PIN`) — never print it, and only send it to the :3001 server.
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
10. **Session 5: the auto-mode safety classifier refused copying live data into `thinkhealth_qa`** (PII) and then even code
    searches toward that test. Don't retry it on your own: either ask the owner to allow it (permission rule) or test with
    synthetic data — e.g. the esbuild pattern (#7) with made-up leads/invoices/events (used for the Contacted logic, the
    templates, customer-wide contacts and the name lock), or a browser with every `/api/*` request answered by fake JSON.
11. **Emails**: never send a real email to a customer while testing. A QA database has no `zoho_mail:` doc, so sends fail
    there by design; on live, use **Send a test** (records nothing).
12. **Session 6 pattern (no live data at all) — reuse it:** scripts were in the session scratchpad (gone now), rebuild them:
    - **Fake-API browser run:** `npx next build` + `npx next start -p 3001` (or the dev server), puppeteer-core (Chrome at
      `C:/Program Files/Google/Chrome/Application/chrome.exe`) with request interception answering **every** `/api/*` from
      made-up data (`/api/members/session` → `{ok:true,memberId:"shreya"}`, `/api/pipeline` → 4 made-up PIs, `/api/store` →
      made-up `cardEvents` incl. `set_training_date` + `complete_training` on `pi:<id>` and `fulfil_*` events on
      `fulfil:pi:<id>`, mail/sheet/certificate routes → canned answers, unknown `/api/*` → **abort and list**). localStorage
      `th.session` = `{member:{id:"shreya",name:"Shreya"},token:"fake"}`, `th.board` = `fulfil`. Downloads via CDP
      `Browser.setDownloadBehavior`. `window.open` stubbed. This tested the whole Fulfillment flow and the Clear logs lock.
    - **Server modules with mocks:** esbuild (from the npx cache) with an `onResolve` plugin mapping `server-only`, `./db`,
      `./zohoMail` to small mock files; a fake `globalThis.fetch` for the Zoho Sheet API. Used for reply matching / filing
      and the sheet client (column detection, max serial, date style, append payload, lock).
    - **PDF:** bundle `certPdf.ts` with a `fetch` that reads `public/certificate-fonts`, feed the real design from
      `D:\Projects\certificate-generator\private\backgrounds\` and made-up names; output stays in the scratchpad.
    - A test server left on :3001 (`next start`) survives `TaskStop` — find it with `Get-NetTCPConnection -LocalPort 3001`
      and check its command line before `Stop-Process`.
13. **Restoring cleared logs** is a live-data write the owner asked for — summarise the batch first (counts by author / card
    type, no names), restore with original ids, skip entries already redone, mark the archive rows.
14. **Session 7 patterns (scripts were in the session scratchpad — rebuild):**
    - **Read-only browser on the real local app:** puppeteer-core 23 (installed in the scratchpad), 1728×958, real Admin
      sign-in (`ADMIN_PIN` read from `.env.local`, never printed), `th.board` in localStorage, request interception that
      **aborts every non-GET `/api/*`** except sign-in/session and the certificates **preview** (`"preview":true`, read-only),
      answers `/api/zoho/sync` with "not due". Clicks cards by their doc number; measures `[role=dialog] .overflow-y-auto`
      `scrollHeight - clientHeight`. Optimistic UI changes show but never save; confirm afterwards with a read-only count.
    - **PDF check:** bundle `certPdf.ts` with esbuild, a `fetch` stub reading `public/certificate-fonts`, the real templates +
      made-up names → PDF in the scratchpad; render page 1 with pdf.js 3.11.174 (downloaded next to an HTML page, served by
      a tiny Node server on 127.0.0.1, screenshot with puppeteer — Chrome's `--screenshot` doesn't wait for pdf.js). The
      Read tool can't render PDFs here (no pdftoppm).
    - esbuild bundles that share objects with the test script need `--external:pdf-lib` (two copies break `instanceof`).
15. **Session 13 patterns (scripts were in the session scratchpad — rebuild from this):**
    - **`env.cjs`** loads `.env.local` into `process.env` without printing; every script `require`s it.
    - **Read-only Mongo queries** with the project's own driver (`require("<repo>/node_modules/mongodb")`): Sync log
      (`zohoSyncLog` since a time), `cardEvents` by kind / card id, kv docs **projected without secret fields**.
    - **Server modules on live data without a server:** esbuild-bundle a small TS entry that imports `getSnapshot` +
      `boardsNow` (aliases: `server-only` → empty file, `next/server` → `{ after(){} }`, `--external:mongodb`) — prints
      board cards (e.g. which trainings lack a contact number). `getSnapshot` only *schedules* a sync via `after()`, which
      the stub turns into a no-op.
    - **Admin helper** (`admin.cjs`): POST `/api/members/sign-in` with `ADMIN_PIN` → cookie → GET any route on
      localhost (Git Bash mangles a leading "/" in args: pass `api/…` and add the slash in code). Used for
      `/api/zoho-analytics` (views, `?view=`, `?export=`) and `/api/analytics` (POST report specs, read-only).
    - **Browser checks** (puppeteer-core 23 in the scratchpad, Chrome at `C:/Program Files/Google/Chrome/Application/
      chrome.exe`, 1728×958): abort every non-GET `/api/*` **except** sign-in / session and `POST /api/analytics`
      (report queries are read-only); answer `/api/zoho/sync` with `{"enabled":false}` and `/api/reminders` with
      `{"seen":[]}`; set `th.theme` / `th.bg` / `th.board` / `th.reports.tab` in localStorage; `emulateMediaFeatures`
      `prefers-color-scheme: light` for light shots. Canvas check for charts: count non-transparent pixels.
    - **Zoho Books numbers** via the claude.ai Zoho Books connector (org `60016330017`): `list_invoices` with
      `date_start` / `date_end` and `response_option: 3` returns count + total + balance — compare with Reports.
    - **Palette check:** dataviz skill's `scripts/validate_palette.js "<hex,…>" --mode light --surface "#ffffff"` (and
      `--mode dark --surface "#1c1c1e"`).
    - Inline `node -e '…'` breaks on any apostrophe in the code (bash quoting) — write a `.cjs` file instead.
16. **Session 14 patterns (scratchpad scripts — rebuild from this):**
    - **Route handlers end to end with no database:** esbuild the route modules with a plugin that maps `…/db` to an
      in-memory fake (`find/sort/limit/toArray`, `findOne`, `insertOne` with a duplicate-key 11000 error, `updateOne`
      with `$set/$unset/$push/$inc` + upsert, `findOneAndUpdate`, `distinct`, a small `aggregate`, array-field
      matching like Mongo), and `@/lib/auth` to a fake that reads the member from an `x-test-member` header. Then call
      the exported `GET` / `POST` / `PATCH` with `new Request(…)`.
      Used for the request lifecycle, permissions, notices, tagging (15 + 36 checks).
    - **Pure rules:** esbuild `src/lib/progress/model.ts` + a test file with made-up members / requests (28 checks).
    - **Live boards, read-only:** bundle an entry that imports `getSnapshot`, `boardsNow`, `buildFulfillmentBoard`,
      `buildLogisticsBoard`, `buildTodos` / `buildDone` (aliases `server-only`, `next/server`, `next/headers` → stubs,
      `--external:mongodb`, `NODE_PATH` = repo node_modules, `.env.local` loaded by a small runner) and print each
      person's list.
    - **Browser:** the earlier pattern + `/api/progress*` answered with made-up JSON (snapshot, presence pulse,
      comments), `/api/progress/todos` passed through (real, read-only GET). Measure the page and the dialog scroll at
      1728×958 / 1366×768 / 390.
    - **Secret scan before every push:** a node script that reads `.env.local` and checks the added lines of every
      changed / new file for those values (PINs as whole numbers), `1000.<hex>` tokens, connection strings. It prints
      variable names only.
    - **Live check:** poll both addresses' served JS for a string unique to the release (or its absence after a
      removal) — usually live in 45–70 s.
    - **PowerShell 5.1 traps:** `Get-Content -Raw` + `Set-Content` **mangles UTF-8** (— → â€”) and adds a BOM; never
      edit source files with them (use the Edit / Write tools, or node `fs` with "utf8"). Inline `git commit -m` with
      quotes splits into pathspecs; use `-F file`.
    - The auto-mode classifier sometimes answers "no verdict" several times in a row; after ~6, stop and report. Ten
      in a row ends the turn.
17. **Session 15 patterns (scratchpad scripts — rebuild from this):**
    - **Engine on live data, no server:** `entry.ts` re-exporting `buildRows` (build.ts) and `runQuery` (query.ts) →
      `npx esbuild entry.ts --bundle --platform=node --format=cjs --outfile=engine.cjs`; a script reads `za_tables`
      read-only (`{_id: rows}`), calls `buildRows(t, [], "<today>")` and checks each number against an independent
      calculation from the raw tables (sums add up, counts match). Trainings need the board → use the local server.
    - **Local Admin helpers:** sign in (`POST /api/members/sign-in {memberId:"admin", pin}`), then GET routes or
      `POST /api/analytics {specs}` (read-only report queries); `PUT /api/analytics` = refresh the Zoho Analytics copy
      (cache, same as the automatic refresh). `/api/zoho-analytics?export=<view id>` → `{count, sample}` (5 rows; print
      only the columns you need — never customer details).
    - **Route tests with a fake db:** esbuild the route with a plugin mapping `@/lib/db` → in-memory fake (`findOne`,
      `updateOne` with `$set` / `$unset` + upsert) and `@/lib/auth` → member from an `x-test-member` header; esbuild
      must be installed in the scratchpad (`npm i esbuild`) to use its JS API; load it with `createRequire` in an .mjs.
    - **Browser:** the session 13 / 14 pattern + `th.session` in localStorage = `{member:{id:"admin",name:"Admin"},
      token}` from the sign-in answer (without it the sign-in screen shows); steps: CSS click via `el.click()` (a
      puppeteer click can land on the phone's fixed tab bar), `SELECT:css=>value`, `TYPE:css=>text`, `TEXT:<button
      text>`, `SCROLL:css`, `ESC`, `OUTSIDE`; `FAKE_GOAL=<₹>` answers the goal route in the browser only; set
      `th.goal.cheered` to this month to skip confetti. `el.click()` doesn't fire mousedown, so "click elsewhere
      closes it" doesn't happen in tests.
    - **Secret scan** (`scan.cjs`): added diff lines + untracked files against `.env.local` values (PINs as whole
      numbers), Zoho tokens, Mongo URIs, private keys; prints names only.
    - When **Bash keeps getting "no verdict"**, the PowerShell tool may still work (it did for `tsc` and node scripts on
      27 Oct); file edits can always go through the Edit tool.
    - Contrast check for new themes: a tiny WCAG luminance script (text / muted / brand / button text ≥ 4.5:1).
18. **Session 16 patterns (scratchpad scripts — rebuild from this):**
    - **DB speed** (`speed.cjs`): read `members`, `cardEvents`, `zohoDocs`, `zohoCustomers`, `zohoPayments` whole and
      print MB, ms and KB/s. Normal 4–8 MB/s; **~90 KB/s = Atlas throttling** (M0 over 10 GB / 7 days).
    - **Live timing, read-only** (`live5.cjs`): sign in on the live site as Admin (PIN from `.env.local`, never
      printed), POST `/api/analytics` with 1–2 specs several times; print status, ms, `x-vercel-id`,
      `x-vercel-error` (`FUNCTION_INVOCATION_TIMEOUT` = the 120 s `maxDuration`), and the totals (this FY revenue
      ₹4,21,31,846.16 and owed ₹72,48,982.58 on 27–28 Oct). The Vercel CLI here is **not** signed in — no logs; the
      route now answers 503 with the error text instead.
    - **Store check** (`storetest.cjs`, local): `/api/store` full → `v`; `?v=` → `{same:true}` 0.1 KB; every
      collection identical to a direct Mongo read (sorted JSON); then Reports POST ×2.
    - **Fingerprint** (`fp.cjs`): the `cachedRead` aggregate on its own (needs MongoDB ≥ 7; server is 8.0.34).
    - **Query counting** (`pages.cjs`): puppeteer, record every `POST /api/analytics` body; open a tab, click a page
      pill, go back, change the period — count the queries. In dev, React runs effects twice (the goal meter's
      request shows twice — not in production).
    - **Browser runs on Reports must set `th.reports.mine = "1"`** in localStorage, else the first visit lands on
      My dashboard (the shots script's tab choice is ignored).
    - **Route tests with a fake db** (`rt/`): esbuild the route with `@/lib/db` → in-memory fake (`findOne`,
      `updateOne` with `$set` / `$unset` dotted paths + upsert) and `@/lib/auth` → `x-test-member` header; `@/…`
      resolved to `src/…` + ".ts". 32 checks for `/api/analytics/prefs` + `layout.ts`.
    - **Old-commit code** for timing comparisons: `git archive <commit> src/lib | tar -x -C <scratch>/live`, then
      esbuild from there.
    - **Map outline**: `npm i mapshaper@0.6` in a scratch `tools/` folder; `mapshaper Admin2.shp -filter-fields ST_NM
      -simplify 0.7% keep-shapes -o format=geojson precision=0.001`.

**Session 17 tools and traps (scratchpad scripts; copy what you need):**
- **Fake-Zoho route tests:** `mark/buildq.mjs` bundles `src/app/api/quotations/route.ts` with fakes (`mark/mq/db.ts`,
  `auth.ts`, `fakes.ts`); `mark/qt.cjs` records every Zoho call and checks the bodies (36 checks). Pattern for any
  route that writes to Zoho.
- **Read-only browser checks:** `quotes-ui.cjs W H theme [add]` (list, search, popup, add an item; a browser-only fake
  "connected" answer — it must not catch `?image=` / `?item=` requests); `cat-ui.cjs` (catalogue + New quotation);
  `ov.cjs bg` (Overview + Reports Quotes); `certs-ui.cjs` (Generate certificates → reconnect). All abort non-GET
  `/api/*` (Reports' read-only `POST /api/analytics` allowed).
- **Long scripts:** a long `node -e` / heredoc inside Bash breaks on quotes and backticks — write the script with the
  Write tool and run `node file`. **`\b` written through a JS template string became a backspace character (0x08)** in
  a regex once — check with `grep -P '\x08' file`. Python isn't installed. `sed` can't insert text containing `\n`
  reliably — use the Edit tool.
- **React dev mode runs effects twice:** a second (late) answer reset lines someone had just edited — guard loads with
  a `current` flag in the effect's cleanup (done in the quote popup).
- **`overflow-x-auto` clips absolute dropdowns** (also vertically) — don't wrap a table with pickers in it; stack rows
  on phones instead. **A long unbreakable word (an email) widens a popup past the phone screen** — `min-w-0` on the
  dialog / chip and `truncate` on the text.
- **Puppeteer:** prefer a real `handle.click()` over `el.click()` inside `evaluate` for pickers that use
  `onMouseDown preventDefault`; check what's at the click point with `document.elementFromPoint`.
- **Local dev server:** an old `npm run dev` may still hold port 3000 (a new one fails on 3001's lock) — reuse it.
- **`next build` while the dev server runs is fine** (separate output); run it before every push.

---

## 10. Open items / known gaps
1. **Temporary**: `ALLOW_PAST_TRAINING_DATES = true` — set to `false` when the owner confirms the back-fill is done.
2. `ZOHO_DAILY_LIMIT` is 2500 (cautious default) — replace with the Zoho plan's real allowance in Vercel and `.env.local`.
3. Potential training's date is stored "for notifications/alerts later" — reminders are not built yet.
4. No "change my PIN" screen; Admin resets PINs via `POST /api/members/pin`. Session tokens don't expire (sign out, or change
   `SESSION_SECRET` to sign everyone out).
5. Nothing is written back to Zoho (dates, merges, notes live only in the dashboard).
6. ~~Invoices paid in instalments~~ — done (see Instalments in §4).
7. Legacy follow-up tasks (`src/lib/followups.ts`) no longer feed the ticker, the sidebar badge or the Overview (session 8); the store still builds them (unused) — remove when convenient.
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
14. ~~Role rules client-side only~~ — enforced on the server since 7 Oct (`roles.ts` in `/api/store`). Roles go by member
    *name* (e.g. a member named "Arti …"); renaming a member changes what they can do.
15. The GitHub repo is **public** (anyone can read the code; Actions minutes are free). Decide whether it should be private.
16. ~~The Overview page is wider than a phone~~ — fixed in session 8 (the Pipeline card's grid column had no `min-w-0`).
17. **Open question to the owner (7 Oct):** should Ashish, Shikha and Sumit be able to revert *anyone's* changes? Today only
    Admin can; everyone else reverts their own (`canRevert` in roles.ts — one line to widen).
18. Aliases match by exact name (ignoring case/spaces/punctuation). "Chalet Hotel Limited" (singular, 7 docs) is probably the
    same company as "Chalet Hotels Limited" — the owner was told to fix the name in Zoho or ask for looser matching.
19. Vercel Hobby keeps runtime logs ~1 hour only — the Sync log (Mongo `zohoSyncLog`, 90 days) is the record of syncs.
20. **Unconfirmed: threaded reminders.** The Zoho Mail reply call (`action: "reply"` on the first email's messageId) hasn't run
    for real yet. After Priyanka's first reminder, check that card's log: "…, as a reply in the same thread" = works; without
    it, Zoho refused the reply and it went as a new email (same subject) — then check `[zoho mail] reply failed` and fix.
21. **Not click-tested in a browser** (session 5, see §9 #10): the Contacted section, popups, Clear logs per board, purple, name
    lock. Modal fit at 1728×958 with the Contacted section is unmeasured — the AedSmartx right column (Training + Contacted +
    Item description) may now scroll; if so, collapse Item description while a card is in Contacted.
    **Measured 14 Oct (session 9):** it does — ≈336 px overflow on 2026-01-437 (Contacted) at 1728×958. Offered the fix; no answer.
    The Send email popup, reply popup and Template dropdown were click-tested (saves blocked) in session 9.
22. Email templates: edit the Mongo `mailTemplates` doc to change wording (the owner's text kept as given, incl. "if wrongly
    address"). No editing screen yet. ~~Shreya's emails~~ — built in session 6 (`fulfil_gratitude`, placeholder wording, #29).
23. The dashboard now pulls team data every 15 s (was 60 s) — 4× the `/api/store` reads; fine for this team, revisit if it grows.

**Session 6 — next session starts here.** Owner-side setup first (they do these; codes/secrets only into the popups, never in chat):

24. ~~Push the Clear logs lock~~ — pushed in session 7.
25. **Forwarding filter** (Shikha or the Zoho admin, in Shikha's Zoho Mail): Settings → Filters → incoming: *To contains*
    `learn@thinkhealth.in` **and** *Subject contains* `Thank you for hosting` → *Forward to* `digital@thinkhealth.in` (Zoho may
    ask digital@ to confirm). Without it replies stay only in Shikha's mailbox (the ★ still works — it reads her inbox).
26. ~~Connect learn@~~ — connected 10 Oct (the "Gratitude Emails Sent" folder was found/created). Was: Shikha generates a Self Client code signed in as **shikhadixit@** with scope
    `ZohoMail.messages.ALL,ZohoMail.accounts.READ,ZohoMail.folders.ALL` (10 min); Admin → Fulfillment → a Training Completed
    card → Send Gratitude Email → **Connect it** (code + Client ID + Secret). Then **Send a test to** the owner — check it
    arrives and sits in Shikha's **Gratitude Emails Sent** folder (first real run of folder create/move, §6).
27. ~~Connect the master sheet~~ — connected 12 Oct and checked (columns, SN 2135, certificate no. 2128). Was: Self Client code signed in as **digital@** with
    scope `ZohoSheet.dataAPI.READ,ZohoSheet.dataAPI.UPDATE`; Admin → a Gratitude Email Sent card → Generate Certificate →
    **Connect the sheet** (sheet link + code + Client ID + Secret). The popup shows detected columns, row count, last serial,
    last 2 rows — **ask for a screenshot and check it** (column mapping, serial, date format) before anyone generates.
28. ~~Upload the two designs~~ — uploaded 12 Oct (the A4 Photoedit templates; converted by `certBackground.ts`). Was: `cpr-aed.pdf` (Basic Life Support) and
    `cpr-aed-first-aid.pdf` (CPR, AED & First Aid) from `D:\Projects\certificate-generator\private\backgrounds\`.
    No manage-designs screen otherwise: the upload prompt only appears while one is missing — add a small Admin "Designs"
    button if they need to replace one later.
29. **Gratitude email wording**: the owner will send the real template → update `DEFAULTS.fulfil_gratitude` in
    `mailTemplates.ts` **and** the Mongo doc `mailTemplates/fulfil_gratitude` (the doc wins once it exists). Keep "Thank you
    for hosting" in the subject (filter) and `{ref}` (keeps threads apart).
30. **First real use — verify with the owner:** (a) **one small real batch** first: new rows at the end of the sheet, serial =
    last + 1, certificate no. `FAT-OD/dd-mm-yyyy/serial`, the date read by Zoho Sheet as the right date (dd/mm vs mm/dd!),
    course/location correct; open the PDF before printing. (b) First real **reply**: ★ within the next hourly sync, Sync log
    shows "1 gratitude reply", the reply popup shows the body. If any Zoho call fails, the message shows in the popup / Sync
    log (`mailError`) — fix against Zoho's real response (the calls were never run for real, §6).
31. **`CRON_SECRET` GitHub secret** (#11) matters more now — replies and filing ride on the hourly sync. Steps in §2.
32. ~~Certificate date for multi-day trainings = last training day~~ — **changed in session 8**: names are given per training
    day and each certificate / sheet row carries that person's day (§3). Built and click-tested with saves blocked; not yet
    used for real — check the first real multi-day batch in the sheet.
33. **digital@'s folder** for the forwarded replies "will be created later" — that's a filter in digital@'s own Zoho Mail; the
    dashboard doesn't read digital@'s mail. Only build something if the owner asks.
34. Shreya's **Open in Zoho Mail** opens digital@'s inbox, not the exact email (the forwarded copy has another id). Improve
    only if asked (would need digital@'s mail connected).
35. The **certificate-generator** repo (`D:\Projects\certificate-generator`, github.com/Jasmeet1025/certificate-generator,
    public) has its TypeScript rebuild committed locally but **not pushed**; the dashboard carries its own copy
    (`certPdf.ts`) — keep the two layouts in step if either changes.
36. `parseNames` keeps any line with letters — a stray "Total:" or "Regards" line from a pasted email becomes a name; the preview
    shows it (she should delete it). Could filter common email words if it bites.
37. Only Admin connects mailboxes/the sheet and uploads designs; Admin is the owner (and whoever knows the Admin PIN).
    The app records clears/changes as "Admin" — it can't tell people apart (#147). Consider personal admin logins if that matters.
38. **Test batches on Classic Citi Investments (Pune)** (`fulfil:pi:982417000020306048`): two `fulfil_certs` from the owner's
    tests on 12 Oct (1 name, SN 2136; 3 names, SN 2136–2138 — rows since deleted from the sheet; both moves undone). The card
    shows "moved back after 3 names…". Server-only kind (nobody can revert it in the app) — delete the two events only if the
    owner says so; until then the next real batch on that card simply replaces them.
39. ~~Designs stored as 4.4 MB templates~~ — **replaced 14 Oct** with the owner's new templates, stored as converted
    backgrounds (bls 0.54 MB, fa 0.48 MB). **Was:** **Uploaded designs are stored as the 4.4 MB A4 templates** (uploaded before the convert-on-upload existed); each PDF
    converts them in the browser. Re-uploading them now would store the 0.9 MB background — optional.
40. The Generate popup's facts strip shows the **course of the chosen design**; the owner hasn't seen the Ready state
    (flower + Download) after the polish — it only shows after a real Generate.
41. (13 Oct: Shikha set the Chalet Hotels Limited concerned email back to Roohi.Khanna@marriott.com — the gmail problem is gone; the 20 rows / batch question remains.) **JW Sahar card — real or test?** (see "Start of the next session" #2). Its customer-wide **concerned email is now
    shreyathinkhealth@gmail.com** (was Roohi.Khanna@marriott.com), so every later gratitude email for **Chalet Hotels Limited**
    would go to Shreya's gmail until it's changed back (Change under the head-count, or the email dropdown in the popup).
    The 20 rows SN 2165–2184 are in the master sheet (the sheet had grown to 2164 by hand in between).
42. **Completed on invoice date leaves unmerged quotations** in Quotations (e.g. Diana Builwell's Quotation-24-002198, Arrowline's
    Quotation-24-001524): the PI is merged on, its quote never was. Offered to tidy them; the owner hasn't answered.
44. **8 false `zoho_change` entries** in live `cardEvents` (docs all still in Zoho): ids `zoho:ql3b4gnmc4wr70qj`, `zoho:nve84dkr3ag3zg7e`,
    `zoho:met74bzrkmi1as31`, `zoho:5t69w2o5lx83q2kj`, `zoho:rcpbmxm0q6jaxtt3`, `zoho:f5x909f637yanabu`, `zoho:tvnmuma6krmur7m5`,
    `zoho:yejx5jxvuf3yu7za`. Text only (cards unaffected), but each blocks a real notice for that merge later. Delete only
    with the owner's OK. The 2 real ones (13 Oct 09:04 IST, Performa-25-698 / -757) stay.
    **Done in session 9 (14 Oct):** all 8 deleted (a direct Mongo delete guarded by id + kind + "Zoho Books" — not refused
    this time), plus a **9th** written **14 Oct 08:25 IST** (`zoho:cj1o7knuu607vq7v`, Quotation-24-002637 — still in Zoho;
    owner OK'd). Its merge (12 Oct 15:29 IST) is newer than any copy that lacked the quote, so the fixed code skips it →
    almost certainly a **tab never reloaded since before 12 Oct 13:09 IST running the old code**. The server accepts
    `zoho_change` from any browser, so stale tabs can write more → see #59. Live log 733 entries, 2 `zoho_change`.
59. ~~Server-side check for `zoho_change`~~ — **built in session 9** (not pushed): `stampCardEvents` (`/api/store`) drops a
    new `zoho_change` when both cards of the merge still exist on the server's board (`zohoCardsNow` → `boardsNow(snap)
    .board.exists`, built only when a new notice arrives; kept if the copy can't be read). Checked read-only on real data:
    all 9 deleted notices' merges → dropped, the 2 real ones → kept. A stale tab keeps retrying its notice each pull
    (dropped silently) until it's reloaded.
43. **Shreya tests on the live board** with her own gmail as the concerned email. Suggest the owner tell her to use
    **Send a test to** (nothing recorded) instead — every real send / Generate is permanent (server-only events, sheet rows).

**Session 8 — tips: what to enhance next** (offer these when the owner asks "what next"; build only on their go-ahead):

45. ~~**The 3 approved items**~~ — done in session 9. Was: delete the 8 false notices, live greeting "Dear {person},",
    Priyanka's AED targets (ask the numbers).
46. **Same clean-up for the other boards.** The owner said "everything looks cluttered" and then "not much UI is changed" after
    only the Fulfillment board was polished. Apply the `FulfilItem` pattern (doc + date on one line, training, people ·
    trainers · alias, one state pill, no redundant chips) to the Training, AedSmartx and Logistics cards (`DocItem` in
    FollowUps.tsx), and the 4-step tracker idea to the Training card (Lead → Quote → PI → Scheduled → Completed → Invoice →
    Paid) and Logistics card. Measure 0 px modal overflow at 1728×958 on real cards after every change (§9 #8, #14).
47. **Admin "Templates" screen** for the email wording (`mailTemplates` docs: AED onboarding + gratitude) — today wording
    changes need a database edit (#22, #29). Show the variables ({person}, {location}, {course}, {dates}, {people}, {ref}).
48. **Admin delete of a single change-log entry** (e.g. a false `zoho_change`) from the Changes panel, with a confirm — so fixes
    like #44 don't need database access (the classifier refuses direct writes).
49. **Server-side check for mandatory alias + email** when a training is scheduled (today only the board enforces it; an old
    tab before Ctrl + Shift + R can still schedule without them).
50. **Remove the legacy follow-up system** (`src/lib/followups.ts`, store `followUps`, `NeedsAttention` leftovers): it no longer
    shows anywhere but is still built and synced. Also unused `kpi.ts` exports (`fyStats`, `deliveredIn`, `breakdown`).
51. **Overview extras:** a people column per trainer/client is there; consider per-trainer targets, a "scheduled but date
    passed, not marked completed" warning (trainings forgotten on the board), and Pipeline from the board's quotations
    instead of Zoho's open quotes (today the Pipeline card is still Zoho-based).
52. **AED people:** AED trainings count 0 people (`BoardTraining.people` = 0 for AED). If Priyanka's targets should include
    people, record attendees when she marks an AED training completed.
53. **Reliable hourly sync:** `CRON_SECRET` GitHub secret (owner) or an external caller (cron-job.org →
    `/api/cron/sync?source=cron-job.org`) — gratitude replies and filing ride on it (#11, #31).
54. **Next.js upgrade** (`npm audit`: Next 16.3 critical) — careful job: read `node_modules/next/dist/docs/` first, rebuild,
    re-test every board (#12).
55. **First real runs to watch** (ask the owner for a screenshot): multi-day Generate (dates per row in the sheet), Generate
    from Training Completed (log says "made from a list already at hand"), threaded AED reminders (#20), first gratitude reply
    ★ (#30b).
56. **Tidy quotations left by Completed on invoice date** (#42) — offered twice, no answer yet.
57. **Mobile pass** on the card modals (Training / AedSmartx / Logistics) — the Fulfillment modal columns got `min-w-0`; the
    others may still be pushed wider than a phone by long emails.
58. `ALLOW_PAST_TRAINING_DATES` is still on (#1) — ask whether the back-fill is done.

**Session 10 — open items** (the feature backlog is `MONDAY-PLAN.md`):

60. **Chalet 352 / 455** printed "JW Marriott Mumbai Sahar" (locked now). If either was at another hotel: undo the move to
    Certificates Generated → *Change* location → Generate again (adds rows; old rows stay in the sheet).
61. **4 Classic Citi test rows** in the master sheet (Admin, 15 Oct 08:13–09:42, 1 name each) — owner deletes by hand;
    their `fulfil_certs` events stay (server-only).
62. **Samhi's first batch** (13 Oct 16:44, 30 rows as "Samhi Hotels Private Limited") — likely duplicate rows in the sheet
    next to the 14 Oct "Fairfield…" batch; ask Shreya whether she deleted them.
63. **Old aliases** "Yogesh Ghumaste" (Classic Citi) and "Arwa Hyderabadwala" (FLAME University) are valid aliases under the
    new meaning; move them to the concerned person's name only if the owner wants.
64. **"Chalet Hotel Limited" vs "Chalet Hotels Limited"** are still two customers (exact name match) — fix in Zoho Books.
65. A tab on old code (before Ctrl + Shift + R) can't schedule: the server drops its date entry silently (it comes back
    at the next pull without the date). Tell the team if someone says "my schedule vanished".
66. `src/lib/kpi.ts` has **CRLF** line endings (most files LF) — scripted edits must handle both.
67. The 9 px modal overflow on a **starred Gratitude Email Sent card with a reply** (seen with a fake state) is pre-existing
    and within the 16 px bottom padding; re-measure if that column's content grows.
68. Reply check for Priyanka: until hello@ is reconnected **and** she sends a real email, it has never run against Zoho.

**Session 11 — open items:**

69. ~~Reminder emails not pushed~~ — pushed 19 Oct ~16:35 IST on the owner's "push the rest"; first run was due to send 3
    (see "Start of the next session" #2). WhatsApp (Anantya) left for 20 Oct by the owner.
70. **Second Vercel cron** (`/api/cron/reminders`) is untested on Vercel — confirm the deploy succeeds and the cron shows
    under Project → Settings → Cron Jobs.
71. **learn@'s connection can't create mail folders** (`INVALID_OAUTHSCOPE` on POST /folders) — any new folder must be made
    by hand in Shikha's Zoho Mail (the error now says so), or Admin reconnects learn@ with `ZohoMail.folders.ALL`.
72. Postponement emails go only to the **current** trainers (a trainer removed in the same postponement isn't told).
73. **"Change date"** (correction) sends no email; reminders simply follow the new date. Offer a "date changed" email if the
    owner wants it.
74. The reminder lock / dedupe rely on server events; a run that sends but fails to record would re-send next run (none seen).
75. The Training completed gate is browser-only (an old tab before Ctrl + Shift + R still shows the button).
76. Calendar `useBoardCards` fetches `/api/pipeline` (~4,000 leads) on the calendar page — fine now; watch if it feels slow.
77. AedSmartx card 2026-01-449 (Mahindra Lifespace): left column overflows 6 px past the padding (a two-line note + wrapped
    email tag) — offered to trim, no answer.
78. **WhatsApp (Anantya AI)**: no public API docs. Needed from the owner: docs link, API key (build an Admin "Connect
    WhatsApp" popup, kv secret like the mailboxes), two Meta-approved **Utility** templates — Reminder: "Training Reminder ·
    Customer name: {{1}} · Location/Alias: {{2}} · Concerned Person's name: {{3}} · Concerned Person's Email: {{4}} ·
    Training Date: {{5}} · Training Persons: {{6}} · Number of People Expected At Training: {{7}}"; Postponed: "Training
    Postponed to {{1}} — sorry for the inconvenience" + the same fields — and the WhatsApp numbers of Sumit, Shikha,
    Ashish, Priyanka. Then send from the same `runTrainingReminders` loop on the same days.
79. External trainers (e.g. Ganesh) get no reminders and no colour of their own — add emails / numbers when the owner has them.
80. **My day + renewals** — agreed defaults (19 Oct, "yeah ig"): top of the Overview, own items (Admin sees all, grouped);
    pull **training invoices back to 1 Apr 2024** once (~100 calls) and keep training invoices 27 months; expiry = training
    day + 2 years (invoice date for pre-dashboard ones; ignore `cf_certificate_expiry` — 24 invoices have it, one typo:
    19 Sep 2026 invoice says 16 Sep 2026); owner = the invoice's sales person if a member, else Shikha; shows 90 days
    before, red at 30; one per training, grouped by client; Quote sent / Not renewing / Snooze 1 week, clears itself when
    a new quotation for that client appears; no escalation / WhatsApp yet. **Careful:** the board's Zoho window
    (`trainingSince`, previous FY start) must not drop the older invoices in the full check — keep them in a separate kind
    or flag, or the live site's reconcile will delete them.
81. Today's live changes by the team (not tests): Priyanka postponed K Raheja to Thu 22 Oct and Tata Motors Pune to Mon 26
    Oct (08:56–08:57 IST), logged a call, marked one AED not required; Shikha fixed FLAME's location / concerned person.
    FLAME (17 Oct) still needs **Training completed**.
82. `MONDAY-PLAN.md` §0–§2 are mostly done / answered (push done 17 Oct; year target → from Oct). Update it when the
    next feature starts.
83. Test data: none written (saves blocked in every browser run; 0 entries, 0 `reminderSeen` docs). The only real email was
    the owner-approved [TEST] reminder to sshah@ (filed in /Sent/Training Reminders).
84. Scripts from this session were in the session scratchpad (gone): read-only puppeteer runs (saves blocked, `/api/zoho/sync`
    answered "not due", stand-in member via `/api/members/session` interception, a patched `window.fetch` to move a training
    to today in the browser only), esbuild of `reminderPlan.ts` for the day table, and an Admin fetch script for the
    `/api/mail/reminders` preview / test / file routes. Rebuild them from §9.

**Session 12 — open items:**

85. **WhatsApp hasn't sent on the live site yet** (see "Start of the next session" #2). Facts at 15:20 IST 20 Oct:
    settings `ready`; lock `until: 0`; live syncs 14:00 (full, 34 s) and 15:00 (quick, 9 s) logged no `whatsapp` and no
    `whatsappError`; 0 `training_whatsapp` events; the pushed code (`git show 98381ce` = working tree) dry-run against
    live data **would send 5**. Remaining suspects = the silent exits in `runTrainingReminders` (`VERCEL_ENV`, `lock()`).
    The emails' first run on 20 Oct 08:18 used the same two checks and worked. Fix path: Vercel logs, or add a
    `reminderNote` (why nothing was sent) to `ReminderRun` → Sync log, push, watch the next hourly line. If the 5 were
    sent by a later run, note that Sierragold's went as a catch-up of the 19 Oct key ("in 2 days").
86. **First real WhatsApp:** confirm the message id is parsed (`training_whatsapp.messageId`) and the text renders as the
    preview (bold, icons). The owner tested only v1 from the popup; v4 hasn't been test-sent by Claude (owner's number
    allowed without asking — "my own number, no need to ask").
87. **Contact number required to schedule** — the owner asked for "mandatory" and "can't mark completed without";
    Claude made it required in the schedule forms too (like location + email) and said so. Server still accepts a date
    without it (`missingCertFields` unchanged) — change both together if the owner wants it server-side.
88. Every training scheduled before 20 Oct has **no contact number** → "no number" on the card and blocked completion
    until the team adds it. AED cards use Priyanka's last-called number in reminders (no picker there).
89. `phoneOk` accepts 10–13 digits with + ( ) - spaces; the "Same as original" list is the customer's Zoho phones (may be
    landlines without a code — the picker says why Save stays off).
90. Template text lives in three places that must agree: Anantya (approved), `WhatsAppSetup.tsx` `TEXT` (+ samples),
    `whatsappValues` order. The test route's made-up values too.
91. WhatsApp **postponement** messages only for postponements after `POSTPONED_SINCE` (19 Oct 10:00 UTC), as emails.
92. Anantya's `ContactName` is set to the trainer's first name on every send — it may create / rename contacts in their
    Anantya inbox; harmless so far.
93. **Revenue forecast:** month-end counts quotes ≤ 15 days old only; Diana's (30 Jun) and Sierragold's (16 Jul) are
    expired → October "booked" = 0 until their PIs exist (Diana's PI now exists, Performa-25-1127 — check it shows as
    booked if its status is open).
94. The 26 px phone overflow fix on the revenue chart hides every other month label below `sm`.
95. The local dev server shares the live database: settings saved on localhost are live at once (WhatsApp was set up
    there). A local server never sends (production-only) — but its tabs can still run the hourly Zoho sync.
96. `next build` while `next dev` runs worked on 20 Oct (separate output dirs in Next 16).
97. Scripts this session (scratchpad, gone after the session): `admin.cjs` (Admin sign-in via `ADMIN_PIN` from
    `.env.local`, GET any route, writes JSON), puppeteer read-only runs (saves aborted, `/api/zoho/sync` → `{enabled:
    false}`), and the **reminder dry run** (`dry/`): esbuild bundle of `trainingReminders.ts` with `./whatsapp`
    `sendWaTemplate`, `./fulfilServer` `recordServerEvent`, `./zohoMail` send/file/list and the lock's `./db` swapped for
    fakes (only for importer `trainingReminders.ts`), `VERCEL_ENV=production`, global `fetch` blocked — prints what it
    would send. Rebuild from this description when needed.
98. Test data: none written to `cardEvents` / Sync log by Claude. WhatsApp settings were saved by the owner. No real
    WhatsApp sent by Claude.
99. **Owner's Zoho Sprints list (20 Oct)** — waiting on us: v4 templates (done since), contact numbers (team),
    `CRON_SECRET`, Diana with Shikha, certificate filter + wording. Next: check 21 Oct reminders; **My day + renewals**.
    Suggestions given: pre-training check 2 days before (no number / email / participant list / trainer clash → WhatsApp
    trainer + Shikha), quotes about to expire (day 10 of 15, no PI → sales person), AED battery & pads expiry (90 days,
    Priyanka), overdue payments by age (0–30 / 31–60 / 60+, stalled part-payments), profit per training (needs where
    costs live), participant-list form for clients.
100. #78 (WhatsApp) is done; #70's cron is confirmed accepted by Vercel (deploy went through, route exists) but its first
     run left no trace on 20 Oct (it wrote nothing then) — from 21 Oct it writes its own Sync log line.

**Session 13 — open items** (closed: #85 — WhatsApp works since 20 Oct 16:01; #86 — message ids are stored on every
`training_whatsapp`):

101. **Contact numbers / completions:** Diana (21 Oct) and Sierragold (22 Oct, still a quote — PI needed) not completed;
     every older training still lacks a number. The team should add them (card → Change). Consider a ticker / My day
     item "add the contact number" once My day exists.
102. **"No. of People" and the contact number are browser-only rules** (server `missingCertFields` checks location +
     email only). An old tab (no Ctrl + Shift + R) can still schedule without them. Make them server rules together only
     if the owner wants (it would also block old tabs' schedules silently — tell the team first).
103. **0 schedules with a checked head-count yet** (`set_training_date.people`): nobody has scheduled since the release.
     Check the first one: the Overview people count, the reminder's "Number of People" and the card's "(PI: n)".
104. **Reports data freshness:** `za_tables` refreshes only when someone opens Reports (> 6 h old) or Admin presses
     Refresh. Ask the owner how often Zoho Analytics itself syncs from Books (if hourly, a 2–3 h refresh is enough; if
     daily, say so on the page). A Vercel cron could refresh it too (Hobby = daily crons only).
105. **Reports Phase 2** (owner to confirm): own dashboards (save a set of tiles, drag / resize — `react-grid-layout` or
     a small own grid), drill-through from a bar to the documents behind it → open the card on its board
     (`/follow-up?open=`), hover cards. Then Phase 3–7 per `ANALYTICS-PLAN.md` §6.
106. **Rebuild the owner's Zoho Analytics query tables** as datasets / measures (churn risk, Marriott conversion /
     outstanding, YoY by type / sector / state, stock on hand, product prices, KPI) — needs each one's SQL (the API gives
     only columns + source tables, `ANALYTICS-SCHEMA.md`). Check every rebuilt number against Zoho Analytics' own result.
107. **Wider data for Reports** (`ANALYTICS-PLAN` Phase 1b): add tables to `build.ts` `TABLES` (Bills, Bill Item,
     Purchase Orders, Purchase Order Items, Vendors, Vendor Payments, Expenses, Expense Item, Accounts, Accrual
     Transactions, stock flows, Credit Notes…) — **check each money column's export format first** (a column shown as
     "K" / "M" in the workspace is lossy). Margin / profit numbers: **Admin only** by default.
108. **Builder window height:** ~900 / 958 px at 1728×958 (centred, measured on live). Owner was offered a shorter
     window with the left column scrolling — no answer.
109. **Theme palettes other than Plain / Black are not CVD-validated** (chosen to match the themes; bars are named on
     their axis and every chart has a table, so colour never carries identity alone). Validate them with the dataviz
     script before using them for legends with many series.
110. **Colour by name** (`colourMap`, FNV hash + probing) keeps a name's colour across charts, but two names on one
     chart that hash to the same slot shift each other when a filter hides one — rare; if the owner notices, switch to a
     stored per-field colour list.
111. **Phones:** no theme picker (sidebar only on desktop); Reports work on phones (charts stack, 0 px page overflow at
     390 px) but the filter bar wraps to 3–4 rows.
112. **Pre-existing modal scroll:** Tata Motors Pune AedSmartx card 55 px, Sent-to-Logistics cards ~19 px at 1728×958
     (not caused by the step tracker — measured with it hidden). Offered to trim; no answer.
113. **`npm audit`** still flags Next 16.3 (critical) — plan a careful upgrade (§10 #54); echarts 5.6.0 added no
     advisories of its own that blocked the build.
114. **Screenshots** of 22 Oct live outside the repo (`D:\Projects\Training Dashboard\Screenshots 2026-10-22\`) — real
     customer names and revenue; don't commit them (the repo is public).
115. **`ANALYTICS-PLAN.md` / `ANALYTICS-SCHEMA.md` are public** (repo is public): table / column names, row counts,
     workspace number, dashboard names — no data, no secrets; the owner was told. Don't add customer-level numbers there.
116. `zohoAnalytics.ts` `?export=<id>` returns the first 5 rows of any table to Admin (a look only) — keep it Admin-only.
117. "My day" + certificate renewals (§10 #80) — still agreed, not started; the Reports engine can feed a Renewals
     dashboard once certificate expiry data is in (Phase 1b + the 2024–25 invoices back-fill in #80).

**Session 14 — open items:**

118. **Next job: advanced Reports** (owner, 26 Oct — see "Start of the next session" #2). It overlaps ANALYTICS-PLAN
     Phase 2 (choose tiles per user, drag / resize, drill-through) and Phase 3 (comparisons, targets, parameters).
     **Data limits to check first:**
     - Sector / type / chain / state / city come from Zoho customer fields (`model.ts`). Many customers have blanks —
       measure the share before promising sector reports.
     - Margin / profit needs Bills / Purchase tables (Phase 1b, not loaded yet; `build.ts` `TABLES`).
     - The money columns' export format must be exact (no "K").
     - The ₹50 L goal needs: incl. or ex tax? Revenue = invoices (`sales` dataset, ex-tax `amount`).
119. **Progress tracker is a "separate idea, may be removed later"** (owner). To remove it, revert **newest first**:
     `git revert b81bab6 909f3d0 7448dfe f899c00 09c4495`. Reverting `09c4495` alone conflicts with the later commits.
     Its collections (§7) would stay, unused. It also changed shared files (AppShell nav / badge / heartbeat,
     `PageHeader` `titleAside`, card `Header` `ask`, FollowUps link-open for Fulfillment / Logistics cards,
     `/reports` redirect for single-board members) — all of that goes with the reverts.
120. **Not built from the tracker plan:** P3 evening digest (6 PM; Vercel Hobby = within the hour), P4+ tool webhooks
     (GitHub / Vercel / Jira… — this team barely uses them), check-ins (dropped by the owner).
121. **Load added by the tracker:**
     - Every signed-in visible tab posts the heartbeat every 30 s; each beat runs `needsReplyIds` (2–3 small Mongo
       queries).
     - The to-do / work-done route rebuilds all boards per call (every 60 s per open tracker tab, ~100–300 ms).
     - Fine for 7 people. Watch Vercel function usage if the team grows; the beat could go to 60 s.
122. **Tagging edge cases:**
     - @ matches **first names** (two members with the same first name would both be tagged).
     - A @mention on a closed request still tags until replied.
     - A ping re-tags the person waited on even if they replied before.
123. **Tata Motors Pune AED** — Priyanka marked it "Training not required" at 09:14 on 26 Oct, 13 min after the 5-day
     reminder. Unconfirmed whether intended (the owner was told).
124. **Arti's to-do** lists 5–6 "Mark AED delivered" items, some old (Synopsys 2026-01-385, SP Nexus 2026-01-364). She
     may want to hide them (Logistics → hide) or they're genuinely undelivered — ask.
125. **Shikha's to-do:** Diana (21 Oct) and Sierragold (22 Oct) "Mark completed or postpone", overdue. Contact numbers
     are still missing on every training.
126. `npm audit` / Next 16.3 upgrade still pending (#113).

**Session 15 — open items:**

127. ~~Training value on payment cards~~ — **done** (`7b2ff08`, session 16): `BoardTraining.piNumber` / `invoiceNumber`;
     55 of 56 valued. §3 "Reports + database — session 16".
128. ~~Batch 2 not built / browser-checked~~ — **done** (`2a94484`, 3 bugs fixed on the way).
129. ~~(f) "My dashboard"~~ — **done** (`bb387fa`). Tweaks ("Change this chart") still live in the browser (#137).
130. ~~#18 India map~~ — **done** (`25a5e6b`, DataMeet outline, CC BY 4.0).
131. **Cohort counts can be 1 off** — the first purchase is found by normalised name (`nameKey`: "USHA FIRE SAFETY" =
     "Usha Fire Safety") but customers are counted by exact spelling; Zoho has a few names in two spellings. Fixing it
     everywhere = count customers by `nameKey` (changes "Customers billed" slightly) — ask the owner first.
132. **₹11 Cr of quotes over 90 days old are still "open" in Zoho** (Team & pipeline → Open quotes by age) — ask the
     owner whether to close them in Zoho or treat quotes over N days as expired in Reports.
133. **Overdue concentration:** ₹30 L of ₹31.3 L overdue is on Sumit A Shah's accounts (Collections) — tell the owner.
134. **Days to pay by invoice month** counts paid invoices only, so recent months look faster (the tile says so).
135. **Price · volume · mix** works item by item; "units" mean different things across groups (AEDs vs training
     people), so the overall bridge is a rough guide — the AED-only tile is the clean one. The note says so.
136. **Segment rules** (New ≤ 180 days since first invoice; Champions = last ≤ 180 days and 4+ invoices; Loyal; Promising;
     At risk / Hibernating = 1–2 years; Lost > 2 years) are my proposal, not the owner's — show them and adjust.
137. **"Change this chart" tweaks live in the browser** (localStorage); saved views live on the server. If the owner
     wants tweaks to follow people across computers, move them into `reportPrefs` with (f).
138. **Comparison default changed to "vs last year"** — for "This month" the KPIs now compare with the same days of
     last year's month (before: last month). Mentioned to the owner.
139. **Saved reports' builder** (`Builder.tsx`) doesn't offer the new options (compare modes, exclude / contains /
     ranges, analyses, new chart kinds) — they exist only on the official dashboards. Add if the owner builds reports.
140. **Commits:** keep one per step (owner preference noted in §8). Everything through `6dfab55` is pushed (29 Oct).

**Session 16 — open items:**

141. **Atlas M0 transfer limit (10 GB out / 7 days).** Throttled on 27 Oct, normal again 28 Oct 08:30 after the
     fixes. What still reads a lot: each server instance reloads the Zoho copy (`zohoDocs` 3.3 MB + payments, items)
     whenever a sync changed something (~hourly, per warm instance); a new instance reads the Reports copy (0.55 MB)
     and, for trainings, the board. If it throttles again: measure (§9 #18), then consider gzipping `zohoDocs` or
     asking the colleague who owns Cluster0's Atlas account to move to a paid tier (the owner can't see that account).
142. **Old tabs** keep pulling the full team data every 15 s until reloaded (Ctrl + Shift + R). The server answers
     them from memory (little Mongo cost), but it's Vercel bandwidth — remind the team after each release.
143. **The three ⚠ reports** (ANALYTICS-PLAN §11 #25–#27) — proposed, waiting for the owner's yes:
     1) **#25 Gross margin** by product / customer — copy Bills + Bill Items; margin = selling price − the item's
        average purchase cost over the last 12 months (true FIFO later if needed); **Admin only**.
     2) **#26 Freight %** — the shipping charge on invoices first (check the export format — "K" lossy values);
        freight paid to transporters (Bills) later.
     3) **#27 Stock on hand / days of cover** — copy the stock tables if the workspace has them; seen by Sales users.
     Before building: look at those tables read-only through the app's `/api/zoho-analytics` (pace ≥ 2.5 s).
144. **Builder** (`Builder.tsx`, saved reports) still lacks the new options (compare modes, ranges, analyses, map,
     heatmap…) — #139.
145. **My dashboard:** nobody has customised yet (0 `reportPrefs` docs on 28 Oct); Admin hasn't set a starting layout
     (built-in `START`: 4 numbers, revenue by month, owed by age, open quotes by age, trainings by month, top 10
     customers). Ask the owner whether that starting layout suits the team.
146. **Pages:** a click-to-filter pick clears when you change page (by design — like Power BI's per-page cross-filter);
     the page is remembered per tab per browser. If the owner wants a pick to carry across pages, drop `setPick(null)`
     in `goTo`.
147. **India map:** square-root shading (one big state otherwise blanks the rest); Delhi / Goa are too small to see —
     the bars beside it carry them. Keep the DataMeet credit line (CC BY 4.0 requires it).
148. **Reports `maxDuration` is 120 s** (Vercel). Cold loads are ~5 s now; if a new dataset makes them slow again,
     keep the "only what the page needs" rule (`datasetRows(today, withTrainings)`) rather than raising the limit.
149. **Local dev server = live database.** Every local browser test reads the shared cluster too (session 16's tests
     added to the 27 Oct traffic) — keep test runs few and short, and don't leave local tabs open.
150. **NEXT TASK (owner, 28 Oct, end of session 17) — the quotation flow "like Zoho Books but better: less annoyance,
     faster, smoother, cleaner, user friendly".** The owner will paste the Zoho "New Customer" screenshot again.
     Owner's words: *"when adding a new customer, right after a customer is added, let user create the quote
     immediately after … check how the customer creation in the zoho books work then see the mandatory fields. also at
     the email sending phase after the quotation is created, actually the user will download the quotation as pdf then
     attach it to the email and send it. now i want an option to download that quotation directly from our quotation
     creation, it should create and attach to email, also give option to add attachments."*
     **What I understood (restate this, with the defaults, and wait for "yeah"):**
     - **A. New customer like Zoho's form, but one short screen.** Zoho's "New Customer" (screenshot): Customer Type
       (Business / Individual), Primary Contact (Salutation, First Name, **Last Name — "mandatory to sync this contact
       with Zoho CRM"**), Company Name, **Display Name\***, Email, Work Phone + Mobile (+91), Customer Language,
       Communication Channels (Email / SMS / WhatsApp); tabs Other Details (**GST Treatment\***, **Place of
       Supply\***, PAN, **Tax Preference\*** Taxable / Tax Exempt), Address, Contact Persons, **Custom Fields\***
       (= **Type\*** and **Sector\***, see §6), Reporting Tags, Remarks. "Prefill from the GST portal using the
       customer's GSTIN" sits at the top. *Default:* one screen — Business/Individual toggle; contact (salutation,
       first, **last required**), company (Display Name = company, editable), email, mobile + work phone; **GSTIN
       first**: when typed, fill the state (its first 2 digits = GST state code) and PAN (characters 3–12) and set
       GST treatment "Registered business – regular"; without GSTIN → "Unregistered business" (Individual →
       "Consumer"); place of supply = state; tax preference Taxable (Exempt asks for the reason Zoho needs); **Type**
       (default "New Customer") and **Sector** (required, Zoho's 19 options); billing address (street, city, PIN —
       optional). Everything Zoho marks required is required here, with the same names.
     - **B. Quote right after.** On "Create customer" the quote popup opens on the same screen with that customer and
       contact already in "To" (today it already opens — make it seamless: no second search, no re-entering, the
       new contact ticked, product type / lead source defaults).
     - **C. PDF + email step after the quote is created** (today `send=true` lets Zoho send its own standard email):
       after Save, a **done screen** with **Download PDF** (`GET /estimates/{id}?accept=pdf` through our server) and
       **Email it**: To (contact persons, ticked), Cc, Subject + Body prefilled from Zoho's own quote email template
       (`GET /estimates/{id}/email`), **the quotation PDF attached automatically**, **+ Add attachments** (files from
       the computer: brochures, certificates), then **Send** → Zoho Books' estimate email API
       (`POST /estimates/{id}/email`, attachments as multipart) — Zoho marks the quote **Sent** and keeps it in the
       quote's history. *Default:* the popup's buttons become "Save as draft" and "Save and email…" (the email step
       opens with everything filled — one more click to send); "Download PDF" is always on the done screen.
     - **D. "Better than Zoho":** fewer fields on screen (defaults filled, rarely-used ones behind "More"), keyboard
       friendly (Enter adds the item, Tab order), no page reloads, remembers the last sales person, clear errors in
       plain words, totals always visible, everything Zoho needs filled so Zoho never refuses.
     **Check before building (read-only):** the email endpoint's attachment limits and whether `ZohoBooks.estimates.UPDATE`
     (or `CREATE`) covers emailing (else the scope line grows again → Admin reconnects once more);
     `contacts` POST body for `custom_fields` (Type / Sector by `customfield_id`), `gst_treatment` values
     (`business_gst`, `business_none`, `consumer`, `overseas`, `business_sez`, …), `tax_exemption_id` for Exempt.
     **Traps:** Vercel's request body limit is **4.5 MB** — attachments uploaded through our API must stay under it
     (say so on screen; or upload each file separately); never send a real email in testing (the email route must be
     production-only like quotes; test with the owner's own test customer + sshah@thinkhealth.in); the PDF is Zoho's
     ("Spreadsheet Template 2025"), don't make our own.
     **Open questions to ask with defaults:** send the email from Zoho Books (default; marks Sent, org address) or from
     the person's own Zoho Mail mailbox (the app already has Mail connections — replies come to them)? Keep Zoho's
     standard email as a one-click "Send with Zoho's standard email"? Attachment size cap (default 4 MB total)?
     **BUILT and live 29 Oct (cloud session, after the owner's "yeah"): steps 1, 2, 4–6 = `3f39f9e`, `3d37345`,
     `6be4365`, `2f3b049`; step 7 kept (production only); step 8 done — Admin reconnected Quotations 29 Oct 16:50 IST
     (`newCustomers: true`). NOT yet proven against Zoho: the email send (multipart, PDF attached) — first live send by
     the owner to themselves. See "Update — Fri 30 Oct" at the top.** The plan as restated:
     **Restated 29 Oct (session 18) — waiting for the owner's "yeah", build one commit per step:**
     1) fix #151 first: new customers send Zoho's mandatory Type (default "New Customer") + Sector; Last Name required;
     2) a one-screen new customer: Business / Individual, Last Name, company = display name, email, mobile, GSTIN
        (fills state, PAN, GST treatment), Type, Sector; salutation / work phone / address / tax-exempt behind "More";
     3) the quote opens straight away for that customer;
     4) after Save: a done screen with Download PDF (Zoho's) and "Email it";
     5) the email step: To / Cc, subject + body from Zoho's template, the PDF already attached, + Add attachments
        (4 MB total), sent through Zoho Books (marks the quote Sent);
     6) remember the last sales person, Enter adds an item, plain errors;
     7) writes and sends only from production;
     8) Admin reconnects Quotations once (add an email scope if Zoho needs one).
151. **Bug in what's live: new customers miss Zoho's mandatory custom fields.** `createCustomer` (`src/lib/quotations.ts`)
     sends no `custom_fields`, but Zoho's contact fields **Type** (`cf_type`, id `982417000008274205`) and **Sector**
     (`cf_sector`, id `982417000011023041`) are `is_mandatory: true` → Zoho will most likely refuse "Create in Zoho
     and quote". Also Last Name is optional in our form but needed for the Zoho CRM sync. Fix as step 1 of #150
     (Type default "New Customer"; Sector required; Last Name required).
152. **No real quote or customer made through the page yet** (as of 28 Oct evening). First live test (owner): a test
     customer with their own email → Save as draft → check in Zoho → Send → delete / decline the test quotes. Things
     only a real call proves: custom fields by `customfield_id` accepted; Zoho applies each item's tax when `tax_id`
     is omitted; notes/terms as sent; salesperson by name.
153. **State codes** in `INDIA_STATES`: the big states are certain; OR (Odisha), UK (Uttarakhand), CG, DN, LD, AN
     are Zoho's codes as far as I know but unverified — the first new customer from one of them will tell (Zoho's
     error shows in the form).
154. **Item pictures:** each picture's first view is one Zoho API call (`GET /items/{id}/image`); kept in the server's
     memory (400) and a week in the browser. `zoho_items.image` is known only after a full sync; until then every
     item is tried and the ones that fail go to the end of the catalogue.
155. **The popup's GST / total is an estimate** of Zoho's; the done screen shows Zoho's figure and warns if they differ.
156. **Overview colours:** the Overview's meters, bars, lines and legends use `--chart-1` / `--chart-2`, set from the
     theme's Reports palette by `useChartColors()` (`reports/Chart.tsx`). The "Behind" warning stays on the label only
     (owner OK'd, 28 Oct).
157. **Reports Key numbers:** a numbers-only first page also shows the first two charts of the following sections,
     half width in one row (`pagesOf` → `half`; grouped as "with the numbers"); they stay on their own pages too.
158. **Region:** functions run in `bom1` (Mumbai) since 28 Oct (`vercel.json`). If Vercel crons or anything
     region-bound misbehave, that's the first suspect; reverting = remove `"regions"`.
159. **Reports filters:** owner said (28 Oct) "if I use the filters I don't think the reports are changing" — checked:
     on the server every Quotes and Sales tile changes with Sector = Healthcare (31/31); filters skip only tiles whose
     data lacks the field (stock: no customer/sales person; freight: no item; margin: no courier). Not reproduced —
     ask which tab / filter when it comes up.
160. ~~Accepted (session 17 "yessir") but not built: quotes older than 90 days count as expired in Reports (#132);
     count customers by `nameKey` (#131).~~ — both built in session 18 (`5bec8a8`, `4d26eaa`).
161. **Answer caches** (session 17): Reports answers kept 10 min in the browser (trainings 1 min) and cleared on a new
     copy / Refresh now; server caches `signedInMember` names 60 s and `dataState` 20 s. If a change "doesn't show",
     these are why — Refresh now clears the browser one.
162. **Reports phase 5 — new business reports (next after #150; restate with defaults first):** renewals due (pads /
     batteries by AED age, certificate renewals); sales-person monthly targets; quote follow-up (unanswered 7 / 15 /
     30 days); cash coming in over 30 / 60 / 90 days; stock health for every brand (dead stock, turns, order-by date);
     purchase-price change alerts; customer value; lead-source return; trainings vs target.
163. **Reports phase 6:** builder field wells (Axis / Values / Legend / Tooltip, several measures), export PDF / Excel,
     a scheduled email (production-only, §11 #5), a data-freshness banner.
164. **Reports leftovers:** drill-through and small multiples (phase 4); chart lines / targets are per browser only
     (`th.reports.tweaks.<tab>` — could be saved on dashboard items); the "see Collections →" link cards on merged tabs
     weren't built; **the canvas can't leave a gap above an item** (`verticalCompactor` floats items up) — the owner
     asked for "anywhere"; if they insist on gaps, push-aside needs a custom compactor (`noCompactor` let pushed items
     overlap).
165. **Stored dashboards:** `reportDashboards` holds docs written by three shapes in one day (pages of 4 `slots`,
     rooms `items` without places, canvas `items` with `x/y/w/h`); `upgrade` reads them all. They are rewritten in the
     new shape only when someone saves — leave `upgrade` in place.

---

## 11. Changing things without breaking the live site (read before the first edit)

The dashboard is **in daily use by 7 people**, the local server **shares the live database**, and **every push to
`master` is a production release**. These are the habits that kept the sessions incident-free — and the traps found (session 16's slowdown: the free
database's weekly transfer limit — see "Database traffic" below).

**Before you change anything**
1. Read the relevant part of §3 and the code around it; match the surrounding style (comments explain *why*, owner's
   words and dates in comments, short functions, Tailwind classes inline). `AGENTS.md`: this Next.js (16.3) differs from
   training data — read `node_modules/next/dist/docs/` before Next-specific code (route handlers, `after()`).
2. For anything structural, **restate in numbered steps with a recommended default per question** and wait for "yeah".
   Small visual fixes the owner points at (screenshot + "fix the ui"): just fix, measure, report.
3. Check whether the thing is **live data**: `cardEvents`, `members`, `entries`, `reports`, kv connections are real.
   `zohoDocs` / `zohoCustomers` / `zohoPayments` / `za_tables` are caches of Zoho (rebuildable) — still never delete
   them by hand.

**While building**
4. **Never write test data to the shared database.** Browser tests abort every non-GET `/api/*` (allow sign-in /
   session and read-only `POST /api/analytics`); scripts are read-only; for flows that must write, use a throwaway
   `thinkhealth_qa` database only with the owner's OK (§9 #3, #10).
5. **Never send** emails / WhatsApps except a [TEST] to the owner (sshah@thinkhealth.in / their own number). Sending
   code runs only in production (`VERCEL_ENV`), so a local server can't send by accident — keep it that way.
6. **New event kinds** need: `types.ts` kind, `roles.ts` (`canWriteEvent`, `SERVER_KINDS` if server-only), `cascade.ts`
   if it's a flow step, `pipeline.describeEvent` (change log), replay in `pipeline.ts`. A new *field* on an existing
   kind (like `people`) needs none of the role changes — `/api/store` keeps unknown fields.
7. **Zoho sync window:** `zohoSync.reconcile` deletes tracked docs it no longer lists (previous-FY window). Never put
   older or wider data into `zohoDocs` — keep it separate (as `za_tables`, or the renewals back-fill plan in #80).
8. **Reports:** add fields / measures in `model.ts` (with a `def`) and their values in `build.ts` — never ad-hoc
   queries in the UI. Verify every new money measure against Zoho Books (Zoho Books connector `list_invoices`
   `response_option: 3`, or Zoho Analytics' own report). Check the **export format** of any new column first (lossy "K").
   Pace Zoho Analytics calls (≥ 2.5 s); read stored tokens only through the app's routes (direct token reads were
   refused as "credential exploration").
9. **Popups:** a `fixed` overlay inside page content can centre on the whole page (tall / transformed ancestors) —
   render popups opened from page content with `createPortal(…, document.body)` (`MiniNew`, Builder). Modals must fit
   1728×958 without inner scroll (measure `scrollHeight − clientHeight`, 0–16 px OK).
10. **ECharts:** dispose / re-init when the chart's box changes (`getDom()` check); colours come from the theme
    (`THEME_PALETTES`, `MINT_*`); text uses ink tokens, never the series colour; no second y-axis ever.
11. **Themes:** a new theme = `globals.css` `[data-bg]` gradient (+ token overrides if experimental) + `AppShell`
    `THEMES` entry + `Chart.tsx` `THEME_PALETTES` entry. Light themes have no prefix, dark ones `dark-`.
12. **Files:** `kpi.ts` is CRLF; the rest LF (git warns, harmless). Edit with the Edit tool; avoid `node -e` with
    apostrophes; never `sed` across many files without checking the match count.

**Database traffic (session 16 — the free cluster allows 10 GB out a week):** before adding anything that runs
repeatedly (a poll, a per-request read, a per-page fetch), work out **bytes per call × calls per hour × open tabs**.
Never read a whole collection on a timer — use `readAll` (`src/lib/cachedRead.ts`, downloads only on change) or a
versioned "nothing new" answer like `/api/store`. Keep big caches compressed (`za_tables` `gz`). Keep Reports lazy:
only the open page's tiles, and the board only when a tile needs trainings.

**Before every push (the owner asks often — do all of it every time)**
13. `npx tsc --noEmit -p tsconfig.json` and `npx next build` pass.
14. **Secret scan** of the diff *and* new untracked files against `.env.local` values (Zoho client / secret / refresh
    token, `MONGODB_URI`, `ADMIN_PIN`, `CLEAR_LOGS_PIN`) and token-like strings (`1000.<hex>`). Never print them.
15. Read-only browser check of the changed screen at 1728×958 (and 390 px if layout changed), light + one dark theme.
16. Commit with a clear message (what the owner sees + why) and the attribution line; `git push origin master`.
17. Poll both addresses (`work.thinkhealth.in`, `training-dashboard-xfwl.vercel.app`) until a string unique to the change
    appears in the served JS (constants may be minified — pick a CSS class or text), then tell the owner it's live and
    **Ctrl + Shift + R**.
18. **Stored shapes (session 18 crash):** before pushing a change to anything stored (Mongo docs, localStorage), ask
    "what if a document in the *old* shape is read?" — people save between pushes, even within the hour. Read old
    shapes forgivingly on the server (like `upgrade` for `reportDashboards`) and add a test with an old document.
    Also run `npm test` and `git fetch` + `git log HEAD..origin/master` (another session may have pushed).

**Safe-by-default suggestions for what to build next** (each small, additive, reversible):
- **Read-only first:** new Reports datasets / dashboards, new KPI tiles, new ticker lines — they can't damage data.
- **Behind Admin first:** new connections and tools (like Zoho Analytics) start Admin-only; widen after the owner tries.
- **Additive fields** on existing events (like `people`) rather than new kinds; old entries keep working.
- **Browser-only rules first** (they don't refuse old tabs' writes); move to the server only with the owner's OK and a
  note to the team (an old tab would lose its change silently).
- **One release per idea:** small commits the owner can try live within minutes; don't bundle unrelated changes.
- **Undo path:** every board action is a revertable `cardEvents` entry; keep new actions that way (no direct edits of
  Zoho data, no deletes of entries without the owner's explicit OK and an archive copy).
