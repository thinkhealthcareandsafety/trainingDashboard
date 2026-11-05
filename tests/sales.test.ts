// The Sales board (sales.ts): flags and merges like the Training board, without the training step; its own card ids.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent, ZohoInvoice, ZohoLead, ZohoPayment, ZohoPI, ZohoQuote } from "@/lib/types";
import { buildSalesBoard, fireDeals, mergeAllSteps, payCardId, saleId } from "@/lib/sales";
import { buildBoard, kindOfId, zohoNotices } from "@/lib/pipeline";

const lead: ZohoLead = { contactId: "c1", name: "Acme Hotels", createdAt: "2026-01-01T00:00:00.000Z", lastModified: "2026-01-01T00:00:00.000Z", mobile: "9876543210" };
const base = { createdAt: "2026-10-01T00:00:00.000Z", customerId: "c1", customerName: "Acme Hotels", contacts: [], items: [] };
const quote: ZohoQuote = { ...base, estimateId: "q1", number: "Quotation-24-1", date: "2026-10-01", status: "sent", total: 118000 };
const pi: ZohoPI = { ...base, salesorderId: "p1", number: "Performa-25-1", date: "2026-10-05", status: "open", reference: "Quotation-24-1", total: 118000 };
const inv: ZohoInvoice = { ...base, invoiceId: "i1", number: "2026-01-900", date: "2026-10-10", status: "paid", reference: "Performa-25-1", total: 118000, balance: 0, lastModified: "2026-10-12T00:00:00.000Z" };
const pay: ZohoPayment = { paymentId: "y1", number: "2001", date: "2026-10-12", createdAt: "2026-10-12T00:00:00.000Z", amount: 118000, invoiceId: "i1", invoiceNumber: "2026-01-900", customerId: "c1", customerName: "Acme Hotels", items: [] };
let n = 0;
const merge = (from: string, to: string): CardEvent => ({ id: `e${++n}`, at: `2026-10-20T00:00:0${n}.000Z`, by: "Sumit A Shah", kind: "merge", cardIds: [from, to] } as CardEvent);
const board = (events: CardEvent[] = [], extra: { invoices?: ZohoInvoice[]; payments?: ZohoPayment[] } = {}) =>
  buildSalesBoard([lead], [quote], [pi], extra.invoices ?? [inv], extra.payments ?? [pay], events);

test("its own card ids — and kindOfId reads them", () => {
  const b = board();
  assert.ok(b.cards.has("sale:quote:q1"));
  assert.equal(kindOfId("sale:invoice:i1"), "invoice");
  assert.equal(kindOfId("quote:q1"), "quote");
});

test("flags: Lead ↔ Quote, Quote ↔ PI (reference), PI ↔ Invoice (reference, no training step), Invoice ↔ Payment (paid in full)", () => {
  const b = board();
  assert.deepEqual(b.cards.get(saleId("lead", "c1"))!.flaggedWith, [saleId("quote", "q1")]);
  assert.ok(b.cards.get(saleId("quote", "q1"))!.flaggedWith.includes(saleId("pi", "p1")));
  assert.ok(b.cards.get(saleId("pi", "p1"))!.flaggedWith.includes(saleId("invoice", "i1")));
  assert.ok(b.cards.get(saleId("invoice", "i1"))!.flaggedWith.includes(payCardId(pay)));
});

test("merging Lead → Quote → PI → Invoice → Payment moves it to Payment received, carrying the customer's details", () => {
  const b = board([merge("sale:lead:c1", "sale:quote:q1"), merge("sale:quote:q1", "sale:pi:p1"), merge("sale:pi:p1", "sale:invoice:i1"), merge("sale:invoice:i1", "sale:payment:y1:i1")]);
  assert.equal(b.leadCards.length, 0);
  assert.equal(b.quoteCards.length + b.piCards.length + b.invoiceCards.length, 0);
  assert.equal(b.paymentCards.length, 1);
  const p = b.paymentCards[0];
  assert.deepEqual(p.historyIds.sort(), ["sale:invoice:i1", "sale:lead:c1", "sale:payment:y1:i1", "sale:pi:p1", "sale:quote:q1"]);
  assert.equal(p.phones[0]?.value, "9876543210");
  assert.equal(p.linkedQuote?.number, "Quotation-24-1");
});

