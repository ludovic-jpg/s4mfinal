/**
 * Recette automatisée du document « Modification 1 » (23/09/2026), point par point — mise à jour version 7 :
 * plus aucune « trame » sans IA, tout est rédigé par l'assistant (ici factice : réponses écrites d'avance, aucun réseau).
 * Vraie base PostgreSQL en mémoire, archive en mémoire, horloge fixe.
 */
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerBanc, fichier, iaFactice, MDP, type Banc } from "../banc";
import { validerQuestionnaire } from "@/domaine/formulaires/qcm";
import { repartirHeures, validerModules, type Diapo, type ModuleParcours, type TypeDiapo } from "@/domaine/pedagogie/parcours";
import { assurerComptePilote } from "@/serveur/bd/amorce";
import { tracePngDemo } from "@/serveur/bd/trace-demo";
import { connecter } from "@/serveur/services/auth";
import { lireMaCandidature, mettreAJourMonProfil, deposerPieceFormateur } from "@/serveur/services/candidatures";
import { exporterCoffreZip, lireCoffreParcours, listerCoffresParcours } from "@/serveur/services/coffre";
import { creerDossier, lireDossier, modifierDossier } from "@/serveur/services/dossiers";
import {
  archiverFormation,
  creerFormation,
  deposerDansCoffre,
  enregistrerOutil,
  listerCoffre,
  listerFormations,
  listerOutils,
  listerVersions,
  modifierFormation,
  purgerDuCoffre,
  restaurerDuCoffre,
  restaurerFormation,
  restaurerOutil,
  restaurerVersion,
  supprimerDuCoffre,
  supprimerOutil,
} from "@/serveur/services/formations";
import { produireSupport, produireTousLesSupports, proposerParcours, proposerPlanSupport, proposerTest } from "@/serveur/services/pedagogie-ia";
import {
  enregistrerBrouillonPublic,
  inviterAuPositionnement,
  lirePositionnementPublic,
  listerPositionnements,
  signerPositionnementPublic,
  telechargerPdfPositionnement,
  telechargerPdfPublic,
} from "@/serveur/services/positionnements";
import { enregistrerStagiaire, listerEntreprises } from "@/serveur/services/repertoire";
import { archivesEtCorbeille, exporterMesDonnees, importerMesDonnees } from "@/serveur/services/sauvegarde";
import type { Acteur } from "@/serveur/services/socle";

const RECUEIL = { poste_anciennete: "Commercial, 3 ans", niveau_maitrise: "Intermédiaire", attentes: "Structurer ma prospection", besoins_principaux: "Le ciblage", handicap: "Non", programme_transmis: "Oui" };

// ——— Réponses de l'IA factice (version 7 : dossier d'enjeux, puis parcours, tests, supports) ———
const enjeuxJson = (titre: string) =>
  JSON.stringify({
    resume: `Dossier d'enjeux de « ${titre} » : ce que le formateur doit savoir du sujet réel pour concevoir le parcours et ses évaluations.`,
    enjeux: ["Structurer une démarche de prospection mesurable", "Réduire le coût d'acquisition d'un client"],
    cadre: ["RGPD et prospection B2B (CNIL)", "Loi Hamon sur le démarchage téléphonique"],
    notions_cles: ["Ciblage et segmentation", "Prise de contact multicanale", "Qualification BANT"],
    erreurs_frequentes: ["Appeler sans avoir préparé son accroche"],
    pratiques_actuelles: ["Social selling sur LinkedIn"],
    public_vise: "Commerciaux, chargés d'affaires et dirigeants de TPE.",
    prerequis: "Aucun prérequis.",
    glossaire: [{ terme: "BANT", definition: "Budget, Authority, Need, Timing" }],
    sources: [{ titre: "CNIL — prospection commerciale", url: "https://www.cnil.fr/fr/prospection-commerciale" }],
  });
const moduleIa = (i: number) => ({ titre: `Module IA ${i}`, objectifs: [`Maîtriser l'étape ${i} de la prospection`, "Identifier les cibles"], contenus: ["Segmentation", "Scripts d'appel"], methodes: "Apports et ateliers", mise_en_pratique: "Atelier : construire son fichier de prospects", evaluation: "Quiz", duree_heures: 99 });
const parcoursJson = (n: number, objectifs = ["Cibler ses prospects", "Préparer sa prise de contact", "Conduire un entretien de découverte"]) =>
  JSON.stringify({ objectifs, public_vise: "Commerciaux et dirigeants de TPE.", prerequis: "Aucun.", modules: Array.from({ length: n }, (_, i) => moduleIa(i + 1)) });
