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
