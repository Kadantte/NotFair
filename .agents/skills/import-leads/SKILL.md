---
name: import-leads
description: "Clean raw email lead CSVs and import into the contacts table. Use whenever the user mentions importing leads, cleaning a CSV of contacts, loading email lists, preparing outreach lists, or importing prospects. Also trigger when the user has a CSV file path and wants to get leads into the database, says 'import these leads', 'clean up this CSV', 'add these contacts', or mentions lead quality/deduplication."
---

# Import Leads

Clean raw email lead CSVs and import them into the `contacts` table (Drizzle ORM, Supabase). The goal is to maximize outreach response rate by being aggressive about lead quality — it's better to import fewer high-quality leads than to pollute the pipeline with junk.

## How to use

The user provides a CSV file path (sometimes as an argument to the skill, sometimes in conversation). The CSV can have any column names — you need to detect which columns map to email, company/business name, website/domain, first name, and last name.

## Step 1: Inspect the CSV

Read the first 30-50 rows of the CSV to understand:
- **Column mapping**: Which columns contain email, company name, website, first_name, last_name? Common variations:
  - Email: `email`, `email_address`, `Email`, `contact_email`
  - Company: `company`, `company_name`, `business_name`, `organization`, `Company`
  - Website: `website`, `domain`, `url`, `website_url`
  - Name: `first_name`, `firstName`, `last_name`, `lastName`, `name`, `contact_name`
- **Data shape**: How many rows? How many have names vs just emails? What's the quality like?
- **Junk patterns**: What kinds of bad data are present? (duplicates, fake emails, page titles as company names, etc.)

Tell the user what you found: row count, column mapping, and initial quality assessment.

## Step 2: Write a cleaning script

Create a TypeScript cleaning script at `scripts/import-leads-<batch-name>.ts` (e.g., `import-leads-home-services.ts`). The batch name comes from the CSV filename or the user's description of the leads.

The script follows the project's established pattern (see `scripts/import-leads.ts` or `scripts/import-home-services-leads.ts` for reference). It must:

### Parse the CSV
- Handle quoted fields with commas and newlines (standard CSV edge cases)
- Map columns flexibly based on what Step 1 discovered
- Trim all values

### Filter for quality (this is the most important step)

The goal is to maximize the probability that a real human reads and responds to the outreach email. Apply these filters in order:

**Email validation:**
- Must match `^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$`
- Reject image filenames parsed as emails (ending in `.avif`, `.png`, `.jpg`, `.webp`)
- Reject known fake/placeholder emails: `john@doe.com`, `jane@doe.com`, `test@test.com`, `example@example.com`, `v@l.kn`

**Email prefix filtering** — these prefixes almost never reach a human decision-maker. Filter them:
- Privacy/legal: `privacy`, `copyright`, `legal`, `compliance`, `legal-notices`
- HR/recruiting: `hr`, `benefits`, `careers`, `jobs`, `apply`, `resumes`, `resume`, `recruiting`
- Bots/system: `noreply`, `no-reply`, `donotreply`, `postmaster`, `webmaster`, `hostmaster`, `mailer-daemon`, `chatbot`
- Media/PR: `press`, `media`, `investor`, `investors`, `ir`, `communications`
- Low-value generic: `privacypolicy`, `advertising`, `adpromemberships`, `membersupport`, `digitalcare`, `digitalsupport`, `closedoffice`, `franchising`, `loyalcustomer`, `commercial`

**Domain blocklist** — large corporations, media companies, aggregators, and marketplaces whose generic emails will never convert:
- Let the user specify additional blocklist domains for their industry
- Always filter obvious non-targets (media companies, Fortune 500 retail, utility companies, fulfillment houses)

**Company name cleaning** (this is critical — the script MUST clean names, not just pass them through):
- Strip page-title junk: everything after ` | ` or ` - ` or ` — ` separators (keep the part before). This is the most common issue — company names scraped from websites often include taglines like "Acme Corp - The Best Solution for Teams". The cleaning function must handle all three separator styles.
- Strip location suffixes: ` in <City> <State>` patterns
- Strip tagline suffixes after `: `
- Strip trailing punctuation artifacts (`,`, `-`, `|`, `—`)
- Reject names > 80 chars after cleaning (still a page title)
- Reject "WordPress", "Checking your browser...", "Access to this page has been denied", and similar web-scraping artifacts
- Reject names that are clearly descriptions, not business names (start with generic words like "Repair", "Removal", "Shop", "Plumbing", "Heating", "Top-Rated", "Award-Winning", "Expert", "24/7", "Local")
- Reject pure locations (pattern: `City, STATE`)
- Leads with no company name after cleaning are dropped (no company = can't personalize outreach = low response rate)

### Deduplicate

Group leads by website domain (or email domain if no website column). Within each group, pick the single best email using this priority (lower = better for outreach):
1. Named person email (anything not in the generic list) — **best, a real human**
2. `info@` — generic but often monitored
3. `hello@` / `hi@`
4. `contact@`
5. `office@`
6. `sales@`
7. `marketing@`
8. `admin@`
9. Everything else generic — worst

### Dry-run first, always

The script must dry-run by default and only import when passed `--import`. Show:
- Total rows parsed
- Breakdown of what was filtered and why
- Final list of leads with email + company name + first/last name (if available in CSV)
- Quality breakdown: count of named-person emails vs generic emails, named-person ratio
- "DRY RUN — pass --import to actually insert" message

### Import with conflict handling

When `--import` is passed:
- Load `.env.local` for `DATABASE_URL`
- Use Drizzle ORM with the project's schema (`lib/db/schema`)
- Insert with `onConflictDoNothing()` (email has a unique index)
- Report: X new, Y already existed

## Step 3: Run the dry-run and review with the user

Run the script without `--import` and show the user the output. Point out:
- How many leads survived cleaning
- Any suspicious entries that might need manual review
- The ratio of named-person emails vs generic (info@, etc.) — higher named-person ratio = better response rate

Ask the user if the list looks good or if they want to adjust filters.

## Step 4: Import

Once the user approves, run with `--import`. Report the results.

## Quality philosophy

Response rate is everything. A list of 100 high-quality leads with real person emails and clean company names will outperform 500 generic `info@` addresses with page-title company names. Be aggressive about cutting junk — the user can always relax filters if needed, but importing garbage is hard to undo (it pollutes outreach metrics and wastes email reputation).

Specific quality signals to watch for:
- **Named person emails** (e.g., `jay@chinookservices.com`) are 3-5x more likely to get a response than `info@`
- **Clean, real company names** enable personalization which dramatically increases response rate
- **Deduplication by domain** prevents embarrassing multiple-email-to-same-company situations
- **Removing aggregators/media** prevents wasting emails on companies that will never be customers
