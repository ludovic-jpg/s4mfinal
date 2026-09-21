import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// En développement, Vite sert l'interface (5173) et relaie /api vers le serveur Hono (3001).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { port: 5173, proxy: { "/api": { target: `http://localhost:${process.env.PORT ?? 3001}`, changeOrigin: false } } },
  build: { outDir: "dist", sourcemap: true, chunkSizeWarningLimit: 900 },
});
