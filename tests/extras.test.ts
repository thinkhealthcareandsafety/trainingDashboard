// Every other Zoho column (src/lib/analytics/extras.ts): what's kept, how rows carry it, and Sum / Average / Lowest /
// Highest of a number column (REPORT-BUILDER-PLAN step 1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { inferColumns, registerExtras } from "@/lib/analytics/extras";
import { buildRows, type RawTables } from "@/lib/analytics/build";
import { datasetOf, measureOf } from "@/lib/analytics/model";
import { runQuery } from "@/lib/analytics/query";

test("inferColumns keeps non-empty columns with a kind; leaves out IDs, contacts, abbreviated amounts and long notes", () => {
  const rows = [
    { "Invoice ID": "1", "Place of Supply": "MH", "Adjustment (BCY)": "INR 1,000.00", "Expected Payment Date": "05/11/2026", Notes: "a".repeat(80), "Total (BCY)": "INR 954.24K", Email: "x@y.z", Empty: "", Used: "u" },
    { "Invoice ID": "2", "Place of Supply": "GA", "Adjustment (BCY)": "-250", "Expected Payment Date": "", Notes: "b".repeat(80), "Total (BCY)": "INR 1.2L", Email: "", Empty: "", Used: "v" },
  ];
  assert.deepEqual(inferColumns(rows, ["Used"]), [
    { name: "Place of Supply", kind: "text" },
    { name: "Adjustment (BCY)", kind: "number" },
    { name: "Expected Payment Date", kind: "date" },
  ]);
});

test("rows carry the columns; numbers add up only on their own row (invoice lines on Sales)", () => {
  const t: RawTables = {
    invoices: [{ "Invoice ID": "I1", "Invoice Number": "INV-1", "Invoice Date": "10/10/2026", "Invoice Status": "Closed", "Customer ID": "C1", "Sub Total (BCY)": "300", "Balance (BCY)": "0", "Place of Supply": "MH", "Adjustment (BCY)": "50" }],
    invoiceItems: [
      { "Invoice ID": "I1", "Product ID": "P1", "Item Name": "Pads", Quantity: "2", "Sub Total (BCY)": "100", Discount: "10" },
      { "Invoice ID": "I1", "Product ID": "P1", "Item Name": "Pads", Quantity: "4", "Sub Total (BCY)": "200", Discount: "30" },
    ],
    customers: [{ "Customer ID": "C1", "Customer Name": "Acme", "Payment Terms": "Net 30" }],
  };
  const columns = { invoices: [{ name: "Place of Supply", kind: "text" as const }, { name: "Adjustment (BCY)", kind: "number" as const }], invoiceItems: [{ name: "Discount", kind: "number" as const }], customers: [{ name: "Payment Terms", kind: "text" as const }] };
  registerExtras(columns);
  const rows = buildRows(t, [], "2026-10-30", columns);
  assert.equal(rows.sales.length, 2);
  assert.equal(rows.sales[0]["x.invoices.Place of Supply"], "MH");
  assert.equal(rows.sales[0]["x.customers.Payment Terms"], "Net 30");
  assert.ok(!("x.invoices.Adjustment (BCY)" in rows.sales[0]), "a header number is not on the lines");
  assert.equal(rows.invoices[0]["x.invoices.Adjustment (BCY)"], 50);

  const sales = datasetOf("sales")!;
  assert.ok(sales.fields.some((f) => f.key === "x.invoices.Place of Supply" && f.label === "Place of Supply (Invoice)"));
  assert.equal(measureOf(sales, "sum:x.invoiceItems.Discount")?.label, "Sum of Discount (Invoice line)");
  assert.equal(measureOf(sales, "sum:x.invoices.Adjustment (BCY)"), undefined);
  const r = runQuery({ dataset: "sales", measures: ["sum:x.invoiceItems.Discount", "avg:x.invoiceItems.Discount", "min:x.invoiceItems.Discount", "max:x.invoiceItems.Discount"], by: ["x.invoices.Place of Supply"] }, rows.sales);
  assert.deepEqual(r.rows[0].keys, ["MH"]);
  assert.deepEqual(r.rows[0].values, [40, 20, 10, 30]);
});
