import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/lib/theme";
import { RatioModeProvider } from "@/lib/ratioMode";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nifty Macro Dashboard",
  description: "Live NSE India index valuations — P/E, P/B, Implied EPS & Book Value with 4-year historical context",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#e6ccb2] dark:bg-[#1c1c2e] text-zinc-900 dark:text-zinc-100">
        <ThemeProvider><RatioModeProvider>{children}</RatioModeProvider></ThemeProvider>
      </body>
    </html>
  );
}
