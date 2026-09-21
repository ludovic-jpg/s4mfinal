CREATE TABLE "coffre_fichier" (
	"id" text PRIMARY KEY NOT NULL,
	"of_id" text NOT NULL,
	"formateur_id" text NOT NULL,
	"formation_id" text NOT NULL,
	"nom_fichier" text NOT NULL,
	"chemin" text NOT NULL,
	"taille" integer NOT NULL,
	"type_mime" text DEFAULT '' NOT NULL,
	"partageable" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compteur" (
	"of_id" text NOT NULL,
	"cle" text NOT NULL,
	"valeur" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courrier" (
	"id" text PRIMARY KEY NOT NULL,
	"of_id" text NOT NULL,
	"dossier_id" text,
	"type" text NOT NULL,
	"destinataire" text NOT NULL,
	"sujet" text NOT NULL,
	"corps_html" text NOT NULL,
	"pieces_jointes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"statut" text DEFAULT 'journalise' NOT NULL,
	"erreur" text DEFAULT '' NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dossier_formation" (
	"id" text PRIMARY KEY NOT NULL,
	"of_id" text NOT NULL,
	"dossier_reference" text NOT NULL,
	"formateur_id" text NOT NULL,
	"entreprise_id" text NOT NULL,
	"formation_id" text,
	"sous_statut" text DEFAULT 'brouillon' NOT NULL,
	"mode_financement" text DEFAULT 'opco' NOT NULL,
	"formation_titre" text DEFAULT '' NOT NULL,
	"formation_objectifs" text DEFAULT '' NOT NULL,
	"formation_objectifs_atteints" text DEFAULT '' NOT NULL,
	"formation_niveau" text DEFAULT '' NOT NULL,
	"formation_prerequis" text DEFAULT '' NOT NULL,
	"formation_duree_heures_total" real,
	"formation_duree_jours" real,
	"formation_duree_heures_presentiel" real,
	"formation_duree_heures_distanciel" real,
	"formation_modalite" text DEFAULT 'presentiel' NOT NULL,
	"formation_lieu_nom" text DEFAULT '' NOT NULL,
	"formation_lieu_adresse" text DEFAULT '' NOT NULL,
	"formation_lieu_siret" text DEFAULT '' NOT NULL,
	"formation_lien_visio" text DEFAULT '' NOT NULL,
	"formation_date_debut" text DEFAULT '' NOT NULL,
	"formation_date_fin" text DEFAULT '' NOT NULL,
	"formation_opco" text DEFAULT '' NOT NULL,
	"formation_prix_unitaire_ht" integer,
	"formation_prix_presentiel_ht" integer,
	"formateur_cout_horaire" integer,
	"signature_lieu" text DEFAULT '' NOT NULL,
	"questionnaire_positionnement" jsonb,
	"questionnaire_acquis" jsonb,
	"motif_renvoi" text DEFAULT '' NOT NULL,
	"motif_refus" text DEFAULT '' NOT NULL,
	"coffre_ouvert" boolean DEFAULT false NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	"valide_le" timestamp with time zone,
	"termine_le" timestamp with time zone,
	"archive_le" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "emargement" (
	"id" text PRIMARY KEY NOT NULL,
	"seance_id" text NOT NULL,
	"stagiaire_id" text NOT NULL,
	"signataire" text NOT NULL,
	"trace_png" text NOT NULL,
	"horodatage" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entreprise_cliente" (
	"id" text PRIMARY KEY NOT NULL,
	"of_id" text NOT NULL,
	"formateur_id" text NOT NULL,
	"entreprise_nom" text DEFAULT '' NOT NULL,
	"entreprise_nom_commercial" text DEFAULT '' NOT NULL,
	"entreprise_adresse" text DEFAULT '' NOT NULL,
	"entreprise_siret" text DEFAULT '' NOT NULL,
	"entreprise_representant_civilite" text DEFAULT '' NOT NULL,
	"entreprise_representant_prenom" text DEFAULT '' NOT NULL,
	"entreprise_representant_nom" text DEFAULT '' NOT NULL,
	"entreprise_representant_telephone" text DEFAULT '' NOT NULL,
	"entreprise_representant_email" text DEFAULT '' NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation" (
	"id" text PRIMARY KEY NOT NULL,
	"dossier_id" text NOT NULL,
	"stagiaire_id" text NOT NULL,
	"type" text NOT NULL,
	"date" text NOT NULL,
	"reponses" jsonb NOT NULL,
	"score" real,
	"ajustement" text DEFAULT '' NOT NULL,
	"saisie_par" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evenement" (
	"id" text PRIMARY KEY NOT NULL,
	"of_id" text NOT NULL,
	"dossier_id" text,
	"acteur_id" text,
	"acteur_role" text NOT NULL,
	"type" text NOT NULL,
	"libelle" text NOT NULL,
	"detail" jsonb,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facture_formateur" (
	"id" text PRIMARY KEY NOT NULL,
	"dossier_id" text NOT NULL,
	"facture_formateur_numero" text NOT NULL,
	"facture_formateur_date" text NOT NULL,
	CONSTRAINT "facture_formateur_dossier_id_unique" UNIQUE("dossier_id")
);
--> statement-breakpoint
CREATE TABLE "facture_of" (
	"id" text PRIMARY KEY NOT NULL,
	"dossier_id" text NOT NULL,
	"facture_of_numero" text NOT NULL,
	"facture_of_date" text NOT NULL,
	"facture_of_code_client" text DEFAULT '' NOT NULL,
	"facture_of_numero_adherent" text DEFAULT '' NOT NULL,
	"facture_of_acompte" integer,
	CONSTRAINT "facture_of_dossier_id_unique" UNIQUE("dossier_id")
);
--> statement-breakpoint
CREATE TABLE "formateur" (
	"id" text PRIMARY KEY NOT NULL,
	"of_id" text NOT NULL,
	"utilisateur_id" text,
	"formateur_prenom" text DEFAULT '' NOT NULL,
	"formateur_nom" text DEFAULT '' NOT NULL,
	"formateur_email" text DEFAULT '' NOT NULL,
	"formateur_telephone" text DEFAULT '' NOT NULL,
	"formateur_entreprise_nom" text DEFAULT '' NOT NULL,
	"formateur_entreprise_adresse" text DEFAULT '' NOT NULL,
	"formateur_entreprise_siret" text DEFAULT '' NOT NULL,
	"formateur_nda_numero" text DEFAULT '' NOT NULL,
	"formateur_dreets_region" text DEFAULT '' NOT NULL,
	"formateur_iban" text DEFAULT '' NOT NULL,
	"formateur_bic" text DEFAULT '' NOT NULL,
	"parcours" text DEFAULT '' NOT NULL,
	"statut_candidature" text DEFAULT 'brouillon' NOT NULL,
	"motif_decision" text DEFAULT '' NOT NULL,
	"soumise_le" timestamp with time zone,
	"decidee_le" timestamp with time zone,
	"anonymise_le" timestamp with time zone,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "formation" (
	"id" text PRIMARY KEY NOT NULL,
	"of_id" text NOT NULL,
	"formateur_id" text NOT NULL,
	"formation_titre" text DEFAULT '' NOT NULL,
	"formation_objectifs" text DEFAULT '' NOT NULL,
	"formation_niveau" text DEFAULT '' NOT NULL,
	"formation_prerequis" text DEFAULT '' NOT NULL,
	"formation_duree_heures_total" real,
	"formation_duree_jours" real,
	"formation_modalite" text DEFAULT 'presentiel' NOT NULL,
	"formation_prix_unitaire_ht" integer,
	"programme" text DEFAULT '' NOT NULL,
	"public_vise" text DEFAULT '' NOT NULL,
	"archivee" boolean DEFAULT false NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"jeton_hash" text PRIMARY KEY NOT NULL,
	"utilisateur_id" text NOT NULL,
	"expire_le" timestamp with time zone NOT NULL,
	"utilisee_le" timestamp with time zone,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modele_outil" (
	"id" text PRIMARY KEY NOT NULL,
	"of_id" text NOT NULL,
	"formateur_id" text NOT NULL,
	"formation_id" text,
	"type" text NOT NULL,
	"titre" text DEFAULT '' NOT NULL,
	"contenu" jsonb NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisme_formation" (
	"id" text PRIMARY KEY NOT NULL,
	"of_nom" text DEFAULT '' NOT NULL,
	"of_forme_juridique" text DEFAULT '' NOT NULL,
	"of_adresse" text DEFAULT '' NOT NULL,
	"of_siret" text DEFAULT '' NOT NULL,
	"of_nda_numero" text DEFAULT '' NOT NULL,
	"of_dreets_region" text DEFAULT '' NOT NULL,
	"of_qualiopi_numero" text DEFAULT '' NOT NULL,
	"of_certification_complementaire_numero" text DEFAULT '' NOT NULL,
	"of_representant_civilite" text DEFAULT '' NOT NULL,
	"of_representant_prenom" text DEFAULT '' NOT NULL,
	"of_representant_nom" text DEFAULT '' NOT NULL,
	"of_email_pedagogie" text DEFAULT '' NOT NULL,
	"of_email_comptabilite" text DEFAULT '' NOT NULL,
	"of_tribunal_competent" text DEFAULT '' NOT NULL,
	"of_iban" text DEFAULT '' NOT NULL,
	"of_bic" text DEFAULT '' NOT NULL,
	"of_banque_nom" text DEFAULT '' NOT NULL,
	"of_tva_intracom" text DEFAULT '' NOT NULL,
	"of_telephone" text DEFAULT '' NOT NULL,
	"formation_clause_subrogation" text DEFAULT '' NOT NULL,
	"portage_commission_pourcentage" real DEFAULT 25 NOT NULL,
	"tva_pourcentage" real DEFAULT 0 NOT NULL,
	"delai_paiement_jours" integer DEFAULT 30 NOT NULL,
	"conservation_annees" integer DEFAULT 10 NOT NULL,
	"couleur" text DEFAULT '#1d6a45' NOT NULL,
	"signature_representant_png" text DEFAULT '' NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "piece_dossier" (
	"id" text PRIMARY KEY NOT NULL,
	"dossier_id" text NOT NULL,
	"code" text NOT NULL,
	"stagiaire_id" text,
	"statut" text DEFAULT 'en_attente' NOT NULL,
	"chemin_depart" text,
	"empreinte_depart" text,
	"genere_le" timestamp with time zone,
	"chemin_retour" text,
	"nom_fichier_retour" text,
	"empreinte_retour" text,
	"mode_retour" text,
	"retour_le" timestamp with time zone,
	"retour_par" text,
	"transmise_le" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "piece_formateur" (
	"id" text PRIMARY KEY NOT NULL,
	"formateur_id" text NOT NULL,
	"type" text NOT NULL,
	"nom_fichier" text NOT NULL,
	"chemin" text NOT NULL,
	"taille" integer NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seance" (
	"id" text PRIMARY KEY NOT NULL,
	"dossier_id" text NOT NULL,
	"date" text NOT NULL,
	"heure_debut" text NOT NULL,
	"heure_fin" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_utilisateur" (
	"jeton_hash" text PRIMARY KEY NOT NULL,
	"utilisateur_id" text NOT NULL,
	"expire_le" timestamp with time zone NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signature" (
	"id" text PRIMARY KEY NOT NULL,
	"piece_id" text NOT NULL,
	"utilisateur_id" text,
	"signataire_nom" text NOT NULL,
	"signataire_role" text NOT NULL,
	"signataire_email" text NOT NULL,
	"zone" text NOT NULL,
	"trace_png" text NOT NULL,
	"lieu" text NOT NULL,
	"horodatage" timestamp with time zone NOT NULL,
	"empreinte_document" text NOT NULL,
	"adresse_ip" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stagiaire" (
	"id" text PRIMARY KEY NOT NULL,
	"of_id" text NOT NULL,
	"formateur_id" text NOT NULL,
	"entreprise_id" text,
	"utilisateur_id" text,
	"stagiaire_prenom" text DEFAULT '' NOT NULL,
	"stagiaire_nom" text DEFAULT '' NOT NULL,
	"stagiaire_email" text DEFAULT '' NOT NULL,
	"stagiaire_telephone" text DEFAULT '' NOT NULL,
	"stagiaire_poste" text DEFAULT '' NOT NULL,
	"stagiaire_situation_handicap" text DEFAULT '' NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stagiaire_dossier" (
	"id" text PRIMARY KEY NOT NULL,
	"dossier_id" text NOT NULL,
	"stagiaire_id" text NOT NULL,
	"poste_occupe" text DEFAULT '' NOT NULL,
	"statut_assiduite" text DEFAULT '' NOT NULL,
	"rang" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "utilisateur" (
	"id" text PRIMARY KEY NOT NULL,
	"of_id" text NOT NULL,
	"email" text NOT NULL,
	"mot_de_passe_hash" text DEFAULT '' NOT NULL,
	"role" text NOT NULL,
	"prenom" text DEFAULT '' NOT NULL,
	"nom" text DEFAULT '' NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"supprime_le" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "coffre_fichier" ADD CONSTRAINT "coffre_fichier_of_id_organisme_formation_id_fk" FOREIGN KEY ("of_id") REFERENCES "public"."organisme_formation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coffre_fichier" ADD CONSTRAINT "coffre_fichier_formateur_id_formateur_id_fk" FOREIGN KEY ("formateur_id") REFERENCES "public"."formateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coffre_fichier" ADD CONSTRAINT "coffre_fichier_formation_id_formation_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compteur" ADD CONSTRAINT "compteur_of_id_organisme_formation_id_fk" FOREIGN KEY ("of_id") REFERENCES "public"."organisme_formation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courrier" ADD CONSTRAINT "courrier_of_id_organisme_formation_id_fk" FOREIGN KEY ("of_id") REFERENCES "public"."organisme_formation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courrier" ADD CONSTRAINT "courrier_dossier_id_dossier_formation_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossier_formation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_formation" ADD CONSTRAINT "dossier_formation_of_id_organisme_formation_id_fk" FOREIGN KEY ("of_id") REFERENCES "public"."organisme_formation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_formation" ADD CONSTRAINT "dossier_formation_formateur_id_formateur_id_fk" FOREIGN KEY ("formateur_id") REFERENCES "public"."formateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_formation" ADD CONSTRAINT "dossier_formation_entreprise_id_entreprise_cliente_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise_cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_formation" ADD CONSTRAINT "dossier_formation_formation_id_formation_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emargement" ADD CONSTRAINT "emargement_seance_id_seance_id_fk" FOREIGN KEY ("seance_id") REFERENCES "public"."seance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emargement" ADD CONSTRAINT "emargement_stagiaire_id_stagiaire_id_fk" FOREIGN KEY ("stagiaire_id") REFERENCES "public"."stagiaire"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entreprise_cliente" ADD CONSTRAINT "entreprise_cliente_of_id_organisme_formation_id_fk" FOREIGN KEY ("of_id") REFERENCES "public"."organisme_formation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entreprise_cliente" ADD CONSTRAINT "entreprise_cliente_formateur_id_formateur_id_fk" FOREIGN KEY ("formateur_id") REFERENCES "public"."formateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation" ADD CONSTRAINT "evaluation_dossier_id_dossier_formation_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossier_formation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation" ADD CONSTRAINT "evaluation_stagiaire_id_stagiaire_id_fk" FOREIGN KEY ("stagiaire_id") REFERENCES "public"."stagiaire"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evenement" ADD CONSTRAINT "evenement_of_id_organisme_formation_id_fk" FOREIGN KEY ("of_id") REFERENCES "public"."organisme_formation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evenement" ADD CONSTRAINT "evenement_dossier_id_dossier_formation_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossier_formation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture_formateur" ADD CONSTRAINT "facture_formateur_dossier_id_dossier_formation_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossier_formation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture_of" ADD CONSTRAINT "facture_of_dossier_id_dossier_formation_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossier_formation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formateur" ADD CONSTRAINT "formateur_of_id_organisme_formation_id_fk" FOREIGN KEY ("of_id") REFERENCES "public"."organisme_formation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formateur" ADD CONSTRAINT "formateur_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation" ADD CONSTRAINT "formation_of_id_organisme_formation_id_fk" FOREIGN KEY ("of_id") REFERENCES "public"."organisme_formation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation" ADD CONSTRAINT "formation_formateur_id_formateur_id_fk" FOREIGN KEY ("formateur_id") REFERENCES "public"."formateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modele_outil" ADD CONSTRAINT "modele_outil_of_id_organisme_formation_id_fk" FOREIGN KEY ("of_id") REFERENCES "public"."organisme_formation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modele_outil" ADD CONSTRAINT "modele_outil_formateur_id_formateur_id_fk" FOREIGN KEY ("formateur_id") REFERENCES "public"."formateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modele_outil" ADD CONSTRAINT "modele_outil_formation_id_formation_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece_dossier" ADD CONSTRAINT "piece_dossier_dossier_id_dossier_formation_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossier_formation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece_dossier" ADD CONSTRAINT "piece_dossier_stagiaire_id_stagiaire_id_fk" FOREIGN KEY ("stagiaire_id") REFERENCES "public"."stagiaire"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece_dossier" ADD CONSTRAINT "piece_dossier_retour_par_utilisateur_id_fk" FOREIGN KEY ("retour_par") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece_formateur" ADD CONSTRAINT "piece_formateur_formateur_id_formateur_id_fk" FOREIGN KEY ("formateur_id") REFERENCES "public"."formateur"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seance" ADD CONSTRAINT "seance_dossier_id_dossier_formation_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossier_formation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_utilisateur" ADD CONSTRAINT "session_utilisateur_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature" ADD CONSTRAINT "signature_piece_id_piece_dossier_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."piece_dossier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature" ADD CONSTRAINT "signature_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stagiaire" ADD CONSTRAINT "stagiaire_of_id_organisme_formation_id_fk" FOREIGN KEY ("of_id") REFERENCES "public"."organisme_formation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stagiaire" ADD CONSTRAINT "stagiaire_formateur_id_formateur_id_fk" FOREIGN KEY ("formateur_id") REFERENCES "public"."formateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stagiaire" ADD CONSTRAINT "stagiaire_entreprise_id_entreprise_cliente_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprise_cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stagiaire" ADD CONSTRAINT "stagiaire_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stagiaire_dossier" ADD CONSTRAINT "stagiaire_dossier_dossier_id_dossier_formation_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossier_formation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stagiaire_dossier" ADD CONSTRAINT "stagiaire_dossier_stagiaire_id_stagiaire_id_fk" FOREIGN KEY ("stagiaire_id") REFERENCES "public"."stagiaire"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_of_id_organisme_formation_id_fk" FOREIGN KEY ("of_id") REFERENCES "public"."organisme_formation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "compteur_unique" ON "compteur" USING btree ("of_id","cle");--> statement-breakpoint
CREATE UNIQUE INDEX "dossier_reference_unique" ON "dossier_formation" USING btree ("of_id","dossier_reference");--> statement-breakpoint
CREATE INDEX "dossier_formateur_idx" ON "dossier_formation" USING btree ("formateur_id");--> statement-breakpoint
CREATE UNIQUE INDEX "emargement_unique" ON "emargement" USING btree ("seance_id","stagiaire_id","signataire");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_unique" ON "evaluation" USING btree ("dossier_id","stagiaire_id","type");--> statement-breakpoint
CREATE INDEX "evenement_dossier_idx" ON "evenement" USING btree ("dossier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "piece_dossier_unique" ON "piece_dossier" USING btree ("dossier_id","code",coalesce("stagiaire_id", ''));--> statement-breakpoint
CREATE UNIQUE INDEX "stagiaire_dossier_unique" ON "stagiaire_dossier" USING btree ("dossier_id","stagiaire_id");--> statement-breakpoint
CREATE UNIQUE INDEX "utilisateur_email_unique" ON "utilisateur" USING btree (lower("email"));