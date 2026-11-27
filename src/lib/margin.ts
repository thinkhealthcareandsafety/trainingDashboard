import { type PersonKey, personKey, periods } from "./overviewMath";

/*
 * The margin report (owner, 25 Nov: "super secretive"; who sees it: roles.ts canSeeMargin). Pure. Margin = sale before GST,
 * after discount, minus what the goods cost us (Zoho's FIFO, else the average purchase price: analytics/build.ts). Goods
 * only: trainings have no cost in Zoho. Owner: costs that look wrong are left out and listed, so they can be put right in
 * Zoho ("Check these costs").
 */

/** A goods line of an invoice. `cost` null = none known. `estimated`: too new for Zoho's own cost, so the average purchase price. */
export type MLine = { date: string; invoice: string; customer: string; person: string; item: string; group: string; brand: string; qty: number; amount: number; cost: number | null; estimated: boolean };
export type Why = "noCost" | "lowCost" | "highCost" | "zeroSale" | "freight";
export const WHY: Record<Why, string> = {
  noCost: "No cost in Zoho",
  lowCost: "Cost almost nothing",
  highCost: "Cost twice the sale or more",
  zeroSale: "Whole invoice sold at ₹0",
  freight: "Packing or freight",
};
/** A cost under this share of the sale is not believed; nor one of this many times the sale. */
export const LOW_COST = 0.05;
export const HIGH_COST = 2;
/** Under this the margin is called thin. */
export const THIN = 10;
const FREIGHT = /packing|freight|courier|shipping|forwarding|transport/i;

export type Judged = MLine & { why: Why | null };
/** Each line with the reason it is left out, or null. Lines with neither sale nor cost (a kit's parts) are dropped. */
export function judge(lines: MLine[]): Judged[] {
  const sale = new Map<string, number>();
  for (const l of lines) sale.set(l.invoice, (sale.get(l.invoice) ?? 0) + Math.abs(l.amount));
  return lines.filter((l) => l.amount !== 0 || (l.cost ?? 0) !== 0).map((l) => {
    let why: Why | null = null;
    if (FREIGHT.test(l.item)) why = "freight";
    else if ((sale.get(l.invoice) ?? 0) < 1) why = "zeroSale";
    else if (l.cost === null) why = l.amount === 0 ? null : "noCost";
    // A cost of exactly 0 is believed (owner, 27 Nov: "if they are 0, there must be a reason"); only a tiny non-zero one isn't.
    else if (l.amount > 0 && l.cost > 0 && l.cost < l.amount * LOW_COST) why = "lowCost";
    else if (l.amount > 0 && l.cost >= l.amount * HIGH_COST) why = "highCost";
    return { ...l, why };
  });
}

export type Tot = { sale: number; cost: number; profit: number; pct: number | null; invoices: number; skipped: number; skippedLines: number; estimated: number };
export function total(lines: Judged[]): Tot {
  let sale = 0, cost = 0, skipped = 0, skippedLines = 0, estimated = 0;
  const inv = new Set<string>();
  for (const l of lines) {
    if (l.why) { if (l.why !== "freight") { skipped += l.amount; skippedLines++; } continue; }
    sale += l.amount; cost += l.cost ?? 0;
    if (l.estimated) estimated += l.amount;
    inv.add(l.invoice);
  }
  return { sale, cost, profit: sale - cost, pct: sale > 0 ? ((sale - cost) / sale) * 100 : null, invoices: inv.size, skipped, skippedLines, estimated };
}

export type MPeriod = "day" | "week" | "month" | "year" | "all";
export const M_PERIODS: { key: MPeriod; label: string }[] = [{ key: "day", label: "Today" }, { key: "week", label: "This week" }, { key: "month", label: "This month" }, { key: "year", label: "This year" }, { key: "all", label: "All years" }];
export const M_PEOPLE: { key: PersonKey; label: string }[] = [{ key: "all", label: "Company" }, { key: "sumit", label: "Sumit" }, { key: "ashish", label: "Ashish" }, { key: "pranjal", label: "Pranjal" }];

