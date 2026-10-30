import { db } from "@/lib/db";
import { signedInMember, unauthorized } from "@/lib/auth";
import { boardsFor, hasFullAccess, isAdmin } from "@/lib/roles";
import { type Param, type ParamType, cleanValue } from "@/lib/analytics/params";

export const dynamic = "force-dynamic";

/*
 * Parameters (params.ts), shared with the team in Mongo `reportParams`. GET — all of them (everyone who sees Reports).
 * POST { param } — make or change one (the people who save reports); changing or DELETE ?id= — its maker or Admin.
 * A report following a deleted parameter loses that filter (it says so); nothing else breaks.
 */

type Doc = Omit<Param, "id"> & { _id: string };
const col = async () => (await db()).collection<Doc>("reportParams");
const out = (d: Doc): Param => ({ id: d._id, name: d.name, type: d.type, value: d.value, ...(d.options ? { options: d.options } : {}), createdBy: d.createdBy, at: d.at });
const TYPES: ParamType[] = ["number", "text", "date", "list"];

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!boardsFor(me).includes("training")) return Response.json({ error: "You can't see this data" }, { status: 403 });
  return Response.json({ params: (await (await col()).find({}).toArray()).map(out) });
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!hasFullAccess(me)) return Response.json({ error: "Admin, Ashish, Shikha, Sumit and Nikita make parameters" }, { status: 403 });
  const p = ((await request.json().catch(() => ({}))) as { param?: Partial<Param> }).param ?? {};
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const type = TYPES.includes(p.type as ParamType) ? (p.type as ParamType) : null;
  const options = type === "list" && Array.isArray(p.options) ? [...new Set(p.options.map((x) => String(x).trim()).filter(Boolean))].slice(0, 50) : undefined;
  if (!name || name.length > 40) return Response.json({ error: "Give it a name (40 letters at most)" }, { status: 400 });
  if (!type) return Response.json({ error: "Pick a kind: number, word, date or list" }, { status: 400 });
  if (type === "list" && !options?.length) return Response.json({ error: "A list needs its choices" }, { status: 400 });
  const value = cleanValue({ type, options }, p.value);
  if (value === null) return Response.json({ error: type === "number" ? "The value must be a number" : type === "date" ? "Pick a date" : "Pick one of the choices" }, { status: 400 });
  const c = await col();
  const all = await c.find({}).toArray();
  if (all.some((x) => x._id !== p.id && x.name.toLowerCase() === name.toLowerCase())) return Response.json({ error: `There's already a parameter called “${name}”` }, { status: 400 });
  const now = new Date().toISOString();
  if (p.id) {
    const had = all.find((x) => x._id === p.id);
    if (!had) return Response.json({ error: "That parameter is gone" }, { status: 404 });
    if (had.createdBy !== me.name && !isAdmin(me)) return Response.json({ error: `Only ${had.createdBy} or Admin changes this parameter` }, { status: 403 });
    const doc: Doc = { ...had, name, type, value, ...(options ? { options } : {}), at: now };
    if (!options) delete doc.options;
    await c.replaceOne({ _id: had._id }, doc);
    return Response.json({ param: out(doc) });
  }
  const doc: Doc = { _id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, type, value, ...(options ? { options } : {}), createdBy: me.name, at: now };
  await c.replaceOne({ _id: doc._id }, doc, { upsert: true });
  return Response.json({ param: out(doc) });
}

export async function DELETE(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const c = await col();
  const had = await c.findOne({ _id: id });
  if (!had) return Response.json({ error: "That parameter is gone" }, { status: 404 });
  if (had.createdBy !== me.name && !isAdmin(me)) return Response.json({ error: `Only ${had.createdBy} or Admin deletes this parameter` }, { status: 403 });
  await c.deleteOne({ _id: id });
  return Response.json({ ok: true });
}
