// The Sales board (sales.ts): flags and merges like the Training board, without the training step; its own card ids.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent, ZohoInvoice, ZohoLead, ZohoPayment, ZohoPI, ZohoQuote } from "@/lib/types";
import { buildSalesBoard, saleId } from "@/lib/sales";
import { buildBoard, kindOfId } from "@/lib/pipeline";

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
  assert.ok(b.cards.get(saleId("invoice", "i1"))!.flaggedWith.includes(saleId("payment", "y1")));
});

test("merging Lead → Quote → PI → Invoice → Payment moves it to Payment received, carrying the customer's details", () => {
  const b = board([merge("sale:lead:c1", "sale:quote:q1"), merge("sale:quote:q1", "sale:pi:p1"), merge("sale:pi:p1", "sale:invoice:i1"), merge("sale:invoice:i1", "sale:payment:y1")]);
  assert.equal(b.leadCards.length, 0);
  assert.equal(b.quoteCards.length + b.piCards.length + b.invoiceCards.length, 0);
  assert.equal(b.paymentCards.length, 1);
  const p = b.paymentCards[0];
  assert.deepEqual(p.historyIds.sort(), ["sale:invoice:i1", "sale:lead:c1", "sale:payment:y1", "sale:pi:p1", "sale:quote:q1"]);
  assert.equal(p.phones[0]?.value, "9876543210");
  assert.equal(p.linkedQuote?.number, "Quotation-24-1");
});

test("a part-paid invoice waits; its payment explains why and isn't flagged", () => {
  const part = { ...inv, status: "partially_paid", balance: 18000 };
  const b = board([], { invoices: [part], payments: [{ ...pay, amount: 100000 }] });
  const p = b.cards.get(saleId("payment", "y1"))!;
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
