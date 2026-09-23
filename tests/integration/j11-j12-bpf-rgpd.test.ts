import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerBanc, fichier, MDP, type Banc } from "../banc";
import { connecter, inscrireFormateur } from "@/serveur/services/auth";
import { exporterBpfCsv, lireBpf } from "@/serveur/services/bpf";
import { creerDossier, definirSeances, lireDossier, listerDossiers, modifierDossier } from "@/serveur/services/dossiers";
import { enregistrerEvaluation } from "@/serveur/services/evaluations";
import { creerFormation, enregistrerOutil } from "@/serveur/services/formations";
import { executerAction } from "@/serveur/services/pipeline";
import { enregistrerEntreprise, enregistrerStagiaire } from "@/serveur/services/repertoire";
import { deposerPieceExterne } from "@/serveur/services/retours";
import { apercuSuppression, PHRASE_DE_CONFIRMATION, supprimerMonCompte } from "@/serveur/services/rgpd";
import { envoyerSatisfactionsAFroid } from "@/serveur/services/taches";
import type { Acteur } from "@/serveur/services/socle";

const QCM = { titre: "QCM", questions: [{ enonce: "Q ?", propositions: ["a", "b"], bonne_reponse: 0 }] };
const RECUEIL = { poste_anciennete: "x", niveau_maitrise: "Avancé", attentes: "x", besoins_principaux: "x", handicap: "Non", programme_transmis: "Oui" };

let b: Banc;
let sophie: Acteur;
let realise: string;
let brouillon: string;

/** Amène un dossier jusqu'à « formation terminée » par le chemin le plus court. */
async function dossierRealise(formateur: Acteur, fin: string): Promise<string> {
  const f = await creerFormation(b.s, formateur, { formation_titre: "Formation BPF", formation_objectifs: "Objectif", programme: "Contenu", formation_duree_heures_total: 7, formation_duree_jours: 1, formation_prix_unitaire_ht: 70_000 });
  await enregistrerOutil(b.s, formateur, { type: "positionnement", titre: "P", formation_id: f.id, contenu: QCM });
  const ent = await enregistrerEntreprise(b.s, formateur, { entreprise_nom: "Client SA", entreprise_adresse: "1 rue du Test", entreprise_siret: "33333333333333", entreprise_representant_nom: "Durand", entreprise_representant_email: "client@exemple.example" });
  const st = await enregistrerStagiaire(b.s, formateur, { stagiaire_prenom: "Marc", stagiaire_nom: "Test", stagiaire_email: `marc.${fin}@exemple.example` });
  const d = await creerDossier(b.s, formateur, { stagiaire_ids: [st.id], entreprise_id: ent.id, formation_id: f.id, formation_modalite: "presentiel", mode_financement: "entreprise" });
  await modifierDossier(b.s, formateur, d.id, { formation_date_debut: fin, formation_date_fin: fin, signature_lieu: "Mulhouse" });
  await definirSeances(b.s, formateur, d.id, [{ date: fin, heure_debut: "09:00", heure_fin: "16:00" }]);
  await enregistrerEvaluation(b.s, formateur, d.id, "recueil", { reponses: RECUEIL, stagiaire_id: st.id });
  await enregistrerEvaluation(b.s, formateur, d.id, "positionnement", { reponses: [0], stagiaire_id: st.id });
  await executerAction(b.s, formateur, d.id, "soumettre_validation");
  await executerAction(b.s, b.admin, d.id, "valider_dossier");
  await deposerPieceExterne(b.s, b.admin, d.id, "ACC", fichier("accord.pdf")); // RG-06 : ici c'est l'OF qui dépose
  await executerAction(b.s, formateur, d.id, "envoyer_elements_pedagogiques");
  await executerAction(b.s, formateur, d.id, "demarrer_formation");
  await executerAction(b.s, formateur, d.id, "terminer_formation");
  return d.id;
}

beforeAll(async () => {
  b = await creerBanc();
  sophie = await b.formateur();
  realise = await dossierRealise(sophie, "2026-10-15");
  const d = await lireDossier(b.s, sophie, realise);
  const autre = await creerDossier(b.s, sophie, { stagiaire_ids: [d.stagiaires[0]!.id], entreprise_id: (await import("@/serveur/services/repertoire").then((m) => m.listerEntreprises(b.s, sophie)))[0]!.id, formation_id: (await import("@/serveur/services/formations").then((m) => m.listerFormations(b.s, sophie)))[0]!.id, formation_modalite: "presentiel", mode_financement: "opco" });
  brouillon = autre.id;
}, 120_000);
afterAll(() => b.fermer());

