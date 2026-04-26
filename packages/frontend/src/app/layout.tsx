import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Oxanium } from "next/font/google";

import "@/app/globals.css";
import { AppShell } from "@/components/app-shell";
import { WalletProvider } from "@/components/wallet-provider";

const brandSerif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-brand-serif"
});

const technoSans = Oxanium({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-techno-sans"
});

export const metadata: Metadata = {
  title: "Fhenix-FairMarket App",
  description: "Confidential sealed-bid auctions with a premium Sepolia-first experience."
};

export const viewport: Viewport = {
  themeColor: "#05030c"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${brandSerif.variable} ${technoSans.variable}`}>
        <WalletProvider>
          <AppShell>{children}</AppShell>
        </WalletProvider>
      </body>
    </html>
  );
}