export const of = (lines: Judged[], who: PersonKey) => (who === "all" ? lines : lines.filter((l) => personKey(l.person) === who));
export const within = (lines: Judged[], from: string, to: string) => lines.filter((l) => l.date >= from && l.date <= to);
export function span(kind: MPeriod, on: string): { from: string; to: string } {
  return kind === "all" ? { from: "0000", to: on } : { from: periods(kind, on).now.from, to: on };
}
const fyStart = (on: string) => Number(on.slice(0, 4)) - (Number(on.slice(5, 7)) >= 4 ? 0 : 1);
export const fyName = (y: number) => `FY ${String(y).slice(2)}-${String(y + 1).slice(2)}`;

/** The period beside last FY: its average day / week / month in ₹ (its % as it was), the same days for the year; all years alone. */
export function against(lines: Judged[], kind: MPeriod, on: string): { profit: number; pct: number | null; label: string } | null {
  if (kind === "all") return null;
  if (kind === "year") {
    const b = periods("year", on).before, t = total(within(lines, b.from, b.to));
    return t.invoices ? { profit: t.profit, pct: t.pct, label: "the same days last year" } : null;
  }
  const y = fyStart(on), t = total(within(lines, `${y - 1}-04-01`, `${y}-03-31`));
  if (!t.invoices) return null;
  const share = { day: 1 / 365, week: 7 / 365, month: 1 / 12 }[kind];
  return { profit: t.profit * share, pct: t.pct, label: `last year’s average ${kind}` };
}

/** Month by month, the 12 up to `on`'s. */
export function months(lines: Judged[], on: string): { key: string; label: string; profit: number; pct: number | null }[] {
  const out = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(Number(on.slice(0, 4)), Number(on.slice(5, 7)) - 1 - i, 1));
    const key = d.toISOString().slice(0, 7), t = total(lines.filter((l) => l.date.startsWith(key) && l.date <= on));
    out.push({ key, label: d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }), profit: t.profit, pct: t.pct });
  }
  return out;
}
/** One per financial year, oldest first. */
export function years(lines: Judged[]): ({ key: number; label: string } & Tot)[] {
  const by = new Map<number, Judged[]>();
  for (const l of lines) { const y = fyStart(l.date); by.set(y, [...(by.get(y) ?? []), l]); }
  return [...by].sort((a, b) => a[0] - b[0]).map(([key, ls]) => ({ key, label: fyName(key), ...total(ls) }));
}

export type Deal = { invoice: string; date: string; customer: string; person: string; sale: number; cost: number; profit: number; pct: number | null; skipped: number; estimated: boolean; tone: "loss" | "thin" | "ok" | "none" };
const tone = (profit: number, pct: number | null): Deal["tone"] => (pct === null ? (profit < 0 ? "loss" : "none") : profit < 0 ? "loss" : pct < THIN ? "thin" : "ok");
/** Every invoice, newest first. One whose every line is left out has no margin ("none"). */
export function deals(lines: Judged[]): Deal[] {
  const by = new Map<string, Judged[]>();
  for (const l of lines) (by.get(l.invoice) ?? by.set(l.invoice, []).get(l.invoice)!).push(l);
  return [...by.values()].map((ls) => {
    const t = total(ls), l = ls[0];
    return { invoice: l.invoice, date: l.date, customer: l.customer, person: l.person, sale: t.sale, cost: t.cost, profit: t.profit, pct: t.pct, skipped: t.skipped, estimated: t.estimated > 0, tone: t.invoices ? tone(t.profit, t.pct) : "none" as const };
  }).sort((a, b) => b.date.localeCompare(a.date) || b.invoice.localeCompare(a.invoice));
}

