import type { CardEvent, ZohoInvoice, ZohoLead, ZohoPayment, ZohoPI, ZohoQuote } from "./types";
import {
  type CardKind, type CardView, type CustomerContacts, type Draft, STAGE_RANK, absorb, apply, applyCustomerAliases, applyCustomerContacts, cardLabel,
  docDraft, kindOfId, leadDraft, normPhone, partPaidText, receivedOn, refPINumber, refQuoteNumber, sortEntries, sumMatches,
} from "./pipeline";

/*
 * The Sales board (owner, 30 Oct: "a sales dashboard … all items but the training ones … the columns only change a
 * little, training schedule and training completed completely removed … items move from lead to payment received
 * similarly"): Potential Customers → Quotations → Performa invoice → Invoice sent → Payment received → Deal lost.
 * Data: salesSync.ts (/api/sales). Pure — built in the browser like the Training board; tests/sales.test.ts.
 *
 * The Training board's rules, without the training step:
 *  - Flags: Lead ↔ Quote (same customer); Quote ↔ PI (the PI's reference cites the quotation); Lead ↔ PI (a PI citing
 *    no synced quotation); PI ↔ Invoice (the invoice's reference cites the PI — or a quotation, when the PI was
 *    skipped); Invoice ↔ Payment (the invoice the payment is applied to, once its payments add up to its total).
 *  - Merges, deletes, notes, aliases and contact details are the same events, on the board's own cards — "sale:<kind>:<id>"
 *    — so a document with training and other items moves on each board by itself.
 *  - A quotation declined in Zoho is a lost deal.
 */

export const saleId = (kind: CardKind, id: string) => `sale:${kind}:${id}`;
export const isSaleCard = (id: string) => id.startsWith("sale:");
export const SALES_COLUMN = { lead: "Potential Customers", quote: "Quotations", pi: "Performa invoice", invoice: "Invoice sent", payment: "Payment received", lost: "Deal lost" } as const;

/** Merges that still apply: not reverted, both cards still here, forward only; an invoice joins its payments once paid in full. */
function liveMerges(active: CardEvent[], exists: Set<string>, paid: Set<string>) {
  const into = new Map<string, string>();
  for (const e of active) {
    if (e.kind !== "merge") continue;
    const [from, to] = e.cardIds;
    if (!exists.has(from) || !exists.has(to)) continue;
    if (kindOfId(to) === "payment" && kindOfId(from) === "invoice" && !paid.has(from)) continue;
    if (STAGE_RANK[kindOfId(from)] < STAGE_RANK[kindOfId(to)]) into.set(from, to);
  }
  return into;
}

