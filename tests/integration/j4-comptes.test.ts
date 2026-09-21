import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerBanc, fichier, MDP, type Banc } from "../banc";
import { accepterInvitation, acteurDepuisJeton, changerMotDePasse, connecter, creerInvitation, deconnecter, DUREE_SESSION_MS, inscrireFormateur, lireInvitation } from "@/serveur/services/auth";
import { deciderCandidature, deposerPieceFormateur, lireMaCandidature, listerCandidatures, mettreAJourMonProfil, soumettreCandidature, telechargerPieceFormateur } from "@/serveur/services/candidatures";
import { creerOrganisme, creerUtilisateur } from "@/serveur/bd/amorce";

let b: Banc;
beforeAll(async () => {
  b = await creerBanc();
});
afterAll(() => b.fermer());

describe("J4 — comptes et sessions", () => {
  it("inscrit un formateur, refuse un doublon (insensible à la casse) et un mot de passe faible", async () => {
    await inscrireFormateur(b.s, { email: "Paul.Durand@exemple.example", mot_de_passe: MDP, prenom: "Paul", nom: "Durand" });
    await expect(inscrireFormateur(b.s, { email: "paul.durand@EXEMPLE.example", mot_de_passe: MDP, prenom: "P", nom: "D" })).rejects.toMatchObject({ code: "conflit" });
    await expect(inscrireFormateur(b.s, { email: "autre@exemple.example", mot_de_passe: "court", prenom: "A", nom: "B" })).rejects.toMatchObject({ code: "invalide" });
    await expect(inscrireFormateur(b.s, { email: "pas-un-email", mot_de_passe: MDP, prenom: "A", nom: "B" })).rejects.toMatchObject({ code: "invalide" });
  });

  it("ouvre une session, la reconnaît, puis l'oublie à la déconnexion et à l'expiration", async () => {
    const { jeton } = await connecter(b.s, "paul.durand@exemple.example", MDP);
    const acteur = await acteurDepuisJeton(b.s, jeton);
    expect(acteur).toMatchObject({ role: "formateur", formateur_valide: false, nom: "Paul Durand" });
    await deconnecter(b.s, jeton);
    expect(await acteurDepuisJeton(b.s, jeton)).toBeNull();

    const autre = await connecter(b.s, "paul.durand@exemple.example", MDP);
    b.horloge.avancer(DUREE_SESSION_MS + 1000);
    expect(await acteurDepuisJeton(b.s, autre.jeton)).toBeNull();
    expect(await acteurDepuisJeton(b.s, "jeton-invente")).toBeNull();
  });

  it("ne stocke ni mot de passe ni jeton en clair", async () => {
    const { jeton } = await connecter(b.s, "paul.durand@exemple.example", MDP);
    const brut = JSON.stringify(await b.bd.execute("select * from utilisateur, session_utilisateur"));
    expect(brut).not.toContain(MDP);
    expect(brut).not.toContain(jeton);
    expect(brut).toContain("scrypt$");
  });

  it("répond de la même façon pour un compte inconnu et un mauvais mot de passe, puis bloque la force brute", async () => {
    const e1 = await connecter(b.s, "inconnu@exemple.example", MDP).catch((e) => e);
    const e2 = await connecter(b.s, "paul.durand@exemple.example", "mauvais-mot-de-passe").catch((e) => e);
    expect(e1.message).toBe(e2.message);
    for (let i = 0; i < 4; i++) await connecter(b.s, "paul.durand@exemple.example", "mauvais").catch(() => undefined);
    await expect(connecter(b.s, "paul.durand@exemple.example", MDP)).rejects.toMatchObject({ code: "interdit" });
    b.horloge.avancer(16 * 60 * 1000);
    await expect(connecter(b.s, "paul.durand@exemple.example", MDP)).resolves.toBeDefined();
  });

  it("gère l'invitation à usage unique d'un apprenant", async () => {
    const id = await creerUtilisateur(b.s, { of_id: b.of_id, email: "anne@exemple.example", mot_de_passe: MDP, role: "apprenant", prenom: "Anne", nom: "Martin" });
    const lien = await creerInvitation(b.s, id);
    const jeton = lien.split("/").pop()!;
    expect(await lireInvitation(b.s, jeton)).toMatchObject({ email: "anne@exemple.example", prenom: "Anne" });
    const session = await accepterInvitation(b.s, jeton, "nouveau-mot-de-passe");
    expect(await acteurDepuisJeton(b.s, session.jeton)).toMatchObject({ role: "apprenant" });
    await expect(accepterInvitation(b.s, jeton, "encore-un-autre-mdp")).rejects.toMatchObject({ code: "introuvable" });
    await expect(connecter(b.s, "anne@exemple.example", "nouveau-mot-de-passe")).resolves.toBeDefined();
  });

  it("ferme toutes les sessions quand le mot de passe change", async () => {
    const { jeton } = await connecter(b.s, "anne@exemple.example", "nouveau-mot-de-passe");
    const acteur = (await acteurDepuisJeton(b.s, jeton))!;
    await expect(changerMotDePasse(b.s, acteur, "faux", "peu-importe-ici")).rejects.toMatchObject({ code: "invalide" });
    await changerMotDePasse(b.s, acteur, "nouveau-mot-de-passe", "troisieme-mot-de-passe");
    expect(await acteurDepuisJeton(b.s, jeton)).toBeNull();
  });
});

