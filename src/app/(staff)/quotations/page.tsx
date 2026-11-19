"use client";

import { PageHeader } from "@/components/AppShell";
import { Quotations } from "@/components/Quotations";
import { useSession } from "@/lib/session";
import { canQuote, canSee } from "@/lib/roles";

// Quotations (owner, 28 Oct): every Zoho customer — one click, a check, and Zoho Books sends the quotation.
export default function QuotationsPage() {
  const { member } = useSession();
  if (member && !canSee(member, "quotations")) return <PageHeader title="Quotations" sub="Quotations aren't on your account." />;
  const looking = Boolean(member && !canQuote(member));
  return (
    <>
      <PageHeader title="Quotations" sub={looking ? "Every customer in Zoho Books and their last quotation — open one to see it. You can look, not send." : "Every customer in Zoho Books — pick one, check who it goes to and what's in it, and Zoho Books sends the quotation."} />
      <Quotations />
    </>
  );
}
