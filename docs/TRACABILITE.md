# Traçabilité — exigence → code → test

Chaque exigence du cahier des charges (`docs/sources/CahierdeschargesS4M.docx`) est reliée ici au code qui la
réalise et au test qui la prouve. Une exigence sans test n'est pas considérée comme livrée.

**Lecture.** `domaine/…` = `src/domaine/…` ; `services/…` = `src/serveur/services/…` ; `ecrans/…` =
`src/client/ecrans/…`. Tests : **P** = `tests/integration/parcours-complet.test.ts`, **C** =
`tests/integration/j4-comptes.test.ts`, **B** = `tests/integration/j11-j12-bpf-rgpd.test.ts`, **H** =
`tests/integration/http-et-semence.test.ts`, **E** = `tests/e2e/parcours.spec.ts` (vrai navigateur),
**D** = tests unitaires du noyau (`src/domaine/**/*.test.ts`).

Statut : ✅ réalisé et testé · 🟡 réalisé avec une hypothèse à valider (numéro dans [`HYPOTHESES.md`](HYPOTHESES.md)).

Pour retrouver une exigence dans le code : `git grep "F-COM-06"` — les identifiants sont cités en commentaire là où
la règle est appliquée.

## Module 1 — Postulation du formateur

| Réf. | Exigence (résumé) | Code | Test | |
|---|---|---|---|---|
| F-ONB-01 | Créer un compte, soumettre une candidature avec pièces | `services/auth.ts`, `services/candidatures.ts`, `ecrans/Acces.tsx`, `ecrans/Candidature.tsx` | C « refuse une candidature incomplète… », « accepte la candidature complète… » | 🟡 H6 (liste des pièces) |
| F-ONB-02 | L'admin consulte, approuve ou rejette | `services/candidatures.ts`, `ecrans/Admin.tsx` | C « réserve la décision à l'admin », H « admin : décide… » | ✅ |
| F-ONB-03 | Le candidat est informé de la décision | `services/courriels.ts` | C (e-mail de décision dans la boîte d'envoi) | ✅ |
| F-ONB-04 | Suppression du compte avec avertissement | `services/rgpd.ts`, `ecrans/Divers.tsx` (Compte) | B « F-RGPD-01 : annonce clairement… » | ✅ |

## Module 2 — Mes formations

| Réf. | Exigence | Code | Test | |
|---|---|---|---|---|
| F-FORM-01 | Formulaire de création aligné sur les variables `formation_` | `services/formations.ts`, `ecrans/Formations.tsx` | P « F-FORM-01/02 : crée une formation alignée… » | ✅ |
| F-FORM-02 | Consulter, modifier, dupliquer | idem ; duplication avec ses outils | P idem | ✅ |

## Module 3 — Outils pédagogiques

| Réf. | Exigence | Code | Test | |
|---|---|---|---|---|
| F-OUT-01 | Modèle de recueil des besoins | `domaine/formulaires/definitions.ts`, `services/formations.ts` | D `formulaires.test.ts`, P « recueil et positionnement… » | ✅ |
| F-OUT-02 | Modèle de test de positionnement | `domaine/formulaires/qcm.ts`, `ecrans/Outils.tsx` | D (validation, correction, corrigé masqué), P idem | ✅ |
| F-OUT-03 | Modèle d'évaluation des acquis | idem, `services/evaluations.ts` | P « évaluation des acquis… » | ✅ |
| F-OUT-04 | Coffre-fort rattaché à la formation | `services/formations.ts` (coffre), `services/fichiers.ts` | P « F-OUT-04 : le coffre-fort est rattaché… » | ✅ |
| F-OUT-05 | Coffre ouvert à l'apprenant dès l'accord | `domaine/pipeline/transitions.ts` (effet), `services/formations.ts` | P « RG-08 : avant l'accord… », H « apprenante : … coffres ouverts par un accord » | 🟡 H5 (éléments marqués partageables) |

## Module 4 — Communication

| Réf. | Exigence | Code | Test | |
|---|---|---|---|---|
| F-COM-01 | Fiche apprenant alignée sur `stagiaire_` / `entreprise_` | `services/repertoire.ts`, `ecrans/Repertoire.tsx` | P « F-COM-01/02, F-DOS-01 à 03… » | ✅ |
| F-COM-02 | Fiche réutilisable sur plusieurs dossiers | table `stagiaire_dossier` (`bd/schema.ts`) | P idem, et RG-07 (même apprenant, nouveau dossier) | ✅ |
| F-COM-03 | Statut binaire des pièces à signer | `domaine/pieces/statut.ts`, `ui/base.tsx` (PastilleStatut) | D `pipeline.test.ts`, P, E « apprenante : signe… » | ✅ |
| F-COM-03bis | Planning transmis en annexe, sans suivi | `domaine/referentiel/pieces.ts` (03-AVT : `suiviStatut: false`) | D `referentiel.test.ts` | ✅ |
| F-COM-04 | Espace apprenant dédié, pièces selon le statut | `services/agregat.ts` (`accederAuDossier`), `domaine/pieces/statut.ts` (`peutVoir`), `ecrans/Accueil.tsx` | P « F-COM-04/05… », « cloisonnement : Luc ne voit pas… », H « apprenante : ne voit que… » | ✅ |
| F-COM-05 | Invitation par e-mail générée par la plateforme | `services/invitations.ts`, `services/courriels.ts` | P « F-COM-04/05 : invite l'apprenant… », C (invitation à usage unique) | ✅ |
| F-COM-06 | (a) signer en ligne ou (b) télécharger / redéposer | `services/retours.ts` (`signerPiece`, `deposerRetour`), `domaine/signature/preuve.ts`, `ui/Signature.tsx` | P « F-COM-06(a)… », « F-COM-06(b)… », E | 🟡 H11, H12 (signataire, valeur probante) |
| F-COM-07 | Dépôt ⇒ statut Validé automatique | `services/retours.ts` (`marquerValidee`) | P idem | ✅ |
| F-COM-08 | Synchronisation espace ↔ dossier ↔ carte du pipeline | décision D2 : **une seule ligne** `piece_dossier`, lue partout | P « F-COM-06(a), F-COM-07/08… » (les trois vues comparées) | ✅ |
| F-COM-09 | Le formateur télécharge chaque pièce disponible | `services/retours.ts` (`telechargerPiece`), `ecrans/DossierPieces.tsx` | P, H « formatrice : … télécharge la version signée » | ✅ |
| F-COM-10 | Accord déposable par tout acteur | `services/retours.ts` (`deposerPieceExterne`), `domaine/referentiel/pieces.ts` (ACC) | P « F-COM-10, RG-06, F-OF-02… » | 🟡 H3 (document unique partagé) |

## Module 4 bis — Communication avec l'OF

| Réf. | Exigence | Code | Test | |
|---|---|---|---|---|
| F-OF-01 | Espace formateur ↔ OF, même mécanisme de statut | `domaine/pieces/statut.ts` (`vueEspace`), `ecrans/DossierPieces.tsx` | P, D | ✅ |
| F-OF-02 | ODM généré et envoyé dès l'accord | `domaine/pipeline/transitions.ts` (effets de `enregistrer_accord`), `services/pipeline.ts` | P « F-COM-10, RG-06, F-OF-02… » | 🟡 H2 (déclenchement automatique) |
| F-OF-03 | Le formateur signe l'ODM en ligne ou hors ligne | `services/retours.ts` | P « F-OF-03/04… » | ✅ |
| F-OF-04 | Statut de l'ODM synchronisé avec la carte | D2 | P idem | ✅ |
| F-OF-05 | Dépôt de la facture du formateur ; facture OF consultable | `services/retours.ts` (`trameFactureFormateur`), gabarits `10-FIN`, `11-FIN` | P « étapes E à G… » | 🟡 H4 (consultation seule) |

## Module 5 — Création d'un dossier

| Réf. | Exigence | Code | Test | |
|---|---|---|---|---|
| F-DOS-01 | Page dédiée de création | `services/dossiers.ts` (`creerDossier`), `ecrans/NouveauDossier.tsx` | P, E « … un dossier se crée en cinq choix » | ✅ |
| F-DOS-02 | Cinq choix, dans l'ordre imposé | `ecrans/NouveauDossier.tsx` | E idem | ✅ |
| F-DOS-03 | Pré-remplissage depuis le référentiel de variables | `services/agregat.ts`, `domaine/dossier/resolution.ts` | D `dossier.test.ts`, P | ✅ |
| F-DOS-04 | Recueil et positionnement obligatoires | `domaine/pipeline/transitions.ts` (garde), `services/pipeline.ts` (`manquesAvantSoumission`) | D, P « RG-02 / F-DOS-04… », E | ✅ |
| F-DOS-05 | Soumission à validation | `services/pipeline.ts` (`executerAction`) | P « F-DOS-05… » | ✅ |
| F-DOS-06 | E-mail automatique à l'entreprise, pièces jointes | `services/pipeline.ts` (effet `EMAIL_ENTREPRISE_PIECES_FINANCEMENT`), `services/courriels.ts` | P « RG-04, F-ARCH-01 à 03, F-DOS-06… », E « admin : valide… » | ✅ |
| F-DOS-07 | Nouveau dossier possible après un refus | `services/dossiers.ts` (`recreerDepuis`) | P « F-CRM-07, F-DOS-07… » | ✅ |

## Module 6 — Pipeline « Mes dossiers »

| Réf. | Exigence | Code | Test | |
|---|---|---|---|---|
| F-CRM-01 | Pipeline en colonnes, de gauche à droite | `domaine/pipeline/statuts.ts`, `services/dossiers.ts` (`listerDossiers`), `ecrans/Accueil.tsx` | H « formatrice : neuf dossiers répartis… », E « … montre les sept étapes » | ✅ |
| F-CRM-02 | Carte : titre, apprenant, dates | `ecrans/Accueil.tsx` (`Carte`) | H, E | ✅ |
| F-CRM-03 | Clic ⇒ détail et toutes les pièces, y compris espace OF | `services/dossiers.ts` (`lireDossier`), `ecrans/Dossier.tsx` | H « formatrice : lit un dossier… » | ✅ |
| F-CRM-04 | Téléchargement selon le statut | `services/retours.ts`, `domaine/pieces/statut.ts` (`piecesAttendues`) | P, H | ✅ |
| F-CRM-05 | Statut affiché pour chaque pièce | `ecrans/DossierPieces.tsx` | P, E | ✅ |
| F-CRM-06 | Relance de l'apprenant depuis le pipeline | `services/dossiers.ts` (`relancerApprenant`) | P « F-CRM-06 : relance l'apprenant… » | ✅ |
| F-CRM-07 | Dossier refusé : visible, archivé, non repris | `domaine/pipeline/statuts.ts` (`estTerminal`), `transitions.ts` | D, P « F-CRM-07, F-DOS-07… » | ✅ |

## Module 7 — Génération et archivage

| Réf. | Exigence | Code | Test | |
|---|---|---|---|---|
| F-ARCH-01 | Génération automatique à la validation | `services/generation.ts`, `gabarits/*.html`, `domaine/gabarits/moteur.ts` | P « RG-04… », `gabarits.test.ts` (tous les gabarits se rendent sans balise restante) | ✅ |
| F-ARCH-02 | Archivage dans un dossier propre à la formation | `ports/archive.ts` (disque local) | P (arborescence vérifiée) | 🟡 H7 (disque local au lieu de Drive ; le port accepte un autre adaptateur) |
| F-ARCH-03 | Sous-dossier « Pièces de départ » | `services/generation.ts` (`archiverRendu`) | P (liste exacte des fichiers) | ✅ |
| F-ARCH-04 | Sous-dossier « Retour » | `services/retours.ts` | P « F-COM-06(a)… » (document signé + certificat) | ✅ |
| F-ARCH-05 | Classement automatique, sans action manuelle | idem | P idem ; « J9 : un document retourné puis altéré dans l'archive est détecté » | ✅ |

## Module 8 — BPF

| Réf. | Exigence | Code | Test | |
|---|---|---|---|---|
| F-BPF-01 | Télécharger les informations nécessaires au BPF | `domaine/bpf/agregation.ts`, `services/bpf.ts`, `ecrans/Divers.tsx` (Bpf) | D `bpf.test.ts`, B « agrège le réalisé de l'exercice… » | ✅ |
| F-BPF-02 | Rubriques du Cerfa 10443, par formateur et par exercice | idem (`bpfEnCsv`) | B « exporte un CSV ; le formateur n'y voit que ses chiffres » | 🟡 H8 (contenu exact de l'export) |

