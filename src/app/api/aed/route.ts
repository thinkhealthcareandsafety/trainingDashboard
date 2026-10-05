import type { AedInvoice, AedResponse } from "@/lib/types";
import { ymd } from "@/lib/dates";
import { fetchAedInvoices, zohoConfigured } from "@/lib/zoho";

export const dynamic = "force-dynamic";

// AedSmartx board: invoices with an "All AEDs" item from 1 September 2026 onwards (the team’s chosen start).
// Synced only while someone has the AED board open (it polls this route), at most every 5 minutes.
const AED_MS = 5 * 60_000;
const AED_SINCE = new Date(2026, 8, 1); // 1 Sept 2026

type State = { invoices: AedInvoice[]; at: number; syncedAt: string; running: Promise<void> | null; error?: string };
const S: State = ((globalThis as unknown as { __thAed?: State }).__thAed ??= { invoices: [], at: 0, syncedAt: "", running: null });

async function sync() {
  try {
    // Replaced only when the fetch succeeds, so a failed sync never looks like deleted invoices.
    S.invoices = await fetchAedInvoices(AED_SINCE);
    S.at = Date.now();
    S.syncedAt = new Date().toISOString();
    S.error = undefined;
  } catch (e) {
    S.error = e instanceof Error ? e.message : String(e);
  }
}

export async function GET(request: Request) {
  const windowStart = ymd(AED_SINCE);
  if (!zohoConfigured()) return Response.json({ syncedAt: new Date().toISOString(), windowStart, invoices: [] } satisfies AedResponse);
  const force = new URL(request.url).searchParams.has("refresh");
  if (force || Date.now() - S.at > AED_MS) S.running ??= sync().finally(() => (S.running = null));
  if (S.running) await S.running;
  const invoices = [...S.invoices].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const body: AedResponse = { syncedAt: S.syncedAt || new Date().toISOString(), windowStart, invoices, error: S.error };
  return Response.json(body, { status: !invoices.length && S.error ? 502 : 200 });
}
