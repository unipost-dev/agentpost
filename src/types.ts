// Shared types across the AgentPost CLI.
//
// v2.0: Types that mirror UniPost API shapes (ConnectedAccount,
// PlatformDraft, PublishResult) are now imported from @unipost/sdk.
// This file keeps only AgentPost-specific types that the SDK
// doesn't provide.

import type { CreatePostPlatformPost } from "@unipost/sdk";

// Sprint 5 PR5: multi-provider support.
export type LLMProvider = "anthropic" | "openai" | "gemini";

export interface AgentPostConfig {
  unipost_api_key: string;
  unipost_api_url: string;
  llm_provider: LLMProvider;

  anthropic_api_key: string;
  claude_model: string;

  openai_api_key: string;
  openai_model: string;

  gemini_api_key: string;
  gemini_model: string;

  default_platforms: string[];
}

export const DEFAULT_CONFIG: Omit<
  AgentPostConfig,
  "unipost_api_key" | "anthropic_api_key" | "openai_api_key" | "gemini_api_key"
> = {
  unipost_api_url: "https://api.unipost.dev",
  llm_provider: "anthropic",
  claude_model: "claude-opus-4-6",
  openai_model: "gpt-4o",
  gemini_model: "gemini-1.5-pro",
  default_platforms: ["twitter", "linkedin", "bluesky"],
};

// Per-platform character limits and format rules. Pulled from
// UniPost's /v1/platforms/capabilities — the SDK doesn't have a
// typed endpoint for this yet, so we keep the local type.
export interface PlatformCapability {
  display_name: string;
  text: {
    max_length: number;
    min_length: number;
    required: boolean;
    supports_threads: boolean;
  };
  media: {
    requires_media: boolean;
    images: { max_count: number };
    videos: { max_count: number };
  };
  thread: { supported: boolean };
  first_comment: { supported: boolean; max_length?: number };
}

export interface CapabilitiesResponse {
  schema_version: string;
  platforms: Record<string, PlatformCapability>;
}

// DraftWithMeta extends the SDK's CreatePostPlatformPost with
// display-only fields for the preview UI. These fields are NOT
// sent to the API — they're stripped before publishing.
export interface DraftWithMeta extends CreatePostPlatformPost {
  platform: string;
  account_name: string;
  profile_name?: string;
}
