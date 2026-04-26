"use client";

import { useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandWordmark } from "@/components/brand-lockup";
import { ConnectWalletButton } from "@/components/connect-wallet-button";
import { SystemHealthBar } from "@/components/system-health-bar";
import { appRoutes } from "@/lib/app-config";

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const handleSkipLinkClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    const mainContent = document.getElementById("main-content");

    if (!mainContent) {
      return;
    }

    event.preventDefault();
    mainContent.focus();
  }, []);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content" onClick={handleSkipLinkClick}>
        Skip to content
      </a>
      <div className="shell-frame">
        <header className="shell-topbar">
          <BrandWordmark />
          <nav className="shell-nav" aria-label="Primary">
            {appRoutes.map((route) => (
              <Link
                key={route.href}
                href={route.href}
                aria-current={pathname === route.href ? "page" : undefined}
                data-active={pathname === route.href}
              >
                {route.label}
              </Link>
            ))}
          </nav>
          <ConnectWalletButton />
        </header>

        <SystemHealthBar />

        <main className="shell-main" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
