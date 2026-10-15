import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { signedInMember, unauthorized } from "./auth";
import { boardsFor } from "./roles";
import { buildAedBoard, buildBoard, buildFulfillmentBoard, cardCustomers, customerAliases, customerContacts, customerNameKeys, isCustomerCard, type CardView } from "./pipeline";
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
  const events = (await (await eventsCol()).find({}, { projection: { _id: 0 } }).toArray()) as CardEvent[];
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

/** One training per deal (its latest card), with every training day — for the Overview, the calendar and the ticker. */
function boardTraining(c: CardView, board: BoardTraining["board"]): BoardTraining | null {
  const s = c.schedule;
  if (!s) return null;
  return {
    id: c.id,
    board,
    docNumber: c.docNumber ?? "",
    customerName: c.name,
    alias: c.certLocation || undefined,
    training: c.training.map((t) => t.name).join(", "),
    people: board === "aed" ? 0 : c.training.reduce((n, t) => n + (t.qty || 0), 0),
    dates: [...new Set(s.dates.map((d) => d.slice(0, 10)))].sort(),
    time: board === "aed" ? s.dates[0]?.slice(11, 16) || undefined : undefined,
    trainers: s.trainers,
    status: s.completed ? "completed" : s.status,
  };
}

export async function boardTrainings(snap: Snap): Promise<{ board: BoardTraining[]; aedBoard: BoardTraining[]; aedWaiting: number }> {
  const { board, aedBoard } = await boardsNow(snap, true);
  const live = (c: CardView) => !c.mergedInto && !c.deleted && !c.lost && !isCustomerCard(c.kind);
  const list = [...board.cards.values()].filter(live).map((c) => boardTraining(c, "training")).filter((t): t is BoardTraining => t !== null);
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
