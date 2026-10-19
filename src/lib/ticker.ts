import type { Announcement, BoardTraining, CalendarEntry, TickerItem, Training } from "./types";
import { addDays, daysBetween, fmtDate, fmtINR, parseYmd, startOfDay, ymd } from "./dates";
import { PRIORITY_RANK } from "./priority";
import { boardMonth, countsOn, upcoming } from "./kpi";

const MAX_ITEMS = 30;
/** The ticker looks this far ahead for trainings (owner, 13 Oct 2026). */
export const TICKER_DAYS = 15;

/**
 * The bar across the top: upcoming trainings from the boards first (next 15 days, soonest first), then overdue invoices,
 * certificate renewals, high-priority calendar entries, the month's pace and announcements. Each item says which board
 * it belongs to, so members only see their own (Priyanka: AedSmartx trainings).
 */
export function buildTickerItems(
  trainings: Training[],
  board: BoardTraining[],
  aedBoard: BoardTraining[],
  entries: CalendarEntry[],
  announcements: Announcement[],
  now: Date,
): TickerItem[] {
  const ahead: TickerItem[] = [];
  const items: TickerItem[] = [];
  const today = startOfDay(now);
  const todayStr = ymd(today);
  const tomorrowStr = ymd(addDays(today, 1));

  for (const { t, next } of upcoming([...board, ...aedBoard], now, TICKER_DAYS)) {
    const inDays = daysBetween(today, parseYmd(next));
    const day = t.dates.length > 1 ? ` (day ${t.dates.indexOf(next) + 1} of ${t.dates.length})` : "";
    const trainers = t.trainers.length ? ` · ${t.trainers.map((n) => n.split(" ")[0]).join(", ")}` : "";
    ahead.push({
      id: `up:${t.id}`,
      priority: inDays === 0 ? "high" : inDays <= 2 ? "medium" : "low",
      label: next === todayStr ? "Today" : next === tomorrowStr ? "Tomorrow" : fmtDate(next, { weekday: "short", day: "numeric", month: "short" }),
      text: `${t.board === "aed" ? "AED training" : t.training}${day} · ${t.alias || t.customerName}${t.time ? ` · ${t.time}` : ""}${t.people ? ` · ${t.people} people` : ""}${trainers}`,
      href: `/follow-up?q=${encodeURIComponent(t.docNumber)}`,
      sortKey: parseYmd(next).getTime(),
      board: t.board,
    });
  }

  const seenInvoices = new Set<string>();
  for (const t of trainings) {
    if (t.status === "overdue" && t.dueDate && !seenInvoices.has(t.zohoDocId)) {
      seenInvoices.add(t.zohoDocId);
      const late = daysBetween(parseYmd(t.dueDate), today);
      items.push({
        id: `inv:${t.zohoDocId}`,
        priority: t.zohoPriority ?? (late > 15 ? "high" : "medium"),
        label: "Invoice",
        text: `${t.docNumber} · ${t.customerName} · ${fmtINR(t.amount)} · ${late}d overdue`,
        href: `/follow-up?q=${encodeURIComponent(t.docNumber)}`,
        sortKey: parseYmd(t.dueDate).getTime(),
        board: "training",
      });
    }
    if (t.certExpiry) {
      const left = daysBetween(today, parseYmd(t.certExpiry));
      if (left >= 0 && left <= 30) {
        items.push({
          id: `cert:${t.id}`,
          priority: "medium",
          label: "Renewal",
          text: `${t.customerName} ${t.trainingType} certificates expire ${fmtDate(t.certExpiry)}`,
          href: `/follow-up?q=${encodeURIComponent(t.customerName)}`,
          sortKey: parseYmd(t.certExpiry).getTime(),
          board: "training",
        });
      }
    }
  }

  // The member's own meetings and events, today and tomorrow (the calendar orders by date and time — no priorities).
  for (const e of entries) {
    const d = parseYmd(e.date);
    const inDays = daysBetween(today, d);
    if (inDays >= 0 && inDays <= 1) {
      items.push({
        id: `cal:${e.id}`,
        priority: inDays === 0 ? "high" : "medium",
        label: inDays === 0 ? "Today" : "Tomorrow",
        text: `${e.startTime && !e.allDay ? `${e.startTime} ` : ""}${e.type === "meeting" ? "Meeting" : "Event"} · ${e.title}`,
        href: `/calendar?date=${e.date}&entry=${encodeURIComponent(e.id)}`,
        sortKey: d.getTime() + (e.startTime ? Number(e.startTime.replace(":", "")) : 0),
      });
    }
  }

  // Trainings whose day has passed but nobody pressed "Training completed": they don't count toward the targets,
  // Fulfillment never gets them (no certificates) — so they are flagged until marked.
  for (const t of [...board, ...aedBoard]) {
    if (t.status === "completed" || t.status === "tbd" || !t.dates.length || countsOn(t) >= todayStr) continue;
    const late = daysBetween(parseYmd(countsOn(t)), today);
    items.push({
      id: `unmarked:${t.id}`,
      priority: late >= 3 ? "high" : "medium",
      label: "Mark completed",
      text: `${t.board === "aed" ? "AED training" : t.training} · ${t.alias || t.customerName} · was on ${fmtDate(countsOn(t))} (${late} day${late === 1 ? "" : "s"} ago)`,
      href: `/follow-up?q=${encodeURIComponent(t.docNumber)}`,
      sortKey: parseYmd(countsOn(t)).getTime(),
      board: t.board,
    });
  }

  // The month's pace against the target, from the Training board (in whole trainings, as the Overview shows it).
  const m = boardMonth(board, now);
  if (m.target && m.completed < Math.round(m.expected)) {
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    items.push({
      id: "pace",
      priority: "medium",
      label: "Pace",
      text: `${m.completed}/${m.target} trainings · ${m.people}/${m.peopleTarget} people · ${daysBetween(today, monthEnd) + 1} days left · ${m.scheduled} more scheduled`,
      href: "/",
      sortKey: now.getTime(),
      board: "training",
    });
  }

  for (const a of announcements) {
    if (new Date(a.startsAt) <= now && new Date(a.endsAt) >= now) {
      items.push({ id: `ann:${a.id}`, priority: a.priority, label: "News", text: a.text, href: "/", sortKey: new Date(a.startsAt).getTime() });
    }
  }

  const paidToday = trainings.filter((t) => t.status === "paid" && t.trainingDate === todayStr);
  paidToday.forEach((t) =>
    items.push({ id: `win:${t.id}`, priority: "low", label: "Paid", text: `${fmtINR(t.amount)} · ${t.customerName}`, href: "/", sortKey: now.getTime(), board: "training" }),
  );

  return [
    ...ahead,
    ...items.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.sortKey - b.sortKey),
  ].slice(0, MAX_ITEMS);
}
