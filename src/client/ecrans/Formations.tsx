/**
 * Module 2 — Mes formations (F-FORM-01/02), refondu le 23/09/2026 (« Modification 1 ») :
 *  - générateur de parcours : titre, heures, jours, tarif, nombre de modules → parcours complet (IA ou trame) ;
 *  - le formateur aménage les modules et enregistre à tout moment (brouillon local de secours, historique des versions) ;
 *  - tous les champs utiles à la convention (financement, lieu, effectifs, coût formateur) et à Qualiopi
 *    (public, prérequis, délai d'accès, accessibilité, moyens et modalités d'évaluation), en listes déroulantes.
 */
import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowDown, ArrowLeft, ArrowUp, BookOpen, Copy, FolderLock, History, Plus, RotateCcw, Sparkles, Trash2, UserPlus, Wand2 } from "lucide-react";
import { DELAIS_ACCES, DOMAINES, FINANCEURS, MODALITES, MODALITES_SANCTION, MODES_FINANCEMENT, NIVEAUX, NOMBRES_MODULES } from "@/domaine/pedagogie/listes";
import { heuresTexte, objectifsDepuisModules, programmeDepuisModules, type ModuleParcours } from "@/domaine/pedagogie/parcours";
import { api, ErreurApi, euros, heuresFr, instantFr, type Formation, type Outil } from "../api";
import { Alerte, Bouton, Carte, Champ, Chargement, EtatVide, Etiquette, Modale, Onglets, Selecteur, TitrePage, ZoneTexte, cx, useNotifier } from "../ui/base";
import { BandeauBrouillon } from "../ui/BandeauBrouillon";
import { useBrouillonLocal } from "../ui/brouillon";
import { centimesSaisis, eurosEnSaisie, ListeOuAutre, nombreSaisi } from "../ui/champs";
import { useIaDisponible } from "./AssistantIa";
import { GenerateurTest } from "./Outils";
import { StudioSupports } from "./Coffre";
import { InviterPositionnement } from "./Positionnements";
import { HistoriqueVersions } from "./Versions";

type Etat = ReturnType<typeof etatDepuis>;

function etatDepuis(f?: Formation) {
  return {
    formation_titre: f?.formation_titre ?? "",
    formation_niveau: f?.formation_niveau ?? "",
    formation_domaine: f?.formation_domaine ?? "",
    formation_modalite: (f?.formation_modalite ?? "presentiel") as "presentiel" | "distanciel" | "mixte",
    heures: f?.formation_duree_heures_total?.toString().replace(".", ",") ?? "",
    jours: f?.formation_duree_jours?.toString().replace(".", ",") ?? "",
    prix: eurosEnSaisie(f?.formation_prix_unitaire_ht),
    prix_groupe: eurosEnSaisie(f?.formation_prix_groupe_ht),
    nb_modules: String(f?.formation_nb_modules ?? ((f?.formation_modules as ModuleParcours[] | undefined)?.length || 3)),
    modules: ((f?.formation_modules ?? []) as ModuleParcours[]).map((m) => ({ ...m })),
    formation_objectifs: f?.formation_objectifs ?? "",
    programme: f?.programme ?? "",
    heures_presentiel: f?.formation_duree_heures_presentiel?.toString().replace(".", ",") ?? "",
    heures_distanciel: f?.formation_duree_heures_distanciel?.toString().replace(".", ",") ?? "",
    effectif_min: f?.formation_effectif_min?.toString() ?? "",
    effectif_max: f?.formation_effectif_max?.toString() ?? "",
    formation_lieu_nom: f?.formation_lieu_nom ?? "",
    formation_lieu_adresse: f?.formation_lieu_adresse ?? "",
    formation_lieu_siret: f?.formation_lieu_siret ?? "",
    formation_lien_visio: f?.formation_lien_visio ?? "",
    mode_financement: (f?.mode_financement ?? "opco") as "opco" | "faf" | "entreprise" | "fonds_propres",
    formation_opco: f?.formation_opco ?? "",
    cout_horaire: eurosEnSaisie(f?.formateur_cout_horaire),
    public_vise: f?.public_vise ?? "",
    formation_prerequis: f?.formation_prerequis ?? "",
    formation_delai_acces: f?.formation_delai_acces ?? "",
    formation_accessibilite: f?.formation_accessibilite ?? "",
    formation_moyens_pedagogiques: f?.formation_moyens_pedagogiques ?? "",
    formation_modalites_evaluation: f?.formation_modalites_evaluation ?? "",
    formation_modalites_sanction: f?.formation_modalites_sanction ?? "",
  };
}

