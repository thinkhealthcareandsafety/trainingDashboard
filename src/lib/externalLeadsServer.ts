import "server-only";
import { randomUUID } from "crypto";
import { db } from "./db";
import { readAll } from "./cachedRead";
import { nameKey } from "./analytics/build";
import { createCustomer } from "./quotations";
import type { ExternalLead, LeadInput } from "./externalLeads";
import type { ZohoLead } from "./types";

/* External Leads (externalLeads.ts): kept in `externalLeads`, newest first; each one a customer in Zoho Books. */

const col = async () => (await db()).collection<ExternalLead>("externalLeads");

export async function listLeads(): Promise<ExternalLead[]> {
  return (await col()).find({}).sort({ at: -1 }).limit(1000).toArray();
}

/** The company already in Zoho Books by this name (our copy of Zoho's customers), if any. */
export async function zohoMatch(company: string): Promise<{ id: string; name: string } | undefined> {
  const { docs } = await readAll<ZohoLead>("zohoCustomers");
  const key = nameKey(company);
  const hit = docs.find((c) => nameKey(c.name) === key);
  return hit ? { id: hit.contactId, name: hit.name } : undefined;
}

/**
 * Keeps the lead and makes it a customer in Zoho Books, or links it to the one already there by that name. A Zoho refusal
 * still keeps the lead (with the reason), so nothing typed is lost; "Try Zoho again" retries it.
 */
export async function addLead(lead: LeadInput & { stateName: string }, by: string): Promise<ExternalLead> {
  const { stateName, ...kept } = lead;
  const row: ExternalLead = { ...kept, _id: randomUUID(), by, at: new Date().toISOString() };
  await toZoho(row, stateName);
  await (await col()).insertOne(row);
  return row;
}

export async function retryLead(id: string, stateName: string): Promise<ExternalLead | null> {
  const c = await col();
  const row = await c.findOne({ _id: id });
  if (!row || row.zoho) return row;
  await toZoho(row, stateName);
  await c.replaceOne({ _id: id }, row);
  return row;
}

async function toZoho(row: ExternalLead, stateName: string): Promise<void> {
  try {
    const vendor = row.kind === "vendor";
    // Our copy holds Zoho's customers only: a vendor is checked by Zoho itself (it refuses a second contact by the same name).
    const had = vendor ? undefined : await zohoMatch(row.company);
    if (had) { row.zoho = had; row.existed = true; delete row.error; return; }
    // Only the live site writes to Zoho Books (as on Quotations): a local copy keeps the lead and says so.
    if (process.env.VERCEL_ENV !== "production") { row.error = "Not sent to Zoho: only the live site adds customers to Zoho Books"; return; }
    row.zoho = await createCustomer({
      kind: "business", company: row.company, displayName: row.company, salutation: row.salutation, firstName: row.firstName ?? "",
      lastName: row.lastName, email: row.email ?? "", workPhone: row.phone, state: row.state ?? "", stateName,
      street: row.street, street2: row.street2, city: row.city, zip: row.zip, gstin: row.gstin, treatment: row.treatment,
      remarks: row.remarks, type: row.type ?? (vendor ? "New Vendor" : "New Customer"), sector: row.sector ?? "", contactType: vendor ? "vendor" : "customer",
      website: row.website, designation: row.designation,
    });
    row.existed = false;
    delete row.error;
  } catch (e) {
    row.error = e instanceof Error ? e.message : String(e);
  }
}
