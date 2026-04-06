import dns from "dns/promises";

/**
 * Validates an email address format and checks that the domain has MX records.
 * This catches dead domains, typos (gmial.com), and fake domains — typically
 * 5-15% of bad addresses in a lead list.
 */
export async function validateEmail(
  email: string
): Promise<{ valid: boolean; reason?: string }> {
  const trimmed = email.trim().toLowerCase();

  // Basic format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, reason: "invalid_format" };
  }

  const domain = trimmed.split("@")[1];

  // Check MX records
  try {
    const records = await dns.resolveMx(domain);
    if (!records || records.length === 0) {
      return { valid: false, reason: "no_mx_records" };
    }
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return { valid: false, reason: "domain_not_found" };
    }
    // DNS timeout or transient error — don't reject, let it through
    return { valid: true };
  }

  return { valid: true };
}

/**
 * Validates a batch of emails in parallel, returns results keyed by email.
 * Uses a concurrency limit to avoid flooding DNS.
 */
export async function validateEmails(
  emails: string[],
  concurrency = 10
): Promise<Map<string, { valid: boolean; reason?: string }>> {
  const results = new Map<string, { valid: boolean; reason?: string }>();
  const queue = [...emails];

  async function worker() {
    while (queue.length > 0) {
      const email = queue.shift()!;
      results.set(email, await validateEmail(email));
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, emails.length) },
    () => worker()
  );
  await Promise.all(workers);

  return results;
}
