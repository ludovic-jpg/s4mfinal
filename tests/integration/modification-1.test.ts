/**
 * Recette automatisée du document « Modification 1 » (23/09/2026), point par point.
 * Vraie base PostgreSQL en mémoire, archive en mémoire, horloge fixe, IA factice (aucun réseau).
 */
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerBanc, fichier, iaFactice, MDP, type Banc } from "../banc";
import { validerQuestionnaire } from "@/domaine/formulaires/qcm";
import { genererTrameParcours, repartirHeures, trameDiapos, trameTestPositionnement } from "@/domaine/pedagogie/parcours";
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

let b: Banc;
let ia: ReturnType<typeof iaFactice>;
let sophie: Acteur;
let marc: Acteur;
let formationId: string;
let stagiaireId: string;
let entrepriseId: string;

beforeAll(async () => {
  ia = iaFactice([]);
  b = await creerBanc({ ia });
  sophie = await b.formateur();
  marc = await b.formateur("marc@formateur.example", "Marc", "Autre");
}, 60_000);
afterAll(() => b.fermer());

describe("1. Générer le parcours avec seulement titre, heures, jours, tarif et nombre de modules", () => {
  it("la trame produit exactement n modules dont la somme des durées égale la durée totale", () => {
    for (const [heures, n] of [[21, 4], [14, 3], [7, 1], [35, 12], [10.5, 5]] as const) {
      const modules = genererTrameParcours({ titre: "Prospection", heures, jours: 3, nb_modules: n });
      expect(modules).toHaveLength(n);
      expect(modules.reduce((a, m) => a + m.duree_heures, 0)).toBeCloseTo(heures, 5);
      for (const m of modules) {
        expect(m.objectifs.length).toBeGreaterThan(0);
        expect(m.contenus.length).toBeGreaterThan(0);
        expect(m.mise_en_pratique).toMatch(/Atelier/);
      }
    }
    expect(repartirHeures(7, 3)).toEqual([2.5, 2.5, 2]);
  });

  it("le service propose le parcours (trame), le formateur l'aménage, puis l'enregistre : programme et objectifs en sont déduits", async () => {
    const p = await proposerParcours(b.s, sophie, { titre: "Prospection commerciale B2B", heures: 21, jours: 3, nb_modules: 4, mode: "trame" });
    expect(p.brouillon).toBe(true);
    expect(p.modules).toHaveLength(4);
    expect(await listerFormations(b.s, sophie)).toHaveLength(0); // rien n'est enregistré par la proposition

    const modules = p.modules.map((m, i) => (i === 0 ? { ...m, titre: "Cibler ses prospects" } : m)); // aménagement
    const f = await creerFormation(b.s, sophie, { formation_titre: "Prospection commerciale B2B", formation_niveau: "Intermédiaire", formation_duree_heures_total: 21, formation_duree_jours: 3, formation_prix_unitaire_ht: 140_000, formation_modules: modules });
    formationId = f.id;
    expect(f.formation_nb_modules).toBe(4);
    expect(f.programme).toContain("Module 1 — Cibler ses prospects");
    expect(f.formation_objectifs.split("\n").length).toBeGreaterThanOrEqual(3);
  });

  it("refuse un parcours dont les modules ne totalisent pas la durée de la formation", async () => {
    const modules = genererTrameParcours({ titre: "X", heures: 7, jours: 1, nb_modules: 2 });
    await expect(creerFormation(b.s, sophie, { formation_titre: "Incohérente", formation_duree_heures_total: 14, formation_modules: modules })).rejects.toThrow(/somme des durées/);
  });

  it("par l'IA : les durées sont imposées par la plateforme, et un nombre de modules erroné est refusé", async () => {
    const module = (i: number) => ({ titre: `Module IA ${i}`, objectifs: ["Identifier les cibles"], contenus: ["Segmentation"], methodes: "Apports", mise_en_pratique: "Atelier", evaluation: "Quiz", duree_heures: 99 });
    ia.demandes.length = 0;
    const r = iaFactice([JSON.stringify({ objectifs: ["A faire", "B faire", "C faire"], modules: [module(1), module(2), module(3)] }), JSON.stringify({ objectifs: ["A", "B", "C"], modules: [module(1)] })]);
    b.s.ia = r;
    const ok = await proposerParcours(b.s, sophie, { titre: "Prospection", heures: 14, jours: 2, nb_modules: 3, mode: "ia" });
    expect(ok.modules.map((m) => m.duree_heures)).toEqual([5, 4.5, 4.5]); // jamais les 99 h de l'IA
    expect(r.demandes[0]).toMatch(/recherche approfondie/);
    await expect(proposerParcours(b.s, sophie, { titre: "Prospection", heures: 14, jours: 2, nb_modules: 3, mode: "ia" })).rejects.toThrow(/pas exploitable/);
    b.s.ia = ia;
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
    await modifierFormation(b.s, sophie, formationId, { mode_financement: "opco", formation_opco: "OPCO EP (Entreprises de proximité)", formateur_cout_horaire: 6_000, formation_effectif_min: 2, formation_effectif_max: 8, formation_delai_acces: "Sous 2 semaines" });
    await expect(modifierFormation(b.s, sophie, formationId, { formation_effectif_min: 9 })).rejects.toThrow(/effectif maximum/);
  });
});

