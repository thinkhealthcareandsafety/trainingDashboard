# Plan — quotation emails, Items page, brochures, and three smaller asks

_Written 4 Nov 2026 at the end of session 22. The owner said "yeah" to everything here with these defaults. Not started
except where marked. Read HANDOFF.md's top blocks and §11 first; §11 applies to every step._

**How to work:** build in this order, one commit per step, no push until the owner says "push". Before every push: `tsc`,
`next build`, `npm test`, the secret scan, a read-only browser check. Never write test data to the shared database and
never email or WhatsApp a customer. The owner is short on credits, so keep replies short.

## Left to do (end of session 23, 4 Nov): start here; replaces every older list below

**Broken**
1. **Zia never answers.** Asked twice on 4 Nov (kv `zia:*`, no `answeredAt`); the email step waits 2 minutes and gives nothing. History's output for the 09:43 IST run said
   "Content can't be null": the Zia step's prompt is empty or mapped wrongly (we send JSON `{quote, prompt}`). Owner's call: fix the mapping in Flow, or remove Zia from the email step.

**Built, not yet proven on the live site**
2. **+ Add picture:** try on Hot Water Bag Standard with a real photo first (the team should wait). `/items/{id}/images` for adding is a guess. Read it back: the new
   picture is on the item and none is gone. If it fails or replaces one, fix before anyone else uses it.
3. **Item Edit:** no save yet (`itemEdits` holds only 2 brochure uploads). Save one small change, read it back in Zoho.
4. **+ Add email:** 9 Nov (owner: "why cant i add the email here"): it now says what's missing (first and last name, which Zoho needs; a half-typed email), and a @thinkhealth.in address isn't saved on the customer (server refuses it; the email step offers Move to Cc, `isTeamEmail`). First real one on a customer the owner picks; read back in Zoho, and check the new person stays ticked in the email step.

