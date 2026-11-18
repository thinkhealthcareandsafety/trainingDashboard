import { signedInMember } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { runOverviewReports } from "@/lib/overviewReportSend";
import { writeSyncLog } from "@/lib/zohoSync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/*
 * The summary email to Sumit (owner, 18 Nov; body only since session 33, dailySummary.ts): daily Mon–Sat at 7 pm, monthly on the month's last day.
 *  GET  (Authorization: Bearer $CRON_SECRET)       — the schedulers: GitHub (~7:02 pm, retry ~7:20 pm) and Vercel's daily
 *                                                    cron (7:30–8:29 pm); sends what is due, never before 7 pm, never twice
 *  POST { kind: "daily" | "monthly" } (Admin)       — send one now, as a test (to Sumit, or `to`)
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Not allowed" }, { status: 401 });
  const at = new Date();
  const r = await runOverviewReports({ at }).catch((e: unknown) => ({ sent: [], error: e instanceof Error ? e.message : String(e) }));
  if (r.sent.length || r.error) {
    const source = `${/vercel-cron/i.test(request.headers.get("user-agent") ?? "") ? "Vercel cron" : "Scheduler"} · ${r.sent.length ? `${r.sent.join(" + ")} report sent` : "report"}`;
    await writeSyncLog({ trigger: "scheduler", source, at, result: "not due", reminderError: r.error });
  }
  return Response.json(r, { status: r.error ? 502 : 200 });
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me || !isAdmin(me)) return Response.json({ error: "Only Admin sends a test report" }, { status: 403 });
  const b = (await request.json().catch(() => null)) as { kind?: string; to?: string } | null;
  const kind = b?.kind === "monthly" ? "monthly" : "daily";
  const to = typeof b?.to === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.to) ? b.to : undefined;
  try {
    return Response.json(await runOverviewReports({ force: kind, to }));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't send the report" }, { status: 502 });
  }
}
