/**
 * IA de l'espace pédagogique : la réponse de l'IA est validée strictement, et jamais « réparée » en silence.
 */
import { describe, expect, it } from "vitest";
import { consigneProgramme, consigneQcm, extraireJson, validerPropositionProgramme, validerPropositionQcm, type ContexteFormation } from "./propositions";

const FORMATION: ContexteFormation = {
  formation_titre: "Excel — tableaux croisés dynamiques",
  formation_objectifs: "Construire un TCD.\nAutomatiser un reporting.",
  formation_niveau: "Intermédiaire",
  formation_prerequis: "Bases d'Excel",
  public_vise: "Assistants de gestion",
  programme: "Jour 1 — TCD.\nJour 2 — Automatisation.",
  formation_duree_heures_total: 14,
};

const question = (i: number) => ({ enonce: `Question ${i} ?`, propositions: ["A", "B", "C", "D"], bonne_reponse: i % 4 });
const qcm = (n: number) => ({ titre: "Positionnement Excel", questions: Array.from({ length: n }, (_, i) => question(i)) });

describe("consignes envoyées à l'IA", () => {
  it("décrivent la formation, le nombre exact de questions et le schéma JSON attendu", () => {
    const c = consigneQcm(FORMATION, "positionnement", 10);
    expect(c).toContain("Exactement 10 questions");
    expect(c).toContain("Excel — tableaux croisés dynamiques");
    expect(c).toContain("indicateur Qualiopi n° 8");
    expect(consigneQcm(FORMATION, "acquis", 5)).toContain("n° 11");
  });

  it("ne transmettent que la description de la formation : aucune donnée d'apprenant, d'entreprise ni de prix", () => {
    const c = consigneProgramme(FORMATION);
    for (const interdit of ["stagiaire", "SIRET", "€", "prix"]) expect(c.toLowerCase()).not.toContain(interdit.toLowerCase());
  });
});

describe("validation d'un QCM proposé", () => {
  it("accepte un QCM conforme", () => {
    expect(validerPropositionQcm(qcm(10), 10)).toMatchObject({ ok: true, valeur: { titre: "Positionnement Excel" } });
  });

  it("refuse un nombre de questions différent de celui demandé", () => {
    expect(validerPropositionQcm(qcm(9), 10)).toMatchObject({ ok: false, erreurs: [expect.stringContaining("9 questions au lieu de 10")] });
  });

  it("refuse une bonne réponse hors des propositions, ou des propositions en double", () => {
    const hors = qcm(3);
    hors.questions[1]!.bonne_reponse = 7;
    expect(validerPropositionQcm(hors, 3).ok).toBe(false);
    const doublon = qcm(3);
    doublon.questions[0]!.propositions = ["A", "A", "C", "D"];
    expect(validerPropositionQcm(doublon, 3).ok).toBe(false);
  });

  it("refuse une réponse qui ne suit pas le schéma", () => {
    expect(validerPropositionQcm(null, 3).ok).toBe(false);
    expect(validerPropositionQcm({ questions: "non" }, 3).ok).toBe(false);
  });
});

describe("validation d'une proposition d'objectifs et de programme", () => {
  it("rend les objectifs « un par ligne », sans puces ni numéros", () => {
    const r = validerPropositionProgramme({ objectifs: ["1. Construire un TCD", "- Automatiser un reporting", "• Fiabiliser ses données"], programme: "Jour 1 — Tableaux croisés dynamiques et segments." });
    expect(r).toEqual({ ok: true, valeur: { formation_objectifs: "Construire un TCD\nAutomatiser un reporting\nFiabiliser ses données", programme: "Jour 1 — Tableaux croisés dynamiques et segments." } });
  });

  it("refuse moins de trois objectifs, ou un programme vide", () => {
    expect(validerPropositionProgramme({ objectifs: ["Un seul"], programme: "Jour 1 — Tableaux croisés dynamiques." }).ok).toBe(false);
    expect(validerPropositionProgramme({ objectifs: ["A", "B", "C"], programme: "" }).ok).toBe(false);
  });
});

describe("lecture de la réponse brute", () => {
  it("extrait le JSON, même entouré d'un bloc ```json", () => {
    expect(extraireJson('Voici :\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(extraireJson('{"a": {"b": 2}}')).toEqual({ a: { b: 2 } });
  });

  it("retourne null plutôt que de deviner", () => {
    expect(extraireJson("pas de JSON ici")).toBeNull();
    expect(extraireJson('{"a": 1')).toBeNull();
  });
});
