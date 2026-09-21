/** Cadre de l'application : exige une session, affiche la navigation propre à chaque rôle (rail latéral, tiroir sur mobile). */
import { useEffect, useState } from "react";
import { Link, Navigate, Outlet, useLocation } from "@tanstack/react-router";
import { BookOpen, Building2, ClipboardCheck, FileSpreadsheet, FolderKanban, LogOut, Mail, Menu, PencilRuler, ShieldCheck, UserRound, UsersRound, X } from "lucide-react";
import { useDeconnexion, useMoi } from "../session";
import { Chargement, cx } from "../ui/base";

type Lien = { vers: string; libelle: string; icone: React.ReactNode; exact?: boolean };

function liensPour(role: string, formateurValide: boolean): Lien[] {
  const i = "size-[18px]";
  if (role === "admin") {
    return [
      { vers: "/", libelle: "Tous les dossiers", icone: <FolderKanban className={i} />, exact: true },
      { vers: "/admin/candidatures", libelle: "Candidatures", icone: <ClipboardCheck className={i} /> },
      { vers: "/bpf", libelle: "BPF", icone: <FileSpreadsheet className={i} /> },
      { vers: "/courriers", libelle: "Boîte d'envoi", icone: <Mail className={i} /> },
      { vers: "/admin/organisme", libelle: "Organisme", icone: <Building2 className={i} /> },
    ];
  }
  if (role === "formateur") {
    if (!formateurValide) return [{ vers: "/candidature", libelle: "Ma candidature", icone: <ClipboardCheck className={i} /> }];
    return [
      { vers: "/", libelle: "Mes dossiers", icone: <FolderKanban className={i} />, exact: true },
      { vers: "/formations", libelle: "Mes formations", icone: <BookOpen className={i} /> },
      { vers: "/outils", libelle: "Outils pédagogiques", icone: <PencilRuler className={i} /> },
      { vers: "/repertoire", libelle: "Apprenants", icone: <UsersRound className={i} /> },
      { vers: "/bpf", libelle: "BPF", icone: <FileSpreadsheet className={i} /> },
      { vers: "/courriers", libelle: "Boîte d'envoi", icone: <Mail className={i} /> },
    ];
  }
  return [{ vers: "/", libelle: "Mes formations", icone: <BookOpen className={i} />, exact: true }];
}

const ROLES: Record<string, string> = { admin: "Organisme de formation", formateur: "Formateur", apprenant: "Apprenant" };

export function Cadre() {
  const moi = useMoi();
  const deconnecter = useDeconnexion();
  const { pathname } = useLocation();
  const [tiroir, setTiroir] = useState(false);
  useEffect(() => setTiroir(false), [pathname]);

  if (moi.isPending) return <div className="px-8"><Chargement /></div>;
  const acteur = moi.data?.acteur;
  if (!acteur) return <Navigate to="/connexion" />;
  // Un formateur dont la candidature n'est pas validée n'a accès qu'à sa candidature et à son compte (F-ONB-02).
  if (acteur.role === "formateur" && !acteur.formateur_valide && !["/candidature", "/compte"].includes(pathname)) return <Navigate to="/candidature" />;

  const liens = liensPour(acteur.role, acteur.formateur_valide);
  const navigation = (
    <nav className="flex flex-1 flex-col gap-0.5" aria-label="Navigation principale">
      {liens.map((l) => (
        <Link
          key={l.vers}
          to={l.vers}
          activeOptions={{ exact: l.exact ?? false }}
          className="flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-medium text-encre-2 transition-colors duration-150 hover:bg-papier-3 hover:text-encre"
          activeProps={{ className: "!bg-accent-doux !text-accent-fort" }}
        >
          {l.icone}
          {l.libelle}
        </Link>
      ))}
    </nav>
  );
  const pied = (
    <div className="border-t border-trait pt-3">
      <Link to="/compte" className="flex items-center gap-3 rounded-sm px-3 py-2 hover:bg-papier-3" activeProps={{ className: "!bg-accent-doux" }}>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-papier-3 text-encre-2">
          <UserRound className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-medium">{acteur.nom}</span>
          <span className="block text-xs text-encre-3">{ROLES[acteur.role]}</span>
        </span>
      </Link>
      <button type="button" onClick={deconnecter} className="mt-1 flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm text-encre-3 hover:bg-papier-3 hover:text-encre">
        <LogOut className="size-[18px]" aria-hidden />
        Se déconnecter
      </button>
    </div>
  );
  const marque = (
    <div className="flex items-center gap-2.5 px-3 pb-6">
      <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-accent text-sur-accent">
        <ShieldCheck className="size-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 truncate font-display text-[15px] leading-tight font-semibold">{moi.data?.organisme?.nom ?? "Dossiers de formation"}</span>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-trait bg-papier-2 p-4 lg:flex">
        {marque}
        {navigation}
        {pied}
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-trait bg-papier/95 px-4 py-3 backdrop-blur lg:hidden">
        <span className="min-w-0 truncate font-display font-semibold">{moi.data?.organisme?.nom}</span>
        <button type="button" onClick={() => setTiroir(true)} aria-label="Ouvrir le menu" className="rounded-sm p-2 hover:bg-papier-3">
          <Menu className="size-5" />
        </button>
      </header>
      {tiroir && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Fermer le menu" className="absolute inset-0 bg-encre/40" onClick={() => setTiroir(false)} />
          <div className={cx("absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-papier-2 p-4 shadow-flottant")}>
            <div className="flex items-start justify-between">
              {marque}
              <button type="button" onClick={() => setTiroir(false)} aria-label="Fermer" className="rounded-sm p-1.5 hover:bg-papier-3">
                <X className="size-5" />
              </button>
            </div>
            {navigation}
            {pied}
          </div>
        </div>
      )}

      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
