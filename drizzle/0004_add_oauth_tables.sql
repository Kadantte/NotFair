CREATE TABLE IF NOT EXISTS "oauth_clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL UNIQUE,
	"client_secret_hash" text NOT NULL,
	"session_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "authorization_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"redirect_uri" text NOT NULL,
	"client_id" text NOT NULL,
	"code_challenge" text,
	"code_challenge_method" text,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
