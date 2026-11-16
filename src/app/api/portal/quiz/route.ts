import { participantQuiz, quizStart, quizSubmit, saveParticipantEmail } from "@/lib/portalTrainings";
import { certificatesLater } from "@/lib/portalCertLater";
import { withBump } from "@/lib/changes";

export const dynamic = "force-dynamic";

/*
 * The participant's quiz (owner, 13 Nov), from their private page (TH number + token), no login:
 *  GET ?n=<Training Number>&th=<TH001>&p=<token>  — the quiz (answers only once revealed), its state, their result, the leaderboard
 *  POST { n, th, p, action: "start" }             — opening it starts their clock
 *  POST { n, th, p, action: "submit", answers }   — the try in progress: scored, ranked; a fail may try again (owner, 14 Nov);
 *                                                   a pass emails their certificate at once (owner, 16 Nov)
 *  POST { n, th, p, action: "email", email }      — where their certificate goes (passed people with no email on file)
 * Open only while the coordinator's session runs, and only to people marked present.
 */
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function GET(request: Request) {
  const s = new URL(request.url).searchParams;
  try {
    const r = await participantQuiz(s.get("n"), s.get("th"), s.get("p"));
    return r ? json(r) : json({ error: "There's no quiz for this training." }, 404);
  } catch (e) {
    console.error("[portal/quiz]", e);
    return json({ error: "Something went wrong on our side. Try again in a minute." }, 500);
  }
}

async function handlePOST(request: Request) {
  try {
    const b = (await request.json().catch(() => null)) as { n?: unknown; th?: unknown; p?: unknown; action?: string; answers?: unknown; email?: unknown } | null;
    const r = b?.action === "start" ? await quizStart(b.n, b.th, b.p)
      : b?.action === "submit" ? await quizSubmit(b.n, b.th, b.p, b.answers)
      : b?.action === "email" ? await saveParticipantEmail(b.n, b.th, b.p, b.email)
      : { error: "Unknown action", status: 400 };
    // Owner, 16 Nov: the certificate goes the moment they pass (or when a passed person gives their email).
    const th = String(b?.th ?? "").toUpperCase();
    if (b?.action === "email" && "sendNow" in r && r.sendNow) certificatesLater(r.trainingId, "participant", th);
    if ("error" in r) return json({ error: r.error }, r.status);
    if ("passedIn" in r) {
      const { passedIn, ...rest } = r;
      if (passedIn) certificatesLater(passedIn, "quiz", th);
      return json(rest);
    }
    return json(r);
  } catch (e) {
    console.error("[portal/quiz]", e);
    return json({ error: "Something went wrong on our side. Try again in a minute." }, 500);
  }
}

// Live refresh (owner, 13 Nov): a result here shows on our Trainings page within seconds.
export const POST = withBump(["work"], handlePOST);
