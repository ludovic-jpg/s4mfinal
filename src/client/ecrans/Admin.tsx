/** Espace de l'organisme : décision sur les candidatures (F-ONB-02/03) et configuration de l'organisme (multi-organismes). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, UserRoundCheck } from "lucide-react";
import { api, ErreurApi, instantFr, octets, type CandidatureAdmin, type LigneCandidature, type Organisme } from "../api";
import { Alerte, Bouton, Carte, Champ, Chargement, EtatVide, Etiquette, ListeManques, Modale, TitrePage, ZoneTexte, useNotifier } from "../ui/base";
import { ZoneDeTrace } from "../ui/Signature";

const STATUTS: Record<string, { libelle: string; ton: "neutre" | "attente" | "accent" | "danger" }> = {
  brouillon: { libelle: "En préparation", ton: "neutre" },
  soumise: { libelle: "À étudier", ton: "attente" },
  validee: { libelle: "Validée", ton: "accent" },
  refusee: { libelle: "Rejetée", ton: "danger" },
};

export function AdminCandidatures() {
  const [ouverte, setOuverte] = useState<string | null>(null);
  const liste = useQuery({ queryKey: ["candidatures"], queryFn: () => api.get<LigneCandidature[]>("/admin/candidatures") });
  if (liste.isPending) return <Chargement />;
  if (liste.error) return <Alerte ton="danger">{liste.error.message}</Alerte>;
  const visibles = liste.data.filter((f) => !f.anonymise_le);
  const aEtudier = visibles.filter((f) => f.statut_candidature === "soumise").length;

  return (
    <>
      <TitrePage titre="Candidatures de formateurs" soustitre={aEtudier > 0 ? `${aEtudier} candidature(s) attendent votre décision.` : "Aucune candidature en attente."} />
      {visibles.length === 0 ? (
        <EtatVide icone={<UserRoundCheck className="size-8" aria-hidden />} titre="Aucune candidature">Les formateurs qui postulent depuis la page d'inscription apparaîtront ici.</EtatVide>
      ) : (
        <Carte>
          <ul className="divide-y divide-trait">
            {visibles.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => setOuverte(f.id)} className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-papier-2 sm:px-5">
                  <span className="min-w-0">
                    <span className="block font-medium">{f.formateur_prenom} {f.formateur_nom}</span>
                    <span className="block truncate text-[13px] text-encre-2">{[f.formateur_entreprise_nom, f.formateur_email].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    {f.soumise_le && <span className="chiffres text-xs text-encre-3">{instantFr(f.soumise_le)}</span>}
                    <Etiquette ton={STATUTS[f.statut_candidature]!.ton}>{STATUTS[f.statut_candidature]!.libelle}</Etiquette>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Carte>
      )}
      <Modale ouverte={ouverte !== null} fermer={() => setOuverte(null)} titre="Candidature" large>
        {ouverte && <Decision id={ouverte} fermer={() => setOuverte(null)} />}
      </Modale>
    </>
  );
}

function Decision({ id, fermer }: { id: string; fermer: () => void }) {
  const requetes = useQueryClient();
  const notifier = useNotifier();
  const [motif, setMotif] = useState("");
  const c = useQuery({ queryKey: ["candidature-admin", id], queryFn: () => api.get<CandidatureAdmin>(`/admin/candidatures/${id}`) });
  const decider = useMutation({
    mutationFn: (validee: boolean) => api.post(`/admin/candidatures/${id}/decision`, { validee, motif }),
    onSuccess: async (_r, validee) => {
      await requetes.invalidateQueries({ queryKey: ["candidatures"] });
      notifier("succes", validee ? "Candidature validée. Le formateur est prévenu par e-mail." : "Candidature rejetée. Le formateur est prévenu par e-mail.");
      fermer();
    },
  });
  if (c.isPending) return <Chargement />;
  if (c.error) return <Alerte ton="danger">{c.error.message}</Alerte>;
  const f = c.data.formateur;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="min-w-0 space-y-4">
        <div>
          <p className="font-display text-xl font-semibold">{f.formateur_prenom} {f.formateur_nom}</p>
          <p className="text-sm text-encre-2">{f.formateur_email} · {f.formateur_telephone || "téléphone non renseigné"}</p>
        </div>
        <dl className="space-y-1.5 text-sm">
          {[["Entreprise", f.formateur_entreprise_nom], ["SIRET", f.formateur_entreprise_siret], ["Adresse", f.formateur_entreprise_adresse], ["Déclaration d'activité", f.formateur_nda_numero]].map(([k, v]) => (
            <div key={k} className="grid grid-cols-[150px_minmax(0,1fr)] gap-3"><dt className="text-encre-3">{k}</dt><dd>{v || "—"}</dd></div>
          ))}
        </dl>
        <div>
          <p className="mb-1 text-[13px] font-medium text-encre-3">Parcours</p>
          <p className="rounded-md bg-papier-2 p-3 text-sm leading-relaxed whitespace-pre-line">{f.parcours || "Non renseigné."}</p>
        </div>
      </div>
      <div className="min-w-0 space-y-4">
        <div>
          <p className="mb-2 text-[13px] font-medium text-encre-3">Pièces justificatives</p>
          <ul className="space-y-1.5">
            {c.data.pieces.map((p) => (
              <li key={p.id}>
                <a href={`/api/pieces-formateur/${p.id}`} className="flex items-center justify-between gap-3 rounded-sm border border-trait px-3 py-2 text-sm hover:border-accent/60">
                  <span className="min-w-0 truncate"><span className="font-medium">{c.data.types.find((t) => t.type === p.type)?.libelle ?? p.type}</span> — {p.nom_fichier}</span>
                  <span className="chiffres flex shrink-0 items-center gap-2 text-xs text-encre-3">{octets(p.taille)} <Download className="size-3.5" aria-hidden /></span>
                </a>
              </li>
            ))}
            {c.data.pieces.length === 0 && <li className="text-sm text-encre-3">Aucune pièce déposée.</li>}
          </ul>
        </div>
        {f.statut_candidature === "soumise" ? (
          <div className="space-y-3 border-t border-trait pt-4">
            <ZoneTexte libelle="Motif (obligatoire en cas de rejet)" rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} />
            {decider.error && <Alerte ton="danger">{decider.error.message}</Alerte>}
            <div className="flex flex-wrap gap-2">
              <Bouton variante="primaire" enCours={decider.isPending && decider.variables === true} onClick={() => decider.mutate(true)}>Valider la candidature</Bouton>
              <Bouton enCours={decider.isPending && decider.variables === false} onClick={() => decider.mutate(false)}>Rejeter</Bouton>
            </div>
          </div>
        ) : (
          <Alerte>Décision : {STATUTS[f.statut_candidature]!.libelle.toLowerCase()}{f.decidee_le ? `, le ${instantFr(f.decidee_le)}` : ""}.{f.motif_decision ? ` Motif : ${f.motif_decision}` : ""}</Alerte>
        )}
      </div>
    </div>
  );
}

const GROUPES: Array<{ titre: string; aide?: string; champs: Array<[keyof Organisme & string, string, string?]> }> = [
  { titre: "Identité", aide: "Figure sur toutes les pièces émises. Rien n'est écrit en dur dans les gabarits.", champs: [["of_nom", "Raison sociale"], ["of_forme_juridique", "Forme juridique et capital"], ["of_adresse", "Adresse"], ["of_siret", "SIRET"], ["of_tva_intracom", "TVA intracommunautaire"], ["of_telephone", "Téléphone"]] },
  { titre: "Déclaration d'activité et certifications", champs: [["of_nda_numero", "N° de déclaration d'activité"], ["of_dreets_region", "Région de la DREETS"], ["of_qualiopi_numero", "N° de certification Qualiopi"], ["of_certification_complementaire_numero", "Certification complémentaire"]] },
  { titre: "Représentant légal", champs: [["of_representant_civilite", "Civilité"], ["of_representant_prenom", "Prénom"], ["of_representant_nom", "Nom"]] },
  { titre: "Contacts et juridiction", champs: [["of_email_pedagogie", "E-mail pédagogie"], ["of_email_comptabilite", "E-mail comptabilité"], ["of_tribunal_competent", "Tribunal compétent", "Tel qu'il doit apparaître dans « le … sera seul compétent »."]] },
  { titre: "Coordonnées bancaires", champs: [["of_banque_nom", "Banque"], ["of_iban", "IBAN"], ["of_bic", "BIC"]] },
];

export function AdminOrganisme() {
  const requetes = useQueryClient();
  const notifier = useNotifier();
  const config = useQuery({ queryKey: ["organisme"], queryFn: () => api.get<{ organisme: Organisme; manques: string[] }>("/admin/organisme") });
  const [v, setV] = useState<Partial<Organisme>>({});
  const [trace, setTrace] = useState<string | null>(null);
  const enregistrer = useMutation({
    mutationFn: () => api.patch<{ organisme: Organisme; manques: string[] }>("/admin/organisme", { ...v, ...(trace ? { signature_representant_png: trace } : {}) }),
    onSuccess: async (r) => {
      requetes.setQueryData(["organisme"], r);
      await requetes.invalidateQueries({ queryKey: ["moi"] });
      setV({});
      setTrace(null);
      notifier("succes", "Configuration enregistrée.");
    },
  });
  if (config.isPending) return <Chargement />;
  if (config.error) return <Alerte ton="danger">{config.error.message}</Alerte>;
  const of = { ...config.data.organisme, ...v };
  const err = enregistrer.error instanceof ErreurApi ? (enregistrer.error.details?.champs ?? {}) : {};
  const nombre = (cle: "portage_commission_pourcentage" | "tva_pourcentage" | "delai_paiement_jours" | "conservation_annees") => ({
    value: String(of[cle] ?? ""),
    erreur: err[cle],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [cle]: e.target.value === "" ? 0 : Number(e.target.value.replace(",", ".")) }),
  });

  return (
    <form className="mx-auto max-w-3xl" onSubmit={(e) => { e.preventDefault(); enregistrer.mutate(); }}>
      <TitrePage titre="Organisme de formation" soustitre="L'identité de l'organisme est une configuration : chaque organisme porté par la plateforme a la sienne." actions={<Bouton type="submit" variante="primaire" enCours={enregistrer.isPending}>Enregistrer</Bouton>} />
      {config.data.manques.length > 0 && <div className="mb-6"><ListeManques titre="Tant que ces champs sont vides, aucun dossier ne peut être validé :" manques={config.data.manques} /></div>}
      {enregistrer.error && <div className="mb-6"><Alerte ton="danger">{enregistrer.error.message}</Alerte></div>}

      <div className="space-y-6">
        {GROUPES.map((g) => (
          <Carte key={g.titre} className="p-5">
            <h2 className="text-base font-semibold">{g.titre}</h2>
            {g.aide && <p className="mt-0.5 text-[13px] text-encre-3">{g.aide}</p>}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {g.champs.map(([cle, libelle, aide]) => (
                <Champ key={cle} libelle={libelle} aide={aide} erreur={err[cle]} value={String(of[cle] ?? "")} onChange={(e) => setV({ ...v, [cle]: e.target.value })} />
              ))}
            </div>
          </Carte>
        ))}

        <Carte className="p-5">
          <h2 className="text-base font-semibold">Règles de gestion</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Champ libelle="Commission de portage (%)" inputMode="decimal" aide="Prix de vente − commission = net reversé au formateur." {...nombre("portage_commission_pourcentage")} />
            <Champ libelle="TVA sur les factures (%)" inputMode="decimal" aide="0 = exonération (article 261.4.4° du CGI)." {...nombre("tva_pourcentage")} />
            <Champ libelle="Délai de paiement (jours)" inputMode="numeric" {...nombre("delai_paiement_jours")} />
            <Champ libelle="Conservation des dossiers (années)" inputMode="numeric" {...nombre("conservation_annees")} />
          </div>
          <div className="mt-4">
            <ZoneTexte libelle="Clause de subrogation" aide="Insérée dans la convention lorsque le financement passe par un OPCO ou un FAF." value={of.formation_clause_subrogation ?? ""} onChange={(e) => setV({ ...v, formation_clause_subrogation: e.target.value })} />
          </div>
        </Carte>

        <Carte className="p-5">
          <h2 className="text-base font-semibold">Signature du représentant légal</h2>
          <p className="mt-0.5 text-[13px] text-encre-3">Apposée automatiquement sur les pièces émises par l'organisme : convention, ordre de mission, convocation, attestation.</p>
          {config.data.organisme.signature_representant_png && !trace && <img src={config.data.organisme.signature_representant_png} alt="Signature enregistrée" className="mt-3 h-20 rounded-md border border-trait bg-papier p-2" />}
          <div className="mt-3 max-w-md"><ZoneDeTrace surChangement={setTrace} hauteur={130} /></div>
        </Carte>

        <Carte className="p-5">
          <Champ libelle="Couleur de l'organisme" type="color" className="!h-10 !w-24 !p-1" aide="Reprise sur les pièces générées." value={of.couleur ?? "#1d6a45"} onChange={(e) => setV({ ...v, couleur: e.target.value })} />
        </Carte>
      </div>
    </form>
  );
}
