import { GSTIN_RE, GST_TREATMENTS, fromGstin } from "./gstin";
import { CUSTOMER_FIELDS, INDIA_STATES } from "./quotations";

/*
 * External Leads (owner, 27 Nov): the important leads, the ones who buy our products and may also book trainings, kept
 * apart from the Zoho leads. Added by hand here; each is made a customer in Zoho Books with Zoho's own "New Customer"
 * fields: the company name is both its Company Name and Display Name, the primary contact (salutation, first and last
 * name, work phone, email), a GSTIN with its GST treatment (Registered Business - Regular by default; the place of supply
 * and PAN come from the GSTIN), the billing address, and the remarks (Zoho's internal Remarks).
 * A company already in Zoho by that name isn't made twice: the lead is kept and linked to it.
 * The form's checks (server side: it reads Zoho's field lists in quotations.ts). Storage and Zoho: externalLeadsServer.ts.
 */

export const SALUTATIONS = ["Mr.", "Mrs.", "Ms.", "Miss", "Dr."] as const;

export type LeadInput = {
  company: string; salutation?: string; firstName?: string; lastName: string; phone?: string; email?: string;
  gstin?: string; treatment?: string; street?: string; street2?: string; city?: string; state?: string; zip?: string;
  remarks?: string; sector?: string; designation?: string; website?: string;
  /** Zoho's Type (owner, 27 Nov: "customer type too"): New Customer, Old Customer, New Reseller … New Vendor for a vendor by default. */
  type?: string;
  /** A customer (default) or a vendor (owner, 27 Nov: "select whether this is a customer or a vendor"). */
  kind?: "customer" | "vendor";
  /** Typed in, or read from a visiting card's photos. */
  source?: "manual" | "card";
};
/** A lead as kept (collection `externalLeads`). `zoho`: the customer it is in Zoho Books; `existed`: it was there already. */
export type ExternalLead = Required<Pick<LeadInput, "company" | "lastName">> & Omit<LeadInput, "company" | "lastName"> & {
  _id: string; by: string; at: string; zoho?: { id: string; name: string }; existed?: boolean; error?: string;
};

const s = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** The form, checked and tidied: the lead, or what's wrong in plain words. */
export function checkLead(raw: Partial<Record<keyof LeadInput, unknown>>): { lead: LeadInput & { stateName: string } } | { error: string } {
  const company = s(raw.company, 200), firstName = s(raw.firstName, 100), lastName = s(raw.lastName, 100);
  const email = s(raw.email, 200).toLowerCase(), phone = s(raw.phone, 30), gstin = s(raw.gstin, 15).toUpperCase().replace(/\s/g, "");
  const salutation = (SALUTATIONS as readonly string[]).includes(s(raw.salutation, 10)) ? s(raw.salutation, 10) : undefined;
  if (company.length < 2) return { error: "Type the company's name" };
  if (!lastName) return { error: "Type the contact's last name (Zoho needs it)" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email doesn't look right" };
  if (phone && phone.replace(/\D/g, "").length < 6) return { error: "That phone number looks too short" };
  if (gstin && !GSTIN_RE.test(gstin)) return { error: "That GSTIN doesn't look right (15 characters)" };
  // With a GSTIN: its treatment (Regular unless another registered one is picked), and its first two digits are the state.
  const picked = GST_TREATMENTS.find((t) => t.value === s(raw.treatment, 40));
  const treatment = gstin ? (picked?.gstin ? picked.value : "business_gst") : picked && !picked.gstin ? picked.value : "business_none";
  const code = gstin ? fromGstin(gstin).state : s(raw.state, 4);
  const state = INDIA_STATES.find(([c]) => c === code);
  if (!state && treatment !== "overseas") return { error: gstin ? "That GSTIN's first two digits aren't a state" : "Pick the state (it decides the GST)" };
  const zip = s(raw.zip, 6);
  if (zip && !/^\d{6}$/.test(zip)) return { error: "The PIN code has 6 digits" };
  // Zoho refuses a customer without its Sector (a mandatory field of ours in Zoho Books).
  const sector = (CUSTOMER_FIELDS.sector.options as readonly string[]).find((x) => x === s(raw.sector, 60));
  if (!sector) return { error: "Pick the sector" };
  const kind = raw.kind === "vendor" ? "vendor" : "customer";
  const type = (CUSTOMER_FIELDS.type.options as readonly string[]).find((x) => x === s(raw.type, 40)) ?? (kind === "vendor" ? "New Vendor" : "New Customer");
  return {
    lead: {
      kind, type, source: raw.source === "card" ? "card" : "manual", designation: s(raw.designation, 100) || undefined,
      website: s(raw.website, 200) || undefined, company, salutation, firstName: firstName || undefined, lastName, phone: phone || undefined, email: email || undefined,
      gstin: gstin || undefined, treatment, street: s(raw.street, 200) || undefined, street2: s(raw.street2, 200) || undefined,
      city: s(raw.city, 100) || undefined, state: state?.[0] ?? "", stateName: state?.[1] ?? "", zip: zip || undefined,
      remarks: typeof raw.remarks === "string" ? raw.remarks.trim().slice(0, 2000) || undefined : undefined, sector,
    },
  };
}

