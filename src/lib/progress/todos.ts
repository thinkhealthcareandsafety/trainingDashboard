import type { CardView, buildAedBoard, buildBoard, buildFulfillmentBoard } from "../pipeline";
import type { buildLogisticsBoard } from "../logistics";
import type { CalendarEntry, CardEvent } from "../types";
import { boardsFor, inEntry } from "../roles";
import { CATEGORIES, type Comment, type PtRequest, type Who, isAdminId, isSevere, needsReply } from "./model";

/*
 * Everyone's to-do (Progress tracker, owner 26 Oct: "I need to see what everyone needs to do or is going to do") —
 * read from the boards as they stand, nothing typed in, nothing saved. Pure: the route loads the data.
 *
 *   Shikha             PIs ready to schedule (merged, no training date yet) — "Schedule the training"
 *   Trainers           trainings they give (today / next 7 days)
 *   Who scheduled it   a training whose date has passed and isn't marked completed → "Mark completed or postpone"
 *                      (owner: "pending to be marked complete or pushed if past training date"); an upcoming one with
 *                      no concerned contact number. Not a team member (or nobody) → its trainers.
 *   Priyanka (AED)     AEDs delivered but not contacted, contacted but not scheduled, her AED trainings
 *   Shreya (certs)     gratitude emails to send, replies waiting, certificates to send to Logistics / on hold
 *   Arti (logistics)   AEDs to mark delivered, merges, packing, shipping, deliveries to confirm
 *   Everyone           their meetings / events, requests waiting on them
 * Sales items (quotes, PIs, invoices) are left out (owner: "exclude it"). Window: overdue, today, the next 7 days.
 */

export type TodoBucket = "overdue" | "today" | "week" | "open";
export type TodoTone = "bad" | "warn" | "info" | "ok" | "plain";
export interface Todo {
  id: string;
  who: string; // member id
  tag: string; // what to do: "Give the training", "Mark completed or postpone", …
  title: string; // what it's about: customer / location, request title, meeting
  detail?: string;
  date?: string; // YYYY-MM-DD; none = a step waiting on them now (bucket "open")
  bucket: TodoBucket;
  tone: TodoTone;
  href?: string; // its card on the board, or the calendar
  requestId?: string; // a request — opened on the tracker itself
}

export const WEEK_DAYS = 7;
const addDays = (day: string, n: number) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmtDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
/** "THCAS BLS Training 2025 (I)" → "BLS Training" (as the calendar shows it). */
const shortTraining = (name: string) => name.split(",").map((n) => n.replace(/^THCAS\s+/i, "").replace(/\s*\(I\)\s*$/i, "").replace(/\s+20\d\d\b/, "").trim()).join(", ");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const open = (id: string) => `/follow-up?open=${encodeURIComponent(id)}`;

type Boards = {
  board: ReturnType<typeof buildBoard>;
  aedBoard: ReturnType<typeof buildAedBoard>;
  ful: ReturnType<typeof buildFulfillmentBoard>;
  logi: ReturnType<typeof buildLogisticsBoard>;
};

