import { AttendPage } from "@/components/portal/Attend";

// training.thinkhealth.in/<Training Number>/attend?k=… — what the coordinator's attendance QR opens (owner, 13 Nov).
export default async function Attend({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ k?: string }> }) {
  const [{ number }, { k }] = await Promise.all([params, searchParams]);
  return <AttendPage number={decodeURIComponent(number).slice(0, 60)} k={String(k ?? "").slice(0, 40)} />;
}
