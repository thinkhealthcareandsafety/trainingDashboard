import type { PipelineResponse, ZohoLead, ZohoQuote } from "@/lib/types";
import { ZOHO_ORG_ID, fetchAllLeads, fetchRecentLeads, fetchTrainingQuotes, zohoConfigured } from "@/lib/zoho";

export const dynamic = "force-dynamic";

// Zoho Books has a daily API budget, so customers are fully re-listed only every 6 hours (~21 calls);
// in between, one call for the most recently created/edited customers picks up new ones.
const FULL_MS = 6 * 60 * 60_000;
const RECENT_MS = 2 * 60_000;
const QUOTES_MS = 3 * 60_000;

type State = {
  leads: Map<string, ZohoLead>;
  fullAt: number;
  recentAt: number;
  quotes: ZohoQuote[];
  quotesAt: number;
  syncedAt: string;
  running: Promise<void> | null;
  error?: string;
};
const S: State = ((globalThis as unknown as { __thPipeline?: State }).__thPipeline ??= {
  leads: new Map(),
  fullAt: 0,
  recentAt: 0,
  quotes: [],
  quotesAt: 0,
  syncedAt: "",
  running: null,
});

async function sync(force: boolean) {
  const now = Date.now();
  const tasks: (() => Promise<void>)[] = [];
  if (force || now - S.fullAt > FULL_MS) {
    tasks.push(async () => {
      const all = await fetchAllLeads();
      S.leads = new Map(all.map((l) => [l.contactId, l]));
      S.fullAt = S.recentAt = Date.now();
    });
  } else if (now - S.recentAt > RECENT_MS) {
    tasks.push(async () => {
      for (const l of await fetchRecentLeads()) S.leads.set(l.contactId, l);
      S.recentAt = Date.now();
    });
  }
  if (force || now - S.quotesAt > QUOTES_MS) {
    tasks.push(async () => {
      S.quotes = await fetchTrainingQuotes();
      S.quotesAt = Date.now();
    });
  }
  if (!tasks.length) return;
  // One after the other: the first sync is ~100 calls and Zoho allows ~100 per minute.
  let error: string | undefined;
  for (const t of tasks) {
    try {
      await t();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  S.error = error;
  if (!error) S.syncedAt = new Date().toISOString();
}

const distinct = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b));

export async function GET(request: Request) {
  if (!zohoConfigured()) {
    const empty: PipelineResponse = { source: "mock", syncedAt: new Date().toISOString(), leads: [], quotes: [], typeOptions: [], sectorOptions: [] };
    return Response.json(empty);
  }
  const force = new URL(request.url).searchParams.has("refresh");
  S.running ??= sync(force).finally(() => (S.running = null));
  await S.running;

  const leads = [...S.leads.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!leads.length && S.error) return Response.json({ source: "zoho", error: S.error, leads: [], quotes: [] }, { status: 502 });
  const body: PipelineResponse = {
    source: "zoho",
    syncedAt: S.syncedAt || new Date().toISOString(),
    leads,
    quotes: [...S.quotes].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    typeOptions: distinct(leads.map((l) => l.type)),
    sectorOptions: distinct(leads.map((l) => l.sector)),
    orgId: ZOHO_ORG_ID,
    error: S.error,
  };
  return Response.json(body);
}