export type Group = { name: string; sale: number; profit: number; pct: number | null; qty: number; thin: boolean };
/** By item, brand or customer, most margin first; `thin` = sells a lot (the top fifth by sale) on a thin margin. */
export function groups(lines: Judged[], field: "item" | "brand" | "customer"): Group[] {
  const by = new Map<string, Judged[]>();
  for (const l of lines) if (!l.why) (by.get(l[field] || "(none)") ?? by.set(l[field] || "(none)", []).get(l[field] || "(none)")!).push(l);
  const out = [...by].map(([name, ls]) => { const t = total(ls); return { name, sale: t.sale, profit: t.profit, pct: t.pct, qty: ls.reduce((n, l) => n + l.qty, 0), thin: false }; });
  const big = out.map((g) => g.sale).sort((a, b) => b - a)[Math.floor(out.length / 5)] ?? 0;
  for (const g of out) g.thin = g.sale >= big && g.pct !== null && g.pct < 15;
  return out.sort((a, b) => b.profit - a.profit);
}

export type Check = { invoice: string; date: string; customer: string; person: string; item: string; qty: number; sale: number; cost: number | null; why: Why };
/** The lines left out, biggest money first (freight apart); a whole ₹0 invoice is one line. */
export function checks(lines: Judged[]): Check[] {
  const out: Check[] = [], zero = new Map<string, Check>();
  for (const l of lines) {
    if (!l.why || l.why === "freight") continue;
    const c: Check = { invoice: l.invoice, date: l.date, customer: l.customer, person: l.person, item: l.item, qty: l.qty, sale: l.amount, cost: l.cost, why: l.why };
    if (l.why !== "zeroSale") { out.push(c); continue; }
    const had = zero.get(l.invoice);
    if (had) { had.cost = (had.cost ?? 0) + (l.cost ?? 0); had.qty++; had.item = `${had.qty} items`; } else zero.set(l.invoice, { ...c, qty: 1 });
  }
  return [...out, ...zero.values()].sort((a, b) => Math.max(b.sale, b.cost ?? 0) - Math.max(a.sale, a.cost ?? 0));
}
/** Packing and freight lines: what was charged, and what they cost in Zoho. */
export function freight(lines: Judged[]): { charged: number; cost: number } {
  const f = lines.filter((l) => l.why === "freight");
  return { charged: f.reduce((n, l) => n + l.amount, 0), cost: f.reduce((n, l) => n + (l.cost ?? 0), 0) };
}

/* ---------------- Open quotations ---------------- */

export type QLine = { quote: string; date: string; customer: string; person: string; amount: number; cost: number | null };
export type OpenQuote = { quote: string; date: string; customer: string; person: string; total: number; sale: number; profit: number; pct: number | null; thin: boolean };
/** Quotes waiting for an answer, biggest first: the margin on the part whose cost is known (`sale` of `total`). */
export function openQuotes(lines: QLine[]): OpenQuote[] {
  const by = new Map<string, QLine[]>();
  for (const l of lines) (by.get(l.quote) ?? by.set(l.quote, []).get(l.quote)!).push(l);
  return [...by.values()].map((ls) => {
    const known = ls.filter((l) => l.cost !== null && (l.amount === 0 || l.cost >= l.amount * LOW_COST));
    const sale = known.reduce((n, l) => n + l.amount, 0), profit = sale - known.reduce((n, l) => n + (l.cost ?? 0), 0), pct = sale > 0 ? (profit / sale) * 100 : null;
    return { quote: ls[0].quote, date: ls[0].date, customer: ls[0].customer, person: ls[0].person, total: ls.reduce((n, l) => n + l.amount, 0), sale, profit, pct, thin: pct !== null && pct < THIN };
  }).filter((q) => q.total > 0).sort((a, b) => b.total - a.total);
}

/* ---------------- Purchase price rises ---------------- */

