import "server-only";
import { Binary } from "mongodb";
import * as XLSX from "xlsx";
import { db } from "./db";
import { type ZItem, fetchItems, itemImage } from "./zoho";
import { addPictures } from "./xlsxPictures";
import {
  type BoqSheet, type CatalogItem, type Memory, type NewItem, type PricePoint, type QuoteLine,
  SURE, buildQuote, candidates, latestPrices, lineAmount, memoryKey, newItemGroups, priceFor, quoteByDefault, sheetLines, totals,
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
    const sure = Boolean(itemId && (itemId !== l.itemId || s.score === 1));
    return { ...l, itemId, itemName: itemId ? items.get(itemId)!.name : undefined, rate, qty, gst, score: !itemId ? 0 : sure ? 1 : l.score, ...(changed ? { source: rate ? "memory" as const : "none" as const, priceNote: rate ? "Set by hand" : "" } : {}) };
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
 * Pictures (owner): each line's item picture from Zoho Books in a "Picture" column, on both kinds of sheet; a line with
 * no picture in Zoho, or one Zoho won't give, just has none. One Zoho call per item (two when it has no main picture).
 */
const PIC_PX = 64;
async function itemPictures(ids: string[]): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  const queue = [...ids];
  await Promise.all(Array.from({ length: Math.min(5, queue.length) }, async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      const img = await itemImage(id).catch(() => null);
      if (img) out.set(id, new Uint8Array(img.bytes));
    }
  }));
  return out;
}

export async function exportQuote(quoteId: string): Promise<{ bytes: Uint8Array; name: string }> {
  const q = await (await quotesCol()).findOne({ _id: quoteId });
  if (!q?.file) throw new Error("That quotation is gone.");
  const wb = XLSX.read(new Uint8Array(q.file.buffer), { type: "array", cellStyles: true });
  const pics = await itemPictures([...new Set(q.lines.map((l) => l.itemId).filter((x): x is string => Boolean(x)))]);
  const placed: { sheet: string; row: number; col: number; bytes: Uint8Array }[] = [];
  const tall = (ws: XLSX.WorkSheet, row0: number) => { const rows = (ws["!rows"] ??= []); rows[row0] = { ...rows[row0], hpx: PIC_PX + 10 }; };
  const wide = (ws: XLSX.WorkSheet, col: number) => { const cols = (ws["!cols"] ??= []); cols[col] = { ...cols[col], wpx: PIC_PX + 14 }; };
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
    const withPics = mine.some((l) => l.itemId && pics.has(l.itemId));
    [...["Rate (Rs)", "GST %", "Amount (Rs)", "Our item"], ...(withPics ? ["Picture"] : [])].forEach((h, k) => put(head.headerRow, c0 + k, h));
    for (const l of mine) {
      if (l.rate > 0) { put(l.row, c0, l.rate); put(l.row, c0 + 1, l.gst); put(l.row, c0 + 2, lineAmount(l)); }
      if (l.itemName) put(l.row, c0 + 3, l.itemName);
      const img = l.itemId ? pics.get(l.itemId) : undefined;
      if (img) { placed.push({ sheet: name, row: l.row - 1, col: c0 + 4, bytes: img }); tall(ws, l.row - 1); }
    }
    if (withPics) wide(ws, c0 + 4);
    const t = totals(mine);
    const end = Math.max(...mine.map((l) => l.row), head.headerRow) + 2;
    [["Subtotal", t.subtotal], ["GST", t.gst], ["Total", t.total]].forEach(([k, v], i) => { put(end + i, c0 + 1, k as string); put(end + i, c0 + 2, v as number); });
    range.e.c = Math.max(range.e.c, c0 + (withPics ? 4 : 3));
    range.e.r = Math.max(range.e.r, end + 2);
    ws["!ref"] = XLSX.utils.encode_range(range);
  }
  const anyPic = pics.size > 0;
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Sheet", "S. No.", "Item (as asked)", "Make", "Unit", "Qty", "Our item", "Rate (Rs)", "GST %", "Amount (Rs)", ...(anyPic ? ["Picture"] : [])],
    ...q.lines.map((l) => [l.sheet, l.sno, l.item, l.make, l.unit, l.qty, l.itemName ?? "", l.rate || "", l.rate ? l.gst : "", l.rate ? lineAmount(l) : ""]),
    [], ...(() => { const t = totals(q.lines); return [["", "", "", "", "", "", "", "", "Subtotal", t.subtotal], ["", "", "", "", "", "", "", "", "GST", t.gst], ["", "", "", "", "", "", "", "", "Total", t.total]]; })(),
  ]);
  const name = wb.SheetNames.includes("Quotation") ? "Our quotation" : "Quotation";
  if (anyPic) {
    wide(sheet, 10);
    q.lines.forEach((l, i) => { const img = l.itemId ? pics.get(l.itemId) : undefined; if (img) { placed.push({ sheet: name, row: i + 1, col: 10, bytes: img }); tall(sheet, i + 1); } });
  }
  XLSX.utils.book_append_sheet(wb, sheet, name);
  const out = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
  let bytes: Uint8Array = out;
  try {
    bytes = addPictures(out, placed.map((p) => ({ sheet: wb.SheetNames.indexOf(p.sheet), row: p.row, col: p.col, bytes: p.bytes, maxPx: PIC_PX, rowPx: PIC_PX + 10 })));
  } catch (e) {
    console.error(`[boq] pictures left out: ${e instanceof Error ? e.message : e}`); // the sheet without pictures beats no sheet
  }
  return { bytes, name: `${q.title.replace(/[^\w .()-]+/g, " ").trim() || "BOQ"} - quotation.xlsx` };
}

