CREATE TABLE IF NOT EXISTS "user_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"media_id" varchar(255) NOT NULL,
	"status" varchar(16) NOT NULL,
	"rating" numeric(3, 1),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_library_unique" UNIQUE("user_id","kind","media_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"media_id" varchar(255) NOT NULL,
	"unit" integer NOT NULL,
	"position_seconds" integer DEFAULT 0 NOT NULL,
	"duration_seconds" integer,
	"page" integer,
	"total_units" integer,
	"completed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_progress_unique" UNIQUE("user_id","kind","media_id","unit")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_library" ADD CONSTRAINT "user_library_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_library_user_kind_status_idx" ON "user_library" USING btree ("user_id","kind","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_library_user_updated_idx" ON "user_library" USING btree ("user_id","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_progress_user_recent_idx" ON "user_progress" USING btree ("user_id","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_progress_media_idx" ON "user_progress" USING btree ("user_id","kind","media_id");