export type Buy = { item: string; date: string; qty: number; amount: number };
export type Rise = { item: string; was: number; now: number; pct: number; date: string; sellWas: number | null; sellNow: number | null; passedOn: boolean };
const daysBefore = (d: string, n: number) => new Date(Date.parse(d) - n * 86_400_000).toISOString().slice(0, 10);
/** Items whose latest purchase cost 5% or more above the one before (the last 180 days), and whether we sell them for more since. */
export function rises(buys: Buy[], lines: Judged[], on: string): Rise[] {
  const by = new Map<string, Map<string, { q: number; v: number }>>();
  for (const b of buys) {
    if (b.qty <= 0 || b.amount <= 0 || b.date > on) continue;
    const days = by.get(b.item) ?? by.set(b.item, new Map()).get(b.item)!, d = days.get(b.date) ?? days.set(b.date, { q: 0, v: 0 }).get(b.date)!;
    d.q += b.qty; d.v += b.amount;
  }
  const unit = (ls: Judged[]) => { const q = ls.reduce((n, l) => n + l.qty, 0); return q > 0 ? ls.reduce((n, l) => n + l.amount, 0) / q : null; };
  const out: Rise[] = [];
  for (const [item, days] of by) {
    const ds = [...days.keys()].sort();
    const last = ds.at(-1)!, prev = ds.at(-2);
    if (!prev || last < daysBefore(on, 180) || FREIGHT.test(item)) continue;
    const now = days.get(last)!.v / days.get(last)!.q, was = days.get(prev)!.v / days.get(prev)!.q, pct = ((now - was) / was) * 100;
    // Over three times the price is a different pack or a slip on a bill, not a rise.
    if (pct < 5 || pct > 200 || now < 10) continue;
    const mine = lines.filter((l) => l.item === item && l.amount > 0 && l.qty > 0);
    if (!mine.some((l) => l.date >= daysBefore(on, 365))) continue; // bought for ourselves, not sold
    const sellNow = unit(mine.filter((l) => l.date >= last)), sellWas = unit(mine.filter((l) => l.date < last && l.date >= daysBefore(last, 180)));
    out.push({ item, was, now, pct, date: last, sellWas, sellNow, passedOn: sellNow !== null && sellWas !== null && sellNow - sellWas >= (now - was) * 0.9 });
  }
  return out.sort((a, b) => Number(a.passedOn) - Number(b.passedOn) || b.pct - a.pct);
}

/* ---------------- For the email ---------------- */

export type MarginFacts = {
  table: { who: string; cells: { kind: Exclude<MPeriod, "all">; profit: number; pct: number | null }[] }[];
  years: { label: string; sale: number; profit: number; pct: number | null }[];
  all: { sale: number; profit: number; pct: number | null };
  deals: Deal[];
  skipped: { lines: number; sale: number };
  thinQuotes: OpenQuote[];
  unread: number;
};
export function marginFacts(lines: Judged[], quotes: OpenQuote[], on: string, daily: boolean, unread: number): MarginFacts {
  const kinds = ["day", "week", "month", "year"] as const;
  const t = (who: PersonKey, kind: MPeriod) => { const s = span(kind, on); return total(within(of(lines, who), s.from, s.to)); };
  const day = deals(within(lines, on, on)), m = span("month", on);
  const y = t("all", "year"), all = t("all", "all");
  return {
    table: M_PEOPLE.map((p) => ({ who: p.label, cells: kinds.map((kind) => { const x = t(p.key, kind); return { kind, profit: x.profit, pct: x.pct }; }) })),
    years: years(lines).map(({ label, sale, profit, pct }) => ({ label, sale, profit, pct })),
    all: { sale: all.sale, profit: all.profit, pct: all.pct },
    deals: daily ? day : deals(within(lines, m.from, m.to)).filter((d) => d.tone === "loss" || d.tone === "thin"),
    skipped: { lines: y.skippedLines, sale: y.skipped },
    thinQuotes: quotes.filter((q) => q.thin).slice(0, 8),
    unread,
  };
}
