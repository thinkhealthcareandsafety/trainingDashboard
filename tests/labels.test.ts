// Editable and dynamic labels (src/lib/analytics/labels.ts): values dropped into a title, own names for columns.
import { test } from "node:test";
import assert from "node:assert/strict";
import { relabel, renderLabel } from "@/lib/analytics/labels";
import { registerParams } from "@/lib/analytics/params";
import type { Result, Spec } from "@/lib/analytics/query";

const spec: Spec = { dataset: "sales", measures: ["revenue"], by: ["sector"], period: "lastfy", filters: [{ field: "sector", values: ["IT"], exclude: true }], params: { t: 7000000 } };
const result = { by: [{ key: "sector", label: "Sector", date: false }], measures: [{ key: "revenue", label: "Revenue", format: "inr" }],
  rows: [{ keys: ["Hotels"], values: [300000] }, { keys: ["Aviation"], values: [900000] }], totals: [1200000] } as unknown as Result;

test("values drop into a label; unknown ones stay as typed", () => {
  registerParams([{ id: "t", name: "Target", type: "number", value: 5000000 }]);
  assert.equal(renderLabel("Revenue {period}: {total}", { spec, result, today: "2026-10-30" }), "Revenue Last FY (2025-26): ₹12.0L");
  assert.equal(renderLabel("Best: {top} ({max}) of {rows}", { spec, result }), "Best: Aviation (₹9.00L) of 2");
  assert.equal(renderLabel("Goal {Target}", { spec, result }), "Goal 70,00,000");
  assert.equal(renderLabel("Goal {target}", { spec: { ...spec, params: {} }, result }), "Goal 50,00,000");
  assert.equal(renderLabel("{filters} · {nope}", { spec, result }), "Sector not IT · {nope}");
  assert.equal(renderLabel("{total} so far", { spec }), "… so far", "before the numbers arrive");
  assert.equal(renderLabel("Plain", { spec }), "Plain");
});

test("own names for columns and numbers; empty ones keep Zoho's", () => {
  const r = relabel(result, { sector: "Industry", revenue: "  " });
  assert.equal(r.by[0].label, "Industry");
  assert.equal(r.measures[0].label, "Revenue");
  assert.equal(relabel(result, undefined), result);
});
