import "server-only";
import { Binary } from "mongodb";
import * as XLSX from "xlsx";
import { db } from "./db";
import type { ZItem } from "./zoho";
import {
  type BoqSheet, type CatalogItem, type Memory, type PricePoint, type QuoteLine,
  buildQuote, lineAmount, memoryKey, quoteByDefault, sheetLines, totals,
} from "./boq";

/*
 * BOQ → temporary quotation, the server side (boq.ts has the rules). An uploaded sheet is kept with its quotation in
 * `boqQuotes` (so "Download Excel" can give the customer's own sheet back with our rates) until someone deletes it; what
 * was picked and typed per line is remembered in `boqMemory` (key = the line's words), so the next sheet with the same
 * line fills itself. No Zoho call: items from the board's copy (kv zoho_items), prices from the kept quotations and
 * invoices (salesDetails, zohoDocs).
 */

type Row = Record<string, unknown>;
export type BoqQuoteDoc = {
  _id: string; title: string; fileName: string; file?: Binary; sheets: { name: string; count: number; chosen: boolean }[];
  lines: QuoteLine[]; createdBy: string; createdAt: string; updatedAt: string;
};
const quotesCol = async () => (await db()).collection<BoqQuoteDoc>("boqQuotes");
const memoryCol = async () => (await db()).collection<{ _id: string; itemId?: string; rate?: number; at: string; by: string }>("boqMemory");

/** Every sheet of a workbook (.xls, .xlsx, .csv) as its item lines. */
export function readWorkbook(bytes: Uint8Array): BoqSheet[] {
  const wb = XLSX.read(bytes, { type: "array" });
  return wb.SheetNames.map((name) => sheetLines(name, XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "", blankrows: true, raw: true })));
}

export async function catalog(): Promise<CatalogItem[]> {
  const items = (((await (await db()).collection<{ _id: string; items?: ZItem[] }>("kv").findOne({ _id: "zoho_items" }))?.items) ?? []);
  return items.map((i) => ({ id: i.id, name: i.name, rate: i.rate, unit: i.unit, gst: i.gst, active: i.active, service: i.service }));
}

/** Each item's rate on every kept quotation and invoice (not void / declined). */
export async function pricePoints(): Promise<PricePoint[]> {
  const database = await db();
  const out: PricePoint[] = [];
  const proj = { projection: { "doc.line_items.item_id": 1, "doc.line_items.rate": 1, "doc.date": 1, "doc.customer_name": 1, "doc.status": 1 } };
  for (const c of ["salesDetails", "zohoDocs"]) {
    for (const d of await database.collection<{ _id: string; doc?: Row }>(c).find({ _id: { $regex: /^(estimates|invoices):/ } }, proj).toArray()) {
      const kind = d._id.startsWith("estimates") ? "estimates" : "invoices";
      if (!d.doc || /void|declined/i.test(String(d.doc.status ?? ""))) continue;
      for (const li of (d.doc.line_items as Row[] | undefined) ?? []) {
        if (li.item_id) out.push({ itemId: String(li.item_id), rate: Number(li.rate) || 0, date: String(d.doc.date ?? "").slice(0, 10), party: String(d.doc.customer_name ?? ""), kind });
      }
    }
  }
  return out;
}

async function memory(): Promise<Map<string, Memory>> {
  return new Map((await (await memoryCol()).find({}).toArray()).map((m) => [m._id, { key: m._id, itemId: m.itemId, rate: m.rate }]));
}