const qcmJson = (titre: string, n: number) => JSON.stringify({ titre, questions: Array.from({ length: n }, (_, i) => ({ enonce: `Question ${i + 1} sur la prospection ?`, propositions: ["A", "B", "C", "D"], bonne_reponse: i % 4 })) });
const TYPES_PLAN: TypeDiapo[] = ["titre", "objectifs", "sommaire", "amorce", "notion", "notion", "schema", "point_etape", "exemple", "notion", "pratique", "debriefing", "notion", "point_etape", "vigilance", "pratique", "notion", "pratique", "synthese", "quiz"];
const planDiapos = (): Diapo[] => TYPES_PLAN.map((type, i) => ({ type, titre: `Diapositive ${i + 1} (${type})`, points: ["Un point", "Un autre point"], visuel: "Schéma", notes: "Notes du formateur" }));
const diaposJson = () => JSON.stringify({ diapos: planDiapos() });
/** Modules « à la main », comme le formateur peut les saisir, dont la somme des durées fait `heures`. */
const modulesManuels = (heures: number, n: number): ModuleParcours[] => {
  const r = validerModules(repartirHeures(heures, n).map((d, i) => ({ ...moduleIa(i + 1), duree_heures: d })));
  if (!r.ok) throw new Error(r.erreurs.join(" ; "));
  return r.valeur;
};

let b: Banc;
let ia: ReturnType<typeof iaFactice>;
/** File des réponses de l'IA factice : chaque test y dépose ce que l'IA doit « répondre ». */
const reponsesIa: string[] = [];
let sophie: Acteur;
let marc: Acteur;
let formationId: string;
let stagiaireId: string;
let entrepriseId: string;

beforeAll(async () => {
  ia = iaFactice(reponsesIa);
  b = await creerBanc({ ia });
  sophie = await b.formateur();
  marc = await b.formateur("marc@formateur.example", "Marc", "Autre");
}, 60_000);
afterAll(() => b.fermer());

