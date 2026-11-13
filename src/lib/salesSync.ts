import "server-only";
import { gunzipSync } from "node:zlib";
import type { ZohoInvoice, ZohoPayment, ZohoPI, ZohoQuote } from "./types";
import { syncWindowStart, ymd } from "./dates";
import { db } from "./db";
import { localVersion } from "./changes";
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
/**
 * Fire Safety (owner, 3 Nov: the Fire Safety board takes "any quote that consist of fire safety items", by the Zoho item's
 * "item identifier"). Which items a document holds comes from the Reports copy of Zoho Analytics (Quote / Sales Order /
 * Invoice Items — no Books calls); a document newer than that copy has its lines read from Books once (at most
 * LINES_BATCH a sync, only documents from the last LINES_DAYS days), kept in `salesDetails`.
 */
// The identifier the Fire Safety board goes by — owner, 3 Nov: "item identifier: fire blankets, ive changed it" (was "Fire Safety").
const FIRE = "fire blankets";
const LINES_BATCH = 30;
const LINES_DAYS = 14;
const ITEM_TABLES = [["estimates", "quoteItems", "Quote ID"], ["salesorders", "salesOrderItems", "Sales order ID"], ["invoices", "invoiceItems", "Invoice ID"]] as const;
type Lines = Map<string, Set<string>>; // "estimates:<id>" → its items' Zoho ids

type ItemTable = { _id: string; rows?: Record<string, unknown>[]; gz?: { buffer: Uint8Array } };
const GL = globalThis as unknown as { __thSaleLines?: { at: string; pairs: [string, string][] } };
/** The Analytics copy's document → item pairs, read once per refresh (three tables, ~0.2 MB gzipped). */
async function analyticsItems(): Promise<[string, string][]> {
  const at = String((await (await kv()).findOne({ _id: "za_state" }, { projection: { refreshedAt: 1 } }))?.refreshedAt ?? "");
  if (GL.__thSaleLines?.at === at) return GL.__thSaleLines.pairs;
  const docs = await (await db()).collection<ItemTable>("za_tables").find({ _id: { $in: ITEM_TABLES.map((t) => t[1]) } }).toArray();
  const pairs: [string, string][] = [];
  for (const [kind, table, idCol] of ITEM_TABLES) {
    const d = docs.find((x) => x._id === table);
    const rows: Record<string, unknown>[] = d?.gz ? JSON.parse(gunzipSync(d.gz.buffer).toString("utf8")) : d?.rows ?? [];
    for (const r of rows) if (r[idCol] && r["Product ID"]) pairs.push([`${kind}:${r[idCol]}`, String(r["Product ID"])]);
  }
  GL.__thSaleLines = { at, pairs };
  return pairs;
}

/** Each document's item ids: the Analytics copy, the Training board's copy (it has training documents' lines), and Books reads. */
async function docItems(): Promise<Lines> {
  const out: Lines = new Map();
  const add = (key: string, item: unknown) => { if (item === undefined || item === null || item === "") return; const s = out.get(key) ?? new Set<string>(); s.add(String(item)); out.set(key, s); };
  try {
    for (const [k, item] of await analyticsItems()) add(k, item);
  } catch (e) {
    console.error(`[sales] Analytics copy unavailable for Fire Safety: ${e instanceof Error ? e.message : e}`);
  }
  for (const d of await (await col<TrainingDoc>("zohoDocs")).find({ "doc.line_items.0": { $exists: true } }, { projection: { "doc.line_items.item_id": 1 } }).toArray())
    for (const li of (d.doc?.line_items as ZDoc[]) ?? []) add(d._id, li.item_id);
  for (const d of await (await col<Detail>("salesDetails")).find({}, { projection: { "doc.line_items.item_id": 1 } }).toArray())
    for (const li of (d.doc?.line_items as ZDoc[]) ?? []) add(d._id, li.item_id);
  return out;
}
const fireItemIds = async () => new Set((((await (await kv()).findOne({ _id: "zoho_items" }))?.items as (ZItem & { identifier?: string })[] | undefined) ?? [])
  .filter((i) => i.identifier?.trim().toLowerCase() === FIRE).map((i) => String(i.id)));
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

