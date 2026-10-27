import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { readAll } from "./cachedRead";
import { signedInMember, unauthorized } from "./auth";
import { boardsFor } from "./roles";
import { buildAedBoard, buildBoard, buildFulfillmentBoard, cardCustomers, customerAliases, customerContacts, customerNameKeys, isCustomerCard, peopleOf, type CardView } from "./pipeline";
import { aedData, getSnapshot, pipelineData } from "./zohoSync";
import type { BoardTraining, CardEvent } from "./types";

/*
 * Fulfillment board on the server: the routes that act in Zoho (gratitude email, master sheet) rebuild the card here
 * from the Zoho copy and the change log — the same way the board does — rather than trusting what the browser sends.
 */

export const newEventId = () => randomUUID().replace(/-/g, "");
export const eventsCol = async () => (await db()).collection<CardEvent & { _id: string }>("cardEvents");

/** Records an event only the server writes (an email sent, a reply found, rows added to the sheet). */
export async function recordServerEvent(e: Omit<CardEvent, "id">): Promise<CardEvent> {
  const event = { ...e, id: newEventId() } as CardEvent;
  await (await eventsCol()).insertOne({ ...event, _id: event.id });
  return event;
}

type Snap = NonNullable<Awaited<ReturnType<typeof getSnapshot>>>;

/** The Training board (and, when asked, the AedSmartx board) as they stand right now: the Zoho copy + the change log. */
export async function boardsNow(snap: Snap, withAed = false) {
  const d = pipelineData(snap);
  const aed = aedData(snap).invoices;
  // Read from Mongo only when the change log moved (cachedRead.ts — the free cluster's weekly transfer limit).
  const events = [...(await readAll<CardEvent>("cardEvents")).docs];
  const customerOf = cardCustomers(d.leads, d.quotes, d.pis, d.invoices, d.payments, aed, events);
  const nameOf = customerNameKeys(d.leads, d.quotes, d.pis, d.invoices, d.payments, aed);
  const aliases = customerAliases(events, customerOf, nameOf);
  const contacts = customerContacts(events, customerOf, nameOf);
  const board = buildBoard(d.leads, d.quotes, d.pis, d.invoices, d.payments, events, aliases, contacts);
  const aedBoard = withAed ? buildAedBoard(d.leads, aed, events, aliases, contacts) : undefined;
  return { events, board, aedBoard };
}

/** The Fulfillment card with this id, as the board shows it right now. */
export async function fulfilCard(id: string): Promise<CardView | undefined> {
  const snap = await getSnapshot();
  if (!snap) return undefined;
  const { board, events } = await boardsNow(snap);
  return buildFulfillmentBoard(board, events).cards.get(id);
}

/**
 * The PI and invoice numbers behind a card: its own, or those of any card merged into it. Most trainings end up on a
 * payment card (merged through to Payment received), whose own number is the payment's — Reports needs the PI /
 * invoice to find the training's value (27 Oct).
 */
function docsBehind(c: CardView, cards: Map<string, CardView>) {
  let piNumber = c.pi?.number ?? c.linkedPI?.number;
  let invoiceNumber = c.invoice?.number ?? c.linkedInvoice?.number;
  for (const id of c.historyIds) {
    const h = cards.get(id);
    piNumber ??= h?.pi?.number ?? h?.linkedPI?.number;
    invoiceNumber ??= h?.invoice?.number ?? h?.linkedInvoice?.number;
  }
  return { piNumber, invoiceNumber };
}

/** One training per deal (its latest card), with every training day — for the Overview, the calendar and the ticker. */
function boardTraining(c: CardView, board: BoardTraining["board"], cards?: Map<string, CardView>): BoardTraining | null {
  const s = c.schedule;
  if (!s) return null;
  return {
    id: c.id,
    board,
    docNumber: c.docNumber ?? "",
    ...(cards ? docsBehind(c, cards) : {}),
    customerName: c.name,
    alias: c.certLocation || undefined,
    training: c.training.map((t) => t.name).join(", "),
    people: board === "aed" ? 0 : peopleOf(c),
    dates: [...new Set(s.dates.map((d) => d.slice(0, 10)))].sort(),
    time: board === "aed" ? s.dates[0]?.slice(11, 16) || undefined : undefined,
    trainers: s.trainers,
    status: s.completed ? "completed" : s.status,
    scheduledBy: s.by,
  };
}

export async function boardTrainings(snap: Snap): Promise<{ board: BoardTraining[]; aedBoard: BoardTraining[]; aedWaiting: number }> {
  const { board, aedBoard } = await boardsNow(snap, true);
  const live = (c: CardView) => !c.mergedInto && !c.deleted && !c.lost && !isCustomerCard(c.kind);
  const list = [...board.cards.values()].filter(live).map((c) => boardTraining(c, "training", board.cards)).filter((t): t is BoardTraining => t !== null);
  const aed = aedBoard ? [...aedBoard.cards.values()].filter((c) => !c.notRequired).map((c) => boardTraining(c, "aed")).filter((t): t is BoardTraining => t !== null) : [];
  return { board: list, aedBoard: aed, aedWaiting: (aedBoard?.invoiceCards.length ?? 0) + (aedBoard?.contactedCards.length ?? 0) };
}

/** Signed in, with the Fulfillment board, and the card exists — else the response to send. */
export async function fulfilContext(request: Request, cardId: string | null | undefined) {
  const me = await signedInMember(request);
  if (!me) return { error: unauthorized() };
  if (!boardsFor(me).includes("fulfil")) return { error: Response.json({ error: "Only the Fulfillment board does this" }, { status: 403 }) };
  if (!cardId?.startsWith("fulfil:")) return { error: Response.json({ error: "Unknown card" }, { status: 400 }) };
  const card = await fulfilCard(cardId);
  if (!card?.fulfillment) return { error: Response.json({ error: "That training isn't on the Fulfillment board" }, { status: 404 }) };
  return { me, card };
}
