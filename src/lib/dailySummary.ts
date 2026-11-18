import { type DaySums, type SalesDayRow, inrShort, personKey, vsLastYear } from "./overviewMath";

/*
 * The daily summary email to Sumit (owner, 18 Nov: "simple and concise, tells the whole story of our current foot in
 * the business"). It replaces the Overview PDF: the email body only, readable on a phone — a one-line headline, then
 * short sections with ▲ / ▼ in green / red. Pure: the server gathers the facts (dailySummaryGather.ts), this turns them
 * into the subject and the HTML. A section whose facts couldn't be read is `null` and shows as a short grey note.
 *
 * Monthly (the month's last day): the same sections for the month so far, renewals due next month.
 */

export type ReportKind = "daily" | "monthly";

/** A quotation or invoice of the period (from the Sales copy, today's straight from Zoho). */
export type SaleDoc = { number: string; customer: string; total: number; person: string; date: string };
export type Payment = { customer: string; amount: number };
export type StockLine = { item: string; qty: number; value: number; party: string };
export type Outstanding = { balance: number; count: number };
export type TrainingRow = { customer: string; training: string; people: number; trainers: string[]; time?: string; aed?: boolean };
export type Renewal = { date: string; customer: string; what: "pads" | "battery"; item: string; qty: number };

export type SummaryFacts = {
  kind: ReportKind;
  on: string; // the India day, YYYY-MM-DD
  days: DaySums; // every day's sums (for last year's average and the pace)
  quotes: SaleDoc[] | null;
  invoices: SaleDoc[] | null;
  payments: Payment[] | null;
  receivable: (Outstanding & { overdue?: Outstanding }) | null;
  payable: Outstanding | null;
  stock: { in: StockLine[]; out: StockLine[] | null; bills?: { count: number; total: number } } | null;
  newCustomers: string[] | null;
  trainings: { today: TrainingRow[]; next: TrainingRow[]; nextLabel: string } | null;
  renewals: Renewal[] | null;
  /** Why a section is missing: section → reason. */
  errors: Partial<Record<string, string>>;
};

/* ---------------- Facts from rows (pure, used by the gatherer) ---------------- */

const parse = (s: string) => new Date(`${s}T00:00:00`);
const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return ymdOf(d); };
export const monthStart = (on: string) => `${on.slice(0, 7)}-01`;
/** The month after `on`'s: [first, last]. */
export function nextMonth(on: string): [string, string] {
  const d = parse(on);
  return [ymdOf(new Date(d.getFullYear(), d.getMonth() + 1, 1)), ymdOf(new Date(d.getFullYear(), d.getMonth() + 2, 0))];
}

/** The period's sent quotations / invoices (not drafts; invoices not void either), biggest first. */
export function docsOf(rows: SalesDayRow[], kind: "estimates" | "invoices", from: string, to: string): SaleDoc[] {
  const out: SaleDoc[] = [];
  for (const r of rows) {
    if (r.kind !== kind) continue;
    const day = String(r.row.date ?? r.date ?? "").slice(0, 10);
    if (!day || day < from || day > to) continue;
    const status = String(r.row.status ?? "").toLowerCase();
    if (status === "draft" || (kind === "invoices" && status === "void")) continue;
    out.push({
      number: String(r.row[kind === "estimates" ? "estimate_number" : "invoice_number"] ?? ""),
      customer: String(r.row.customer_name ?? ""),
      total: Number(r.row.total) || 0,
      person: String(r.row.salesperson_name ?? ""),
      date: day,
    });
  }
  return out.sort((a, b) => b.total - a.total);
}

/** Trainings on a day, from the boards (status other than postponed / to be decided). */
export function trainingsOn<T extends { dates: string[]; status: string; customerName: string; alias?: string; training: string; people: number; trainers: string[]; time?: string; board: string }>(list: T[], day: string): TrainingRow[] {
  return list
    .filter((t) => t.dates.includes(day) && t.status !== "postponed" && t.status !== "tbd")
    .map((t) => ({ customer: t.alias || t.customerName, training: t.training, people: t.people, trainers: t.trainers, time: t.time, aed: t.board === "aed" || undefined }))
    .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "") || a.customer.localeCompare(b.customer));
}

