import { db } from "@/lib/db";
import { signedInMember, unauthorized } from "@/lib/auth";
import { boardsFor, hasFullAccess, isAdmin } from "@/lib/roles";
import { canRead } from "@/lib/analytics/model";
import { type Spec, SpecError, checkSpec } from "@/lib/analytics/query";
import { type TileEdit, builtInTile, cleanEditSpec, readEdit, tileKey } from "@/lib/analytics/tileEdits";

export const dynamic = "force-dynamic";

/*
 * The team's versions of the built-in tiles (tileEdits.ts; Mongo `reportTileEdits`, _id "<tab>.<tile>"). GET — every
 * edit (a few small documents, read once when Reports opens). POST { dash, tile, spec } — save (Admin, Ashish, Shikha,
 * Sumit, Nikita — the people who edit dashboards); the tile keeps its own data. DELETE ?key= — Restore original.
 */

type Doc = { _id: string; spec: Spec; by: string; byId: string; at: string };
const col = async () => (await db()).collection<Doc>("reportTileEdits");

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!boardsFor(me).includes("training")) return Response.json({ edits: [], canEdit: false });
  const edits = (await (await col()).find({}).toArray()).map(readEdit).filter((e): e is TileEdit => Boolean(e));
  return Response.json({ edits, canEdit: hasFullAccess(me) });
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!hasFullAccess(me)) return Response.json({ error: "Only Admin, Ashish, Shikha, Sumit and Nikita edit dashboard reports" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { dash?: string; tile?: string; spec?: Spec };
  const tile = builtInTile(String(body.dash ?? ""), String(body.tile ?? ""));
  if (!tile) return Response.json({ error: "That report isn't on a built-in tab" }, { status: 404 });
  if (!body.spec || typeof body.spec !== "object") return Response.json({ error: "Nothing to save" }, { status: 400 });
  if (body.spec.dataset !== tile.spec.dataset) return Response.json({ error: "A dashboard report keeps its own data" }, { status: 400 });
  if (JSON.stringify(body.spec).length > 20_000) return Response.json({ error: "That report is too big to save" }, { status: 400 });
  const spec = cleanEditSpec(body.spec);
  try {
    if (!canRead(checkSpec(spec), boardsFor(me), isAdmin(me))) return Response.json({ error: "You can't see this data" }, { status: 403 });
  } catch (e) {
    return Response.json({ error: e instanceof SpecError ? e.message : "That report can't be saved" }, { status: 400 });
  }
  const key = tileKey(String(body.dash), String(body.tile));
  await (await col()).replaceOne({ _id: key }, { spec, by: me.name, byId: me.id, at: new Date().toISOString() }, { upsert: true });
  return Response.json({ ok: true, key });
}

export async function DELETE(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!hasFullAccess(me)) return Response.json({ error: "Only Admin, Ashish, Shikha, Sumit and Nikita restore dashboard reports" }, { status: 403 });
  const key = new URL(request.url).searchParams.get("key") ?? "";
  await (await col()).deleteOne({ _id: key });
  return Response.json({ ok: true });
}
