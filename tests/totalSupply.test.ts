// The Total Supply quotation's sums. The first test uses the owner's real invoice (TS-INV-23-24-191) as the answer key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { type ZEstimate, TS_TEMPLATES, amountInWords, buildTsEmail, buildTsQuote, markedRate, parseMarkups, placeLabel, rollMarkups, tsQuoteNumber } from "@/lib/totalSupply";
import { TEMPLATES } from "@/lib/quoteEmails";

const invoice: ZEstimate = {
  estimate_number: "Quotation-24-1", customer_id: "1", customer_name: "Pratyush enterprises", gst_no: "27AIZPA7623G1ZY", gst_treatment: "business_gst", place_of_supply: "MH",
  sub_total: 123000, discount_percent: 33, discount_total: 40590, is_discount_before_tax: true,
  line_items: [
    { name: "SMART COLOUR DAMP MOP PAD RED", hsn_or_sac: "63071090", quantity: 85, unit: "pcs", rate: 1230, tax_percentage: 5, item_total: 104550 },
    { name: "SMART COLOUR DAMP MOP PAD BLUE", hsn_or_sac: "63071090", quantity: 15, unit: "pcs", rate: 1230, tax_percentage: 5, item_total: 18450 },
  ],
};

test("the discount, GST and rounding add up exactly as on the owner's invoice", () => {
  // 1,230 at +1% would be 1,242, so take the sums at the invoice's own price by building from a price that rounds back to it.
  const atInvoicePrice: ZEstimate = { ...invoice, line_items: invoice.line_items!.map((l) => ({ ...l, rate: 1218, item_total: Number(l.quantity) * 1218 })) };
  const q = buildTsQuote(atInvoicePrice, [1, 1], "Q", "2026-11-05");
  assert.equal(q.lines[0].rate, 1230);
  assert.equal(q.subTotal, 123000);
  assert.equal(q.discount, 40590);
  assert.deepEqual(q.taxes, [{ label: "CGST2.5 (2.5%)", amount: 2060.25 }, { label: "SGST2.5 (2.5%)", amount: 2060.25 }]);
  assert.equal(q.rounding, 0.5);
  assert.equal(q.total, 86531);
  assert.equal(q.place, "Maharashtra (27)");
});

test("every item gets its own percentage, and only the price changes", () => {
  const q = buildTsQuote(invoice, [5, 10], "Q", "2026-11-05");
  assert.deepEqual(q.lines.map((l) => [l.was, l.percent, l.rate, l.qty]), [[1230, 5, 1292, 85], [1230, 10, 1353, 15]]);
  assert.equal(q.lines[0].gst, 5);
  assert.equal(q.discountPercent, 33);
});

test("the owner's example: 100 at 5% is 105", () => assert.equal(markedRate(100, 5), 105));

test("small prices keep their paise, so rounding can't push them past 15%", () => {
  assert.equal(markedRate(8.5, 10), 9.35);
  assert.equal(markedRate(0, 10), 0);
  for (let r = 1; r < 300; r += 7) for (const p of [1, 15]) assert.ok(markedRate(r, p) / r <= 1.155 && markedRate(r, p) > r, `${r} at ${p}%`);
});

test("random percentages are whole numbers from 1 to 15, and both ends are reachable", () => {
  assert.deepEqual(rollMarkups(2, () => 0), [1, 1]);
  assert.deepEqual(rollMarkups(1, () => 0.999999), [15]);
  for (const m of rollMarkups(500)) assert.ok(Number.isInteger(m) && m >= 1 && m <= 15);
});

test("percentages sent back are checked", () => {
  assert.deepEqual(parseMarkups("1,15", 2), [1, 15]);
  for (const bad of ["1", "0,5", "16,5", "1.5,5", "a,5", "", null]) assert.equal(parseMarkups(bad, 2), null, String(bad));
});

test("outside Maharashtra it's IGST; abroad there's no GST", () => {
  const out = buildTsQuote({ ...invoice, place_of_supply: "UP" }, [1, 1], "Q", "2026-11-05");
  assert.equal(out.taxMode, "inter");
  assert.equal(out.taxes[0].label, "IGST5 (5%)");
  assert.equal(out.place, "Uttar Pradesh (09)");
  const abroad = buildTsQuote({ ...invoice, gst_treatment: "overseas" }, [1, 1], "Q", "2026-11-05");
  assert.deepEqual(abroad.taxes, []);
  assert.equal(abroad.lines[0].tax, 0);
});