/** The day after `on` that's worth naming: Saturday's email looks at Monday. */
export function nextWorkDay(on: string): { day: string; label: string } {
  const d = parse(on);
  return d.getDay() === 6 ? { day: addDays(on, 2), label: "Monday" } : { day: addDays(on, 1), label: "Tomorrow" };
}

/** AED pads / batteries running out in [from, to], soonest first. */
export function renewalsDue(invoices: { customerName: string; aedLines: { name: string; qty: number; description: string }[] }[], parse: (l: { name: string; qty: number; description: string }) => { batteryExpiry: string[]; padsExpiry: string[] }, from: string, to: string): Renewal[] {
  const out: Renewal[] = [];
  const seen = new Set<string>();
  for (const inv of invoices) for (const line of inv.aedLines) {
    const p = parse(line);
    for (const [what, dates] of [["pads", p.padsExpiry], ["battery", p.batteryExpiry]] as const) for (const date of dates) {
      if (date < from || date > to) continue;
      const key = `${inv.customerName}|${line.name}|${what}|${date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ date, customer: inv.customerName, what, item: line.name, qty: line.qty });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.customer.localeCompare(b.customer));
}

/** Stock lines added up by item (qty, ₹), biggest value first; the party is kept when it's always the same. */
export function byItem(lines: StockLine[]): StockLine[] {
  const m = new Map<string, StockLine>();
  for (const l of lines) {
    const had = m.get(l.item);
    if (!had) m.set(l.item, { ...l });
    else { had.qty += l.qty; had.value += l.value; if (had.party !== l.party) had.party = ""; }
  }
  return [...m.values()].sort((a, b) => b.value - a.value || b.qty - a.qty);
}

/* ---------------- Words ---------------- */

const GREEN = "#15803d", RED = "#d92d20", MUTED = "#6e6e73", INK = "#1c1c1e", LINE = "#e5e5ea";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = inrShort;
const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const dayMonth = (s: string) => parse(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const longDate = (s: string) => parse(s).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const monthName = (s: string) => parse(s).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const first = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** "2.1× last year's average day" / "35% below …" — with the arrow and its colour. */
function against(now: number, avg: number, avgWord: string): { text: string; up: boolean | null } {
  if (avg <= 0) return { text: now > 0 ? `nothing to compare with last year` : "", up: null };
  const r = now / avg;
  if (r >= 1.5) return { text: `${+r.toFixed(1)}× ${avgWord}`, up: true };
  const pct = Math.round((r - 1) * 100);
  if (pct === 0) return { text: `the same as ${avgWord}`, up: null };
  return { text: `${Math.abs(pct)}% ${pct > 0 ? "above" : "below"} ${avgWord}`, up: pct > 0 };
}
const arrow = (up: boolean | null) => (up === null ? "" : `<span style="color:${up ? GREEN : RED}">${up ? "▲" : "▼"}</span> `);
const coloured = (s: string, up: boolean | null) => (up === null ? esc(s) : `<span style="color:${up ? GREEN : RED}">${esc(s)}</span>`);

/** Sumit / Ashish / Pranjal / Others: how many and ₹, those with any. */
function byPerson(docs: SaleDoc[]): string {
  const groups = new Map<string, { k: number; v: number }>();
  for (const d of docs) {
    const key = personKey(d.person);
    const label = key ? key[0].toUpperCase() + key.slice(1) : "Others";
    const g = groups.get(label) ?? { k: 0, v: 0 };
    g.k++; g.v += d.total;
    groups.set(label, g);
  }
  const order = ["Sumit", "Ashish", "Pranjal", "Others"];
  return order.filter((l) => groups.has(l)).map((l) => `${l} ${money(groups.get(l)!.v)} (${groups.get(l)!.k})`).join(" · ");
}

/** The headline: one line that says how the day (or month) went. */
export function headline(f: SummaryFacts): string {
  const period = f.kind === "daily" ? "day" : "month";
  const parts: string[] = [];
  const sales = (docs: SaleDoc[] | null, slot: "quoted" | "invoiced", noun: string, verb: string) => {
    if (!docs) return;
    const total = docs.reduce((s, d) => s + d.total, 0);
    const avg = vsLastYear(f.days, "all", f.kind === "daily" ? "day" : "month", f.on).last[slot];
    if (!docs.length) return parts.push(`no ${noun}s ${f.kind === "daily" ? "today" : "this month"}`);
    const a = avg > 0 ? total / avg : null;
    const tone = a === null ? "" : a >= 1.2 ? "above average" : a <= 0.8 ? "below average" : "about average";
    const times = a !== null && a >= 1.5 ? `, ${+a.toFixed(1)}× last year's average ${period}` : "";
    if (!parts.length) {
      const mood = a === null ? "" : a >= 1.2 ? "Strong" : a <= 0.8 ? "Quiet" : "Steady";
      parts.push(`${mood ? `${mood} ${verb} ${period}: ` : ""}${money(total)} in ${n(docs.length, noun)}${times}`);
    } else parts.push(`${verb}${tone ? ` ${tone}` : ""} at ${money(total)} in ${docs.length}`);
  };
  sales(f.quotes, "quoted", "quotation", "quoting");
  sales(f.invoices, "invoiced", "invoice", "invoicing");
  if (f.payments) {
    const got = f.payments.reduce((s, p) => s + p.amount, 0);
    parts.push(got > 0 ? `${money(got)} collected` : "nothing collected");
  }
  const s = parts.join("; ");
  return s ? s[0].toUpperCase() + s.slice(1) : "The figures couldn't be read from Zoho today";
}

/* ---------------- HTML ---------------- */

function section(title: string, body: string): string {
  return `<div style="padding:14px 0;border-top:1px solid ${LINE}"><div style="font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${MUTED};margin-bottom:6px">${esc(title)}</div>${body}</div>`;
}
const line = (html: string, extra = "") => `<div style="margin:3px 0;${extra}">${html}</div>`;
const small = (html: string) => `<div style="margin:3px 0;font-size:13px;color:${MUTED}">${html}</div>`;
const missing = (why: string | undefined) => small(`Couldn't read this from Zoho${why ? ` (${esc(why)})` : ""}.`);
/** A list, the first `max` rows and "and N more". */
const list = <T,>(xs: T[], max: number, row: (x: T) => string) => xs.slice(0, max).map((x) => line(row(x))).join("") + (xs.length > max ? small(`and ${xs.length - max} more`) : "");

function salesSection(f: SummaryFacts, docs: SaleDoc[] | null, slot: "quoted" | "invoiced", title: string, noun: string): string {
  if (!docs) return section(title, missing(f.errors[slot]));
  const total = docs.reduce((s, d) => s + d.total, 0);
  const daily = f.kind === "daily";
  const avg = vsLastYear(f.days, "all", daily ? "day" : "month", f.on).last[slot];
  const c = against(total, avg, `last year's average ${daily ? "day" : "month"}`);
  if (!docs.length) return section(title, line(`None ${daily ? "today" : "this month"}.`) + (avg > 0 ? small(`Last year's average ${daily ? "day" : "month"}: ${money(avg)}.`) : ""));
  const top = docs[0];
  return section(title,
    line(`<b style="font-size:18px">${esc(money(total))}</b> in ${n(docs.length, noun)}`) +
    (c.text ? line(`${arrow(c.up)}${coloured(c.text, c.up)}`) : "") +
    (avg > 0 ? small(`Last year's average ${daily ? "day" : "month"}: ${esc(money(avg))}`) : "") +
    line(esc(byPerson(docs)), `font-size:14px`) +
    line(`Biggest: <b>${esc(money(top.total))}</b> ${esc(top.customer)}${top.person ? ` · ${esc(first(top.person))}` : ""}${top.number ? ` <span style="color:${MUTED}">(${esc(top.number)})</span>` : ""}`, "font-size:14px"));
}

function paceSection(f: SummaryFacts): string {
  const m = vsLastYear(f.days, "all", "month", f.on);
  const y = vsLastYear(f.days, "all", "year", f.on);
  const rows: string[] = [];
  const pace = (label: string, now: number, last: number) => {
    const end = m.daysIn < m.daysTotal ? Math.round((now / m.daysIn) * m.daysTotal) : now;
    const c = against(end, last, "last year's average month");
    rows.push(line(`${arrow(c.up)}<b>${label}</b> ${esc(money(now))} so far${m.daysIn < m.daysTotal ? `, heading for ${esc(money(end))}` : ""}`));
    if (c.text) rows.push(small(`${coloured(c.text, c.up)}${last > 0 ? ` (${esc(money(last))})` : ""}`));
  };
  const monthWord = parse(f.on).toLocaleDateString("en-IN", { month: "long" });
  rows.push(small(`${monthWord}: day ${m.daysIn} of ${m.daysTotal}`));
  pace("Quoted", m.now.quoted, m.last.quoted);
  pace("Invoiced", m.now.invoiced, m.last.invoiced);
  const fy = (label: string, now: number, last: number) => {
    const c = against(now, last, "the same days last year");
    rows.push(line(`${arrow(c.up)}<b>${label}</b> ${esc(money(now))}${c.text ? ` · ${coloured(c.text, c.up)}` : ""}`));
  };
  const d = parse(f.on), fyStart = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  rows.push(small(`<span style="display:block;margin-top:8px">FY ${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)} so far (since 1 April)</span>`));
  fy("Quoted", y.now.quoted, y.last.quoted);
  fy("Invoiced", y.now.invoiced, y.last.invoiced);
  return section("Month and year pace", rows.join(""));
}

function paymentsSection(f: SummaryFacts): string {
  const title = f.kind === "daily" ? "Payments received" : "Payments received this month";
  if (!f.payments) return section(title, missing(f.errors.payments));
  if (!f.payments.length) return section(title, line("None recorded."));
  const total = f.payments.reduce((s, p) => s + p.amount, 0);
  const by = new Map<string, number>();
  for (const p of f.payments) by.set(p.customer, (by.get(p.customer) ?? 0) + p.amount);
  const top = [...by.entries()].sort((a, b) => b[1] - a[1]);
  return section(title, line(`<b style="font-size:18px">${esc(money(total))}</b> from ${n(f.payments.length, "payment")}`) + list(top, 5, ([c, v]) => `${esc(money(v))} ${esc(c)}`));
}

function outstandingSection(f: SummaryFacts): string {
  const rows: string[] = [];
  if (f.receivable) {
    rows.push(line(`<b>Customers owe us</b> ${esc(money(f.receivable.balance))} <span style="color:${MUTED}">on ${n(f.receivable.count, "invoice")}</span>`));
    if (f.receivable.overdue) rows.push(line(`${f.receivable.overdue.balance > 0 ? `<span style="color:${RED}">▼</span> ` : ""}Overdue: ${esc(money(f.receivable.overdue.balance))} on ${n(f.receivable.overdue.count, "invoice")}`, "font-size:14px"));
  } else rows.push(line(`<b>Customers owe us</b>`) + missing(f.errors.receivable));
  if (f.payable) rows.push(line(`<b>We owe suppliers</b> ${esc(money(f.payable.balance))} <span style="color:${MUTED}">on ${n(f.payable.count, "bill")}</span>`, "margin-top:6px"));
  else rows.push(line(`<b>We owe suppliers</b>`, "margin-top:6px") + missing(f.errors.payable));
  return section("Total outstanding", rows.join(""));
}

function stockSection(f: SummaryFacts): string {
  const daily = f.kind === "daily";
  const title = daily ? "Stock in and out today" : "Stock bought this month";
  if (!f.stock) return section(title, missing(f.errors.stock));
  const rows: string[] = [];
  if (f.stock.bills) rows.push(line(`<b>In</b> ${n(f.stock.bills.count, "bill")}${f.stock.bills.total ? `, ${esc(money(f.stock.bills.total))}` : ""}`));
  const ins = byItem(f.stock.in);
  if (daily) {
    rows.push(line(`<b>In</b> ${ins.length ? "" : "nothing received"}`));
    rows.push(list(ins, 6, (l) => `${esc(l.item)} × ${l.qty}${l.party ? ` <span style="color:${MUTED}">from ${esc(l.party)}</span>` : ""}`));
  }
  if (f.stock.out) {
    const outs = byItem(f.stock.out);
    rows.push(line(`<b>Out</b> ${outs.length ? "" : "no goods invoiced"}`, "margin-top:6px"));
    rows.push(list(outs, 6, (l) => `${esc(l.item)} × ${l.qty}${l.party ? ` <span style="color:${MUTED}">to ${esc(l.party)}</span>` : ""}`));
  } else if (daily) rows.push(line(`<b>Out</b>`, "margin-top:6px") + missing(f.errors.stockOut));
  return section(title, rows.join(""));
}

function customersSection(f: SummaryFacts): string {
  const title = f.kind === "daily" ? "New customers" : "New customers this month";
  if (!f.newCustomers) return section(title, missing(f.errors.customers));
  if (!f.newCustomers.length) return section(title, line("None added."));
  return section(title, line(`<b>${f.newCustomers.length}</b> added`) + small(esc(f.newCustomers.slice(0, 12).join(", ")) + (f.newCustomers.length > 12 ? ` and ${f.newCustomers.length - 12} more` : "")));
}

function trainingRow(t: TrainingRow): string {
  const bits = [t.training || "Training", t.people ? n(t.people, "person", "people") : "", t.trainers.length ? t.trainers.map(first).join(", ") : ""].filter(Boolean);
  return `${t.time ? `${esc(t.time)} ` : ""}<b>${esc(t.customer)}</b>${t.aed ? " (AED)" : ""} <span style="color:${MUTED}">· ${esc(bits.join(" · "))}</span>`;
}
function trainingsSection(f: SummaryFacts): string {
  const t = f.trainings;
  if (!t) return section("Trainings", missing(f.errors.trainings));
  const people = (xs: TrainingRow[]) => xs.reduce((s, x) => s + x.people, 0);
  const block = (label: string, xs: TrainingRow[]) => line(`<b>${esc(label)}</b> ${xs.length ? `${n(xs.length, "training")}${people(xs) ? `, ${n(people(xs), "person", "people")}` : ""}` : "none"}`, "margin-top:6px") + list(xs, 8, trainingRow);
  if (f.kind === "monthly") return section("Trainings", block("Held this month", t.today) + block(t.nextLabel, t.next));
  return section("Trainings", block("Today", t.today) + block(t.nextLabel, t.next));
}

function renewalsSection(f: SummaryFacts): string {
  const title = f.kind === "daily" ? "AED renewals due in 30 days" : "AED renewals due next month";
  if (!f.renewals) return section(title, missing(f.errors.renewals));
  if (!f.renewals.length) return section(title, line("None."));
  return section(title, line(`<b>${f.renewals.length}</b> due`) + list(f.renewals, 10, (r) => `${esc(dayMonth(r.date))} <b>${esc(r.customer)}</b> <span style="color:${MUTED}">· ${r.what === "pads" ? "pads" : "battery"}${r.qty > 1 ? ` × ${r.qty}` : ""}</span>`));
}

/** The subject and the HTML body of the summary. */
export function summaryEmail(f: SummaryFacts): { subject: string; html: string; headline: string } {
  const daily = f.kind === "daily";
  const total = (xs: SaleDoc[] | null) => (xs ? money(xs.reduce((s, d) => s + d.total, 0)) : "?");
  const subject = `${daily ? "Daily" : "Monthly"} summary · ${daily ? longDate(f.on) : monthName(f.on)}: ${total(f.quotes)} quoted, ${total(f.invoices)} invoiced`;
  const head = headline(f);
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.45;color:${INK};max-width:560px;margin:0 auto;padding:4px 2px">
<div style="font-size:13px;color:${MUTED}">${esc(daily ? longDate(f.on) : monthName(f.on))} · ${daily ? "daily" : "monthly"} summary</div>
<div style="font-size:19px;font-weight:700;line-height:1.3;margin:6px 0 12px">${esc(head)}.</div>
${salesSection(f, f.quotes, "quoted", daily ? "Quotations sent today" : "Quotations sent this month", "quotation")}
${salesSection(f, f.invoices, "invoiced", daily ? "Invoiced today" : "Invoiced this month", "invoice")}
${paceSection(f)}
${paymentsSection(f)}
${outstandingSection(f)}
${stockSection(f)}
${customersSection(f)}
${trainingsSection(f)}
${renewalsSection(f)}
<div style="padding-top:12px;border-top:1px solid ${LINE};font-size:12px;color:${MUTED}">▲ / ▼ against last year. Sent automatically by the Think Health dashboard.</div>
</div>`;
  return { subject, html, headline: head };
}