export function buildTodos(today: string, team: Who[], b: Boards, entries: CalendarEntry[], requests: PtRequest[], comments: Comment[], now: Date): Todo[] {
  const out: Todo[] = [];
  const last = addDays(today, WEEK_DAYS);
  const bucketOf = (date?: string): TodoBucket | null => (!date ? "open" : date < today ? "overdue" : date === today ? "today" : date <= last ? "week" : null);
  const add = (t: Omit<Todo, "bucket">) => { const bucket = bucketOf(t.date); if (bucket) out.push({ ...t, bucket }); };
  const member = (name?: string) => (name ? team.find((m) => same(m.name, name)) : undefined);
  // The people who work one board only: AedSmartx (Priyanka), Fulfillment (Shreya), Logistics (Arti).
  const only = (k: "aed" | "fulfil" | "logistics") => team.filter((m) => !isAdminId(m.id) && boardsFor(m).length === 1 && boardsFor(m)[0] === k);
  const label = (c: CardView) => c.certLocation || c.name;
  const doc = (c: CardView) => c.docNumber ?? "";

  // ---- Training board: trainings (one per deal — its live card) ----
  for (const c of b.board.cards.values()) {
    const s = c.schedule;
    if (c.mergedInto || c.deleted || c.lost || !s || s.completed || s.status === "tbd" || !s.dates.length) continue;
    const days = [...new Set(s.dates.map((d) => d.slice(0, 10)))].sort();
    const trainers = s.trainers.map(member).filter((m): m is Who => Boolean(m));
    const scheduler = member(s.by);
    const owners = scheduler ? [scheduler] : trainers;
    const what = `${shortTraining(c.training.map((t) => t.name).join(", ")) || "Training"} · ${doc(c)}`;
    if (days.at(-1)! < today) {
      for (const m of owners) add({ id: `done:${c.id}:${m.id}`, who: m.id, tag: "Mark completed or postpone", title: label(c), detail: `${what} · was ${days.map(fmtDay).join(", ")}`, date: days.at(-1), tone: "bad", href: open(c.id) });
      continue;
    }
    const next = days.find((d) => d >= today)!;
    for (const m of trainers) add({ id: `give:${c.id}:${m.id}`, who: m.id, tag: "Give the training", title: label(c), detail: `${what}${days.length > 1 ? ` · day ${days.indexOf(next) + 1} of ${days.length}` : ""} · ${s.trainers.map((n) => n.split(" ")[0]).join(", ")}`, date: next, tone: "info", href: open(c.id) });
    if (!c.concernedPhone) for (const m of owners) add({ id: `phone:${c.id}:${m.id}`, who: m.id, tag: "Add the contact number", title: label(c), detail: `${what} · needed for the reminders and to complete it`, date: next, tone: "warn", href: open(c.id) });
  }

  // PIs merged and ready but with no training date yet → Shikha schedules them (owner, 30 Oct: "training scheduling is
  // shikha's work and should show in her tracker"). Waiting on her now (no date); oldest PI first.
  const ready = [...b.board.cards.values()].filter((c) => c.readyToSchedule && !c.mergedInto && !c.deleted && !c.lost).sort((x, y) => (x.docDate ?? "").localeCompare(y.docDate ?? ""));
  for (const m of team.filter((x) => !isAdminId(x.id) && /^shikha\b/i.test(x.name))) {
    for (const c of ready) add({ id: `schedule:${c.id}`, who: m.id, tag: "Schedule the training", title: label(c), detail: `${shortTraining(c.training.map((t) => t.name).join(", ")) || "Training"} · ${doc(c)}${c.docDate ? ` · PI ${fmtDay(c.docDate.slice(0, 10))}` : ""}`, tone: "plain", href: open(c.id) });
  }

  // ---- AedSmartx (Priyanka) ----
  for (const m of only("aed")) {
    for (const c of b.aedBoard.invoiceCards) if (c.delivered) add({ id: `aedcontact:${c.id}`, who: m.id, tag: "Contact the client", title: c.name, detail: `AED delivered ${fmtDay(c.delivered.at.slice(0, 10))} · ${doc(c)}`, tone: "plain", href: open(c.id) });
    for (const c of b.aedBoard.contactedCards) add({ id: `aedschedule:${c.id}`, who: m.id, tag: "Schedule the AED training", title: c.name, detail: `Contacted · ${doc(c)}`, tone: "plain", href: open(c.id) });
  }
  for (const c of b.aedBoard.scheduledCards) {
    const s = c.schedule!;
    if (s.status === "tbd" || !s.dates.length) continue;
    const day = s.dates[0].slice(0, 10);
    const time = s.dates[0].slice(11, 16);
    for (const m of team.filter((x) => !isAdminId(x.id) && /^priyanka\b/i.test(x.name))) {
      if (day < today) add({ id: `aeddone:${c.id}`, who: m.id, tag: "Mark completed or postpone", title: c.name, detail: `AED training · was ${fmtDay(day)}${time ? ` ${time}` : ""}`, date: day, tone: "bad", href: open(c.id) });
      else add({ id: `aedgive:${c.id}`, who: m.id, tag: "AED training", title: c.name, detail: `${time ? `${time} · ` : ""}${doc(c)}`, date: day, tone: "info", href: open(c.id) });
    }
  }

  // ---- Fulfillment (Shreya) ----
  for (const m of only("fulfil")) {
    for (const c of b.ful.completedCards) add({ id: `grat:${c.id}`, who: m.id, tag: "Send the gratitude email", title: label(c), detail: `Trained ${fmtDay(c.schedule?.dates.at(-1)?.slice(0, 10) ?? today)} · or generate from a list`, tone: "plain", href: open(c.id) });
    for (const c of b.ful.gratitudeCards) {
      const f = c.fulfillment!;
      if (f.star) add({ id: `reply:${c.id}`, who: m.id, tag: "Reply received ★", title: label(c), detail: "Read it, then generate the certificates", tone: "warn", href: open(c.id) });
    }
    for (const c of b.ful.generatedCards) {
      const hold = c.fulfillment!.certStatus === "hold";
      add({ id: `stl:${c.id}`, who: m.id, tag: hold ? "Certificates on hold" : "Send to Logistics", title: label(c), detail: `${c.fulfillment!.certs?.rows.length ?? 0} certificates made`, tone: hold ? "warn" : "plain", href: open(c.id) });
    }
  }

  // ---- Logistics (Arti) ----
  for (const m of only("logistics")) {
    for (const c of b.logi.aedCards) if (!c.delivered && !c.logiAed?.hidden) add({ id: `deliver:${c.id}`, who: m.id, tag: "Mark AED delivered", title: c.name, detail: doc(c), tone: "plain", href: open(c.id) });
    for (const c of b.logi.stlCards) if (c.logistics?.partnerId) add({ id: `merge:${c.id}`, who: m.id, tag: "Merge with the payment", title: label(c), detail: `${doc(c)} · paid — certificates here`, tone: "plain", href: open(c.id) });
    for (const c of b.logi.paymentCards) if (c.logistics?.merged) add({ id: `pack:${c.id}`, who: m.id, tag: "Ready for packaging?", title: label(c), detail: doc(c), tone: "plain", href: open(c.id) });
    for (const c of b.logi.packageCards) {
      const hold = c.logistics?.step === "pack_hold";
      add({ id: `packing:${c.id}`, who: m.id, tag: hold ? "Packing on hold" : c.logistics?.step === "pack_process" ? "Packing — ready to dispatch?" : "Start packing", title: label(c), detail: doc(c), tone: hold ? "warn" : "plain", href: open(c.id) });
    }
    for (const c of b.logi.shipmentCards) {
      const st = c.logistics?.step;
      add({ id: `ship:${c.id}`, who: m.id, tag: st === "ship_dispatched" ? "Reached the client?" : st === "ship_hold" ? "Shipment on hold" : "Dispatch", title: label(c), detail: doc(c), tone: st === "ship_hold" ? "warn" : "plain", href: open(c.id) });
    }
    for (const c of b.logi.receivedCards) if (c.logistics?.step === "expected") add({ id: `expected:${c.id}`, who: m.id, tag: "Confirm it reached the client", title: label(c), detail: `Expected ${fmtDay(c.logistics.expected ?? today)}`, date: c.logistics.expected, tone: "plain", href: open(c.id) });
  }

  // ---- Everyone: meetings and events, requests waiting on them ----
  for (const e of entries) {
    if (e.demo || e.date < today || e.date > last) continue;
    for (const m of team) if (inEntry(m, e)) add({ id: `entry:${e.id}:${m.id}`, who: m.id, tag: e.type === "meeting" ? "Meeting" : "Event", title: e.title, detail: [e.allDay ? "All day" : e.startTime, e.linkedCustomer].filter(Boolean).join(" · ") || undefined, date: e.date, tone: "info", href: `/calendar?date=${e.date}&entry=${encodeURIComponent(e.id)}` });
  }
  // Requests: tagged and not answered yet → red "Reply needed" / "Mentioned you" (owner: until they reply or resolve);
  // still waiting on them but already answered → the plain request.
  for (const r of requests) {
    for (const m of team) {
      const needs = needsReply(m.id, m.name, r, comments);
      const waited = r.waitingOnId === m.id && r.status === "open";
      if (!needs && !waited) continue;
      const what = `${CATEGORIES[r.category].label}${r.priority === "urgent" ? " · Urgent" : ""}`;
      add({
        id: `req:${r.id}:${m.id}`, who: m.id, tag: needs ? (waited ? "Reply needed" : "Mentioned you") : what, title: r.task.title,
        detail: `${r.ref} · ${needs ? `${what} · ` : ""}${r.requesterName.split(" ")[0]} ${r.status === "open" ? "is waiting" : "asked"}`,
        tone: needs || isSevere(r, now) ? "bad" : "plain", requestId: r.id,
      });
    }
  }

  // Soonest first in each bucket; undated steps keep the boards' order.
  return out.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
}

