import { memberIdOf, unauthorized } from "@/lib/auth";
import { versions } from "@/lib/changes";

export const dynamic = "force-dynamic";

// Live refresh (owner, 13 Nov): what changed, as three small counters. Every open tab asks every few seconds while it's
// visible, and reloads only what a changed one touches (lib/live.ts). One tiny read; nothing else.
export async function GET(request: Request) {
  if (!memberIdOf(request)) return unauthorized();
  try {
    return Response.json(await versions(), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Database error" }, { status: 502 });
  }
}
