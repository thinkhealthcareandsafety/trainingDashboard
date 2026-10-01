import { mongoConfigured } from "@/lib/db";
import { ADMIN_ID, adminPinOk, lockedFor, noteFailure, noteSuccess, setMemberPin, validPin } from "@/lib/pins";

export const dynamic = "force-dynamic";

// POST { adminPin, memberId, pin }: sets (or resets) a member's 4-digit Follow-ups PIN. Admin only.
export async function POST(request: Request) {
  if (!mongoConfigured()) return Response.json({ error: "Shared storage isn't configured" }, { status: 400 });
  const { adminPin, memberId, pin } = (await request.json().catch(() => ({}))) as { adminPin?: unknown; memberId?: unknown; pin?: unknown };
  if (typeof memberId !== "string" || !memberId || memberId === ADMIN_ID) return Response.json({ error: "Unknown member" }, { status: 400 });
  if (!validPin(pin)) return Response.json({ error: "The PIN must be 4 digits." }, { status: 400 });
  const wait = lockedFor(ADMIN_ID);
  if (wait) return Response.json({ error: `Too many wrong admin PINs — try again in ${wait} s.` }, { status: 429 });
  if (!adminPinOk(adminPin)) return (await noteFailure(ADMIN_ID), Response.json({ error: "Wrong admin PIN" }, { status: 403 }));
  noteSuccess(ADMIN_ID);
  try {
    await setMemberPin(memberId, pin);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Database error" }, { status: 502 });
  }
}
