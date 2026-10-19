import "server-only";
import { db } from "./db";
import { fileSentMail, latestMail, sendMail } from "./zohoMail";
import { boardsNow, recordServerEvent } from "./fulfilServer";
import { getSnapshot } from "./zohoSync";
import { type CardView, isCustomerCard } from "./pipeline";
import { type DatesInfo, datesInfo, istDay, reminderDays, reminderKey, reminderRecipients } from "./reminderPlan";
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

type Kind = "reminder" | "postponed";
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

/** The email for one training (owner's fields, 19 Oct): who it's for, where, the concerned person, when, who trains, how many. */
export function buildReminderMail(card: CardView, info: DatesInfo, kind: Kind): ReminderMail {
  const aed = card.id.startsWith("aed:");
  const s = card.schedule;
  const to = reminderRecipients(s?.trainers ?? [], aed);
  const when = fmtDates(info.dates);
  const short = fmtDates(info.dates, false);
  const people = card.training.reduce((n, t) => n + (t.qty || 0), 0);
  const email = aed ? card.outreach?.email ?? card.concernedEmail : card.concernedEmail;
  const rows: [string, string][] = [
    ["Customer name", card.name],
    ["Location / Alias", aed ? card.aliases[0] ?? card.name : card.certLocation || card.name],
    ["Concerned Person's name", card.concernedName || "—"],
    ["Concerned Person's Email", email || "—"],
    ["Training Date", when],
    ["Training Persons", (aed ? ["Priyanka"] : s?.trainers ?? []).join(", ") || "—"],
    ["Number of People Expected At Training", aed ? "—" : people ? String(people) : "—"],
  ];
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

/**
 * Sends what's due today: a postponement email (once per postponement — it stands in for that day's reminder), else
 * the latest reminder day that has come (a missed run catches up with one email, never several). Returns how many went.
 */
export async function runTrainingReminders(): Promise<number> {
  // Only the live site sends on its own: a local server (same database, same mailbox) never does.
  if (process.env.VERCEL_ENV !== "production") return 0;
  const owner = await lock();
  if (!owner) return 0;
  let sent = 0;
  try {
    await fileReminderMail().catch((e) => console.warn(`[reminders] filing earlier emails failed: ${e instanceof Error ? e.message : e}`));
    const today = istDay();
    for (const { card, info, events } of await upcoming()) {
      const mailTo = reminderRecipients(card.schedule?.trainers ?? [], card.id.startsWith("aed:"));
      if (!mailTo.length) continue; // external trainers only — no email known
      const done = new Set(events.filter((e) => e.kind === "training_reminder").map((e) => e.value));
      const days = reminderDays(info.dates[0].slice(0, 10), istDay(info.at));
      const due = days.filter((d) => d <= today).at(-1);
      const record = (kind: CardEvent["kind"], value: string, subject: string, messageId?: string) =>
        recordServerEvent({ cardIds: [card.id], kind, value, trainers: mailTo.map((x) => x.name), subject, messageId, at: new Date().toISOString(), by: "Training reminders" });

      if (info.postponed && info.at >= POSTPONED_SINCE && !events.some((e) => e.kind === "training_postponed_mail" && e.value === info.event.id)) {
        const mail = buildReminderMail(card, info, "postponed");
        const id = await deliver(mail);
        await record("training_postponed_mail", info.event.id, mail.subject, id);
        if (due) await record("training_reminder", reminderKey(info.dates, due), mail.subject, id); // today's reminder is this email
        sent++;
        continue;
      }
      if (!due || done.has(reminderKey(info.dates, due))) continue;
      const mail = buildReminderMail(card, info, "reminder");
      const id = await deliver(mail);
      await record("training_reminder", reminderKey(info.dates, due), mail.subject, id);
      sent++;
    }
  } finally {
    await (await db()).collection<{ _id: string; owner?: string; until?: number }>("kv").updateOne({ _id: LOCK, owner }, { $set: { until: 0 } });
  }
  return sent;
}
