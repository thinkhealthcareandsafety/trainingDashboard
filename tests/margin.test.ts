// The margin report (owner, 25 Nov): what counts, what is left out, and who may see it.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { type MLine, against, checks, deals, freight, groups, judge, marginFacts, months, of, openQuotes, rises, span, total, within, years } from "@/lib/margin";
import { canSeeMargin } from "@/lib/roles";
import { GET } from "@/app/api/overview/margin/route";
import { summaryTables } from "@/lib/summaryTables";
import { summaryEmail, type SummaryFacts } from "@/lib/dailySummary";
import { resetFakeDb } from "./fakes/db";

beforeEach(() => resetFakeDb());
const l = (invoice: string, amount: number, cost: number | null, x: Partial<MLine> = {}): MLine => ({ date: "2026-11-25", invoice, customer: "Acme", person: "Sumit A Shah", item: "Pads", group: "AED Pads", brand: "Philips", qty: 1, amount, cost, estimated: false, ...x });

test("left out, each for its reason; a giveaway and a small loss stay", () => {
  const j = judge([l("1", 100, 60), l("1", 0, 10, { item: "Gift" }), l("1", 100, null), l("1", 100, 0), l("1", 100, 4.9), l("1", 100, 200), l("1", 100, 110), l("1", 50, 90, { item: "Packing , Shipping and Forwarding" }), l("2", 0, 500), l("2", 0, 700), l("3", 100, 70), l("3", 0, 0)]);
  assert.deepEqual(j.map((x) => x.why), [null, null, "noCost", null, "lowCost", "highCost", null, "freight", "zeroSale", "zeroSale", null]);
  const t = total(j);
  assert.deepEqual([t.sale, t.cost, t.profit, t.invoices, t.skipped, t.skippedLines], [400, 250, 150, 2, 300, 5]);
  assert.deepEqual(freight(j), { charged: 50, cost: 90 });
  const c = checks(j);
  assert.deepEqual([c[0].invoice, c[0].why, c[0].cost, c[0].item], ["2", "zeroSale", 1200, "2 items"]);
  assert.equal(c.length, 4); // a cost of exactly 0 is believed now (owner, 27 Nov)
});

test("people add up to the company with the others; periods by India's day; last year beside", () => {
  const j = judge([l("1", 100, 60), l("2", 200, 100, { person: "Ashish Dalal" }), l("3", 50, 40, { person: "Nikita Shah" }), l("4", 1000, 900, { date: "2026-11-01" }), l("5", 365, 0.5 * 365, { date: "2025-06-01" }), l("6", 80, 40, { date: "2025-12-20" })]);
  assert.deepEqual([total(of(j, "sumit")).profit, total(of(j, "ashish")).profit, total(of(j, "pranjal")).profit], [40 + 100 + 182.5 + 40, 100, 0]);
  const s = span("day", "2026-11-25");
  assert.equal(total(within(j, s.from, s.to)).profit, 150);
  assert.equal(total(within(j, ...Object.values(span("month", "2026-11-25")) as [string, string])).profit, 250);
  assert.equal(against(j, "year", "2026-11-25")!.profit, 182.5);
  assert.ok(Math.abs(against(j, "month", "2026-11-25")!.profit - 222.5 / 12) < 1e-9);
  assert.deepEqual(years(j).map((y) => [y.label, y.profit]), [["FY 25-26", 222.5], ["FY 26-27", 250]]);
  assert.deepEqual([months(j, "2026-11-25").length, months(j, "2026-11-25").at(-1)!.profit], [12, 250]);
});

test("invoices: loss, thin, fine, or no trusted cost; products; open quotations; price rises", () => {
  const j = judge([l("1", 100, 120), l("2", 100, 95), l("3", 100, 50), l("4", 100, null)]);
  assert.deepEqual(deals(j).map((d) => [d.invoice, d.tone]), [["4", "none"], ["3", "ok"], ["2", "thin"], ["1", "loss"]]);
  assert.deepEqual([groups(j, "customer")[0].sale, groups(j, "customer")[0].qty], [300, 3]);
  const q = (quote: string, amount: number, cost: number | null) => ({ quote, date: "2026-11-20", customer: "A", person: "Ashish Dalal", amount, cost });
  assert.deepEqual(openQuotes([q("Q1", 100, 95), q("Q1", 50, null), q("Q2", 500, 200), q("Q3", 10, null)]).map((x) => [x.quote, x.total, x.sale, x.thin, x.pct === null]), [["Q2", 500, 500, false, false], ["Q1", 150, 100, true, false], ["Q3", 10, 0, false, true]]);
  const b = (date: string, amount: number, item = "Pads") => ({ item, date, qty: 1, amount });
  const r = rises([b("2026-10-01", 100), b("2026-11-01", 110), b("2026-10-01", 1, "Swabs"), b("2026-11-01", 465, "Swabs")], judge([l("1", 200, 100, { date: "2026-10-05" }), l("2", 200, 110, { date: "2026-11-05" })]), "2026-11-25");
  assert.deepEqual(r.map((x) => [x.item, Math.round(x.pct), x.passedOn]), [["Pads", 10, false]]);
});

test("who: Sumit, Ashish, Shikha, Nikita and Admin; to anyone else the address doesn't exist", async () => {
  const as = (id: string, name: string) => ({ id, name });
  for (const m of [as("admin", "Admin"), as("1", "Sumit A Shah"), as("2", "Ashish Dalal"), as("3", "Shikha Dixit"), as("4", "Nikita Shah")]) assert.ok(canSeeMargin(m), m.name);
  for (const m of [as("5", "Jasmeet singh"), as("6", "Pranjal Nikalje"), as("7", "Anuj Agarwal"), as("8", "Arti Sirohi"), as("9", "Priyanka"), as("10", "")]) {
    assert.ok(!canSeeMargin(m), m.name);
    const r = await GET(new Request("http://x/api/overview/margin", { headers: { "x-test-member": JSON.stringify(m) } }));
    assert.deepEqual([r.status, await r.text()], [404, ""]);
  }
  assert.equal((await GET(new Request("http://x/api/overview/margin"))).status, 401);
});

test("the email: margin first in the PDF's tables, never in the email's own text; nothing when it isn't asked for", () => {
  const j = judge([l("2026-01-900", 100000, 95000), l("2026-01-901", 70000, null)]);
  const facts = { kind: "daily", on: "2026-11-25", days: {}, quotes: [], invoices: [], payments: [], receivable: null, payable: null, stock: null, newCustomers: [], trainings: null, renewals: [], errors: {} } as unknown as SummaryFacts;
  const doc = summaryTables({ ...facts, margin: marginFacts(j, [], "2026-11-25", true, 0) });
  assert.equal(doc.sections[0].title, "Margin (confidential)");
  assert.match(JSON.stringify(doc.sections[0]), /₹5,000 · 5\.0%/);
  assert.match(JSON.stringify(doc.sections[0]), /cost to check/);
  assert.doesNotMatch(summaryEmail({ ...facts, margin: marginFacts(j, [], "2026-11-25", true, 0) }).html, />[^<]*margin/i);
  assert.ok(!summaryTables(facts).sections.some((s) => /margin/i.test(s.title)));
});
