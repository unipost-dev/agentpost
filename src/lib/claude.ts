// Claude wrapper. Calls Anthropic's messages API with the system
// prompt + user message from prompt.ts and parses the JSON response
// into a PlatformDraft[] the rest of the CLI consumes.
//
// Sprint 4 PR8: Claude only. OpenAI and Gemini adapters are v0.2
// post-launch.

import Anthropic from "@anthropic-ai/sdk";

import type {
  ConnectedAccount,
  CapabilitiesResponse,
  PlatformDraft,
} from "../types.js";
import { buildSystemPrompt, buildUserMessage } from "./prompt.js";

export interface GenerateOptions {
  userMessage: string;
  accounts: ConnectedAccount[];
  capabilities: CapabilitiesResponse;
  model: string;
  apiKey: string;
}

// generateDrafts is the core entry point. Calls Claude once,
// parses the JSON, validates that every account has a draft,
// returns the structured drafts. Throws on any error so the
// CLI can render a clean failure message.
export async function generateDrafts(opts: GenerateOptions): Promise<PlatformDraft[]> {
  const client = new Anthropic({ apiKey: opts.apiKey });

  const system = buildSystemPrompt();
  const userMsg = buildUserMessage({
    userMessage: opts.userMessage,
    accounts: opts.accounts,
    capabilities: opts.capabilities,
  });

  const response = await client.messages.create({
    model: opts.model,
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
  const raw = textBlock.text.trim();

  // Strip optional markdown fences in case the model wrapped its
  // output anyway. Belt-and-suspenders.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  let parsed: { drafts?: Array<{ account_id: string; caption: string }> };
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(
      `Claude returned non-JSON output. First 200 chars: ${cleaned.slice(0, 200)}`,
    );
  }

  if (!parsed.drafts || !Array.isArray(parsed.drafts)) {
    throw new Error('Claude response missing "drafts" array');
  }

  // Validate every active account got a draft. The prompt says
  // "DO NOT skip platforms" but the model occasionally does
  // anyway, so we double-check here.
  const activeAccounts = opts.accounts.filter((a) => a.status === "active");
  const draftIDs = new Set(parsed.drafts.map((d) => d.account_id));
  const missing = activeAccounts
    .filter((a) => !draftIDs.has(a.id))
    .map((a) => `${a.platform}/${a.account_name ?? a.id}`);
  if (missing.length > 0) {
    throw new Error(
      `Claude skipped these accounts: ${missing.join(", ")}. Try regenerating.`,
    );
  }

  // Decorate with display fields the preview UI needs.
  const accountIndex = new Map<string, ConnectedAccount>();
  for (const a of opts.accounts) {
    accountIndex.set(a.id, a);
  }
  return parsed.drafts.map((d) => {
    const acc = accountIndex.get(d.account_id);
    return {
      account_id: d.account_id,
      caption: d.caption,
      platform: acc?.platform ?? "unknown",
      account_name: acc?.account_name ?? undefined,
    };
  });
}
