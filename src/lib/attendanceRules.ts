import type { ProposalDate } from "./portalRules";

/*
 * Attendance on the day (docs/TRAINING_MANAGER_PLAN.md, "Next: Attendance and Quiz", Step A; owner, 13 Nov), pure:
 *  - which day the attendance QR works on (the training's days, India time, all day), and what it says otherwise;
 *  - the training's days after Mark confirmed: the Training board's (Shikha postpones there), else the coordinator's;
 *  - one tick per person per day.
 */

export type DayWindow =
  | { state: "none"; of: 0 } // no dates yet (or the board says "to be decided")
  | { state: "before"; next: string; of: number }
  | { state: "open"; day: string; dayNo: number; of: number }
  | { state: "after"; last: string; of: number };

/** Where the training's days stand today (YYYY-MM-DD, India time). Several days: open on each of them, shut in between. */
export function attendanceWindow(days: string[], today: string): DayWindow {
  const list = [...new Set(days.map((d) => d.slice(0, 10)))].sort();
  if (!list.length) return { state: "none", of: 0 };
  const i = list.indexOf(today);
  if (i >= 0) return { state: "open", day: today, dayNo: i + 1, of: list.length };
  const next = list.find((d) => d > today);
  return next ? { state: "before", next, of: list.length } : { state: "after", last: list.at(-1)!, of: list.length };
}

/** Registration (the join QR) closes once the last training day has passed. */
export const registrationOpen = (days: string[], today: string) => attendanceWindow(days, today).state !== "after";

/** The board's schedule values ("2026-12-04T10:00", "2026-12-05") as the portal's dates. */
export const datesFromBoard = (values: string[]): ProposalDate[] =>
  [...new Set(values)].sort().map((v) => ({ date: v.slice(0, 10), time: /T\d\d:\d\d/.test(v) ? v.slice(11, 16) : "" }));

export const sameDates = (a: ProposalDate[], b: ProposalDate[]) =>
  a.length === b.length && a.every((d, i) => d.date === b[i]?.date && d.time === b[i]?.time);

export type CurrentDates = {
  dates: ProposalDate[];
  /** The board says "to be decided": the portal says "To be confirmed" and attendance stays shut. */
  tbd: boolean;
  /** The coordinator's dates when the board moved them (shown struck through). */
  was: ProposalDate[] | null;
  trainers: string[];
  completedAt: string | null;
};

/** The board's schedule for this training (null: not on the board yet / not scheduled there). */
export type BoardSchedule = { status: "scheduled" | "postponed" | "tbd"; dates: string[]; trainers: string[]; completedAt?: string } | null;

/**
 * The training's days: before Mark confirmed, the coordinator's; after, the board's (owner, 13 Nov: "follow the board"),
 * with the coordinator's struck through when they differ. Not on the board yet → the coordinator's.
 */
export function currentDates(proposal: ProposalDate[], confirmed: boolean, board: BoardSchedule): CurrentDates {
  const plain = { dates: proposal, tbd: false, was: null, trainers: [], completedAt: null };
  if (!confirmed || !board) return plain;
  const trainers = board.trainers ?? [];
  const completedAt = board.completedAt ?? null;
  if (board.status === "tbd") return { dates: [], tbd: true, was: proposal.length ? proposal : null, trainers, completedAt };
  const dates = datesFromBoard(board.dates);
  return { dates, tbd: false, was: proposal.length && !sameDates(dates, proposal) ? proposal : null, trainers, completedAt };
}

/** One tick per person per day. */
export const attendanceId = (th: string, day: string) => `${th}:${day}`;
export type How = "self" | "coordinator";
export type Mark = { _id: string; trainingId: string; th: string; day: string; at: string; how: How; by: string };

/** Each person's days present: TH → days. */
export function presentByPerson(marks: Pick<Mark, "th" | "day">[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const m of marks) out.set(m.th, [...(out.get(m.th) ?? []), m.day].sort());
  return out;
}

/** How many were present on each day. */
export function presentByDay(marks: Pick<Mark, "day">[], days: string[]): { day: string; present: number }[] {
  return days.map((day) => ({ day, present: marks.filter((m) => m.day === day).length }));
}

/** A coordinator may tick a training day that has come (today or earlier), not one still ahead. */
export const tickableDay = (days: string[], day: string, today: string) => days.includes(day) && day <= today;

/** The participant cookie (one per training): "TH001.<token>". */
export const attendCookieName = (trainingId: string) => `th_att_${trainingId.replace(/\D/g, "").slice(0, 30)}`;
export function readAttendCookie(header: string | null, trainingId: string): { th: string; token: string } | null {
  const name = attendCookieName(trainingId);
  const raw = (header ?? "").split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
  const m = raw ? decodeURIComponent(raw).match(/^(TH\d{3,7})\.([\w-]{6,40})$/) : null;
  return m ? { th: m[1], token: m[2] } : null;
}
