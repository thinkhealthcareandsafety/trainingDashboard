import { JoinPage } from "@/components/portal/Participant";

// training.thinkhealth.in/<Training Number>/join?k=… — what the coordinator's QR code opens (docs/TRAINING_MANAGER_PLAN.md step 7).
export default async function Join({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ k?: string }> }) {
  const [{ number }, { k }] = await Promise.all([params, searchParams]);
  return <JoinPage number={decodeURIComponent(number).slice(0, 60)} k={String(k ?? "").slice(0, 40)} />;
}
