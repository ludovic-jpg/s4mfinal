/** Module 2 — Mes formations (F-FORM-01, F-FORM-02) et Module 3 — outils pédagogiques et coffre-fort (F-OUT-01 à 05). */
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { validerQuestionnaire, type Questionnaire } from "@/domaine/formulaires/qcm";
import { aAtteint, type SousStatut } from "@/domaine/pipeline/statuts";
import { coffreFichier, dossierFormation, formation, modeleOutil, stagiaireDossier } from "../bd/schema";
import { cheminCoffre } from "../ports/archive";
import { nouvelId } from "../ports/divers";
import { validerFichier, type FichierDepose } from "./fichiers";
import { exigerFormateurValide, interdit, introuvable, invalide, validerPartiel, type Acteur, type Services } from "./socle";

// Champs alignés sur les variables `formation_*` du dictionnaire (F-FORM-01).
export const SchemaFormation = z.object({
  formation_titre: z.string().trim().min(3, "L'intitulé est obligatoire.").max(200),
  formation_objectifs: z.string().trim().max(4000).default(""),
  formation_niveau: z.string().trim().max(100).default(""),
  formation_prerequis: z.string().trim().max(2000).default(""),
  formation_duree_heures_total: z.number().positive().max(2000).nullable().default(null),
  formation_duree_jours: z.number().positive().max(400).nullable().default(null),
  formation_modalite: z.enum(["presentiel", "distanciel", "mixte"]).default("presentiel"),
  formation_prix_unitaire_ht: z.number().int().min(0).max(100_000_000).nullable().default(null),
  programme: z.string().trim().max(20000).default(""),
  public_vise: z.string().trim().max(2000).default(""),
});

export async function listerFormations(s: Services, acteur: Acteur) {
  const formateur_id = exigerFormateurValide(acteur);
  return s.bd.select().from(formation).where(and(eq(formation.formateur_id, formateur_id), eq(formation.archivee, false))).orderBy(desc(formation.cree_le));
}

export async function lireFormation(s: Services, acteur: Acteur, id: string) {
  const formateur_id = exigerFormateurValide(acteur);
  const [f] = await s.bd.select().from(formation).where(and(eq(formation.id, id), eq(formation.formateur_id, formateur_id)));
  if (!f) throw introuvable("Formation");
  return f;
}

export async function creerFormation(s: Services, acteur: Acteur, donnees: unknown) {
  const formateur_id = exigerFormateurValide(acteur);
  const valeurs = SchemaFormation.parse(donnees);
  const id = nouvelId();
  await s.bd.insert(formation).values({ id, of_id: acteur.of_id, formateur_id, ...valeurs, cree_le: s.horloge.maintenant() });
  return lireFormation(s, acteur, id);
}

export async function modifierFormation(s: Services, acteur: Acteur, id: string, donnees: unknown) {
  await lireFormation(s, acteur, id);
  const valeurs = validerPartiel(SchemaFormation, donnees);
  if (Object.keys(valeurs).length > 0) await s.bd.update(formation).set(valeurs).where(eq(formation.id, id));
  return lireFormation(s, acteur, id);
}

/** F-FORM-02 : dupliquer une formation, avec ses modèles d'outils (mais pas le contenu du coffre-fort). */
export async function dupliquerFormation(s: Services, acteur: Acteur, id: string) {
  const source = await lireFormation(s, acteur, id);
  const { id: _i, cree_le: _c, ...copie } = source;
  const nouveauId = nouvelId();
  await s.bd.insert(formation).values({ ...copie, id: nouveauId, formation_titre: `${source.formation_titre} (copie)`, cree_le: s.horloge.maintenant() });
  const outils = await s.bd.select().from(modeleOutil).where(eq(modeleOutil.formation_id, id));
  for (const o of outils) {
    const { id: _oi, cree_le: _oc, ...outil } = o;
    await s.bd.insert(modeleOutil).values({ ...outil, id: nouvelId(), formation_id: nouveauId, cree_le: s.horloge.maintenant() });
  }
  return lireFormation(s, acteur, nouveauId);
}

