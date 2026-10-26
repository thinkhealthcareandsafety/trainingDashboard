/*
 * Progress tracker (Reports → Progress tracker, owner 26 Oct) — the rules, shared by the server and the page, pure.
 * PROGRESS-TRACKER-PLAN.md is the design; [S…] = the owner's spec, [A…] = an assumption written down there.
 *
 * Three questions: what is each person working on and when were they last active · what got done · who is waiting on
 * whom. Requests ("Unblock me") answer the third; check-ins and the status cards the first two.
 */

export const TEAM_TZ = "Asia/Kolkata"; // everyone works from India [A9, D1]
export const PING_AFTER_MS = 4 * 3_600_000; // a polite ping once 4 h have passed since the request or the last ping [S16]
export const ESCALATE_AFTER_MS = 24 * 3_600_000; // open longer than a day → shown escalated [S18]
export const ACTIVE_MS = 10 * 60_000; // a visible dashboard tab in the last 10 min = active [A10]
export const REOPEN_DAYS = 7; // a resolved request can be reopened by its requester for a week [A24]

export type Category = "input" | "review" | "handoff" | "critical";
export type Priority = "normal" | "urgent";
export type RequestStatus = "open" | "resolved" | "withdrawn";

/** The four categories [S11], fixed in code [A12]; what "blocked" and "resolve" mean is [A13]. */
export const CATEGORIES: Record<Category, { label: string; short: string; hint: string; resolve: string; resumeText: string; blocked: boolean; tone: string; dot: string }> = {
  input: { label: "Input Needed", short: "Input", hint: "You need information, a file or a decision from them", resolve: "Done — here's what you needed", resumeText: "has given you what you needed", blocked: false, tone: "bg-medium-bg text-medium", dot: "bg-medium" },
  review: { label: "Review Required", short: "Review", hint: "Your work is ready and needs their review or approval", resolve: "Reviewed", resumeText: "has reviewed it", blocked: false, tone: "bg-info-bg text-info", dot: "bg-info" },
  handoff: { label: "Hand-off Ready", short: "Hand-off", hint: "Your part is finished — the next step is theirs", resolve: "Picked up", resumeText: "has picked it up", blocked: false, tone: "bg-completed-bg text-completed", dot: "bg-completed" },
  critical: { label: "Critical Blocker", short: "Blocker", hint: "Your work has stopped until they act", resolve: "Unblocked", resumeText: "has unblocked you", blocked: true, tone: "bg-high-bg text-high", dot: "bg-high" },
};
export const CATEGORY_ORDER: Category[] = ["input", "review", "handoff", "critical"];

/** What a request is about [S13]: a card on a board, a check-in's blocker line, or a typed title [A20]. */
export type TaskRef = { kind: "board" | "free"; title: string; cardId?: string; search?: string };

export interface LogLine { at: string; by: string; action: "created" | "seen" | "pinged" | "resolved" | "withdrawn" | "reopened" | "priority"; detail?: string }

export interface PtRequest {
  id: string;
  ref: string; // "R-0042" — what check-ins and threads point at [S24]
  category: Category;
  priority: Priority;
  requesterId: string;
  requesterName: string;
  waitingOnId: string;
  waitingOnName: string;
  task: TaskRef;
  note?: string;
  status: RequestStatus;
  createdAt: string;
  reopenedAt?: string; // waiting time starts again from here
  seenAt?: string;
  pings: { at: string; by: string }[];
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
  withdrawnAt?: string;
  withdrawnBy?: string;
  log: LogLine[];
  updatedAt: string;
}

export interface Presence {
  id: string; // member id
  name: string;
  lastSeenAt?: string; // the latest of: a visible dashboard tab, a request / check-in / reply — one time only, no history [S19]
  away?: { at: string; until?: string }; // set by the member; wins over everything [S20]
  focus?: { text: string; at: string }; // set by the member [S21]
}

export interface Comment { id: string; parent: string; by: string; byId: string; text: string; at: string; deletedAt?: string }

