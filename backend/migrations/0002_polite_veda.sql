CREATE TABLE "manga" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(255) NOT NULL,
	"mangadex_id" varchar(64),
	"canonical_title" varchar(500) NOT NULL,
	"synonyms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"alt_titles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text,
	"cover_url" text,
	"cover_image_large" text,
	"banner_url" text,
	"status" varchar(32) DEFAULT 'ONGOING' NOT NULL,
	"content_rating" varchar(32) DEFAULT 'safe' NOT NULL,
	"is_adult" boolean DEFAULT false NOT NULL,
	"year" integer,
	"status_raw" varchar(64),
	"original_language" varchar(16),
	"demographics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_chapters" integer,
	"total_volumes" integer,
	"chapter_counts" jsonb,
	"translated_chapter_count" integer,
	"followed_count" integer,
	"rating" varchar(8),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manga_slug_unique" UNIQUE("slug"),
	CONSTRAINT "manga_mangadex_id_unique" UNIQUE("mangadex_id")
);
--> statement-breakpoint
CREATE TABLE "manga_chapter_pages" (
	"chapter_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"base_url" text NOT NULL,
	"hash" varchar(64),
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "manga_chapter_pages_chapter_id_page_number_pk" PRIMARY KEY("chapter_id","page_number")
);
--> statement-breakpoint
CREATE TABLE "manga_chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manga_id" uuid NOT NULL,
	"mangadex_chapter_id" varchar(64),
	"chapter" varchar(32) NOT NULL,
	"volume" varchar(32),
	"title" varchar(500),
	"language" varchar(16) DEFAULT 'en' NOT NULL,
	"translated_chapter_count" integer DEFAULT 0 NOT NULL,
	"pages" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"scanlation_group" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manga_chapter_identity_unique" UNIQUE("manga_id","language","chapter"),
	CONSTRAINT "manga_chapter_external_unique" UNIQUE("mangadex_chapter_id")
);
--> statement-breakpoint
CREATE TABLE "manga_credits" (
	"manga_id" uuid NOT NULL,
	"role" varchar(32) NOT NULL,
	"name" varchar(255) NOT NULL,
	"external_id" varchar(64),
	CONSTRAINT "manga_credits_manga_id_role_name_pk" PRIMARY KEY("manga_id","role","name")
);
--> statement-breakpoint
CREATE TABLE "manga_external_ids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manga_id" uuid NOT NULL,
	"id_type" varchar(32) NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manga_id_type_unique" UNIQUE("manga_id","id_type"),
	CONSTRAINT "manga_external_lookup_unique" UNIQUE("id_type","external_id")
);
--> statement-breakpoint
CREATE TABLE "manga_genres" (
	"manga_id" uuid NOT NULL,
	"genre" varchar(128) NOT NULL,
	"group" varchar(32),
	CONSTRAINT "manga_genres_manga_id_genre_pk" PRIMARY KEY("manga_id","genre")
);
--> statement-breakpoint
CREATE TABLE "manga_relations" (
	"manga_id" uuid NOT NULL,
	"relation_type" varchar(32) NOT NULL,
	"related_mangadex_id" varchar(64) NOT NULL,
	"related_title" varchar(500),
	"cover_url" text,
	CONSTRAINT "manga_relations_manga_id_relation_type_related_mangadex_id_pk" PRIMARY KEY("manga_id","relation_type","related_mangadex_id")
);
--> statement-breakpoint
CREATE TABLE "manga_search_index" (
	"manga_id" uuid PRIMARY KEY NOT NULL,
	"normalized" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "manga_chapter_pages" ADD CONSTRAINT "manga_chapter_pages_chapter_id_manga_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."manga_chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_chapters" ADD CONSTRAINT "manga_chapters_manga_id_manga_id_fk" FOREIGN KEY ("manga_id") REFERENCES "public"."manga"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_credits" ADD CONSTRAINT "manga_credits_manga_id_manga_id_fk" FOREIGN KEY ("manga_id") REFERENCES "public"."manga"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_external_ids" ADD CONSTRAINT "manga_external_ids_manga_id_manga_id_fk" FOREIGN KEY ("manga_id") REFERENCES "public"."manga"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_genres" ADD CONSTRAINT "manga_genres_manga_id_manga_id_fk" FOREIGN KEY ("manga_id") REFERENCES "public"."manga"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_relations" ADD CONSTRAINT "manga_relations_manga_id_manga_id_fk" FOREIGN KEY ("manga_id") REFERENCES "public"."manga"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_search_index" ADD CONSTRAINT "manga_search_index_manga_id_manga_id_fk" FOREIGN KEY ("manga_id") REFERENCES "public"."manga"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "manga_followed_idx" ON "manga" USING btree ("followed_count");--> statement-breakpoint
CREATE INDEX "manga_status_idx" ON "manga" USING btree ("status");--> statement-breakpoint
CREATE INDEX "manga_chapter_pages_expiry_idx" ON "manga_chapter_pages" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "manga_chapters_order_idx" ON "manga_chapters" USING btree ("manga_id","language","chapter");