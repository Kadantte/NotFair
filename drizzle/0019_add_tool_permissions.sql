CREATE TABLE IF NOT EXISTS "tool_permissions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "tool_name" text NOT NULL,
  "mode" text NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "tool_permissions_user_tool_idx"
  ON "tool_permissions" ("user_id", "tool_name");
