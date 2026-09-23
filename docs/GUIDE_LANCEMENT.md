# Guide : lancer, tester et mettre en ligne la plateforme Skills4mation

Ce guide s'adresse à un utilisateur débutant ou intermédiaire. Chaque commande est à **copier telle quelle**, et
chaque étape dit ce que tu dois voir à l'écran. Les commandes s'écrivent dans un **terminal**. Sous Windows, prends
PowerShell ou le terminal intégré de VS Code (menu *Terminal → Nouveau terminal*).

**Sommaire**

1. Installer une fois pour toutes
2. Récupérer la nouvelle version (branche `evolution/trois-espaces`)
3. Lancer l'application en local, et la tester
4. Mettre l'application en ligne (préproduction, puis production)
5. La méthode de travail qui garde un code solide
6. Dépannage

---

## 1. Installer une fois pour toutes

| Outil | Pourquoi | Vérifier |
|---|---|---|
| **Node.js 22 (LTS) ou plus récent** — <https://nodejs.org> | Fait tourner l'application | `node -v` affiche `v22…` ou plus |
| **Git** — <https://git-scm.com> | Garde l'historique du code | `git --version` |
| **VS Code** — <https://code.visualstudio.com> (conseillé) | Lire le code et voir les différences entre versions | — |

Rien d'autre n'est nécessaire : ni base de données à installer, ni Docker. La base PostgreSQL est **embarquée**
(PGlite) dans le dossier `donnees/`. Les PDF sont produits par Edge ou Chrome, qui sont détectés automatiquement.

> 💡 **Conseil de rangement.** Déplace le dossier `s4m-plateforme` de *Téléchargements\Sk4m2309* vers
> *Documents\Projects\s4m-plateforme*, puis supprime la copie en double `s4m-plateforme\s4m-plateforme`.
> Un projet professionnel ne vit pas dans *Téléchargements*.

---

## 2. Récupérer la nouvelle version

Le travail du 23/09 se trouve sur une **branche Git** distincte, `evolution/trois-espaces`. La version du 21/09 reste
intacte sur `main`. Rien n'est perdu, et tu choisis quand fusionner.

```powershell
cd "$HOME\Downloads\Sk4m2309\s4m-plateforme"   # ou ton nouvel emplacement
git branch                                      # la branche active porte une étoile
git switch evolution/trois-espaces              # passer sur la nouvelle version
git log --oneline -3                            # voir les derniers commits
```

**Si la branche n'existe pas encore** (livraison par archive `s4m-evolution-23-09.tgz`) : place l'archive à côté du
dossier `s4m-plateforme`, puis :

```powershell
cd "$HOME\Downloads\Sk4m2309\s4m-plateforme"
git switch -c evolution/trois-espaces          # crée la branche à partir de main
tar -xzf ..\s4m-evolution-23-09.tgz            # dépose les 52 fichiers modifiés ou nouveaux
npm install
npm run verifier                               # doit afficher « Tests 236 passed »
git add -A
git commit -m "Cahier des charges oral du 23/09 : trois espaces, parcours apprenant, programme annexé, IA pédagogique"
```

**Voir ce qui a changé** : dans VS Code, ouvre le panneau *Source Control* (icône des branches), ou tape :

```powershell
git diff main --stat          # la liste des fichiers modifiés
git diff main -- docs/        # le détail, ici limité à la documentation
```

**Revenir à l'ancienne version** à tout moment : `git switch main`.
**Adopter la nouvelle version** une fois ta recette faite (section 3.4) :

```powershell
git switch main
git merge evolution/trois-espaces
```

---

## 3. Lancer l'application en local

### 3.1 Premier lancement (trois commandes)

```powershell
npm install        # la première fois, ou après chaque changement de version (1 à 2 minutes)
npm run build      # compile l'interface
npm start          # démarre l'application
```

Tu dois voir, entre autres, ces lignes :

```
[s4m] base vide — création du jeu de démonstration…
[s4m] application prête sur http://localhost:3001
[s4m] courrier : boîte locale (rien ne part) · PDF : Chromium trouvé · IA pédagogique : désactivée
```

Ouvre **<http://localhost:3001>**. Mot de passe de tous les comptes de démonstration : **`demonstration-s4m`**.

| Pour tester… | Se connecter avec |
|---|---|
| Le menu à trois espaces et le générateur de conventions | `formatrice@demo.example` |
| Le parcours de l'apprenant (sections, signature, « J'affirme avoir déposé ») | `apprenante@demo.example` |
| La validation administrative et la boîte d'envoi | `admin@demo.example` |
| Une candidature de formateur à valider | `candidat@demo.example` |

**Arrêter** : `Ctrl + C` dans le terminal.
**Repartir d'une base neuve** : arrête l'application, supprime le dossier `donnees`, puis relance `npm start`.

> ⚠️ **Nouvelle migration.** Cette version ajoute une colonne à la base (`drizzle/0001_programme_annexe.sql`).
> Elle s'applique **toute seule** au démarrage, même sur une base existante. Seuls les dossiers déjà créés auront
> un programme vide : il suffit de le compléter dans le dossier, et il est de toute façon exigé avant la soumission.

