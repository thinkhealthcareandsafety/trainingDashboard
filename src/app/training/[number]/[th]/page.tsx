import { ParticipantPage } from "@/components/portal/Participant";
import "../../quiz.css";

// training.thinkhealth.in/<Training Number>/<TH001>?p=… — a participant's own page (docs/TRAINING_MANAGER_PLAN.md step 7),
// with the quiz (?quiz=1) once their coordinator starts the training. The quiz uses the portal's own face, Manrope, from
// the layout (owner, 21 Nov: one look across the site).
export default async function Participant({ params, searchParams }: { params: Promise<{ number: string; th: string }>; searchParams: Promise<{ p?: string; quiz?: string }> }) {
  const [{ number, th }, { p, quiz }] = await Promise.all([params, searchParams]);
  return <ParticipantPage number={decodeURIComponent(number).slice(0, 60)} th={th.slice(0, 12)} p={String(p ?? "").slice(0, 40)} quiz={quiz === "1"} />;
}
