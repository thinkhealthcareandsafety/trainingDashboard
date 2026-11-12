"use client";

import { useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { Templates } from "@/components/Templates";
import { PortalContentEditor } from "@/components/PortalContentEditor";
import { Segmented } from "@/components/ui";
import { useSession } from "@/lib/session";
import { canQuote } from "@/lib/roles";

// Templates (owner, 10 Nov: "we should technically be able to edit templates on the page"): the wording of the emails we
// send — and Portal content (step 4 of docs/TRAINING_MANAGER_PLAN.md): the programmes and links on the Training Manager.
type View = "emails" | "portal";
const SUB: Record<View, string> = {
  emails: "The wording of the emails we send. Change one, check the preview, and Save: the next email uses it. Reset puts back the built-in wording.",
  portal: "What training coordinators see on the Training Manager besides their trainings: the programmes, their videos and photos, and our links.",
};

export default function TemplatesPage() {
  const { member } = useSession();
  const [view, setView] = useState<View>("emails");
  if (member && !canQuote(member)) return <PageHeader title="Templates" sub="Admin, Ashish, Shikha, Sumit, Nikita, Anuj and Pranjal change the email templates here." />;
  return (
    <>
      <PageHeader title="Templates" sub={SUB[view]} actions={<Segmented value={view} onChange={setView} size="md" options={[{ value: "emails", label: "Email templates" }, { value: "portal", label: "Portal content" }]} />} />
      {view === "emails" ? <Templates /> : <PortalContentEditor />}
    </>
  );
}