### 3.2 Activer l'assistant IA de l'espace pédagogique (facultatif)

1. Crée une clé d'API sur <https://console.anthropic.com> (compte payant à l'usage).
2. Copie le fichier `.env.example` en `.env` (dans VS Code : clic droit → *Copier*, puis *Coller* et renommer).
3. Dans `.env`, renseigne :
   ```
   ANTHROPIC_API_KEY=sk-ant-...ta-cle...
   IA_MODELE=nom-du-modele
   ```
   Le nom exact du modèle se trouve sur <https://docs.claude.com>, page « Models ». Choisis un modèle récent de
   la gamme Sonnet : c'est un bon équilibre entre qualité et coût pour ce type de rédaction.
4. Relance `npm start`. La ligne de démarrage doit afficher `IA pédagogique : activée (…)`.

Les boutons « Proposer avec l'IA » apparaissent alors dans *Mes formations* et dans *Outils pédagogiques*.
L'IA ne reçoit que la description de la formation, jamais de données sur un apprenant ou une entreprise.
**Le fichier `.env` ne doit jamais être envoyé sur GitHub** : il est déjà exclu par `.gitignore`.

### 3.3 Lancer les tests

```powershell
npm run verifier     # typage + lint + 236 tests (environ 40 s) : doit finir sans erreur
npx playwright install chromium   # une seule fois, pour les tests navigateur
npm run test:e2e     # 7 parcours dans un vrai navigateur (environ 1 min)
```

Ce que tu dois lire à la fin : `Tests 236 passed` puis `7 passed`. Si un test échoue, son nom dit quelle règle est
cassée ; c'est **voulu**, et c'est ce qui protège le métier.

### 3.4 Développer en voyant le résultat en direct

```powershell
npm run dev    # API sur :3001 + interface sur http://localhost:5173, rechargée à chaque modification
```

### 3.5 Recette à la main

Suis la liste de [`RECETTE_23-09.md`](RECETTE_23-09.md), section 3. Compte environ une heure. Coche chaque ligne.
Une ligne qui ne se passe pas comme prévu devient un ticket, décrit en une phrase : « je fais X, j'attends Y,
j'obtiens Z ».

---

## 4. Mettre l'application en ligne

### 4.1 Avant tout : trois bloquants

Ne mets **aucun vrai dossier** en ligne avant d'avoir tranché ces trois points de `docs/HYPOTHESES.md` :

- **n° 11, qui signe la convention** : l'apprenant ou le représentant de l'entreprise ;
- **n° 12, valeur juridique de la signature** : prends l'avis d'un juriste ;
- **n° 13, relecture de l'authentification** : fais-la faire par un développeur tiers.

Commence donc par une **préproduction** : une adresse en ligne, des données fictives, un ou deux formateurs pilotes.

### 4.2 Ce dont l'application a besoin en ligne

| Besoin | Pourquoi | Recommandation |
|---|---|---|
| Un serveur **Node 22** qui tourne en continu | L'application est un seul programme (`npm start`) | Un petit serveur virtuel (VPS) hébergé **en France ou dans l'UE** |
| Un **disque persistant** | Les pièces archivées (`ARCHIVE_DIR`) sont des fichiers | Le disque du VPS, sauvegardé chaque nuit |
| Une base **PostgreSQL** | PGlite suffit en local et en préproduction ; en production, une vraie base avec des sauvegardes gérées | Un PostgreSQL « managé » chez le même hébergeur européen, via `DATABASE_URL=postgres://…` |
| **HTTPS** et un nom de domaine | Des sessions et des signatures passent par le site | Le reverse proxy **Caddy** obtient et renouvelle le certificat tout seul |
| Un **SMTP** pour les e-mails | Invitations, relances, envoi des pièces à l'entreprise | Le SMTP de ta messagerie professionnelle, ou un service d'e-mails transactionnels hébergé dans l'UE |

Parmi les hébergeurs européens courants : OVHcloud et Scaleway (France), Hetzner (Allemagne). Compare leurs offres
du moment toi-même : prix et gammes changent souvent. Pour des données d'apprenants, **exige un hébergement UE et
un contrat de sous-traitance RGPD (DPA)** : c'est un point d'audit Qualiopi et RGPD.

> Pourquoi pas une plateforme « tout-en-un » (type Render ou Railway) ? C'est possible, mais l'archive des pièces
> exige un disque persistant, souvent payant ou limité sur ces plateformes. Un VPS reste plus simple à
> comprendre et à sauvegarder.

### 4.3 Mise en ligne pas à pas sur un VPS (Ubuntu), environ 1 heure la première fois

Tu te connectes au serveur avec `ssh utilisateur@adresse-du-serveur`, puis :

```bash
# 1. Node 22 et Git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git

# 2. Le code (depuis ton dépôt GitHub PRIVÉ)
git clone https://github.com/<ton-compte>/s4m-plateforme.git
cd s4m-plateforme
npm ci && npm run build

# 3. La configuration
cp .env.example .env
nano .env
```

Dans `.env`, en production :

