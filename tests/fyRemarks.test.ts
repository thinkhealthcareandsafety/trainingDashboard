import { test } from "node:test";
import assert from "node:assert/strict";

// The short summary beside each FY chart on the Overview (owner, 18 Nov).

test("beside the chart: so far, how many, average size, last 30 days, where the year ends at this pace", async () => {
  const { fyLines, fyRemarks } = await import("@/lib/overviewMath");
  const days: Record<string, Record<string, [number, number, number, number]>> = {};
  const put = (from: string, n: number, q: number, k: number) => {
    for (let i = 0; i < n; i++) { const d = new Date(`${from}T00:00:00`); d.setDate(d.getDate() + i); const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; days[key] = { all: [q, 0, k, 0] }; }
  };
  put("2025-04-01", 365, 100000, 1); // last FY: ₹1 L and one quotation a day
  put("2026-04-01", 100, 150000, 1); // this FY's first 100 days: ₹1.5 L a day
  const fy = fyLines(days, "all", "2026-07-09", true); // day 100
  const lines = fyRemarks(fy, "quoted", ["quotation", "quotations"]);
  assert.deepEqual(lines.map((l) => [l.text, l.tone]), [
    ["So far ₹1.5 Cr: 50% more than last FY by now (₹1 Cr).", "good"],
    ["100 quotations, the same as last FY.", "neutral"],
    ["Average quotation ₹1.5 L, against ₹1 L last FY.", "good"],
    ["Last 30 days ₹45 L: 50% more than the same days last FY.", "good"],
    ["At this pace the FY ends near ₹5.47 Cr (last FY ₹3.65 Cr).", "good"],
  ]);
  assert.deepEqual(fyRemarks(fyLines({}, "all", "2026-07-09", true), "invoiced", ["invoice", "invoices"])[0], { text: "So far ₹0, nothing to compare with last FY.", tone: "neutral" });
});
