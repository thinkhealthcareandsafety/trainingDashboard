import { COLLECTIONS, db, mongoConfigured, type CollectionName } from "@/lib/db";
import { memberIdOf, signedInMember, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Doc = { id: string } & Record<string, unknown>;

// GET: everything the team shares. Documents are stored with _id = our id.
export async function GET(request: Request) {
  if (!memberIdOf(request)) return unauthorized();
  if (!mongoConfigured()) return Response.json({ enabled: false });
  try {
    const d = await db();
    const out: Record<string, unknown> = { enabled: true };
    for (const c of COLLECTIONS) {
      const docs = await d.collection(c).find({}, { projection: { _id: 0 } }).toArray();
      out[c] = c === "removedTriggers" ? docs.map((x) => x.id) : docs;
    }
    return Response.json(out);
  } catch (e) {
    return Response.json({ enabled: true, error: e instanceof Error ? e.message : "Database error" }, { status: 502 });
  }
}

/**
 * The change log is stamped by the server, not the browser: a new entry gets the signed-in member's name
 * ("Zoho Books" notices excepted), an existing entry can only be reverted (recorded under the signed-in name),
 * and only Admin may delete entries. Members are managed by Admin only (new ones come from /api/members/pin).
 */
async function stampCardEvents(upserts: Doc[], name: string): Promise<Doc[]> {
  const col = (await db()).collection<Doc & { _id: string }>("cardEvents");
  const existing = new Map((await col.find({ _id: { $in: upserts.map((u) => u.id) } }).toArray()).map((e) => [e._id, e]));
  return upserts.map((doc) => {
    const had = existing.get(doc.id);
    if (!had) return { ...doc, by: doc.kind === "zoho_change" ? "Zoho Books" : name, revertedAt: undefined, revertedBy: undefined };
    const { _id, ...prev } = had;
    void _id;
    if (prev.revertedAt || !doc.revertedAt) return prev as Doc; // nothing to change, or already reverted
    return { ...prev, revertedAt: new Date().toISOString(), revertedBy: name } as Doc;
  });
}

// POST: { collection, upserts: Doc[], deletes: string[] } — only what changed.
export async function POST(request: Request) {
  if (!mongoConfigured()) return Response.json({ enabled: false }, { status: 400 });
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const body = (await request.json()) as { collection: CollectionName; upserts?: Doc[]; deletes?: string[] };
  if (!COLLECTIONS.includes(body.collection)) return Response.json({ error: "Unknown collection" }, { status: 400 });
  const admin = me.id === "admin";
  if (body.collection === "members" && !admin) return Response.json({ error: "Only Admin manages members" }, { status: 403 });
  let upserts = (body.upserts ?? []).filter((x) => typeof x?.id === "string");
  let deletes = (body.deletes ?? []).filter((x) => typeof x === "string");
  try {
    if (body.collection === "cardEvents") {
      upserts = await stampCardEvents(upserts, me.name);
      if (!admin) deletes = []; // the log is append-only (Admin clears it via Clear logs)
    }
    const col = (await db()).collection(body.collection);
    const clean = (doc: Doc) => Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== undefined));
    const ops = [
      ...upserts.map((doc) => ({ replaceOne: { filter: { _id: doc.id as never }, replacement: { ...clean(doc), _id: doc.id as never }, upsert: true } })),
      ...deletes.map((id) => ({ deleteOne: { filter: { _id: id as never } } })),
    ];
    if (ops.length) await col.bulkWrite(ops, { ordered: false });
    return Response.json({ ok: true, upserted: upserts.length, deleted: deletes.length });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Database error" }, { status: 502 });
  }
}
