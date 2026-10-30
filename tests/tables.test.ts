// Zoho Analytics tables as report data (src/lib/analytics/tables.ts, tablesServer.ts columnsOf): types, dates, links,
// who sees which table, and a report run on a table through the engine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { type Catalog, columnType, parseDate, registerTables, tableDataset, tableRows, visibleTables } from "@/lib/analytics/tables";
import { columnsOf } from "@/lib/analytics/tablesServer";
import { measureOf } from "@/lib/analytics/model";
import { runQuery } from "@/lib/analytics/query";

const catalog: Catalog = {
  tables: [
    { id: "1", name: "Invoices", rows: 3, columns: [
      { name: "Invoice ID", type: "number" }, { name: "Invoice Number", type: "text" }, { name: "Invoice Date", type: "date" },
      { name: "Created Time", type: "date" }, { name: "Customer ID", type: "number", link: { table: "Customers", column: "Customer ID" } },
      { name: "Sub Total (BCY)", type: "money" }, { name: "Email", type: "text" },
    ] },
    { id: "2", name: "Customers", rows: 2, columns: [{ name: "Customer ID", type: "number" }, { name: "Customer Name", type: "text" }, { name: "Mobile", type: "text" }] },
    { id: "3", name: "Bills", rows: 9, columns: [{ name: "Bill Date", type: "date" }] },
    { id: "4", name: "Users", rows: 5, columns: [] },
    { id: "5", name: "Empty", rows: 0, columns: [] },
  ],
};

test("Zoho's column types and date formats", () => {
  assert.equal(columnType("Currency"), "money");
  assert.equal(columnType("Positive Number"), "number");
  assert.equal(columnType("Date"), "date");
  assert.equal(columnType("Plain Text"), "text");
  assert.equal(parseDate("20/07/2021"), "2021-07-20");
  assert.equal(parseDate("2024-07-15 17:10:46"), "2024-07-15");
  assert.equal(parseDate("20 Jul, 2021"), "2021-07-20");
  assert.equal(parseDate("soon"), null);
});

test("Zoho metadata → catalog columns: hidden and personal columns left out, links kept", () => {
  const { columns, rows } = columnsOf({ views: { rowCount: "42", columns: [
    { columnName: "Customer ID", dataTypeName: "Number", pkTableName: "Customers", pkColumnName: "Customer ID" },
    { columnName: "Secret", dataTypeName: "Plain Text", isHidden: true },
    { columnName: "PAN", dataTypeName: "Plain Text", isPIIColumn: true },
  ] } });
  assert.equal(rows, 42);
  assert.deepEqual(columns, [{ name: "Customer ID", type: "number", link: { table: "Customers", column: "Customer ID" } }]);
});

test("who sees which table: not empty, not hidden, bookkeeping for Admin only", () => {
  assert.deepEqual(visibleTables(catalog, false).map((t) => t.name), ["Customers", "Invoices"]);
  assert.deepEqual(visibleTables(catalog, true).map((t) => t.name), ["Bills", "Customers", "Invoices"]);
});

test("a table as a dataset: its date, words, linked words; no IDs or contact details", () => {
  const d = tableDataset(catalog.tables[0], catalog);
  assert.equal(d.dateField, "Invoice Date");
  assert.deepEqual(d.fields.map((f) => f.key), ["Invoice Number", "Invoice Date", "Created Time", "Customer ID→Customer Name"]);
  assert.equal(measureOf(d, "sum:Sub Total (BCY)")?.label, "Sum of Sub Total (BCY)");
  assert.equal(measureOf(d, "sum:Email"), undefined);
  assert.equal(tableDataset(catalog.tables[2], catalog).admin, true);
});

test("a report on a table: rows parsed, linked names filled, summed by month", () => {
  registerTables(catalog);
  const raw = [
    { "Invoice Number": "INV-1", "Invoice Date": "05/07/2026", "Customer ID": "10", "Sub Total (BCY)": "1,000.50" },
    { "Invoice Number": "INV-2", "Invoice Date": "20/07/2026", "Customer ID": "11", "Sub Total (BCY)": "INR 2,000" },
    { "Invoice Number": "INV-3", "Invoice Date": "02/08/2026", "Customer ID": "10", "Sub Total (BCY)": "500" },
  ];
  const customers = new Map([["10", { "Customer ID": "10", "Customer Name": "Acme" }], ["11", { "Customer ID": "11", "Customer Name": "Zen" }]]);
  const rows = tableRows(catalog.tables[0], raw, new Map([["Customers", { table: catalog.tables[1], rows: customers }]]));
  assert.equal(rows[1]["Customer ID→Customer Name"], "Zen");
  assert.equal(rows[0]["Sub Total (BCY)"], 1000.5);
  const byMonth = runQuery({ dataset: "zt:1", measures: ["sum:Sub Total (BCY)"], by: ["Invoice Date"], grain: "month" }, rows);
  assert.deepEqual(byMonth.rows.map((r) => r.values[0]), [3000.5, 500]);
  const byCustomer = runQuery({ dataset: "zt:1", measures: ["rows"], by: ["Customer ID→Customer Name"] }, rows);
  assert.deepEqual(Object.fromEntries(byCustomer.rows.map((r) => [r.keys[0], r.values[0]])), { Acme: 2, Zen: 1 });
});
