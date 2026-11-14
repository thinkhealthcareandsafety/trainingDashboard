import "server-only";
import { after } from "next/server";
import { bump } from "./changes";

/*
 * Certificates go out after the answer (owner, 14 Nov: End training on the last day, or a passed person giving their email
 * after it), so the coordinator's button never waits on Zoho Mail. Live site only: anywhere else nothing is emailed.
 * Then "work" is bumped, so the coordinator's panel and our Trainings page show "emailed" within seconds.
 */
export function certificatesLater(trainingId: string, by: string, only?: string): void {
  if (process.env.VERCEL_ENV !== "production") return;
  const run = () => import("./portalCertSend")
    .then((m) => m.sendCertificates(trainingId, by, only ? { only } : {}))
    .then((r) => { console.log(`[certificates] ${trainingId}: ${r.sent} sent, ${r.noEmail} waiting for an email, ${r.failed.length} failed`); return bump("work"); })
    .catch((e) => console.error(`[certificates] ${trainingId} failed: ${e instanceof Error ? e.message : e}`));
  try { after(run); } catch { void run(); }
}
