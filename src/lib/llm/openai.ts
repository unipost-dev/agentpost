// OpenAI provider. Uses the chat.completions endpoint with
// response_format=json_object to force valid JSON output. The
// system + user messages are exactly the same as the Anthropic
// path — no per-provider prompt branches — so the only knob this
// file controls is the API call shape.
//
// Why chat.completions and not the newer responses API: as of
// Sprint 5, response_format=json_object on chat.completions is the
// most universally supported JSON-mode in OpenAI's lineup (works on
// gpt-4o, gpt-4o-mini, gpt-3.5-turbo). The responses API exists but
// has narrower model coverage and would force a runtime branch on
// model name. Re-evaluate when responses API hits feature parity.

import OpenAI from "openai";

import type { PlatformDraft } from "../../types.js";
import { buildSystemPrompt, buildUserMessage } from "../prompt.js";
import { parseDraftsResponse } from "./parse.js";
import type { GenerateOptions } from "./index.js";

export async function generateDraftsOpenAI(opts: GenerateOptions): Promise<PlatformDraft[]> {
  if (!opts.config.openai_api_key) {
    throw new Error("openai_api_key is not set. Run `agentpost init` to fix.");
  }

  const client = new OpenAI({ apiKey: opts.config.openai_api_key });

  const system = buildSystemPrompt();
  const userMsg = buildUserMessage({
    userMessage: opts.userMessage,
    accounts: opts.accounts,
    capabilities: opts.capabilities,
  });

  // response_format json_object forces the model to emit a single
  // top-level JSON object. The prompt's "drafts" array shape is
  // unchanged from the Anthropic path; OpenAI's JSON mode just
  // adds a server-side guarantee that the response will parse.
  const response = await client.chat.completions.create({
    model: opts.config.openai_model,
    max_tokens: 2048,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: userMsg },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) {
    throw new Error("OpenAI response had no content");
  }

  return parseDraftsResponse(text, opts.accounts);
}
