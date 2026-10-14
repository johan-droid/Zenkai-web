CREATE TABLE IF NOT EXISTS "novel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(255) NOT NULL,
	"anilist_id" integer,
	"title" varchar(500) NOT NULL,
	"romaji_title" varchar(500),
	"english_title" varchar(500),
	"native_title" varchar(500),
	"description" text,
	"author" varchar(255),
	"cover_url" text,
	"banner_url" text,
	"status" varchar(32) DEFAULT 'UNKNOWN' NOT NULL,
	"genres" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chapters" integer,
	"volumes" integer,
	"rating" varchar(16),
	"source" varchar(64) DEFAULT 'novelfire' NOT NULL,
	"start_year" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "novel_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "novel_chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"novel_id" uuid NOT NULL REFERENCES "novel"("id") ON DELETE cascade,
	"chapter_number" integer NOT NULL,
	"chapter_slug" varchar(255) NOT NULL,
	"title" varchar(500) NOT NULL,
	"release_date" varchar(64),
	"source" varchar(64) DEFAULT 'novelfire' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "novel_chapter_number_unique" UNIQUE("novel_id", "chapter_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "novel_chapter_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"novel_id" uuid NOT NULL REFERENCES "novel"("id") ON DELETE cascade,
	"chapter_number" integer NOT NULL,
	"chapter_slug" varchar(255) NOT NULL,
	"title" varchar(500) NOT NULL,
	"paragraphs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content" text NOT NULL,
	"prev_chapter_slug" varchar(255),
	"next_chapter_slug" varchar(255),
	"source" varchar(64) DEFAULT 'novelfire' NOT NULL,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "novel_content_chapter_unique" UNIQUE("novel_id", "chapter_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "novel_external_ids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"novel_id" uuid NOT NULL REFERENCES "novel"("id") ON DELETE cascade,
	"id_type" varchar(32) NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "novel_id_type_unique" UNIQUE("novel_id", "id_type"),
	CONSTRAINT "novel_external_lookup_unique" UNIQUE("id_type", "external_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "novel_anilist_idx" ON "novel" ("anilist_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "novel_source_idx" ON "novel" ("source");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "novel_chapter_slug_idx" ON "novel_chapters" ("novel_id", "chapter_slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "novel_content_slug_idx" ON "novel_chapter_contents" ("novel_id", "chapter_slug");
