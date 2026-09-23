/**
 * Banc d'essai des tests d'intégration : une vraie base PostgreSQL (PGlite en mémoire, migrations rejouées),
 * une archive en mémoire, une horloge fixe. Aucun réseau, aucun disque : les tests sont rapides et reproductibles.
 */
import { eq } from "drizzle-orm";
import { ouvrirBase } from "@/serveur/bd/connexion";
import { creerFormateurValide, creerOrganisme, creerUtilisateur } from "@/serveur/bd/amorce";
import { courrier, utilisateur } from "@/serveur/bd/schema";
import { ArchiveMemoire } from "@/serveur/ports/archive";
import { CourrierJournalise } from "@/serveur/ports/courrier";
import { HorlogeFixe } from "@/serveur/ports/divers";
import { sansPdf } from "@/serveur/ports/pdf";
import { construireActeur, reinitialiserAntiForceBrute } from "@/serveur/services/auth";
import type { Acteur, Services } from "@/serveur/services/socle";
import type { AssistantPedagogique } from "@/serveur/ports/ia";

export const MDP = "mot-de-passe-solide";

export async function creerBanc(options: { ia?: AssistantPedagogique } = {}) {
  const { bd, fermer } = await ouvrirBase("memoire");
  const archive = new ArchiveMemoire();
  const horloge = new HorlogeFixe(new Date("2026-10-01T08:00:00.000Z"));
  const s: Services = { bd, archive, courrier: new CourrierJournalise(bd, archive), pdf: sansPdf, horloge, appUrl: "http://localhost:5173", ...(options.ia ? { ia: options.ia } : {}) };
  reinitialiserAntiForceBrute();

  const of_id = await creerOrganisme(s, { id: "of-demo" });
  const adminId = await creerUtilisateur(s, { of_id, email: "admin@organisme-demo.example", mot_de_passe: MDP, role: "admin", prenom: "Claire", nom: "Exemple" });

  const acteur = async (utilisateur_id: string): Promise<Acteur> => {
    const [u] = await bd.select().from(utilisateur).where(eq(utilisateur.id, utilisateur_id));
    return construireActeur(s, u!);
  };

  return {
    s,
    bd,
    archive,
    horloge,
    of_id,
    fermer,
    acteur,
    admin: await acteur(adminId),
    async formateur(email = "sophie.lambert@formatrice.example", prenom = "Sophie", nom = "Lambert") {
      const { utilisateur_id } = await creerFormateurValide(s, { of_id, email, mot_de_passe: MDP, prenom, nom });
      return acteur(utilisateur_id);
    },
    courriers: () => bd.select().from(courrier).orderBy(courrier.cree_le),
  };
}

export type Banc = Awaited<ReturnType<typeof creerBanc>>;

export const fichier = (nom: string, contenu = "contenu de test") => ({ nom, type_mime: "application/octet-stream", contenu: Buffer.from(contenu) });

/** Assistant IA de test : rejoue des réponses écrites d'avance et garde trace des demandes reçues. */
export function iaFactice(reponses: string[]): AssistantPedagogique & { demandes: string[] } {
  const demandes: string[] = [];
  return {
    disponible: true,
    demandes,
    rediger: (_systeme: string, demande: string) => {
      demandes.push(demande);
      const r = reponses.shift();
      return r === undefined ? Promise.reject(new Error("Plus de réponse prévue.")) : Promise.resolve(r);
    },
  };
}
