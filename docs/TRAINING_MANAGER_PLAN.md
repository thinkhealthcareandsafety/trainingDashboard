# Training Manager: full plan

## Status (12 Nov 2026, live at `a101b19`)

| Step | What | State |
|---|---|---|
| 1 | Training Management page (Trainings) | **Live**, with the quotation's story and the coordinator |
| 2 | Coordinator fields in the quote email + Zoho contact person | **Live** (first name enough; Same as original per field; existing email renamed) |
| 3 | Portal sign-in + OTP reset | **Live** at work.thinkhealth.in/training/<number>; no logins exist until step 8 |
| — | training.thinkhealth.in | **Code live**; Vercel domain added; **waiting on the Cloudflare CNAME** `training` → `4145140deaae64f5.vercel-dns-017.com` (DNS only) |
| 4 | Welcome + Our Programmes + Your trainings + Stay connected + Portal content editor | **Built 12 Nov**, waiting for "push" (Facebook and YouTube links still to paste on Templates → Portal content) |
| 5 | Propose date / location / confirm headcount | **Next** |
| 6 | Participants: type, Excel import, duplicates, remove | To do |
| 7 | QR join page + TH IDs + participant page | To do |
| 8 | Login block in the quote email + Send login on Trainings | To do (creates the logins) |
| 9 | Design finish review + DESIGN.md + handoff | To do |
| later | Green glowing row on a proposed date; Accept → Performa in Zoho + training scheduled | Idea (§5) |

Also built along the way: on Quotations, clicking a quotation opens only that quotation, with its sent details, the new-quotation choice (same items, revised or from scratch) and the story from quotation to payment, or for training quotes to the certificates received.

Owner's brief, 10 Nov 2026. Decisions already made:

- **Quotes:** only quotes with nothing but training items get a portal.
- **Sender:** email comes from learn@thinkhealth.in, which is already connected to the dashboard through Zoho Mail.
- **First email:** the quote PDF stays, and the login is added to it.
- **Social links:** shown with real icons and descriptions.
- **Look:** taken from thinkhealth.in, following the **Safety-sign** design direction.
- **Participants:** English, phone-first.

Nothing is built until you say "yeah". Each step is one commit, and nothing goes live until you say "push".

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
