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

/** May this member record this (new) change? Zoho notices are recorded by whoever's browser notices them. */
export function canWriteEvent(m: Who, e: Pick<CardEvent, "kind" | "cardIds">): boolean {
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

/** Your own changes; Admin may revert anyone's. */
export const canRevert = (m: Who, e: Pick<CardEvent, "by">) => isAdmin(m) || e.by === m.name;
