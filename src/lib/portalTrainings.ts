import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { itemSets, type ZItem } from "./zoho";
import { type TrainingQuote, isTrainingOnly, toTrainingQuote } from "./trainingManager";
import { booksApi } from "./quotations";
import { MAX_PEOPLE, type Person, type Proposal, type ProposalDate, type Stamp, TH_ID, duplicatePhones, fmtProposalDate, indiaToday, readPerson, readProposal, readReason, sameProposal, thId } from "./portalRules";
import { cleanPhone } from "./trainingManager";
import { type CurrentDates, type DayWindow, type Mark, attendanceId, attendanceWindow, currentDates, presentByDay, presentByPerson, registrationOpen, tickableDay } from "./attendanceRules";
import { boardScheduleFor } from "./boardDates";

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
  /** Accept date → Performa (owner, 12 Nov): we accepted the proposal and made the Draft Performa from the quote. */
  confirmed?: Confirmed;
  /** The coordinator rejected the quotation (owner, 12 Nov); zoho: whether Zoho marked it Declined. Only we can reopen it. */
  rejected?: Rejected;
  /** The key in the login email's "Decline the quotation" link (owner, 12 Nov: decline straight from the email). */
  declineKey?: string;
  /** The quote as Zoho had it, read when it wasn't in our hourly copy yet (owner, 12 Nov: a new quote didn't show). */
  quoteDoc?: Record<string, unknown>;
  /** The key in the fixed attendance QR (owner, 13 Nov); made once the training is confirmed; New QR replaces it. */
  attendKey?: string;
};
export type Rejected = { at: string; by: string; reason: string; zoho: "declined" | "failed" };
/**
 * `at`/`by`: Convert to PI made the Draft Performa (the coordinator's date is fixed from then). `zohoAt`/`zohoBy`: Mark
 * confirmed (owner, 13 Nov) — Confirmed in Zoho; only then the portal stamps Confirmed. `board`: what Mark confirmed did on
 * the Training board.
 */
export type Confirmed = { at: string; by: string; salesorderId: string; number: string; emailedAt?: string; zohoAt?: string; zohoBy?: string; board?: BoardResult };
export type BoardResult = { state: "scheduled" | "skipped" | "failed" | "notlive"; note: string; at: string; value?: string };
/** How a participant got on the list; "walkin": registered on the day by the attendance QR (owner, 13 Nov). */
export type Source = "typed" | "excel" | "qr" | "walkin";
type ParticipantDoc = { _id: string; trainingId: string; name: string; phone: string; email?: string; source: Source; token: string; addedAt: string };

const trainingsCol = async () => (await db()).collection<TrainingDoc>("portalTrainings");
const peopleCol = async () => (await db()).collection<ParticipantDoc>("portalParticipants");
const countersCol = async () => (await db()).collection<{ _id: string; n: number }>("counters");
/** portalAttendance (_id = "TH001:2026-12-04"): one tick per person per training day. */
const attendCol = async () => (await db()).collection<Mark>("portalAttendance");
async function marksOf(trainingId: string): Promise<Mark[]> {
  return (await (await attendCol()).find({ trainingId }).toArray()).filter((m) => m.trainingId === trainingId);
}
/** The training's days now: the coordinator's, or after Mark confirmed the Training board's (attendanceRules.currentDates). */
async function datesOf(t: TrainingDoc): Promise<CurrentDates> {
  const confirmed = Boolean(t.confirmed?.zohoAt);
  return currentDates(t.proposal?.dates ?? [], confirmed, confirmed ? await boardScheduleFor(t.confirmed?.salesorderId) : null);
}
const daysOf = (c: CurrentDates) => c.dates.map((d) => d.date);
const fmtDay = (day: string) => fmtProposalDate({ date: day, time: "" });
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const newKey = () => randomBytes(9).toString("base64url");
type Fail = { error: string; status: number };

