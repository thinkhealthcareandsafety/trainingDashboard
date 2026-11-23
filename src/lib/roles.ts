import type { CardEvent } from "./types";

/*
 * Who may do what — used by the menu, the pages, the boards (buttons) and the server (each API checks the same rule).
 *
 * The owner's sheet (18 Nov): a row per person, a column per page — Overview, Quotations, Trainings, Items, Templates,
 * Follow-ups (which boards), Calendar, Sprints, Reports, Invoice Converter. ACCESS below is that sheet. Admin, Jasmeet
 * and Shikha also have the Admin powers (clearing logs, connecting Zoho…). Someone not in the sheet gets Calendar and
 * Sprints until the owner says otherwise.
 *
 * Reverting: your own changes (Admin: anyone's). A revert also reverts the later steps of that flow (cascade.ts), even
 * when someone else made them — the flow must stay in order.
 */

export type BoardKind = "training" | "sales" | "fire" | "aed" | "fulfil" | "logistics";
type Who = { id: string; name: string };

export type Page = "overview" | "quotations" | "trainings" | "items" | "templates" | "followups" | "calendar" | "sprints" | "reports" | "converter";
export const PAGES: { key: Page; label: string }[] = [
  { key: "overview", label: "Overview" }, { key: "quotations", label: "Quotations" }, { key: "trainings", label: "Trainings" },
  { key: "items", label: "Items" }, { key: "templates", label: "Templates" }, { key: "followups", label: "Follow-ups" },
  { key: "calendar", label: "Calendar" }, { key: "sprints", label: "Sprints" }, { key: "reports", label: "Reports" },
  { key: "converter", label: "Invoice Converter" },
];
// "fire": the Fire Safety board (owner, 3 Nov) — the Sales board's deals with Fire Safety items; the same people.
export const ALL_BOARDS: BoardKind[] = ["training", "sales", "fire", "aed", "fulfil", "logistics"];
/** A person's pages, their Follow-ups boards, `overviewSelf`: the Overview with only their own figures, and `viewOnly`: pages they may look at but not change. */
export type Access = { pages: Page[]; boards: BoardKind[]; overviewSelf?: boolean; viewOnly?: Page[] };
const EVERYTHING: Access = { pages: PAGES.map((p) => p.key), boards: ALL_BOARDS };
const BASE: Page[] = ["calendar", "sprints"];
/** The owner's sheet, 18 Nov (first name → access). "1" = the page; Follow-ups "1" = every board, "Sales" / "Aed" / "L" = that board. */
export const ACCESS: Record<string, Access> = {
  sumit: EVERYTHING,
  nikita: EVERYTHING,
  anuj: EVERYTHING,
  jasmeet: EVERYTHING, // owner: "give jasmeet all perms for now, that's me"
  ashish: EVERYTHING,
  shikha: EVERYTHING,
  anushka: { pages: BASE, boards: [] },
  prashant: { pages: ["items", ...BASE], boards: [] },
  pranjal: { pages: ["overview", "quotations", "items", "followups", ...BASE], boards: ["sales", "fire"], overviewSelf: true },
  sagar: { pages: BASE, boards: [] },
  vaibhav: { pages: BASE, boards: [] },
  priyanka: { pages: ["trainings", "followups", ...BASE], boards: ["aed"] },
  shreya: { pages: ["items", "followups", ...BASE], boards: ALL_BOARDS },
  // Quotations "—" = view only (owner, 19 Nov): the customers and their quotations, no new, copied or edited ones.
  vaibhavi: { pages: ["items", "quotations", "followups", ...BASE, "reports", "converter"], boards: ["logistics"], viewOnly: ["quotations"] },
  arti: { pages: ["items", "quotations", "followups", ...BASE, "reports", "converter"], boards: ["logistics"], viewOnly: ["quotations"] },
};
const NEWCOMER: Access = { pages: BASE, boards: [] };
const firstName = (m: Who) => m.name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";

const named = (m: Who, re: RegExp) => re.test(m.name.trim());
/** Admin, Shikha (owner, 17 Nov) and Jasmeet (owner, 18 Nov): every Admin power too. */
export const isAdmin = (m: Who) => m.id === "admin" || named(m, /^(shikha|jasmeet)\b/i);
/** This person's row of the sheet. */
export const accessOf = (m: Who): Access => (m.id === "admin" ? EVERYTHING : ACCESS[firstName(m)] ?? NEWCOMER);
/** May this person open that page? */
export const canSee = (m: Who, page: Page) => accessOf(m).pages.includes(page);
/** Every page and every board (the sheet's full rows, and Admin): every action on the boards too. */
export const hasFullAccess = (m: Who) => isAdmin(m) || accessOf(m) === EVERYTHING;
/** They may open that page but not change anything on it. */
export const viewOnlyOn = (m: Who, page: Page) => Boolean(accessOf(m).viewOnly?.includes(page));
/** Who makes and sends quotations (the Quotations page, not view only). */
export const canQuote = (m: Who) => canSee(m, "quotations") && !viewOnlyOn(m, "quotations");
/** The Overview with only their own figures (Pranjal: "1 / Self") — their key on the Overview, else null. */
export const overviewSelf = (m: Who): string | null => (accessOf(m).overviewSelf ? firstName(m) : null);
/** The Reports page's data: every dataset with the Reports page, none without (not tied to the Follow-ups boards). */
export const reportBoards = (m: Who): BoardKind[] => (canSee(m, "reports") ? ALL_BOARDS : []);
/** Where someone lands: the Overview, else their first page. */
export const homeOf = (m: Who): string => {
  const pages = accessOf(m).pages;
  const href: Record<Page, string> = { overview: "/overview", quotations: "/quotations", trainings: "/training-management", items: "/items", templates: "/templates", followups: "/follow-up", calendar: "/calendar", sprints: "/sprints", reports: "/reports", converter: "/reports/invoice-converter" };
  return href[pages[0] ?? "calendar"];
};

