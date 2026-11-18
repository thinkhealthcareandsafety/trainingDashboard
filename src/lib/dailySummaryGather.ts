import "server-only";
import { parseAedLine } from "./aedParse";
import { db } from "./db";
import { syncWindowStart, ymd } from "./dates";
import {
  type Outstanding, type Payment, type ReportKind, type SaleDoc, type StockLine, type SummaryFacts,
  addDays, docsOf, monthStart, nextMonth, nextWorkDay, renewalsDue, trainingsOn,
} from "./dailySummary";
import { boardTrainings } from "./fulfilServer";
import { type SalesDayRow, daySums } from "./overviewMath";
import { booksApi } from "./quotations";
import { type ZItem, pool } from "./zoho";
import { aedData, getSnapshot } from "./zohoSync";

/*
 * The facts for the daily / monthly summary (dailySummary.ts), each section on its own: one Zoho failure leaves that
 * section out with a note, never the email. Zoho Books calls (the quotations connection, full access) — about 10 a day
 * plus one per bill and per invoice of the day for the stock lines:
 *  - quotations / invoices: the Sales copy (`salesDocs`) for every past day, today's read straight from Zoho (fresh at 7 pm);
 *  - payments: GET /customerpayments (date, or date_start / date_end for the month);
 *  - outstanding: GET /invoices Status.Unpaid / Status.Overdue and GET /bills Status.Unpaid with response_option=3 (Zoho
 *    adds the sum of balances), paging and adding up when the sum isn't there;
 *  - stock: in = bills of the day (their lines), out = goods lines of the day's invoices; the month: bills only;
 *  - new customers: GET /contacts newest first; trainings and AED renewals: the boards (no Zoho call).
 */

type Row = Record<string, unknown>;
const msg = (e: unknown) => (e instanceof Error ? e.message.replace(/^Zoho Books:\s*/, "") : String(e)).slice(0, 120);
/** A section's facts, or null with the reason kept. */
async function attempt<T>(errors: SummaryFacts["errors"], key: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (e) {
    errors[key] = msg(e);
    console.error(`[summary] ${key}: ${errors[key]}`);
    return null;
  }
}

/** Every page of a Books list (at most `max` pages of 200). */
async function pages(path: string, key: string, params: Record<string, string>, max = 5): Promise<Row[]> {
  const out: Row[] = [];
  for (let page = 1; page <= max; page++) {
    const j = await booksApi("GET", path, { ...params, per_page: "200", page: String(page) });
    out.push(...((j[key] as Row[]) ?? []));
    if (!(j.page_context as { has_more_page?: boolean } | undefined)?.has_more_page) break;
  }
  return out;
}

/** What is still owed on a list (invoices / bills) with a status filter: Zoho's sum when it gives one, else added up. */
async function owed(path: "/invoices" | "/bills", filter: string): Promise<Outstanding> {
  const key = path.slice(1);
  const j = await booksApi("GET", path, { filter_by: filter, response_option: "3", per_page: "1" });
  const pc = (j.page_context ?? {}) as { sum_columns?: { balance?: unknown }; total?: unknown; total_count?: unknown };
  const sum = Number(pc.sum_columns?.balance);
  const count = Number(pc.total ?? pc.total_count);
  if (Number.isFinite(sum) && Number.isFinite(count)) return { balance: sum, count };
  const rows = await pages(path, key, { filter_by: filter }, 10);
  return { balance: rows.reduce((s, r) => s + (Number(r.balance) || 0), 0), count: rows.length };
}

const INCIDENTAL = /travel|conveyance|accommodation|lodging|boarding|freight|shipping|courier|packing|forwarding|transport/i;
/** The goods lines of a bill / invoice (not services, not freight or travel). */
function goods(doc: Row, party: string, services: Set<string>): StockLine[] {
  return ((doc.line_items as Row[]) ?? [])
    .filter((li) => {
      const name = String(li.name ?? "");
      if (!name || INCIDENTAL.test(name)) return false;
      if (li.product_type) return li.product_type === "goods";
      return Boolean(li.item_id) && !services.has(String(li.item_id));
    })
    .map((li) => ({ item: String(li.name), qty: Number(li.quantity) || 0, value: Number(li.item_total) || 0, party }));
}

const toRow = (kind: "estimates" | "invoices", r: Row): SalesDayRow => ({ _id: `${kind}:${String(r[kind === "estimates" ? "estimate_id" : "invoice_id"])}`, kind, date: String(r.date ?? ""), row: r });

