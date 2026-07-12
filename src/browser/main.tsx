import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/app/globals.css";
import { StaticApp } from "./static-app";

createRoot(document.getElementById("root")!).render(<StrictMode><StaticApp /></StrictMode>);
