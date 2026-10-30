export type Priority = "high" | "medium" | "low";

export type ZohoStatus = "draft" | "pending_approval" | "approved" | "sent" | "viewed" | "unpaid" | "overdue" | "partially_paid" | "paid" | "void";

/** One Training Services line item from a Zoho Books invoice (see spec: "one line item = one training"). */
export interface Training {
  id: string; // `${docType}:${lineItemId}`
  zohoDocType: "invoice" | "salesorder";
  zohoDocId: string;
  docNumber: string;
  customerId: string;
  customerName: string;
  trainingType: string; // display name derived from line_items[].name
  itemName?: string; // raw Zoho item name
  trainingDate: string; // YYYY-MM-DD, cf_training_date (fallback: invoice date)
  trainer: string; // cf_trainer_name
  participants: number; // line_items[].quantity
  amount: number; // line_items[].item_total, INR pre-tax
  status: ZohoStatus;
  dueDate?: string;
  certExpiry?: string; // cf_certificate_expiry
  leadSource?: string; // cf_lead_source
  zohoPriority?: Priority; // cf_priority, once added in Zoho
}

/** A quotation (estimate) or sales order (proforma) containing Training Services items. */
export interface PipelineDoc {
  id: string; // `${kind}:${docId}`
  kind: "estimate" | "salesorder";
  docId: string;
  docNumber: string;
  customerName: string;
  date: string; // document date (YYYY-MM-DD)
  trainingDate?: string; // cf_training_date, if the field exists on the document
  expiryDate?: string; // quotes only
  status: string; // Zoho status: draft, sent, accepted, open, partially_invoiced, ...
  trainingType: string;
  participants: number;
  amount: number; // training lines only, pre-tax INR
  zohoPriority?: Priority;
}

/**
 * A training as the boards show it: one per deal (its latest card), with every training day. Completed ones count in
 * the month of their last day.
 */
export interface BoardTraining {
  id: string; // the card on its board (pi:/quote:/invoice:/aed:)
  board: "training" | "aed";
  docNumber: string;
  /** The PI / invoice behind the training — on its card or merged into it (a payment card's invoice, an invoice's PI). */
  piNumber?: string;
  invoiceNumber?: string;
  customerName: string;
  alias?: string; // alias for certificates
  training: string; // training name(s)
  people: number; // No. of People (AedSmartx: 0 — not counted there)
  dates: string[]; // YYYY-MM-DD, in order; none when to be decided
  time?: string; // AedSmartx: HH:mm
  trainers: string[];
  status: "scheduled" | "postponed" | "tbd" | "completed";
  scheduledBy?: string; // who set the current date (calendar: "your" trainings, reminders)
}

export interface TrainingsResponse {
  source: "zoho" | "mock";
  syncedAt: string;
  trainings: Training[];
  /** Quotes awaiting reply and booked (not yet invoiced) sales orders. */
  pipeline: PipelineDoc[];
  /** The Training board's trainings (one per deal, however many days) — what the targets, calendar and ticker count. */
  board?: BoardTraining[];
  /** AedSmartx trainings (Priyanka's board) — not part of the team targets. */
  aedBoard?: BoardTraining[];
  /** AedSmartx invoices still without a training date (and not "not required"). */
  aedWaiting?: number;
  /** Last fiscal year's training revenue, one row per invoice line (training date, pre-tax) — the revenue forecast's base. */
  lastYear?: { date: string; amount: number }[];
  orgId?: string;
  error?: string;
}

/** Calendar entries besides trainings (owner, 19 Oct): meetings and events, each with a time (events may be all day). */
export type EntryType = "meeting" | "event";

/**
 * A meeting or event on the calendar. Each member sees their own — the ones they made or are in (`people`); Admin,
 * Shikha, Sumit and Ashish see everyone's. The server stamps `createdBy` and keeps others' entries out of reach.
 */
export interface CalendarEntry {
  id: string;
  type: EntryType;
  title: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string;
  allDay: boolean;
  people?: string[]; // team members in it (names) — they see it and get its reminder
  everyone?: boolean; // for the whole team: everyone sees it and gets its reminder
  createdBy?: string; // member name, set by the server
  priority?: Priority; // before 19 Oct only — the calendar orders by date and time now
  description?: string;
  linkedCustomer?: string;
  reminderMinutes?: number | null;
  createdAt: string;
  demo?: boolean; // sample data, removed once Zoho is live
}

export type FollowUpStatus = "pending" | "in_progress" | "snoozed" | "overdue" | "completed" | "cancelled";
export type FollowUpType = "call" | "email" | "whatsapp" | "meeting" | "site_visit";
export type FollowUpSource = "manual" | "invoice_overdue" | "training_delivered" | "cert_expiry" | "estimate_sent" | "booking_unscheduled" | "dormant_client";

