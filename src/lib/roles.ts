import type { CardEvent } from "./types";

/*
 * Who may do what — used by the boards (buttons) and by the server (/api/store refuses anything else).
 *
 *   Priyanka  AedSmartx only — everything there except marking an AED delivered
 *   Arti      Logistics only — everything there (AED delivered / hide, merges, packing, shipping, notes)
 *   Shreya    Fulfillment only — everything there
 *   Ashish, Shikha, Sumit   all four boards, every action
 *   Admin     everything; the only one who clears logs (Clear logs) or deletes log entries
 *   Anyone else   Training board
 *
 * Reverting: your own changes (Admin: anyone's). A revert also reverts the later steps of that flow (cascade.ts), even
 * when someone else made them — the flow must stay in order.
 */

export type BoardKind = "training" | "aed" | "fulfil" | "logistics";
type Who = { id: string; name: string };

const named = (m: Who, re: RegExp) => re.test(m.name.trim());
export const isAdmin = (m: Who) => m.id === "admin";
/** Ashish, Shikha, Sumit and Admin: every board, every action. */
export const hasFullAccess = (m: Who) => isAdmin(m) || named(m, /^(ashish|shikha|sumit)\b/i);

export function boardsFor(m: Who): BoardKind[] {
  if (hasFullAccess(m)) return ["training", "aed", "fulfil", "logistics"];
  if (named(m, /^priyanka\b/i)) return ["aed"];
  if (named(m, /^arti\b/i)) return ["logistics"];
  if (named(m, /^shreya\b/i)) return ["fulfil"];
  return ["training"];
}

/** Marking an AED delivered (and undoing it): everyone who can, except the AedSmartx trainer. */
export const canMarkDelivered = (m: Who) => hasFullAccess(m) || boardsFor(m).includes("logistics");

/** Which board a card belongs to, from its id. */
function boardOfCard(id: string): BoardKind {
  const p = id.split(":")[0];
  if (p === "aed" || p === "aedcustomer") return "aed";
  if (p === "fulfil") return "fulfil";
  if (p === "logi" || p === "logipay") return "logistics";
  return "training";
}

/** Recorded only by the server, once they've happened in Zoho (an email sent, a reply found, rows added to the sheet) — never reverted. */
export const SERVER_KINDS = new Set<CardEvent["kind"]>(["aed_email", "aed_reply", "fulfil_email", "fulfil_reply", "fulfil_certs"]);

/** May this member record this (new) change? Zoho notices are recorded by whoever's browser notices them. */
export function canWriteEvent(m: Who, e: Pick<CardEvent, "kind" | "cardIds">): boolean {
  if (SERVER_KINDS.has(e.kind)) return false; // only the server records these (/api/mail/*, /api/certificates)
  if (e.kind === "set_name") return false; // the customer's name is their Zoho identity — nobody renames it here
  if (e.kind === "set_cert_alias" || e.kind === "set_concerned_email") return false; // customer-wide until 15 Oct; now per training (set_cert_location / set_training_email)
  if (e.kind === "zoho_change" || hasFullAccess(m)) return true;
  const boards = boardsFor(m);
  return e.cardIds.length > 0 && e.cardIds.every((id) => {
    const b = boardOfCard(id);
    if (b === "aed") {
      // AED cards are shared: Priyanka works them on AedSmartx (not delivery); Arti marks delivery / hides them on Logistics.
      if (boards.includes("aed") && e.kind !== "set_delivered" && e.kind !== "logi_hide") return true;
      return boards.includes("logistics") && (e.kind === "set_delivered" || e.kind === "logi_hide" || e.kind === "add_note");
    }
    return boards.includes(b);
  });
}

/** Your own changes; Admin may revert anyone's. A sent email can't be unsent (nor a reply, nor sheet rows), so those are never reverted. */
export const canRevert = (m: Who, e: Pick<CardEvent, "by"> & { kind?: CardEvent["kind"] }) => !(e.kind && SERVER_KINDS.has(e.kind)) && (isAdmin(m) || e.by === m.name);

/*
 * Calendar (owner, 19 Oct): each member sees their own calendar — the trainings they give or scheduled, and the
 * meetings / events they made or are in; Admin, Shikha, Sumit and Ashish see everyone's. Priyanka gives every AedSmartx
 * training, so she sees all of those.
 */
export const seesWholeCalendar = hasFullAccess;
const samePerson = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
type EntryWho = { createdBy?: string; people?: string[]; everyone?: boolean };
type TrainingWho = { board: "training" | "aed"; trainers: string[]; scheduledBy?: string };
/** Picked for a meeting / event (or it's for everyone) — they get its reminder. */
export const inEntry = (m: Who, e: EntryWho) => Boolean(e.everyone || e.people?.some((p) => samePerson(p, m.name)));
/** A meeting / event is this member's: they made it or are in it. */
export const ownsEntry = (m: Who, e: EntryWho) => inEntry(m, e) || Boolean(e.createdBy && samePerson(e.createdBy, m.name));
export const canSeeEntry = (m: Who, e: EntryWho) => seesWholeCalendar(m) || ownsEntry(m, e);
/** Gives this training — they get its reminder. AedSmartx trainings are the AedSmartx trainer's. */
export const givesTraining = (m: Who, t: TrainingWho) => (t.board === "aed" && named(m, /^priyanka\b/i)) || t.trainers.some((n) => samePerson(n, m.name));
/** A training is this member's: they give it, or set its date. */
export const ownsTraining = (m: Who, t: TrainingWho) => givesTraining(m, t) || Boolean(t.scheduledBy && samePerson(t.scheduledBy, m.name));
export const canSeeTraining = (m: Who, t: TrainingWho) => (seesWholeCalendar(m) && boardsFor(m).includes(t.board === "aed" ? "aed" : "training")) || ownsTraining(m, t);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/**
 * A training date (Training board) must carry its certificate location and the concerned person's email (owner, 13 and
 * 15 Oct) — so a tab still running old code can't schedule without them. Not for To be decided, AedSmartx (no
 * certificates there) or a training recorded on its invoice date (before the dashboard).
 */
export const missingCertFields = (e: Pick<CardEvent, "kind" | "cardIds" | "value" | "mode" | "location" | "email">) =>
  e.kind === "set_training_date" && Boolean(e.value) && e.value !== "TBD" && e.mode !== "invoice" && !e.cardIds[0]?.startsWith("aed")
  && (typeof e.location !== "string" || !EMAIL_RE.test(e.email?.trim() ?? ""));
