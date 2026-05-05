import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";

import "@/app/globals.css";
import { AppShell } from "@/components/app-shell";
import { WalletProvider } from "@/components/wallet-provider";

const brandSerif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-brand-serif"
});

const bodySans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-body-sans"
});

const dataMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-data-mono"
});

export const metadata: Metadata = {
  title: "Fhenix-FairMarket App",
  description: "Sealed-bid auction prototype with a premium Sepolia-first experience."
};

export const viewport: Viewport = {
  themeColor: "#050505"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${brandSerif.variable} ${bodySans.variable} ${dataMono.variable}`}>
        <WalletProvider>
          <AppShell>{children}</AppShell>
        </WalletProvider>
      </body>
    </html>
  );
}
