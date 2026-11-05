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
 *  - One bank transfer can pay several invoices, and one invoice can have several payments (owner, 5 Nov). So a payment card is one
 *    invoice's share of a payment, "sale:payment:<paymentId>:<invoiceId>", which also keeps a transfer from joining separate deals.
 *    Invoices citing the same PI fold into one card once they're merged with their payments; an unpaid one stays in Invoice sent.
 */

export const saleId = (kind: CardKind, id: string) => `sale:${kind}:${id}`;
export const isSaleCard = (id: string) => id.startsWith("sale:");
/** One invoice's share of a payment. */
export const payCardId = (p: Pick<ZohoPayment, "paymentId" | "invoiceId">) => saleId("payment", `${p.paymentId}:${p.invoiceId}`);
/** What ties invoices into one deal: the PI they cite, or the quotation when the PI was skipped. */
const dealRef = (i: ZohoInvoice) => refPINumber(i) ?? i.reference?.match(/Quotation-[\w-]+/i)?.[0];
export const SALES_COLUMN = { lead: "Potential Customers", quote: "Quotations", pi: "Performa invoice", invoice: "Invoice sent", payment: "Payment received", lost: "Deal lost" } as const;

/**
 * "Merge all flagged" (owner, 30 Oct: "these are so many, just give me a merge all button"): every merge the board's
 * flags allow, as the merge view's main button would do them — each card merges into one card only:
 *  1. Quote → the PI that cites it (a quote cited by several PIs: the oldest).
 *  2. Lead → its customer's newest flagged quotation (else PI) — the chain carries it on if that quote goes into a PI.
 *  3. PI (or a quotation that skipped its PI) → the invoice that cites it: when several do, the oldest fully paid one, else the oldest.
 *  4. Invoice → its newest payment (paid in full; its other payments fold in by themselves).
 * Pure — the board records them as "merge" events (mode "all"), undoable together or one by one in Changes.
 */
export function mergeAllSteps(cards: Map<string, CardView>): [CardView, CardView][] {
  const live = (c?: CardView): c is CardView => Boolean(c && !c.mergedInto && !c.deleted && !c.lost);
  const all = [...cards.values()].filter(live);
  const byDate = (a: CardView, b: CardView) => (a.docDate ?? "").localeCompare(b.docDate ?? "") || a.id.localeCompare(b.id);
  const partners = (c: CardView, kind: CardKind) => c.flaggedWith.map((id) => cards.get(id)).filter((x): x is CardView => live(x) && x.kind === kind);
  const gone = new Set<string>(); // already merged away in this batch
  const steps: [CardView, CardView][] = [];
  const step = (from: CardView, to: CardView) => { steps.push([from, to]); gone.add(from.id); };
  for (const p of all.filter((c) => c.kind === "pi").sort(byDate)) {
    const q = partners(p, "quote").filter((x) => !gone.has(x.id)).sort(byDate)[0];
    if (q) step(q, p);
  }
  for (const l of all.filter((c) => c.kind === "lead")) {
    const to = partners(l, "quote").sort(byDate).at(-1) ?? partners(l, "pi").sort(byDate).at(-1);
    if (to) step(l, to);
  }
  const paidFirst = (a: CardView, b: CardView) => Number(Boolean(b.paidInFull)) - Number(Boolean(a.paidInFull)) || byDate(a, b);
  for (const inv of all.filter((c) => c.kind === "invoice").sort(paidFirst)) {
    const src = [...partners(inv, "pi"), ...partners(inv, "quote")].filter((x) => !gone.has(x.id)).sort(byDate)[0];
    if (src) step(src, inv);
  }
  for (const inv of all.filter((c) => c.kind === "invoice")) {
    const pay = partners(inv, "payment").sort((a, b) => (b.payment?.date ?? "").localeCompare(a.payment?.date ?? "") || Number(b.payment?.number) - Number(a.payment?.number))[0];
    if (pay) step(inv, pay);
  }
  return steps;
}

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

/**
 * The Fire Safety board (owner, 3 Nov: "a separate fire safety dashboard … sales diff, and fire safety diff … any quote
 * that consist of fire safety items, they go in this dashboard"). `fireDocs` = the documents with at least one item whose
 * Zoho "identifier" is Fire Safety ("estimates:<id>", "salesorders:<id>", "invoices:<id>" — salesSync.ts). A whole deal
 * goes together: a quotation, the PIs citing it, the invoices citing those (or the quotation), their payments — and
 * documents merged together on the board. If any of them has a Fire Safety item, the whole deal is on the Fire Safety
 * board and off the Sales board. Returns the card ids ("sale:<kind>:<id>") of those deals.
 */
