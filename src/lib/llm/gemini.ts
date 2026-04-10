// Google Gemini provider. Uses @google/generative-ai with the
// responseMimeType=application/json hint to encourage JSON-only
// output. Gemini's JSON-mode discipline is the loosest of the three
// providers — it'll occasionally emit ```json fenced output or a
// prose preface — so the shared parser does the heavy lifting on
// the response cleanup. See parse.ts for the fence-stripping +
// prose-stripping fallback.

import { GoogleGenerativeAI } from "@google/generative-ai";

import type { DraftWithMeta } from "../../types.js";
import { buildSystemPrompt, buildUserMessage } from "../prompt.js";
import { parseDraftsResponse } from "./parse.js";
import type { GenerateOptions } from "./index.js";

export async function generateDraftsGemini(opts: GenerateOptions): Promise<DraftWithMeta[]> {
  if (!opts.config.gemini_api_key) {
    throw new Error("gemini_api_key is not set. Run `agentpost init` to fix.");
  }

  const client = new GoogleGenerativeAI(opts.config.gemini_api_key);

  // Gemini supports a "system instruction" field separately from
  // the user prompt, mirroring Anthropic's system parameter. We
  // pass our existing system prompt verbatim so the per-platform
  // style guide stays identical across providers.
  const model = client.getGenerativeModel({
    model: opts.config.gemini_model,
    systemInstruction: buildSystemPrompt(),
    generationConfig: {
      // application/json is Gemini's nearest equivalent to OpenAI's
      // JSON mode. It's a hint, not a hard contract — the parser
      // still needs to handle markdown fences as a fallback.
      responseMimeType: "application/json",
      maxOutputTokens: 2048,
    },
  });

  const userMsg = buildUserMessage({
    userMessage: opts.userMessage,
    accounts: opts.accounts,
    capabilities: opts.capabilities,
  });

  const result = await model.generateContent(userMsg);
  const text = result.response.text();
  if (!text) {
    throw new Error("Gemini response had no text content");
  }

  return parseDraftsResponse(text, opts.accounts);
}
