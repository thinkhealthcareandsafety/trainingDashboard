/*
 * A Zoho document's status as a small chip (owner, 30 Oct: "I want to see their quote status too, because how would I
 * know which is sent or declined or draft"). Quotations: draft / sent / accepted / declined / expired / invoiced;
 * sales orders (PIs): draft / open / partially invoiced / invoiced / closed. Zoho's own words, tidied.
 */
const TONE: Record<string, string> = {
  draft: "bg-surface-2 text-muted",
  sent: "bg-info-bg text-info",
  open: "bg-info-bg text-info",
  pending_approval: "bg-medium-bg text-medium",
  approved: "bg-info-bg text-info",
  accepted: "bg-low-bg text-low",
  invoiced: "bg-low-bg text-low",
  partially_invoiced: "bg-low-bg text-low",
  closed: "bg-low-bg text-low",
  declined: "bg-high-bg text-high",
  expired: "bg-medium-bg text-medium",
};

export function docStatus(status?: string | null): { label: string; tone: string } | null {
  const s = (status ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!s) return null;
  const label = s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  return { label, tone: TONE[s] ?? "bg-surface-2 text-ink-2" };
}
