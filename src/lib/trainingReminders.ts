import "server-only";
import { db } from "./db";
import { fileSentMail, latestMail, sendMail } from "./zohoMail";
import { boardsNow, recordServerEvent } from "./fulfilServer";
import { getSnapshot } from "./zohoSync";
import { type CardView, isCustomerCard, peopleOf } from "./pipeline";
import { type DatesInfo, datesInfo, istDay, reminderDays, reminderKey, reminderRecipients, whatsappKey } from "./reminderPlan";
import { sendWaTemplate, waPublic, waStored } from "./whatsapp";
import type { CardEvent } from "./types";

/*
 * Training reminders (owner, 19 Oct; the plan is in reminderPlan.ts): emailed from learn@ to whoever gives the training,
 * one email for all, filed in learn@'s "Training Reminders" folder, and recorded on the card (never twice). Runs with
 * every sync, once a day from Vercel's cron (Sundays too), and right after a training date is set — so a training
 * scheduled for the day after tomorrow, or postponed, gets its email within moments.
 */

export const REMINDER_FROM = "learn@thinkhealth.in";
export const REMINDER_FOLDER = "Training Reminders"; // as Shikha made it, under Sent (19 Oct)
/** Postponements from before this went live get no email (their trainers were told by hand). */
const POSTPONED_SINCE = "2026-10-19T10:00:00.000Z";
const LOCK = "training_reminders_lock";
const LOCK_MS = 120_000;

export type Kind = "reminder" | "postponed";
export type ReminderMail = { to: { name: string; email: string }[]; subject: string; html: string };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
/** "Saturday, 25 October 2026" / "Thursday, 22 October 2026 at 11:00" (AedSmartx) / several days listed. */
function fmtDates(dates: string[], long = true): string {
  const one = (v: string) => {
    const d = new Date(`${v.slice(0, 10)}T00:00:00Z`);
    const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-IN", { ...o, timeZone: "UTC" });
    // "Saturday, 17 October 2026" / "Sat, 17 Oct 2026"
    const day = `${part({ weekday: long ? "long" : "short" })}, ${part({ day: "numeric" })} ${part({ month: long ? "long" : "short" })} ${part({ year: "numeric" })}`;
    return v.length > 10 ? `${day} at ${v.slice(11, 16)}` : day;
  };
  return dates.length === 1 ? one(dates[0]) : dates.map((d) => one(d)).join(" · ");
}
const names = (list: { name: string }[]) => {
  const first = list.map((x) => x.name.split(" ")[0]);
  return first.length > 1 ? `${first.slice(0, -1).join(", ")} and ${first.at(-1)}` : first[0] ?? "team";
};

/** The owner's fields (19 Oct; the contact number 20 Oct), in order — the email's table; WhatsApp lays them out its own way. */
function reminderRows(card: CardView, info: DatesInfo, long = true): [string, string][] {
  const aed = card.id.startsWith("aed:");
  const people = peopleOf(card);
  const email = aed ? card.outreach?.email ?? card.concernedEmail : card.concernedEmail;
  // AedSmartx: the number Priyanka last called, else the first one she has.
  const phone = aed ? card.outreach?.lastCall?.to ?? card.outreach?.phones[0]?.value : card.concernedPhone;
  // What's taught, as on the PI / quote; several kinds each with their head-count. AedSmartx invoices list the AED itself.
  const kinds = card.training.filter((t) => t.name.trim());
  const what = aed ? "AED training" : kinds.length > 1 ? kinds.map((t) => card.schedule?.people === undefined ? `${t.name} (${t.qty})` : t.name).join(", ") : kinds[0]?.name ?? "—";
  return [
    ["Customer name", card.name],
    ["Type of Training", what],
    ["Location / Alias", aed ? card.aliases[0] ?? card.name : card.certLocation || card.name],
    ["Concerned Person's name", card.concernedName || "—"],
    ["Concerned Person's Email", email || "—"],
    ["Concerned Person's Contact Number", phone || "—"],
    ["Training Date", fmtDates(info.dates, long)],
    ["Training Persons", (aed ? ["Priyanka"] : card.schedule?.trainers ?? []).join(", ") || "—"],
    ["Number of People Expected At Training", aed ? "—" : people ? String(people) : "—"],
  ];
}

