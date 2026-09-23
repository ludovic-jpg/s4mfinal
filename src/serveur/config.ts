/** Configuration lue dans l'environnement (fichier `.env`), validée une fois au démarrage. */
import { z } from "zod";

const Schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().default("./donnees/base"),
  ARCHIVE_DIR: z.string().default("./donnees/archive"),
  /** Première ouverture d'une base vide : `demonstration` (jeu fictif) ou `vide` (un organisme à configurer + un admin). */
  AMORCE: z.enum(["demonstration", "vide"]).default("demonstration"),
  ADMIN_EMAIL: z.string().default(""),
  ADMIN_MOT_DE_PASSE: z.string().default(""),
  /** Vide = déduite : le serveur lui-même s'il sert l'interface compilée, sinon le serveur de développement Vite. */
  APP_URL: z.union([z.literal(""), z.string().url()]).default(""),
  COURRIER_MODE: z.enum(["boite-locale", "smtp"]).default("boite-locale"),
  COURRIER_EXPEDITEUR: z.string().default(""),
  SMTP_URL: z.string().default(""),
  CHROMIUM_PATH: z.string().default(""),
  /** Assistant IA de l'espace pédagogique (facultatif) : les deux doivent être renseignés pour l'activer. */
  ANTHROPIC_API_KEY: z.string().default(""),
  IA_MODELE: z.string().default(""),
});

export type Config = z.infer<typeof Schema>;

export function lireConfig(env: Record<string, string | undefined> = process.env): Config {
  const config = Schema.parse(env);
  if (config.AMORCE === "vide" && (!config.ADMIN_EMAIL || config.ADMIN_MOT_DE_PASSE.length < 10)) {
    throw new Error("AMORCE=vide exige ADMIN_EMAIL et ADMIN_MOT_DE_PASSE (10 caractères au moins) pour créer le premier administrateur.");
  }
  return config;
}
