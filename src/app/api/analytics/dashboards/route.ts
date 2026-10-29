import { db } from "@/lib/db";
import { signedInMember, unauthorized } from "@/lib/auth";
import { boardsFor, hasFullAccess, isAdmin } from "@/lib/roles";
import { DASHBOARDS } from "@/lib/analytics/dashboards";
import { type CustomDash, cleanDashboard } from "@/lib/analytics/custom";

export const dynamic = "force-dynamic";

/*
 * The team's dashboards (owner, 29 Oct — custom.ts): Mongo `reportDashboards`, one doc per dashboard; an edited
 * built-in tab is stored under that tab's id. kv `reports_hidden` {ids} = built-in tabs Admin deleted (hidden for
 * everyone, can come back).
 * GET — the ones I may see (shared, or mine) + hidden ids + whether I may edit.
 * POST {dashboard} — save (Admin, Ashish, Shikha, Sumit; an "only me" one only by its maker or Admin).
 * POST {hide, hidden} — Admin: hide / bring back a built-in tab.
 * DELETE ?id= — a made one: its maker or Admin; a built-in tab's team version ("Restore original"): Admin.
 */

type Doc = Omit<CustomDash, "id"> & { _id: string };
type Hidden = { _id: string; ids?: string[]; updatedAt?: string; updatedBy?: string };
const col = async () => (await db()).collection<Doc>("reportDashboards");
const kv = async () => (await db()).collection<Hidden>("kv");
const HIDDEN = "reports_hidden";
const BUILT_IN = new Set(DASHBOARDS.map((d) => d.id));
const RESERVED = new Set([...BUILT_IN, "mine", "saved"]);

const out = ({ _id, ...d }: Doc): CustomDash => ({ id: _id, ...d });

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!boardsFor(me).includes("training")) return Response.json({ dashboards: [], hidden: [], canEdit: false });
  const [docs, hidden] = await Promise.all([(await col()).find({}).limit(200).toArray(), (await kv()).findOne({ _id: HIDDEN })]);
  return Response.json({
    dashboards: docs.filter((d) => d.shared || d.owner === me.id || isAdmin(me)).map(out),
    hidden: hidden?.ids ?? [],
    canEdit: hasFullAccess(me),
    admin: isAdmin(me),
  });
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!hasFullAccess(me)) return Response.json({ error: "Only Admin, Ashish, Shikha and Sumit edit dashboards" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { dashboard?: unknown; hide?: unknown; hidden?: unknown };
  const now = new Date().toISOString();

  if ("hide" in body) {
    if (!isAdmin(me)) return Response.json({ error: "Only Admin deletes a built-in tab" }, { status: 403 });
    if (typeof body.hide !== "string" || !BUILT_IN.has(body.hide)) return Response.json({ error: "Not a built-in tab" }, { status: 400 });
    const cur = (await (await kv()).findOne({ _id: HIDDEN }))?.ids ?? [];
    const ids = body.hidden === false ? cur.filter((x) => x !== body.hide) : [...new Set([...cur, body.hide])];
    await (await kv()).updateOne({ _id: HIDDEN }, { $set: { ids, updatedAt: now, updatedBy: me.name } }, { upsert: true });
    return Response.json({ ok: true, hidden: ids });
  }

  if (JSON.stringify(body.dashboard ?? null).length > 60_000) return Response.json({ error: "Too much to save" }, { status: 400 });
  const d = cleanDashboard(body.dashboard);
  if ("error" in d) return Response.json({ error: d.error }, { status: 400 });
  // A built-in tab's team version lives under that tab's id; a new dashboard can't take a built-in's id.
  if (d.base ? d.base !== d.id || !BUILT_IN.has(d.base) : RESERVED.has(d.id)) return Response.json({ error: "Bad dashboard id" }, { status: 400 });
  if (d.base) d.shared = true;
  const c = await col();
  const old = await c.findOne({ _id: d.id });
  if (old && !old.shared && old.owner !== me.id && !isAdmin(me)) return Response.json({ error: "Only its maker or Admin edits this dashboard" }, { status: 403 });
  if (!old && (await c.countDocuments()) >= 200) return Response.json({ error: "Too many dashboards — delete some first" }, { status: 400 });
  const { id, ...rest } = d;
  const doc: Doc = { _id: id, ...rest, owner: old?.owner ?? me.id, ownerName: old?.ownerName ?? me.name, updatedAt: now, updatedBy: me.name };
  await c.replaceOne({ _id: id }, doc, { upsert: true });
  return Response.json({ ok: true, dashboard: out(doc) });
}

export async function DELETE(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const c = await col();
  const old = await c.findOne({ _id: id });
  if (!old) return Response.json({ error: "No such dashboard" }, { status: 404 });
  const ok = old.base ? isAdmin(me) : old.owner === me.id || isAdmin(me);
  if (!ok) return Response.json({ error: old.base ? "Only Admin restores a built-in tab" : "Only its maker or Admin deletes it" }, { status: 403 });
  await c.deleteOne({ _id: id });
  return Response.json({ ok: true });
}
