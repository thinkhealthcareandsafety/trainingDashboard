import { signedInMember, unauthorized } from "@/lib/auth";
import { withBump } from "@/lib/changes";
import { canQuote } from "@/lib/roles";
import { readContent, saveContent, savePhoto } from "@/lib/portalServer";

export const dynamic = "force-dynamic";

// Templates → Portal content (docs/TRAINING_MANAGER_PLAN.md step 4): what the Training Manager portal shows besides the
// trainings. GET: the content. PUT { programmes, social }: save it (the portal shows it straight away).
// POST { photo: dataUrl }: keep a programme photo, made small in the browser → { id }. Those who send quotations.
const refused = () => Response.json({ error: "Only those who send quotations change the portal" }, { status: 403 });

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!canQuote(me)) return refused();
  try {
    return Response.json({ content: await readContent() });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't read the portal content" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!canQuote(me)) return refused();
  try {
    const r = await saveContent(await request.json().catch(() => null), me.name);
    return "error" in r ? Response.json({ error: r.error }, { status: 400 }) : Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't save the portal content" }, { status: 500 });
  }
}

async function handlePOST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!canQuote(me)) return refused();
  try {
    const b = (await request.json().catch(() => null)) as { photo?: unknown } | null;
    const r = await savePhoto(b?.photo);
    return "error" in r ? Response.json({ error: r.error }, { status: 400 }) : Response.json(r);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't keep the photo" }, { status: 500 });
  }
}

// Live refresh (owner, 13 Nov): a change here shows in every open tab within seconds.
export const POST = withBump(["work"], handlePOST);
