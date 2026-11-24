import "server-only";
import { db } from "./db";
import { clearPo, orderText, poInPdf, poKey } from "./poMatch";
import { workdriveOpen, workdrivePdfsUnder, type WdFile } from "./workdrive";

/*
 * The PO folder in Zoho WorkDrive (owner, 24 Nov): every PDF in it, and in the folders inside, is read once; its PO numbers
 * are compared with those of the Invoice Converter's invoices (poMatch.ts). Nothing is attached by itself: the page shows
 * "PO found", the user looks at the PDF and picks it. Run by the button, by every sync (at most every half hour), and by
 * the Invoice Converter's page while something is left.
 *  - A PDF whose text doesn't show its PO number clearly (a scan, or one whose words come out of order) is also read from
 *    its picture (pageRead.ts, owner: never by file name). That takes 5-20 s each, so only the Invoice Converter does it.
 *  - `poScans`: one per PDF { name, size, depth, text, hits: PO keys on it, look }; kv `po_folder` { keys already compared,
 *    at, left }. `look`: "due" = its picture is still to be read, "done", "failed"; "no" = its text was enough.
 */
export const PO_FOLDER = "metokf3e113be57704e23b82663cf7c1b9ab1";
const MAX_TEXT = 120_000;
const VERSION = 2; // a new way of reading: every PDF is read again
const AGAIN_MS = 30 * 60_000;

type Scan = { _id: string; name: string; size: number | null; depth: number; text: string; hits: string[]; look: "no" | "due" | "done" | "failed"; tries?: number; v: number; at: string };
type State = { _id: string; keys: string[]; at: string | null; left: number };
export type Look = "with pictures" | "text only";
type SalesRow = { _id: string; kind: string; row: Record<string, unknown> };
export type PoFile = { id: string; name: string };
/** `left`: PDFs still to read (`pictures` of them from their picture); `seen`: read from their picture; `unread`: nothing like an order could be read. */
export type ScanResult = { files: number; left: number; pictures: number; added: number; seen: number; unread: number };

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
  await scanPoFolder(budgetMs, "text only");
}

/** Reads the PDFs not read yet (new, or changed), for about `budgetMs`: their text first, then the pictures. */
export async function scanPoFolder(budgetMs: number, how: Look = "with pictures", now = () => Date.now()): Promise<ScanResult> {
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
  let next = 0, added = 0, failed = 0, pictures = 0, trouble = "";
  const work = async () => {
    while (next < todo.length && now() - t0 < budgetMs) {
      const f = todo[next++];
      try {
        const res = await workdriveOpen(f.id);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const text = (await pdfText(bytes)).slice(0, MAX_TEXT), kept = orderText(text) ? text : "";
        const doc: Omit<Scan, "_id"> = { name: f.name, size: f.size, depth: f.depth, text: kept, hits: all.filter((k) => poInPdf(k, kept)), look: clearPo(kept) ? "no" : "due", v: VERSION, at: new Date().toISOString() };
        await col.replaceOne({ _id: f.id }, doc, { upsert: true });
        added++;
      } catch (e) {
        failed++;
        console.error(`[po folder] ${f.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
  };
  await Promise.all([work(), work(), work(), work()]);
  // The pictures, once every text is read: those nearest the top first, one at a time.
  if (how === "with pictures" && added === todo.length) {
    const due = (await col.find({}, { projection: { text: 0 } }).toArray()).filter((s) => here.has(s._id) && s.look === "due").sort((a, b) => a.depth - b.depth);
    for (const s of due) {
      if (now() - t0 > budgetMs) break;
      // The same file in another folder (same name and size), already read: its words are taken over.
      const twin = (await col.find({}).toArray()).find((x) => x._id !== s._id && x.look === "done" && x.v === VERSION && x.name === s.name && x.size === s.size);
      if (twin) {
        await col.updateOne({ _id: s._id }, { $set: { text: twin.text, hits: all.filter((k) => poInPdf(k, twin.text)), look: "done" } });
        pictures++;
        continue;
      }
      // Counted before it starts: a PDF that brings the server down twice is left alone.
      const tries = (s.tries ?? 0) + 1;
      await col.updateOne({ _id: s._id }, { $set: tries > 2 ? { look: "failed" } : { tries } });
      if (tries > 2) continue;
      try {
        const { readFirstPage } = await import("./pageRead");
        const bytes = new Uint8Array(await (await workdriveOpen(s._id)).arrayBuffer());
        const was = (await col.findOne({ _id: s._id }))?.text ?? "";
        const both = `${was}\n${await readFirstPage(bytes)}`.slice(-MAX_TEXT), kept = orderText(both) ? both : "";
        await col.updateOne({ _id: s._id }, { $set: { text: kept, hits: all.filter((k) => poInPdf(k, kept)), look: "done", at: new Date().toISOString() } });
        pictures++;
      } catch (e) {
        console.error(`[po folder] picture of ${s._id}: ${e instanceof Error ? e.message : e}`);
        trouble = "Reading the scanned pages failed. Click Find POs to try again.";
      }
    }
  }
  // PO numbers typed while these PDFs were being read: put back, so the next look compares them with these too.
  const later = (await currentKeys()).filter((k) => !compared.has(k));
  if ((added || pictures) && later.length) {
    const kept = (await (await kv()).findOne({ _id: "po_folder" }))?.keys ?? [];
    await (await kv()).updateOne({ _id: "po_folder" }, { $set: { keys: kept.filter((k) => !later.includes(k)) } });
  }
  if (failed && !added) throw new Error("Zoho WorkDrive didn't give the PDFs. Try again in a minute.");
  const after = (await col.find({}).toArray()).filter((s) => here.has(s._id));
  const due = after.filter((s) => s.look === "due").length, left = todo.length - added;
  await (await kv()).updateOne({ _id: "po_folder" }, { $set: { left } });
  if (trouble && !pictures && !added) throw new Error(trouble);
  return { files: files.length, left: left + due, pictures: due, added: added + pictures, seen: after.filter((s) => s.look === "done").length, unread: after.filter((s) => s.look !== "due" && !s.text).length };
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

/** The PDF, only if it carries this invoice's PO number (so nothing else in the folder can be opened from here). */
export async function poFileFor(invoiceId: string, fileId: string): Promise<{ name: string; key: string }> {
  const row = await (await db()).collection<SalesRow>("salesDocs").findOne({ _id: `invoices:${invoiceId}` });
  const key = poKey(row?.row.cf_purchase_order_number);
  const s = key ? await (await scans()).findOne({ _id: fileId }) : null;
  if (!s || !s.hits.includes(key)) throw new Error("That PDF doesn't carry this invoice's PO number");
  return { name: s.name, key };
}
