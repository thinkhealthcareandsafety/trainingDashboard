import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { itemSets, type ZItem } from "./zoho";
import { type TrainingQuote, toTrainingQuote } from "./trainingManager";
import { MAX_PEOPLE, type Person, type Proposal, type Stamp, TH_ID, duplicatePhones, indiaToday, readPerson, readProposal, sameProposal, thId } from "./portalRules";

/*
 * The trainings on the Training Manager portal (docs/TRAINING_MANAGER_PLAN.md steps 4–7), for the signed-in coordinator,
 * for participants who join by the QR link, and for our Trainings page.
 *  - portalTrainings (one per training quote, _id = the Zoho estimate id): the coordinator (step 2), their proposal and
 *    the earlier ones (step 5), the join key (step 7), when the login was sent (step 8).
 *  - portalParticipants (_id = TH001…): the training, name, phone, optional email, how they came in, a private token for
 *    their own page. counters "th": the running TH number, never reused.
 * Everything is read from our copy of Zoho (zohoDocs), so no visit calls Zoho. Prices never leave here.
 */

type Coordinator = { name: string; email: string; phone: string; contactPersonId?: string };
export type TrainingDoc = {
  _id: string; customerId?: string; coordinator?: Coordinator;
  proposal?: Proposal; history?: Proposal[]; joinKey?: string; loginSentAt?: string; createdAt?: string; updatedAt?: string;
};
export type Source = "typed" | "excel" | "qr";
type ParticipantDoc = { _id: string; trainingId: string; name: string; phone: string; email?: string; source: Source; token: string; addedAt: string };

const trainingsCol = async () => (await db()).collection<TrainingDoc>("portalTrainings");
const peopleCol = async () => (await db()).collection<ParticipantDoc>("portalParticipants");
const countersCol = async () => (await db()).collection<{ _id: string; n: number }>("counters");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const newKey = () => randomBytes(9).toString("base64url");
type Fail = { error: string; status: number };

/** The training quotes with these ids, from our copy of Zoho (declined ones left out). */
async function quotes(ids: Set<string>): Promise<Map<string, TrainingQuote>> {
  if (!ids.size) return new Map();
  const d = await db();
  const items = ((await d.collection<{ _id: string; items?: ZItem[] }>("kv").findOne({ _id: "zoho_items" }))?.items) ?? [];
  const training = itemSets(items).training;
  const docs = (await d.collection<{ _id: string; kind?: string; doc: Record<string, unknown> }>("zohoDocs")
    .find({ kind: "estimates", "doc.estimate_id": { $in: [...ids] } }, { projection: { doc: 1, kind: 1 } }).toArray())
    .filter((x) => ids.has(String(x.doc?.estimate_id ?? "")) && String(x.doc?.status ?? "") !== "declined");
  return new Map(docs.map((x) => { const q = toTrainingQuote(x.doc, training); return [q.id, q]; }));
}

/** The estimate id of a Training Number (the quote number), or null. */
async function idOfNumber(number: string): Promise<string | null> {
  if (!number || number.length > 60) return null;
  const docs = await (await db()).collection<{ _id: string; kind?: string; doc: Record<string, unknown> }>("zohoDocs")
    .find({ kind: "estimates", "doc.estimate_number": number }, { projection: { doc: 1, kind: 1 } }).toArray();
  const hit = docs.find((x) => String(x.doc?.estimate_number ?? "") === number);
  return hit ? String(hit.doc.estimate_id) : null;
}

const stampOf = (t: TrainingDoc): Stamp => (t.proposal ? "Proposed" : "Awaiting date");
const titleOf = (q: TrainingQuote) => q.lines.map((l) => l.name).join(" + ") || "Training";

async function peopleOf(trainingId: string): Promise<ParticipantDoc[]> {
  return (await (await peopleCol()).find({ trainingId }).toArray()).filter((p) => p.trainingId === trainingId)
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt) || a._id.localeCompare(b._id));
}

/* ---------------- The coordinator's view ---------------- */

