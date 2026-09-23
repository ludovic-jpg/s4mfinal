/**
 * Recette automatisée de la VERSION 7 (décisions du porteur de projet, 23/09/2026) :
 *  1. adaptateur IA Anthropic robuste (en-têtes, recherche web, reprise « pause_turn », nouvelles tentatives, erreurs lisibles) ;
 *  2. réglages en base — clé IA et mot de passe SMTP chiffrés, jamais renvoyés à l'interface ;
 *  3. dossier d'enjeux constitué par recherche web AVANT toute production pédagogique ;
 *  4. formulaires de l'apprenant en page interactive : envoi automatique, brouillon, signature, relance, à froid ;
 *  5. courrier : échec d'envoi tracé avec une cause actionnable ;
 *  6. plus de coût horaire saisi : la rémunération du formateur se calcule par la commission.
 * Aucun réseau : IA factice ou faux `fetch`, PGlite en mémoire, archive en mémoire, horloge fixe.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creerBanc, fichier, iaFactice, MDP, type Banc } from "../banc";
import type { DossierEnjeux } from "@/domaine/pedagogie/enjeux";
import { evenement, formulaireApprenant, reglage } from "@/serveur/bd/schema";
import { CourrierJournalise, expliquerErreurSmtp, type Expedition } from "@/serveur/ports/courrier";
import { IaAnthropic, OUTIL_RECHERCHE_WEB } from "@/serveur/ports/ia";
import { accepterInvitation, acteurDepuisJeton } from "@/serveur/services/auth";
import { creerDossier, definirSeances, inviter, lireDossier, modifierDossier } from "@/serveur/services/dossiers";
import { enregistrerEvaluation } from "@/serveur/services/evaluations";
import { creerFormation, enregistrerOutil, lireFormation, modifierFormation } from "@/serveur/services/formations";
import {
  DELAI_FROID_JOURS,
  DUREE_LIEN_FORMULAIRE_MS,
  enregistrerBrouillonPublic,
  envoyerFormulaire,
  envoyerFormulairesProgrammes,
  envoyerSatisfactionsAFroid,
  etatFormulaires,
  lireFormulairePublic,
  listerFormulaires,
  signerFormulairePublic,
  telechargerInvitation,
  telechargerPdfPublic,
} from "@/serveur/services/formulaires-apprenant";
import { analyserEnjeux, etatIa, proposerParcours, proposerProgramme } from "@/serveur/services/pedagogie-ia";
import { executerAction } from "@/serveur/services/pipeline";
import { configIa, configSmtp, enregistrerReglages, envoyerCourrielDeTest, lireReglages, vueReglages } from "@/serveur/services/reglages";
import { enregistrerEntreprise, enregistrerStagiaire } from "@/serveur/services/repertoire";
import { deposerPieceExterne, deposerRetour, emarger, signerPiece } from "@/serveur/services/retours";
import { ErreurMetier, type Acteur } from "@/serveur/services/socle";

const JOUR_MS = 24 * 3600 * 1000;
const TRACE = `data:image/png;base64,${"iVBORw0KGgo".repeat(80)}`;
const SIGNATURE = { trace_png: TRACE, lieu: "Mulhouse", consentement: true };
const RECUEIL = { poste_anciennete: "Assistante, 4 ans", niveau_maitrise: "Notions de base", attentes: "Gagner du temps", besoins_principaux: "Les TCD", handicap: "Non", programme_transmis: "Oui" };
const NOTES = Object.fromEntries(["contenu", "attentes", "adaptation", "programme", "application", "pedagogie", "competences", "supports", "environnement", "globale"].map((k) => [k, "5"]));
const NOTES_FROID = Object.fromEntries(["pratique", "effets", "mobilisation", "accompagnement", "recommandation"].map((k) => [k, "4"]));
const QCM = {
  titre: "Positionnement Excel",
  questions: [
    { enonce: "Que fait RECHERCHEV ?", propositions: ["Une recherche verticale", "Un tri"], bonne_reponse: 0 },
    { enonce: "Un TCD sert à…", propositions: ["Mettre en page", "Synthétiser des données"], bonne_reponse: 1 },
  ],
};
const ENJEUX = {
  resume: "Les tableaux croisés dynamiques sont l'outil de synthèse central d'Excel ; leur maîtrise conditionne la fiabilité du reporting mensuel.",
  enjeux: ["Fiabiliser le reporting mensuel", "Gagner du temps sur les tableaux de bord"],
  cadre: ["Aucune obligation réglementaire ; bonnes pratiques éditeur"],
  notions_cles: ["Tableau croisé dynamique", "Segments et chronologies", "Power Query"],
  erreurs_frequentes: ["Confondre champs de valeurs et étiquettes de lignes"],
  pratiques_actuelles: ["Power Query pour l'import et le nettoyage"],
  public_vise: "Assistants de gestion et comptables.",
  prerequis: "Formules simples et mise en forme.",
  glossaire: [{ terme: "TCD", definition: "Tableau croisé dynamique" }],
  sources: [{ titre: "Support Microsoft — TCD", url: "https://support.microsoft.com/fr-fr/excel" }],
};
const moduleIa = (i: number) => ({ titre: `Module ${i}`, objectifs: [`Objectif ${i}`], contenus: ["Contenu"], methodes: "Apports", mise_en_pratique: "Atelier", evaluation: "Quiz", duree_heures: 99 });
const PARCOURS = { objectifs: ["Construire un TCD", "Automatiser un reporting", "Contrôler ses données"], public_vise: "Assistants de gestion.", prerequis: "Bases d'Excel.", modules: [moduleIa(1), moduleIa(2)] };

// ————————————————————————————————————————————————————————————————————————————————
// 1. Adaptateur IA Anthropic, avec un faux `fetch` (aucun réseau ; attente entre tentatives = 1 ms)
// ————————————————————————————————————————————————————————————————————————————————

function fauxFetch(reponses: Array<Response | Error>) {
  const appels: Array<{ url: string; entetes: Record<string, string>; corps: Record<string, unknown> }> = [];
  const appel = (async (url: string | URL | Request, init?: RequestInit) => {
    appels.push({ url: String(url), entetes: init?.headers as Record<string, string>, corps: JSON.parse(String(init?.body)) as Record<string, unknown> });
    const r = reponses.shift();
    if (!r) throw new Error("Aucune réponse prévue.");
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
  return { appel, appels };
}
const reponse = (status: number, corps: unknown, entetes: Record<string, string> = {}) => new Response(JSON.stringify(corps), { status, headers: { "content-type": "application/json", ...entetes } });
const succes = (content: unknown[], extra: Record<string, unknown> = {}) => reponse(200, { content, stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 20 }, ...extra });
const ia = (reponses: Array<Response | Error>, config: Partial<ConstructorParameters<typeof IaAnthropic>[0]> = {}) => {
  const f = fauxFetch(reponses);
  return { ...f, ia: new IaAnthropic({ cle: "sk-ant-test", modele: "claude-sonnet-5", ...config }, f.appel, 5_000, 1) };
};

describe("1. Adaptateur IA Anthropic — « IA robuste et réglable »", () => {
  it("envoie la clé, la version d'API et l'identifiant de workspace ; la consigne système est mise en cache", async () => {
    const { ia: a, appels } = ia([succes([{ type: "text", text: '{"ok":true}' }])], { workspace: "wrkspc_demo" });
    const r = await a.rediger("Consigne système", "Demande");
    expect(r.texte).toBe('{"ok":true}');
    expect(appels).toHaveLength(1);
    expect(appels[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(appels[0]!.entetes).toMatchObject({ "x-api-key": "sk-ant-test", "anthropic-version": "2023-06-01", "anthropic-workspace-id": "wrkspc_demo" });
    expect(appels[0]!.corps).toMatchObject({ model: "claude-sonnet-5", system: [{ type: "text", text: "Consigne système", cache_control: { type: "ephemeral" } }], messages: [{ role: "user", content: "Demande" }] });
    expect(r.usage).toMatchObject({ tokens_entree: 10, tokens_sortie: 20, recherches_web: 0, modele: "claude-sonnet-5", tentatives: 1 });
    expect(a.description).toBe("claude-sonnet-5");
  });

  it("sans workspace, l'en-tête n'est pas envoyé", async () => {
    const { ia: a, appels } = ia([succes([{ type: "text", text: "x" }])]);
    await a.rediger("s", "d");
    expect(appels[0]!.entetes).not.toHaveProperty("anthropic-workspace-id");
  });

  it("l'outil de recherche web n'est joint que si la configuration l'active ET que la demande le permet", async () => {
    const avec = ia([succes([{ type: "text", text: "x" }]), succes([{ type: "text", text: "x" }])], { rechercheWeb: true });
    await avec.ia.rediger("s", "d", { recherche: true, maxRecherches: 4 });
    expect(avec.appels[0]!.corps.tools).toEqual([{ type: OUTIL_RECHERCHE_WEB, name: "web_search", max_uses: 4, user_location: { type: "approximate", country: "FR", timezone: "Europe/Paris" } }]);
    expect(avec.ia.description).toBe("claude-sonnet-5 + recherche web");
    await avec.ia.rediger("s", "d"); // demande sans recherche : pas d'outil
    expect(avec.appels[1]!.corps).not.toHaveProperty("tools");

    const sans = ia([succes([{ type: "text", text: "x" }])], { rechercheWeb: false });
    await sans.ia.rediger("s", "d", { recherche: true });
    expect(sans.appels[0]!.corps).not.toHaveProperty("tools");
  });

  it("reprend une réponse mise en pause (« pause_turn ») : deux appels, la conversation est renvoyée telle quelle", async () => {
    const premier = [{ type: "server_tool_use", id: "t1", name: "web_search", input: { query: "TCD Excel" } }];
    const { ia: a, appels } = ia([
      reponse(200, { content: premier, stop_reason: "pause_turn", usage: { input_tokens: 5, output_tokens: 5, server_tool_use: { web_search_requests: 2 } } }),
      succes([{ type: "text", text: "Réponse finale" }]),
    ], { rechercheWeb: true });
    const r = await a.rediger("s", "d", { recherche: true });
    expect(appels).toHaveLength(2);
    expect(appels[1]!.corps.messages).toEqual([{ role: "user", content: "d" }, { role: "assistant", content: premier }]);
    expect(r.texte).toBe("Réponse finale");
    expect(r.usage).toMatchObject({ tokens_entree: 15, tokens_sortie: 25, recherches_web: 2, tentatives: 2 });
  });

  it("réessaie après une erreur passagère (529 surchargé, puis réseau), et réussit", async () => {
    const { ia: a, appels } = ia([reponse(529, { error: { type: "overloaded_error", message: "Overloaded" } }), new Error("ECONNRESET"), succes([{ type: "text", text: "ok" }])]);
    const r = await a.rediger("s", "d");
    expect(appels).toHaveLength(3);
    expect(r.usage.tentatives).toBe(3);
  });

  it("abandonne après trois tentatives, avec un message lisible (limite de débit, réseau)", async () => {
    const sature = ia([reponse(429, {}, { "retry-after": "0" }), reponse(429, {}), reponse(429, {})]);
    await expect(sature.ia.rediger("s", "d")).rejects.toThrow(/saturé/);
    expect(sature.appels).toHaveLength(3);
    const reseau = ia([new Error("boom"), new Error("boom"), new Error("boom")]);
    await expect(reseau.ia.rediger("s", "d")).rejects.toThrow(/réseau/);
  });

  it("401 → clé refusée ; 400 « workspace » et « model » → conseil précis ; jamais le message brut de l'API", async () => {
    await expect(ia([reponse(401, { error: { type: "authentication_error", message: "invalid x-api-key" } })]).ia.rediger("s", "d")).rejects.toThrow(/Clé d'API IA refusée : vérifiez la clé/);
    await expect(ia([reponse(400, { error: { type: "invalid_request_error", message: "This API key must specify a workspace id 42" } })]).ia.rediger("s", "d")).rejects.toThrow(/identifiant du workspace/);
    await expect(ia([reponse(400, { error: { type: "not_found_error", message: "model: claude-sonnet-5 not found" } })]).ia.rediger("s", "d")).rejects.toThrow(/Modèle IA inconnu \(« claude-sonnet-5 »\)/);
    const autre = ia([reponse(400, { error: { type: "invalid_request_error", message: "secret interne 12345" } })]);
    await expect(autre.ia.rediger("s", "d")).rejects.toThrow(/Requête refusée par l'assistant IA \(invalid_request_error\)/);
    await expect(autre.ia.rediger("s", "d")).rejects.not.toThrow(/12345/);
    await expect(ia([reponse(403, {})]).ia.rediger("s", "d")).rejects.toThrow(/workspace ou les droits/);
    await expect(ia([succes([{ type: "text", text: "   " }])]).ia.rediger("s", "d")).rejects.toThrow(/réponse vide/);
  });

  it("extrait les sources des citations et des résultats de recherche, dédoublonnées", async () => {
    const { ia: a } = ia([
      succes([
        { type: "web_search_tool_result", tool_use_id: "t1", content: [{ url: "https://www.cnil.fr/a", title: "CNIL" }, { url: "https://support.microsoft.com/b", title: "Microsoft" }] },
        { type: "text", text: "Partie 1 ", citations: [{ url: "https://www.cnil.fr/a", title: "CNIL (citation)" }] },
        { type: "text", text: "partie 2", citations: [{ url: "https://legifrance.gouv.fr/c", title: "Légifrance" }, { url: "https://sans-titre.example" }] },
      ]),
    ]);
    const r = await a.rediger("s", "d");
    expect(r.texte).toBe("Partie 1 partie 2");
    // Ordre d'apparition, premier titre rencontré conservé, une entrée par adresse.
    expect(r.sources).toEqual([
      { url: "https://www.cnil.fr/a", titre: "CNIL" },
      { url: "https://support.microsoft.com/b", titre: "Microsoft" },
      { url: "https://legifrance.gouv.fr/c", titre: "Légifrance" },
      { url: "https://sans-titre.example", titre: "https://sans-titre.example" },
    ]);
  });
});

// ————————————————————————————————————————————————————————————————————————————————
// 2. Réglages en base (IA, SMTP) et 5. courrier
// ————————————————————————————————————————————————————————————————————————————————

describe("2. Réglages de l'organisme — secrets chiffrés, jamais renvoyés", () => {
  let b: Banc;
  let sophie: Acteur;
  beforeAll(async () => {
    b = await creerBanc();
    sophie = await b.formateur();
  }, 60_000);
  afterAll(() => b.fermer());

  it("enregistre une clé IA et un mot de passe SMTP : en base, chiffrés (« v1: ») ; dans la vue, seulement « défini »", async () => {
    const vue = await enregistrerReglages(b.s, b.admin, { ia_cle: "sk-ant-secret-123", ia_modele: "claude-sonnet-5", smtp_hote: "smtp.gmail.com", smtp_port: "465", smtp_securise: "oui", smtp_utilisateur: "of@gmail.com", smtp_mot_de_passe: "mdp-application", courrier_expediteur: "of@gmail.com" });
    expect(vue).toMatchObject({ ia_cle_definie: true, smtp_mot_de_passe_defini: true, smtp_hote: "smtp.gmail.com", ia_defaut_serveur: false });
    expect(vue).not.toHaveProperty("ia_cle");
    expect(vue).not.toHaveProperty("smtp_mot_de_passe");
    expect(JSON.stringify(vue)).not.toMatch(/sk-ant-secret|mdp-application/);

    const lignes = await b.bd.select().from(reglage).where(eq(reglage.of_id, b.of_id));
    const cle = lignes.find((l) => l.cle === "ia_cle")!;
    const mdp = lignes.find((l) => l.cle === "smtp_mot_de_passe")!;
    expect(cle.secret).toBe(true);
    expect(cle.valeur.startsWith("v1:")).toBe(true);
    expect(mdp.valeur.startsWith("v1:")).toBe(true);
    expect(JSON.stringify(lignes)).not.toMatch(/sk-ant-secret|mdp-application/);
    expect(lignes.find((l) => l.cle === "smtp_hote")).toMatchObject({ secret: false, valeur: "smtp.gmail.com" });
  });

  it("lireReglages (serveur seulement) déchiffre ; configIa reprend la clé des réglages", async () => {
    const r = await lireReglages(b.s, b.of_id);
    expect(r.ia_cle).toBe("sk-ant-secret-123");
    expect(r.smtp_mot_de_passe).toBe("mdp-application");
    expect(await configIa(b.s, b.of_id)).toEqual({ cle: "sk-ant-secret-123", modele: "claude-sonnet-5", workspace: "", rechercheWeb: true });
  });

  it("un secret vide envoyé = inchangé ; « - » = effacé", async () => {
    await enregistrerReglages(b.s, b.admin, { ia_cle: "", smtp_mot_de_passe: "" });
    expect((await lireReglages(b.s, b.of_id)).ia_cle).toBe("sk-ant-secret-123");
    const vue = await enregistrerReglages(b.s, b.admin, { smtp_mot_de_passe: "-" });
    expect(vue.smtp_mot_de_passe_defini).toBe(false);
    expect(vue.ia_cle_definie).toBe(true);
    expect((await lireReglages(b.s, b.of_id)).smtp_mot_de_passe).toBe("");
    expect((await b.bd.select().from(evenement)).some((e) => e.type === "reglages_modifies")).toBe(true);
  });

  it("configSmtp est null tant que courrier_actif ≠ oui ; les réglages sont réservés à l'administrateur", async () => {
    expect(await configSmtp(b.s, b.of_id)).toBeNull();
    await enregistrerReglages(b.s, b.admin, { courrier_actif: "oui", smtp_mot_de_passe: "mdp-2" });
    expect(await configSmtp(b.s, b.of_id)).toEqual({ hote: "smtp.gmail.com", port: 465, securise: true, utilisateur: "of@gmail.com", mot_de_passe: "mdp-2", expediteur: "of@gmail.com" });
    await enregistrerReglages(b.s, b.admin, { courrier_actif: "non" });
    await expect(vueReglages(b.s, sophie)).rejects.toMatchObject({ code: "interdit" });
    await expect(enregistrerReglages(b.s, sophie, { ia_cle: "x" })).rejects.toMatchObject({ code: "interdit" });
    await expect(enregistrerReglages(b.s, b.admin, { smtp_port: "abc" })).rejects.toThrow();
  });

  it("l'assistant pédagogique suit les réglages : clé enregistrée → disponible ; IA désactivée → indisponible ; effacée → repli sur le serveur", async () => {
    expect(await etatIa(b.s, sophie)).toEqual({ disponible: true, description: "claude-sonnet-5 + recherche web" });
    await enregistrerReglages(b.s, b.admin, { ia_active: "non" });
    expect((await etatIa(b.s, sophie)).disponible).toBe(false);
    await enregistrerReglages(b.s, b.admin, { ia_active: "oui", ia_cle: "-" });
    expect((await vueReglages(b.s, b.admin)).ia_cle_definie).toBe(false);
    // Sans réglages ni IA du serveur : indisponible, avec la marche à suivre.
    expect(await etatIa(b.s, sophie)).toEqual({ disponible: false, description: "" });
    await expect(proposerProgramme(b.s, sophie, { formation_titre: "Test IA" })).rejects.toMatchObject({ code: "conflit", message: expect.stringContaining("Organisme → Assistant IA") });
    expect(await etatIa(b.s, b.admin)).toEqual({ disponible: false, description: "" }); // l'IA est réservée au formateur
    // Avec l'IA du serveur (`.env`) : disponible.
    b.s.ia = iaFactice([]);
    expect(await etatIa(b.s, sophie)).toEqual({ disponible: true, description: "factice" });
    delete b.s.ia;
  });

  it("5. courrier : l'e-mail de test est journalisé ; une configuration illisible ou un refus SMTP donnent un échec tracé et expliqué", async () => {
    expect(await envoyerCourrielDeTest(b.s, b.admin)).toMatchObject({ statut: "journalise", erreur: "", actif: false, destinataire: "admin@organisme-demo.example" });

    const casse = new CourrierJournalise(b.bd, b.archive, async () => {
      throw new Error("clé de chiffrement changée");
    });
    const r1 = await casse.envoyer({ of_id: b.of_id, type: "test", destinataire: "x@exemple.example", sujet: "s", corps_html: "<p>c</p>" });
    expect(r1).toMatchObject({ statut: "echec", erreur: "Configuration d'envoi illisible : clé de chiffrement changée" });

    const refus = Object.assign(new Error("535-5.7.8 Username and Password not accepted"), { responseCode: 535 });
    const expedition: Expedition = { expediteur: "of@gmail.com", transport: { sendMail: async () => Promise.reject(refus) } as unknown as Expedition["transport"] };
    const gmail = new CourrierJournalise(b.bd, b.archive, expedition);
    const r2 = await gmail.envoyer({ of_id: b.of_id, type: "test", destinataire: "x@exemple.example", sujet: "s", corps_html: "<p>c</p>" });
    expect(r2.statut).toBe("echec");
    expect(r2.erreur).toContain("mot de passe d'application");
    expect(r2.erreur).toContain("535-5.7.8");
    const journal = await b.courriers();
    expect(journal.find((c) => c.id === r2.id)).toMatchObject({ statut: "echec", erreur: expect.stringContaining("mot de passe d'application") });

    expect(expliquerErreurSmtp({ responseCode: 535 })).toContain("mot de passe d'application");
    expect(expliquerErreurSmtp(Object.assign(new Error("getaddrinfo ENOTFOUND smtp.exemple"), { code: "ENOTFOUND" }))).toMatch(/introuvable.*nom d'hôte/);
    expect(expliquerErreurSmtp(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }))).toMatch(/465.*587/);
    expect(expliquerErreurSmtp(new Error("autre chose"))).toBe("autre chose");
  });
});

// ————————————————————————————————————————————————————————————————————————————————
// 3. Dossier d'enjeux avant toute production ; 6. coût horaire
// ————————————————————————————————————————————————————————————————————————————————

describe("3. Dossier d'enjeux — « recherche web avant de rédiger »", () => {
  let b: Banc;
  let sophie: Acteur;
  const file: string[] = [];
  let assistant: ReturnType<typeof iaFactice>;
  beforeAll(async () => {
    assistant = iaFactice(file);
    b = await creerBanc({ ia: assistant });
    sophie = await b.formateur();
  }, 60_000);
  afterAll(() => b.fermer());

  it("proposerParcours appelle l'IA deux fois : enjeux (recherche web), puis parcours fondé sur le dossier d'enjeux", async () => {
    file.push(JSON.stringify(ENJEUX), JSON.stringify(PARCOURS));
    const p = await proposerParcours(b.s, sophie, { titre: "Excel — tableaux croisés dynamiques", heures: 14, jours: 2, nb_modules: 2, niveau: "Intermédiaire" });
    expect(assistant.demandes).toHaveLength(2);
    expect(assistant.demandes[0]).toContain("recherche web");
    expect(assistant.demandes[0]).toContain("Excel — tableaux croisés dynamiques");
    expect(assistant.demandes[1]).toContain("DOSSIER D'ENJEUX");
    for (const notion of ENJEUX.notions_cles) expect(assistant.demandes[1]).toContain(notion);
    expect(assistant.demandes[1]).toContain("Confondre champs de valeurs et étiquettes de lignes");
    expect(p).toMatchObject({ brouillon: true, source: "ia", public_vise: "Assistants de gestion.", formation_prerequis: "Bases d'Excel.", formation_objectifs: "Construire un TCD\nAutomatiser un reporting\nContrôler ses données" });
    expect(p.dossier_enjeux).toMatchObject({ resume: ENJEUX.resume, sources: ENJEUX.sources });
    expect(p.modules.map((m) => m.duree_heures)).toEqual([7, 7]);
    expect(file).toEqual([]);
  });

  it("public visé et prérequis vides dans la réponse « parcours » sont repris du dossier d'enjeux", async () => {
    file.push(JSON.stringify(ENJEUX), JSON.stringify({ ...PARCOURS, public_vise: "", prerequis: "" }));
    const p = await proposerParcours(b.s, sophie, { titre: "Excel", heures: 14, jours: 2, nb_modules: 2 });
    expect(p.public_vise).toBe(ENJEUX.public_vise);
    expect(p.formation_prerequis).toBe(ENJEUX.prerequis);
  });

  it("un dossier d'enjeux mal formé est refusé une fois, puis l'IA est rappelée au schéma ; deux échecs = « pas exploitable »", async () => {
    file.push(JSON.stringify({ resume: "Trop court." }), JSON.stringify(ENJEUX), JSON.stringify(PARCOURS));
    const avant = assistant.demandes.length;
    await proposerParcours(b.s, sophie, { titre: "Excel", heures: 14, jours: 2, nb_modules: 2 });
    expect(assistant.demandes.length - avant).toBe(3);
    expect(assistant.demandes[avant + 1]).toContain("ta réponse précédente a été rejetée");
    file.push(JSON.stringify({ resume: "Trop court." }), JSON.stringify({ resume: "Encore trop court." }));
    await expect(proposerParcours(b.s, sophie, { titre: "Excel", heures: 14, jours: 2, nb_modules: 2 })).rejects.toMatchObject({ code: "invalide", message: expect.stringContaining("pas exploitable"), details: { erreurs: expect.arrayContaining([expect.stringContaining("résumé")]) } });
    expect(file).toEqual([]);
  });

  it("la formation créée avec son dossier d'enjeux porte « enjeux_le » ; un dossier invalide est refusé ; le dossier existant est réutilisé", async () => {
    await expect(creerFormation(b.s, sophie, { formation_titre: "Excel", dossier_enjeux: { resume: "x" } })).rejects.toThrow(/Dossier d'enjeux invalide/);
    const f = await creerFormation(b.s, sophie, { formation_titre: "Excel — tableaux croisés dynamiques", formation_duree_heures_total: 14, formation_modules: [{ ...moduleIa(1), duree_heures: 7 }, { ...moduleIa(2), duree_heures: 7 }], dossier_enjeux: ENJEUX });
    expect(f.enjeux_le).toEqual(b.horloge.maintenant());
    expect((f.dossier_enjeux as DossierEnjeux).notions_cles).toEqual(ENJEUX.notions_cles);
    const sans = await creerFormation(b.s, sophie, { formation_titre: "Sans enjeux" });
    expect(sans.enjeux_le).toBeNull();
    expect(sans.dossier_enjeux).toBeNull();

    // Regénérer le parcours de CETTE formation ne relance pas la recherche : un seul appel IA.
    const avant = assistant.demandes.length;
    file.push(JSON.stringify(PARCOURS));
    await proposerParcours(b.s, sophie, { titre: "Excel — tableaux croisés dynamiques", heures: 14, jours: 2, nb_modules: 2, formation_id: f.id });
    expect(assistant.demandes.length - avant).toBe(1);
    expect(file).toEqual([]);
  });

  it("analyserEnjeux (re)constitue le dossier d'une formation existante et complète public visé et prérequis vides", async () => {
    const f = await creerFormation(b.s, sophie, { formation_titre: "Habilitation électrique", formation_prerequis: "Aucun (déjà renseigné)" });
    file.push(JSON.stringify({ ...ENJEUX, public_vise: "Électriciens et agents de maintenance.", prerequis: "Aucun prérequis technique." }));
    const r = await analyserEnjeux(b.s, sophie, { formation_id: f.id });
    expect(r.enjeux.public_vise).toBe("Électriciens et agents de maintenance.");
    expect(assistant.demandes.at(-1)).toContain("Habilitation électrique");
    const apres = await lireFormation(b.s, sophie, f.id);
    expect(apres.enjeux_le).toEqual(b.horloge.maintenant());
    expect(apres.public_vise).toBe("Électriciens et agents de maintenance."); // vide → complété
    expect(apres.formation_prerequis).toBe("Aucun (déjà renseigné)"); // renseigné → conservé
    expect((apres.dossier_enjeux as DossierEnjeux).sources).toHaveLength(1);
    await expect(analyserEnjeux(b.s, b.admin, { formation_id: f.id })).rejects.toMatchObject({ code: "interdit" });
  });

  it("6. coût horaire : ignoré à la saisie de la formation, null sur le dossier, rémunération calculée par la commission", async () => {
    const f = await creerFormation(b.s, sophie, { formation_titre: "Formation tarifée", formation_objectifs: "Objectif", programme: "Contenu", formation_duree_heures_total: 7, formation_duree_jours: 1, formation_prix_unitaire_ht: 70_000, formateur_cout_horaire: 6_000 });
    expect(f.formateur_cout_horaire).toBeNull();
    const m = await modifierFormation(b.s, sophie, f.id, { formateur_cout_horaire: 5_000 });
    expect(m.formateur_cout_horaire).toBeNull();
    const ent = await enregistrerEntreprise(b.s, sophie, { entreprise_nom: "Client SA", entreprise_adresse: "1 rue du Test", entreprise_siret: "33333333333333", entreprise_representant_nom: "Durand", entreprise_representant_email: "client@exemple.example" });
    const st = await enregistrerStagiaire(b.s, sophie, { stagiaire_prenom: "Marc", stagiaire_nom: "Test", entreprise_id: ent.id });
    const d = await creerDossier(b.s, sophie, { stagiaire_ids: [st.id], entreprise_id: ent.id, formation_id: f.id, formation_modalite: "presentiel", mode_financement: "entreprise" });
    expect(d.formateur_cout_horaire).toBeNull();
    await modifierDossier(b.s, sophie, d.id, { formateur_cout_horaire: 5_500, formation_prix_unitaire_ht: 80_000 });
    const vue = await lireDossier(b.s, b.admin, d.id);
    expect(vue.formation.formateur_cout_horaire).toBeNull();
    expect(vue.formation.formation_prix_unitaire_ht).toBe(80_000);
    expect(vue.finances).toMatchObject({ formation_prix_total_ht: 80_000, portage_commission_montant: 20_000, formateur_montant_total: 60_000 }); // commission 25 % de l'organisme de démonstration
    // Sans e-mail sur la fiche : aucun formulaire ne part, et l'envoi manuel l'explique.
    expect((await b.courriers()).filter((c) => c.dossier_id === d.id)).toEqual([]);
    await expect(envoyerFormulaire(b.s, sophie, d.id, st.id, "recueil")).rejects.toMatchObject({ code: "invalide", message: expect.stringContaining("adresse e-mail") });
  });
});

// ————————————————————————————————————————————————————————————————————————————————
// 4. Formulaires de l'apprenant — « il clique et hop, page interactive… et ça se charge automatiquement dans le dossier »
// ————————————————————————————————————————————————————————————————————————————————

describe("4. Formulaires de l'apprenant en page interactive", () => {
  let b: Banc;
  let sophie: Acteur;
  let anne: Acteur;
  let dossierId: string;
  let ids: { anne: string; luc: string; entreprise: string; formation: string };
  let jetonRecueil = "";
  let jetonTest = "";
  let dateFin = "";

  const courriers = async (filtre: (c: Awaited<ReturnType<Banc["courriers"]>>[number]) => boolean) => (await b.courriers()).filter((c) => c.dossier_id === dossierId && filtre(c));
  const jetonDe = async (type: string, destinataire: string) => {
    const mail = (await courriers((c) => c.type === `formulaire_${type}` && c.destinataire === destinataire)).at(-1)!;
    return /\/formulaire\/([\w-]+)/.exec(mail.corps_html)![1]!;
  };
  const piece = async (code: string, stagiaire_id: string) => (await lireDossier(b.s, sophie, dossierId)).pieces.find((p) => p.code === code && p.stagiaire_id === stagiaire_id)!;
  const etat = async (stagiaire_id: string, type: string) => (await etatFormulaires(b.s, sophie, dossierId)).find((l) => l.stagiaire_id === stagiaire_id && l.type === type)!;

  beforeAll(async () => {
    b = await creerBanc();
    sophie = await b.formateur();
    const f = await creerFormation(b.s, sophie, { formation_titre: "Excel — tableaux croisés dynamiques", formation_objectifs: "Construire des TCD.\nAutomatiser un reporting.", programme: "Jour 1 — TCD.\nJour 2 — Automatisation.", formation_duree_heures_total: 14, formation_duree_jours: 2, formation_prix_unitaire_ht: 98_000 });
    await enregistrerOutil(b.s, sophie, { type: "positionnement", titre: "Positionnement Excel", formation_id: f.id, contenu: QCM });
    await enregistrerOutil(b.s, sophie, { type: "acquis", titre: "Acquis Excel", formation_id: f.id, contenu: { ...QCM, titre: "Évaluation des acquis Excel" } });
    const ent = await enregistrerEntreprise(b.s, sophie, { entreprise_nom: "Menuiserie Dupont SARL", entreprise_adresse: "12 avenue des Artisans, 68200 Mulhouse", entreprise_siret: "11111111111111", entreprise_representant_civilite: "M.", entreprise_representant_prenom: "Jean", entreprise_representant_nom: "Dupont", entreprise_representant_email: "jean.dupont@dupont.example" });
    const a = await enregistrerStagiaire(b.s, sophie, { stagiaire_prenom: "Anne", stagiaire_nom: "Martin", stagiaire_email: "anne.martin@dupont.example", stagiaire_poste: "Assistante de gestion", entreprise_id: ent.id });
    const l = await enregistrerStagiaire(b.s, sophie, { stagiaire_prenom: "Luc", stagiaire_nom: "Petit", stagiaire_email: "luc.petit@dupont.example", stagiaire_poste: "Chef d'atelier", entreprise_id: ent.id });
    ids = { anne: a.id, luc: l.id, entreprise: ent.id, formation: f.id };
  }, 60_000);
  afterAll(() => b.fermer());

  it("à la création du dossier, recueil et positionnement partent à chaque apprenant : lien personnel + document d'invitation joint (QR code)", async () => {
    dossierId = (await creerDossier(b.s, sophie, { stagiaire_ids: [ids.anne, ids.luc], entreprise_id: ids.entreprise, formation_id: ids.formation, formation_modalite: "presentiel", mode_financement: "opco" })).id;
    const envoyes = await courriers((c) => c.type.startsWith("formulaire_"));
    expect(envoyes.map((c) => [c.type, c.destinataire]).sort()).toEqual([
      ["formulaire_positionnement", "anne.martin@dupont.example"],
      ["formulaire_positionnement", "luc.petit@dupont.example"],
      ["formulaire_recueil", "anne.martin@dupont.example"],
      ["formulaire_recueil", "luc.petit@dupont.example"],
    ]);
    for (const c of envoyes) {
      expect(c.sujet).not.toMatch(/^Rappel/);
      expect(c.corps_html).toContain("http://localhost:5173/formulaire/");
      const pj = c.pieces_jointes as Array<{ nom: string; chemin: string }>;
      expect(pj).toHaveLength(1);
      expect(pj[0]!.nom).toMatch(/^Invitation .*\.html$/); // sans Chromium : HTML ; en production : PDF
      expect((await b.archive.lire(pj[0]!.chemin)).toString()).toContain("<svg"); // le QR code
    }
    jetonRecueil = await jetonDe("recueil", "anne.martin@dupont.example");
    jetonTest = await jetonDe("positionnement", "anne.martin@dupont.example");
    expect(jetonRecueil).not.toBe(jetonTest);
    // Le jeton n'est jamais stocké en clair.
    const lignes = await b.bd.select().from(formulaireApprenant).where(eq(formulaireApprenant.dossier_id, dossierId));
    expect(lignes).toHaveLength(4);
    expect(lignes.every((l) => l.jeton_hash !== jetonRecueil && l.jeton_hash !== jetonTest && l.envois === 1 && l.statut === "envoye")).toBe(true);
  });

  it("la page publique affiche nom, formation, libellé du formulaire et le questionnaire SANS corrigé", async () => {
    const p = await lireFormulairePublic(b.s, jetonRecueil);
    expect(p).toMatchObject({ type: "recueil", libelle: "Recueil des besoins", statut: "envoye", ouvert: true, formation_titre: "Excel — tableaux croisés dynamiques", apprenant: { prenom: "Anne", nom: "Martin", email: "anne.martin@dupont.example" }, formateur: "Sophie Lambert", aujourdhui: "2026-10-01", pdf: false, questionnaire: null });
    expect(p.formulaire!.champs.length).toBeGreaterThanOrEqual(6);
    const t = await lireFormulairePublic(b.s, jetonTest);
    expect(t).toMatchObject({ type: "positionnement", libelle: "Test de positionnement", formulaire: null });
    expect(t.questionnaire!.questions).toHaveLength(2);
    expect(JSON.stringify(t.questionnaire)).not.toContain("bonne_reponse");
    await expect(lireFormulairePublic(b.s, "jeton-inconnu")).rejects.toMatchObject({ code: "introuvable" });
    await expect(telechargerPdfPublic(b.s, jetonRecueil)).rejects.toMatchObject({ code: "conflit" });
  });

  it("brouillon enregistré, puis relu (« enregistrer et reprendre plus tard »)", async () => {
    await enregistrerBrouillonPublic(b.s, jetonRecueil, { reponses: { attentes: "Gagner du temps" }, date: "2026-10-01", lieu: "Mulhouse" });
    const p = await lireFormulairePublic(b.s, jetonRecueil);
    expect(p.statut).toBe("en_cours");
    expect(p.brouillon).toEqual({ reponses: { attentes: "Gagner du temps" }, date: "2026-10-01", lieu: "Mulhouse" });
    expect((await etat(ids.anne, "recueil")).statut).toBe("en_cours");
  });

  it("signature incomplète (réponses manquantes, pas de tracé, pas de consentement) : refusée avec la liste des manques, rien n'est écrit", async () => {
    const e = (await signerFormulairePublic(b.s, jetonRecueil, { reponses: { attentes: "Gagner du temps" }, date: "2026-10-01", trace_png: "", lieu: "", consentement: false }).catch((x: unknown) => x)) as ErreurMetier;
    expect(e).toBeInstanceOf(ErreurMetier);
    expect(e).toMatchObject({ code: "invalide", message: "Le formulaire est incomplet." });
    const details = e.details as { erreurs: string[]; champs: Record<string, string> };
    expect(details.erreurs.length).toBeGreaterThanOrEqual(4);
    expect(details.erreurs.some((x) => /Poste|anciennet/i.test(x))).toBe(true);
    expect(details.champs).toHaveProperty("poste_anciennete");
    await expect(signerFormulairePublic(b.s, jetonTest, { reponses: [0], date: "2026-10-01", ...SIGNATURE })).rejects.toMatchObject({ code: "invalide", details: { erreurs: [expect.stringContaining("réponse")] } });
    expect((await piece("00-AVT", ids.anne)).statut).toBe("en_attente");
    expect((await lireFormulairePublic(b.s, jetonRecueil)).statut).toBe("en_cours");
  });

  it("signature complète → pièce 00-AVT validée (mode signature), rendu signé + certificat dans « Retour », confirmation à l'apprenant et reçu au formateur avec le PDF", async () => {
    expect(await signerFormulairePublic(b.s, jetonRecueil, { reponses: RECUEIL, date: "2026-10-01", ...SIGNATURE }, "203.0.113.9")).toEqual({ statut: "complet" });
    const p = await piece("00-AVT", ids.anne);
    expect(p).toMatchObject({ statut: "valide", mode_retour: "signature", libelle_statut: "Validé" });
    const retour = b.archive.lister("ADF-2026-0001/Retour/").map((c) => c.split("/").pop());
    expect(retour).toEqual(expect.arrayContaining(["00_AVT_Recueil-Besoins_Anne-Martin_signe.html", "00_AVT_Recueil-Besoins_Anne-Martin_certificat-signature.html"]));
    const signe = (await telechargerPdfPublic(b.s, jetonRecueil)).contenu.toString();
    expect(signe).toContain("Signé électroniquement par Anne Martin");
    expect(signe).toContain("Gagner du temps");
    expect((await lireFormulairePublic(b.s, jetonRecueil))).toMatchObject({ statut: "complet", pdf: true, brouillon: null });

    const confirmation = (await courriers((c) => c.type === "formulaire_recueil_confirmation"))[0]!;
    expect(confirmation.destinataire).toBe("anne.martin@dupont.example");
    expect((confirmation.pieces_jointes as Array<{ nom: string }>).map((x) => x.nom)).toEqual(["00_AVT_Recueil-Besoins_Anne-Martin_signe.html"]);
    const recu = (await courriers((c) => c.type === "formulaire_recueil_recu"))[0]!;
    expect(recu.destinataire).toBe("sophie.lambert@formatrice.example");
    expect(recu.sujet).toContain("Anne Martin");
    expect((recu.pieces_jointes as unknown[]).length).toBe(1);

    expect(await etat(ids.anne, "recueil")).toMatchObject({ statut: "valide", envois: 1, invitation: true });
    expect((await lireDossier(b.s, sophie, dossierId)).journal.some((e) => e.type === "formulaire_signe" && e.libelle.includes("Anne Martin"))).toBe(true);
  });

  it("une deuxième signature est refusée (conflit) ; le brouillon aussi", async () => {
    await expect(signerFormulairePublic(b.s, jetonRecueil, { reponses: RECUEIL, date: "2026-10-01", ...SIGNATURE })).rejects.toMatchObject({ code: "conflit", message: expect.stringContaining("déjà signé") });
    await expect(enregistrerBrouillonPublic(b.s, jetonRecueil, { reponses: {} })).rejects.toMatchObject({ code: "conflit" });
    expect((await piece("00-AVT", ids.anne)).statut).toBe("valide");
  });

  it("un lien expiré (46 jours) est refusé, mais le document signé reste téléchargeable par son lien", async () => {
    b.horloge.avancer(DUREE_LIEN_FORMULAIRE_MS + JOUR_MS);
    await expect(lireFormulairePublic(b.s, jetonTest)).rejects.toMatchObject({ code: "introuvable", message: expect.stringContaining("expiré") });
    await expect(signerFormulairePublic(b.s, jetonTest, { reponses: [0, 1], date: "2026-11-16", ...SIGNATURE })).rejects.toMatchObject({ message: expect.stringContaining("expiré") });
    expect((await etat(ids.anne, "positionnement")).statut).toBe("expire");
    expect((await telechargerPdfPublic(b.s, jetonRecueil)).nom).toBe("00_AVT_Recueil-Besoins_Anne-Martin_signe.html");
  });

  it("le formateur renvoie le formulaire : envois = 2, ancien lien invalide, nouveau lien valable ; le document d'invitation se télécharge", async () => {
    const r = await envoyerFormulaire(b.s, sophie, dossierId, ids.anne, "positionnement", { message: "Merci de le compléter avant lundi." });
    expect(r.statut_envoi).toBe("journalise");
    const nouveau = r.lien.split("/").pop()!;
    expect(nouveau).not.toBe(jetonTest);
    await expect(lireFormulairePublic(b.s, jetonTest)).rejects.toMatchObject({ code: "introuvable" });
    expect((await lireFormulairePublic(b.s, nouveau)).statut).toBe("envoye");
    jetonTest = nouveau;
    expect(await etat(ids.anne, "positionnement")).toMatchObject({ statut: "envoye", envois: 2 });
    const mail = (await courriers((c) => c.type === "formulaire_positionnement" && c.destinataire === "anne.martin@dupont.example")).at(-1)!;
    expect(mail.corps_html).toContain("Merci de le compléter avant lundi.");
    expect(mail.corps_html).toContain(nouveau);

    const doc = await telechargerInvitation(b.s, sophie, dossierId, ids.anne, "positionnement");
    expect(doc.nom).toBe("Invitation Test de positionnement - Anne Martin.html");
    expect(doc.contenu.toString()).toContain(nouveau);
    expect(doc.contenu.toString()).toContain("Anne Martin");
    // Renvoyer un formulaire déjà validé n'a pas de sens.
    await expect(envoyerFormulaire(b.s, sophie, dossierId, ids.anne, "recueil")).rejects.toMatchObject({ code: "conflit", message: expect.stringContaining("déjà validé") });
    // L'évaluation des acquis ne s'ouvre qu'à la formation démarrée.
    await expect(envoyerFormulaire(b.s, sophie, dossierId, ids.anne, "acquis")).rejects.toMatchObject({ code: "conflit", message: expect.stringContaining("pas encore ouvert") });
  });

  it("etatFormulaires et listerFormulaires reflètent tout ; l'apprenant ne voit que ses lignes et ne peut ni envoyer ni lister ; un autre formateur ne voit rien", async () => {
    const lignes = await etatFormulaires(b.s, sophie, dossierId);
    expect(lignes).toHaveLength(10); // 2 stagiaires × 5 formulaires
    expect(lignes.filter((l) => l.stagiaire_id === ids.anne).map((l) => [l.type, l.statut, l.envois])).toEqual([
      ["recueil", "valide", 1],
      ["positionnement", "envoye", 2],
      ["acquis", "non_envoye", 0],
      ["satisfaction_chaud", "non_envoye", 0],
      ["satisfaction_froid", "non_envoye", 0],
    ]);
    expect(lignes.find((l) => l.type === "acquis")).toMatchObject({ ouvert: false, moment: "quand la formation est déclarée terminée", code: "07-FIN" });
    const liste = await listerFormulaires(b.s, b.admin, { dossier_id: dossierId });
    expect(liste).toHaveLength(4);
    expect(liste.find((l) => l.apprenant === "Anne Martin" && l.type === "recueil")).toMatchObject({ statut: "complet", envois: 1, dossier_reference: "ADF-2026-0001" });

    // Anne a maintenant un compte (créé par sa signature) : elle entre dans son espace par une invitation.
    const { lien } = await inviter(b.s, sophie, dossierId, ids.anne);
    anne = (await acteurDepuisJeton(b.s, (await accepterInvitation(b.s, lien.split("/").pop()!, MDP)).jeton))!;
    expect(anne).toMatchObject({ role: "apprenant", stagiaire_id: ids.anne });
    expect((await etatFormulaires(b.s, anne, dossierId)).every((l) => l.stagiaire_id === ids.anne)).toBe(true);
    await expect(envoyerFormulaire(b.s, anne, dossierId, ids.luc, "recueil")).rejects.toMatchObject({ code: "interdit" });
    await expect(listerFormulaires(b.s, anne)).rejects.toMatchObject({ code: "interdit" });
    const paul = await b.formateur("paul@exemple.example", "Paul", "Durand");
    expect(await listerFormulaires(b.s, paul)).toEqual([]);
    await expect(etatFormulaires(b.s, paul, dossierId)).rejects.toMatchObject({ code: "introuvable" });
  });

  it("le dossier avance jusqu'à « formation terminée » : évaluation des acquis et satisfaction à chaud partent alors automatiquement", async () => {
    // Anne signe son test par le nouveau lien ; les liens de Luc ont expiré eux aussi : renvoyés, puis Luc répond.
    await signerFormulairePublic(b.s, jetonTest, { reponses: [0, 1], date: "2026-11-17", ...SIGNATURE });
    expect((await piece("01-AVT", ids.anne))).toMatchObject({ statut: "valide", mode_retour: "signature" });
    await expect(signerFormulairePublic(b.s, await jetonDe("recueil", "luc.petit@dupont.example"), { reponses: RECUEIL, date: "2026-11-17", ...SIGNATURE })).rejects.toMatchObject({ message: expect.stringContaining("expiré") });
    await envoyerFormulaire(b.s, sophie, dossierId, ids.luc, "recueil");
    await envoyerFormulaire(b.s, sophie, dossierId, ids.luc, "positionnement");
    await signerFormulairePublic(b.s, await jetonDe("recueil", "luc.petit@dupont.example"), { reponses: RECUEIL, date: "2026-11-17", ...SIGNATURE });
    await signerFormulairePublic(b.s, await jetonDe("positionnement", "luc.petit@dupont.example"), { reponses: [0, 0], date: "2026-11-17", ...SIGNATURE });

    dateFin = "2026-12-02";
    await modifierDossier(b.s, sophie, dossierId, { formation_date_debut: "2026-12-01", formation_date_fin: dateFin, signature_lieu: "Mulhouse", formation_opco: "OPCO Démo" });
    await definirSeances(b.s, sophie, dossierId, [
      { date: "2026-12-01", heure_debut: "09:00", heure_fin: "17:00" },
      { date: dateFin, heure_debut: "09:00", heure_fin: "17:00" },
    ]);
    await executerAction(b.s, sophie, dossierId, "soumettre_validation");
    await executerAction(b.s, b.admin, dossierId, "valider_dossier");
    await deposerPieceExterne(b.s, b.admin, dossierId, "ACC", fichier("accord-opco.pdf"));
    await executerAction(b.s, sophie, dossierId, "envoyer_elements_pedagogiques");
    await executerAction(b.s, sophie, dossierId, "demarrer_formation");
    expect((await etat(ids.anne, "acquis")).ouvert).toBe(true);
    const avant = (await courriers((c) => c.type.startsWith("formulaire_"))).length;
    await executerAction(b.s, sophie, dossierId, "terminer_formation");
    expect((await lireDossier(b.s, sophie, dossierId)).sous_statut).toBe("fin_dossier_incomplet");
    const fin = (await courriers((c) => c.type.startsWith("formulaire_"))).slice(avant);
    expect(fin.map((c) => [c.type, c.destinataire]).sort()).toEqual([
      ["formulaire_acquis", "anne.martin@dupont.example"],
      ["formulaire_acquis", "luc.petit@dupont.example"],
      ["formulaire_satisfaction_chaud", "anne.martin@dupont.example"],
      ["formulaire_satisfaction_chaud", "luc.petit@dupont.example"],
    ]);
  });

  it("l'évaluation des acquis signée par la page publique valide la pièce 07-FIN (avec son score) ; le formateur ne peut toujours pas répondre à la place de l'apprenant", async () => {
    await expect(enregistrerEvaluation(b.s, sophie, dossierId, "acquis", { reponses: [0, 1], stagiaire_id: ids.luc })).rejects.toMatchObject({ code: "interdit" });
    const jeton = await jetonDe("acquis", "anne.martin@dupont.example");
    expect((await lireFormulairePublic(b.s, jeton)).questionnaire!.questions).toHaveLength(2);
    await signerFormulairePublic(b.s, jeton, { reponses: [0, 1], date: dateFin, ...SIGNATURE });
    expect(await piece("07-FIN", ids.anne)).toMatchObject({ statut: "valide", mode_retour: "signature" });
    const html = (await telechargerPdfPublic(b.s, jeton)).contenu.toString();
    expect(html).toContain("Signé électroniquement par Anne Martin");
    expect(await etat(ids.anne, "acquis")).toMatchObject({ statut: "valide", envois: 1 });
    // La satisfaction à chaud aussi (formulaire à notes, sans corrigé).
    await signerFormulairePublic(b.s, await jetonDe("satisfaction_chaud", "anne.martin@dupont.example"), { reponses: { ...NOTES, commentaire: "Très concret." }, date: dateFin, ...SIGNATURE });
    expect((await piece("08-FIN", ids.anne)).statut).toBe("valide");
  });

  it("relance à J+7 : un formulaire envoyé une fois et resté sans réponse est relancé UNE seule fois", async () => {
    b.horloge.avancer(8 * JOUR_MS);
    expect(await envoyerFormulairesProgrammes(b.s)).toBe(2); // acquis + satisfaction à chaud de Luc (Anne a tout signé)
    const rappels = await courriers((c) => c.sujet.startsWith("Rappel — "));
    expect(rappels.map((c) => [c.type, c.destinataire]).sort()).toEqual([["formulaire_acquis", "luc.petit@dupont.example"], ["formulaire_satisfaction_chaud", "luc.petit@dupont.example"]]);
    expect(await etat(ids.luc, "acquis")).toMatchObject({ statut: "envoye", envois: 2 });
    expect(await envoyerFormulairesProgrammes(b.s)).toBe(0); // idempotent : pas de seconde relance
    // Le lien relancé fonctionne ; Luc signe son évaluation des acquis.
    await signerFormulairePublic(b.s, await jetonDe("acquis", "luc.petit@dupont.example"), { reponses: [1, 0], date: dateFin, ...SIGNATURE });
    expect((await piece("07-FIN", ids.luc)).statut).toBe("valide");
  });

  it("satisfaction à froid : à J+90 après la fin, une fois le dossier complet — un envoi par stagiaire, puis plus rien (idempotent)", async () => {
    // On solde les pièces restantes : chacun signe ou dépose ce qui lui revient (émargement, convocation, attestation, ODM…).
    const { lien } = await inviter(b.s, sophie, dossierId, ids.luc);
    const luc = (await acteurDepuisJeton(b.s, (await accepterInvitation(b.s, lien.split("/").pop()!, MDP)).jeton))!;
    for (const se of (await lireDossier(b.s, sophie, dossierId)).seances) {
      await emarger(b.s, anne, se.id, { trace_png: TRACE });
      await emarger(b.s, luc, se.id, { trace_png: TRACE });
      await emarger(b.s, sophie, se.id, { trace_png: TRACE });
    }
    for (const acteur of [anne, luc, sophie]) {
      for (const p of (await lireDossier(b.s, acteur, dossierId)).pieces.filter((x) => x.statut === "en_attente" && x.peut_deposer)) {
        if (p.peut_signer) await signerPiece(b.s, acteur, p.id, SIGNATURE);
        else await deposerRetour(b.s, acteur, p.id, fichier(`${p.code}-signe.pdf`));
      }
    }
    expect((await lireDossier(b.s, sophie, dossierId)).sous_statut).toBe("fin_dossier_complet");

    expect(await envoyerSatisfactionsAFroid(b.s)).toBe(0); // trop tôt
    b.horloge.avancer(new Date(`${dateFin}T08:00:00.000Z`).getTime() + (DELAI_FROID_JOURS - 1) * JOUR_MS - b.horloge.maintenant().getTime()); // J+89
    expect(await envoyerSatisfactionsAFroid(b.s)).toBe(0);
    b.horloge.avancer(2 * JOUR_MS); // J+91
    expect(await envoyerSatisfactionsAFroid(b.s)).toBe(2);
    expect(await envoyerSatisfactionsAFroid(b.s)).toBe(0);
    expect(await envoyerFormulairesProgrammes(b.s)).toBe(0);
    const froid = await courriers((c) => c.type === "formulaire_satisfaction_froid");
    expect(froid.map((c) => c.destinataire).sort()).toEqual(["anne.martin@dupont.example", "luc.petit@dupont.example"]);
    expect((froid[0]!.pieces_jointes as unknown[]).length).toBe(1);
    expect(await etat(ids.anne, "satisfaction_froid")).toMatchObject({ statut: "envoye", envois: 1, ouvert: true });
    await signerFormulairePublic(b.s, await jetonDe("satisfaction_froid", "anne.martin@dupont.example"), { reponses: { ...NOTES_FROID, commentaire: "Toujours utile trois mois après." }, date: "2027-03-15", ...SIGNATURE });
    expect((await piece("12-APR", ids.anne)).statut).toBe("valide");
  });
});
