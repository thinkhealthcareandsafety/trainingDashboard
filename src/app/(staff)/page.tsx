import { Manrope } from "next/font/google";
import { Launcher } from "@/components/Launcher";

// The apps home page (owner, 23 Nov): everyone lands here after signing in; Overview moved to /overview.
// Manrope: the training portal's face, for look C ("Signboard").
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

export default function AppsHome() {
  return <div className={manrope.variable}><Launcher /></div>;
}