function corpsDepuis(v: Etat) {
  const { heures, jours, prix, prix_groupe, nb_modules, modules, heures_presentiel, heures_distanciel, effectif_min, effectif_max, cout_horaire, ...reste } = v;
  return {
    ...reste,
    formation_duree_heures_total: nombreSaisi(heures),
    formation_duree_jours: nombreSaisi(jours),
    formation_prix_unitaire_ht: centimesSaisis(prix),
    formation_prix_groupe_ht: centimesSaisis(prix_groupe),
    formation_nb_modules: modules.length || nombreSaisi(nb_modules),
    formation_modules: modules,
    formation_duree_heures_presentiel: v.formation_modalite === "mixte" ? nombreSaisi(heures_presentiel) : null,
    formation_duree_heures_distanciel: v.formation_modalite === "mixte" ? nombreSaisi(heures_distanciel) : null,
    formation_effectif_min: nombreSaisi(effectif_min),
    formation_effectif_max: nombreSaisi(effectif_max),
    formateur_cout_horaire: centimesSaisis(cout_horaire),
  };
}

const ONGLETS = [
  { cle: "essentiel", libelle: "1. L'essentiel" },
  { cle: "parcours", libelle: "2. Parcours" },
  { cle: "convention", libelle: "3. Convention" },
  { cle: "qualiopi", libelle: "4. Qualiopi" },
] as const;
type Onglet = (typeof ONGLETS)[number]["cle"];

const ACCESSIBILITE_DEFAUT =
  "Formation accessible aux personnes en situation de handicap. Un entretien préalable avec le référent handicap permet d'étudier les aménagements nécessaires (rythme, supports, lieu).";

