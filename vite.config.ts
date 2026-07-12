import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? "/values-tool/" : "/",
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  build: { outDir: "out", emptyOutDir: true },
});
