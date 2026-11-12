import { PORTAL_COOKIE, portalToken, portalUser, requestCode, resetPassword, signIn, signOut } from "@/lib/portalAuth";
import { sendMail } from "@/lib/zohoMail";

export const dynamic = "force-dynamic";

/*
 * The Training Manager portal's sign-in (docs/TRAINING_MANAGER_PLAN.md step 3) — for training coordinators, not staff.
 * GET: who is signed in (or 401). POST { action: "signin", email, password } · { action: "signout" } ·
 * { action: "code", email } (a reset code from learn@) · { action: "reset", email, code, password }.
 */
const FROM = "learn@thinkhealth.in";
const tokenOf = portalToken;
const cookie = (value: string, maxAge: number) => `${PORTAL_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${process.env.VERCEL_ENV ? "; Secure" : ""}`;
const signedIn = (r: { token: string; maxAge: number; name: string }) => new Response(JSON.stringify({ ok: true, name: r.name }), { headers: { "content-type": "application/json", "set-cookie": cookie(r.token, r.maxAge) } });

export async function GET(request: Request) {
  const me = await portalUser(tokenOf(request)).catch(() => null);
  return me ? Response.json(me) : Response.json({ error: "Not signed in" }, { status: 401 });
}

const codeEmail = (code: string, name: string) => `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#0f2a3a;line-height:1.55">
<p>Hello${name ? ` ${name.split(" ")[0]}` : ""},</p>
<p>Your code to reset your Think Health Training Manager password:</p>
<p style="font-size:30px;font-weight:700;letter-spacing:6px;color:#034f72;margin:18px 0">${code}</p>
<p>It works for 10 minutes. If you didn't ask for it, you can ignore this email; your password stays as it is.</p>
<p>Think Health Training Team</p></div>`;

export async function POST(request: Request) {
  const b = (await request.json().catch(() => null)) as { action?: string; email?: unknown; password?: unknown; code?: unknown } | null;
  try {
    switch (b?.action) {
      case "signin": {
        const r = await signIn(b.email, b.password);
        return r.ok ? signedIn(r) : Response.json({ error: r.error }, { status: r.status });
      }
      case "signout": {
        await signOut(tokenOf(request));
        return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "set-cookie": cookie("", 0) } });
      }
      case "code": {
        // Like the other emails: only the live site sends them, so a local copy can't email a client by accident.
        if (process.env.VERCEL_ENV !== "production") return Response.json({ error: "Only the live site sends email" }, { status: 409 });
        const r = await requestCode(b.email, async (to, code, name) => { await sendMail(FROM, { to, subject: `${code} is your Think Health Training Manager code`, html: codeEmail(code, name) }); });
        return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: r.status });
      }
      case "reset": {
        const r = await resetPassword(b.email, b.code, b.password);
        return r.ok ? signedIn(r) : Response.json({ error: r.error }, { status: r.status });
      }
      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    console.error("[portal]", e);
    return Response.json({ error: "Something went wrong on our side. Try again in a minute." }, { status: 500 });
  }
}
