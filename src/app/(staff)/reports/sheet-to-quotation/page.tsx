"use client";

import { PageHeader } from "@/components/AppShell";
import { BoqQuote } from "@/components/BoqQuote";
import { useSession } from "@/lib/session";
import { canConvertInvoices } from "@/lib/roles";

// Reports → Sheet → Quotation (owner, 23 Nov: its own section under the Invoice Converter, no longer a tab on it).
// A customer's item sheet → our items and prices → a draft quotation in Zoho Books; lines not ours yet under New items.
const SUB = "Upload any customer sheet of items (BOQ, enquiry, requirement list): our items and prices are filled in. Check it, then make it a draft quotation in Zoho Books. Lines that aren't our items yet wait under New items.";

export default function SheetToQuotationPage() {
  const { member } = useSession();
  if (member && !canConvertInvoices(member)) return <><PageHeader title="Sheet → Quotation" sub={SUB} /><p className="card p-6 text-[14px] text-muted">This page is for the people who make and check invoices.</p></>;
  return (
    <>
      <PageHeader title="Sheet → Quotation" sub={SUB} />
      <BoqQuote />
    </>
  );
}
