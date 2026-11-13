# Training Manager: full plan

## Status (13 Nov 2026): everything is live at `4b8e7d6`

| Step | What | State |
|---|---|---|
| 1 | Training Management page (Trainings) | **Live**. The quotation's story, coordinator, portal state; rows glow green (accepted) or red (rejected); columns sort, kept per person |
| 2 | Coordinator fields in the quote email + Zoho contact person | **Live** (a first name is enough; Same as original per field; an existing email is renamed) |
| 3 | Portal sign-in + OTP reset | **Live** at work.thinkhealth.in/training/<number> |
| — | training.thinkhealth.in | **Code live**, Vercel domain added; **waiting on the Cloudflare CNAME** `training` → `4145140deaae64f5.vercel-dns-017.com` (DNS only) |
| 4 | Welcome + Your trainings + Our programmes + Stay connected + Portal content editor | **Live** |
| 5 | Accept (date, "course conducted at", headcount) or Decline | **Live** (replaced "propose a date"; see "As built") |
| 6 | Participants: type, Excel/CSV, QR; one person per mobile number | **Live** |
| 7 | QR join page + TH IDs + participant page | **Live** |
| 8 | Login box in the quote email + Send login + Decline link | **Live**. A fresh password each email unless they chose their own |
| 9 | Design finish review + DESIGN.md | **Done** (2 review rounds) |
| 10 | Confirm → Draft Performa in Zoho, edited on the dashboard, emailed from a template | **Live** |
| — | Schedule the training on the Training board at Mark confirmed | **Live** (`35933fd`). No trainers are set, and reminders go to trainers only, so nothing is emailed until Shikha adds them |

