import { memberIdOf, unauthorized } from "@/lib/auth";
import { mongoConfigured } from "@/lib/db";
import { readSyncLog } from "@/lib/zohoSync";

export const dynamic = "force-dynamic";

// The sidebar's "Sync log" window: every sync (and scheduler call) on one IST day, `?day=YYYY-MM-DD` (default today).
export async function GET(request: Request) {
  if (!memberIdOf(request)) return unauthorized();
  if (!mongoConfigured()) return Response.json({ enabled: false });
  const asked = new URL(request.url).searchParams.get("day") ?? "";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  return Response.json({ enabled: true, ...(await readSyncLog(day)) });
}
