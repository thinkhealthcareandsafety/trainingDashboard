import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";

// The Overview as a PDF for Sumit, daily at 7 pm and monthly (owner, 18 Nov).

function sample() {
  const days: Record<string, Record<string, [number, number]>> = {};
  let s = 7;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (const d = new Date("2025-04-01T00:00:00"); d <= new Date("2026-11-18T00:00:00"); d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0) continue;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const q = Math.round(rnd() * 400000), i = Math.round(rnd() * 250000);
    days[k] = { all: [q, i], sumit: [q * 0.4, i * 0.4], ashish: [q * 0.3, i * 0.3], pranjal: [q * 0.2, i * 0.2] };
  }
  return days;
}

test("the daily and monthly report PDFs: a page each for Company, Sumit, Ashish and Pranjal; the email lists all four", async () => {
  const { PDFDocument } = await import("pdf-lib");
  const { overviewReportPdf, overviewReportEmail } = await import("@/lib/overviewReport");
  const days = sample();
  const daily = await overviewReportPdf(days, "2026-11-18", "daily");
  const monthly = await overviewReportPdf(days, "2026-11-30", "monthly");
  assert.equal((await PDFDocument.load(daily)).getPageCount(), 4);
  assert.equal((await PDFDocument.load(monthly)).getPageCount(), 4);
  if (process.env.REPORT_OUT) { writeFileSync(`${process.env.REPORT_OUT}/daily.pdf`, daily); writeFileSync(`${process.env.REPORT_OUT}/monthly.pdf`, monthly); }
  const m = overviewReportEmail(days, "2026-11-18", "daily");
  assert.match(m.subject, /^Daily report · Wednesday, 18 November 2026$/);
  for (const n of ["Company", "Sumit", "Ashish", "Pranjal"]) assert.ok(m.html.includes(`>${n}<`));
  assert.match(overviewReportEmail({}, "2026-11-30", "monthly").subject, /^Monthly report · November 2026$/);
});

test("when the reports go: daily Mon–Sat from 7 pm India time, monthly on the month's last day (Sunday too), never twice", async () => {
  const { dueReports, indiaNow } = await import("@/lib/overviewReportSend");
  const ist = (s: string) => new Date(`${s}+05:30`);
  assert.deepEqual(indiaNow(ist("2026-11-18T19:02:00")), { ymd: "2026-11-18", hour: 19, weekday: 3, lastOfMonth: false });
  assert.deepEqual(dueReports(ist("2026-11-18T18:59:00"), {}), []); // before 7 pm
  assert.deepEqual(dueReports(ist("2026-11-18T19:02:00"), {}), ["daily"]);
  assert.deepEqual(dueReports(ist("2026-11-18T20:10:00"), { daily: "2026-11-18" }), []); // sent already
  assert.deepEqual(dueReports(ist("2026-11-22T19:30:00"), {}), []); // a Sunday
  assert.deepEqual(dueReports(ist("2026-11-30T19:05:00"), { daily: "2026-11-28" }), ["daily", "monthly"]); // Monday 30 Nov, the last day
  assert.deepEqual(dueReports(ist("2026-05-31T19:05:00"), {}), ["monthly"]); // Sunday 31 May: the monthly one only
  assert.deepEqual(dueReports(ist("2026-11-30T19:40:00"), { daily: "2026-11-30", monthly: "2026-11" }), []);
});
