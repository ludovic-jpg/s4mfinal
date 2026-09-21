/** Configuration lue dans l'environnement (fichier `.env`), validée une fois au démarrage. */
import { z } from "zod";

const Schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().default("./donnees/base"),
  ARCHIVE_DIR: z.string().default("./donnees/archive"),
  SESSION_SECRET: z.string().default("a-remplacer-par-une-longue-chaine-aleatoire"),
  APP_URL: z.string().url().default("http://localhost:5173"),
  COURRIER_MODE: z.enum(["boite-locale", "smtp"]).default("boite-locale"),
  COURRIER_EXPEDITEUR: z.string().default(""),
  SMTP_URL: z.string().default(""),
  CHROMIUM_PATH: z.string().default(""),
});

export type Config = z.infer<typeof Schema>;

export function lireConfig(env: Record<string, string | undefined> = process.env): Config {
  const config = Schema.parse(env);
  if (config.NODE_ENV === "production" && (config.SESSION_SECRET.length < 32 || config.SESSION_SECRET.startsWith("a-remplacer"))) {
    throw new Error("SESSION_SECRET doit être une chaîne aléatoire d'au moins 32 caractères en production.");
  }
  return config;
}