## Module 9 — Compte et RGPD

| Réf. | Exigence | Code | Test | |
|---|---|---|---|---|
| F-RGPD-01 | Suppression à tout moment, après avertissement explicite | `services/rgpd.ts` (`PHRASE_DE_CONFIRMATION`) | B « F-RGPD-01… » | ✅ |
| F-RGPD-02 | Effacement des données du formateur et de son entreprise | `services/rgpd.ts` | B « F-RGPD-02/03… » | ✅ |
| F-RGPD-03 | Conservation des dossiers instruits | idem (dissociation) | B idem | 🟡 H10 (dissociation retenue) |

## Règles de gestion

| Réf. | Règle | Où elle est appliquée | Test |
|---|---|---|---|
| RG-01 | Fermeture du compte ≠ suppression des dossiers | `services/rgpd.ts`, colonne `anonymise_le` | B |
| RG-02 | Pas de soumission sans recueil ni positionnement | garde de `transiter("soumettre")` | D, P, E |
| RG-03 | Statut binaire, synchronisé partout | D2 — une ligne `piece_dossier` par pièce | D, P |
| RG-04 | Valider ⇒ e-mail à l'entreprise + génération / archivage | effets déclarés par `transiter("valider")`, exécutés par `services/pipeline.ts` | P, E |
| RG-05 | Tout dépôt ultérieur va dans « Retour » | `services/retours.ts` | P |
| RG-06 | Accord déposable par tous ; son dépôt déclenche l'ODM | `deposerPieceExterne` ⇒ action système `enregistrer_accord` | D, P |
| RG-07 | Refus : archivé, lisible, non bloquant | `estTerminal`, `recreerDepuis` | D, P |
| RG-08 | Coffre ouvert à l'apprenant dès l'accord | `aAtteint(sous_statut, "accord_financement")` | P, H |

