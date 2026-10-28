import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { signedInMember, unauthorized } from "@/lib/auth";
import { boardsFor, hasFullAccess, isAdmin } from "@/lib/roles";
import { canRead, datasetOf } from "@/lib/analytics/model";
import { type Spec, SpecError, checkSpec } from "@/lib/analytics/query";

export const dynamic = "force-dynamic";

/*
 * Saved reports (Mongo `reports`): shared with the whole team. GET — the ones on data this member may see. POST
 * { id?, spec } — save (Admin, Ashish, Shikha, Sumit build reports); an existing one only by its author or Admin.
 * DELETE ?id= — author or Admin.
 */

type Saved = { _id: string; spec: Spec; by: string; byId: string; at: string; updatedAt: string };
const col = async () => (await db()).collection<Saved>("reports");

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const boards = boardsFor(me);
  const list = await (await col()).find({}).sort({ updatedAt: -1 }).limit(500).toArray();
  return Response.json({
    canBuild: hasFullAccess(me),
    reports: list.filter((r) => { const d = datasetOf(r.spec.dataset); return d && canRead(d, boards, isAdmin(me)); })
      .map((r) => ({ id: r._id, spec: r.spec, by: r.by, at: r.at, updatedAt: r.updatedAt, mine: r.byId === me.id || isAdmin(me) })),
  });
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!hasFullAccess(me)) return Response.json({ error: "Only Admin, Ashish, Shikha and Sumit save reports" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { id?: string; spec?: Spec };
  if (!body.spec) return Response.json({ error: "Nothing to save" }, { status: 400 });
  try {
    if (!canRead(checkSpec(body.spec), boardsFor(me), isAdmin(me))) return Response.json({ error: "You can't see this data" }, { status: 403 });
  } catch (e) {
    return Response.json({ error: e instanceof SpecError ? e.message : "That report can't be saved" }, { status: 400 });
  }
  const spec: Spec = { ...body.spec, title: (body.spec.title ?? "").trim().slice(0, 120) || "Untitled report" };
  const now = new Date().toISOString();
  const c = await col();
  if (body.id) {
    const had = await c.findOne({ _id: body.id });
    if (!had) return Response.json({ error: "That report no longer exists" }, { status: 404 });
    if (had.byId !== me.id && !isAdmin(me)) return Response.json({ error: "Only its author or Admin can change it" }, { status: 403 });
    await c.updateOne({ _id: body.id }, { $set: { spec, updatedAt: now } });
    return Response.json({ ok: true, id: body.id });
  }
  const id = randomUUID();
  await c.insertOne({ _id: id, spec, by: me.name, byId: me.id, at: now, updatedAt: now });
  return Response.json({ ok: true, id });
}

export async function DELETE(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const c = await col();
  const had = await c.findOne({ _id: id });
  if (!had) return Response.json({ ok: true });
  if (had.byId !== me.id && !isAdmin(me)) return Response.json({ error: "Only its author or Admin can delete it" }, { status: 403 });
  await c.deleteOne({ _id: id });
  return Response.json({ ok: true });
}
