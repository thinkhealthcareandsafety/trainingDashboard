import { declineByLink, declineInfo } from "@/lib/portalTrainings";
import { setQuoteStatus } from "@/lib/quotations";

export const dynamic = "force-dynamic";

/*
 * Decline straight from the login email (owner, 12 Nov), no sign-in: the link carries the training's decline key.
 *  GET ?n=<Training Number>&k=<key> — what the page shows (opening it changes nothing: email scanners open links)
 *  POST { n, k, reason? }           — declines it (Zoho marks the quote Declined), the same as the portal's Decline
 */
export async function GET(request: Request) {
  const s = new URL(request.url).searchParams;
  try {
    const info = await declineInfo(s.get("n"), s.get("k"));
    return info ? Response.json(info) : Response.json({ error: "This link doesn't work any more. Write to learn@thinkhealth.in." }, { status: 404 });
  } catch (e) {
    console.error("[portal/decline]", e);
    return Response.json({ error: "Something went wrong on our side. Try again in a minute." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const b = (await request.json().catch(() => null)) as { n?: unknown; k?: unknown; reason?: unknown } | null;
    const r = await declineByLink(b?.n, b?.k, b?.reason, (id) => setQuoteStatus(id, "declined"));
    return "error" in r ? Response.json({ error: r.error }, { status: r.status }) : Response.json({ ok: true });
  } catch (e) {
    console.error("[portal/decline]", e);
    return Response.json({ error: "Something went wrong on our side. Try again in a minute." }, { status: 500 });
  }
}
