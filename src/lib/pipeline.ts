import type { AedInvoice, CardEvent, Phase, ZohoInvoice, ZohoLead, ZohoPayment, ZohoPI, ZohoQuote } from "./types";
import { fmtDate } from "./dates";
import { type AedDetails, type AedExtra, aedExtras, parseAedLine } from "./aedParse";

const fmtDay = (ymd: string) => fmtDate(ymd, { day: "numeric", month: "short", year: "numeric" });

// A card = Zoho data + every non-reverted CardEvent replayed in order. Nothing Zoho sends is
// overwritten, so reverting a change (or a merge) is just marking its event reverted.
// Merges run forward only: Lead → Quote → PI → (training) → Invoice → Payment received. A lead can go straight into a PI,
// and a quote that skipped its PI can go straight into an invoice.

// "potential" is a customer added by hand to Potential training: like a lead (same Zoho customer), it merges into
// the customer's quotation (or a PI citing no quotation) once one syncs from Zoho.
export type CardKind = "potential" | "lead" | "quote" | "pi" | "invoice" | "payment";
export const STAGE_ORDER: CardKind[] = ["potential", "lead", "quote", "pi", "invoice", "payment"];
export const STAGE_RANK: Record<CardKind, number> = { potential: 0, lead: 0, quote: 1, pi: 2, invoice: 3, payment: 4 };
export const KIND_LABEL: Record<CardKind, string> = { potential: "Potential training", lead: "Lead", quote: "Quotation", pi: "Performa Invoice", invoice: "Invoice", payment: "Payment Received" };
const KIND_PHASE: Record<CardKind, Phase> = { potential: "Potential", lead: "Lead", quote: "Quote", pi: "PI", invoice: "Invoice", payment: "Payment" };
/** Cards that stand for the customer rather than a Zoho document. */
export const isCustomerCard = (k: CardKind) => k === "lead" || k === "potential";
export const phaseOf = (k: CardKind): Phase => KIND_PHASE[k];

export interface ContactEntry {
  value: string;
  phases: Phase[];
  at: string; // newest first
}

/** Green = scheduled, yellow = postponed, red = to be decided. */
export type ScheduleStatus = "scheduled" | "postponed" | "tbd";
export interface TrainingSchedule {
  status: ScheduleStatus;
  date?: string; // first training day, YYYY-MM-DD; none when TBD
  dates: string[]; // every training day, in order — one, a range, or scattered days; none when TBD
  trainers: string[]; // who gives it (none when TBD)
  at: string;
  by: string;
  completed?: { at: string; by: string }; // "Training completed" pressed
}

export interface CardView {
  id: string;
  kind: CardKind;
  customerId: string; // Zoho contact id — how the same client is recognised across columns
  name: string;
  aliases: string[];
  emails: ContactEntry[];
  phones: ContactEntry[];
  type?: string;
  sector?: string;
  customerSince?: string;
  salespeople: { phase: string; name: string }[];
  lead?: ZohoLead;
  /** Potential training: when the training might happen (month, YYYY-MM) and who added the card. */
  potential?: { expected?: string; addedAt: string; addedBy: string };
  quote?: ZohoQuote;
  pi?: ZohoPI;
  invoice?: ZohoInvoice;
  payment?: ZohoPayment;
  /** Payments: the invoice behind it — merged in, or the one it is applied to in Zoho. */
  linkedInvoice?: ZohoInvoice;
  /** Quotation behind this card: merged in, or the one its PI/reference cites. */
  linkedQuote?: ZohoQuote;
  /** Invoices: the PI behind it — merged in, or the one its reference cites. */
  linkedPI?: ZohoPI;
  /** Invoices/payments not flagged yet: why (e.g. its PI's training isn't marked completed). */
  waitingOn?: string;
  training: { name: string; qty: number }[];
  peopleLabel: string;
  docNumber?: string;
  docDate?: string;
  mergedFrom: string[]; // cards merged directly into this one
  mergedInto?: string;
  deleted: boolean;
  flaggedWith: string[]; // same client, not merged yet, in another column
  historyIds: string[]; // this card plus everything merged into it, at any depth
  search: string;
  /** Quotes/PIs: training date once set — the card then lives in Training Scheduled (or Completed). */
  schedule?: TrainingSchedule;
  /** Quotes/PIs with nothing left to merge (no flags) can get a training date. */
  canSchedule: boolean;
  /** PI merged and ready, but no date yet: offer to schedule when opened. */
  readyToSchedule: boolean;
  /** A quotation scheduled directly (or an invoice built on one) — the Performa Invoice stage was skipped. */
  piSkipped: boolean;
  /** A quotation that no PI in Zoho references yet. */
  piMissing: boolean;
  /** A quotation declined (rejected) in Zoho Books — the deal is lost; it sits in Deal lost for good. */
  lost: boolean;
  /** AedSmartx board: marked "Training not required" (its deal-lost column) — itself, or because the customer is a reseller. */
  notRequired?: boolean;
  /** AedSmartx board: the customer was marked as a reseller (all their AED invoices need no training). */
  reseller?: boolean;
  /** AedSmartx board: this invoice was marked as bought for resale (needs no training). */
  resale?: boolean;
  /** AedSmartx board: the AED was delivered (who marked it, when) — the card is ready for scheduling. */
  delivered?: { at: string; by: string };
  /** Notes typed on the card, newest first. */
  notes?: { id: string; text: string; by: string; at: string }[];
  /** AedSmartx board: what the invoice's AED lines say (model, serials, expiries) and the extras sold with them. */
  aed?: { lines: AedDetails[]; extras: AedExtra[] };
}

/** A set_training_date value: one day, several days ("2026-10-05,2026-10-06,2026-10-09"), or TBD. */
export const trainingDays = (v?: string): string[] => (!v || v === "TBD" ? [] : v.split(",").filter(Boolean));
export const daysValue = (days: string[]) => [...new Set(days)].sort().join(",");

