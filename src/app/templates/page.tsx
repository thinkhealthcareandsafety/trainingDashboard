"use client";

import { PageHeader } from "@/components/AppShell";
import { Templates } from "@/components/Templates";
import { useSession } from "@/lib/session";
import { canQuote } from "@/lib/roles";

// Templates (owner, 10 Nov: "we should technically be able to edit templates on the page"): the wording of the emails we send.
export default function TemplatesPage() {
  const { member } = useSession();
  if (member && !canQuote(member)) return <PageHeader title="Templates" sub="Admin, Ashish, Shikha, Sumit, Nikita and Pranjal change the email templates here." />;
  return (
    <>
      <PageHeader title="Templates" sub="The wording of the emails we send. Change one, check the preview, and Save: the next email uses it. Reset puts back the built-in wording." />
      <Templates />
    </>
  );
}