/** Une formation utilisée par des dossiers est archivée, jamais supprimée : les dossiers gardent leur origine. */
export async function archiverFormation(s: Services, acteur: Acteur, id: string) {
  await lireFormation(s, acteur, id);
  await s.bd.update(formation).set({ archivee: true }).where(eq(formation.id, id));
}

// ——— Outils pédagogiques : modèles de recueil, de positionnement, d'évaluation des acquis ———

const SchemaQuestionnaire = z.object({
  titre: z.string().trim().max(200),
  questions: z
    .array(z.object({ enonce: z.string().trim().max(1000), propositions: z.array(z.string().trim().max(500)).max(8), bonne_reponse: z.number().int() }))
    .max(40),
});

const SchemaOutil = z.object({
  type: z.enum(["recueil", "positionnement", "acquis"]),
  titre: z.string().trim().min(1).max(200),
  formation_id: z.string().nullable().default(null),
  contenu: z.unknown(),
});

function validerContenuOutil(type: "recueil" | "positionnement" | "acquis", contenu: unknown): unknown {
  if (type === "recueil") {
    // Le recueil a des questions fixes (matrice de l'organisme) ; le formateur peut en ajouter.
    return z.object({ questions_supplementaires: z.array(z.string().trim().min(3).max(500)).max(10).default([]) }).parse(contenu ?? {});
  }
  const q = SchemaQuestionnaire.parse(contenu) as Questionnaire;
  const erreurs = validerQuestionnaire(q);
  if (erreurs.length > 0) throw invalide("Le questionnaire est incomplet.", { erreurs });
  return q;
}

export async function listerOutils(s: Services, acteur: Acteur) {
  const formateur_id = exigerFormateurValide(acteur);
  return s.bd.select().from(modeleOutil).where(eq(modeleOutil.formateur_id, formateur_id)).orderBy(desc(modeleOutil.cree_le));
}

export async function lireOutil(s: Services, acteur: Acteur, id: string) {
  const formateur_id = exigerFormateurValide(acteur);
  const [o] = await s.bd.select().from(modeleOutil).where(and(eq(modeleOutil.id, id), eq(modeleOutil.formateur_id, formateur_id)));
  if (!o) throw introuvable("Outil pédagogique");
  return o;
}

export async function enregistrerOutil(s: Services, acteur: Acteur, donnees: unknown, id?: string) {
  const formateur_id = exigerFormateurValide(acteur);
  const valeurs = SchemaOutil.parse(donnees);
  if (valeurs.formation_id) await lireFormation(s, acteur, valeurs.formation_id);
  const contenu = validerContenuOutil(valeurs.type, valeurs.contenu);
  if (id) {
    await lireOutil(s, acteur, id);
    await s.bd.update(modeleOutil).set({ titre: valeurs.titre, formation_id: valeurs.formation_id, contenu }).where(eq(modeleOutil.id, id));
    return lireOutil(s, acteur, id);
  }
  const nouveauId = nouvelId();
  await s.bd.insert(modeleOutil).values({ id: nouveauId, of_id: acteur.of_id, formateur_id, type: valeurs.type, titre: valeurs.titre, formation_id: valeurs.formation_id, contenu, cree_le: s.horloge.maintenant() });
  return lireOutil(s, acteur, nouveauId);
}

export async function supprimerOutil(s: Services, acteur: Acteur, id: string) {
  await lireOutil(s, acteur, id);
  await s.bd.delete(modeleOutil).where(eq(modeleOutil.id, id));
}

// ——— Coffre-fort pédagogique, rattaché à la formation (F-OUT-04) ———

export async function listerCoffre(s: Services, acteur: Acteur, formationId: string) {
  await lireFormation(s, acteur, formationId);
  return s.bd.select().from(coffreFichier).where(eq(coffreFichier.formation_id, formationId)).orderBy(coffreFichier.cree_le);
}

