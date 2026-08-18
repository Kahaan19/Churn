import type { ReactNode } from "react";

import { MobileNav, Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Visible only once tabbed to, so a keyboard user can skip five nav links on every page. */}
        <a
          href="#main"
          className="sr-only rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
        >
          Skip to content
        </a>
        <header className="flex h-14 items-center justify-between gap-3 border-b border-border px-4 sm:px-6">
          <span className="truncate font-heading text-sm font-medium md:font-sans md:font-normal md:text-muted-foreground">
            <span className="md:hidden">CRIP</span>
            <span className="hidden md:inline">Customer Retention Intelligence Platform</span>
          </span>
          <ThemeToggle />
        </header>
        <MobileNav />
        <main id="main" className="flex-1 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