/** A new date only counts as postponed when it replaces a date; after TBD (or first time) it's scheduling. */
function scheduleOf(events: CardEvent[]): TrainingSchedule | undefined {
  let s: TrainingSchedule | undefined;
  for (const e of events) {
    if (e.kind === "complete_training") {
      // Step by step: training is completed on the PI, never on a quotation that skipped it.
      if (s?.date && !completionNotApplied(e)) s = { ...s, completed: { at: e.at, by: e.by } };
      continue;
    }
    if (e.kind !== "set_training_date" || !e.value) continue;
    if (e.value === "TBD") s = { status: "tbd", dates: [], trainers: [], at: e.at, by: e.by };
    else if (s?.dates.length && s.dates.join(",") === e.value) s = { ...s, trainers: e.trainers ?? s.trainers, at: e.at, by: e.by }; // same dates: trainers changed
    else {
      const dates = trainingDays(e.value);
      s = { status: s && s.status !== "tbd" ? "postponed" : "scheduled", date: dates[0], dates, trainers: e.trainers ?? [], at: e.at, by: e.by };
    }
  }
  return s;
}

/** "Training completed" pressed on a quotation (before this was locked): ignored until there's a PI. */
export function completionNotApplied(e: CardEvent): boolean {
  return e.kind === "complete_training" && !e.revertedAt && e.cardIds[0]?.startsWith("quote:");
}

/** Invoice payment status, as Zoho Books shows it: red overdue, blue due, green paid. */
export type DueTone = "overdue" | "due" | "paid";
export interface DueStatus { tone: DueTone; label: string; partlyPaid?: boolean }
export function dueStatus(inv?: ZohoInvoice, today = new Date().toLocaleDateString("en-CA")): DueStatus | undefined {
  if (!inv) return undefined;
  if (inv.status === "paid" || (inv.balance !== undefined && inv.balance <= 0 && (inv.total ?? 0) > 0)) return { tone: "paid", label: "Paid" };
  if (!inv.dueDate) return undefined;
  const days = Math.round((Date.parse(inv.dueDate) - Date.parse(today)) / 86_400_000);
  const partlyPaid = inv.status === "partially_paid";
  const n = (d: number) => `${d} day${d === 1 ? "" : "s"}`;
  if (days < 0) return { tone: "overdue", label: `Overdue by ${n(-days)}`, partlyPaid };
  return { tone: "due", label: days === 0 ? "Due today" : `Due in ${n(days)}`, partlyPaid };
}

/** The payment status shown on invoice and payment cards (a payment is paid unless its invoice still has a balance). */
export function cardDue(c: CardView): DueStatus | undefined {
  if (c.kind === "invoice") return dueStatus(c.invoice);
  if (c.kind === "payment") return dueStatus(c.linkedInvoice) ?? { tone: "paid", label: "Paid" };
  return undefined;
}

/** People who give the trainings. Several can run one training; each runs at most one training a day. */
export const TRAINERS = ["Shikha Dixit", "Ashish Dalal", "Sumit A Shah"];
const isOwnTrainer = (name: string) => TRAINERS.some((t) => t.toLowerCase() === name.trim().toLowerCase());

/** Our trainers first (in the usual order), then external trainers as typed. */
export const orderTrainers = (names: string[]) => [...TRAINERS.filter((t) => names.includes(t)), ...names.filter((t) => !TRAINERS.includes(t))];

/** External trainers named on any training before, most recently used first — offered as suggestions. */
export function externalTrainers(events: CardEvent[]): string[] {
  const seen = new Map<string, string>();
  for (const e of [...events].sort((a, b) => b.at.localeCompare(a.at))) {
    if (e.kind !== "set_training_date") continue;
    for (const t of e.trainers ?? []) {
      const key = t.trim().toLowerCase();
      if (key && !isOwnTrainer(t) && !seen.has(key)) seen.set(key, t.trim());
    }
  }
  return [...seen.values()];
}

/** Trainers already booked on any of `dates` by another live training, with the card that booked them. */
export function busyTrainers(dates: string[], cards: Map<string, CardView>, selfId: string): Map<string, CardView> {
  const busy = new Map<string, CardView>();
  const want = new Set(dates);
  if (!want.size) return busy;
  for (const c of cards.values()) {
    if (c.id === selfId || c.mergedInto || c.deleted || c.lost || !c.schedule?.dates.some((d) => want.has(d))) continue;
    for (const t of c.schedule.trainers) if (!busy.has(t)) busy.set(t, c);
  }
  return busy;
}

export const leadCardId = (contactId: string) => `lead:${contactId}`;
export const potentialCardId = (id: string) => `potential:${id}`;
/** "2026-11" → "Nov 2026". */
/** Potential training's expected time: a month ("2026-11" → "Nov 2026") or an exact date ("2026-11-05" → "5 Nov 2026"). */
export const fmtMonth = (v?: string) =>
  !v ? "" : v.length === 10 ? fmtDate(v, { day: "numeric", month: "short", year: "numeric" }) : fmtDate(`${v}-01`, { month: "short", year: "numeric" });
export const quoteCardId = (estimateId: string) => `quote:${estimateId}`;
export const piCardId = (salesorderId: string) => `pi:${salesorderId}`;
export const invoiceCardId = (invoiceId: string) => `invoice:${invoiceId}`;
export const paymentCardId = (paymentId: string) => `payment:${paymentId}`;
export const kindOfId = (id: string): CardKind => id.split(":")[0] as CardKind;

/** The quotation number a PI's Zoho reference cites ("Quotation-24-002530"), or undefined. */
export function refQuoteNumber(p?: ZohoPI): string | undefined {
  const ref = p?.reference?.trim();
  if (!ref) return undefined;
  return ref.match(/Quotation-[\w-]+/i)?.[0] ?? ref;
}

/** The PI number an invoice's Zoho reference cites ("Performa-25-1056"), or undefined. */
export function refPINumber(inv?: ZohoInvoice): string | undefined {
  return inv?.reference?.match(/Performa-[\w-]+/i)?.[0];
}

export const normEmail = (v: string) => v.trim().toLowerCase();
/** Compare numbers by their last 10 digits so "+91 98765 43210" and "9876543210" match. */
export const normPhone = (v: string) => v.replace(/\D/g, "").slice(-10);

type Draft = {
  name: string;
  aliases: string[];
  emails: Map<string, ContactEntry>;
  phones: Map<string, ContactEntry>;
  type?: string;
  sector?: string;
};

