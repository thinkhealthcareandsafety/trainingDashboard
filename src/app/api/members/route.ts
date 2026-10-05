import { db, mongoConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

// Public: just the names for the sign-in screen (no PINs, no other data).
export async function GET() {
  if (!mongoConfigured()) return Response.json({ members: [] });
  try {
    const rows = await (await db()).collection("members").find({}, { projection: { _id: 0, id: 1, name: 1, createdAt: 1 } }).toArray();
    return Response.json({ members: rows });
  } catch (e) {
    return Response.json({ members: [], error: e instanceof Error ? e.message : "Database error" }, { status: 502 });
  }
}