const id = () => `boq_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const plainName = (s: string) => s.replace(/\.(xlsx?|csv)$/i, "").replace(/[_]+/g, " ").trim().slice(0, 120);
const summary = (q: BoqQuoteDoc) => ({ id: q._id, title: q.title, fileName: q.fileName, lines: q.lines.length, ...totals(q.lines), createdBy: q.createdBy, updatedAt: q.updatedAt });
export type BoqSummary = ReturnType<typeof summary>;

/** An uploaded sheet → a temporary quotation (kept), its lines matched and priced. */
export async function newQuote(file: File, by: string): Promise<BoqQuoteDoc> {
  if (file.size > 5 * 1024 * 1024) throw new Error("That file is over 5 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let sheets: BoqSheet[];
  try { sheets = readWorkbook(bytes); } catch { throw new Error("Couldn't read that file. Upload an Excel sheet (.xls or .xlsx) or a .csv."); }
  if (!sheets.some((s) => s.lines.length)) throw new Error("No item list found: the sheet needs a heading row with Item (or Description) and Qty.");
  const chosen = sheets.filter(quoteByDefault);
  const use = chosen.length ? chosen : sheets.filter((s) => s.lines.length).slice(0, 1);
  const [items, mem, points] = await Promise.all([catalog(), memory(), pricePoints()]);
  const now = new Date().toISOString();
  const doc: BoqQuoteDoc = {
    _id: id(), title: plainName(file.name), fileName: file.name.slice(0, 200), file: new Binary(Buffer.from(bytes)),
    sheets: sheets.filter((s) => s.lines.length).map((s) => ({ name: s.name, count: s.lines.length, chosen: use.includes(s) })),
    lines: buildQuote(use, items, mem, points), createdBy: by, createdAt: now, updatedAt: now,
  };
  await (await quotesCol()).insertOne(doc);
  return doc;
}

/** The sheets picked again: their lines matched afresh (lines already in the quotation keep what was set on them). */
export async function chooseSheets(quoteId: string, names: string[]): Promise<BoqQuoteDoc> {
  const col = await quotesCol();
  const q = await col.findOne({ _id: quoteId });
  if (!q?.file) throw new Error("That quotation is gone.");
  const sheets = readWorkbook(new Uint8Array(q.file.buffer)).filter((s) => names.includes(s.name));
  const [items, mem, points] = await Promise.all([catalog(), memory(), pricePoints()]);
  const had = new Map(q.lines.map((l) => [`${l.sheet}:${l.row}`, l]));
  const lines = buildQuote(sheets, items, mem, points).map((l) => had.get(`${l.sheet}:${l.row}`) ?? l);
  const now = new Date().toISOString();
  await col.updateOne({ _id: quoteId }, { $set: { lines, sheets: q.sheets.map((s) => ({ ...s, chosen: names.includes(s.name) })), updatedAt: now } });
  return { ...q, lines, sheets: q.sheets.map((s) => ({ ...s, chosen: names.includes(s.name) })), updatedAt: now };
}

/** Saved as edited (title, each line's item / rate / GST / qty); every priced line is remembered for next time. */
export async function saveQuote(quoteId: string, input: { title?: unknown; lines?: unknown }, by: string): Promise<BoqQuoteDoc> {
  const col = await quotesCol();
  const q = await col.findOne({ _id: quoteId });
  if (!q) throw new Error("That quotation is gone.");
  const items = new Map((await catalog()).map((i) => [i.id, i]));
  const sent = new Map(((Array.isArray(input.lines) ? input.lines : []) as Partial<QuoteLine>[]).map((l) => [`${l.sheet}:${l.row}`, l]));
  const n = (v: unknown, max: number) => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? Math.min(x, max) : 0; };
  const lines = q.lines.map((l) => {
    const s = sent.get(`${l.sheet}:${l.row}`);
    if (!s) return l;
    const itemId = typeof s.itemId === "string" && items.has(s.itemId) ? s.itemId : undefined;
    const rate = n(s.rate, 1e9), qty = n(s.qty, 1e7), gst = n(s.gst, 100);
    const changed = itemId !== l.itemId || rate !== l.rate;
    return { ...l, itemId, itemName: itemId ? items.get(itemId)!.name : undefined, rate, qty, gst, ...(changed ? { source: rate ? "memory" as const : "none" as const, priceNote: rate ? "Set by hand" : "" } : {}) };
  });
  const title = typeof input.title === "string" && input.title.trim() ? input.title.trim().slice(0, 120) : q.title;
  const now = new Date().toISOString();
  await col.updateOne({ _id: quoteId }, { $set: { title, lines, updatedAt: now } });
  // Remember each line that has an item or a rate, by its words.
  const mem = await memoryCol();
  const ops = lines.filter((l) => l.itemId || l.rate > 0).map((l) => ({ updateOne: { filter: { _id: memoryKey(l.item, l.make) }, update: { $set: { ...(l.itemId ? { itemId: l.itemId } : {}), ...(l.rate > 0 ? { rate: l.rate } : {}), at: now, by } }, upsert: true } }));
  if (ops.length) await mem.bulkWrite(ops);
  return { ...q, title, lines, updatedAt: now };
}

export async function listQuotes(): Promise<BoqSummary[]> {
  return (await (await quotesCol()).find({}, { projection: { file: 0 } }).sort({ updatedAt: -1 }).limit(50).toArray()).map(summary);
}
export async function getQuote(quoteId: string): Promise<BoqQuoteDoc | null> {
  return (await quotesCol()).findOne({ _id: quoteId }, { projection: { file: 0 } });
}
export async function deleteQuote(quoteId: string): Promise<void> {
  await (await quotesCol()).deleteOne({ _id: quoteId });
}
/** The catalogue for picking an item by hand (active first). */
export async function pickList(): Promise<{ id: string; name: string; rate?: number; gst?: number; active?: boolean }[]> {
  return (await catalog()).map((i) => ({ id: i.id, name: i.name, rate: i.rate, gst: i.gst, active: i.active })).sort((a, b) => Number(b.active !== false) - Number(a.active !== false) || a.name.localeCompare(b.name));
}

/**
 * The customer's own workbook back with our prices: on each quoted sheet, Rate, GST %, Amount and Our item after its
 * last column, on the heading row and each line's row, and the totals under the last line. Then a "Quotation" sheet with
 * every line. .xlsx (the original's colours and borders aren't kept).
 */
export async function exportQuote(quoteId: string): Promise<{ bytes: Uint8Array; name: string }> {
  const q = await (await quotesCol()).findOne({ _id: quoteId });
  if (!q?.file) throw new Error("That quotation is gone.");
  const wb = XLSX.read(new Uint8Array(q.file.buffer), { type: "array", cellStyles: true });
  for (const name of new Set(q.lines.map((l) => l.sheet))) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: true, raw: true });
    const head = sheetLines(name, rows);
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    // After the last column that has anything on the heading row or the lines.
    const mine = q.lines.filter((l) => l.sheet === name);
    let last = 0;
    for (const r of [head.headerRow, ...mine.map((l) => l.row)]) (rows[r - 1] ?? []).forEach((v, c) => { if (String(v ?? "").trim()) last = Math.max(last, c); });
    const c0 = last + 1;
    const put = (r: number, c: number, v: string | number) => { ws[XLSX.utils.encode_cell({ r: r - 1, c })] = typeof v === "number" ? { t: "n", v, z: "#,##0.00" } : { t: "s", v }; };
    ["Rate (Rs)", "GST %", "Amount (Rs)", "Our item"].forEach((h, k) => put(head.headerRow, c0 + k, h));
    for (const l of mine) {
      if (l.rate > 0) { put(l.row, c0, l.rate); put(l.row, c0 + 1, l.gst); put(l.row, c0 + 2, lineAmount(l)); }
      if (l.itemName) put(l.row, c0 + 3, l.itemName);
    }
    const t = totals(mine);
    const end = Math.max(...mine.map((l) => l.row), head.headerRow) + 2;
    [["Subtotal", t.subtotal], ["GST", t.gst], ["Total", t.total]].forEach(([k, v], i) => { put(end + i, c0 + 1, k as string); put(end + i, c0 + 2, v as number); });
    range.e.c = Math.max(range.e.c, c0 + 3);
    range.e.r = Math.max(range.e.r, end + 2);
    ws["!ref"] = XLSX.utils.encode_range(range);
  }
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Sheet", "S. No.", "Item (as asked)", "Make", "Unit", "Qty", "Our item", "Rate (Rs)", "GST %", "Amount (Rs)"],
    ...q.lines.map((l) => [l.sheet, l.sno, l.item, l.make, l.unit, l.qty, l.itemName ?? "", l.rate || "", l.rate ? l.gst : "", l.rate ? lineAmount(l) : ""]),
    [], ...(() => { const t = totals(q.lines); return [["", "", "", "", "", "", "", "", "Subtotal", t.subtotal], ["", "", "", "", "", "", "", "", "GST", t.gst], ["", "", "", "", "", "", "", "", "Total", t.total]]; })(),
  ]);
  const name = wb.SheetNames.includes("Quotation") ? "Our quotation" : "Quotation";
  XLSX.utils.book_append_sheet(wb, sheet, name);
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return { bytes: new Uint8Array(out), name: `${q.title.replace(/[^\w .()-]+/g, " ").trim() || "BOQ"} - quotation.xlsx` };
}

export const quoteView = (q: BoqQuoteDoc) => ({ id: q._id, title: q.title, fileName: q.fileName, sheets: q.sheets, lines: q.lines, createdBy: q.createdBy, updatedAt: q.updatedAt });
