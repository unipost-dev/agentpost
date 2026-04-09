// Shared types across the AgentPost CLI.
//
// Most of these mirror the UniPost API response shapes — we keep
// them as a separate type file (rather than importing from a
// hypothetical @unipost/sdk) so AgentPost has zero coupling to
// UniPost's internal package layout. If UniPost ships an official
// SDK later, these types become a shim over it.

// Sprint 5 PR5: AgentPost gained OpenAI and Gemini providers in
// addition to the original Anthropic Claude. The provider is chosen
// at init time and recorded in llm_provider; the matching key +
// model are read from the per-provider fields below.
//
// Backward compat: configs written by Sprint 4's init only have
// anthropic_api_key + claude_model. readConfig() defaults the new
// fields so the existing call sites Just Work — llm_provider falls
// back to "anthropic" when undefined, which preserves the v0.1
// behavior exactly.
export type LLMProvider = "anthropic" | "openai" | "gemini";

export interface AgentPostConfig {
  unipost_api_key: string;
  unipost_api_url: string;
  llm_provider: LLMProvider;

  // Provider-specific credentials. Only the slots matching
  // llm_provider are required at runtime; the others are kept
  // around so a user can switch providers without losing the
  // other keys they pasted in earlier.
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
  // Default provider stays Anthropic — the prompt was tuned against
  // Claude and the v0.1 launch experience should be unchanged for
  // existing users until they explicitly opt in to a different one.
  llm_provider: "anthropic",
  // Default models per provider. Users can override in
  // ~/.agentpost/config.json. Each default is the current "best
  // JSON-out general-purpose model" for that provider as of Sprint 5.
  claude_model: "claude-opus-4-6",
  openai_model: "gpt-4o",
  gemini_model: "gemini-1.5-pro",
  default_platforms: ["twitter", "linkedin", "bluesky"],
};

// One of the user's connected social accounts. Slimmed-down version
// of UniPost's SocialAccount — only the fields the prompt and the
// preview UI need.
export interface ConnectedAccount {
  id: string;
  platform: string;
  account_name: string | null;
  status: "active" | "reconnect_required" | "disconnected";
  connection_type: "byo" | "managed";
}

// One per-platform draft post Claude generates. The shape MUST
// match what UniPost's POST /v1/social-posts accepts under
// platform_posts[] — see the prompt for the contract.
export interface PlatformDraft {
  account_id: string;
  platform: string;          // not sent to UniPost; used by the preview to group
  account_name?: string;     // ditto — for display only
  caption: string;
  // Sprint 4 PR3 fields, also valid here.
  first_comment?: string;
  thread_position?: number;
}

// One result row from POST /v1/social-posts after publishing.
export interface PublishResult {
  social_account_id: string;
  platform: string;
  account_name?: string;
  status: "published" | "failed" | "partial";
  external_id?: string;
  error_message?: string;
  warnings?: string[];
}

// Per-platform character limits Claude sees in the prompt + the
// preview uses for the green/yellow/red counters. Pulled from
// UniPost's /v1/platforms/capabilities so we never drift.
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
