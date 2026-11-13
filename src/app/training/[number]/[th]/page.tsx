import { Fraunces, IBM_Plex_Mono, Inter } from "next/font/google";
import { ParticipantPage } from "@/components/portal/Participant";
import "../../quiz.css";

// The quiz's own faces (owner, 13 Nov: the AED Readiness Campaign's design) — loaded only on participants' pages.
const fraunces = Fraunces({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-fraunces", display: "swap" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-inter", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-plex-mono", display: "swap" });

// training.thinkhealth.in/<Training Number>/<TH001>?p=… — a participant's own page (docs/TRAINING_MANAGER_PLAN.md step 7),
// with the quiz (?quiz=1) once their coordinator starts the training.
export default async function Participant({ params, searchParams }: { params: Promise<{ number: string; th: string }>; searchParams: Promise<{ p?: string; quiz?: string }> }) {
  const [{ number, th }, { p, quiz }] = await Promise.all([params, searchParams]);
  return (
    <div className={`${fraunces.variable} ${inter.variable} ${plexMono.variable}`}>
      <ParticipantPage number={decodeURIComponent(number).slice(0, 60)} th={th.slice(0, 12)} p={String(p ?? "").slice(0, 40)} quiz={quiz === "1"} />
    </div>
  );
}
