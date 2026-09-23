/**
 * Recette automatisée du cahier des charges ORAL du 23/09/2026, phrase par phrase.
 *
 * Même banc que le parcours complet (vraie base PostgreSQL en mémoire, archive en mémoire, horloge fixe),
 * mais le scénario suit l'ordre dicté par le porteur de projet :
 *   invitation → recueil + positionnement → dossier constitué → validation administrative →
 *   pièces du financement (convention, planning, programme) → signature → « j'affirme avoir déposé » →
 *   section Accord produite automatiquement → dépôt de l'accord par l'apprenant, le formateur ou l'organisme.
 * Et deux exigences transverses : l'IA seulement dans l'espace pédagogique ; tout le reste, exact et reproductible.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerBanc, fichier, iaFactice, MDP, type Banc } from "../banc";
import { creerApp } from "@/serveur/http/app";
import { accepterInvitation, acteurDepuisJeton } from "@/serveur/services/auth";
import { creerDossier, definirSeances, inviter, lireDossier, modifierDossier } from "@/serveur/services/dossiers";
import { enregistrerEvaluation } from "@/serveur/services/evaluations";
import { creerFormation, enregistrerOutil } from "@/serveur/services/formations";
import { proposerProgramme, proposerQcm, etatIa } from "@/serveur/services/pedagogie-ia";
import { executerAction } from "@/serveur/services/pipeline";
import { enregistrerEntreprise, enregistrerStagiaire } from "@/serveur/services/repertoire";
import { apercuPiece, deposerPieceExterne, deposerRetour, signerPiece, telechargerPiece } from "@/serveur/services/retours";
import type { Acteur } from "@/serveur/services/socle";

const TRACE = `data:image/png;base64,${"iVBORw0KGgo".repeat(80)}`;
const QCM = { titre: "Positionnement Excel", questions: [{ enonce: "Un TCD sert à…", propositions: ["Mettre en page", "Synthétiser des données"], bonne_reponse: 1 }] };
const RECUEIL = { poste_anciennete: "Assistante, 4 ans", niveau_maitrise: "Notions de base", attentes: "Gagner du temps", besoins_principaux: "Les TCD", handicap: "Non", programme_transmis: "Oui" };
const REPONSE_QCM_IA = JSON.stringify({
  titre: "Évaluation des acquis — Excel",
  questions: Array.from({ length: 5 }, (_, i) => ({ enonce: `Question ${i + 1} sur les TCD ?`, propositions: ["A", "B", "C", "D"], bonne_reponse: i % 4 })),
});

let b: Banc;
let ia: ReturnType<typeof iaFactice>;
let sophie: Acteur;
let anne: Acteur;
let jetonAnne: string;
let formationId: string;
let dossierId: string;
let stagiaireId: string;
let entrepriseId: string;

const sections = async (acteur: Acteur) => {
  const d = await lireDossier(b.s, acteur, dossierId);
  return Object.fromEntries(d.parcours.find((p) => p.stagiaire_id === stagiaireId)!.sections.map((s) => [s.cle, s]));
};
const piece = async (acteur: Acteur, code: string) => (await lireDossier(b.s, acteur, dossierId)).pieces.find((p) => p.code === code)!;

beforeAll(async () => {
  ia = iaFactice([
    "```json\n" + JSON.stringify({ objectifs: ["Construire un tableau croisé dynamique", "Automatiser un reporting mensuel", "Contrôler la qualité des données"], programme: "Jour 1 — Tableaux croisés dynamiques.\nJour 2 — Automatisation et contrôle." }) + "\n```",
    REPONSE_QCM_IA,
    JSON.stringify({ titre: "Mauvais", questions: [] }),
  ]);
  b = await creerBanc({ ia });
  sophie = await b.formateur();
}, 60_000);
afterAll(() => b.fermer());

describe("Espace pédagogique — « l'usage de l'IA est important sur la partie support pédagogique »", () => {
  it("l'IA propose objectifs et programme ; RIEN n'est enregistré tant que le formateur ne l'a pas fait", async () => {
    expect(etatIa(b.s, sophie)).toEqual({ disponible: true });
    const brouillon = await proposerProgramme(b.s, sophie, { formation_titre: "Excel — tableaux croisés dynamiques", formation_duree_heures_total: 14 });
    expect(brouillon).toMatchObject({ brouillon: true, formation_objectifs: expect.stringContaining("Construire un tableau croisé dynamique") });

    // Le formateur relit, puis enregistre lui-même la formation (avec le programme proposé).
    const f = await creerFormation(b.s, sophie, { formation_titre: "Excel — tableaux croisés dynamiques", formation_objectifs: brouillon.formation_objectifs, programme: brouillon.programme, formation_duree_heures_total: 14, formation_duree_jours: 2, formation_prix_unitaire_ht: 98_000 });
    formationId = f.id;
    await enregistrerOutil(b.s, sophie, { type: "positionnement", titre: QCM.titre, formation_id: f.id, contenu: QCM });
  });

  it("l'IA propose un QCM d'évaluation des acquis fondé sur la formation, validé strictement", async () => {
    const r = await proposerQcm(b.s, sophie, { formation_id: formationId, type: "acquis", nombre: 5 });
    expect(r.questionnaire.questions).toHaveLength(5);
    expect(ia.demandes.at(-1)).toContain("Jour 1 — Tableaux croisés dynamiques.");
    // Réponse inexploitable : refusée, jamais « réparée ».
    await expect(proposerQcm(b.s, sophie, { formation_id: formationId, type: "acquis", nombre: 5 })).rejects.toMatchObject({ code: "invalide" });
  });

  it("l'IA est réservée au formateur, et sans configuration elle est simplement indisponible", async () => {
    await expect(proposerQcm(b.s, b.admin, { formation_id: formationId, type: "acquis" })).rejects.toMatchObject({ code: "interdit" });
    const sansIa = await creerBanc();
    const autre = await sansIa.formateur();
    expect(etatIa(sansIa.s, autre)).toEqual({ disponible: false });
    await expect(proposerProgramme(sansIa.s, autre, { formation_titre: "Test IA" })).rejects.toMatchObject({ code: "conflit" });
    await sansIa.fermer();
  });
});

describe("Espace apprenant — invitation, étape préliminaire, constitution du dossier", () => {
  it("« on peut inviter un apprenant sur une page dédiée, qui commence par le recueil des besoins et le test de positionnement »", async () => {
    const ent = await enregistrerEntreprise(b.s, sophie, { entreprise_nom: "Menuiserie Dupont SARL", entreprise_adresse: "12 avenue des Artisans, 68200 Mulhouse", entreprise_siret: "11111111111111", entreprise_representant_nom: "Dupont", entreprise_representant_email: "jean.dupont@dupont.example" });
    const st = await enregistrerStagiaire(b.s, sophie, { stagiaire_prenom: "Anne", stagiaire_nom: "Martin", stagiaire_email: "anne.martin@dupont.example", entreprise_id: ent.id });
    stagiaireId = st.id;
    entrepriseId = ent.id;
    dossierId = (await creerDossier(b.s, sophie, { stagiaire_ids: [st.id], entreprise_id: ent.id, formation_id: formationId, formation_modalite: "presentiel", mode_financement: "opco" })).id;

    const { lien } = await inviter(b.s, sophie, dossierId, st.id);
    const session = await accepterInvitation(b.s, lien.split("/").pop()!, MDP);
    jetonAnne = session.jeton;
    anne = (await acteurDepuisJeton(b.s, session.jeton))!;

    const s = await sections(anne);
    expect(s.preliminaire).toMatchObject({ etat: "a_faire" });
    expect(["constitution", "financement", "accord", "realisation"].map((c) => s[c]!.etat)).toEqual(["a_venir", "a_venir", "a_venir", "a_venir"]);
  });

  it("« constituer un dossier requiert le recueil des besoins, le test de positionnement, et un dossier enregistré »", async () => {
    // 1. Sans recueil ni positionnement : refus (RG-02).
    await expect(executerAction(b.s, sophie, dossierId, "soumettre_validation")).rejects.toMatchObject({ message: expect.stringContaining("RG-02") });

    // 2. L'apprenant répond : l'étape préliminaire se ferme.
    await enregistrerEvaluation(b.s, anne, dossierId, "recueil", { reponses: RECUEIL });
    expect((await sections(anne)).preliminaire!.etat).toBe("a_faire");
    await enregistrerEvaluation(b.s, anne, dossierId, "positionnement", { reponses: [1] });
    expect((await sections(anne)).preliminaire!.etat).toBe("termine");

    // 3. Dossier non encore enregistré (dates, planning, lieu de signature) : toujours refusé, avec la liste exacte.
    await expect(executerAction(b.s, sophie, dossierId, "soumettre_validation")).rejects.toMatchObject({ details: { manques: expect.arrayContaining(["Dates de début et de fin", "Au moins une séance au planning"]) } });

    // 4. Dossier enregistré : la soumission passe.
    await modifierDossier(b.s, sophie, dossierId, { formation_date_debut: "2026-11-03", formation_date_fin: "2026-11-04", signature_lieu: "Mulhouse", formation_opco: "OPCO Démo" });
    await definirSeances(b.s, sophie, dossierId, [
      { date: "2026-11-03", heure_debut: "09:00", heure_fin: "17:00" },
      { date: "2026-11-04", heure_debut: "09:00", heure_fin: "17:00" },
    ]);
    await executerAction(b.s, sophie, dossierId, "soumettre_validation");
    expect((await sections(anne)).constitution!.etat).toBe("en_attente");
  });

  it("le programme détaillé est exigé : la convention l'annonce « en annexe »", async () => {
    const autre = await creerFormation(b.s, sophie, { formation_titre: "Sans programme", formation_objectifs: "Objectif", formation_duree_heures_total: 7, formation_prix_unitaire_ht: 10_000 });
    const d = await creerDossier(b.s, sophie, { stagiaire_ids: [stagiaireId], entreprise_id: entrepriseId, formation_id: autre.id, formation_modalite: "presentiel", mode_financement: "opco" });
    expect((await lireDossier(b.s, sophie, d.id)).manques_soumission).toContain("Programme détaillé de la formation (annexe de la convention)");
  });

  it("« le faire valider par l'équipe administrative » : seul l'admin valide", async () => {
    await expect(executerAction(b.s, sophie, dossierId, "valider_dossier")).rejects.toMatchObject({ code: "interdit" });
    await expect(executerAction(b.s, anne, dossierId, "valider_dossier")).rejects.toMatchObject({ code: "interdit" });
    await executerAction(b.s, b.admin, dossierId, "valider_dossier");
    expect((await sections(anne)).constitution!.etat).toBe("termine");
  });
});

describe("Demande de financement — convention, planning, parcours de formation", () => {
  it("« on remet à l'apprenant l'ensemble des pièces : convention, planning, parcours de formation »", async () => {
    const s = await sections(anne);
    expect(s.financement).toMatchObject({ etat: "a_faire", pieces: ["PRE", "02-AVT", "03-AVT", "PRG"] });
    // Planning et programme : transmis, sans statut de signature ; téléchargeables par l'apprenant.
    for (const code of ["03-AVT", "PRG"]) {
      expect(await piece(anne, code), code).toMatchObject({ suivi: false, libelle_statut: "Transmis", peut_signer: false });
      const doc = await telechargerPiece(b.s, anne, (await piece(anne, code)).id, "depart");
      expect(doc.contenu.toString()).toContain("Annexe à la convention");
    }
    // L'e-mail à l'entreprise (F-DOS-06) joint désormais aussi le programme.
    const mail = (await b.courriers()).find((c) => c.type === "pieces_financement")!;
    expect((mail.pieces_jointes as Array<{ nom: string }>).map((p) => p.nom)).toContain("03a_AVT_Programme-Formation.html");
  });

  it("« il ne peut affirmer avoir déposé la demande » qu'une fois la convention signée", async () => {
    const d = await lireDossier(b.s, anne, dossierId);
    expect(d.actions).toEqual([{ action: "declarer_depot", libelle: expect.any(String), bloqueePar: expect.stringContaining("convention"), motifRequis: false }]);
    await expect(executerAction(b.s, anne, dossierId, "declarer_depot")).rejects.toMatchObject({ code: "invalide" });
  });

  it("« il peut les télécharger, les signer online, les redéposer » : le statut passe à « Validé »", async () => {
    // Signature en ligne du pré-dossier…
    await signerPiece(b.s, anne, (await piece(anne, "PRE")).id, { trace_png: TRACE, lieu: "Mulhouse", consentement: true });
    // … et convention téléchargée, signée hors ligne, redéposée.
    await deposerRetour(b.s, anne, (await piece(anne, "02-AVT")).id, fichier("convention-signee.pdf"));
    expect((await piece(anne, "PRE")).libelle_statut).toBe("Validé");
    expect((await piece(anne, "02-AVT")).libelle_statut).toBe("Validé");
    expect((await sections(anne)).financement!.message).toContain("confirmez");
  });

  it("« il coche : j'affirme avoir déposé la demande » — par l'API, depuis SON espace ; la section change de couleur", async () => {
    const app = creerApp(b.s);
    const r = await app.request(`/api/dossiers/${dossierId}/actions/declarer_depot`, { method: "POST", headers: { "x-requested-with": "s4m", "content-type": "application/json", cookie: `s4m_session=${jetonAnne}` }, body: "{}" });
    expect(r.status).toBe(200);
    const s = await sections(anne);
    expect(s.financement!.etat).toBe("termine");
    expect((await lireDossier(b.s, sophie, dossierId)).sous_statut).toBe("dossier_depose");
    // Le formateur est prévenu ; le journal garde qui a déclaré.
    expect((await b.courriers()).at(-1)).toMatchObject({ type: "depot_declare", destinataire: "sophie.lambert@formatrice.example" });
    const trace = (await lireDossier(b.s, sophie, dossierId)).journal.find((e) => e.type === "transition" && e.libelle.includes("financement déposée"));
    expect(trace).toMatchObject({ acteur_role: "apprenant", acteur_id: anne.utilisateur_id });
    // Une seule fois : la déclaration ne se rejoue pas.
    await expect(executerAction(b.s, anne, dossierId, "declarer_depot")).rejects.toMatchObject({ code: "invalide" });
  });
});

describe("Accord de financement — section produite automatiquement, pièce déposable par tous", () => {
  it("la section « Accord de financement » apparaît d'elle-même après la déclaration", async () => {
    expect((await sections(anne)).accord).toMatchObject({ etat: "a_faire", pieces: ["ACC"] });
  });

  it("« l'apprenant a la possibilité de charger la pièce » : l'accord déclenche l'ODM et ouvre le coffre", async () => {
    await deposerPieceExterne(b.s, anne, dossierId, "ACC", fichier("accord-opco.pdf"));
    const d = await lireDossier(b.s, sophie, dossierId);
    expect(d.sous_statut).toBe("accord_financement");
    expect(d.coffre_ouvert).toBe(true);
    expect((await sections(anne)).accord!.etat).toBe("termine");
    expect((await b.courriers()).map((c) => c.type)).toContain("odm");
  });

  it("« le formateur comme l'organisme peuvent également charger la pièce » (règle vérifiée pour chaque rôle)", async () => {
    const { peutValider } = await import("@/domaine/pieces/statut");
    for (const role of ["apprenant", "formateur", "admin"] as const) expect(peutValider("ACC", role), role).toBe(true);
  });
});

describe("« Sur le reste, tout doit être produit de manière très exacte »", () => {
  it("une pièce contractuelle rendue deux fois est identique à l'octet près (aucun aléa, aucune IA)", async () => {
    const convention = await piece(sophie, "02-AVT");
    const premier = await apercuPiece(b.s, sophie, convention.id);
    const second = await apercuPiece(b.s, sophie, convention.id);
    expect(premier).toBe(second);
    expect(premier).toContain("980,00 €"); // 1 stagiaire × 980 € HT : montant calculé, jamais rédigé
    expect(ia.demandes.join("\n")).not.toContain("Menuiserie Dupont"); // l'IA n'a jamais vu le dossier
  });
});
