import "server-only";
import { getSnapshot } from "./zohoSync";
import { boardsNow, recordServerEvent } from "./fulfilServer";
import { quoteCardId } from "./pipeline";
import { type BoardScheduleInput, type QuoteCardNow, boardScheduleEvents } from "./boardSchedule";
import type { BoardResult } from "./portalTrainings";

/**
 * Mark confirmed → the Training board (owner, 13 Nov; the rules are in boardSchedule.ts). Reads the board as it stands
 * (is the quotation already scheduled by hand? has the customer a concerned person's name?), then writes the entries.
 * Only the live site writes to the board: a local copy shares the team's database, and the team uses the board live.
 */
export async function scheduleOnBoard(x: Omit<BoardScheduleInput, "quoteCard" | "at">): Promise<BoardResult> {
  const at = new Date().toISOString();
  if (process.env.VERCEL_ENV !== "production") return { state: "notlive", note: "Only the live site puts trainings on the Training board.", at };
  try {
    const snap = await getSnapshot();
    let quoteCard: QuoteCardNow = null;
    if (snap) {
      const { board } = await boardsNow(snap);
      const qid = quoteCardId(x.estimateId);
      const c = [...board.cards.values()].find((v) => !v.mergedInto && !v.deleted && v.historyIds.includes(qid));
      if (c) quoteCard = { id: c.id, scheduled: c.schedule ? (c.schedule.status === "tbd" ? "to be decided" : c.schedule.dates.join(", ")) : undefined, concernedName: c.concernedName };
    }
    const plan = boardScheduleEvents({ ...x, quoteCard, at });
    if ("skip" in plan) return { state: "skipped", note: plan.skip, at };
    for (const e of plan.events) await recordServerEvent(e);
    return { state: "scheduled", note: x.trainers?.length ? "On the Training board, with its trainers." : "On the Training board; trainers to add there.", at, value: plan.value };
  } catch (e) {
    return { state: "failed", note: `Couldn't put it on the Training board: ${e instanceof Error ? e.message : e}. Schedule it there by hand.`, at };
  }
}
