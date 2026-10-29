// The report engine (src/lib/analytics/query.ts) on a few hand-made sales lines: every number checked by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { OTHERS, SpecError, checkSpec, runQuery } from "@/lib/analytics/query";
import type { Row } from "@/lib/analytics/model";

const line = (date: string, customer: string, sector: string, amount: number, qty: number, invoice: string, repeat = "Repeat"): Row =>
  ({ date, customer, sector, amount, qty, invoice, repeat, salesperson: "Sumit A Shah", zohoItem: customer === "C" ? "Pads" : "AED" });
const rows: Row[] = [
  line("2026-04-10", "A", "IT", 100_000, 1, "I1", "First invoice"),
  line("2026-04-20", "A", "IT", 50_000, 2, "I2"),
  line("2026-05-05", "B", "Aviation", 300_000, 3, "I3", "First invoice"),
  line("2026-06-01", "C", "Healthcare & Life Sciences", 20_000, 4, "I4"),
  line("2026-06-02", "D", "Traders", 10_000, 1, "I5"),
  // last year, for comparisons
  line("2025-04-15", "A", "IT", 80_000, 1, "J1"),
  line("2025-06-30", "B", "Aviation", 40_000, 1, "J2"),
];
const q = (spec: Parameters<typeof runQuery>[0]) => runQuery(spec, rows);

test("sums, distinct counts and ratios", () => {
  const r = q({ dataset: "sales", measures: ["revenue", "invoices", "customers", "units", "avgPrice"], from: "2026-04-01", to: "2027-03-31" });
  assert.deepEqual(r.totals, [480_000, 5, 4, 11, 480_000 / 11]);
  assert.equal(r.matched, 5);
});

test("a measure over some rows only (where) and a share of two measures", () => {
  const r = q({ dataset: "sales", measures: ["repeatRevenue", "repeatShare"], from: "2026-04-01", to: "2027-03-31" });
  assert.equal(r.totals[0], 80_000);
  assert.equal(r.totals[1], (80_000 / 480_000) * 100);
});

test("filters: is, is not, contains", () => {
  const fy = { from: "2026-04-01", to: "2027-03-31" };
  assert.equal(q({ dataset: "sales", measures: ["revenue"], ...fy, filters: [{ field: "sector", values: ["IT", "Traders"] }] }).totals[0], 160_000);
  assert.equal(q({ dataset: "sales", measures: ["revenue"], ...fy, filters: [{ field: "sector", values: ["IT"], exclude: true }] }).totals[0], 330_000);
  assert.equal(q({ dataset: "sales", measures: ["revenue"], ...fy, filters: [{ field: "sector", values: [], contains: "health" }] }).totals[0], 20_000);
  // two filters both apply
  assert.equal(q({ dataset: "sales", measures: ["revenue"], ...fy, filters: [{ field: "sector", values: ["IT"] }, { field: "customer", values: ["B"] }] }).totals[0], 0);
});

test("the date range keeps only its days", () => {
  assert.equal(q({ dataset: "sales", measures: ["revenue"], from: "2026-04-15", to: "2026-05-31" }).totals[0], 350_000);
});

test("top N, biggest first, the rest as Others (which adds up)", () => {
  const r = q({ dataset: "sales", measures: ["revenue"], by: ["customer"], limit: 2, from: "2026-04-01", to: "2027-03-31" });
  assert.deepEqual(r.rows.map((x) => x.keys[0]), ["B", "A", OTHERS]);
  assert.deepEqual(r.rows.map((x) => x.values[0]), [300_000, 150_000, 30_000]);
  assert.equal(r.rows.reduce((s, x) => s + (x.values[0] ?? 0), 0), r.totals[0]);
});

test("by month: one row per month, in date order", () => {
  const r = q({ dataset: "sales", measures: ["revenue"], by: ["date"], grain: "month", from: "2026-04-01", to: "2026-06-30" });
  assert.deepEqual(r.rows.map((x) => [x.keys[0], x.values[0]]), [["2026-04", 150_000], ["2026-05", 300_000], ["2026-06", 30_000]]);
});

test("by financial quarter: April–June is Q1", () => {
  const r = q({ dataset: "sales", measures: ["revenue"], by: ["date"], grain: "quarter", from: "2026-04-01", to: "2026-06-30" });
  assert.deepEqual(r.rows.map((x) => x.keys[0]), ["2026-Q1"]);
});

test("compared with last year: the same dates a year earlier", () => {
  const r = q({ dataset: "sales", measures: ["revenue"], from: "2026-04-01", to: "2026-06-30", compare: "lastYear" });
  assert.equal(r.totals[0], 480_000);
  assert.equal(r.previous?.[0], 120_000);
  assert.equal(r.prevFrom, "2025-04-01");
});

test("a period still running is compared like for like (up to the same day last year)", () => {
  // Today 20 Apr 2026: this FY so far vs 1–20 Apr 2025 — the 30 Jun 2025 line is left out.
  const r = q({ dataset: "sales", measures: ["revenue"], from: "2026-04-01", to: "2027-03-31", compare: "lastYear", asOf: "2026-04-20" });
  assert.equal(r.previous?.[0], 80_000);
});

test("unknown measures and fields are refused — a report can't invent a number", () => {
  assert.throws(() => checkSpec({ dataset: "sales", measures: ["profitMadeUp"] }), SpecError);
  assert.throws(() => checkSpec({ dataset: "sales", measures: ["revenue"], by: ["shoeSize"] }), SpecError);
  assert.throws(() => checkSpec({ dataset: "nope", measures: ["revenue"] }), SpecError);
});

test("a ratio over nothing is empty, not zero or infinity", () => {
  const r = q({ dataset: "sales", measures: ["avgPrice"], from: "2030-01-01", to: "2030-12-31" });
  assert.equal(r.totals[0], null);
});
