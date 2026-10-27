import { db } from "@/lib/db";
import { signedInMember, unauthorized } from "@/lib/auth";
import { boardsFor, isAdmin } from "@/lib/roles";
import { type LayoutEntry, cleanLayout } from "@/lib/analytics/layout";

export const dynamic = "force-dynamic";

/*
 * Each member's own Reports settings (Mongo `reportPrefs`, one doc per member — owner, 27 Oct: per person): saved views
 * per dashboard (a name + period, filters, comparison) and "My dashboard" (`layout`). GET — mine, plus the starting
 * layout (kv `reports_layout`, Admin's). POST { dash, views } — replace my views on that dashboard; { layout } — my
 * dashboard (null = back to the starting layout); { starting } — Admin: the starting layout for everyone who hasn't
 * made their own (null = back to the built-in one). Nobody reads or writes anyone else's.
 */

type View = { name: string; state: unknown };
type Doc = { _id: string; views?: Record<string, View[]>; layout?: { tiles: LayoutEntry[]; updatedAt: string }; updatedAt?: string };
type Starting = { _id: string; tiles?: LayoutEntry[]; updatedAt?: string; updatedBy?: string };
const col = async () => (await db()).collection<Doc>("reportPrefs");
const kv = async () => (await db()).collection<Starting>("kv");
const STARTING = "reports_layout";

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const [d, s] = await Promise.all([(await col()).findOne({ _id: me.id }), (await kv()).findOne({ _id: STARTING })]);
  return Response.json({ views: d?.views ?? {}, layout: d?.layout?.tiles ?? null, starting: s?.tiles ?? null, startingBy: s?.tiles ? s.updatedBy : undefined });
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!boardsFor(me).includes("training")) return Response.json({ error: "You can't see this data" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { dash?: unknown; views?: unknown; layout?: unknown; starting?: unknown };
  const now = new Date().toISOString();

  if ("starting" in body) {
    if (!isAdmin(me)) return Response.json({ error: "Only Admin sets the starting layout" }, { status: 403 });
    if (body.starting === null) {
      await (await kv()).updateOne({ _id: STARTING }, { $unset: { tiles: "" }, $set: { updatedAt: now, updatedBy: me.name } }, { upsert: true });
      return Response.json({ ok: true, starting: null });
    }
    const tiles = cleanLayout(body.starting);
    if (!tiles) return Response.json({ error: "That layout can't be saved" }, { status: 400 });
    await (await kv()).updateOne({ _id: STARTING }, { $set: { tiles, updatedAt: now, updatedBy: me.name } }, { upsert: true });
    return Response.json({ ok: true, starting: tiles });
  }

  if ("layout" in body) {
    if (body.layout === null) {
      await (await col()).updateOne({ _id: me.id }, { $unset: { layout: "" }, $set: { updatedAt: now } });
      return Response.json({ ok: true, layout: null });
    }
    const tiles = cleanLayout(body.layout);
    if (!tiles) return Response.json({ error: "That layout can't be saved" }, { status: 400 });
    await (await col()).updateOne({ _id: me.id }, { $set: { layout: { tiles, updatedAt: now }, updatedAt: now } }, { upsert: true });
    return Response.json({ ok: true, layout: tiles });
  }

  if (typeof body.dash !== "string" || !/^[a-z0-9-]{1,40}$/.test(body.dash)) return Response.json({ error: "Bad dashboard" }, { status: 400 });
  if (!Array.isArray(body.views) || body.views.length > 30) return Response.json({ error: "At most 30 views" }, { status: 400 });
  const views: View[] = [];
  for (const v of body.views as { name?: unknown; state?: unknown }[]) {
    const name = typeof v?.name === "string" ? v.name.trim().slice(0, 60) : "";
    if (!name || typeof v.state !== "object" || v.state === null) return Response.json({ error: "Each view needs a name" }, { status: 400 });
    views.push({ name, state: v.state });
  }
  if (JSON.stringify(views).length > 50_000) return Response.json({ error: "Too much to save" }, { status: 400 });
  await (await col()).updateOne({ _id: me.id }, { $set: { [`views.${body.dash}`]: views, updatedAt: now } }, { upsert: true });
  return Response.json({ ok: true, views });
}
