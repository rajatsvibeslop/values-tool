"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(() => typeof window !== "undefined" && (localStorage.getItem("values-theme") === "dark" || (!localStorage.getItem("values-theme") && matchMedia("(prefers-color-scheme: dark)").matches)));
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; }, [dark]);
  function toggle() { const next = !dark; setDark(next); localStorage.setItem("values-theme", next ? "dark" : "light"); document.documentElement.dataset.theme = next ? "dark" : "light"; }
  return <button className="btn btn-icon btn-sm" onClick={toggle} title={dark ? "Use light mode" : "Use dark mode"} aria-label={dark ? "Use light mode" : "Use dark mode"}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button>;
}
