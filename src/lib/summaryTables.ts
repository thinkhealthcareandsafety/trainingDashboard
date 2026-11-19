import { type Tally } from "./aedStock";
import { type SaleDoc, type SummaryFacts, type TrainingRow, byItem, headline, monthStart } from "./dailySummary";
import { gstRows } from "./gst";
import { inrShort, personKey, vsLastYear } from "./overviewMath";

/*
 * The summary as tables (owner, 19 Nov: "the report sent in the email should be in tables, and in a PDF"). Pure: the
 * facts (dailySummaryGather.ts) become sections of tables; summaryPdf.ts draws them. The same sections and order as the
 * email had: AEDs first, then quotations and invoices, the pace, GST, payments, outstanding, stock, customers, trainings,
 * renewals. A section Zoho couldn't give is a one-line note.
 */

export type Tone = "up" | "down";
export type Cell = string | { text: string; tone?: Tone; bold?: boolean; muted?: boolean };
export type Column = { head: string; right?: boolean; width?: number };
/** `group`: a heading row across the table; `bold`: a total; `indent`: under the row above (a brand under its kind). */
export type TableRow = { cells: Cell[]; bold?: boolean; group?: boolean; indent?: boolean };
export type Table = { columns: Column[]; rows: TableRow[] };
export type Block = { table: Table } | { note: string } | { text: string; tone?: Tone };
export type Section = { title: string; blocks: Block[] };
export type SummaryDoc = { kicker: string; headline: string; sections: Section[]; footer: string };