/** Live refresh (owner, 13 Nov): a document the dashboard just changed in Zoho, written as the sync writes its rows. */
export async function putSalesDoc(kind: Kind, d: ZDoc): Promise<void> {
  const docs = await col<SalesRow>("salesDocs");
  const id = docIdOf(kind, d);
  const key = `${kind}:${id}`;
  if (String(d.status) === "void") { await docs.deleteOne({ _id: key }); return; }
  if (String(d.date ?? "") < since()) return; // older than the board's window
  await docs.replaceOne({ _id: key }, { kind, id, lmt: lmtOf(d), date: String(d.date ?? ""), row: keep(d) }, { upsert: true });
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

  // Lines of new documents the Analytics copy doesn't have yet (Fire Safety board) — newest first, a few a sync.
  let linesRead = 0;
  try {
    const known = await docItems();
    const recent = ymd(new Date(Date.now() - LINES_DAYS * 86_400_000));
    const missing = (await docs.find({ date: { $gte: recent } }, { projection: { kind: 1, id: 1, date: 1, lmt: 1 } }).toArray())
      .filter((d) => !known.has(d._id) && !only.has(d._id)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, LINES_BATCH);
    const details = await col<Detail>("salesDetails");
    await pool(missing, 4, async (d) => {
      const full = await fetchDetail(d.kind, d.id);
      if (full) { await details.replaceOne({ _id: d._id }, { lmt: d.lmt, doc: full }, { upsert: true }); linesRead++; }
    });
  } catch (e) {
    console.error(`[sales] reading new documents' lines failed: ${e instanceof Error ? e.message : e}`);
  }

  if (changed || stale.length || linesRead) state.version = (state.version ?? 0) + 1;
  state.syncedAt = new Date().toISOString();
  await (await kv()).replaceOne({ _id: "sales_state" }, state as unknown as Record<string, unknown>, { upsert: true });
  return { docs: changed, payments: stale.length };
}

/* ---------------- Reading the copy ---------------- */

/** `fire`: the documents holding a Fire Safety item ("estimates:<id>" …) — sales.ts fireDeals splits the boards by them. */
export type SalesResponse = { syncedAt: string; windowStart: string; quotes: ZohoQuote[]; pis: ZohoPI[]; invoices: ZohoInvoice[]; payments: ZohoPayment[]; fire?: string[]; pending?: number; error?: string };
/** Bumped when the board data changes shape (e.g. 30 Oct: quote / PI totals; 3 Nov: fire) — a server keeps its copy across code reloads. */
const SHAPE = 3;
const G = globalThis as unknown as { __thSales?: { key: string; data: SalesResponse } | null };

/** The board's data, rebuilt only when the Sales copy (or the Training board's copy, for training-only) changed. */
export async function salesData(): Promise<SalesResponse> {
  const [state, zoho, za, local] = await Promise.all([loadState(), (await kv()).findOne({ _id: "zoho_state" }, { projection: { version: 1 } }), (await kv()).findOne({ _id: "za_state" }, { projection: { refreshedAt: 1 } }), localVersion().catch(() => 0)]);
  // The Analytics copy's refresh counts too: it says which documents hold Fire Safety items. `local`: a document the
  // dashboard just changed in Zoho and wrote here (writeThrough.ts, live refresh 13 Nov).
  const key = `${SHAPE}|${state.version}|${zoho?.version ?? 0}|${za?.refreshedAt ?? ""}|${local}`;
  if (G.__thSales?.key === key) return { ...G.__thSales.data, syncedAt: state.syncedAt ?? G.__thSales.data.syncedAt };
  const [rows, payRows, only, items, fireItems] = await Promise.all([
    (await col<SalesRow>("salesDocs")).find({}).toArray(),
    (await col<SalesPays>("salesPayments")).find({}).toArray(),
    trainingOnly(),
    docItems(),
    fireItemIds(),
  ]);
  const fire = [...items].filter(([k, ids]) => [...ids].some((i) => fireItems.has(i)) && !only.has(k)).map(([k]) => k);
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
    fire,
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
    // By kind: an invoice also carries the sales order it came from (salesorder_number).
    number: String((kind === "invoices" ? d.invoice_number : kind === "salesorders" ? d.salesorder_number : d.estimate_number) ?? ""),
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
