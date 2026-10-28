"use client";

import { PageHeader } from "@/components/AppShell";
import { Quotations } from "@/components/Quotations";
import { useSession } from "@/lib/session";
import { hasFullAccess } from "@/lib/roles";

// Quotations (owner, 28 Oct): every Zoho customer — one click, a check, and Zoho Books sends the quotation.
export default function QuotationsPage() {
  const { member } = useSession();
  if (member && !hasFullAccess(member)) return <PageHeader title="Quotations" sub="Admin, Ashish, Shikha and Sumit send quotations from here." />;
  return (
    <>
      <PageHeader title="Quotations" sub="Every customer in Zoho Books — pick one, check who it goes to and what's in it, and Zoho Books sends the quotation." />
      <Quotations />
    </>
  );
}