export function fireDeals(quotes: ZohoQuote[], pis: ZohoPI[], invoices: ZohoInvoice[], payments: ZohoPayment[], events: CardEvent[], fireDocs: Iterable<string>): Set<string> {
  const parent = new Map<string, string>();
  const find = (x: string): string => { let r = x; while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
  const join = (a?: string, b?: string) => { if (!a || !b) return; const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const quoteRef = (r?: string) => r?.match(/Quotation-[\w-]+/i)?.[0];
  const piRef = (r?: string) => r?.match(/Performa-[\w-]+/i)?.[0];
  const quoteBy = new Map(quotes.map((q) => [q.number, saleId("quote", q.estimateId)]));
  const piBy = new Map(pis.map((p) => [p.number, saleId("pi", p.salesorderId)]));
  for (const p of pis) join(saleId("pi", p.salesorderId), quoteBy.get(quoteRef(p.reference) ?? ""));
  for (const i of invoices) {
    const me = saleId("invoice", i.invoiceId);
    join(me, piBy.get(piRef(i.reference) ?? ""));
    join(me, quoteBy.get(quoteRef(i.reference) ?? ""));
  }
  for (const p of payments) join(payCardId(p), saleId("invoice", p.invoiceId));
  // Documents merged on the board belong together too (leads aside — a customer isn't a deal).
  for (const e of events) if (e.kind === "merge" && !e.revertedAt && e.cardIds.every((id) => isSaleCard(id) && kindOfId(id) !== "lead")) join(e.cardIds[0], e.cardIds[1]);
  const KIND: Record<string, CardKind> = { estimates: "quote", salesorders: "pi", invoices: "invoice" };
  const fireRoots = new Set<string>();
  for (const k of fireDocs) { const [kind, id] = k.split(":"); if (KIND[kind] && id) fireRoots.add(find(saleId(KIND[kind], id))); }
  const all = [...quotes.map((q) => saleId("quote", q.estimateId)), ...pis.map((p) => saleId("pi", p.salesorderId)), ...invoices.map((i) => saleId("invoice", i.invoiceId)), ...payments.map(payCardId)];
  return new Set(all.filter((id) => fireRoots.has(find(id))));
}

/**
 * The Sales board without the Fire Safety deals, or the Fire Safety board (those deals only, no Potential Customers).
 * A customer merged into a Fire Safety deal stays off Sales too — else it would come back as a Potential Customer.
 */
export function splitForBoard(board: "sales" | "fire", fire: Set<string>, leads: ZohoLead[], quotes: ZohoQuote[], pis: ZohoPI[], invoices: ZohoInvoice[], payments: ZohoPayment[], events: CardEvent[] = []) {
  const keep = (id: string) => (board === "fire") === fire.has(id);
  const intoFire = new Set(events.filter((e) => e.kind === "merge" && !e.revertedAt && kindOfId(e.cardIds[0]) === "lead" && fire.has(e.cardIds[1])).map((e) => e.cardIds[0]));
  return {
    leads: board === "fire" ? [] : leads.filter((l) => !intoFire.has(saleId("lead", l.contactId))),
    quotes: quotes.filter((q) => keep(saleId("quote", q.estimateId))),
    pis: pis.filter((p) => keep(saleId("pi", p.salesorderId))),
    invoices: invoices.filter((i) => keep(saleId("invoice", i.invoiceId))),
    payments: payments.filter((p) => keep(payCardId(p))),
  };
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
    ...invoices.map((i) => saleId("invoice", i.invoiceId)), ...payments.map(payCardId),
  ]);
  const received = new Map<string, number>();
  for (const p of payments) received.set(p.invoiceId, (received.get(p.invoiceId) ?? 0) + receivedOn([p]));
  // Zoho's balance decides too (owner, 5 Nov): a credit note or a write-off can settle what the payments don't.
  const inFull = (i: ZohoInvoice) => sumMatches(i.total, received.get(i.invoiceId) ?? 0) || (i.balance === 0 && i.status === "paid");
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
  for (const p of payments) paymentsOf.set(p.invoiceId, [...(paymentsOf.get(p.invoiceId) ?? []), payCardId(p)]);
  for (const [from, to] of [...mergedInto]) {
    if (kindOfId(from) !== "invoice" || kindOfId(to) !== "payment") continue;
    for (const pid of paymentsOf.get(from.split(":")[2]) ?? []) if (pid !== to && !mergedInto.has(pid) && !deleted.has(pid)) mergedInto.set(pid, to);
  }
  // Invoices of one PI (owner, 5 Nov): once merged with their payments they're one card, the one holding the PI and quotation.
  const invoicesById = new Map(invoices.map((i) => [saleId("invoice", i.invoiceId), i]));
  const deals = new Map<string, { invoice: string; root: string }[]>();
  for (const [from, to] of mergedInto) {
    const i = invoicesById.get(from);
    const ref = i && kindOfId(to) === "payment" ? dealRef(i) : undefined;
    if (i && ref) deals.set(`${i.customerId}|${ref}`, [...(deals.get(`${i.customerId}|${ref}`) ?? []), { invoice: from, root: to }]);
  }
  for (const members of deals.values()) {
    if (members.length < 2) continue;
    const holds = (m: { invoice: string }) => (sources.get(m.invoice) ?? []).some((id) => kindOfId(id) !== "lead" && mergedInto.get(id) === m.invoice);
    const main = members.find(holds) ?? members[0];
    for (const m of members) if (m.root !== main.root && !mergedInto.has(m.root)) mergedInto.set(m.root, main.root);
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
  // The shares folded into another card first: that card takes in their details.
  const foldedFirst = [...payments].sort((a, b) => Number(mergedInto.has(payCardId(b))) - Number(mergedInto.has(payCardId(a))));
  for (const pay of foldedFirst) {
    const id = payCardId(pay);
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
  const byPaymentDate = (a: ZohoPayment, b: ZohoPayment) => a.date.localeCompare(b.date) || Number(a.number) - Number(b.number);
  for (const c of cards.values()) {
    if (c.kind === "invoice") { c.payments = payments.filter((p) => p.invoiceId === c.invoice!.invoiceId).sort(byPaymentDate); continue; }
    if (c.kind !== "payment") continue;
    const lineageCards = c.historyIds.map((id) => cards.get(id));
    c.payments = lineageCards.flatMap((x) => (x?.kind === "payment" && x.payment ? [x.payment] : [])).sort(byPaymentDate);
    const held = lineageCards.flatMap((x) => (x?.kind === "invoice" && x.invoice ? [x.invoice] : []));
    if (held.length > 1) {
      c.dealInvoices = held.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
      c.search = [c.search, ...held.map((i) => i.number.toLowerCase())].join(" ");
    }
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
    // A split invoice (owner, 5 Nov): its PI went with another invoice of the same deal. That's fine, nothing is wrong here: no note.
    const holder = holderOf(piNo ? (pisByNumber.get(piNo) && saleId("pi", pisByNumber.get(piNo)!.salesorderId)) : quoteNo && quotesByNumber.get(quoteNo) ? saleId("quote", quotesByNumber.get(quoteNo)!.estimateId) : undefined);
    if (holder?.kind === "invoice" || holder?.kind === "payment") continue;
    inv.waitingOn = !ref
      ? "This invoice cites no PI — add the PI number (Performa-…) to its reference in Zoho Books to link it, or keep it here on its own."
      : !holder ? `The reference cites ${ref}, which isn't on the board (not in Zoho, or older than the synced fiscal years).`
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

  // Every column newest first (owner, 3 Nov: "sort it all by recency, the latest comes on top") — a customer box sits
  // where its newest card does.
  const live = [...cards.values()].filter((c) => !c.mergedInto).sort(recentFirst);
  const column = (k: CardKind) => live.filter((c) => c.kind === k && !c.lost);
  return {
    cards, exists, leadCards: column("lead"), quoteCards: column("quote"), piCards: column("pi"),
    invoiceCards: column("invoice"), paymentCards: column("payment"), lostCards: live.filter((c) => c.lost),
  };
}

/** A card's own date: the document's date, or when the customer was created in Zoho (Potential Customers, to the second). */
const cardWhen = (c: CardView) => c.docDate ?? c.customerSince ?? "";
/** Same day: the higher document number first ("Payment #1970" before "#998" — numbers compared as numbers). */
export const recentFirst = (a: CardView, b: CardView) =>
  cardWhen(b).localeCompare(cardWhen(a)) || (b.docNumber ?? "").localeCompare(a.docNumber ?? "", undefined, { numeric: true }) || a.id.localeCompare(b.id);
