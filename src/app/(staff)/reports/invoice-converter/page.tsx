"use client";

import { PageHeader } from "@/components/AppShell";
import { InvoiceConverter } from "@/components/InvoiceConverter";
import { useSession } from "@/lib/session";
import { canConvertInvoices } from "@/lib/roles";

// Reports → Invoice Converter (owner, 17 Nov): each customer's invoices with their PO and e-way bill, completed from here.
export default function InvoiceConverterPage() {
  const { member } = useSession();
  return (
    <>
      <PageHeader title="Invoice Converter" sub="Each customer's invoices: the purchase order and, over ₹50,000, the e-way bill. Add what's missing; it goes straight to the invoice in Zoho Books." />
      {member && !canConvertInvoices(member) ? <p className="card p-6 text-[14px] text-muted">This page is for the people who make and check invoices.</p> : <InvoiceConverter />}
    </>
  );
}
