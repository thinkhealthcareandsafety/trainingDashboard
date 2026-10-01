import { memberOfToken } from "@/lib/pins";

export const dynamic = "force-dynamic";

// POST { token }: is this remembered sign-in genuine? Returns the member id it belongs to.
export async function POST(request: Request) {
  const { token } = (await request.json().catch(() => ({}))) as { token?: unknown };
  const memberId = memberOfToken(token);
  return memberId ? Response.json({ ok: true, memberId }) : Response.json({ error: "Signed out" }, { status: 401 });
}
