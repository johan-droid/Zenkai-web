CREATE TABLE "anime" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(255) NOT NULL,
	"anilist_id" integer,
	"canonical_title" varchar(500) NOT NULL,
	"synonyms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"romaji_title" varchar(500),
	"english_title" varchar(500),
	"native_title" varchar(500),
	"description" text,
	"cover_url" text,
	"banner_url" text,
	"cover_image_large" text,
	"type" varchar(32) DEFAULT 'ANIME' NOT NULL,
	"format" varchar(32),
	"status" varchar(32) DEFAULT 'FINISHED' NOT NULL,
	"is_adult" boolean DEFAULT false NOT NULL,
	"year" integer,
	"season" varchar(16),
	"season_year" integer,
	"average_score" numeric(4, 2),
	"popularity" integer,
	"favourites" integer,
	"total_episodes" integer,
	"duration_minutes" integer,
	"airing_day_of_week" varchar(16),
	"next_airing_episode" jsonb,
	"enriched_from" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_updated_at" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anime_slug_unique" UNIQUE("slug"),
	CONSTRAINT "anime_anilist_id_unique" UNIQUE("anilist_id")
);
--> statement-breakpoint
CREATE TABLE "anime_genres" (
	"anime_id" uuid NOT NULL,
	"genre" varchar(64) NOT NULL,
	CONSTRAINT "anime_genres_anime_id_genre_pk" PRIMARY KEY("anime_id","genre")
);
--> statement-breakpoint
CREATE TABLE "anime_relations" (
	"anime_id" uuid NOT NULL,
	"relation_type" varchar(32) NOT NULL,
	"related_anilist_id" integer NOT NULL,
	"related_title" varchar(500),
	"cover_url" text,
	CONSTRAINT "anime_relations_anime_id_relation_type_related_anilist_id_pk" PRIMARY KEY("anime_id","relation_type","related_anilist_id")
);
--> statement-breakpoint
CREATE TABLE "episode_external_ids" (
	"episode_id" uuid NOT NULL,
	"provider_slug" varchar(64) NOT NULL,
	"external_id" varchar(512) NOT NULL,
	"provider_episode_number" integer,
	CONSTRAINT "episode_provider_external_unique" UNIQUE("provider_slug","external_id")
);
--> statement-breakpoint
CREATE TABLE "episode_playback_meta" (
	"episode_id" uuid PRIMARY KEY NOT NULL,
	"intro_start_seconds" integer,
	"intro_end_seconds" integer,
	"outro_start_seconds" integer,
	"outro_end_seconds" integer,
	"subtitles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_updated_at" integer
);
--> statement-breakpoint
CREATE TABLE "episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anime_id" uuid NOT NULL,
	"episode_number" integer NOT NULL,
	"absolute_number" integer,
	"title" varchar(500),
	"description" text,
	"duration_seconds" integer,
	"thumbnail_url" text,
	"air_date" timestamp with time zone,
	"is_filler" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anime_episode_num_unique" UNIQUE("anime_id","episode_number")
);
--> statement-breakpoint
CREATE TABLE "anime_external_ids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anime_id" uuid NOT NULL,
	"id_type" varchar(32) NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anime_id_type_unique" UNIQUE("anime_id","id_type"),
	CONSTRAINT "anime_external_lookup_unique" UNIQUE("id_type","external_id")
);
--> statement-breakpoint
CREATE TABLE "anime_search_index" (
	"anime_id" uuid PRIMARY KEY NOT NULL,
	"normalized" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"slug" varchar(64) NOT NULL,
	"display_name" varchar(128) NOT NULL,
	"language" varchar(16) DEFAULT 'sub' NOT NULL,
	"access_type" varchar(16) DEFAULT 'direct' NOT NULL,
	"badge" varchar(32),
	"url_template" text,
	"required_id_type" varchar(32) DEFAULT 'anilist' NOT NULL,
	"max_resolution" integer,
	"active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_endpoint_slug_unique" UNIQUE("provider_id","slug")
);
--> statement-breakpoint
CREATE TABLE "provider_health" (
	"provider_slug" varchar(64) NOT NULL,
	"endpoint_slug" varchar(64) DEFAULT 'default' NOT NULL,
	"success_streak" integer DEFAULT 0 NOT NULL,
	"failure_streak" integer DEFAULT 0 NOT NULL,
	"score" real DEFAULT 1 NOT NULL,
	"avg_latency_ms" integer DEFAULT 0 NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "provider_health_key" UNIQUE("provider_slug","endpoint_slug")
);
--> statement-breakpoint
CREATE TABLE "provider_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_slug" varchar(64) NOT NULL,
	"endpoint_slug" varchar(64) DEFAULT 'default' NOT NULL,
	"operation" varchar(64) NOT NULL,
	"outcome" varchar(32) NOT NULL,
	"status_code" integer,
	"latency_ms" integer NOT NULL,
	"item_count" integer,
	"error" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"kind" varchar(32) DEFAULT 'METADATA' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"is_custom_adapter" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "providers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "source_cache" (
	"episode_id" uuid NOT NULL,
	"language" varchar(16) DEFAULT 'sub' NOT NULL,
	"sources" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "source_cache_key" UNIQUE("episode_id","language")
);
--> statement-breakpoint
CREATE TABLE "airing_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anime_id" uuid NOT NULL,
	"episode_number" integer NOT NULL,
	"airing_at" timestamp with time zone NOT NULL,
	"status" varchar(32) DEFAULT 'SCHEDULED' NOT NULL,
	"source" varchar(32) DEFAULT 'anilist' NOT NULL,
	"last_verified_at" timestamp with time zone,
	CONSTRAINT "schedule_slot_unique" UNIQUE("anime_id","episode_number")
);
--> statement-breakpoint
ALTER TABLE "anime_genres" ADD CONSTRAINT "anime_genres_anime_id_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_relations" ADD CONSTRAINT "anime_relations_anime_id_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_external_ids" ADD CONSTRAINT "episode_external_ids_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_playback_meta" ADD CONSTRAINT "episode_playback_meta_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_anime_id_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_external_ids" ADD CONSTRAINT "anime_external_ids_anime_id_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_search_index" ADD CONSTRAINT "anime_search_index_anime_id_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_endpoints" ADD CONSTRAINT "provider_endpoints_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airing_schedule" ADD CONSTRAINT "airing_schedule_anime_id_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anime_trending_idx" ON "anime" USING btree ("status","average_score","popularity");--> statement-breakpoint
CREATE INDEX "anime_season_idx" ON "anime" USING btree ("season","season_year");--> statement-breakpoint
CREATE INDEX "anime_updated_idx" ON "anime" USING btree ("source_updated_at");--> statement-breakpoint
CREATE INDEX "provider_requests_time_idx" ON "provider_requests" USING btree ("requested_at");--> statement-breakpoint
CREATE INDEX "source_cache_expiry_idx" ON "source_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "schedule_airing_idx" ON "airing_schedule" USING btree ("airing_at");