export function FormulaireFormation({ initiale, termine }: { initiale?: Formation; termine: (f?: Formation) => void }) {
  const requetes = useQueryClient();
  const iaDisponible = useIaDisponible();
  const depart = etatDepuis(initiale);
  const [v, setV] = useState(depart);
  const [onglet, setOnglet] = useState<Onglet>("essentiel");
  const [mode, setMode] = useState<"trame" | "ia">("trame");
  const brouillon = useBrouillonLocal(`formation:${initiale?.id ?? "nouvelle"}`, v, depart);
  const maj = (x: Partial<Etat>) => setV((p) => ({ ...p, ...x }));

  const enregistrer = useMutation({
    mutationFn: () => (initiale ? api.patch<Formation>(`/formations/${initiale.id}`, corpsDepuis(v)) : api.post<Formation>("/formations", corpsDepuis(v))),
    onSuccess: async (f) => {
      brouillon.oublier(etatDepuis(f));
      await requetes.invalidateQueries({ queryKey: ["formations"] });
      await requetes.invalidateQueries({ queryKey: ["versions"] });
      termine(f);
    },
  });
  const generer = useMutation({
    mutationFn: () =>
      api.post<{ modules: ModuleParcours[]; formation_objectifs: string; programme: string; source: string }>("/ia/parcours", {
        titre: v.formation_titre,
        heures: nombreSaisi(v.heures),
        jours: nombreSaisi(v.jours),
        nb_modules: Number(v.nb_modules),
        niveau: v.formation_niveau,
        public_vise: v.public_vise,
        modalite: v.formation_modalite,
        mode,
      }),
    onSuccess: (r) => {
      maj({ modules: r.modules, formation_objectifs: r.formation_objectifs, programme: r.programme });
      setOnglet("parcours");
    },
  });

  const err = enregistrer.error instanceof ErreurApi ? (enregistrer.error.details?.champs ?? {}) : {};
  const erreursListe = enregistrer.error instanceof ErreurApi && Array.isArray(enregistrer.error.details?.erreurs) ? enregistrer.error.details.erreurs : [];
  const erreursGeneration = generer.error instanceof ErreurApi && Array.isArray(generer.error.details?.erreurs) ? generer.error.details.erreurs : [];
  const SERVEUR: Partial<Record<keyof Etat, string>> = { heures: "formation_duree_heures_total", jours: "formation_duree_jours", prix: "formation_prix_unitaire_ht", prix_groupe: "formation_prix_groupe_ht", heures_presentiel: "formation_duree_heures_presentiel", effectif_min: "formation_effectif_min", effectif_max: "formation_effectif_max", cout_horaire: "formateur_cout_horaire" };
  const champ = (cle: keyof Etat) => ({ value: v[cle] as string, erreur: err[cle] ?? err[SERVEUR[cle] ?? ""], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => maj({ [cle]: e.target.value } as Partial<Etat>) });
  const totalModules = v.modules.reduce((a, m) => a + (Number(m.duree_heures) || 0), 0);
  const heuresTotal = nombreSaisi(v.heures);

  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); enregistrer.mutate(); }}>
      {brouillon.propose && <BandeauBrouillon le={brouillon.propose.le} reprendre={() => { const b = brouillon.accepter(); if (b) setV(b); }} ignorer={brouillon.ignorer} />}
      <Onglets actif={onglet} choisir={setOnglet} onglets={ONGLETS.map((o) => ({ ...o, compteur: o.cle === "parcours" && v.modules.length ? String(v.modules.length) : undefined }))} />

      {onglet === "essentiel" && (
        <div className="space-y-4">
          <Champ libelle="Intitulé de la formation" required {...champ("formation_titre")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <ListeOuAutre libelle="Niveau" options={NIVEAUX} value={v.formation_niveau} onChange={(x) => maj({ formation_niveau: x })} />
            <Selecteur libelle="Modalité habituelle" value={v.formation_modalite} onChange={(e) => maj({ formation_modalite: e.target.value as Etat["formation_modalite"] })}>
              {MODALITES.map((m) => <option key={m.valeur} value={m.valeur}>{m.libelle}</option>)}
            </Selecteur>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Champ libelle="Durée (heures)" inputMode="decimal" {...champ("heures")} />
            <Champ libelle="Durée (jours)" inputMode="decimal" {...champ("jours")} />
            <Selecteur libelle="Nombre de modules" value={v.nb_modules} onChange={(e) => maj({ nb_modules: e.target.value })}>
              {NOMBRES_MODULES.map((n) => <option key={n} value={n}>{n} module{n > 1 ? "s" : ""}</option>)}
            </Selecteur>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ libelle="Tarif HT par stagiaire (€)" inputMode="decimal" {...champ("prix")} />
            <Champ libelle="Tarif HT intra / groupe (€)" inputMode="decimal" aide="Facultatif : prix d'une session pour un groupe." {...champ("prix_groupe")} />
          </div>
          <ListeOuAutre libelle="Domaine" options={DOMAINES} value={v.formation_domaine} onChange={(x) => maj({ formation_domaine: x })} autre={false} />

          <Carte className="border-accent/40 bg-accent-doux/40 p-4">
            <p className="flex items-center gap-2 font-semibold"><Wand2 className="size-4 text-accent" aria-hidden /> Générer le parcours de formation</p>
            <p className="mt-1 text-[13px] text-encre-2">
              Avec l'intitulé, la durée et le nombre de modules, l'application propose le parcours complet : modules, objectifs, contenus, méthodes, mise en pratique et évaluations. Vous l'aménagez ensuite librement, puis vous enregistrez.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <Selecteur libelle="Moteur" value={mode} onChange={(e) => setMode(e.target.value as "trame" | "ia")}>
                  <option value="trame">Trame pédagogique automatique (sans IA)</option>
                  <option value="ia" disabled={!iaDisponible}>Assistant IA — recherche et rédaction{iaDisponible ? "" : " (non configuré)"}</option>
                </Selecteur>
              </div>
              <Bouton
                variante="primaire"
                icone={<Sparkles className="size-4" aria-hidden />}
                enCours={generer.isPending}
                disabled={v.formation_titre.trim().length < 3 || !heuresTotal}
                title={v.formation_titre.trim().length < 3 || !heuresTotal ? "Renseignez l'intitulé et la durée en heures" : undefined}
                onClick={() => (v.modules.length === 0 || confirm("Remplacer les modules actuels par un nouveau parcours ? (l'ancien reste dans l'historique après enregistrement)")) && generer.mutate()}
              >
                Générer le parcours
              </Bouton>
            </div>
            {generer.error && (
              <div className="mt-3"><Alerte ton="danger" titre={generer.error.message}>{erreursGeneration.length > 0 && <ul className="list-disc pl-4">{erreursGeneration.map((x) => <li key={x}>{x}</li>)}</ul>}</Alerte></div>
            )}
          </Carte>
        </div>
      )}

      {onglet === "parcours" && (
        <div className="space-y-4">
          {generer.isSuccess && <Alerte ton="attention" titre={generer.data.source === "ia" ? "Parcours proposé par l'IA" : "Trame de parcours générée"}>Relisez et aménagez chaque module : vous en êtes l'auteur. Rien n'est enregistré avant « Enregistrer ».</Alerte>}
          <EditeurModules modules={v.modules} onChange={(modules) => maj({ modules })} />
          {v.modules.length > 0 && (
            <p className={cx("text-[13px]", heuresTotal !== null && Math.abs(totalModules - heuresTotal) > 0.01 ? "font-medium text-danger" : "text-encre-3")}>
              Somme des modules : {heuresTexte(totalModules)} {heuresTotal !== null && `/ durée totale ${heuresTexte(heuresTotal)}`}
            </p>
          )}
          {err.formation_modules && <Alerte ton="danger">{err.formation_modules}</Alerte>}
          <div className="flex flex-wrap gap-2">
            <Bouton taille="sm" disabled={v.modules.length === 0} icone={<RotateCcw className="size-3.5" aria-hidden />} onClick={() => maj({ programme: programmeDepuisModules(v.modules), formation_objectifs: objectifsDepuisModules(v.modules) })}>
              Réécrire objectifs et programme depuis les modules
            </Bouton>
          </div>
          <ZoneTexte libelle="Objectifs pédagogiques" rows={4} aide="Un objectif par ligne. Repris tels quels sur la convention et l'attestation." {...champ("formation_objectifs")} />
          <ZoneTexte libelle="Programme détaillé" rows={8} aide="Annexé à la convention (pièce « Programme de formation ») : obligatoire pour soumettre un dossier." {...champ("programme")} />
        </div>
      )}

      {onglet === "convention" && (
        <div className="space-y-4">
          <p className="text-[13px] text-encre-2">Ces valeurs pré-remplissent chaque nouveau dossier ; elles restent modifiables dans le dossier jusqu'à sa validation.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Selecteur libelle="Mode de financement habituel" value={v.mode_financement} onChange={(e) => maj({ mode_financement: e.target.value as Etat["mode_financement"] })}>
              {MODES_FINANCEMENT.map((m) => <option key={m.valeur} value={m.valeur}>{m.libelle}</option>)}
            </Selecteur>
            <ListeOuAutre libelle="Financeur habituel (OPCO, FAF…)" options={FINANCEURS} value={v.formation_opco} onChange={(x) => maj({ formation_opco: x })} aide="L'OPCO de la fiche entreprise prime s'il est renseigné." />
          </div>
          {v.formation_modalite === "mixte" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Champ libelle="Dont heures en présentiel" inputMode="decimal" {...champ("heures_presentiel")} />
              <Champ libelle="Dont heures à distance" inputMode="decimal" {...champ("heures_distanciel")} />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <Champ libelle="Effectif minimum" inputMode="numeric" {...champ("effectif_min")} />
            <Champ libelle="Effectif maximum" inputMode="numeric" {...champ("effectif_max")} />
            <Champ libelle="Coût horaire formateur (€ HT)" inputMode="decimal" aide="Facultatif : prime sur le calcul par commission." {...champ("cout_horaire")} />
          </div>
          {v.formation_modalite !== "distanciel" && (
            <>
              <p className="pt-1 text-[13px] font-semibold text-encre-2">Lieu habituel (à défaut : l'adresse de l'entreprise, en intra)</p>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.8fr)]">
                <Champ libelle="Nom du lieu" {...champ("formation_lieu_nom")} />
                <Champ libelle="Adresse" {...champ("formation_lieu_adresse")} />
                <Champ libelle="SIRET du lieu" inputMode="numeric" {...champ("formation_lieu_siret")} />
              </div>
            </>
          )}
          {v.formation_modalite !== "presentiel" && <Champ libelle="Lien de connexion habituel" type="url" placeholder="https://…" {...champ("formation_lien_visio")} />}
        </div>
      )}

      {onglet === "qualiopi" && (
        <div className="space-y-4">
          <Champ libelle="Public visé" list="publics-suggeres" {...champ("public_vise")} />
          <datalist id="publics-suggeres">
            {["Salariés", "Managers et chefs d'équipe", "Dirigeants de TPE/PME", "Demandeurs d'emploi", "Indépendants et professions libérales", "Tout public"].map((x) => <option key={x} value={x} />)}
          </datalist>
          <ZoneTexte libelle="Prérequis" rows={2} {...champ("formation_prerequis")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <ListeOuAutre libelle="Délai d'accès" options={DELAIS_ACCES} value={v.formation_delai_acces} onChange={(x) => maj({ formation_delai_acces: x })} aide="Indicateur Qualiopi n° 1." />
            <ListeOuAutre libelle="Sanction de la formation" options={MODALITES_SANCTION} value={v.formation_modalites_sanction} onChange={(x) => maj({ formation_modalites_sanction: x })} />
          </div>
          <ZoneTexte libelle="Accessibilité aux personnes en situation de handicap" rows={3} aide="Indicateur Qualiopi n° 26." {...champ("formation_accessibilite")} />
          {!v.formation_accessibilite && <Bouton taille="sm" variante="discret" onClick={() => maj({ formation_accessibilite: ACCESSIBILITE_DEFAUT })}>Insérer une mention type</Bouton>}
          <ZoneTexte libelle="Moyens pédagogiques et techniques" rows={3} {...champ("formation_moyens_pedagogiques")} />
          <ZoneTexte libelle="Modalités d'évaluation" rows={3} aide="Positionnement, évaluations intermédiaires, évaluation finale (indicateurs 8 et 11)." {...champ("formation_modalites_evaluation")} />
        </div>
      )}

      {erreursListe.length > 0 && <Alerte ton="danger" titre={enregistrer.error!.message}><ul className="list-disc pl-4">{erreursListe.map((x) => <li key={x}>{x}</li>)}</ul></Alerte>}
      {enregistrer.error && Object.keys(err).length === 0 && erreursListe.length === 0 && <Alerte ton="danger">{enregistrer.error.message}</Alerte>}
      {enregistrer.error && Object.keys(err).length > 0 && <Alerte ton="danger">{enregistrer.error.message}</Alerte>}
      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 border-t border-trait bg-carte px-1 pt-3 pb-1">
        <Bouton type="submit" variante="primaire" enCours={enregistrer.isPending}>Enregistrer</Bouton>
        <span className="text-[12.5px] text-encre-3">Enregistrez à tout moment : seul l'intitulé est obligatoire. Chaque enregistrement garde la version précédente.</span>
      </div>
    </form>
  );
}

