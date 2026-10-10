import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { signedInMember, unauthorized } from "./auth";
import { boardsFor } from "./roles";
import { buildBoard, buildFulfillmentBoard, cardCustomers, customerAliases, customerContacts, customerNameKeys, type CardView } from "./pipeline";
import { aedData, getSnapshot, pipelineData } from "./zohoSync";
import type { CardEvent } from "./types";

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

/** The Fulfillment card with this id, as the board shows it right now. */
export async function fulfilCard(id: string): Promise<CardView | undefined> {
  const snap = await getSnapshot();
  if (!snap) return undefined;
  const d = pipelineData(snap);
  const aed = aedData(snap).invoices;
  const events = (await (await eventsCol()).find({}, { projection: { _id: 0 } }).toArray()) as CardEvent[];
  const customerOf = cardCustomers(d.leads, d.quotes, d.pis, d.invoices, d.payments, aed, events);
  const nameOf = customerNameKeys(d.leads, d.quotes, d.pis, d.invoices, d.payments, aed);
  const board = buildBoard(d.leads, d.quotes, d.pis, d.invoices, d.payments, events, customerAliases(events, customerOf, nameOf), customerContacts(events, customerOf, nameOf));
  return buildFulfillmentBoard(board, events).cards.get(id);
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
