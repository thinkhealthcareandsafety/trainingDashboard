import { saveZiaAnswer, ziaKeyOk } from "@/lib/ziaFlow";
import { splitZiaReply } from "@/lib/quoteEmails";

export const dynamic = "force-dynamic";

/*
 * Zoho Flow posts Zia's email back here (owner, 3 Nov). No sign-in — the flow proves itself with ZIA_FLOW_SECRET as
 * ?key= (or an "x-zia-key" header, or a "key" field). Body: JSON or form fields `quote` (the quote number the
 * dashboard sent) and `text` (Zia's email; "response" / "content" / "output" also taken). Only a quote asked about
 * within the hour is accepted.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const type = request.headers.get("content-type") ?? "";
  let f: Record<string, unknown> = {};
  if (type.includes("json")) f = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  else if (type.includes("form")) f = Object.fromEntries((await request.formData().catch(() => new FormData())).entries());
  else f = Object.fromEntries(new URLSearchParams(await request.text().catch(() => "")).entries());
  if (!ziaKeyOk(url.searchParams.get("key") ?? request.headers.get("x-zia-key") ?? (f.key as string | undefined))) return Response.json({ error: "Wrong key" }, { status: 401 });
  const quote = String(f.quote ?? url.searchParams.get("quote") ?? "");
  const raw = String(f.text ?? f.response ?? f.content ?? f.output ?? "").slice(0, 20_000);
  if (!/^[A-Za-z0-9/_-]{1,40}$/.test(quote)) return Response.json({ error: "quote missing" }, { status: 400 });
  if (!raw.trim()) return Response.json({ error: "text missing" }, { status: 400 });
  const ok = await saveZiaAnswer(quote, splitZiaReply(raw));
  return ok ? Response.json({ ok: true }) : Response.json({ error: `Nobody asked Zia about ${quote} in the last hour` }, { status: 404 });
}