export async function gatherSummary(kind: ReportKind, on: string): Promise<SummaryFacts> {
  const errors: SummaryFacts["errors"] = {};
  const from = kind === "daily" ? on : monthStart(on);
  const range: Record<string, string> = kind === "daily" ? { date: on } : { date_start: from, date_end: on };

  // Quotations and invoices: the Sales copy, today's fresh from Zoho (the copy's today stays if Zoho can't be read).
  const since = ymd(syncWindowStart(new Date(`${on}T12:00:00+05:30`)));
  let rows: SalesDayRow[] = [];
  let copyOk = true;
  try {
    rows = await (await db()).collection<SalesDayRow>("salesDocs").find({ kind: { $in: ["estimates", "invoices"] } }, { projection: { kind: 1, date: 1, row: 1 } }).toArray();
  } catch (e) {
    copyOk = false;
    errors.quoted = errors.invoiced = msg(e);
  }
  let todaysInvoices: Row[] | null = null;
  for (const k of ["estimates", "invoices"] as const) {
    const live = await attempt(errors, `${k}Today`, () => pages(`/${k}`, k, { date: on }, 3));
    if (!live) continue;
    if (k === "invoices") todaysInvoices = live;
    rows = rows.filter((r) => !(r.kind === k && String(r.row.date ?? r.date).slice(0, 10) === on)).concat(live.map((r) => toRow(k, r)));
  }
  const days = daySums(rows, since);
  // The day needs the copy or Zoho; the month needs the copy (Zoho gave only today).
  const sales = (k: "estimates" | "invoices"): SaleDoc[] | null => {
    const ok = kind === "daily" ? copyOk || errors[`${k}Today`] === undefined : copyOk;
    if (!ok) { errors[k === "estimates" ? "quoted" : "invoiced"] ??= errors[`${k}Today`]; return null; }
    return docsOf(rows, k, from, on);
  };

  const services = await attempt(errors, "items", async () => new Set(((((await (await db()).collection<{ _id: string; items?: ZItem[] }>("kv").findOne({ _id: "zoho_items" }))?.items) ?? []).filter((i) => i.service).map((i) => i.id))));

  const [payments, receivable, overdue, payable, stock, newCustomers, boards] = await Promise.all([
    attempt(errors, "payments", async (): Promise<Payment[]> => (await pages("/customerpayments", "customerpayments", range)).map((p) => ({ customer: String(p.customer_name ?? ""), amount: Number(p.amount) || 0 }))),
    attempt(errors, "receivable", () => owed("/invoices", "Status.Unpaid")),
    attempt(errors, "overdue", () => owed("/invoices", "Status.Overdue")),
    attempt(errors, "payable", () => owed("/bills", "Status.Unpaid")),
    attempt(errors, "stock", async (): Promise<SummaryFacts["stock"]> => {
      const bills = (await pages("/bills", "bills", range)).filter((b) => !/void|draft/i.test(String(b.status ?? "")));
      if (kind === "monthly") return { in: [], out: null, bills: { count: bills.length, total: bills.reduce((s, b) => s + (Number(b.total) || 0), 0) } };
      const svc = services ?? new Set<string>();
      const ins: StockLine[] = [];
      await pool(bills.slice(0, 15), 4, async (b) => {
        const d = (await booksApi("GET", `/bills/${String(b.bill_id)}`)).bill as Row | undefined;
        if (d) ins.push(...goods(d, String(b.vendor_name ?? ""), svc));
      });
      let out: StockLine[] | null = null;
      if (todaysInvoices) {
        out = [];
        const sent = todaysInvoices.filter((i) => !/void|draft/i.test(String(i.status ?? ""))).slice(0, 25);
        await pool(sent, 4, async (i) => {
          const d = (await booksApi("GET", `/invoices/${String(i.invoice_id)}`)).invoice as Row | undefined;
          if (d) out!.push(...goods(d, String(i.customer_name ?? ""), svc));
        });
      } else errors.stockOut = errors.invoicesToday;
      return { in: ins, out };
    }),
    attempt(errors, "customers", async () => {
      const j = await booksApi("GET", "/contacts", { contact_type: "customer", sort_column: "created_time", sort_order: "D", per_page: "200" });
      return ((j.contacts as Row[]) ?? [])
        .filter((c) => c.contact_type === undefined || c.contact_type === "customer")
        .filter((c) => { const d = String(c.created_time ?? "").slice(0, 10); return d >= from && d <= on; })
        .map((c) => String(c.contact_name ?? c.company_name ?? "").trim()).filter(Boolean);
    }),
    attempt(errors, "trainings", async () => {
      const snap = await getSnapshot();
      if (!snap) throw new Error("the board's copy of Zoho isn't ready");
      return { snap, ...(await boardTrainings(snap)) };
    }),
  ]);
  if (receivable && overdue) Object.assign(receivable, { overdue });
  if (!boards) errors.renewals = errors.trainings;

  let trainings: SummaryFacts["trainings"] = null;
  if (boards) {
    const all = [...boards.board, ...boards.aedBoard];
    if (kind === "daily") {
      const next = nextWorkDay(on);
      trainings = { today: trainingsOn(all, on), next: trainingsOn(all, next.day), nextLabel: next.label };
    } else {
      // Held this month (each training once, on its last day in the month); then tomorrow's.
      const held = all.filter((t) => t.dates.some((d) => d >= from && d <= on) && t.status !== "postponed" && t.status !== "tbd")
        .map((t) => ({ ...t, dates: [t.dates.filter((d) => d >= from && d <= on).at(-1)!] }));
      const next = nextWorkDay(on);
      trainings = { today: held.flatMap((t) => trainingsOn([t], t.dates[0])), next: trainingsOn(all, next.day), nextLabel: next.label };
    }
  }
  const [rFrom, rTo] = kind === "daily" ? [on, addDays(on, 30)] : nextMonth(on);
  const renewals = boards ? await attempt(errors, "renewals", async () => renewalsDue(aedData(boards.snap).invoices, parseAedLine, rFrom, rTo)) : null;

  return {
    kind, on, days,
    quotes: sales("estimates"),
    invoices: sales("invoices"),
    payments,
    receivable: receivable as SummaryFacts["receivable"],
    payable,
    stock,
    newCustomers,
    trainings,
    renewals,
    errors,
  };
}
