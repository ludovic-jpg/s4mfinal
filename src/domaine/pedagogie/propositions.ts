/**
 * Propositions pédagogiques rédigées par une IA — cahier des charges oral du 23/09/2026 :
 * « l'usage de l'IA est important sur la partie support pédagogique ; sur le reste, elle ne semble pas
 * nécessaire, car tout doit être produit de manière très exacte ».
 *
 * Trois règles, vérifiées par les tests :
 *  1. L'IA ne fait que PROPOSER un brouillon. Rien n'est enregistré sans relecture et enregistrement
 *     par le formateur (l'humain reste l'auteur, et c'est lui qui engage l'organisme).
 *  2. Toute réponse de l'IA est validée ici, strictement, avant d'être montrée : une réponse mal formée
 *     est rejetée, jamais « réparée » en silence.
 *  3. L'IA ne touche ni aux pièces contractuelles (convention, planning, factures…), ni au pipeline,
 *     ni aux montants : seul le service `pedagogie-ia` l'appelle (test de garde dans `ia-perimetre.test.ts`).
 *
 * Module pur : il construit les consignes et valide les réponses, sans appel réseau.
 */
import { validerQuestionnaire, type Questionnaire } from "../formulaires/qcm";
import { DIAPOS_PAR_MODULE, heuresTexte, validerDiapos, validerModules, type Diapo, type EntreeParcours, type ModuleParcours } from "./parcours";

export interface ContexteFormation {
  formation_titre: string;
  formation_objectifs: string;
  formation_niveau: string;
  formation_prerequis: string;
  public_vise: string;
  programme: string;
  formation_duree_heures_total: number | null;
  /** Modules du parcours, s'ils existent : ils rendent les questions plus précises. */
  modules?: ModuleParcours[];
}

export type TypeQcm = "positionnement" | "acquis";

export const BORNES_QCM = { min: 3, max: 20 } as const;

/** Rôle et garde-fous communs à toutes les demandes. */
export const CONSIGNE_SYSTEME = [
  "Tu es ingénieur pédagogique francophone, spécialiste de la formation professionnelle continue en France et du référentiel national qualité (Qualiopi).",
  "Tu rédiges des BROUILLONS que le formateur relira et corrigera avant tout usage.",
  "N'invente aucune donnée administrative, financière ou logistique : ni date, ni prix, ni lieu, ni nom de personne ou d'entreprise, ni numéro.",
  "Réponds uniquement par un objet JSON valide, conforme au schéma demandé, sans texte avant ou après.",
].join("\n");

