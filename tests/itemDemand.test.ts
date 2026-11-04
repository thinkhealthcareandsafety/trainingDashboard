// "Most in demand" on the Items page: quote lines per Zoho item in the last 12 months (src/lib/analytics/build.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { demandByItem } from "@/lib/analytics/build";

const line = (id: string, at: string) => ({ "Item ID": `line-${at}`, "Product ID": id, "Created Time": at });

test("counts quote lines by Product ID, not the line's Item ID, within 12 months", () => {
  const t = { quoteItems: [line("A", "2026-11-03 10:00:00"), line("A", "2026-01-15 09:00:00"), line("B", "2025-11-04 00:00:01"), line("B", "2025-11-03 23:59:59"), line("C", "2020-01-01 10:00:00"), line("", "2026-10-01 10:00:00")] };
  const m = demandByItem(t, "2026-11-04");
  assert.equal(m.get("A"), 2);
  assert.equal(m.get("B"), 1); // the day exactly a year back counts, the day before doesn't
  assert.equal(m.has("C"), false);
  assert.equal(m.size, 2);
});

test("no Quote Items in the copy: nothing, no error", () => {
  assert.equal(demandByItem({}, "2026-11-04").size, 0);
});
