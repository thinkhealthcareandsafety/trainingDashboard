import { signedInMember, unauthorized } from "@/lib/auth";
import { hasFollowUps } from "@/lib/roles";
import type { AedResponse } from "@/lib/types";
import { zohoConfigured } from "@/lib/zoho";
import { AED_SINCE, aedData, getSnapshot } from "@/lib/zohoSync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// AedSmartx board: invoices with an "All AEDs" item from AED_SINCE (1 Sept 2026), served from the Zoho copy in MongoDB.
export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!hasFollowUps(me)) return Response.json({ error: "Follow-ups aren't on your account" }, { status: 403 });
  if (!zohoConfigured()) return Response.json({ syncedAt: new Date().toISOString(), windowStart: AED_SINCE, invoices: [] } satisfies AedResponse);
  try {
    const snap = await getSnapshot(new URL(request.url).searchParams.has("refresh"));
    if (!snap) return Response.json({ syncedAt: "", windowStart: AED_SINCE, invoices: [], error: "The first Zoho sync hasn't finished yet" } satisfies AedResponse, { status: 502 });
    return Response.json({ syncedAt: snap.syncedAt, ...aedData(snap), error: snap.error } satisfies AedResponse);
  } catch (e) {
    return Response.json({ syncedAt: "", windowStart: AED_SINCE, invoices: [], error: e instanceof Error ? e.message : String(e) } satisfies AedResponse, { status: 502 });
  }
}
