import "server-only";
import { db } from "./db";
import { booksApi } from "./quotations";
import { bump } from "./changes";
import { forgetBoardDates } from "./boardDates";
import { unconfirm } from "./portalTrainings";
import type { Kind } from "./zoho";

/*
 * A quote or Performa deleted in Zoho (owner, 13 Nov: "that same training and every data about its current quote or PI
 * should be cleared too, basically fresh for them"):
 *  - Performa deleted: everything from it goes — Confirmed, the attendance QR and every attendance tick. The training is
 *    back to Accepted with the coordinator's date (the quote still stands).
 *  - Quote deleted: the training leaves the coordinator's dashboard and our Trainings page — the accepted date, the
 *    participant list and attendance go. Kept in `portalArchive` (so a mistaken delete can be put back), never reused.
 *    The login goes too (they're signed out) when that was their last training with us and they never chose their own
 *    password; a password they chose stays (the next quote email says to use it, or reset it).
 * Zoho is asked first whether the document is really gone (one call each): leaving our copy for another reason (an item
 * moved out of Training Services, older than the window) never clears anyone's data.
 */
const SINGULAR: Record<Kind, string> = { estimates: "estimate", salesorders: "salesorder", invoices: "invoice" };
type Doc = { _id: string } & Record<string, unknown>;
const col = async (name: string) => (await db()).collection<Doc>(name);

/** True only when Zoho says the document doesn't exist. Any other answer (it's there, or an error) → false. */
async function deletedInZoho(kind: Kind, id: string): Promise<boolean> {
  try {
    const r = await booksApi("GET", `/${kind}/${id}`);
    const d = r[SINGULAR[kind]] as { status?: unknown } | undefined;
    return String(d?.status ?? "") === "void";
  } catch (e) {
    return /does not exist|has been deleted/i.test(e instanceof Error ? e.message : String(e));
  }
}

/** A Performa is gone: back to Accepted, attendance cleared. Returns how many trainings changed. */
export async function performaDeleted(salesorderId: string): Promise<number> {
  const trainings = (await (await col("portalTrainings")).find({ "confirmed.salesorderId": salesorderId }).toArray())
    .filter((t) => (t.confirmed as { salesorderId?: string } | undefined)?.salesorderId === salesorderId);
  for (const t of trainings) {
    await unconfirm(t._id, "deleted in Zoho");
    const marks = await col("portalAttendance");
    for (const m of (await marks.find({ trainingId: t._id }).toArray()).filter((x) => x.trainingId === t._id)) await marks.deleteOne({ _id: m._id });
    await (await col("portalTrainings")).updateOne({ _id: t._id }, { $unset: { attendKey: "" } });
    console.log(`[portal] ${String((t.confirmed as { number?: string }).number ?? salesorderId)} deleted in Zoho: training ${t._id} back to Accepted, attendance cleared`);
  }
  if (trainings.length) { forgetBoardDates(); await bump("work"); }
  return trainings.length;
}

/** A quote is gone: the training leaves the portal (archived), and the login if nothing else needs it. */
export async function quoteDeleted(estimateId: string): Promise<boolean> {
  const trainings = await col("portalTrainings");
  const t = await trainings.findOne({ _id: estimateId });
  if (!t) return false;
  const people = await col("portalParticipants");
  const marks = await col("portalAttendance");
  const list = (await people.find({ trainingId: estimateId }).toArray()).filter((p) => p.trainingId === estimateId);
  const ticks = (await marks.find({ trainingId: estimateId }).toArray()).filter((m) => m.trainingId === estimateId);
  const at = new Date().toISOString();
  await (await col("portalArchive")).insertOne({ _id: `${estimateId}:${at}`, why: "quote deleted in Zoho", at, training: t, participants: list, attendance: ticks });
  for (const p of list) await people.deleteOne({ _id: p._id });
  for (const m of ticks) await marks.deleteOne({ _id: m._id });
  await trainings.deleteOne({ _id: estimateId });
  // The login: only when this was their last training and the password is still one we made.
  const email = String((t.coordinator as { email?: string } | undefined)?.email ?? "").toLowerCase();
  if (email) {
    const others = (await trainings.find({ "coordinator.email": email }).toArray()).filter((x) => String((x.coordinator as { email?: string } | undefined)?.email ?? "").toLowerCase() === email);
    const login = await (await col("portalLogins")).findOne({ _id: email });
    if (!others.length && login && !login.own) {
      await (await col("portalLogins")).deleteOne({ _id: email });
      const sessions = await col("portalSessions");
      for (const s of (await sessions.find({ email }).toArray()).filter((x) => x.email === email)) await sessions.deleteOne({ _id: s._id });
    }
  }
  console.log(`[portal] quote ${estimateId} deleted in Zoho: its training was cleared from the portal (archived)`);
  await bump("work");
  return true;
}

/**
 * Documents that just left our Zoho copy (the live sync's deletion check, a deleted Performa noticed on Trainings): those
 * Zoho confirms are deleted clear what the portal built on them. `known`: already confirmed deleted (no extra call).
 */
export async function docsGone(kind: Kind, ids: string[], known = false): Promise<void> {
  if (kind === "invoices") return;
  for (const id of ids) {
    try {
      // Only trainings on the portal matter; skip the Zoho call when nothing here is built on this document.
      const linked = kind === "salesorders"
        ? (await (await col("portalTrainings")).find({ "confirmed.salesorderId": id }).toArray()).some((t) => (t.confirmed as { salesorderId?: string } | undefined)?.salesorderId === id)
        : Boolean(await (await col("portalTrainings")).findOne({ _id: id }));
      if (!linked) continue;
      if (!known && !(await deletedInZoho(kind, id))) continue;
      if (kind === "salesorders") await performaDeleted(id);
      else await quoteDeleted(id);
    } catch (e) {
      console.error(`[portal] clearing after ${kind}/${id} was deleted failed: ${e instanceof Error ? e.message : e}`);
    }
  }
}
