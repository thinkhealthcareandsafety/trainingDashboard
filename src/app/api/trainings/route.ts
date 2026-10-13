import { memberIdOf, unauthorized } from "@/lib/auth";
import { ZOHO_ORG_ID, zohoConfigured } from "@/lib/zoho";
import { getSnapshot, trainingsData } from "@/lib/zohoSync";
import { generateMockPipeline, generateMockTrainings } from "@/lib/mock-data";
import { mongoConfigured } from "@/lib/db";
import { boardTrainings } from "@/lib/fulfilServer";
import type { TrainingsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Overview: training invoices + open quotes / booked sales orders, from the Zoho copy in MongoDB — and the boards' own
// trainings (Training board, AedSmartx), built from that copy and the change log: the targets, calendar and ticker use those.
export async function GET(request: Request) {
  if (!memberIdOf(request)) return unauthorized();
  if (!zohoConfigured()) {
    return Response.json({
      source: "mock",
      syncedAt: new Date().toISOString(),
      trainings: generateMockTrainings(),
      pipeline: generateMockPipeline(),
    } satisfies TrainingsResponse);
  }
  try {
    const snap = await getSnapshot(new URL(request.url).searchParams.get("refresh") === "1");
    if (!snap) return Response.json({ source: "zoho", syncedAt: new Date().toISOString(), trainings: [], pipeline: [], error: "The first Zoho sync hasn't finished yet" } satisfies TrainingsResponse, { status: 502 });
    // The boards' trainings: a problem there never hides the Zoho figures.
    const boards = mongoConfigured() ? await boardTrainings(snap).catch((e) => (console.error("[trainings] board:", e), undefined)) : undefined;
    return Response.json({ source: "zoho", syncedAt: snap.syncedAt, ...trainingsData(snap), ...boards, orgId: ZOHO_ORG_ID, error: snap.error } satisfies TrainingsResponse);
  } catch (e) {
    const error = e instanceof Error ? e.message : "Zoho sync failed";
    return Response.json({ source: "zoho", syncedAt: new Date().toISOString(), trainings: [], pipeline: [], error } satisfies TrainingsResponse, { status: 502 });
  }
}
