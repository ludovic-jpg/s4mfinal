/** Routes de l'application, déclarées en code : un seul fichier à lire pour connaître tous les écrans. */
import { createRootRoute, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router";
import { requeteMoi, requetes } from "./requetes";
import { Cadre } from "./ecrans/Cadre";
import { Connexion, Inscription, Invitation } from "./ecrans/Acces";
import { Accueil } from "./ecrans/Accueil";
import { NouveauDossier } from "./ecrans/NouveauDossier";
import { EcranDossier } from "./ecrans/Dossier";
import { Formations, FicheFormation } from "./ecrans/Formations";
import { Outils } from "./ecrans/Outils";
import { Repertoire } from "./ecrans/Repertoire";
import { MaCandidature } from "./ecrans/Candidature";
import { AdminCandidatures, AdminOrganisme } from "./ecrans/Admin";
import { Bpf, Courriers, Compte } from "./ecrans/Divers";

const racine = createRootRoute({ component: Outlet, notFoundComponent: () => <p className="p-10 text-encre-2">Cette page n'existe pas.</p> });

// Accès public
const connexion = createRoute({
  getParentRoute: () => racine,
  path: "/connexion",
  component: Connexion,
  validateSearch: (s: Record<string, unknown>): { retour?: string } => (typeof s.retour === "string" ? { retour: s.retour } : {}),
});
const inscription = createRoute({ getParentRoute: () => racine, path: "/inscription", component: Inscription });
const invitation = createRoute({ getParentRoute: () => racine, path: "/invitation/$jeton", component: Invitation });

// Application : tout ce qui suit passe par le cadre, qui exige une session.
const app = createRoute({
  getParentRoute: () => racine,
  id: "app",
  component: Cadre,
  // Garde d'accès, AVANT tout rendu : pas de session → connexion ; formateur non validé → sa candidature (F-ONB-02).
  beforeLoad: async ({ location }) => {
    const { acteur } = await requetes.ensureQueryData(requeteMoi);
    if (!acteur) throw redirect({ to: "/connexion", search: location.pathname === "/" ? {} : { retour: location.pathname } });
    if (acteur.role === "formateur" && !acteur.formateur_valide && !["/candidature", "/compte"].includes(location.pathname)) throw redirect({ to: "/candidature" });
  },
});
const accueil = createRoute({ getParentRoute: () => app, path: "/", component: Accueil });
const nouveauDossier = createRoute({ getParentRoute: () => app, path: "/dossiers/nouveau", component: NouveauDossier });
const dossier = createRoute({ getParentRoute: () => app, path: "/dossiers/$id", component: EcranDossier });
const formations = createRoute({ getParentRoute: () => app, path: "/formations", component: Formations });
const formation = createRoute({ getParentRoute: () => app, path: "/formations/$id", component: FicheFormation });
const outils = createRoute({ getParentRoute: () => app, path: "/outils", component: Outils });
const repertoire = createRoute({ getParentRoute: () => app, path: "/repertoire", component: Repertoire });
const candidature = createRoute({ getParentRoute: () => app, path: "/candidature", component: MaCandidature });
const adminCandidatures = createRoute({ getParentRoute: () => app, path: "/admin/candidatures", component: AdminCandidatures });
const adminOrganisme = createRoute({ getParentRoute: () => app, path: "/admin/organisme", component: AdminOrganisme });
const bpf = createRoute({ getParentRoute: () => app, path: "/bpf", component: Bpf });
const courriers = createRoute({ getParentRoute: () => app, path: "/courriers", component: Courriers });
const compte = createRoute({ getParentRoute: () => app, path: "/compte", component: Compte });

const arbre = racine.addChildren([
  connexion,
  inscription,
  invitation,
  app.addChildren([accueil, nouveauDossier, dossier, formations, formation, outils, repertoire, candidature, adminCandidatures, adminOrganisme, bpf, courriers, compte]),
]);

export const routeur = createRouter({ routeTree: arbre, defaultPreload: "intent", scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof routeur;
  }
}
