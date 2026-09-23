/**
 * Parcours de formation découpé en modules — « Modification 1 » du 23/09/2026 :
 * « générer le parcours de formation avec seulement titre, heures et jours de formation, tarif, nombre de modules ;
 * le formateur peut aménager le contenu et l'enregistrer ».
 *
 * Deux générateurs produisent la MÊME structure :
 *  - l'assistant IA (s'il est configuré) : contenu rédigé, fondé sur une recherche sur le sujet ;
 *  - la TRAME automatique (toujours disponible, sans IA ni réseau) : une ossature pédagogique complète et cohérente
 *    (séquençage, objectifs formulés avec des verbes d'action, alternance apports / pratique, évaluations), que le
 *    formateur complète avec son expertise. Elle ne prétend pas connaître le sujet : elle structure.
 *
 * Module pur : aucun appel réseau, aucune base. Tout ce qui est dérivé (durées, programme, objectifs) est calculé ici,
 * donc testé et reproductible.
 */
import type { Question, Questionnaire } from "../formulaires/qcm";

export interface ModuleParcours {
  titre: string;
  duree_heures: number;
  objectifs: string[];
  contenus: string[];
  methodes: string;
  mise_en_pratique: string;
  evaluation: string;
}

export interface EntreeParcours {
  titre: string;
  heures: number;
  jours: number | null;
  nb_modules: number;
  niveau?: string;
  public_vise?: string;
  modalite?: "presentiel" | "distanciel" | "mixte";
}

export const BORNES_MODULES = { min: 1, max: 12 } as const;
export const DIAPOS_PAR_MODULE = 20;

/** Répartit une durée totale entre n modules, par demi-heures, le reliquat allant aux premiers modules. */
export function repartirHeures(total: number, n: number): number[] {
  if (n < 1) return [];
  const demiHeures = Math.max(0, Math.round(total * 2));
  const base = Math.floor(demiHeures / n);
  const reste = demiHeures - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < reste ? 1 : 0)) / 2);
}

export const heuresTexte = (h: number): string => `${String(h).replace(".", ",")} h`;

const sujet = (titre: string) => `« ${titre.trim()} »`;

interface GabaritModule {
  titre: (s: string) => string;
  objectifs: (s: string) => string[];
  contenus: (s: string) => string[];
}

const OUVERTURE: GabaritModule = {
  titre: (s) => `Enjeux, repères et vocabulaire de ${s}`,
  objectifs: (s) => [`Identifier les enjeux et le cadre de ${s} dans son contexte professionnel`, `Définir les notions et le vocabulaire essentiels de ${s}`, "Situer son niveau de départ et formuler ses objectifs personnels"],
  contenus: (s) => [`Tour de table et recueil des attentes ; rappel des objectifs du parcours`, `Les enjeux de ${s} : pourquoi, pour qui, avec quels résultats attendus`, "Les notions clés et le vocabulaire commun, illustrés par des exemples du métier", "Les erreurs fréquentes et les idées reçues à déconstruire"],
};

const COEUR: GabaritModule[] = [
  {
    titre: (s) => `Méthodes et outils clés de ${s}`,
    objectifs: (s) => [`Appliquer les méthodes de référence de ${s}`, "Choisir l'outil adapté à une situation donnée", "Utiliser une démarche structurée, étape par étape"],
    contenus: () => ["Présentation de la méthode de référence, étape par étape", "Démonstration commentée par le formateur", "Les outils et supports utiles ; critères de choix", "Check-list opérationnelle à réutiliser au poste de travail"],
  },
  {
    titre: (s) => `Mise en œuvre guidée de ${s} en situation`,
    objectifs: () => ["Mettre en œuvre la démarche sur un cas réel ou réaliste", "Adapter sa pratique aux contraintes de son environnement", "Analyser ses résultats pour les améliorer"],
    contenus: () => ["Étude d'un cas issu du contexte des participants", "Atelier en sous-groupes, avec rôles tournants", "Restitution et analyse croisée des productions", "Apports complémentaires en réponse aux difficultés rencontrées"],
  },
  {
    titre: (s) => `Situations complexes et optimisation de ${s}`,
    objectifs: () => ["Diagnostiquer une situation difficile ou atypique", "Résoudre un problème en mobilisant plusieurs méthodes", "Optimiser sa pratique grâce aux bonnes pratiques"],
    contenus: () => ["Cas complexes et points de vigilance", "Méthodes de résolution de problèmes appliquées", "Bonnes pratiques et retours d'expérience", "Auto-diagnostic et axes de progrès"],
  },
];

