import { attendIdentify, attendInfo, attendPresent, attendRegister, idOfTrainingNumber } from "@/lib/portalTrainings";
import { withBump } from "@/lib/changes";
import { attendCookieName, readAttendCookie } from "@/lib/attendanceRules";

export const dynamic = "force-dynamic";

/*
 * Attendance on the day (owner, 13 Nov), no login. The coordinator's fixed attendance QR opens /<number>/attend?k=<key>:
 *  GET ?n=<Training Number>&k=<key>                  — the training, where attendance stands today, and who this phone is
 *  POST { n, k, action: "identify", phone }          — on the list → them (the phone remembers them); else { register: true }
 *  POST { n, k, action: "register", name, phone, email? } — a walk-in joins the list, tagged walk-in
 *  POST { n, k, action: "present" }                  — today's tick for the person this phone remembers
 *  POST { n, k, action: "forget" }                   — "Not you?": the phone forgets them
 * Works on the training's days only (India time). The cookie (one per training) holds their TH number and private token.
 */
const YEAR_HALF = 180 * 24 * 3600;
const setCookie = (trainingId: string, value: string, maxAge: number) =>
  `${attendCookieName(trainingId)}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${process.env.VERCEL_ENV ? "; Secure" : ""}`;
const json = (body: unknown, status = 200, cookie?: string) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...(cookie ? { "set-cookie": cookie } : {}) } });
const oops = (e: unknown) => { console.error("[portal/attend]", e); return json({ error: "Something went wrong on our side. Try again in a minute." }, 500); };
const NOT_FOUND = "This attendance code has changed. Please scan the one your training coordinator is showing.";

export async function GET(request: Request) {
  const s = new URL(request.url).searchParams;
  try {
    const id = await idOfTrainingNumber(s.get("n"));
    const info = id ? await attendInfo(s.get("n"), s.get("k"), readAttendCookie(request.headers.get("cookie"), id)) : null;
    return info ? json(info) : json({ error: NOT_FOUND }, 404);
  } catch (e) {
    return oops(e);
  }
}

async function handlePOST(request: Request) {
  try {
    const b = (await request.json().catch(() => null)) as { n?: unknown; k?: unknown; action?: string; phone?: unknown; name?: unknown; email?: unknown } | null;
    const id = await idOfTrainingNumber(b?.n);
    if (!id) return json({ error: NOT_FOUND }, 404);
    const remember = (c: { th: string; token: string }) => setCookie(id, `${c.th}.${c.token}`, YEAR_HALF);
    if (b?.action === "forget") return json({ ok: true }, 200, setCookie(id, "", 0));
    if (b?.action === "identify" || b?.action === "register") {
      const r = b.action === "identify" ? await attendIdentify(b.n, b.k, b.phone) : await attendRegister(b.n, b.k, { name: b.name, phone: b.phone, email: b.email });
      if ("error" in r) return json({ error: r.error }, r.status);
      if ("register" in r) return json({ register: true });
      return json({ me: r.me }, 200, remember(r.cookie));
    }
    if (b?.action === "present") {
      const r = await attendPresent(b.n, b.k, readAttendCookie(request.headers.get("cookie"), id));
      return "error" in r ? json({ error: r.error }, r.status) : json(r);
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return oops(e);
  }
}

// Live refresh (owner, 13 Nov): a change here shows in every open tab within seconds.
export const POST = withBump(["work"], handlePOST);