/*
 * Work done (owner, 26 Oct: "an auto record of all the work the user has completed, not just what needs to be done —
 * instead of the check-ins"): every change a member made on the boards in the last days, from the change log itself
 * (undone ones left out), plus the requests they resolved here. Nothing typed in.
 */

export interface Done { id: string; who: string; at: string; tag: string; title: string; detail?: string; href?: string; count: number }
export const DONE_DAYS = 7;

const LOGI_DONE: Record<string, string> = {
  packages: "Moved to Packages", pack_process: "Packing in process", pack_hold: "Put packing on hold", shipments: "Ready to dispatch",
  ship_dispatched: "Dispatched", ship_hold: "Put the shipment on hold", received: "Reached the client",
};
/** What a change-log entry counts as, in a few words — or null when it isn't work to show (Zoho notices, automatic sends). */
function doneTag(e: CardEvent): string | null {
  const v = e.value ?? "";
  switch (e.kind) {
    case "set_training_date":
      if (e.mode === "invoice") return null; // the "Completed on invoice date" pair — the completion says it
      if (v === "TBD") return "Training set to be decided";
      if (e.mode === "change") return "Changed a training date";
      return e.before && e.before !== "TBD" ? "Postponed a training" : "Scheduled a training";
    case "complete_training": return e.mode === "invoice" ? "Recorded an earlier training" : "Training completed";
    case "merge": return "Merged documents";
    case "set_delivered": return "Marked AED delivered";
    case "aed_in_process": return "Started contacting the client";
    case "aed_call": return "Called the client";
    case "aed_email": case "aed_email_marked": return "Sent the onboarding email";
    case "set_not_required": case "set_resale": case "set_reseller": return "Marked training not required";
    case "fulfil_email": return "Sent the gratitude email";
    case "fulfil_certs": return `Generated ${e.certs?.length ?? ""} certificates`.replace("  ", " ");
    case "set_fulfillment": return v === "logistics" ? (e.mode === "done" ? "Marked certificates done earlier" : "Sent certificates to Logistics") : v === "generated" ? "Certificates ready" : null;
    case "set_cert_status": return v === "hold" ? "Put certificates on hold" : "Certificates back in process";
    case "logi_merge": return "Merged certificates with the payment";
    case "logi_hide": return "Hid a delivered AED";
    case "set_logistics": return v.startsWith("expected:") ? "Set the expected delivery" : LOGI_DONE[v] ?? null;
    case "add_note": return "Added a note";
    case "add_potential": return "Added a potential training";
    case "set_cert_location": case "set_training_email": case "set_training_phone": case "set_concerned_name": return "Updated training details";
    case "add_alias": case "remove_alias": case "add_email": case "remove_email": case "add_phone": case "remove_phone":
    case "aed_add_phone": case "aed_remove_phone": case "aed_set_email": case "aed_remove_email": case "aed_confirm_email": return "Updated customer details";
    case "delete": return "Removed a card";
    default: return null;
  }
}

