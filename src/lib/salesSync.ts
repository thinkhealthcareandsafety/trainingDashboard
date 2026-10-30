import "server-only";
import type { ZohoInvoice, ZohoPayment, ZohoPI, ZohoQuote } from "./types";
import { syncWindowStart, ymd } from "./dates";
import { db } from "./db";
import { type Kind, type ZDoc, type ZItem, KINDS, docIdOf, fetchDetail, fetchInvoicePaymentRows, itemSets, listAll, listChangedSince, lmtOf, pool, toInvoice, toPayments, toPI, toQuote } from "./zoho";

/*
 * The Sales board's copy of Zoho Books (owner, 30 Oct: "a sales dashboard … all items but the training ones"): every
 * quotation, PI (sales order) and invoice since the Training board's window start that isn't a training-only document,
 * and the payments on those invoices. Kept apart from the Training board's copy — `salesDocs` / `salesPayments`, never
 * zohoDocs (HANDOFF §11 #7).
 *  - Built from Zoho's list pages only (no per-document reads): a quiet hour is 3 calls; the 9 am / 2 pm full checks
 *    list everything again (~25 calls) and drop what Zoho no longer has (deleted, voided).
 *  - Payments: read per invoice that has received money and changed (the token can't list customer payments), at most
 *    PAY_BATCH a sync, newest first — the first fill spreads over the day.
 *  - Training-only (every real line a training item, from the Training board's own copy — it has their lines) stays on
 *    the Training board; a document with training and other items shows on both. Travel / freight lines don't count.
 *  - Its own state (kv `sales_state`); runSync calls it in its own try/catch, so a problem here never fails that sync.
 *  - The board's popup reads one document's lines on demand (`salesDocDetail`): from the Training board's copy when it
 *    has it, else Zoho once, kept in `salesDetails` until the document changes.
 */

const PAY_BATCH = 150;
/** List fields the board uses — the rest of Zoho's list row isn't kept (a whole row is ~1.5 KB; this is ~300 B). */
const KEEP = ["estimate_id", "salesorder_id", "invoice_id", "estimate_number", "salesorder_number", "invoice_number", "date", "created_time", "last_modified_time",
  "status", "customer_id", "customer_name", "salesperson_name", "reference_number", "total", "balance", "due_date", "payment_made"];
/** Lines that come along with a sale rather than being one (travel on a training invoice, freight on an AED). */
const INCIDENTAL = /travel|conveyance|accommodation|lodging|boarding|freight|shipping|courier|packing|forwarding|transport/i;

type SalesRow = { _id: string; kind: Kind; id: string; lmt: string; date: string; row: ZDoc };
type SalesPays = { _id: string; lmt: string; rows: ZDoc[] };
type SalesState = { _id: string; version: number; cursors: Partial<Record<Kind, string>>; fullAt?: number; syncedAt?: string };
type Detail = { _id: string; lmt: string; doc: ZDoc };
type TrainingDoc = { _id: string; kind: Kind; id: string; training: boolean; doc: ZDoc };

const col = async <T extends { _id: string }>(name: string) => (await db()).collection<T>(name);
const kv = async () => (await db()).collection<{ _id: string } & Record<string, unknown>>("kv");
const since = () => ymd(syncWindowStart(new Date()));
const keep = (r: ZDoc): ZDoc => Object.fromEntries(KEEP.filter((k) => r[k] !== undefined && r[k] !== null && r[k] !== "").map((k) => [k, r[k]]));
const paidSome = (r: ZDoc) => (Number(r.total) || 0) - (Number(r.balance) || 0) > 0.5 || ["paid", "partially_paid"].includes(String(r.status));

async function loadState(): Promise<SalesState> {
  const s = (await (await kv()).findOne({ _id: "sales_state" })) as unknown as SalesState | null;
  return s ?? { _id: "sales_state", version: 0, cursors: {} };
}

/** Document keys ("estimates:<id>") that are training-only, from the Training board's copy (it holds their lines). */
async function trainingOnly(): Promise<Set<string>> {
  const items = ((await (await kv()).findOne({ _id: "zoho_items" }))?.items as ZItem[] | undefined) ?? [];
  const training = itemSets(items).training;
  const docs = await (await col<TrainingDoc>("zohoDocs")).find({ training: true }, { projection: { kind: 1, id: 1, "doc.line_items.item_id": 1, "doc.line_items.name": 1 } }).toArray();
  const only = new Set<string>();
  for (const d of docs) {
    const lines = ((d.doc?.line_items as ZDoc[]) ?? []).filter((li) => !INCIDENTAL.test(String(li.name ?? "")));
    if (lines.length && lines.every((li) => training.has(String(li.item_id)))) only.add(`${d.kind}:${d.id}`);
  }
  return only;
}