/** "today" / "tomorrow" / "in 3 days" — from today (India) to the first training day. */
function howSoon(first: string): string {
  const days = Math.round((Date.parse(first.slice(0, 10)) - Date.parse(istDay())) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
}

/**
 * The WhatsApp template's {{1}}…{{11}} (the "_v4" templates in the popup, 20 Oct) — the email's fields, laid out for a
 * phone: whom it's to, customer, then "in 3 days" + date (reminder) or from + to (postponed), type of training,
 * location, people, trainers, concerned person, their number, their email.
 */
export function whatsappValues(card: CardView, info: DatesInfo, kind: Kind, first: string): string[] {
  const [customer, what, location, contact, email, phone, date, trainers, people] = reminderRows(card, info, false).map(([, x]) => x);
  const when = kind === "reminder" ? [howSoon(info.dates[0]), date] : [info.before?.length ? fmtDates(info.before, false) : "—", date];
  return [first, customer, ...when, what, location, people, trainers, contact, phone, email];
}

/** The email for one training (owner's fields, 19 Oct): who it's for, where, the concerned person, when, who trains, how many. */
export function buildReminderMail(card: CardView, info: DatesInfo, kind: Kind): ReminderMail {
  const to = reminderRecipients(card.schedule?.trainers ?? [], card.id.startsWith("aed:"));
  const when = fmtDates(info.dates);
  const short = fmtDates(info.dates, false);
  const rows = reminderRows(card, info);
  const subject = kind === "postponed"
    ? `Training Postponed to ${short} — ${card.name}`
    : `Training Reminder: ${short} — ${card.name}`;
  const intro = kind === "postponed"
    ? `The training for <b>${esc(card.name)}</b> has been <b>postponed${info.before?.length ? ` from ${esc(fmtDates(info.before))}` : ""} to ${esc(when)}</b>. We are sorry for the inconvenience.`
    : `This is a reminder that the training for <b>${esc(card.name)}</b> is on <b>${esc(when)}</b>.`;
  const table = rows.map(([k, v]) => `<tr><td style="padding:6px 16px 6px 0;color:#555;white-space:nowrap;vertical-align:top">${esc(k)}:</td><td style="padding:6px 0;color:#111;font-weight:600">${esc(v)}</td></tr>`).join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111">
<p>Dear ${esc(names(to))},</p>
<p>${intro}</p>
<table style="border-collapse:collapse;margin:8px 0 16px">${table}</table>
<p style="color:#555">— ThinkHealth Training Dashboard</p>
</div>`;
  return { to, subject, html };
}

/** The live trainings with a date still ahead, each with its own entries (oldest first). */
async function upcoming(): Promise<{ card: CardView; info: DatesInfo; events: CardEvent[] }[]> {
  const snap = await getSnapshot();
  if (!snap) return [];
  const { board, aedBoard, events } = await boardsNow(snap, true);
  const today = istDay();
  const byCard = new Map<string, CardEvent[]>();
  for (const e of events) for (const id of e.cardIds) byCard.set(id, [...(byCard.get(id) ?? []), e]);
  const cards = [
    ...[...board.cards.values()].filter((c) => !c.mergedInto && !c.deleted && !c.lost && !isCustomerCard(c.kind)),
    ...(aedBoard ? [...aedBoard.cards.values()].filter((c) => !c.notRequired) : []),
  ].filter((c) => c.schedule && c.schedule.status !== "tbd" && !c.schedule.completed && c.schedule.dates.length);
  return cards.flatMap((card) => {
    const own = [...new Map(card.historyIds.flatMap((id) => byCard.get(id) ?? []).map((e) => [e.id, e])).values()].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    const info = datesInfo(own);
    return info && info.dates[0].slice(0, 10) > today ? [{ card, info, events: own }] : [];
  });
}

/** One card by id (Training or AedSmartx board) with its dates — for the Admin test / preview. */
export async function reminderFor(cardId: string): Promise<{ card: CardView; info: DatesInfo } | null> {
  const snap = await getSnapshot();
  if (!snap) return null;
  const { board, aedBoard, events } = await boardsNow(snap, true);
  const card = (cardId.startsWith("aed:") ? aedBoard : board)?.cards.get(cardId);
  if (!card) return null;
  const own = events.filter((e) => e.cardIds.some((id) => card.historyIds.includes(id))).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const info = datesInfo(own);
  return info ? { card, info } : null;
}

/**
 * Sends one email (to everyone at once) and files it in the folder. Right after sending Zoho may refuse the move (still
 * saving it), so it tries again a moment later; anything still in Sent is filed by the next run (fileReminderMail).
 */
export async function deliver(mail: ReminderMail, subjectPrefix = "", to?: string): Promise<string | undefined> {
  const sent = await sendMail(REMINDER_FROM, { to: to ?? mail.to.map((x) => x.email).join(","), subject: `${subjectPrefix}${mail.subject}`, html: mail.html });
  if (sent.messageId) {
    const file = () => fileSentMail(REMINDER_FROM, [sent.messageId!], REMINDER_FOLDER);
    await file().catch(() => new Promise((r) => setTimeout(r, 4000)).then(file)).catch((e) => console.warn(`[reminders] couldn't file it yet: ${e instanceof Error ? e.message : e}`));
  }
  return sent.messageId;
}

const OURS = /^(\[TEST\]\s*)?Training (Reminder:|Postponed to )/i;
/** Moves reminder emails still in learn@'s Sent folder into "Training Reminders". Returns how many. */
export async function fileReminderMail(): Promise<number> {
  const stray = (await latestMail(REMINDER_FROM, "sent", 50)).filter((m) => OURS.test(m.subject));
  if (stray.length) await fileSentMail(REMINDER_FROM, stray.map((m) => m.messageId), REMINDER_FOLDER);
  return stray.length;
}

