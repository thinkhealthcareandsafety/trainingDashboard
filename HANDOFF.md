# Handoff — ThinkHealth Training Dashboard

_Last updated: 12 Oct 2026, end of session 7. Written for the next Claude Code session (and the owner, sshah@thinkhealth.in)._

Read this end to end before touching code. It records what the owner asked for (every prompt, all seven sessions), the
business rules that came out of it, how the code works **now**, what was verified, and what is still open.

**Start of the next session — do these first (details in §10):**
1. `git status` — everything from sessions 6 and 7 was pushed at the end of session 7. After a push the team presses
   Ctrl + Shift + R once.
2. **Fulfillment connections (checked 12 Oct):** learn@ mailbox **connected** (10 Oct, folder "Gratitude Emails Sent" found),
   master sheet **connected as digital@** (12 Oct), both designs **uploaded** (12 Oct — the A4 Photoedit templates, converted
   on the fly, §3). Still owner-side: the **forwarding filter** (#25), the **real gratitude wording** (#29), the
   **`CRON_SECRET` GitHub secret** (#31 — runs on 10 Oct still skipped "CRON_SECRET is not set").
3. The sheet append **has run for real** (two test batches on 12 Oct, numbers correct; the owner deleted the test rows). The
   first real **reply** is still the first real run of reading Zoho Mail (§10 #30).
4. Classic Citi Investments (Pune) still carries the two **test** `fulfil_certs` batches (10:07 and 10:19 on 12 Oct; their
   moves were undone, so the card shows the "moved back" note). Server-only events — delete them only with the owner's OK (#38).

**Session 7 in one paragraph (12 Oct):** connected the master sheet (the popup found the serial column only after "SN" was
taught to it); the sheet's **certificate numbers run 7 behind its SN** (Shreya used to leave blank rows between locations)
so the two now **count separately**; the first PDFs printed the uploaded A4 template squashed into one slot — the owner's
templates are the A4 Photoedit exports, so the dashboard now does what the certificate generator does (**takes the
certificate picture out of the template**, `certBackground.ts`) and prints exactly like the generator; **polished** the
Generate popup (wider, steps, facts strip), the Fulfillment card (Certificates block as labelled rows; every stage fits at
1728×958 again), the **Ready for training** and **Certificate details** popups (label/hint rows); added **Mark as Completed**
on Training Completed cards (done before the dashboard → straight to Sent to Logistics); fixed the flower loader drifting.

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
- **GitHub:** `thinkhealthcareandsafety/trainingDashboard` (**public** repo), branch `master`, last pushed commit `2156f46`
  (10 Oct, Fulfillment rework — live, verified in the deployed JS). **Not pushed at the end of session 6:** the Clear logs
  "type Confirm" lock (`clear-logs/route.ts`, `FollowUps.tsx`, `store.tsx`) and this HANDOFF.md — check `git status`.
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
  (free tier, ~1% used). It is **not** the "Directory" cluster the owner sees in their own Atlas project — Cluster0 sits
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
- **Deploy** = push to `master` (Vercel builds automatically). `vercel.json` adds one cron: `30 3 * * 1-6` (9:00 IST Mon–Sat)
  → `/api/cron/sync` (Vercel Hobby allows daily crons only — and fires anywhere within that hour).
- **Hourly scheduler** = GitHub Actions `.github/workflows/zoho-sync.yml` (`32,50 3-13 * * 1-6` UTC) → `/api/cron/sync`. Needs the
  repo secret **`CRON_SECRET`** (same value as Vercel's); without it the workflow just logs a warning. A failed sync answers 502,
  so the run fails and GitHub emails the repo owner. The workflow calls `/api/cron/sync?source=github` so the Sync log labels
  it. **Checked 7 Oct: the secret is missing** (both runs on 6 Oct skipped; the public API shows runs + annotations:
  `api.github.com/repos/thinkhealthcareandsafety/trainingDashboard/actions/runs`). The owner was told where to add it.
- **To make the hourly checks reliable** (Books sync + gratitude replies), the owner must add the GitHub secret — steps given on
  10 Oct: Vercel → project → Settings → Environment Variables → copy `CRON_SECRET`; GitHub repo → **Settings** tab → Secrets
  and variables → Actions → **New repository secret** `CRON_SECRET`; then Actions → *Zoho sync* → **Run workflow** (green = ok).
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
  locations. Both are read again under the lock at Generate. **Date = the training day; multi-day = the LAST day** (`certDate` in pipeline.ts) —
  **owner: "it can change later, mark it as important"**. Printed date `dd/mm/yyyy`; in the sheet the date is written in the
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
**Alias for certificates + concerned person's email** (end of session 5, commit `655daf0` — not described in the session 5
notes): `set_cert_alias` (value = alias printed as the certificate location, "" = customer's own name; `before`) and
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
- **Training**: unflagged quote/PI can be scheduled — with dates, trainers, the **alias for certificates** (*Same as original*, an alias, or *+ Add alias…*, which also adds the alias to the customer; printed as the certificate location) and the **concerned person's email** (used for the gratitude email and the participant list) — both per customer name, latest wins, changeable later with *Change* under the head-count (`655daf0`; older trainings used `underName`, "Under name: …"); once dated: **Change date** (a correction, earlier or later — event `mode: "change"`, label unchanged, log "Training date changed from … to …") / **Postpone** / **To be decided** / **Training completed** (both boards); merged PI pops *Ready for training*. **Several days** per training
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
  Not offered when that card already has a schedule. No merges are made. Downstream: Fulfillment and Logistics take the
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
| 148 | "Lock that clear-all behind typing 'Confirm'" | Popup opens on One deal cycle; Everything needs **Confirm** typed (+ server check); archive records `clearedScope`. Tested headless with fake API. **Not pushed.** |
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
| 166 | "push it to github" | This commit. |

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
- Keep the "important, may change later" items visible in the handoff (e.g. certificate date = last training day).

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
14. ~~Role rules client-side only~~ — enforced on the server since 7 Oct (`roles.ts` in `/api/store`). Roles go by member
    *name* (e.g. a member named "Arti …"); renaming a member changes what they can do.
15. The GitHub repo is **public** (anyone can read the code; Actions minutes are free). Decide whether it should be private.
16. The Overview page (`/`) is 131 px wider than a 390 px phone screen (pre-existing; Follow-ups and Calendar fit).
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
32. **Certificate date for multi-day trainings = last training day** (`certDate`, pipeline.ts) — **owner: "it can change
    later, mark it as important"**. Ask before changing; it changes both the printed date and the certificate number.
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
39. **Uploaded designs are stored as the 4.4 MB A4 templates** (uploaded before the convert-on-upload existed); each PDF
    converts them in the browser. Re-uploading them now would store the 0.9 MB background — optional.
40. The Generate popup's facts strip shows the **course of the chosen design**; the owner hasn't seen the Ready state
    (flower + Download) after the polish — it only shows after a real Generate.
