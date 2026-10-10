import type { CardEvent, CardEventKind } from "./types";

/*
 * Reverting a step reverts the later steps of the same flow, so a card never ends up half-way (every board):
 *   - Training: merges, training dates (schedule / postpone / change / to be decided), Training completed, invoice and
 *     payment merges — following the card into whatever it was merged into afterwards.
 *   - AedSmartx: delivered → In process (Contacted) → schedule → completed, or not required / resale. Calls and emails
 *     sent stay (they happened).
 *   - Fulfillment: stage moves (and In process / On hold). The gratitude email, its replies and the rows added to the
 *     master sheet stay (they happened outside the dashboard).   - Logistics: merge → packages → shipments → received; hide.
 * Notes and edits (name, aliases, contacts, type, sector) are never rolled back. Other boards' steps aren't either: a
 * Fulfillment or Logistics card whose training is reverted just stops showing, and comes back with its steps if the
 * training is completed again.
 */

/** Steps that move a card along — reverting one of these reverts the steps after it. */
const TRIGGERS = new Set<CardEventKind>([
  "merge", "set_training_date", "complete_training", "set_not_required", "set_resale", "set_delivered", "aed_in_process",
  "set_fulfillment", "logi_merge", "set_logistics",
]);
/** What gets reverted along with them: the same steps, plus toggles that only make sense after them. */
const FOLLOWERS = new Set<CardEventKind>([...TRIGGERS, "set_wip", "set_cert_status", "logi_hide"]);

const after = (a: CardEvent, b: CardEvent) => a.at > b.at || (a.at === b.at && a.id > b.id);

/**
 * The active later steps that reverting `target` takes with it, oldest first. Follows merges: once a later merge joins
 * the target's card to another, that card's later steps count too.
 */
export function laterInFlow(target: CardEvent, events: CardEvent[]): CardEvent[] {
  if (!TRIGGERS.has(target.kind)) return [];
  const cards = new Set(target.cardIds);
  const out: CardEvent[] = [];
  const later = events
    .filter((e) => !e.revertedAt && e.id !== target.id && FOLLOWERS.has(e.kind) && after(e, target))
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  for (const e of later) {
    if (!e.cardIds.some((id) => cards.has(id))) continue;
    out.push(e);
    if (e.kind === "merge" || e.kind === "logi_merge") for (const id of e.cardIds) cards.add(id);
  }
  return out;
}

/** Everything reverting these events takes along (not counting the events themselves). */
export function cascadeOf(targets: CardEvent[], events: CardEvent[]): CardEvent[] {
  const ids = new Set(targets.map((t) => t.id));
  const seen = new Map<string, CardEvent>();
  for (const t of targets) for (const e of laterInFlow(t, events)) if (!ids.has(e.id)) seen.set(e.id, e);
  return [...seen.values()].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
