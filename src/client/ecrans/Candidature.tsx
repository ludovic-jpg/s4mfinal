/** Module 1, côté candidat — dossier de candidature du formateur (F-ONB-01, F-ONB-03). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, Trash2 } from "lucide-react";
import { api, ErreurApi, instantFr, octets, type Candidature } from "../api";
import { Alerte, Bouton, Carte, Champ, Chargement, DepotFichier, Etiquette, ListeManques, TitrePage, ZoneTexte, useNotifier } from "../ui/base";

const STATUTS: Record<string, { libelle: string; ton: "neutre" | "attente" | "accent" | "danger" }> = {
  brouillon: { libelle: "À compléter", ton: "neutre" },
  soumise: { libelle: "En cours d'étude", ton: "attente" },
  validee: { libelle: "Validée", ton: "accent" },
  refusee: { libelle: "Non retenue", ton: "danger" },
};

export function MaCandidature() {
  const requetes = useQueryClient();
  const notifier = useNotifier();
  const candidature = useQuery({ queryKey: ["candidature"], queryFn: () => api.get<Candidature>("/candidature") });
  const maj = (c: Candidature) => requetes.setQueryData(["candidature"], c);
  const deposer = useMutation({ mutationFn: (v: { type: string; fichier: File }) => api.fichier<Candidature>("/candidature/pieces", v.fichier, { type: v.type }), onSuccess: maj, onError: (e) => notifier("danger", e.message) });
  const retirer = useMutation({ mutationFn: (id: string) => api.suppr<Candidature>(`/candidature/pieces/${id}`), onSuccess: maj });
  const soumettre = useMutation({
    mutationFn: () => api.post<Candidature>("/candidature/soumettre"),
    onSuccess: async (c) => {
      maj(c);
      await requetes.invalidateQueries({ queryKey: ["moi"] });
      notifier("succes", "Candidature envoyée. Vous recevrez la décision par e-mail.");
    },
    onError: (e) => notifier("danger", e.message),
  });

  if (candidature.isPending) return <Chargement />;
  if (candidature.error) return <Alerte ton="danger">{candidature.error.message}</Alerte>;
  const c = candidature.data;
  const statut = STATUTS[c.formateur.statut_candidature]!;
  const fige = c.formateur.statut_candidature === "soumise" || c.formateur.statut_candidature === "validee";

  return (
    <div className="mx-auto max-w-3xl">
      <TitrePage titre="Ma candidature" soustitre="Vos coordonnées, votre parcours et vos justificatifs. L'organisme étudie le dossier et vous répond par e-mail." actions={<Etiquette ton={statut.ton}>{statut.libelle}</Etiquette>} />

      {c.formateur.statut_candidature === "validee" && <div className="mb-6"><Alerte ton="succes" titre="Votre candidature est validée">Vous pouvez créer vos formations et instruire vos dossiers.</Alerte></div>}
      {c.formateur.statut_candidature === "soumise" && <div className="mb-6"><Alerte titre={`Candidature envoyée le ${instantFr(c.formateur.soumise_le)}`}>Elle est en cours d'étude. Vous serez prévenu par e-mail.</Alerte></div>}
      {c.formateur.statut_candidature === "refusee" && <div className="mb-6"><Alerte ton="attention" titre="Votre candidature n'a pas été retenue en l'état">{c.formateur.motif_decision} — vous pouvez la compléter et la soumettre à nouveau.</Alerte></div>}

      <div className="space-y-6">
        <Carte className="p-5"><Profil c={c} fige={fige} surMaj={maj} /></Carte>

        <Carte className="p-5">
          <h2 className="text-base font-semibold">Pièces justificatives</h2>
          <ul className="mt-3 divide-y divide-trait">
            {c.types.map((t) => {
              const pieces = c.pieces.filter((p) => p.type === t.type);
              return (
                <li key={t.type} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {pieces.length > 0 && <Check className="size-4 text-valide" aria-hidden />}
                      {t.libelle}
                      {t.obligatoire && pieces.length === 0 && <Etiquette ton="attente">Obligatoire</Etiquette>}
                    </p>
                    {!fige && <DepotFichier compact libelle="Ajouter" enCours={deposer.isPending && deposer.variables?.type === t.type} deposer={(fichier) => deposer.mutate({ type: t.type, fichier })} />}
                  </div>
                  {pieces.map((p) => (
                    <div key={p.id} className="mt-2 flex items-center justify-between gap-2 rounded-sm bg-papier-2 px-3 py-1.5 text-[13px]">
                      <span className="min-w-0 truncate">{p.nom_fichier} <span className="chiffres text-encre-3">· {octets(p.taille)}</span></span>
                      <span className="flex shrink-0 gap-1">
                        <a href={`/api/pieces-formateur/${p.id}`} aria-label={`Télécharger ${p.nom_fichier}`} className="rounded-xs p-1.5 text-encre-3 hover:bg-papier-3 hover:text-encre"><Download className="size-3.5" /></a>
                        {!fige && <button type="button" aria-label={`Retirer ${p.nom_fichier}`} onClick={() => retirer.mutate(p.id)} className="rounded-xs p-1.5 text-encre-3 hover:bg-papier-3 hover:text-danger"><Trash2 className="size-3.5" /></button>}
                      </span>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        </Carte>

        {!fige && (
          <div className="space-y-4">
            <ListeManques titre="Pour envoyer votre candidature, il manque :" manques={c.manques} />
            <Bouton variante="primaire" disabled={c.manques.length > 0} enCours={soumettre.isPending} onClick={() => soumettre.mutate()}>Envoyer ma candidature</Bouton>
          </div>
        )}
      </div>
    </div>
  );
}

function Profil({ c, fige, surMaj }: { c: Candidature; fige: boolean; surMaj: (c: Candidature) => void }) {
  const notifier = useNotifier();
  const f = c.formateur;
  const [v, setV] = useState({
    formateur_prenom: f.formateur_prenom, formateur_nom: f.formateur_nom, formateur_telephone: f.formateur_telephone,
    formateur_entreprise_nom: f.formateur_entreprise_nom, formateur_entreprise_adresse: f.formateur_entreprise_adresse, formateur_entreprise_siret: f.formateur_entreprise_siret,
    formateur_nda_numero: f.formateur_nda_numero, formateur_dreets_region: f.formateur_dreets_region, formateur_iban: f.formateur_iban, formateur_bic: f.formateur_bic, parcours: f.parcours,
  });
  const enregistrer = useMutation({ mutationFn: () => api.patch<Candidature>("/candidature", v), onSuccess: (r) => { surMaj(r); notifier("succes", "Profil enregistré."); } });
  const err = enregistrer.error instanceof ErreurApi ? (enregistrer.error.details?.champs ?? {}) : {};
  const champ = (cle: keyof typeof v) => ({ value: v[cle], erreur: err[cle], disabled: fige && cle !== "formateur_telephone" && cle !== "formateur_iban" && cle !== "formateur_bic", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [cle]: e.target.value }) });

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); enregistrer.mutate(); }}>
      <h2 className="text-base font-semibold">Coordonnées</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <Champ libelle="Prénom" required {...champ("formateur_prenom")} />
        <Champ libelle="Nom" required {...champ("formateur_nom")} />
        <Champ libelle="Téléphone" type="tel" {...champ("formateur_telephone")} />
      </div>
      <h2 className="pt-2 text-base font-semibold">Votre entreprise</h2>
      <p className="-mt-2 text-[13px] text-encre-3">Ces informations figurent sur le contrat de sous-traitance et sur vos factures.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ libelle="Raison sociale" {...champ("formateur_entreprise_nom")} />
        <Champ libelle="SIRET" inputMode="numeric" {...champ("formateur_entreprise_siret")} />
      </div>
      <Champ libelle="Adresse" {...champ("formateur_entreprise_adresse")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ libelle="N° de déclaration d'activité" aide="Si vous en avez un." {...champ("formateur_nda_numero")} />
        <Champ libelle="Région de la DREETS" {...champ("formateur_dreets_region")} />
        <Champ libelle="IBAN" {...champ("formateur_iban")} />
        <Champ libelle="BIC" {...champ("formateur_bic")} />
      </div>
      <ZoneTexte libelle="Parcours professionnel" rows={5} aide="Votre expérience, vos domaines d'intervention, vos références." {...champ("parcours")} />
      <Bouton type="submit" enCours={enregistrer.isPending}>Enregistrer</Bouton>
    </form>
  );
}
