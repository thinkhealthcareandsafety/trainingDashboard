// Calculated fields (src/lib/analytics/calc.ts + /api/analytics/fields): the maths on a Zoho table, the sentence,
// and who may make, change and delete them.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { type CalcField, calcProblem, defaultFormat, describeCalc, registerCalcFields } from "@/lib/analytics/calc";
import { type Catalog, registerTables, tableRows } from "@/lib/analytics/tables";
import { datasetOf } from "@/lib/analytics/model";
import { runQuery } from "@/lib/analytics/query";
import { DELETE, GET, POST } from "@/app/api/analytics/fields/route";
import { resetFakeDb } from "./fakes/db";

const catalog: Catalog = { tables: [{ id: "1", name: "Invoices", rows: 4, columns: [
  { name: "Invoice Number", type: "text" }, { name: "Invoice Date", type: "date" }, { name: "Invoice Status", type: "text" },
  { name: "Customer", type: "text" }, { name: "Total (BCY)", type: "money" },
] }] };
registerTables(catalog);
const rows = tableRows(catalog.tables[0], [
  { "Invoice Number": "I1", "Invoice Date": "01/10/2026", "Invoice Status": "Paid", Customer: "A", "Total (BCY)": "INR 1,000.00" },
  { "Invoice Number": "I2", "Invoice Date": "02/10/2026", "Invoice Status": "Paid", Customer: "B", "Total (BCY)": "3,000" },
  { "Invoice Number": "I3", "Invoice Date": "03/10/2026", "Invoice Status": "Overdue", Customer: "A", "Total (BCY)": "2,000" },
  { "Invoice Number": "I4", "Invoice Date": "04/10/2026", "Invoice Status": "Void", Customer: "C", "Total (BCY)": "9,000" },
], new Map());
const d = datasetOf("zt:1")!;
const paid: CalcField = { id: "p", dataset: "zt:1", name: "Paid total", format: "inr", formula: { kind: "filtered", base: "sum:Total (BCY)", filters: [{ field: "Invoice Status", values: ["Paid"] }] } };
const perCustomer: CalcField = { id: "q", dataset: "zt:1", name: "Per customer", format: "inr", formula: { kind: "combine", a: "sum:Total (BCY)", op: "div", b: "distinct:Customer" } };
const share: CalcField = { id: "r", dataset: "zt:1", name: "Paid share", format: "pct", formula: { kind: "combine", a: "sum:Total (BCY)", op: "pct", b: "sum:Total (BCY)" } };
registerCalcFields([paid, perCustomer, share]);

test("a field with conditions, two numbers combined, and in a split", () => {
  const r = runQuery({ dataset: "zt:1", measures: ["calc:p", "calc:q", "sum:Total (BCY)"], filters: [{ field: "Invoice Status", values: ["Void"], exclude: true }] }, rows);
  assert.deepEqual(r.totals, [4000, 3000, 6000]); // 1000 + 3000 paid; 6000 over 2 customers (A, B)
  const by = runQuery({ dataset: "zt:1", measures: ["calc:p"], by: ["Customer"], sort: "label" }, rows);
  assert.deepEqual(by.rows.map((x) => [x.keys[0], x.values[0]]), [["A", 1000], ["B", 3000], ["C", 0]]);
  assert.equal(runQuery({ dataset: "zt:1", measures: ["calc:r"] }, rows).totals[0], 100);
});

test("the sentence, the default format and what can't be saved", () => {
  assert.equal(describeCalc(d, paid), "Sum of Total (BCY) where Invoice Status is “Paid”");
  assert.equal(describeCalc(d, perCustomer), "Sum of Total (BCY) ÷ Count distinct of Customer");
  assert.equal(defaultFormat(d, perCustomer.formula), "inr");
  assert.equal(defaultFormat(d, share.formula), "pct");
  assert.equal(calcProblem({ ...paid, name: " " }), "Give it a name");
  assert.match(calcProblem({ ...paid, formula: { kind: "filtered", base: "sum:Total (BCY)", filters: [] } }) ?? "", /at least one condition/);
  assert.match(calcProblem({ ...perCustomer, formula: { kind: "combine", a: "calc:p", op: "div", b: "rows" } }) ?? "", /another field/);
});

const who = { admin: { id: "admin", name: "Admin" }, sumit: { id: "s", name: "Sumit A Shah" }, ashish: { id: "a", name: "Ashish Dalal" }, arti: { id: "t", name: "Arti Sirohi" } };
const call = async (m: keyof typeof who, method: "GET" | "POST" | "DELETE", body?: unknown, q = "") => {
  const req = new Request(`http://x/api/analytics/fields${q}`, { method, headers: { "x-test-member": JSON.stringify(who[m]), "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const r = await { GET, POST, DELETE }[method](req);
  return { s: r.status, j: await r.json() };
};
beforeEach(() => resetFakeDb());

test("the route: the team makes fields, the maker or Admin changes them, names don't repeat", async () => {
  const field = { dataset: "zt:1", name: "Paid total", format: "inr", formula: paid.formula };
  assert.equal((await call("arti", "POST", { field })).s, 403);
  const made = await call("sumit", "POST", { field });
  assert.equal(made.s, 200);
  assert.equal(made.j.field.createdBy, "Sumit A Shah");
  assert.match((await call("ashish", "POST", { field: { ...field, name: "paid TOTAL" } })).j.error, /already a field/);
  assert.equal((await call("ashish", "POST", { field: { ...field, id: made.j.field.id, name: "Mine now" } })).s, 403);
  assert.equal((await call("admin", "POST", { field: { ...field, id: made.j.field.id, name: "Paid (Admin)" } })).j.field.name, "Paid (Admin)");
  assert.equal((await call("ashish", "GET", undefined, "?dataset=zt:1")).j.fields.length, 1);
  assert.equal((await call("arti", "GET", undefined, "?dataset=zt:1")).s, 403);
  assert.equal((await call("ashish", "GET", undefined, "?dataset=zt:2")).j.fields.length, 0);
  assert.equal((await call("ashish", "DELETE", undefined, `?id=${made.j.field.id}`)).s, 403);
  assert.equal((await call("sumit", "DELETE", undefined, `?id=${made.j.field.id}`)).s, 200);
});
