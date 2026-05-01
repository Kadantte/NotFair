CREATE TABLE IF NOT EXISTS "gohighlevel_connections" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "connection_key" text NOT NULL,
  "company_id" text,
  "location_id" text,
  "user_type" text NOT NULL,
  "company_name" text,
  "location_name" text,
  "refresh_token" text NOT NULL,
  "access_token" text,
  "access_token_expires_at" timestamp,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "platform_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ghl_connections_user_idx" ON "gohighlevel_connections" ("user_id");
CREATE INDEX IF NOT EXISTS "ghl_connections_company_idx" ON "gohighlevel_connections" ("company_id");
CREATE INDEX IF NOT EXISTS "ghl_connections_location_idx" ON "gohighlevel_connections" ("location_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ghl_connections_user_connection_key_idx" ON "gohighlevel_connections" ("user_id", "connection_key");