const parse = (s: string) => new Date(`${s}T00:00:00`);
const money = inrShort;
/** Full rupees (GST): ₹1,23,456; below zero −. */
export const rupees = (v: number) => `${v < 0 ? "-" : ""}₹${Math.abs(Math.round(v)).toLocaleString("en-IN")}`;
const dayMonth = (s: string) => parse(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const longDate = (s: string) => parse(s).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const monthName = (s: string) => parse(s).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const first = (name: string) => name.trim().split(/\s+/)[0] ?? "";
const sum = <T,>(xs: T[], v: (x: T) => number) => xs.reduce((s, x) => s + v(x), 0);

/** Against a figure from last year: "2.1×", "+35%", "-20%" with its tone; blank when there's nothing to compare. */
export function change(now: number, last: number): Cell {
  if (last <= 0) return "";
  const r = now / last;
  if (r >= 1.5) return { text: `${+r.toFixed(1)}×`, tone: "up" };
  const pct = Math.round((r - 1) * 100);
  if (pct === 0) return "same";
  return { text: `${pct > 0 ? "+" : ""}${pct}%`, tone: pct > 0 ? "up" : "down" };
}

const note = (why: string | undefined): Block => ({ note: `Couldn't read this from Zoho${why ? ` (${why})` : ""}.` });

function aed(f: SummaryFacts): Section {
  const title = "AEDs, pads, batteries and cabinets";
  if (!f.aedStock) return { title, blocks: [note(f.errors.aedStock)] };
  const { report: r, unread } = f.aedStock;
  const daily = f.kind === "daily";
  const qv = (k: number, v: number) => (k ? `${k}${v ? ` · ${money(v)}` : ""}` : "-");
  const cells = (t: Tally): Cell[] => [String(t.stock), t.stockValue ? money(t.stockValue) : "-", qv(t.sold, t.soldValue), qv(t.bought, t.boughtValue), ...(daily ? [qv(t.soldToday, t.soldTodayValue), qv(t.boughtToday, t.boughtTodayValue)] : [])];
  const rows: TableRow[] = [{ cells: ["All together", ...cells(r.total)], bold: true }];
  for (const k of r.kinds) {
    rows.push({ cells: [k.label, ...cells(k.tally)], bold: true });
    for (const b of k.brands) rows.push({ cells: [b.brand, ...cells(b.tally)], indent: true });
  }
  const columns: Column[] = [{ head: "", width: 1.5 }, { head: "In stock", right: true, width: 0.75 }, { head: "Value at cost", right: true }, { head: "Sold this month", right: true, width: 1.3 }, { head: "Bought this month", right: true, width: 1.35 }, ...(daily ? [{ head: "Sold today", right: true, width: 1.2 }, { head: "Bought today", right: true, width: 1.2 }] : [])];
  const extra = [unread ? `${unread} bills / invoices not read from Zoho yet; they count next time.` : "", r.stockUnknown ? `Stock unknown for ${r.stockUnknown} items.` : ""].filter(Boolean).join(" ");
  return { title, blocks: [{ table: { columns, rows } }, { note: `Sold and bought: ${dayMonth(monthStart(f.on))} – ${dayMonth(f.on)} (count · value), active items only.${extra ? ` ${extra}` : ""}` }] };
}

function sales(f: SummaryFacts): Section {
  const daily = f.kind === "daily";
  const title = daily ? "Quotations and invoices today" : "Quotations and invoices this month";
  const blocks: Block[] = [];
  const unit = daily ? "day" : "month";
  const avg = vsLastYear(f.days, "all", unit, f.on).last;
  const row = (label: string, docs: SaleDoc[] | null, slot: "quoted" | "invoiced"): TableRow => {
    if (!docs) return { cells: [label, { text: `Couldn't read this from Zoho${f.errors[slot] ? ` (${f.errors[slot]})` : ""}`, muted: true }, "", "", ""] };
    const total = sum(docs, (d) => d.total);
    return { cells: [label, String(docs.length), money(total), avg[slot] > 0 ? money(avg[slot]) : "-", change(total, avg[slot])] };
  };
  blocks.push({ table: {
    columns: [{ head: "", width: 1.6 }, { head: "How many", right: true }, { head: "Amount", right: true }, { head: `Last year's average ${unit}`, right: true, width: 1.5 }, { head: "Against it", right: true }],
    rows: [row("Quotations sent", f.quotes, "quoted"), row("Invoiced", f.invoices, "invoiced")],
  } });
  // By person: Sumit / Ashish / Pranjal / others.
  const people = ["Sumit", "Ashish", "Pranjal", "Others"];
  const of = (docs: SaleDoc[] | null, who: string) => (docs ?? []).filter((d) => { const k = personKey(d.person); return (k ? k[0].toUpperCase() + k.slice(1) : "Others") === who; });
  const byPerson = people.map((p) => ({ p, q: of(f.quotes, p), i: of(f.invoices, p) })).filter((x) => x.q.length || x.i.length);
  if (byPerson.length) blocks.push({ table: {
    columns: [{ head: "By person", width: 1.6 }, { head: "Quotations", right: true }, { head: "Quoted", right: true }, { head: "Invoices", right: true }, { head: "Invoiced", right: true }],
    rows: byPerson.map((x) => ({ cells: [x.p, String(x.q.length), x.q.length ? money(sum(x.q, (d) => d.total)) : "-", String(x.i.length), x.i.length ? money(sum(x.i, (d) => d.total)) : "-"] })),
  } });
  const biggest = ([["Biggest quotation", f.quotes?.[0]], ["Biggest invoice", f.invoices?.[0]]] as const).filter(([, d]) => d);
  if (biggest.length) blocks.push({ table: {
    columns: [{ head: "", width: 1.6 }, { head: "Customer", width: 2.6 }, { head: "Amount", right: true }, { head: "By" }, { head: "Number" }],
    rows: biggest.map(([label, d]) => ({ cells: [label, d!.customer, money(d!.total), first(d!.person) || "-", d!.number || "-"] })),
  } });
  return { title, blocks };
}

function pace(f: SummaryFacts): Section {
  const m = vsLastYear(f.days, "all", "month", f.on);
  const y = vsLastYear(f.days, "all", "year", f.on);
  const running = m.daysIn < m.daysTotal;
  const end = (now: number) => (running ? Math.round((now / m.daysIn) * m.daysTotal) : now);
  const monthWord = parse(f.on).toLocaleDateString("en-IN", { month: "long" });
  const d = parse(f.on), fyStart = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return { title: "Month and year pace", blocks: [
    { table: {
      columns: [{ head: `${monthWord}: day ${m.daysIn} of ${m.daysTotal}`, width: 1.6 }, { head: "So far", right: true }, { head: "Heading for", right: true }, { head: "Last year's average month", right: true, width: 1.5 }, { head: "Against it", right: true }],
      rows: ([["Quoted", "quoted"], ["Invoiced", "invoiced"]] as const).map(([label, k]) => ({ cells: [label, money(m.now[k]), running ? money(end(m.now[k])) : "-", m.last[k] > 0 ? money(m.last[k]) : "-", change(end(m.now[k]), m.last[k])] })),
    } },
    { table: {
      columns: [{ head: `FY ${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)} so far`, width: 1.6 }, { head: "Since 1 April", right: true }, { head: "Same days last year", right: true, width: 1.5 }, { head: "Against it", right: true }],
      rows: ([["Quoted", "quoted"], ["Invoiced", "invoiced"]] as const).map(([label, k]) => ({ cells: [label, money(y.now[k]), y.last[k] > 0 ? money(y.last[k]) : "-", change(y.now[k], y.last[k])] })),
    } },
  ] };
}

function gst(f: SummaryFacts): Section | null {
  const title = "GST summary";
  if (f.gst === undefined) return null;
  if (!f.gst) return { title, blocks: [note(f.errors.gst)] };
  // A table per period (owner, 19 Nov): a row per tax and rate, then Total; Purchase, Sale, and Total = sale minus purchase.
  const lines = gstRows(f.gst.periods);
  const blocks: Block[] = f.gst.periods.map((p) => {
    const rows: TableRow[] = lines.map((l) => ({ cells: [`${l.tax} ${l.rate}%`, rupees(p.purchases.byRate[l.key] ?? 0), rupees(p.sales.byRate[l.key] ?? 0), rupees(p.net.byRate[l.key] ?? 0)] }));
    rows.push({ cells: ["Total (IGST + CGST + SGST)", rupees(p.purchases.total), rupees(p.sales.total), rupees(p.net.total)], bold: true });
    const bills = `${p.purchases.count} bill${p.purchases.count === 1 ? "" : "s"}`, invoices = `${p.sales.count} invoice${p.sales.count === 1 ? "" : "s"}`;
    return { table: { columns: [{ head: p.label, width: 1.8 }, { head: `Purchase (${bills})`, right: true }, { head: `Sale (${invoices})`, right: true }, { head: "Total (sale - purchase)", right: true }], rows } };
  });
  blocks.push({ note: `From the invoices and bills in Zoho Books (not drafts or void); credit notes not taken off.${f.gst.unread ? ` ${f.gst.unread} invoices / bills since 1 April not read from Zoho yet — the figures grow as they are read over the next runs.` : ""}` });
  return { title, blocks };
}

function payments(f: SummaryFacts): Section {
  const title = f.kind === "daily" ? "Payments received today" : "Payments received this month";
  if (!f.payments) return { title, blocks: [note(f.errors.payments)] };
  if (!f.payments.length) return { title, blocks: [{ text: "None recorded." }] };
  const by = new Map<string, { v: number; k: number }>();
  for (const p of f.payments) { const g = by.get(p.customer) ?? { v: 0, k: 0 }; g.v += p.amount; g.k++; by.set(p.customer, g); }
  const top = [...by.entries()].sort((a, b) => b[1].v - a[1].v);
  const shown = top.slice(0, 12);
  const rows: TableRow[] = shown.map(([c, g]) => ({ cells: [c, String(g.k), money(g.v)] }));
  if (top.length > shown.length) rows.push({ cells: [{ text: `and ${top.length - shown.length} more`, muted: true }, "", ""] });
  rows.push({ cells: ["Total", String(f.payments.length), money(sum(f.payments, (p) => p.amount))], bold: true });
  return { title, blocks: [{ table: { columns: [{ head: "Customer", width: 3 }, { head: "Payments", right: true }, { head: "Amount", right: true }], rows } }] };
}

function outstanding(f: SummaryFacts): Section {
  const no = (why: string | undefined): Cell[] => [{ text: `Couldn't read this from Zoho${why ? ` (${why})` : ""}`, muted: true }, ""];
  const rows: TableRow[] = [
    { cells: ["Customers owe us", ...(f.receivable ? [money(f.receivable.balance), `${f.receivable.count} invoices`] : no(f.errors.receivable))], bold: true },
  ];
  if (f.receivable?.overdue) rows.push({ cells: ["of which overdue", { text: money(f.receivable.overdue.balance), tone: f.receivable.overdue.balance > 0 ? "down" : undefined }, `${f.receivable.overdue.count} invoices`], indent: true });
  rows.push({ cells: ["We owe suppliers", ...(f.payable ? [money(f.payable.balance), `${f.payable.count} bills`] : no(f.errors.payable))], bold: true });
  return { title: "Total outstanding", blocks: [{ table: { columns: [{ head: "", width: 2 }, { head: "Amount", right: true }, { head: "On", right: true }], rows } }] };
}

function stock(f: SummaryFacts): Section {
  const daily = f.kind === "daily";
  const title = daily ? "Stock in and out today" : "Stock bought this month";
  if (!f.stock) return { title, blocks: [note(f.errors.stock)] };
  if (!daily) return { title, blocks: [{ text: f.stock.bills ? `${f.stock.bills.count} bills${f.stock.bills.total ? `, ${money(f.stock.bills.total)}` : ""}.` : "No bills." }] };
  const rows: TableRow[] = [];
  const part = (label: string, lines: ReturnType<typeof byItem> | null, why?: string) => {
    rows.push({ cells: [label, "", "", ""], group: true });
    if (!lines) return rows.push({ cells: [{ text: `Couldn't read this from Zoho${why ? ` (${why})` : ""}`, muted: true }, "", "", ""] });
    if (!lines.length) return rows.push({ cells: [{ text: label.startsWith("In") ? "Nothing received" : "No goods invoiced", muted: true }, "", "", ""] });
    for (const l of lines.slice(0, 12)) rows.push({ cells: [l.item, String(l.qty), l.value ? money(l.value) : "-", l.party || "-"] });
    if (lines.length > 12) rows.push({ cells: [{ text: `and ${lines.length - 12} more`, muted: true }, "", "", ""] });
  };
  part("In (bills)", byItem(f.stock.in));
  part("Out (invoices)", f.stock.out ? byItem(f.stock.out) : null, f.errors.stockOut);
  return { title, blocks: [{ table: { columns: [{ head: "Item", width: 3 }, { head: "Qty", right: true, width: 0.6 }, { head: "Value", right: true, width: 0.9 }, { head: "From / to", width: 2 }], rows } }] };
}

function customers(f: SummaryFacts): Section {
  const title = f.kind === "daily" ? "New customers" : "New customers this month";
  if (!f.newCustomers) return { title, blocks: [note(f.errors.customers)] };
  if (!f.newCustomers.length) return { title, blocks: [{ text: "None added." }] };
  // Two names a row, so a long list stays short.
  const names = f.newCustomers.slice(0, 30);
  const rows: TableRow[] = [];
  for (let i = 0; i < names.length; i += 2) rows.push({ cells: [names[i], names[i + 1] ?? ""] });
  if (f.newCustomers.length > names.length) rows.push({ cells: [{ text: `and ${f.newCustomers.length - names.length} more`, muted: true }, ""] });
  return { title, blocks: [{ text: `${f.newCustomers.length} added.` }, { table: { columns: [{ head: "Customer" }, { head: "" }], rows } }] };
}

function trainings(f: SummaryFacts): Section {
  const t = f.trainings;
  if (!t) return { title: "Trainings", blocks: [note(f.errors.trainings)] };
  const rows: TableRow[] = [];
  const part = (label: string, xs: TrainingRow[]) => {
    const people = sum(xs, (x) => x.people);
    rows.push({ cells: [`${label}: ${xs.length ? `${xs.length} training${xs.length === 1 ? "" : "s"}${people ? `, ${people} people` : ""}` : "none"}`, "", "", "", ""], group: true });
    for (const x of xs.slice(0, 12)) rows.push({ cells: [x.time ?? "", `${x.customer}${x.aed ? " (AED)" : ""}`, x.training || "Training", x.people ? String(x.people) : "-", x.trainers.map(first).join(", ") || "-"] });
    if (xs.length > 12) rows.push({ cells: ["", { text: `and ${xs.length - 12} more`, muted: true }, "", "", ""] });
  };
  part(f.kind === "monthly" ? "Held this month" : "Today", t.today);
  part(t.nextLabel, t.next);
  return { title: "Trainings", blocks: [{ table: { columns: [{ head: "Time", width: 0.7 }, { head: "Customer", width: 2.4 }, { head: "Training", width: 2 }, { head: "People", right: true, width: 0.7 }, { head: "Trainers", width: 1.3 }], rows } }] };
}

function renewals(f: SummaryFacts): Section {
  const title = f.kind === "daily" ? "AED renewals due in 30 days" : "AED renewals due next month";
  if (!f.renewals) return { title, blocks: [note(f.errors.renewals)] };
  if (!f.renewals.length) return { title, blocks: [{ text: "None." }] };
  const shown = f.renewals.slice(0, 25);
  const rows: TableRow[] = shown.map((r) => ({ cells: [dayMonth(r.date), r.customer, r.what === "pads" ? "Pads" : "Battery", String(r.qty)] }));
  if (f.renewals.length > shown.length) rows.push({ cells: ["", { text: `and ${f.renewals.length - shown.length} more`, muted: true }, "", ""] });
  return { title, blocks: [{ text: `${f.renewals.length} due.` }, { table: { columns: [{ head: "Due", width: 0.8 }, { head: "Customer", width: 3 }, { head: "What", width: 0.9 }, { head: "Qty", right: true, width: 0.5 }], rows } }] };
}

/** The whole summary as sections of tables. */
export function summaryTables(f: SummaryFacts): SummaryDoc {
  const daily = f.kind === "daily";
  const sections = [f.aedStock !== undefined ? aed(f) : null, sales(f), pace(f), gst(f), payments(f), outstanding(f), stock(f), customers(f), trainings(f), renewals(f)].filter((s): s is Section => Boolean(s));
  return {
    kicker: `${daily ? "Daily" : "Monthly"} summary · ${daily ? longDate(f.on) : monthName(f.on)}`,
    headline: `${headline(f)}.`,
    sections,
    footer: "Green and red arrows: against last year. Made automatically by the Think Health dashboard from Zoho Books.",
  };
}