function put(map: Map<string, ContactEntry>, key: string, entry: ContactEntry) {
  if (!key) return;
  const cur = map.get(key);
  if (!cur) return void map.set(key, { ...entry, phases: [...entry.phases] });
  for (const p of entry.phases) if (!cur.phases.includes(p)) cur.phases.push(p);
  if (entry.at > cur.at) cur.at = entry.at;
}

function apply(d: Draft, events: CardEvent[]) {
  for (const e of events) {
    const v = e.value ?? "";
    switch (e.kind) {
      case "set_name": if (v.trim()) d.name = v.trim(); break;
      case "set_type": d.type = v || undefined; break;
      case "set_sector": d.sector = v || undefined; break;
      case "add_alias": if (v && !d.aliases.includes(v)) d.aliases.push(v); break;
      case "remove_alias": d.aliases = d.aliases.filter((a) => a !== v); break;
      case "add_email": put(d.emails, normEmail(v), { value: v.trim(), phases: [e.phase ?? "Lead"], at: e.at }); break;
      case "remove_email": d.emails.delete(normEmail(v)); break;
      case "add_phone": put(d.phones, normPhone(v), { value: v.trim(), phases: [e.phase ?? "Lead"], at: e.at }); break;
      case "remove_phone": d.phones.delete(normPhone(v)); break;
    }
  }
}

/** The merged-in card carries the client's identity (name as in Leads), aliases and contacts forward. */
function absorb(into: Draft, from: Draft) {
  into.name = from.name;
  for (const a of from.aliases) if (!into.aliases.includes(a)) into.aliases.push(a);
  for (const [k, v] of from.emails) put(into.emails, k, v);
  for (const [k, v] of from.phones) put(into.phones, k, v);
  into.type = from.type ?? into.type;
  into.sector = from.sector ?? into.sector;
}

const sortEntries = (m: Map<string, ContactEntry>) => [...m.values()].sort((a, b) => b.at.localeCompare(a.at));

function leadDraft(l: ZohoLead): Draft {
  const d: Draft = { name: l.name, aliases: [], emails: new Map(), phones: new Map(), type: l.type, sector: l.sector };
  if (l.email) put(d.emails, normEmail(l.email), { value: l.email, phases: ["Lead"], at: l.createdAt });
  for (const p of [l.mobile, l.phone]) if (p) put(d.phones, normPhone(p), { value: p, phases: ["Lead"], at: l.createdAt });
  return d;
}

function docDraft(doc: ZohoQuote | ZohoPI | ZohoInvoice, phase: Phase, contact?: ZohoLead): Draft {
  const d: Draft = { name: doc.customerName, aliases: [], emails: new Map(), phones: new Map(), type: contact?.type, sector: contact?.sector };
  for (const c of doc.contacts) {
    if (c.email) put(d.emails, normEmail(c.email), { value: c.email, phases: [phase], at: doc.createdAt });
    for (const p of [c.mobile, c.phone]) if (p) put(d.phones, normPhone(p), { value: p, phases: [phase], at: doc.createdAt });
  }
  return d;
}

/** "Quotation & PI Sent By Ashish Dalal, Invoice Sent By Pranjal Nikalje" — consecutive phases by the same person are grouped. */
export function salespersonLabel(people: { phase: string; name: string }[]): string {
  const groups: { phases: string[]; name: string }[] = [];
  for (const p of people) {
    const last = groups[groups.length - 1];
    if (last && last.name === p.name) last.phases.push(p.phase);
    else groups.push({ phases: [p.phase], name: p.name });
  }
  return groups.map((g) => `${g.phases.join(" & ")} Sent By ${g.name}`).join(", ");
}

/** Merge events that still apply: not reverted, and both documents still exist in Zoho. */
function liveMerges(active: CardEvent[], exists: Set<string>) {
  const into = new Map<string, string>();
  const at = new Map<string, string>(); // from → when it was merged
  for (const e of active) {
    if (e.kind !== "merge") continue;
    const [from, to] = e.cardIds;
    if (exists.has(from) && exists.has(to) && STAGE_RANK[kindOfId(from)] < STAGE_RANK[kindOfId(to)]) (into.set(from, to), at.set(from, e.at));
  }
  // Step by step: an invoice joins its payment only if its completed training was merged into it first.
  for (const [from, to] of [...into]) {
    if (kindOfId(to) !== "payment") continue;
    const ready = [...into].some(([f, t]) => t === from && kindOfId(f) !== "lead" && at.get(f)! < at.get(from)!);
    if (!ready) into.delete(from);
  }
  return into;
}

/** An Invoice → Payment merge the board ignores because the invoice didn't hold its completed training yet. */
export function mergeNotApplied(e: CardEvent, cards: Map<string, CardView>): boolean {
  if (e.kind !== "merge" || e.revertedAt || kindOfId(e.cardIds[1]) !== "payment") return false;
  const from = cards.get(e.cardIds[0]);
  return Boolean(from && cards.has(e.cardIds[1]) && from.mergedInto !== e.cardIds[1]);
}

