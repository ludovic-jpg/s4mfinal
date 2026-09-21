/** Point d'entrée du serveur : configuration, base, ports, API, fichiers statiques de l'interface, tâches de fond. */
import "./env";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { lireConfig } from "./config";
import { ouvrirBase } from "./bd/connexion";
import { organismeExiste } from "./bd/amorce";
import { semer } from "./bd/semence";
import { creerApp } from "./http/app";
import { ArchiveLocale } from "./ports/archive";
import { CourrierJournalise, creerTransportSmtp } from "./ports/courrier";
import { horlogeSysteme } from "./ports/divers";
import { ConvertisseurChromium } from "./ports/pdf";
import { envoyerSatisfactionsAFroid } from "./services/taches";
import type { Services } from "./services/socle";

const config = lireConfig();
const { bd, fermer } = await ouvrirBase(config.DATABASE_URL);
const archive = new ArchiveLocale(config.ARCHIVE_DIR);
const pdf = new ConvertisseurChromium();
const expedition = config.COURRIER_MODE === "smtp" && config.SMTP_URL ? { transport: creerTransportSmtp(config.SMTP_URL), expediteur: config.COURRIER_EXPEDITEUR } : null;
const s: Services = { bd, archive, courrier: new CourrierJournalise(bd, archive, expedition), pdf, horloge: horlogeSysteme, appUrl: config.APP_URL };

// Première ouverture : la base est vide, on y dépose un jeu de démonstration (données fictives).
if (!(await organismeExiste(s))) {
  console.log("[s4m] base vide — création du jeu de démonstration…");
  await semer(s);
}

const app = creerApp(s, { production: config.NODE_ENV === "production" });

// En production, le même serveur sert l'interface compilée (`npm run build` → dist/).
const dist = resolve("dist");
if (existsSync(join(dist, "index.html"))) {
  app.use("/*", serveStatic({ root: "./dist" }));
  const index = readFileSync(join(dist, "index.html"), "utf8");
  app.get("*", (c) => c.html(index));
}

const tacheQuotidienne = () => envoyerSatisfactionsAFroid(s).then((n) => n > 0 && console.log(`[s4m] ${n} questionnaire(s) à froid envoyé(s)`)).catch((e) => console.error("[s4m] tâche quotidienne :", e));
void tacheQuotidienne();
const minuterie = setInterval(tacheQuotidienne, 24 * 3600 * 1000);

const serveur = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`[s4m] API prête sur http://localhost:${info.port}`);
  console.log(`[s4m] base : ${config.DATABASE_URL} · archive : ${config.ARCHIVE_DIR}`);
  console.log(`[s4m] courrier : ${expedition ? "SMTP" : "boîte locale (rien ne part)"} · PDF : ${pdf.disponible ? "Chromium trouvé" : "indisponible — pièces archivées en HTML"}`);
});

const arreter = async () => {
  clearInterval(minuterie);
  serveur.close();
  await pdf.fermer();
  await fermer();
  process.exit(0);
};
process.on("SIGINT", arreter);
process.on("SIGTERM", arreter);