export interface FollowUpActivity {
  id: string;
  kind: "note" | "created" | "completed" | "snoozed" | "rescheduled" | "status";
  body: string;
  at: string;
}

export interface FollowUp {
  id: string;
  customerName: string;
  subject: string;
  type: FollowUpType;
  dueAt: string; // ISO
  owner: string;
  priority: Priority;
  /** Stored status. "overdue" is never stored; it is derived from dueAt (see effectiveStatus). */
  status: Exclude<FollowUpStatus, "overdue">;
  snoozedUntil?: string;
  source: FollowUpSource;
  triggerKey?: string; // unique per auto-created follow-up, prevents duplicates
  linkedDoc?: string;
  outcome?: string;
  notes?: string;
  completedAt?: string;
  createdAt: string;
  activities: FollowUpActivity[];
  demo?: boolean;
}

/* ---------------- Follow-ups pipeline ---------------- */

/** An active Zoho Books customer — every customer is a lead. */
export interface ZohoLead {
  contactId: string;
  name: string;
  email?: string;
  phone?: string;
  mobile?: string;
  createdAt: string; // ISO, when the customer was created in Zoho
  lastModified: string;
  type?: string; // cf_type: New Customer / New Reseller / Old Reseller
  sector?: string; // cf_sector
}

/** A Zoho quotation (estimate) containing at least one of the tracked training items. */
export interface ZohoQuote {
  estimateId: string;
  number: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  status: string;
  customerId: string;
  customerName: string;
  salesperson?: string;
  contacts: { name?: string; email?: string; phone?: string; mobile?: string }[];
  items: { name: string; qty: number }[]; // tracked training items only
  total?: number; // incl. GST — the Sales board shows it (salesSync.ts)
}

/** A Zoho sales order — this org's Performa Invoice (numbered Performa-…) — with a tracked training item. */
export interface ZohoPI {
  salesorderId: string;
  number: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  status: string;
  customerId: string;
  customerName: string;
  salesperson?: string;
  reference?: string; // usually the quotation number it came from
  contacts: { name?: string; email?: string; phone?: string; mobile?: string }[];
  items: { name: string; qty: number }[];
  total?: number; // incl. GST — the Sales board shows it (salesSync.ts)
}

/** A Zoho invoice with a tracked training item; its reference usually cites the PI it came from. */
export interface ZohoInvoice {
  invoiceId: string;
  number: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  status: string;
  customerId: string;
  customerName: string;
  salesperson?: string;
  reference?: string; // usually "Performa-25-…"
  dueDate?: string; // YYYY-MM-DD, set when the invoice is raised
  shipTo?: string; // the invoice's ship-to address on one line (Logistics board)
  shipPhone?: string; // the invoice's ship-to phone
  total?: number;
  balance?: number; // still to be paid
  lastModified: string;
  contacts: { name?: string; email?: string; phone?: string; mobile?: string }[];
  items: { name: string; qty: number }[];
}

/** One line of an AED invoice (the AED itself, or anything sold with it). */
export interface AedLine {
  name: string;
  qty: number;
  description: string;
}

/** AedSmartx board: an invoice with an item whose Item Identifier is "All AEDs". */
export interface AedInvoice extends ZohoInvoice {
  shipPhone?: string; // the invoice's ship-to phone — preferred contact number
  shipAttention?: string;
  aedLines: AedLine[];
  otherLines: AedLine[];
}

export interface AedResponse {
  syncedAt: string;
  windowStart: string;
  invoices: AedInvoice[];
  error?: string;
}

/** A Zoho customer payment recorded against one of the tracked invoices. */
export interface ZohoPayment {
  paymentId: string;
  number: string; // Payment #
  date: string; // YYYY-MM-DD
  createdAt: string;
  amount: number;
  tdsWithheld?: number; // TDS the customer deducted on this payment — Zoho counts it as received (amount + TDS settles the invoice)
  mode?: string;
  reference?: string; // Reference# (usually the bank / UTR reference)
  invoiceId: string; // the invoice it's applied to
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  items: { name: string; qty: number }[]; // from the invoice, for the Training section
}

export interface PipelineResponse {
  source: "zoho" | "mock";
  syncedAt: string;
  /** Quotes/PIs are synced from this date (start of the previous fiscal year). */
  windowStart: string;
  leads: ZohoLead[];
  quotes: ZohoQuote[];
  pis: ZohoPI[];
  invoices: ZohoInvoice[];
  payments: ZohoPayment[];
  typeOptions: string[];
  sectorOptions: string[];
  orgId?: string;
  error?: string;
}