```
NODE_ENV=production
PORT=3001
APP_URL=https://app.skills4mation.fr
DATABASE_URL=postgres://utilisateur:motdepasse@hote:5432/s4m     # (ou laisse la base embarquée en préproduction)
ARCHIVE_DIR=/srv/s4m/archive
AMORCE=vide
ADMIN_EMAIL=ton.adresse@skills4mation.fr
ADMIN_MOT_DE_PASSE=une-phrase-longue-et-unique
COURRIER_MODE=smtp
SMTP_URL=smtps://utilisateur:motdepasse@smtp.fournisseur:465
COURRIER_EXPEDITEUR=Skills4mation <no-reply@skills4mation.fr>
```

```bash
# 4. Démarrer en tâche de fond, et redémarrer tout seul après un redémarrage du serveur
sudo npm install -g pm2
pm2 start "npm start" --name s4m
pm2 save && pm2 startup     # suivre la commande qu'il affiche

# 5. HTTPS avec Caddy (certificat automatique)
sudo apt-get install -y caddy
echo 'app.skills4mation.fr {
  reverse_proxy localhost:3001
}' | sudo tee /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Chez ton registrar, fais pointer le nom `app.skills4mation.fr` (enregistrement DNS « A ») vers l'adresse IP du
serveur. Ouvre ensuite <https://app.skills4mation.fr> : connecte-toi avec `ADMIN_EMAIL`, va dans **Organisme** et
saisis l'identité de l'organisme (SIRET, NDA, Qualiopi, représentant, tribunal…). Tant qu'un champ obligatoire
manque, aucun dossier ne peut être validé : c'est volontaire.

### 4.4 Mettre à jour la version en ligne

```bash
cd s4m-plateforme
git pull                  # récupère la version validée (branche main)
npm ci && npm run build
pm2 restart s4m           # les migrations de base s'appliquent toutes seules au démarrage
```

**Règle d'or :** on ne met en ligne que ce qui est passé par `npm run verifier` et par la CI GitHub (coche verte).

### 4.5 Sauvegardes (non négociable)

- **Chaque nuit** : une copie de la base (sauvegarde automatique du PostgreSQL managé, ou copie du dossier
  `donnees/base` si la base est embarquée) **et** du dossier `ARCHIVE_DIR`, envoyée **hors du serveur** (stockage
  objet européen).
- **Une fois par trimestre** : un **test de restauration** sur une machine vierge. Une sauvegarde jamais restaurée
  ne prouve rien.

---

## 5. La méthode de travail qui garde un code solide

C'est ce qui sépare un prototype d'un outil professionnel. Le dépôt applique déjà ces règles, et la CI les vérifie.

1. **Une évolution = une branche.** `git switch -c evolution/<sujet>`. On ne travaille jamais directement sur `main`.
2. **La règle d'abord, testée, puis l'écran.** Toute règle métier vit dans `src/domaine/` (sans base, sans écran),
   avec son test. L'écran ne fait qu'afficher ce que le serveur décide.
3. **`npm run verifier` avant chaque commit.** Si ce n'est pas vert, on ne commite pas.
4. **Des commits petits et parlants** : « Pièce PRG : programme annexé à la convention », pas « modifs ».
5. **Pull request sur GitHub**, puis fusion seulement quand la CI est verte. Même seul, cela laisse une trace relisible.
6. **Base de données : on n'édite jamais une migration existante.** On modifie `src/serveur/bd/schema.ts`, puis
   `npm run db:generate -- --name <sujet>` crée un **nouveau** fichier.
7. **Journal et hypothèses à jour.** Une entrée dans `DEV_LOG.md` par évolution ; tout choix fait à ta place va
   dans `docs/HYPOTHESES.md`.
8. **Secrets hors du code.** Clés, mots de passe et SMTP vont dans `.env` sur la machine, jamais dans Git.
9. **Avec Claude.** Donne-lui le dépôt entier (dossier connecté), demande-lui de lancer `npm run verifier` et de
   **montrer** le résultat. Une affirmation « c'est corrigé » sans test vert n'a aucune valeur.

---

## 6. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `node` n'est pas reconnu | Node.js n'est pas installé, ou le terminal a été ouvert avant l'installation | Installer Node 22, puis rouvrir le terminal |
| `EADDRINUSE :3001` | L'application tourne déjà | Fermer l'autre terminal, ou mettre `PORT=3002` dans `.env` |
| « PDF : indisponible » | Chrome ou Edge introuvable | Aucun blocage : les pièces sont en HTML imprimable. Sinon, renseigner `CHROMIUM_PATH` |
| Les boutons IA n'apparaissent pas | `ANTHROPIC_API_KEY` ou `IA_MODELE` vide | Voir 3.2, puis relancer |
| « Clé d'API IA refusée » | Clé erronée ou révoquée | Recréer une clé sur la console Anthropic |
| Un test échoue après une modification | Une règle métier a changé | Lire le nom du test : il cite l'exigence. Corriger le code, ou le test si la règle a **vraiment** changé (et le noter au DEV_LOG) |
| « Another git process seems to be running » | Un verrou Git est resté | Fermer VS Code, puis supprimer le fichier `.git\index.lock` |
