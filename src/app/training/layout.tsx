import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./portal.css";

// The coordinators' portal (docs/TRAINING_MANAGER_PLAN.md): its own root layout, none of the staff dashboard around it.
// Manrope: thinkhealth.in's own face (owner: "match thinkhealth.in").
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Think Health Training Manager",
  description: "Manage your Think Health trainings: dates, headcount and attendees.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#034f72" };

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