const CLOTURE: GabaritModule = {
  titre: () => "Transfert en situation de travail, plan d'action et évaluation",
  objectifs: (s) => [`Formaliser un plan d'action personnel pour appliquer ${s} au poste de travail`, "Évaluer l'atteinte des objectifs de la formation", "Identifier les ressources pour poursuivre sa progression"],
  contenus: () => ["Synthèse des apports du parcours ; carte mentale collective", "Construction du plan d'action individuel (quoi, quand, comment, indicateurs)", "Évaluation des acquis et bilan de la formation", "Ressources pour aller plus loin ; évaluation de satisfaction à chaud"],
};

function methodesPour(modalite: EntreeParcours["modalite"]): string {
  if (modalite === "distanciel") return "Classe virtuelle : apports courts (20 % du temps au plus), partage d'écran, sondages, salles de sous-groupes, exercices collaboratifs en ligne.";
  if (modalite === "mixte") return "Alternance présentiel et distanciel : apports courts, démonstrations, ateliers en sous-groupes, travaux intersessions, échanges d'expériences.";
  return "Pédagogie active : apports courts (20 % du temps au plus), démonstrations, ateliers en sous-groupes, études de cas, échanges d'expériences.";
}

/** Construit la trame d'un parcours (sans IA). Toujours n modules, dont la somme des durées égale la durée totale. */
export function genererTrameParcours(e: EntreeParcours): ModuleParcours[] {
  const n = Math.min(BORNES_MODULES.max, Math.max(BORNES_MODULES.min, Math.round(e.nb_modules)));
  const durees = repartirHeures(e.heures, n);
  const s = sujet(e.titre);
  const gabarits: GabaritModule[] = n === 1 ? [OUVERTURE] : [OUVERTURE, ...Array.from({ length: n - 2 }, (_, i) => COEUR[i % COEUR.length]!), CLOTURE];
  const occurrences = new Map<GabaritModule, number>();
  return gabarits.map((g, i) => {
    const rang = (occurrences.get(g) ?? 0) + 1;
    occurrences.set(g, rang);
    const repete = gabarits.filter((x) => x === g).length > 1;
    const duree = durees[i]!;
    const pratique = Math.max(15, Math.round((duree * 60 * 0.4) / 15) * 15);
    return {
      titre: n === 1 ? `Parcours complet : ${e.titre.trim()}` : `${g.titre(s)}${repete ? ` (partie ${rang})` : ""}`,
      duree_heures: duree,
      objectifs: g.objectifs(s),
      contenus: g.contenus(s),
      methodes: methodesPour(e.modalite),
      mise_en_pratique: `Atelier d'environ ${pratique} minutes sur un cas tiré du contexte professionnel des participants, avec consigne écrite, critères de réussite et débriefing.`,
      evaluation: i === n - 1 ? "Évaluation des acquis de fin de parcours (QCM et mise en situation), puis questionnaire de satisfaction à chaud." : "Quiz de fin de module (5 questions) et observation de l'atelier par le formateur.",
    };
  });
}

