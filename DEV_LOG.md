# Journal de développement — Plateforme S4M

Chaque entrée suit le protocole du projet : **spécification → code → tests exécutés → checkpoint**.
Un jalon n'est « merged » que si `npm run verifier` (typage + lint + tests) passe entièrement.

Documents liés : [cadrage et matrice d'écart](docs/00_CADRAGE.md) · [architecture](docs/ARCHITECTURE.md) · [hypothèses](docs/HYPOTHESES.md).

---

## Décisions de cadrage — 20/09/2026

| # | Décision | Choix du porteur de projet |
|---|---|---|
| 1 | Pile technique | **A — locale autonome** : React + Hono + PostgreSQL embarqué (PGlite). Le « Joker » Lovable est abandonné en connaissance de cause. |
| 2 | Emplacement du code | **Nouveau dépôt propre**. `skills4mation` (base B) et `academieformatrix` (base A) restent intacts, comme réserves de pièces. |
| 3 | Points ouverts du cahier des charges | **Hypothèses par défaut**, paramétrables, consignées dans `docs/HYPOTHESES.md`. |

Trois décisions d'architecture en découlent (détail dans `docs/ARCHITECTURE.md`) :
**D1** noyau métier pur · **D2** une seule ligne par pièce, donc aucune synchronisation à maintenir ·
**D3** toute transition de statut décidée par le noyau, par rôle.

---

## J0 — Socle du dépôt ✅

**Critères d'acceptation.** Dépôt installable par `npm install` ; `npm run verifier` exécute typage, lint et tests ; CI GitHub Actions ; aucun secret versionné.

**Réalisé.** TypeScript 5.9 strict (`noUncheckedIndexedAccess`), ESLint 10 + typescript-eslint, Prettier, Vitest 5, workflow `ci.yml`, `.gitignore`, `.env.example`.

**Choix techniques.**
- TypeScript **5.9** et non 7.0 : typescript-eslint 8 n'accepte pas encore TypeScript ≥ 6.1.
- La décision D1 est **vérifiée par ESLint** (`no-restricted-imports` sur `src/domaine/**`) : importer le serveur, React, Hono, Drizzle ou un module `node:` depuis le noyau casse le lint, donc la CI.
- `.env` ignoré d'office. Constat sur l'existant : les deux dépôts Lovable versionnent leur `.env` (clés « publishable » uniquement — gravité faible, mais mauvaise habitude à ne pas reconduire).

## J1 — Noyau « variables et pièces » ✅ — 23 tests

**Critères d'acceptation.** Aucun nom de variable hors règles ; aucun alias ne pointe dans le vide ; les 13 pièces du référentiel et les deux espaces de communication reproduisent exactement le cahier des charges.

**Réalisé.** `src/domaine/referentiel/` : `variables.ts` (dictionnaire), `alias.ts` (anciens noms → noms harmonisés), `pieces.ts` (nomenclature).

**Choix techniques.**
- Le dictionnaire est **écrit en TypeScript** et non généré depuis le classeur : l'onglet regroupe plusieurs variables par ligne (« of_iban / of_bic / of_banque_nom »), ce qui rend une génération automatique fragile. Le classeur reste la référence documentaire (`docs/sources/`).
- **Coquille corrigée** : la skill `conventions-s4m` écrit une fois `of_qualiodi_numero` ; seule la graphie `of_qualiopi_numero` existe, et un test le verrouille.
- **Variables ajoutées** (marquées `ajout: true`), car exigées par le cahier des charges et absentes du classeur : `entreprise_representant_email` (sans elle, l'e-mail automatique F-DOS-06 est impossible), `stagiaire_N_email` (invitation F-COM-05), `portage_commission_montant`, `facture_formateur_net_a_payer`, `attestation_heures_realisees`, `attestation_date`.
- **Trois pièces ajoutées** aux 13 du référentiel : `PRE` (pré-dossier), `ACC` (accord de financement, document externe), `REF` (justificatif de refus).
- Alias **ambigu** `prixun` (une seule variable servait à deux colonnes de la facture) : la migration refuse de choisir.

## J2 — Moteur de gabarits et gabarits des pièces ✅ — 59 tests

**Critères d'acceptation.** Zéro ancien nom, zéro donnée réelle en dur, zéro balise restante après rendu ; chaque gabarit se rend complètement sur le dossier de démonstration.

**Réalisé.** `src/domaine/gabarits/` (`moteur.ts`, `migration.ts`, `zones.ts`), `src/domaine/dossier/` (agrégat, champs calculés, résolution des variables, formats français), 14 gabarits HTML dans `gabarits/`.

**Réutilisation.** Repris de la base B (`render.ts`) : le principe `{{variable}}` échappé et `balisesRestantes`. **Abandonné** : le script JavaScript injecté dans chaque document pour supprimer les lignes vides côté navigateur — il ne fonctionne pas sans navigateur et reposait sur des classes CSS. Remplacé par des blocs `<!-- repeter:stagiaire -->` développés côté serveur, imbricables (feuille d'émargement : stagiaires × séances).

**Choix techniques.**
- Le moteur **ne lève jamais** : il rend et rapporte les variables manquantes ; c'est le service de génération qui décide de refuser une pièce incomplète.
- `analyserGabarit` automatise la « procédure de contrôle final » de la skill. Le test `gabarits.test.ts` l'applique à **tous** les gabarits et cherche en plus des motifs de données réelles (SIRET, IBAN, dates, montants, noms propres).
- Textes juridiques repris **à l'identique** des matrices Word (convention, contrat de sous-traitance, charte du formateur) ; seules les identités en dur sont devenues des variables. Tribunal compétent : `{{of_tribunal_competent}}` — l'incohérence entre les deux matrices devient un simple champ de configuration.
- **Ajout à signaler** : la facture de l'OF porte les mentions de pénalités de retard et d'indemnité forfaitaire de 40 €, obligatoires entre professionnels et absentes de la matrice. À faire relire.
- Montants en **centimes entiers** dans tout le noyau : aucun flottant sur de l'argent.
- **Modèle de commission** repris de `commission.ts` (base B) : prix de vente HT − commission de portage = net formateur. Si un coût horaire est saisi au contrat, il prime et la commission affichée est celle réellement constatée. Le barème dégressif 25/23/20 % de B n'est pas repris : le taux est un paramètre de l'organisme (skill : « jamais un texte figé »).

## Noyau des jalons J7, J9, J11 ✅ — 49 tests

Ces règles sont pures ; elles ont été écrites et testées avant la base de données, qui ne fera que les brancher.

- **Pipeline** (`src/domaine/pipeline/`) : 7 étapes, 13 sous-statuts, 13 actions. `transiter()` vérifie l'étape, le **rôle**, le motif et la garde métier, puis **déclare** les effets à exécuter. Tests : parcours nominal complet, RG-02, RG-06, RG-07, complétude de l'étape D, et la matrice des refus par rôle (correctif de l'audit du 01/09/2026 : le formateur ne valide ni ne paie son propre dossier ; l'accord n'est enregistré que par le système, au dépôt du document).
- **Pièces** (`src/domaine/pieces/statut.ts`) : pièces attendues selon l'avancement, exemplaire par stagiaire pour les pièces individuelles, cloisonnement de lecture de l'apprenant.
- **Signature** (`src/domaine/signature/preuve.ts`) : repris de B l'empreinte SHA-256 et le certificat ; ajoutés le tracé manuscrit, le lieu, le contrôle du format du tracé (PNG uniquement, taille bornée) et la vérification d'intégrité.
- **BPF** (`src/domaine/bpf/agregation.ts`) : agrégation par exercice (date de fin), par origine de financement et par formateur ; export CSV lisible par Excel en français.
- **Formulaires et QCM** (`src/domaine/formulaires/`) : recueil des besoins et grille à chaud repris des matrices Word ; le corrigé d'un QCM n'est jamais transmis à l'apprenant.

## J3 — Base de données et ports ✅

**Critères d'acceptation.** Une base PostgreSQL réelle sans rien installer ; le schéma et le code ne peuvent pas diverger ; chaque dépendance extérieure (disque, e-mail, PDF, horloge) est remplaçable en test.

**Réalisé.** `src/serveur/bd/schema.ts` (23 tables, Drizzle), `drizzle/0000_initial.sql`, `bd/connexion.ts`, `ports/{archive,courrier,pdf,divers}.ts`, `tests/banc.ts`.

**Choix techniques.**
- **PGlite** : un vrai PostgreSQL compilé en WebAssembly, dans un dossier. Même SQL, mêmes migrations qu'un serveur PostgreSQL ; `DATABASE_URL=postgres://…` bascule sans changer une ligne de code métier.
- **Les migrations sont rejouées à chaque démarrage.** C'est la réponse structurelle au défaut principal de la base B : 105 erreurs de typage parce que le code lisait des tables absentes du schéma réellement déployé. Ici, une base en retard sur le code est impossible.
- **Les tests d'intégration tournent sur la vraie base**, en mémoire, recréée pour chaque fichier de test. Aucun bouchon de base de données : un bouchon aurait masqué le bogue Zod décrit en J6.
- PDF par Chromium (`playwright-core`) : Chrome, Edge ou Chromium détecté automatiquement ; sans navigateur, l'application archive du HTML imprimable et continue de fonctionner.

## J4 — Comptes, sessions, postulation (Module 1) ✅ — 9 tests

**Réalisé.** `services/{auth,invitations,candidatures,courriels}.ts`.

**Écart assumé par rapport au cadrage.** Le plan annonçait la bibliothèque better-auth. Le besoin réel est réduit (e-mail + mot de passe, invitations, trois rôles) et les flux sont spécifiques (candidature à valider, invitation d'apprenant à usage unique). L'authentification est donc écrite sur les primitives de Node : `scrypt`, jetons opaques de 256 bits **stockés hachés**, cookie `httpOnly` `SameSite=Lax` de 12 h, réponse identique pour « compte inconnu » et « mauvais mot de passe », blocage après 5 échecs en 15 min, fermeture de toutes les sessions au changement de mot de passe. Contre le CSRF : en-tête `x-requested-with` exigé sur toute écriture. → Hypothèse 13 : **à faire relire par un tiers avant mise en production.**

## J5 — Formations, outils, coffre-fort, génération (Modules 2, 3, 7) ✅

**Réalisé.** `services/{formations,repertoire,fichiers,agregat,generation}.ts`.

**Choix techniques.** L'agrégat du dossier porte des propriétés **nommées comme les variables du référentiel** : la résolution des variables est une simple lecture, sans table de correspondance à maintenir. Fichiers déposés : extension sur liste blanche, taille bornée, nom de stockage généré (jamais celui de l'utilisateur), empreinte SHA-256.

## J6 à J10 — Dossiers, pipeline exécuté, retours, signature, émargement, évaluations ✅ — 27 tests

**Réalisé.** `services/{dossiers,pipeline,retours,evaluations,taches}.ts` ; `tests/integration/parcours-complet.test.ts` déroule un dossier de **Brouillon à Archivé**, puis un refus de financement, en vérifiant à chaque pas les droits de chaque rôle.

**Bogue réel attrapé par ce test.** `schema.partial()` de Zod conserve les `.default("")` : modifier **un** champ d'une entreprise remettait à vide son SIRET et son représentant. Corrigé par `validerPartiel()` (`services/socle.ts`), qui ne retient que les clés effectivement envoyées. Aucun test unitaire ne l'aurait vu ; le parcours complet, si.

**Choix techniques.**
- Le service `pipeline` n'a **aucune règle** : il demande au noyau (`transiter`) si l'action est permise, puis exécute les effets déclarés. Une règle du cahier des charges se lit donc à un seul endroit.
- Correctif de l'audit du 01/09/2026 : dans la base B, un formateur pouvait pousser son propre dossier jusqu'au paiement. Ici, valider, enregistrer un paiement et archiver sont réservés à l'admin, et c'est vérifié côté serveur, par le noyau.
- Signature : l'horodatage est celui **du serveur** ; l'empreinte du document signé est enregistrée, et `verifierIntegritePiece` détecte toute modification ultérieure du fichier archivé.
- Numérotation `ADF-AAAA-NNNN` par organisme et par année, par compteur transactionnel.

## J11-J12 — BPF et RGPD (Modules 8, 9) ✅ — 6 tests

**Réalisé.** `services/{bpf,rgpd}.ts`. Suppression de compte : phrase de confirmation à recopier, effacement des champs identifiants et des pièces de candidature, conservation des dossiers avec un formateur anonymisé ; l'adresse e-mail est libérée. Les pièces **déjà archivées** ne sont pas réécrites (obligation de conservation) — hypothèse 10.

## API et interface ✅ — 9 tests d'API, 5 parcours navigateur

**Réalisé.** `http/app.ts` (API mince), `src/client/` (13 écrans), `tests/e2e/parcours.spec.ts`.

**Choix techniques.**
- **Les types de l'interface sont déduits des services du serveur** (`src/client/api.ts`) : renommer un champ côté serveur casse la compilation de l'écran qui le lit. C'est le second verrou contre la dérive constatée dans la base B.
- TanStack Router en routes déclarées dans le code, TanStack Query pour l'état serveur ; aucun gestionnaire d'état global.
- Aperçu des pièces dans un `iframe` `sandbox`, servi avec une CSP stricte : un gabarit ne peut exécuter aucun script.

**Bogue réel attrapé par le test navigateur.** Une URL protégée ouverte sans session **gelait l'onglet** : `<Navigate>` dans le cadre de l'application bouclait sur le rendu. La garde est maintenant dans `beforeLoad` du routeur (`redirect`), avec un client de requêtes partagé (`src/client/requetes.ts`).

**Parti pris de conception** (principes de la skill Hallmark ; ses fichiers de référence n'étaient pas disponibles, seules les règles du `SKILL.md` ont été appliquées). Public : des formateurs indépendants, pas des informaticiens ; usage : administratif, répétitif, parfois sur téléphone ; ton : sobre et rassurant. D'où : jetons de couleur OKLCH verrouillés (vert #1D6A45, jaune #F2C230), Inter + Poppins servies localement, aucun titre en italique, les huit états de chaque composant interactif, animations sur `transform`/`opacity` seulement, respect de `prefers-reduced-motion`, aucun défilement horizontal à 320, 375 et 768 px (vérifié par test).

## J13 — Finitions, portabilité, documentation ✅

- **Windows** : `npm start` n'utilise plus la syntaxe `VAR=valeur commande` ; la préparation des tests navigateur passe par Node et non par `rm -rf`.
- **`AMORCE=vide`** : premier démarrage sur un organisme vierge et un seul compte administrateur (`ADMIN_EMAIL`, `ADMIN_MOT_DE_PASSE`), pour passer du jeu de démonstration au réel sans toucher au code. `APP_URL` est déduite du port si elle n'est pas fournie. `SESSION_SECRET`, annoncé puis inutile (les jetons sont opaques et hachés), est retiré.
- Impression : marge interne des gabarits corrigée (la bordure droite des tableaux était rognée dans le PDF). Signature : le tracé n'est plus effacé quand le clavier d'un téléphone redimensionne la page. Polices réduites au sous-ensemble latin.
- CI : second travail `bout-en-bout` (navigateur), après `verifier`.
- `.gitattributes` impose des fins de ligne LF : sous Windows, Git ne signale pas de faux changements.
- Documentation : `README.md`, `docs/ARCHITECTURE.md`, `docs/HYPOTHESES.md` (20 points), `docs/TRACABILITE.md` (51 exigences et 8 règles → code → test), `docs/GUIDE_GIT.md`.

**Checkpoint final.** `npm run verifier` : typage propre, lint propre, **182 tests verts** (12 fichiers). `npm run build` : OK. `npm run test:e2e` : **5/5**.

## 23/09/2026 — Cahier des charges oral : trois espaces, parcours de l'apprenant, IA pédagogique ✅ — 54 tests de plus

**Spécification.** Dictée du porteur de projet, analysée phrase par phrase dans `docs/ANALYSE_23-09.md` (12 exigences
O-01 à O-12 : 4 conformes, 4 partielles, 4 manquantes).

**Critères d'acceptation.** Chaque phrase du cahier oral a un test qui la cite ; l'IA ne peut pas atteindre les pièces
contractuelles (test de garde) ; les 182 tests existants restent verts ou sont mis à jour avec leur justification.

**Réalisé.**
- Noyau : `parcours/apprenant.ts` (cinq sections colorées), `pedagogie/propositions.ts` (consignes et validation
  stricte des réponses de l'IA), `declarer_depot` ouvert à l'apprenant et gardé par la convention signée, pièce `PRG`.
- Serveur : migration `0001_programme_annexe.sql` (programme figé dans le dossier), port `ia.ts` et service
  `pedagogie-ia.ts`, routes `/api/ia/*`, e-mail « demande de financement déposée », programme joint à l'e-mail à l'entreprise.
- Interface : accueil du formateur à trois espaces, rail latéral groupé, pipeline déplacé dans `/dossiers`, générateur
  à onglets qu'on peut reprendre, espace de l'apprenant en sections, boutons « Proposer avec l'IA ».

**Bogue de fond corrigé.** La convention (articles 1.2 et 3) annonçait « le programme détaillé en annexe », mais
aucune pièce ne le portait : un auditeur Qualiopi l'aurait relevé. Le programme est désormais une pièce générée,
transmise, jointe à l'e-mail à l'entreprise, et exigée avant la soumission.

**Tests mis à jour (et pourquoi).** `pipeline.test.ts` (l'apprenant a désormais une transition : décision du cahier oral),
`referentiel.test.ts` et `parcours-complet.test.ts` (pièce « 2 ter » ajoutée), jeu de démonstration (le refus de
financement intervient après la signature de la convention, comme dans la réalité).

**Checkpoint.** `npm run verifier` : **236 tests verts** (17 fichiers). `npm run test:e2e` : **7/7**. `npm run build` : OK.

## 23/09/2026 (après-midi) — « Modification 1 » : parcours, kit pédagogique, coffre-fort, positionnement, profil, archives ✅ — 33 tests et 4 parcours navigateur de plus

**Spécification.** Document « Modification 1.docx » (5 captures, consignes) + message du porteur de projet. Analyse et
listing des 21 manques : `docs/MODIFICATION_1_23-09.md`.

**Critères d'acceptation.** Chaque consigne a un test qui la cite (`tests/integration/modification-1.test.ts`) ; le
compte pilote joue le parcours complet dans un vrai navigateur (`tests/e2e/modification-1.spec.ts`) ; les 236 tests
existants restent verts ; le test de garde de l'IA reste vert.

**Réalisé.**
- Noyau : `pedagogie/listes.ts` (menus déroulants), `pedagogie/parcours.ts` (trame de parcours, répartition des heures,
  tests et 20 diapositives, validations), consignes IA de parcours et de diaporama (`propositions.ts`).
- Serveur : migration `0002_modification_1.sql` ; services `coffre.ts`, `positionnements.ts`, `supports.ts` (PPTX avec
  `pptxgenjs`, ZIP avec `jszip`), `sauvegarde.ts` ; `formations.ts` (champs de convention, cohérence, versions,
  archives, corbeille) ; compte pilote au démarrage (`amorce.ts`) ; routes publiques `/api/public/positionnement/*`.
- Interface : formation en quatre onglets avec générateur et éditeur de modules, kit pédagogique, atelier des
  supports, coffre-fort par parcours, positionnements (formateur et page publique), profil et candidature, archives et
  sauvegarde, historique des versions, brouillon local de secours, partie financière du dossier.

**Choix notables.** La trame fonctionne sans IA, pour que « générer » marche toujours ; l'IA ne fixe jamais les
durées (imposées par la plateforme) ; le positionnement public se fait sans compte (H-27) ; les suppressions deviennent
des archivages ou des mises à la corbeille.

**Bogues trouvés pendant la recette.** Erreurs de champ non affichées sous « Durée »/« Tarif » (clés locales ≠ clés
serveur) ; boutons du kit débordant de leur carte ; tracé de signature sous la barre collante (test).

**Checkpoint.** `npm run verifier` : **269 tests verts** (18 fichiers). `npm run test:e2e` : **11/11**. `npm run build` : OK.

## Dette connue, à traiter ensuite

1. Hypothèses 11 (qui signe la convention), 12 (valeur de la signature) et 13 (relecture de l'authentification) : **bloquantes avant toute mise en production**.
2. Aucune purge automatique à l'échéance de conservation (hypothèse 9) ; aucun export « mes données » pour l'apprenant.
3. Pas de reprise des dossiers de l'ancienne plateforme. `domaine/gabarits/migration.ts` sait déjà convertir les anciens gabarits ; les données restent à faire.
4. Un seul fichier de migration : à partir de maintenant, toute évolution du schéma passe par `npm run db:generate` et un **nouveau** fichier, jamais par la modification de `0000_initial.sql`.
5. « Modification 1 » : relances automatiques et purge des positionnements, tableau de bord OF des échéances,
   images et PDF des supports, sauvegarde complète en un clic — voir `docs/SUITE_ET_TODO.md`.

---

## Version 7 — 23/09/2026 ✅

**Demande.** Document « modif.docx » + questionnaire : IA réglée dans l'appli et recherche web par formation, plus de trame, plus de saisie formateur, plus de coût horaire, public/prérequis pré-remplis, e-mails fonctionnels (SMTP Gmail), formulaires apprenant en page interactive signée (5 types, auto + bouton).

**Réalisé.** Voir `docs/VERSION_7_23-09.md`. Migration `0003_version_7`. Tests : 310 vitest (+41), 14 Playwright (+3). Relecture code + UX par un second agent.

**Défauts trouvés par les tests et corrigés.** Route `/api/ia/etat` sans `await` ; assistant factice répondant le mauvais schéma ; échappement HTML de l'e-mail de test ; message de déchiffrement.

**Non fait / à faire.** Premier appel IA réel (clé + workspace) ; révocation de la clé exposée ; images dans les PPTX ; découpage du bundle.
