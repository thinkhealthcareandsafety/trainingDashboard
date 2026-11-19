import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";

// GST summary (owner, 19 Nov): CGST / SGST / IGST of sales (invoices) and purchases (bills), today / this week / this
// year, and the summary as tables in a PDF.

test("a document's GST by tax and rate from Zoho's taxes (UTGST as SGST); a foreign bill in rupees; cess left out", async () => {
  const { gstOf } = await import("@/lib/gst");
  assert.deepEqual(gstOf({ taxes: [{ tax_name: "CGST2.5 (2.5%)", tax_amount: 393.75 }, { tax_name: "SGST2.5 (2.5%)", tax_amount: 393.75 }, { tax_name: "CGST9", tax_amount: 1290.6 }, { tax_name: "SGST9", tax_amount: 1290.6 }] }),
    { "CGST 2.5": 393.75, "SGST 2.5": 393.75, "CGST 9": 1290.6, "SGST 9": 1290.6 });
  assert.deepEqual(gstOf({ taxes: [{ tax_name: "IGST18", tax_amount: 100 }, { tax_name: "Cess", tax_amount: 5 }], exchange_rate: 83 }), { "IGST 18": 8300 });
  assert.deepEqual(gstOf({ taxes: [{ tax_name: "UTGST9", tax_amount: 9 }, { tax_name: "SGST9", tax_amount: 1 }] }), { "SGST 9": 10 });
  assert.deepEqual(gstOf({}), {});
});

test("the rows: the owner's nine (IGST 5 / 18 / 28, CGST and SGST 2.5 / 9 / 14), any other rate after its tax's", async () => {
  const { gstRows, gstPeriods, gstWindows } = await import("@/lib/gst");
  const periods = gstPeriods([{ date: "2026-11-19", split: { "IGST 12": 120, "CGST 9": 9 } }], [], gstWindows("daily", "2026-11-19"), "2026-11-19");
  assert.deepEqual(gstRows(periods).map((r) => r.key), ["IGST 5", "IGST 12", "IGST 18", "IGST 28", "CGST 2.5", "CGST 9", "CGST 14", "SGST 2.5", "SGST 9", "SGST 14"]);
});

test("the periods: today, the week from Monday, the FY from 1 April (monthly: the month and the FY)", async () => {
  const { weekStart, fyStartOf, gstWindows } = await import("@/lib/gst");
  assert.equal(weekStart("2026-11-19"), "2026-11-16"); // Thursday → Monday
  assert.equal(weekStart("2026-11-16"), "2026-11-16");
  assert.equal(weekStart("2026-11-22"), "2026-11-16"); // Sunday belongs to the week before
  assert.equal(fyStartOf("2026-11-19"), "2026-04-01");
  assert.equal(fyStartOf("2027-02-10"), "2026-04-01");
  assert.equal(fyStartOf("2026-04-01"), "2026-04-01");
  assert.deepEqual(gstWindows("daily", "2026-11-19").map((w) => w.from), ["2026-11-19", "2026-11-16", "2026-04-01"]);
  assert.deepEqual(gstWindows("monthly", "2026-11-30").map((w) => w.from), ["2026-11-01", "2026-04-01"]);
});

test("each period adds up its invoices and bills by rate, and sale minus purchase", async () => {
  const { gstPeriods, gstWindows } = await import("@/lib/gst");
  const s = (date: string, split: Record<string, number>) => ({ date, split });
  const sales = [s("2026-11-19", { "CGST 9": 900, "SGST 9": 900 }), s("2026-11-17", { "IGST 18": 1800 }), s("2026-06-01", { "CGST 9": 100, "SGST 9": 100 }), s("2026-03-31", { "CGST 9": 5000, "SGST 9": 5000 })];
  const buys = [s("2026-11-19", { "CGST 9": 450, "SGST 9": 450 }), s("2026-05-05", { "IGST 18": 3600 })];
  const [today, week, year] = gstPeriods(sales, buys, gstWindows("daily", "2026-11-19"), "2026-11-19");
  assert.deepEqual(today.sales, { byRate: { "CGST 9": 900, "SGST 9": 900 }, total: 1800, count: 1 });
  assert.deepEqual(today.net, { byRate: { "CGST 9": 450, "SGST 9": 450 }, total: 900, count: 0 });
  assert.deepEqual(week.sales, { byRate: { "CGST 9": 900, "SGST 9": 900, "IGST 18": 1800 }, total: 3600, count: 2 });
  assert.deepEqual(year.sales, { byRate: { "CGST 9": 1000, "SGST 9": 1000, "IGST 18": 1800 }, total: 3800, count: 3 }); // last FY's left out
  assert.deepEqual(year.purchases.total, 4500);
  assert.deepEqual(year.net, { byRate: { "CGST 9": 550, "SGST 9": 550, "IGST 18": -1800 }, total: -700, count: 0 });
});

