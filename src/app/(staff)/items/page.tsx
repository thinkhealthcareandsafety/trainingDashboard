"use client";

import { PageHeader } from "@/components/AppShell";
import { ItemsPage } from "@/components/Quotations";
import { useSession } from "@/lib/session";
import { canQuote, canSee } from "@/lib/roles";

// Items (owner, 4 Nov: "its a separate page"): the active items, most quoted first. Everyone can look (owner, 5 Nov); those who quote tick some to start a quotation.
export default function ItemsRoute() {
  const { member } = useSession();
  if (member && !canSee(member, "items")) return <PageHeader title="Items" sub="Items aren't on your account." />;
  return (
    <>
      <PageHeader title="Items" sub={`Every active item in Zoho Books, most quoted first.${member && canQuote(member) ? " Tick some to start a quotation." : ""}`} />
      <ItemsPage />
    </>
  );
}