## Exigences non fonctionnelles (section 9 du cahier des charges)

| Thème | Réponse | Preuve |
|---|---|---|
| Hébergement France / UE | Local par défaut ; en ligne : Node 22 + PostgreSQL, hébergeur au choix | README « Passer en réel » |
| Authentification individuelle, cloisonnement entre formateurs | Sessions par cookie `httpOnly`, contrôle d'accès dans **chaque** service (`accederAuDossier`) et non dans l'interface | C, H « refuse tout accès sans session… », P « cloisonnement… » |
| Conservation légale | Rien n'est supprimé à l'archivage ; un dossier archivé est en lecture seule | P « un dossier archivé est en lecture seule… » |
| Signature à valeur probante | Tracé + lieu + horodatage serveur + empreinte SHA-256 + certificat + vérification d'intégrité | D `preuve.test.ts`, P « J9… » — 🟡 H12 |
| Journalisation des e-mails | Table `courrier`, écran « Boîte d'envoi » | P, H |

## Ce qui n'est **pas** couvert

Par honnêteté, ce que cette version ne fait pas : dépôt sur Google Drive (F-ARCH-02, remplacé par le disque local
derrière un port), signature qualifiée au sens eIDAS (H12), envoi SMS, paiement en ligne, import des dossiers de
l'ancienne plateforme. Chacun de ces points a un emplacement prévu, décrit dans
[`ARCHITECTURE.md`](ARCHITECTURE.md) § « Ce qui n'est PAS fait (et où le brancher) ».