describe("1. Générer le parcours avec seulement titre, heures, jours, tarif et nombre de modules", () => {
  it("la plateforme répartit les heures entre n modules par demi-heures : la somme fait toujours la durée totale", () => {
    for (const [heures, n] of [[21, 4], [14, 3], [7, 1], [35, 12], [10.5, 5]] as const) {
      const durees = repartirHeures(heures, n);
      expect(durees).toHaveLength(n);
      expect(durees.reduce((a, d) => a + d, 0)).toBeCloseTo(heures, 5);
    }
    expect(repartirHeures(7, 3)).toEqual([2.5, 2.5, 2]);
  });

  it("le service propose le parcours (IA : enjeux puis modules), le formateur l'aménage, puis l'enregistre : programme et objectifs en sont déduits", async () => {
    reponsesIa.push(enjeuxJson("Prospection commerciale B2B"), parcoursJson(4));
    const p = await proposerParcours(b.s, sophie, { titre: "Prospection commerciale B2B", heures: 21, jours: 3, nb_modules: 4 });
    expect(p.brouillon).toBe(true);
    expect(p.modules).toHaveLength(4);
    expect(p.dossier_enjeux.notions_cles).toContain("Qualification BANT");
    expect(p.public_vise).toBe("Commerciaux et dirigeants de TPE.");
    expect(await listerFormations(b.s, sophie)).toHaveLength(0); // rien n'est enregistré par la proposition

    const modules = p.modules.map((m, i) => (i === 0 ? { ...m, titre: "Cibler ses prospects" } : m)); // aménagement
    const f = await creerFormation(b.s, sophie, { formation_titre: "Prospection commerciale B2B", formation_niveau: "Intermédiaire", formation_duree_heures_total: 21, formation_duree_jours: 3, formation_prix_unitaire_ht: 140_000, formation_modules: modules, public_vise: p.public_vise, formation_prerequis: p.formation_prerequis, dossier_enjeux: p.dossier_enjeux });
    formationId = f.id;
    expect(f.formation_nb_modules).toBe(4);
    expect(f.programme).toContain("Module 1 — Cibler ses prospects");
    expect(f.formation_objectifs.split("\n").length).toBeGreaterThanOrEqual(3);
    expect(f.enjeux_le).not.toBeNull();
  });

  it("refuse un parcours dont les modules ne totalisent pas la durée de la formation", async () => {
    await expect(creerFormation(b.s, sophie, { formation_titre: "Incohérente", formation_duree_heures_total: 14, formation_modules: modulesManuels(7, 2) })).rejects.toThrow(/somme des durées/);
  });

  it("par l'IA : les durées sont imposées par la plateforme, et un nombre de modules erroné est refusé après une seconde tentative", async () => {
    ia.demandes.length = 0;
    reponsesIa.push(enjeuxJson("Prospection"), parcoursJson(3, ["A faire", "B faire", "C faire"]));
    const ok = await proposerParcours(b.s, sophie, { titre: "Prospection", heures: 14, jours: 2, nb_modules: 3 });
    expect(ok.modules.map((m) => m.duree_heures)).toEqual([5, 4.5, 4.5]); // jamais les 99 h de l'IA
    expect(ia.demandes[0]).toMatch(/recherche web/);
    expect(ia.demandes[1]).toContain("DOSSIER D'ENJEUX");
    // Réponse inexploitable deux fois de suite (un module au lieu de trois) : refus, jamais de « réparation ».
    reponsesIa.push(enjeuxJson("Prospection"), parcoursJson(1), parcoursJson(1));
    await expect(proposerParcours(b.s, sophie, { titre: "Prospection", heures: 14, jours: 2, nb_modules: 3 })).rejects.toThrow(/pas exploitable/);
    expect(ia.demandes.at(-1)).toContain("ta réponse précédente a été rejetée");
    expect(reponsesIa).toEqual([]);
  });

  it("modifier la formation garde la version précédente, restaurable (« faire réapparaître »)", async () => {
    await modifierFormation(b.s, sophie, formationId, { formation_prix_unitaire_ht: 150_000, formation_niveau: "Avancé" });
    const versions = await listerVersions(b.s, sophie, "formation", formationId);
    expect(versions).toHaveLength(1);
    await restaurerVersion(b.s, sophie, versions[0]!.id);
    const apres = (await listerFormations(b.s, sophie)).find((f) => f.id === formationId)!;
    expect(apres.formation_prix_unitaire_ht).toBe(140_000);
    expect(apres.formation_niveau).toBe("Intermédiaire");
    expect(await listerVersions(b.s, sophie, "formation", formationId)).toHaveLength(2); // la restauration est elle-même réversible
  });

  it("champs de convention et partie financière : enregistrés au catalogue et repris par un nouveau dossier", async () => {
    await modifierFormation(b.s, sophie, formationId, { mode_financement: "opco", formation_opco: "OPCO EP (Entreprises de proximité)", formation_effectif_min: 2, formation_effectif_max: 8, formation_delai_acces: "Sous 2 semaines" });
    await expect(modifierFormation(b.s, sophie, formationId, { formation_effectif_min: 9 })).rejects.toThrow(/effectif maximum/);
  });
});

