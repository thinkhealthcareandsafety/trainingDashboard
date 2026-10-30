// Joining Zoho tables (src/lib/analytics/joins.ts, tables.ts links two levels deep): which tables can join, the rows
// they make, and that numbers count each table's own rows — no customer counted once per invoice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { type Catalog, type CatalogTable, type Linked, registerTables, tableDataset, tableRows } from "@/lib/analytics/tables";
import { DATE, SOURCE, joinKey, joinedRows, relatedTables } from "@/lib/analytics/joins";
import { datasetOf } from "@/lib/analytics/model";
import { runQuery } from "@/lib/analytics/query";

const T = (id: string, name: string, columns: CatalogTable["columns"]): CatalogTable => ({ id, name, rows: 9, columns });
const customers = T("1", "Customers", [{ name: "Customer ID", type: "number" }, { name: "Customer Name", type: "text" }, { name: "Sector", type: "text" }, { name: "Created Time", type: "date" }]);
const invoices = T("2", "Invoices", [{ name: "Invoice ID", type: "number" }, { name: "Invoice Date", type: "date" }, { name: "Invoice Status", type: "text" },
  { name: "Customer ID", type: "number", link: { table: "Customers", column: "Customer ID" } }, { name: "Total (BCY)", type: "money" }]);
const items = T("3", "Invoice Items", [{ name: "Item ID", type: "number" }, { name: "Invoice ID", type: "number", link: { table: "Invoices", column: "Invoice ID" } }, { name: "Quantity", type: "number" }]);
const payments = T("4", "Customer Payments", [{ name: "Payment ID", type: "number" }, { name: "Payment Date", type: "date" },
  { name: "Customer ID", type: "number", link: { table: "Customers", column: "Customer ID" } }, { name: "Amount (BCY)", type: "money" }]);
const catalog: Catalog = { tables: [customers, invoices, items, payments] };
registerTables(catalog);

const rawCustomers = [
  { "Customer ID": "982417000000000101", "Customer Name": "Acme", Sector: "Healthcare", "Created Time": "2024-01-01" },
  { "Customer ID": "982417000000000102", "Customer Name": "Zen", Sector: "Hospitality", "Created Time": "2025-01-01" },
  { "Customer ID": "982417000000000103", "Customer Name": "Quiet", Sector: "Healthcare", "Created Time": "2025-06-01" }, // no invoices
];
const rawInvoices = [
  { "Invoice ID": "11", "Invoice Date": "2026-07-01", "Invoice Status": "Paid", "Customer ID": "982417000000000101", "Total (BCY)": "1000" },
  { "Invoice ID": "12", "Invoice Date": "2026-08-01", "Invoice Status": "Paid", "Customer ID": "982417000000000101", "Total (BCY)": "500" },
  { "Invoice ID": "13", "Invoice Date": "2026-08-15", "Invoice Status": "Void", "Customer ID": "982417000000000102", "Total (BCY)": "900" },
  { "Invoice ID": "14", "Invoice Date": "2025-12-01", "Invoice Status": "Paid", "Customer ID": "982417000000000102", "Total (BCY)": "300" },
];
const rawPayments = [
  { "Payment ID": "21", "Payment Date": "2026-07-20", "Customer ID": "982417000000000101", "Amount (BCY)": "1200" },
  { "Payment ID": "22", "Payment Date": "2026-08-20", "Customer ID": "982417000000000102", "Amount (BCY)": "300" },
];
const byKey = (t: CatalogTable, raw: Record<string, string>[], col: string) => ({ table: t, rows: new Map(raw.map((r) => [r[col], r])) });

test("which tables can join: the ones pointing here, and the ones sharing its customer", () => {
  assert.deepEqual(relatedTables(customers, catalog).map((r) => `${r.table.name}:${r.kind}`), ["Invoices:child", "Customer Payments:child"]);
  assert.deepEqual(relatedTables(invoices, catalog).map((r) => `${r.table.name}:${r.kind}`), ["Invoice Items:child", "Customer Payments:sibling"]);
});

