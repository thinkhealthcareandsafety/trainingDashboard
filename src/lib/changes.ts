import "server-only";
import { db } from "./db";

/*
 * Live refresh (owner, 13 Nov: "whatever I do it should show up immediately without me having to refresh"). One small
 * kv document, "changes", counts what changed, by topic:
 *  - team:  the team's shared data (cards, notes, calendar …) — /api/store writes, server-recorded entries;
 *  - work:  quotations, Trainings, the coordinators' portal (accept, names, attendance) — their routes;
 *  - local: Zoho documents the dashboard itself just changed and wrote into our copies (writeThrough.ts).
 * Every open tab asks /api/changes every few seconds and reloads only what a changed topic touches. The Zoho syncs keep
 * their own version numbers (zoho_state, sales_state), which /api/changes passes on too.
 */
export type Topic = "team" | "work" | "local";
const kv = async () => (await db()).collection<{ _id: string } & Record<string, unknown>>("kv");

/** Something changed: every open tab reloads what shows it. Never fails the request that made the change. */
export async function bump(...topics: Topic[]): Promise<void> {
  try {
    await (await kv()).findOneAndUpdate({ _id: "changes" }, { $inc: Object.fromEntries(topics.map((t) => [t, 1])) } as never, { upsert: true });
  } catch (e) {
    console.error("[changes] couldn't note a change:", e instanceof Error ? e.message : e);
  }
}

/** A route's POST that notes a change whenever it succeeds (so no return path is missed). */
export function withBump<A extends unknown[], R extends Response | undefined>(topics: Topic[], handler: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const res = await handler(...args);
    if (res?.ok) await bump(...topics);
    return res;
  };
}

/** Zoho documents written into our copies by the dashboard itself (the snapshot and the Sales copy key on it too). */
export async function localVersion(): Promise<number> {
  const d = await (await kv()).findOne({ _id: "changes" }, { projection: { local: 1 } });
  return Number(d?.local ?? 0);
}

export type Versions = { team: number; work: number; zoho: string };

/** What a tab compares: the counters, plus the syncs' own versions folded into one Zoho key. */
export async function versions(): Promise<Versions> {
  const ids = ["changes", "zoho_state", "sales_state"];
  const docs = (await (await kv()).find({ _id: { $in: ids } }, { projection: { team: 1, work: 1, local: 1, version: 1 } }).toArray()).filter((d) => ids.includes(d._id));
  const of = (id: string) => docs.find((d) => d._id === id) ?? {};
  const c = of("changes") as { team?: number; work?: number; local?: number };
  return { team: Number(c.team ?? 0), work: Number(c.work ?? 0), zoho: `${Number((of("zoho_state") as { version?: number }).version ?? 0)}.${Number((of("sales_state") as { version?: number }).version ?? 0)}.${Number(c.local ?? 0)}` };
}
