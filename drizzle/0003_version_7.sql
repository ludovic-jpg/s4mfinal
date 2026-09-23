CREATE TABLE "formulaire_apprenant" (
	"id" text PRIMARY KEY NOT NULL,
	"of_id" text NOT NULL,
	"dossier_id" text NOT NULL,
	"stagiaire_id" text NOT NULL,
	"type" text NOT NULL,
	"jeton_hash" text NOT NULL,
	"statut" text DEFAULT 'envoye' NOT NULL,
	"brouillon" jsonb,
	"envois" integer DEFAULT 0 NOT NULL,
	"envoye_le" timestamp with time zone,
	"expire_le" timestamp with time zone NOT NULL,
	"signe_le" timestamp with time zone,
	"chemin_invitation" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "formulaire_apprenant_jeton_hash_unique" UNIQUE("jeton_hash")
);
--> statement-breakpoint
CREATE TABLE "reglage" (
	"id" text PRIMARY KEY NOT NULL,
	"of_id" text NOT NULL,
	"cle" text NOT NULL,
	"valeur" text DEFAULT '' NOT NULL,
	"secret" boolean DEFAULT false NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "dossier_enjeux" jsonb;--> statement-breakpoint
ALTER TABLE "formation" ADD COLUMN "enjeux_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "formulaire_apprenant" ADD CONSTRAINT "formulaire_apprenant_of_id_organisme_formation_id_fk" FOREIGN KEY ("of_id") REFERENCES "public"."organisme_formation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formulaire_apprenant" ADD CONSTRAINT "formulaire_apprenant_dossier_id_dossier_formation_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossier_formation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formulaire_apprenant" ADD CONSTRAINT "formulaire_apprenant_stagiaire_id_stagiaire_id_fk" FOREIGN KEY ("stagiaire_id") REFERENCES "public"."stagiaire"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglage" ADD CONSTRAINT "reglage_of_id_organisme_formation_id_fk" FOREIGN KEY ("of_id") REFERENCES "public"."organisme_formation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "formulaire_apprenant_cle_idx" ON "formulaire_apprenant" USING btree ("dossier_id","stagiaire_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "reglage_of_cle_idx" ON "reglage" USING btree ("of_id","cle");