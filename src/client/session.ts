import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Moi } from "./api";

export function useMoi() {
  return useQuery({ queryKey: ["moi"], queryFn: () => api.get<Moi>("/auth/moi"), staleTime: 60_000 });
}

/** L'acteur connecté. À n'utiliser que sous le cadre de l'application, qui garantit sa présence. */
export function useActeur() {
  const { data } = useMoi();
  if (!data?.acteur) throw new Error("useActeur appelé hors session");
  return data.acteur;
}

export function useDeconnexion() {
  const requetes = useQueryClient();
  return async () => {
    await api.post("/auth/deconnexion");
    requetes.clear();
    location.assign("/connexion");
  };
}
