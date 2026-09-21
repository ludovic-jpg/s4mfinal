/**
 * Questionnaires renseignés en ligne : recueil des besoins (00-AVT), test de positionnement (01-AVT),
 * évaluation des acquis (07-FIN), satisfaction à chaud (08-FIN) et à froid (12-APR).
 *
 * Qui renseigne quoi :
 *  - recueil et positionnement : l'apprenant en ligne, OU le formateur à sa place (entretien, papier) — c'est
 *    ce qui « joint » ces deux pièces au dossier et ouvre la demande de validation (RG-02) ;
 *  - acquis : l'apprenant ; la pièce 07-FIN reste ensuite à signer dans son espace (cahier des charges, 6.4.2) ;
 *  - satisfaction : l'apprenant seulement — un formateur ne note pas sa propre formation.
 */
import { and, eq } from "drizzle-orm";
import { FORMULAIRES, validerReponses, type Reponses } from "@/domaine/formulaires/definitions";
import { corriger, sansCorrige, type Questionnaire } from "@/domaine/formulaires/qcm";
import { aAtteint, estTerminal, type SousStatut } from "@/domaine/pipeline/statuts";
import type { CodePiece } from "@/domaine/referentiel/pieces";
import { evaluation } from "../bd/schema";
import { dateIso, nouvelId } from "../ports/divers";
import { accederAuDossier, stagiairesDuDossier, type LigneDossier } from "./agregat";
import { archiverRendu, nomFichierPiece, rendrePiece, synchroniserPieces, trouverPiece } from "./generation";
import { marquerValidee } from "./retours";
import { ErreurMetier, interdit, invalide, type Acteur, type Services } from "./socle";

export type TypeEvaluation = "recueil" | "positionnement" | "acquis" | "satisfaction_chaud" | "satisfaction_froid";

const CONFIG: Record<TypeEvaluation, { code: CodePiece; ouvertDes: SousStatut; formateurPeutSaisir: boolean; valideLaPiece: boolean }> = {
  recueil: { code: "00-AVT", ouvertDes: "brouillon", formateurPeutSaisir: true, valideLaPiece: true },
  positionnement: { code: "01-AVT", ouvertDes: "brouillon", formateurPeutSaisir: true, valideLaPiece: true },
  // L'évaluation des acquis se signe ensuite : la saisie des réponses ne suffit pas à valider la pièce.
  acquis: { code: "07-FIN", ouvertDes: "formation_debutee", formateurPeutSaisir: false, valideLaPiece: false },
  satisfaction_chaud: { code: "08-FIN", ouvertDes: "fin_dossier_incomplet", formateurPeutSaisir: false, valideLaPiece: true },
  satisfaction_froid: { code: "12-APR", ouvertDes: "fin_dossier_complet", formateurPeutSaisir: false, valideLaPiece: true },
};

function questionnaireDe(d: LigneDossier, type: TypeEvaluation): Questionnaire | null {
  if (type === "positionnement") return d.questionnaire_positionnement as Questionnaire | null;
  if (type === "acquis") return d.questionnaire_acquis as Questionnaire | null;
  return null;
}

function cibleStagiaire(acteur: Acteur, stagiaireId: string | undefined): string {
  if (acteur.role === "apprenant") {
    if (!acteur.stagiaire_id) throw interdit();
    return acteur.stagiaire_id;
  }
  if (!stagiaireId) throw invalide("Le stagiaire concerné doit être précisé.");
  return stagiaireId;
}

/** Ce que l'apprenant (ou le formateur) doit voir pour renseigner un questionnaire — sans le corrigé. */
export async function lireQuestionnaire(s: Services, acteur: Acteur, dossierId: string, type: TypeEvaluation, stagiaireId?: string) {
  const d = await accederAuDossier(s, acteur, dossierId);
  const stagiaire_id = cibleStagiaire(acteur, stagiaireId);
  const [existante] = await s.bd.select().from(evaluation).where(and(eq(evaluation.dossier_id, d.id), eq(evaluation.stagiaire_id, stagiaire_id), eq(evaluation.type, type)));
  const q = questionnaireDe(d, type);
  const config = CONFIG[type];
  return {
    type,
    ouvert: aAtteint(d.sous_statut as SousStatut, config.ouvertDes) && !estTerminal(d.sous_statut as SousStatut),
    formulaire: type === "recueil" ? FORMULAIRES["00-AVT"] : type === "satisfaction_chaud" ? FORMULAIRES["08-FIN"] : type === "satisfaction_froid" ? FORMULAIRES["12-APR"] : null,
    // Le corrigé ne quitte jamais le serveur à destination d'un apprenant.
    questionnaire: q ? (acteur.role === "apprenant" ? sansCorrige(q) : q) : null,
    reponses: existante?.reponses ?? null,
    score: existante?.score ?? null,
    date: existante?.date ?? null,
  };
}

