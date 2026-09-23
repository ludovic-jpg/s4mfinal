/**
 * Boutons « Proposer avec l'IA » de l'espace pédagogique (cahier des charges oral du 23/09/2026).
 * L'IA ne remplit qu'un BROUILLON dans le formulaire : le formateur relit, corrige, puis enregistre lui-même.
 * Sans IA configurée sur le serveur, ces boutons n'apparaissent pas.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { api, ErreurApi } from "../api";
import { Alerte, Bouton } from "../ui/base";

export function useIaDisponible(): boolean {
  const etat = useQuery({ queryKey: ["ia-etat"], queryFn: () => api.get<{ disponible: boolean }>("/ia/etat"), staleTime: 5 * 60_000 });
  return etat.data?.disponible === true;
}

type Question = { enonce: string; propositions: string[]; bonne_reponse: number };

export function BoutonIaQcm({ formationId, type, recevoir }: { formationId: string; type: "positionnement" | "acquis"; recevoir: (q: { titre: string; questions: Question[] }) => void }) {
  const disponible = useIaDisponible();
  const proposer = useMutation({
    mutationFn: () => api.post<{ questionnaire: { titre: string; questions: Question[] } }>("/ia/qcm", { formation_id: formationId, type, nombre: 10 }),
    onSuccess: (r) => recevoir(r.questionnaire),
  });
  if (!disponible) return null;
  return (
    <div className="space-y-2">
      <Bouton variante="secondaire" taille="sm" icone={<Sparkles className="size-3.5" aria-hidden />} disabled={!formationId} title={formationId ? undefined : "Rattachez d'abord le modèle à une formation"} enCours={proposer.isPending} onClick={() => proposer.mutate()}>
        Proposer 10 questions avec l'IA
      </Bouton>
      {proposer.isSuccess && <Alerte ton="attention" titre="Brouillon proposé par l'IA">Relisez chaque question et chaque bonne réponse avant d'enregistrer : vous en êtes l'auteur.</Alerte>}
      {proposer.error && <Alerte ton="danger">{proposer.error.message}</Alerte>}
    </div>
  );
}

export function BoutonIaProgramme({ contexte, recevoir }: { contexte: { formation_titre: string; formation_niveau: string; public_vise: string; formation_prerequis: string; formation_duree_heures_total: number | null }; recevoir: (p: { formation_objectifs: string; programme: string }) => void }) {
  const disponible = useIaDisponible();
  const proposer = useMutation({
    mutationFn: () => api.post<{ formation_objectifs: string; programme: string }>("/ia/programme", contexte),
    onSuccess: recevoir,
  });
  if (!disponible) return null;
  const erreurs = proposer.error instanceof ErreurApi && Array.isArray(proposer.error.details?.erreurs) ? proposer.error.details.erreurs : [];
  return (
    <div className="space-y-2">
      <Bouton variante="secondaire" taille="sm" icone={<Sparkles className="size-3.5" aria-hidden />} disabled={contexte.formation_titre.trim().length < 3} enCours={proposer.isPending} onClick={() => proposer.mutate()}>
        Proposer objectifs et programme avec l'IA
      </Bouton>
      {proposer.isSuccess && <Alerte ton="attention" titre="Brouillon proposé par l'IA">Objectifs et programme ont été pré-remplis ci-dessous. Relisez et corrigez avant d'enregistrer.</Alerte>}
      {proposer.error && (
        <Alerte ton="danger" titre={proposer.error.message}>
          {erreurs.length > 0 && <ul className="list-disc pl-4">{erreurs.map((e) => <li key={e}>{e}</li>)}</ul>}
        </Alerte>
      )}
    </div>
  );
}