describe("J4 — postulation du formateur (F-ONB-01 à 03)", () => {
  it("refuse une candidature incomplète en listant ce qui manque", async () => {
    const { jeton } = await connecter(b.s, "paul.durand@exemple.example", MDP);
    const paul = (await acteurDepuisJeton(b.s, jeton))!;
    await expect(soumettreCandidature(b.s, paul)).rejects.toMatchObject({
      code: "invalide",
      details: { manques: ["Téléphone", "Parcours professionnel", "Curriculum vitæ", "Pièce d'identité", "Diplômes et titres"] },
    });
  });

  it("accepte la candidature complète, prévient l'admin, puis informe le candidat de la décision", async () => {
    const { jeton } = await connecter(b.s, "paul.durand@exemple.example", MDP);
    let paul = (await acteurDepuisJeton(b.s, jeton))!;
    await mettreAJourMonProfil(b.s, paul, { formateur_telephone: "06 00 00 00 01", parcours: "Formateur bureautique depuis 2015.", formateur_entreprise_nom: "PD Formation EI" });
    await deposerPieceFormateur(b.s, paul, "cv", fichier("cv.pdf"));
    await deposerPieceFormateur(b.s, paul, "identite", fichier("identite.png"));
    await deposerPieceFormateur(b.s, paul, "diplome", fichier("diplome.pdf"));
    await expect(deposerPieceFormateur(b.s, paul, "cv", fichier("virus.exe"))).rejects.toMatchObject({ code: "invalide" });

    await soumettreCandidature(b.s, paul);
    await expect(soumettreCandidature(b.s, paul)).rejects.toMatchObject({ code: "conflit" });
    expect((await b.courriers()).at(-1)).toMatchObject({ type: "candidature_soumise", destinataire: "admin@organisme-demo.example" });

    const liste = await listerCandidatures(b.s, b.admin);
    const candidature = liste.find((f) => f.formateur_email === "paul.durand@exemple.example")!;
    await expect(deciderCandidature(b.s, b.admin, candidature.id, { validee: false })).rejects.toMatchObject({ code: "invalide" });
    await deciderCandidature(b.s, b.admin, candidature.id, { validee: true });

    expect((await b.courriers()).at(-1)).toMatchObject({ type: "candidature_decision", destinataire: "paul.durand@exemple.example", sujet: "Votre candidature est validée" });
    paul = (await acteurDepuisJeton(b.s, jeton))!;
    expect(paul.formateur_valide).toBe(true);
    expect((await lireMaCandidature(b.s, paul)).pieces).toHaveLength(3);
  });

  it("réserve la décision à l'admin et cloisonne les pièces justificatives", async () => {
    const sophie = await b.formateur();
    await expect(listerCandidatures(b.s, sophie)).rejects.toMatchObject({ code: "interdit" });
    const { jeton } = await connecter(b.s, "paul.durand@exemple.example", MDP);
    const paul = (await acteurDepuisJeton(b.s, jeton))!;
    const piece = (await lireMaCandidature(b.s, paul)).pieces[0]!;
    await expect(telechargerPieceFormateur(b.s, sophie, piece.id)).rejects.toMatchObject({ code: "interdit" });
    expect((await telechargerPieceFormateur(b.s, b.admin, piece.id)).nom).toBe("cv.pdf");

    // L'admin d'un AUTRE organisme ne voit rien : étanchéité entre organismes.
    const autreOf = await creerOrganisme(b.s, { id: "of-autre", of_nom: "AUTRE ORGANISME" });
    const autreAdmin = await b.acteur(await creerUtilisateur(b.s, { of_id: autreOf, email: "admin@autre.example", mot_de_passe: MDP, role: "admin", prenom: "X", nom: "Y" }));
    expect(await listerCandidatures(b.s, autreAdmin)).toEqual([]);
    await expect(telechargerPieceFormateur(b.s, autreAdmin, piece.id)).rejects.toMatchObject({ code: "introuvable" });
  });
});
