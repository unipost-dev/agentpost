// `agentpost init` walks a new user through configuring the CLI:
// pastes a UniPost API key, pastes an Anthropic API key, optionally
// tests both, and writes ~/.agentpost/config.json with mode 0600.
//
// First-run UX is intentionally minimal — three prompts, ~30
// seconds, no telemetry question, no model picker. Customization
// happens by editing the JSON file directly later.

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import kleur from "kleur";

import { writeConfig, configPath, configExists, readConfig } from "../lib/config.js";
import { UniPostClient } from "../lib/unipost.js";
import { DEFAULT_CONFIG } from "../types.js";

export async function runInit(): Promise<void> {
  const rl = createInterface({ input, output });

  process.stdout.write(kleur.bold("\nAgentPost setup\n\n"));
  process.stdout.write(
    kleur.gray(
      "AgentPost needs two API keys: one for UniPost (where your social accounts are connected) and one for Anthropic (the AI that drafts posts).\n\n",
    ),
  );

  if (configExists()) {
    process.stdout.write(
      kleur.yellow(
        `A config already exists at ${configPath()}. Continuing will overwrite it.\n\n`,
      ),
    );
    const ok = await rl.question("Continue? [y/N] ");
    if (ok.trim().toLowerCase() !== "y") {
      rl.close();
      process.stdout.write("Cancelled.\n");
      return;
    }
  }

  const existing = readConfig();

  // 1. UniPost API key
  process.stdout.write(
    kleur.gray("\n1. UniPost API key — get one at https://app.unipost.dev/api-keys\n"),
  );
  const unipostKey = (
    await rl.question(
      `   Paste it here${existing?.unipost_api_key ? " (or press Enter to keep existing)" : ""}: `,
    )
  ).trim();
  const finalUnipostKey = unipostKey || existing?.unipost_api_key || "";
  if (!finalUnipostKey) {
    rl.close();
    process.stderr.write(kleur.red("UniPost API key is required.\n"));
    process.exit(1);
  }

  // 2. Anthropic API key
  process.stdout.write(
    kleur.gray("\n2. Anthropic API key — get one at https://console.anthropic.com/settings/keys\n"),
  );
  const anthropicKey = (
    await rl.question(
      `   Paste it here${existing?.anthropic_api_key ? " (or press Enter to keep existing)" : ""}: `,
    )
  ).trim();
  const finalAnthropicKey = anthropicKey || existing?.anthropic_api_key || "";
  if (!finalAnthropicKey) {
    rl.close();
    process.stderr.write(kleur.red("Anthropic API key is required.\n"));
    process.exit(1);
  }

  rl.close();

  const cfg = {
    unipost_api_key: finalUnipostKey,
    anthropic_api_key: finalAnthropicKey,
    unipost_api_url: existing?.unipost_api_url ?? DEFAULT_CONFIG.unipost_api_url,
    claude_model: existing?.claude_model ?? DEFAULT_CONFIG.claude_model,
    default_platforms: existing?.default_platforms ?? DEFAULT_CONFIG.default_platforms,
  };

  // Test the UniPost key by hitting /v1/social-accounts. Cheap call,
  // returns clear error if the key is wrong.
  process.stdout.write(kleur.gray("\nTesting UniPost connection... "));
  try {
    const client = new UniPostClient(cfg.unipost_api_key, cfg.unipost_api_url);
    const accounts = await client.listAccounts();
    process.stdout.write(
      kleur.green(`✓ ${accounts.length} accounts connected\n`),
    );
  } catch (e) {
    process.stdout.write(kleur.red(`✗ ${(e as Error).message}\n`));
    process.stdout.write(
      kleur.yellow(
        "Saving the config anyway — fix the key and re-run init if needed.\n",
      ),
    );
  }

  writeConfig(cfg);

  process.stdout.write(
    kleur.green(`\n✓ Config saved to ${configPath()}\n\n`),
  );
  process.stdout.write("You're all set. Try:\n");
  process.stdout.write(
    kleur.cyan("  agentpost \"shipped webhooks today 🎉\"\n\n"),
  );
}
