import type { Deal, Lead, PipelineDoc, Training } from "./types";
import { parseYmd, startOfDay } from "./dates";

// Builds one row per client engagement by joining manually-entered Leads with Zoho
// estimates (quotations), sales orders (performa invoices) and invoices — keyed by
// customer + training type, since Zoho doesn't carry a single id across that chain.

export type DealStage = "lead" | "quotation" | "performa" | "training" | "training_completed" | "invoiced" | "paid";

const STAGE_LABEL: Record<DealStage, string> = {
  lead: "Lead",
  quotation: "Quotation sent",
  performa: "Performa invoice",
  training: "Training scheduled",
  training_completed: "Training completed",
  invoiced: "Invoice sent",
  paid: "Payment received",
};

export function dealStage(d: Deal): DealStage {
  if (d.paymentReceived) return "paid";
  if (d.invoiceSent) return "invoiced";
  if (d.trainingCompleted) return "training_completed";
  if (d.trainingDate) return "training";
  if (d.performaDocId) return "performa";
  if (d.quotationDocId) return "quotation";
  return "lead";
}

export function dealStageLabel(d: Deal): string {
  return STAGE_LABEL[dealStage(d)];
}

const NOT_SENT: ReadonlySet<string> = new Set(["draft", "pending_approval", "approved", "void"]);

function key(customerName: string, trainingType: string | undefined) {
  return `${customerName.trim().toLowerCase()}|${(trainingType ?? "").trim().toLowerCase()}`;
}

function blankDeal(customerName: string, trainingType: string): Deal {
  return {
    id: key(customerName, trainingType),
    customerName,
    trainingType,
    trainingCompleted: false,
    invoiceSent: false,
    paymentReceived: false,
    amount: 0,
    participants: 0,
    updatedAt: "",
  };
}

function bumpUpdatedAt(d: Deal, iso?: string) {
  if (iso && iso > d.updatedAt) d.updatedAt = iso;
}

export function isTrainingCompleted(t: Training, today: Date): boolean {
  return t.status !== "void" && t.status !== "draft" && t.status !== "pending_approval" && parseYmd(t.trainingDate) <= startOfDay(today);
}

export function buildDeals(trainings: Training[], pipeline: PipelineDoc[], leads: Lead[], today: Date): Deal[] {
  const map = new Map<string, Deal>();
  const get = (customerName: string, trainingType: string) => {
    const k = key(customerName, trainingType);
    let d = map.get(k);
    if (!d) {
      d = blankDeal(customerName, trainingType);
      map.set(k, d);
    }
    return d;
  };

  for (const p of pipeline.filter((p) => p.kind === "estimate")) {
    const d = get(p.customerName, p.trainingType);
    d.quotationDocId = p.docId;
    d.quotationDocNumber = p.docNumber;
    d.quotationAt = p.date;
    d.quotationStatus = p.status;
    d.trainingDate ??= p.trainingDate;
    d.priority ??= p.zohoPriority;
    d.amount = Math.max(d.amount, p.amount);
    d.participants = Math.max(d.participants, p.participants);
    bumpUpdatedAt(d, p.date);
  }

  for (const p of pipeline.filter((p) => p.kind === "salesorder")) {
    const d = get(p.customerName, p.trainingType);
    d.performaDocId = p.docId;
    d.performaDocNumber = p.docNumber;
    d.performaAt = p.date;
    d.performaStatus = p.status;
    d.trainingDate ??= p.trainingDate;
    d.priority ??= p.zohoPriority;
    d.amount = Math.max(d.amount, p.amount);
    d.participants = Math.max(d.participants, p.participants);
    bumpUpdatedAt(d, p.date);
  }

  for (const t of trainings) {
    const d = get(t.customerName, t.trainingType);
    d.invoiceDocId = t.zohoDocId;
    d.invoiceDocNumber = t.docNumber;
    d.invoiceStatus = t.status;
    d.invoiceSent = !NOT_SENT.has(t.status);
    d.paymentReceived = t.status === "paid";
    d.trainingDate = t.trainingDate;
    d.trainingCompleted = isTrainingCompleted(t, today);
    d.priority ??= t.zohoPriority;
    d.leadSource ??= t.leadSource;
    d.amount += t.amount;
    d.participants += t.participants;
    bumpUpdatedAt(d, t.trainingDate);
    bumpUpdatedAt(d, t.dueDate);
  }

  for (const lead of leads) {
    const k = key(lead.customerName, lead.trainingType ?? "");
    let d = map.get(k);
    if (!d) {
      // No exact (customer, trainingType) match — attach to any deal for this customer
      // that doesn't have a lead yet, otherwise keep the lead as its own standalone row.
      d = [...map.values()].find((x) => x.customerName.toLowerCase() === lead.customerName.trim().toLowerCase() && !x.leadId);
    }
    if (!d) {
      d = blankDeal(lead.customerName, lead.trainingType ?? "");
      map.set(`lead:${lead.id}`, d);
    }
    d.leadId = lead.id;
    d.leadAt = lead.createdAt;
    d.leadSource ??= lead.source;
    bumpUpdatedAt(d, lead.createdAt);
  }

  return [...map.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** A later stage implies the earlier ones happened in Zoho even if that doc's record
 * dropped out of the "open" pipeline lists (converted/closed docs aren't fetched — see zoho.ts). */
export function dealCascade(d: Deal): { hasQuotation: boolean; hasPerforma: boolean } {
  const hasPerforma = Boolean(d.performaDocId || d.invoiceDocId);
  const hasQuotation = Boolean(d.quotationDocId || hasPerforma);
  return { hasQuotation, hasPerforma };
}