export function buildBoard(leads: ZohoLead[], quotes: ZohoQuote[], pis: ZohoPI[], invoices: ZohoInvoice[], payments: ZohoPayment[], events: CardEvent[]) {
  const active = events.filter((e) => !e.revertedAt).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const byCard = new Map<string, CardEvent[]>();
  const deletedDocs = new Set<string>();
  for (const e of active) {
    // A delete hides the card itself and documents merged into it; leads (and potential cards merged in) come back.
    if (e.kind === "delete") e.cardIds.filter((id, i) => kindOfId(id) !== "lead" && (kindOfId(id) !== "potential" || i === 0)).forEach((id) => deletedDocs.add(id));
    else if (e.kind !== "merge" && e.kind !== "zoho_change") for (const id of e.cardIds) byCard.set(id, [...(byCard.get(id) ?? []), e]);
  }

  const contacts = new Map(leads.map((l) => [l.contactId, l]));
  // Potential training cards, created by hand; they exist while their Zoho customer does.
  const potentials = active
    .filter((e) => e.kind === "add_potential" && e.ref && contacts.has(e.ref))
    .map((e) => ({ id: e.cardIds[0], contactId: e.ref!, addedAt: e.at, addedBy: e.by }));
  const quotesByNumber = new Map(quotes.map((q) => [q.number, q]));
  const pisByRef = new Set(pis.map(refQuoteNumber).filter(Boolean));
  const pisByNumber = new Map(pis.map((p) => [p.number, p]));
  const exists = new Set([
    ...leads.map((l) => leadCardId(l.contactId)), ...quotes.map((q) => quoteCardId(q.estimateId)),
    ...pis.map((p) => piCardId(p.salesorderId)), ...invoices.map((i) => invoiceCardId(i.invoiceId)),
    ...payments.map((p) => paymentCardId(p.paymentId)), ...potentials.map((p) => p.id),
  ]);
  const liveInto = liveMerges(active, exists);

  // Deleting a quote/PI sends the customer back to Leads: that card and every document merged into
  // it are hidden, and the merges into them stop applying, so any lead they held reappears.
  const sources = new Map<string, string[]>();
  for (const [from, to] of liveInto) sources.set(to, [...(sources.get(to) ?? []), from]);
  const deleted = new Set<string>();
  const hide = (id: string, own = true) => {
    if (kindOfId(id) === "lead" || (kindOfId(id) === "potential" && !own) || deleted.has(id)) return;
    deleted.add(id);
    (sources.get(id) ?? []).forEach((s) => hide(s, false));
  };
  deletedDocs.forEach((id) => hide(id));
  const mergedInto = new Map([...liveInto].filter(([, to]) => !deleted.has(to)));
  const mergedFrom = new Map<string, string[]>();
  for (const [from, to] of mergedInto) mergedFrom.set(to, [...(mergedFrom.get(to) ?? []), from]);

  const cards = new Map<string, CardView>();
  const drafts = new Map<string, Draft>();

  // Stage by stage, so a PI can pull in a quote that already absorbed its lead.
  const build = (id: string, kind: CardKind, draft: Draft, extra: Partial<CardView> & { customerId: string }) => {
    const from = mergedFrom.get(id) ?? [];
    for (const src of from) {
      const sd = drafts.get(src);
      if (sd) absorb(draft, sd);
    }
    apply(draft, byCard.get(id) ?? []);
    drafts.set(id, draft);
    const emails = sortEntries(draft.emails);
    const phones = sortEntries(draft.phones);
    const card: CardView = {
      id, kind, name: draft.name, aliases: draft.aliases, emails, phones, type: draft.type, sector: draft.sector,
      salespeople: [], training: [], peopleLabel: "", mergedFrom: from, mergedInto: mergedInto.get(id), deleted: deleted.has(id),
      flaggedWith: [], historyIds: [], search: "", canSchedule: false, readyToSchedule: false, piSkipped: false, piMissing: false, lost: false, ...extra,
    };
    card.search = [card.name, ...card.aliases, ...emails.map((e) => e.value), ...phones.map((p) => p.value), ...phones.map((p) => normPhone(p.value)),
      card.docNumber, card.linkedQuote?.number, card.linkedPI?.number, ...card.training.map((t) => t.name)].filter(Boolean).join(" ").toLowerCase();
    cards.set(id, card);
    return card;
  };

  for (const l of leads) {
    build(leadCardId(l.contactId), "lead", leadDraft(l), { customerId: l.contactId, lead: l, customerSince: l.createdAt });
  }
  for (const p of potentials) {
    const l = contacts.get(p.contactId)!;
    // Expected month: set when added, changed later (the latest event wins).
    let expected: string | undefined;
    for (const e of byCard.get(p.id) ?? []) if (e.kind === "add_potential" || e.kind === "set_potential_date") expected = e.value || undefined;
    build(p.id, "potential", leadDraft(l), {
      customerId: l.contactId, lead: l, customerSince: l.createdAt, potential: { expected, addedAt: p.addedAt, addedBy: p.addedBy },
    });
  }
  for (const q of quotes) {
    build(quoteCardId(q.estimateId), "quote", docDraft(q, "Quote", contacts.get(q.customerId)), {
      customerId: q.customerId, quote: q, linkedQuote: q, customerSince: contacts.get(q.customerId)?.createdAt,
      salespeople: q.salesperson ? [{ phase: "Quotation", name: q.salesperson }] : [],
      training: q.items, peopleLabel: "No. of People expected", docNumber: q.number, docDate: q.date,
      lost: q.status === "declined",
      piMissing: q.status !== "declined" && !pisByRef.has(q.number),
    });
  }
  for (const p of pis) {
    const id = piCardId(p.salesorderId);
    const mergedQuote = (mergedFrom.get(id) ?? []).map((s) => cards.get(s)).find((c) => c?.kind === "quote");
    const ref = refQuoteNumber(p);
    const linkedQuote = mergedQuote?.quote ?? (ref ? quotesByNumber.get(ref) : undefined);
    build(id, "pi", docDraft(p, "PI", contacts.get(p.customerId)), {
      customerId: p.customerId, pi: p, linkedQuote, customerSince: contacts.get(p.customerId)?.createdAt,
      salespeople: [...(mergedQuote?.salespeople ?? []), ...(p.salesperson ? [{ phase: "PI", name: p.salesperson }] : [])],
      training: p.items, peopleLabel: "No. of People", docNumber: p.number, docDate: p.date,
    });
  }
  for (const inv of invoices) {
    const id = invoiceCardId(inv.invoiceId);
    // What was merged in: a completed PI card, or a completed quote that skipped its PI.
    const src = (mergedFrom.get(id) ?? []).map((s) => cards.get(s)).find((c) => c && c.kind !== "lead");
    const piNo = refPINumber(inv);
    const refPI = piNo ? pisByNumber.get(piNo) : undefined;
    const refQuote = refPI ? quotesByNumber.get(refQuoteNumber(refPI) ?? "") : undefined;
    build(id, "invoice", docDraft(inv, "Invoice", contacts.get(inv.customerId)), {
      customerId: inv.customerId, invoice: inv, customerSince: contacts.get(inv.customerId)?.createdAt,
      linkedPI: src?.pi ?? src?.linkedPI ?? refPI, linkedQuote: src?.linkedQuote ?? refQuote,
      salespeople: [...(src?.salespeople ?? []), ...(inv.salesperson ? [{ phase: "Invoice", name: inv.salesperson }] : [])],
      training: inv.items, peopleLabel: "No. of People", docNumber: inv.number, docDate: inv.date,
    });
  }

  for (const pay of payments) {
    const id = paymentCardId(pay.paymentId);
    const src = (mergedFrom.get(id) ?? []).map((s) => cards.get(s)).find((c) => c?.kind === "invoice");
    const contact = contacts.get(pay.customerId);
    // A payment carries no contact people of its own; the customer's details come with the merged invoice.
    const draft: Draft = { name: pay.customerName, aliases: [], emails: new Map(), phones: new Map(), type: contact?.type, sector: contact?.sector };
    build(id, "payment", draft, {
      customerId: pay.customerId, payment: pay, customerSince: contact?.createdAt,
      linkedInvoice: src?.invoice ?? invoices.find((i) => i.invoiceId === pay.invoiceId),
      linkedPI: src?.linkedPI, linkedQuote: src?.linkedQuote,
      salespeople: src?.salespeople ?? [],
      training: src?.training ?? pay.items, peopleLabel: "No. of People", docNumber: `Payment #${pay.number}`, docDate: pay.date,
    });
  }

  // Change log of a card covers everything merged into it, at any depth.
  const lineage = (id: string): string[] => [id, ...(mergedFrom.get(id) ?? []).flatMap(lineage)];
  for (const c of cards.values()) c.historyIds = lineage(c.id);

  // Notes travel with merges too: a note typed on the lead shows on the quotation it was merged into, and so on. Newest first.
  for (const c of cards.values()) {
    c.notes = c.historyIds.flatMap((id) => byCard.get(id) ?? []).filter((e) => e.kind === "add_note" && e.value)
      .sort((a, b) => b.at.localeCompare(a.at)).map((e) => ({ id: e.id, text: e.value!, by: e.by, at: e.at }));
  }

  // Training dates (and completion) come from the card's whole lineage, so they travel with merges.
  for (const c of cards.values()) {
    if (isCustomerCard(c.kind)) continue;
    const evs = c.historyIds.flatMap((id) => byCard.get(id) ?? []).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    c.schedule = scheduleOf(evs);
  }

  // Flags (cards not merged yet that belong together):
  //  - Lead ↔ Quote: same customer (a lead has no document to reference).
  //  - Quote ↔ PI: only when the PI's Zoho reference cites that quotation number.
  //  - Lead ↔ PI: same customer, only for a PI whose reference cites no synced quotation.
  // A lost deal (quote declined in Zoho) is final: it links to nothing.
  const open = [...cards.values()].filter((c) => !c.mergedInto && !c.deleted && !c.lost);
  const link = (a: CardView, b: CardView) => {
    a.flaggedWith.push(b.id);
    b.flaggedWith.push(a.id);
  };
  const openLeads = new Map<string, CardView[]>();
  // Potential training cards flag exactly like the customer's lead.
  for (const c of open) if (isCustomerCard(c.kind)) openLeads.set(c.customerId, [...(openLeads.get(c.customerId) ?? []), c]);
  const openQuoteByNumber = new Map(open.filter((c) => c.kind === "quote").map((c) => [c.docNumber, c]));
  // A Potential training card waits for a new deal: only a quotation/PI dated on or after the day it was added.
  const fresh = (l: CardView, doc: CardView) => l.kind !== "potential" || (doc.docDate ?? "") >= l.potential!.addedAt.slice(0, 10);
  for (const q of openQuoteByNumber.values()) for (const l of openLeads.get(q.customerId) ?? []) if (fresh(l, q)) link(l, q);
  for (const p of open.filter((c) => c.kind === "pi")) {
    const ref = refQuoteNumber(p.pi);
    const q = ref ? openQuoteByNumber.get(ref) : undefined;
    if (q) link(q, p);
    else if (!ref || !quotesByNumber.has(ref)) for (const l of openLeads.get(p.customerId) ?? []) if (fresh(l, p)) link(l, p);
  }
  //  - Completed training ↔ Invoice: only when the invoice's reference cites that card's PI
  //    (or, for a quote that skipped its PI, the quotation number).
  const completed = open.filter((c) => (c.kind === "pi" || c.kind === "quote") && c.schedule?.completed);
  const completedByPI = new Map(completed.filter((c) => c.kind === "pi").map((c) => [c.docNumber, c]));
  const completedByQuote = new Map(completed.filter((c) => c.kind === "quote").map((c) => [c.docNumber, c]));
  const piCardByNumber = new Map(pis.map((p) => [p.number, piCardId(p.salesorderId)]));
  const quoteCardByNumber = new Map(quotes.map((q) => [q.number, quoteCardId(q.estimateId)]));
  for (const inv of open.filter((c) => c.kind === "invoice")) {
    if (inv.mergedFrom.length) continue; // already holds its PI / quote
    const piNo = refPINumber(inv.invoice);
    const quoteNo = inv.invoice?.reference?.match(/Quotation-[\w-]+/i)?.[0];
    const target = (piNo && completedByPI.get(piNo)) || (quoteNo && completedByQuote.get(quoteNo)) || undefined;
    if (target) {
      link(target, inv);
      continue;
    }
    const ref = piNo ?? quoteNo;
    const refId = piNo ? piCardByNumber.get(piNo) : quoteNo ? quoteCardByNumber.get(quoteNo) : undefined;
    const refCard = refId ? cards.get(refId) : undefined;
    const holder = refCard?.mergedInto ? cards.get(refCard.mergedInto) : refCard;
    inv.waitingOn = !ref
      ? "This invoice has no PI in its reference — add the PI number (Performa-…) to the invoice's reference in Zoho Books to link it."
      : !holder
        ? `The reference cites ${ref}, which isn't on the board (not in Zoho, or older than the synced fiscal years).`
        : holder.kind === "invoice"
          ? `${ref} is already merged into invoice ${holder.docNumber}.`
          : `Waiting for training on ${cardLabel(holder)} to be marked completed — then this invoice can be merged with it.`;
  }

  //  - Invoice ↔ Payment received: the invoice the payment is applied to in Zoho
  //    (or whose number the payment's Reference# cites) — only once that invoice holds its completed training,
  //    or is flagged with it (then the merge view offers Training completed → Invoice → Payment received in one go).
  const openInvoiceById = new Map(open.filter((c) => c.kind === "invoice").map((c) => [c.invoice!.invoiceId, c]));
  const openInvoiceByNumber = new Map([...openInvoiceById.values()].map((c) => [c.docNumber, c]));
  for (const pay of open.filter((c) => c.kind === "payment")) {
    if (pay.mergedFrom.length) continue;
    const p = pay.payment!;
    const cited = [...openInvoiceByNumber.keys()].find((n) => n && p.reference?.includes(n));
    const target = openInvoiceById.get(p.invoiceId) ?? (cited ? openInvoiceByNumber.get(cited) : undefined);
    const hasTraining = (ids: string[]) => ids.some((id) => kindOfId(id) === "pi" || kindOfId(id) === "quote");
    if (target && (hasTraining(target.mergedFrom) || hasTraining(target.flaggedWith))) {
      link(target, pay);
      continue;
    }
    if (target) {
      pay.waitingOn = `Invoice ${target.docNumber} isn't merged with its completed training yet — merge Training completed → Invoice first (step by step), then this payment can be merged.`;
      continue;
    }
    const invCard = cards.get(invoiceCardId(p.invoiceId));
    const holder = invCard?.mergedInto ? cards.get(invCard.mergedInto) : invCard;
    pay.waitingOn = !invCard
      ? `Invoice ${p.invoiceNumber} isn't on the board (not a tracked training invoice, or older than the synced fiscal years).`
      : holder && holder.id !== invCard.id
        ? `Invoice ${p.invoiceNumber} is already merged into ${holder.docNumber}.`
        : `Invoice ${p.invoiceNumber} is deleted from the board.`;
  }

  // Phases 4-5: a quote or PI with nothing left to merge can be scheduled; with a date (or TBD) it moves
  // to Training scheduled, and "Training completed" moves it on. A PI that later absorbs a scheduled
  // quote keeps the quote's training date.
  for (const c of cards.values()) {
    if (isCustomerCard(c.kind)) continue;
    c.canSchedule = (c.kind === "quote" || c.kind === "pi") && !c.deleted && !c.mergedInto && !c.lost && c.flaggedWith.length === 0;
    c.readyToSchedule = c.kind === "pi" && c.canSchedule && !c.schedule && c.mergedFrom.length > 0;
    c.piSkipped = c.kind === "quote" ? Boolean(c.schedule)
      : c.kind === "invoice" ? c.mergedFrom.some((id) => kindOfId(id) === "quote")
      : c.kind === "payment" && c.mergedFrom.some((id) => cards.get(id)?.piSkipped);
  }

  const live = [...cards.values()].filter((c) => !c.mergedInto);
  const inTraining = (c: CardView) => (c.kind === "quote" || c.kind === "pi") && Boolean(c.schedule) && !c.lost;
  const column = (k: CardKind) => live.filter((c) => c.kind === k && !inTraining(c) && !c.lost);
  // Soonest training first; to-be-decided at the end.
  const scheduledCards = live
    .filter((c) => inTraining(c) && !c.schedule!.completed)
    .sort((a, b) => (a.schedule!.date ?? "9999").localeCompare(b.schedule!.date ?? "9999"));
  // Most recently completed first.
  const completedCards = live
    .filter((c) => inTraining(c) && c.schedule!.completed)
    .sort((a, b) => b.schedule!.completed!.at.localeCompare(a.schedule!.completed!.at));
  return {
    cards, exists, leadCards: column("lead"), quoteCards: column("quote"), piCards: column("pi"),
    scheduledCards, completedCards, invoiceCards: column("invoice"), paymentCards: column("payment"),
    lostCards: live.filter((c) => c.lost),
    // Soonest expected month first; not set at the end; then newest added.
    potentialCards: live
      .filter((c) => c.kind === "potential")
      .sort((a, b) => (a.potential!.expected ?? "9999").localeCompare(b.potential!.expected ?? "9999") || b.potential!.addedAt.localeCompare(a.potential!.addedAt)),
  };
}

