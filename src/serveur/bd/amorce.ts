/** Création des enregistrements de base : un organisme, son administrateur. Utilisé par la semence et par les tests. */
import { eq } from "drizzle-orm";
import { dossierDeDemonstration } from "@/domaine/dossier/fixture";
import { formateur, organismeFormation, utilisateur } from "./schema";
import { hacherMotDePasse, normaliserEmail } from "../services/auth";
import type { Services } from "../services/socle";
import { nouvelId } from "../ports/divers";

export async function creerOrganisme(s: Services, surcharge: Partial<typeof organismeFormation.$inferInsert> = {}): Promise<string> {
  const id = surcharge.id ?? nouvelId();
  await s.bd.insert(organismeFormation).values({ ...dossierDeDemonstration().organisme, ...surcharge, id });
  return id;
}

/** Organisme SANS identité : tout est à saisir dans l'écran « Organisme » avant de pouvoir valider un dossier. */
export async function creerOrganismeVierge(s: Services): Promise<string> {
  const id = nouvelId();
  await s.bd.insert(organismeFormation).values({ id });
  return id;
}

export async function creerUtilisateur(
  s: Services,
  donnees: { of_id: string; email: string; mot_de_passe: string; role: "admin" | "formateur" | "apprenant"; prenom: string; nom: string },
): Promise<string> {
  const id = nouvelId();
  await s.bd.insert(utilisateur).values({
    id,
    of_id: donnees.of_id,
    email: normaliserEmail(donnees.email),
    mot_de_passe_hash: await hacherMotDePasse(donnees.mot_de_passe),
    role: donnees.role,
    prenom: donnees.prenom,
    nom: donnees.nom,
  });
  return id;
}

/** Crée un formateur dont la candidature est déjà validée (démonstration, tests). */
export async function creerFormateurValide(
  s: Services,
  donnees: { of_id: string; email: string; mot_de_passe: string; prenom: string; nom: string },
): Promise<{ utilisateur_id: string; formateur_id: string }> {
  const utilisateur_id = await creerUtilisateur(s, { ...donnees, role: "formateur" });
  const formateur_id = nouvelId();
  const demo = dossierDeDemonstration().formateur;
  await s.bd.insert(formateur).values({
    ...demo,
    id: formateur_id,
    of_id: donnees.of_id,
    utilisateur_id,
    formateur_prenom: donnees.prenom,
    formateur_nom: donnees.nom,
    formateur_email: normaliserEmail(donnees.email),
    parcours: "Dix ans de conseil et de formation en bureautique et pilotage de l'activité.",
    statut_candidature: "validee",
    soumise_le: s.horloge.maintenant(),
    decidee_le: s.horloge.maintenant(),
  });
  return { utilisateur_id, formateur_id };
}

export async function organismeExiste(s: Services): Promise<boolean> {
  return (await s.bd.select({ id: organismeFormation.id }).from(organismeFormation).limit(1)).length > 0;
}

export async function utilisateurParEmail(s: Services, email: string) {
  const [u] = await s.bd.select().from(utilisateur).where(eq(utilisateur.email, normaliserEmail(email)));
  return u ?? null;
}
