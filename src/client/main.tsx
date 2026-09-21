import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { routeur } from "./routeur";
import { FournisseurToasts } from "./ui/base";
import { requetes } from "./requetes";
import "./styles.css";

createRoot(document.getElementById("racine")!).render(
  <StrictMode>
    <QueryClientProvider client={requetes}>
      <FournisseurToasts>
        <RouterProvider router={routeur} />
      </FournisseurToasts>
    </QueryClientProvider>
  </StrictMode>,
);
