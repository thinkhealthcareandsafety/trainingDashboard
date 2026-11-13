import { test } from "node:test";
import assert from "node:assert/strict";
import { storyPhases } from "../src/lib/quoteStory";
import type { ZohoInvoice, ZohoPI, ZohoPayment } from "../src/lib/types";

// Zoho's history, newest first, as on Quotation-24-002776 (owner's screenshot, 11 Nov).
const zoho = (text: string, by: string, when: string) => ({ text, by, when });
const history = [
  zoho("Quote updated. Amount changed from Rs.121,170.00 to Rs.84,370.00", "Ashish D", "23 hours ago 10:56 AM"),
  zoho("The custom function quote_set_product_types has been executed by the workflow Set_Product_Type_Rule.", "Zoho Books", "yesterday 11:44 AM"),
  zoho("Quote updated.", "Sumit A Shah", "yesterday 11:44 AM"),
  zoho("Quote converted to Sales Order Performa-25-1185.", "Ashish D", "yesterday 11:44 AM"),
  zoho("Quote emailed to office@himalayanaccess.com", "Ashish D", "9 Nov 10:15 AM"),
  zoho("Quote created for Rs.121,170.00", "Ashish D", "9 Nov 10:02 AM"),
];
const quote = { id: "1", number: "Quotation-24-002776", date: "2026-11-09", status: "invoiced", total: 84370, history, emails: [] };
const pi = { salesorderId: "5", number: "Performa-25-1185", date: "2026-11-10", status: "invoiced", total: 84370, reference: "" } as ZohoPI;
const inv = { invoiceId: "9", number: "2026-01-400", date: "2026-11-10", status: "paid", total: 84370, balance: 0, reference: "Performa-25-1185" } as ZohoInvoice;
const pay = { paymentId: "p1", invoiceId: "9", date: "2026-11-10", amount: 84370 } as ZohoPayment;
const docs = { pis: [pi], invoices: [inv], payments: [pay] };

test("a product quote: Quotation → Performa → Invoice → Payment, each with its status inside; nothing after payment", () => {
  const p = storyPhases({ quote, training: false, docs, today: "2026-11-11" });
  assert.deepEqual(p.map((x) => [x.key, x.state, x.status]), [["quote", "done", "Invoiced"], ["pi", "done", "Invoiced"], ["invoice", "done", "Paid"], ["payment", "done", "Paid in full"]]);
  const q = p[0].lines.join(" | ");
  assert.match(q, /Made 9 Nov 2026 by Ashish D/);
  assert.match(q, /Emailed to office@himalayanaccess\.com/);
  assert.match(q, /Price changed ₹121,170 → ₹84,370/);
});

test("a training quote has the training and certificate phases; not reached yet = ahead", () => {
  const p = storyPhases({ quote, training: true, docs: { pis: [pi], invoices: [], payments: [] }, today: "2026-11-11",
    schedule: { status: "scheduled", dates: ["2026-11-20"], trainers: ["Sumit"], at: "", by: "" } });
  assert.deepEqual(p.map((x) => x.key), ["quote", "pi", "scheduled", "completed", "invoice", "payment", "gratitude", "certs", "stl", "packed", "shipped", "received"]);
  assert.deepEqual(p.filter((x) => x.state === "done").map((x) => x.key), ["quote", "pi", "scheduled"]);
});

test("a declined quote stops at the quotation", () => {
  const p = storyPhases({ quote: { ...quote, status: "declined" }, training: true, docs, today: "2026-11-11" });
  assert.deepEqual(p.map((x) => [x.key, x.state]), [["quote", "stopped"]]);
});

test("a Performa our Trainings page made shows before any Zoho copy has it; Confirmed is green, a draft isn't (owner, 13 Nov)", () => {
  const sent = { ...quote, status: "accepted", history: [] };
  const empty = { pis: [], invoices: [], payments: [] };
  const box = (status: string) => storyPhases({ quote: sent, training: true, docs: empty, today: "2026-11-13", piHint: { number: "Performa-25-1204", status, date: "2026-11-13" } }).find((x) => x.key === "pi")!;
  assert.deepEqual([box("open").state, box("open").status, box("open").tone, box("open").lines[0]], ["done", "Confirmed", "good", "Performa-25-1204"]);
  assert.deepEqual([box("draft").status, box("draft").tone], ["Draft", "info"]);
  const found = storyPhases({ quote: sent, training: true, docs: { ...empty, pis: [{ ...pi, status: "open", reference: "Quotation-24-002776" }] }, today: "2026-11-13" }).find((x) => x.key === "pi")!;
  assert.deepEqual([found.status, found.tone], ["Confirmed", "good"]);
});
