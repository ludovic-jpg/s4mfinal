# Plateforme S4M — dossiers de formation, de la candidature à l'archivage

Application de portage de formateurs indépendants : elle gère de bout en bout le cycle de vie d'un dossier de
formation professionnelle dans le respect du référentiel Qualiopi — candidature du formateur, catalogue, création
et instruction des dossiers, deux espaces de communication (apprenant et organisme), pipeline en sept étapes,
signature électronique, génération et archivage automatiques des pièces, export BPF, suppression de compte RGPD.

Elle tourne **entièrement en local** : aucune base à installer, aucun Docker, aucun service cloud.
Elle est **multi-organismes** : l'identité de l'organisme de formation est une configuration, jamais une constante.

| | |
|---|---|
| Cahier des charges | `docs/sources/CahierdeschargesS4M.docx` — 9 modules, 51 exigences, 8 règles de gestion |
| Cadrage, matrice d'écart, plan | [`docs/00_CADRAGE.md`](docs/00_CADRAGE.md) |
| Architecture | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Exigence → code → test | [`docs/TRACABILITE.md`](docs/TRACABILITE.md) |
| Hypothèses à faire valider | [`docs/HYPOTHESES.md`](docs/HYPOTHESES.md) |
| Journal des décisions | [`DEV_LOG.md`](DEV_LOG.md) |
| Git pas à pas | [`docs/GUIDE_GIT.md`](docs/GUIDE_GIT.md) |

---

## Démarrer en trois commandes

