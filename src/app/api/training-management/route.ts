import { signedInMember, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { canQuote } from "@/lib/roles";
import { itemSets, type ZItem } from "@/lib/zoho";
import { byNewest, isTrainingOnly, toTrainingQuote } from "@/lib/trainingManager";

export const dynamic = "force-dynamic";

// Training Management (docs/TRAINING_MANAGER_PLAN.md step 1): the training-only quotes, read-only, from our copy of
// Zoho (zohoDocs, kept by the hourly sync). Those who send quotations.
export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!canQuote(me)) return Response.json({ error: "Only those who send quotations see Training Management" }, { status: 403 });
  try {
    const d = await db();
    const items = ((await d.collection<{ _id: string; items?: ZItem[] }>("kv").findOne({ _id: "zoho_items" }))?.items) ?? [];
    const training = itemSets(items).training;
    const docs = await d.collection<{ _id: string; doc: Record<string, unknown> }>("zohoDocs")
      .find({ kind: "estimates", training: true }, { projection: { doc: 1 } }).toArray();
    const quotes = docs.map((x) => x.doc).filter((doc) => isTrainingOnly(doc, training)).map((doc) => toTrainingQuote(doc, training)).sort(byNewest);
    return Response.json({ quotes });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't read the training quotes" }, { status: 500 });
  }
}
