// The builder's "You'll get" sentence (src/lib/analytics/describe.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeSpec, mixedUnits } from "@/lib/analytics/describe";

const T = "2026-10-30";

test("no split: one number, or several side by side", () => {
  assert.equal(describeSpec({ dataset: "sales", measures: ["revenue"], period: "fy" }, T), "You'll get one number: Revenue, for This FY (2026-27). From: Sales.");
  assert.match(describeSpec({ dataset: "sales", measures: ["avgInvoice", "newCustomers", "revenue"], period: "fy" }, T), /^You'll get 3 numbers side by side: Average invoice, New customers and Revenue, for This FY/);
});

test("a split, top N, colours, chart and filters", () => {
  const s = describeSpec({ dataset: "sales", measures: ["revenue"], by: ["sector", "customerType"], limit: 10, period: "lastfy",
    filters: [{ field: "salesperson", values: ["Sumit A Shah"] }, { field: "state", values: ["Goa"], exclude: true }] }, T, "stacked");
  assert.equal(s, "You'll get Revenue for each sector (the top 10, the rest added up as “Others”), each split into a colour per customer type as stacked columns, for Last FY (2025-26) — only where Sales person is “Sumit A Shah” and State is not “Goa”. From: Sales.");
  assert.match(describeSpec({ dataset: "sales", measures: ["revenue"], by: ["date"], grain: "quarter", period: "all" }, T, "column"), /Revenue for each quarter as columns, over all time\./);
});

test("several numbers with a split: bars side by side, or a table when the units differ", () => {
  assert.ok(!mixedUnits({ dataset: "sales", measures: ["revenue", "repeatRevenue"] }));
  assert.ok(mixedUnits({ dataset: "sales", measures: ["revenue", "invoices"] }));
  assert.match(describeSpec({ dataset: "sales", measures: ["revenue", "repeatRevenue"], by: ["sector"] }, T, "bar"), /Revenue and Repeat revenue for each sector — side by side as bars, over all time/);
  assert.match(describeSpec({ dataset: "sales", measures: ["revenue", "invoices"], by: ["sector"] }, T, "table"), /as a table, because ₹ amounts, counts and % can't share one chart, over all time/);
});
