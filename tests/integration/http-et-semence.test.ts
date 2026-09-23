/** L'API de bout en bout, sur le jeu de démonstration : ce test prouve aussi que la semence produit un état valide. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ouvrirBase } from "@/serveur/bd/connexion";
import { COMPTES_DEMO, MDP_DEMO, semer } from "@/serveur/bd/semence";
import { tracePngDemo } from "@/serveur/bd/trace-demo";
import { creerApp } from "@/serveur/http/app";
import { ArchiveMemoire } from "@/serveur/ports/archive";
import { CourrierJournalise } from "@/serveur/ports/courrier";
import { horlogeSysteme } from "@/serveur/ports/divers";
import { chiffreurEphemere } from "@/serveur/ports/chiffrement";
import { sansPdf } from "@/serveur/ports/pdf";
import { reinitialiserAntiForceBrute } from "@/serveur/services/auth";
import { validerDemandeSignature } from "@/domaine/signature/preuve";
import type { Services } from "@/serveur/services/socle";

let app: ReturnType<typeof creerApp>;
let fermer: () => Promise<void>;

/** Petit client de test : conserve le cookie de session, pose l'en-tête anti-CSRF. */
function client() {
  let cookie = "";
  const appel = async (methode: string, chemin: string, corps?: unknown, entetes: Record<string, string> = { "x-requested-with": "s4m" }) => {
    const estFormulaire = corps instanceof FormData;
    const r = await app.request(chemin, {
      method: methode,
      headers: { ...entetes, ...(cookie ? { cookie } : {}), ...(corps && !estFormulaire ? { "content-type": "application/json" } : {}) },
      body: corps ? (estFormulaire ? corps : JSON.stringify(corps)) : undefined,
    });
    const pose = r.headers.get("set-cookie");
    if (pose) cookie = pose.split(";")[0]!;
    return r;
  };
  return {
    appel,
    get: (chemin: string) => appel("GET", chemin),
    post: (chemin: string, corps?: unknown) => appel("POST", chemin, corps ?? {}),
    connecter: (email: string) => appel("POST", "/api/auth/connexion", { email, mot_de_passe: MDP_DEMO }),
  };
}

beforeAll(async () => {
  const base = await ouvrirBase("memoire");
  fermer = base.fermer;
  const archive = new ArchiveMemoire();
  const s: Services = { bd: base.bd, archive, courrier: new CourrierJournalise(base.bd, archive), pdf: sansPdf, horloge: horlogeSysteme, appUrl: "http://localhost:5173", secrets: chiffreurEphemere() };
  await semer(s);
  reinitialiserAntiForceBrute();
  app = creerApp(s);
}, 180_000);
afterAll(() => fermer());

describe("tracé de démonstration", () => {
  it("est un vrai PNG, accepté par le contrôle de signature", () => {
    const trace = tracePngDemo(3);
    expect(validerDemandeSignature({ trace_png: trace, lieu: "Mulhouse", consentement: true })).toEqual([]);
    expect(Buffer.from(trace.split(",")[1]!, "base64").subarray(1, 4).toString()).toBe("PNG");
  });
});

describe("sécurité de l'API", () => {
  it("refuse tout accès sans session, et toute écriture sans l'en-tête anti-CSRF", async () => {
    const c = client();
    expect((await c.get("/api/dossiers")).status).toBe(401);
    expect((await c.appel("POST", "/api/auth/connexion", { email: COMPTES_DEMO[0]!.email, mot_de_passe: MDP_DEMO }, {})).status).toBe(403);
    expect((await c.get("/api/auth/moi").then((r) => r.json())).acteur).toBeNull();
  });

  it("pose un cookie de session inaccessible au JavaScript, et l'oublie à la déconnexion", async () => {
    const c = client();
    const r = await c.connecter(COMPTES_DEMO[1]!.email);
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(r.headers.get("set-cookie")).toMatch(/SameSite=Lax/i);
    expect((await c.get("/api/auth/moi").then((x) => x.json())).acteur).toMatchObject({ role: "formateur", formateur_valide: true });
    await c.post("/api/auth/deconnexion");
    expect((await c.get("/api/dossiers")).status).toBe(401);
  });

  it("traduit les erreurs métier et de validation en réponses lisibles, sans jamais exposer de détail technique", async () => {
    const c = client();
    expect((await c.connecter("inconnu@demo.example")).status).toBe(401);
    await c.connecter(COMPTES_DEMO[1]!.email);
    const invalide = await c.post("/api/formations", { formation_titre: "x" });
    expect(invalide.status).toBe(400);
    expect(await invalide.json()).toMatchObject({ code: "invalide", erreur: "L'intitulé est obligatoire." });
    expect((await c.get("/api/dossiers/inexistant")).status).toBe(404);
    expect((await c.get("/api/admin/candidatures")).status).toBe(403);
    expect((await c.get("/api/nimporte-quoi")).status).toBe(404);
  });
});

