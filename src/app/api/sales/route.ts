import { signedInMember, unauthorized } from "@/lib/auth";
import { boardsFor } from "@/lib/roles";
import { zohoConfigured } from "@/lib/zoho";
import { type SalesResponse, salesData, salesDocDetail } from "@/lib/salesSync";
import { syncWindowStart, ymd } from "@/lib/dates";

export const dynamic = "force-dynamic";

/*
 * The Sales board (salesSync.ts), for whoever has it (roles.ts):
 *   GET            — every non-training quotation, PI, invoice and payment since the window start, from the copy
 *   GET ?doc=<kind>:<id>  — one document's lines, totals and ship-to, for the card's popup (Zoho once, then kept)
 */
export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!boardsFor(me).includes("sales")) return Response.json({ error: "The Sales board isn't on your boards" }, { status: 403 });
  const empty: SalesResponse = { syncedAt: "", windowStart: ymd(syncWindowStart(new Date())), quotes: [], pis: [], invoices: [], payments: [] };
  if (!zohoConfigured()) return Response.json(empty);
  const doc = new URL(request.url).searchParams.get("doc");
  try {
    if (doc) {
      const d = await salesDocDetail(doc);
      return d ? Response.json(d) : Response.json({ error: "Unknown document" }, { status: 404 });
    }
    return Response.json(await salesData());
  } catch (e) {
    return Response.json({ ...empty, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
