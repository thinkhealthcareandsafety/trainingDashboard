import { PortalLogin } from "@/components/portal/PortalLogin";

// training.thinkhealth.in/<Training Number> (the quote number, e.g. Quotation-24-002787): the link in the login email.
export default async function PortalTraining({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  return <PortalLogin number={decodeURIComponent(number).slice(0, 60)} />;
}