/** Every card linked to `id` through flags (e.g. PI → the quote it references → that customer's lead). */
export function flagGroup(id: string, cards: Map<string, CardView>): string[] {
  const seen = new Set([id]);
  const queue = [id];
  while (queue.length) for (const next of cards.get(queue.shift()!)?.flaggedWith ?? []) if (!seen.has(next)) (seen.add(next), queue.push(next));
  return [...seen];
}

/** Newest document first: by date, then by when it was created in Zoho (several can share a date). */
export const newestFirst = (a: CardView, b: CardView) =>
  (b.docDate ?? "").localeCompare(a.docDate ?? "") || (b.quote?.createdAt ?? "").localeCompare(a.quote?.createdAt ?? "") || (b.docNumber ?? "").localeCompare(a.docNumber ?? "");

/** A customer's quotations sitting in the Quotations column (not merged on, not in training, not lost or deleted), newest first. */
export function columnQuotes(customerId: string, cards: Map<string, CardView>): CardView[] {
  return [...cards.values()]
    .filter((c) => c.kind === "quote" && c.customerId === customerId && !c.mergedInto && !c.deleted && !c.lost && !c.schedule)
    .sort(newestFirst);
}

/**
 * Cards shown together in the merge view. Merging a Potential training card is only about picking its quotation:
 * the card, the customer's lead (merged along with it) and every quotation of theirs in the Quotations column —
 * no PI or later stages, since that quotation may not have a PI yet (Quote → PI is merged later, from the quote).
 * Anything else: everything linked by flags.
 */
