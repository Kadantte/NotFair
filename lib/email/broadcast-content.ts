/**
 * Structured content shape for product-update broadcasts.
 *
 * Authored once per broadcast in `scripts/broadcasts/<slug>.ts`, persisted
 * verbatim into `broadcasts.content` (jsonb), then rendered to HTML via
 * `BroadcastEmail` and to plaintext via `renderBroadcastText` at send time.
 */

export type BroadcastContent = {
  /** Optional H1 above the greeting. Keep under ~60 chars. */
  heading?: string;
  /** First-line salutation. e.g. "Hey there," — personalize with {{firstName}} later if needed. */
  greeting?: string;
  /** Body paragraphs in render order. Plain strings, no HTML. */
  paragraphs: string[];
  /** Single primary call-to-action. Render as a button in HTML, plain link in text. */
  cta?: { label: string; href: string };
  /** Closer + sign-off. e.g. "— Tong" */
  signature?: string;
};

export function renderBroadcastText(
  content: BroadcastContent,
  unsubscribeUrl: string,
): string {
  const lines: string[] = [];
  if (content.heading) lines.push(content.heading, "");
  if (content.greeting) lines.push(content.greeting, "");
  for (const p of content.paragraphs) lines.push(p, "");
  if (content.cta) lines.push(`${content.cta.label}: ${content.cta.href}`, "");
  if (content.signature) lines.push(content.signature, "");
  lines.push("---");
  lines.push(`Unsubscribe from product updates: ${unsubscribeUrl}`);
  return lines.join("\n");
}
