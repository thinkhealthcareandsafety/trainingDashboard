// External Leads (owner, 27 Nov): the form's checks — company in both names, GSTIN → treatment, state and PAN.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLead } from "@/lib/externalLeads";

const base = { company: "Infinity Industries", lastName: "Patil", sector: "Manufacturing" };

test("needs a company, a last name and a sector; email, phone and PIN must look right", () => {
  assert.deepEqual(checkLead({ ...base, company: "" }), { error: "Type the company's name" });
  assert.deepEqual(checkLead({ ...base, lastName: " " }), { error: "Type the contact's last name (Zoho needs it)" });
  assert.deepEqual(checkLead({ ...base, state: "MH", sector: "Space" }), { error: "Pick the sector" });
  assert.match((checkLead({ ...base, email: "no-at-sign" }) as { error: string }).error, /email/);
  assert.match((checkLead({ ...base, state: "MH", zip: "4110" }) as { error: string }).error, /PIN/);
});

test("a GSTIN: Regular by default, its state and nothing typed over it; a registered treatment can be picked", () => {
  const r = checkLead({ ...base, gstin: "27aaifi5186r1zg", state: "KA", remarks: "  met at the expo " });
  assert.ok("lead" in r);
  assert.deepEqual([r.lead.gstin, r.lead.treatment, r.lead.state, r.lead.stateName, r.lead.remarks], ["27AAIFI5186R1ZG", "business_gst", "MH", "Maharashtra", "met at the expo"]);
  const sez = checkLead({ ...base, gstin: "27AAIFI5186R1ZG", treatment: "business_sez" });
  assert.ok("lead" in sez && sez.lead.treatment === "business_sez");
  // A treatment that needs no GSTIN isn't taken with one.
  const odd = checkLead({ ...base, gstin: "27AAIFI5186R1ZG", treatment: "consumer" });
  assert.ok("lead" in odd && odd.lead.treatment === "business_gst");
  assert.match((checkLead({ ...base, gstin: "27AAIFI5186R1Z" }) as { error: string }).error, /GSTIN/);
});

test("without a GSTIN: Unregistered unless Consumer or Overseas is picked; the state is the one chosen", () => {
  const r = checkLead({ ...base, state: "GA" });
  assert.ok("lead" in r && r.lead.treatment === "business_none" && r.lead.stateName === "Goa");
  const c = checkLead({ ...base, state: "GA", treatment: "consumer" });
  assert.ok("lead" in c && c.lead.treatment === "consumer");
  const reg = checkLead({ ...base, state: "GA", treatment: "business_gst" });
  assert.ok("lead" in reg && reg.lead.treatment === "business_none");
  assert.match((checkLead({ ...base }) as { error: string }).error, /state/);
});
