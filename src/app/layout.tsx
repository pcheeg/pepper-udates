import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pupdate | Pepper’s family scrapbook",
  description: "A private family feed and shared scrapbook for Pepper.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
