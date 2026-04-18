-- Per-tool-call telemetry: stitch calls into sessions, capture args + latency
-- + bytes + error class so we can answer "how are users using the product?"
-- without relying on the harness client. tool_code becomes nullable so new
-- tools added after the TOOL_CODE map don't silently drop from analytics.

ALTER TABLE "operations" ALTER COLUMN "tool_code" DROP NOT NULL;

ALTER TABLE "operations" ADD COLUMN IF NOT EXISTS "session_id" integer;
ALTER TABLE "operations" ADD COLUMN IF NOT EXISTS "request_id" text;
ALTER TABLE "operations" ADD COLUMN IF NOT EXISTS "tool_name" text;
ALTER TABLE "operations" ADD COLUMN IF NOT EXISTS "args" jsonb;
ALTER TABLE "operations" ADD COLUMN IF NOT EXISTS "args_sha256" text;
ALTER TABLE "operations" ADD COLUMN IF NOT EXISTS "latency_ms" integer;
ALTER TABLE "operations" ADD COLUMN IF NOT EXISTS "bytes_out" integer;
ALTER TABLE "operations" ADD COLUMN IF NOT EXISTS "error_class" text;

CREATE INDEX IF NOT EXISTS "ops_session_created_idx" ON "operations" ("session_id", "created_at");
CREATE INDEX IF NOT EXISTS "ops_tool_name_created_idx" ON "operations" ("tool_name", "created_at");
CREATE INDEX IF NOT EXISTS "ops_args_sha_idx" ON "operations" ("args_sha256");
