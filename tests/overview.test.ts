import { test } from "node:test";
import assert from "node:assert/strict";
import { change, daySums, inrShort, periods, personKey, sum, yearSoFar } from "@/lib/overviewMath";

// The new Overview (owner, 16 Nov sketch): quotes sent and invoiced per day, periods against the one before, the FY so far.
const row = (kind: string, date: string, total: number, sp: string, status = "sent") => ({ _id: `${kind}:${date}:${total}`, kind, date, row: { date, total, salesperson_name: sp, status } });

test("day sums: sent quotes and real invoices, for the company and each salesperson; drafts and voids left out", () => {
  const d = daySums([
    row("estimates", "2026-11-16", 1000, "Sumit A Shah"), row("estimates", "2026-11-16", 500, "Ashish Dalal"), row("estimates", "2026-11-16", 900, "Sumit A Shah", "draft"),
    row("invoices", "2026-11-16", 2000, "Pranjal Nikalje", "paid"), row("invoices", "2026-11-16", 700, "Pranjal Nikalje", "void"), row("invoices", "2026-11-15", 300, "Someone Else"),
    row("salesorders", "2026-11-16", 9999, "Sumit A Shah"), row("estimates", "2024-01-01", 5, "Sumit A Shah"),
  ], "2025-04-01");
  assert.deepEqual(d["2026-11-16"], { all: [1500, 2000], sumit: [1000, 0], ashish: [500, 0], pranjal: [0, 2000] });
  assert.deepEqual(d["2026-11-15"], { all: [0, 300] });
  assert.equal(d["2024-01-01"], undefined);
  assert.equal(personKey("Shikha Dixit"), null);
});

test("periods: today vs yesterday; this week so far vs the same days last week; this month so far vs the same days last month; picked dates vs the days before", () => {
  assert.deepEqual([periods("day", "2026-11-16").now.from, periods("day", "2026-11-16").before.from], ["2026-11-16", "2026-11-15"]);
  const w = periods("week", "2026-11-18"); // a Wednesday
  assert.deepEqual([w.now.from, w.now.to, w.before.from, w.before.to], ["2026-11-16", "2026-11-18", "2026-11-09", "2026-11-11"]);
  const m = periods("month", "2026-03-31");
  assert.deepEqual([m.now.from, m.before.from, m.before.to], ["2026-03-01", "2026-02-01", "2026-02-28"]);
  const c = periods("custom", "2026-11-16", { from: "2026-11-10", to: "2026-11-14" });
  assert.deepEqual([c.before.from, c.before.to], ["2026-11-05", "2026-11-09"]);
});

test("the financial year so far: its day number, the average a day, today; and the money format", () => {
  const d = { "2026-04-01": { all: [10000, 5000] as [number, number] }, "2026-04-02": { all: [0, 1000] as [number, number] } };
  const y = yearSoFar(d, "all", "2026-04-02");
  assert.deepEqual([y.day, y.label, y.avgQuoted, y.avgInvoiced, y.todayInvoiced], [2, "FY 26-27", 5000, 3000, 1000]);
  assert.equal(yearSoFar(d, "all", "2026-11-16").day, 230);
  assert.deepEqual(sum(d, "all", "2026-04-01", "2026-04-02"), { quoted: 10000, invoiced: 6000 });
  assert.equal(change(150, 100), 50);
  assert.equal(change(5, 0), null);
  assert.deepEqual([inrShort(8450), inrShort(420000), inrShort(13500000)], ["₹8,450", "₹4.2 L", "₹1.35 Cr"]);
});

test("this year: the financial year so far against the same days of the last one", () => {
  const y = periods("year", "2026-11-16");
  assert.deepEqual([y.now.from, y.now.to, y.before.from, y.before.to], ["2026-04-01", "2026-11-16", "2025-04-01", "2025-11-16"]);
  const jan = periods("year", "2027-01-10");
  assert.deepEqual([jan.now.from, jan.before.from, jan.before.to], ["2026-04-01", "2025-04-01", "2026-01-10"]);
});
