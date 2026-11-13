import type { CardEvent } from "./types";
import type { Proposal } from "./portalRules";
import { orderTrainers, piCardId, quoteCardId } from "./pipeline";

/*
 * Mark confirmed → the Training board (owner, 13 Nov): when we mark the Performa Confirmed, the training goes on the
 * board by itself, the way Shikha would do it by hand:
 *  - the quotation merged into the new Performa (its card shows after the next sync; a merge waits until both cards exist);
 *  - the coordinator's day(s) and times as the training date, "Course conducted at" as the certificate location, the
 *    coordinator's email and mobile as the concerned person's, their headcount as No. of People, and the trainers picked
 *    at Mark confirmed (owner, 13 Nov: required — reminder emails then go to them, never to the client);
 *  - a tentative date with a note saying so;
 *  - the concerned person's name = the coordinator's, only when the customer has none yet (it's customer-wide).
 * Left alone when the quotation's card already has a date (scheduled by hand). Pure: the server writes what this returns.
 */

/** The quotation's card on the board as it stands now (null: not on the board yet). */
export type QuoteCardNow = { id: string; scheduled?: string; concernedName?: string } | null;

export type BoardScheduleInput = {
  estimateId: string;
  salesorderId: string;
  quoteNumber: string;
  piNumber: string;
  customerId: string;
  proposal: Pick<Proposal, "dates" | "tentative" | "location" | "headcount">;
  coordinator?: { name: string; email: string; phone: string };
  /** Picked at Mark confirmed; our trainers first, then external names as typed. */
  trainers?: string[];
  quoteCard: QuoteCardNow;
  by: string;
  at: string;
};

export type BoardPlan = { events: Omit<CardEvent, "id">[]; value: string } | { skip: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

/** The board's date value: each day, with its time when there is one ("2026-12-04T10:00,2026-12-05"). */
export const boardDateValue = (dates: Proposal["dates"]) =>
  [...new Set(dates.map((d) => (d.time ? `${d.date}T${d.time}` : d.date)))].sort().join(",");

export const TENTATIVE_NOTE = "Coordinator marked the date tentative";

export function boardScheduleEvents(i: BoardScheduleInput): BoardPlan {
  if (i.quoteCard?.scheduled) return { skip: `The Training board already has a date for ${i.quoteNumber} (${i.quoteCard.scheduled}), so it was left as it is.` };
  const email = i.coordinator?.email.trim() ?? "";
  if (!EMAIL.test(email)) return { skip: "The training has no coordinator email, so it wasn't put on the Training board." };
  if (!i.proposal.dates.length) return { skip: "The coordinator gave no date, so it wasn't put on the Training board." };
  const pi = piCardId(i.salesorderId);
  const quote = quoteCardId(i.estimateId);
  const base = { at: i.at, by: i.by };
  const value = boardDateValue(i.proposal.dates);
  const phone = tidy(i.coordinator?.phone ?? "");
  const name = tidy(i.coordinator?.name ?? "");
  // Merge only a quotation that's still its own card (or not on the board yet): one already merged elsewhere stays.
  const merge = !i.quoteCard || i.quoteCard.id === quote;
  return {
    value,
    events: [
      ...(merge ? [{ ...base, cardIds: [quote, pi], kind: "merge" as const, before: i.quoteNumber, value: i.piNumber }] : []),
      {
        ...base, cardIds: [pi], kind: "set_training_date" as const, value, trainers: orderTrainers(i.trainers ?? []),
        location: tidy(i.proposal.location), email, ...(phone ? { phone } : {}), ...(i.proposal.headcount > 0 ? { people: i.proposal.headcount } : {}),
      },
      ...(i.proposal.tentative ? [{ ...base, cardIds: [pi], kind: "add_note" as const, value: TENTATIVE_NOTE }] : []),
      ...(i.quoteCard && !i.quoteCard.concernedName && name ? [{ ...base, cardIds: [pi], ref: i.customerId, kind: "set_concerned_name" as const, value: name, before: "" }] : []),
    ],
  };
}
