import { portalToken, portalUser } from "@/lib/portalAuth";
import { readContent, trainingsFor } from "@/lib/portalServer";

export const dynamic = "force-dynamic";

// The portal's dashboard (docs/TRAINING_MANAGER_PLAN.md step 4): the signed-in coordinator, their trainings, and the
// programmes and social links staff keep on Templates → Portal content. 401 when not signed in.
export async function GET(request: Request) {
  try {
    const me = await portalUser(portalToken(request));
    if (!me) return Response.json({ error: "Not signed in" }, { status: 401 });
    const [trainings, content] = await Promise.all([trainingsFor(me.email), readContent()]);
    return Response.json({ me, trainings, content: { programmes: content.programmes, social: content.social } });
  } catch (e) {
    console.error("[portal/home]", e);
    return Response.json({ error: "Something went wrong on our side. Try again in a minute." }, { status: 500 });
  }
}
