// LLM provider dispatch.
//
// Sprint 5 PR5 introduced multi-provider support — Anthropic Claude
// (the original), OpenAI, and Google Gemini. Each provider lives in
// its own module so adding a fourth (Mistral, Llama, etc.) is a
// matter of dropping a new file in this directory and adding a case
// in generateDrafts() below.
//
// Design decision: per-provider SDKs (rather than a unified
// abstraction like Vercel AI SDK). Reasoning, from Sprint 5 PRD #4:
//
//   - Each provider's SDK is the canonical surface that gets the
//     newest features first. JSON mode, structured output, prompt
//     caching all land in the per-provider SDKs months before they
//     land in the unified wrappers.
//   - Bundle size is fine — we're a CLI, not a web bundle. Three
//     SDKs add ~2 MB total to the npm install, which is invisible
//     next to the existing Anthropic SDK + Ink + React.
//   - Debugging is cleaner: when the OpenAI SDK throws, the stack
//     points at openai/api.ts directly, not at three layers of
//     abstraction.
//
// The trade is a bit of repetition across the three provider files,
// which is fine — they're each <100 lines and the parser is shared.

import type {
  AgentPostConfig,
  CapabilitiesResponse,
  ConnectedAccount,
  LLMProvider,
  PlatformDraft,
} from "../../types.js";
import { generateDraftsAnthropic } from "./anthropic.js";
import { generateDraftsOpenAI } from "./openai.js";
import { generateDraftsGemini } from "./gemini.js";

export interface GenerateOptions {
  userMessage: string;
  accounts: ConnectedAccount[];
  capabilities: CapabilitiesResponse;
  config: AgentPostConfig;
}

// generateDrafts is the single entry point post.tsx calls. Reads
// the provider from the config and dispatches to the matching
// per-provider implementation. Each implementation calls its own
// SDK and then runs the shared parser to validate / shape the
// response into a PlatformDraft[].
export async function generateDrafts(opts: GenerateOptions): Promise<PlatformDraft[]> {
  const provider: LLMProvider = opts.config.llm_provider ?? "anthropic";
  switch (provider) {
    case "anthropic":
      return generateDraftsAnthropic(opts);
    case "openai":
      return generateDraftsOpenAI(opts);
    case "gemini":
      return generateDraftsGemini(opts);
    default: {
      // Exhaustive check — TypeScript will flag at compile time if
      // a new LLMProvider variant is added without updating this
      // switch. The runtime throw is just defense in depth for the
      // (impossible) case where the config has been hand-edited to
      // include a string that's not in the LLMProvider union.
      const _exhaustive: never = provider;
      throw new Error(`Unknown LLM provider: ${String(_exhaustive)}`);
    }
  }
}

// providerLabel returns the human-readable name for status output
// ("Generating drafts via OpenAI..."). Centralized so the post
// command and the init command stay consistent.
export function providerLabel(provider: LLMProvider): string {
  switch (provider) {
    case "anthropic":
      return "Anthropic Claude";
    case "openai":
      return "OpenAI";
    case "gemini":
      return "Google Gemini";
  }
}

// modelForProvider extracts the configured model name for the
// active provider. Used by post.tsx for the "Generating drafts
// for N accounts via gpt-4o..." status line.
export function modelForProvider(config: AgentPostConfig): string {
  switch (config.llm_provider ?? "anthropic") {
    case "anthropic":
      return config.claude_model;
    case "openai":
      return config.openai_model;
    case "gemini":
      return config.gemini_model;
  }
}

// requireProviderKey returns the API key for the active provider,
// or throws a clear error if it's missing. The CLI's requireConfig()
// only validates that the UniPost key is present — provider keys
// are validated lazily here so a config with multiple providers
// configured can switch between them without re-running init.
export function requireProviderKey(config: AgentPostConfig): string {
  const provider = config.llm_provider ?? "anthropic";
  let key = "";
  let envHint = "";
  switch (provider) {
    case "anthropic":
      key = config.anthropic_api_key;
      envHint = "anthropic_api_key";
      break;
    case "openai":
      key = config.openai_api_key;
      envHint = "openai_api_key";
      break;
    case "gemini":
      key = config.gemini_api_key;
      envHint = "gemini_api_key";
      break;
  }
  if (!key) {
    throw new Error(
      `Missing ${envHint} for the active LLM provider (${provider}). Run \`agentpost init\` to set it.`,
    );
  }
  return key;
}
