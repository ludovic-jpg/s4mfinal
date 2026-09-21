/** Répertoires réutilisables d'un dossier à l'autre : entreprises clientes et fiches Apprenant (F-COM-01, F-COM-02). */
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { entrepriseCliente, stagiaire } from "../bd/schema";
import { nouvelId } from "../ports/divers";
import { exigerFormateurValide, introuvable, type Acteur, type Services } from "./socle";

const email = z.union([z.literal(""), z.string().trim().toLowerCase().email("Adresse e-mail invalide.")]);

// Champs alignés sur les variables `entreprise_*` du dictionnaire.
export const SchemaEntreprise = z.object({
  entreprise_nom: z.string().trim().min(2, "La raison sociale est obligatoire.").max(200),
  entreprise_nom_commercial: z.string().trim().max(200).default(""),
  entreprise_adresse: z.string().trim().max(400).default(""),
  entreprise_siret: z.string().trim().max(20).default(""),
  entreprise_representant_civilite: z.string().trim().max(20).default(""),
  entreprise_representant_prenom: z.string().trim().max(100).default(""),
  entreprise_representant_nom: z.string().trim().max(100).default(""),
  entreprise_representant_telephone: z.string().trim().max(30).default(""),
  entreprise_representant_email: email.default(""),
});

// Champs alignés sur les variables `stagiaire_*`.
export const SchemaStagiaire = z.object({
  stagiaire_prenom: z.string().trim().min(1, "Le prénom est obligatoire.").max(100),
  stagiaire_nom: z.string().trim().min(1, "Le nom est obligatoire.").max(100),
  stagiaire_email: email.default(""),
  stagiaire_telephone: z.string().trim().max(30).default(""),
  stagiaire_poste: z.string().trim().max(200).default(""),
  stagiaire_situation_handicap: z.string().trim().max(500).default(""),
  entreprise_id: z.string().nullable().default(null),
});

export async function listerEntreprises(s: Services, acteur: Acteur) {
  const formateur_id = exigerFormateurValide(acteur);
  return s.bd.select().from(entrepriseCliente).where(eq(entrepriseCliente.formateur_id, formateur_id)).orderBy(asc(entrepriseCliente.entreprise_nom));
}

export async function lireEntreprise(s: Services, acteur: Acteur, id: string) {
  const formateur_id = exigerFormateurValide(acteur);
  const [e] = await s.bd.select().from(entrepriseCliente).where(and(eq(entrepriseCliente.id, id), eq(entrepriseCliente.formateur_id, formateur_id)));
  if (!e) throw introuvable("Entreprise");
  return e;
}

export async function enregistrerEntreprise(s: Services, acteur: Acteur, donnees: unknown, id?: string) {
  const formateur_id = exigerFormateurValide(acteur);
  if (id) {
    await lireEntreprise(s, acteur, id);
    await s.bd.update(entrepriseCliente).set(SchemaEntreprise.partial().parse(donnees)).where(eq(entrepriseCliente.id, id));
    return lireEntreprise(s, acteur, id);
  }
  const nouveauId = nouvelId();
  await s.bd.insert(entrepriseCliente).values({ id: nouveauId, of_id: acteur.of_id, formateur_id, ...SchemaEntreprise.parse(donnees), cree_le: s.horloge.maintenant() });
  return lireEntreprise(s, acteur, nouveauId);
}

export async function listerStagiaires(s: Services, acteur: Acteur) {
  const formateur_id = exigerFormateurValide(acteur);
  return s.bd.select().from(stagiaire).where(eq(stagiaire.formateur_id, formateur_id)).orderBy(asc(stagiaire.stagiaire_nom), asc(stagiaire.stagiaire_prenom));
}

export async function lireStagiaire(s: Services, acteur: Acteur, id: string) {
  const formateur_id = exigerFormateurValide(acteur);
  const [st] = await s.bd.select().from(stagiaire).where(and(eq(stagiaire.id, id), eq(stagiaire.formateur_id, formateur_id)));
  if (!st) throw introuvable("Fiche apprenant");
  return st;
}

export async function enregistrerStagiaire(s: Services, acteur: Acteur, donnees: unknown, id?: string) {
  const formateur_id = exigerFormateurValide(acteur);
  const valeurs = id ? SchemaStagiaire.partial().parse(donnees) : SchemaStagiaire.parse(donnees);
  if (valeurs.entreprise_id) await lireEntreprise(s, acteur, valeurs.entreprise_id);
  if (id) {
    await lireStagiaire(s, acteur, id);
    await s.bd.update(stagiaire).set(valeurs).where(eq(stagiaire.id, id));
    return lireStagiaire(s, acteur, id);
  }
  const nouveauId = nouvelId();
  await s.bd.insert(stagiaire).values({ id: nouveauId, of_id: acteur.of_id, formateur_id, ...(valeurs as z.infer<typeof SchemaStagiaire>), cree_le: s.horloge.maintenant() });
  return lireStagiaire(s, acteur, nouveauId);
}
