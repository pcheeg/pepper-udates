import type { Metadata, Viewport } from "next";
import PwaRegister from "@/components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pupdates | Pepper's family scrapbook",
  description: "A private family feed and shared scrapbook for Pepper.",
  applicationName: "Pupdates",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/pupdate-icon.svg", apple: "/pupdate-icon.svg" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Pupdates" },
};

export const viewport: Viewport = { themeColor: "#fbf8f3", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="h-full antialiased"><body className="min-h-full"><PwaRegister />{children}</body></html>;
}
