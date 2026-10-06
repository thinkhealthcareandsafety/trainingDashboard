import { memberIdOf, unauthorized } from "@/lib/auth";
import { mongoConfigured } from "@/lib/db";
import { zohoConfigured } from "@/lib/zoho";
import { forceSync, syncIfDue, syncStatus } from "@/lib/zohoSync";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // a full check (9 am / 2 pm) takes about a minute

// The sidebar's sync panel. GET = heartbeat: runs the hourly sync if it's due, then reports last / next sync.
// POST = "Sync now" (at most once a minute for everyone together).
export async function GET(request: Request) {
  if (!memberIdOf(request)) return unauthorized();
  if (!zohoConfigured() || !mongoConfigured()) return Response.json({ enabled: false });
  try {
    await syncIfDue();
    return Response.json({ enabled: true, ...(await syncStatus()) });
  } catch (e) {
    return Response.json({ enabled: true, error: e instanceof Error ? e.message : "Sync failed" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!memberIdOf(request)) return unauthorized();
  if (!zohoConfigured() || !mongoConfigured()) return Response.json({ enabled: false });
  try {
    const ran = await forceSync();
    return Response.json({ enabled: true, ran, ...(await syncStatus()) });
  } catch (e) {
    return Response.json({ enabled: true, error: e instanceof Error ? e.message : "Sync failed" }, { status: 502 });
  }
}