/** One sync of the Sales copy. `full`: list everything again (the 9 am / 2 pm checks, "Sync now", or a first fill). */
export async function syncSales(full: boolean): Promise<{ docs: number; payments: number }> {
  const state = await loadState();
  const docs = await col<SalesRow>("salesDocs");
  const from = since();
  const doFull = full || !state.fullAt || KINDS.some((k) => !state.cursors[k]);
  let changed = 0;
  for (const kind of KINDS) {
    const rows = doFull ? await listAll(kind, from) : await listChangedSince(kind, from, state.cursors[kind]);
    if (!rows.length && !doFull) continue;
    const have = new Map((await docs.find({ kind }, { projection: { lmt: 1 } }).toArray()).map((d) => [d._id, d.lmt]));
    const live = rows.filter((r) => String(r.status) !== "void");
    const fresh = live.filter((r) => have.get(`${kind}:${docIdOf(kind, r)}`) !== lmtOf(r));
    if (fresh.length) {
      await docs.bulkWrite(fresh.map((r) => {
        const id = docIdOf(kind, r);
        return { replaceOne: { filter: { _id: `${kind}:${id}` }, replacement: { kind, id, lmt: lmtOf(r), date: String(r.date ?? ""), row: keep(r) }, upsert: true } };
      }), { ordered: false });
      changed += fresh.length;
    }
    // Voided ones leave; a full check also drops what Zoho no longer lists (deleted) or what's now older than the window.
    const gone = new Set(rows.filter((r) => String(r.status) === "void").map((r) => `${kind}:${docIdOf(kind, r)}`));
    if (doFull) { const listed = new Set(live.map((r) => `${kind}:${docIdOf(kind, r)}`)); for (const k of have.keys()) if (!listed.has(k)) gone.add(k); }
    if (gone.size) changed += (await docs.deleteMany({ _id: { $in: [...gone] } })).deletedCount ?? 0;
    const newest = rows.map(lmtOf).reduce((a, b) => (b > a ? b : a), state.cursors[kind] ?? "");
    if (newest) state.cursors[kind] = newest;
  }
  if (doFull) state.fullAt = Date.now();

  // Payments of the invoices that received money and changed since their payments were read (training-only ones aside).
  const pays = await col<SalesPays>("salesPayments");
  const only = await trainingOnly();
  const invoices = (await docs.find({ kind: "invoices" }, { projection: { id: 1, lmt: 1, date: 1, "row.total": 1, "row.balance": 1, "row.status": 1 } }).toArray())
    .filter((d) => !only.has(d._id) && paidSome(d.row));
  const read = new Map((await pays.find({}, { projection: { rows: 0 } }).toArray()).map((p) => [p._id, p.lmt]));
  const stale = invoices.filter((d) => read.get(d.id) !== d.lmt).sort((a, b) => b.date.localeCompare(a.date)).slice(0, PAY_BATCH);
  await pool(stale, 4, async (d) => {
    await pays.replaceOne({ _id: d.id }, { lmt: d.lmt, rows: await fetchInvoicePaymentRows(d.id) }, { upsert: true });
  });

  if (changed || stale.length) state.version = (state.version ?? 0) + 1;
  state.syncedAt = new Date().toISOString();
  await (await kv()).replaceOne({ _id: "sales_state" }, state as unknown as Record<string, unknown>, { upsert: true });
  return { docs: changed, payments: stale.length };
}

/* ---------------- Reading the copy ---------------- */

export type SalesResponse = { syncedAt: string; windowStart: string; quotes: ZohoQuote[]; pis: ZohoPI[]; invoices: ZohoInvoice[]; payments: ZohoPayment[]; pending?: number; error?: string };
const G = globalThis as unknown as { __thSales?: { key: string; data: SalesResponse } | null };

