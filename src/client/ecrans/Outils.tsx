/** Module 3 — Mes outils pédagogiques : modèles de recueil, de test de positionnement et d'évaluation des acquis (F-OUT-01 à 03). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilRuler, Plus, Trash2 } from "lucide-react";
import { api, ErreurApi, type Formation, type Outil } from "../api";
import { Alerte, Bouton, Carte, Champ, Chargement, cx, EtatVide, Etiquette, Modale, Selecteur, TitrePage } from "../ui/base";

type TypeOutil = "recueil" | "positionnement" | "acquis";
const TYPES: Record<TypeOutil, { libelle: string; aide: string }> = {
  positionnement: { libelle: "Test de positionnement", aide: "QCM passé avant la formation, pour ajuster le programme (indicateur Qualiopi n° 8)." },
  acquis: { libelle: "Évaluation des acquis", aide: "QCM passé en fin de formation ; son score figure sur l'attestation (indicateur n° 11)." },
  recueil: { libelle: "Recueil des besoins", aide: "Les questions de l'organisme sont fixes ; vous pouvez y ajouter les vôtres." },
};
type Question = { enonce: string; propositions: string[]; bonne_reponse: number };

function Editeur({ initial, formations, fermer }: { initial?: Outil; formations: Formation[]; fermer: () => void }) {
  const requetes = useQueryClient();
  const contenu = initial?.contenu as { questions?: Question[]; questions_supplementaires?: string[] } | undefined;
  const [type, setType] = useState<TypeOutil>((initial?.type as TypeOutil) ?? "positionnement");
  const [titre, setTitre] = useState(initial?.titre ?? "");
  const [formationId, setFormationId] = useState(initial?.formation_id ?? "");
  const [questions, setQuestions] = useState<Question[]>(contenu?.questions ?? [{ enonce: "", propositions: ["", ""], bonne_reponse: 0 }]);
  const [libres, setLibres] = useState<string[]>(contenu?.questions_supplementaires ?? []);

  const enregistrer = useMutation({
    mutationFn: () => {
      const corps = { type, titre, formation_id: formationId || null, contenu: type === "recueil" ? { questions_supplementaires: libres.filter((q) => q.trim()) } : { titre, questions } };
      return initial ? api.put(`/outils/${initial.id}`, corps) : api.post("/outils", corps);
    },
    onSuccess: async () => {
      await requetes.invalidateQueries({ queryKey: ["outils"] });
      fermer();
    },
  });
  const details = enregistrer.error instanceof ErreurApi ? enregistrer.error.details?.erreurs : undefined;
  const maj = (i: number, q: Partial<Question>) => setQuestions(questions.map((x, k) => (k === i ? { ...x, ...q } : x)));

  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); enregistrer.mutate(); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Selecteur libelle="Type d'outil" value={type} disabled={!!initial} onChange={(e) => setType(e.target.value as TypeOutil)} aide={TYPES[type].aide}>
          {Object.entries(TYPES).map(([cle, t]) => <option key={cle} value={cle}>{t.libelle}</option>)}
        </Selecteur>
        <Selecteur libelle="Formation rattachée" value={formationId} onChange={(e) => setFormationId(e.target.value)} aide="Sans rattachement, le modèle sert de recours pour toutes vos formations.">
          <option value="">— Toutes mes formations —</option>
          {formations.map((f) => <option key={f.id} value={f.id}>{f.formation_titre}</option>)}
        </Selecteur>
      </div>
      <Champ libelle="Titre" required value={titre} onChange={(e) => setTitre(e.target.value)} />

      {type === "recueil" ? (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-[13px] font-medium text-encre-2">Questions supplémentaires</legend>
          {libres.map((q, i) => (
            <div key={i} className="flex gap-2">
              <input value={q} aria-label={`Question supplémentaire ${i + 1}`} onChange={(e) => setLibres(libres.map((x, k) => (k === i ? e.target.value : x)))} className="h-10 min-w-0 flex-1 rounded-sm border border-trait-fort bg-carte px-3 text-sm focus:border-accent focus:outline-none" />
              <Bouton variante="discret" aria-label="Retirer" icone={<Trash2 className="size-4" aria-hidden />} onClick={() => setLibres(libres.filter((_, k) => k !== i))} />
            </div>
          ))}
          <Bouton variante="discret" taille="sm" disabled={libres.length >= 10} icone={<Plus className="size-4" aria-hidden />} onClick={() => setLibres([...libres, ""])}>Ajouter une question</Bouton>
        </fieldset>
      ) : (
        <div className="space-y-4">
          {questions.map((q, i) => (
            <fieldset key={i} className="rounded-md border border-trait bg-papier-2/60 p-4">
              <div className="flex items-start gap-2">
                <span className="chiffres mt-2.5 w-6 shrink-0 font-display font-semibold text-accent">{i + 1}.</span>
                <input value={q.enonce} placeholder="Énoncé de la question" aria-label={`Énoncé de la question ${i + 1}`} onChange={(e) => maj(i, { enonce: e.target.value })} className="h-10 min-w-0 flex-1 rounded-sm border border-trait-fort bg-carte px-3 text-sm font-medium focus:border-accent focus:outline-none" />
                <Bouton variante="discret" aria-label="Supprimer la question" disabled={questions.length === 1} icone={<Trash2 className="size-4" aria-hidden />} onClick={() => setQuestions(questions.filter((_, k) => k !== i))} />
              </div>
              <div className="mt-3 space-y-1.5 pl-8">
                {q.propositions.map((p, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <input type="radio" name={`bonne-${i}`} checked={q.bonne_reponse === j} onChange={() => maj(i, { bonne_reponse: j })} aria-label={`Bonne réponse : proposition ${j + 1}`} className="size-4 shrink-0 accent-(--color-accent)" />
                    <input value={p} placeholder={`Proposition ${j + 1}`} aria-label={`Proposition ${j + 1}`} onChange={(e) => maj(i, { propositions: q.propositions.map((x, k) => (k === j ? e.target.value : x)) })} className={cx("h-9 min-w-0 flex-1 rounded-sm border bg-carte px-3 text-sm focus:border-accent focus:outline-none", q.bonne_reponse === j ? "border-valide" : "border-trait-fort")} />
                    <Bouton variante="discret" taille="sm" aria-label="Retirer la proposition" disabled={q.propositions.length <= 2} icone={<Trash2 className="size-3.5" aria-hidden />} onClick={() => maj(i, { propositions: q.propositions.filter((_, k) => k !== j), bonne_reponse: Math.min(q.bonne_reponse, q.propositions.length - 2) })} />
                  </div>
                ))}
                <Bouton variante="discret" taille="sm" disabled={q.propositions.length >= 8} icone={<Plus className="size-3.5" aria-hidden />} onClick={() => maj(i, { propositions: [...q.propositions, ""] })}>Proposition</Bouton>
              </div>
            </fieldset>
          ))}
          <p className="text-[13px] text-encre-3">Cochez la bonne réponse de chaque question. Le corrigé n'est jamais transmis à l'apprenant.</p>
          <Bouton disabled={questions.length >= 40} icone={<Plus className="size-4" aria-hidden />} onClick={() => setQuestions([...questions, { enonce: "", propositions: ["", ""], bonne_reponse: 0 }])}>Ajouter une question</Bouton>
        </div>
      )}

      {enregistrer.error && (
        <Alerte ton="danger" titre={enregistrer.error.message}>
          {Array.isArray(details) && <ul className="list-disc pl-4">{details.map((d) => <li key={d}>{d}</li>)}</ul>}
        </Alerte>
      )}
      <Bouton type="submit" variante="primaire" enCours={enregistrer.isPending}>Enregistrer le modèle</Bouton>
    </form>
  );
}

export function Outils() {
  const requetes = useQueryClient();
  const [edition, setEdition] = useState<{ outil?: Outil } | null>(null);
  const outils = useQuery({ queryKey: ["outils"], queryFn: () => api.get<Outil[]>("/outils") });
  const formations = useQuery({ queryKey: ["formations"], queryFn: () => api.get<Formation[]>("/formations") });
  const supprimer = useMutation({ mutationFn: (id: string) => api.suppr(`/outils/${id}`), onSuccess: () => requetes.invalidateQueries({ queryKey: ["outils"] }) });
  if (outils.isPending || formations.isPending) return <Chargement />;
  const titreFormation = (id: string | null) => formations.data?.find((f) => f.id === id)?.formation_titre;

  return (
    <>
      <TitrePage
        titre="Outils pédagogiques"
        soustitre="Vos modèles de questionnaires. À la création d'un dossier, celui de la formation est repris tel quel — le modifier ensuite ne réécrit pas les dossiers existants."
        actions={<Bouton variante="primaire" icone={<Plus className="size-4" aria-hidden />} onClick={() => setEdition({})}>Nouveau modèle</Bouton>}
      />
      {outils.data?.length ? (
        <Carte>
          <ul className="divide-y divide-trait">
            {outils.data.map((o) => {
              const nb = (o.contenu as { questions?: unknown[]; questions_supplementaires?: unknown[] }).questions?.length ?? (o.contenu as { questions_supplementaires?: unknown[] }).questions_supplementaires?.length ?? 0;
              return (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0">
                    <p className="font-medium">{o.titre}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-encre-2">
                      <Etiquette ton="accent">{TYPES[o.type as TypeOutil].libelle}</Etiquette>
                      <span className="chiffres">{nb} question(s)</span>
                      <span className="truncate">· {titreFormation(o.formation_id) ?? "Toutes mes formations"}</span>
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Bouton taille="sm" onClick={() => setEdition({ outil: o })}>Modifier</Bouton>
                    <Bouton variante="discret" taille="sm" aria-label={`Supprimer ${o.titre}`} icone={<Trash2 className="size-3.5" aria-hidden />} onClick={() => confirm(`Supprimer le modèle « ${o.titre} » ?`) && supprimer.mutate(o.id)} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Carte>
      ) : (
        <EtatVide icone={<PencilRuler className="size-8" aria-hidden />} titre="Aucun modèle pour l'instant" action={<Bouton variante="primaire" onClick={() => setEdition({})}>Créer un test de positionnement</Bouton>}>
          Sans test de positionnement, un dossier ne peut pas être soumis à la validation de l'organisme.
        </EtatVide>
      )}
      <Modale ouverte={edition !== null} fermer={() => setEdition(null)} titre={edition?.outil ? "Modifier le modèle" : "Nouveau modèle"} large>
        {edition && <Editeur initial={edition.outil} formations={formations.data ?? []} fermer={() => setEdition(null)} />}
      </Modale>
    </>
  );
}
