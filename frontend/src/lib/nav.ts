import { Database, FlaskConical, LayoutDashboard, Settings, Target } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/datasets", label: "Datasets", icon: Database },
  { href: "/runs", label: "Model runs", icon: FlaskConical },
  { href: "/predict", label: "Predict", icon: Target },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function isActiveNav(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
