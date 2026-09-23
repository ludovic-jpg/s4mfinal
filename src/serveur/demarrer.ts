/** Point d'entrée du serveur : configuration, base, ports, API, fichiers statiques de l'interface, tâches de fond. */
import "./env";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { lireConfig } from "./config";
import { ouvrirBase } from "./bd/connexion";
import { assurerComptePilote, creerOrganismeVierge, creerUtilisateur, organismeExiste } from "./bd/amorce";
import { COMPTES_DEMO, MDP_DEMO, semer } from "./bd/semence";
import { creerApp } from "./http/app";
import { ArchiveLocale } from "./ports/archive";
import { CourrierJournalise, creerTransportSmtp } from "./ports/courrier";
import { horlogeSysteme } from "./ports/divers";
import { ConvertisseurChromium } from "./ports/pdf";
import { creerAssistant } from "./ports/ia";
import { envoyerSatisfactionsAFroid } from "./services/taches";
import type { Services } from "./services/socle";

const config = lireConfig();
const { bd, fermer } = await ouvrirBase(config.DATABASE_URL);
const archive = new ArchiveLocale(config.ARCHIVE_DIR);
const pdf = new ConvertisseurChromium();
const expedition = config.COURRIER_MODE === "smtp" && config.SMTP_URL ? { transport: creerTransportSmtp(config.SMTP_URL), expediteur: config.COURRIER_EXPEDITEUR } : null;
const dist = resolve("dist");
const interfaceCompilee = existsSync(join(dist, "index.html"));
const appUrl = config.APP_URL || (interfaceCompilee ? `http://localhost:${config.PORT}` : "http://localhost:5173");
const s: Services = { bd, archive, courrier: new CourrierJournalise(bd, archive, expedition), pdf, horloge: horlogeSysteme, appUrl, ia: creerAssistant(config.ANTHROPIC_API_KEY, config.IA_MODELE, config.IA_RECHERCHE_WEB === "oui") };

// Première ouverture : la base est vide. Soit un jeu de démonstration (données fictives), soit un organisme
// vierge à configurer et son premier administrateur (AMORCE=vide).
if (!(await organismeExiste(s))) {
  if (config.AMORCE === "vide") {
    const of_id = await creerOrganismeVierge(s);
    await creerUtilisateur(s, { of_id, email: config.ADMIN_EMAIL, mot_de_passe: config.ADMIN_MOT_DE_PASSE, role: "admin", prenom: "Administrateur", nom: "" });
    console.log(`[s4m] base vide — organisme vierge créé. Connectez-vous avec ${config.ADMIN_EMAIL}, puis ouvrez « Organisme ».`);
  } else {
    console.log("[s4m] base vide — création du jeu de démonstration…");
    await semer(s);
    console.log(`[s4m] comptes de démonstration (mot de passe : ${MDP_DEMO}) : ${COMPTES_DEMO.map((c) => c.email).join(", ")}`);
  }
}

// Compte formateur pilote (demande du 23/09/2026) : vérifié à chaque démarrage, créé s'il manque.
if (config.COMPTE_PILOTE_EMAIL) {
  const r = await assurerComptePilote(s, { email: config.COMPTE_PILOTE_EMAIL, mot_de_passe: config.COMPTE_PILOTE_MOT_DE_PASSE, prenom: config.COMPTE_PILOTE_PRENOM, nom: config.COMPTE_PILOTE_NOM });
  console.log(`[s4m] compte formateur pilote ${config.COMPTE_PILOTE_EMAIL} : ${r}`);
}

const app = creerApp(s, { production: config.NODE_ENV === "production" });

// En production, le même serveur sert l'interface compilée (`npm run build` → dist/).
if (interfaceCompilee) {
  app.use("/*", serveStatic({ root: "./dist" }));
  const index = readFileSync(join(dist, "index.html"), "utf8");
  app.get("*", (c) => c.html(index));
}

const tacheQuotidienne = () => envoyerSatisfactionsAFroid(s).then((n) => n > 0 && console.log(`[s4m] ${n} questionnaire(s) à froid envoyé(s)`)).catch((e) => console.error("[s4m] tâche quotidienne :", e));
void tacheQuotidienne();
const minuterie = setInterval(tacheQuotidienne, 24 * 3600 * 1000);

const serveur = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`[s4m] ${interfaceCompilee ? "application" : "API"} prête sur http://localhost:${info.port}${interfaceCompilee ? "" : " — interface : npm run dev:web"}`);
  console.log(`[s4m] base : ${config.DATABASE_URL} · archive : ${config.ARCHIVE_DIR}`);
  console.log(`[s4m] courrier : ${expedition ? "SMTP" : "boîte locale (rien ne part)"} · PDF : ${pdf.disponible ? "Chromium trouvé" : "indisponible — pièces archivées en HTML"} · IA pédagogique : ${s.ia?.disponible ? `activée (${config.IA_MODELE})` : "désactivée"}`);
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