async function lock(): Promise<string | null> {
  const owner = Math.random().toString(36).slice(2);
  const now = Date.now();
  try {
    const r = await (await db()).collection<{ _id: string; until?: number; owner?: string }>("kv").findOneAndUpdate(
      { _id: LOCK, $or: [{ until: { $lt: now } }, { until: { $exists: false } }] },
      { $set: { until: now + LOCK_MS, owner } },
      { upsert: true, returnDocument: "after" },
    );
    return r?.owner === owner ? owner : null;
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return null;
    throw e;
  }
}

/** The soonest training still ahead (for the WhatsApp popup's test message), or none. */
export async function nextTraining(): Promise<{ card: CardView; info: DatesInfo } | null> {
  const list = await upcoming();
  return list.sort((a, b) => a.info.dates[0].localeCompare(b.info.dates[0]))[0] ?? null;
}

export type ReminderRun = { emails: number; whatsapp: number; error?: string; whatsappError?: string };

/**
 * Sends what's due today: a postponement email (once per postponement — it stands in for that day's reminder), else
 * the latest reminder day that has come (a missed run catches up with one email, never several). WhatsApp follows the
 * same plan, one message per person, recorded per person — a failed number is tried again next run without repeating
 * the others. An email or a WhatsApp that fails never stops the rest of the run.
 */
export async function runTrainingReminders(): Promise<ReminderRun> {
  const run: ReminderRun = { emails: 0, whatsapp: 0 };
  // Only the live site sends on its own: a local server (same database, same mailbox) never does.
  if (process.env.VERCEL_ENV !== "production") return run;
  const owner = await lock();
  if (!owner) return run;
  const errors: string[] = [];
  const waErrors: string[] = [];
  try {
    await fileReminderMail().catch((e) => console.warn(`[reminders] filing earlier emails failed: ${e instanceof Error ? e.message : e}`));
    const wa = waPublic(await waStored().catch(() => null));
    const today = istDay();
    for (const { card, info, events } of await upcoming()) {
      const mailTo = reminderRecipients(card.schedule?.trainers ?? [], card.id.startsWith("aed:"));
      if (!mailTo.length) continue; // external trainers only — no email or number known
      const done = new Set(events.filter((e) => e.kind === "training_reminder").map((e) => e.value));
      const days = reminderDays(info.dates[0].slice(0, 10), istDay(info.at));
      const due = days.filter((d) => d <= today).at(-1);
      const postponedNow = info.postponed && info.at >= POSTPONED_SINCE;
      const record = (kind: CardEvent["kind"], value: string, subject: string, messageId?: string, to = mailTo) =>
        recordServerEvent({ cardIds: [card.id], kind, value, trainers: to.map((x) => x.name), subject, messageId, at: new Date().toISOString(), by: "Training reminders" });

      try {
        if (postponedNow && !events.some((e) => e.kind === "training_postponed_mail" && e.value === info.event.id)) {
          const mail = buildReminderMail(card, info, "postponed");
          const id = await deliver(mail);
          await record("training_postponed_mail", info.event.id, mail.subject, id);
          if (due) await record("training_reminder", reminderKey(info.dates, due), mail.subject, id); // today's reminder is this email
          run.emails++;
        } else if (due && !done.has(reminderKey(info.dates, due))) {
          const mail = buildReminderMail(card, info, "reminder");
          const id = await deliver(mail);
          await record("training_reminder", reminderKey(info.dates, due), mail.subject, id);
          run.emails++;
        }
      } catch (e) {
        errors.push(`${card.name}: ${e instanceof Error ? e.message : e}`);
      }

      if (!wa.ready) continue;
      const waDone = new Set(events.filter((e) => e.kind === "training_whatsapp").map((e) => e.value));
      for (const p of mailTo) {
        const number = wa.numbers[p.key];
        if (!number) continue; // no WhatsApp number for them yet
        const postponedKey = whatsappKey("postponed", info.event.id, p.key);
        const dueKey = due ? whatsappKey("reminder", reminderKey(info.dates, due), p.key) : null;
        const kind: Kind | null = postponedNow && !waDone.has(postponedKey) ? "postponed" : dueKey && !waDone.has(dueKey) ? "reminder" : null;
        if (!kind) continue;
        const template = wa.templates[kind]!;
        try {
          const id = await sendWaTemplate(template.id, { number, name: p.name }, whatsappValues(card, info, kind, p.name.split(" ")[0]));
          if (kind === "postponed") await record("training_whatsapp", postponedKey, template.name, id, [p]);
          if (dueKey) await record("training_whatsapp", dueKey, template.name, id, [p]); // the postponement stands in for today's reminder
          run.whatsapp++;
        } catch (e) {
          waErrors.push(`${card.name} → ${p.name.split(" ")[0]}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  } finally {
    await (await db()).collection<{ _id: string; owner?: string; until?: number }>("kv").updateOne({ _id: LOCK, owner }, { $set: { until: 0 } });
  }
  if (errors.length) run.error = errors.join(" · ");
  if (waErrors.length) run.whatsappError = waErrors.join(" · ");
  if (run.error || run.whatsappError) console.error(`[reminders] ${[run.error, run.whatsappError].filter(Boolean).join(" · ")}`);
  return run;
}
