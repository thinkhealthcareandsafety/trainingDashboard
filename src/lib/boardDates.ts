import "server-only";
import { getSnapshot } from "./zohoSync";
import { boardsNow } from "./fulfilServer";
import { kindOfId } from "./pipeline";
import type { BoardSchedule } from "./attendanceRules";

/*
 * The Training board's schedule for each Performa (owner, 13 Nov: after Mark confirmed the portal's dates follow the
 * board, where Shikha postpones or changes them). Building the board is heavy and many people scan at once on the day, so
 * each server keeps the whole map for a minute. Keyed by the Zoho sales order id; a Performa merged on into its invoice
 * still finds its card (the card that holds it).
 */
const TTL = 60_000;
let cache: { at: number; byPi: Map<string, BoardSchedule> } | null = null;
let building: Promise<Map<string, BoardSchedule>> | null = null;

async function build(): Promise<Map<string, BoardSchedule>> {
  const out = new Map<string, BoardSchedule>();
  const snap = await getSnapshot();
  if (!snap) return out;
  const { board } = await boardsNow(snap);
  for (const c of board.cards.values()) {
    if (c.mergedInto || c.deleted) continue;
    const s = c.schedule;
    if (!s) continue;
    const info: BoardSchedule = { status: s.status === "tbd" ? "tbd" : s.status === "postponed" ? "postponed" : "scheduled", dates: s.dates ?? [], trainers: s.trainers ?? [], ...(s.completed ? { completedAt: s.completed.at } : {}) };
    for (const id of c.historyIds) if (kindOfId(id) === "pi") out.set(id.slice(3), info);
  }
  return out;
}

/** The board's schedule for this Performa (sales order id), or null (not on the board yet, or it couldn't be read). */
export async function boardScheduleFor(salesorderId: string | undefined): Promise<BoardSchedule> {
  if (!salesorderId) return null;
  try {
    if (!cache || Date.now() - cache.at > TTL) {
      building ??= build().finally(() => { building = null; });
      cache = { at: Date.now(), byPi: await building };
    }
    return cache.byPi.get(salesorderId) ?? null;
  } catch (e) {
    console.error("[boardDates] couldn't read the board:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** After Mark confirmed puts a training on the board, the next read shouldn't wait a minute for it. */
export const forgetBoardDates = () => { cache = null; };