describe("jeu de démonstration, vu par chaque rôle", () => {
  it("formatrice : neuf dossiers répartis sur tout le pipeline", async () => {
    const c = client();
    await c.connecter(COMPTES_DEMO[1]!.email);
    const { dossiers, etapes, sous_statuts } = await c.get("/api/dossiers").then((r) => r.json());
    expect(etapes).toHaveLength(7);
    expect(sous_statuts).toHaveLength(13);
    expect(dossiers.map((d: { sous_statut: string }) => d.sous_statut).sort()).toEqual(
      ["accord_financement", "archive", "brouillon", "demande_paiement", "dossier_valide", "en_cours_validation", "fin_dossier_complet", "formation_debutee", "refus_financement"].sort(),
    );
    const archive = dossiers.find((d: { sous_statut: string }) => d.sous_statut === "archive");
    expect(archive).toMatchObject({ apprenants: ["Anne Martin", "Luc Petit"], archive: true });
    expect(archive.pieces_validees).toBe(archive.pieces_total);
  });

  it("formatrice : lit un dossier, affiche une pièce dans un cadre isolé, télécharge la version signée", async () => {
    const c = client();
    await c.connecter(COMPTES_DEMO[1]!.email);
    const { dossiers } = await c.get("/api/dossiers").then((r) => r.json());
    const d = await c.get(`/api/dossiers/${dossiers.find((x: { sous_statut: string }) => x.sous_statut === "archive").id}`).then((r) => r.json());
    expect(d.finances).toMatchObject({ formation_prix_total_ht: 196_000, portage_commission_montant: 49_000, formateur_montant_total: 147_000 });
    const convention = d.pieces.find((p: { code: string }) => p.code === "02-AVT");
    const apercu = await c.get(`/api/pieces/${convention.id}/apercu`);
    expect(apercu.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(await apercu.text()).toContain("Convention de formation professionnelle");
    const signe = await c.get(`/api/pieces/${convention.id}/telecharger?version=retour`);
    expect(signe.headers.get("content-disposition")).toContain("attachment");
    expect((await c.get(`/api/pieces/${convention.id}/integrite`).then((r) => r.json())).integre).toBe(true);
  });

  it("apprenante : ne voit que ses dossiers, son espace, et les coffres ouverts par un accord", async () => {
    const c = client();
    await c.connecter(COMPTES_DEMO[2]!.email);
    const { dossiers } = await c.get("/api/dossiers").then((r) => r.json());
    expect(dossiers.length).toBe(4);
    const enCours = await c.get(`/api/dossiers/${dossiers.find((x: { sous_statut: string }) => x.sous_statut === "formation_debutee").id}`).then((r) => r.json());
    expect(enCours.pieces.every((p: { espace: string }) => p.espace === "apprenant")).toBe(true);
    expect(enCours.stagiaires).toHaveLength(1);
    expect(enCours.finances).toBeNull();
    const coffres = await c.get("/api/coffres").then((r) => r.json());
    expect(coffres.length).toBeGreaterThan(0);
    expect(coffres[0].fichiers.map((f: { nom_fichier: string }) => f.nom_fichier)).not.toContain("Notes du formateur (privé).pdf");
    expect((await c.get("/api/formations")).status).toBe(403);
    expect((await c.get("/api/bpf")).status).toBe(403);
  });

  it("admin : décide d'une candidature, consulte le BPF et la boîte d'envoi", async () => {
    const c = client();
    await c.connecter(COMPTES_DEMO[0]!.email);
    const candidats = await c.get("/api/admin/candidatures").then((r) => r.json());
    const paul = candidats.find((x: { statut_candidature: string }) => x.statut_candidature === "soumise");
    expect(paul).toMatchObject({ formateur_nom: "Durand" });
    expect((await c.post(`/api/admin/candidatures/${paul.id}/decision`, { validee: true })).status).toBe(200);

    const { bpf } = await c.get("/api/bpf").then((r) => r.json());
    expect(bpf.totaux.nb_actions).toBeGreaterThanOrEqual(3);
    const csv = await c.get(`/api/bpf/export?exercice=${bpf.exercice}`);
    expect(csv.headers.get("content-type")).toContain("text/csv");

    const courriers = await c.get("/api/courriers").then((r) => r.json());
    expect(new Set(courriers.map((m: { type: string }) => m.type))).toEqual(expect.objectContaining(new Set()));
    expect(courriers.some((m: { type: string }) => m.type === "pieces_financement")).toBe(true);
    expect(courriers.some((m: { type: string }) => m.type === "odm")).toBe(true);
    expect(courriers.every((m: { statut: string }) => m.statut === "journalise")).toBe(true); // rien n'est parti pour de vrai
  });

  it("candidat non validé : n'accède qu'à sa candidature", async () => {
    const c = client();
    await c.post("/api/auth/inscription", { email: "nouveau@demo.example", mot_de_passe: MDP_DEMO, prenom: "Nina", nom: "Nouvelle" });
    expect((await c.get("/api/candidature")).status).toBe(200);
    expect((await c.get("/api/formations")).status).toBe(403);
    expect((await c.get("/api/dossiers")).status).toBe(403);
    const form = new FormData();
    form.set("type", "cv");
    form.set("fichier", new File(["cv"], "cv.pdf", { type: "application/pdf" }));
    expect((await c.appel("POST", "/api/candidature/pieces", form)).status).toBe(201);
  });
});