describe("2. Même fonctionnalité pour le test de positionnement, l'évaluation des acquis et les supports", () => {
  it("le test de positionnement est un QCM rédigé par l'IA sur le dossier d'enjeux, validé, enregistrable après aménagement", async () => {
    reponsesIa.push(qcmJson("Test de positionnement — Prospection", 10));
    const r = await proposerTest(b.s, sophie, { formation_id: formationId, type: "positionnement", nombre: 10 });
    expect(validerQuestionnaire(r.questionnaire)).toEqual([]);
    expect(r.questionnaire.questions).toHaveLength(10);
    expect(ia.demandes.at(-1)).toContain("Qualification BANT"); // la formation a déjà son dossier d'enjeux : pas de nouvelle recherche
    const o = await enregistrerOutil(b.s, sophie, { type: "positionnement", titre: r.questionnaire.titre, formation_id: formationId, contenu: r.questionnaire });
    expect(o.formation_id).toBe(formationId);
    reponsesIa.push(qcmJson("Évaluation des acquis — Prospection", 5));
    const acquis = await proposerTest(b.s, sophie, { formation_id: formationId, type: "acquis", nombre: 5 });
    expect(acquis.questionnaire.titre).toMatch(/Évaluation des acquis/);
    expect(reponsesIa).toEqual([]);
  });

  it("plan de support : exactement 20 diapositives par module, dont mise en pratique, point d'étape et quiz", async () => {
    reponsesIa.push(diaposJson());
    const { diapos } = await proposerPlanSupport(b.s, sophie, { formation_id: formationId, module_index: 1 });
    expect(diapos).toHaveLength(20);
    const types = diapos.map((d) => d.type);
    expect(types).toContain("pratique");
    expect(types).toContain("point_etape");
    expect(types.at(-1)).toBe("quiz");
    expect(ia.demandes.at(-1)).toContain("module 2");
  });

  it("produit un vrai fichier PPTX de 20 diapositives, rangé dans le coffre-fort ; le régénérer met l'ancien à la corbeille", async () => {
    const plan = planDiapos();
    plan[0] = { ...plan[0]!, titre: "Titre aménagé par le formateur" };
    const r = await produireSupport(b.s, sophie, { formation_id: formationId, module_index: 0, diapos: plan });
    expect(r.diapositives).toBe(20);
    const coffre = await listerCoffre(b.s, sophie, formationId);
    const pptx = coffre.find((f) => f.id === r.id)!;
    expect(pptx.origine).toBe("genere");
    const zip = await JSZip.loadAsync(await b.archive.lire(pptx.chemin));
    expect(Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).toHaveLength(20);

    await produireSupport(b.s, sophie, { formation_id: formationId, module_index: 0, diapos: plan });
    expect((await listerCoffre(b.s, sophie, formationId)).filter((f) => f.description === "module:1")).toHaveLength(1);
    expect((await listerCoffre(b.s, sophie, formationId, { corbeille: true })).filter((f) => f.description === "module:1")).toHaveLength(1);
  });

  it("un plan qui n'a pas 20 diapositives est refusé", async () => {
    await expect(produireSupport(b.s, sophie, { formation_id: formationId, module_index: 0, diapos: [{ type: "titre", titre: "Seule" }] })).rejects.toThrow(/incomplet/);
  });

  it("tous les modules d'un coup ; un module dont l'IA échoue n'empêche pas les autres", async () => {
    reponsesIa.push(diaposJson(), diaposJson(), diaposJson(), diaposJson());
    const r = await produireTousLesSupports(b.s, sophie, { formation_id: formationId });
    expect(r.produits).toHaveLength(4);
    expect(r.echecs).toEqual([]);
    // Un seul plan disponible pour quatre modules : trois échecs signalés, un support produit.
    reponsesIa.push(diaposJson());
    const partiel = await produireTousLesSupports(b.s, sophie, { formation_id: formationId });
    expect(partiel.produits).toHaveLength(1);
    expect(partiel.echecs).toHaveLength(3);
  });
});

describe("3. Coffre-fort pédagogique par parcours : pédagogique + administratif, dépôt et téléchargement", () => {
  it("se remplit par défaut des supports et des tests du parcours ; le formateur y ajoute ses documents", async () => {
    await deposerDansCoffre(b.s, sophie, formationId, fichier("Livret d'accueil.pdf"), { categorie: "qualite", partageable: false });
    const vue = await lireCoffreParcours(b.s, sophie, formationId);
    expect(vue.formation.proprietaire).toBe(true);
    expect(vue.fichiers.filter((f) => f.origine === "genere")).toHaveLength(4);
    expect(vue.outils.map((o) => o.type)).toContain("positionnement");
    expect(vue.fichiers.find((f) => f.categorie === "qualite")?.partageable).toBe(false);
    const liste = await listerCoffresParcours(b.s, sophie);
    expect(liste.find((c) => c.id === formationId)!.administratif).toBe(1);
  });

  it("l'organisme consulte tous les coffres ; un autre formateur n'y a pas accès", async () => {
    expect((await listerCoffresParcours(b.s, b.admin)).some((c) => c.id === formationId)).toBe(true);
    expect((await lireCoffreParcours(b.s, b.admin, formationId)).formation.proprietaire).toBe(false);
    await expect(lireCoffreParcours(b.s, marc, formationId)).rejects.toThrow(/introuvable/);
  });

  it("la corbeille : rien n'est perdu d'un clic ; la purge définitive n'est possible que depuis la corbeille", async () => {
    const [premier] = await listerCoffre(b.s, sophie, formationId);
    await expect(purgerDuCoffre(b.s, sophie, premier!.id)).rejects.toThrow(/corbeille/);
    await supprimerDuCoffre(b.s, sophie, premier!.id);
    expect((await archivesEtCorbeille(b.s, sophie)).fichiers.some((f) => f.id === premier!.id)).toBe(true);
    await restaurerDuCoffre(b.s, sophie, premier!.id);
    expect((await listerCoffre(b.s, sophie, formationId)).some((f) => f.id === premier!.id)).toBe(true);
  });

  it("tout le coffre se télécharge en un ZIP rangé par rubrique", async () => {
    const z = await exporterCoffreZip(b.s, sophie, formationId);
    const zip = await JSZip.loadAsync(z.contenu);
    const noms = Object.keys(zip.files);
    expect(noms).toContain("00 - Programme.html");
    expect(noms.some((n) => n.startsWith("Support de cours/"))).toBe(true);
    expect(noms.some((n) => n.startsWith("Questionnaires/"))).toBe(true);
  });
});