/** Someone using the Follow-ups board; every change is recorded under their name. */
export interface Member {
  id: string;
  name: string;
  createdAt: string;
}

export type Phase = "Potential" | "Lead" | "Quote" | "PI" | "Invoice" | "Payment" | "Ship-to";

export type CardEventKind =
  | "set_name"
  | "set_type"
  | "set_sector"
  | "add_alias"
  | "remove_alias"
  | "add_email"
  | "remove_email"
  | "add_phone"
  | "remove_phone"
  | "delete"
  | "merge"
  | "set_training_date" // value: YYYY-MM-DD, several days comma-separated ("2026-10-05,2026-10-06"), or "TBD"; the first date schedules, later ones postpone
  | "complete_training" // moves the card to Training completed
  // Until 15 Oct: one value per customer name (ref = Zoho contact id), the latest on every card of that name. No longer
  // written — a training without its own location / email still shows the last of these (what it printed before).
  | "set_cert_alias" // value = the alias printed as the location ("course conducted at"), "" = the customer's own name; before = previous
  | "set_concerned_email" // value = the concerned person's email (participant list, gratitude emails), "" = not set; before = previous
  // Per customer name (ref = Zoho contact id), optional, any board: only a person's name — greets them in the gratitude email.
  | "set_concerned_name" // value = the name, "" = not set; before = previous
  // Per training (owner, 15 Oct): set with the date (set_training_date `location` / `email`), changed later with these —
  // on the training's card, or on its Fulfillment card. ref = Zoho contact id (lists the customer's past locations / emails).
  | "set_cert_location" // value = the certificate location name ("course conducted at"), "" = the customer's own name; before = previous
  | "set_training_email" // value = the concerned person's email for this training (gratitude email, List of Participants); before
  | "set_training_phone" // (owner, 20 Oct) value = the concerned person's contact number for this training (reminders); before
  | "zoho_change" // recorded automatically when a Zoho document disappears and a card moves because of it
  | "add_potential" // creates a Potential training card: cardIds [potential:<id>], ref = Zoho contact id, value = expected month (YYYY-MM) or none
  | "set_potential_date" // value: new expected month (YYYY-MM) or "" for not set; before: previous
  | "set_not_required" // AedSmartx board: the invoice needs no training — card moves to Training not required
  | "set_reseller" // AedSmartx board: ref = Zoho contact id; all that customer's AED invoices need no training
  | "set_resale" // AedSmartx board: this one invoice was bought for resale — needs no training
  | "set_delivered" // AedSmartx board: the AED has been delivered (marked by Arti) — ready for scheduling
  | "add_note" // a free-text note on the card (value = the note); removing it = reverting the event
  | "set_fulfillment" // Fulfillment board (Shreya): cardIds [fulfil:<pi/quote card id>], value = stage (generated / logistics; older: hold / received)
  | "set_wip" // Fulfillment board (before 10 Oct 2026), List Received: value "on" = Work in progress, "off" = not
  | "set_cert_status" // Fulfillment board, Certificates Generated: value "process" (In process) or "hold" (On hold)
  | "fulfil_mail_opened" // Fulfillment board: the reply was opened in Zoho Mail from the card — clears its star
  // Written by the server only, never reverted (they happened outside the dashboard):
  | "fulfil_email" // the gratitude email sent from Zoho Mail (learn@) — value = to, subject, messageId
  | "fulfil_reply" // a reply to it found in the mailbox — value = from, subject, messageId, folderId, at = when it arrived
  | "fulfil_certs" // participants added to the master sheet — value = how many, certs = the rows
  | "logi_hide" // Logistics board, AED Delivered Status: hides the AED card (cardIds [aed:<invoice id>]); Unhide = revert it
  | "logi_merge" // Logistics board: cardIds [logi:<pi/quote card id>, logipay:<payment card id>] — Sent to Logistics + its fully paid invoice's payment(s)
  | "set_logistics" // Logistics board: value = step (packages, pack_process, pack_hold, shipments, ship_dispatched, ship_hold, expected:YYYY-MM-DD, received)
  // AedSmartx board, Contacted (Priyanka). Contacts and emails belong to the customer name (ref = Zoho contact id) and
  // show only on the AedSmartx board; calls and emails sent are counted per invoice card.
  | "aed_in_process" // cardIds [aed:<invoice id>]: In process — the card moves to Contacted
  | "aed_add_phone" // cardIds [aedcustomer:<contact id>, aed:<id>], ref = contact id: value = number, person = whose
  | "aed_remove_phone" // same ids: value = a non-concerned person's number, hidden on the AedSmartx board
  | "aed_set_email" // same ids: value = the email to write to, before = the previous one
  | "aed_remove_email" // same ids: value = an email hidden on the AedSmartx board
  | "aed_confirm_email" // cardIds [aed:<id>]: value = the email, checked as the right one for this invoice
  | "aed_call" // cardIds [aed:<id>, aedcustomer:<contact id>], ref = contact id: a call to value (number), person = who
  | "aed_email" // written by the server only, never reverted: an email sent from Zoho Mail — value = to, step = template, subject
  | "aed_email_marked" // cardIds [aed:<id>]: an email she sent from Zoho Mail herself, counted with the dashboard's (owner, 28 Oct 2026) — value = to; Undo = revert
  | "aed_reply" // server only: a reply to it found in hello@'s Inbox — value = from, subject, messageId, folderId, at = when it arrived
  | "aed_mail_opened" // cardIds [aed:<id>]: the reply was opened in Zoho Mail from the card — clears its star
  // Training reminders (server only, never reverted — reminderPlan.ts): emailed from learn@ to the trainers.
  | "training_reminder" // value = reminderKey(dates, day), trainers = who it went to, subject, messageId
  | "training_postponed_mail" // value = the id of the set_training_date entry that postponed it; trainers, subject, messageId
  | "training_whatsapp"; // WhatsApp (Anantya), one per person: value = whatsappKey(kind, reminderKey | entry id, person), trainers = [them], subject = template, messageId

