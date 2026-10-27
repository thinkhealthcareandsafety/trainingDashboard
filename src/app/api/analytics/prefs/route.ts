import { db } from "@/lib/db";
import { signedInMember, unauthorized } from "@/lib/auth";
import { boardsFor } from "@/lib/roles";

export const dynamic = "force-dynamic";

/*
 * Each member's own Reports settings (Mongo `reportPrefs`, one doc per member — owner, 27 Oct: per person). For now:
 * saved views per dashboard (a name + period, filters, comparison). GET — mine. POST { dash, views } — replace my
 * views on that dashboard. Nobody reads or writes anyone else's.
 */

type View = { name: string; state: unknown };
type Doc = { _id: string; views?: Record<string, View[]>; updatedAt?: string };
const col = async () => (await db()).collection<Doc>("reportPrefs");

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const d = await (await col()).findOne({ _id: me.id });
  return Response.json({ views: d?.views ?? {} });
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!boardsFor(me).includes("training")) return Response.json({ error: "You can't see this data" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { dash?: unknown; views?: unknown };
  if (typeof body.dash !== "string" || !/^[a-z0-9-]{1,40}$/.test(body.dash)) return Response.json({ error: "Bad dashboard" }, { status: 400 });
  if (!Array.isArray(body.views) || body.views.length > 30) return Response.json({ error: "At most 30 views" }, { status: 400 });
  const views: View[] = [];
  for (const v of body.views as { name?: unknown; state?: unknown }[]) {
    const name = typeof v?.name === "string" ? v.name.trim().slice(0, 60) : "";
    if (!name || typeof v.state !== "object" || v.state === null) return Response.json({ error: "Each view needs a name" }, { status: 400 });
    views.push({ name, state: v.state });
  }
  if (JSON.stringify(views).length > 50_000) return Response.json({ error: "Too much to save" }, { status: 400 });
  await (await col()).updateOne({ _id: me.id }, { $set: { [`views.${body.dash}`]: views, updatedAt: new Date().toISOString() } }, { upsert: true });
  return Response.json({ ok: true, views });
}