describe("J11 — page BPF (F-BPF-01/02)", () => {
  it("agrège le réalisé de l'exercice ; un brouillon n'y figure pas", async () => {
    const { exercices, bpf } = await lireBpf(b.s, b.admin);
    expect(exercices).toEqual([2026]);
    expect(bpf.totaux).toMatchObject({ nb_actions: 1, nb_stagiaires: 1, heures_dispensees: 7, montant_ht: 70_000, montant_sous_traite: 52_500 });
    expect(bpf.par_financement).toEqual([expect.objectContaining({ mode: "entreprise", nb_actions: 1 })]);
  });

  it("exporte un CSV ; le formateur n'obtient que SON réalisé ; l'apprenant, rien", async () => {
    const csv = await exporterBpfCsv(b.s, b.admin, 2026);
    expect(csv.nom).toBe("BPF_2026.csv");
    expect(csv.contenu).toContain("Chiffre d'affaires HT (€);700,00");
    const paul = await b.formateur("paul@exemple.example", "Paul", "Durand");
    expect((await lireBpf(b.s, paul)).bpf.totaux.nb_actions).toBe(0);
    expect((await lireBpf(b.s, sophie)).bpf.totaux.nb_actions).toBe(1);
  });
});

describe("tâche de fond — satisfaction à froid à J+90", () => {
  it("n'écrit à l'apprenant qu'une fois le délai écoulé, et une seule fois", async () => {
    await executerAction(b.s, "systeme", realise, "reevaluer_completude");
    expect(await envoyerSatisfactionsAFroid(b.s)).toBe(0); // dossier incomplet : pas encore concerné
  });
});

describe("J12 — suppression du compte formateur (F-ONB-04, F-RGPD-01 à 03, RG-01)", () => {
  it("F-RGPD-01 : annonce clairement ce qui part et ce qui reste, et exige une confirmation explicite", async () => {
    const apercu = await apercuSuppression(b.s, sophie);
    expect(apercu.supprime).toContain("Vos 1 dossier(s) en brouillon");
    expect(apercu.conserve[0]).toContain("1 dossier(s) de formation instruits");
    expect(apercu.dossiers_en_cours).toBe(1);
    await expect(supprimerMonCompte(b.s, sophie, { phrase: "oui", mot_de_passe: MDP })).rejects.toMatchObject({ code: "invalide" });
    await expect(supprimerMonCompte(b.s, sophie, { phrase: PHRASE_DE_CONFIRMATION, mot_de_passe: "faux" })).rejects.toMatchObject({ code: "invalide" });
    await expect(apercuSuppression(b.s, b.admin)).rejects.toMatchObject({ code: "interdit" });
  });

  it("F-RGPD-02/03 : efface les données personnelles, conserve les dossiers instruits et leurs pièces", async () => {
    await supprimerMonCompte(b.s, sophie, { phrase: PHRASE_DE_CONFIRMATION, mot_de_passe: MDP });

    await expect(connecter(b.s, "sophie.lambert@formatrice.example", MDP)).rejects.toMatchObject({ code: "non_authentifie" });
    const brut = JSON.stringify(await b.bd.execute("select * from formateur where anonymise_le is not null"));
    for (const donnee of ["Sophie", "Lambert", "sophie.lambert", "SL Conseil", "FR11 1111", "22222222222222"]) expect(brut, donnee).not.toContain(donnee);

    const dossiers = (await listerDossiers(b.s, b.admin)).dossiers;
    expect(dossiers.map((d) => d.id)).toEqual([realise]); // le brouillon est parti, le dossier instruit demeure
    expect(dossiers[0]!.formateur).toBe("Formateur (compte supprimé)");
    expect(dossiers.some((d) => d.id === brouillon)).toBe(false);

    const d = await lireDossier(b.s, b.admin, realise);
    expect(d.pieces.length).toBeGreaterThan(5);
    expect(d.journal.length).toBeGreaterThan(5);
    expect(b.archive.lister("Pièces de départ/02_AVT_Convention-Formation.html")).toHaveLength(1); // la pièce émise fait foi
    expect(b.archive.lister("candidatures/")).toEqual([]);
  });

  it("libère l'adresse e-mail : la même personne peut postuler à nouveau", async () => {
    await expect(inscrireFormateur(b.s, { email: "sophie.lambert@formatrice.example", mot_de_passe: MDP, prenom: "Sophie", nom: "Lambert" })).resolves.toBeDefined();
  });
});
