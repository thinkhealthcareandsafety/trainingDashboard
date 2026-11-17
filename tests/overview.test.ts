import { test } from "node:test";
import assert from "node:assert/strict";
import { change, daySums, inrShort, periods, personKey, monthly, remarks, sum, vsLastYear, yearSoFar } from "@/lib/overviewMath";

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

test("against last year: today, this week, this month vs last FY's average day / week / month; the year vs the same days; conversion", () => {
  // Last FY (Apr 2025 – Mar 2026, 365 days): ₹3,65,000 quoted and ₹1,82,500 invoiced in all → ₹1,000 / ₹500 a day.
  const days: Record<string, Record<string, [number, number]>> = { "2025-06-01": { all: [365_000, 182_500] }, "2025-11-10": { all: [0, 0] } };
  days["2026-11-16"] = { all: [2000, 500] };
  days["2026-11-17"] = { all: [1500, 900] };
  const day = vsLastYear(days, "all", "day", "2026-11-17");
  assert.deepEqual(day.now, { quoted: 1500, invoiced: 900, conversion: 60 });
  assert.deepEqual(day.last, { quoted: 1000, invoiced: 500, conversion: 50 });
  const week = vsLastYear(days, "all", "week", "2026-11-17"); // Mon 16 – Tue 17
  assert.deepEqual(week.now, { quoted: 3500, invoiced: 1400, conversion: 40 });
  assert.deepEqual(week.last, { quoted: 7000, invoiced: 3500, conversion: 50 });
  assert.equal(week.daysIn, 2);
  const month = vsLastYear(days, "all", "month", "2026-11-17");
  assert.deepEqual(month.last, { quoted: Math.round(365_000 / 12), invoiced: Math.round(182_500 / 12), conversion: 50 });
  assert.equal(month.daysTotal, 30);
  const year = vsLastYear(days, "all", "year", "2026-11-17"); // 1 Apr – 17 Nov vs 1 Apr – 17 Nov 2025: holds the June row
  assert.deepEqual(year.last, { quoted: 365_000, invoiced: 182_500, conversion: 50 });
  assert.equal(vsLastYear({}, "sumit", "day", "2026-11-17").now.conversion, null);
});

test("remarks: short plain lines, green when better, red when it needs to be better, plain otherwise", () => {
  const days: Record<string, Record<string, [number, number]>> = { "2025-06-01": { all: [365_000, 182_500] }, "2026-11-16": { all: [2000, 500] }, "2026-11-17": { all: [1500, 900] } };
  assert.deepEqual(remarks(vsLastYear(days, "all", "day", "2026-11-17"), "today"), [
    { text: "Quotations: 50% more than last year’s average day.", tone: "good" },
    { text: "Invoiced: 80% more than last year’s average day.", tone: "good" },
    { text: "Conversion better: 60%, against 50% last year.", tone: "good" },
  ]);
  const w = remarks(vsLastYear(days, "all", "week", "2026-11-17"), "this week");
  assert.deepEqual(w[0], { text: "Quotations: 50% less than last year’s average week.", tone: "bad" });
  assert.deepEqual(w.at(-1), { text: "2 of 7 days gone: still time to catch up.", tone: "neutral" });
  assert.deepEqual(remarks(vsLastYear({}, "sumit", "day", "2026-11-17"), "today")[0], { text: "No quotations today, and none last year either.", tone: "neutral" });
});

test("monthly: the 12 months up to the day looked at, the last one so far, with conversion", () => {
  const days: Record<string, Record<string, [number, number]>> = { "2025-12-05": { sumit: [1000, 400] }, "2026-11-03": { sumit: [500, 500] }, "2026-11-20": { sumit: [9999, 0] } };
  // This FY by default (owner, 17 Nov): April to November.
  const fy = monthly(days, "sumit", "2026-11-17");
  assert.deepEqual([fy.length, fy[0].key, fy.at(-1)!.key], [8, "2026-04", "2026-11"]);
  assert.equal(monthly(days, "sumit", "2026-04-02").length, 1);
  assert.equal(monthly(days, "sumit", "2027-03-31").length, 12);
  const m = monthly(days, "sumit", "2026-11-17", 12);
  assert.equal(m.length, 12);
  assert.equal(m[0].key, "2025-12");
  assert.deepEqual([m[0].quoted, m[0].invoiced, m[0].conversion, m[0].partial], [1000, 400, 40, false]);
  assert.deepEqual([m[11].key, m[11].quoted, m[11].conversion, m[11].partial], ["2026-11", 500, 100, true]);
  assert.equal(m[5].conversion, null);
});