test("a flat discount becomes the same percentage; shipping and adjustment stay as they were", () => {
  const q = buildTsQuote({ sub_total: 1000, discount_total: 100, shipping_charge: 50, adjustment: -10, gst_treatment: "overseas", line_items: [{ name: "A", quantity: 1, rate: 1000, item_total: 1000 }] }, [10], "Q", "2026-11-05");
  assert.equal(q.subTotal, 1100);
  assert.equal(q.discountPercent, 10);
  assert.equal(q.discount, 110);
  assert.equal(q.total, 1100 - 110 + 50 - 10);
});

test("a discount on the line goes into the price the buyer sees", () => {
  const q = buildTsQuote({ gst_treatment: "overseas", line_items: [{ name: "A", quantity: 2, rate: 1000, item_total: 1800 }] }, [10], "Q", "2026-11-05");
  assert.equal(q.lines[0].was, 900);
  assert.equal(q.lines[0].rate, 990);
});

test("amounts in words, as Books prints them", () => {
  assert.equal(amountInWords(86531), "Indian Rupee Eighty-Six Thousand Five Hundred Thirty-One Only");
  assert.equal(amountInWords(509380), "Indian Rupee Five Lakh Nine Thousand Three Hundred Eighty Only");
  assert.equal(amountInWords(12500000), "Indian Rupee One Crore Twenty-Five Lakh Only");
});

test("the number is the day, then a running ID", () => {
  assert.equal(tsQuoteNumber("2026-11-05", 1), "Quotation-2026-11-05-001");
  assert.equal(tsQuoteNumber("2026-11-05", 1234), "Quotation-2026-11-05-1234");
});

test("state labels: Zoho's codes and our form's", () => {
  assert.equal(placeLabel("TG"), "Telangana (36)");
  assert.equal(placeLabel("TS"), "Telangana (36)");
  assert.equal(placeLabel("CT"), "Chhattisgarh (22)");
});

const compose = { company: "Acme", contact: "Ms Asha Rao", number: "Quotation-2026-11-05-001", total: 105000, expiry: "2026-11-20", salesperson: "Ashish Dalal", signer: "Sumit A Shah", lines: [{ name: "Zoll AED 3", qty: 1, group: "All AEDs", rate: 100000, gst: 5 }] };

test("the email: every template is reworded, signed by Parteek with the number under the name, and says nothing of Think Health", () => {
  assert.deepEqual(TS_TEMPLATES.map((t) => t.id), TEMPLATES.map((t) => t.id));
  for (const t of TS_TEMPLATES) {
    const e = buildTsEmail(t.id, compose);
    assert.match(e.text, /Parteek Nathani\n7417114450\nTotal Supply/, t.id);
    assert.doesNotMatch(`${e.subject} ${e.text}`, /think ?health|sumit|ashish|sales@/i, t.id);
    assert.ok(e.subject.includes(compose.number), t.id);
    assert.ok(e.html.includes("<table"), t.id);
    const main = TEMPLATES.find((x) => x.id === t.id)!;
    assert.notEqual(t.body, main.body, t.id);
  }
});

test("the PDF: real PDF, a terms page, long quotes run on, unprintable characters don't break it", async () => {
  const { tsQuotePdf } = await import("@/lib/totalSupplyPdf");
  const { PDFDocument } = await import("pdf-lib");
  const short = buildTsQuote({ ...invoice, billing_address: { address: "Shop 1", city: "Pune", state: "Maharashtra", zip: "411027", country: "India" } }, [5, 10], "Quotation-2026-11-05-001", "2026-11-05");
  const one = await PDFDocument.load(await tsQuotePdf(short));
  assert.equal(one.getPageCount(), 2);
  const many: ZEstimate = { ...invoice, place_of_supply: "UP", line_items: Array.from({ length: 40 }, (_, i) => ({ name: `Item ${i} ₹ नमस्ते ${"verylongword".repeat(8)}`, description: "Warranty 5 years\nLead time 20 days\n".repeat(3), hsn_or_sac: "90189094", quantity: 2, unit: "pcs", rate: 1000, tax_percentage: 18, item_total: 2000 })) };
  const long = await PDFDocument.load(await tsQuotePdf(buildTsQuote(many, Array(40).fill(7), "Q", "2026-11-05")));
  assert.ok(long.getPageCount() > 3);
  const huge: ZEstimate = { ...invoice, line_items: [{ name: "One long item", description: "A line of description.\n".repeat(200), quantity: 1, rate: 500, item_total: 500, tax_percentage: 5 }] };
  assert.ok((await PDFDocument.load(await tsQuotePdf(buildTsQuote(huge, [3], "Q", "2026-11-05")))).getPageCount() > 2);
});
