import { join, joinInfo, participantPage } from "@/lib/portalTrainings";
import { withBump } from "@/lib/changes";
import { readContent } from "@/lib/portalServer";

export const dynamic = "force-dynamic";

/*
 * Participants (docs/TRAINING_MANAGER_PLAN.md step 7), no login:
 *  GET ?n=<Training Number>&k=<join key>              — the invitation (training, customer, coordinator)
 *  GET ?n=<Training Number>&th=<TH001>&p=<their token> — their own page, with the programmes and social links
 *  POST { n, k, name, phone, email? }                  — join; the same phone twice gets the existing page back
 * The join key comes from the coordinator's QR code; the token only from joining, so nobody can open someone else's page.
 */
export async function GET(request: Request) {
  const s = new URL(request.url).searchParams;
  try {
    if (s.get("th")) {
      const page = await participantPage(s.get("n"), s.get("th"), s.get("p"));
      if (!page) return Response.json({ error: "We couldn't find that page. Use the link from when you joined." }, { status: 404 });
      const content = await readContent();
      return Response.json({ page, content: { programmes: content.programmes, social: content.social } });
    }
    const info = await joinInfo(s.get("n"), s.get("k"));
    return info ? Response.json(info) : Response.json({ error: "This link has changed. Ask your training coordinator for the new one." }, { status: 404 });
  } catch (e) {
    console.error("[portal/join]", e);
    return Response.json({ error: "Something went wrong on our side. Try again in a minute." }, { status: 500 });
  }
}

async function handlePOST(request: Request) {
  try {
    const b = (await request.json().catch(() => null)) as { n?: unknown; k?: unknown; name?: unknown; phone?: unknown; email?: unknown } | null;
    const r = await join(b?.n, b?.k, { name: b?.name, phone: b?.phone, email: b?.email });
    return "error" in r ? Response.json({ error: r.error }, { status: r.status }) : Response.json(r);
  } catch (e) {
    console.error("[portal/join]", e);
    return Response.json({ error: "Something went wrong on our side. Try again in a minute." }, { status: 500 });
  }
}

// Live refresh (owner, 13 Nov): a change here shows in every open tab within seconds.
export const POST = withBump(["work"], handlePOST);
