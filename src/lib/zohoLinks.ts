// Deep links into the Zoho Books web app (India data centre).
const DEFAULT_ORG = "60016330017";

export function zohoUrl(kind: "invoice" | "salesorder" | "estimate" | "payment" | "item", id: string, orgId = DEFAULT_ORG): string {
  const path = kind === "invoice" ? "invoices" : kind === "salesorder" ? "salesorders" : kind === "payment" ? "paymentsreceived" : kind === "item" ? "inventory/items" : "quotes";
  return `https://books.zoho.in/app/${orgId}#/${path}/${id}`;
}
