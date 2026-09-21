/**
 * Port « courrier ». TOUT e-mail automatique est d'abord journalisé en base (traçabilité exigée en
 * section 9 du cahier des charges), puis, selon la configuration, réellement expédié.
 * En mode « boîte locale » (défaut), rien ne part : on relit les messages dans l'application.
 */
import nodemailer, { type Transporter } from "nodemailer";
import type { BaseDeDonnees } from "../bd/connexion";
import { courrier } from "../bd/schema";
import { nouvelId } from "./divers";
import type { Archive } from "./archive";

export interface PieceJointe {
  nom: string;
  chemin: string;
}

export interface Message {
  of_id: string;
  dossier_id?: string | null;
  type: string;
  destinataire: string;
  sujet: string;
  corps_html: string;
  pieces_jointes?: PieceJointe[];
}

export interface Courrier {
  envoyer(message: Message): Promise<{ id: string; statut: "journalise" | "envoye" | "echec" }>;
}

export class CourrierJournalise implements Courrier {
  constructor(
    private readonly bd: BaseDeDonnees,
    private readonly archive: Archive,
    private readonly expedition: { transport: Transporter; expediteur: string } | null = null,
  ) {}

  async envoyer(message: Message): Promise<{ id: string; statut: "journalise" | "envoye" | "echec" }> {
    const id = nouvelId();
    let statut: "journalise" | "envoye" | "echec" = "journalise";
    let erreur = "";

    if (this.expedition) {
      try {
        const attachments = await Promise.all(
          (message.pieces_jointes ?? []).map(async (pj) => ({ filename: pj.nom, content: await this.archive.lire(pj.chemin) })),
        );
        await this.expedition.transport.sendMail({
          from: this.expedition.expediteur,
          to: message.destinataire,
          subject: message.sujet,
          html: message.corps_html,
          attachments,
        });
        statut = "envoye";
      } catch (e) {
        // Un e-mail qui échoue ne doit jamais faire échouer l'action métier : on trace et on continue.
        statut = "echec";
        erreur = (e as Error).message;
      }
    }

    await this.bd.insert(courrier).values({
      id,
      of_id: message.of_id,
      dossier_id: message.dossier_id ?? null,
      type: message.type,
      destinataire: message.destinataire,
      sujet: message.sujet,
      corps_html: message.corps_html,
      pieces_jointes: message.pieces_jointes ?? [],
      statut,
      erreur,
    });
    return { id, statut };
  }
}

export function creerTransportSmtp(url: string): Transporter {
  return nodemailer.createTransport(url);
}
