import type { CardEvent } from "./types";
import {
  type CardView, type FulfilStage, FULFIL_LABEL, buildAedBoard, buildBoard, buildFulfillmentBoard, fulfilCardId, kindOfId, partPaidText, receivedOn,
  sumMatches,
} from "./pipeline";

/*
 * Logistics board (Arti): AED Delivered Status → Sent to Logistics → Payment Received → Packages → Shipments → Received by Client.
 *
 *  - AED Delivered Status: every AED invoice since 1 Sept (the AedSmartx cards, same "delivered" mark). Arti marks it
 *    delivered and can hide it (Unhide cards brings it back). Blue once Priyanka has moved it on her board.
 *  - Sent to Logistics: Fulfillment cards Shreya sent to Logistics (key: the training's PI, or its quote).
 *  - Payment Received: payment cards from the training board that are merged with their invoice (so paid in full —
 *    one card per invoice, instalments included). A Sent to Logistics card and the payment card of the same PI are
 *    flagged together; merging them makes one card here, which then goes on to Packages → Shipments → Received.
 *  - Every move is an event on "logi:<pi/quote card id>"; reverting one reverts the moves after it (see store.tsx).
 */

export type LogiColumn = "aed" | "stl" | "payment" | "packages" | "shipments" | "received";
export type LogiStep = "packages" | "pack_process" | "pack_hold" | "shipments" | "ship_dispatched" | "ship_hold" | "expected" | "received";

export interface LogiInfo {
  column: LogiColumn;
  /** The card it's built from: the training board's payment card (Payment Received on), or the Fulfillment card (Sent to Logistics). */
  origin: CardView;
  /** The training's PI (or quote) card id — what ties certificates and payment together. */
  doc?: string;
  step?: LogiStep;
  at?: string;
  by?: string;
  expected?: string; // Received by Client, not reached yet: expected date (YYYY-MM-DD)
  merged?: { at: string; by: string };
  /** Not merged yet: the card it's flagged with (same PI), or why it waits. */
  partnerId?: string;
  waiting?: string;
  /** Payment cards waiting for certificates: where the certificates are on the Fulfillment board. */
  certStage?: string;
}
export interface LogiAedInfo {
  hidden?: { at: string; by: string; eventId: string };
  /** Priyanka moved it on from Invoices sent on her board: where to, who, when. */
  moved?: { to: string; by: string; at: string };
}

export const logiCardId = (doc: string) => `logi:${doc}`;
export const logiPayId = (paymentCardId: string) => `logipay:${paymentCardId}`;
/** Arti works only on the Logistics board. */
export const isLogisticsUser = (name: string) => /^arti\b/i.test(name.trim());

export const LOGI_STEP_LABEL: Record<LogiStep, string> = {
  packages: "Packages", pack_process: "Packaging in Process", pack_hold: "On hold", shipments: "Shipments",
  ship_dispatched: "Dispatched", ship_hold: "On hold", expected: "Expected", received: "Received by Client",
};
export const LOGI_COLUMN_LABEL: Record<LogiColumn, string> = {
  aed: "AED Delivered Status", stl: "Sent to Logistics", payment: "Payment Received", packages: "Packages", shipments: "Shipments", received: "Received by Client",
};
const stepColumn = (s: LogiStep): LogiColumn => (s.startsWith("pack") ? "packages" : s.startsWith("ship") ? "shipments" : "received");
/** "expected:2026-10-12" → step "expected" with that date; anything else is the step itself. */
export function parseStep(value?: string): { step?: LogiStep; expected?: string } {
  if (!value) return {};
  if (value.startsWith("expected:")) return { step: "expected", expected: value.slice("expected:".length) };
  return { step: value as LogiStep };
}

