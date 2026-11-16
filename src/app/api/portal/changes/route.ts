import { versions } from "@/lib/changes";

export const dynamic = "force-dynamic";

/*
 * Live refresh on the portal (owner, 16 Nov: "any changes should be live at all times immediately, without me having to
 * refresh"): the same three counters as /api/changes, for coordinators and participants (no staff sign-in). Only numbers
 * that go up; no data. Each portal page asks every 5 s while visible and reloads its own data when one moves (lib/live.ts).
 */
export async function GET() {
  try {
    return Response.json(await versions(), { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "Try again in a moment" }, { status: 502 });
  }
}
