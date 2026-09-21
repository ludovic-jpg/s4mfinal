/** Fiches Apprenant et entreprises clientes, réutilisables d'un dossier à l'autre (F-COM-01, F-COM-02). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Pencil, Plus, UserRound } from "lucide-react";
import { api, ErreurApi, type Entreprise, type Stagiaire } from "../api";
import { Alerte, Bouton, Carte, Champ, Chargement, EtatVide, Modale, Onglets, Selecteur, TitrePage } from "../ui/base";

const erreursDe = (e: unknown) => (e instanceof ErreurApi ? (e.details?.champs ?? {}) : {});

export function FormulaireEntreprise({ initiale, termine }: { initiale?: Entreprise; termine: (e?: Entreprise) => void }) {
  const requetes = useQueryClient();
  const [v, setV] = useState({
    entreprise_nom: initiale?.entreprise_nom ?? "",
    entreprise_nom_commercial: initiale?.entreprise_nom_commercial ?? "",
    entreprise_adresse: initiale?.entreprise_adresse ?? "",
    entreprise_siret: initiale?.entreprise_siret ?? "",
    entreprise_representant_civilite: initiale?.entreprise_representant_civilite ?? "",
    entreprise_representant_prenom: initiale?.entreprise_representant_prenom ?? "",
    entreprise_representant_nom: initiale?.entreprise_representant_nom ?? "",
    entreprise_representant_telephone: initiale?.entreprise_representant_telephone ?? "",
    entreprise_representant_email: initiale?.entreprise_representant_email ?? "",
  });
  const enregistrer = useMutation({
    mutationFn: () => (initiale ? api.patch<Entreprise>(`/entreprises/${initiale.id}`, v) : api.post<Entreprise>("/entreprises", v)),
    onSuccess: async (e) => {
      await requetes.invalidateQueries({ queryKey: ["entreprises"] });
      termine(e);
    },
  });
  const err = erreursDe(enregistrer.error);
  const champ = (cle: keyof typeof v) => ({ value: v[cle], erreur: err[cle], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [cle]: e.target.value }) });
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); enregistrer.mutate(); }}>
      <Champ libelle="Raison sociale" required {...champ("entreprise_nom")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ libelle="Nom commercial" {...champ("entreprise_nom_commercial")} />
        <Champ libelle="SIRET" inputMode="numeric" {...champ("entreprise_siret")} />
      </div>
      <Champ libelle="Adresse" {...champ("entreprise_adresse")} />
      <p className="pt-1 text-[13px] font-semibold text-encre-2">Représentant — signataire de la convention</p>
      <div className="grid gap-4 sm:grid-cols-[100px_minmax(0,1fr)_minmax(0,1fr)]">
        <Champ libelle="Civilité" placeholder="Mme" {...champ("entreprise_representant_civilite")} />
        <Champ libelle="Prénom" {...champ("entreprise_representant_prenom")} />
        <Champ libelle="Nom" {...champ("entreprise_representant_nom")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ libelle="E-mail" type="email" aide="Reçoit les pièces du financement à la validation du dossier." {...champ("entreprise_representant_email")} />
        <Champ libelle="Téléphone" type="tel" {...champ("entreprise_representant_telephone")} />
      </div>
      {enregistrer.error && Object.keys(err).length === 0 && <Alerte ton="danger">{enregistrer.error.message}</Alerte>}
      <Bouton type="submit" variante="primaire" enCours={enregistrer.isPending}>
        Enregistrer
      </Bouton>
    </form>
  );
}

export function FormulaireStagiaire({ initiale, entreprises, termine }: { initiale?: Stagiaire; entreprises: Entreprise[]; termine: (s?: Stagiaire) => void }) {
  const requetes = useQueryClient();
  const [v, setV] = useState({
    stagiaire_prenom: initiale?.stagiaire_prenom ?? "",
    stagiaire_nom: initiale?.stagiaire_nom ?? "",
    stagiaire_email: initiale?.stagiaire_email ?? "",
    stagiaire_telephone: initiale?.stagiaire_telephone ?? "",
    stagiaire_poste: initiale?.stagiaire_poste ?? "",
    entreprise_id: initiale?.entreprise_id ?? "",
  });
  const enregistrer = useMutation({
    mutationFn: () => {
      const corps = { ...v, entreprise_id: v.entreprise_id || null };
      return initiale ? api.patch<Stagiaire>(`/stagiaires/${initiale.id}`, corps) : api.post<Stagiaire>("/stagiaires", corps);
    },
    onSuccess: async (s) => {
      await requetes.invalidateQueries({ queryKey: ["stagiaires"] });
      termine(s);
    },
  });
  const err = erreursDe(enregistrer.error);
  const champ = (cle: keyof typeof v) => ({ value: v[cle], erreur: err[cle], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [cle]: e.target.value }) });
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); enregistrer.mutate(); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ libelle="Prénom" required {...champ("stagiaire_prenom")} />
        <Champ libelle="Nom" required {...champ("stagiaire_nom")} />
      </div>
      <Champ libelle="Adresse e-mail" type="email" aide="Sert à l'inviter dans son espace personnel." {...champ("stagiaire_email")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ libelle="Poste occupé" {...champ("stagiaire_poste")} />
        <Champ libelle="Téléphone" type="tel" {...champ("stagiaire_telephone")} />
      </div>
      <Selecteur libelle="Entreprise de rattachement" value={v.entreprise_id} onChange={(e) => setV({ ...v, entreprise_id: e.target.value })}>
        <option value="">— Aucune —</option>
        {entreprises.map((e) => (
          <option key={e.id} value={e.id}>{e.entreprise_nom}</option>
        ))}
      </Selecteur>
      {enregistrer.error && Object.keys(err).length === 0 && <Alerte ton="danger">{enregistrer.error.message}</Alerte>}
      <Bouton type="submit" variante="primaire" enCours={enregistrer.isPending}>
        Enregistrer
      </Bouton>
    </form>
  );
}

export function Repertoire() {
  const [onglet, setOnglet] = useState<"stagiaires" | "entreprises">("stagiaires");
  const [edition, setEdition] = useState<{ type: "stagiaire"; fiche?: Stagiaire } | { type: "entreprise"; fiche?: Entreprise } | null>(null);
  const stagiaires = useQuery({ queryKey: ["stagiaires"], queryFn: () => api.get<Stagiaire[]>("/stagiaires") });
  const entreprises = useQuery({ queryKey: ["entreprises"], queryFn: () => api.get<Entreprise[]>("/entreprises") });
  if (stagiaires.isPending || entreprises.isPending) return <Chargement />;
  const nomEntreprise = (id: string | null) => entreprises.data?.find((e) => e.id === id)?.entreprise_nom;

  return (
    <>
      <TitrePage
        titre="Apprenants et entreprises"
        soustitre="Vos fiches se réutilisent d'un dossier à l'autre : vous ne ressaisissez jamais la même personne."
        actions={
          <Bouton variante="primaire" icone={<Plus className="size-4" aria-hidden />} onClick={() => setEdition({ type: onglet === "stagiaires" ? "stagiaire" : "entreprise" })}>
            {onglet === "stagiaires" ? "Nouvelle fiche apprenant" : "Nouvelle entreprise"}
          </Bouton>
        }
      />
      <Onglets
        actif={onglet}
        choisir={setOnglet}
        onglets={[
          { cle: "stagiaires", libelle: "Apprenants", compteur: String(stagiaires.data?.length ?? 0) },
          { cle: "entreprises", libelle: "Entreprises", compteur: String(entreprises.data?.length ?? 0) },
        ]}
      />

      {onglet === "stagiaires" &&
        (stagiaires.data?.length ? (
          <Carte>
            <ul className="divide-y divide-trait">
              {stagiaires.data.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-papier-3 text-encre-2"><UserRound className="size-4" aria-hidden /></span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{s.stagiaire_prenom} {s.stagiaire_nom}</p>
                      <p className="truncate text-[13px] text-encre-2">{[s.stagiaire_poste, nomEntreprise(s.entreprise_id), s.stagiaire_email].filter(Boolean).join(" · ")}</p>
                    </div>
                  </div>
                  <Bouton variante="discret" taille="sm" aria-label={`Modifier ${s.stagiaire_prenom} ${s.stagiaire_nom}`} icone={<Pencil className="size-3.5" aria-hidden />} onClick={() => setEdition({ type: "stagiaire", fiche: s })} />
                </li>
              ))}
            </ul>
          </Carte>
        ) : (
          <EtatVide icone={<UserRound className="size-7" aria-hidden />} titre="Aucune fiche apprenant">Créez la fiche d'un apprenant pour pouvoir l'inscrire à un dossier de formation.</EtatVide>
        ))}

      {onglet === "entreprises" &&
        (entreprises.data?.length ? (
          <Carte>
            <ul className="divide-y divide-trait">
              {entreprises.data.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-papier-3 text-encre-2"><Building2 className="size-4" aria-hidden /></span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{e.entreprise_nom}</p>
                      <p className="truncate text-[13px] text-encre-2">{[e.entreprise_adresse, `${e.entreprise_representant_prenom} ${e.entreprise_representant_nom}`.trim()].filter(Boolean).join(" · ")}</p>
                    </div>
                  </div>
                  <Bouton variante="discret" taille="sm" aria-label={`Modifier ${e.entreprise_nom}`} icone={<Pencil className="size-3.5" aria-hidden />} onClick={() => setEdition({ type: "entreprise", fiche: e })} />
                </li>
              ))}
            </ul>
          </Carte>
        ) : (
          <EtatVide icone={<Building2 className="size-7" aria-hidden />} titre="Aucune entreprise">L'entreprise est le commanditaire : elle signe la convention et reçoit les pièces du financement.</EtatVide>
        ))}

      <Modale ouverte={edition?.type === "stagiaire"} fermer={() => setEdition(null)} titre={edition?.fiche ? "Modifier la fiche apprenant" : "Nouvelle fiche apprenant"}>
        {edition?.type === "stagiaire" && <FormulaireStagiaire initiale={edition.fiche} entreprises={entreprises.data ?? []} termine={() => setEdition(null)} />}
      </Modale>
      <Modale ouverte={edition?.type === "entreprise"} fermer={() => setEdition(null)} titre={edition?.fiche ? "Modifier l'entreprise" : "Nouvelle entreprise"}>
        {edition?.type === "entreprise" && <FormulaireEntreprise initiale={edition.fiche} termine={() => setEdition(null)} />}
      </Modale>
    </>
  );
}
