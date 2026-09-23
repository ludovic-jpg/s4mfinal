/**
 * Espace pédagogique — propositions rédigées par l'IA (cahier des charges oral du 23/09/2026).
 *
 * Ce service ne fait que PROPOSER : il n'écrit rien en base. Le formateur relit, corrige, puis enregistre
 * par les chemins habituels (`enregistrerOutil`, `modifierFormation`), qui appliquent leurs propres contrôles.
 * C'est le SEUL service qui a le droit d'appeler le port IA (test de garde `ia-perimetre.test.ts`).
 */
import { z } from "zod";
import { BORNES_QCM, CONSIGNE_SYSTEME, consigneProgramme, consigneQcm, extraireJson, validerPropositionProgramme, validerPropositionQcm } from "@/domaine/pedagogie/propositions";
import { iaIndisponible } from "../ports/ia";
import { lireFormation } from "./formations";
import { ErreurMetier, exigerFormateurValide, invalide, type Acteur, type Services } from "./socle";

const assistant = (s: Services) => s.ia ?? iaIndisponible;

export function etatIa(s: Services, acteur: Acteur): { disponible: boolean } {
  return { disponible: acteur.role === "formateur" && assistant(s).disponible };
}

async function demander(s: Services, demande: string): Promise<unknown> {
  const ia = assistant(s);
  if (!ia.disponible) throw new ErreurMetier("conflit", "L'assistant IA n'est pas configuré sur ce serveur.");
  let texte: string;
  try {
    texte = await ia.rediger(CONSIGNE_SYSTEME, demande);
  } catch (e) {
    throw new ErreurMetier("conflit", e instanceof Error ? e.message : "L'assistant IA est indisponible.");
  }
  return extraireJson(texte);
}

const SchemaQcm = z.object({
  formation_id: z.string().min(1),
  type: z.enum(["positionnement", "acquis"]),
  nombre: z.number().int().min(BORNES_QCM.min).max(BORNES_QCM.max).default(10),
});

/** Brouillon de QCM (positionnement ou acquis) fondé sur la formation du formateur. */
export async function proposerQcm(s: Services, acteur: Acteur, donnees: unknown) {
  exigerFormateurValide(acteur);
  const v = SchemaQcm.parse(donnees);
  const f = await lireFormation(s, acteur, v.formation_id); // vérifie que la formation est bien la sienne
  if (!f.formation_objectifs.trim() && !f.programme.trim()) {
    throw invalide("Renseignez d'abord les objectifs ou le programme de la formation : l'IA s'appuie dessus.");
  }
  const resultat = validerPropositionQcm(await demander(s, consigneQcm(f, v.type, v.nombre)), v.nombre);
  if (!resultat.ok) throw invalide("La proposition de l'IA n'est pas exploitable. Relancez la proposition.", { erreurs: resultat.erreurs });
  return { brouillon: true as const, questionnaire: resultat.valeur };
}

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
