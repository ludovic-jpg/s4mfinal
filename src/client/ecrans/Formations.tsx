/** Module 2 — Mes formations (F-FORM-01/02) et coffre-fort pédagogique rattaché à chaque formation (F-OUT-04/05). */
import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Copy, Download, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { api, ErreurApi, euros, heuresFr, octets, type FichierCoffre, type Formation, type Outil } from "../api";
import { Alerte, Bouton, Carte, Champ, Chargement, DepotFichier, EtatVide, Etiquette, Modale, Selecteur, TitrePage, ZoneTexte, useNotifier } from "../ui/base";
import { BoutonIaProgramme } from "./AssistantIa";

const nombre = (x: string) => (x.trim() === "" ? null : Number(x.replace(",", ".")));

export function FormulaireFormation({ initiale, termine }: { initiale?: Formation; termine: (f?: Formation) => void }) {
  const requetes = useQueryClient();
  const [v, setV] = useState({
    formation_titre: initiale?.formation_titre ?? "",
    formation_objectifs: initiale?.formation_objectifs ?? "",
    formation_niveau: initiale?.formation_niveau ?? "",
    formation_prerequis: initiale?.formation_prerequis ?? "",
    heures: initiale?.formation_duree_heures_total?.toString() ?? "",
    jours: initiale?.formation_duree_jours?.toString() ?? "",
    formation_modalite: initiale?.formation_modalite ?? "presentiel",
    prix: initiale?.formation_prix_unitaire_ht != null ? String(initiale.formation_prix_unitaire_ht / 100) : "",
    public_vise: initiale?.public_vise ?? "",
    programme: initiale?.programme ?? "",
  });
  const enregistrer = useMutation({
    mutationFn: () => {
      const { heures, jours, prix, ...reste } = v;
      const corps = { ...reste, formation_duree_heures_total: nombre(heures), formation_duree_jours: nombre(jours), formation_prix_unitaire_ht: prix.trim() === "" ? null : Math.round(nombre(prix)! * 100) };
      return initiale ? api.patch<Formation>(`/formations/${initiale.id}`, corps) : api.post<Formation>("/formations", corps);
    },
    onSuccess: async (f) => {
      await requetes.invalidateQueries({ queryKey: ["formations"] });
      termine(f);
    },
  });
  const err = enregistrer.error instanceof ErreurApi ? (enregistrer.error.details?.champs ?? {}) : {};
  const champ = (cle: keyof typeof v) => ({ value: v[cle], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [cle]: e.target.value }) });

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); enregistrer.mutate(); }}>
      <Champ libelle="Intitulé de la formation" required erreur={err.formation_titre} {...champ("formation_titre")} />
      <ZoneTexte libelle="Objectifs pédagogiques" aide="Un objectif par ligne. Repris tels quels sur la convention et l'attestation." {...champ("formation_objectifs")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ libelle="Niveau" placeholder="Débutant, intermédiaire…" {...champ("formation_niveau")} />
        <Selecteur libelle="Modalité habituelle" value={v.formation_modalite} onChange={(e) => setV({ ...v, formation_modalite: e.target.value as typeof v.formation_modalite })}>
          <option value="presentiel">Présentiel</option>
          <option value="distanciel">Distanciel</option>
          <option value="mixte">Mixte</option>
        </Selecteur>
      </div>
      <ZoneTexte libelle="Prérequis" rows={2} {...champ("formation_prerequis")} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Champ libelle="Durée (heures)" inputMode="decimal" erreur={err.formation_duree_heures_total} {...champ("heures")} />
        <Champ libelle="Durée (jours)" inputMode="decimal" {...champ("jours")} />
        <Champ libelle="Prix HT / stagiaire (€)" inputMode="decimal" {...champ("prix")} />
      </div>
      <Champ libelle="Public visé" {...champ("public_vise")} />
      <BoutonIaProgramme
        contexte={{ formation_titre: v.formation_titre, formation_niveau: v.formation_niveau, public_vise: v.public_vise, formation_prerequis: v.formation_prerequis, formation_duree_heures_total: nombre(v.heures) }}
        recevoir={(p) => setV((x) => ({ ...x, formation_objectifs: p.formation_objectifs, programme: p.programme }))}
      />
      <ZoneTexte libelle="Programme détaillé" rows={5} aide="Annexé à la convention (pièce « Programme de formation ») : obligatoire pour soumettre un dossier." {...champ("programme")} />
      {enregistrer.error && Object.keys(err).length === 0 && <Alerte ton="danger">{enregistrer.error.message}</Alerte>}
      <Bouton type="submit" variante="primaire" enCours={enregistrer.isPending}>
        Enregistrer
      </Bouton>
    </form>
  );
}