export function buildSalesBoard(leads: ZohoLead[], quotes: ZohoQuote[], pis: ZohoPI[], invoices: ZohoInvoice[], payments: ZohoPayment[], events: CardEvent[], aliases?: Map<string, string[]>, contacts?: CustomerContacts) {
  const active = events.filter((e) => !e.revertedAt && e.cardIds.some(isSaleCard)).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const byCard = new Map<string, CardEvent[]>();
  const deletedDocs = new Set<string>();
  for (const e of active) {
    // A delete hides the card and what's merged into it; leads come back.
    if (e.kind === "delete") e.cardIds.filter((id) => kindOfId(id) !== "lead").forEach((id) => deletedDocs.add(id));
    else if (e.kind !== "merge" && e.kind !== "zoho_change") for (const id of e.cardIds) byCard.set(id, [...(byCard.get(id) ?? []), e]);
  }
  const customers = new Map(leads.map((l) => [l.contactId, l]));
  const quotesByNumber = new Map(quotes.map((q) => [q.number, q]));
  const pisByNumber = new Map(pis.map((p) => [p.number, p]));
  const exists = new Set([
    ...leads.map((l) => saleId("lead", l.contactId)), ...quotes.map((q) => saleId("quote", q.estimateId)), ...pis.map((p) => saleId("pi", p.salesorderId)),
    ...invoices.map((i) => saleId("invoice", i.invoiceId)), ...payments.map((p) => saleId("payment", p.paymentId)),
  ]);
  const received = new Map<string, number>();
  for (const p of payments) received.set(p.invoiceId, (received.get(p.invoiceId) ?? 0) + receivedOn([p]));
  const inFull = (i: ZohoInvoice) => sumMatches(i.total, received.get(i.invoiceId) ?? 0);
  const liveInto = liveMerges(active, exists, new Set(invoices.filter(inFull).map((i) => saleId("invoice", i.invoiceId))));

  // Deleting a document sends the customer back to Potential Customers: it and everything merged into it are hidden.
  const sources = new Map<string, string[]>();
  for (const [from, to] of liveInto) sources.set(to, [...(sources.get(to) ?? []), from]);
  const deleted = new Set<string>();
  const hide = (id: string) => {
    if (kindOfId(id) === "lead" || deleted.has(id)) return;
    deleted.add(id);
    (sources.get(id) ?? []).forEach(hide);
  };
  deletedDocs.forEach(hide);
  const mergedInto = new Map([...liveInto].filter(([, to]) => !deleted.has(to)));
  // Instalments: once a paid invoice is merged into one of its payments, the others fold into that card too.
  const paymentsOf = new Map<string, string[]>();
  for (const p of payments) paymentsOf.set(p.invoiceId, [...(paymentsOf.get(p.invoiceId) ?? []), saleId("payment", p.paymentId)]);
  for (const [from, to] of [...mergedInto]) {
    if (kindOfId(from) !== "invoice" || kindOfId(to) !== "payment") continue;
    for (const pid of paymentsOf.get(from.split(":")[2]) ?? []) if (pid !== to && !mergedInto.has(pid) && !deleted.has(pid)) mergedInto.set(pid, to);
  }
  const mergedFrom = new Map<string, string[]>();
  for (const [from, to] of mergedInto) mergedFrom.set(to, [...(mergedFrom.get(to) ?? []), from]);

  const cards = new Map<string, CardView>();
  const drafts = new Map<string, Draft>();
  const build = (id: string, kind: CardKind, draft: Draft, extra: Partial<CardView> & { customerId: string }) => {
    const from = mergedFrom.get(id) ?? [];
    for (const src of from) { const sd = drafts.get(src); if (sd) absorb(draft, sd); }
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
      card.docNumber, card.linkedQuote?.number, card.linkedPI?.number, card.invoice?.reference].filter(Boolean).join(" ").toLowerCase();
    cards.set(id, card);
    return card;
  };

  for (const l of leads) build(saleId("lead", l.contactId), "lead", leadDraft(l), { customerId: l.contactId, lead: l, customerSince: l.createdAt });
  for (const q of quotes) {
    build(saleId("quote", q.estimateId), "quote", docDraft(q, "Quote", customers.get(q.customerId)), {
      customerId: q.customerId, quote: q, linkedQuote: q, customerSince: customers.get(q.customerId)?.createdAt,
      salespeople: q.salesperson ? [{ phase: "Quotation", name: q.salesperson }] : [], docNumber: q.number, docDate: q.date, lost: q.status === "declined",
    });
  }
  for (const p of pis) {
    const id = saleId("pi", p.salesorderId);
    const mergedQuote = (mergedFrom.get(id) ?? []).map((s) => cards.get(s)).find((c) => c?.kind === "quote");
    const ref = refQuoteNumber(p);
    build(id, "pi", docDraft(p, "PI", customers.get(p.customerId)), {
      customerId: p.customerId, pi: p, linkedQuote: mergedQuote?.quote ?? (ref ? quotesByNumber.get(ref) : undefined), customerSince: customers.get(p.customerId)?.createdAt,
      salespeople: [...(mergedQuote?.salespeople ?? []), ...(p.salesperson ? [{ phase: "PI", name: p.salesperson }] : [])], docNumber: p.number, docDate: p.date,
    });
  }
  for (const inv of invoices) {
    const id = saleId("invoice", inv.invoiceId);
    const src = (mergedFrom.get(id) ?? []).map((s) => cards.get(s)).find((c) => c && c.kind !== "lead");
    const piNo = refPINumber(inv);
    const refPI = piNo ? pisByNumber.get(piNo) : undefined;
    build(id, "invoice", docDraft(inv, "Invoice", customers.get(inv.customerId)), {
      customerId: inv.customerId, invoice: inv, customerSince: customers.get(inv.customerId)?.createdAt,
      received: received.get(inv.invoiceId) ?? 0, paidInFull: inFull(inv),
      linkedPI: src?.pi ?? src?.linkedPI ?? refPI, linkedQuote: src?.linkedQuote ?? (refPI ? quotesByNumber.get(refQuoteNumber(refPI) ?? "") : undefined),
      salespeople: [...(src?.salespeople ?? []), ...(inv.salesperson ? [{ phase: "Invoice", name: inv.salesperson }] : [])], docNumber: inv.number, docDate: inv.date,
    });
  }
  for (const pay of payments) {
    const id = saleId("payment", pay.paymentId);
    const src = (mergedFrom.get(id) ?? []).map((s) => cards.get(s)).find((c) => c?.kind === "invoice");
    const contact = customers.get(pay.customerId);
    const draft: Draft = { name: pay.customerName, aliases: [], emails: new Map(), phones: new Map(), type: contact?.type, sector: contact?.sector };
    build(id, "payment", draft, {
      customerId: pay.customerId, payment: pay, customerSince: contact?.createdAt,
      linkedInvoice: src?.invoice ?? invoices.find((i) => i.invoiceId === pay.invoiceId), linkedPI: src?.linkedPI, linkedQuote: src?.linkedQuote,
      salespeople: src?.salespeople ?? [], docNumber: `Payment #${pay.number}`, docDate: pay.date,
    });
  }

  const lineage = (id: string): string[] => [id, ...(mergedFrom.get(id) ?? []).flatMap(lineage)];
  for (const c of cards.values()) c.historyIds = lineage(c.id);
  for (const c of cards.values()) {
    if (c.kind !== "payment") continue;
    const held = [c.payment!, ...c.mergedFrom.map((id) => cards.get(id)?.payment).filter((p): p is ZohoPayment => !!p)];
    c.payments = held.sort((a, b) => a.date.localeCompare(b.date) || Number(a.number) - Number(b.number));
  }
  for (const c of cards.values()) {
    c.notes = c.historyIds.flatMap((id) => byCard.get(id) ?? []).filter((e) => e.kind === "add_note" && e.value)
      .sort((a, b) => b.at.localeCompare(a.at)).map((e) => ({ id: e.id, text: e.value!, by: e.by, at: e.at }));
  }

  // Flags.
  const open = [...cards.values()].filter((c) => !c.mergedInto && !c.deleted && !c.lost);
  const link = (a: CardView, b: CardView) => { a.flaggedWith.push(b.id); b.flaggedWith.push(a.id); };
  const openLeads = new Map(open.filter((c) => c.kind === "lead").map((c) => [c.customerId, c]));
  const openQuoteByNumber = new Map(open.filter((c) => c.kind === "quote").map((c) => [c.docNumber, c]));
  const openPIByNumber = new Map(open.filter((c) => c.kind === "pi").map((c) => [c.docNumber, c]));
  for (const q of openQuoteByNumber.values()) { const l = openLeads.get(q.customerId); if (l) link(l, q); }
  for (const p of openPIByNumber.values()) {
    const ref = refQuoteNumber(p.pi);
    const q = ref ? openQuoteByNumber.get(ref) : undefined;
    if (q) link(q, p);
    else if (!ref || !quotesByNumber.has(ref)) { const l = openLeads.get(p.customerId); if (l) link(l, p); }
  }
  const holderOf = (id?: string) => { const c = id ? cards.get(id) : undefined; return c?.mergedInto ? cards.get(c.mergedInto) : c; };
  for (const inv of open.filter((c) => c.kind === "invoice")) {
    if (inv.mergedFrom.some((id) => kindOfId(id) !== "lead")) continue; // already holds its PI / quote
    const piNo = refPINumber(inv.invoice);
    const quoteNo = inv.invoice?.reference?.match(/Quotation-[\w-]+/i)?.[0];
    const target = (piNo && openPIByNumber.get(piNo)) || (quoteNo && openQuoteByNumber.get(quoteNo)) || undefined;
    if (target) { link(target, inv); continue; }
    const ref = piNo ?? quoteNo;
    const holder = holderOf(piNo ? (pisByNumber.get(piNo) && saleId("pi", pisByNumber.get(piNo)!.salesorderId)) : quoteNo && quotesByNumber.get(quoteNo) ? saleId("quote", quotesByNumber.get(quoteNo)!.estimateId) : undefined);
    inv.waitingOn = !ref
      ? "This invoice cites no PI — add the PI number (Performa-…) to its reference in Zoho Books to link it, or keep it here on its own."
      : !holder ? `The reference cites ${ref}, which isn't on the board (not in Zoho, or older than the synced fiscal years).`
      : holder.kind === "invoice" ? `${ref} is already merged into invoice ${holder.docNumber}.`
      : `${ref} is on ${cardLabel(holder)}.`;
  }
  const openInvoiceById = new Map(open.filter((c) => c.kind === "invoice").map((c) => [c.invoice!.invoiceId, c]));
  for (const pay of open.filter((c) => c.kind === "payment")) {
    if (pay.mergedFrom.length) continue;
    const p = pay.payment!;
    const target = openInvoiceById.get(p.invoiceId);
    if (target && !target.paidInFull) {
      pay.waitingOn = `${partPaidText(target.invoice!, target.received ?? 0)}. This payment waits here; once the payments add up to the invoice total, the invoice merges with all of them together.`;
      continue;
    }
    if (target) { link(target, pay); continue; }
    const holder = holderOf(saleId("invoice", p.invoiceId));
    pay.waitingOn = !holder ? `Invoice ${p.invoiceNumber} isn't on the board.` : `Invoice ${p.invoiceNumber} is already merged into ${holder.docNumber}.`;
  }

  applyCustomerAliases(cards, aliases ?? new Map());
  applyCustomerContacts(cards, contacts ?? new Map());

  const live = [...cards.values()].filter((c) => !c.mergedInto);
  const column = (k: CardKind) => live.filter((c) => c.kind === k && !c.lost);
  return {
    cards, exists, leadCards: column("lead"), quoteCards: column("quote"), piCards: column("pi"),
    invoiceCards: column("invoice"), paymentCards: column("payment"), lostCards: live.filter((c) => c.lost),
  };
}