describe("2. Même fonctionnalité pour le test de positionnement, l'évaluation des acquis et les supports", () => {
  it("la trame de test de positionnement est un QCM valide, enregistrable après aménagement", async () => {
    const r = await proposerTest(b.s, sophie, { formation_id: formationId, type: "positionnement", nombre: 10, mode: "trame" });
    expect(validerQuestionnaire(r.questionnaire)).toEqual([]);
    expect(r.questionnaire.questions.length).toBeLessThanOrEqual(10);
    const o = await enregistrerOutil(b.s, sophie, { type: "positionnement", titre: r.questionnaire.titre, formation_id: formationId, contenu: r.questionnaire });
    expect(o.formation_id).toBe(formationId);
    const acquis = await proposerTest(b.s, sophie, { formation_id: formationId, type: "acquis", nombre: 5, mode: "trame" });
    expect(acquis.questionnaire.titre).toMatch(/Évaluation des acquis/);
  });

  it("plan de support : exactement 20 diapositives par module, dont mise en pratique, point d'étape et quiz", async () => {
    const { diapos } = await proposerPlanSupport(b.s, sophie, { formation_id: formationId, module_index: 1, mode: "trame" });
    expect(diapos).toHaveLength(20);
    const types = diapos.map((d) => d.type);
    expect(types).toContain("pratique");
    expect(types).toContain("point_etape");
    expect(types.at(-1)).toBe("quiz");
  });

  it("produit un vrai fichier PPTX de 20 diapositives, rangé dans le coffre-fort ; le régénérer met l'ancien à la corbeille", async () => {
    const plan = trameDiapos("Prospection commerciale B2B", genererTrameParcours({ titre: "P", heures: 21, jours: 3, nb_modules: 4 })[0]!, 1);
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

  it("tous les modules d'un coup", async () => {
    const r = await produireTousLesSupports(b.s, sophie, { formation_id: formationId, mode: "trame" });
    expect(r.produits).toHaveLength(4);
    expect(r.echecs).toEqual([]);
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
    await signerPositionnementPublic(b.s, jeton, { recueil: RECUEIL, reponses: p.questionnaire!.questions.map(() => 3), date: "2026-10-01", trace_png: tracePngDemo(4), lieu: "Mulhouse", consentement: true });
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

  it("sans test sur le parcours, l'invitation en crée un depuis ses objectifs (on peut toujours inviter)", async () => {
    const f = await creerFormation(b.s, sophie, { formation_titre: "Sans test", formation_objectifs: "Savoir faire A\nSavoir faire B\nSavoir faire C" });
    const r = await inviterAuPositionnement(b.s, sophie, { stagiaire_id: stagiaireId, formation_id: f.id });
    expect(r.test_cree).toBe(true);
    expect((await listerOutils(b.s, sophie)).some((o) => o.formation_id === f.id && o.type === "positionnement")).toBe(true);
  });

  it("à la création du dossier, le positionnement signé est repris : recueil et test validés, sans ressaisie", async () => {
    const d = await creerDossier(b.s, sophie, { stagiaire_ids: [stagiaireId], entreprise_id: entrepriseId, formation_id: formationId, formation_modalite: "presentiel", mode_financement: "opco" });
    const vue = await lireDossier(b.s, sophie, d.id);
    const valides = vue.pieces.filter((p) => p.statut === "valide").map((p) => p.code);
    expect(valides).toEqual(expect.arrayContaining(["00-AVT", "01-AVT"]));
    expect(vue.formation.formation_opco).toBe("ATLAS"); // l'OPCO de l'entreprise prime sur celui du catalogue
    expect(vue.formation.formateur_cout_horaire).toBe(6_000);

    // Partie financière modifiable dans le dossier jusqu'à la validation
    await modifierDossier(b.s, sophie, d.id, { mode_financement: "entreprise", formation_prix_unitaire_ht: 120_000, formateur_cout_horaire: 5_500 });
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
  it("la trame de positionnement pose une question par objectif, bornée", () => {
    const modules = genererTrameParcours({ titre: "T", heures: 35, jours: 5, nb_modules: 12 });
    const q = trameTestPositionnement("T", modules, 20);
    expect(q.questions.length).toBeLessThanOrEqual(20);
    expect(validerQuestionnaire(q)).toEqual([]);
  });
});