export type PortalTraining = {
  id: string; number: string; customer: string; date: string;
  lines: { name: string; description: string; qty: number }[];
  expected: number; stamp: Stamp; proposal: Proposal | null; history: Proposal[]; joinKey: string; registered: number;
};

/** The trainings this coordinator was named on (step 2), newest first. A join key is made the first time they're shown. */
export async function trainingsFor(email: string): Promise<PortalTraining[]> {
  const col = await trainingsCol();
  const mine = (await col.find({ "coordinator.email": email }).toArray()).filter((p) => (p.coordinator?.email ?? "").toLowerCase() === email);
  const q = await quotes(new Set(mine.map((p) => p._id)));
  const out: PortalTraining[] = [];
  for (const t of mine) {
    const x = q.get(t._id);
    if (!x) continue;
    let joinKey = t.joinKey;
    if (!joinKey) { joinKey = newKey(); await col.updateOne({ _id: t._id }, { $set: { joinKey } }); }
    out.push({
      id: x.id, number: x.number, customer: x.customer, date: x.date,
      lines: x.lines.map((l) => ({ name: l.name, description: l.description, qty: l.qty })),
      expected: x.expected, stamp: stampOf(t), proposal: t.proposal ?? null, history: t.history ?? [], joinKey, registered: (await peopleOf(t._id)).length,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
}

/** The training, when this coordinator may act on it. */
async function own(email: string, id: unknown): Promise<TrainingDoc | null> {
  const t = await (await trainingsCol()).findOne({ _id: String(id ?? "").slice(0, 30) });
  return t && (t.coordinator?.email ?? "").toLowerCase() === email ? t : null;
}
const notYours: Fail = { error: "That training isn't on your list", status: 404 };

/** Step 5: the coordinator proposes (or changes) the dates, location and headcount. The earlier proposal is kept. */
export async function propose(email: string, id: unknown, raw: unknown): Promise<{ ok: true; proposal: Proposal } | Fail> {
  const t = await own(email, id);
  if (!t) return notYours;
  const p = readProposal(raw, indiaToday());
  if ("error" in p) return { error: p.error, status: 400 };
  if (t.proposal && sameProposal(t.proposal, p)) return { ok: true, proposal: t.proposal };
  const proposal: Proposal = { ...p, at: new Date().toISOString(), by: email };
  const history = t.proposal ? [...(t.history ?? []), t.proposal].slice(-20) : t.history ?? [];
  await (await trainingsCol()).updateOne({ _id: t._id }, { $set: { proposal, history, updatedAt: proposal.at } });
  return { ok: true, proposal };
}

export type ParticipantView = { th: string; name: string; phone: string; email: string; source: Source; addedAt: string; duplicate: boolean };
const view = (list: ParticipantDoc[]): ParticipantView[] => {
  const dup = duplicatePhones(list);
  return list.map((p) => ({ th: p._id, name: p.name, phone: p.phone, email: p.email ?? "", source: p.source, addedAt: p.addedAt, duplicate: dup.has(p.phone) }));
};

export async function participants(email: string, id: unknown): Promise<{ list: ParticipantView[] } | Fail> {
  const t = await own(email, id);
  return t ? { list: view(await peopleOf(t._id)) } : notYours;
}

/** A block of TH numbers (one call for a whole import). */
async function nextTh(count: number): Promise<string[]> {
  const r = await (await countersCol()).findOneAndUpdate({ _id: "th" }, { $inc: { n: count } }, { upsert: true, returnDocument: "after" });
  const last = (r as { n?: number } | null)?.n ?? count;
  return Array.from({ length: count }, (_, i) => thId(last - count + 1 + i));
}

async function insertPeople(trainingId: string, people: Person[], source: Source): Promise<ParticipantDoc[]> {
  const ids = await nextTh(people.length);
  const at = new Date().toISOString();
  const docs = people.map((p, i) => ({ _id: ids[i], trainingId, name: p.name, phone: p.phone, ...(p.email ? { email: p.email } : {}), source, token: newKey(), addedAt: at }));
  const col = await peopleCol();
  for (const doc of docs) await col.insertOne(doc);
  return docs;
}

/** Step 6: typed rows or an Excel/CSV import, each person checked (the file is read in their browser). */
export async function addPeople(email: string, id: unknown, raw: unknown, sourceRaw: unknown): Promise<{ added: number; list: ParticipantView[] } | Fail> {
  const t = await own(email, id);
  if (!t) return notYours;
  const source: Source = sourceRaw === "excel" ? "excel" : "typed";
  const rows = Array.isArray(raw) ? raw : [];
  const people: Person[] = [];
  for (const [i, r] of rows.entries()) {
    const p = readPerson(r);
    if ("error" in p) return { error: rows.length > 1 ? `Row ${i + 1}: ${p.error}` : p.error, status: 400 };
    people.push(p);
  }
  if (!people.length) return { error: "Add at least one person", status: 400 };
  const have = await peopleOf(t._id);
  if (have.length + people.length > MAX_PEOPLE) return { error: `A training's list holds at most ${MAX_PEOPLE} people`, status: 400 };
  await insertPeople(t._id, people, source);
  return { added: people.length, list: view(await peopleOf(t._id)) };
}

export async function removePerson(email: string, id: unknown, th: unknown): Promise<{ list: ParticipantView[] } | Fail> {
  const t = await own(email, id);
  if (!t) return notYours;
  const p = await (await peopleCol()).findOne({ _id: String(th ?? "") });
  if (!p || p.trainingId !== t._id) return { error: "That person isn't on this list", status: 404 };
  await (await peopleCol()).deleteOne({ _id: p._id });
  return { list: view(await peopleOf(t._id)) };
}

/** Step 7: a new join link; the old one stops working. */
export async function newJoinKey(email: string, id: unknown): Promise<{ joinKey: string } | Fail> {
  const t = await own(email, id);
  if (!t) return notYours;
  const joinKey = newKey();
  await (await trainingsCol()).updateOne({ _id: t._id }, { $set: { joinKey } });
  return { joinKey };
}

/* ---------------- Participants: the join page and their own page ---------------- */

/** The training behind a join link, or null when the link is wrong or was replaced. */
async function byJoinLink(number: unknown, key: unknown): Promise<{ t: TrainingDoc; q: TrainingQuote } | null> {
  const id = await idOfNumber(String(number ?? ""));
  if (!id) return null;
  const t = await (await trainingsCol()).findOne({ _id: id });
  const k = String(key ?? "");
  if (!t?.joinKey || !k || !same(t.joinKey, k)) return null;
  const q = (await quotes(new Set([id]))).get(id);
  return q ? { t, q } : null;
}

export async function joinInfo(number: unknown, key: unknown): Promise<{ training: string; customer: string; coordinator: string } | null> {
  const j = await byJoinLink(number, key);
  return j ? { training: titleOf(j.q), customer: j.q.customer, coordinator: j.t.coordinator?.name ?? "" } : null;
}

/** Someone joins by the QR link. The same phone twice on one training gets their existing page back. */
export async function join(number: unknown, key: unknown, raw: unknown): Promise<{ th: string; token: string; name: string; existed: boolean } | Fail> {
  const j = await byJoinLink(number, key);
  if (!j) return { error: "This link has changed. Ask your training coordinator for the new one.", status: 404 };
  const p = readPerson(raw);
  if ("error" in p) return { error: p.error, status: 400 };
  const have = await peopleOf(j.t._id);
  const already = have.find((x) => x.phone === p.phone);
  if (already) return { th: already._id, token: already.token, name: already.name, existed: true };
  if (have.length >= MAX_PEOPLE) return { error: "This training's list is full. Please speak to your training coordinator.", status: 409 };
  const [doc] = await insertPeople(j.t._id, [p], "qr");
  return { th: doc._id, token: doc.token, name: doc.name, existed: false };
}

export type ParticipantPage = { th: string; name: string; number: string; training: string; customer: string; dates: Proposal["dates"]; tentative: boolean; location: string };

/** A participant's own page (no login; the private token in their link). Shows nothing about anyone else. */
export async function participantPage(number: unknown, th: unknown, token: unknown): Promise<ParticipantPage | null> {
  const id = String(th ?? "").toUpperCase();
  if (!TH_ID.test(id)) return null;
  const p = await (await peopleCol()).findOne({ _id: id });
  const k = String(token ?? "");
  if (!p || !k || !same(p.token, k)) return null;
  const t = await (await trainingsCol()).findOne({ _id: p.trainingId });
  const q = (await quotes(new Set([p.trainingId]))).get(p.trainingId);
  if (!t || !q || (number && String(number) !== q.number)) return null;
  return { th: p._id, name: p.name, number: q.number, training: titleOf(q), customer: q.customer, dates: t.proposal?.dates ?? [], tentative: t.proposal?.tentative ?? false, location: t.proposal?.location ?? "" };
}

/* ---------------- Our side: the Trainings page ---------------- */

export type PortalStatus = "No coordinator" | "Login not sent" | "Login sent" | "Logged in" | "Date proposed";
export type StaffPortal = { status: PortalStatus; proposal: Proposal | null; history: Proposal[]; registered: number; loginSentAt: string | null; lastLogin: string | null };

/** Each training's portal state, for the Trainings page list. */
export async function staffPortal(ids: string[]): Promise<Map<string, StaffPortal>> {
  const d = await db();
  const want = new Set(ids);
  const docs = (await (await trainingsCol()).find({ _id: { $in: ids } }).toArray()).filter((t) => want.has(t._id));
  const emails = docs.map((t) => (t.coordinator?.email ?? "").toLowerCase()).filter(Boolean);
  const logins = new Map((await d.collection<{ _id: string; lastLogin?: string }>("portalLogins").find({ _id: { $in: emails } }, { projection: { lastLogin: 1 } }).toArray()).map((l) => [l._id, l.lastLogin ?? null]));
  const counts = new Map<string, number>();
  for (const p of await (await peopleCol()).find({ trainingId: { $in: ids } }, { projection: { trainingId: 1 } }).toArray()) if (want.has(p.trainingId)) counts.set(p.trainingId, (counts.get(p.trainingId) ?? 0) + 1);
  const out = new Map<string, StaffPortal>();
  for (const t of docs) {
    const lastLogin = logins.get((t.coordinator?.email ?? "").toLowerCase()) ?? null;
    const status: PortalStatus = !t.coordinator ? "No coordinator" : t.proposal ? "Date proposed" : lastLogin ? "Logged in" : t.loginSentAt ? "Login sent" : "Login not sent";
    out.set(t._id, { status, proposal: t.proposal ?? null, history: t.history ?? [], registered: counts.get(t._id) ?? 0, loginSentAt: t.loginSentAt ?? null, lastLogin });
  }
  return out;
}

/** A training's attendee list for our side (the Trainings page; downloadable). */
export async function staffParticipants(id: string): Promise<ParticipantView[]> {
  return view(await peopleOf(String(id).slice(0, 30)));
}

/** Step 8: the login went to the coordinator. */
export async function markLoginSent(id: string): Promise<void> {
  await (await trainingsCol()).updateOne({ _id: id }, { $set: { loginSentAt: new Date().toISOString() } });
}

export async function trainingDoc(id: string): Promise<TrainingDoc | null> {
  return (await trainingsCol()).findOne({ _id: String(id).slice(0, 30) });
}

/** One training quote from our copy of Zoho (the Trainings page's Send login and coordinator). */
export async function quoteOf(id: string): Promise<TrainingQuote | null> {
  const key = String(id).slice(0, 30);
  return (await quotes(new Set([key]))).get(key) ?? null;
}

/** Our side sets (or changes) a training's coordinator — for quotes made in Zoho, which never had the email step. */
export async function setCoordinator(id: string, customerId: string, co: Coordinator): Promise<void> {
  const at = new Date().toISOString();
  const col = await trainingsCol();
  const had = await col.findOne({ _id: id });
  const { _id: _, ...rest } = had ?? { _id: id };
  await col.replaceOne({ _id: id }, { ...rest, customerId, coordinator: co, updatedAt: at, createdAt: had?.createdAt ?? at }, { upsert: true });
}