function decrire(f: ContexteFormation): string {
  return [
    `Intitulé : ${f.formation_titre}`,
    f.formation_niveau && `Niveau : ${f.formation_niveau}`,
    f.public_vise && `Public visé : ${f.public_vise}`,
    f.formation_prerequis && `Prérequis : ${f.formation_prerequis}`,
    f.formation_duree_heures_total && `Durée : ${f.formation_duree_heures_total} heures`,
    f.formation_objectifs && `Objectifs :\n${f.formation_objectifs}`,
    f.modules?.length ? `Modules :\n${f.modules.map((m, i) => `${i + 1}. ${m.titre} — ${m.objectifs.join(" ; ")}`).join("\n")}` : "",
    f.programme && `Programme :\n${f.programme}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function consigneQcm(f: ContexteFormation, type: TypeQcm, nombre: number): string {
  const nature =
    type === "positionnement"
      ? "un test de positionnement, passé AVANT la formation, pour mesurer le niveau de départ et ajuster le programme (indicateur Qualiopi n° 8)"
      : "une évaluation des acquis, passée EN FIN de formation, qui mesure l'atteinte de chaque objectif pédagogique (indicateur Qualiopi n° 11)";
  return [
    `Rédige ${nature}.`,
    `Exactement ${nombre} questions à choix multiples, chacune avec 4 propositions distinctes et une seule bonne réponse.`,
    "Les questions portent strictement sur le contenu de la formation décrite ci-dessous.",
    'Schéma : {"titre": string, "questions": [{"enonce": string, "propositions": [string, string, string, string], "bonne_reponse": 0 | 1 | 2 | 3}]}',
    "",
    decrire(f),
  ].join("\n");
}

export function consigneProgramme(f: Pick<ContexteFormation, "formation_titre" | "formation_niveau" | "public_vise" | "formation_prerequis" | "formation_duree_heures_total">): string {
  return [
    "Propose les objectifs pédagogiques et le programme détaillé de cette action de formation.",
    "Objectifs : 3 à 8, opérationnels et évaluables, chacun commençant par un verbe d'action à l'infinitif, un par ligne, sans numérotation.",
    "Programme : découpé en séquences (par demi-journée ou par journée selon la durée), chacune avec un titre court suivi de ses points de contenu.",
    'Schéma : {"objectifs": string[], "programme": string}',
    "",
    decrire({ ...f, formation_objectifs: "", programme: "" }),
  ].join("\n");
}

export type Resultat<T> = { ok: true; valeur: T } | { ok: false; erreurs: string[] };

const texte = (x: unknown): x is string => typeof x === "string";

/** Valide un QCM proposé par l'IA : forme, nombre exact de questions, règles du QCM de la plateforme. */
export function validerPropositionQcm(brut: unknown, nombreAttendu: number): Resultat<Questionnaire> {
  if (typeof brut !== "object" || brut === null) return { ok: false, erreurs: ["La réponse de l'IA n'est pas un objet."] };
  const o = brut as Record<string, unknown>;
  if (!texte(o.titre) || !Array.isArray(o.questions)) return { ok: false, erreurs: ["La réponse de l'IA ne suit pas le schéma attendu (titre, questions)."] };
  const questions = o.questions.map((q) => {
    const x = (q ?? {}) as Record<string, unknown>;
    return {
      enonce: texte(x.enonce) ? x.enonce.trim() : "",
      propositions: Array.isArray(x.propositions) ? x.propositions.map((p) => (texte(p) ? p.trim() : "")) : [],
      bonne_reponse: typeof x.bonne_reponse === "number" ? x.bonne_reponse : -1,
    };
  });
  const qcm: Questionnaire = { titre: o.titre.trim(), questions };
  const erreurs = validerQuestionnaire(qcm);
  if (questions.length !== nombreAttendu) erreurs.unshift(`L'IA a proposé ${questions.length} questions au lieu de ${nombreAttendu}.`);
  return erreurs.length > 0 ? { ok: false, erreurs } : { ok: true, valeur: qcm };
}

export interface PropositionProgramme {
  formation_objectifs: string;
  programme: string;
}

/** Valide une proposition d'objectifs et de programme ; les objectifs sont rendus « un par ligne ». */
export function validerPropositionProgramme(brut: unknown): Resultat<PropositionProgramme> {
  if (typeof brut !== "object" || brut === null) return { ok: false, erreurs: ["La réponse de l'IA n'est pas un objet."] };
  const o = brut as Record<string, unknown>;
  const objectifs = Array.isArray(o.objectifs) ? o.objectifs.filter(texte).map((x) => x.trim().replace(/^[-•\d.)\s]+/, "")).filter(Boolean) : [];
  const programme = texte(o.programme) ? o.programme.trim() : "";
  const erreurs: string[] = [];
  if (objectifs.length < 3 || objectifs.length > 8) erreurs.push(`L'IA a proposé ${objectifs.length} objectifs ; il en faut de 3 à 8.`);
  if (programme.length < 20) erreurs.push("Le programme proposé est vide ou trop court.");
  if (programme.length > 20_000) erreurs.push("Le programme proposé est trop long.");
  return erreurs.length > 0 ? { ok: false, erreurs } : { ok: true, valeur: { formation_objectifs: objectifs.join("\n"), programme } };
}

/**
 * Extrait l'objet JSON d'une réponse textuelle (l'IA entoure parfois sa réponse d'un bloc ```json).
 * Retourne `null` si aucun JSON valide n'est trouvé : on refuse plutôt que de deviner.
 */
export function extraireJson(reponse: string): unknown {
  const bloc = /```(?:json)?\s*([\s\S]*?)```/.exec(reponse)?.[1] ?? reponse;
  const debut = bloc.indexOf("{");
  const fin = bloc.lastIndexOf("}");
  if (debut < 0 || fin <= debut) return null;
  try {
    return JSON.parse(bloc.slice(debut, fin + 1)) as unknown;
  } catch {
    return null;
  }
}


// ——— « Modification 1 » (23/09/2026) : parcours complet et supports de cours ———

/** Consigne de recherche commune : l'IA doit d'abord s'informer sur le sujet, puis concevoir. */
const RECHERCHE = [
  "Avant de rédiger, mène une recherche approfondie sur le sujet (utilise l'outil de recherche web s'il t'est fourni) :",
  "repère les notions essentielles à enseigner, les méthodes et bonnes pratiques à jour, les erreurs fréquentes des apprenants et les références utiles (normes, textes, outils).",
  "Conçois ensuite selon les principes de l'apprentissage adulte et de la charge cognitive : du simple au complexe, une idée à la fois, alternance apports / activités, récupération en mémoire, mise en pratique proche du poste de travail.",
].join("\n");

