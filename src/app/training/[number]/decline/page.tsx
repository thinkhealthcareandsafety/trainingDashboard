import { DeclinePage } from "@/components/portal/DeclinePage";

// training.thinkhealth.in/<Training Number>/decline?k=… — the login email's "Decline the quotation" link (owner, 12 Nov).
export default async function Decline({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ k?: string }> }) {
  const [{ number }, { k }] = await Promise.all([params, searchParams]);
  return <DeclinePage number={decodeURIComponent(number).slice(0, 60)} k={String(k ?? "").slice(0, 40)} />;
}