export function buildDone(team: Who[], events: CardEvent[], nameOf: (cardId: string) => string | undefined, requests: PtRequest[], now: Date): Done[] {
  const since = new Date(now.getTime() - DONE_DAYS * 86_400_000).toISOString();
  const byName = new Map(team.map((m) => [m.name.trim().toLowerCase(), m]));
  const out = new Map<string, Done>();
  const add = (d: Omit<Done, "count">, key: string) => {
    const had = out.get(key);
    if (had) { had.count++; if (d.at > had.at) had.at = d.at; } else out.set(key, { ...d, count: 1 });
  };
  for (const e of events) {
    if (e.revertedAt || e.at < since) continue;
    const m = byName.get(e.by.trim().toLowerCase());
    const tag = m && doneTag(e);
    if (!m || !tag) continue;
    const card = e.kind === "merge" ? e.cardIds[1] : e.cardIds.find((id) => !id.startsWith("aedcustomer:")) ?? e.cardIds[0];
    const title = nameOf(card) ?? e.value ?? "—";
    const detail = e.kind === "set_training_date" && e.value && e.value !== "TBD" ? `for ${e.value.split(",").map((d) => fmtDay(d.slice(0, 10))).join(", ")}` : e.kind === "merge" ? `${e.before ?? ""} → ${e.value ?? ""}`.trim() : undefined;
    // Several of the same on one card the same day (three calls, two edits) show once with ×n.
    add({ id: e.id, who: m.id, at: e.at, tag, title, detail, href: open(card) }, `${m.id}|${tag}|${card}|${e.at.slice(0, 10)}`);
  }
  for (const r of requests) {
    for (const l of r.log) {
      if (l.action !== "resolved" || l.at < since) continue;
      const m = byName.get(l.by.trim().toLowerCase());
      if (m) add({ id: `${r.id}:${l.at}`, who: m.id, at: l.at, tag: "Resolved a request", title: r.task.title, detail: `${r.ref} · ${m.id === r.requesterId ? `was waiting on ${r.waitingOnName.split(" ")[0]}` : `for ${r.requesterName.split(" ")[0]}`}` }, `${r.id}:${l.at}`);
    }
  }
  return [...out.values()].sort((a, b) => b.at.localeCompare(a.at));
}
