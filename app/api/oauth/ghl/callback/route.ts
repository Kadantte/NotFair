/**
 * Alias of `/api/oauth/gohighlevel/callback` at a path that does not contain
 * the "highlevel" substring.
 *
 * Why: HighLevel's marketplace dashboard rejects redirect URIs that contain
 * the word "highlevel" anywhere in the URL — their validator flags it as a
 * suspicious self-reference. Apps registering NotFair as their integration
 * therefore can't use the original `/api/oauth/gohighlevel/callback` path
 * even though it works fine end-to-end. This shorter alias is what we
 * register in the marketplace; the handler is identical.
 *
 * Both paths remain valid forever for back-compat with anything already
 * registered against the longer URL.
 */
export { GET } from "@/app/api/oauth/gohighlevel/callback/route";
