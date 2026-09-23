/**
 * Espace pédagogique — propositions de contenu (cahier des charges oral du 23/09/2026, puis « Modification 1 »).
 *
 * Deux sources, une seule règle :
 *  - l'assistant IA, s'il est configuré (`ANTHROPIC_API_KEY`, `IA_MODELE`) ;
 *  - la TRAME automatique (domaine/pedagogie/parcours.ts), toujours disponible, sans réseau.
 * Dans les deux cas le service ne fait que PROPOSER : le formateur relit, aménage, puis enregistre par les chemins
 * habituels (`modifierFormation`, `enregistrerOutil`), qui appliquent leurs propres contrôles. Seule exception : la
 * production d'un support PPTX, qui ÉCRIT dans le coffre-fort un document que le formateur a validé (ou demandé).
 *
 * C'est le SEUL service qui a le droit d'appeler le port IA (test de garde `ia-perimetre.test.ts`).
 */
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  BORNES_QCM,
  CONSIGNE_SYSTEME,
  consigneDiapos,
  consigneParcours,
  consigneProgramme,
  consigneQcm,
  extraireJson,
  validerPropositionDiapos,
  validerPropositionParcours,
  validerPropositionProgramme,
  validerPropositionQcm,
} from "@/domaine/pedagogie/propositions";
import {
  genererTrameParcours,
  objectifsDepuisModules,
  programmeDepuisModules,
  repartirHeures,
  trameDiapos,
  trameEvaluationAcquis,
  trameTestPositionnement,
  validerDiapos,
  type Diapo,
  type ModuleParcours,
} from "@/domaine/pedagogie/parcours";
import { coffreFichier } from "../bd/schema";
import { iaIndisponible, type OptionsRedaction } from "../ports/ia";
import { ecrireDansCoffre, lireFormation } from "./formations";
import { lireOrganisme } from "./organisme";
import { nomSupport, rendrePptx } from "./supports";
import { ErreurMetier, exigerFormateurValide, invalide, journaliser, type Acteur, type Services } from "./socle";

const assistant = (s: Services) => s.ia ?? iaIndisponible;

export function etatIa(s: Services, acteur: Acteur): { disponible: boolean } {
  return { disponible: acteur.role === "formateur" && assistant(s).disponible };
}

async function demander(s: Services, demande: string, options: OptionsRedaction = {}): Promise<unknown> {
  const ia = assistant(s);
  if (!ia.disponible) throw new ErreurMetier("conflit", "L'assistant IA n'est pas configuré sur ce serveur. Utilisez la trame automatique.");
  let texte: string;
  try {
    texte = await ia.rediger(CONSIGNE_SYSTEME, demande, options);
  } catch (e) {
    throw new ErreurMetier("conflit", e instanceof Error ? e.message : "L'assistant IA est indisponible.");
  }
  return extraireJson(texte);
}

const Mode = z.enum(["ia", "trame"]).default("trame");

/** Modules d'une formation ; à défaut (ancienne formation), un module unique construit sur ses objectifs. */
function modulesDe(f: Awaited<ReturnType<typeof lireFormation>>): ModuleParcours[] {
  const modules = (f.formation_modules ?? []) as ModuleParcours[];
  if (modules.length > 0) return modules;
  const objectifs = f.formation_objectifs.split("\n").map((x) => x.trim()).filter(Boolean);
  const contenus = f.programme.split("\n").map((x) => x.replace(/^[-•\s]+/, "").trim()).filter(Boolean).slice(0, 10);
  return [{ titre: f.formation_titre, duree_heures: f.formation_duree_heures_total ?? 7, objectifs: objectifs.length ? objectifs : [`Maîtriser les fondamentaux de « ${f.formation_titre} »`], contenus: contenus.length ? contenus : [f.formation_titre], methodes: "", mise_en_pratique: "", evaluation: "" }];
}

const contexte = (f: Awaited<ReturnType<typeof lireFormation>>) => ({
  formation_titre: f.formation_titre,
  formation_objectifs: f.formation_objectifs,
  formation_niveau: f.formation_niveau,
  formation_prerequis: f.formation_prerequis,
  public_vise: f.public_vise,
  programme: f.programme,
  formation_duree_heures_total: f.formation_duree_heures_total,
  modules: (f.formation_modules ?? []) as ModuleParcours[],
});

// ——— QCM (existant, enrichi des modules) ———

const SchemaQcm = z.object({
  formation_id: z.string().min(1),
  type: z.enum(["positionnement", "acquis"]),
  nombre: z.number().int().min(BORNES_QCM.min).max(BORNES_QCM.max).default(10),
});

