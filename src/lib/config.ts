// Config file management. AgentPost stores credentials at
// ~/.agentpost/config.json and reads them on every command. The
// init command writes the file; everything else just reads.

import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";

import type { AgentPostConfig } from "../types.js";
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
    return {
      unipost_api_url: parsed.unipost_api_url ?? DEFAULT_CONFIG.unipost_api_url,
      claude_model: parsed.claude_model ?? DEFAULT_CONFIG.claude_model,
      default_platforms: parsed.default_platforms ?? DEFAULT_CONFIG.default_platforms,
      unipost_api_key: parsed.unipost_api_key ?? "",
      anthropic_api_key: parsed.anthropic_api_key ?? "",
    };
  } catch {
    return null;
  }
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
  if (!cfg.anthropic_api_key) {
    console.error("Missing anthropic_api_key. Run `agentpost init` to fix.");
    process.exit(1);
  }
  return cfg;
}