/** The training's PI card id (or its quote's, when the PI was skipped) somewhere in a card's merge chain. */
const docOf = (c: CardView) => c.historyIds.find((id) => kindOfId(id) === "pi") ?? c.historyIds.find((id) => kindOfId(id) === "quote");
/** Payments + TDS cover the invoice total. */
const paidInFull = (p: CardView) => sumMatches(p.linkedInvoice?.total, receivedOn(p.payments ?? (p.payment ? [p.payment] : [])));
const trainedOn = (c: CardView) => c.schedule?.dates.at(-1)?.slice(0, 10) ?? "";
const byTraining = (a: CardView, b: CardView) => trainedOn(b).localeCompare(trainedOn(a)) || a.name.localeCompare(b.name);

export function buildLogisticsBoard(
  board: ReturnType<typeof buildBoard>,
  ful: ReturnType<typeof buildFulfillmentBoard>,
  aed: ReturnType<typeof buildAedBoard>,
  events: CardEvent[],
) {
  const active = events.filter((e) => !e.revertedAt).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const byCard = new Map<string, CardEvent[]>();
  for (const e of active) for (const id of e.cardIds) byCard.set(id, [...(byCard.get(id) ?? []), e]);
  const evs = (id: string) => byCard.get(id) ?? [];
  const cards = new Map<string, CardView>();

  // 1. AED Delivered Status: every AED invoice (AED_SINCE onwards), whatever Priyanka has done with it.
  const aedCards: CardView[] = [];
  for (const c of aed.cards.values()) {
    const hide = evs(c.id).filter((e) => e.kind === "logi_hide").at(-1);
    let moved: LogiAedInfo["moved"];
    if (c.notRequired) {
      const ev = [...evs(c.id).filter((e) => e.kind === "set_not_required" || e.kind === "set_resale"),
        ...active.filter((e) => e.kind === "set_reseller" && e.ref === c.customerId)].sort((a, b) => a.at.localeCompare(b.at)).at(-1);
      moved = { to: "Training not required", by: ev?.by ?? "", at: ev?.at ?? "" };
    } else if (c.schedule?.completed) moved = { to: "Training completed", by: c.schedule.completed.by, at: c.schedule.completed.at };
    else if (c.schedule) {
      const first = evs(c.id).find((e) => e.kind === "set_training_date");
      moved = { to: "Training scheduled", by: first?.by ?? c.schedule.by, at: first?.at ?? c.schedule.at };
    }
    const card: CardView = {
      ...c,
      logiAed: { hidden: hide ? { at: hide.at, by: hide.by, eventId: hide.id } : undefined, moved },
      logistics: { column: "aed", origin: c },
    };
    cards.set(card.id, card);
    aedCards.push(card);
  }

  // 2–3. Certificates sent to Logistics, and payments merged with their (fully paid) invoice, keyed by the training's PI.
  const stl = new Map<string, CardView>();
  for (const c of ful.cards.values()) if (c.fulfillment?.stage === "logistics") stl.set(c.id.slice(fulfilCardId("").length), c);
  const certStage = new Map<string, FulfilStage>();
  for (const c of ful.cards.values()) certStage.set(c.id.slice(fulfilCardId("").length), c.fulfillment!.stage);
  const pays = [...board.cards.values()].filter((c) =>
    c.kind === "payment" && !c.mergedInto && !c.deleted && c.mergedFrom.some((id) => kindOfId(id) === "invoice") && paidInFull(c));
  const paysByDoc = new Map<string, CardView[]>();
  for (const p of pays) {
    const d = docOf(p);
    if (d) paysByDoc.set(d, [...(paysByDoc.get(d) ?? []), p]);
  }
  // A merge counts only while both sides are still there (Shreya may move the certificates back; a payment may be unmerged).
  const mergeOf = (doc: string) => {
    const m = evs(logiCardId(doc)).filter((e) => e.kind === "logi_merge" && e.cardIds[0] === logiCardId(doc)).at(-1);
    const p = m && stl.has(doc) ? (paysByDoc.get(doc) ?? []).find((x) => logiPayId(x.id) === m.cardIds[1]) : undefined;
    return m && p ? { ev: m, pay: p } : undefined;
  };

  const used = new Set<string>(); // payment cards merged into a logistics card
  const stlCards: CardView[] = [];
  const later: CardView[] = [];
  for (const [doc, f] of stl) {
    const id = logiCardId(doc);
    const own = evs(id).filter((e) => e.kind === "add_note" && e.value).map((e) => ({ id: e.id, text: e.value!, by: e.by, at: e.at }));
    const m = mergeOf(doc);
    if (m) {
      used.add(m.pay.id);
      const p = m.pay;
      const step = evs(id).filter((e) => e.kind === "set_logistics" && e.at > m.ev.at).at(-1);
      const { step: s, expected } = parseStep(step?.value);
      const card: CardView = {
        ...p, id, historyIds: [id, logiPayId(p.id)], flaggedWith: [], mergedInto: undefined, waitingOn: undefined, readyToSchedule: false,
        schedule: p.schedule ?? f.schedule,
        notes: [...own, ...(p.notes ?? [])].sort((a, b) => b.at.localeCompare(a.at)),
        logistics: { column: s ? stepColumn(s) : "payment", origin: p, doc, step: s, expected, at: step?.at, by: step?.by, merged: { at: m.ev.at, by: m.ev.by } },
      };
      cards.set(id, card);
      later.push(card);
      continue;
    }
    // Not merged: flagged with its payment card once the invoice is paid in full and merged with its payment(s).
    const partner = (paysByDoc.get(doc) ?? [])[0];
    const holder = board.cards.get(f.historyIds[1]);
    const waiting = partner ? undefined
      : holder?.kind === "invoice" && holder.invoice
        ? (holder.received ? `${partPaidText(holder.invoice, holder.received)}.` : `Invoice ${holder.docNumber} isn't paid yet.`)
        : holder?.kind === "payment" ? "The payment isn't merged with its invoice on the training board yet."
        : "No invoice raised yet.";
    // Labelled by its PI (the money is the payment card's, shown once they're merged).
    const pi = f.pi ?? f.linkedPI;
    const card: CardView = {
      ...f, id, historyIds: [id], fulfillment: undefined, flaggedWith: partner ? [logiPayId(partner.id)] : [],
      payment: undefined, payments: undefined, docNumber: pi?.number ?? f.linkedQuote?.number ?? f.quote?.number ?? f.docNumber, docDate: pi?.date ?? f.docDate,
      notes: [...own, ...(f.notes ?? [])].sort((a, b) => b.at.localeCompare(a.at)),
      logistics: { column: "stl", origin: f, doc, partnerId: partner ? logiPayId(partner.id) : undefined, waiting },
    };
    cards.set(id, card);
    stlCards.push(card);
  }

  // Payment cards not merged yet: flagged with their Sent to Logistics card, or waiting for the certificates.
  const payCards: CardView[] = [];
  for (const p of pays) {
    if (used.has(p.id)) continue;
    const id = logiPayId(p.id);
    const doc = docOf(p);
    const partner = doc && stl.has(doc) ? logiCardId(doc) : undefined;
    const own = evs(id).filter((e) => e.kind === "add_note" && e.value).map((e) => ({ id: e.id, text: e.value!, by: e.by, at: e.at }));
    const stage = doc ? certStage.get(doc) : undefined;
    const card: CardView = {
      ...p, id, historyIds: [id], flaggedWith: partner ? [partner] : [], mergedInto: undefined, waitingOn: undefined,
      notes: [...own, ...(p.notes ?? [])].sort((a, b) => b.at.localeCompare(a.at)),
      logistics: {
        column: "payment", origin: p, doc, partnerId: partner, waiting: partner ? undefined : "Waiting for Certificates",
        certStage: stage ? FULFIL_LABEL[stage] : undefined,
      },
    };
    cards.set(id, card);
    payCards.push(card);
  }

  const col = (c: LogiColumn) => later.filter((x) => x.logistics!.column === c);
  return {
    cards,
    aedCards,
    stlCards: stlCards.sort(byTraining),
    paymentCards: [...col("payment"), ...payCards].sort(byTraining),
    packageCards: col("packages").sort(byTraining),
    shipmentCards: col("shipments").sort(byTraining),
    receivedCards: col("received").sort(byTraining),
  };
}
