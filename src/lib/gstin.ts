/*
 * What a GSTIN tells without asking anyone (like Zoho's "Prefill from the GST portal", minus the portal) — shared by
 * the Quotations form (fills the state as you type) and the route (decides the state and GST it sends to Zoho).
 * A GSTIN: 2-digit GST state code, the 10-character PAN, entity number, "Z", check character.
 */

/** The GST state code → Zoho's place-of-supply code (quotations.ts INDIA_STATES). 25 (old Daman and Diu) → DN. */
const GST_STATE: Record<string, string> = {
  "01": "JK", "02": "HP", "03": "PB", "04": "CH", "05": "UK", "06": "HR", "07": "DL", "08": "RJ", "09": "UP", "10": "BR",
  "11": "SK", "12": "AR", "13": "NL", "14": "MN", "15": "MZ", "16": "TR", "17": "ML", "18": "AS", "19": "WB", "20": "JH",
  "21": "OR", "22": "CG", "23": "MP", "24": "GJ", "25": "DN", "26": "DN", "27": "MH", "29": "KA", "30": "GA", "31": "LD",
  "32": "KL", "33": "TN", "34": "PY", "35": "AN", "36": "TS", "37": "AP", "38": "LA",
};

export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
/** State (Zoho code, undefined if the first two digits aren't one) and PAN of a GSTIN. */
export const fromGstin = (g: string) => ({ state: GST_STATE[g.slice(0, 2)] as string | undefined, pan: g.slice(2, 12) });

/** Zoho's GST treatment: registered with a GSTIN; else an unregistered business, or a consumer for a person. */
export const gstTreatment = (n: { kind: "business" | "individual"; gstin?: string }) => (n.gstin ? "business_gst" : n.kind === "individual" ? "consumer" : "business_none");
/** The same in Zoho's words, for the form. */
export const GST_LABEL: Record<string, string> = { business_gst: "Registered business – regular", business_none: "Unregistered business", consumer: "Consumer" };

/** Zoho's GST treatments, in the order of its own "New Customer" form (owner, 27 Nov: External Leads). `gstin`: needs one. */
export const GST_TREATMENTS: { value: string; label: string; hint: string; gstin: boolean }[] = [
  { value: "business_gst", label: "Registered Business - Regular", hint: "Business that is registered under GST", gstin: true },
  { value: "business_registered_composition", label: "Registered Business - Composition", hint: "Registered under the Composition Scheme in GST", gstin: true },
  { value: "business_none", label: "Unregistered Business", hint: "Business that has not been registered under GST", gstin: false },
  { value: "consumer", label: "Consumer", hint: "A customer who is a regular consumer", gstin: false },
  { value: "overseas", label: "Overseas", hint: "Import or export of supplies outside India", gstin: false },
  { value: "business_sez", label: "Special Economic Zone", hint: "A business unit in a Special Economic Zone (SEZ) of India", gstin: true },
  { value: "deemed_export", label: "Deemed Export", hint: "Supply to an Export Oriented Unit or against Advanced Authorization", gstin: true },
  { value: "tax_deductor", label: "Tax Deductor", hint: "State / Central government departments, governmental agencies, local authorities", gstin: true },
  { value: "sez_developer", label: "SEZ Developer", hint: "Owns at least 26% of the equity in creating business units in an SEZ", gstin: true },
];
