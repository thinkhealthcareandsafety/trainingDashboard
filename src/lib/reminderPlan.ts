import type { CardEvent } from "./types";

/*
 * Training reminder emails (owner, 19 Oct) — the plan, shared by the server (which sends them) and the calendar (which
 * shows them). Sent from learn@ to whoever gives the training, one email for all of them:
 *   5, 3 and 1 days before the first training day (training on the 25th → the 20th, 22nd and 24th).
 *   Scheduled closer than that: 4 days before → the 2nd day and the day before (3 and 1); 3 → the 1st day and the day
 *   before (3 and 1); 2 → both days (2 and 1); 1 → the day before.
 * A postponed training gets a "postponed to …" email instead (sorry for the inconvenience), then its reminders start
 * again from the new date. External trainers get nothing (no email known yet).
 */

/** Who gives it → where the reminder goes (owner, 19 Oct). By first name; AedSmartx trainings are Priyanka's. */
export const TRAINER_EMAILS: Record<string, string> = {
  sumit: "sshah@thinkhealth.in",
  shikha: "shikhadixit@thinkhealth.in",
  ashish: "sales@thinkhealth.in",
  priyanka: "hello@thinkhealth.in",
};
/** "Sumit A Shah" → "sumit": the key for their email above and their WhatsApp number (Admin's WhatsApp popup). */
export const trainerKey = (name: string) => name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
export const reminderRecipients = (trainers: string[], aed: boolean): { name: string; key: string; email: string }[] =>
  (aed ? ["Priyanka"] : trainers).flatMap((n) => {
    const key = trainerKey(n);
    const email = TRAINER_EMAILS[key];
    return email ? [{ name: n, key, email }] : [];
  });

/** Today (or an instant's day) in India, YYYY-MM-DD — the server runs in UTC. */
export const istDay = (at: string | number | Date = Date.now()) => new Date(new Date(at).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const dayNo = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000;
const shift = (d: string, n: number) => new Date((dayNo(d) + n) * 86_400_000).toISOString().slice(0, 10);

/** How many days before the first training day each reminder goes, given when the date was set. */
export function reminderOffsets(daysAhead: number): number[] {
  if (daysAhead >= 5) return [5, 3, 1];
  if (daysAhead >= 3) return [3, 1];
  if (daysAhead === 2) return [2, 1];
  if (daysAhead === 1) return [1];
  return [];
}
/** The days the reminders go out (YYYY-MM-DD), oldest first. */
export function reminderDays(firstDay: string, setOn: string): string[] {
  return reminderOffsets(dayNo(firstDay) - dayNo(setOn)).map((o) => shift(firstDay, -o));
}

/**
 * The training's current dates and the entry that set them (later entries with the same dates only change the
 * trainers). `postponed`: that entry replaced earlier dates and wasn't a "Change date" correction. `before` = the dates
 * it replaced. Events: the card's own (its history ids), in order.
 */
export type DatesInfo = { dates: string[]; at: string; event: CardEvent; postponed: boolean; before?: string[] };
export function datesInfo(events: CardEvent[]): DatesInfo | undefined {
  let cur: DatesInfo | undefined;
  for (const e of events) {
    if (e.revertedAt || e.kind !== "set_training_date" || !e.value) continue;
    if (e.value === "TBD") { cur = undefined; continue; }
    const dates = [...new Set(e.value.split(",").map((d) => d.trim()).filter(Boolean))].sort();
    if (cur && cur.dates.join(",") === dates.join(",")) continue; // same dates: trainers / names only
    cur = { dates, at: e.at, event: e, postponed: Boolean(cur) && e.mode !== "change" && e.mode !== "invoice", before: cur?.dates };
  }
  return cur;
}

/** One reminder per training, dates and day: what the server records (and checks) so none goes out twice. */
export const reminderKey = (dates: string[], day: string) => `${dates.join(",")}@${day}`;

/**
 * WhatsApp (owner, 20 Oct — Anantya): the same days, one message per person (a template goes to one number). The
 * `training_whatsapp` entry's value says which: "reminder:<reminderKey>:<person>" or "postponed:<entry id>:<person>".
 */
export const whatsappKey = (kind: "reminder" | "postponed", of: string, person: string) => `${kind}:${of}:${person}`;