test("links two levels deep: an invoice line reaches its customer through its invoice", () => {
  const d = tableDataset(items, catalog);
  assert.ok(d.fields.some((f) => f.key === "Invoice ID→Customer ID→Sector"));
  const linked: Linked = new Map([["Invoices", byKey(invoices, rawInvoices, "Invoice ID")], ["Customers", byKey(customers, rawCustomers, "Customer ID")]]);
  const rows = tableRows(items, [{ "Item ID": "1", "Invoice ID": "13", Quantity: "2" }], linked, catalog);
  assert.equal(rows[0]["Invoice ID→Customer ID→Customer Name"], "Zen");
  assert.equal(rows[0]["Invoice ID→Invoice Status"], "Void");
});

const childRows = () => joinedRows({ table: customers, raw: rawCustomers, linked: new Map() },
  [{ ...relatedTables(customers, catalog)[0], raw: rawInvoices, linked: new Map() }], catalog);

test("Customers + their Invoices: by sector, each number counts its own table — and a customer with none is kept", () => {
  const key = joinKey(customers, [invoices]);
  assert.equal(datasetOf(key)?.label, "Customers + Invoices");
  const r = runQuery({ dataset: key, measures: ["rows", "rel:2:sum:Total (BCY)", "rel:2:rows"], by: ["Sector"] }, childRows());
  const at = Object.fromEntries(r.rows.map((x) => [x.keys[0], x.values]));
  assert.deepEqual(at.Healthcare, [2, 1500, 2]); // Acme + Quiet; Acme's two invoices once each
  assert.deepEqual(at.Hospitality, [1, 1200, 2]);
  const quiet = runQuery({ dataset: key, measures: ["rel:2:sum:Total (BCY)"], by: ["Customer Name"] }, childRows());
  assert.equal(quiet.rows.find((x) => x.keys[0] === "Quiet")?.values[0], 0);
});

test("the period picks the invoices, not the customers; a Status filter on invoices keeps the customers", () => {
  const key = joinKey(customers, [invoices]);
  const fy = runQuery({ dataset: key, measures: ["rows", "rel:2:sum:Total (BCY)"], from: "2026-04-01", to: "2027-03-31",
    filters: [{ field: "rel:2:Invoice Status", values: ["Void"], exclude: true }] }, childRows());
  assert.deepEqual(fy.rows[0].values, [3, 1500]); // 3 customers; this FY's paid invoices: 1000 + 500
});

test("Invoices + Customer Payments (same customer): invoiced vs received side by side, by customer and by month", () => {
  const rel = relatedTables(invoices, catalog).find((r) => r.table.name === "Customer Payments")!;
  const customersById = byKey(customers, rawCustomers, "Customer ID");
  const rows = joinedRows({ table: invoices, raw: rawInvoices, linked: new Map([["Customers", customersById]]) },
    [{ ...rel, raw: rawPayments, linked: new Map([["Customers", customersById]]) }], catalog);
  const key = joinKey(invoices, [payments]);
  const byCustomer = runQuery({ dataset: key, measures: ["sum:Total (BCY)", "rel:4:sum:Amount (BCY)"], by: ["Customer ID→Customer Name"] }, rows);
  assert.deepEqual(Object.fromEntries(byCustomer.rows.map((x) => [x.keys[0], x.values])), { Acme: [1500, 1200], Zen: [1200, 300] });
  const byMonth = runQuery({ dataset: key, measures: ["sum:Total (BCY)", "rel:4:sum:Amount (BCY)"], by: [DATE], grain: "month", from: "2026-07-01", to: "2026-08-31" }, rows);
  assert.deepEqual(byMonth.rows.map((x) => [x.keys[0], ...x.values]), [["2026-07", 1000, 1200], ["2026-08", 1400, 300]]);
  assert.deepEqual([...new Set(rows.map((x) => x[SOURCE]))], ["Invoices", "Customer Payments"]);
});
