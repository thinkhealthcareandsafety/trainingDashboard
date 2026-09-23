import { fetchCustomers, fetchTeam, zohoConfigured } from "@/lib/zoho";

export const dynamic = "force-dynamic";

// Team members and customers change rarely: cache for 6 hours.
const TTL_MS = 6 * 60 * 60_000;
type Meta = { at: number; team: string[]; customers: string[] };
const C = ((globalThis as unknown as { __thMeta?: { v: Meta | null } }).__thMeta ??= { v: null });

const SAMPLE_TEAM = ["Sumit Shah", "Ashish Dalal", "Baiju Stephen"];

export async function GET(request: Request) {
  if (!zohoConfigured()) return Response.json({ source: "mock", team: SAMPLE_TEAM, customers: [] });
  const fresh = new URL(request.url).searchParams.has("refresh");
  if (!fresh && C.v && Date.now() - C.v.at < TTL_MS) return Response.json({ source: "zoho", team: C.v.team, customers: C.v.customers });
  try {
    const [team, customers] = await Promise.all([fetchTeam(), fetchCustomers()]);
    const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    C.v = { at: Date.now(), team: uniq(team), customers: uniq(customers) };
    return Response.json({ source: "zoho", team: C.v.team, customers: C.v.customers });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Zoho lookup failed";
    if (C.v) return Response.json({ source: "zoho", team: C.v.team, customers: C.v.customers, error });
    return Response.json({ source: "zoho", team: [], customers: [], error }, { status: 502 });
  }
}