/** Brouillon de QCM (positionnement ou acquis) rédigé par l'IA, fondé sur la formation du formateur. */
export async function proposerQcm(s: Services, acteur: Acteur, donnees: unknown) {
  exigerFormateurValide(acteur);
  const v = SchemaQcm.parse(donnees);
  const f = await lireFormation(s, acteur, v.formation_id); // vérifie que la formation est bien la sienne
  if (!f.formation_objectifs.trim() && !f.programme.trim() && !(f.formation_modules as unknown[]).length) {
    throw invalide("Renseignez d'abord les objectifs, le programme ou le parcours de la formation : l'IA s'appuie dessus.");
  }
  const resultat = validerPropositionQcm(await demander(s, consigneQcm(contexte(f), v.type, v.nombre), { recherche: true }), v.nombre);
  if (!resultat.ok) throw invalide("La proposition de l'IA n'est pas exploitable. Relancez la proposition.", { erreurs: resultat.erreurs });
  return { brouillon: true as const, questionnaire: resultat.valeur };
}

/**
 * Test de positionnement ou évaluation des acquis, en un clic : par l'IA (questions de connaissances) ou par la
 * trame (auto-positionnement par objectif). Toujours un BROUILLON, à relire puis enregistrer dans les outils.
 */
export async function proposerTest(s: Services, acteur: Acteur, donnees: unknown) {
  exigerFormateurValide(acteur);
  const v = SchemaQcm.extend({ mode: Mode }).parse(donnees);
  if (v.mode === "ia") return { source: "ia" as const, ...(await proposerQcm(s, acteur, v)) };
  const f = await lireFormation(s, acteur, v.formation_id);
  const modules = modulesDe(f);
  const questionnaire = v.type === "positionnement" ? trameTestPositionnement(f.formation_titre, modules, v.nombre) : trameEvaluationAcquis(f.formation_titre, modules, v.nombre);
  return { source: "trame" as const, brouillon: true as const, questionnaire };
}

// ——— Objectifs et programme (existant) ———

const SchemaProgramme = z.object({
  formation_titre: z.string().trim().min(3, "Indiquez d'abord l'intitulé de la formation.").max(200),
  formation_niveau: z.string().trim().max(100).default(""),
  public_vise: z.string().trim().max(2000).default(""),
  formation_prerequis: z.string().trim().max(2000).default(""),
  formation_duree_heures_total: z.number().positive().max(2000).nullable().default(null),
});

/** Brouillon d'objectifs pédagogiques et de programme détaillé, à partir de l'intitulé et du public. */
export async function proposerProgramme(s: Services, acteur: Acteur, donnees: unknown) {
  exigerFormateurValide(acteur);
  const v = SchemaProgramme.parse(donnees);
  const resultat = validerPropositionProgramme(await demander(s, consigneProgramme(v)));
  if (!resultat.ok) throw invalide("La proposition de l'IA n'est pas exploitable. Relancez la proposition.", { erreurs: resultat.erreurs });
  return { brouillon: true as const, ...resultat.valeur };
}

// ——— « Modification 1 » : le parcours complet en un clic ———

const SchemaParcours = z.object({
  titre: z.string().trim().min(3, "Indiquez l'intitulé de la formation.").max(200),
  heures: z.number({ error: "Indiquez la durée en heures." }).positive("La durée doit être positive.").max(2000),
  jours: z.number().positive().max(400).nullable().default(null),
  nb_modules: z.number().int().min(1).max(12),
  niveau: z.string().trim().max(100).default(""),
  public_vise: z.string().trim().max(2000).default(""),
  modalite: z.enum(["presentiel", "distanciel", "mixte"]).default("presentiel"),
  mode: Mode,
});

/**
 * Avec seulement l'intitulé, la durée (heures, jours), le nombre de modules (et le tarif, saisi à côté), propose le
 * parcours complet : modules, objectifs, contenus, méthodes, mise en pratique, évaluations, programme rédigé.
 */
export async function proposerParcours(s: Services, acteur: Acteur, donnees: unknown) {
  exigerFormateurValide(acteur);
  const v = SchemaParcours.parse(donnees);
  if (v.heures / v.nb_modules < 0.5) throw invalide("Chaque module doit durer au moins une demi-heure : réduisez le nombre de modules.");
  let modules: ModuleParcours[];
  let objectifs: string;
  if (v.mode === "ia") {
    const durees = repartirHeures(v.heures, v.nb_modules);
    const r = validerPropositionParcours(await demander(s, consigneParcours(v, durees), { recherche: true, maxTokens: 8000 }), durees);
    if (!r.ok) throw invalide("La proposition de l'IA n'est pas exploitable. Relancez, ou utilisez la trame automatique.", { erreurs: r.erreurs });
    modules = r.valeur.modules;
    objectifs = r.valeur.objectifs.join("\n");
  } else {
    modules = genererTrameParcours(v);
    objectifs = objectifsDepuisModules(modules);
  }
  return { brouillon: true as const, source: v.mode, modules, formation_objectifs: objectifs, programme: programmeDepuisModules(modules) };
}