describe("4. Créer un apprenant ET son entreprise dans le même geste", () => {
  it("la fiche apprenant crée l'entreprise et s'y rattache", async () => {
    const st = await enregistrerStagiaire(b.s, sophie, {
      stagiaire_prenom: "Ludovic",
      stagiaire_nom: "Test",
      stagiaire_email: "apprenant.test@exemple.example",
      nouvelle_entreprise: { entreprise_nom: "Nouvelle Entreprise SAS", entreprise_siret: "12345678900011", entreprise_opco: "ATLAS" },
    });
    stagiaireId = st.id;
    const entreprises = await listerEntreprises(b.s, sophie);
    const e = entreprises.find((x) => x.entreprise_nom === "Nouvelle Entreprise SAS")!;
    entrepriseId = e.id;
    expect(st.entreprise_id).toBe(e.id);
    expect(e.entreprise_opco).toBe("ATLAS");
  });

  it("une entreprise invalide n'enregistre ni l'entreprise ni l'apprenant", async () => {
    await expect(enregistrerStagiaire(b.s, sophie, { stagiaire_prenom: "A", stagiaire_nom: "B", nouvelle_entreprise: { entreprise_nom: "" } })).rejects.toThrow();
  });
});

describe("5. Inviter un apprenant à se positionner sur un parcours", () => {
  let jeton = "";
  let positionnementId = "";

  it("l'invitation envoie un e-mail automatique avec le lien vers la page dédiée", async () => {
    const r = await inviterAuPositionnement(b.s, sophie, { stagiaire_id: stagiaireId, formation_id: formationId, message: "À bientôt" });
    jeton = r.lien.split("/").pop()!;
    positionnementId = r.id;
    const mail = (await b.courriers()).find((c) => c.type === "invitation_positionnement")!;
    expect(mail.destinataire).toBe("apprenant.test@exemple.example");
    expect(mail.corps_html).toContain(r.lien);
    expect(mail.formateur_id).toBe(sophie.formateur_id);
  });

  it("la page dédiée affiche nom et e-mail, le recueil et le test — sans le corrigé", async () => {
    const p = await lirePositionnementPublic(b.s, jeton);
    expect(p.apprenant).toEqual({ prenom: "Ludovic", nom: "Test", email: "apprenant.test@exemple.example" });
    expect(p.recueil.champs.length).toBeGreaterThanOrEqual(7);
    expect(JSON.stringify(p.questionnaire)).not.toContain("bonne_reponse");
    expect(p.statut).toBe("envoye");
  });

  it("l'apprenant enregistre et reprend plus tard", async () => {
    await enregistrerBrouillonPublic(b.s, jeton, { recueil: { attentes: "Mieux cibler" }, reponses: [0], date: "2026-10-01" });
    const p = await lirePositionnementPublic(b.s, jeton);
    expect(p.statut).toBe("en_cours");
    expect(p.brouillon?.recueil?.attentes).toBe("Mieux cibler");
  });

  it("incomplet (réponses, signature, consentement) : refusé avec la liste des manques", async () => {
    await expect(signerPositionnementPublic(b.s, jeton, { recueil: {}, reponses: [], date: "2026-10-01", trace_png: "", lieu: "", consentement: false })).rejects.toThrow(/incomplet/);
  });

  it("complet : date, signature tracée, PDF archivé ; formateur et apprenant reçoivent le PDF", async () => {
    const p = await lirePositionnementPublic(b.s, jeton);
    await signerPositionnementPublic(b.s, jeton, { recueil: RECUEIL, reponses: p.questionnaire!.questions.map((_, i) => i % 4), date: "2026-10-01", trace_png: tracePngDemo(4), lieu: "Mulhouse", consentement: true });
    const [ligne] = await listerPositionnements(b.s, sophie, { formation_id: formationId });
    expect(ligne!.statut).toBe("complet");
    expect(ligne!.score).toBe(100);
    const mails = (await b.courriers()).filter((c) => c.type === "positionnement_complet" || c.type === "positionnement_confirmation");
    expect(mails).toHaveLength(2);
    expect((mails[0]!.pieces_jointes as unknown[]).length).toBe(1);
  });

  it("si complet, tout le monde télécharge le PDF : l'apprenant (par son lien), le formateur, l'organisme — pas un autre formateur", async () => {
    const pub = await telechargerPdfPublic(b.s, jeton);
    expect(pub.contenu.toString()).toContain("Positionnement avant formation");
    expect(pub.contenu.toString()).toContain("Signé électroniquement par Ludovic Test");
    expect((await telechargerPdfPositionnement(b.s, sophie, positionnementId)).nom).toBe(pub.nom);
    expect((await telechargerPdfPositionnement(b.s, b.admin, positionnementId)).nom).toBe(pub.nom);
    await expect(telechargerPdfPositionnement(b.s, marc, positionnementId)).rejects.toThrow(/introuvable/);
    await expect(signerPositionnementPublic(b.s, jeton, {})).rejects.toThrow(/déjà signé/);
  });

  it("sans test sur le parcours, l'invitation est refusée avec la marche à suivre (version 7 : plus de trame automatique)", async () => {
    const f = await creerFormation(b.s, sophie, { formation_titre: "Sans test", formation_objectifs: "Savoir faire A\nSavoir faire B\nSavoir faire C" });
    const demandesAvant = ia.demandes.length;
    await expect(inviterAuPositionnement(b.s, sophie, { stagiaire_id: stagiaireId, formation_id: f.id })).rejects.toMatchObject({ code: "invalide", message: expect.stringContaining("Générer le test de positionnement") });
    expect((await listerOutils(b.s, sophie)).some((o) => o.formation_id === f.id && o.type === "positionnement")).toBe(false);
    expect(ia.demandes.length).toBe(demandesAvant); // aucune requête IA ne part sans demande du formateur
  });

  it("à la création du dossier, le positionnement signé est repris : recueil et test validés, sans ressaisie", async () => {
    const d = await creerDossier(b.s, sophie, { stagiaire_ids: [stagiaireId], entreprise_id: entrepriseId, formation_id: formationId, formation_modalite: "presentiel", mode_financement: "opco" });
    const vue = await lireDossier(b.s, sophie, d.id);
    const valides = vue.pieces.filter((p) => p.statut === "valide").map((p) => p.code);
    expect(valides).toEqual(expect.arrayContaining(["00-AVT", "01-AVT"]));
    expect(vue.formation.formation_opco).toBe("ATLAS"); // l'OPCO de l'entreprise prime sur celui du catalogue
    expect(vue.formation.formateur_cout_horaire).toBeNull(); // version 7 : la rémunération se calcule par la commission
    // Repris d'un positionnement signé : aucun formulaire de recueil / positionnement n'est renvoyé à l'apprenant.
    expect((await b.courriers()).filter((c) => c.dossier_id === d.id && c.type.startsWith("formulaire_"))).toEqual([]);

    // Partie financière modifiable dans le dossier jusqu'à la validation
    await modifierDossier(b.s, sophie, d.id, { mode_financement: "entreprise", formation_prix_unitaire_ht: 120_000 });
    const apres = await lireDossier(b.s, sophie, d.id);
    expect(apres.mode_financement).toBe("entreprise");
    expect(apres.formation.formation_prix_unitaire_ht).toBe(120_000);
  });
});

