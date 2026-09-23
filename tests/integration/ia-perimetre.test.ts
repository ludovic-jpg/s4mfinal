/**
 * Test de garde — « l'IA sur la partie support pédagogique ; sur le reste, tout doit être produit de manière
 * très exacte » (cahier des charges oral du 23/09/2026).
 *
 * Ce test lit le code source : si demain quelqu'un (humain ou IA) branche l'assistant IA sur la génération des
 * pièces, le pipeline ou les montants, la CI échoue. Une règle d'architecture devient ainsi vérifiable.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = join(__dirname, "../..");

function fichiers(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) return fichiers(chemin);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [chemin] : [];
  });
}

const sources = fichiers(join(RACINE, "src")).map((chemin) => ({ chemin: relative(RACINE, chemin).replaceAll("\\", "/"), code: readFileSync(chemin, "utf8") }));
const importe = (code: string, module: RegExp) => [...code.matchAll(/from\s+["']([^"']+)["']/g)].some((m) => module.test(m[1]!));

describe("périmètre de l'IA", () => {
  it("seuls le service pédagogique, le point d'entrée et le socle connaissent le port IA", () => {
    const utilisateurs = sources.filter((f) => importe(f.code, /ports\/ia$/)).map((f) => f.chemin).sort();
    expect(utilisateurs).toEqual(["src/serveur/demarrer.ts", "src/serveur/services/pedagogie-ia.ts", "src/serveur/services/socle.ts"]);
  });

  it("seul le service pédagogique utilise le module de propositions IA", () => {
    const utilisateurs = sources.filter((f) => importe(f.code, /pedagogie\/propositions$/)).map((f) => f.chemin);
    expect(utilisateurs).toEqual(["src/serveur/services/pedagogie-ia.ts"]);
  });

  it("aucun service de pièces, de pipeline, de dossier ou de signature n'appelle l'IA", () => {
    const exacts = sources.filter((f) => /services\/(generation|pipeline|dossiers|retours|agregat|bpf|evaluations)\.ts$|domaine\/(dossier|gabarits|pipeline|pieces|signature|bpf)\//.test(f.chemin));
    expect(exacts.length).toBeGreaterThan(10);
    for (const f of exacts) {
      expect(f.code, f.chemin).not.toMatch(/\bs\.ia\b|pedagogie-ia|anthropic/i);
    }
  });

  it("l'assistant IA n'est lu que par le service pédagogique (et par le démarrage, qui affiche s'il est actif)", () => {
    const appels = sources.filter((f) => /\bs\.ia\b/.test(f.code)).map((f) => f.chemin).sort();
    expect(appels).toEqual(["src/serveur/demarrer.ts", "src/serveur/services/pedagogie-ia.ts"]);
  });
});
