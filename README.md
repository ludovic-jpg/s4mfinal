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
| **Formateur pilote (Ludovic)** — espace vide, candidature validée | **`ludoalbisser@gmail.com`** | **`1234ludo`** |

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

## Le menu principal : trois espaces

Depuis le cahier des charges oral du 23/09/2026 ([`docs/ANALYSE_23-09.md`](docs/ANALYSE_23-09.md)), l'accueil du formateur
présente **trois espaces** :

- **Espace pédagogique** : mes formations (enjeux, parcours, coffre-fort), outils pédagogiques. L'assistant IA y propose des brouillons ;
- **Espace apprenant** : les fiches des apprenants et des entreprises. Chaque apprenant invité suit son parcours en cinq
  sections : étape préliminaire, validation, demande de financement, accord, formation ;
- **Espace formation** : le générateur de conventions, le pipeline « Mes dossiers », le BPF, la boîte d'envoi.

L'IA ne sert **que** dans l'espace pédagogique : un test de garde (`tests/integration/ia-perimetre.test.ts`) fait échouer
la CI si elle est branchée ailleurs. Conventions, pièces et montants sont produits sans IA, à l'octet près.

Pour lancer, tester et mettre en ligne pas à pas : [`docs/GUIDE_LANCEMENT.md`](docs/GUIDE_LANCEMENT.md).

### « Modification 1 » du 23/09/2026

État des lieux et listing des 21 manques traités : [`docs/MODIFICATION_1_23-09.md`](docs/MODIFICATION_1_23-09.md) ·
scénario de recette raconté, avec la lecture Qualiopi : [`docs/RECETTE_NARRATIVE.md`](docs/RECETTE_NARRATIVE.md) ·
manquements, points en suspens et to-do : [`docs/SUITE_ET_TODO.md`](docs/SUITE_ET_TODO.md).

- **Générateur de parcours** (titre, heures, jours, tarif, nombre de modules → modules complets) par l'assistant IA ;
  même principe pour le **test de positionnement**, l'**évaluation des acquis** et les **supports PPTX (20
  diapositives par module)**. Voir « Version 7 » ci-dessous : plus de trame sans IA.
- **Coffre-fort pédagogique par parcours** : partie pédagogique (supports, tests, programme) et administrative
  (documents qualité, positionnements signés, pièces de chaque dossier), dépôt et téléchargement, ZIP.
- **Positionnement avant dossier** : invitation par e-mail, page dédiée sans compte, recueil + test, date, signature
  tracée, PDF téléchargeable par l'apprenant, le formateur et l'organisme ; repris automatiquement dans le dossier.
- **Apprenant + entreprise** créés d'un seul geste ; **partie financière** et tous les champs de la convention
  modifiables ; **menus déroulants** partout où c'est possible.
- **Profil et candidature** toujours accessibles, justificatifs avec échéance.
- **Archives, corbeille, historique des versions, brouillons, sauvegarde** : rien ne se perd, tout réapparaît.

### Version 7 du 23/09/2026

- **L'IA se règle dans l'application** : l'administrateur ouvre **Organisme → Assistant IA**, colle sa clé d'API
  Anthropic (chiffrée en base, jamais réaffichée), choisit le modèle (Claude Sonnet 5 recommandé) et autorise ou non
  la recherche web. Plus rien à éditer dans `.env`, plus de redémarrage. Ordre de grandeur des coûts, affiché sur
  l'écran : un parcours complet ≈ 0,20 – 0,50 €, un support de module ≈ 0,10 – 0,20 €, une recherche web ≈ 0,01 €.
- **Dossier d'enjeux par formation** : avant toute génération, l'IA mène une recherche web sur le sujet réel
  (enjeux, cadre réglementaire, notions clés, erreurs fréquentes, pratiques actuelles, sources) ; ce dossier est
  enregistré sur la formation (onglet « Enjeux ») et fonde le parcours, les tests et les supports.
- **Plus de « trame » sans IA** : sans assistant configuré, les boutons de génération sont grisés et expliquent où
  l'activer ; tout le reste de l'application fonctionne. Pour essayer sans clé : `IA_FACTICE=oui` dans `.env`
  (réponses fictives marquées « [démonstration] », jamais en production).
- **Formulaires de l'apprenant** (recueil des besoins, test de positionnement, évaluation des acquis, satisfaction à
  chaud et à froid) : chaque apprenant reçoit un e-mail avec un lien personnel (45 jours) et un document d'invitation
  PDF avec QR code ; la page s'ouvre à son nom, sans compte ; il répond, enregistre s'il veut reprendre plus tard, date,
  signe ; la pièce signée est validée dans le dossier et lui est renvoyée. Envoi automatique au bon moment du dossier
  (création → recueil + positionnement ; formation terminée → acquis + à chaud ; J+90 → à froid ; relance à J+7), et
  bouton **Envoyer / Renvoyer** sous chaque apprenant du dossier. Le formateur ne saisit plus de réponses à la place
  de l'apprenant.
- **E-mails réglés dans l'application** : **Organisme → E-mails** (hôte, port, identifiant, mot de passe chiffré,
  préréglages Gmail / Brevo / OVH / IONOS, e-mail de test). Avec Gmail ou Google Workspace, utilisez un « mot de passe
  d'application ». La boîte d'envoi permet de renvoyer un e-mail en échec.
- **Coût horaire du formateur supprimé** : la rémunération se calcule dans chaque dossier, par la commission de
  portage de l'organisme (prix de vente − commission = net formateur).

## Ce que fait l'application, module par module

