import { signedInMember, unauthorized } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { connectSprints, sprintsBoard, sprintsInfo, SPRINTS_SCOPES } from "@/lib/zohoSprints";

export const dynamic = "force-dynamic";

/*
 * Zoho Sprints on the dashboard (owner, 18 Nov). Every signed-in member.
 *  GET                                   — { connected, canConnect, scopes, board? } (board = project P5's active sprints)
 *  POST { action: "connect", code, clientId?, clientSecret? } — Admin: connect Zoho Sprints once
 */
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const info = await sprintsInfo();
  const base = { connected: Boolean(info), canConnect: isAdmin(me), scopes: SPRINTS_SCOPES };
  if (!info) return json(base);
  try {
    return json({ ...base, board: await sprintsBoard() });
  } catch (e) {
    return json({ ...base, error: e instanceof Error ? e.message : "Couldn't read Zoho Sprints" }, 502);
  }
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const b = (await request.json().catch(() => null)) as { action?: string; code?: unknown; clientId?: unknown; clientSecret?: unknown } | null;
  if (b?.action !== "connect") return json({ error: "Unknown action" }, 400);
  if (!isAdmin(me)) return json({ error: "Only Admin connects Zoho Sprints" }, 403);
  try {
    return json(await connectSprints({ code: String(b.code ?? ""), clientId: b.clientId ? String(b.clientId) : undefined, clientSecret: b.clientSecret ? String(b.clientSecret) : undefined }, me.name));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Couldn't connect Zoho Sprints" }, 502);
  }
}