/** The training quotes with these ids, from our copy of Zoho (declined ones too: they show as Rejected). */
async function quotes(ids: Set<string>): Promise<Map<string, TrainingQuote>> {
  if (!ids.size) return new Map();
  const d = await db();
  const training = await trainingItems();
  const docs = (await d.collection<{ _id: string; kind?: string; doc: Record<string, unknown> }>("zohoDocs")
    .find({ kind: "estimates", "doc.estimate_id": { $in: [...ids] } }, { projection: { doc: 1, kind: 1 } }).toArray())
    .filter((x) => ids.has(String(x.doc?.estimate_id ?? "")));
  const out = new Map(docs.map((x) => { const q = toTrainingQuote(x.doc, training); return [q.id, q]; }));
  // A quote made since the last hourly sync isn't in the copy yet: its snapshot, or read from Zoho now and kept.
  for (const id of ids) {
    if (out.has(id)) continue;
    const doc = await snapshot(id);
    if (doc) out.set(id, toTrainingQuote(doc, training));
  }
  return out;
}

const trainingItems = async () => itemSets(((await (await db()).collection<{ _id: string; items?: ZItem[] }>("kv").findOne({ _id: "zoho_items" }))?.items) ?? []).training;

/** The quote's snapshot (kept when it wasn't in our copy yet), read from Zoho the first time. null when Zoho can't say. */
async function snapshot(id: string): Promise<Record<string, unknown> | null> {
  const col = await trainingsCol();
  const t = await col.findOne({ _id: id });
  if (t?.quoteDoc) return t.quoteDoc;
  if (!t) return null;
  try {
    const e = (await booksApi("GET", `/estimates/${id}`)).estimate as Record<string, unknown> | undefined;
    if (!e?.estimate_id) return null;
    await col.updateOne({ _id: id }, { $set: { quoteDoc: e } });
    return e;
  } catch (err) {
    console.error("[portal] couldn't read a new quote from Zoho:", err);
    return null;
  }
}

/** Training-only quotes with a coordinator that our hourly copy doesn't have yet (for the Trainings page). */
export async function newerQuotes(have: Set<string>): Promise<TrainingQuote[]> {
  const training = await trainingItems();
  const out: TrainingQuote[] = [];
  for (const t of await (await trainingsCol()).find({}).toArray()) {
    if (have.has(t._id) || !t.coordinator) continue;
    const doc = await snapshot(t._id);
    if (doc && isTrainingOnly(doc, training)) out.push(toTrainingQuote(doc, training));
  }
  return out;
}

/** The estimate id of a Training Number (the quote number), or null. */
async function idOfNumber(number: string): Promise<string | null> {
  if (!number || number.length > 60) return null;
  const docs = await (await db()).collection<{ _id: string; kind?: string; doc: Record<string, unknown> }>("zohoDocs")
    .find({ kind: "estimates", "doc.estimate_number": number }, { projection: { doc: 1, kind: 1 } }).toArray();
  const hit = docs.find((x) => String(x.doc?.estimate_number ?? "") === number);
  if (hit) return String(hit.doc.estimate_id);
  const snap = (await (await trainingsCol()).find({ "quoteDoc.estimate_number": number }).toArray()).find((t) => String(t.quoteDoc?.estimate_number ?? "") === number);
  return snap ? snap._id : null;
}

/** The Zoho estimate id behind a Training Number (the attendance route keys its cookie on it). */
export const idOfTrainingNumber = (number: unknown) => idOfNumber(String(number ?? "").slice(0, 60));

