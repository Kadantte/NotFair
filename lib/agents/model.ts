import { createOpenAI } from "@ai-sdk/openai";

// DeepSeek only exposes /v1/chat/completions; the AI SDK's default openai()
// provider uses /v1/responses (OpenAI Responses API) and 404s on DeepSeek.
// `.chat()` below forces the chat-completions code path.
//
// deepseek-v4-pro is a thinking model — by default it returns
// `reasoning_content` and the API expects that field to be passed back on
// follow-up turns. AI SDK's tool loop drops it, so we disable thinking via
// the DeepSeek-specific `thinking: { type: "disabled" }` body param,
// injected through a custom fetch.
const injectDisableThinking: typeof fetch = async (input, init) => {
  if (init?.body && typeof init.body === "string") {
    try {
      const body = JSON.parse(init.body);
      body.thinking = { type: "disabled" };
      init = { ...init, body: JSON.stringify(body) };
    } catch {
      // non-JSON body — leave untouched
    }
  }
  return fetch(input, init);
};

const deepseek = createOpenAI({
  baseURL: "https://api.deepseek.com/v1",
  apiKey: process.env.DEEPSEEK_API_KEY ?? "",
  fetch: injectDisableThinking,
});

export const chatModel = deepseek.chat("deepseek-v4-pro");
