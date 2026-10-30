import { after } from "next/server";
import { signedInMember, unauthorized } from "@/lib/auth";
import { boardsFor, isAdmin } from "@/lib/roles";
import { visibleTables } from "@/lib/analytics/tables";
import { catalogStale, readCatalog, refreshCatalog } from "@/lib/analytics/tablesServer";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/*
 * The Zoho Analytics tables a member may build reports on (owner, 30 Oct: "read from Zoho Analytics directly") —
 * name, rows, columns and links, read from Zoho's metadata (tablesServer.ts). GET — the list; when it's missing,
 * half-read or a day old, one more reading pass runs after the answer (`partial` tells the builder to ask again).
 * POST { force } — Admin: read every table again now.
 */

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!boardsFor(me).includes("training")) return Response.json({ error: "You can't see this data" }, { status: 403 });
  const catalog = await readCatalog();
  if (catalogStale(catalog)) after(() => refreshCatalog().then(() => undefined, () => undefined));
  return Response.json({ tables: visibleTables(catalog, isAdmin(me)), readAt: catalog.readAt ?? null, partial: catalogStale(catalog) && !catalog.readAt ? true : Boolean(catalog.partial) });
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!isAdmin(me)) return Response.json({ error: "Only Admin re-reads the Zoho tables" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { force?: boolean };
  const ran = await refreshCatalog(Boolean(body.force));
  return Response.json({ ok: ran, ...(ran ? {} : { error: "A reading pass is already running" }) });
}