export function mergeCandidates(id: string, cards: Map<string, CardView>): string[] {
  const card = cards.get(id);
  if (card?.kind !== "potential") return flagGroup(id, cards);
  // Also whatever the card is flagged with directly: a new quotation already in training, or a PI citing no quotation.
  const flagged = card.flaggedWith.map((f) => cards.get(f)).filter((c): c is CardView => !!c && !isCustomerCard(c.kind));
  const options = [...new Set([...columnQuotes(card.customerId, cards), ...flagged].map((c) => c.id))];
  if (!options.length) return [id];
  const leads = [...cards.values()].filter((c) => c.kind === "lead" && c.customerId === card.customerId && !c.mergedInto && !c.deleted).map((c) => c.id);
  return [id, ...leads, ...options];
}

export function cardLabel(c: CardView | undefined): string {
  if (!c) return "a card";
  return isCustomerCard(c.kind) ? c.name : c.docNumber ?? KIND_LABEL[c.kind]; // "Quotation-24-…" / "Performa-25-…" say what they are
}

/**
 * When a merged document disappears from Zoho Books (deleted there, or older than the synced
 * fiscal years) the cards move back apart. Returns one notice per affected merge; the id is
 * derived from the merge so every browser records the same notice only once.
 */
export function zohoNotices(events: CardEvent[], exists: Set<string>, cards: Map<string, CardView>): CardEvent[] {
  const noted = new Set(events.filter((e) => e.kind === "zoho_change").map((e) => e.ref));
  const now = new Date().toISOString();
  const out: CardEvent[] = [];
  for (const e of events) {
    if (e.kind !== "merge" || e.revertedAt || noted.has(e.id)) continue;
    const [from, to] = e.cardIds;
    const fromGone = !exists.has(from);
    const toGone = !exists.has(to);
    if (!fromGone && !toGone) continue;
    const fromLabel = cards.has(from) ? cardLabel(cards.get(from)) : e.before ?? from;
    const toLabel = cards.has(to) ? cardLabel(cards.get(to)) : e.value ?? to;
    const gone = toGone ? toLabel : fromLabel;
    const moved = toGone
      ? kindOfId(from) === "lead" ? `${fromLabel} moved back to Leads`
        : kindOfId(from) === "potential" ? `${fromLabel} moved back to Potential training` : `${fromLabel} is its own card again`
      : `its details were taken off ${toLabel}`;
    out.push({
      id: `zoho:${e.id}`,
      cardIds: e.cardIds,
      kind: "zoho_change",
      ref: e.id,
      value: `${gone} is no longer in Zoho Books (deleted there, or older than the fiscal years we sync) — ${moved}. The card moved due to changes in Zoho Books.`,
      at: now,
      by: "Zoho Books",
    });
  }
  return out;
}