export function Formations() {
  const [creation, setCreation] = useState(false);
  const navigate = useNavigate();
  const formations = useQuery({ queryKey: ["formations"], queryFn: () => api.get<Formation[]>("/formations") });
  if (formations.isPending) return <Chargement />;
  return (
    <>
      <TitrePage
        titre="Mes formations"
        soustitre="Votre catalogue. Chaque dossier part d'une formation : objectifs, durée, prix et questionnaires sont repris automatiquement."
        actions={<Bouton variante="primaire" icone={<Plus className="size-4" aria-hidden />} onClick={() => setCreation(true)}>Nouvelle formation</Bouton>}
      />
      {formations.data?.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {formations.data.map((f) => (
            <Link key={f.id} to="/formations/$id" params={{ id: f.id }} className="flex flex-col rounded-md border border-trait bg-carte p-5 shadow-carte transition-[border-color,transform] duration-150 ease-(--ease-out) hover:-translate-y-px hover:border-accent/60">
              <p className="font-display text-[16px] leading-snug font-semibold">{f.formation_titre}</p>
              <p className="mt-2 line-clamp-3 flex-1 text-[13px] leading-relaxed whitespace-pre-line text-encre-2">{f.formation_objectifs || "Objectifs à renseigner."}</p>
              <div className="chiffres mt-4 flex flex-wrap items-center gap-1.5">
                <Etiquette>{heuresFr(f.formation_duree_heures_total)}</Etiquette>
                {f.formation_niveau && <Etiquette>{f.formation_niveau}</Etiquette>}
                {f.formation_prix_unitaire_ht !== null && <Etiquette ton="accent">{euros(f.formation_prix_unitaire_ht)} HT</Etiquette>}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EtatVide icone={<BookOpen className="size-8" aria-hidden />} titre="Votre catalogue est vide" action={<Bouton variante="primaire" onClick={() => setCreation(true)}>Créer ma première formation</Bouton>}>
          Décrivez une formation une fois ; vous la réutiliserez pour chaque nouveau dossier.
        </EtatVide>
      )}
      <Modale ouverte={creation} fermer={() => setCreation(false)} titre="Nouvelle formation">
        <FormulaireFormation termine={(f) => { setCreation(false); if (f) navigate({ to: "/formations/$id", params: { id: f.id } }); }} />
      </Modale>
    </>
  );
}

export function FicheFormation() {
  const { id } = useParams({ from: "/app/formations/$id" });
  const navigate = useNavigate();
  const requetes = useQueryClient();
  const notifier = useNotifier();
  const formation = useQuery({ queryKey: ["formation", id], queryFn: () => api.get<Formation>(`/formations/${id}`) });
  const coffre = useQuery({ queryKey: ["coffre", id], queryFn: () => api.get<FichierCoffre[]>(`/formations/${id}/coffre`) });
  const outils = useQuery({ queryKey: ["outils"], queryFn: () => api.get<Outil[]>("/outils") });
  const rafraichirCoffre = () => requetes.invalidateQueries({ queryKey: ["coffre", id] });

  const dupliquer = useMutation({ mutationFn: () => api.post<Formation>(`/formations/${id}/dupliquer`), onSuccess: async (f) => { await requetes.invalidateQueries({ queryKey: ["formations"] }); navigate({ to: "/formations/$id", params: { id: f.id } }); notifier("succes", "Formation dupliquée, avec ses questionnaires."); } });
  const archiver = useMutation({ mutationFn: () => api.suppr(`/formations/${id}`), onSuccess: async () => { await requetes.invalidateQueries({ queryKey: ["formations"] }); navigate({ to: "/formations" }); } });
  const deposer = useMutation({ mutationFn: (f: File) => api.fichier(`/formations/${id}/coffre`, f), onSuccess: rafraichirCoffre, onError: (e) => notifier("danger", e.message) });
  const partager = useMutation({ mutationFn: (v: { id: string; partageable: boolean }) => api.patch(`/coffre/${v.id}`, { partageable: v.partageable }), onSuccess: rafraichirCoffre });
  const retirer = useMutation({ mutationFn: (fichierId: string) => api.suppr(`/coffre/${fichierId}`), onSuccess: rafraichirCoffre });

  if (formation.isPending) return <Chargement />;
  if (formation.error) return <Alerte ton="danger">{formation.error.message}</Alerte>;
  const lies = outils.data?.filter((o) => o.formation_id === id) ?? [];
  const TYPES: Record<string, string> = { recueil: "Recueil des besoins", positionnement: "Test de positionnement", acquis: "Évaluation des acquis" };

  return (
    <>
      <Link to="/formations" className="mb-3 inline-flex items-center gap-1.5 text-sm text-encre-3 hover:text-encre">
        <ArrowLeft className="size-4" aria-hidden /> Mes formations
      </Link>
      <TitrePage
        titre={formation.data.formation_titre}
        actions={
          <>
            <Bouton icone={<Copy className="size-4" aria-hidden />} enCours={dupliquer.isPending} onClick={() => dupliquer.mutate()}>Dupliquer</Bouton>
            <Bouton variante="discret" icone={<Trash2 className="size-4" aria-hidden />} onClick={() => confirm("Retirer cette formation du catalogue ? Les dossiers existants ne sont pas touchés.") && archiver.mutate()}>Retirer</Bouton>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Carte className="p-5">
          <FormulaireFormation key={formation.data.id} initiale={formation.data} termine={() => { void requetes.invalidateQueries({ queryKey: ["formation", id] }); notifier("succes", "Formation enregistrée."); }} />
        </Carte>

        <div className="min-w-0 space-y-6">
          <Carte className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Coffre-fort pédagogique</h2>
                <p className="mt-0.5 text-[13px] text-encre-2">Ouvert à l'apprenant dès l'accord de financement, pour les fichiers marqués « partagé ».</p>
              </div>
              <DepotFichier compact libelle="Ajouter" enCours={deposer.isPending} deposer={(f) => deposer.mutate(f)} />
            </div>
            {coffre.data?.length ? (
              <ul className="mt-4 divide-y divide-trait">
                {coffre.data.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{f.nom_fichier}</p>
                      <p className="chiffres text-xs text-encre-3">{octets(f.taille)}</p>
                    </div>
                    <Bouton variante="discret" taille="sm" onClick={() => partager.mutate({ id: f.id, partageable: !f.partageable })} icone={f.partageable ? <Eye className="size-3.5 text-valide" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />}>
                      {f.partageable ? "Partagé" : "Privé"}
                    </Bouton>
                    <a href={`/api/coffre/${f.id}/telecharger`} aria-label={`Télécharger ${f.nom_fichier}`} className="rounded-sm p-2 text-encre-3 hover:bg-papier-3 hover:text-encre"><Download className="size-4" /></a>
                    <Bouton variante="discret" taille="sm" aria-label={`Supprimer ${f.nom_fichier}`} icone={<Trash2 className="size-3.5" aria-hidden />} onClick={() => confirm(`Supprimer « ${f.nom_fichier} » ?`) && retirer.mutate(f.id)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-md border border-dashed border-trait-fort px-4 py-6 text-center text-sm text-encre-3">Aucun support pour l'instant.</p>
            )}
          </Carte>

          <Carte className="p-5">
            <h2 className="text-base font-semibold">Questionnaires rattachés</h2>
            <p className="mt-0.5 text-[13px] text-encre-2">Repris automatiquement par tout nouveau dossier créé sur cette formation.</p>
            {lies.length ? (
              <ul className="mt-3 space-y-1.5">
                {lies.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{o.titre}</span>
                    <Etiquette>{TYPES[o.type]}</Etiquette>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-encre-3">Aucun questionnaire rattaché.</p>
            )}
            <Link to="/outils" className="mt-4 inline-block text-sm font-medium text-accent underline-offset-4 hover:underline">Gérer mes outils pédagogiques</Link>
          </Carte>
        </div>
      </div>
    </>
  );
}
