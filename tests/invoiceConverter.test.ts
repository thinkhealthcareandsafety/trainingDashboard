import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { ewayFileName, groupByCustomer, isEwayFile, isPoFile, needsEway, poFileName, poState } from "@/lib/invoiceConverterRules";
import { db } from "@/lib/db";
import { resetFakeDb } from "./fakes/db";

// The Invoice Converter (owner, 17 Nov): customers, their invoices, the PO and (over ₹50,000) the e-way bill.

beforeEach(() => resetFakeDb());

test("PO: a real number ticks; Verbal, NA, dashes or nothing cross", () => {
  assert.deepEqual(poState("1000033706"), { ok: true, label: "1000033706" });
  assert.deepEqual(poState(" 6566219 - OP - 4470300006 "), { ok: true, label: "6566219 - OP - 4470300006" });
  assert.deepEqual(poState("Verbal"), { ok: false, label: "Verbal" });
  assert.equal(poState("NA").ok, false);
  assert.equal(poState("--").ok, false);
  assert.deepEqual(poState(undefined), { ok: false, label: "No PO" });
});

test("e-way bills over ₹50,000; our attachment names are told apart", () => {
  assert.equal(needsEway(50_000), false);
  assert.equal(needsEway(51_531), true);
  assert.equal(poFileName("2026-01-525"), "PO - 2026-01-525.pdf");
  assert.equal(ewayFileName("2026-01-525"), "E-way bill - 2026-01-525.pdf");
  assert.ok(isPoFile("PO - 2026-01-525.pdf") && isPoFile("Purchase Order 4470.pdf") && !isPoFile("Poster.pdf"));
  assert.ok(isEwayFile("E-way bill - 2026-01-525.pdf") && isEwayFile("eway 2323.pdf") && !isEwayFile("PO - 1.pdf"));
});

test("customers newest first, their invoices newest first, and how many still miss something", () => {
  const inv = (customerId: string, number: string, date: string, total: number, poOk: boolean, extra: Partial<{ poPdf: boolean; eway: string | null; ewayPdf: boolean }> = {}) =>
    ({ customerId, customerName: customerId.toUpperCase(), id: number, number, date, total, status: "sent", po: poOk ? "123" : "Verbal", poOk, poPdf: false, eway: null, ewayPdf: false, needsEway: needsEway(total), pending: false, ...extra });
  const g = groupByCustomer([
    inv("a", "1", "2026-10-01", 9000, true, { poPdf: true }),
    inv("b", "2", "2026-11-10", 80000, true, { poPdf: true, eway: "232328638953", ewayPdf: true }),
    inv("a", "3", "2026-11-12", 60000, false),
  ]);
  assert.deepEqual(g.map((c) => [c.id, c.invoices.map((i) => i.number), c.missing]), [["a", ["3", "1"], 1], ["b", ["2"], 0]]);
});

test("the converter reads the Sales copy: invoices by customer, the PO from the invoice field; small ones need no Zoho read", async () => {
  const { converterData } = await import("@/lib/invoiceConverter");
  const docs = (await db()).collection<{ _id: string; kind: string; id: string; lmt: string; date: string; row: Record<string, unknown> }>("salesDocs");
  await docs.insertOne({ _id: "invoices:11", kind: "invoices", id: "11", lmt: "x", date: "2026-11-01", row: { invoice_number: "2026-01-600", date: "2026-11-01", status: "sent", customer_id: "c1", customer_name: "The Grand", total: 22404, cf_purchase_order_number: "PO26-2008-V1" } });
  await docs.insertOne({ _id: "invoices:12", kind: "invoices", id: "12", lmt: "x", date: "2026-11-02", row: { invoice_number: "2026-01-601", date: "2026-11-02", status: "sent", customer_id: "c1", customer_name: "The Grand", total: 30975, cf_purchase_order_number: "Verbal" } });
  await docs.insertOne({ _id: "estimates:9", kind: "estimates", id: "9", lmt: "x", date: "2026-11-02", row: { estimate_number: "Q-1", total: 5 } });
  const r = await converterData();
  assert.equal(r.pending, 0);
  assert.equal(r.customers.length, 1);
  assert.deepEqual(r.customers[0].invoices.map((i) => [i.number, i.po, i.poOk, i.needsEway]), [["2026-01-601", "Verbal", false, false], ["2026-01-600", "PO26-2008-V1", true, false]]);
  assert.equal(r.customers[0].missing, 2); // neither has a PO PDF yet
});
