// "Most in demand" on the Items page: quote lines per Zoho item in the last 12 months (src/lib/analytics/build.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { demandByItem } from "@/lib/analytics/build";
import { onItemsPage } from "@/lib/itemsPage";

test("the Items page leaves out services, office supplies and Elan Vital, whatever the case", () => {
  for (const group of ["Services", "Office Supplies", "elan vital", " Elan Vital "]) assert.equal(onItemsPage({ group }), false, group);
  assert.equal(onItemsPage({ group: "General Safety", service: true }), false); // a service under another identifier
  assert.equal(onItemsPage({ group: null, category: "Office Supplies" }), false);
  assert.equal(onItemsPage({ group: "Training Services", service: true }), true); // owner, 4 Nov: they stay
  for (const group of ["All AEDs", "AED Pads", "Fire Blankets", "Training Equipment", null]) assert.equal(onItemsPage({ group }), true, String(group));
});

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
