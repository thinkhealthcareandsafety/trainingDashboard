import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { SessionProvider } from "@/lib/session";
import { AppShell } from "@/components/AppShell";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ThinkHealth Training Dashboard",
  description: "Training KPIs, calendar and follow-ups for ThinkHealth.in, powered by Zoho Books.",
};

// Applies the saved theme (light / dark) and background (Change theme) before paint, to avoid a flash.
const themeScript = `try{var d=document.documentElement,t=localStorage.getItem("th.theme"),b=localStorage.getItem("th.bg");if(t)d.dataset.theme=t;if(b)d.dataset.bg=b}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <SessionProvider>
          <StoreProvider>
            <AppShell>{children}</AppShell>
          </StoreProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
