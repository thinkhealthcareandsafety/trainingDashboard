import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";

// AEDs, pads, batteries and cabinets — bought, sold, in stock; as a whole and by brand (owner, 18 Nov).

test("which items count: AEDs, pads, batteries, cabinets — goods only, no trainers, rentals or brackets", async () => {
  const { aedKindOf, brandOf } = await import("@/lib/aedStock");
  assert.equal(aedKindOf("Cardiac Science Powerheart G5 AED", "All AEDs", "goods"), "aed");
  assert.equal(aedKindOf("AED Rental", "All AEDs", "service"), null);
  assert.equal(aedKindOf("AED Pads OBS - DE/P", "AED Pads", "goods"), "pads");
  assert.equal(aedKindOf("AED 7000 Compatible pads OBS", "General Safety", "goods"), "pads"); // filed under General Safety
  assert.equal(aedKindOf("AED Trainer- Pad XFT-120C", "AED Pads", "goods"), null); // a trainer's pads
  assert.equal(aedKindOf("Philips FRx Battery", "AED Batteries", "goods"), "battery");
  assert.equal(aedKindOf("AED Wall Cabinet with Alarm", "AED Accessories", "goods"), "cabinet");
  assert.equal(aedKindOf("AED Wall Bracket", "AED Accessories", "goods"), null);
  assert.equal(aedKindOf("Fire Extinguisher Cabinet", "Fire Safety", "goods"), null);
  assert.equal(brandOf("OBS", "AED Pads OBS"), "OBS");
  assert.equal(brandOf("", "Philips HeartStart FRx"), "Philips");
  assert.equal(brandOf(undefined, "Generic pads"), "Other");
});

test("the tally: stock (and its cost), bought and sold this month and today, by kind and brand; cabinets have no brands", async () => {
  const { aedReport } = await import("@/lib/aedStock");
  const items = [
    { id: "a1", name: "Philips FRx", kind: "aed" as const, brand: "Philips", stock: 4, cost: 100000 },
    { id: "a2", name: "Zoll AED Plus", kind: "aed" as const, brand: "ZOLL", stock: 2, cost: 120000 },
    { id: "a3", name: "Zoll AED 3", kind: "aed" as const, brand: "Zoll", stock: 1, cost: 150000 }, // same brand, other case
    { id: "p1", name: "OBS pads", kind: "pads" as const, brand: "OBS", stock: 10, cost: 1000 },
    { id: "c1", name: "AED Cabinet", kind: "cabinet" as const, brand: "Other", stock: 3, cost: 5000 },
    { id: "b1", name: "FRx Battery", kind: "battery" as const, brand: "Philips", stock: null, cost: 9000 },
  ];
  const bought = [{ itemId: "a1", qty: 2, value: 200000, date: "2026-11-03" }, { itemId: "p1", qty: 5, value: 5000, date: "2026-11-18" }, { itemId: "zz", qty: 9, value: 9, date: "2026-11-18" }];
  const sold = [{ itemId: "a1", qty: 1, value: 150000, date: "2026-11-18" }, { itemId: "a2", qty: 1, value: 160000, date: "2026-11-10" }, { itemId: "c1", qty: 1, value: 9000, date: "2026-11-18" }];
  const r = aedReport(items, bought, sold, "2026-11-18");
  assert.equal(r.total.stock, 20);
  assert.equal(r.total.stockValue, 4 * 100000 + 2 * 120000 + 150000 + 10 * 1000 + 3 * 5000);
  assert.deepEqual([r.total.bought, r.total.boughtValue, r.total.sold, r.total.soldValue], [7, 205000, 3, 319000]); // the unknown item "zz" left out
  assert.deepEqual([r.total.soldToday, r.total.boughtToday], [2, 5]);
  assert.equal(r.stockUnknown, 1);
  const aed = r.kinds.find((k) => k.kind === "aed")!;
  assert.deepEqual(aed.brands.map((b) => [b.brand, b.tally.stock, b.tally.sold, b.tally.bought]), [["Philips", 4, 1, 2], ["ZOLL", 3, 1, 0]]);
  const cab = r.kinds.find((k) => k.kind === "cabinet")!;
  assert.deepEqual([cab.tally.stock, cab.tally.sold, cab.brands.length], [3, 1, 0]);
  assert.deepEqual(r.kinds.find((k) => k.kind === "battery")!.brands, []); // nothing to say about Philips batteries
});

test("the email starts with the AED section: as a whole, each kind, each brand", async () => {
  const { aedReport } = await import("@/lib/aedStock");
  const { summaryEmail } = await import("@/lib/dailySummary");
  const report = aedReport(
    [{ id: "a1", name: "Philips FRx", kind: "aed", brand: "Philips", stock: 4, cost: 100000 }, { id: "c1", name: "AED Cabinet", kind: "cabinet", brand: "Other", stock: 3, cost: 5000 }],
    [{ itemId: "a1", qty: 2, value: 200000, date: "2026-11-03" }],
    [{ itemId: "a1", qty: 1, value: 150000, date: "2026-11-18" }],
    "2026-11-18",
  );
  const m = summaryEmail({ kind: "daily", on: "2026-11-18", days: {}, quotes: [], invoices: [], payments: [], receivable: null, payable: null, stock: null, newCustomers: [], trainings: null, renewals: [], aedStock: { report, unread: 2 }, errors: {} });
  if (process.env.REPORT_OUT) writeFileSync(`${process.env.REPORT_OUT}/aed.html`, m.html);
  assert.ok(m.html.indexOf("AEDs, pads, batteries and cabinets") < m.html.indexOf("Quotations sent today"));
  assert.ok(m.html.includes("<b>All together</b> 7 in stock"));
  assert.ok(m.html.includes("(₹4.15 L at cost)"));
  assert.ok(m.html.includes("This month: sold 1 for ₹1.5 L · bought 2 for ₹2 L"));
  assert.ok(m.html.includes("Today: sold 1 (₹1.5 L) · bought 0"));
  assert.ok(m.html.includes("<b>AEDs</b> 4 in stock · sold 1 · bought 2"));
  assert.ok(m.html.includes("Philips: 4 in stock · sold 1 · bought 2"));
  assert.ok(m.html.includes("<b>Cabinets</b> 3 in stock · sold 0 · bought 0"));
  assert.ok(m.html.includes("2 bills / invoices not read from Zoho yet"));
});
