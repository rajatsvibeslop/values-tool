import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/instrument-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@/app/globals.css";
import { StaticApp } from "./static-app";

createRoot(document.getElementById("root")!).render(<StrictMode><StaticApp /></StrictMode>);
