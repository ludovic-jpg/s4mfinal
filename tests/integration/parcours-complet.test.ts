/**
 * LE test du projet : un dossier de formation va de « Brouillon » à « Archivé », avec trois acteurs
 * (formateur, admin, apprenant), sur une vraie base PostgreSQL et une archive. Chaque étape vérifie une
 * exigence du cahier des charges, citée en commentaire.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerBanc, fichier, MDP, type Banc } from "../banc";
import { accepterInvitation, acteurDepuisJeton } from "@/serveur/services/auth";
import { creerDossier, definirSeances, inviter, lireDossier, listerDossiers, modifierDossier, recreerDepuis, relancerApprenant, supprimerBrouillon } from "@/serveur/services/dossiers";
import { enregistrerEvaluation, lireQuestionnaire } from "@/serveur/services/evaluations";
import { coffresDeLApprenant, creerFormation, deposerDansCoffre, dupliquerFormation, enregistrerOutil, listerOutils, telechargerDuCoffre } from "@/serveur/services/formations";
import { executerAction } from "@/serveur/services/pipeline";
import { enregistrerEntreprise, enregistrerStagiaire } from "@/serveur/services/repertoire";
import { apercuPiece, deposerPieceExterne, deposerRetour, emarger, signerPiece, telechargerPiece, verifierIntegritePiece } from "@/serveur/services/retours";
import { mettreAJourOrganisme } from "@/serveur/services/organisme";
import type { Acteur } from "@/serveur/services/socle";

const TRACE = `data:image/png;base64,${"iVBORw0KGgo".repeat(80)}`;
const SIGNATURE = { trace_png: TRACE, lieu: "Mulhouse", consentement: true };
const QCM = {
  titre: "Positionnement Excel",
  questions: [
    { enonce: "Que fait RECHERCHEV ?", propositions: ["Une recherche verticale", "Un tri"], bonne_reponse: 0 },
    { enonce: "Un TCD sert à…", propositions: ["Mettre en page", "Synthétiser des données"], bonne_reponse: 1 },
  ],
};

let b: Banc;
let sophie: Acteur;
let anne: Acteur;
let dossierId: string;
let formationId: string;
let ids: { anne: string; luc: string; entreprise: string };

const piece = async (acteur: Acteur, code: string, stagiaire_id: string | null = null) => {
  const d = await lireDossier(b.s, acteur, dossierId);
  const p = d.pieces.find((x) => x.code === code && (stagiaire_id === null || x.stagiaire_id === stagiaire_id));
  if (!p) throw new Error(`Pièce ${code} absente pour ${acteur.role}`);
  return p;
};
const statut = async () => (await lireDossier(b.s, b.admin, dossierId)).sous_statut;

beforeAll(async () => {
  b = await creerBanc();
  sophie = await b.formateur();
});
afterAll(() => b.fermer());

describe("Modules 2 et 3 — formations, outils, coffre-fort", () => {
  it("F-FORM-01/02 : crée une formation alignée sur les variables, et la duplique avec ses outils", async () => {
    const f = await creerFormation(b.s, sophie, {
      formation_titre: "Excel — tableaux croisés dynamiques",
      formation_objectifs: "Construire des TCD.\nAutomatiser un reporting.",
      formation_niveau: "Intermédiaire",
      formation_prerequis: "Bases d'Excel",
      formation_duree_heures_total: 14,
      formation_duree_jours: 2,
      formation_prix_unitaire_ht: 98_000,
    });
    formationId = f.id;
    await enregistrerOutil(b.s, sophie, { type: "positionnement", titre: "Positionnement Excel", formation_id: f.id, contenu: QCM });
    await enregistrerOutil(b.s, sophie, { type: "acquis", titre: "Acquis Excel", formation_id: f.id, contenu: { ...QCM, titre: "Évaluation des acquis Excel" } });
    await expect(enregistrerOutil(b.s, sophie, { type: "acquis", titre: "Vide", contenu: { titre: "x", questions: [] } })).rejects.toMatchObject({ code: "invalide" });

    const copie = await dupliquerFormation(b.s, sophie, f.id);
    expect(copie.formation_titre).toBe("Excel — tableaux croisés dynamiques (copie)");
    expect((await listerOutils(b.s, sophie)).filter((o) => o.formation_id === copie.id)).toHaveLength(2);
  });

  it("F-OUT-04 : le coffre-fort est rattaché à la formation", async () => {
    await deposerDansCoffre(b.s, sophie, formationId, fichier("support-stagiaire.pdf"), true);
    const coffre = await deposerDansCoffre(b.s, sophie, formationId, fichier("notes-formateur.docx"), false);
    expect(coffre.map((c) => [c.nom_fichier, c.partageable])).toEqual([["support-stagiaire.pdf", true], ["notes-formateur.docx", false]]);
  });
});

describe("Modules 4 et 5 — fiches, création du dossier", () => {
  it("F-COM-01/02, F-DOS-01 à 03 : crée les fiches puis un dossier pré-rempli", async () => {
    const ent = await enregistrerEntreprise(b.s, sophie, { entreprise_nom: "Menuiserie Dupont SARL", entreprise_adresse: "12 avenue des Artisans, 68200 Mulhouse", entreprise_siret: "11111111111111", entreprise_representant_civilite: "M.", entreprise_representant_prenom: "Jean", entreprise_representant_nom: "Dupont" });
    const a = await enregistrerStagiaire(b.s, sophie, { stagiaire_prenom: "Anne", stagiaire_nom: "Martin", stagiaire_email: "anne.martin@dupont.example", stagiaire_poste: "Assistante de gestion", entreprise_id: ent.id });
    const l = await enregistrerStagiaire(b.s, sophie, { stagiaire_prenom: "Luc", stagiaire_nom: "Petit", stagiaire_email: "luc.petit@dupont.example", stagiaire_poste: "Chef d'atelier", entreprise_id: ent.id });
    ids = { anne: a.id, luc: l.id, entreprise: ent.id };

    const d = await creerDossier(b.s, sophie, { stagiaire_ids: [a.id, l.id], entreprise_id: ent.id, formation_id: formationId, formation_modalite: "presentiel", mode_financement: "opco" });
    dossierId = d.id;
    expect(d.dossier_reference).toBe("ADF-2026-0001");
    expect(d).toMatchObject({ sous_statut: "brouillon", formation_titre: "Excel — tableaux croisés dynamiques", formation_duree_heures_total: 14, formation_lieu_nom: "Menuiserie Dupont SARL", formation_prix_unitaire_ht: 98_000 });
    expect(d.questionnaire_positionnement).toMatchObject({ titre: "Positionnement Excel" });
  });

  it("RG-02 / F-DOS-04 : refuse la demande de validation sans recueil ni positionnement", async () => {
    await expect(executerAction(b.s, sophie, dossierId, "soumettre_validation")).rejects.toMatchObject({ code: "invalide", message: expect.stringContaining("RG-02") });
  });

  it("F-COM-04/05 : invite l'apprenant, qui choisit son mot de passe et entre dans son espace", async () => {
    const { lien } = await inviter(b.s, sophie, dossierId, ids.anne);
    expect((await b.courriers()).at(-1)).toMatchObject({ type: "invitation_apprenant", destinataire: "anne.martin@dupont.example" });
    const session = await accepterInvitation(b.s, lien.split("/").pop()!, MDP);
    anne = (await acteurDepuisJeton(b.s, session.jeton))!;
    expect(anne).toMatchObject({ role: "apprenant", stagiaire_id: ids.anne });
    expect((await listerDossiers(b.s, anne)).dossiers.map((x) => x.dossier_reference)).toEqual(["ADF-2026-0001"]);
  });

  it("recueil et positionnement : l'apprenant en ligne (sans jamais voir le corrigé), ou le formateur à sa place", async () => {
    const q = await lireQuestionnaire(b.s, anne, dossierId, "positionnement");
    expect(JSON.stringify(q.questionnaire)).not.toContain("bonne_reponse");
    expect(await enregistrerEvaluation(b.s, anne, dossierId, "positionnement", { reponses: [0, 0] })).toEqual({ score: 50 });
    await expect(enregistrerEvaluation(b.s, anne, dossierId, "recueil", { reponses: { attentes: "Gagner du temps" } })).rejects.toMatchObject({ code: "invalide" });
    const recueil = { poste_anciennete: "Assistante, 4 ans", niveau_maitrise: "Notions de base", attentes: "Gagner du temps", besoins_principaux: "Les TCD", handicap: "Non", programme_transmis: "Oui" };
    await enregistrerEvaluation(b.s, anne, dossierId, "recueil", { reponses: recueil });
    // Pour Luc, le formateur saisit lui-même l'entretien.
    await enregistrerEvaluation(b.s, sophie, dossierId, "recueil", { reponses: recueil, stagiaire_id: ids.luc });
    await enregistrerEvaluation(b.s, sophie, dossierId, "positionnement", { reponses: [0, 1], stagiaire_id: ids.luc, ajustement: "Renforcer le contrôle des données." });
    // Une pièce validée fait foi : ses réponses ne se réécrivent plus.
    await expect(enregistrerEvaluation(b.s, anne, dossierId, "positionnement", { reponses: [0, 1] })).rejects.toMatchObject({ code: "conflit" });
  });

  it("refuse encore la soumission tant que la saisie est incomplète, en listant les manques", async () => {
    await expect(executerAction(b.s, sophie, dossierId, "soumettre_validation")).rejects.toMatchObject({
      details: { manques: ["Dates de début et de fin", "Au moins une séance au planning", "Lieu de signature de la convention", "E-mail du représentant de l'entreprise"] },
    });
    await modifierDossier(b.s, sophie, dossierId, { formation_date_debut: "2026-11-03", formation_date_fin: "2026-11-04", signature_lieu: "Mulhouse", formation_opco: "OPCO Démo" });
    await definirSeances(b.s, sophie, dossierId, [
      { date: "2026-11-03", heure_debut: "09:00", heure_fin: "12:30" },
      { date: "2026-11-03", heure_debut: "13:30", heure_fin: "17:00" },
      { date: "2026-11-04", heure_debut: "09:00", heure_fin: "12:30" },
      { date: "2026-11-04", heure_debut: "13:30", heure_fin: "17:00" },
    ]);
    await enregistrerEntreprise(b.s, sophie, { entreprise_representant_email: "jean.dupont@dupont.example" }, ids.entreprise);
    await expect(definirSeances(b.s, sophie, dossierId, [{ date: "2026-11-03", heure_debut: "14:00", heure_fin: "09:00" }])).rejects.toBeDefined();
  });
});

describe("Étapes A et B — validation, financement", () => {
  it("F-DOS-05 : le formateur soumet ; l'admin est prévenu ; le formateur ne peut NI valider NI modifier", async () => {
    expect((await lireDossier(b.s, sophie, dossierId)).manques_soumission).toEqual([]);
    await executerAction(b.s, sophie, dossierId, "soumettre_validation");
    expect(await statut()).toBe("en_cours_validation");
    expect((await b.courriers()).at(-1)).toMatchObject({ type: "demande_validation", destinataire: "admin@organisme-demo.example" });
    await expect(executerAction(b.s, sophie, dossierId, "valider_dossier")).rejects.toMatchObject({ code: "interdit" });
    await expect(modifierDossier(b.s, sophie, dossierId, { formation_titre: "Autre" })).rejects.toMatchObject({ code: "conflit" });
  });

  it("refuse de valider tant que l'organisme n'est pas configuré : pas de convention sans SIRET", async () => {
    await mettreAJourOrganisme(b.s, b.admin, { of_siret: "" });
    await expect(executerAction(b.s, b.admin, dossierId, "valider_dossier")).rejects.toMatchObject({ code: "invalide", details: { manques: ["SIRET"] } });
    await mettreAJourOrganisme(b.s, b.admin, { of_siret: "00000000000000" });
  });

  it("RG-04, F-ARCH-01 à 03, F-DOS-06 : valider génère les pièces de départ, les archive, et écrit à l'entreprise", async () => {
    await executerAction(b.s, b.admin, dossierId, "valider_dossier");
    expect(await statut()).toBe("dossier_valide");

    const depart = b.archive.lister("ADF-2026-0001/Pièces de départ/");
    expect(depart.map((c) => c.split("/").pop())).toEqual([
      "00_AVT_Recueil-Besoins_Anne-Martin.html",
      "00_AVT_Recueil-Besoins_Luc-Petit.html",
      "00b_AVT_Pre-Dossier_Anne-Martin.html",
      "00b_AVT_Pre-Dossier_Luc-Petit.html",
      "01_AVT_Test-Positionnement_Anne-Martin.html",
      "01_AVT_Test-Positionnement_Luc-Petit.html",
      "02_AVT_Convention-Formation.html",
      "03_AVT_Planning.html",
    ]);
    const convention = (await b.archive.lire(depart.find((c) => c.includes("Convention"))!)).toString();
    expect(convention).toContain("ORGANISME DÉMO FORMATION");
    expect(convention).toContain("Anne Martin");
    expect(convention).toContain("1 960,00 €");
    expect(convention).not.toMatch(/\{\{|<!--\s*(si|repeter|zone)/);

    const mail = (await b.courriers()).at(-1)!;
    expect(mail).toMatchObject({ type: "pieces_financement", destinataire: "jean.dupont@dupont.example" });
    expect((mail.pieces_jointes as Array<{ nom: string }>).map((p) => p.nom)).toEqual(expect.arrayContaining(["02_AVT_Convention-Formation.html", "03_AVT_Planning.html"]));
  });

  it("6.4.2 : l'apprenant voit SON espace — 5 pièces à ce stade, ni l'ODM ni celles de Luc", async () => {
    const d = await lireDossier(b.s, anne, dossierId);
    expect(d.pieces.map((p) => `${p.ordre} ${p.libelle}`)).toEqual(["1 Pré-dossier", "2 Convention de formation", "2 bis Planning", "3 Accord de financement"]);
    expect(d.pieces.every((p) => p.stagiaire_id === null || p.stagiaire_id === ids.anne)).toBe(true);
    expect(d.stagiaires.map((st) => st.prenom)).toEqual(["Anne"]);
    expect(d.finances).toBeNull();
    expect(d.journal).toEqual([]);
    // F-COM-03bis : le planning est transmis, sans statut de signature.
    expect(d.pieces.find((p) => p.code === "03-AVT")).toMatchObject({ suivi: false, statut: null, libelle_statut: "Transmis", peut_signer: false });
  });

  it("F-COM-06(a), F-COM-07/08 : l'apprenant signe en ligne ; le statut « Validé » est le même partout", async () => {
    const pre = await piece(anne, "PRE");
    expect(pre.peut_signer).toBe(true);
    await expect(signerPiece(b.s, anne, pre.id, { ...SIGNATURE, consentement: false })).rejects.toMatchObject({ code: "invalide" });
    await signerPiece(b.s, anne, pre.id, SIGNATURE, "203.0.113.7");
    await expect(signerPiece(b.s, anne, pre.id, SIGNATURE)).rejects.toMatchObject({ code: "conflit" });

    // Une seule ligne, trois lecteurs : apprenant, formateur, carte du pipeline.
    expect((await piece(anne, "PRE")).statut).toBe("valide");
    expect((await piece(sophie, "PRE", ids.anne)).statut).toBe("valide");
    const carte = (await listerDossiers(b.s, sophie)).dossiers.find((x) => x.id === dossierId)!;
    expect(carte.pieces_validees).toBe(5); // 2 recueils + 2 positionnements + le pré-dossier d'Anne

    // F-ARCH-04/05 : classement automatique dans « Retour », avec le certificat de signature.
    const retour = b.archive.lister("ADF-2026-0001/Retour/").map((c) => c.split("/").pop());
    expect(retour).toEqual(expect.arrayContaining(["00b_AVT_Pre-Dossier_Anne-Martin_signe.html", "00b_AVT_Pre-Dossier_Anne-Martin_certificat-signature.html"]));
    const signe = (await telechargerPiece(b.s, anne, pre.id, "retour")).contenu.toString();
    expect(signe).toContain("Signé électroniquement par Anne Martin");
  });

  it("J9 : un document retourné puis altéré dans l'archive est détecté", async () => {
    const pre = await piece(sophie, "PRE", ids.anne);
    expect(await verifierIntegritePiece(b.s, sophie, pre.id)).toMatchObject({ retournee: true, integre: true, preuve: { lieu: "Mulhouse", adresse_ip: "203.0.113.7" } });
    const chemin = b.archive.lister("Pre-Dossier_Anne-Martin_signe.html")[0]!;
    const original = await b.archive.lire(chemin);
    await b.archive.ecrire(chemin, original.toString().replace("14", "140"));
    expect((await verifierIntegritePiece(b.s, sophie, pre.id)).integre).toBe(false);
    await b.archive.ecrire(chemin, original);
  });

  it("F-COM-06(b) : ou bien il télécharge, signe hors ligne, et redépose", async () => {
    const convention = await piece(anne, "02-AVT");
    expect((await telechargerPiece(b.s, anne, convention.id, "depart")).nom).toBe("02_AVT_Convention-Formation.html");
    await expect(deposerRetour(b.s, anne, convention.id, fichier("convention.exe"))).rejects.toMatchObject({ code: "invalide" });
    await deposerRetour(b.s, anne, convention.id, fichier("convention-signee.pdf"));
    expect(await piece(anne, "02-AVT")).toMatchObject({ statut: "valide", mode_retour: "depot" });
  });

  it("cloisonnement : Luc ne voit pas les pièces d'Anne ; un autre formateur ne voit pas le dossier", async () => {
    await inviter(b.s, sophie, dossierId, ids.luc);
    const lien = ((await b.courriers()).at(-1)!.corps_html.match(/invitation\/([\w-]+)/) ?? [])[1]!;
    const luc = (await acteurDepuisJeton(b.s, (await accepterInvitation(b.s, lien, MDP)).jeton))!;
    const preAnne = await piece(sophie, "PRE", ids.anne);
    await expect(apercuPiece(b.s, luc, preAnne.id)).rejects.toMatchObject({ code: "introuvable" });
    await signerPiece(b.s, luc, (await piece(luc, "PRE")).id, SIGNATURE);

    const paul = await b.formateur("paul@exemple.example", "Paul", "Durand");
    await expect(lireDossier(b.s, paul, dossierId)).rejects.toMatchObject({ code: "introuvable" });
    expect((await listerDossiers(b.s, paul)).dossiers).toEqual([]);
    await expect(creerDossier(b.s, paul, { stagiaire_ids: [ids.anne], entreprise_id: ids.entreprise, formation_id: formationId, formation_modalite: "presentiel", mode_financement: "opco" })).rejects.toMatchObject({ code: "introuvable" });
  });

  it("F-CRM-06 : relance l'apprenant avec la liste exacte de ce qui est attendu de lui", async () => {
    await executerAction(b.s, sophie, dossierId, "declarer_depot");
    await expect(relancerApprenant(b.s, sophie, dossierId, ids.anne)).rejects.toMatchObject({ code: "conflit" }); // Anne est à jour
  });

  it("RG-08 : avant l'accord, le coffre-fort reste fermé à l'apprenant", async () => {
    expect(await coffresDeLApprenant(b.s, anne)).toEqual([]);
  });

  it("F-COM-10, RG-06, F-OF-02 : l'APPRENANT dépose l'Accord → accord enregistré, ODM généré et envoyé, coffre ouvert", async () => {
    await deposerPieceExterne(b.s, anne, dossierId, "ACC", fichier("accord-opco.pdf"));
    expect(await statut()).toBe("accord_financement");

    const odm = await piece(sophie, "04-AVT");
    expect(odm).toMatchObject({ statut: "en_attente", espace: "of", peut_signer: true });
    expect((await b.courriers()).at(-1)).toMatchObject({ type: "odm", destinataire: "sophie.lambert@formatrice.example" });
    expect(b.archive.lister("Pièces de départ/04_AVT_Ordre-Mission-Formateur.html")).toHaveLength(1);

    // RG-08 / F-OUT-05 : seuls les éléments marqués « partageable » sont ouverts.
    const coffres = await coffresDeLApprenant(b.s, anne);
    expect(coffres[0]!.fichiers.map((f) => f.nom_fichier)).toEqual(["support-stagiaire.pdf"]);
    expect((await telechargerDuCoffre(b.s, anne, coffres[0]!.fichiers[0]!.id)).nom).toBe("support-stagiaire.pdf");

    // L'apprenant ne voit toujours pas l'espace Communication avec l'OF.
    expect((await lireDossier(b.s, anne, dossierId)).pieces.some((p) => p.espace === "of")).toBe(false);
  });

  it("F-OF-03/04 : le formateur signe l'ODM dans l'espace Communication avec l'OF", async () => {
    const odm = await piece(sophie, "04-AVT");
    await expect(signerPiece(b.s, anne, odm.id, SIGNATURE)).rejects.toMatchObject({ code: "introuvable" });
    await signerPiece(b.s, sophie, odm.id, SIGNATURE);
    expect((await piece(b.admin, "04-AVT")).statut).toBe("valide");
  });
});

describe("Étapes C à G — réalisation, clôture, paiement, archivage", () => {
  it("envoie les éléments pédagogiques : convocations générées et transmises", async () => {
    await executerAction(b.s, sophie, dossierId, "envoyer_elements_pedagogiques");
    const mails = (await b.courriers()).filter((c) => c.type === "elements_pedagogiques");
    expect(mails.map((m) => m.destinataire).sort()).toEqual(["anne.martin@dupont.example", "luc.petit@dupont.example"]);
    expect((mails[0]!.pieces_jointes as unknown[]).length).toBe(1);
    const relance = await relancerApprenant(b.s, sophie, dossierId, ids.anne);
    expect(relance.pieces).toEqual(["Convocation"]);
    await signerPiece(b.s, anne, (await piece(anne, "05-AVT")).id, SIGNATURE);
  });

  it("émargement électronique séance par séance, contresigné par le formateur", async () => {
    const seances = (await lireDossier(b.s, sophie, dossierId)).seances;
    await expect(emarger(b.s, anne, seances[0]!.id, { trace_png: TRACE })).rejects.toMatchObject({ code: "conflit" }); // formation non démarrée
    await executerAction(b.s, sophie, dossierId, "demarrer_formation");
    for (const se of seances.slice(0, 3)) await emarger(b.s, anne, se.id, { trace_png: TRACE });
    for (const se of seances) await emarger(b.s, sophie, se.id, { trace_png: TRACE });
    const d = await lireDossier(b.s, sophie, dossierId);
    expect(d.stagiaires.find((st) => st.prenom === "Anne")!.heures_realisees).toBe(10.5); // 3 séances de 3 h 30 sur 4
    const feuille = await apercuPiece(b.s, anne, (await piece(anne, "06-PDT")).id);
    expect(feuille.match(/<img src="data:image\/png/g)!.length).toBe(7); // 3 signatures d'Anne + 4 du formateur
  });

  it("évaluation des acquis : l'apprenant répond, puis signe la pièce ; la satisfaction reste fermée au formateur", async () => {
    expect(await enregistrerEvaluation(b.s, anne, dossierId, "acquis", { reponses: [0, 1] })).toEqual({ score: 100 });
    expect((await piece(anne, "07-FIN")).statut).toBe("en_attente");
    await signerPiece(b.s, anne, (await piece(anne, "07-FIN")).id, SIGNATURE);
    await signerPiece(b.s, anne, (await piece(anne, "06-PDT")).id, SIGNATURE);
    await expect(enregistrerEvaluation(b.s, sophie, dossierId, "acquis", { reponses: [0, 1], stagiaire_id: ids.luc })).rejects.toMatchObject({ code: "interdit" });
  });

  it("étape D : « incomplet » tant qu'il manque une pièce requise, puis bascule SEUL à « complet »", async () => {
    await executerAction(b.s, sophie, dossierId, "terminer_formation");
    expect(await statut()).toBe("fin_dossier_incomplet");
    const d = await lireDossier(b.s, sophie, dossierId);
    expect(d.manques_completude.length).toBeGreaterThan(0);
    await expect(executerAction(b.s, b.admin, dossierId, "demander_paiement")).rejects.toMatchObject({ code: "invalide" });

    // L'attestation d'Anne porte les heures RÉELLEMENT émargées et son résultat.
    const attestation = await apercuPiece(b.s, anne, (await piece(anne, "09-FIN")).id);
    expect(attestation).toContain("10,5 heures");
    expect(attestation).toContain("Objectifs atteints");

    // On solde tout ce qui reste : pièces d'Anne, puis celles de Luc (retours papier déposés par… Luc lui-même).
    await signerPiece(b.s, anne, (await piece(anne, "09-FIN")).id, SIGNATURE);
    const lucActeur = (await acteurDepuisJetonDe("luc.petit@dupont.example"))!;
    for (const code of ["05-AVT", "06-PDT", "07-FIN", "09-FIN"]) {
      expect(await statut()).toBe("fin_dossier_incomplet");
      await deposerRetour(b.s, lucActeur, (await lireDossier(b.s, lucActeur, dossierId)).pieces.find((p) => p.code === code)!.id, fichier(`${code}-signe.pdf`));
    }
    expect(await statut()).toBe("fin_dossier_complet");
  });

  it("satisfaction à chaud : renseignée en ligne par l'apprenant, hors des espaces de communication", async () => {
    const notes = Object.fromEntries(["contenu", "attentes", "adaptation", "programme", "application", "pedagogie", "competences", "supports", "environnement", "globale"].map((k) => [k, "5"]));
    await enregistrerEvaluation(b.s, anne, dossierId, "satisfaction_chaud", { reponses: { ...notes, commentaire: "Très concret." } });
    expect(b.archive.lister("Retour/08_FIN_Satisfaction-Chaud_Anne-Martin_renseigne.html")).toHaveLength(1);
  });

  it("étapes E à G : paiement réservé à l'admin ; archivage conditionné à la facture du formateur", async () => {
    await expect(executerAction(b.s, sophie, dossierId, "demander_paiement")).rejects.toMatchObject({ code: "interdit" });
    await executerAction(b.s, b.admin, dossierId, "demander_paiement");
    const factureOf = await piece(sophie, "11-FIN");
    expect(factureOf).toMatchObject({ suivi: false, libelle_statut: "Transmis", peut_deposer: false }); // F-OF-05 : consultation seule
    expect(await apercuPiece(b.s, sophie, factureOf.id)).toContain("FA-2026-0001");

    await executerAction(b.s, b.admin, dossierId, "enregistrer_paiement");
    await expect(executerAction(b.s, b.admin, dossierId, "cloturer")).rejects.toMatchObject({ message: expect.stringContaining("facture du formateur") });
    await deposerRetour(b.s, sophie, (await piece(sophie, "10-FIN")).id, fichier("facture-sl-conseil.pdf")); // F-OF-05
    await executerAction(b.s, b.admin, dossierId, "cloturer");
    expect(await statut()).toBe("archive");
  });

  it("un dossier archivé est en lecture seule, pour tout le monde", async () => {
    const d = await lireDossier(b.s, b.admin, dossierId);
    expect(d).toMatchObject({ archive: true, actions: [] });
    expect(d.pieces.every((p) => !p.peut_signer && !p.peut_deposer)).toBe(true);
    await expect(executerAction(b.s, b.admin, dossierId, "enregistrer_paiement")).rejects.toMatchObject({ code: "invalide" });
    await expect(deposerRetour(b.s, sophie, (await piece(sophie, "10-FIN")).id, fichier("autre.pdf"))).rejects.toMatchObject({ code: "conflit" });
    expect(d.journal.length).toBeGreaterThan(20);
  });
});

describe("RG-07 — refus de financement", () => {
  it("F-CRM-07, F-DOS-07 : le dossier refusé est archivé, consultable, et n'empêche pas d'en recréer un", async () => {
    const d2 = await creerDossier(b.s, sophie, { stagiaire_ids: [ids.anne], entreprise_id: ids.entreprise, formation_id: formationId, formation_modalite: "distanciel", mode_financement: "faf" });
    expect(d2.dossier_reference).toBe("ADF-2026-0002");
    expect(d2).toMatchObject({ formation_lieu_adresse: "", formation_duree_heures_distanciel: 14 });
    const recueil = { poste_anciennete: "x", niveau_maitrise: "Avancé", attentes: "x", besoins_principaux: "x", handicap: "Non", programme_transmis: "Oui" };
    await enregistrerEvaluation(b.s, sophie, d2.id, "recueil", { reponses: recueil, stagiaire_id: ids.anne });
    await enregistrerEvaluation(b.s, sophie, d2.id, "positionnement", { reponses: [0, 1], stagiaire_id: ids.anne });
    await modifierDossier(b.s, sophie, d2.id, { formation_date_debut: "2026-12-01", formation_date_fin: "2026-12-02", signature_lieu: "Mulhouse", formation_lien_visio: "https://visio.example/salle" });
    await definirSeances(b.s, sophie, d2.id, [{ date: "2026-12-01", heure_debut: "09:00", heure_fin: "17:00" }]);
    await executerAction(b.s, sophie, d2.id, "soumettre_validation");
    await executerAction(b.s, b.admin, d2.id, "valider_dossier");

    await expect(executerAction(b.s, sophie, d2.id, "enregistrer_refus")).rejects.toMatchObject({ message: expect.stringContaining("justificatif") });
    await deposerPieceExterne(b.s, sophie, d2.id, "REF", fichier("refus-faf.pdf"));
    await executerAction(b.s, sophie, d2.id, "enregistrer_refus", { motif: "Budget épuisé" });

    const refuse = await lireDossier(b.s, sophie, d2.id);
    expect(refuse).toMatchObject({ sous_statut: "refus_financement", archive: true, actions: [], motif_refus: "Budget épuisé" });
    expect((await telechargerPiece(b.s, sophie, refuse.pieces.find((p) => p.code === "REF")!.id, "retour")).nom).toContain("Refus-Financement");
    expect((await listerDossiers(b.s, sophie)).dossiers.some((x) => x.id === d2.id)).toBe(true); // toujours visible dans le pipeline

    const d3 = await recreerDepuis(b.s, sophie, d2.id);
    expect(d3).toMatchObject({ dossier_reference: "ADF-2026-0003", sous_statut: "brouillon", formation_lien_visio: "https://visio.example/salle" });
    await supprimerBrouillon(b.s, sophie, d3.id);
    await expect(supprimerBrouillon(b.s, sophie, d2.id)).rejects.toMatchObject({ code: "conflit" });
  });
});

async function acteurDepuisJetonDe(email: string): Promise<Acteur | null> {
  const { connecter } = await import("@/serveur/services/auth");
  return acteurDepuisJeton(b.s, (await connecter(b.s, email, MDP)).jeton);
}
