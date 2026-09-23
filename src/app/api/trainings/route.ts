import { ZOHO_ORG_ID, fetchFromZoho, zohoConfigured } from "@/lib/zoho";
import { generateMockPipeline, generateMockTrainings } from "@/lib/mock-data";
import type { TrainingsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// In-memory cache so dashboard traffic never exhausts Zoho's rate limit.
const TTL_MS = 5 * 60_000;
const C = ((globalThis as unknown as { __thTrainings?: { v: { at: number; data: TrainingsResponse } | null } }).__thTrainings ??= { v: null });

export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.get("refresh") === "1";

  if (!zohoConfigured()) {
    return Response.json({
      source: "mock",
      syncedAt: new Date().toISOString(),
      trainings: generateMockTrainings(),
      pipeline: generateMockPipeline(),
    } satisfies TrainingsResponse);
  }

  if (!force && C.v && Date.now() - C.v.at < TTL_MS) return Response.json(C.v.data);

  try {
    const { trainings, pipeline } = await fetchFromZoho();
    C.v = { at: Date.now(), data: { source: "zoho", syncedAt: new Date().toISOString(), trainings, pipeline, orgId: ZOHO_ORG_ID } };
    return Response.json(C.v.data);
  } catch (e) {
    const error = e instanceof Error ? e.message : "Zoho sync failed";
    // Serve the last good data if we have it, flagged with the error.
    if (C.v) return Response.json({ ...C.v.data, error });
    return Response.json({ source: "zoho", syncedAt: new Date().toISOString(), trainings: [], pipeline: [], error } satisfies TrainingsResponse, { status: 502 });
  }
}