async function facts() {
  const { gstPeriods, gstWindows } = await import("@/lib/gst");
  const periods = gstPeriods([{ date: "2026-11-18", split: { "CGST 9": 9000, "SGST 9": 9000 } }], [{ date: "2026-11-02", split: { "IGST 18": 12000 } }], gstWindows("daily", "2026-11-18"), "2026-11-18");
  return {
    kind: "daily" as const, on: "2026-11-18", days: {},
    quotes: [{ number: "QT-1", customer: "Acme Hotels", total: 300000, person: "Sumit A Shah", date: "2026-11-18" }],
    invoices: [{ number: "INV-1", customer: "Delta — Pvt (Ltd)", total: 30000, person: "Pranjal N", date: "2026-11-18" }],
    payments: [{ customer: "Acme Hotels", amount: 50000 }],
    receivable: { balance: 6075000, count: 84, overdue: { balance: 1200000, count: 20 } },
    payable: null,
    stock: { in: [{ item: "Pads", qty: 10, value: 20000, party: "Supplier A" }], out: [] },
    newCustomers: ["New Co", "Second Co", "Third"],
    trainings: { today: [{ customer: "Acme Hotels", training: "CPR", people: 20, trainers: ["Riya Shah"] }], next: [], nextLabel: "Tomorrow" },
    renewals: [],
    gst: { periods, unread: 12 },
    errors: { payable: "Not authorised" },
  };
}

test("the summary as tables: every section in order, a GST table per period, a missing figure is a note", async () => {
  const { summaryTables } = await import("@/lib/summaryTables");
  const d = summaryTables(await facts());
  assert.equal(d.kicker, "Daily summary · Wed, 18 Nov, 2026");
  assert.deepEqual(d.sections.map((s) => s.title), ["Quotations and invoices today", "Month and year pace", "GST summary", "Payments received today", "Total outstanding", "Stock in and out today", "New customers", "Trainings", "AED renewals due in 30 days"]);
  const tables = d.sections[2].blocks.filter((b) => "table" in b).map((b) => ("table" in b ? b.table : null)!);
  assert.equal(tables.length, 3); // today, this week, this year
  const text = (t: (typeof tables)[number]) => t.rows.map((r) => r.cells.map((c) => (typeof c === "string" ? c : c.text)));
  assert.deepEqual(tables[0].columns.map((c) => c.head), ["Today", "Purchase (0 bills)", "Sale (1 invoice)", "Total (sale - purchase)"]);
  assert.deepEqual(text(tables[0]).map((r) => r[0]), ["IGST 5%", "IGST 18%", "IGST 28%", "CGST 2.5%", "CGST 9%", "CGST 14%", "SGST 2.5%", "SGST 9%", "SGST 14%", "Total (IGST + CGST + SGST)"]);
  assert.deepEqual(text(tables[0])[4], ["CGST 9%", "₹0", "₹9,000", "₹9,000"]);
  const year = text(tables[2]);
  assert.deepEqual(year[1], ["IGST 18%", "₹12,000", "₹0", "-₹12,000"]); // November's IGST bill
  assert.deepEqual(year[9], ["Total (IGST + CGST + SGST)", "₹12,000", "₹18,000", "₹6,000"]);
  const noteOf = (i: number) => d.sections[i].blocks.find((b) => "note" in b);
  assert.match(String(noteOf(2) && "note" in noteOf(2)! ? (noteOf(2) as { note: string }).note : ""), /12 invoices \/ bills since 1 April not read/);
  const owed = d.sections[4].blocks[0];
  assert.ok("table" in owed && JSON.stringify(owed.table.rows[2]).includes("Couldn't read this from Zoho (Not authorised)"));
});

test("the PDF: a real PDF; ₹ as Rs, other characters the fonts can't draw as ?", async () => {
  const { summaryTables } = await import("@/lib/summaryTables");
  const { summaryPdf, pdfText } = await import("@/lib/summaryPdf");
  assert.equal(pdfText("₹4.2 L · ▲ 2×"), "Rs 4.2 L · 2×");
  assert.equal(pdfText("Café — 日本"), "Café — ??");
  const bytes = await summaryPdf(summaryTables(await facts()));
  if (process.env.REPORT_OUT) writeFileSync(`${process.env.REPORT_OUT}/summary.pdf`, bytes);
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  assert.ok(bytes.length > 2000);
});
