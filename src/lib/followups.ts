import type { FollowUp, FollowUpStatus, PipelineDoc, Training } from "./types";
import { addDays, daysBetween, parseYmd, startOfDay } from "./dates";
import { isDelivered } from "./kpi";

/** Overdue is never stored: an open follow-up past its due time is overdue. */
export function effectiveStatus(f: FollowUp, now: Date): FollowUpStatus {
  if (f.status === "completed" || f.status === "cancelled") return f.status;
  if (f.status === "snoozed" && f.snoozedUntil && new Date(f.snoozedUntil) > now) return "snoozed";
  if (new Date(f.dueAt) < now) return "overdue";
  return f.status === "snoozed" ? "pending" : f.status;
}

export function isOpen(s: FollowUpStatus) {
  return s !== "completed" && s !== "cancelled";
}

function at(d: Date, h: number, m = 0) {
  const r = new Date(d);
  r.setHours(h, m, 0, 0);
  return r.toISOString();
}

/**
 * Automatic triggers from Zoho Books data (spec: "Automatic triggers").
 * Each follow-up has a unique triggerKey so re-running never duplicates.
 */
export function followUpsFromTrainings(trainings: Training[], today: Date): FollowUp[] {
  const out: FollowUp[] = [];
  const t0 = startOfDay(today);
  const created = new Date().toISOString();
  const base = (key: string): Pick<FollowUp, "id" | "triggerKey" | "createdAt" | "activities"> => ({
    id: `auto-${key}`,
    triggerKey: key,
    createdAt: created,
    activities: [{ id: `a-${key}`, kind: "created", body: "Created automatically from Zoho Books", at: created }],
  });

  trainings.forEach((t) => {
    // Owner = the invoice's trainer when set; otherwise someone picks it up.
    const owner = t.trainer && !["None", "Other"].includes(t.trainer) ? t.trainer : "Unassigned";

    if (t.status === "overdue" && t.dueDate) {
      const late = daysBetween(parseYmd(t.dueDate), t0);
      out.push({
        ...base(`inv_overdue:${t.zohoDocId}`),
        customerName: t.customerName,
        subject: `Payment follow-up ${t.docNumber}`,
        type: "call",
        dueAt: at(addDays(parseYmd(t.dueDate), 1), 10),
        owner,
        priority: late > 15 ? "high" : "medium",
        status: "pending",
        source: "invoice_overdue",
        linkedDoc: t.docNumber,
      });
    }

    const since = daysBetween(parseYmd(t.trainingDate), t0);
    if (isDelivered(t, today) && since >= 0 && since <= 10) {
      out.push({
        ...base(`delivered:${t.id}`),
        customerName: t.customerName,
        subject: `Feedback form & certificates — ${t.trainingType}`,
        type: "email",
        dueAt: at(addDays(parseYmd(t.trainingDate), 2), 11),
        owner,
        priority: "medium",
        status: "pending",
        source: "training_delivered",
        linkedDoc: t.docNumber,
      });
    }

    if (t.certExpiry) {
      const left = daysBetween(t0, parseYmd(t.certExpiry));
      if (left >= -30 && left <= 60) {
        out.push({
          ...base(`cert:${t.id}`),
          customerName: t.customerName,
          subject: `Renewal offer — ${t.trainingType} certificates expire`,
          type: "call",
          dueAt: at(addDays(parseYmd(t.certExpiry), -60) < t0 ? t0 : addDays(parseYmd(t.certExpiry), -60), 12),
          owner,
          priority: left <= 30 ? "high" : "medium",
          status: "pending",
          source: "cert_expiry",
          linkedDoc: t.docNumber,
        });
      }
    }
  });

  // De-duplicate by triggerKey (an invoice can have several training lines).
  return [...new Map(out.map((f) => [f.triggerKey, f])).values()];
}

const QUOTE_CHASE_AFTER_DAYS = 3;
const QUOTE_ACTIVE_DAYS = 30; // older quotes stay in the pipeline list but don't create chase tasks
const BIG_DEAL_INR = 100_000;
const BOOKING_ACTIVE_DAYS = 60; // older open sales orders stay in the pipeline list without reminders

