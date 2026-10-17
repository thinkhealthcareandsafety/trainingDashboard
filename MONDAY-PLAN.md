# Monday plan — Mon 19 Oct 2026

_Written Sat 17 Oct 2026 for the owner (sshah@thinkhealth.in) and the next Claude Code session. Read this together with
HANDOFF.md. Nothing in "To build" is started — each item waits for the owner's go-ahead._

---

## 0. First thing on Monday (10 minutes)

1. **Push the two waiting commits.** They are committed on this computer only — the live site has neither:
   - `a25a72f` — certificate location + concerned email **per training**; aliases and concerned person's name on every board.
   - `f642de7` — Overview maths fixes (see §1).

   GitHub asks for a sign-in that Claude can't answer. In VS Code's terminal run `git push origin master` (or Source
   Control → **Sync Changes**) and sign in as **thinkhealthcareandsafety**. After that Claude can push again.
2. **Everyone presses Ctrl + Shift + R** once the push is live. Important this time: the server now refuses a training
   date without its location + email, so a tab running old code will lose a schedule silently.
3. **Sign in once on https://work.thinkhealth.in** (live since 16–17 Oct). The vercel.app link keeps working.

## 1. Done on 15–17 Oct (for reference)

| What | Status |
|---|---|
| Certificate date, number and location print **pure black** (dashboard + certificate-generator app) | Live (`5d167c2`); generator pushed (`17853af`) |
| Certificate location name + concerned email **per training**, required to schedule; locked once certificates are made; server refuses a date without them | Committed `a25a72f`, **not pushed** |
| Alias (anything they're called) + concerned person's name (only a person) — optional, any board, follow the customer everywhere; typo / duplicate / "looks like a hotel" checks | Committed `a25a72f`, **not pushed** |
| Shreya's dummy gmail entries removed (6, archived in `cardEventsArchive`) | Done in the live database |
| Overview: revenue compared to the same days of last month (was −59%, really −3%); pace in whole trainings; "next 15 days" = 15 days; past-dated trainings shown as "to mark completed" (+ ticker reminder); Priyanka's trend from Sept; no "vs target" for future months; ticker "days left" counts today | Committed `f642de7`, **not pushed** |

## 2. Waiting on the owner

- [ ] **Push** (§0).
- [ ] **Year target decision:** "21 / 120 · Behind by 45" is correct maths but most trainings before October were never
      entered on the board. Either back-fill them (*Completed on invoice date*) **or** start the team's yearly target
      from the month the dashboard went live (like Priyanka's, which counts from Sept). → Pick one.
- [ ] **Reconnect hello@** (Admin → any Contacted card → Send email → *Connect it*). Still the 8 Oct connection; replies
      to Priyanka's emails can't be checked until then. Nothing has failed yet only because she hasn't sent a real email.
- [ ] **`CRON_SECRET` GitHub secret** — still missing; no hourly GitHub runs. Every reminder in §3 depends on reliable
      hourly syncs, so this comes before any reminder work.
- [ ] **Master sheet:** delete the 4 Classic Citi test rows from 15 Oct morning (1 name each).
- [ ] **Chalet trainings 352 / 455** were printed as "JW Marriott Mumbai Sahar". If either was at another hotel: undo its
      move to Certificates Generated → *Change* location → Generate again (adds new rows).
- [ ] Older: Zoho Mail forwarding filter (learn@ → digital@), real gratitude email wording, JW Sahar's 20 rows (real or
      test?), Classic Citi test batches.

## 3. To build — the owner's view

Judged as if it were our own business: ~7 people, ~10 trainings a month, plus AED sales.

### 3a. Want now — they earn or protect money every month

| # | Feature | Why | Data we already have | Questions for Monday |
|---|---|---|---|---|
| 1 | **Certificate renewals** — clients whose batch expires in 60–90 days, with headcount and last price | Every certificate says "Validity: 2 Years": each person trained is a renewal nobody is billing for. Even 30 % renewals is near-pure margin | Master sheet (names, dates, location) + `fulfil_certs` rows + the training's client | Who calls them (Shikha? sales?) · 60 or 90 days ahead · per client or per batch |
| 2 | **AED battery & pads expiry** | Recurring consumables revenue; an AED with expired pads is a safety risk and our reputation | `aedParse.ts` already reads battery / pads expiry from the invoice line | Who sells consumables (Priyanka?) · how far ahead (90 days?) |
| 3 | **Quotes going cold** — one nudge 5 days after sending with no reply | Cheapest revenue to recover | Zoho quotes (status, date, salesperson) | 5 days OK? · to the salesperson only |
| 4 | **Overdue invoices by age** (0–30 / 31–60 / 60+), part-paid balances that stopped moving | Cash matters more than revenue at this size | Invoices, payments, TDS already synced | Who chases payments |
| 5 | **"My day" per person** — each member's own to-dos on the front page | Dashboards die when nobody opens them; if the to-do list lives here, everyone opens it daily and the data stays clean | All boards (roles.ts already knows who does what) | What each person should see first |

**How to build the reminders (one design for all of them):**
- One **rule engine on the server**: a pure function over the boards (like `ticker.ts` already is), each rule giving
  `{ owner, due date, severity, link }`.
- **One owner per reminder.** No broadcast alerts.
- **Done / Snooze** saved as change-log entries (history kept, undo works like everything else).
- Shown in **My day** and the ticker. Escalate to the owner **only** after a time limit is missed.
- If anything is sent outside the app: **WhatsApp, not email** (the team lives on WhatsApp), and only for things due today.

### 3b. Want later — useful, not where the money is yet

- **Time limits on handoffs** (gratitude email in 2 days, certificates in 3, to Logistics in 2, dispatched → received in
  7, AED delivered → contacted in 3, Priyanka's next email after 3 days). "My day" covers most of it; add limits only
  where work actually gets stuck — Shreya's certificate step is the likely one.
- **2 days before a training:** no concerned email / no participant list / trainer clash → ping the trainer and
  Shikha. One rule, not a project.
- **Forecast with win rate** — needs ~6 months of real quote → PI data first; today it would be a guess.
- **Conversion funnel** (quote → PI → trained → paid, % and median days per step) and **delivery speed** (training →
  certificates, training → payment) — same: once the boards hold a few complete months.
- **Potential training** reminder in its expected month (the date is already stored).

### 3c. Drop for now

- **9 am email digest** — the team reads WhatsApp, not email.
- **Trainer load chart** — 3 trainers, ~10 trainings a month: Shikha already knows. Revisit when hiring.
- **Concentration risk tile** (share of revenue from the top 3 clients) — check it once a quarter in a report, not daily.
- **Revenue target tile** — not until a real target is decided; a made-up number does harm.

## 4. More the owner would want

1. **Profit per training, not just revenue** — trainer fee (especially external trainers), travel, kits, printing,
   shipping. Some out-of-town trainings may lose money. The one missing number that would change which deals we take.
   _Needs:_ where the costs live today (Zoho expenses? a sheet?).
2. **Repeat-client view** — trained once and never came back vs. train every year. "Trained once, 18 months ago" is the
   easiest sales list there is.
3. **Certificate verification QR** — a QR on each certificate opening "Valid until …". Hotels and auditors like it,
   it stops fakes, and it puts the renewal date in front of the client.
4. **Participant list form for clients** — a link sent with the gratitude email where the client types the names; no
   copy-paste by Shreya, fewer typos, certificates ready the moment the list arrives.
5. **Feedback after each training** — two questions + a rating, sent with the certificates: testimonials for sales,
   early warning on a trainer, proof for hotel-chain proposals.
6. **Our trainers' own certifications** — the certificates say "AHA Certified Trainer"; if that card lapses, every
   certificate printed afterwards is a problem. One reminder per trainer: tiny effort, big risk avoided.
7. **Lead source** — where each client came from (referral, Google, hotel-chain contact…); Zoho already has a field
   (`cf_lead_source`). Tells us where to spend sales time.
8. **Stock** (AEDs, pads, manikins, certificate paper) — only if we've ever run out. If not, skip.

## 5. If only three

1. **Renewals** — money in without new selling.
2. **Profit per training** — which work is worth taking.
3. **My day** — keeps the whole team inside the dashboard, so the other two stay accurate.

**Proposed order for Monday:** §0 → §2 decisions → start **My day** (it is the frame every reminder lands in), with
**renewals** as its first rule.

---

### Notes for the next Claude session
- Read HANDOFF.md first (it predates 15 Oct — this file covers 15–17 Oct). Don't write test data to the shared
  database, don't email customers, push only when asked.
- Code from 15–17 Oct: per-training location / email in `src/lib/pipeline.ts` (`applyCert`, `customerCert`,
  `certsLocked`), pickers + Customer editor in `src/components/followups/CardModal.tsx` (`LocationPicker`,
  `EmailPicker`, `NamePicker`, `CustomerNamesEditor`, `certEvents`, `certFields`), server rule `missingCertFields` in
  `src/lib/roles.ts` (used by `/api/store`). New event kinds `set_cert_location`, `set_training_email`; old
  `set_cert_alias` / `set_concerned_email` are now refused by the server and only read as the fallback for older
  trainings. Overview maths in `src/lib/kpi.ts` (`revenueBetween`, `unmarked`, `boardMonthSeries(…, since)`) and
  `src/components/Kpis.tsx`; ticker reminder "Mark completed" in `src/lib/ticker.ts`.
- `src/lib/kpi.ts` uses CRLF line endings (other files LF) — script edits must handle both.
- Verified read-only on live data (esbuild bundle with `server-only` / `next/server` stubbed) and in a headless browser
  with every save blocked; modal fit 0 px at 1728×958.
