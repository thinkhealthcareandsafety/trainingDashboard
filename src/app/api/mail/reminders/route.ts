import { signedInMember, unauthorized } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { REMINDER_FROM, buildReminderMail, deliver, fileReminderMail, reminderFor } from "@/lib/trainingReminders";
import { folderNames } from "@/lib/zohoMail";

export const dynamic = "force-dynamic";

/*
 * Admin only: see a training's reminder email (GET ?card=&kind=reminder|postponed) or send a [TEST] copy of it to one
 * address (POST { card, kind, testTo }) — from learn@, filed in "Training Reminders", recorded nowhere.
 */

const kindOf = (v: unknown) => (v === "postponed" ? "postponed" : "reminder") as "reminder" | "postponed";

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!isAdmin(me)) return Response.json({ error: "Admin only" }, { status: 403 });
  const url = new URL(request.url);
  // ?folders=1: learn@'s folder names (to check the "Training Reminders" folder is there).
  if (url.searchParams.get("folders")) return Response.json({ folders: await folderNames(REMINDER_FROM).catch((e) => [String(e)]) });
  const found = await reminderFor(url.searchParams.get("card") ?? "");
  if (!found) return Response.json({ error: "That training (with a date) isn't on the boards" }, { status: 404 });
  const mail = buildReminderMail(found.card, found.info, kindOf(url.searchParams.get("kind")));
  return Response.json({ to: mail.to, subject: mail.subject, html: mail.html });
}

// PUT: file any reminder emails still in learn@'s Sent folder now (Admin) — the runs do it on their own.
export async function PUT(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!isAdmin(me)) return Response.json({ error: "Admin only" }, { status: 403 });
  try {
    return Response.json({ ok: true, filed: await fileReminderMail() });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!isAdmin(me)) return Response.json({ error: "Admin only" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { card?: string; kind?: string; testTo?: string };
  const testTo = body.testTo?.trim() ?? "";
  if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(testTo)) return Response.json({ error: "One test address, please" }, { status: 400 });
  const found = await reminderFor(body.card ?? "");
  if (!found) return Response.json({ error: "That training (with a date) isn't on the boards" }, { status: 404 });
  const mail = buildReminderMail(found.card, found.info, kindOf(body.kind));
  try {
    const messageId = await deliver(mail, "[TEST] ", testTo);
    return Response.json({ ok: true, subject: `[TEST] ${mail.subject}`, wouldGoTo: mail.to, messageId });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