test("a part-paid invoice waits; its payment explains why and isn't flagged", () => {
  const part = { ...inv, status: "partially_paid", balance: 18000 };
  const b = board([], { invoices: [part], payments: [{ ...pay, amount: 100000 }] });
  const p = b.cards.get(payCardId(pay))!;
  assert.equal(p.flaggedWith.length, 0);
  assert.match(p.waitingOn ?? "", /payments add up/);
});

test("Training board events don't move Sales cards (a mixed document moves on each board by itself)", () => {
  const training = [merge("lead:c1", "quote:q1")];
  const b = board(training);
  assert.equal(b.leadCards.length, 1);
  const t = buildBoard([lead], [quote], [], [], [], [merge("sale:lead:c1", "sale:quote:q1")]);
  assert.equal(t.leadCards.length, 1, "and the other way round");
});

test("a quotation declined in Zoho is a lost deal; deleting a document sends the customer back", () => {
  const b = buildSalesBoard([lead], [{ ...quote, status: "declined" }], [], [], [], []);
  assert.equal(b.lostCards.length, 1);
  const del = { id: "d1", at: "2026-10-21T00:00:00.000Z", by: "Admin", kind: "delete", cardIds: ["sale:quote:q1", "sale:lead:c1"] } as CardEvent;
  const d = board([merge("sale:lead:c1", "sale:quote:q1"), del]);
  assert.equal(d.leadCards.length, 1);
  assert.ok(d.cards.get("sale:quote:q1")!.deleted);
});

test("Merge all flagged: the whole chain in one go, each card into one card, nothing left flagged", async () => {
  const { mergeAllSteps } = await import("@/lib/sales");
  const b = board();
  const steps = mergeAllSteps(b.cards).map(([f, t]) => `${f.id} > ${t.id}`);
  assert.deepEqual(steps, ["sale:quote:q1 > sale:pi:p1", "sale:lead:c1 > sale:quote:q1", "sale:pi:p1 > sale:invoice:i1", "sale:invoice:i1 > sale:payment:y1:i1"]);
  const events = mergeAllSteps(b.cards).map(([f, t]) => ({ ...merge(f.id, t.id), mode: "all" as const }));
  const after = board(events);
  assert.equal(after.paymentCards.length, 1);
  assert.equal([...after.cards.values()].filter((c) => !c.mergedInto && c.flaggedWith.length).length, 0);
  // A customer with two quotations: the lead goes into the newest; the older one stays as it is.
  const older: ZohoQuote = { ...quote, estimateId: "q0", number: "Quotation-24-0", date: "2026-09-01" };
  const two = buildSalesBoard([lead], [older, quote], [], [], [], []);
  assert.deepEqual(mergeAllSteps(two.cards).map(([f, t]) => `${f.id} > ${t.id}`), ["sale:lead:c1 > sale:quote:q1"]);
});

test("Work done counts a Merge all once (per person per day)", async () => {
  const { buildDone } = await import("@/lib/progress/todos");
  const evs = [1, 2, 3].map((i) => ({ id: `m${i}`, at: `2026-10-30T10:00:0${i}.000Z`, by: "Sumit A Shah", kind: "merge", mode: "all", cardIds: [`sale:lead:c${i}`, `sale:quote:q${i}`] }) as CardEvent);
  const done = buildDone([{ id: "sumit", name: "Sumit A Shah" }], evs, () => undefined, [], new Date("2026-10-30T12:00:00Z"));
  assert.equal(done.length, 1);
  assert.equal(done[0].count, 3);
  assert.equal(done[0].tag, "Merged all flagged cards");
});

test("Sales merges never get a \"no longer in Zoho Books\" notice from the Training board (31 Oct: 2,650 false ones)", () => {
  const training = buildBoard([lead], [quote], [pi], [inv], [pay], []);
  const sale = merge(saleId("quote", "q1"), saleId("pi", "p1"));
  assert.deepEqual(zohoNotices([sale], training.exists, training.cards, "2026-11-01T00:00:00.000Z"), []);
  // A Training board merge whose document is gone still gets its notice.
  const gone = merge("quote:q1", "pi:gone");
  assert.equal(zohoNotices([gone], training.exists, training.cards, "2026-11-01T00:00:00.000Z").length, 1);
});