/** The Follow-ups boards they work on. */
export function boardsFor(m: Who): BoardKind[] {
  return accessOf(m).boards;
}

/** The Invoice Converter (owner, 17 Nov; the sheet's "I.C" column). */
export const canConvertInvoices = (m: Who) => canSee(m, "converter");

/** The Follow-ups page: the page, with at least one board. */
export const hasFollowUps = (m: Who) => canSee(m, "followups") && boardsFor(m).length > 0;

/** Marking an AED delivered (and undoing it): everyone who can, except the AedSmartx trainer. */
export const canMarkDelivered = (m: Who) => hasFullAccess(m) || boardsFor(m).includes("logistics");

/** Which board a card belongs to, from its id. */
function boardOfCard(id: string): BoardKind {
  const p = id.split(":")[0];
  if (p === "aed" || p === "aedcustomer") return "aed";
  if (p === "fulfil") return "fulfil";
  if (p === "logi" || p === "logipay") return "logistics";
  if (p === "sale") return "sales"; // Sales board (sales.ts): "sale:quote:…", "sale:lead:…"
  return "training";
}

/** Recorded only by the server, once they've happened in Zoho (an email sent, a reply found, rows added to the sheet) — never reverted. */
export const SERVER_KINDS = new Set<CardEvent["kind"]>(["aed_email", "aed_reply", "fulfil_email", "fulfil_reply", "fulfil_certs", "training_reminder", "training_postponed_mail", "training_whatsapp"]);

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
 * Calendar: everyone sees everyone's trainings, meetings and events (owner, 20 Nov: "let all users see the calendar for
 * everyone … everyone can see everyone's schedule"; before, 19 Oct, only their own unless full access). Changing or
 * deleting an entry stays with whoever made it, the people in it, and full access (canEditEntry).
 */
export const seesWholeCalendar = (_m?: Who) => true;
const samePerson = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
type EntryWho = { createdBy?: string; people?: string[]; everyone?: boolean };
type TrainingWho = { board: "training" | "aed"; trainers: string[]; scheduledBy?: string };
/** Picked for a meeting / event (or it's for everyone) — they get its reminder. */
export const inEntry = (m: Who, e: EntryWho) => Boolean(e.everyone || e.people?.some((p) => samePerson(p, m.name)));
/** A meeting / event is this member's: they made it or are in it. */
export const ownsEntry = (m: Who, e: EntryWho) => inEntry(m, e) || Boolean(e.createdBy && samePerson(e.createdBy, m.name));
export const canSeeEntry = (m: Who, e: EntryWho) => seesWholeCalendar(m) || ownsEntry(m, e);
/** May change or delete a meeting / event: made it, is in it, or full access (seeing it is no longer enough). */
export const canEditEntry = (m: Who, e: EntryWho) => hasFullAccess(m) || ownsEntry(m, e);
/**
 * Meetings / events are marked done (owner, 3 Nov — Shikha's to-do while they aren't). Only those from the day this
 * started count, so older entries don't all turn red.
 */
export const ENTRY_DONE_FROM = "2026-11-03";
export const entryOverdue = (e: { date: string; doneAt?: string; demo?: boolean }, today: string) => !e.doneAt && !e.demo && e.date < today && e.date >= ENTRY_DONE_FROM;
/** Gives this training — they get its reminder. AedSmartx trainings are the AedSmartx trainer's. */
export const givesTraining = (m: Who, t: TrainingWho) => (t.board === "aed" && named(m, /^priyanka\b/i)) || t.trainers.some((n) => samePerson(n, m.name));
/** A training is this member's: they give it, or set its date. */
export const ownsTraining = (m: Who, t: TrainingWho) => givesTraining(m, t) || Boolean(t.scheduledBy && samePerson(t.scheduledBy, m.name));
/** Every training is on everyone's calendar (owner, 20 Nov); opening one off your boards says so and links to the board. */
export const canSeeTraining = (m: Who, t: TrainingWho) => seesWholeCalendar(m) || ownsTraining(m, t);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/**
 * A training date (Training board) must carry its certificate location and the concerned person's email (owner, 13 and
 * 15 Oct) — so a tab still running old code can't schedule without them. Not for To be decided, AedSmartx (no
 * certificates there) or a training recorded on its invoice date (before the dashboard).
 */
/**
 * A training date the server keeps: "TBD", or days "YYYY-MM-DD" (optionally "THH:mm") with a 4-digit year, comma-separated.
 * On 2 Nov a typed year came through as "20206-11-03T11:00" — it sorts after today, so the popup let it pass.
 */
const DAY_RE = new RegExp("^[12][0-9]{3}-[01][0-9]-[0-3][0-9](T[0-2][0-9]:[0-5][0-9])?$");
export const goodTrainingDate = (v?: string) => !v || v === "TBD" || v.split(",").every((d) => DAY_RE.test(d.trim()));
export const missingCertFields = (e: Pick<CardEvent, "kind" | "cardIds" | "value" | "mode" | "location" | "email">) =>
  e.kind === "set_training_date" && Boolean(e.value) && e.value !== "TBD" && e.mode !== "invoice" && !e.cardIds[0]?.startsWith("aed")
  && (typeof e.location !== "string" || !EMAIL_RE.test(e.email?.trim() ?? ""));
