// The Training board's payment cards (9 Nov): unchanged for a payment that pays one invoice (its merges and Logistics links stay);
// a card per invoice's share only when one payment pays several.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent, ZohoInvoice, ZohoPayment } from "@/lib/types";
import { buildBoard, paymentCardIds } from "@/lib/pipeline";

const base = { createdAt: "2026-10-01T00:00:00.000Z", customerId: "c1", customerName: "Acme", contacts: [], items: [{ name: "First Aid Training", qty: 20 }] };
const inv = (id: string, total: number): ZohoInvoice => ({ ...base, invoiceId: id, number: `2026-01-${id}`, date: "2026-10-10", status: "paid", total, balance: 0 } as unknown as ZohoInvoice);
const pay = (id: string, invoiceId: string, amount: number): ZohoPayment => ({ paymentId: id, number: id, date: "2026-10-12", createdAt: "2026-10-12T00:00:00.000Z", amount, invoiceId, invoiceNumber: `2026-01-${invoiceId}`, customerId: "c1", customerName: "Acme", items: [] } as unknown as ZohoPayment);

test("a payment for one invoice keeps its old card id, so what was saved on it still shows", () => {
  const ps = [pay("p1", "i1", 1000)];
  assert.equal(paymentCardIds(ps)(ps[0]), "payment:p1");
  const note = { id: "e1", at: "2026-10-13T00:00:00.000Z", by: "Shikha", kind: "add_note", value: "Paid by NEFT", cardIds: ["payment:p1"] } as unknown as CardEvent;
  const card = buildBoard([], [], [], [inv("i1", 1000)], ps, [note]).cards.get("payment:p1")!;
  assert.deepEqual((card.notes ?? []).map((n) => n.text), ["Paid by NEFT"]);
});

test("one payment for two invoices: a card per share, neither hidden", () => {
  const ps = [pay("p2", "i1", 1000), pay("p2", "i2", 500)];
  const id = paymentCardIds(ps);
  assert.deepEqual(ps.map(id), ["payment:p2:i1", "payment:p2:i2"]);
  const b = buildBoard([], [], [], [inv("i1", 1000), inv("i2", 500)], ps, []);
  assert.equal(b.cards.get("payment:p2:i1")!.payment!.amount, 1000);
  assert.equal(b.cards.get("payment:p2:i2")!.payment!.amount, 500);
  assert.equal(b.cards.get("payment:p2"), undefined);
});