/** The board's data, rebuilt only when the Sales copy (or the Training board's copy, for training-only) changed. */
export async function salesData(): Promise<SalesResponse> {
  const [state, zoho] = await Promise.all([loadState(), (await kv()).findOne({ _id: "zoho_state" }, { projection: { version: 1 } })]);
  const key = `${state.version}|${zoho?.version ?? 0}`;
  if (G.__thSales?.key === key) return { ...G.__thSales.data, syncedAt: state.syncedAt ?? G.__thSales.data.syncedAt };
  const [rows, payRows, only] = await Promise.all([
    (await col<SalesRow>("salesDocs")).find({}).toArray(),
    (await col<SalesPays>("salesPayments")).find({}).toArray(),
    trainingOnly(),
  ]);
  const none = new Set<string>();
  const of = (kind: Kind) => rows.filter((r) => r.kind === kind && !only.has(r._id)).sort((a, b) => b.date.localeCompare(a.date));
  const invoices = of("invoices").map((r) => toInvoice(r.row, none));
  const byInvoice = new Map(payRows.map((p) => [p._id, p.rows]));
  const data: SalesResponse = {
    syncedAt: state.syncedAt ?? "",
    windowStart: since(),
    quotes: of("estimates").map((r) => ({ ...toQuote(r.row, none), total: Number(r.row.total) || 0 })),
    pis: of("salesorders").map((r) => ({ ...toPI(r.row, none), total: Number(r.row.total) || 0 })),
    invoices,
    payments: invoices.flatMap((i) => toPayments(i, byInvoice.get(i.invoiceId) ?? [])),
    // Paid invoices whose payments aren't read yet (the first fill goes PAY_BATCH a sync).
    pending: of("invoices").filter((r) => paidSome(r.row) && !byInvoice.has(r.id)).length || undefined,
  };
  G.__thSales = { key, data };
  return data;
}

/* ---------------- One document's lines, for the popup ---------------- */

export type SalesLine = { name: string; description?: string; hsn?: string; qty: number; unit?: string; rate: number; gst?: number; amount: number };
export type SalesDetail = {
  number: string; date: string; lines: SalesLine[]; subTotal: number; discount?: number; shipping?: number; adjustment?: number;
  taxes: { name: string; amount: number }[]; total: number; placeOfSupply?: string;
  shipTo?: { attention?: string; lines: string[]; phone?: string };
};
const num = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : Number(v));
const str = (v: unknown) => (v === undefined || v === null || String(v).trim() === "" ? undefined : String(v).trim());

function toDetail(kind: Kind, d: ZDoc): SalesDetail {
  const a = (d.shipping_address as ZDoc | undefined) ?? {};
  const cityZip = [str(a.city), str(a.zip)].filter(Boolean).join(" ");
  const lines = [str(a.address), str(a.street2), cityZip, [str(a.state), str(a.country)].filter(Boolean).join(", ")].filter((x): x is string => Boolean(x));
  return {
    number: String(d.estimate_number ?? d.salesorder_number ?? d.invoice_number ?? ""),
    date: String(d.date ?? ""),
    lines: ((d.line_items as ZDoc[]) ?? []).map((li) => ({
      name: String(li.name ?? ""), description: str(li.description), hsn: str(li.hsn_or_sac), qty: Number(li.quantity) || 0, unit: str(li.unit),
      rate: Number(li.rate) || 0, gst: num(li.tax_percentage), amount: Number(li.item_total) || 0,
    })),
    subTotal: Number(d.sub_total) || 0,
    discount: num(d.discount_total) || undefined,
    shipping: num(d.shipping_charge) || undefined,
    adjustment: num(d.adjustment) || undefined,
    taxes: ((d.taxes as ZDoc[]) ?? []).map((t) => ({ name: String(t.tax_name ?? ""), amount: Number(t.tax_amount) || 0 })),
    total: Number(d.total) || 0,
    placeOfSupply: str(d.place_of_supply),
    shipTo: lines.length || str(a.attention) ? { attention: str(a.attention), lines, phone: str(a.phone) } : undefined,
  };
}

/** One document's lines and ship-to (`key` = "estimates:<id>" …): our copies first, Zoho once otherwise. */
export async function salesDocDetail(key: string): Promise<SalesDetail | null> {
  const [kind, id] = key.split(":") as [Kind, string];
  if (!KINDS.includes(kind) || !/^\d+$/.test(id ?? "")) return null;
  const row = await (await col<SalesRow>("salesDocs")).findOne({ _id: key }, { projection: { lmt: 1 } });
  const training = await (await col<TrainingDoc>("zohoDocs")).findOne({ _id: key });
  if (training?.doc) return toDetail(kind, training.doc);
  const cache = await col<Detail>("salesDetails");
  const had = await cache.findOne({ _id: key });
  if (had && (!row || had.lmt === row.lmt)) return toDetail(kind, had.doc);
  const d = await fetchDetail(kind, id);
  if (!d) return null;
  await cache.replaceOne({ _id: key }, { lmt: row?.lmt ?? lmtOf(d), doc: d }, { upsert: true });
  return toDetail(kind, d);
}