test("every column newest first; same day: the higher number first (owner, 3 Nov)", async () => {
  const { recentFirst } = await import("@/lib/sales");
  const q = (id: string, date: string, number: string) => ({ ...quote, estimateId: id, date, number });
  const b = buildSalesBoard([lead], [q("a", "2026-03-27", "Quotation-24-001794"), q("b", "2026-11-02", "Quotation-24-002746"), q("c", "2026-11-02", "Quotation-24-002745"), q("d", "2026-10-29", "Quotation-24-002729")], [], [], [], []);
  assert.deepEqual(b.quoteCards.map((c) => c.docNumber), ["Quotation-24-002746", "Quotation-24-002745", "Quotation-24-002729", "Quotation-24-001794"]);
  const pays = [b.cards.get(saleId("quote", "a"))!, b.cards.get(saleId("quote", "d"))!].map((c, i) => ({ ...c, docDate: "2026-11-02", docNumber: ["Payment #998", "Payment #1970"][i] }));
  assert.deepEqual(pays.sort(recentFirst).map((c) => c.docNumber), ["Payment #1970", "Payment #998"]);
});

test("Fire Safety (owner, 3 Nov): a deal with a Fire Safety item anywhere goes to the Fire Safety board, whole, and off Sales", async () => {
  const { fireDeals, splitForBoard } = await import("@/lib/sales");
  const q2: ZohoQuote = { ...quote, estimateId: "q2", number: "Quotation-24-2" };
  // The PI (not the quote) holds the Fire Safety item: quote, PI, invoice and payment all go.
  const fire = fireDeals([quote, q2], [pi], [inv], [pay], [], ["salesorders:p1"]);
  assert.deepEqual([...fire].sort(), [saleId("invoice", "i1"), payCardId(pay), saleId("pi", "p1"), saleId("quote", "q1")].sort());
  const salesSide = splitForBoard("sales", fire, [lead], [quote, q2], [pi], [inv], [pay]);
  assert.deepEqual(salesSide.quotes.map((q) => q.number), ["Quotation-24-2"]);
  assert.equal(salesSide.leads.length, 1);
  assert.equal(salesSide.pis.length + salesSide.invoices.length + salesSide.payments.length, 0);
  const fireSide = splitForBoard("fire", fire, [lead], [quote, q2], [pi], [inv], [pay]);
  assert.equal(fireSide.leads.length, 0); // no Potential Customers on the Fire Safety board
  assert.deepEqual(fireSide.quotes.map((q) => q.number), ["Quotation-24-1"]);
  // A merge joins documents the references don't (q2 merged into the fire PI by hand).
  const joined = fireDeals([quote, q2], [pi], [inv], [pay], [merge(saleId("quote", "q2"), saleId("pi", "p1"))], ["salesorders:p1"]);
  assert.ok(joined.has(saleId("quote", "q2")));
  // Nothing marked: nothing moves.
  assert.equal(fireDeals([quote], [pi], [inv], [pay], [], []).size, 0);
});

test("a customer merged into a Fire Safety deal doesn't come back to Sales' Potential Customers", async () => {
  const { fireDeals, splitForBoard } = await import("@/lib/sales");
  const m = merge(saleId("lead", "c1"), saleId("quote", "q1"));
  const fire = fireDeals([quote], [], [], [], [m], ["estimates:q1"]);
  assert.equal(splitForBoard("sales", fire, [lead], [quote], [], [], [], [m]).leads.length, 0);
  assert.equal(splitForBoard("sales", fire, [lead], [quote], [], [], [], []).leads.length, 1);
});

