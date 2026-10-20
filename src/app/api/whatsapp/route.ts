import { signedInMember, unauthorized } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { type Kind, nextTraining, whatsappValues } from "@/lib/trainingReminders";
import { WA_PEOPLE, WA_VARS, type WaKind, type WaPicked, type WaTemplate, fits, saveWa, sendWaTemplate, waNumber, waPublic, waStored, waTemplates } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/*
 * Admin only — the WhatsApp popup (Calendar): GET the settings (never the key) + the Anantya templates to pick from;
 * POST { apiKey?, numbers?, templates? } saves (a new key is tried on Anantya first); PUT { kind, to } sends a test
 * message to one number with the next training's details (recorded nowhere).
 */

async function admin(request: Request) {
  const me = await signedInMember(request);
  if (!me) return { error: unauthorized() };
  if (!isAdmin(me)) return { error: Response.json({ error: "Admin only" }, { status: 403 }) };
  return { me };
}

const listTemplates = async (apiKey?: string): Promise<{ templates?: WaTemplate[]; templatesError?: string }> => {
  try {
    return { templates: await waTemplates(apiKey) };
  } catch (e) {
    return { templatesError: e instanceof Error ? e.message : String(e) };
  }
};

export async function GET(request: Request) {
  const { error } = await admin(request);
  if (error) return error;
  const stored = await waStored();
  return Response.json({ config: waPublic(stored), people: WA_PEOPLE, vars: WA_VARS, ...(stored?.apiKey ? await listTemplates() : {}) });
}

export async function POST(request: Request) {
  const { me, error } = await admin(request);
  if (error) return error;
  const body = (await request.json().catch(() => ({}))) as { apiKey?: string; numbers?: Record<string, string>; templates?: Partial<Record<WaKind, { id: number; name: string } | null>> };

  const apiKey = body.apiKey?.trim() || undefined;
  if (apiKey) {
    const check = await listTemplates(apiKey);
    if (check.templatesError) return Response.json({ error: `That key didn't work — ${check.templatesError}` }, { status: 400 });
  }
  let numbers: Record<string, string> | undefined;
  if (body.numbers) {
    numbers = {};
    for (const p of WA_PEOPLE) {
      const n = waNumber(body.numbers[p.key] ?? "");
      if (n === null) return Response.json({ error: `${p.name}'s number doesn't look right — 10 digits, or the country code and number` }, { status: 400 });
      if (n) numbers[p.key] = n;
    }
  }
  let templates: Partial<Record<WaKind, WaPicked>> | undefined;
  if (body.templates) {
    // How many {{n}} each picked template takes, from Anantya's own list — one that doesn't take ours never sends.
    const list = (await listTemplates(apiKey)).templates ?? [];
    templates = {};
    for (const k of ["reminder", "postponed"] as const) {
      const t = body.templates[k];
      if (t && Number.isFinite(Number(t.id))) templates[k] = { id: Number(t.id), name: String(t.name ?? ""), vars: list.find((x) => x.id === Number(t.id))?.vars };
    }
  }
  const config = await saveWa({ apiKey, numbers, templates }, me.name);
  return Response.json({ config, ...(config.hasKey ? await listTemplates() : {}) });
}

export async function PUT(request: Request) {
  const { error } = await admin(request);
  if (error) return error;
  const body = (await request.json().catch(() => ({}))) as { kind?: string; to?: string };
  const kind: Kind = body.kind === "postponed" ? "postponed" : "reminder";
  const to = waNumber(body.to ?? "");
  if (!to) return Response.json({ error: "One WhatsApp number to test with, please" }, { status: 400 });
  const wa = waPublic(await waStored());
  const template = wa.templates[kind];
  if (!wa.hasKey || !template) return Response.json({ error: "Save the API key and pick the template first" }, { status: 400 });
  if (!fits(wa.templates, kind)) return Response.json({ error: `That template doesn't take ${WA_VARS[kind]} values — pick the new one and Save first` }, { status: 400 });
  // "Hi Sumit" when the test goes to someone on the team, else "Hi there".
  const first = WA_PEOPLE.find((p) => wa.numbers[p.key] === to)?.name.split(" ")[0] ?? "there";
  const next = await nextTraining().catch(() => null);
  // No training ahead: made-up values in the right places (it says TEST, so nobody mistakes it).
  const values = next
    ? whatsappValues(next.card, next.info, kind, first)
    : kind === "reminder"
      ? [first, "TEST Customer", "in 3 days", "Mon, 26 Oct 2026", "TEST Training", "TEST Location", "20", "Sumit A Shah", "TEST Person", "00000 00000", "test@example.com"]
      : [first, "TEST Customer", "Thu, 22 Oct 2026", "Mon, 26 Oct 2026", "TEST Training", "TEST Location", "20", "Sumit A Shah", "TEST Person", "00000 00000", "test@example.com"];
  try {
    const messageId = await sendWaTemplate(template.id, { number: to, name: "Test" }, values);
    return Response.json({ ok: true, template: template.name, about: next ? next.card.name : "made-up values", messageId });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
