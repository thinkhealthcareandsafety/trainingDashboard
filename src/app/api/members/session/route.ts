import { clearedCookie, memberIdOf, sessionCookie } from "@/lib/auth";
import { memberOfToken } from "@/lib/pins";

export const dynamic = "force-dynamic";

// POST { token? }: is this remembered sign-in genuine? Accepts the cookie, or the token a browser saved before
// cookies were used (then sets the cookie, so existing sign-ins carry over). Returns the member id.
export async function POST(request: Request) {
  const { token } = (await request.json().catch(() => ({}))) as { token?: unknown };
  const fromBody = memberOfToken(token);
  const memberId = fromBody ?? memberIdOf(request);
  if (!memberId) return Response.json({ error: "Signed out" }, { status: 401, headers: { "Set-Cookie": clearedCookie(request) } });
  const headers: HeadersInit = fromBody ? { "Set-Cookie": sessionCookie(String(token), request) } : {};
  return Response.json({ ok: true, memberId }, { headers });
}
