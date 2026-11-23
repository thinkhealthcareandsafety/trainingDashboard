import { Manrope } from "next/font/google";
import { DashboardHome } from "@/components/Launcher";

// Inside the Training Dashboard application (owner, 23 Nov): our pages as big icons, "All apps" back to /.
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

export default function TrainingDashboardHome() {
  return <div className={manrope.variable}><DashboardHome /></div>;
}
