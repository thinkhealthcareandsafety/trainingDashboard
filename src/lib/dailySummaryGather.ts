import "server-only";
import { parseAedLine } from "./aedParse";
import { type AedItem, type MoveLine, aedKindOf, aedReport, brandOf } from "./aedStock";
import { db } from "./db";
import { syncWindowStart, ymd } from "./dates";
import {
  type Outstanding, type Payment, type ReportKind, type SaleDoc, type StockLine, type SummaryFacts,
  addDays, docsOf, monthStart, nextMonth, nextWorkDay, renewalsDue, trainingsOn,
} from "./dailySummary";
import { boardTrainings } from "./fulfilServer";
import { type GstDoc, gstOf, gstPeriods, gstWindows } from "./gst";
import { type SalesDayRow, daySums } from "./overviewMath";
import { booksApi } from "./quotations";
import { type ZItem, lmtOf, pool } from "./zoho";
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
 *  - AEDs, pads, batteries, cabinets (first section, owner 18 Nov): the active items (GET /items) and their stock on hand
 *    (GET /itemdetails, 25 at a time), bought = the month's bills' lines, sold = the month's invoices' lines. Each bill /
 *    invoice is read once and kept (`billDetails`, and the Sales board's `salesDetails`) until it changes; at most
 *    READ_BUDGET are read a run (newest first), the rest next time;
 *  - GST (owner, 19 Nov): the taxes of every invoice and bill since 1 April (this month's and this FY's), from the same
 *    kept records (and the Training board's own copies) — so the first runs read the year's documents from Zoho a
 *    READ_BUDGET at a time, this month's first;
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

/** A bill / invoice of the month with what's needed to read its lines. */
type DocRef = { kind: "bills" | "invoices"; id: string; lmt: string; date: string; party: string };
type ReadDoc = DocRef & { doc: Row };
const READ_BUDGET = 70;

/** The documents' full records: kept copies when unchanged, else Zoho (this month's first, then newest first, at most READ_BUDGET); `unread` = the rest. */
async function readDocs(refs: DocRef[], monthFrom: string): Promise<{ docs: ReadDoc[]; unread: number }> {
  const database = await db();
  const cols = { invoices: database.collection<{ _id: string; lmt: string; doc: Row }>("salesDetails"), bills: database.collection<{ _id: string; lmt: string; doc: Row }>("billDetails") };
  const keyOf = (r: DocRef) => `${r.kind}:${r.id}`;
  const lmtNow = new Map(refs.map((r) => [keyOf(r), r.lmt]));
  const kept = new Map<string, { lmt: string; doc: Row }>();
  for (const k of ["invoices", "bills"] as const) {
    const ids = refs.filter((r) => r.kind === k).map(keyOf);
    if (ids.length) for (const d of await cols[k].find({ _id: { $in: ids } }).toArray()) kept.set(d._id, d);
  }
  // The Training board's copies of its invoices (zohoDocs, same keys) count too — no Zoho call for those.
  const invoiceIds = refs.filter((r) => r.kind === "invoices" && kept.get(keyOf(r))?.lmt !== r.lmt).map(keyOf);
  if (invoiceIds.length) {
    for (const d of await database.collection<{ _id: string; lmt?: string; doc?: Row }>("zohoDocs").find({ _id: { $in: invoiceIds } }, { projection: { lmt: 1, doc: 1 } }).toArray()) {
      const lmt = d.doc ? lmtOf(d.doc) || d.lmt || "" : "";
      if (d.doc && (!kept.has(d._id) || lmt === lmtNow.get(d._id))) kept.set(d._id, { lmt, doc: d.doc });
    }
  }
  const docs: ReadDoc[] = [];
  const toRead: DocRef[] = [];
  for (const r of refs) {
    const had = kept.get(keyOf(r));
    if (had && (had.lmt === r.lmt || !r.lmt)) docs.push({ ...r, doc: had.doc });
    else toRead.push(r);
  }
  toRead.sort((a, b) => Number(b.date >= monthFrom) - Number(a.date >= monthFrom) || b.date.localeCompare(a.date));
  await pool(toRead.slice(0, READ_BUDGET), 4, async (r) => {
    try {
      const doc = (await booksApi("GET", `/${r.kind}/${r.id}`))[r.kind === "bills" ? "bill" : "invoice"] as Row | undefined;
      if (!doc) return;
      docs.push({ ...r, doc });
      await cols[r.kind].replaceOne({ _id: keyOf(r) }, { lmt: r.lmt || lmtOf(doc), doc }, { upsert: true });
    } catch (e) {
      console.error(`[summary] reading ${keyOf(r)}: ${msg(e)}`);
    }
  });
  return { docs, unread: refs.length - docs.length };
}

/** The four kinds' active items with their stock on hand (null when Zoho didn't say). */
async function aedItems(): Promise<AedItem[]> {
  const items: AedItem[] = [];
  for (const r of await pages("/items", "items", { filter_by: "Status.Active" }, 10)) {
    if (r.status && r.status !== "active") continue;
    const kind = aedKindOf(String(r.name ?? ""), (r.cf_item_identifier as string | undefined) ?? null, (r.product_type as string | undefined) ?? null);
    if (!kind) continue;
    items.push({ id: String(r.item_id), name: String(r.name), kind, brand: brandOf(r.brand as string | undefined, String(r.name)), stock: null, cost: Number(r.purchase_rate) || 0 });
  }
  const stockOf = (d: Row): number | null => {
    if (d.stock_on_hand !== undefined && d.stock_on_hand !== null && d.stock_on_hand !== "") return Number(d.stock_on_hand) || 0;
    const locs = d.locations as Row[] | undefined;
    return locs?.length ? locs.reduce((t, l) => t + (Number(l.location_stock_on_hand) || 0), 0) : null;
  };
  const byId = new Map(items.map((i) => [i.id, i]));
  const chunks: AedItem[][] = [];
  for (let i = 0; i < items.length; i += 25) chunks.push(items.slice(i, i + 25));
  await pool(chunks, 2, async (chunk) => {
    try {
      const j = await booksApi("GET", "/itemdetails", { item_ids: chunk.map((i) => i.id).join(",") });
      for (const d of (j.items as Row[]) ?? []) { const it = byId.get(String(d.item_id)); if (it) it.stock = stockOf(d); }
    } catch (e) {
      console.error(`[summary] itemdetails: ${msg(e)}`);
    }
    // One at a time for any the bulk call didn't give.
    await pool(chunk.filter((i) => i.stock === null), 2, async (it) => {
      const d = (await booksApi("GET", `/items/${it.id}`).catch(() => ({} as Row))).item as Row | undefined;
      if (d) it.stock = stockOf(d);
    });
  });
  return items;
}

/** A document's lines as moves of items. */
const movesOf = (docs: ReadDoc[]): MoveLine[] => docs.flatMap((d) => ((d.doc.line_items as Row[]) ?? []).filter((li) => li.item_id).map((li) => ({ itemId: String(li.item_id), qty: Number(li.quantity) || 0, value: Number(li.item_total) || 0, date: d.date })));

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

  // The bills and invoices since the GST summary's first day (1 April), read once: the stock lines and the AED section
  // use the month's, the GST summary all of them.
  const mFrom = monthStart(on);
  const windows = gstWindows(on);
  const gFrom = windows.reduce((m, w) => (w.from < m ? w.from : m), mFrom);
  const yearBills = pages("/bills", "bills", { date_start: gFrom, date_end: on }, 10).then((xs) => xs.filter((x) => !/void|draft/i.test(String(x.status ?? ""))));
  yearBills.catch(() => undefined); // awaited (and reported) by the sections below
  const monthBills = yearBills.then((xs) => xs.filter((x) => String(x.date ?? "").slice(0, 10) >= mFrom));
  monthBills.catch(() => undefined);
  const invoiceRefs = rows.filter((r) => r.kind === "invoices").map((r) => ({ r, date: String(r.row.date ?? r.date ?? "").slice(0, 10) }))
    .filter(({ r, date }) => date >= gFrom && date <= on && !/void|draft/i.test(String(r.row.status ?? "")))
    .map(({ r, date }): DocRef => ({ kind: "invoices", id: r._id.split(":")[1], lmt: lmtOf(r.row), date, party: String(r.row.customer_name ?? "") }));
  const yearDocs = yearBills.catch(() => [] as Row[]).then(async (bills) => {
    const refs = [...bills.map((x): DocRef => ({ kind: "bills", id: String(x.bill_id), lmt: lmtOf(x), date: String(x.date ?? "").slice(0, 10), party: String(x.vendor_name ?? "") })), ...invoiceRefs];
    return { ...(await readDocs(refs, mFrom)), refs };
  });
  const monthDocs = yearDocs.then(({ docs, refs }) => {
    const mine = docs.filter((d) => d.date >= mFrom);
    return { docs: mine, unread: refs.filter((r) => r.date >= mFrom).length - mine.length };
  });

  const [aedStock, gst, payments, receivable, overdue, payable, stock, newCustomers, boards] = await Promise.all([
    attempt(errors, "aedStock", async () => {
      const [items, , { docs, unread }] = await Promise.all([aedItems(), monthBills, monthDocs]);
      return { report: aedReport(items, movesOf(docs.filter((d) => d.kind === "bills")), movesOf(docs.filter((d) => d.kind === "invoices")), on), unread };
    }),
    attempt(errors, "gst", async () => {
      await yearBills; // a bills failure is this section's note
      if (!copyOk) throw new Error(errors.invoiced ?? "the invoices couldn't be read");
      const { docs, unread } = await yearDocs;
      const of = (k: DocRef["kind"]): GstDoc[] => docs.filter((d) => d.kind === k).map((d) => ({ date: d.date, split: gstOf(d.doc) }));
      return { periods: gstPeriods(of("invoices"), of("bills"), windows, on), unread };
    }),
    attempt(errors, "payments", async (): Promise<Payment[]> => (await pages("/customerpayments", "customerpayments", range)).map((p) => ({ customer: String(p.customer_name ?? ""), amount: Number(p.amount) || 0 }))),
    attempt(errors, "receivable", () => owed("/invoices", "Status.Unpaid")),
    attempt(errors, "overdue", () => owed("/invoices", "Status.Overdue")),
    attempt(errors, "payable", () => owed("/bills", "Status.Unpaid")),
    attempt(errors, "stock", async (): Promise<SummaryFacts["stock"]> => {
      const bills = await monthBills;
      if (kind === "monthly") return { in: [], out: null, bills: { count: bills.length, total: bills.reduce((t, x) => t + (Number(x.total) || 0), 0) } };
      const { docs } = await monthDocs;
      const svc = services ?? new Set<string>();
      const ins = docs.filter((d) => d.kind === "bills" && d.date === on).flatMap((d) => goods(d.doc, d.party, svc));
      const out = todaysInvoices ? docs.filter((d) => d.kind === "invoices" && d.date === on).flatMap((d) => goods(d.doc, d.party, svc)) : null;
      if (!out) errors.stockOut = errors.invoicesToday;
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
    aedStock,
    gst,
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
