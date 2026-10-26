import { signedInMember, unauthorized } from "@/lib/auth";
import { teamDay } from "@/lib/progress/model";
import { commentsCol, fromDoc, needsReplyIds, presenceCol, requestsCol, team } from "@/lib/progress/server";
import type { Presence, PtRequest } from "@/lib/progress/model";

export const dynamic = "force-dynamic";

/*
 * Progress tracker snapshot — everything the page needs in one call (polled every 15 s while the page is open).
 * Every signed-in member sees the same view (owner, 26 Oct: default D9). Requests: every open one, those closed in
 * the last 7 days, and any the viewer is tagged in and hasn't answered (`needsMe`, however old).
 */

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const needsMe = await needsReplyIds(me);
  const [members, presence, requests] = await Promise.all([
    team(),
    (await presenceCol()).find({}).toArray(),
    (await requestsCol()).find({ $or: [{ status: "open" }, { updatedAt: { $gte: weekAgo } }, { _id: { $in: needsMe } }] }).sort({ createdAt: -1 }).limit(500).toArray(),
  ]);
  const replyCounts = await (await commentsCol()).aggregate<{ _id: string; n: number }>([
    { $match: { parent: { $in: requests.map((r) => `request:${r._id}`) }, deletedAt: { $exists: false } } },
    { $group: { _id: "$parent", n: { $sum: 1 } } },
  ]).toArray();
  return Response.json({
    me,
    now: now.toISOString(),
    today: teamDay(now),
    team: members,
    presence: presence.map((p) => fromDoc<Presence>(p)),
    requests: requests.map((r) => fromDoc<PtRequest>(r)),
    replies: Object.fromEntries(replyCounts.map((c) => [c._id, c.n])),
    needsMe, // requests the viewer is tagged in and hasn't answered — the red count
  });
}
