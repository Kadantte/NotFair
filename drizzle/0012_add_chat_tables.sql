CREATE TABLE IF NOT EXISTS "chat_threads" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "account_id" text NOT NULL,
  "title" text,
  "share_id" text UNIQUE,
  "is_shared" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "thread_id" text NOT NULL,
  "role" text NOT NULL,
  "parts" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "chat_threads_user_account_idx" ON "chat_threads" ("user_id", "account_id", "updated_at");
CREATE INDEX IF NOT EXISTS "chat_messages_thread_idx" ON "chat_messages" ("thread_id", "created_at");
