import { memberIdOf, unauthorized } from "@/lib/auth";
import { zohoConfigured } from "@/lib/zoho";
import { getSnapshot, metaData } from "@/lib/zohoSync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SAMPLE_TEAM = ["Sumit Shah", "Ashish Dalal", "Baiju Stephen"];

// Team members and customer names (pickers), from the Zoho copy in MongoDB.
export async function GET(request: Request) {
  if (!memberIdOf(request)) return unauthorized();
  if (!zohoConfigured()) return Response.json({ source: "mock", team: SAMPLE_TEAM, customers: [] });
  try {
    const snap = await getSnapshot();
    if (!snap) return Response.json({ source: "zoho", team: [], customers: [], error: "The first Zoho sync hasn't finished yet" }, { status: 502 });
    return Response.json({ source: "zoho", ...metaData(snap), error: snap.error });
  } catch (e) {
    return Response.json({ source: "zoho", team: [], customers: [], error: e instanceof Error ? e.message : "Zoho lookup failed" }, { status: 502 });
  }
}
