import "server-only";
import { db } from "./db";
import { clearPo, orderText, poInPdf, poKey } from "./poMatch";
import { isPoFile, poFromText } from "./invoiceConverterRules";
import type { PoLog } from "./poLog";
import { workdriveOpen, workdrivePdfsUnder, type WdFile } from "./workdrive";

/*
 * The PO folder in Zoho WorkDrive (owner, 24 Nov): every PDF in it, and in the folders inside, is read once; its PO numbers
 * are compared with those of the Invoice Converter's invoices (poMatch.ts). Nothing is attached by itself: the page shows
 * "PO found", the user looks at the PDF and picks it. Run by the button, by every sync (at most every half hour), and by
 * the Invoice Converter's page while something is left.
 *  - A PDF whose text doesn't show its PO number clearly (a scan, or one whose words come out of order) is also read from
 *    its picture (pageRead.ts, owner: never by file name), by the browser that has the Invoice Converter open.
 *  - `poScans`: one per PDF { name, size, depth, text, hits: PO keys on it, look }; kv `po_folder` { keys already compared,
 *    at, left }. `look`: "due" = its picture is still to be read, "done", "failed"; "no" = its text was enough.
 */
export const PO_FOLDER = "metokf3e113be57704e23b82663cf7c1b9ab1";
const MAX_TEXT = 120_000;
const VERSION = 3; // a new way of reading: every PDF is read again
const AGAIN_MS = 30 * 60_000;

type Scan = { _id: string; name: string; size: number | null; depth: number; text: string; hits: string[]; look: "no" | "due" | "done" | "failed"; v: number; at: string; /** The PO number it seems to carry, and whether anything was kept (for the log). */ po?: string; empty?: boolean };
type State = { _id: string; keys: string[]; at: string | null; left: number };
type SalesRow = { _id: string; kind: string; row: Record<string, unknown> };
export type PoFile = { id: string; name: string };
/** `left`: PDFs still to read as text; `due`: ids whose picture is still to be read; `seen`: read from their picture; `unread`: nothing like an order could be read. */
export type ScanResult = { files: number; left: number; due: string[]; names: Record<string, string>; /** Just read, and every PDF there (nearest the top first). */ read: string[]; ids: string[]; added: number; seen: number; unread: number };

const scans = async () => (await db()).collection<Scan>("poScans");
const kv = async () => (await db()).collection<State>("kv");

/** The PO numbers on the invoices now, in one spelling each. */
async function currentKeys(): Promise<string[]> {
  const rows = await (await db()).collection<SalesRow>("salesDocs").find({ kind: "invoices" }, { projection: { kind: 1, "row.status": 1, "row.cf_purchase_order_number": 1 } }).toArray();
  return [...new Set(rows.filter((r) => r.kind === "invoices" && String(r.row.status ?? "") !== "void").map((r) => poKey(r.row.cf_purchase_order_number)).filter(Boolean))];
}

/** PO numbers typed since the last look, compared with the PDFs already read. */
export async function matchNewKeys(keys: string[]): Promise<void> {
  const state = await (await kv()).findOne({ _id: "po_folder" });
  if (!state) return; // the folder hasn't been read yet
  const done = new Set(state.keys ?? []), fresh = keys.filter((k) => !done.has(k));
  if (!fresh.length) return;
  const col = await scans();
  for (const s of await col.find({}).toArray()) {
    const more = fresh.filter((k) => !s.hits.includes(k) && poInPdf(k, s.text));
    if (more.length) await col.updateOne({ _id: s._id }, { $set: { hits: [...s.hits, ...more] } });
  }
  await (await kv()).updateOne({ _id: "po_folder" }, { $set: { keys: [...new Set([...done, ...fresh])] } });
}

/** For the syncs (one a minute while someone is here): the new PDFs' text, at most every half hour unless some are left. */
export async function scanPoFolderQuietly(budgetMs: number): Promise<void> {
  const s = await (await kv()).findOne({ _id: "po_folder" });
  if (s?.at && !s.left && Date.now() - Date.parse(s.at) < AGAIN_MS) return;
  await scanPoFolder(budgetMs);
}

