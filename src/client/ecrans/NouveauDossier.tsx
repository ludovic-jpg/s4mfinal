/**
 * Création d'un dossier — F-DOS-02 impose l'ordre : l'apprenant, son entreprise, la formation, la modalité,
 * le financement. Cinq étapes courtes plutôt qu'un formulaire de 900 lignes (irritant relevé par l'audit de l'ancien outil).
 * Les fiches manquantes se créent sur place, sans quitter le parcours.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Plus } from "lucide-react";
import { api, euros, heuresFr, type Entreprise, type Formation, type Stagiaire } from "../api";
import { Alerte, Bouton, Carte, Chargement, cx, Modale, TitrePage } from "../ui/base";
import { FormulaireEntreprise, FormulaireStagiaire } from "./Repertoire";
import { FormulaireFormation } from "./Formations";

const ETAPES = ["Apprenant(s)", "Entreprise", "Formation", "Modalité", "Financement"];
const MODALITES = [
  { cle: "presentiel", titre: "Présentiel", detail: "Sur site, avec le formateur. Le lieu est pré-rempli avec l'adresse de l'entreprise." },
  { cle: "distanciel", titre: "Distanciel", detail: "En classe virtuelle. Un lien de connexion sera demandé." },
  { cle: "mixte", titre: "Mixte", detail: "Une partie sur site, une partie à distance." },
] as const;
const FINANCEMENTS = [
  { cle: "opco", titre: "OPCO", detail: "Prise en charge par l'opérateur de compétences, avec subrogation de paiement." },
  { cle: "faf", titre: "FAF", detail: "Fonds d'assurance formation des non-salariés." },
  { cle: "entreprise", titre: "Entreprise", detail: "Financement direct par l'entreprise, sans organisme tiers." },
  { cle: "fonds_propres", titre: "Fonds propres", detail: "Le stagiaire finance lui-même sa formation." },
] as const;

function Choix({ actif, titre, detail, onClick, multiple = false }: { actif: boolean; titre: string; detail?: string; onClick: () => void; multiple?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={cx("flex w-full items-start gap-3 rounded-md border p-4 text-left transition-colors duration-150", actif ? "border-accent bg-accent-doux" : "border-trait bg-carte hover:border-trait-fort")}
    >
      <span className={cx("mt-0.5 grid size-5 shrink-0 place-items-center border", multiple ? "rounded-xs" : "rounded-full", actif ? "border-accent bg-accent text-sur-accent" : "border-trait-fort bg-carte")}>
        {actif && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{titre}</span>
        {detail && <span className="mt-0.5 block text-[13px] text-encre-2">{detail}</span>}
      </span>
    </button>
  );
}

export function NouveauDossier() {
  const navigate = useNavigate();
  const requetes = useQueryClient();
  const [etape, setEtape] = useState(0);
  const [creation, setCreation] = useState<"stagiaire" | "entreprise" | "formation" | null>(null);
  const [v, setV] = useState({ stagiaire_ids: [] as string[], entreprise_id: "", formation_id: "", formation_modalite: "presentiel", mode_financement: "opco" });

  const stagiaires = useQuery({ queryKey: ["stagiaires"], queryFn: () => api.get<Stagiaire[]>("/stagiaires") });
  const entreprises = useQuery({ queryKey: ["entreprises"], queryFn: () => api.get<Entreprise[]>("/entreprises") });
  const formations = useQuery({ queryKey: ["formations"], queryFn: () => api.get<Formation[]>("/formations") });
  const creer = useMutation({
    mutationFn: () => api.post<{ id: string }>("/dossiers", v),
    onSuccess: async (d) => {
      await requetes.invalidateQueries({ queryKey: ["dossiers"] });
      navigate({ to: "/dossiers/$id", params: { id: d.id } });
    },
  });

  if (stagiaires.isPending || entreprises.isPending || formations.isPending) return <Chargement />;
  const pret = [v.stagiaire_ids.length > 0, v.entreprise_id !== "", v.formation_id !== "", true, true][etape];

  const basculer = (id: string) => {
    const dedans = v.stagiaire_ids.includes(id);
    const stagiaire_ids = dedans ? v.stagiaire_ids.filter((x) => x !== id) : [...v.stagiaire_ids, id].slice(0, 8);
    // L'entreprise du premier apprenant choisi est proposée d'office à l'étape suivante.
    const premiere = stagiaires.data?.find((s) => s.id === stagiaire_ids[0])?.entreprise_id ?? "";
    setV({ ...v, stagiaire_ids, entreprise_id: v.entreprise_id || premiere });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <TitrePage titre="Nouveau dossier de formation" soustitre="Cinq choix, puis le dossier s'ouvre pré-rempli : vous n'aurez plus qu'à préciser les dates et le planning." />

      <ol className="mb-6 grid grid-cols-5 gap-1.5" aria-label="Étapes">
        {ETAPES.map((e, i) => (
          <li key={e} aria-current={i === etape ? "step" : undefined}>
            <span className={cx("block h-1.5 rounded-full", i < etape ? "bg-valide" : i === etape ? "bg-attente" : "bg-papier-3")} />
            <span className={cx("mt-1.5 block truncate text-[11px] font-medium", i === etape ? "text-encre" : "text-encre-3")}>{e}</span>
          </li>
        ))}
      </ol>

      <Carte className="p-5 sm:p-6">
        {etape === 0 && (
          <Etape titre="Qui suit la formation ?" aide="De 1 à 8 apprenants. Une fiche se réutilise d'un dossier à l'autre." creer={() => setCreation("stagiaire")} libelleCreer="Nouvelle fiche apprenant">
            {stagiaires.data?.map((s) => <Choix key={s.id} multiple actif={v.stagiaire_ids.includes(s.id)} titre={`${s.stagiaire_prenom} ${s.stagiaire_nom}`} detail={[s.stagiaire_poste, s.stagiaire_email].filter(Boolean).join(" · ")} onClick={() => basculer(s.id)} />)}
          </Etape>
        )}
        {etape === 1 && (
          <Etape titre="Quelle entreprise commande la formation ?" aide="Elle signera la convention et recevra les pièces du financement." creer={() => setCreation("entreprise")} libelleCreer="Nouvelle entreprise">
            {entreprises.data?.map((e) => <Choix key={e.id} actif={v.entreprise_id === e.id} titre={e.entreprise_nom} detail={[e.entreprise_adresse, e.entreprise_siret && `SIRET ${e.entreprise_siret}`].filter(Boolean).join(" · ")} onClick={() => setV({ ...v, entreprise_id: e.id })} />)}
          </Etape>
        )}
        {etape === 2 && (
          <Etape titre="Quelle formation ?" aide="Objectifs, durée, prix et questionnaires sont repris de votre catalogue." creer={() => setCreation("formation")} libelleCreer="Nouvelle formation">
            {formations.data?.map((f) => <Choix key={f.id} actif={v.formation_id === f.id} titre={f.formation_titre} detail={[heuresFr(f.formation_duree_heures_total), f.formation_niveau, f.formation_prix_unitaire_ht !== null && `${euros(f.formation_prix_unitaire_ht)} HT / stagiaire`].filter(Boolean).join(" · ")} onClick={() => setV({ ...v, formation_id: f.id })} />)}
          </Etape>
        )}
        {etape === 3 && (
          <Etape titre="Comment se déroule-t-elle ?">
            {MODALITES.map((m) => <Choix key={m.cle} actif={v.formation_modalite === m.cle} titre={m.titre} detail={m.detail} onClick={() => setV({ ...v, formation_modalite: m.cle })} />)}
          </Etape>
        )}
        {etape === 4 && (
          <Etape titre="Qui la finance ?">
            {FINANCEMENTS.map((m) => <Choix key={m.cle} actif={v.mode_financement === m.cle} titre={m.titre} detail={m.detail} onClick={() => setV({ ...v, mode_financement: m.cle })} />)}
          </Etape>
        )}

        {creer.error && <div className="mt-4"><Alerte ton="danger">{creer.error.message}</Alerte></div>}

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-trait pt-5">
          <Bouton variante="discret" disabled={etape === 0} icone={<ArrowLeft className="size-4" aria-hidden />} onClick={() => setEtape(etape - 1)}>
            Précédent
          </Bouton>
          {etape < 4 ? (
            <Bouton variante="primaire" disabled={!pret} onClick={() => setEtape(etape + 1)}>
              Continuer <ArrowRight className="size-4" aria-hidden />
            </Bouton>
          ) : (
            <Bouton variante="primaire" enCours={creer.isPending} onClick={() => creer.mutate()}>
              Créer le dossier
            </Bouton>
          )}
        </div>
      </Carte>

      <Modale ouverte={creation === "stagiaire"} fermer={() => setCreation(null)} titre="Nouvelle fiche apprenant">
        <FormulaireStagiaire entreprises={entreprises.data ?? []} termine={(s) => { setCreation(null); if (s) basculer(s.id); }} />
      </Modale>
      <Modale ouverte={creation === "entreprise"} fermer={() => setCreation(null)} titre="Nouvelle entreprise">
        <FormulaireEntreprise termine={(e) => { setCreation(null); if (e) setV((x) => ({ ...x, entreprise_id: e.id })); }} />
      </Modale>
      <Modale ouverte={creation === "formation"} fermer={() => setCreation(null)} titre="Nouvelle formation">
        <FormulaireFormation termine={(f) => { setCreation(null); if (f) setV((x) => ({ ...x, formation_id: f.id })); }} />
      </Modale>
    </div>
  );
}

function Etape({ titre, aide, children, creer, libelleCreer }: { titre: string; aide?: string; children: React.ReactNode; creer?: () => void; libelleCreer?: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{titre}</h2>
      {aide && <p className="mt-1 text-sm text-encre-2">{aide}</p>}
      <div className="mt-4 space-y-2">{children}</div>
      {creer && (
        <Bouton variante="discret" className="mt-3" icone={<Plus className="size-4" aria-hidden />} onClick={creer}>
          {libelleCreer}
        </Bouton>
      )}
    </div>
  );
}