export async function enregistrerEvaluation(
  s: Services,
  acteur: Acteur,
  dossierId: string,
  type: TypeEvaluation,
  donnees: { reponses: unknown; stagiaire_id?: string; ajustement?: string },
) {
  const d = await accederAuDossier(s, acteur, dossierId);
  const config = CONFIG[type];
  const statut = d.sous_statut as SousStatut;
  if (estTerminal(statut)) throw new ErreurMetier("conflit", "Ce dossier est archivé : il n'est plus modifiable.");
  if (!aAtteint(statut, config.ouvertDes)) throw new ErreurMetier("conflit", "Ce questionnaire n'est pas encore ouvert à cette étape du dossier.");
  if (acteur.role === "admin") throw interdit("Les questionnaires sont renseignés par l'apprenant ou par son formateur.");
  if (acteur.role === "formateur" && !config.formateurPeutSaisir) throw interdit("Ce questionnaire est renseigné par l'apprenant lui-même.");

  const stagiaire_id = cibleStagiaire(acteur, donnees.stagiaire_id);
  if (!(await stagiairesDuDossier(s, d.id)).some((l) => l.st.id === stagiaire_id)) throw invalide("Ce stagiaire n'est pas inscrit à ce dossier.");

  let reponses: Reponses | Array<number | null>;
  let score: number | null = null;
  const q = questionnaireDe(d, type);
  if (type === "positionnement" || type === "acquis") {
    if (!q) throw new ErreurMetier("conflit", "Aucun questionnaire n'est rattaché à ce dossier pour cette évaluation.");
    if (!Array.isArray(donnees.reponses) || donnees.reponses.length !== q.questions.length) throw invalide("Une réponse est attendue pour chaque question.");
    reponses = donnees.reponses.map((r, i) => (Number.isInteger(r) && (r as number) >= 0 && (r as number) < q.questions[i]!.propositions.length ? (r as number) : null));
    if (reponses.some((r) => r === null)) throw invalide("Toutes les questions doivent recevoir une réponse.");
    score = corriger(q, reponses).score;
  } else {
    const def = type === "recueil" ? FORMULAIRES["00-AVT"] : type === "satisfaction_chaud" ? FORMULAIRES["08-FIN"] : FORMULAIRES["12-APR"];
    if (typeof donnees.reponses !== "object" || donnees.reponses === null || Array.isArray(donnees.reponses)) throw invalide("Réponses illisibles.");
    reponses = Object.fromEntries(Object.entries(donnees.reponses as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")]));
    const erreurs = validerReponses(def, reponses);
    if (Object.keys(erreurs).length > 0) throw invalide("Certaines réponses sont manquantes ou invalides.", { erreurs });
  }

  await synchroniserPieces(s, d);
  const piece = await trouverPiece(s, d.id, config.code, stagiaire_id);
  // Une pièce déjà validée fait foi : on ne réécrit pas les réponses qui la fondent.
  if (piece?.statut === "valide") throw new ErreurMetier("conflit", "Ce questionnaire est déjà validé : il ne peut plus être modifié.");

  const valeurs = { date: dateIso(s.horloge.maintenant()), reponses, score, ajustement: donnees.ajustement?.trim() ?? "", saisie_par: acteur.utilisateur_id };
  await s.bd
    .insert(evaluation)
    .values({ id: nouvelId(), dossier_id: d.id, stagiaire_id, type, ...valeurs, cree_le: s.horloge.maintenant() })
    .onConflictDoUpdate({ target: [evaluation.dossier_id, evaluation.stagiaire_id, evaluation.type], set: valeurs });

  if (piece && config.valideLaPiece) {
    const { html } = await rendrePiece(s, d, piece);
    const st = (await stagiairesDuDossier(s, d.id)).find((l) => l.st.id === stagiaire_id)!.st;
    const { chemin } = await archiverRendu(s, d, "Retour", `${nomFichierPiece(config.code, `${st.stagiaire_prenom} ${st.stagiaire_nom}`)}_renseigne`, html);
    await marquerValidee(s, d, piece, acteur, { chemin, nom_fichier: chemin.split("/").pop()!, mode: "formulaire" });
  }
  return { score };
}
