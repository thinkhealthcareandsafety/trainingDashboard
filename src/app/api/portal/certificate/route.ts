import { participantCertificate } from "@/lib/portalTrainings";
import { certificatePdf } from "@/lib/portalCertSend";
import { certFileName } from "@/lib/portalCertRules";

export const dynamic = "force-dynamic";

/*
 * A participant's certificate (owner, 14 Nov), from their private page: GET ?n=<Training Number>&th=<TH001>&p=<token>.
 * Only once they've passed the quiz and the coordinator has ended the training (or we sent the certificates).
 */
export async function GET(request: Request) {
  const s = new URL(request.url).searchParams;
  try {
    const c = await participantCertificate(s.get("n"), s.get("th"), s.get("p"));
    if (!c) return Response.json({ error: "Your certificate comes once you pass the quiz and your coordinator ends the training." }, { status: 404 });
    const pdf = await certificatePdf(c);
    return new Response(Buffer.from(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${certFileName(c.name).replace(/"/g, "")}"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    console.error("[portal/certificate]", e);
    return Response.json({ error: "We couldn't make your certificate just now. Try again in a minute." }, { status: 500 });
  }
}
