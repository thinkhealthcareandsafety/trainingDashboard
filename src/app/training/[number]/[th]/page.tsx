import { ParticipantPage } from "@/components/portal/Participant";

// training.thinkhealth.in/<Training Number>/<TH001>?p=… — a participant's own page (docs/TRAINING_MANAGER_PLAN.md step 7).
export default async function Participant({ params, searchParams }: { params: Promise<{ number: string; th: string }>; searchParams: Promise<{ p?: string }> }) {
  const [{ number, th }, { p }] = await Promise.all([params, searchParams]);
  return <ParticipantPage number={decodeURIComponent(number).slice(0, 60)} th={th.slice(0, 12)} p={String(p ?? "").slice(0, 40)} />;
}
