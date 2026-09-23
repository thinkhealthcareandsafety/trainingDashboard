import { COLLECTIONS, db, mongoConfigured, type CollectionName } from "@/lib/db";

export const dynamic = "force-dynamic";

type Doc = { id: string } & Record<string, unknown>;

// GET: everything the team shares. Documents are stored with _id = our id.
export async function GET() {
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

// POST: { collection, upserts: Doc[], deletes: string[] } — only what changed.
export async function POST(request: Request) {
  if (!mongoConfigured()) return Response.json({ enabled: false }, { status: 400 });
  const body = (await request.json()) as { collection: CollectionName; upserts?: Doc[]; deletes?: string[] };
  if (!COLLECTIONS.includes(body.collection)) return Response.json({ error: "Unknown collection" }, { status: 400 });
  const upserts = (body.upserts ?? []).filter((x) => typeof x?.id === "string");
  const deletes = (body.deletes ?? []).filter((x) => typeof x === "string");
  try {
    const col = (await db()).collection(body.collection);
    const ops = [
      ...upserts.map((doc) => ({ replaceOne: { filter: { _id: doc.id as never }, replacement: { ...doc, _id: doc.id as never }, upsert: true } })),
      ...deletes.map((id) => ({ deleteOne: { filter: { _id: id as never } } })),
    ];
    if (ops.length) await col.bulkWrite(ops, { ordered: false });
    return Response.json({ ok: true, upserted: upserts.length, deleted: deletes.length });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Database error" }, { status: 502 });
  }
}