/** Auto follow-ups from the pipeline: chase sent quotes, confirm dates on booked sales orders. */
export function followUpsFromPipeline(pipeline: PipelineDoc[], today: Date): FollowUp[] {
  const t0 = startOfDay(today);
  const created = new Date().toISOString();
  const out: FollowUp[] = [];
  const base = (key: string): Pick<FollowUp, "id" | "triggerKey" | "createdAt" | "activities" | "owner" | "status"> => ({
    id: `auto-${key}`,
    triggerKey: key,
    createdAt: created,
    owner: "Unassigned",
    status: "pending",
    activities: [{ id: `a-${key}`, kind: "created", body: "Created automatically from Zoho Books", at: created }],
  });

  for (const p of pipeline) {
    const age = daysBetween(parseYmd(p.date), t0);
    if (p.kind === "estimate" && p.status === "sent" && age <= QUOTE_ACTIVE_DAYS) {
      out.push({
        ...base(`quote:${p.docId}`),
        customerName: p.customerName,
        subject: `Chase quote ${p.docNumber} — ${p.trainingType}`,
        type: "call",
        dueAt: at(addDays(parseYmd(p.date), QUOTE_CHASE_AFTER_DAYS), 10),
        priority: p.zohoPriority ?? (p.amount >= BIG_DEAL_INR ? "high" : "medium"),
        source: "estimate_sent",
        linkedDoc: p.docNumber,
      });
    }
    if (p.kind === "salesorder" && !p.trainingDate && age <= BOOKING_ACTIVE_DAYS) {
      out.push({
        ...base(`so_date:${p.docId}`),
        customerName: p.customerName,
        subject: `Confirm training date & trainer — ${p.docNumber}`,
        type: "call",
        dueAt: at(addDays(parseYmd(p.date), 2), 11),
        priority: p.zohoPriority ?? (p.amount >= BIG_DEAL_INR ? "high" : "medium"),
        source: "booking_unscheduled",
        linkedDoc: p.docNumber,
      });
    }
  }
  return out;
}

export function seedManualFollowUps(today: Date): FollowUp[] {
  const created = new Date().toISOString();
  const mk = (id: string, p: Omit<FollowUp, "id" | "createdAt" | "activities" | "source" | "status"> & { status?: FollowUp["status"] }): FollowUp => ({
    status: "pending",
    ...p,
    id,
    source: "manual",
    createdAt: created,
    activities: [{ id: `a-${id}`, kind: "created", body: "Follow-up created", at: created }],
    demo: true,
  });
  return [
    mk("m1", { customerName: "Orion IT Park", subject: "Quote for BLS batch (40 staff)", type: "call", dueAt: at(addDays(today, -2), 15), owner: "Priya", priority: "high" }),
    mk("m2", { customerName: "Blue Lagoon Resort", subject: "Pool safety refresher — confirm dates", type: "whatsapp", dueAt: at(today, 16, 30), owner: "Rahul", priority: "medium" }),
    mk("m3", { customerName: "Greenfield Pharma", subject: "Site visit for fire drill planning", type: "site_visit", dueAt: at(addDays(today, 3), 11), owner: "Sumit Shah", priority: "medium", status: "in_progress" }),
    mk("m4", { customerName: "Lotus Residency", subject: "Introduce AED awareness program", type: "email", dueAt: at(addDays(today, 6), 10), owner: "Priya", priority: "low" }),
    mk("m5", { customerName: "Metro Mall", subject: "Send revised proposal", type: "email", dueAt: at(addDays(today, -6), 12), owner: "Rahul", priority: "medium", status: "completed", outcome: "Proposal accepted", completedAt: at(addDays(today, -6), 11) }),
  ];
}

export const FOLLOWUP_TYPE_LABEL: Record<FollowUp["type"], string> = {
  call: "Call",
  email: "Email",
  whatsapp: "WhatsApp",
  meeting: "Meeting",
  site_visit: "Site visit",
};

export const STATUS_LABEL: Record<FollowUpStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  snoozed: "Snoozed",
  overdue: "Overdue",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const SOURCE_LABEL: Record<FollowUp["source"], string> = {
  manual: "Manual",
  invoice_overdue: "Overdue invoice",
  training_delivered: "Training delivered",
  cert_expiry: "Certificate expiry",
  estimate_sent: "Quote sent",
  booking_unscheduled: "Booked, no date",
  dormant_client: "Dormant client",
};
