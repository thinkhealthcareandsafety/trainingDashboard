"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/AppShell";
import { InvoiceConverter } from "@/components/InvoiceConverter";
import { useSession } from "@/lib/session";
import { canConvertInvoices } from "@/lib/roles";

// Reports → Invoice Converter (owner, 17 Nov): each customer's invoices with their PO and e-way bill, completed from here.
// Sheet → Quotation was a tab here (20 Nov); since 23 Nov it's its own section under this one (owner) — old ?tab=boq links go there.
const SUB = "Each customer's invoices: the purchase order and, over ₹50,000, the e-way bill. Add what's missing; it goes straight to the invoice in Zoho Books.";

export default function InvoiceConverterPage() {
  const { member } = useSession();
  const router = useRouter();
  useEffect(() => { if (new URLSearchParams(window.location.search).get("tab") === "boq") router.replace("/reports/sheet-to-quotation"); }, [router]);
  if (member && !canConvertInvoices(member)) return <><PageHeader title="Invoice Converter" sub={SUB} /><p className="card p-6 text-[14px] text-muted">This page is for the people who make and check invoices.</p></>;
  return (
    <>
      <PageHeader title="Invoice Converter" sub={SUB} />
      <InvoiceConverter />
    </>
  );
}
