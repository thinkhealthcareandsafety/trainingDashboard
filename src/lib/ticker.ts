import type { Announcement, CalendarEntry, FollowUp, TickerItem, Training } from "./types";
import { addDays, daysBetween, fmtDate, fmtINR, parseYmd, startOfDay, ymd } from "./dates";
import { effectiveStatus } from "./followups";
import { PRIORITY_RANK } from "./priority";
import { monthStats } from "./kpi";

const MAX_ITEMS = 30;

export function buildTickerItems(
  trainings: Training[],
  followUps: FollowUp[],
  entries: CalendarEntry[],
  announcements: Announcement[],
  now: Date,
): TickerItem[] {
  const items: TickerItem[] = [];
  const today = startOfDay(now);
  const todayStr = ymd(today);
  const tomorrowStr = ymd(addDays(today, 1));

  for (const f of followUps) {
    if (effectiveStatus(f, now) !== "overdue") continue;
    const late = Math.max(0, daysBetween(new Date(f.dueAt), now));
    items.push({
      id: `fu:${f.id}`,
      priority: "high",
      label: "Overdue",
      text: `${f.subject} · ${f.customerName}${late ? ` · ${late}d late` : ""}`,
      href: `/follow-up?open=${f.id}`,
      sortKey: new Date(f.dueAt).getTime(),
    });
  }

  // Don't repeat what an open follow-up already says (e.g. overdue invoice + its payment follow-up).
  const covered = new Set(followUps.filter((f) => effectiveStatus(f, now) === "overdue" && f.linkedDoc).map((f) => `${f.source}:${f.linkedDoc}`));
  const seenInvoices = new Set<string>();
  for (const t of trainings) {
    if (t.status === "overdue" && t.dueDate && !seenInvoices.has(t.zohoDocId) && !covered.has(`invoice_overdue:${t.docNumber}`)) {
      seenInvoices.add(t.zohoDocId);
      const late = daysBetween(parseYmd(t.dueDate), today);
      items.push({
        id: `inv:${t.zohoDocId}`,
        priority: t.zohoPriority ?? (late > 15 ? "high" : "medium"),
        label: "Invoice",
        text: `${t.docNumber} · ${t.customerName} · ${fmtINR(t.amount)} · ${late}d overdue`,
        href: `/follow-up?q=${encodeURIComponent(t.docNumber)}`,
        sortKey: parseYmd(t.dueDate).getTime(),
      });
    }
    if (t.trainingDate === todayStr || t.trainingDate === tomorrowStr) {
      const isToday = t.trainingDate === todayStr;
      items.push({
        id: `tr:${t.id}`,
        priority: t.zohoPriority ?? (isToday ? "high" : "medium"),
        label: isToday ? "Today" : "Tomorrow",
        text: `${t.trainingType} · ${t.customerName} · ${t.participants} pax${t.trainer && t.trainer !== "None" ? ` · ${t.trainer}` : ""}`,
        href: `/calendar?date=${t.trainingDate}`,
        sortKey: parseYmd(t.trainingDate).getTime(),
      });
    }
    if (t.certExpiry) {
      const left = daysBetween(today, parseYmd(t.certExpiry));
      if (left >= 0 && left <= 30 && !covered.has(`cert_expiry:${t.docNumber}`)) {
        items.push({
          id: `cert:${t.id}`,
          priority: "medium",
          label: "Renewal",
          text: `${t.customerName} ${t.trainingType} certificates expire ${fmtDate(t.certExpiry)}`,
          href: `/follow-up?q=${encodeURIComponent(t.customerName)}`,
          sortKey: parseYmd(t.certExpiry).getTime(),
        });
      }
    }
  }

  for (const e of entries) {
    const d = parseYmd(e.date);
    const inDays = daysBetween(today, d);
    if (e.priority === "high" && inDays >= 0 && inDays <= 3) {
      items.push({
        id: `cal:${e.id}`,
        priority: "high",
        label: inDays === 0 ? "Today" : fmtDate(e.date),
        text: `${e.startTime && !e.allDay ? `${e.startTime} ` : ""}${e.title}`,
        href: `/calendar?date=${e.date}`,
        sortKey: d.getTime(),
      });
    }
  }

  const m = monthStats(trainings, now);
  if (m.ahead < 0) {
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    items.push({
      id: "pace",
      priority: "medium",
      label: "Pace",
      text: `${m.completed}/${m.target} trainings · ${daysBetween(today, monthEnd)} days left · forecast ${m.forecast}`,
      href: "/",
      sortKey: now.getTime(),
    });
  }

  for (const a of announcements) {
    if (new Date(a.startsAt) <= now && new Date(a.endsAt) >= now) {
      items.push({ id: `ann:${a.id}`, priority: a.priority, label: "News", text: a.text, href: "/", sortKey: new Date(a.startsAt).getTime() });
    }
  }

  const paidToday = trainings.filter((t) => t.status === "paid" && t.trainingDate === todayStr);
  paidToday.forEach((t) =>
    items.push({ id: `win:${t.id}`, priority: "low", label: "Paid", text: `${fmtINR(t.amount)} · ${t.customerName}`, href: "/", sortKey: now.getTime() }),
  );

  return items
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.sortKey - b.sortKey)
    .slice(0, MAX_ITEMS);
}
