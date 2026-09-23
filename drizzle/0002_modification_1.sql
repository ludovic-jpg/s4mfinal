CREATE TABLE "positionnement" (
	"id" text PRIMARY KEY NOT NULL,
	"of_id" text NOT NULL,
	"formateur_id" text NOT NULL,
	"formation_id" text,
	"stagiaire_id" text NOT NULL,
	"jeton_hash" text NOT NULL,
	"statut" text DEFAULT 'envoye' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"formation_titre" text DEFAULT '' NOT NULL,
	"questionnaire" jsonb,
	"questions_recueil" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"brouillon" jsonb,
	"recueil" jsonb,
	"reponses" jsonb,
	"score" real,
	"date_reponse" text DEFAULT '' NOT NULL,
	"signature_png" text DEFAULT '' NOT NULL,
	"signature_lieu" text DEFAULT '' NOT NULL,
	"signe_le" timestamp with time zone,
	"chemin_pdf" text,
	"empreinte_pdf" text,
	"envoye_le" timestamp with time zone,
	"expire_le" timestamp with time zone NOT NULL,
	"archive_le" timestamp with time zone,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positionnement_jeton_hash_unique" UNIQUE("jeton_hash")
);
--> statement-breakpoint
CREATE TABLE "version_objet" (
	"id" text PRIMARY KEY NOT NULL,
	"of_id" text NOT NULL,
	"type" text NOT NULL,
	"objet_id" text NOT NULL,
	"libelle" text DEFAULT '' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"auteur_id" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coffre_fichier" ADD COLUMN "categorie" text DEFAULT 'support' NOT NULL;--> statement-breakpoint
ALTER TABLE "coffre_fichier" ADD COLUMN "origine" text DEFAULT 'depot' NOT NULL;--> statement-breakpoint
ALTER TABLE "coffre_fichier" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "coffre_fichier" ADD COLUMN "supprime_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "courrier" ADD COLUMN "formateur_id" text;--> statement-breakpoint
ALTER TABLE "entreprise_cliente" ADD COLUMN "entreprise_opco" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "entreprise_cliente" ADD COLUMN "archive_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "formateur" ADD COLUMN "formateur_statut_juridique" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "formateur" ADD COLUMN "formateur_domaines" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "formateur" ADD COLUMN "formateur_zones" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "formateur" ADD COLUMN "formateur_langues" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "formateur" ADD COLUMN "formateur_tarif_journalier" integer;--> statement-breakpoint
ALTER TABLE "formateur" ADD COLUMN "formateur_bio" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "formateur" ADD COLUMN "formateur_linkedin" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "formateur" ADD COLUMN "formateur_disponibilites" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "formateur" ADD COLUMN "formateur_assurance_rc" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "formation_nb_modules" integer;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "formation_modules" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "formation_duree_heures_presentiel" real;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "formation_duree_heures_distanciel" real;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "formation_prix_groupe_ht" integer;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "formation_effectif_min" integer;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "formation_effectif_max" integer;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "formation_lieu_nom" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "formation_lieu_adresse" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "formation_lieu_siret" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "formation_lien_visio" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "mode_financement" text DEFAULT 'opco' NOT NULL;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "formation_opco" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "formateur_cout_horaire" integer;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "formation_domaine" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "formation_moyens_pedagogiques" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "formation_modalites_evaluation" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "formation_modalites_sanction" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "formation_accessibilite" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "formation_delai_acces" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "archivee_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "maj_le" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "modele_outil" ADD COLUMN "maj_le" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "modele_outil" ADD COLUMN "archive_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "piece_formateur" ADD COLUMN "expire_le" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stagiaire" ADD COLUMN "archive_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "positionnement" ADD CONSTRAINT "positionnement_of_id_organisme_formation_id_fk" FOREIGN KEY ("of_id") REFERENCES "public"."organisme_formation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positionnement" ADD CONSTRAINT "positionnement_formateur_id_formateur_id_fk" FOREIGN KEY ("formateur_id") REFERENCES "public"."formateur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positionnement" ADD CONSTRAINT "positionnement_formation_id_formation_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positionnement" ADD CONSTRAINT "positionnement_stagiaire_id_stagiaire_id_fk" FOREIGN KEY ("stagiaire_id") REFERENCES "public"."stagiaire"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_objet" ADD CONSTRAINT "version_objet_of_id_organisme_formation_id_fk" FOREIGN KEY ("of_id") REFERENCES "public"."organisme_formation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "positionnement_formateur_idx" ON "positionnement" USING btree ("formateur_id");--> statement-breakpoint
CREATE INDEX "version_objet_idx" ON "version_objet" USING btree ("type","objet_id");