**First real test: passed** (owner, 13 Nov; the test Performa-25-1204 is still to be deleted in Zoho). The steps were (on the test customer "dashboard testing", with their own email as coordinator):
1. Decline, then Reopen.
2. Accept.
3. Confirm, which makes the Performa (this was the first test to hit Zoho's "only accepted quotes" rule, now fixed).
4. Save to Zoho, then Email the Performa.
5. Add names; join by QR on a phone.
6. Delete the test Performa in Zoho afterwards.

## As built (12–13 Nov): the whole flow

**1. Quotation.**
- On Quotations, a quote with a training item asks for the **Training Coordinator** (name, mobile, email). The coordinator is saved on the Zoho customer as a contact person with designation "Training Coordinator", and gets the email first.
- When **every** line is a training item (re-checked live in Zoho at send time), a **login box** goes under the message:
  - the link `<PORTAL_BASE_URL>/<quote number>`;
  - their email;
  - a password: **a fresh random one each time**, unless they set their own by reset code (`portalLogins.own`), in which case it says "the password you chose";
  - a **Sign in** button;
  - "Not going ahead? **Decline the quotation**".
- If the email fails, the login is put back as it was.
- `portalTrainings` keeps the coordinator. A quote not yet in the hourly copy is read from Zoho once and kept as `quoteDoc`.

**2. The coordinator signs in** (30-day session).
- The **welcome** plays once after sign-in: four signs set in, then three lines.
- Then **Your trainings**, each as a sign panel with stacked ink stamps: **Awaiting decision → Accepted → Confirmed**, or a red **Rejected**. Earlier stamps stay faded, with their dates.

**3. Accept or Decline.**
- **Accept** needs the date(s) (one or more days, a time, a Tentative switch), **"Course conducted at"** (printed on the certificates) and **people attending**. Zoho then marks the quote **Accepted**. They can change it until we confirm; the old values show struck through.
- **Decline** (in the portal, or from the email's link) takes an optional reason. Zoho marks the quote **Declined**. It's final for them; the Trainings page has **Reopen**, which puts Zoho back to Sent.

**4. Participants.**
- The list always shows. "Add participants" opens three ways in: **Type names**, **Excel / CSV** (read in the browser, no package; header and phoneless rows skipped, with reasons), and **QR code** (copy, download, share on WhatsApp, new link).
- One person per mobile number on a training.
- TH001, TH002… are counted across everything and never reused.
- Each participant has a private page, On / At / For, reached through their `?p=` link.

**5. Our side (Trainings).**
- A green row: accepted and waiting for us. Opening it shows the details and **Confirm → make Performa**. Confirm:
  - marks the quote Accepted in Zoho if that didn't go through earlier;
  - converts it into a **Draft sales order** (POST /salesorders with `estimate_id`), with the quote's lines;
  - sets the training lines to the coordinator's headcount;
  - fills Training Date (first day), PO Date (today), PO Number "Verbal" and Product Type "Training";
  - sets the salesperson to whoever confirms (Admin = Sumit A Shah);
  - writes the training into the Notes.
- The **Performa editor** shows the draft as Zoho has it:
  - the dates and the custom fields, using Zoho's own dropdowns;
  - each line's description, quantity and rate;
  - the Notes.

  **Save to Zoho** PUTs the draft. **Email the Performa** sends it from Zoho with its PDF, using the template under Templates → Performa emails.
- The portal then stamps **Confirmed**, and the coordinator can no longer change the date.
- A red row: rejected, with the reason. **Reopen** and **Mark Declined in Zoho** (a retry) are there.

## Where it's kept (as built)

| Collection / key | What |
|---|---|
| `portalTrainings` (_id = Zoho estimate id) | `coordinator`, `proposal` + `history`, `confirmed` {salesorderId, number, by, at, emailedAt}, `rejected` {at, by, reason, zoho}, `joinKey`, `declineKey`, `loginSentAt`, `quoteDoc` |
| `portalLogins` (_id = email) | scrypt salt/hash, `own` (they chose it), OTP, tries, lastLogin |
| `portalSessions` | sha256 of the cookie token, expiry |
| `portalParticipants` (_id = TH001…) | trainingId, name, phone, email, source (typed/excel/qr), token |
| `counters` "th" | the running TH number |
| kv `portal_content`, `portalPhotos` | programmes, social links, programme photos (Templates → Portal content) |
| `mailTemplates` `portal:box`, `portal:login`, `pi:training` | saved wording (Templates) |
| `uiPrefs` (_id = member id) | per-person page settings (`trainingsSort`) |

## What's left

1. **Owner:**
   - The Cloudflare CNAME, then `PORTAL_BASE_URL=https://training.thinkhealth.in` on Vercel and a redeploy.
   - The first real test above.
   - Programme photos and videos (optional).
2. **Built 13 Nov (`35933fd`):** Convert to PI in the story's Performa box; Mark confirmed / Mark confirmed & send email; the portal stamps Confirmed only then; Mark confirmed schedules the training on the Training board (no trainers, so no reminders until they're added).
3. **To decide, then build:** item-level PI templates beyond training ("training only for now", owner).
4. **Next: Attendance (Step A), then the Quiz (Step B).** See the plan below. Not built.
5. **Out of scope for now:** certificates from the attendance list, WhatsApp to participants.

## Next: Attendance and Quiz (plan, 13 Nov 2026; not built)

The owner's brief (13 Nov): after Mark confirmed, the coordinator's view becomes "Training confirmed": On / At / For with an
attendance QR beside it, and the participant list in a box with a live tick by each name. Attendees scan the QR, open their
own page (registering first if they're new), are greeted ("Welcome back, {name}" / "Welcome, please mark your attendance"),
press a round **Present** button, see a short "attendance marked, thank you" moment, then their own dashboard. On the
training day the coordinator's panel changes: a "Training today" strip, the QR large with a live count. Later: a quiz,
results, a leaderboard (full names) and quiz analytics for the coordinator. Attendees identify by mobile number only.

### Gaps found, and the answer this plan takes

| # | Gap or inconsistency | Plan |
|---|---|---|
| 1 | After Mark confirmed the **Training board** holds the dates (Shikha postpones or changes them there), but the portal shows the coordinator's proposal. Attendance would open on the wrong day. | **Owner: follow the board.** After Mark confirmed, every portal date (coordinator, participants, attendance window, Today strip) comes from the board's schedule for the Performa's card. A changed date shows with the old one struck through ("nothing vanishes"). The board says "to be decided" → the portal says "To be confirmed" and attendance stays shut. |
| 2 | The QR can be forwarded on WhatsApp, so absent people could mark themselves present from home. | **Owner: a fixed QR** (printable, shown in advance). It works only on the training day(s). The coordinator can make a new one (the old one stops working, like the registration link) and sees every tick live. |
| 3 | Who shows the QR in the room? Our trainer has no portal login. | **Owner: the coordinator only.** Our Trainings page shows attendance (present X of Y, who), read only: no QR, no ticking. |
| 4 | Mobile number only: anyone who knows a colleague's number can mark them present. | Accepted (owner's choice). The greeting shows the name with "Not you?"; the coordinator sees every tick and can untick; each tick records how it was made (self / coordinator / staff). |
| 5 | "The phone remembers them": participants have no login today, only a private `?p=` link. | A participant cookie (per training, 180 days) holds their TH number and token. Scanning again goes straight to the greeting. A new phone asks for the mobile number again. |
| 6 | Walk-ins: people not on the list turn up. | **Owner: yes.** They register on the spot, are added tagged "walk-in" and marked present. |
| 7 | A two- or three-day training. | One tick per day. The box shows a column per day; "X of Y present" counts today. |
| 8 | When does attendance open? | The whole training day, India time (00:00–23:59). It's closed outside the day(s): before, "Attendance opens on Fri, 4 Dec"; after, "Attendance closed". |
| 9 | Two QRs could confuse the coordinator. | Named everywhere: **Registration QR** (the existing join link, under Add participants) and **Attendance QR**. Registration closes after the last training day. |
| 10 | Removing someone who has already been marked present. | Not allowed: untick first. |
| 11 | "Live" ticks on Vercel (no websockets). | The box polls: every 5 s on a training day while the panel is open, otherwise every 60 s; it pauses when the tab is hidden. |
| 12 | Before the day, the confirmed view shows a QR that doesn't work yet. | The QR shows with "Works on the training day only", plus Download / Print and New QR. |
| 13 | What does the participant's "dashboard / statistics" hold before the quiz exists? | Their training (On / At / For, following the board), attendance per day (stamped PRESENT), their TH number. Quiz score, rank and leaderboard join in Step B. |
| 14 | The end of the story for the coordinator. | When the board marks the training completed, the portal adds a **Completed** stamp and shows "32 of 36 attended". |
| 15 | Many people scanning at once on the day. | Reading the board per scan is heavy, so each server keeps the board's schedule for a training for 60 s. Attendance writes are one small document each. |
| 16 | Trainers' names in the Today strip. | From the board's schedule; the part is left out until Shikha adds them. |
| 17 | Attendance and certificates. | Not now. Kept per person and day, so certificates can later come straight from it. |

### Step A: Attendance (one commit)

- **Coordinator, confirmed** (stamp Confirmed): heading "Training confirmed". Left: On / At / For. Right: the fixed Attendance QR ("Works on the training day only", Download / Print, New QR). Below: the participant box: name, TH number, a tick per day, with a manual tick / untick for each.
- **Coordinator, on a training day:** a "Training today" strip (Day 2 of 3 · time · place · trainers), then the QR large with a live "X of Y present". The rest moves below.
- **Attendance page** `/training/<number>/attend?k=<key>`: remembered phone → greeting; else mobile number → on the list: "Welcome back, Riya" (Not you?) → **Present**; not on the list: register (if walk-ins are allowed), then **Present**. Then a PRESENT ink stamp lands ("Attendance marked. Thank you for being here."; reduced motion: no animation), then their own page.
- **Participant page:** gains attendance per day.
- **Our Trainings page:** present X of Y per day and who, read only (owner: the coordinator alone runs attendance).
- **Kept:** `portalAttendance` (_id `TH001:2026-12-04`): trainingId, th, date, at, how (self / coordinator / staff), by. `portalTrainings.attendKey`. The participant cookie.
- **Tests:** window open/closed per day (India time), a replaced QR stops working, one tick per person per day, untick, walk-in rule, no removal after a tick, dates following the board.
- Portal screens through Impeccable; DESIGN.md in step.

### Step B: the Quiz (waits for the owner's Google Form)

The questions are copied from the Google Form into the portal's own quiz, so answers tie to each attendee for the score, the leaderboard and the coordinator's analytics. To settle when the form arrives:
- one quiz per programme, or per training;
- one attempt or retries; a time limit;
- when it opens (after marking present?) and closes (e.g. 7 days after);
- the leaderboard: live, or only when the quiz closes; full names (decided);
- ties: the faster finish ranks higher;
- the coordinator's analytics: per question, how many picked each option, with the right one marked; the average score; how many took it;
- the participant's view of results: score only, or each answer with the right one.

Also built along the way: on Quotations, clicking a quotation opens only that quotation, with its sent details, the new-quotation choice (same items, revised or from scratch) and the story from quotation to payment, or for training quotes to the certificates received.

Owner's brief, 10 Nov 2026. Decisions already made:

- **Quotes:** only quotes with nothing but training items get a portal.
- **Sender:** email comes from learn@thinkhealth.in, which is already connected to the dashboard through Zoho Mail.
- **First email:** the quote PDF stays, and the login is added to it.
- **Social links:** shown with real icons and descriptions.
- **Look:** taken from thinkhealth.in, following the **Safety-sign** design direction.
- **Participants:** English, phone-first.

Nothing is built until you say "yeah". Nothing goes live until you say "push". (The sections below are the original 10 Nov plan; "As built" above wins where they differ.)

---

## 0. The look (for every portal page)

Built with the Impeccable skill. The product record is in `PRODUCT.md`, the design brief in `.impeccable/surfaces/src-app-training.md`.

**Logo and colours.**
- The logo is the "think health" wordmark from thinkhealth.in.
- Deep navy **#034f72** is used for the header band and the text.
- Cerulean **#0088c8** is used **only for things you can press**. If it's blue, you can tap it.

**Each programme has a safety-sign tile**, using the international sign language (ISO 7010):
- First Aid and AED: green cross / heart.
- Fire safety: red.
- Instructions such as "Bring ID": blue.

Every tile has the same size, the same pictogram-to-label ratio, and sits on one line.

**Status stamps.** Each training carries a stamp: Awaiting date → Proposed → Confirmed → Done. Stamps never disappear: a changed date shows the old one struck through.

**Type and space.** One clean sans typeface, with big size contrast for headings and generous white space. It has to feel like a five-star hotel's signage, not a form.

**Motion.** Kept quiet, with one signature moment, the welcome. Anyone who has "reduce motion" turned on gets no animation.

**Size.** Pages stay light, so they're fast on cheap Android phones over 4G.

---

## 1. Training Management page (inside the dashboard)

- A new tab next to **Quotations**, for the same people: Ashish, Shikha, Sumit, Nikita, Anuj and Pranjal.
- It lists Zoho quotes in which **every** item is in the "Training Services" group. This covers quotes made on the dashboard and quotes made in Zoho. The list is read from Zoho every hour and on "Refresh".
- Each row shows:
  - customer;
  - quote number and date;
  - training(s), without the "(I)";
  - expected participants (the quantity on the training line);
  - coordinator;
  - portal status: *No coordinator · Login not sent · Sent · Logged in · Date proposed · Confirmed*.
- Opening a row shows:
  - the customer's name, email and phone;
  - the coordinator's details;
  - the training lines with their descriptions;
  - the proposed date, location and confirmed headcount;
  - the participant list, which you can download as Excel.
- Buttons on each row: **Add/edit coordinator** (for quotes made in Zoho), **Send login** / **Resend login**, **Open portal as them** (view only).
- Later, not now: "Confirm this date" and "Create PI", as the next plan.

## 2. Coordinator fields when making a quotation

- When a quote on the Quotations page has a training item, the email step shows three **required** fields: **Training Coordinator's Name**, **Number** and **Email**.
- A **"Same as original"** tick copies the customer contact's first and last name, email and number.
- When the email is sent:
  1. **Contact person.** The coordinator is added to the Zoho customer as a contact person, with designation **"Training Coordinator"**. If a contact person with that email already exists, it's updated rather than added twice.
  2. **To/CC.** The email goes **to the coordinator**, with the original contact in CC when it's a different person.
  3. **Login.** For a training-only quote, the email also carries the **portal login box** (see step 8).
- Testing: I only write to a test customer in Zoho until you say otherwise.

## 3. Portal login (training.thinkhealth.in/QT-00123)

**Address.**
- The **Training Number is the quote number** (e.g. QT-00123).
- Until the DNS is set up, the portal works at **work.thinkhealth.in/training/QT-00123**.
- Once **training.thinkhealth.in** points to Vercel, the same pages answer there. You do this in Cloudflare and Vercel (§ "What I need from you").

**Login screen.**
- Title **"Think Health Training Manager"**.
- Fields: **Email** and **Password**. Buttons: **Sign in**, **Forgot / reset password**.

**Password.**
- Random (12 characters, easy-to-read letters), made when the login email is sent.
- Stored only scrambled (scrypt), so nobody, including us, can read it back.
- "Resend login" makes a new one.

**Reset password.**
1. They enter their email.
2. A **6-digit OTP** comes from **learn@thinkhealth.in**. It's valid **10 minutes**, allows 5 tries, and they can request at most 3 an hour.
3. They choose their own password (at least 8 characters).

**Safety.**
- Coordinators have their own login, separate from staff. It stays signed in for 30 days on their device.
- They can only ever see **their own** trainings. One login covers all of that hotel's trainings where they are the coordinator.
- Wrong passwords slow down after 5 tries.

## 4. After login: welcome and dashboard

**Welcome**, once per login, about 4 seconds, tap anywhere to skip. Three big lines slide up one after another:
1. "Welcome, Riya."
2. "Your trainings, managed in a single touch."
3. "Every attendee, accounted for."

Then the dashboard fades in, and the programme signs draw themselves in.

**Our Programmes** (top):
- One sign tile per programme (CPR, First Aid, AED, Fire Safety and so on), each with its pictogram and a one-line description.
- Each tile has a slot for a video and a photo. Your YouTube playlist goes in now.
- **You change them yourself later** on a "Portal content" screen in the dashboard (owner, 10 Nov). It's under Templates, for those who send quotations. There you edit each programme's name, one-line description, video link (YouTube) and photo, plus the social links. Saved changes show on the portal straight away; no code change is needed.

**Your trainings** (below): one panel per training.
- The **training name** without "(I)".
- **What's included**: the item's description from Zoho.
- **Expected participants**: from the quote.
- The status stamp, and the quote number.
- Actions: **Propose date** and **Participants**.

**Footer, "Stay connected"** (also on participant pages):
- Cards with real icons and descriptions: Website · LinkedIn · Instagram · YouTube · Facebook.
- The links are already taken from thinkhealth.in.
- No hotel logos and no AHA logo (owner, 10 Nov: show none).

## 5. Propose a date, location and headcount

On each training:
- **Proposed date and time**, with a **"Tentative"** switch. Several dates are allowed if it's split across days.
- **Location**, e.g. "The Grand, Pune, Ballroom 2".
- **Confirmed number of people attending.** This is required before they can send the proposal. If it differs from the expected number, it's highlighted to them and to you.

**Send to Think Health** stamps the training "Proposed" and shows it on the Training Management page. No email goes to you for now; you'll see it on the page. They can change it later, and the old value stays visible, struck through.

**Our side, once the coordinator can propose** (owner, 11 Nov; an idea, to be shaped when the portal side works):
- On the Trainings page, a row whose coordinator proposed a date gets a **glowing green border**.
- Opening it shows the proposal **inside the Quotation phase of the story**: the training, the date(s), tentative or not, the location, and the people confirmed.
- **Accept training date** then does three things:
  1. It makes the Performa invoice in Zoho **from the quotation**.
  2. It puts the proposed date on it.
  3. It schedules the training on the Training board.

  The story then moves on to Performa → Training scheduled by itself.
- Still to decide: what the coordinator sees after we accept (their story moves to "Confirmed"), and what happens when we can't do that date (propose another one back?).

## 6. Participants: three ways in, one list

1. **Type them in**: name + phone, one row at a time, and add as many rows as they like.
2. **Excel / CSV import**, two columns: name and phone.
   - Header rows, or any row without a real phone number (e.g. "Name / Number"), are skipped.
   - Before anything is saved they see a preview: "38 added, 2 skipped (why)".
   - This needs one small package to read .xlsx (SheetJS, loaded only on that screen).
3. **QR code + link**, a different one for every training.
   - Shown big, with **Copy link**, **Download QR** and **Share on WhatsApp** (their own WhatsApp, from their phone).
   - The link carries a hidden key, so only people who were sent it can join. **New link** turns off the old one.

**On the list:**
- Phones are cleaned up to 10 digits. **Same phone twice = duplicate**, marked on both rows, each with a **Remove** button. Every row can be removed.
- A counter shows "38 registered of 40 confirmed", and the list can be downloaded.
- Each person gets an ID (§7) whichever way they came in.

## 7. The QR join page and the participant page

**Join page** (training.thinkhealth.in/QT-00123/join), phone-first:
- "You're invited to **First Aid training** by **Riya Mehta**, The Grand Pune."
- Fields: **Name**, **Phone**, **Email (optional)**, **Join**.
- If the same phone already joined this training, they simply get their existing page back, with no duplicate.

**IDs:** **TH001, TH002…**, one count across every training and every hotel, never reused.

**Thank-you:** a warm thank-you ("Thank you for giving us your time, Aman. See you there.") fades into **their page** at training.thinkhealth.in/QT-00123/TH001:
- **Section A**: their name and TH ID.
- **Section B**:
  - **On**: the date, or "To be confirmed" until it's set, with "tentative" shown when it is.
  - **At**: the location.
  - **For**: the training name.
- **Section C**: videos (your YouTube playlist now, more later) and the **Stay connected** cards.
- It shows nothing about anyone else and needs no login. Their saved link always shows the latest date.

## 8. The login in the quote email

For training-only quotes, the email from step 2 gets a neat block under the usual text:
- "Your Training Manager": the link, their email, the password, and a "Sign in" button.
- The quote PDF stays attached as today.

The block's wording is editable on the **Templates** page like the rest. For quotes made in Zoho, the same email is sent from the Training Management page with **Send login**: login block only, no quote text.

---

## Where things are kept

New collections in MongoDB; nothing in the existing collections changes.

| Collection | What's in it |
|---|---|
| `portalTrainings` | One per training quote: quote id/number, customer, coordinator (name, email, phone, Zoho contact person id), expected pax, proposed dates, tentative flag, location, confirmed pax, history of changes, join key, status. |
| `portalLogins` | Coordinator email, scrambled password, failed tries, OTP (scrambled) and its expiry, last login. |
| `portalParticipants` | TH ID, training, name, phone, email, source (typed / excel / QR), added at. |
| `counters` | The running TH number. |

## Build order

One commit each. Every step gets tests, the browser check and your "push":

1. Training Management page: list + detail, read-only.
2. Coordinator fields + Zoho contact person, tested on a test customer only.
3. Portal shell in the new look + login + OTP reset.
4. Welcome sequence + Our Programmes + Your trainings + Stay connected, with the "Portal content" screen to edit programmes, videos, photos and links.
5. Propose date / location / confirm headcount.
6. Participants: type, Excel import, duplicates, remove.
7. QR join page + TH IDs + participant page.
8. Login block in the email + Send login on the Training Management page, tested on my own address only.
9. Design finish review + DESIGN.md (the Impeccable finish step) + HANDOFF.md.

## What I need from you

1. **DNS** (whenever you like; everything works at work.thinkhealth.in/training until then):
   - In Cloudflare, add a CNAME `training` pointing to `cname.vercel-dns.com`, with the proxy **off**.
   - Then in Vercel → Project → Domains, add `training.thinkhealth.in`.
   Owner, 10 Nov: waiting on this for now.

Settled on 10 Nov:
- No hotel logos and no AHA logo.
- Videos and photos: you add or change them yourself on the "Portal content" screen.
- Test customer: **"dashboard testing"** in Zoho. It's the only customer I add contact persons to while testing.

## Out of scope for now

- Think Health confirming a date and sending the PI.
- Attendance on the day, certificates from the portal, and WhatsApp messages to participants.
