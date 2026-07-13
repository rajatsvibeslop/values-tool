import Link from "next/link";
import { ArrowLeftRight, FileText, Settings, SlidersHorizontal } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

const navigation = [
  ["/compare", "Quiz", ArrowLeftRight],
  ["/reports", "Reports", FileText],
  ["/settings", "Settings", Settings],
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/compare"><span className="brand-mark"><SlidersHorizontal size={16} /></span><span>Values Lab</span></Link>
      <nav className="nav-list" aria-label="Primary navigation">{navigation.map(([href, label, Icon]) => <Link className="nav-item" href={href} key={href}><Icon size={19} aria-hidden="true" /><span>{label}</span></Link>)}</nav>
      <div className="sidebar-footer"><ThemeToggle /></div>
    </aside>
    <div className="content-shell">
      <header className="topbar"><div className="topbar-title"><strong>Values Lab</strong><span className="muted small">Quiz / Reports / Settings</span></div></header>
      <main>{children}</main>
    </div>
  </div>;
}