const stampOf = (t: TrainingDoc, quoteStatus = "", completedAt: string | null = null): Stamp => (t.rejected || (quoteStatus === "declined" && !t.confirmed) ? "Rejected" : t.confirmed?.zohoAt ? (completedAt ? "Completed" : "Confirmed") : t.proposal ? "Accepted" : "Awaiting decision");
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
  /** When we marked it Confirmed (in Zoho). `locked`: the Performa is made, so the date can't change from the portal. */
  confirmedAt: string | null; locked: boolean;
  rejected: { at: string; reason: string } | null;
  /** The training's days now (after Mark confirmed: the Training board's), the coordinator's when the board moved them, trainers. */
  dates: ProposalDate[]; datesWas: ProposalDate[] | null; tbd: boolean; trainers: string[]; completedAt: string | null;
  /** The fixed attendance QR's key (confirmed trainings only, else ""); where attendance stands today; how many came. */
  attendKey: string; window: DayWindow; attended: number;
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
    let attendKey = t.attendKey ?? "";
    if (t.confirmed?.zohoAt && !attendKey) { attendKey = newKey(); await col.updateOne({ _id: t._id }, { $set: { attendKey } }); }
    const cur = await datesOf(t);
    const marks = t.confirmed?.zohoAt ? await marksOf(t._id) : [];
    out.push({
      id: x.id, number: x.number, customer: x.customer, date: x.date,
      lines: x.lines.map((l) => ({ name: l.name, description: l.description, qty: l.qty })),
      expected: x.expected, stamp: stampOf(t, x.status, cur.completedAt), proposal: t.proposal ?? null, history: t.history ?? [], joinKey, registered: (await peopleOf(t._id)).length, confirmedAt: t.confirmed?.zohoAt ?? null, locked: Boolean(t.confirmed),
      rejected: t.rejected ? { at: t.rejected.at, reason: t.rejected.reason } : x.status === "declined" && !t.confirmed ? { at: "", reason: "" } : null,
      dates: cur.dates, datesWas: cur.was, tbd: cur.tbd, trainers: cur.trainers, completedAt: cur.completedAt,
      attendKey: t.confirmed?.zohoAt ? attendKey : "", window: attendanceWindow(daysOf(cur), indiaToday()), attended: presentByPerson(marks).size,
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
export async function propose(email: string, id: unknown, raw: unknown, acceptInZoho?: (estimateId: string) => Promise<void>): Promise<{ ok: true; proposal: Proposal } | Fail> {
  const t = await own(email, id);
  if (!t) return notYours;
  if (t.confirmed) return { error: "Think Health has confirmed this date. To change it, write to learn@thinkhealth.in.", status: 409 };
  if (t.rejected) return { error: "You declined this quotation. To go ahead after all, write to learn@thinkhealth.in.", status: 409 };
  const p = readProposal(raw, indiaToday());
  if ("error" in p) return { error: p.error, status: 400 };
  if (t.proposal && sameProposal(t.proposal, p)) return { ok: true, proposal: t.proposal };
  const proposal: Proposal = { ...p, at: new Date().toISOString(), by: email };
  const history = t.proposal ? [...(t.history ?? []), t.proposal].slice(-20) : t.history ?? [];
  await (await trainingsCol()).updateOne({ _id: t._id }, { $set: { proposal, history, updatedAt: proposal.at } });
  // The coordinator accepted: Zoho marks the quote Accepted (only then can it become a sales order). A Zoho problem
  // doesn't lose their acceptance; Confirm tries again.
  if (!t.proposal && acceptInZoho) await acceptInZoho(t._id).catch((e) => console.error("[portal] couldn't mark the quote Accepted in Zoho:", e));
  return { ok: true, proposal };
}

/** `present`: the training days they were marked present on. */
export type ParticipantView = { th: string; name: string; phone: string; email: string; source: Source; addedAt: string; duplicate: boolean; present: string[] };
const view = (list: ParticipantDoc[], marks: Mark[] = []): ParticipantView[] => {
  const dup = duplicatePhones(list);
  const present = presentByPerson(marks);
  return list.map((p) => ({ th: p._id, name: p.name, phone: p.phone, email: p.email ?? "", source: p.source, addedAt: p.addedAt, duplicate: dup.has(p.phone), present: present.get(p._id) ?? [] }));
};

/** The list, with attendance once the training is confirmed: the days, and where attendance stands today. */
export type PeopleResult = { list: ParticipantView[]; days: string[]; window: DayWindow; attendance: boolean };
async function peopleResult(t: TrainingDoc): Promise<PeopleResult> {
  const attendance = Boolean(t.confirmed?.zohoAt);
  const days = attendance ? daysOf(await datesOf(t)) : [];
  return { list: view(await peopleOf(t._id), attendance ? await marksOf(t._id) : []), days, window: attendanceWindow(days, indiaToday()), attendance };
}

export async function participants(email: string, id: unknown): Promise<PeopleResult | Fail> {
  const t = await own(email, id);
  return t ? peopleResult(t) : notYours;
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
export async function addPeople(email: string, id: unknown, raw: unknown, sourceRaw: unknown): Promise<({ added: number; already: number } & PeopleResult) | Fail> {
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
  // One person per phone number on a training (owner, 12 Nov): numbers already on the list, or twice in this batch, are skipped.
  const seen = new Set(have.map((p) => p.phone));
  const fresh = people.filter((p) => (seen.has(p.phone) ? false : (seen.add(p.phone), true)));
  if (have.length + fresh.length > MAX_PEOPLE) return { error: `A training's list holds at most ${MAX_PEOPLE} people`, status: 400 };
  if (fresh.length) await insertPeople(t._id, fresh, source);
  return { added: fresh.length, already: people.length - fresh.length, ...(await peopleResult(t)) };
}

export async function removePerson(email: string, id: unknown, th: unknown): Promise<PeopleResult | Fail> {
  const t = await own(email, id);
  if (!t) return notYours;
  const p = await (await peopleCol()).findOne({ _id: String(th ?? "") });
  if (!p || p.trainingId !== t._id) return { error: "That person isn't on this list", status: 404 };
  // Someone marked present stays on the list (owner, 13 Nov): untick them first.
  if ((await marksOf(t._id)).some((m) => m.th === p._id)) return { error: `${p.name} is marked present. Untick their attendance first.`, status: 409 };
  await (await peopleCol()).deleteOne({ _id: p._id });
  return peopleResult(t);
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
  if (!t?.joinKey || !k || !same(t.joinKey, k) || t.rejected) return null;
  const q = (await quotes(new Set([id]))).get(id);
  return q ? { t, q } : null;
}

export async function joinInfo(number: unknown, key: unknown): Promise<{ training: string; customer: string; coordinator: string; closed: boolean } | null> {
  const j = await byJoinLink(number, key);
  return j ? { training: titleOf(j.q), customer: j.q.customer, coordinator: j.t.coordinator?.name ?? "", closed: !registrationOpen(daysOf(await datesOf(j.t)), indiaToday()) } : null;
}

/** Someone joins by the QR link. The same phone twice on one training gets their existing page back. */
export async function join(number: unknown, key: unknown, raw: unknown): Promise<{ th: string; token: string; name: string; existed: boolean } | Fail> {
  const j = await byJoinLink(number, key);
  if (!j) return { error: "This link has changed. Ask your training coordinator for the new one.", status: 404 };
  // Registration closes once the training is over (owner, 13 Nov); on the day, the attendance QR registers walk-ins.
  if (!registrationOpen(daysOf(await datesOf(j.t)), indiaToday())) return { error: "Registration for this training has closed.", status: 409 };
  const p = readPerson(raw);
  if ("error" in p) return { error: p.error, status: 400 };
  const have = await peopleOf(j.t._id);
  const already = have.find((x) => x.phone === p.phone);
  if (already) return { th: already._id, token: already.token, name: already.name, existed: true };
  if (have.length >= MAX_PEOPLE) return { error: "This training's list is full. Please speak to your training coordinator.", status: 409 };
  const [doc] = await insertPeople(j.t._id, [p], "qr");
  return { th: doc._id, token: doc.token, name: doc.name, existed: false };
}

/** `present`: the days they were marked present; `dates` follow the Training board once confirmed. */
export type ParticipantPage = { th: string; name: string; number: string; training: string; customer: string; dates: Proposal["dates"]; tentative: boolean; location: string; tbd: boolean; present: string[]; confirmed: boolean };

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
  const cur = await datesOf(t);
  const confirmed = Boolean(t.confirmed?.zohoAt);
  const present = confirmed ? (await marksOf(t._id)).filter((m) => m.th === p._id).map((m) => m.day).sort() : [];
  return {
    th: p._id, name: p.name, number: q.number, training: titleOf(q), customer: q.customer, dates: cur.dates,
    tentative: !confirmed && (t.proposal?.tentative ?? false), location: t.proposal?.location ?? "", tbd: cur.tbd, present, confirmed,
  };
}

/* ---------------- Attendance on the day (owner, 13 Nov) ---------------- */

/*
 * The coordinator's fixed attendance QR opens /<number>/attend?k=<key>. It works on the training's days only (India
 * time, all day). Attendees give their mobile number (the phone remembers them after: a cookie per training holding their
 * TH number and private token), someone not on the list registers there as a walk-in, then they press Present. One tick
 * per person per day; the coordinator can tick and untick too.
 */
type AttendLink = { t: TrainingDoc; q: TrainingQuote; cur: CurrentDates; win: DayWindow };
async function byAttendLink(number: unknown, key: unknown): Promise<AttendLink | null> {
  const id = await idOfNumber(String(number ?? ""));
  if (!id) return null;
  const t = await (await trainingsCol()).findOne({ _id: id });
  const k = String(key ?? "");
  if (!t?.attendKey || !k || !same(t.attendKey, k) || t.rejected || !t.confirmed?.zohoAt) return null;
  const q = (await quotes(new Set([id]))).get(id);
  if (!q) return null;
  const cur = await datesOf(t);
  return { t, q, cur, win: attendanceWindow(daysOf(cur), indiaToday()) };
}
const badAttendLink: Fail = { error: "This attendance code has changed. Please scan the one your training coordinator is showing.", status: 404 };
/** What the attendance page says when it isn't a training day. */
export const shutText = (w: DayWindow) =>
  w.state === "before" ? `Attendance opens on ${fmtDay(w.next)}.` : w.state === "after" ? "Attendance for this training has closed." : "The training date isn't set yet. Please speak to your training coordinator.";

export type AttendMe = { th: string; name: string; presentToday: boolean };
export type AttendInfo = { training: string; customer: string; coordinator: string; dates: ProposalDate[]; window: DayWindow; shut: string; me: AttendMe | null };
type Cookie = { th: string; token: string } | null;

/** The person the phone remembers, when they're still on this training's list. */
async function remembered(j: AttendLink, c: Cookie): Promise<ParticipantDoc | null> {
  if (!c) return null;
  const p = await (await peopleCol()).findOne({ _id: c.th });
  return p && p.trainingId === j.t._id && same(p.token, c.token) ? p : null;
}
async function meOf(j: AttendLink, p: ParticipantDoc): Promise<AttendMe> {
  const day = j.win.state === "open" ? j.win.day : "";
  const marked = day ? await (await attendCol()).findOne({ _id: attendanceId(p._id, day) }) : null;
  return { th: p._id, name: p.name, presentToday: Boolean(marked) };
}

export async function attendInfo(number: unknown, key: unknown, c: Cookie): Promise<AttendInfo | null> {
  const j = await byAttendLink(number, key);
  if (!j) return null;
  const p = await remembered(j, c);
  return {
    training: titleOf(j.q), customer: j.q.customer, coordinator: j.t.coordinator?.name ?? "", dates: j.cur.dates, window: j.win,
    shut: j.win.state === "open" ? "" : shutText(j.win), me: p ? await meOf(j, p) : null,
  };
}

/** Their mobile number: on the list → them (and the phone remembers them); not on it → they register as a walk-in. */
export async function attendIdentify(number: unknown, key: unknown, phoneRaw: unknown): Promise<{ me: AttendMe; cookie: { th: string; token: string } } | { register: true } | Fail> {
  const j = await byAttendLink(number, key);
  if (!j) return badAttendLink;
  if (j.win.state !== "open") return { error: shutText(j.win), status: 409 };
  const phone = cleanPhone(String(phoneRaw ?? ""));
  if (!phone) return { error: "Type your 10-digit mobile number", status: 400 };
  const p = (await peopleOf(j.t._id)).find((x) => x.phone === phone);
  return p ? { me: await meOf(j, p), cookie: { th: p._id, token: p.token } } : { register: true };
}

/** A walk-in registers on the day (owner, 13 Nov: tagged "walk-in"). The same number twice gets them back, not twice. */
export async function attendRegister(number: unknown, key: unknown, raw: unknown): Promise<{ me: AttendMe; cookie: { th: string; token: string } } | Fail> {
  const j = await byAttendLink(number, key);
  if (!j) return badAttendLink;
  if (j.win.state !== "open") return { error: shutText(j.win), status: 409 };
  const person = readPerson(raw);
  if ("error" in person) return { error: person.error, status: 400 };
  const have = await peopleOf(j.t._id);
  const already = have.find((x) => x.phone === person.phone);
  if (already) return { me: await meOf(j, already), cookie: { th: already._id, token: already.token } };
  if (have.length >= MAX_PEOPLE) return { error: "This training's list is full. Please speak to your training coordinator.", status: 409 };
  const [doc] = await insertPeople(j.t._id, [person], "walkin");
  return { me: await meOf(j, doc), cookie: { th: doc._id, token: doc.token } };
}

/** Present: today's tick, by the person the phone remembers. Marking twice keeps the first time. */
export async function attendPresent(number: unknown, key: unknown, c: Cookie): Promise<{ th: string; token: string; name: string; already: boolean } | Fail> {
  const j = await byAttendLink(number, key);
  if (!j) return badAttendLink;
  if (j.win.state !== "open") return { error: shutText(j.win), status: 409 };
  const p = await remembered(j, c);
  if (!p) return { error: "Type your mobile number first.", status: 401 };
  const _id = attendanceId(p._id, j.win.day);
  const col = await attendCol();
  const had = await col.findOne({ _id });
  if (!had) await col.insertOne({ _id, trainingId: j.t._id, th: p._id, day: j.win.day, at: new Date().toISOString(), how: "self", by: p._id });
  return { th: p._id, token: p.token, name: p.name, already: Boolean(had) };
}

/** The coordinator ticks or unticks someone, on a training day that has come (not one still ahead). */
export async function tick(email: string, id: unknown, th: unknown, dayRaw: unknown, on: unknown): Promise<PeopleResult | Fail> {
  const t = await own(email, id);
  if (!t) return notYours;
  if (!t.confirmed?.zohoAt) return { error: "Attendance starts once Think Health confirms the training.", status: 409 };
  const days = daysOf(await datesOf(t));
  const day = String(dayRaw ?? "");
  if (!tickableDay(days, day, indiaToday())) return { error: "Attendance can be marked on a training day that has come.", status: 400 };
  const p = await (await peopleCol()).findOne({ _id: String(th ?? "") });
  if (!p || p.trainingId !== t._id) return { error: "That person isn't on this list", status: 404 };
  const _id = attendanceId(p._id, day);
  const col = await attendCol();
  if (on === true) { if (!(await col.findOne({ _id }))) await col.insertOne({ _id, trainingId: t._id, th: p._id, day, at: new Date().toISOString(), how: "coordinator", by: email }); }
  else await col.deleteOne({ _id });
  return peopleResult(t);
}

/** A new attendance QR; the old one stops working (a forwarded copy, a lost printout). */
export async function newAttendKey(email: string, id: unknown): Promise<{ attendKey: string } | Fail> {
  const t = await own(email, id);
  if (!t) return notYours;
  if (!t.confirmed?.zohoAt) return { error: "The attendance QR comes once Think Health confirms the training.", status: 409 };
  const attendKey = newKey();
  await (await trainingsCol()).updateOne({ _id: t._id }, { $set: { attendKey } });
  return { attendKey };
}

/* ---------------- Our side: the Trainings page ---------------- */

export type PortalStatus = "No coordinator" | "Login not sent" | "Login sent" | "Logged in" | "Accepted" | "Performa draft" | "Confirmed" | "Rejected";
/** `attendance`: confirmed trainings only — present per training day (read only here; the coordinator runs it). */
export type StaffPortal = { status: PortalStatus; proposal: Proposal | null; history: Proposal[]; registered: number; loginSentAt: string | null; lastLogin: string | null; confirmed: Confirmed | null; rejected: Rejected | null; attendance: { day: string; present: number }[] | null };

/** Each training's portal state, for the Trainings page list. */
export async function staffPortal(ids: string[]): Promise<Map<string, StaffPortal>> {
  const d = await db();
  const want = new Set(ids);
  const docs = (await (await trainingsCol()).find({ _id: { $in: ids } }).toArray()).filter((t) => want.has(t._id));
  const emails = docs.map((t) => (t.coordinator?.email ?? "").toLowerCase()).filter(Boolean);
  const logins = new Map((await d.collection<{ _id: string; lastLogin?: string }>("portalLogins").find({ _id: { $in: emails } }, { projection: { lastLogin: 1 } }).toArray()).map((l) => [l._id, l.lastLogin ?? null]));
  const counts = new Map<string, number>();
  for (const p of await (await peopleCol()).find({ trainingId: { $in: ids } }, { projection: { trainingId: 1 } }).toArray()) if (want.has(p.trainingId)) counts.set(p.trainingId, (counts.get(p.trainingId) ?? 0) + 1);
  const confirmedIds = new Set(docs.filter((t) => t.confirmed?.zohoAt).map((t) => t._id));
  const marks = confirmedIds.size ? (await (await attendCol()).find({ trainingId: { $in: [...confirmedIds] } }).toArray()).filter((m) => confirmedIds.has(m.trainingId)) : [];
  const out = new Map<string, StaffPortal>();
  for (const t of docs) {
    const lastLogin = logins.get((t.coordinator?.email ?? "").toLowerCase()) ?? null;
    const status: PortalStatus = t.rejected ? "Rejected" : !t.coordinator ? "No coordinator" : t.confirmed?.zohoAt ? "Confirmed" : t.confirmed ? "Performa draft" : t.proposal ? "Accepted" : lastLogin ? "Logged in" : t.loginSentAt ? "Login sent" : "Login not sent";
    const attendance = confirmedIds.has(t._id) ? presentByDay(marks.filter((m) => m.trainingId === t._id), daysOf(await datesOf(t))) : null;
    out.set(t._id, { status, proposal: t.proposal ?? null, history: t.history ?? [], registered: counts.get(t._id) ?? 0, loginSentAt: t.loginSentAt ?? null, lastLogin, confirmed: t.confirmed ?? null, rejected: t.rejected ?? null, attendance });
  }
  return out;
}

/** A training's attendee list for our side (the Trainings page; downloadable), with who was present on which day. */
export async function staffParticipants(id: string): Promise<ParticipantView[]> {
  const key = String(id).slice(0, 30);
  return view(await peopleOf(key), await marksOf(key));
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

/** Convert to PI: the proposal accepted and its Draft Performa noted (the coordinator's date is fixed from now). */
export async function markConfirmed(id: string, c: Confirmed): Promise<void> {
  await (await trainingsCol()).updateOne({ _id: id }, { $set: { confirmed: c, updatedAt: c.at } });
}

/**
 * The Performa was deleted in Zoho (owner, 13 Nov: "since I deleted the PI, everything from here should revert"): the
 * training goes back to Accepted — the coordinator can change the date again, Trainings shows Convert to PI, the portal's
 * Confirmed stamp and attendance go. What it was is kept in `confirmedHistory`.
 */
export async function unconfirm(id: string, why: string): Promise<Confirmed | null> {
  const t = await trainingDoc(id);
  if (!t?.confirmed) return null;
  const at = new Date().toISOString();
  const history = [...(((t as { confirmedHistory?: unknown[] }).confirmedHistory as unknown[]) ?? []), { ...t.confirmed, removedAt: at, why }].slice(-10);
  await (await trainingsCol()).updateOne({ _id: t._id }, { $unset: { confirmed: "" }, $set: { confirmedHistory: history, updatedAt: at } });
  return t.confirmed;
}

/** Mark confirmed (owner, 13 Nov): Confirmed in Zoho — the portal stamps Confirmed. Kept from the first time. */
export async function markZohoConfirmed(id: string, by: string): Promise<string> {
  const t = await trainingDoc(id);
  if (t?.confirmed?.zohoAt) return t.confirmed.zohoAt;
  const at = new Date().toISOString();
  await (await trainingsCol()).updateOne({ _id: id }, { $set: { "confirmed.zohoAt": at, "confirmed.zohoBy": by, updatedAt: at } });
  return at;
}

/** What Mark confirmed did on the Training board. */
export async function markBoard(id: string, board: BoardResult): Promise<void> {
  await (await trainingsCol()).updateOne({ _id: id }, { $set: { "confirmed.board": board } });
}

/** The Performa went out by email from the Trainings page. */
export async function markPerformaEmailed(id: string): Promise<void> {
  await (await trainingsCol()).updateOne({ _id: id }, { $set: { "confirmed.emailedAt": new Date().toISOString() } });
}

/**
 * The coordinator rejects the quotation (owner, 12 Nov): kept with its optional reason; Zoho marks it Declined (`decline`
 * calls Zoho; when that fails the rejection still counts and our side can retry). Not after we confirmed.
 */
export async function reject(email: string, id: unknown, reasonRaw: unknown, decline: (estimateId: string) => Promise<void>): Promise<{ ok: true; zoho: Rejected["zoho"] } | Fail> {
  const t = await own(email, id);
  if (!t) return notYours;
  if (t.confirmed) return { error: "Think Health has already confirmed this training. To cancel, write to learn@thinkhealth.in.", status: 409 };
  if (t.rejected) return { ok: true, zoho: t.rejected.zoho };
  const zoho: Rejected["zoho"] = await decline(t._id).then(() => "declined" as const, (e) => { console.error("[portal] couldn't mark the quote Declined in Zoho:", e); return "failed" as const; });
  await (await trainingsCol()).updateOne({ _id: t._id }, { $set: { rejected: { at: new Date().toISOString(), by: email, reason: readReason(reasonRaw), zoho }, updatedAt: new Date().toISOString() } });
  return { ok: true, zoho };
}

/** Our side retries marking a rejected quote Declined in Zoho. */
export async function markRejectedInZoho(id: string): Promise<void> {
  await (await trainingsCol()).updateOne({ _id: id }, { $set: { "rejected.zoho": "declined" } });
}

/** Our side reopens a rejected quotation (the client changed their mind); Zoho goes back to Sent (`reopenInZoho`). */
export async function reopen(id: string, reopenInZoho: (estimateId: string) => Promise<void>): Promise<{ ok: true } | Fail> {
  const t = await (await trainingsCol()).findOne({ _id: id });
  if (!t?.rejected) return { error: "This quotation isn't rejected", status: 400 };
  if (t.rejected.zoho === "declined") await reopenInZoho(id);
  await (await trainingsCol()).updateOne({ _id: id }, { $unset: { rejected: "" }, $set: { updatedAt: new Date().toISOString() } });
  return { ok: true };
}

/* ---------------- Decline straight from the email (owner, 12 Nov) ---------------- */

/** The training's decline key for the login email's link (made the first time). */
export async function declineKeyFor(id: string): Promise<string> {
  const col = await trainingsCol();
  const t = await col.findOne({ _id: id });
  if (t?.declineKey) return t.declineKey;
  const declineKey = newKey();
  await col.updateOne({ _id: id }, { $set: { declineKey } });
  return declineKey;
}

/** The training behind a decline link, or null when the link is wrong. */
async function byDeclineLink(number: unknown, key: unknown): Promise<{ t: TrainingDoc; q: TrainingQuote } | null> {
  const id = await idOfNumber(String(number ?? ""));
  if (!id) return null;
  const t = await (await trainingsCol()).findOne({ _id: id });
  const k = String(key ?? "");
  if (!t?.declineKey || !k || !same(t.declineKey, k)) return null;
  const q = (await quotes(new Set([id]))).get(id);
  return q ? { t, q } : null;
}

export type DeclineInfo = { training: string; customer: string; number: string; state: "open" | "rejected" | "accepted" | "confirmed" };
/** What the decline page shows (opening the link changes nothing — an email scanner may open it). */
export async function declineInfo(number: unknown, key: unknown): Promise<DeclineInfo | null> {
  const d = await byDeclineLink(number, key);
  if (!d) return null;
  const state = d.t.rejected ? "rejected" : d.t.confirmed ? "confirmed" : d.t.proposal ? "accepted" : "open";
  return { training: titleOf(d.q), customer: d.q.customer, number: d.q.number, state };
}

/** Declined from the email's link: the same as the portal's Decline (Zoho marks it Declined). */
export async function declineByLink(number: unknown, key: unknown, reasonRaw: unknown, decline: (estimateId: string) => Promise<void>): Promise<{ ok: true } | Fail> {
  const d = await byDeclineLink(number, key);
  if (!d) return { error: "This link doesn't work any more. Write to learn@thinkhealth.in.", status: 404 };
  if (d.t.rejected) return { ok: true };
  if (d.t.confirmed) return { error: "Think Health has already confirmed this training. To cancel, write to learn@thinkhealth.in.", status: 409 };
  const email = d.t.coordinator?.email ?? "";
  const r = await reject(email, d.t._id, reasonRaw, decline);
  return "error" in r ? r : { ok: true };
}
