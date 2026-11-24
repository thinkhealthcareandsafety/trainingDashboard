import "server-only";
import { db } from "./db";
import { orderText, poInPdf, poKey } from "./poMatch";
import { workdriveOpen, workdrivePdfsUnder, type WdFile } from "./workdrive";

/*
 * The PO folder in Zoho WorkDrive (owner, 24 Nov): every PDF in it, and in the folders inside, is read once; its PO numbers
 * are compared with those of the Invoice Converter's invoices (poMatch.ts). Nothing is attached by itself: the page shows
 * "PO found", the user looks at the PDF and picks it. Run by the button, and by every sync.
 *  - `poScans`: one per PDF { name, size, depth, text, hits: PO keys on it }; kv `po_folder` { keys already compared, at }.
 */
export const PO_FOLDER = "metokf3e113be57704e23b82663cf7c1b9ab1";
const MAX_TEXT = 120_000;

type Scan = { _id: string; name: string; size: number | null; depth: number; text: string; hits: string[]; readable: boolean; at: string };
type State = { _id: string; keys: string[]; at: string | null; left: number };
type SalesRow = { _id: string; kind: string; row: Record<string, unknown> };
export type PoFile = { id: string; name: string };
export type ScanResult = { files: number; left: number; added: number; unread: number };

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
    const more = fresh.filter((k) => !s.hits.includes(k) && poInPdf(k, s.name, s.text));
    if (more.length) await col.updateOne({ _id: s._id }, { $set: { hits: [...s.hits, ...more] } });
  }
  await (await kv()).updateOne({ _id: "po_folder" }, { $set: { keys: [...new Set([...done, ...fresh])] } });
}

/** Reads the PDFs not read yet (new, or changed), for at most `budgetMs`; `left` = how many are still to read. */
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
  const todo: WdFile[] = files.filter((f) => { const k = known.get(f.id); return !k || k.size !== f.size || k.name !== f.name; });
  const compared = new Set((await (await kv()).findOne({ _id: "po_folder" }))?.keys ?? []);
  for (const k of keys) compared.add(k);
  const all = [...compared];
  let next = 0, added = 0, failed = 0;
  const work = async () => {
    while (next < todo.length && now() - t0 < budgetMs) {
      const f = todo[next++];
      try {
        const res = await workdriveOpen(f.id);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const text = (await pdfText(bytes)).slice(0, MAX_TEXT), kept = orderText(text) || poNamed(f.name) ? text : "";
        const doc = { name: f.name, size: f.size, depth: f.depth, text: kept, hits: all.filter((k) => poInPdf(k, f.name, kept)), readable: text.trim().length >= 40, at: new Date().toISOString() };
        await col.replaceOne({ _id: f.id }, doc, { upsert: true });
        added++;
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
  const unread = (await col.find({}, { projection: { text: 0 } }).toArray()).filter((s) => here.has(s._id) && !s.readable).length;
  return { files: files.length, left: todo.length - added, added, unread };
}
const poNamed = (name: string) => /^p\.?o\b|purchase.?order/i.test(name.trim());

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

/** The PDF, only if it carries this invoice's PO number (so nothing else in the folder can be opened from here). */
export async function poFileFor(invoiceId: string, fileId: string): Promise<{ name: string; key: string }> {
  const row = await (await db()).collection<SalesRow>("salesDocs").findOne({ _id: `invoices:${invoiceId}` });
  const key = poKey(row?.row.cf_purchase_order_number);
  const s = key ? await (await scans()).findOne({ _id: fileId }) : null;
  if (!s || !s.hits.includes(key)) throw new Error("That PDF doesn't carry this invoice's PO number");
  return { name: s.name, key };
}
