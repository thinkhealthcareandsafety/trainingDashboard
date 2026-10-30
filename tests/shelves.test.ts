// Step d's shelves on the engine (query.ts) and the sentence (describe.ts): Columns vs Colour, Tooltip numbers, Label.
import { test } from "node:test";
import assert from "node:assert/strict";
import { type Catalog, registerTables } from "@/lib/analytics/tables";
import { OTHERS, runQuery } from "@/lib/analytics/query";
import { describeSpec } from "@/lib/analytics/describe";

const catalog: Catalog = { tables: [{ id: "9", name: "Orders", rows: 6, columns: [
  { name: "Order Date", type: "date" }, { name: "Region", type: "text" }, { name: "Kind", type: "text" }, { name: "Amount", type: "money" },
] }] };
registerTables(catalog);
const rows = [
  { "Order Date": "2026-07-01", Region: "West", Kind: "AED", Amount: 100 },
  { "Order Date": "2026-07-02", Region: "West", Kind: "Pads", Amount: 50 },
  { "Order Date": "2026-07-03", Region: "North", Kind: "AED", Amount: 300 },
  { "Order Date": "2026-07-04", Region: "South", Kind: "AED", Amount: 20 },
  { "Order Date": "2026-07-05", Region: "East", Kind: "Pads", Amount: 10 },
  { "Order Date": "2026-07-06", Region: "East", Kind: "Pads", Amount: 30 },
];

test("tooltip numbers per Rows value — and for Others when the top N folds the rest", () => {
  const r = runQuery({ dataset: "zt:9", measures: ["sum:Amount"], by: ["Region"], limit: 2, tooltip: ["rows", "avg:Amount"] }, rows);
  assert.deepEqual(r.rows.map((x) => x.keys[0]), ["North", "West", OTHERS]);
  assert.deepEqual(r.tips?.measures.map((m) => m.label), ["Number of rows", "Average of Amount"]);
  assert.deepEqual(r.tips?.byKey.West, [2, 75]);
  assert.deepEqual(r.tips?.byKey[OTHERS], [3, 20]); // South 20 + East 10, 30
  assert.deepEqual(r.tips?.total, [6, 85]);
});

test("Columns and Colour give the same numbers (only the drawing differs); Label changes nothing either", () => {
  const spec = { dataset: "zt:9", measures: ["sum:Amount"], by: ["Region", "Kind"] };
  const colour = runQuery(spec, rows), cols = runQuery({ ...spec, split: "columns" as const, labels: true }, rows);
  assert.deepEqual(cols.rows, colour.rows);
});

test("at most 3 tooltip numbers, each a real measure", () => {
  assert.throws(() => runQuery({ dataset: "zt:9", measures: ["rows"], tooltip: ["rows", "sum:Amount", "avg:Amount", "max:Amount"] }, rows), /At most 3/);
  assert.throws(() => runQuery({ dataset: "zt:9", measures: ["rows"], tooltip: ["sum:Region"] }, rows), /isn't a measure/);
});

test("the sentence says crosstab, labels and what hovering shows", () => {
  const s = describeSpec({ dataset: "zt:9", measures: ["sum:Amount"], by: ["Region", "Kind"], split: "columns", labels: true, tooltip: ["rows"], period: "all" }, "2026-10-30", "matrix");
  assert.match(s, /with a column per kind \(a crosstab\)/);
  assert.match(s, /the numbers written on it/);
  assert.match(s, /hovering also shows Number of rows/);
});
