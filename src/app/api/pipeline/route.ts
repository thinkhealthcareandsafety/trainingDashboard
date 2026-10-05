import { memberIdOf, unauthorized } from "@/lib/auth";
import type { PipelineResponse } from "@/lib/types";
import { syncWindowStart, ymd } from "@/lib/dates";
import { ZOHO_ORG_ID, zohoConfigured } from "@/lib/zoho";
import { getSnapshot, pipelineData } from "@/lib/zohoSync";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // the very first sync (empty database) takes a few minutes

// Follow-ups board: served from the Zoho copy in MongoDB (see lib/zohoSync.ts) — no Zoho calls per page load.
export async function GET(request: Request) {
  if (!memberIdOf(request)) return unauthorized();
  const windowStart = ymd(syncWindowStart(new Date()));
  const empty = { windowStart, leads: [], quotes: [], pis: [], invoices: [], payments: [], typeOptions: [], sectorOptions: [] };
  if (!zohoConfigured()) return Response.json({ source: "mock", syncedAt: new Date().toISOString(), ...empty } satisfies PipelineResponse);
  try {
    const snap = await getSnapshot(new URL(request.url).searchParams.has("refresh"));
    if (!snap) return Response.json({ source: "zoho", syncedAt: "", ...empty, error: "The first Zoho sync hasn't finished yet" } satisfies PipelineResponse, { status: 502 });
    const body: PipelineResponse = { source: "zoho", syncedAt: snap.syncedAt, ...pipelineData(snap), orgId: ZOHO_ORG_ID, error: snap.error };
    return Response.json(body);
  } catch (e) {
    return Response.json({ source: "zoho", syncedAt: "", ...empty, error: e instanceof Error ? e.message : String(e) } satisfies PipelineResponse, { status: 502 });
  }
}