export const quoteView = (q: BoqQuoteDoc) => ({ id: q._id, title: q.title, fileName: q.fileName, sheets: q.sheets, lines: q.lines, createdBy: q.createdBy, updatedAt: q.updatedAt });

/* ---------------- New items (owner, 23 Nov) ---------------- */

/**
 * Lines still without an item, matched again against today's items and what was picked since (an item made in Zoho by
 * hand, or the same words matched on another sheet): a sure match fills the line, as on upload. Saved where it changed.
 */
async function rematch(): Promise<BoqQuoteDoc[]> {
  const col = await quotesCol();
  const quotes = await col.find({}, { projection: { file: 0 } }).toArray();
  const [items, mem, points] = await Promise.all([catalog(), memory(), pricePoints()]);
  const byId = new Map(items.map((i) => [i.id, i]));
  const latest = latestPrices(points);
  for (const q of quotes) {
    let changed = false;
    q.lines = q.lines.map((l) => {
      if (l.itemId) return l;
      const cands = candidates(l, items, mem);
      const best = cands[0] && cands[0].score >= SURE ? cands[0] : undefined;
      const it = best ? byId.get(best.itemId) : undefined;
      if (!it) return l.candidates.length === cands.length ? l : { ...l, candidates: cands };
      changed = true;
      const price = l.rate > 0 ? null : priceFor(it.id, memoryKey(l.item, l.make), mem, latest, byId);
      return { ...l, itemId: it.id, itemName: it.name, gst: it.gst ?? l.gst, score: best!.score, candidates: cands, ...(price ? { rate: price.rate, source: price.source, priceNote: price.note } : {}) };
    });
    if (changed) await col.updateOne({ _id: q._id }, { $set: { lines: q.lines } });
  }
  return quotes;
}

/** The New items tab: every line of every saved sheet that isn't one of our items yet (or only might be). */
export async function newItems(): Promise<NewItem[]> {
  return newItemGroups((await rematch()).map((q) => ({ id: q._id, title: q.title, lines: q.lines })));
}

/** These words are this item: on every saved sheet, and remembered for the next one. */
export async function matchItem(key: string, itemId: string, by: string): Promise<{ lines: number }> {
  const items = await catalog();
  const it = items.find((i) => i.id === itemId);
  if (!it) throw new Error("That item isn't in our Zoho items.");
  const now = new Date().toISOString();
  await (await memoryCol()).updateOne({ _id: key }, { $set: { itemId, at: now, by } }, { upsert: true });
  const [mem, points] = await Promise.all([memory(), pricePoints()]);
  const byId = new Map(items.map((i) => [i.id, i]));
  const latest = latestPrices(points);
  const col = await quotesCol();
  let n = 0;
  for (const q of await col.find({}, { projection: { file: 0 } }).toArray()) {
    let changed = false;
    const lines = q.lines.map((l) => {
      if (memoryKey(l.item, l.make) !== key) return l;
      changed = true; n++;
      const price = l.rate > 0 && l.itemId === itemId ? null : priceFor(itemId, key, mem, latest, byId);
      return { ...l, itemId, itemName: it.name, gst: it.gst ?? l.gst, score: 1, ...(price ? { rate: price.rate, source: price.source, priceNote: price.note } : {}) };
    });
    if (changed) await col.updateOne({ _id: q._id }, { $set: { lines, updatedAt: now } });
  }
  return { lines: n };
}

/** Zoho's item list read now (items made there by hand show at once, not at the next hourly read). */
export async function refreshItems(): Promise<{ items: number }> {
  const fresh = await fetchItems();
  const kv = (await db()).collection<{ _id: string; items?: ZItem[] }>("kv");
  const had = (await kv.findOne({ _id: "zoho_items" }))?.items ?? [];
  if (fresh.length && JSON.stringify(fresh) !== JSON.stringify(had)) await kv.replaceOne({ _id: "zoho_items" }, { items: fresh }, { upsert: true });
  return { items: fresh.length };
}
