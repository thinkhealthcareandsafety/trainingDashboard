import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";

// The daily summary email to Sumit (owner, 18 Nov): the body only, a headline, short sections, ▲ / ▼; and when it goes.

type Days = Record<string, Record<string, [number, number, number?, number?]>>;
/** Last FY (Apr 2025 – Mar 2026): ₹1 L quoted and ₹50 k invoiced every day → average day ₹1 L / ₹50 k. */
function lastYear(): Days {
  const days: Days = {};
  for (const d = new Date("2025-04-01T00:00:00"); d <= new Date("2026-03-31T00:00:00"); d.setDate(d.getDate() + 1)) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days[k] = { all: [100000, 50000, 1, 1] };
  }
  return days;
}

async function facts(over: Record<string, unknown> = {}) {
  const days = lastYear();
  days["2026-11-18"] = { all: [420000, 30000, 3, 1] };
  return {
    kind: "daily" as const,
    on: "2026-11-18",
    days,
    quotes: [
      { number: "QT-25-900", customer: "Acme Hotels", total: 300000, person: "Sumit A Shah", date: "2026-11-18" },
      { number: "QT-25-901", customer: "Beta & Co", total: 100000, person: "Ashish K", date: "2026-11-18" },
      { number: "QT-25-902", customer: "Gamma", total: 20000, person: "Neha", date: "2026-11-18" },
    ],
    invoices: [{ number: "INV-1", customer: "Delta", total: 30000, person: "Pranjal N", date: "2026-11-18" }],
    payments: [{ customer: "Acme Hotels", amount: 50000 }, { customer: "Delta", amount: 30000 }],
    receivable: { balance: 6075000, count: 84, overdue: { balance: 1200000, count: 20 } },
    payable: { balance: 900000, count: 12 },
    stock: { in: [{ item: "Pads", qty: 10, value: 20000, party: "Supplier A" }, { item: "Pads", qty: 5, value: 10000, party: "Supplier A" }], out: [] },
    newCustomers: ["New Co"],
    trainings: { today: [{ customer: "Acme Hotels", training: "CPR", people: 20, trainers: ["Riya Shah"] }], next: [], nextLabel: "Tomorrow" },
    renewals: [{ date: "2026-12-05", customer: "Acme Hotels", what: "pads" as const, item: "Philips FRx", qty: 2 }],
    errors: {},
    ...over,
  };
}

test("the headline says how the day went in one line", async () => {
  const { headline } = await import("@/lib/dailySummary");
  assert.equal(headline(await facts()), "Strong quoting day: ₹4.2 L in 3 quotations, 4.2× last year's average day; invoicing below average at ₹30,000 in 1; ₹80,000 collected");
  assert.equal(headline(await facts({ quotes: [], payments: null })), "No quotations today; invoicing below average at ₹30,000 in 1");
});

