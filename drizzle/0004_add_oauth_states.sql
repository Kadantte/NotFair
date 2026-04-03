CREATE TABLE IF NOT EXISTS "oauth_states" (
	"nonce" text PRIMARY KEY NOT NULL,
	"payload" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
