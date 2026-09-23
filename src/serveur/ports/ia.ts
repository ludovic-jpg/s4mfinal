/**
 * Port « IA pédagogique » : rédaction de BROUILLONS (QCM, objectifs, programme) pour l'espace pédagogique.
 *
 * Cahier des charges oral du 23/09/2026 : l'IA est utile sur les supports pédagogiques, et seulement là ;
 * tout le reste (conventions, pièces, montants, statuts) doit être exact, donc produit sans IA.
 * Seul le service `pedagogie-ia` utilise ce port — un test de garde le vérifie.
 *
 * Sans clé ni modèle configurés, l'IA est simplement indisponible : l'application fonctionne, les boutons
 * « Proposer avec l'IA » sont masqués. Aucune donnée d'apprenant n'est jamais envoyée : uniquement la
 * description de la FORMATION (intitulé, objectifs, programme…).
 */

export interface AssistantPedagogique {
  readonly disponible: boolean;
  /** Envoie une consigne et retourne le texte brut de la réponse. Lève une erreur lisible en cas d'échec. */
  rediger(consigneSysteme: string, demande: string, options?: OptionsRedaction): Promise<string>;
}

export interface OptionsRedaction {
  /** Autorise l'IA à mener une recherche web avant de rédiger (si le serveur l'a activée : IA_RECHERCHE_WEB=oui). */
  recherche?: boolean;
  /** Longueur maximale de la réponse (les plans de diaporama sont longs). */
  maxTokens?: number;
}

export const iaIndisponible: AssistantPedagogique = {
  disponible: false,
  rediger: () => Promise.reject(new Error("L'assistant IA n'est pas configuré sur ce serveur.")),
};

/**
 * Adaptateur Claude (API Messages d'Anthropic). Clé et modèle viennent de l'environnement
 * (`ANTHROPIC_API_KEY`, `IA_MODELE`) ; la liste des modèles est sur https://docs.claude.com.
 */
export class IaAnthropic implements AssistantPedagogique {
  readonly disponible = true;
  constructor(
    private readonly cle: string,
    private readonly modele: string,
    private readonly appel: typeof fetch = fetch,
    private readonly delaiMs = 180_000,
    private readonly rechercheWeb = false,
  ) {}

  async rediger(consigneSysteme: string, demande: string, options: OptionsRedaction = {}): Promise<string> {
    // Recherche web côté serveur d'Anthropic (outil « web_search ») : seulement si elle est activée ET demandée.
    const outils = this.rechercheWeb && options.recherche ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }] } : {};
    const reponse = await this.appel("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.cle, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: this.modele, max_tokens: options.maxTokens ?? 4096, system: consigneSysteme, messages: [{ role: "user", content: demande }], ...outils }),
      signal: AbortSignal.timeout(this.delaiMs),
    });
    if (!reponse.ok) {
      // On ne recopie jamais le corps de l'erreur à l'utilisateur : il peut contenir des détails de compte.
      throw new Error(reponse.status === 401 ? "Clé d'API IA refusée : vérifiez ANTHROPIC_API_KEY." : `L'assistant IA a répondu une erreur (${reponse.status}). Réessayez dans un instant.`);
    }
    const corps = (await reponse.json()) as { content?: Array<{ type: string; text?: string }> };
    const texte = (corps.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    if (!texte.trim()) throw new Error("L'assistant IA a renvoyé une réponse vide.");
    return texte;
  }
}

export function creerAssistant(cle: string, modele: string, rechercheWeb = false): AssistantPedagogique {
  return cle && modele ? new IaAnthropic(cle, modele, fetch, 180_000, rechercheWeb) : iaIndisponible;
}
