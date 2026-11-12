import { readPhoto } from "@/lib/portalServer";

export const dynamic = "force-dynamic";

// A programme photo (Templates → Portal content). Public, like any picture on a website; each upload gets a new id, so
// it's cached for good.
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const p = await readPhoto(id).catch(() => null);
  if (!p) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(p.bytes), { headers: { "content-type": p.type, "cache-control": "public, max-age=31536000, immutable" } });
}
