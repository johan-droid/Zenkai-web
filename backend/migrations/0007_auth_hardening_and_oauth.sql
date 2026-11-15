-- Migration 0007: Auth Hardening, User Settings & OAuth Accounts
-- Resolves schema drift, establishes Google OIDC & AniList OAuth linked accounts,
-- and adds password reset / email verification token tables.

-- 1. Resolve users schema drift
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "settings" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean DEFAULT false NOT NULL;

-- 2. Create oauth_accounts table
CREATE TABLE IF NOT EXISTS "oauth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"provider_user_id" varchar(255) NOT NULL,
	"provider_email" varchar(255),
	"provider_username" varchar(255),
	"profile_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_accounts_provider_uid_unique" UNIQUE("provider", "provider_user_id"),
	CONSTRAINT "oauth_accounts_user_provider_unique" UNIQUE("user_id", "provider")
);

DO $$ BEGIN
 ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "oauth_accounts_user_id_idx" ON "oauth_accounts" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "oauth_accounts_provider_lookup_idx" ON "oauth_accounts" USING btree ("provider", "provider_user_id");

-- 3. Create password_resets table
CREATE TABLE IF NOT EXISTS "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "password_resets_token_hash_idx" ON "password_resets" USING btree ("token_hash");
CREATE INDEX IF NOT EXISTS "password_resets_user_id_idx" ON "password_resets" USING btree ("user_id");

-- 4. Create email_verifications table
CREATE TABLE IF NOT EXISTS "email_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "email_verifications_token_hash_idx" ON "email_verifications" USING btree ("token_hash");
CREATE INDEX IF NOT EXISTS "email_verifications_user_id_idx" ON "email_verifications" USING btree ("user_id");

-- 5. Session token hash index
CREATE INDEX IF NOT EXISTS "user_sessions_token_hash_idx" ON "user_sessions" USING btree ("token_hash");
