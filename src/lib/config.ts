// Config file management. AgentPost stores credentials at
// ~/.agentpost/config.json and reads them on every command. The
// init command writes the file; everything else just reads.

import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";

import type { AgentPostConfig, LLMProvider } from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";

const CONFIG_DIR = join(homedir(), ".agentpost");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function configPath(): string {
  return CONFIG_PATH;
}

export function configExists(): boolean {
  return existsSync(CONFIG_PATH);
}

export function readConfig(): AgentPostConfig | null {
  if (!existsSync(CONFIG_PATH)) {
    return null;
  }
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    // Sprint 5 PR5: per-provider fields default to empty strings so
    // a config written by Sprint 4's init (which only had Anthropic)
    // continues to work without modification. llm_provider falls
    // back to "anthropic" when undefined for the same reason.
    return {
      unipost_api_url: parsed.unipost_api_url ?? DEFAULT_CONFIG.unipost_api_url,
      llm_provider: validProvider(parsed.llm_provider) ?? DEFAULT_CONFIG.llm_provider,
      claude_model: parsed.claude_model ?? DEFAULT_CONFIG.claude_model,
      openai_model: parsed.openai_model ?? DEFAULT_CONFIG.openai_model,
      gemini_model: parsed.gemini_model ?? DEFAULT_CONFIG.gemini_model,
      default_platforms: parsed.default_platforms ?? DEFAULT_CONFIG.default_platforms,
      unipost_api_key: parsed.unipost_api_key ?? "",
      anthropic_api_key: parsed.anthropic_api_key ?? "",
      openai_api_key: parsed.openai_api_key ?? "",
      gemini_api_key: parsed.gemini_api_key ?? "",
    };
  } catch {
    return null;
  }
}

// validProvider returns the input only if it's one of the known
// LLMProvider variants. Anything else (including undefined) returns
// undefined so the caller falls back to the default. Defends
// against a hand-edited config with a typo.
function validProvider(p: unknown): LLMProvider | undefined {
  if (p === "anthropic" || p === "openai" || p === "gemini") {
    return p;
  }
  return undefined;
}

export function writeConfig(cfg: AgentPostConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  // Defense in depth: even if the umask was permissive, force
  // 0600 so other users on the box can't read the API keys.
  try {
    chmodSync(CONFIG_PATH, 0o600);
  } catch {
    // Best-effort; don't fail the write on a chmod error
    // (e.g. on Windows where the unix permission model differs).
  }
  // Same for the dir.
  try {
    chmodSync(dirname(CONFIG_PATH), 0o700);
  } catch {
    // ignore
  }
}

// requireConfig reads the config and exits with a friendly error
// if the file doesn't exist or is missing required fields. Used
// by every command except `init`.
//
// Sprint 5 PR5: only the unipost_api_key check is global. The
// per-provider key check is lazy — it lives in llm/index.ts's
// requireProviderKey() so a config that has multiple providers
// configured can switch between them without re-running init.
export function requireConfig(): AgentPostConfig {
  const cfg = readConfig();
  if (!cfg) {
    console.error("AgentPost is not configured. Run `agentpost init` to set up your API keys.");
    process.exit(1);
  }
  if (!cfg.unipost_api_key) {
    console.error("Missing unipost_api_key. Run `agentpost init` to fix.");
    process.exit(1);
  }
  return cfg;
}