/** Change-log line for an event. */
export function describeEvent(e: CardEvent, labelOf: (cardId: string) => string): string {
  const v = e.value ?? "";
  switch (e.kind) {
    case "set_name": return `Renamed “${e.before ?? ""}” → “${v}”`;
    case "set_type": return `Type: ${e.before || "—"} → ${v || "—"}`;
    case "set_sector": return `Sector: ${e.before || "—"} → ${v || "—"}`;
    case "add_alias": return `Added alias “${v}”`;
    case "remove_alias": return `Removed alias “${v}”`;
    case "add_email": return `Added email ${v} (from ${e.phase ?? "Lead"})`;
    case "remove_email": return `Removed email ${v}`;
    case "add_phone": return `Added contact number ${v} (from ${e.phase ?? "Lead"})`;
    case "remove_phone": return `Removed contact number ${v}`;
    case "delete": return kindOfId(e.cardIds[0]) === "potential"
      ? `Removed ${labelOf(e.cardIds[0])} from Potential training`
      : `Deleted ${labelOf(e.cardIds[0])} — the customer moved back to Leads`;
    case "merge": {
      const [from, to] = e.cardIds;
      return `Merged ${KIND_LABEL[kindOfId(from)].toLowerCase()} “${e.before ?? labelOf(from)}” into ${e.value ?? labelOf(to)}`;
    }
    case "set_training_date": {
      const show = (x?: string) => (!x ? "" : x === "TBD" ? "To be decided" : fmtDays(x));
      const who = e.trainers?.length ? ` · Trainers: ${e.trainers.join(", ")}` : "";
      if (v !== "TBD" && e.before === v) return `Trainers for ${show(v)} changed to ${e.trainers?.join(", ") || "none"}`;
      if (v === "TBD") return `Training date set to To be decided${e.before ? ` (was ${show(e.before)})` : ""}`;
      if (e.before === "TBD") return `Training scheduled for ${show(v)} (was To be decided)${who}`;
      if (e.before) return `Training postponed from ${show(e.before)} to ${show(v)}${who}`;
      const skip = kindOfId(e.cardIds[0]) === "quote" ? " — moved directly from Quotation to Training scheduled; its PI is still needed before the training can be completed" : "";
      return `Training scheduled for ${show(v)}${skip}${who}`;
    }
    case "complete_training": return "Training marked completed — moved to Training completed";
    case "zoho_change": return v;
    case "add_potential": return `Added to Potential training${v ? ` — training expected around ${fmtMonth(v)}` : ""}`;
    case "set_potential_date": return `Expected training: ${fmtMonth(e.before) || "not set"} → ${fmtMonth(v) || "not set"}`;
    case "set_not_required": return "Marked Training not required — moved to Training not required";
    case "set_delivered": return "Marked as delivered — ready for scheduling";
    case "add_note": return `Note: “${v}”`;
    case "set_resale": return `Marked ${e.before ?? "this invoice"} for resale — moved to Training not required`;
    case "set_reseller": return `Marked ${e.before ?? "the customer"} as a Reseller — all their AED invoices moved to Training not required`;
  }
}

/* ---------------- AedSmartx board: AED invoices → Training scheduled → Training completed ---------------- */

export const aedCardId = (invoiceId: string) => `aed:${invoiceId}`;
/** AedSmartx board: Priyanka (trainer) and Arti (deliveries) work only on it; only Arti marks AEDs as delivered. */
export const isAedTrainer = (name: string) => /^priyanka\b/i.test(name.trim());
export const isAedDelivery = (name: string) => /^arti\b/i.test(name.trim());
export const isAedBoardUser = (name: string) => isAedTrainer(name) || isAedDelivery(name);

/** Where customer-wide AED changes ("Customer is a Reseller") are logged, so every invoice of theirs shows them. */
export const aedCustomerId = (contactId: string) => `aedcustomer:${contactId}`;