/**
 * One user change to a pipeline card. Cards are Zoho data plus the replay of every
 * non-reverted event, so any change can be undone by marking it reverted.
 */
export interface CardEvent {
  id: string;
  cardIds: string[]; // merge: [fromCardId, intoCardId] — lead → quote → PI
  kind: CardEventKind;
  value?: string; // merge: label of the card merged into
  before?: string; // previous value, for the change log; merge: label of the card merged from
  ref?: string; // zoho_change: the merge event it reports on
  phase?: Phase; // where an email/phone was added
  trainers?: string[]; // set_training_date: who gives the training on those dates (our trainers, then external names as typed)
  // set_training_date "change": "Change date" — the date was corrected (earlier or later), not postponed.
  // set_fulfillment "done": Mark as Completed — done before the dashboard (no email, no certificates here), on to Logistics.
  // set_training_date / complete_training "invoice": completed on the invoice date — a training from before the dashboard.
  // set_fulfillment "list": certificates made from Training Completed with the list already at hand — no gratitude email.
  // merge "all": one of a Merge all flagged (Sales board, owner 30 Oct) — counted once in the tracker's Work done.
  mode?: "change" | "done" | "invoice" | "list" | "all";
  underName?: string; // set_training_date (before set_cert_alias): the training is under this alias (none = the customer's own name)
  location?: string; // set_training_date (since 15 Oct, required with a date): the certificate location name, "" = the customer's own name
  email?: string; // set_training_date (since 15 Oct, required with a date): the concerned person's email for this training
  phone?: string; // set_training_date (since 20 Oct): the concerned person's contact number for this training
  people?: number; // set_training_date (since 21 Oct): how many people will be trained, as checked when scheduling (Zoho's quantity can be wrong)
  person?: string; // aed_add_phone / aed_call: whose number it is
  step?: number; // aed_email: which template went out (1 first contact, 2 1st reminder, 3 2nd reminder — and again after)
  messageId?: string; // aed_email: Zoho Mail's id for the sent email (the reminders reply to the first one)
  threaded?: boolean; // aed_email: sent as a reply in the same thread
  subject?: string; // fulfil_email / fulfil_reply: the email's subject
  folderId?: string; // fulfil_reply / aed_reply: Zoho Mail folder it sits in (to read it)
  certs?: CertRow[]; // fulfil_certs: the rows added to the master sheet
  design?: string; // fulfil_certs: which certificate design (certDesigns id)
  at: string;
  by: string;
  revertedAt?: string;
  revertedBy?: string;
}

/** One certificate as written to the master sheet (and printed). */
export interface CertRow {
  serial: number;
  certNo: string; // FAT-OD/<dd-mm-yyyy>/<serial>
  name: string;
  location: string; // "course conducted at": the alias for certificates, or the customer's name
  course: string;
  date: string; // training date, YYYY-MM-DD
}

export interface Announcement {
  id: string;
  text: string;
  priority: Priority;
  startsAt: string;
  endsAt: string;
  demo?: boolean;
}

export interface TickerItem {
  id: string;
  priority: Priority;
  label: string;
  text: string;
  href: string;
  sortKey: number;
  /** Shown only to members with this board (training-board items: Training; AedSmartx trainings: AedSmartx). */
  board?: "training" | "aed";
}

