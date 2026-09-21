import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

// Parcours de bout en bout dans un vrai navigateur, sur une base de démonstration neuve et jetable.
// Le Chromium utilisé est celui de la machine (CHROMIUM_PATH), sinon celui de Playwright (`npx playwright install chromium`).
const chromium = [process.env.CHROMIUM_PATH, "/opt/pw-browsers/chromium"].find((c) => c && existsSync(c));
const PORT = 3199;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1, // les scénarios se suivent sur la même base
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, locale: "fr-FR", launchOptions: { ...(chromium ? { executablePath: chromium } : {}), args: ["--no-sandbox"] } },
  webServer: {
    // Commande portable (Windows, macOS, Linux) : pas de `rm -rf`.
    command: `npm run build && node -e "require('fs').rmSync('donnees-e2e',{recursive:true,force:true})" && tsx src/serveur/demarrer.ts`,
    url: `http://localhost:${PORT}/api/referentiel`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: { PORT: String(PORT), DATABASE_URL: "./donnees-e2e/base", ARCHIVE_DIR: "./donnees-e2e/archive", APP_URL: `http://localhost:${PORT}`, NODE_ENV: "test" },
  },
});
