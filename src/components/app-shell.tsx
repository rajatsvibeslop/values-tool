import Link from "next/link";
import { Activity, ArrowLeftRight, BarChart3, Database, FileText, History, ListOrdered, Search, Settings, SlidersHorizontal, Tags, TriangleAlert } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

const navigation = [
  ["/", "Dashboard", Activity], ["/compare", "Compare", ArrowLeftRight], ["/queue", "Queue", ListOrdered],
  ["/rankings", "Rankings", BarChart3], ["/values", "Values", Tags], ["/tensions", "Tensions", TriangleAlert],
  ["/history", "History", History], ["/reports", "Reports", FileText], ["/data", "Data", Database], ["/settings", "Settings", Settings],
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/"><span className="brand-mark"><SlidersHorizontal size={16} /></span><span>Values Tool</span></Link>
      <nav className="nav-list" aria-label="Primary navigation">{navigation.map(([href, label, Icon]) => <Link className="nav-item" href={href} key={href}><Icon size={19} aria-hidden="true" /><span>{label}</span></Link>)}</nav>
      <div className="sidebar-footer"><ThemeToggle /></div>
    </aside>
    <div className="content-shell">
      <header className="topbar"><form className="search-form" action="/search"><Search size={16} aria-hidden="true" /><input name="q" aria-label="Search all records" placeholder="Search values, notes, claims, tensions..." /></form></header>
      <main>{children}</main>
    </div>
  </div>;
}