describe("6. Profil et candidature", () => {
  it("après validation, le profil reste modifiable (domaines, zones, tarif…) mais pas le nom", async () => {
    const c = await mettreAJourMonProfil(b.s, sophie, { formateur_domaines: ["Commercial, vente et prospection"], formateur_zones: "Haut-Rhin", formateur_tarif_journalier: 90_000, formateur_statut_juridique: "SASU" });
    expect(c.formateur.formateur_domaines).toEqual(["Commercial, vente et prospection"]);
    await expect(mettreAJourMonProfil(b.s, sophie, { formateur_nom: "Autre" })).rejects.toThrow(/organisme/);
  });

  it("les justificatifs portent une date de fin de validité ; les pièces échues sont signalées", async () => {
    await deposerPieceFormateur(b.s, sophie, "attestation", fichier("urssaf.pdf"), "2026-01-31");
    const c = await lireMaCandidature(b.s, sophie);
    expect(c.echeances.find((e) => e.nom_fichier === "urssaf.pdf")?.expiree).toBe(true);
  });
});

describe("7. Archivage et « faire réapparaître »", () => {
  it("formations et questionnaires s'archivent et se restaurent", async () => {
    const f = await creerFormation(b.s, sophie, { formation_titre: "À archiver" });
    await archiverFormation(b.s, sophie, f.id);
    expect((await listerFormations(b.s, sophie)).some((x) => x.id === f.id)).toBe(false);
    expect((await archivesEtCorbeille(b.s, sophie)).formations.some((x) => x.id === f.id)).toBe(true);
    await restaurerFormation(b.s, sophie, f.id);
    expect((await listerFormations(b.s, sophie)).some((x) => x.id === f.id)).toBe(true);

    const [outil] = await listerOutils(b.s, sophie);
    await supprimerOutil(b.s, sophie, outil!.id);
    expect((await listerOutils(b.s, sophie)).some((o) => o.id === outil!.id)).toBe(false);
    await restaurerOutil(b.s, sophie, outil!.id);
    expect((await listerOutils(b.s, sophie)).some((o) => o.id === outil!.id)).toBe(true);
  });

  it("sauvegarde exportée puis restaurée : les formations et leurs parcours réapparaissent en copies", async () => {
    const sauvegarde = await exporterMesDonnees(b.s, sophie);
    const json = JSON.parse(sauvegarde.contenu.toString());
    expect(json.formations.length).toBeGreaterThan(0);
    const avant = (await listerFormations(b.s, sophie)).length;
    const r = await importerMesDonnees(b.s, sophie, sauvegarde.contenu);
    expect(r.erreurs).toEqual([]);
    expect((await listerFormations(b.s, sophie)).length).toBe(avant + r.formations);
    const copie = (await listerFormations(b.s, sophie)).find((f) => f.formation_titre === "Prospection commerciale B2B (restaurée)")!;
    expect((copie.formation_modules as unknown[]).length).toBe(4);
    await expect(importerMesDonnees(b.s, sophie, Buffer.from("{}"))).rejects.toThrow();
  });
});

