import "server-only";
import { timingSafeEqual } from "crypto";
import { db } from "./db";

/*
 * Zia through Zoho Flow (owner, 3 Nov: "it has her do it anyway without needing me to open zoho mail"). Zia can only be
 * run inside Zoho, and Zoho Flow's free "Zia Utilities" actions can: the dashboard calls the flow's webhook with the
 * quote number and the brief, the flow has Zia write the email and posts it back to /api/zia?key=…, which keeps it in
 * kv `zia:<quote number>` until the email step picks it up. Set up by the owner in Zoho Flow; on with both env vars:
 *   ZIA_FLOW_URL    — the flow's webhook (trigger) URL
 *   ZIA_FLOW_SECRET — the key the flow sends back with its answer
 * Without them, "Send to Zia" leaves a Zoho Mail draft instead (zohoMail.saveDraft).
 */

type Asked = { _id: string; askedAt: number; text?: string; subject?: string | null; answeredAt?: number };
const kv = async () => (await db()).collection<Asked>("kv");
const keyOf = (quote: string) => `zia:${quote}`;
const ANSWER_WITHIN_MS = 60 * 60_000; // an answer for a quote nobody asked about in the last hour is refused

export const ziaFlowOn = () => Boolean(process.env.ZIA_FLOW_URL && process.env.ZIA_FLOW_SECRET);

/** Asks the flow; any earlier answer for this quote is dropped so the email step waits for the new one. */
export async function askZia(quote: string, prompt: string): Promise<void> {
  await (await kv()).replaceOne({ _id: keyOf(quote) }, { askedAt: Date.now() }, { upsert: true });
  const r = await fetch(process.env.ZIA_FLOW_URL!, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quote, prompt }), cache: "no-store",
  });
  if (!r.ok) throw new Error(`Zoho Flow didn't take it (${r.status}) — check the flow is on`);
}

/** The flow's answer, once it's in. */
export async function ziaAnswer(quote: string): Promise<{ text: string; subject: string | null } | "waiting" | null> {
  const d = await (await kv()).findOne({ _id: keyOf(quote) });
  if (!d) return null;
  return d.text != null ? { text: d.text, subject: d.subject ?? null } : "waiting";
}

export function ziaKeyOk(given: string | null | undefined): boolean {
  const want = process.env.ZIA_FLOW_SECRET ?? "";
  const a = Buffer.from(String(given ?? "")), b = Buffer.from(want);
  return want.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

/** Saves the flow's answer — only for a quote asked about within the hour. */
export async function saveZiaAnswer(quote: string, answer: { text: string; subject: string | null }): Promise<boolean> {
  const c = await kv();
  const asked = await c.findOne({ _id: keyOf(quote) });
  if (!asked || asked.askedAt < Date.now() - ANSWER_WITHIN_MS) return false;
  await c.updateOne({ _id: keyOf(quote) }, { $set: { text: answer.text, subject: answer.subject, answeredAt: Date.now() } });
  return true;
}