// ——— Supports de cours PPTX : 20 diapositives par module ———

const SchemaPlan = z.object({ formation_id: z.string().min(1), module_index: z.number().int().min(0).max(11), mode: Mode });

/** Plan de 20 diapositives d'un module, à relire et aménager avant de produire le PPTX. */
export async function proposerPlanSupport(s: Services, acteur: Acteur, donnees: unknown) {
  exigerFormateurValide(acteur);
  const v = SchemaPlan.parse(donnees);
  const f = await lireFormation(s, acteur, v.formation_id);
  const modules = modulesDe(f);
  const m = modules[v.module_index];
  if (!m) throw invalide("Ce module n'existe pas dans le parcours.");
  if (v.mode === "trame") return { source: "trame" as const, diapos: trameDiapos(f.formation_titre, m, v.module_index + 1) };
  const r = validerPropositionDiapos(await demander(s, consigneDiapos(contexte(f), m, v.module_index + 1), { recherche: true, maxTokens: 12000 }));
  if (!r.ok) throw invalide("La proposition de l'IA n'est pas exploitable. Relancez, ou utilisez la trame.", { erreurs: r.erreurs });
  return { source: "ia" as const, diapos: r.valeur };
}

const SchemaProduction = z.object({ formation_id: z.string().min(1), module_index: z.number().int().min(0).max(11), diapos: z.unknown() });

/**
 * Produit le PPTX d'un module à partir d'un plan validé, et le range dans le coffre-fort (rubrique « Support de
 * cours », origine « générée »). Le support précédent du même module passe à la corbeille : rien n'est perdu.
 */
export async function produireSupport(s: Services, acteur: Acteur, donnees: unknown) {
  const formateur_id = exigerFormateurValide(acteur);
  const v = SchemaProduction.parse(donnees);
  const f = await lireFormation(s, acteur, v.formation_id);
  const modules = modulesDe(f);
  const m = modules[v.module_index];
  if (!m) throw invalide("Ce module n'existe pas dans le parcours.");
  const plan = validerDiapos(v.diapos);
  if (!plan.ok) throw invalide("Le plan du support est incomplet.", { erreurs: plan.erreurs });
  return enregistrerSupport(s, acteur, formateur_id, f, m, v.module_index, plan.valeur);
}

async function enregistrerSupport(s: Services, acteur: Acteur, formateur_id: string, f: Awaited<ReturnType<typeof lireFormation>>, m: ModuleParcours, index: number, diapos: Diapo[]) {
  const of = await lireOrganisme(s, acteur.of_id);
  const contenu = await rendrePptx({ formation_titre: f.formation_titre, organisme: of.of_nom || "Organisme de formation", couleur: of.couleur, module: m, rang: index + 1, diapos });
  const marque = `module:${index + 1}`;
  await s.bd
    .update(coffreFichier)
    .set({ supprime_le: s.horloge.maintenant() })
    .where(and(eq(coffreFichier.formation_id, f.id), eq(coffreFichier.origine, "genere"), eq(coffreFichier.description, marque), isNull(coffreFichier.supprime_le)));
  const nom = nomSupport(index + 1, m.titre);
  const id = await ecrireDansCoffre(s, acteur.of_id, formateur_id, f.id, { nom, type_mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", contenu }, { categorie: "support", description: marque, partageable: true, origine: "genere" });
  await journaliser(s, { of_id: acteur.of_id, acteur, type: "support_genere", libelle: `Support PPTX du module ${index + 1} produit pour « ${f.formation_titre} »` });
  return { id, nom, diapositives: diapos.length };
}

/** Tous les supports d'un parcours d'un coup (IA ou trame). Un module en échec n'empêche pas les autres. */
export async function produireTousLesSupports(s: Services, acteur: Acteur, donnees: unknown) {
  const formateur_id = exigerFormateurValide(acteur);
  const v = z.object({ formation_id: z.string().min(1), mode: Mode }).parse(donnees);
  const f = await lireFormation(s, acteur, v.formation_id);
  const modules = modulesDe(f);
  const produits: Array<{ nom: string; diapositives: number }> = [];
  const echecs: string[] = [];
  for (const [i, m] of modules.entries()) {
    try {
      const { diapos } = await proposerPlanSupport(s, acteur, { formation_id: f.id, module_index: i, mode: v.mode });
      produits.push(await enregistrerSupport(s, acteur, formateur_id, f, m, i, diapos));
    } catch (e) {
      echecs.push(`Module ${i + 1} : ${e instanceof Error ? e.message : "échec"}`);
    }
  }
  return { produits, echecs };
}
