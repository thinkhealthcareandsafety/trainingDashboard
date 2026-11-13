import "server-only";
import { after } from "next/server";
import { booksApi } from "./quotations";
import { putZohoDoc } from "./zohoSync";
import { putSalesDoc } from "./salesSync";
import { bump } from "./changes";
import { db } from "./db";
import type { Kind, ZDoc } from "./zoho";

/*
 * Live refresh (owner, 13 Nov): when the dashboard changes something in Zoho Books — a quotation made, saved, emailed or
 * marked Accepted / Declined / Sent; a Performa made, saved or confirmed — it reads that document back once and writes
 * it into our copies (the Training board's and the Sales board's), so the boards, Quotations, Trainings and the story
 * show it straight away instead of after the next sync. One Zoho call per document. Runs after the response is sent;
 * a failure only means the next sync brings it (as before).
 */
const SINGULAR: Record<Kind, string> = { estimates: "estimate", salesorders: "salesorder", invoices: "invoice" };

export async function writeThrough(docs: { kind: Kind; id: string; doc?: ZDoc }[]): Promise<void> {
  let wrote = 0;
  for (const x of docs) {
    try {
      const d = x.doc ?? ((await booksApi("GET", `/${x.kind}/${x.id}`))[SINGULAR[x.kind]] as ZDoc | undefined);
      if (!d) continue;
      await putZohoDoc(x.kind, d);
      await putSalesDoc(x.kind, d);
      wrote++;
    } catch (e) {
      console.error(`[writeThrough] ${x.kind}/${x.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (wrote) await bump("local", "work");
}

/*
 * Documents Zoho deleted (owner, 13 Nov: "it's removed, should also get removed from here by default"), kept in
 * `zohoDeleted` (_id "estimates:<id>"): the copies that refresh slowly — the Reports copy (Zoho Analytics) behind
 * Quotations' "Last quotation", our record of quotes sent from here — skip them at once.
 */
export async function noteDeleted(kind: Kind, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const col = (await db()).collection<{ _id: string; kind: Kind; id: string; at: string }>("zohoDeleted");
  const at = new Date().toISOString();
  for (const id of ids) await col.replaceOne({ _id: `${kind}:${id}` }, { kind, id, at }, { upsert: true });
}
let deletedCache: { n: number; byKind: Map<Kind, Set<string>> } | null = null;
/** The ids Zoho deleted, of this kind (read again only when the list grew). */
export async function deletedIds(kind: Kind): Promise<Set<string>> {
  const col = (await db()).collection<{ _id: string; kind: Kind; id: string }>("zohoDeleted");
  const n = await col.countDocuments({});
  if (deletedCache?.n !== n) {
    const byKind = new Map<Kind, Set<string>>();
    for (const d of await col.find({}).toArray()) byKind.set(d.kind, (byKind.get(d.kind) ?? new Set()).add(d.id));
    deletedCache = { n, byKind };
  }
  return deletedCache.byKind.get(kind) ?? new Set();
}

/** A document deleted in Zoho: out of our copies now (the sync's full check would take up to 6 hours to notice). */
export async function forgetZohoDoc(kind: Kind, id: string): Promise<void> {
  await noteDeleted(kind, [id]);
  const d = await db();
  await d.collection<{ _id: string }>("zohoDocs").deleteOne({ _id: `${kind}:${id}` });
  await d.collection<{ _id: string }>("salesDocs").deleteOne({ _id: `${kind}:${id}` });
  await bump("local", "work");
}

/** Zoho said the document isn't there any more (deleted): "Zoho Books: Sales Order does not exist." */
export const goneInZoho = (e: unknown) => /does not exist|has been deleted/i.test(e instanceof Error ? e.message : String(e));

/** The same, after the response has gone (the person waits for nothing). Outside a request (scripts, tests) it just runs. */
export function writeThroughLater(docs: { kind: Kind; id: string; doc?: ZDoc }[]): void {
  const run = () => writeThrough(docs).catch((e) => console.error("[writeThrough]", e));
  try { after(run); } catch { void run(); }
}
