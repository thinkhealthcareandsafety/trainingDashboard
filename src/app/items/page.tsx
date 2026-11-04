"use client";

import { PageHeader } from "@/components/AppShell";
import { ItemsPage } from "@/components/Quotations";
import { useSession } from "@/lib/session";
import { canQuote } from "@/lib/roles";

// Items (owner, 4 Nov: "its a separate page"): the active items, most quoted first; tick some to start a quotation.
export default function ItemsRoute() {
  const { member } = useSession();
  if (member && !canQuote(member)) return <PageHeader title="Items" sub="Admin, Ashish, Shikha, Sumit, Nikita and Pranjal use this page." />;
  return (
    <>
      <PageHeader title="Items" sub="Every active item in Zoho Books, most quoted first. Tick some to start a quotation." />
      <ItemsPage />
    </>
  );
}
