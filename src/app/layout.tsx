import type { Metadata } from "next";
import "@fontsource-variable/instrument-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = { title: { default: "Values Tool", template: "%s | Values Tool" }, description: "Local-first adaptive personal values ranking", icons: { icon: "/favicon.svg" } };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><AppShell>{children}</AppShell></body></html>;
}
