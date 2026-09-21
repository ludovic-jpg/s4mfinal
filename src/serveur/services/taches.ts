/**
 * Tâches de fond. Une seule pour l'instant : l'envoi du questionnaire de satisfaction « à froid », 90 jours
 * après la fin de la formation (pièce 12-APR, indicateur Qualiopi n° 30). Lancée au démarrage puis chaque jour.
 * Idempotente : un courrier déjà journalisé pour ce dossier et cet apprenant n'est jamais renvoyé.
 */
import { and, eq, inArray } from "drizzle-orm";
import { courrier, dossierFormation } from "../bd/schema";
import { stagiairesDuDossier } from "./agregat";
import { lireOrganisme } from "./organisme";
import { inviterApprenant } from "./invitations";
import type { Services } from "./socle";

export const DELAI_FROID_JOURS = 90;

export async function envoyerSatisfactionsAFroid(s: Services): Promise<number> {
  const seuil = new Date(s.horloge.maintenant().getTime() - DELAI_FROID_JOURS * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const dossiers = await s.bd.select().from(dossierFormation).where(inArray(dossierFormation.sous_statut, ["fin_dossier_complet", "demande_paiement", "paiement_receptionne", "archive"]));
  let envois = 0;
  for (const d of dossiers.filter((x) => x.formation_date_fin && x.formation_date_fin <= seuil)) {
    const of = await lireOrganisme(s, d.of_id);
    for (const { st } of await stagiairesDuDossier(s, d.id)) {
      if (!st.stagiaire_email) continue;
      const [deja] = await s.bd.select({ id: courrier.id }).from(courrier).where(and(eq(courrier.dossier_id, d.id), eq(courrier.type, "satisfaction_froid"), eq(courrier.destinataire, st.stagiaire_email)));
      if (deja) continue;
      const lien = st.utilisateur_id ? `${s.appUrl}/` : await inviterApprenant(s, d, st.id, { sansEmail: true });
      await s.courrier.envoyer({
        of_id: d.of_id,
        dossier_id: d.id,
        type: "satisfaction_froid",
        destinataire: st.stagiaire_email,
        sujet: `Trois mois après « ${d.formation_titre} » : votre avis compte`,
        corps_html: `<p>Bonjour ${st.stagiaire_prenom},</p><p>Vous avez suivi la formation « ${d.formation_titre} » il y a trois mois. Deux minutes suffisent pour nous dire ce qu'elle a changé dans votre activité.</p><p><a href="${lien}">Répondre au questionnaire</a></p><p>${of.of_nom}</p>`,
      });
      envois++;
    }
  }
  return envois;
}
