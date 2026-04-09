// Anthropic Claude provider. The original AgentPost backend — was
// the only provider in Sprint 4, became one of three in Sprint 5
// PR5. The prompt was tuned against Claude, so this provider tends
// to need the least post-processing in the shared parser.

import Anthropic from "@anthropic-ai/sdk";

import type { PlatformDraft } from "../../types.js";
import { buildSystemPrompt, buildUserMessage } from "../prompt.js";
import { parseDraftsResponse } from "./parse.js";
import type { GenerateOptions } from "./index.js";

export async function generateDraftsAnthropic(opts: GenerateOptions): Promise<PlatformDraft[]> {
  if (!opts.config.anthropic_api_key) {
    throw new Error("anthropic_api_key is not set. Run `agentpost init` to fix.");
  }

  const client = new Anthropic({ apiKey: opts.config.anthropic_api_key });

  const system = buildSystemPrompt();
  const userMsg = buildUserMessage({
    userMessage: opts.userMessage,
    accounts: opts.accounts,
    capabilities: opts.capabilities,
  });

  const response = await client.messages.create({
    model: opts.config.claude_model,
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: userMsg }],
  });

  // Claude responses are an array of content blocks; we want the
  // first text block. (Multi-block responses can happen with tool
  // use, but we don't use tools here.)
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude response had no text content");
  }

  return parseDraftsResponse(textBlock.text, opts.accounts);
}
