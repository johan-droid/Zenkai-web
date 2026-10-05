CREATE TABLE "anime_studios" (
	"anime_id" uuid NOT NULL,
	"studio_name" varchar(255) NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	CONSTRAINT "anime_studios_anime_id_studio_name_pk" PRIMARY KEY("anime_id","studio_name")
);
--> statement-breakpoint
ALTER TABLE "anime_studios" ADD CONSTRAINT "anime_studios_anime_id_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;