/** Reads the text of the PDFs not read yet (new, or changed), for about `budgetMs`. */
export async function scanPoFolder(budgetMs: number, now = () => Date.now()): Promise<ScanResult> {
  const { pdfText } = await import("./invoiceConverter");
  const t0 = now();
  const files = await workdrivePdfsUnder(PO_FOLDER);
  const col = await scans();
  const known = new Map((await col.find({}, { projection: { text: 0 } }).toArray()).map((s) => [s._id, s]));
  // The keys are taken before reading: one typed meanwhile is compared on the next look.
  const keys = await currentKeys();
  await (await kv()).updateOne({ _id: "po_folder" }, { $set: { at: new Date().toISOString() } }, { upsert: true });
  await matchNewKeys(keys);
  // Taken out of the folder: no longer offered.
  const here = new Set(files.map((f) => f.id));
  for (const id of known.keys()) if (!here.has(id)) await col.deleteOne({ _id: id });
  const todo: WdFile[] = files.filter((f) => { const k = known.get(f.id); return !k || k.v !== VERSION || k.size !== f.size || k.name !== f.name; });
  const compared = new Set((await (await kv()).findOne({ _id: "po_folder" }))?.keys ?? []);
  for (const k of keys) compared.add(k);
  const all = [...compared];
  const read: string[] = [];
  let next = 0, added = 0, failed = 0;
  const work = async () => {
    while (next < todo.length && now() - t0 < budgetMs) {
      const f = todo[next++];
      try {
        const res = await workdriveOpen(f.id);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const text = (await pdfText(bytes)).slice(0, MAX_TEXT), kept = orderText(text) ? text : "";
        const doc: Omit<Scan, "_id"> = { name: f.name, size: f.size, depth: f.depth, text: kept, hits: all.filter((k) => poInPdf(k, kept)), look: clearPo(kept) ? "no" : "due", po: poFromText(kept) ?? "", empty: !kept, v: VERSION, at: new Date().toISOString() };
        await col.replaceOne({ _id: f.id }, doc, { upsert: true });
        added++;
        read.push(f.id);
      } catch (e) {
        failed++;
        console.error(`[po folder] ${f.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
  };
  await Promise.all([work(), work(), work(), work()]);
  // PO numbers typed while these PDFs were being read: put back, so the next look compares them with these too.
  const later = (await currentKeys()).filter((k) => !compared.has(k));
  if (added && later.length) {
    const kept = (await (await kv()).findOne({ _id: "po_folder" }))?.keys ?? [];
    await (await kv()).updateOne({ _id: "po_folder" }, { $set: { keys: kept.filter((k) => !later.includes(k)) } });
  }
  if (failed && !added) throw new Error("Zoho WorkDrive didn't give the PDFs. Try again in a minute.");
  const after = (await col.find({}).toArray()).filter((s) => here.has(s._id));
  // Those nearest the top first; the same file in another folder (same name and size) once.
  const waiting = after.filter((s) => s.look === "due").sort((a, b) => a.depth - b.depth);
  const due = waiting.filter((s, n) => waiting.findIndex((x) => twins(x, s)) === n).map((s) => s._id), left = todo.length - added;
  await (await kv()).updateOne({ _id: "po_folder" }, { $set: { left } });
  return { files: files.length, left, due, names: Object.fromEntries(waiting.map((s) => [s._id, s.name])), read, ids: after.sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name)).map((s) => s._id), added, seen: after.filter((s) => s.look === "done").length, unread: after.filter((s) => s.look !== "due" && !s.text).length };
}

const twins = (a: Scan, b: Scan) => a.name === b.name && a.size === b.size;

/** A PDF whose picture is to be read by the browser: its bytes may be fetched only while it is waiting. */
export async function isDue(fileId: string): Promise<boolean> {
  return (await (await scans()).findOne({ _id: fileId }))?.look === "due";
}
/** The words the browser read on its first page (null = it couldn't), kept for it and its copies in other folders. */
export async function savePageText(fileId: string, words: string | null): Promise<string[]> {
  const col = await scans(), s = await col.findOne({ _id: fileId });
  if (!s || s.look !== "due") return [];
  const ids: string[] = [];
  const keys = [...new Set([...((await (await kv()).findOne({ _id: "po_folder" }))?.keys ?? []), ...(await currentKeys())])];
  for (const x of (await col.find({}).toArray()).filter((x) => x.look === "due" && twins(x, s))) {
    ids.push(x._id);
    if (words === null) { await col.updateOne({ _id: x._id }, { $set: { look: "failed", at: new Date().toISOString() } }); continue; }
    const both = `${x.text}\n${words}`.slice(-MAX_TEXT), kept = orderText(both) ? both : "";
    await col.updateOne({ _id: x._id }, { $set: { text: kept, hits: keys.filter((k) => poInPdf(k, kept)), look: "done", po: poFromText(kept) ?? "", empty: !kept, at: new Date().toISOString() } });
  }
  return ids;
}

/** PDFs already read, compared again with the PO numbers on the invoices now (each scan goes over every PDF). Their log lines. */
export async function checkAgain(ids: string[]): Promise<PoLog> {
  const col = await scans(), keys = await currentKeys();
  await Promise.all(ids.map(async (id) => {
    const s = await col.findOne({ _id: id });
    if (!s || s.look === "due") return;
    const hits = keys.filter((k) => poInPdf(k, s.text));
    if (hits.length !== s.hits.length || hits.some((k) => !s.hits.includes(k))) await col.updateOne({ _id: id }, { $set: { hits } });
  }));
  return poLog(ids);
}

/** The log: every PDF, the last read first (or only `ids`, in that order), with the invoices its PO number belongs to. */
export async function poLog(ids?: string[]): Promise<PoLog> {
  const col = await scans(), d = await db();
  // Read before 25 Nov: what the log shows is worked out once from the kept words.
  if ((await col.find({}, { projection: { text: 0 } }).toArray()).some((s) => s.empty === undefined)) {
    for (const s of await col.find({}).toArray()) if (s.empty === undefined) await col.updateOne({ _id: s._id }, { $set: { po: poFromText(s.text) ?? "", empty: !s.text } });
  }
  const all = (await col.find({}, { projection: { text: 0 } }).toArray()).sort((a, b) => b.at.localeCompare(a.at));
  const rows = (await d.collection<SalesRow & { id: string }>("salesDocs").find({ kind: "invoices" }, { projection: { id: 1, kind: 1, "row.status": 1, "row.invoice_number": 1, "row.cf_purchase_order_number": 1 } }).toArray()).filter((r) => r.kind === "invoices" && String(r.row.status ?? "") !== "void");
  const files = new Map((await d.collection<{ _id: string; files?: string[] }>("invoiceExtras").find({}, { projection: { files: 1 } }).toArray()).map((e) => [e._id, e.files ?? []]));
  const byKey = new Map<string, { number: string; has: boolean }[]>();
  for (const r of rows) {
    const k = poKey(r.row.cf_purchase_order_number);
    if (k) byKey.set(k, [...(byKey.get(k) ?? []), { number: String(r.row.invoice_number ?? ""), has: (files.get(r.id) ?? []).some(isPoFile) }]);
  }
  const here = [...new Set(all.flatMap((s) => s.hits))].flatMap((k) => byKey.get(k) ?? []);
  const entries = (ids ? ids.flatMap((id) => all.find((s) => s._id === id) ?? []) : all).map((s) => {
    const hit = s.hits.filter((k) => byKey.has(k));
    return { id: s._id, name: s.name, at: s.at, look: s.look, empty: Boolean(s.empty), po: hit.join(", ") || s.po || "", invoices: hit.flatMap((k) => byKey.get(k)!) };
  });
  return { entries, matched: here.length, waiting: here.filter((i) => !i.has).length };
}

/** How many scanned PDFs still wait to be read (the page then carries on by itself). */
export const picturesDue = async () => (await (await scans()).find({}, { projection: { text: 0 } }).toArray()).filter((s) => s.look === "due").length;

/** For each PO key, the PDFs that carry it: the ones nearest the top first, the same file (name and size) once. */
export async function poFiles(): Promise<Map<string, PoFile[]>> {
  const out = new Map<string, PoFile[]>(), seen = new Set<string>();
  const list = (await (await scans()).find({}, { projection: { text: 0 } }).toArray()).filter((s) => s.hits.length);
  for (const s of list.sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name))) {
    for (const k of s.hits) {
      const same = `${k}|${s.name.toLowerCase()}|${s.size}`;
      if (seen.has(same)) continue;
      seen.add(same);
      out.set(k, [...(out.get(k) ?? []), { id: s._id, name: s.name }]);
    }
  }
  return out;
}

/** Preview from the scan log (owner, 25 Nov): a PDF that reads like an order; other papers in the folder don't open from here. */
export async function poLogFile(fileId: string): Promise<string> {
  const s = await (await scans()).findOne({ _id: fileId });
  if (!s || !s.text) throw new Error("That PDF can't be previewed here");
  return s.name;
}

/** The PDF, only if it carries this invoice's PO number (so nothing else in the folder can be opened from here). */
export async function poFileFor(invoiceId: string, fileId: string): Promise<{ name: string; key: string }> {
  const row = await (await db()).collection<SalesRow>("salesDocs").findOne({ _id: `invoices:${invoiceId}` });
  const key = poKey(row?.row.cf_purchase_order_number);
  const s = key ? await (await scans()).findOne({ _id: fileId }) : null;
  if (!s || !s.hits.includes(key)) throw new Error("That PDF doesn't carry this invoice's PO number");
  return { name: s.name, key };
}
