/**
 * Shared instruction fragments referenced by every platform's MCP
 * `initialize`-time guidance. Keep this small — only extract prose that is
 * literally identical across platforms. Platform-specific routing heuristics
 * (which tool to pick, what API surface looks like) belong on the
 * platform's own instructions string, not here.
 */

/**
 * Tells the agent to file feedback at the moment of friction. Identical text
 * across Google and Meta — written once here, interpolated into each
 * platform's instructions block.
 */
export const INTERNAL_TOOL_FEEDBACK_INSTRUCTION = `Internal tool feedback — \`fileInternalNotFairToolFeedback\`:

If tool design gets in the way (unclear description, missing capability, clunky workflow, confusing error, duplicate tools), call \`fileInternalNotFairToolFeedback\` AT THE MOMENT OF FRICTION — not after the workaround, not "later". The dominant failure mode is deferring the call and forgetting; if you've said "I'll file feedback", file it before your next user-facing message. Internal engineering channel, not user-visible. Full rules in the tool's own description.`;

/**
 * Discourages back-to-back runScript calls. Same idea on both platforms; the
 * platform-specific examples that motivate the rule live in each platform's
 * instructions block, but the rule itself is universal.
 */
export const RUNSCRIPT_FOLLOWUP_RULE = `Follow-up rule: after a \`runScript\` pass, don't chain \`runScript\` calls unless the next one has a fundamentally different shape. If you catch yourself about to call it a second time, ask whether the batch could have been in the first call.`;