/* Split invoices and shared payments (owner, 5 Nov). The figures are the real Disney and Shanti Metal ones. */
const disneyBase = { ...base, customerId: "d1", customerName: "Disney" };
const dq: ZohoQuote = { ...disneyBase, estimateId: "dq", number: "Quotation-24-002511", date: "2026-09-12", status: "invoiced", total: 990982 };
const dpi: ZohoPI = { ...disneyBase, salesorderId: "dp", number: "Performa-25-1028", date: "2026-09-19", status: "invoiced", reference: "Quotation-24-002511", total: 990982 };
const dInv = (id: string, number: string, total: number, balance: number): ZohoInvoice => ({ ...inv, ...disneyBase, invoiceId: id, number, date: "2026-09-23", reference: "Performa-25-1028", total, balance, status: balance ? "overdue" : "paid" });
const d404 = dInv("404", "2026-01-404", 45718, 0), d405 = dInv("405", "2026-01-405", 903240, 0), d406 = dInv("406", "2026-01-406", 39900, 0), d407 = dInv("407", "2026-01-407", 2124, 2124);
const share = (id: string, number: string, i: ZohoInvoice, amount: number, tdsWithheld = 0, date = "2026-11-04"): ZohoPayment => ({ ...pay, customerId: i.customerId, customerName: i.customerName, paymentId: id, number, date, createdAt: `${date}T00:00:00.000Z`, amount, tdsWithheld, invoiceId: i.invoiceId, invoiceNumber: i.number });
const p1978 = [share("1978", "1978", d404, 45292, 426), share("1978", "1978", d405, 894660, 8580), share("1978", "1978", d406, 39520, 380)];
const disney = (events: CardEvent[] = []) => buildSalesBoard([], [dq], [dpi], [d404, d405, d406, d407], p1978, events);
const runAll = (b: ReturnType<typeof disney>) => mergeAllSteps(b.cards).map(([from, to]) => merge(from.id, to.id));

test("one payment across three invoices: a card per invoice's share, nothing lost", () => {
  const b = disney();
  assert.equal(b.paymentCards.length, 3);
  assert.deepEqual(b.paymentCards.map((c) => c.payment!.amount).sort((x, y) => x - y), [39520, 45292, 894660]);
  for (const i of [d404, d405, d406]) {
    const c = b.cards.get(saleId("invoice", i.invoiceId))!;
    assert.equal(c.paidInFull, true, i.number);
    assert.equal(c.payments!.length, 1, i.number); // no more "not paid yet"
    assert.ok(c.flaggedWith.includes(payCardId({ paymentId: "1978", invoiceId: i.invoiceId })), i.number);
  }
});

test("a split invoice says nothing about being 'already merged' once its PI went with another", () => {
  const b = disney([merge(saleId("quote", "dq"), saleId("pi", "dp")), merge(saleId("pi", "dp"), saleId("invoice", "404"))]);
  for (const id of ["405", "406", "407"]) assert.equal(b.cards.get(saleId("invoice", id))!.waitingOn, undefined, id);
});

test("Merge all: quote, PI and the paid invoices become one card with the whole payment; the unpaid invoice stays in Invoice sent", () => {
  const events = runAll(disney());
  const after = disney(events);
  assert.equal(after.paymentCards.length, 1);
  const c = after.paymentCards[0];
  assert.deepEqual(c.dealInvoices!.map((i) => i.number), ["2026-01-404", "2026-01-405", "2026-01-406"]);
  assert.equal(c.payments!.reduce((s, p) => s + p.amount, 0), 979472);
  assert.equal(c.payments!.reduce((s, p) => s + (p.tdsWithheld ?? 0), 0), 9386);
  assert.equal(c.linkedPI?.number, "Performa-25-1028");
  assert.equal(c.linkedQuote?.number, "Quotation-24-002511");
  assert.match(c.search, /2026-01-405/);
  assert.deepEqual(after.invoiceCards.map((x) => x.docNumber), ["2026-01-407"]);
  assert.equal(after.invoiceCards[0].paidInFull, false);
  assert.equal(after.quoteCards.length + after.piCards.length, 0);
  assert.equal(mergeAllSteps(after.cards).length, 0); // nothing left to do
});

test("the PI goes with a paid invoice, even when the unpaid one is older", () => {
  const older = { ...d407, date: "2026-09-01" };
  const b = buildSalesBoard([], [dq], [dpi], [older, d405], [share("1978", "1978", d405, 894660, 8580)], []);
  const step = mergeAllSteps(b.cards).find(([from]) => from.kind === "pi");
  assert.equal(step?.[1].docNumber, "2026-01-405");
});