test("the email: subject with the totals; every section; ▲ green, ▼ red; a section Zoho couldn't give is a note", async () => {
  const { summaryEmail } = await import("@/lib/dailySummary");
  const m = summaryEmail(await facts());
  if (process.env.REPORT_OUT) writeFileSync(`${process.env.REPORT_OUT}/daily.html`, m.html);
  assert.equal(m.subject, "Daily summary · Wed, 18 Nov: ₹4.2 L quoted, ₹30,000 invoiced");
  for (const s of ["Quotations sent today", "Invoiced today", "Month and year pace", "Payments received", "Total outstanding", "Stock in and out today", "New customers", "Trainings", "AED renewals due in 30 days"]) assert.ok(m.html.includes(s), s);
  assert.ok(m.html.includes("Sumit ₹3 L (1) · Ashish ₹1 L (1) · Others ₹20,000 (1)"));
  assert.ok(m.html.includes("Biggest: <b>₹3 L</b> Acme Hotels · Sumit"));
  assert.match(m.html, /color:#15803d">▲<\/span> <span style="color:#15803d">4\.2× last year's average day/);
  assert.match(m.html, /color:#d92d20">▼<\/span> <span style="color:#d92d20">40% below last year's average day/);
  assert.ok(m.html.includes("Customers owe us</b> ₹60.8 L"));
  assert.ok(m.html.includes("We owe suppliers</b> ₹9 L"));
  assert.ok(m.html.includes("Pads × 15")); // the same item added up
  assert.ok(m.html.includes("Beta &amp; Co") === false); // only the biggest is named
  const broken = summaryEmail(await facts({ payments: null, errors: { payments: "Not authorised" } }));
  assert.ok(broken.html.includes("Couldn't read this from Zoho (Not authorised)."));
  assert.ok(broken.html.includes("Invoiced today")); // the rest still there
});

test("the monthly summary: the month's subject and words", async () => {
  const { summaryEmail } = await import("@/lib/dailySummary");
  const m = summaryEmail(await facts({ kind: "monthly", on: "2026-11-30", stock: { in: [], out: null, bills: { count: 7, total: 250000 } } }));
  assert.match(m.subject, /^Monthly summary · November 2026: /);
  for (const s of ["Quotations sent this month", "Payments received this month", "Stock bought this month", "7 bills, ₹2.5 L", "Held this month", "AED renewals due next month"]) assert.ok(m.html.includes(s), s);
});

test("the period's documents: no drafts, no void invoices, inside the dates, biggest first", async () => {
  const { docsOf } = await import("@/lib/dailySummary");
  const row = (kind: string, id: string, date: string, total: number, status = "sent") => ({ _id: `${kind}:${id}`, kind, date, row: { date, total, status, estimate_number: `QT-${id}`, invoice_number: `INV-${id}`, customer_name: `C${id}`, salesperson_name: "Sumit" } });
  const rows = [row("estimates", "1", "2026-11-18", 10), row("estimates", "2", "2026-11-18", 50), row("estimates", "3", "2026-11-18", 99, "draft"), row("estimates", "4", "2026-11-17", 70), row("invoices", "5", "2026-11-18", 5, "void"), row("invoices", "6", "2026-11-18", 8, "paid")];
  assert.deepEqual(docsOf(rows, "estimates", "2026-11-18", "2026-11-18").map((d) => d.number), ["QT-2", "QT-1"]);
  assert.deepEqual(docsOf(rows, "estimates", "2026-11-01", "2026-11-18").map((d) => d.number), ["QT-4", "QT-2", "QT-1"]);
  assert.deepEqual(docsOf(rows, "invoices", "2026-11-18", "2026-11-18").map((d) => d.number), ["INV-6"]);
});

test("trainings of a day, Saturday looks at Monday; AED pads and batteries due in the window", async () => {
  const { trainingsOn, nextWorkDay, renewalsDue } = await import("@/lib/dailySummary");
  const { parseAedLine } = await import("@/lib/aedParse");
  const t = (customerName: string, dates: string[], status = "scheduled", board = "training") => ({ customerName, dates, status, board, training: "CPR", people: 10, trainers: [] });
  assert.deepEqual(trainingsOn([t("A", ["2026-11-18"]), t("B", ["2026-11-18"], "postponed"), t("C", ["2026-11-19"])], "2026-11-18").map((x) => x.customer), ["A"]);
  assert.deepEqual(nextWorkDay("2026-11-21"), { day: "2026-11-23", label: "Monday" });
  assert.deepEqual(nextWorkDay("2026-11-18"), { day: "2026-11-19", label: "Tomorrow" });
  const inv = [{ customerName: "Acme", aedLines: [{ name: "Philips FRx", qty: 2, description: "SN : B26H-01596\nCPR D Pads: 05/12/2026\nBattery Install By 30-11-2031" }] }];
  assert.deepEqual(renewalsDue(inv, parseAedLine, "2026-11-18", "2026-12-18"), [{ date: "2026-12-05", customer: "Acme", what: "pads", item: "Philips FRx", qty: 2 }]);
  assert.deepEqual(renewalsDue(inv, parseAedLine, "2026-12-06", "2027-01-05"), []);
});

test("when the summaries go: daily Mon–Sat from 7 pm India time, monthly on the month's last day (Sunday too), never twice", async () => {
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
