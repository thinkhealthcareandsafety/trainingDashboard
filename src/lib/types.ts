export type Priority = "high" | "medium" | "low";

export type ZohoStatus = "draft" | "pending_approval" | "approved" | "sent" | "viewed" | "unpaid" | "overdue" | "partially_paid" | "paid" | "void";

/** One Training Services line item from a Zoho Books invoice (see spec: "one line item = one training"). */
export interface Training {
  id: string; // `${docType}:${lineItemId}`
  zohoDocType: "invoice" | "salesorder";
  zohoDocId: string;
  docNumber: string;
  customerId: string;
  customerName: string;
  trainingType: string; // display name derived from line_items[].name
  itemName?: string; // raw Zoho item name
  trainingDate: string; // YYYY-MM-DD, cf_training_date (fallback: invoice date)
  trainer: string; // cf_trainer_name
  participants: number; // line_items[].quantity
  amount: number; // line_items[].item_total, INR pre-tax
  status: ZohoStatus;
  dueDate?: string;
  certExpiry?: string; // cf_certificate_expiry
  leadSource?: string; // cf_lead_source
  zohoPriority?: Priority; // cf_priority, once added in Zoho
}

/** A quotation (estimate) or sales order (proforma) containing Training Services items. */
export interface PipelineDoc {
  id: string; // `${kind}:${docId}`
  kind: "estimate" | "salesorder";
  docId: string;
  docNumber: string;
  customerName: string;
  date: string; // document date (YYYY-MM-DD)
  trainingDate?: string; // cf_training_date, if the field exists on the document
  expiryDate?: string; // quotes only
  status: string; // Zoho status: draft, sent, accepted, open, partially_invoiced, ...
  trainingType: string;
  participants: number;
  amount: number; // training lines only, pre-tax INR
  zohoPriority?: Priority;
}

export interface TrainingsResponse {
  source: "zoho" | "mock";
  syncedAt: string;
  trainings: Training[];
  /** Quotes awaiting reply and booked (not yet invoiced) sales orders. */
  pipeline: PipelineDoc[];
  orgId?: string;
  error?: string;
}

export type EntryType = "meeting" | "note" | "date";

export interface CalendarEntry {
  id: string;
  type: EntryType;
  title: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string;
  allDay: boolean;
  priority: Priority;
  description?: string;
  linkedCustomer?: string;
  reminderMinutes?: number | null;
  createdAt: string;
  demo?: boolean; // sample data, removed once Zoho is live
}

export type FollowUpStatus = "pending" | "in_progress" | "snoozed" | "overdue" | "completed" | "cancelled";
export type FollowUpType = "call" | "email" | "whatsapp" | "meeting" | "site_visit";
export type FollowUpSource = "manual" | "invoice_overdue" | "training_delivered" | "cert_expiry" | "estimate_sent" | "booking_unscheduled" | "dormant_client";

export interface FollowUpActivity {
  id: string;
  kind: "note" | "created" | "completed" | "snoozed" | "rescheduled" | "status";
  body: string;
  at: string;
}

export interface FollowUp {
  id: string;
  customerName: string;
  subject: string;
  type: FollowUpType;
  dueAt: string; // ISO
  owner: string;
  priority: Priority;
  /** Stored status. "overdue" is never stored; it is derived from dueAt (see effectiveStatus). */
  status: Exclude<FollowUpStatus, "overdue">;
  snoozedUntil?: string;
  source: FollowUpSource;
  triggerKey?: string; // unique per auto-created follow-up, prevents duplicates
  linkedDoc?: string;
  outcome?: string;
  notes?: string;
  completedAt?: string;
  createdAt: string;
  activities: FollowUpActivity[];
  demo?: boolean;
}

export interface Announcement {
  id: string;
  text: string;
  priority: Priority;
  startsAt: string;
  endsAt: string;
  demo?: boolean;
}

export interface TickerItem {
  id: string;
  priority: Priority;
  label: string;
  text: string;
  href: string;
  sortKey: number;
}

