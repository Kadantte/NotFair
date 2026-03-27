-- Rename changes → operations and compress text columns to smallint codes
-- This migration is backward-compatible: existing data is transformed in-place.

-- Step 1: Rename table
ALTER TABLE "changes" RENAME TO "operations";

-- Step 2: Add new compact columns
ALTER TABLE "operations" ADD COLUMN "op_type" smallint;
ALTER TABLE "operations" ADD COLUMN "tool_code" smallint;
ALTER TABLE "operations" ADD COLUMN "entity_code" smallint;
ALTER TABLE "operations" ADD COLUMN "user_id" text;

-- Step 3: Populate op_type (all existing rows are writes)
UPDATE "operations" SET "op_type" = 1;

-- Step 4: Populate tool_code from tool_name
UPDATE "operations" SET "tool_code" = CASE "tool_name"
  WHEN 'pause_keyword' THEN 0
  WHEN 'enable_keyword' THEN 1
  WHEN 'update_bid' THEN 2
  WHEN 'add_negative_keyword' THEN 3
  WHEN 'remove_negative_keyword' THEN 4
  WHEN 'update_budget' THEN 5
  WHEN 'pause_campaign' THEN 6
  WHEN 'enable_campaign' THEN 7
  WHEN 'undo' THEN 8
  ELSE 99
END;

-- Step 5: Populate entity_code from entity_type
UPDATE "operations" SET "entity_code" = CASE "entity_type"
  WHEN 'keyword' THEN 0
  WHEN 'campaign' THEN 1
  ELSE 2
END;

-- Step 6: Make op_type and tool_code NOT NULL now that they're populated
ALTER TABLE "operations" ALTER COLUMN "op_type" SET NOT NULL;
ALTER TABLE "operations" ALTER COLUMN "tool_code" SET NOT NULL;

-- Step 7: Drop old text columns
ALTER TABLE "operations" DROP COLUMN "tool_name";
ALTER TABLE "operations" DROP COLUMN "entity_type";

-- Step 8: Make write-only columns nullable (they were NOT NULL before)
ALTER TABLE "operations" ALTER COLUMN "entity_id" DROP NOT NULL;
ALTER TABLE "operations" ALTER COLUMN "before_value" DROP NOT NULL;
ALTER TABLE "operations" ALTER COLUMN "after_value" DROP NOT NULL;

-- Step 9: Change rolled_back from integer to smallint
ALTER TABLE "operations" ALTER COLUMN "rolled_back" TYPE smallint;

-- Step 10: Add indexes for billing and querying
CREATE INDEX IF NOT EXISTS "ops_account_created_idx" ON "operations" ("account_id", "created_at");
CREATE INDEX IF NOT EXISTS "ops_user_created_idx" ON "operations" ("user_id", "created_at");
