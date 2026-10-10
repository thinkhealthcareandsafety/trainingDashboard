import { COLLECTIONS, db, mongoConfigured, type CollectionName } from "@/lib/db";
import { memberIdOf, signedInMember, unauthorized } from "@/lib/auth";
import { SERVER_KINDS, canRevert, canWriteEvent, isAdmin } from "@/lib/roles";
import { cascadeOf } from "@/lib/cascade";
import type { CardEvent } from "@/lib/types";

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
 * ("Zoho Books" notices excepted) and must be something that member may do (roles.ts); an existing entry can only be
 * reverted (recorded under the signed-in name) — your own entries, plus the later steps of their flow that go with them
 * (cascade.ts); Admin may revert any. Only Admin may delete entries. Members are managed by Admin only.
 */
async function stampCardEvents(upserts: Doc[], me: { id: string; name: string }): Promise<Doc[]> {
  const col = (await db()).collection<Doc & { _id: string }>("cardEvents");
  const existing = new Map((await col.find({ _id: { $in: upserts.map((u) => u.id) } }).toArray()).map((e) => [e._id, e]));
  const reverting = upserts.map((d) => existing.get(d.id)).filter((h, i) => h && !h.revertedAt && upserts[i].revertedAt) as (Doc & { _id: string })[];
  // Which reverts this member may make: their own, and what those take along (others' later steps of the same flow).
  let allowed: Set<string> | null = null;
  if (!isAdmin(me) && reverting.length) {
    const own = reverting.filter((h) => canRevert(me, h as unknown as CardEvent));
    allowed = new Set(own.map((h) => h._id));
    if (own.length < reverting.length) {
      const all = (await col.find({}).toArray()) as unknown as CardEvent[];
      for (const e of cascadeOf(own as unknown as CardEvent[], all)) allowed.add(e.id);
    }
  }
  return upserts.flatMap((doc): Doc[] => {
    const had = existing.get(doc.id);
    if (!had) {
      if (!canWriteEvent(me, doc as unknown as CardEvent)) return []; // not this member's board / action
      return [{ ...doc, by: doc.kind === "zoho_change" ? "Zoho Books" : me.name, revertedAt: undefined, revertedBy: undefined }];
    }
    const { _id, ...prev } = had;
    if (prev.revertedAt || !doc.revertedAt) return [prev as Doc]; // nothing to change, or already reverted
    if (SERVER_KINDS.has(prev.kind as CardEvent["kind"])) return [prev as Doc]; // a sent email can't be unsent (nor a reply, nor sheet rows)
    if (allowed && !allowed.has(_id)) return [prev as Doc]; // someone else's change
    return [{ ...prev, revertedAt: new Date().toISOString(), revertedBy: me.name } as Doc];
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
      upserts = await stampCardEvents(upserts, me);
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