**Agreed, to build (owner, 4 Nov); restated with defaults, waiting for "yeah"**
5. **Brochures on quotes: built 9 Nov** (owner "yess"; not on Total Supply emails). `GET /documents/{id}` gives the PDF (tried on the test item). The email step lists the quote's items' brochures as ticked chips (`quoteBrochures`; file id from the items copy's `brochureId`, or the item itself until the next sync); the server reads each from Books at send time (`brochurePdf`). Not tried yet: a real send. Zoho's attachment size limit is unknown; first send to the owner only.
6. **Editable templates:** "we should technically be able to edit templates on the page".

**Next time the owner is at the API console**
7. **Narrower permission** (owner: "sure"): try a scope list with a guessed documents scope instead of `ZohoBooks.fullaccess.all`. None is documented, and uploads stop until a reconnect if it's wrong.

**Done on 4 Nov from the owner's answers**
- Replace PDF: the owner removes old files; no code. Average invoice tile added to Admin's My dashboard (below the charts). Items: Training Services back, an Everything choice for hidden and inactive items. Reports already holds all 1,122 items.
- GST in item Edit: rates 0, 5, 18, 40, tax ids in `itemEdit.ts`; both tax ids sent together. Tested on Hot Water Bag (18 to 5 and back).

**Owner's side (no code); the owner's "10)" and "11)" answered the ideas list, so these two are still open**
8. Should invoices and payment reminders come from quotations@ too (Books' organisation email)? Check one.
9. Zoho Mail filter in sales@: From contains `quotations@thinkhealth.in` → folder "Quotations via Books". Not confirmed done.
10. Optional: delete `zia-secret.txt` from the Desktop; change the PIN if the 4 auto-filled dots in the Reconnect popup were it (they went to Zoho's sign-in).

**Idea, not asked for:** each person's own title, number and email in the signature.

## Status, session 23 (4 Nov)

Steps 1–7 and the Added / Missing half of step 8 are built and committed, not pushed. Where they differ from the text below:
- **Step 1:** `from_emails` shows quotations@ with `is_org_email_id: true`, not selected (the Gmail is). So `emailQuote` sends
  `send_from_org_email_id: true` rather than `from_address`. Written from memory of Zoho's docs and **unproven until a real quote reaches
  the owner's own address.** If it still comes from the Gmail, that's the plan's "ask the owner first" case.
- **Step 5:** owner, 4 Nov: "id rather have the whole month". The tile compares with the **whole of last month** (`prevWhole`,
  `ownCompare`). It sits on Sales & growth, which Admin has hidden; it won't show on My dashboard until someone adds it.
- **Step 8:** brochures are **not attachments**. Books has a file custom field, `cf_product_brochure` (name in the value, file id in
  `_unformatted`), and `has_attachment` stays false on an item that has one. It comes with the `/items` list, so Added / Missing costs no
  extra calls and no new collection. **Upload is not built:** it must write that field, how is unknown, and it needs a test item and
  (possibly `ZohoBooks.settings.*`) an Admin reconnect. Both are the owner's to give.

Later on 4 Nov:
- **Sender:** owner tested a real quote: "it works, i checked".
- **Brochure upload, tested on "dashboard testing item" (982417000023551054):** `PUT /items/{id}` with `custom_fields` on field 982417000023514003
  (attachment type, Books' note: "Upload PDF less than 1 MB") and an existing file's id answered 33001 "The document can't be attached. Upload
  the document and try again." The item stayed unchanged. So the field takes a document id, but Zoho documents no upload for it, and a forum
  thread asking the same has no answer. Missing rows link to the item in Books instead (the `inventory/items` link path is unconfirmed). To go
  further needs an undocumented endpoint (likely `/documents`), a deploy to try it and possibly an Admin reconnect: not done, owner's call.
- **Add email (not in the plan, owner "yes do that"):** `addContactPerson`, `POST /contacts/contactpersons`, documented under
  `ZohoBooks.contacts.CREATE`. Replaced "Other emails" in To; Cc unchanged. Not yet tried on a real customer: read it back on the first add,
  and check the new person stays ticked in the email step (browser tests fake Zoho's `to_contacts`).
- **Zia:** History output says "Zia Utilities says Content can't be null": the Zia step's prompt field is empty or mapped wrongly. We send JSON
  `{quote, prompt}` in lowercase. The fix is in Flow.

Later still on 4 Nov (supersedes the brochure note above):
- **Upload works, undocumented:** `POST /documents` (multipart field `document`) answers `documents` as one object with `document_id`; `PUT /items/{id}` with
  that id on custom field 982417000023514003 attaches it and answers `custom_field_hash.cf_product_brochure` = the file name. Tested on Hot Water Bag
  Standard (982417000007512064, the owner's test item) and read back through the Books connector. `/items/{id}/documents` and `/items/{id}/attachment`
  answer "Invalid URL". `POST /documents` answered "not authorized" until the connection had **`ZohoBooks.fullaccess.all`**, the owner's choice after
  being told the risk; `QUOTE_SCOPES` is now that. A narrower scope may exist but isn't documented.
- **Item pictures:** `GET /items/{id}/images/{document}` returns a picture from the item's `documents` when `/items/{id}/image` has none (15 of 487 items).
- **Self Client:** a code only works with the Self Client that made it. The connection's is the owner's own, not the app's: `clientsToTry`.
- **Traps:** `.sr-only` inputs inside a scrolling table escape it and stretch the page unless their parent is `relative`. A shell chain ran the upload test
  after a failed push, against old code, leaving stray files: confirm the deploy before anything that writes.
- **Temporary, remove:** `cleanTestBrochures` and `cleanBrochureTests` once the stray `test-brochure.pdf` files are gone.

## Owner's side

| # | What | State |
|---|---|---|
| A | Zoho Flow "Quote email by Zia" is failing (Zoho emailed "failed 3 times in a row"). Send a screenshot of the failed step: Flow → History → newest run → the step with the red mark | **Waiting.** Not blocking anything below |
| B | quotations@thinkhealth.in as Books' primary email | Owner says done (4 Nov). Unverified, see step 1 |
| C | Check that invoices and payment reminders are meant to come from quotations@ too (primary may change those as well) | Raised 4 Nov, no answer yet |
| D | Zoho Mail filter in sales@: From contains `quotations@thinkhealth.in` → move to folder "Quotations via Books" (no code) | Owner said "yessir" (plan point 5, read as doing it); not confirmed done |
| E | Admin reconnects Zoho Books for quotations once, if step 8 needs more permission (Connect popup on the Quotations page) | Comes up at step 8 |
| F | Optional: delete `zia-secret.txt` from the Desktop; replace the secret if wanted (screenshots showed most of it) | Open |
| G | Check how many free Zia credits Flow gives | Never answered |

## Zoho Flow, when the screenshot arrives

Our side works up to the flow: on 3 Nov the email step showed "Zia is writing it…" (`ZIA_FLOW_URL` set, Flow took the
request, it answered 200) and `ZIA_FLOW_SECRET` on both addresses matches the owner's file. No answer ever reached
`/api/zia` (kv `zia:Quotation-24-002753` has no `answeredAt`).

| Failed step | Likely cause | Fix |
|---|---|---|
| Zia step | AI not enabled, no credits, Prompt not mapped | Enable AI; Prompt = Webhook → Prompt; if credits cost money, stop and tell the owner |
| Send Webhook, 401 | The key in its URL differs from Vercel's | Same string in both |
| Send Webhook, 400 | `text` or `quote` empty | `text` = Zia's output, `quote` = Webhook → Quote |
| Send Webhook, 404 | "Nobody asked Zia in the last hour": a rerun of an old task, or a manual test | Press Send to Zia in the email step instead |
| Nothing after Webhook | Wire comes from the red "On Error" dot | Connect from the bottom dot |

Flow facts: the webhook answers **410 while the flow is OFF**. Zoho switches a flow off after 20 failures in a row. Send
Webhook body = x-www-form-urlencoded (`quote`, `text`), because Zia's line breaks and quotes can break raw JSON; the route
takes both. **Never copy the webhook URL or its `zapikey` into a file, a commit or a reply.**

## Step 1 — Sender check, always-CC, signature per person (agreed)

- **Sender:** check before coding. `GET /estimates/{id}/email` answers `from_emails` (each with `email`, `selected`,
  `organization_contact_id`, `is_org_email_id`) and `from_address`; the app's route drops them. Read them with a
  temporary, uncommitted `_raw: j` on the `?email=` answer (`next build` + `next start -p 3001`, then revert), printing only
  the organisation's addresses. Use an id from a recent estimate that still exists: the two newest in `salesDocs` answered
  "Resource does not exist". On 3 Nov the list was the Gmail address (selected), sales@, accounts.team@, logistics@, hello@.
  - If quotations@ is selected: no sender code. Show "From: quotations@thinkhealth.in" in the email step.
  - If not: try a `from_address` field on `emailQuote` (unconfirmed for this call). If Books refuses it, the fallback is
    sending through Zoho Mail from a connected sales@. That's a bigger change, so **ask the owner first**.
  - The first real proof is a quote emailed to the owner's own address.
- **CC:** in `sendEmail` (`src/app/api/quotations/route.ts`) always add `sales@thinkhealth.in` and `sshah@thinkhealth.in`,
  no duplicates, counted in the 20-address limit. Show them as fixed chips in the Cc row of `EmailStep`; they can't be
  removed, others can be added.
- **Signature:** `SIGNATURE` in `src/lib/quoteEmails.ts` becomes a function of the person. Owner: "if ashish does it, then
  him, if pranjal does it then her, if sumit does it then his too".
  - First line = the signed-in member's full name (Ashish Dalal, Pranjal Nikalje, Sumit A Shah, Shikha Dixit, Nikita Shah).
  - "Proprietor" only for Sumit A Shah. Everything else stays, **including both contact lists. Owner, 4 Nov: both numbers
    (8007000884 and 8007700006) are right; don't "fix" them.**
  - Admin isn't really used ("admin doesnt do anything"); fall back to the quote's Sales person without building more.
  - The contact details on others' emails stay shared (they include sshah@) until the owner sends each person's details.
- **Tests:** CC merge and no-dupes; each signer's first line; Proprietor only for Sumit.

## Step 2 — Item table in every template (agreed)

- Columns: **Item name, Unit price, Quantity, GST, Total price**. In all 7 templates, right after the opening line. In Formal it
  replaces the bullet list (`p.list`).
- GST shows the rate ("18%"). Total price = quantity × unit price + GST. A line with unknown GST (`gst: null`) shows "—" and adds none.
- Last row: Zoho's grand total (`done.total`). If the lines differ from it by more than ₹1 (discount, shipping, adjustment), one extra
  row "Discount / shipping / adjustment" shows the difference, so the table adds up.
- Build: `QuoteEmailLine` gains `rate` and `gst` (filled in `QuotePopup`'s `compose`). Inline styles only, so mail clients keep them.
  `buildQuoteEmail` returns plain text today and `textToHtml` converts it; the table needs a placeholder paragraph or an HTML return.
  The chips, the `edited` confirm and the tests must keep working. Check the table in the message box in dark and light (the box
  forces text and background to the theme by CSS only; what's sent keeps its own HTML).
- **Zia:** its emails get the same table above the signature, so Zia never has to get the numbers right. The server's `GET ?zia=`
  appends the signature today and knows no lines; move the wrapping to the client's `fromZia` (it has `compose`), and update
  `tests/zia-route.test.ts`. Tell Zia not to write a table.

## Step 3 — Same trainer on the same date (Training board)

- `TrainerPicker` in `src/components/followups/CardModal.tsx` (around line 783): today `disabled={Boolean(other)}` and
  `on = selected.includes(t) && !other` make a busy trainer unpickable. Allow it. Keep the note under the picker, reworded as a
  warning ("Ashish is already on Tata Pune on this date"). It warns, it doesn't block.
- `busyTrainers` (`src/lib/pipeline.ts:345`) stays for the note. `/api/store` has no trainer rule, so no server change.
- Before changing: check the rest of the picker (external trainers) and every caller, since `ScheduleRows` is shared. The owner
  asked for the Training board; say so if the AedSmartx board changes with it.

## Step 4 — Overview date button

- Small button on Overview (`src/app/page.tsx`, `src/components/Kpis.tsx`): **This month, Last month, This quarter, Custom**. Starts on
  today's view. The choice is per person (localStorage `th.overview.range`, try/catch, a convenience only).
- Read HANDOFF §4 "Overview" first: its maths were checked on live data. Keep like-for-like comparison (owner: this month so far
  against the same days of last month).
- Targets are monthly: with a whole-month choice show them; for quarter or custom show the numbers without the target bar, and tell
  the owner. Use `DateFilter.tsx` if it fits.

## Step 5 — Average invoice KPI (Reports)

- A tile showing this month's average invoice against last month's, with ↑ or ↓ and the % change.
- `avgInvoice` already exists (`src/lib/analytics/model.ts:105`, used at `dashboards.ts:69`); use the tile comparison the Reports code
  already has rather than a new query.
- Default comparison: **same days of last month**, Overview's rule, since a part month against a whole month can mislead. The owner agreed
  to "last month's"; state which days the tile compares.
- Verify the number against Zoho Books (§11 #8: `list_invoices` `response_option: 3`).

## Step 6 — Items, under Quotations

- New section under Quotations with the same access (`canQuote`). **Active items only** (573 of 1,122 on 3 Nov).
- `GET /api/quotations?items=1` already answers id, name, group (identifier), rate, GST, unit, stock, service, onHand, category, image;
  `?item=<id>` gives the description. Reuse `Catalogue` and `ItemImage` in `src/components/Quotations.tsx`.
- Search, category filter, click an item for details, tick boxes on rows.
- **Most in demand first:** quote lines per item, last 12 months, from the Analytics copy's Quote Items (see `analyticsItems()` in
  `src/lib/salesSync.ts`; the item id there is **"Product ID"**, "Item ID" is the line id). Memoise per `za_state.refreshedAt`. Work out
  bytes × calls first (§11, database traffic).
- Fit 1728×958, phone, hidden scrollbars (see the UI preferences memory).

## Step 7 — Create a quotation from ticked items

- "Create quotation" on the selection → the existing `NewQuote` customer picker → `QuotePopup` with those lines filled in.
- `QuotePopup` sets lines at `Quotations.tsx:378`; add a starting-lines prop with `fresh: true` so it doesn't load their last quote or
  draft. Rates and GST come from the item; descriptions load as when picked (line 394).
- No Zoho write until the person saves, as today.

## Step 8 — Brochures: Added / Missing, and upload to Zoho Books

- **The trap: don't read every item one by one.** 573 items × one call each is a quarter of the day's Books limit (2,500; normal days use
  250–350). First check, read-only, whether the `/items` list already says if an item has an attachment. If not: read at most 30 a sync
  (like `LINES_BATCH`) and keep the answer in a small new collection; a brochure added directly in Books then shows up later.
- **Upload unconfirmed:** Zoho's docs for item attachments weren't found. Bills and invoices use `POST /<module>/{id}/attachment`, multipart;
  try that shape. One forum thread reports a success answer on another module with nothing attached, so **read the item back to confirm**.
  **Test on one item the owner names**, because it writes to real Zoho data. If Zoho has no such call, show Added / Missing only and tell the
  owner to upload in Books.
- **Permission:** `QUOTE_SCOPES` (`src/lib/quotations.ts:20`) has estimates and contacts only. Items may need another scope (possibly under
  `ZohoBooks.settings.*`; check), so Admin reconnects once, using the existing `ConnectBooks` popup.
- **Limits:** PDF only (check the `%PDF` header on the server), about 4 MB (Vercel takes about 4.5 MB per request; `EMAIL_MAX_BYTES` is 4 MB).
- **Screen:** Brochure column on Items: ✓ Added / Missing, filter to Missing, most in demand first so the most-asked items get done first, and
  "Add brochure" on the row.
- Same access as the Items page. Note who added it in the server log; there's no board card to log it on.

## Later, not asked for

Each person's own title, number and email in the signature (needs their details). Attaching a brochure to the quote email. Templates
editable on the page.
