"use client";

import { PageHeader } from "@/components/AppShell";
import { TrainingManagement } from "@/components/TrainingManagement";
import { useSession } from "@/lib/session";
import { canQuote } from "@/lib/roles";

// Training Management (owner, 10 Nov — docs/TRAINING_MANAGER_PLAN.md): the quotes made only for training.
export default function TrainingManagementPage() {
  const { member } = useSession();
  if (member && !canQuote(member)) return <PageHeader title="Training Management" sub="Admin, Ashish, Shikha, Sumit, Nikita, Anuj and Pranjal see the training quotes here." />;
  return (
    <>
      <PageHeader title="Training Management" sub="Quotes made only for training, from the dashboard or Zoho. Open one for the customer, the training and what it includes." />
      <TrainingManagement />
    </>
  );
}