| Module du cahier des charges | Où le voir |
|---|---|
| 1 · Postulation du formateur | Page d'inscription → « Ma candidature » ; côté admin : « Candidatures » |
| 2 · Mes formations | « Mes formations » : création, modification, duplication |
| 3 · Outils pédagogiques | « Outils pédagogiques » (éditeur de QCM) ; coffre-fort dans la fiche de chaque formation |
| 4 · Communication | Dans un dossier : onglets « Communication Apprenant » et « Communication avec l'OF » |
| 5 · Création d'un dossier | Espace formation → « Générateur de conventions » : cinq onglets, dans l'ordre imposé par le cahier des charges, qu'on peut reprendre |
| 6 · Pipeline « Mes dossiers » | Espace formation → « Mes dossiers » (formateur) ; page d'accueil de l'admin : sept colonnes, treize sous-statuts |
| 7 · Génération et archivage | Automatique à la validation ; fichiers dans `donnees/archive/<organisme>/dossiers/<référence>/` |
| 8 · BPF | « BPF » : agrégats par exercice, export CSV |
| 9 · Compte et RGPD | « Mon compte » → « Supprimer mon compte » |

Les e-mails automatiques ne partent pas pour de vrai par défaut : ils sont consignés dans la **Boîte d'envoi** de
l'application, où l'on peut les relire tels que le destinataire les recevrait.

## Organisation du code

```
src/
  domaine/     LE NOYAU MÉTIER — pur : ni base, ni réseau, ni écran. C'est ici que vivent les règles.
    referentiel/   dictionnaire des variables (79 du classeur + ajouts tracés), alias, 17 pièces
    gabarits/      moteur {{variable}}, blocs répétables, contrôle statique, migration d'anciens gabarits
    dossier/       agrégat, champs calculés (en centimes), résolution des variables, formats français
    pipeline/      7 étapes, 13 sous-statuts, 13 transitions gardées par rôle
    pieces/        statut binaire, pièces attendues, cloisonnement de lecture
    signature/     preuve de signature (tracé, lieu, horodatage, empreinte SHA-256), certificat
    formulaires/   recueil, satisfaction, QCM et correction
    bpf/           agrégation par exercice, export CSV
    parcours/      parcours de l'apprenant en cinq sections colorées (cahier des charges oral du 23/09)
    pedagogie/     consignes et validation stricte des propositions de l'IA (espace pédagogique seulement)
  serveur/
    bd/            schéma PostgreSQL (Drizzle), connexion PGlite / Postgres, jeu de démonstration
    ports/         archive (disque), courrier (boîte locale / SMTP), PDF (Chromium), horloge
    services/      cas d'usage : un fichier par module du cahier des charges
    http/          API Hono — mince : authentifie, appelle un service, traduit les erreurs
  client/          interface React : un écran par fichier dans ecrans/, composants dans ui/
gabarits/          les 15 gabarits HTML des pièces, et leurs fragments communs
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
| `COURRIER_MODE` | `boite-locale` (rien ne part) ou `smtp` — valeur **par défaut**, remplacée par les réglages **Organisme → E-mails** | `boite-locale` |
| `SMTP_URL`, `COURRIER_EXPEDITEUR` | Envoi réel des e-mails, à défaut de réglages dans l'application | — |
| `CHROMIUM_PATH` | Chrome, Edge ou Chromium pour produire les PDF | détection automatique |
| `AMORCE` | Première ouverture : `demonstration` ou `vide` (avec `ADMIN_EMAIL` et `ADMIN_MOT_DE_PASSE`) | `demonstration` |
| `ANTHROPIC_API_KEY`, `IA_MODELE`, `IA_WORKSPACE_ID`, `IA_RECHERCHE_WEB` | Assistant IA **par défaut** du serveur ; les réglages **Organisme → Assistant IA** priment | désactivé |
| `IA_FACTICE` | `oui` : assistant factice (réponses fictives « [démonstration] ») pour essayer sans clé ; ignoré en production | `non` |
| `CLE_SECRETS` | Clé de chiffrement (64 caractères hexadécimaux) des secrets enregistrés en base ; vide = fichier `.cle-secrets` créé à côté de la base | — |

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
3. Pour l'envoi réel des e-mails : **Organisme → E-mails** (préréglage Gmail, Brevo, OVH ou IONOS, identifiant, mot de
   passe — avec Gmail, un « mot de passe d'application »), puis « M'envoyer un e-mail de test ». `COURRIER_MODE=smtp`
   et `SMTP_URL` dans `.env` restent possibles comme valeurs par défaut.
   Pour l'assistant IA : **Organisme → Assistant IA**, clé d'API Anthropic et modèle.
4. Pour un hébergement : un serveur Node 22 en France ou dans l'UE, `DATABASE_URL=postgres://…` vers un
   PostgreSQL managé, `NODE_ENV=production`, HTTPS devant. Les mêmes migrations s'appliquent.

Avant toute mise en production, lisez [`docs/HYPOTHESES.md`](docs/HYPOTHESES.md) : vingt-six choix y attendent
votre validation, dont la valeur juridique de la signature et la relecture de l'authentification.

## Publier sur GitHub

```bash
git remote add origin https://github.com/<votre-compte>/s4m-plateforme.git
git push -u origin main
```

Le dépôt contient déjà son historique, son `.gitignore` (les secrets et `donnees/` n'y entrent jamais) et sa CI
(`.github/workflows/ci.yml`) : à chaque `push`, GitHub rejoue typage, lint, tests, build et parcours navigateur.