/** A training date, with its time when one was set ("2026-10-20T14:30" → "20 Oct 2026, 2:30 pm"). */
export function fmtWhen(v: string): string {
  const [day, time] = v.split("T");
  const d = fmtDay(day);
  if (!time) return d;
  const [h, m] = time.split(":").map(Number);
  return `${d}, ${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

const nextDay = (ymd: string) => new Date(Date.parse(ymd) + 86_400_000).toISOString().slice(0, 10);

/**
 * Training days, with consecutive days shown as one range and the year once when it's the same:
 * "5 Oct 2026" · "5–7 Oct 2026" · "5–7 Oct, 12 Oct 2026" · "30 Sept – 2 Oct 2026". A single AED date+time goes through fmtWhen.
 */
export function fmtDays(v: string): string {
  const days = trainingDays(v);
  if (days.length <= 1) return fmtWhen(v);
  const runs: [string, string][] = [];
  for (const d of days) {
    const last = runs[runs.length - 1];
    if (last && nextDay(last[1]) === d) last[1] = d;
    else runs.push([d, d]);
  }
  const oneYear = days[0].slice(0, 4) === days[days.length - 1].slice(0, 4);
  const dm = (d: string) => fmtDate(d, { day: "numeric", month: "short" });
  const run = ([a, b]: [string, string], withYear: boolean) => {
    const end = withYear ? fmtDay(b) : dm(b);
    if (a === b) return end;
    const start = a.slice(0, 7) === b.slice(0, 7) ? String(Number(a.slice(8))) : a.slice(0, 4) === b.slice(0, 4) ? dm(a) : fmtDay(a);
    return `${start}${start.includes(" ") ? " – " : "–"}${end}`;
  };
  return runs.map((r, i) => run(r, !oneYear || i === runs.length - 1)).join(", ");
}

/**
 * Priyanka's board. One card per AED invoice (card id "aed:<invoice id>", separate from the training board's
 * invoice cards). Contact number = the invoice's ship-to phone; if that's blank, the customer's usual numbers.
 * Same event model as the training board, so edits, dates, completion and "not required" are logged and revertable.
 */
export function buildAedBoard(leads: ZohoLead[], invoices: AedInvoice[], events: CardEvent[]) {
  const ids = new Set(invoices.map((i) => aedCardId(i.invoiceId)));
  // Resellers apply to every invoice of the customer, including ones that arrive later.
  const resellers = new Set(events.filter((e) => !e.revertedAt && e.kind === "set_reseller" && e.ref).map((e) => e.ref!));
  const byCard = new Map<string, CardEvent[]>();
  const active = events.filter((e) => !e.revertedAt && e.cardIds.some((id) => ids.has(id))).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  for (const e of active) for (const id of e.cardIds) if (ids.has(id)) byCard.set(id, [...(byCard.get(id) ?? []), e]);
  const contacts = new Map(leads.map((l) => [l.contactId, l]));

  const cards = new Map<string, CardView>();
  for (const inv of invoices) {
    const id = aedCardId(inv.invoiceId);
    const contact = contacts.get(inv.customerId);
    const evs = byCard.get(id) ?? [];
    const draft: Draft = { name: inv.customerName, aliases: [], emails: new Map(), phones: new Map(), type: contact?.type, sector: contact?.sector };
    for (const c of inv.contacts) if (c.email) put(draft.emails, normEmail(c.email), { value: c.email, phases: ["Invoice"], at: inv.createdAt });
    if (!draft.emails.size && contact?.email) put(draft.emails, normEmail(contact.email), { value: contact.email, phases: ["Lead"], at: contact.createdAt });
    if (inv.shipPhone) put(draft.phones, normPhone(inv.shipPhone), { value: inv.shipPhone, phases: ["Ship-to"], at: inv.createdAt });
    else {
      for (const c of inv.contacts) for (const p of [c.mobile, c.phone]) if (p) put(draft.phones, normPhone(p), { value: p, phases: ["Invoice"], at: inv.createdAt });
      if (contact) for (const p of [contact.mobile, contact.phone]) if (p) put(draft.phones, normPhone(p), { value: p, phases: ["Lead"], at: contact.createdAt });
    }
    apply(draft, evs);
    const emails = sortEntries(draft.emails);
    const phones = sortEntries(draft.phones);
    const lines = inv.aedLines.map(parseAedLine);
    const card: CardView = {
      id, kind: "invoice", customerId: inv.customerId, name: draft.name, aliases: draft.aliases, emails, phones, type: draft.type, sector: draft.sector,
      customerSince: contact?.createdAt, salespeople: inv.salesperson ? [{ phase: "Invoice", name: inv.salesperson }] : [],
      invoice: inv, training: inv.items, peopleLabel: "Units", docNumber: inv.number, docDate: inv.date,
      mergedFrom: [], deleted: false, flaggedWith: [], historyIds: [id], search: "",
      canSchedule: true, readyToSchedule: false, piSkipped: false, piMissing: false, lost: false,
      schedule: scheduleOf(evs), reseller: resellers.has(inv.customerId), resale: evs.some((e) => e.kind === "set_resale"),
      notRequired: resellers.has(inv.customerId) || evs.some((e) => e.kind === "set_not_required" || e.kind === "set_resale"),
      delivered: (() => { const d = evs.filter((e) => e.kind === "set_delivered").at(-1); return d ? { at: d.at, by: d.by } : undefined; })(),
      notes: evs.filter((e) => e.kind === "add_note" && e.value).map((e) => ({ id: e.id, text: e.value!, by: e.by, at: e.at })).reverse(),
      aed: { lines, extras: aedExtras(inv) },
    };
    card.search = [card.name, ...card.aliases, ...emails.map((e) => e.value), ...phones.map((p) => p.value), ...phones.map((p) => normPhone(p.value)),
      inv.number, inv.reference, ...inv.items.map((i) => i.name), ...lines.flatMap((l) => l.serials)].filter(Boolean).join(" ").toLowerCase();
    cards.set(id, card);
  }

  const all = [...cards.values()];
  return {
    cards,
    invoiceCards: all.filter((c) => !c.schedule && !c.notRequired),
    // Soonest training first; to-be-decided at the end.
    scheduledCards: all.filter((c) => c.schedule && !c.schedule.completed && !c.notRequired)
      .sort((a, b) => (a.schedule!.date ?? "9999").localeCompare(b.schedule!.date ?? "9999")),
    completedCards: all.filter((c) => c.schedule?.completed && !c.notRequired)
      .sort((a, b) => b.schedule!.completed!.at.localeCompare(a.schedule!.completed!.at)),
    notRequiredCards: all.filter((c) => c.notRequired),
  };
}
