/**
 * Single Slack webhook used for support pings, feedback, and agent telemetry.
 * The hook points at the team's #feedback channel; messages are categorized
 * inline (`:robot_face:` for agent feedback, `:sos:` for setup help, etc.) so
 * one channel handles everything without per-source routing.
 */
const DEFAULT_SLACK_FEEDBACK_WEBHOOK =
  "https://hooks.slack.com/services/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";

export async function postToSlack(text: string, webhook: string = DEFAULT_SLACK_FEEDBACK_WEBHOOK) {
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Slack webhook failed: ${res.status}`);
}