export async function deposerDansCoffre(s: Services, acteur: Acteur, formationId: string, fichier: FichierDepose, partageable = true) {
  const formateur_id = exigerFormateurValide(acteur);
  await lireFormation(s, acteur, formationId);
  validerFichier(fichier, "coffre");
  const id = nouvelId();
  const chemin = await s.archive.ecrire(cheminCoffre(acteur.of_id, formationId, `${id.slice(0, 8)}_${fichier.nom}`), fichier.contenu);
  await s.bd.insert(coffreFichier).values({ id, of_id: acteur.of_id, formateur_id, formation_id: formationId, nom_fichier: fichier.nom, chemin, taille: fichier.contenu.length, type_mime: fichier.type_mime, partageable, cree_le: s.horloge.maintenant() });
  return listerCoffre(s, acteur, formationId);
}

export async function reglerPartage(s: Services, acteur: Acteur, fichierId: string, partageable: boolean) {
  const formateur_id = exigerFormateurValide(acteur);
  const [f] = await s.bd.select().from(coffreFichier).where(and(eq(coffreFichier.id, fichierId), eq(coffreFichier.formateur_id, formateur_id)));
  if (!f) throw introuvable("Fichier");
  await s.bd.update(coffreFichier).set({ partageable }).where(eq(coffreFichier.id, fichierId));
}

export async function supprimerDuCoffre(s: Services, acteur: Acteur, fichierId: string) {
  const formateur_id = exigerFormateurValide(acteur);
  const [f] = await s.bd.select().from(coffreFichier).where(and(eq(coffreFichier.id, fichierId), eq(coffreFichier.formateur_id, formateur_id)));
  if (!f) throw introuvable("Fichier");
  await s.archive.supprimer(f.chemin);
  await s.bd.delete(coffreFichier).where(eq(coffreFichier.id, fichierId));
}

/**
 * Coffres ouverts à un apprenant — RG-08 : un coffre s'ouvre dès que SON dossier a atteint l'accord de
 * financement, et seulement pour les éléments marqués « partageable » (hypothèse, point ouvert n° 5).
 */
export async function coffresDeLApprenant(s: Services, acteur: Acteur) {
  if (acteur.role !== "apprenant" || !acteur.stagiaire_id) throw interdit();
  const dossiers = await s.bd
    .select({ d: dossierFormation })
    .from(stagiaireDossier)
    .innerJoin(dossierFormation, eq(dossierFormation.id, stagiaireDossier.dossier_id))
    .where(eq(stagiaireDossier.stagiaire_id, acteur.stagiaire_id));
  const ouverts = dossiers.map((x) => x.d).filter((d) => d.formation_id && aAtteint(d.sous_statut as SousStatut, "accord_financement"));
  if (ouverts.length === 0) return [];
  const fichiers = await s.bd
    .select()
    .from(coffreFichier)
    .where(and(inArray(coffreFichier.formation_id, ouverts.map((d) => d.formation_id!)), eq(coffreFichier.partageable, true)));
  return ouverts.map((d) => ({
    dossier_id: d.id,
    dossier_reference: d.dossier_reference,
    formation_titre: d.formation_titre,
    fichiers: fichiers.filter((f) => f.formation_id === d.formation_id).map((f) => ({ id: f.id, nom_fichier: f.nom_fichier, taille: f.taille })),
  }));
}

export async function telechargerDuCoffre(s: Services, acteur: Acteur, fichierId: string) {
  const [f] = await s.bd.select().from(coffreFichier).where(and(eq(coffreFichier.id, fichierId), eq(coffreFichier.of_id, acteur.of_id)));
  if (!f) throw introuvable("Fichier");
  if (acteur.role === "formateur" && f.formateur_id !== acteur.formateur_id) throw introuvable("Fichier");
  if (acteur.role === "apprenant") {
    const autorises = (await coffresDeLApprenant(s, acteur)).flatMap((c) => c.fichiers.map((x) => x.id));
    if (!autorises.includes(f.id)) throw introuvable("Fichier");
  }
  return { nom: f.nom_fichier, contenu: await s.archive.lire(f.chemin) };
}
