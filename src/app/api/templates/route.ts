import { signedInMember, unauthorized } from "@/lib/auth";
import { canQuote } from "@/lib/roles";
import { canEditTemplate, listTemplates, saveTemplate, templateOverrides } from "@/lib/templateStore";

export const dynamic = "force-dynamic";

// Editable email templates (src/lib/templateStore.ts). GET: every template with its wording (Templates page);
// GET ?overrides=1: only the quotation emails' saved wording (the email step). PUT { key, subject, body } saves;
// PUT { key, reset: true } goes back to the built-in text. Those who quote; the AED and Fulfillment emails, Admin only.
const refused = () => Response.json({ error: "Only those who send quotations use the templates" }, { status: 403 });

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!canQuote(me)) return refused();
  try {
    if (new URL(request.url).searchParams.has("overrides")) return Response.json({ overrides: await templateOverrides() });
    const templates = (await listTemplates()).map((t) => ({ ...t, canEdit: canEditTemplate(me, t) }));
    return Response.json({ templates });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't read the templates" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!canQuote(me)) return refused();
  const b = (await request.json().catch(() => null)) as { key?: unknown; subject?: unknown; body?: unknown; reset?: unknown } | null;
  if (!b || typeof b.key !== "string") return Response.json({ error: "Which template?" }, { status: 400 });
  try {
    const r = await saveTemplate(me, b.key, { subject: b.subject, body: b.body, reset: b.reset === true });
    return "error" in r ? Response.json({ error: r.error }, { status: r.status }) : Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't save the template" }, { status: 500 });
  }
}