test("when the last invoice is paid it joins the card; unmerging one lets it come apart", () => {
  const paid407: ZohoInvoice = { ...d407, balance: 0, status: "paid" };
  const pays = [...p1978, share("2000", "2000", paid407, 2124, 0, "2026-11-05")];
  const build = (ev: CardEvent[]) => buildSalesBoard([], [dq], [dpi], [d404, d405, d406, paid407], pays, ev);
  const first = build(runAll(disney()));
  const more = mergeAllSteps(first.cards).map(([from, to]) => merge(from.id, to.id));
  assert.equal(more.length, 1);
  const all = [...runAll(disney()), ...more];
  const after = build(all);
  assert.equal(after.paymentCards.length, 1);
  assert.equal(after.paymentCards[0].dealInvoices!.length, 4);
  assert.equal(after.invoiceCards.length, 0);
  // Undo 405's own merge: it and its share go back on their own, the rest stays.
  const undone = build(all.map((e) => (e.cardIds[0] === saleId("invoice", "405") ? { ...e, revertedAt: "2026-11-06T00:00:00.000Z" } : e)));
  assert.deepEqual(undone.invoiceCards.map((x) => x.docNumber), ["2026-01-405"]);
  assert.equal(undone.paymentCards.length, 2);
});

const shanti = { ...base, customerId: "s1", customerName: "Shanti Metal" };
const s624: ZohoInvoice = { ...inv, ...shanti, invoiceId: "624", number: "2025-01-624", reference: "Performa-25-545", total: 27753.6, balance: 0, status: "paid" };
const s571: ZohoInvoice = { ...inv, ...shanti, invoiceId: "571", number: "2025-01-571", reference: "Performa-25-519", total: 367008.8, balance: 0, status: "paid" };
const sPays = [share("682", "682", s624, 6384, 0, "2024-12-18"), share("1447", "1447", s624, 21240, 0, "2026-02-19"), share("1444", "1444", s571, 105495, 0, "2026-02-14"), share("1447", "1447", s571, 261513.8, 0, "2026-02-19")];

test("a transfer shared by two deals doesn't join them; each invoice has all its payments", () => {
  const b = buildSalesBoard([], [], [], [s624, s571], sPays, []);
  const events = mergeAllSteps(b.cards).map(([from, to]) => merge(from.id, to.id));
  const after = buildSalesBoard([], [], [], [s624, s571], sPays, events);
  assert.equal(after.paymentCards.length, 2);
  const of = (n: string) => after.paymentCards.find((c) => c.linkedInvoice?.number === n)!;
  assert.deepEqual(of("2025-01-624").payments!.map((p) => [p.number, p.amount]), [["682", 6384], ["1447", 21240]]);
  assert.deepEqual(of("2025-01-571").payments!.map((p) => [p.number, p.amount]), [["1444", 105495], ["1447", 261513.8]]);
  assert.equal(of("2025-01-624").dealInvoices, undefined);
});

test("Zoho's balance of 0 counts as paid, even with ₹129.60 not covered by payments; a real shortfall doesn't", () => {
  assert.equal(buildSalesBoard([], [], [], [s624], sPays.slice(0, 2), []).cards.get(saleId("invoice", "624"))!.paidInFull, true);
  const short = { ...s624, balance: 129.6, status: "partially_paid" };
  assert.equal(buildSalesBoard([], [], [], [short], sPays.slice(0, 2), []).cards.get(saleId("invoice", "624"))!.paidInFull, false);
});

test("merges made with the old payment id simply don't apply any more", () => {
  const b = disney([merge(saleId("invoice", "405"), "sale:payment:1978")]);
  assert.equal(b.cards.get(saleId("invoice", "405"))!.mergedInto, undefined);
});

test("Fire Safety: a shared transfer doesn't drag another deal onto the Fire board", () => {
  const fire = fireDeals([], [], [s624, s571], sPays, [], ["invoices:624"]);
  assert.ok(fire.has(saleId("invoice", "624")) && fire.has(payCardId({ paymentId: "1447", invoiceId: "624" })));
  assert.ok(!fire.has(saleId("invoice", "571")) && !fire.has(payCardId({ paymentId: "1447", invoiceId: "571" })));
});