describe("8. Compte formateur ludoalbisser@gmail.com", () => {
  it("créé au démarrage, candidature validée, idempotent, connexion avec le mot de passe demandé", async () => {
    const donnees = { email: "ludoalbisser@gmail.com", mot_de_passe: "1234ludo", prenom: "Ludovic", nom: "Albisser" };
    expect(await assurerComptePilote(b.s, donnees)).toMatch(/créé/);
    expect(await assurerComptePilote(b.s, donnees)).toBe("déjà présent");
    const session = await connecter(b.s, "LudoAlbisser@gmail.com", "1234ludo");
    expect(session.jeton).toBeTruthy();
    const { acteurDepuisJeton } = await import("@/serveur/services/auth");
    const acteur = (await acteurDepuisJeton(b.s, session.jeton))!;
    expect(acteur.role).toBe("formateur");
    expect(acteur.formateur_valide).toBe(true);
    expect(MDP).toBeTruthy();
  });

  it("n'écrase jamais un compte existant d'un autre rôle", async () => {
    expect(await assurerComptePilote(b.s, { email: "admin@organisme-demo.example", mot_de_passe: "x", prenom: "a", nom: "b" })).toMatch(/DÉJÀ UTILISÉE/);
  });
});

describe("contrôles du domaine", () => {
  it("les modules saisis ou proposés sont validés strictement : titre, durée, au moins un objectif et un contenu", () => {
    expect(validerModules(modulesManuels(35, 12)).ok).toBe(true);
    expect(validerModules([{ ...moduleIa(1), objectifs: [] }])).toMatchObject({ ok: false, erreurs: ["Module 1 : au moins un objectif."] });
    expect(validerModules([moduleIa(1)], { nombre: 2 }).ok).toBe(false);
    expect(validerModules("rien").ok).toBe(false);
  });
});