const MODULE_VIDE: ModuleParcours = { titre: "", duree_heures: 1, objectifs: [], contenus: [], methodes: "", mise_en_pratique: "", evaluation: "" };

export function EditeurModules({ modules, onChange }: { modules: ModuleParcours[]; onChange: (m: ModuleParcours[]) => void }) {
  const maj = (i: number, x: Partial<ModuleParcours>) => onChange(modules.map((m, k) => (k === i ? { ...m, ...x } : m)));
  const deplacer = (i: number, d: -1 | 1) => {
    const copie = [...modules];
    const [m] = copie.splice(i, 1);
    copie.splice(i + d, 0, m!);
    onChange(copie);
  };
  const lignes = (t: string) => t.split("\n").map((x) => x.trim()).filter(Boolean);
  if (modules.length === 0) {
    return (
      <EtatVide titre="Aucun module pour l'instant" action={<Bouton icone={<Plus className="size-4" aria-hidden />} onClick={() => onChange([{ ...MODULE_VIDE, titre: "Module 1" }])}>Ajouter un module</Bouton>}>
        Générez le parcours depuis l'onglet « L'essentiel », ou construisez-le module par module.
      </EtatVide>
    );
  }
  return (
    <div className="space-y-3">
      {modules.map((m, i) => (
        <details key={i} open={modules.length <= 3} className="rounded-md border border-trait bg-papier-2/60">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3">
            <span className="chiffres grid size-7 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-semibold text-sur-accent">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{m.titre || "Module sans titre"}</span>
            <Etiquette>{heuresTexte(Number(m.duree_heures) || 0)}</Etiquette>
          </summary>
          <div className="space-y-3 border-t border-trait px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
              <Champ libelle="Titre du module" value={m.titre} onChange={(e) => maj(i, { titre: e.target.value })} />
              <Champ libelle="Durée (h)" inputMode="decimal" value={String(m.duree_heures).replace(".", ",")} onChange={(e) => maj(i, { duree_heures: nombreSaisi(e.target.value) ?? 0 })} />
            </div>
            <ZoneTexte libelle="Objectifs du module (un par ligne)" rows={3} value={m.objectifs.join("\n")} onChange={(e) => maj(i, { objectifs: e.target.value.split("\n") })} onBlur={(e) => maj(i, { objectifs: lignes(e.target.value) })} />
            <ZoneTexte libelle="Contenus (un point par ligne)" rows={4} value={m.contenus.join("\n")} onChange={(e) => maj(i, { contenus: e.target.value.split("\n") })} onBlur={(e) => maj(i, { contenus: lignes(e.target.value) })} />
            <ZoneTexte libelle="Méthodes pédagogiques" rows={2} value={m.methodes} onChange={(e) => maj(i, { methodes: e.target.value })} />
            <ZoneTexte libelle="Mise en pratique" rows={2} value={m.mise_en_pratique} onChange={(e) => maj(i, { mise_en_pratique: e.target.value })} />
            <ZoneTexte libelle="Évaluation" rows={2} value={m.evaluation} onChange={(e) => maj(i, { evaluation: e.target.value })} />
            <div className="flex flex-wrap gap-1.5">
              <Bouton taille="sm" variante="discret" disabled={i === 0} icone={<ArrowUp className="size-3.5" aria-hidden />} onClick={() => deplacer(i, -1)}>Monter</Bouton>
              <Bouton taille="sm" variante="discret" disabled={i === modules.length - 1} icone={<ArrowDown className="size-3.5" aria-hidden />} onClick={() => deplacer(i, 1)}>Descendre</Bouton>
              <Bouton taille="sm" variante="discret" icone={<Trash2 className="size-3.5" aria-hidden />} onClick={() => confirm(`Retirer le module ${i + 1} ?`) && onChange(modules.filter((_, k) => k !== i))}>Retirer</Bouton>
            </div>
          </div>
        </details>
      ))}
      <Bouton taille="sm" disabled={modules.length >= 12} icone={<Plus className="size-4" aria-hidden />} onClick={() => onChange([...modules, { ...MODULE_VIDE, titre: `Module ${modules.length + 1}` }])}>Ajouter un module</Bouton>
    </div>
  );
}