/** Le programme détaillé (annexe de la convention) écrit à partir des modules. */
export function programmeDepuisModules(modules: readonly ModuleParcours[]): string {
  return modules
    .map((m, i) =>
      [
        `Module ${i + 1} — ${m.titre} (${heuresTexte(m.duree_heures)})`,
        m.objectifs.length ? `Objectifs : ${m.objectifs.join(" ; ")}.` : "",
        ...m.contenus.map((c) => `- ${c}`),
        m.methodes ? `Méthodes : ${m.methodes}` : "",
        m.mise_en_pratique ? `Mise en pratique : ${m.mise_en_pratique}` : "",
        m.evaluation ? `Évaluation : ${m.evaluation}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

/** Objectifs de la formation (convention, attestation) : un objectif majeur par module, 3 à 8 au total. */
export function objectifsDepuisModules(modules: readonly ModuleParcours[]): string {
  const principaux = modules.map((m) => m.objectifs[0]).filter((x): x is string => Boolean(x?.trim()));
  const complements = modules.flatMap((m) => m.objectifs.slice(1)).filter((x) => !principaux.includes(x));
  return [...principaux, ...complements].slice(0, Math.max(3, Math.min(8, principaux.length))).join("\n");
}

export type Resultat<T> = { ok: true; valeur: T } | { ok: false; erreurs: string[] };

const texte = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;
const liste = (x: unknown, max: number): string[] => (Array.isArray(x) ? x.filter(texte).map((v) => v.trim().replace(/^[-•\d.)\s]+/, "")).filter(Boolean).slice(0, max) : []);

/**
 * Valide des modules (saisis par le formateur ou proposés par l'IA). Les durées ne sont jamais demandées à l'IA :
 * elles viennent de `repartirHeures` quand `durees` est fourni.
 */
export function validerModules(brut: unknown, attendu?: { nombre: number; durees?: number[] }): Resultat<ModuleParcours[]> {
  if (!Array.isArray(brut)) return { ok: false, erreurs: ["Les modules ne sont pas une liste."] };
  const erreurs: string[] = [];
  if (brut.length === 0) erreurs.push("Le parcours doit compter au moins un module.");
  if (brut.length > BORNES_MODULES.max) erreurs.push(`Le parcours compte ${BORNES_MODULES.max} modules au plus.`);
  if (attendu && brut.length !== attendu.nombre) erreurs.push(`${brut.length} module(s) proposé(s) au lieu de ${attendu.nombre}.`);
  const modules = brut.map((m, i): ModuleParcours => {
    const o = (m ?? {}) as Record<string, unknown>;
    const duree = attendu?.durees?.[i] ?? (typeof o.duree_heures === "number" ? o.duree_heures : Number(String(o.duree_heures ?? "").replace(",", ".")));
    const module: ModuleParcours = {
      titre: texte(o.titre) ? o.titre.trim().slice(0, 200) : "",
      duree_heures: Number.isFinite(duree) ? Math.round(duree * 100) / 100 : 0,
      objectifs: liste(o.objectifs, 8),
      contenus: liste(o.contenus, 15),
      methodes: texte(o.methodes) ? o.methodes.trim().slice(0, 2000) : "",
      mise_en_pratique: texte(o.mise_en_pratique) ? o.mise_en_pratique.trim().slice(0, 2000) : "",
      evaluation: texte(o.evaluation) ? o.evaluation.trim().slice(0, 1000) : "",
    };
    if (!module.titre) erreurs.push(`Module ${i + 1} : titre manquant.`);
    if (module.duree_heures <= 0 || module.duree_heures > 400) erreurs.push(`Module ${i + 1} : durée invalide.`);
    if (module.objectifs.length === 0) erreurs.push(`Module ${i + 1} : au moins un objectif.`);
    if (module.contenus.length === 0) erreurs.push(`Module ${i + 1} : au moins un point de contenu.`);
    return module;
  });
  return erreurs.length > 0 ? { ok: false, erreurs } : { ok: true, valeur: modules };
}

// ——— Tests générés à partir du parcours (trame sans IA) ———

const ECHELLE_POSITIONNEMENT = ["Je découvre ce sujet", "J'en ai quelques notions", "Je le pratique occasionnellement", "Je le maîtrise et saurais l'expliquer"];
const ECHELLE_ACQUIS = ["Je sais le faire seul(e), en situation réelle", "Je sais le faire avec une aide ponctuelle", "Je sais l'expliquer, pas encore le faire", "Je ne sais pas encore le faire"];

function questionsDe(modules: readonly ModuleParcours[], max: number, fabrique: (objectif: string) => Question): Question[] {
  const objectifs = [...new Set(modules.flatMap((m) => m.objectifs))];
  return objectifs.slice(0, max).map(fabrique);
}

/**
 * Test de positionnement en AUTO-POSITIONNEMENT (une question par objectif, échelle à 4 niveaux) : format reconnu
 * pour l'indicateur Qualiopi n° 8. La « bonne réponse » est la maîtrise : le score mesure le niveau de départ.
 */
export function trameTestPositionnement(titre: string, modules: readonly ModuleParcours[], max = 20): Questionnaire {
  return {
    titre: `Test de positionnement — ${titre}`,
    questions: questionsDe(modules, max, (objectif) => ({ enonce: `Où en êtes-vous pour : ${objectif.replace(/\.$/, "")} ?`, propositions: [...ECHELLE_POSITIONNEMENT], bonne_reponse: 3 })),
  };
}

/** Évaluation des acquis en auto-évaluation par objectif : à compléter par des questions de connaissances (IA ou formateur). */
export function trameEvaluationAcquis(titre: string, modules: readonly ModuleParcours[], max = 20): Questionnaire {
  return {
    titre: `Évaluation des acquis — ${titre}`,
    questions: questionsDe(modules, max, (objectif) => ({ enonce: `À l'issue de la formation : ${objectif.replace(/\.$/, "")}.`, propositions: [...ECHELLE_ACQUIS], bonne_reponse: 0 })),
  };
}

// ——— Plan des supports de cours (PPTX) : 20 diapositives par module ———

export type TypeDiapo = "titre" | "objectifs" | "sommaire" | "amorce" | "notion" | "schema" | "exemple" | "point_etape" | "pratique" | "debriefing" | "vigilance" | "synthese" | "quiz";

export interface Diapo {
  type: TypeDiapo;
  titre: string;
  points: string[];
  /** Visuel suggéré (double codage : un texte court + une image ou un schéma). */
  visuel: string;
  /** Notes du formateur : déroulé, questions à poser, timing. */
  notes: string;
}

export const TYPES_DIAPO: readonly TypeDiapo[] = ["titre", "objectifs", "sommaire", "amorce", "notion", "schema", "exemple", "point_etape", "pratique", "debriefing", "vigilance", "synthese", "quiz"];

/**
 * Trame de 20 diapositives pour un module, construite sur des principes de charge cognitive : une idée par
 * diapositive, 3 à 5 points, activation des connaissances, récupération en mémoire toutes les 4 à 5 diapositives,
 * mise en pratique avec consigne, déroulé, critères et débriefing, synthèse et quiz final.
 */
export function trameDiapos(formationTitre: string, m: ModuleParcours, rang: number): Diapo[] {
  const c = (i: number) => m.contenus[i % Math.max(1, m.contenus.length)] ?? m.titre;
  const o = (i: number) => m.objectifs[i % Math.max(1, m.objectifs.length)] ?? m.titre;
  const d = (type: TypeDiapo, titre: string, points: string[], visuel: string, notes: string): Diapo => ({ type, titre, points, visuel, notes });
  return [
    d("titre", `Module ${rang} — ${m.titre}`, [formationTitre, heuresTexte(m.duree_heures)], "Visuel d'ambiance lié au métier des participants", "Accueil, présentation du module et de sa place dans le parcours."),
    d("objectifs", "À la fin de ce module, vous saurez…", m.objectifs.slice(0, 5), "Icône « cible » par objectif", "Lire les objectifs à voix haute ; demander lequel parle le plus à chacun."),
    d("sommaire", "Déroulé du module", m.contenus.slice(0, 5), "Frise chronologique du module", "Annoncer le rythme : apports courts, pratique, point d'étape."),
    d("amorce", "Et vous, qu'en pensez-vous ?", ["Une situation vécue en lien avec ce thème ?", "Ce qui a bien fonctionné, ce qui a posé problème", "Vos questions de départ"], "Photo d'une situation de travail", "Activation des connaissances antérieures : 5 minutes d'échange, noter les mots clés au tableau."),
    d("notion", c(0), ["Définition en une phrase", "Pourquoi c'est important", "Exemple immédiat"], "Pictogramme + mot clé", "Une seule idée sur cette diapositive. Illustrer par un exemple du contexte des participants."),
    d("notion", c(1), ["Principe", "Étapes principales", "Point clé à retenir"], "Schéma en 3 étapes", "Faire reformuler par un participant."),
    d("schema", "Vue d'ensemble", ["Les éléments et leurs liens", "Ce qui se passe avant / pendant / après"], "Schéma de synthèse (processus ou carte)", "Construire le schéma progressivement ; éviter de tout afficher d'un coup."),
    d("exemple", "Exemple commenté", ["Le contexte", "Ce qui a été fait", "Le résultat obtenu"], "Capture ou photo de l'exemple", "Exemple réel, anonymisé ; faire identifier ce qui a fonctionné."),
    d("point_etape", "Point d'étape : 3 questions", ["Quelle est l'idée principale vue jusqu'ici ?", "Donnez un exemple dans votre contexte", "Qu'est-ce qui reste flou ?"], "Icône « question »", "Récupération en mémoire : réponses individuelles puis mise en commun (5 minutes)."),
    d("notion", c(2), ["Méthode", "Outil associé", "Critère de qualité"], "Pictogramme de l'outil", "Démonstration en direct si possible."),
    d("notion", o(1), ["Ce que cela signifie concrètement", "Comment le mettre en œuvre", "Comment savoir que c'est réussi"], "Check-list visuelle", "Relier explicitement à l'objectif du module."),
    d("exemple", "Cas pratique : la situation", ["Contexte du cas", "Les contraintes", "Ce qui est attendu"], "Illustration du cas", "Présenter le cas qui servira à l'atelier."),
    d("schema", "La démarche pas à pas", ["1. Analyser", "2. Choisir", "3. Agir", "4. Vérifier"], "Frise en 4 étapes", "La démarche guidera l'atelier : la laisser affichée."),
    d("pratique", "Atelier : consigne", ["Objectif de l'atelier", "Travail en sous-groupes de 2 à 4", "Livrable attendu", "Durée"], "Icône « atelier »", m.mise_en_pratique || "Consigne écrite, remise sur papier ou dans le chat."),
    d("pratique", "Atelier : critères de réussite", ["Critère 1 — exactitude", "Critère 2 — pertinence au contexte", "Critère 3 — clarté de la restitution"], "Grille d'évaluation", "Les critères sont connus AVANT de commencer."),
    d("debriefing", "Débriefing", ["Ce que vous avez produit", "Ce qui a été facile / difficile", "Ce que vous referiez autrement"], "Tableau à deux colonnes", "Restitution de chaque groupe (3 minutes), puis apports complémentaires."),
    d("vigilance", "Points de vigilance", ["Erreur fréquente n° 1", "Erreur fréquente n° 2", "Comment les éviter"], "Pictogramme « attention »", "S'appuyer sur les difficultés observées pendant l'atelier."),
    d("notion", "Au poste de travail", ["Première action à mener dès le retour", "Ressource ou outil à utiliser", "Indicateur de réussite"], "Visuel d'un poste de travail", "Préparer le transfert : chacun note une action concrète."),
    d("synthese", "Ce qu'il faut retenir", m.objectifs.slice(0, 4), "Carte mentale du module", "Faire compléter la synthèse par les participants avant de l'afficher."),
    d("quiz", "Quiz de fin de module", ["5 questions rapides", "Réponses individuelles", "Correction collective"], "Icône « quiz »", m.evaluation || "Quiz de 5 questions ; noter les notions à reprendre."),
  ];
}

/** Valide un plan de diapositives (saisi ou proposé par l'IA) : exactement 20, une idée par diapositive, 6 points au plus. */
export function validerDiapos(brut: unknown, attendu = DIAPOS_PAR_MODULE): Resultat<Diapo[]> {
  if (!Array.isArray(brut)) return { ok: false, erreurs: ["Le plan n'est pas une liste de diapositives."] };
  const erreurs: string[] = [];
  if (brut.length !== attendu) erreurs.push(`${brut.length} diapositive(s) au lieu de ${attendu}.`);
  const diapos = brut.map((x, i): Diapo => {
    const o = (x ?? {}) as Record<string, unknown>;
    const type = TYPES_DIAPO.includes(o.type as TypeDiapo) ? (o.type as TypeDiapo) : "notion";
    const d: Diapo = {
      type,
      titre: texte(o.titre) ? o.titre.trim().slice(0, 160) : "",
      points: liste(o.points, 6).map((p) => p.slice(0, 220)),
      visuel: texte(o.visuel) ? o.visuel.trim().slice(0, 200) : "",
      notes: texte(o.notes) ? o.notes.trim().slice(0, 2000) : "",
    };
    if (!d.titre) erreurs.push(`Diapositive ${i + 1} : titre manquant.`);
    return d;
  });
  return erreurs.length > 0 ? { ok: false, erreurs } : { ok: true, valeur: diapos };
}