/** Parcours complet : l'IA rédige le contenu des modules ; leurs durées sont imposées par la plateforme. */
export function consigneParcours(e: EntreeParcours, durees: number[]): string {
  return [
    `Conçois le parcours de l'action de formation « ${e.titre} », découpé en exactement ${durees.length} module(s).`,
    RECHERCHE,
    `Durées imposées (ne pas les modifier) : ${durees.map((d, i) => `module ${i + 1} = ${heuresTexte(d)}`).join(", ")}.`,
    "Pour chaque module : un titre court et explicite ; 2 à 4 objectifs opérationnels et évaluables, chacun commençant par un verbe d'action à l'infinitif ; 3 à 6 points de contenu ; les méthodes pédagogiques ; une activité de mise en pratique concrète ; la modalité d'évaluation.",
    "Objectifs de la formation : 3 à 8, verbes d'action, un par élément.",
    'Schéma : {"objectifs": string[], "modules": [{"titre": string, "objectifs": string[], "contenus": string[], "methodes": string, "mise_en_pratique": string, "evaluation": string}]}',
    "",
    `Intitulé : ${e.titre}`,
    e.niveau ? `Niveau : ${e.niveau}` : "",
    e.public_vise ? `Public visé : ${e.public_vise}` : "",
    `Durée : ${heuresTexte(e.heures)}${e.jours ? ` sur ${e.jours} jour(s)` : ""}`,
    e.modalite ? `Modalité : ${e.modalite}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export function validerPropositionParcours(brut: unknown, durees: number[]): Resultat<{ objectifs: string[]; modules: ModuleParcours[] }> {
  if (typeof brut !== "object" || brut === null) return { ok: false, erreurs: ["La réponse de l'IA n'est pas un objet."] };
  const o = brut as Record<string, unknown>;
  const modules = validerModules(o.modules, { nombre: durees.length, durees });
  const objectifs = Array.isArray(o.objectifs) ? o.objectifs.filter(texte).map((x) => x.trim()).filter(Boolean) : [];
  const erreurs = modules.ok ? [] : [...modules.erreurs];
  if (objectifs.length < 3 || objectifs.length > 8) erreurs.push(`L'IA a proposé ${objectifs.length} objectifs ; il en faut de 3 à 8.`);
  return erreurs.length > 0 || !modules.ok ? { ok: false, erreurs } : { ok: true, valeur: { objectifs, modules: modules.valeur } };
}

/** Plan de 20 diapositives pour UN module : recherche, présentation cognitive, mise en page, mise en pratique. */
export function consigneDiapos(formation: ContexteFormation, m: ModuleParcours, rang: number): string {
  return [
    `Conçois le support de cours (diaporama) du module ${rang} « ${m.titre} » de la formation « ${formation.formation_titre} » : exactement ${DIAPOS_PAR_MODULE} diapositives.`,
    RECHERCHE,
    "Règles de présentation : une idée par diapositive ; 3 à 5 points de 12 mots au plus ; un visuel suggéré par diapositive (schéma, pictogramme, photo) — double codage texte + image ;",
    "un point d'étape de récupération en mémoire toutes les 4 à 5 diapositives ; au moins 3 diapositives de mise en pratique (consigne, critères de réussite, débriefing) ; une synthèse et un quiz final.",
    "Notes du formateur : déroulé, questions à poser, timing indicatif.",
    `Types admis : titre, objectifs, sommaire, amorce, notion, schema, exemple, point_etape, pratique, debriefing, vigilance, synthese, quiz.`,
    'Schéma : {"diapos": [{"type": string, "titre": string, "points": string[], "visuel": string, "notes": string}]}',
    "",
    `Durée du module : ${heuresTexte(m.duree_heures)}`,
    `Objectifs du module : ${m.objectifs.join(" ; ")}`,
    `Contenus : ${m.contenus.join(" ; ")}`,
    m.mise_en_pratique ? `Mise en pratique prévue : ${m.mise_en_pratique}` : "",
    formation.public_vise ? `Public visé : ${formation.public_vise}` : "",
    formation.formation_niveau ? `Niveau : ${formation.formation_niveau}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export function validerPropositionDiapos(brut: unknown): Resultat<Diapo[]> {
  if (typeof brut !== "object" || brut === null) return { ok: false, erreurs: ["La réponse de l'IA n'est pas un objet."] };
  return validerDiapos((brut as Record<string, unknown>).diapos);
}