export function Formations() {
  const [creation, setCreation] = useState(false);
  const [vue, setVue] = useState<"actives" | "archivees">("actives");
  const navigate = useNavigate();
  const requetes = useQueryClient();
  const notifier = useNotifier();
  const formations = useQuery({ queryKey: ["formations", vue], queryFn: () => api.get<Formation[]>(`/formations${vue === "archivees" ? "?archivees=1" : ""}`) });
  const restaurer = useMutation({ mutationFn: (id: string) => api.post(`/formations/${id}/restaurer`), onSuccess: async () => { await requetes.invalidateQueries({ queryKey: ["formations"] }); notifier("succes", "Formation restaurée dans votre catalogue."); } });
  return (
    <>
      <TitrePage
        titre="Mes formations"
        soustitre="Votre catalogue. Chaque dossier part d'une formation : objectifs, durée, prix, parcours et questionnaires sont repris automatiquement."
        actions={<Bouton variante="primaire" icone={<Plus className="size-4" aria-hidden />} onClick={() => setCreation(true)}>Nouvelle formation</Bouton>}
      />
      <Onglets actif={vue} choisir={setVue} onglets={[{ cle: "actives", libelle: "Catalogue" }, { cle: "archivees", libelle: "Archivées" }]} />
      {formations.isPending ? (
        <Chargement />
      ) : formations.data?.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {formations.data.map((f) =>
            vue === "archivees" ? (
              <Carte key={f.id} className="flex flex-col p-5">
                <p className="font-display text-[16px] leading-snug font-semibold">{f.formation_titre}</p>
                <p className="mt-1 text-[13px] text-encre-3">Archivée le {instantFr(f.archivee_le)}</p>
                <Bouton className="mt-4 self-start" taille="sm" icone={<RotateCcw className="size-3.5" aria-hidden />} enCours={restaurer.isPending && restaurer.variables === f.id} onClick={() => restaurer.mutate(f.id)}>Restaurer</Bouton>
              </Carte>
            ) : (
              <Link key={f.id} to="/formations/$id" params={{ id: f.id }} className="flex flex-col rounded-md border border-trait bg-carte p-5 shadow-carte transition-[border-color,transform] duration-150 ease-(--ease-out) hover:-translate-y-px hover:border-accent/60">
                <p className="font-display text-[16px] leading-snug font-semibold">{f.formation_titre}</p>
                <p className="mt-2 line-clamp-3 flex-1 text-[13px] leading-relaxed whitespace-pre-line text-encre-2">{f.formation_objectifs || "Objectifs à renseigner."}</p>
                <div className="chiffres mt-4 flex flex-wrap items-center gap-1.5">
                  <Etiquette>{heuresFr(f.formation_duree_heures_total)}</Etiquette>
                  {(f.formation_modules as unknown[]).length > 0 && <Etiquette>{(f.formation_modules as unknown[]).length} module(s)</Etiquette>}
                  {f.formation_niveau && <Etiquette>{f.formation_niveau}</Etiquette>}
                  {f.formation_prix_unitaire_ht !== null && <Etiquette ton="accent">{euros(f.formation_prix_unitaire_ht)} HT</Etiquette>}
                </div>
              </Link>
            ),
          )}
        </div>
      ) : vue === "archivees" ? (
        <EtatVide icone={<Archive className="size-8" aria-hidden />} titre="Aucune formation archivée">Une formation retirée du catalogue apparaît ici ; elle se restaure d'un clic.</EtatVide>
      ) : (
        <EtatVide icone={<BookOpen className="size-8" aria-hidden />} titre="Votre catalogue est vide" action={<Bouton variante="primaire" onClick={() => setCreation(true)}>Créer ma première formation</Bouton>}>
          Décrivez une formation une fois — ou générez son parcours en un clic ; vous la réutiliserez pour chaque nouveau dossier.
        </EtatVide>
      )}
      <Modale ouverte={creation} fermer={() => setCreation(false)} titre="Nouvelle formation" large>
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
  const [modale, setModale] = useState<"versions" | "supports" | "inviter" | { test: "positionnement" | "acquis" } | null>(null);
  const formation = useQuery({ queryKey: ["formation", id], queryFn: () => api.get<Formation>(`/formations/${id}`) });
  const outils = useQuery({ queryKey: ["outils"], queryFn: () => api.get<Outil[]>("/outils") });

  const dupliquer = useMutation({ mutationFn: () => api.post<Formation>(`/formations/${id}/dupliquer`), onSuccess: async (f) => { await requetes.invalidateQueries({ queryKey: ["formations"] }); navigate({ to: "/formations/$id", params: { id: f.id } }); notifier("succes", "Formation dupliquée, avec ses questionnaires."); } });
  const archiver = useMutation({ mutationFn: () => api.suppr(`/formations/${id}`), onSuccess: async () => { await requetes.invalidateQueries({ queryKey: ["formations"] }); navigate({ to: "/formations" }); notifier("succes", "Formation archivée : retrouvez-la dans l'onglet « Archivées »."); } });

  if (formation.isPending) return <Chargement />;
  if (formation.error) return <Alerte ton="danger">{formation.error.message}</Alerte>;
  const f = formation.data;
  const lies = outils.data?.filter((o) => o.formation_id === id) ?? [];
  const TYPES: Record<string, string> = { recueil: "Recueil des besoins", positionnement: "Test de positionnement", acquis: "Évaluation des acquis" };
  const modules = f.formation_modules as ModuleParcours[];

  return (
    <>
      <Link to="/formations" className="mb-3 inline-flex items-center gap-1.5 text-sm text-encre-3 hover:text-encre">
        <ArrowLeft className="size-4" aria-hidden /> Mes formations
      </Link>
      <TitrePage
        titre={f.formation_titre}
        soustitre={`Dernier enregistrement : ${instantFr(f.maj_le)}`}
        actions={
          <>
            <Bouton icone={<History className="size-4" aria-hidden />} onClick={() => setModale("versions")}>Historique</Bouton>
            <Bouton icone={<Copy className="size-4" aria-hidden />} enCours={dupliquer.isPending} onClick={() => dupliquer.mutate()}>Dupliquer</Bouton>
            <Bouton variante="discret" icone={<Archive className="size-4" aria-hidden />} onClick={() => confirm("Archiver cette formation ? Elle quitte le catalogue ; les dossiers existants ne sont pas touchés, et vous pourrez la restaurer.") && archiver.mutate()}>Archiver</Bouton>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Carte className="p-5">
          <FormulaireFormation key={`${f.id}-${f.maj_le}`} initiale={f} termine={() => { void requetes.invalidateQueries({ queryKey: ["formation", id] }); notifier("succes", "Formation enregistrée."); }} />
        </Carte>

        <div className="min-w-0 space-y-6">
          <Carte className="p-5">
            <h2 className="text-base font-semibold">Kit pédagogique du parcours</h2>
            <p className="mt-0.5 text-[13px] text-encre-2">Tout se génère depuis le parcours ; chaque brouillon s'aménage avant d'être enregistré, et rejoint le coffre-fort.</p>
            <div className="mt-4 grid gap-2">
              <Bouton className="h-auto min-h-10 justify-start py-2 text-left !whitespace-normal" icone={<Sparkles className="size-4" aria-hidden />} onClick={() => setModale({ test: "positionnement" })}>Générer le test de positionnement</Bouton>
              <Bouton className="h-auto min-h-10 justify-start py-2 text-left !whitespace-normal" icone={<Sparkles className="size-4" aria-hidden />} onClick={() => setModale({ test: "acquis" })}>Générer l'évaluation des acquis</Bouton>
              <Bouton className="h-auto min-h-10 justify-start py-2 text-left !whitespace-normal" icone={<Sparkles className="size-4" aria-hidden />} onClick={() => setModale("supports")}>Produire les supports PPTX (20 diapositives par module)</Bouton>
              <Bouton className="h-auto min-h-10 justify-start py-2 text-left !whitespace-normal" icone={<UserPlus className="size-4" aria-hidden />} onClick={() => setModale("inviter")}>Inviter un apprenant à se positionner</Bouton>
              <Link to="/coffres/$id" params={{ id }} className="inline-flex min-h-10 py-2 items-center gap-2 rounded-sm bg-accent px-4 text-sm font-medium text-sur-accent hover:bg-accent-fort">
                <FolderLock className="size-4" aria-hidden /> Ouvrir le coffre-fort du parcours
              </Link>
            </div>
          </Carte>

          {modules.length > 0 && (
            <Carte className="p-5">
              <h2 className="text-base font-semibold">Parcours enregistré</h2>
              <ol className="mt-3 space-y-1.5 text-sm">
                {modules.map((m, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0"><span className="chiffres mr-1.5 font-semibold text-accent">{i + 1}.</span>{m.titre}</span>
                    <span className="chiffres shrink-0 text-encre-3">{heuresTexte(m.duree_heures)}</span>
                  </li>
                ))}
              </ol>
            </Carte>
          )}

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

      <Modale ouverte={modale === "versions"} fermer={() => setModale(null)} titre="Historique des versions" large>
        {modale === "versions" && <HistoriqueVersions type="formation" id={id} restaure={() => { setModale(null); void requetes.invalidateQueries({ queryKey: ["formation", id] }); }} />}
      </Modale>
      <Modale ouverte={modale === "supports"} fermer={() => setModale(null)} titre="Supports de cours PPTX" large>
        {modale === "supports" && <StudioSupports formation={f} />}
      </Modale>
      <Modale ouverte={modale === "inviter"} fermer={() => setModale(null)} titre="Inviter à se positionner">
        {modale === "inviter" && <InviterPositionnement formationId={id} termine={() => setModale(null)} />}
      </Modale>
      <Modale ouverte={typeof modale === "object" && modale !== null} fermer={() => setModale(null)} titre={typeof modale === "object" && modale?.test === "acquis" ? "Évaluation des acquis" : "Test de positionnement"} large>
        {typeof modale === "object" && modale !== null && <GenerateurTest formationId={id} type={modale.test} termine={() => setModale(null)} />}
      </Modale>
    </>
  );
}
