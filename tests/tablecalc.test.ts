// Quick table calculations (tablecalc.ts) on the engine: running total, % of total, difference, % change, rank.
import { test } from "node:test";
import assert from "node:assert/strict";
import { type Catalog, registerTables } from "@/lib/analytics/tables";
import { OTHERS, runQuery } from "@/lib/analytics/query";
import { describeSpec, mixedUnits } from "@/lib/analytics/describe";

const catalog: Catalog = { tables: [{ id: "11", name: "Orders", rows: 7, columns: [
  { name: "Order Date", type: "date" }, { name: "Region", type: "text" }, { name: "Kind", type: "text" }, { name: "Amount", type: "money" },
] }] };
registerTables(catalog);
const rows = [
  { "Order Date": "2026-07-01", Region: "West", Kind: "AED", Amount: 100 },
  { "Order Date": "2026-08-02", Region: "West", Kind: "Pads", Amount: 50 },
  { "Order Date": "2026-08-03", Region: "North", Kind: "AED", Amount: 300 },
  { "Order Date": "2026-09-04", Region: "South", Kind: "AED", Amount: 50 },
  { "Order Date": "2026-09-05", Region: "East", Kind: "Pads", Amount: 10 },
  { "Order Date": "2026-09-06", Region: "East", Kind: "Pads", Amount: 30 },
];
const base = { dataset: "zt:11", measures: ["sum:Amount"] };
const byMonth = { ...base, by: ["Order Date"], grain: "month" as const };
const vals = (r: ReturnType<typeof runQuery>, i = 0) => r.rows.map((x) => x.values[i]);

test("running total goes down the months in time order; its total is still the total", () => {
  const r = runQuery({ ...byMonth, calcs: { "sum:Amount": "running" } }, rows);
  assert.deepEqual(vals(r), [100, 450, 540]);
  assert.deepEqual(r.totals, [540]);
  assert.equal(r.measures[0].label, "Sum of Amount (running total)");
  assert.equal(r.measures[0].format, "inr");
});

test("% of total is of the grand total, Others included — and the total is 100%", () => {
  const r = runQuery({ ...base, by: ["Region"], limit: 2, calcs: { "sum:Amount": "pct" } }, rows);
  assert.deepEqual(r.rows.map((x) => x.keys[0]), ["North", "West", OTHERS]);
  assert.deepEqual(vals(r).map((v) => Math.round(v! * 10) / 10), [55.6, 27.8, 16.7]);
  assert.deepEqual(r.totals, [100]);
  assert.equal(r.measures[0].format, "pct");
});

test("difference and % change from the row before; the first row has none, neither has a total", () => {
  const d = runQuery({ ...byMonth, calcs: { "sum:Amount": "diff" } }, rows);
  assert.deepEqual(vals(d), [null, 250, -260]);
  assert.deepEqual(d.totals, [null]);
  const p = runQuery({ ...byMonth, calcs: { "sum:Amount": "pctChange" } }, rows);
  assert.deepEqual(vals(p).map((v) => (v === null ? v : Math.round(v))), [null, 250, -74]);
});

test("rank: 1 = the biggest, ties share a rank, Others has none", () => {
  const r = runQuery({ ...base, by: ["Region"], calcs: { "sum:Amount": "rank" } }, rows);
  // North 300, West 150, South 50, East 40
  assert.deepEqual(Object.fromEntries(r.rows.map((x) => [x.keys[0], x.values[0]])), { North: 1, West: 2, South: 3, East: 4 });
  const tie = runQuery({ ...base, by: ["Region"], calcs: { "sum:Amount": "rank" } }, [...rows, { "Order Date": "2026-09-07", Region: "East", Kind: "AED", Amount: 10 }]);
  assert.deepEqual(Object.fromEntries(tie.rows.map((x) => [x.keys[0], x.values[0]])), { North: 1, West: 2, South: 3, East: 3 });
  const top = runQuery({ ...base, by: ["Region"], limit: 2, calcs: { "sum:Amount": "rank" } }, rows);
  assert.equal(top.rows.find((x) => x.keys[0] === OTHERS)?.values[0], null);
});

test("with a Colour split it runs inside each series; other values on the pill stay as they are", () => {
  const r = runQuery({ ...byMonth, measures: ["sum:Amount", "rows"], by: ["Order Date", "Kind"], calcs: { "sum:Amount": "running" } }, rows);
  const series = (k: string) => r.rows.filter((x) => x.keys[1] === k).map((x) => [x.keys[0], x.values[0], x.values[1]]);
  assert.deepEqual(series("AED"), [["2026-07", 100, 1], ["2026-08", 400, 1], ["2026-09", 450, 1]]);
  assert.deepEqual(series("Pads"), [["2026-08", 50, 1], ["2026-09", 90, 2]]);
});

test("the comparison gets the same calculation", () => {
  const r = runQuery({ ...base, by: ["Region"], from: "2026-09-01", to: "2026-09-30", compare: "previous", calcs: { "sum:Amount": "pct" } }, rows);
  // Sep: South 50, East 40 (of 90). Aug (before): West 50, North 300 (of 350).
  const at = (k: string) => r.rows.find((x) => x.keys[0] === k);
  assert.equal(Math.round(at("South")!.values[0]!), 56);
  assert.equal(at("South")!.prev?.[0], 0);
  assert.deepEqual(r.previous, [100]);
});

test("one number (no Rows) and old reports with no calcs are left as they are; a made-up calc is refused", () => {
  const one = runQuery({ ...base, calcs: { "sum:Amount": "running" } }, rows);
  assert.deepEqual(one.totals, [540]);
  assert.equal(one.measures[0].label, "Sum of Amount");
  const old = runQuery(byMonth, rows);
  assert.deepEqual(vals(old), [100, 350, 90]);
  assert.throws(() => runQuery({ ...byMonth, calcs: { "sum:Amount": "median" as never } }, rows), /isn't a table calculation/);
});

test("the sentence names the calculation, and % of total next to ₹ counts as mixed units", () => {
  const spec = { ...byMonth, measures: ["sum:Amount", "max:Amount"], calcs: { "sum:Amount": "pct" as const } };
  assert.match(describeSpec(spec, "2026-10-31"), /Sum of Amount \(% of total\) and Max of Amount for each month/);
  assert.equal(mixedUnits(spec), true);
  assert.equal(mixedUnits({ ...spec, calcs: undefined }), false);
});
