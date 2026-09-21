import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { routeur } from "./routeur";
import { FournisseurToasts } from "./ui/base";
import { ErreurApi } from "./api";
import "./styles.css";

const requetes = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Inutile de réessayer une erreur métier (403, 404, 409…) : seul un souci réseau mérite un second essai.
      retry: (tentatives, erreur) => erreur instanceof ErreurApi && erreur.statut === 0 && tentatives < 2,
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById("racine")!).render(
  <StrictMode>
    <QueryClientProvider client={requetes}>
      <FournisseurToasts>
        <RouterProvider router={routeur} />
      </FournisseurToasts>
    </QueryClientProvider>
  </StrictMode>,
);
