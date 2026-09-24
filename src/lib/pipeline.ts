import type { CardEvent, Phase, ZohoLead, ZohoQuote } from "./types";

// A card = Zoho data + every non-reverted CardEvent replayed in order. Nothing Zoho sends is
// overwritten, so reverting a change (or a merge) is just marking its event reverted.

export type CardKind = "lead" | "quote";

export interface ContactEntry {
  value: string;
  phases: Phase[];
  at: string; // newest first
}

export interface CardView {
  id: string;
  kind: CardKind;
  customerId: string; // Zoho contact id — how a lead and a quote are known to be the same client
  name: string;
  aliases: string[];
  emails: ContactEntry[];
  phones: ContactEntry[];
  type?: string;
  sector?: string;
  customerSince?: string;
  salespeople: { phase: string; name: string }[];
  lead?: ZohoLead;
  quote?: ZohoQuote;
  mergedLeadIds: string[]; // quote cards: leads merged into this card
  mergedInto?: string; // lead cards: the quote card this lead lives in now
  deleted: boolean;
  flaggedWith: string[]; // same client sitting in another column, not merged yet
  historyIds: string[]; // cards whose change log belongs to this card
  search: string;
}

export const leadCardId = (contactId: string) => `lead:${contactId}`;
export const quoteCardId = (estimateId: string) => `quote:${estimateId}`;

export const normEmail = (v: string) => v.trim().toLowerCase();
/** Compare numbers by their last 10 digits so "+91 98765 43210" and "9876543210" match. */
export const normPhone = (v: string) => v.replace(/\D/g, "").slice(-10);

type Draft = {
  name: string;
  aliases: string[];
  emails: Map<string, ContactEntry>;
  phones: Map<string, ContactEntry>;
  type?: string;
  sector?: string;
};

function put(map: Map<string, ContactEntry>, key: string, entry: ContactEntry) {
  if (!key) return;
  const cur = map.get(key);
  if (!cur) return void map.set(key, { ...entry, phases: [...entry.phases] });
  for (const p of entry.phases) if (!cur.phases.includes(p)) cur.phases.push(p);
  if (entry.at > cur.at) cur.at = entry.at;
}

function apply(d: Draft, events: CardEvent[]) {
  for (const e of events) {
    const v = e.value ?? "";
    switch (e.kind) {
      case "set_name": if (v.trim()) d.name = v.trim(); break;
      case "set_type": d.type = v || undefined; break;
      case "set_sector": d.sector = v || undefined; break;
      case "add_alias": if (v && !d.aliases.includes(v)) d.aliases.push(v); break;
      case "remove_alias": d.aliases = d.aliases.filter((a) => a !== v); break;
      case "add_email": put(d.emails, normEmail(v), { value: v.trim(), phases: [e.phase ?? "Lead"], at: e.at }); break;
      case "remove_email": d.emails.delete(normEmail(v)); break;
      case "add_phone": put(d.phones, normPhone(v), { value: v.trim(), phases: [e.phase ?? "Lead"], at: e.at }); break;
      case "remove_phone": d.phones.delete(normPhone(v)); break;
    }
  }
}

const sortEntries = (m: Map<string, ContactEntry>) => [...m.values()].sort((a, b) => b.at.localeCompare(a.at));

function leadDraft(l: ZohoLead): Draft {
  const d: Draft = { name: l.name, aliases: [], emails: new Map(), phones: new Map(), type: l.type, sector: l.sector };
  if (l.email) put(d.emails, normEmail(l.email), { value: l.email, phases: ["Lead"], at: l.createdAt });
  for (const p of [l.mobile, l.phone]) if (p) put(d.phones, normPhone(p), { value: p, phases: ["Lead"], at: l.createdAt });
  return d;
}

function quoteDraft(q: ZohoQuote, contact?: ZohoLead): Draft {
  const d: Draft = { name: q.customerName, aliases: [], emails: new Map(), phones: new Map(), type: contact?.type, sector: contact?.sector };
  for (const c of q.contacts) {
    if (c.email) put(d.emails, normEmail(c.email), { value: c.email, phases: ["Quote"], at: q.createdAt });
    for (const p of [c.mobile, c.phone]) if (p) put(d.phones, normPhone(p), { value: p, phases: ["Quote"], at: q.createdAt });
  }
  return d;
}

/** "Quotation & PI Sent By Ashish Dalal, Invoice Sent By Pranjal Nikalje" — consecutive phases by the same person are grouped. */
export function salespersonLabel(people: { phase: string; name: string }[]): string {
  const groups: { phases: string[]; name: string }[] = [];
  for (const p of people) {
    const last = groups[groups.length - 1];
    if (last && last.name === p.name) last.phases.push(p.phase);
    else groups.push({ phases: [p.phase], name: p.name });
  }
  return groups.map((g) => `${g.phases.join(" & ")} Sent By ${g.name}`).join(", ");
}

