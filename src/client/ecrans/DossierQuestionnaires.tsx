/**
 * Questionnaires en ligne : recueil des besoins, test de positionnement, évaluation des acquis, satisfaction.
 * Le même composant sert à l'apprenant (pour lui-même) et au formateur (saisie à la place d'un stagiaire,
 * pour le recueil et le positionnement uniquement — c'est le serveur qui l'impose).
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList } from "lucide-react";
import type { ErreurApi} from "../api";
import { api, dateFr, type Dossier, type QuestionnaireVue } from "../api";
import { useActeur } from "../session";
import { Alerte, Bouton, Carte, Chargement, cx, Modale, PastilleStatut, ZoneTexte, useNotifier } from "../ui/base";
import { useRafraichirDossier } from "./DossierPieces";
import type { Champ as ChampFormulaire } from "@/domaine/formulaires/definitions";

export type TypeQuestionnaire = "recueil" | "positionnement" | "acquis" | "satisfaction_chaud" | "satisfaction_froid";

const DEFINITIONS: Record<TypeQuestionnaire, { libelle: string; code: string; aide: string }> = {
  recueil: { libelle: "Recueil des besoins", code: "00-AVT", aide: "Vos attentes et votre niveau de départ." },
  positionnement: { libelle: "Test de positionnement", code: "01-AVT", aide: "Quelques questions pour ajuster la formation à votre niveau." },
  acquis: { libelle: "Évaluation des acquis", code: "07-FIN", aide: "À renseigner en fin de formation, puis à signer." },
  satisfaction_chaud: { libelle: "Satisfaction à chaud", code: "08-FIN", aide: "Votre avis en fin de formation." },
  satisfaction_froid: { libelle: "Satisfaction à froid", code: "12-APR", aide: "Trois mois après : ce que la formation a changé." },
};

function Formulaire({ vue, enCours, erreurs, avecAjustement, envoyer }: { vue: QuestionnaireVue; enCours: boolean; erreurs: Record<string, string>; avecAjustement: boolean; envoyer: (reponses: unknown, ajustement: string) => void }) {
  const [texte, setTexte] = useState<Record<string, string>>((vue.reponses && !Array.isArray(vue.reponses) ? vue.reponses : {}) as Record<string, string>);
  const [choix, setChoix] = useState<Array<number | null>>(Array.isArray(vue.reponses) ? (vue.reponses as Array<number | null>) : (vue.questionnaire?.questions.map(() => null) ?? []));
  const [ajustement, setAjustement] = useState("");

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        envoyer(vue.questionnaire ? choix : texte, ajustement);
      }}
    >
      {vue.formulaire && <p className="text-sm text-encre-2">{vue.formulaire.introduction}</p>}

      {(vue.formulaire?.champs as ChampFormulaire[] | undefined)?.map((c) => (
        <fieldset key={c.id} className="min-w-0">
          <legend className="mb-2 text-sm font-medium text-encre">
            {c.libelle}
            {c.requis && <span className="text-danger"> *</span>}
          </legend>
          {c.type === "note" ? (
            <div className="flex gap-1.5" role="radiogroup" aria-label={c.libelle}>
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className={cx("chiffres grid size-10 cursor-pointer place-items-center rounded-sm border text-sm font-semibold transition-colors duration-150", texte[c.id] === String(n) ? "border-accent bg-accent text-sur-accent" : "border-trait-fort bg-carte text-encre-2 hover:border-accent hover:text-accent")}>
                  <input type="radio" name={c.id} value={n} checked={texte[c.id] === String(n)} onChange={() => setTexte({ ...texte, [c.id]: String(n) })} className="sr-only" />
                  {n}
                </label>
              ))}
            </div>
          ) : c.type === "choix" ? (
            <div className="flex flex-wrap gap-2">
              {c.options?.map((o) => (
                <label key={o} className={cx("cursor-pointer rounded-full border px-3.5 py-1.5 text-sm transition-colors duration-150", texte[c.id] === o ? "border-accent bg-accent-doux font-medium text-accent-fort" : "border-trait-fort bg-carte text-encre-2 hover:border-accent")}>
                  <input type="radio" name={c.id} value={o} checked={texte[c.id] === o} onChange={() => setTexte({ ...texte, [c.id]: o })} className="sr-only" />
                  {o}
                </label>
              ))}
            </div>
          ) : (
            <textarea
              rows={c.type === "texte_long" ? 3 : 1}
              value={texte[c.id] ?? ""}
              onChange={(e) => setTexte({ ...texte, [c.id]: e.target.value })}
              aria-label={c.libelle}
              className="w-full rounded-sm border border-trait-fort bg-carte px-3 py-2.5 text-sm leading-relaxed hover:border-encre-3 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
            />
          )}
          {erreurs[c.id] && <p className="mt-1.5 text-[13px] text-danger">{erreurs[c.id]}</p>}
        </fieldset>
      ))}

      {vue.questionnaire?.questions.map((q, i) => (
        <fieldset key={i} className="min-w-0">
          <legend className="mb-2.5 text-sm font-medium text-encre">
            <span className="chiffres mr-2 text-accent">{i + 1}.</span>
            {q.enonce}
          </legend>
          <div className="space-y-1.5">
            {q.propositions.map((p, j) => (
              <label key={j} className={cx("flex cursor-pointer items-start gap-3 rounded-sm border px-3.5 py-2.5 text-sm transition-colors duration-150", choix[i] === j ? "border-accent bg-accent-doux" : "border-trait bg-carte hover:border-trait-fort")}>
                <input type="radio" name={`q${i}`} checked={choix[i] === j} onChange={() => setChoix(choix.map((c, k) => (k === i ? j : c)))} className="mt-0.5 size-4 shrink-0 accent-(--color-accent)" />
                {p}
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      {avecAjustement && <ZoneTexte libelle="Ajustement du programme retenu (facultatif)" aide="Ce que ce positionnement vous amène à adapter. Figurera sur la pièce." value={ajustement} onChange={(e) => setAjustement(e.target.value)} />}

      <Bouton type="submit" variante="primaire" enCours={enCours} className="w-full sm:w-auto">
        Enregistrer mes réponses
      </Bouton>
    </form>
  );
}

function ModaleQuestionnaire({ d, type, stagiaireId, fermer }: { d: Dossier; type: TypeQuestionnaire; stagiaireId?: string; fermer: () => void }) {
  const acteur = useActeur();
  const rafraichir = useRafraichirDossier(d.id);
  const notifier = useNotifier();
  const suffixe = stagiaireId ? `?stagiaire_id=${stagiaireId}` : "";
  const vue = useQuery({ queryKey: ["questionnaire", d.id, type, stagiaireId], queryFn: () => api.get<QuestionnaireVue>(`/dossiers/${d.id}/questionnaires/${type}${suffixe}`), staleTime: 0 });
  const envoi = useMutation({
    mutationFn: (v: { reponses: unknown; ajustement: string }) => api.post<{ score: number | null }>(`/dossiers/${d.id}/questionnaires/${type}`, { ...v, stagiaire_id: stagiaireId }),
    onSuccess: async (r) => {
      await rafraichir();
      notifier("succes", r.score !== null && acteur.role !== "apprenant" ? `Réponses enregistrées — score : ${r.score} / 100.` : "Réponses enregistrées.");
      fermer();
    },
  });
  const details = (envoi.error as ErreurApi | null)?.details?.erreurs;
  const erreursChamps = details && !Array.isArray(details) ? details : {};

  return (
    <Modale ouverte fermer={fermer} titre={DEFINITIONS[type].libelle}>
      {vue.isPending ? (
        <Chargement />
      ) : vue.error ? (
        <Alerte ton="danger">{vue.error.message}</Alerte>
      ) : !vue.data.formulaire && !vue.data.questionnaire ? (
        <Alerte ton="attention" titre="Aucun questionnaire rattaché">Le formateur n'a pas de modèle pour cette évaluation. Il peut en créer un dans « Outils pédagogiques », puis recréer le dossier.</Alerte>
      ) : (
        <>
          {envoi.error && <div className="mb-5"><Alerte ton="danger">{envoi.error.message}</Alerte></div>}
          <Formulaire vue={vue.data} enCours={envoi.isPending} erreurs={erreursChamps} avecAjustement={type === "positionnement" && acteur.role === "formateur"} envoyer={(reponses, ajustement) => envoi.mutate({ reponses, ajustement })} />
        </>
      )}
    </Modale>
  );
}

/** Liste des questionnaires d'un stagiaire, avec leur état. `pourStagiaire` : le formateur saisit à sa place. */
export function Questionnaires({ d, stagiaireId, types }: { d: Dossier; stagiaireId: string; types: TypeQuestionnaire[] }) {
  const acteur = useActeur();
  const [ouvert, setOuvert] = useState<TypeQuestionnaire | null>(null);
  const lignes = types
    .map((type) => ({ type, def: DEFINITIONS[type], etat: d.questionnaires_etat.find((q) => q.type === type && q.stagiaire_id === stagiaireId) }))
    .filter((l) => l.etat !== undefined);
  if (lignes.length === 0) return <Alerte>Aucun questionnaire n'est ouvert pour l'instant.</Alerte>;

  return (
    <Carte>
      <ul className="divide-y divide-trait">
        {lignes.map(({ type, def, etat }) => {
          const evaluation = d.evaluations.find((e) => e.type === type && e.stagiaire_id === stagiaireId);
          const fait = etat!.valide;
          const aSigner = !fait && evaluation !== undefined && type === "acquis";
          return (
            <li key={type} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
              <div className="flex min-w-0 items-start gap-3">
                {fait ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-valide" aria-hidden /> : <ClipboardList className="mt-0.5 size-5 shrink-0 text-encre-3" aria-hidden />}
                <div className="min-w-0">
                  <p className="font-medium">{def.libelle}</p>
                  <p className="text-[13px] text-encre-2">
                    {evaluation ? `Renseigné le ${dateFr(evaluation.date)}${evaluation.score !== null ? ` — ${evaluation.score} / 100` : ""}` : def.aide}
                    {aSigner && " · reste à signer dans vos documents"}
                  </p>
                </div>
              </div>
              {fait ? (
                <PastilleStatut statut="valide" libelle="Validé" />
              ) : (
                etat!.ouvert && (
                  <Bouton variante={acteur.role === "apprenant" ? "primaire" : "secondaire"} taille="sm" onClick={() => setOuvert(type)}>
                    {evaluation ? "Modifier" : acteur.role === "apprenant" ? "Répondre" : "Saisir les réponses"}
                  </Bouton>
                )
              )}
            </li>
          );
        })}
      </ul>
      {ouvert && <ModaleQuestionnaire d={d} type={ouvert} stagiaireId={acteur.role === "apprenant" ? undefined : stagiaireId} fermer={() => setOuvert(null)} />}
    </Carte>
  );
}