Prérequis : **Node.js 22 ou plus récent** (<https://nodejs.org>). Rien d'autre.

```bash
npm install
npm run build
npm start
```

Ouvrez <http://localhost:3001>. Au premier démarrage, la base est vide : un **jeu de démonstration** est créé
(données entièrement fictives, neuf dossiers répartis sur tout le pipeline).

| Rôle | Adresse e-mail | Mot de passe |
|---|---|---|
| Admin de l'organisme | `admin@demo.example` | `demonstration-s4m` |
| Formatrice (candidature validée) | `formatrice@demo.example` | `demonstration-s4m` |
| Apprenante | `apprenante@demo.example` | `demonstration-s4m` |
| Candidat formateur (à valider) | `candidat@demo.example` | `demonstration-s4m` |

Pour repartir de zéro : arrêtez le serveur, supprimez le dossier `donnees/`, relancez.
Pour partir d'une base **vide**, sans données de démonstration : voir « Passer en réel » plus bas.

### Développer

```bash
npm run dev        # API sur :3001 + interface sur :5173, rechargement à chaud
npm run verifier   # typage + lint + tous les tests (à lancer avant chaque commit)
npm run test:e2e   # parcours dans un vrai navigateur
```

`npm run test:e2e` a besoin d'un Chromium : `npx playwright install chromium` (une fois), ou la variable
`CHROMIUM_PATH` pointant vers Chrome ou Edge.

## Ce que fait l'application, module par module

| Module du cahier des charges | Où le voir |
|---|---|
| 1 · Postulation du formateur | Page d'inscription → « Ma candidature » ; côté admin : « Candidatures » |
| 2 · Mes formations | « Mes formations » : création, modification, duplication |
| 3 · Outils pédagogiques | « Outils pédagogiques » (éditeur de QCM) ; coffre-fort dans la fiche de chaque formation |
| 4 · Communication | Dans un dossier : onglets « Communication Apprenant » et « Communication avec l'OF » |
| 5 · Création d'un dossier | « Nouveau dossier » : cinq choix, dans l'ordre imposé par le cahier des charges |
| 6 · Pipeline « Mes dossiers » | Page d'accueil du formateur et de l'admin : sept colonnes, treize sous-statuts |
| 7 · Génération et archivage | Automatique à la validation ; fichiers dans `donnees/archive/<organisme>/dossiers/<référence>/` |
| 8 · BPF | « BPF » : agrégats par exercice, export CSV |
| 9 · Compte et RGPD | « Mon compte » → « Supprimer mon compte » |

Les e-mails automatiques ne partent pas pour de vrai par défaut : ils sont consignés dans la **Boîte d'envoi** de
l'application, où l'on peut les relire tels que le destinataire les recevrait.

## Organisation du code

```
src/
  domaine/     LE NOYAU MÉTIER — pur : ni base, ni réseau, ni écran. C'est ici que vivent les règles.
    referentiel/   79 variables harmonisées, alias des anciens noms, 16 pièces
    gabarits/      moteur {{variable}}, blocs répétables, contrôle statique, migration d'anciens gabarits
    dossier/       agrégat, champs calculés (en centimes), résolution des variables, formats français
    pipeline/      7 étapes, 13 sous-statuts, 13 transitions gardées par rôle
    pieces/        statut binaire, pièces attendues, cloisonnement de lecture
    signature/     preuve de signature (tracé, lieu, horodatage, empreinte SHA-256), certificat
    formulaires/   recueil, satisfaction, QCM et correction
    bpf/           agrégation par exercice, export CSV
  serveur/
    bd/            schéma PostgreSQL (Drizzle), connexion PGlite / Postgres, jeu de démonstration
    ports/         archive (disque), courrier (boîte locale / SMTP), PDF (Chromium), horloge
    services/      cas d'usage : un fichier par module du cahier des charges
    http/          API Hono — mince : authentifie, appelle un service, traduit les erreurs
  client/          interface React : un écran par fichier dans ecrans/, composants dans ui/
gabarits/          les 14 gabarits HTML des pièces, et leurs fragments communs
drizzle/           migrations SQL, rejouées à chaque démarrage
tests/             intégration (vraie base en mémoire) et bout en bout (navigateur)
```

Règle d'or de l'architecture : **`src/domaine` n'importe rien d'autre que lui-même.** ESLint le vérifie ; la CI
échoue sinon. Conséquence : toutes les règles du cahier des charges se testent en une seconde, sans base ni écran.

## Configuration

Copiez `.env.example` en `.env`. Tout a une valeur par défaut raisonnable pour un usage local.

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` | Port de l'application | `3001` |
| `DATABASE_URL` | Dossier de la base embarquée, **ou** `postgres://…` pour un serveur PostgreSQL | `./donnees/base` |
| `ARCHIVE_DIR` | Racine de l'archive des pièces | `./donnees/archive` |
| `APP_URL` | Adresse publique (liens des e-mails) | déduite du port |
| `COURRIER_MODE` | `boite-locale` (rien ne part) ou `smtp` | `boite-locale` |
| `SMTP_URL`, `COURRIER_EXPEDITEUR` | Envoi réel des e-mails | — |
| `CHROMIUM_PATH` | Chrome, Edge ou Chromium pour produire les PDF | détection automatique |
| `AMORCE` | Première ouverture : `demonstration` ou `vide` (avec `ADMIN_EMAIL` et `ADMIN_MOT_DE_PASSE`) | `demonstration` |

Sans Chromium, l'application fonctionne : les pièces sont archivées en HTML imprimable au lieu de PDF.
Sous Windows, Edge est détecté automatiquement.

## Les gabarits des pièces

Un gabarit est un fichier HTML ordinaire de `gabarits/`, avec cette syntaxe :

```html
{{formation_titre}}                                        une variable du dictionnaire
<!-- repeter:stagiaire --> {{stagiaire_N_nom}} <!-- /repeter:stagiaire -->     une fois par stagiaire
<!-- si:formation_lien_visio --> … <!-- /si:formation_lien_visio -->           seulement si renseignée
<!-- zone:signature_apprenant -->                                              bloc produit par l'application
```

Le test `src/serveur/gabarits/gabarits.test.ts` refuse tout gabarit qui contiendrait une variable hors
dictionnaire, un ancien nom, une syntaxe `[CROCHETS]`, un bloc mal fermé, ou une **donnée réelle en dur**
(SIRET, IBAN, date, montant, nom propre). C'est la « procédure de contrôle final » de la skill `conventions-s4m`,
exécutée automatiquement.

## Passer en réel

1. Dans `.env` : `AMORCE=vide`, `ADMIN_EMAIL=vous@exemple.fr`, `ADMIN_MOT_DE_PASSE=…` (dix caractères au moins).
   Supprimez `donnees/` et démarrez : la base ne contient qu'un organisme vierge et votre compte administrateur.
2. Connectez-vous, ouvrez **Organisme** et saisissez votre identité (SIRET, déclaration d'activité, représentant,
   tribunal, IBAN, signature…). Tant qu'un champ obligatoire manque, aucun dossier ne peut être validé.
3. Pour l'envoi réel des e-mails : `COURRIER_MODE=smtp` et `SMTP_URL=smtps://utilisateur:motdepasse@serveur:465`.
4. Pour un hébergement : un serveur Node 22 en France ou dans l'UE, `DATABASE_URL=postgres://…` vers un
   PostgreSQL managé, `NODE_ENV=production`, HTTPS devant. Les mêmes migrations s'appliquent.

Avant toute mise en production, lisez [`docs/HYPOTHESES.md`](docs/HYPOTHESES.md) : quatorze choix y attendent
votre validation, dont la valeur juridique de la signature et la relecture de l'authentification.

## Publier sur GitHub

```bash
git remote add origin https://github.com/<votre-compte>/s4m-plateforme.git
git push -u origin main
```

Le dépôt contient déjà son historique, son `.gitignore` (les secrets et `donnees/` n'y entrent jamais) et sa CI
(`.github/workflows/ci.yml`) : à chaque `push`, GitHub rejoue typage, lint, tests, build et parcours navigateur.