export function buildBoard(leads: ZohoLead[], quotes: ZohoQuote[], events: CardEvent[]) {
  const active = events.filter((e) => !e.revertedAt).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const byCard = new Map<string, CardEvent[]>();
  const deleted = new Set<string>();
  const mergedInto = new Map<string, string>(); // lead card -> quote card
  for (const e of active) {
    if (e.kind === "merge") mergedInto.set(e.cardIds[0], e.cardIds[1]);
    else if (e.kind === "delete") e.cardIds.forEach((id) => deleted.add(id));
    else for (const id of e.cardIds) byCard.set(id, [...(byCard.get(id) ?? []), e]);
  }

  const contacts = new Map(leads.map((l) => [l.contactId, l]));
  const quoteIds = new Set(quotes.map((q) => quoteCardId(q.estimateId)));
  const cards = new Map<string, CardView>();
  const leadDrafts = new Map<string, Draft>();

  for (const l of leads) {
    const id = leadCardId(l.contactId);
    const d = leadDraft(l);
    apply(d, byCard.get(id) ?? []);
    leadDrafts.set(id, d);
    const into = mergedInto.get(id);
    cards.set(id, finish({
      id, kind: "lead", customerId: l.contactId, lead: l, draft: d, customerSince: l.createdAt, salespeople: [],
      mergedLeadIds: [], mergedInto: into && quoteIds.has(into) ? into : undefined, deleted: deleted.has(id),
    }));
  }

  for (const q of quotes) {
    const id = quoteCardId(q.estimateId);
    const contact = contacts.get(q.customerId);
    const d = quoteDraft(q, contact);
    const merged = [...mergedInto].filter(([leadId, into]) => into === id && leadDrafts.has(leadId)).map(([leadId]) => leadId);
    for (const leadId of merged) {
      // The client's name, aliases and contact details come across from the lead.
      const ld = leadDrafts.get(leadId)!;
      d.name = ld.name;
      for (const a of ld.aliases) if (!d.aliases.includes(a)) d.aliases.push(a);
      for (const [k, v] of ld.emails) put(d.emails, k, v);
      for (const [k, v] of ld.phones) put(d.phones, k, v);
      d.type = ld.type ?? d.type;
      d.sector = ld.sector ?? d.sector;
    }
    apply(d, byCard.get(id) ?? []);
    cards.set(id, finish({
      id, kind: "quote", customerId: q.customerId, quote: q, draft: d, customerSince: contact?.createdAt,
      salespeople: q.salesperson ? [{ phase: "Quotation", name: q.salesperson }] : [],
      mergedLeadIds: merged, deleted: deleted.has(id),
    }));
  }

  // Flag a client that is both a lead and a quote until someone merges them.
  const leadCards = [...cards.values()].filter((c) => c.kind === "lead" && !c.mergedInto);
  const quoteCards = [...cards.values()].filter((c) => c.kind === "quote");
  const quotesByCustomer = new Map<string, CardView[]>();
  for (const q of quoteCards) if (!q.deleted) quotesByCustomer.set(q.customerId, [...(quotesByCustomer.get(q.customerId) ?? []), q]);
  for (const l of leadCards) {
    if (l.deleted) continue;
    for (const q of quotesByCustomer.get(l.customerId) ?? []) {
      l.flaggedWith.push(q.id);
      q.flaggedWith.push(l.id);
    }
  }

  return { cards, leadCards, quoteCards };
}

function finish(c: {
  id: string; kind: CardKind; customerId: string; draft: Draft; customerSince?: string;
  salespeople: CardView["salespeople"]; lead?: ZohoLead; quote?: ZohoQuote;
  mergedLeadIds: string[]; mergedInto?: string; deleted: boolean;
}): CardView {
  const { draft: d } = c;
  const emails = sortEntries(d.emails);
  const phones = sortEntries(d.phones);
  return {
    id: c.id, kind: c.kind, customerId: c.customerId, lead: c.lead, quote: c.quote,
    name: d.name, aliases: d.aliases, emails, phones, type: d.type, sector: d.sector,
    customerSince: c.customerSince, salespeople: c.salespeople,
    mergedLeadIds: c.mergedLeadIds, mergedInto: c.mergedInto, deleted: c.deleted,
    flaggedWith: [],
    historyIds: [c.id, ...c.mergedLeadIds],
    search: [d.name, ...d.aliases, ...emails.map((e) => e.value), ...phones.map((p) => p.value), ...phones.map((p) => normPhone(p.value)),
      c.quote?.number, ...(c.quote?.items.map((i) => i.name) ?? [])].filter(Boolean).join(" ").toLowerCase(),
  };
}

/** Change-log line for an event. */
export function describeEvent(e: CardEvent, nameOf: (cardId: string) => string): string {
  const v = e.value ?? "";
  switch (e.kind) {
    case "set_name": return `Renamed “${e.before ?? ""}” → “${v}”`;
    case "set_type": return `Type: ${e.before || "—"} → ${v || "—"}`;
    case "set_sector": return `Sector: ${e.before || "—"} → ${v || "—"}`;
    case "add_alias": return `Added alias “${v}”`;
    case "remove_alias": return `Removed alias “${v}”`;
    case "add_email": return `Added email ${v} (from ${e.phase ?? "Lead"})`;
    case "remove_email": return `Removed email ${v}`;
    case "add_phone": return `Added contact number ${v} (from ${e.phase ?? "Lead"})`;
    case "remove_phone": return `Removed contact number ${v}`;
    case "delete": return `Deleted ${nameOf(e.cardIds[0])}`;
    case "merge": return `Merged lead “${nameOf(e.cardIds[0])}” into ${nameOf(e.cardIds[1])}`;
  }
}
