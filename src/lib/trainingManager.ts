/*
 * Training Management (owner, 10 Nov — docs/TRAINING_MANAGER_PLAN.md step 1): the quotes made only for training, from
 * the Training board's copy of Zoho (zohoDocs — the hourly sync keeps each estimate's full detail, so no Zoho calls here).
 * Training-only = every line is a training item ("Training Services"), travel / conveyance and the like aside.
 */

type ZDoc = Record<string, unknown>;

export const INCIDENTAL_LINE = /travel|conveyance|accommodation|lodging|boarding|freight|shipping|courier|packing|forwarding|transport/i;

export type TrainingLine = { name: string; description: string; qty: number; rate: number; total: number };
export type TrainingPerson = { name: string; email: string; phone: string };
export type TrainingQuote = {
  id: string;
  number: string;
  date: string;
  expiry: string;
  status: string;
  customer: string;
  customerId: string;
  contact: TrainingPerson | null;
  lines: TrainingLine[];
  expected: number;
  total: number;
  salesperson: string;
};

/** The client-facing training name: no "(I)" (owner: "exclude the (I)"). */
export const trainingName = (name: string) => name.replace(/\s*\(I\)\s*/gi, " ").replace(/\s+/g, " ").trim();

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v)).trim();
const num = (v: unknown) => Number(v) || 0;

/** Every line a training item (incidental lines aside), and at least one training line. */
export function isTrainingOnly(doc: ZDoc, trainingIds: Set<string>): boolean {
  const lines = ((doc.line_items as ZDoc[]) ?? []).filter((li) => !INCIDENTAL_LINE.test(str(li.name)));
  return lines.length > 0 && lines.every((li) => trainingIds.has(str(li.item_id)));
}

function person(p: ZDoc | undefined): TrainingPerson | null {
  if (!p) return null;
  const name = [str(p.salutation), str(p.first_name), str(p.last_name)].filter(Boolean).join(" ");
  const r = { name, email: str(p.email), phone: str(p.mobile) || str(p.phone) };
  return r.name || r.email || r.phone ? r : null;
}

export function toTrainingQuote(doc: ZDoc, trainingIds: Set<string>): TrainingQuote {
  const all = (doc.line_items as ZDoc[]) ?? [];
  const lines = all.filter((li) => trainingIds.has(str(li.item_id))).map((li) => ({
    name: trainingName(str(li.name)),
    description: str(li.description),
    qty: num(li.quantity),
    rate: num(li.rate),
    total: num(li.item_total),
  }));
  const people = (doc.contact_persons_details as ZDoc[]) ?? [];
  return {
    id: str(doc.estimate_id),
    number: str(doc.estimate_number),
    date: str(doc.date),
    expiry: str(doc.expiry_date),
    status: str(doc.status),
    customer: str(doc.customer_name),
    customerId: str(doc.customer_id),
    contact: person(people.find((p) => p.is_primary_contact) ?? people[0]),
    lines,
    // Expected participants: the training lines' quantity (per-person pricing); the largest line when there are several.
    expected: lines.reduce((m, l) => Math.max(m, l.qty), 0),
    total: num(doc.total),
    salesperson: str(doc.salesperson_name),
  };
}

/** Newest first. */
export const byNewest = (a: TrainingQuote, b: TrainingQuote) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number);
