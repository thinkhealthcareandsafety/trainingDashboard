import { clearedCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearedCookie(request) } });
}
