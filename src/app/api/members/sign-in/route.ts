import { mongoConfigured } from "@/lib/db";
import { sessionCookie } from "@/lib/auth";
import { ADMIN_ID, adminPinOk, checkMemberPin, lockedFor, noteFailure, noteSuccess, sessionToken } from "@/lib/pins";

export const dynamic = "force-dynamic";

// POST { memberId, pin }: checks a member's Follow-ups PIN ("admin" checks ADMIN_PIN). The PIN never leaves the server.
// On success returns a token the browser keeps, so the member stays signed in until they sign out.
export async function POST(request: Request) {
  const { memberId, pin } = (await request.json().catch(() => ({}))) as { memberId?: unknown; pin?: unknown };
  if (typeof memberId !== "string" || !memberId || typeof pin !== "string") return Response.json({ error: "Enter your PIN" }, { status: 400 });
  const wait = lockedFor(memberId);
  if (wait) return Response.json({ error: `Too many wrong PINs — try again in ${wait} s.` }, { status: 429 });

  if (memberId === ADMIN_ID) {
    if (!process.env.ADMIN_PIN) return Response.json({ error: "Admin sign-in is disabled (no ADMIN_PIN on the server)" }, { status: 403 });
    if (!adminPinOk(pin)) return (await noteFailure(memberId), Response.json({ error: "Wrong PIN" }, { status: 403 }));
    noteSuccess(memberId);
    const token = sessionToken(memberId);
    return Response.json({ ok: true, token }, { headers: { "Set-Cookie": sessionCookie(token, request) } });
  }

  if (!mongoConfigured()) return Response.json({ error: "Shared storage isn't configured" }, { status: 400 });
  try {
    const result = await checkMemberPin(memberId, pin);
    if (result === "unset") return Response.json({ error: "No PIN is set for this member yet — ask the admin to set one." }, { status: 409 });
    if (result === "wrong") return (await noteFailure(memberId), Response.json({ error: "Wrong PIN" }, { status: 403 }));
    noteSuccess(memberId);
    const token = sessionToken(memberId);
    return Response.json({ ok: true, token }, { headers: { "Set-Cookie": sessionCookie(token, request) } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Database error" }, { status: 502 });
  }
}