export type NoticeKind = "request" | "ping" | "resolved" | "reopened" | "comment";
export interface Notice { id: string; to: string; kind: NoticeKind; requestId?: string; text: string; at: string; urgent?: boolean; readAt?: string }

export type Who = { id: string; name: string };
export const isAdminId = (id: string) => id === "admin";

/* ---------------- Time ---------------- */

/** The team's calendar day ("2026-10-26") for a moment — check-ins are one per member per day [A34]. */
export const teamDay = (d: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: TEAM_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
export const teamTime = (d: Date | string) => new Date(d).toLocaleTimeString("en-IN", { timeZone: TEAM_TZ, hour: "numeric", minute: "2-digit" });
/** "10:42 am" today, "Yesterday 6:40 pm", "Sat 24 Oct, 9:15 am". */
export function teamStamp(d: string, now: Date): string {
  const day = teamDay(d);
  if (day === teamDay(now)) return teamTime(d);
  if (day === teamDay(new Date(now.getTime() - 86_400_000))) return `Yesterday ${teamTime(d)}`;
  return `${new Date(d).toLocaleDateString("en-IN", { timeZone: TEAM_TZ, weekday: "short", day: "numeric", month: "short" })}, ${teamTime(d)}`;
}
/** "just now" · "12 min" · "3 h 20 m" · "1 d 4 h". */
export function fmtSpan(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${m % 60} m` : `${h} h`;
  return h % 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${Math.floor(h / 24)} d`;
}
export const ago = (d: string | undefined, now: Date) => (d ? (now.getTime() - Date.parse(d) < 60_000 ? "just now" : `${fmtSpan(now.getTime() - Date.parse(d))} ago`) : "never");

/* ---------------- Requests: derived, never stored [S12, S16, S18] ---------------- */

const startOf = (r: PtRequest) => r.reopenedAt ?? r.createdAt;
/** Waiting time: open → until now; closed → until it was resolved / withdrawn. Wall-clock, nights and Sundays count [A23]. */
export function waitingMs(r: PtRequest, now: Date): number {
  const end = r.status === "open" ? now.getTime() : Date.parse(r.resolvedAt ?? r.withdrawnAt ?? r.updatedAt);
  return Math.max(0, end - Date.parse(startOf(r)));
}
export const lastPingAt = (r: PtRequest) => r.pings.filter((p) => p.at >= startOf(r)).at(-1)?.at;
/** When the requester may ping again: 4 h after the request (or its reopening) or after the last ping. */
export const nextPingAt = (r: PtRequest) => Date.parse(lastPingAt(r) ?? startOf(r)) + PING_AFTER_MS;
export const isEscalated = (r: PtRequest, now: Date) => r.status === "open" && waitingMs(r, now) > ESCALATE_AFTER_MS;
/** Sort weight: Critical Blocker > escalated > Urgent > the rest; ties → the longest waiting first. */
export const severity = (r: PtRequest, now: Date) => (r.category === "critical" ? 8 : 0) + (isEscalated(r, now) ? 4 : 0) + (r.priority === "urgent" ? 2 : 0);
export const bySeverity = (now: Date) => (a: PtRequest, b: PtRequest) => severity(b, now) - severity(a, now) || startOf(a).localeCompare(startOf(b));
/** Red on the badge: anything critical, urgent or escalated. */
export const isSevere = (r: PtRequest, now: Date) => severity(r, now) > 0;

/* ---------------- Who may do what [A25, D4: waited-on member or requester resolve, + Admin] ---------------- */

export type Action = "seen" | "ping" | "resolve" | "withdraw" | "reopen" | "priority";
export function canDo(me: Who, r: PtRequest, action: Action, now: Date): boolean {
  const mine = r.requesterId === me.id;
  const theirs = r.waitingOnId === me.id;
  const admin = isAdminId(me.id);
  switch (action) {
    case "seen": return theirs && r.status === "open" && !r.seenAt;
    case "ping": return mine && r.status === "open" && now.getTime() >= nextPingAt(r);
    case "resolve": return r.status === "open" && (mine || theirs || admin);
    case "withdraw":
    case "priority": return r.status === "open" && (mine || admin);
    case "reopen": return r.status === "resolved" && (mine || admin) && now.getTime() - Date.parse(r.resolvedAt ?? r.updatedAt) <= REOPEN_DAYS * 86_400_000;
  }
}

/* ---------------- Status cards [S20–S23] ---------------- */

export type Availability = { state: "active" | "away"; manual: boolean; until?: string; lastSeenAt?: string };
/** Away (set by them, until a time or until they say they're back) wins; else active when seen in the last 10 min. */
export function availability(p: Presence | undefined, now: Date): Availability {
  const away = p?.away && (!p.away.until || Date.parse(p.away.until) > now.getTime()) ? p.away : undefined;
  if (away) return { state: "away", manual: true, until: away.until, lastSeenAt: p?.lastSeenAt };
  const recent = p?.lastSeenAt && now.getTime() - Date.parse(p.lastSeenAt) <= ACTIVE_MS;
  return { state: recent ? "active" : "away", manual: false, lastSeenAt: p?.lastSeenAt };
}

/** Current focus: what the member set today with "Set focus" [S21]; none from earlier days (check-ins were dropped, owner 26 Oct). */
export const focusOf = (p: Presence | undefined, today: string) => (p?.focus && teamDay(p.focus.at) === today ? p.focus : undefined);

/* ---------------- Header counts [S4] ---------------- */

export type Counts = { active: number; blockers: number; handoffs: number };
/** Active members (Admin not counted [A26]) · open blockers = open Critical Blockers + any escalated request [A27] · open hand-offs. */
export function counts(team: Who[], presence: Presence[], requests: PtRequest[], now: Date): Counts {
  const pres = new Map(presence.map((p) => [p.id, p]));
  const open = requests.filter((r) => r.status === "open");
  return {
    active: team.filter((m) => !isAdminId(m.id) && availability(pres.get(m.id), now).state === "active").length,
    blockers: open.filter((r) => isBlocker(r, now)).length,
    handoffs: open.filter((r) => r.category === "handoff").length,
  };
}
export const isBlocker = (r: PtRequest, now: Date) => r.status === "open" && (r.category === "critical" || isEscalated(r, now));

/* ---------------- Blocked Work matrix [S6]: who waits (rows) on whom (columns) [A28] ---------------- */

export type MatrixCell = { count: number; worst: PtRequest };
export type Matrix = { rows: Who[]; cols: Who[]; cells: Map<string, MatrixCell>; rowTotal: Map<string, number>; colTotal: Map<string, number> };
export const cellKey = (from: string, to: string) => `${from}>${to}`;
export function matrix(team: Who[], requests: PtRequest[], now: Date): Matrix {
  const open = requests.filter((r) => r.status === "open").sort(bySeverity(now));
  const cells = new Map<string, MatrixCell>();
  const rowTotal = new Map<string, number>();
  const colTotal = new Map<string, number>();
  for (const r of open) {
    const k = cellKey(r.requesterId, r.waitingOnId);
    const c = cells.get(k);
    if (c) c.count++;
    else cells.set(k, { count: 1, worst: r });
    rowTotal.set(r.requesterId, (rowTotal.get(r.requesterId) ?? 0) + 1);
    colTotal.set(r.waitingOnId, (colTotal.get(r.waitingOnId) ?? 0) + 1);
  }
  // Only people with something open, in the team's order; columns with the most people waiting first (the bottleneck).
  const rows = team.filter((m) => rowTotal.has(m.id));
  const cols = team.filter((m) => colTotal.has(m.id)).sort((a, b) => (colTotal.get(b.id) ?? 0) - (colTotal.get(a.id) ?? 0));
  return { rows, cols, cells, rowTotal, colTotal };
}

/** Limits the server keeps to (and the forms show). */
export const LIMITS = { title: 140, note: 1000, comment: 2000, focusText: 140 };
